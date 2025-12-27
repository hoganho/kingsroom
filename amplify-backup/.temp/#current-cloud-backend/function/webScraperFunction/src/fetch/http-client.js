/**
 * ===================================================================
 * HTTP Client
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
    SCRAPERAPI_KEY,
    SCRAPERAPI_URL
} = require('../config/constants');

/**
 * Fetch HTML from live website using ScraperAPI
 * 
 * @param {string} url - URL to fetch
 * @param {string} scraperApiKey - Optional API key override
 * @returns {object} Fetch result { success, html, headers, error }
 */
const fetchFromLiveSite = async (url, scraperApiKey = null) => {
    // Use provided API key or fall back to environment/constant
    const apiKey = scraperApiKey || process.env.SCRAPERAPI_KEY || SCRAPERAPI_KEY;
    
    if (!apiKey) {
        console.error('[HttpClient] ScraperAPI key not configured');
        return { 
            success: false, 
            error: 'ScraperAPI key is not configured.' 
        };
    }

    console.log(`[HttpClient] Fetching via ScraperAPI:`, {
        url: url.substring(0, 80) + '...',
        keySource: scraperApiKey ? 'parameter' : (process.env.SCRAPERAPI_KEY ? 'environment' : 'constant'),
        keyPreview: `${apiKey.substring(0, 8)}...`
    });

    // Construct the ScraperAPI URL with country_code=au for local appearance
    const encodedUrl = encodeURIComponent(url);
    const scraperApiUrl = `${SCRAPERAPI_URL}?api_key=${apiKey}&url=${encodedUrl}&country_code=au`;

    try {
        const response = await axios.get(scraperApiUrl, {
            timeout: REQUEST_TIMEOUT,
            maxRedirects: 5,
            validateStatus: (status) => status < 500 // Accept 4xx as valid responses
        });

        return {
            success: true,
            html: response.data,
            headers: response.headers,
            statusCode: response.status,
            contentLength: response.headers['content-length']
        };

    } catch (error) {
        let errorMessage = 'ScraperAPI request failed';
        let errorCode = 500;

        if (error.response) {
            errorMessage = `ScraperAPI Error ${error.response.status}: ${error.response.data}`;
            errorCode = error.response.status;
        } else if (error.request) {
            errorMessage = `ScraperAPI No Response: ${error.message}`;
            errorCode = 504;
        } else {
            errorMessage = `Axios Error: ${error.message}`;
        }

        console.error(`[HttpClient] Fetch failed:`, { errorMessage, errorCode, url });

        return {
            success: false,
            error: errorMessage,
            statusCode: errorCode
        };
    }
};

/**
 * Fetch HTML from live website with retry logic
 * Uses exponential backoff between retries
 * 
 * @param {string} url - URL to fetch
 * @param {number} maxRetries - Maximum retry attempts
 * @param {string} scraperApiKey - Optional API key override
 * @returns {object} Fetch result { success, html, headers, error, attempts }
 */
const fetchFromLiveSiteWithRetries = async (url, maxRetries = MAX_RETRIES, scraperApiKey = null) => {
    let lastError = null;
    let attempts = 0;
    
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
            
            // Don't retry on 4xx errors (client errors)
            if (result.statusCode >= 400 && result.statusCode < 500) {
                console.log(`[HttpClient] Not retrying - client error ${result.statusCode}`);
                break;
            }
            
        } catch (error) {
            lastError = error.message;
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
    sleep
};
