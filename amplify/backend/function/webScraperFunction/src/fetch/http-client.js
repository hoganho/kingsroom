/**
 * ===================================================================
 * HTTP Client (v1.3.0)
 * ===================================================================
 * 
 * HTTP fetching utilities including ScraperAPI integration.
 * 
 * Features:
 * - Direct HTTP/HTTPS requests
 * - ScraperAPI proxy support
 * - Retry logic with exponential backoff
 * - HTTP 304 cache validation
 * 
 * UPDATED v1.3.0:
 * - REMOVED: SCRAPERAPI_KEY import from constants.js (fully deprecated)
 * - API key is now ONLY retrieved via getScraperApiKey() from config/secrets.js
 * - SSM Parameter Store is the single source of truth for the API key
 * - Environment variable fallback retained ONLY for local development
 * 
 * UPDATED v1.2.0:
 * - SECURITY: API key now fetched from SSM Parameter Store
 *   - Uses getScraperApiKey() from config/secrets.js
 *   - Falls back to environment variable for local dev
 *   - Key is cached in memory for Lambda container lifetime
 * 
 * UPDATED v1.1.0:
 * - CRITICAL FIX: Properly handle 4xx responses as errors
 *   - Previously, 403/429 responses returned success=true with error text as "html"
 *   - Now correctly returns success=false with proper error message
 * - ADDED: detectScraperApiError() to catch API errors in response body
 *   - ScraperAPI sometimes returns 200 OK with error text (bad API design)
 *   - Detects credit exhaustion, rate limits, auth errors, billing issues
 * - ADDED: isValidHtmlResponse() to validate response looks like HTML
 * 
 * ===================================================================
 */

const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const {
    MAX_RETRIES,
    RETRY_DELAY,
    REQUEST_TIMEOUT,
    HEAD_TIMEOUT,
    SCRAPERAPI_URL
} = require('../config/constants');

// Import secure secret retrieval (SSM Parameter Store)
const { getScraperApiKey } = require('../config/secrets');

// ===================================================================
// SCRAPER API ERROR DETECTION (NEW v1.1.0)
// ===================================================================

/**
 * Detect ScraperAPI error responses in the body
 * 
 * ScraperAPI sometimes returns 200 OK with error text instead of proper
 * HTTP error codes. This function detects those error messages.
 * 
 * @param {string} responseBody - Response body to check
 * @returns {object} { isError: boolean, errorType: string|null, errorMessage: string|null }
 */
const detectScraperApiError = (responseBody) => {
    if (!responseBody || typeof responseBody !== 'string') {
        return { isError: false, errorType: null, errorMessage: null };
    }
    
    const textLower = responseBody.toLowerCase();
    
    // Credit exhaustion: "You have exhausted the API Credits available in this monthly cycle"
    if (textLower.includes('exhausted') && textLower.includes('api credits')) {
        return { 
            isError: true, 
            errorType: 'CREDITS_EXHAUSTED',
            errorMessage: 'ScraperAPI credits exhausted for this billing cycle'
        };
    }
    
    // Billing/subscription issues
    if (textLower.includes('scraperapi') && 
        (textLower.includes('subscription') || textLower.includes('billing') || textLower.includes('upgrade'))) {
        return { 
            isError: true, 
            errorType: 'BILLING_ERROR',
            errorMessage: 'ScraperAPI billing or subscription issue'
        };
    }
    
    // Rate limiting (in case it comes as 200)
    if (textLower.includes('rate limit') && textLower.includes('exceeded')) {
        return { 
            isError: true, 
            errorType: 'RATE_LIMITED',
            errorMessage: 'ScraperAPI rate limit exceeded'
        };
    }
    
    // Authentication errors
    if (textLower.includes('invalid api key') || 
        textLower.includes('api key is required') ||
        (textLower.includes('unauthorized') && textLower.includes('api'))) {
        return { 
            isError: true, 
            errorType: 'AUTH_ERROR',
            errorMessage: 'ScraperAPI authentication failed - invalid or missing API key'
        };
    }
    
    // Generic short non-HTML response with API error keywords
    // Real HTML pages are typically > 1000 bytes and contain <html> or <!DOCTYPE>
    if (responseBody.length < 1000 && 
        !/<html/i.test(responseBody) && 
        !/<!DOCTYPE/i.test(responseBody) &&
        (textLower.includes('api') || textLower.includes('credits') || textLower.includes('quota')) &&
        (textLower.includes('error') || textLower.includes('exceeded') || textLower.includes('exhausted') || textLower.includes('limit'))) {
        return { 
            isError: true, 
            errorType: 'API_ERROR',
            errorMessage: responseBody.substring(0, 200).trim()
        };
    }
    
    return { isError: false, errorType: null, errorMessage: null };
};

/**
 * Check if response looks like valid HTML (not an error message)
 * 
 * @param {string} responseBody - Response body to check
 * @returns {boolean} True if response appears to be HTML
 */
const isValidHtmlResponse = (responseBody) => {
    if (!responseBody || typeof responseBody !== 'string') return false;
    
    // Very short responses are suspicious
    if (responseBody.length < 500) return false;
    
    // Check for HTML structure
    const hasHtmlIndicators = 
        /<html/i.test(responseBody) || 
        /<!DOCTYPE/i.test(responseBody) ||
        /<head/i.test(responseBody) ||
        /<body/i.test(responseBody);
    
    return hasHtmlIndicators;
};

/**
 * Get human-readable error message for HTTP status codes
 * 
 * @param {number} statusCode - HTTP status code
 * @returns {string} Error description
 */
const getHttpStatusMessage = (statusCode) => {
    const messages = {
        400: 'Bad Request',
        401: 'Unauthorized - Check API key',
        403: 'Forbidden - API credits exhausted or access denied',
        404: 'Not Found',
        429: 'Rate Limited - Too many requests',
        500: 'ScraperAPI Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    return messages[statusCode] || `HTTP Error ${statusCode}`;
};

/**
 * Fetch HTML from live website using ScraperAPI
 * 
 * API Key Retrieval (v1.3.0):
 * 1. Optional parameter override (for testing/migration)
 * 2. SSM Parameter Store via getScraperApiKey()
 * 3. Environment variable fallback (local dev only)
 * 
 * @param {string} url - URL to fetch
 * @param {string} scraperApiKey - Optional API key override (for testing/migration)
 * @returns {object} Fetch result { success, html, headers, error, errorType }
 */
const fetchFromLiveSite = async (url, scraperApiKey = null) => {
    let apiKey;
    
    try {
        // Priority: 1) Parameter override, 2) SSM Parameter Store (with env var fallback)
        if (scraperApiKey) {
            apiKey = scraperApiKey;
            console.log(`[HttpClient] Using API key from parameter override`);
        } else {
            // getScraperApiKey() handles SSM lookup with env var fallback for local dev
            apiKey = await getScraperApiKey();
        }
    } catch (keyError) {
        console.error('[HttpClient] Failed to retrieve ScraperAPI key:', keyError.message);
        return { 
            success: false, 
            error: keyError.message,
            errorType: 'CONFIG_ERROR'
        };
    }
    
    if (!apiKey) {
        console.error('[HttpClient] ScraperAPI key not configured');
        return { 
            success: false, 
            error: 'ScraperAPI key is not configured. Check SSM Parameter Store: /pokerpro/{env}/scraperapi-key',
            errorType: 'CONFIG_ERROR'
        };
    }

    console.log(`[HttpClient] Fetching via ScraperAPI:`, {
        url: url.substring(0, 80) + '...',
        keyPreview: `${apiKey.substring(0, 8)}...`
    });

    // Construct the ScraperAPI URL with country_code=au for local appearance
    const encodedUrl = encodeURIComponent(url);
    const scraperApiUrl = `${SCRAPERAPI_URL}?api_key=${apiKey}&url=${encodedUrl}&country_code=au`;

    try {
        const response = await axios.get(scraperApiUrl, {
            timeout: REQUEST_TIMEOUT,
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Accept 4xx to handle them explicitly
        });

        const statusCode = response.status;
        const responseBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        
        // ═══════════════════════════════════════════════════════════════════════
        // v1.1.0 FIX: Check for HTTP 4xx errors FIRST
        // These indicate API-level problems that should not be treated as success
        // ═══════════════════════════════════════════════════════════════════════
        if (statusCode >= 400 && statusCode < 500) {
            const errorMsg = getHttpStatusMessage(statusCode);
            console.error(`[HttpClient] 🚨 ScraperAPI returned ${statusCode}: ${errorMsg}`);
            console.error(`[HttpClient] Response body: ${responseBody.substring(0, 200)}`);
            
            // Determine specific error type from status code
            let errorType = 'HTTP_ERROR';
            if (statusCode === 401) errorType = 'AUTH_ERROR';
            if (statusCode === 403) errorType = 'CREDITS_EXHAUSTED';  // Often means credits exhausted
            if (statusCode === 429) errorType = 'RATE_LIMITED';
            
            return {
                success: false,
                error: `ScraperAPI Error ${statusCode}: ${errorMsg}. ${responseBody.substring(0, 100)}`,
                errorType,
                statusCode
            };
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // v1.1.0 FIX: Check for API errors in response body
        // ScraperAPI sometimes returns 200 OK with error text (bad API design)
        // ═══════════════════════════════════════════════════════════════════════
        const apiErrorCheck = detectScraperApiError(responseBody);
        if (apiErrorCheck.isError) {
            console.error(`[HttpClient] 🚨 ScraperAPI error in response body: ${apiErrorCheck.errorType}`);
            console.error(`[HttpClient] ${apiErrorCheck.errorMessage}`);
            
            return {
                success: false,
                error: apiErrorCheck.errorMessage,
                errorType: apiErrorCheck.errorType,
                statusCode: statusCode  // Will be 200, but it's still an error
            };
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // v1.1.0: Validate response looks like HTML
        // Warn if response is suspiciously short or doesn't look like HTML
        // ═══════════════════════════════════════════════════════════════════════
        if (!isValidHtmlResponse(responseBody)) {
            console.warn(`[HttpClient] ⚠️ Response doesn't look like valid HTML`, {
                length: responseBody.length,
                preview: responseBody.substring(0, 100)
            });
            // Don't fail here - let the parser handle it (might be a valid short page)
            // But log a warning for debugging
        }
        
        // Success - return the HTML
        return {
            success: true,
            html: responseBody,
            headers: response.headers,
            statusCode: statusCode,
            contentLength: response.headers['content-length']
        };

    } catch (error) {
        let errorMessage = 'ScraperAPI request failed';
        let errorCode = 500;
        let errorType = 'NETWORK_ERROR';

        if (error.response) {
            // Server responded with error status >= 500
            errorMessage = `ScraperAPI Error ${error.response.status}: ${error.response.data}`;
            errorCode = error.response.status;
            errorType = 'SERVER_ERROR';
        } else if (error.request) {
            // No response received
            errorMessage = `ScraperAPI No Response: ${error.message}`;
            errorCode = 504;
            errorType = 'TIMEOUT';
        } else {
            // Request setup error
            errorMessage = `Axios Error: ${error.message}`;
            errorType = 'REQUEST_ERROR';
        }

        console.error(`[HttpClient] Fetch failed:`, { errorMessage, errorCode, errorType, url });

        return {
            success: false,
            error: errorMessage,
            errorType,
            statusCode: errorCode
        };
    }
};

/**
 * Fetch HTML from live website with retry logic
 * Uses exponential backoff between retries
 * 
 * UPDATED v1.1.0:
 * - Added errorType field in return value
 * - Don't retry on API service errors (credits exhausted, billing, auth)
 *   These are not transient and will fail on every retry
 * 
 * @param {string} url - URL to fetch
 * @param {number} maxRetries - Maximum retry attempts
 * @param {string} scraperApiKey - Optional API key override
 * @returns {object} Fetch result { success, html, headers, error, errorType, attempts }
 */
const fetchFromLiveSiteWithRetries = async (url, maxRetries = MAX_RETRIES, scraperApiKey = null) => {
    let lastError = null;
    let lastErrorType = null;
    let attempts = 0;
    
    // Error types that should NOT be retried (not transient)
    const noRetryErrorTypes = [
        'CREDITS_EXHAUSTED',  // Won't recover without payment
        'BILLING_ERROR',      // Won't recover without account fix
        'AUTH_ERROR',         // Won't recover without valid API key
        'CONFIG_ERROR'        // Won't recover without config change
    ];
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attempts = attempt;
        
        try {
            const result = await fetchFromLiveSite(url, scraperApiKey);
            
            if (result.success) {
                if (attempt > 1) {
                    console.log(`[HttpClient] Success on attempt ${attempt}/${maxRetries}`);
                }
                return { ...result, attempts };
            }
            
            lastError = result.error;
            lastErrorType = result.errorType;
            
            // v1.1.0: Don't retry on non-transient API errors
            if (noRetryErrorTypes.includes(result.errorType)) {
                console.error(`[HttpClient] 🚨 Not retrying - ${result.errorType} is not transient`);
                break;
            }
            
            // Don't retry on 4xx errors (client errors)
            if (result.statusCode >= 400 && result.statusCode < 500) {
                console.log(`[HttpClient] Not retrying - client error ${result.statusCode}`);
                break;
            }
            
        } catch (error) {
            lastError = error.message;
            lastErrorType = 'EXCEPTION';
        }
        
        if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s, ...
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`[HttpClient] Retry ${attempt}/${maxRetries} after ${delay}ms`);
            await sleep(delay);
        }
    }
    
    return {
        success: false,
        error: lastError || 'All retries exhausted',
        errorType: lastErrorType || 'UNKNOWN',
        attempts
    };
};

/**
 * Check HTTP headers to determine if content has changed
 * Uses If-None-Match (ETag) and If-Modified-Since headers
 * 
 * @param {string} url - URL to check
 * @param {object} cachedHeaders - Previously cached headers { etag, lastModifiedHeader }
 * @returns {Promise<object>} Result { notModified, newEtag, newLastModified, headers }
 */
const checkHTTPHeaders = async (url, cachedHeaders) => {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        
        const options = {
            method: 'HEAD',
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TournamentScraper/1.0)',
                'Accept': 'text/html,application/xhtml+xml'
            }
        };
        
        // Add conditional headers if we have them
        if (cachedHeaders?.etag) {
            options.headers['If-None-Match'] = cachedHeaders.etag;
        }
        if (cachedHeaders?.lastModifiedHeader) {
            options.headers['If-Modified-Since'] = cachedHeaders.lastModifiedHeader;
        }
        
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const req = protocol.request(options, (res) => {
            const result = {
                statusCode: res.statusCode,
                headers: res.headers,
                notModified: res.statusCode === 304
            };
            
            if (!result.notModified) {
                result.newEtag = res.headers.etag || res.headers.ETag;
                result.newLastModified = res.headers['last-modified'] || res.headers['Last-Modified'];
            }
            
            resolve(result);
        });
        
        req.on('error', (error) => {
            console.warn(`[HttpClient] HEAD request error:`, error.message);
            resolve({
                notModified: false,
                error: error.message,
                failed: true
            });
        });
        
        req.setTimeout(HEAD_TIMEOUT, () => {
            req.destroy();
            resolve({
                notModified: false,
                error: 'HEAD request timeout',
                timeout: true
            });
        });
        
        req.end();
    });
};

/**
 * Direct fetch without ScraperAPI (for internal/whitelisted domains)
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {object} Fetch result
 */
const fetchDirect = async (url, options = {}) => {
    const { timeout = REQUEST_TIMEOUT, headers = {} } = options;
    
    try {
        const response = await axios.get(url, {
            timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TournamentScraper/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                ...headers
            },
            maxRedirects: 5
        });

        return {
            success: true,
            html: response.data,
            headers: response.headers,
            statusCode: response.status
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            statusCode: error.response?.status || 500
        };
    }
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    fetchFromLiveSite,
    fetchFromLiveSiteWithRetries,
    checkHTTPHeaders,
    fetchDirect,
    sleep,
    // NEW v1.1.0: Error detection helpers
    detectScraperApiError,
    isValidHtmlResponse,
    getHttpStatusMessage
};