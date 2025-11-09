// enhanced-handleFetch-complete.js
// Complete S3-first caching implementation for WebScraper Lambda
// Full production version with all error handling and logging

const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { getHtmlFromS3, storeHtmlInS3, calculateContentHash } = require('./s3-helpers');

// Configuration constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000;
const HEAD_TIMEOUT = 5000;
const MAX_HTML_SIZE = 10 * 1024 * 1024; // 10MB limit
const CACHE_DEBUG = process.env.CACHE_DEBUG === 'true';

/**
 * Main fetch handler with S3-first caching strategy
 * This is the primary entry point for all HTML fetching operations
 * * @param {string} url - URL to fetch
 * @param {object} scrapeURLRecord - Existing ScrapeURL record from database
 * @param {string} entityId - Entity ID for multi-tenant support
 * @param {number} tournamentId - Tournament ID from URL
 * @param {boolean} forceRefresh - Bypass all caches if true
 * @param {object} ddbDocClient - DynamoDB document client
 * @returns {object} Fetch result with HTML and metadata
 */
const handleFetch = async (url, scrapeURLRecord, entityId, tournamentId, forceRefresh = false, ddbDocClient) => {
    const startTime = Date.now();
    const scrapeURLTable = getTableName('ScrapeURL');
    
    // Initialize detailed fetch statistics
    const fetchStats = {
        startTime,
        url,
        tournamentId,
        entityId,
        forceRefresh,
        s3Checked: false,
        s3Hit: false,
        httpHeadersChecked: false,
        httpNotModified: false,
        liveScraped: false,
        storedInS3: false,
        s3SkippedReason: null, // Added to track why S3 might be skipped
        errors: []
    };
    
    // Logging helper
    const log = (level, message, data = {}) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            url,
            tournamentId,
            entityId,
            ...data
        };
        
        if (CACHE_DEBUG || level === 'error') {
            console.log(`[HandleFetch] ${JSON.stringify(logEntry)}`);
        }
    };
    
    log('info', 'Starting fetch process', { forceRefresh, hasS3Key: !!scrapeURLRecord?.latestS3Key });
    
    try {
        // Validate inputs
        if (!url || !isValidUrl(url)) {
            throw new Error(`Invalid URL provided: ${url}`);
        }
        
        if (!entityId) {
            throw new Error('Entity ID is required for fetch operation');
        }
        
        if (!scrapeURLRecord || !scrapeURLRecord.id) {
            throw new Error('Valid ScrapeURL record is required');
        }
        
        // Check if S3 storage is enabled for this URL
        const s3Enabled = scrapeURLRecord.s3StorageEnabled !== false;
        
        // ========================================
        // STEP 1: CHECK S3 STORAGE FIRST
        // ========================================
        if (!forceRefresh && s3Enabled && scrapeURLRecord.latestS3Key) {
            fetchStats.s3Checked = true;
            
            try {
                log('debug', 'Checking S3 cache', { s3Key: scrapeURLRecord.latestS3Key });
                
                const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
                
                if (s3Content && s3Content.html) {
                    // Validate the HTML content
                    if (isValidHtml(s3Content.html)) {
                        log('info', 'S3 cache hit - using cached content', {
                            s3Key: scrapeURLRecord.latestS3Key,
                            contentLength: s3Content.html.length,
                            metadata: s3Content.metadata
                        });
                        
                        fetchStats.s3Hit = true;
                        
                        // Update cache hit statistics in database
                        await updateCacheHitStats(scrapeURLRecord.id, ddbDocClient, scrapeURLTable);
                        
                        return {
                            success: true,
                            html: s3Content.html,
                            source: 'S3_CACHE',
                            s3Key: scrapeURLRecord.latestS3Key,
                            headers: s3Content.metadata || {},
                            usedCache: true,
                            cacheType: 'S3',
                            contentHash: s3Content.metadata?.contenthash || calculateContentHash(s3Content.html),
                            contentSize: s3Content.html.length,
                            fetchDuration: Date.now() - startTime,
                            fetchStats,
                            timestamp: new Date().toISOString()
                        };
                    } else {
                        log('warn', 'S3 content failed validation', { s3Key: scrapeURLRecord.latestS3Key });
                        fetchStats.errors.push('S3 content validation failed');
                    }
                }
            } catch (s3Error) {
                log('warn', 'S3 retrieval failed', { 
                    error: s3Error.message,
                    s3Key: scrapeURLRecord.latestS3Key 
                });
                fetchStats.errors.push(`S3 error: ${s3Error.message}`);
                // Continue to next step instead of failing
            }
        }
        
        // ========================================
        // STEP 2: CHECK HTTP CACHING HEADERS
        // ========================================
        if (!forceRefresh && (scrapeURLRecord.etag || scrapeURLRecord.lastModifiedHeader)) {
            fetchStats.httpHeadersChecked = true;
            
            try {
                log('debug', 'Checking HTTP cache headers', {
                    etag: scrapeURLRecord.etag,
                    lastModified: scrapeURLRecord.lastModifiedHeader
                });
                
                const headersCheckResult = await checkHTTPHeaders(url, scrapeURLRecord);
                
                if (headersCheckResult.notModified) {
                    log('info', 'HTTP 304 Not Modified - content unchanged');
                    fetchStats.httpNotModified = true;
                    
                    // Update header check statistics
                    await updateHeaderCheckStats(scrapeURLRecord.id, ddbDocClient, scrapeURLTable);
                    
                    // Try to return S3 content if available
                    if (scrapeURLRecord.latestS3Key) {
                        try {
                            const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
                            if (s3Content && s3Content.html) {
                                return {
                                    success: true,
                                    html: s3Content.html,
                                    source: 'HTTP_304_CACHE',
                                    s3Key: scrapeURLRecord.latestS3Key,
                                    headers: headersCheckResult.headers,
                                    usedCache: true,
                                    cacheType: 'HTTP_304',
                                    contentHash: scrapeURLRecord.contentHash,
                                    contentSize: s3Content.html.length,
                                    fetchDuration: Date.now() - startTime,
                                    fetchStats,
                                    timestamp: new Date().toISOString()
                                };
                            }
                        } catch (error) {
                            log('warn', 'Failed to retrieve S3 content after 304', { error: error.message });
                            fetchStats.errors.push(`S3 retrieval after 304 failed: ${error.message}`);
                        }
                    }
                    
                    // If we can't get S3 content, we need to fetch fresh
                    log('info', 'Content unchanged but no cached version available, fetching fresh');
                } else if (headersCheckResult.newEtag || headersCheckResult.newLastModified) {
                    log('info', 'HTTP headers indicate content has changed', {
                        oldEtag: scrapeURLRecord.etag,
                        newEtag: headersCheckResult.newEtag,
                        oldLastModified: scrapeURLRecord.lastModifiedHeader,
                        newLastModified: headersCheckResult.newLastModified
                    });
                }
            } catch (headerError) {
                log('warn', 'HTTP header check failed', { error: headerError.message });
                fetchStats.errors.push(`Header check error: ${headerError.message}`);
                // Continue to live scraping
            }
        }
        
        // ========================================
        // STEP 3: FETCH FROM LIVE SITE
        // ========================================
        log('info', 'Fetching from live website');
        fetchStats.liveScraped = true;
        
        const liveResult = await fetchFromLiveSiteWithRetries(url, MAX_RETRIES);
        
        if (!liveResult.success) {
            throw new Error(`Live fetch failed after ${MAX_RETRIES} retries: ${liveResult.error}`);
        }
        
        // Validate fetched content
        if (!liveResult.html || liveResult.html.trim().length === 0) {
            throw new Error('Fetched content is empty');
        }
        
        if (liveResult.html.length > MAX_HTML_SIZE) {
            throw new Error(`HTML content too large: ${liveResult.html.length} bytes (max: ${MAX_HTML_SIZE})`);
        }
        
        // Calculate content hash
        const contentHash = calculateContentHash(liveResult.html);
        
        // Check if content has actually changed
        const contentChanged = contentHash !== scrapeURLRecord.contentHash;
        
        log('info', 'Live fetch successful', {
            contentLength: liveResult.html.length,
            statusCode: liveResult.statusCode,
            contentChanged,
            newHash: contentHash.substring(0, 8),
            oldHash: scrapeURLRecord.contentHash?.substring(0, 8)
        });
        
        // ========================================
        // STEP 4: STORE IN S3 (if enabled AND appropriate)
        // ========================================
        let s3Result = null;

        // ✅ NEW: Req #5 - Check for "Tournament Not Found" BEFORE saving to S3.
        // We do standard string matching here to avoid full parsing overhead in the fetcher.
        const isNotFound = isTournamentNotFound(liveResult.html);

        if (s3Enabled && !isNotFound) {
            try {
                log('debug', 'Storing HTML in S3');
                
                s3Result = await storeHtmlInS3(
                    liveResult.html,
                    url,
                    entityId,
                    tournamentId,
                    liveResult.headers,
                    false // isManual
                );
                
                fetchStats.storedInS3 = true;
                
                log('info', 'Successfully stored in S3', {
                    s3Key: s3Result.s3Key,
                    contentSize: s3Result.contentSize,
                    bucket: s3Result.s3Bucket
                });
            } catch (s3Error) {
                log('error', 'Failed to store in S3', { error: s3Error.message });
                fetchStats.errors.push(`S3 storage error: ${s3Error.message}`);
                // Continue even if S3 storage fails
            }
        } else if (isNotFound) {
             // Req #5: Explicitly skip S3 for "Not Found" to save space
             fetchStats.storedInS3 = false;
             fetchStats.s3SkippedReason = 'TOURNAMENT_NOT_FOUND';
             log('info', 'Skipped S3 storage: Tournament Not Found detected');
        }
        
        // ========================================
        // STEP 5: UPDATE SCRAPEURL RECORD
        // ========================================
        try {
            const updateData = {
                lastScrapedAt: new Date().toISOString(),
                timesScraped: (scrapeURLRecord.timesScraped || 0) + 1,
                contentHash: contentHash,
                contentSize: liveResult.html.length,
                etag: liveResult.headers?.etag || liveResult.headers?.ETag || null,
                lastModifiedHeader: liveResult.headers?.['last-modified'] || liveResult.headers?.['Last-Modified'] || null,
                lastHeaderCheckAt: new Date().toISOString()
            };
            
            // Add S3 fields if storage succeeded
            if (s3Result) {
                updateData.latestS3Key = s3Result.s3Key;
                updateData.s3StoragePrefix = `entities/${entityId}/html/${tournamentId}`;
            }
            
            // Track content changes
            if (contentChanged) {
                updateData.lastContentChangeAt = new Date().toISOString();
                updateData.totalContentChanges = (scrapeURLRecord.totalContentChanges || 0) + 1;
                updateData.hasDataChanges = true;
            }
            
            await updateScrapeURLRecord(scrapeURLRecord.id, updateData, ddbDocClient, scrapeURLTable);
            
            log('debug', 'Updated ScrapeURL record', { updates: Object.keys(updateData) });
        } catch (updateError) {
            log('error', 'Failed to update ScrapeURL record', { error: updateError.message });
            fetchStats.errors.push(`Database update error: ${updateError.message}`);
            // Don't fail the whole operation for this
        }
        
        // ========================================
        // RETURN SUCCESS RESPONSE
        // ========================================
        return {
            success: true,
            html: liveResult.html,
            source: 'LIVE',
            s3Key: s3Result?.s3Key || null,
            headers: liveResult.headers,
            usedCache: false,
            cacheType: 'NONE',
            storedInS3: !!s3Result,
            s3SkippedReason: fetchStats.s3SkippedReason, // Return the reason if skipped
            contentHash: contentHash,
            contentSize: liveResult.html.length,
            contentChanged,
            fetchDuration: Date.now() - startTime,
            fetchStats,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        log('error', 'Fetch operation failed', {
            error: error.message,
            stack: error.stack,
            duration: Date.now() - startTime
        });
        
        fetchStats.errors.push(error.message);
        
        // Update error statistics in ScrapeURL
        if (scrapeURLRecord?.id) {
            try {
                await updateScrapeURLError(scrapeURLRecord.id, error.message, ddbDocClient, scrapeURLTable);
            } catch (updateError) {
                log('error', 'Failed to update error statistics', { error: updateError.message });
            }
        }
        
        // Return error response
        return {
            success: false,
            error: error.message,
            source: 'ERROR',
            fetchDuration: Date.now() - startTime,
            fetchStats,
            timestamp: new Date().toISOString()
        };
    }
};

/**
 * Check HTTP headers to determine if content has changed
 * Uses HEAD request with conditional headers
 */
const checkHTTPHeaders = async (url, scrapeURLRecord) => {
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const options = {
            method: 'HEAD',
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TournamentScraper/1.0)',
                'Accept': 'text/html,application/xhtml+xml'
            }
        };
        
        // Add conditional headers if we have them
        if (scrapeURLRecord.etag) {
            options.headers['If-None-Match'] = scrapeURLRecord.etag;
        }
        if (scrapeURLRecord.lastModifiedHeader) {
            options.headers['If-Modified-Since'] = scrapeURLRecord.lastModifiedHeader;
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
 * Fetch HTML from live website with retry logic
 */
const fetchFromLiveSiteWithRetries = async (url, maxRetries = 3) => {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await fetchFromLiveSite(url);
            if (result.success) {
                return result;
            }
            lastError = result.error;
        } catch (error) {
            lastError = error.message;
        }
        
        if (attempt < maxRetries) {
            // Exponential backoff
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`[Fetch] Retry ${attempt}/${maxRetries} after ${delay}ms for ${url}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    return {
        success: false,
        error: lastError || 'All retries exhausted'
    };
};

/**
 * Fetch HTML from live website
 */
const fetchFromLiveSite = async (url) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Connection': 'keep-alive'
            }
        };
        
        const req = protocol.get(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).href;
                console.log(`[Fetch] Following redirect: ${res.statusCode} -> ${redirectUrl}`);
                fetchFromLiveSite(redirectUrl).then(resolve).catch(reject);
                return;
            }
            
            // Check for non-success status codes
            if (res.statusCode !== 200) {
                resolve({
                    success: false,
                    error: `HTTP ${res.statusCode}: ${res.statusMessage}`,
                    statusCode: res.statusCode
                });
                return;
            }
            
            const chunks = [];
            let totalSize = 0;
            
            // Determine if response is compressed
            const encoding = res.headers['content-encoding'];
            let stream = res;
            
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }
            
            stream.on('data', (chunk) => {
                totalSize += chunk.length;
                
                // Prevent memory issues with large responses
                if (totalSize > MAX_HTML_SIZE) {
                    req.destroy();
                    resolve({
                        success: false,
                        error: `Response too large: ${totalSize} bytes`
                    });
                    return;
                }
                
                chunks.push(chunk);
            });
            
            stream.on('end', () => {
                const html = Buffer.concat(chunks).toString('utf-8');
                resolve({
                    success: true,
                    html: html,
                    headers: res.headers,
                    statusCode: res.statusCode,
                    contentLength: totalSize
                });
            });
            
            stream.on('error', (error) => {
                resolve({
                    success: false,
                    error: `Stream error: ${error.message}`
                });
            });
        });
        
        req.on('error', (error) => {
            resolve({
                success: false,
                error: `Request error: ${error.message}`
            });
        });
        
        req.setTimeout(REQUEST_TIMEOUT, () => {
            req.destroy();
            resolve({
                success: false,
                error: 'Request timeout'
            });
        });
    });
};

/**
 * Update cache hit statistics in ScrapeURL record
 */
const updateCacheHitStats = async (scrapeURLId, ddbDocClient, tableName) => {
    const params = {
        TableName: tableName,
        Key: { id: scrapeURLId },
        UpdateExpression: `
            SET cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :one,
                lastCacheHitAt = :now,
                #status = :active
        `,
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':now': new Date().toISOString(),
            ':active': 'ACTIVE'
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Update header check statistics
 */
const updateHeaderCheckStats = async (scrapeURLId, ddbDocClient, tableName) => {
    const params = {
        TableName: tableName,
        Key: { id: scrapeURLId },
        UpdateExpression: `
            SET lastHeaderCheckAt = :now,
                cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :one
        `,
        ExpressionAttributeValues: {
            ':now': new Date().toISOString(),
            ':zero': 0,
            ':one': 1
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Update ScrapeURL record with new data
 */
const updateScrapeURLRecord = async (id, updates, ddbDocClient, tableName) => {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updates).forEach(key => {
        const placeholder = `:${key}`;
        if (key === 'status') {
            updateExpression.push(`#status = ${placeholder}`);
            expressionAttributeNames['#status'] = 'status';
        } else {
            updateExpression.push(`${key} = ${placeholder}`);
        }
        expressionAttributeValues[placeholder] = updates[key];
    });
    
    // Always update the updatedAt timestamp
    updateExpression.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    const params = {
        TableName: tableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues
    };
    
    if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
    }
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Update ScrapeURL record on error
 */
const updateScrapeURLError = async (id, errorMessage, ddbDocClient, tableName) => {
    const params = {
        TableName: tableName,
        Key: { id },
        UpdateExpression: `
            SET timesFailed = if_not_exists(timesFailed, :zero) + :one,
                consecutiveFailures = if_not_exists(consecutiveFailures, :zero) + :one,
                lastScrapeMessage = :error,
                #status = :errorStatus,
                updatedAt = :now
        `,
        ExpressionAttributeNames: {
            '#status': 'status'
        },
        ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':error': errorMessage.substring(0, 500),
            ':errorStatus': 'ERROR',
            ':now': new Date().toISOString()
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Validate URL format
 */
const isValidUrl = (url) => {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Basic HTML validation
 */
const isValidHtml = (html) => {
    if (!html || typeof html !== 'string') return false;
    if (html.trim().length < 100) return false; // Too short to be valid
    
    // Check for basic HTML structure
    const hasHtmlTag = /<html/i.test(html) || /<\/html>/i.test(html);
    const hasBodyTag = /<body/i.test(html) || /<\/body>/i.test(html);
    const hasContent = html.length > 500; // Reasonable minimum
    
    return hasContent && (hasHtmlTag || hasBodyTag);
};

/**
 * ✅ NEW: Lightweight check for "Tournament Not Found"
 * Used to skip S3 storage for non-existent tournaments to save space.
 * Detects: <span class="cw-badge cw-bg-warning">Tournament not found!</span>
 */
const isTournamentNotFound = (html) => {
    if (!html) return false;
    // Use a regex that matches the specific badge class and text, 
    // insensitive to case and minor whitespace differences.
    const notFoundRegex = /class=["']cw-badge\s+cw-bg-warning["'][^>]*>\s*Tournament\s+not\s+found/i;
    return notFoundRegex.test(html);
};

/**
 * Helper to get table name with environment
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    return `${modelName}-${apiId}-${env}`;
};

// Export all functions for testing and use
module.exports = {
    handleFetch,
    checkHTTPHeaders,
    fetchFromLiveSite,
    fetchFromLiveSiteWithRetries,
    updateCacheHitStats,
    updateHeaderCheckStats,
    updateScrapeURLRecord,
    updateScrapeURLError,
    isValidUrl,
    isValidHtml,
    isTournamentNotFound, // Export for testing
    getTableName
};