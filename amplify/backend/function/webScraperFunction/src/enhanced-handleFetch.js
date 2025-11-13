// enhanced-handleFetch.js
// This version KEEPS all original functionality and ADDS unified URL tracking
// Plus S3Storage metadata extraction for GameStatus/RegistrationStatus

const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { getHtmlFromS3, storeHtmlInS3, calculateContentHash } = require('./s3-helpers');
// --- CHANGED: Added getStatusAndReg to imports ---
const { getStatusAndReg } = require('./scraperStrategies');
const { v4: uuidv4 } = require('uuid');

// Configuration constants
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT = 30000;
const HEAD_TIMEOUT = 5000;
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || "62c905a307da2591dc89f94d193caacf";

/**
 * Map new interaction type to old scrape status for backward compatibility
 */
const mapInteractionTypeToScrapeStatus = (interactionType) => {
    switch (interactionType) {
        case 'SCRAPED_WITH_HTML': return 'SUCCESS';
        case 'SCRAPED_NOT_PUBLISHED': return 'SKIPPED_DONOTSCRAPE';
        case 'SCRAPED_NOT_IN_USE': return 'BLANK';
        case 'SCRAPED_ERROR': return 'FAILED';
        case 'MANUAL_UPLOAD': return 'SUCCESS';
        case 'NEVER_CHECKED': return null;
        default: return null;
    }
};

/**
 * Get or create ScrapeURL record with unified tracking
 */
const getOrCreateScrapeURL = async (url, entityId, tournamentId, ddbDocClient, tableName) => {
    try {
        // First try to get existing record
        const getParams = {
            TableName: tableName,
            Key: { id: url }
        };
        
        const existing = await ddbDocClient.send(new GetCommand(getParams));
        if (existing.Item) {
            return existing.Item;
        }
    } catch (error) {
        // Record doesn't exist, will create
    }
    
    // Create new unified ScrapeURL record
    const now = new Date().toISOString();
    const newRecord = {
        id: uuidv4(),
        url,
        tournamentId,
        entityId,
        
        // NEW UNIFIED FIELDS
        lastInteractionType: 'NEVER_CHECKED',
        lastInteractionAt: now,
        hasStoredContent: false,
        totalInteractions: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        manualUploads: 0,
        contentChangeCount: 0,
        
        // ORIGINAL FIELDS (for compatibility)
        placedIntoDatabase: false,
        firstScrapedAt: now,
        lastScrapedAt: now,
        lastSuccessfulScrapeAt: null,
        timesScraped: 0,
        timesSuccessful: 0,
        timesFailed: 0,
        consecutiveFailures: 0,
        lastScrapeStatus: null,
        lastScrapeMessage: null,
        status: 'ACTIVE',
        doNotScrape: false,
        isActive: true,
        sourceSystem: 'KINGSROOM',
        s3StorageEnabled: true,
        
        // DataStore fields
        _lastChangedAt: Date.now(),
        _version: 1,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeURL'
    };
    
    // Save to database
    const putParams = {
        TableName: tableName,
        Item: newRecord
    };
    
    await ddbDocClient.send(new PutCommand(putParams));
    return newRecord;
};

/**
 * Enhanced wrapper for simplified usage - includes monitoring
 * This is the main entry point that other Lambda functions call
 */
const enhancedHandleFetch = async (url, scrapeURLRecord, entityId, tournamentId, forceRefresh = false, monitoredDdbClient = null) => {
    // Use provided client or create new one
    const ddbDocClient = monitoredDdbClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
    
    console.log(`[enhancedHandleFetch] Starting fetch for ${url}`);
    console.log(`[enhancedHandleFetch] Force refresh: ${forceRefresh}`);
    console.log(`[enhancedHandleFetch] Entity ID: ${entityId}`);
    console.log(`[enhancedHandleFetch] Has S3 key: ${!!scrapeURLRecord?.latestS3Key}`);
    
    try {
        const result = await handleFetch(
            url,
            scrapeURLRecord,
            entityId,
            tournamentId,
            forceRefresh,  // Pass through the forceRefresh parameter
            ddbDocClient
        );
        
        if (result.success) {
            console.log(`[enhancedHandleFetch] Success - Source: ${result.source}, Cached: ${result.usedCache || false}`);
        } else {
            console.log(`[enhancedHandleFetch] Failed: ${result.error}`);
        }
        
        return result;
    } catch (error) {
        console.error('[enhancedHandleFetch] Unexpected error:', error);
        return {
            success: false,
            error: error.message,
            fetchStats: { errors: [error.message] }
        };
    }
};

/**
 * Simplified fetch for when we don't have database access (KEEPING ORIGINAL)
 */
const simplifiedFetch = async (url, entityId, tournamentId) => {
    const startTime = Date.now();
    
    console.log(`[SimplifiedFetch] Fetching ${url} for entity ${entityId}, tournament ${tournamentId}`);
    
    try {
        // Fetch from live site using ScraperAPI
        const liveResult = await fetchFromLiveSiteWithRetries(url, MAX_RETRIES);
        
        if (!liveResult.success) {
            throw new Error(`Live fetch failed: ${liveResult.error}`);
        }
        
        // Calculate content hash
        const contentHash = calculateContentHash(liveResult.html);
        
        // Check for "Tournament Not Found"
        const isNotFound = isTournamentNotFound(liveResult.html);
        
        // Store in S3 if not a "not found" page
        let s3Result = null;
        if (!isNotFound) {
            try {
                s3Result = await storeHtmlInS3(
                    liveResult.html,
                    url,
                    entityId,
                    tournamentId,
                    liveResult.headers,
                    false
                );
                console.log(`[SimplifiedFetch] Stored in S3: ${s3Result.s3Key}`);
            } catch (s3Error) {
                console.error(`[SimplifiedFetch] S3 storage failed:`, s3Error);
            }
        }
        
        return {
            success: true,
            html: liveResult.html,
            source: 'LIVE',
            s3Key: s3Result?.s3Key || '',
            s3Storage: s3Result || null,
            headers: liveResult.headers,
            usedCache: false,
            contentHash: contentHash,
            contentSize: liveResult.html.length,
            fetchDuration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`[SimplifiedFetch] Error:`, error);
        return {
            success: false,
            error: error.message,
            source: 'ERROR',
            fetchDuration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
};

/**
 * Main fetch handler with caching strategy
 */
const handleFetch = async (url, scrapeURLRecord, entityId, tournamentId, forceRefresh = false, ddbDocClient = null) => {
    const startTime = Date.now();
    const scrapeURLTable = getTableName('ScrapeURL');
    
    // Initialize fetch statistics
    const fetchStats = {
        s3Checked: false,
        s3Hit: false,
        httpHeadersChecked: false,
        httpNotModified: false,
        liveScraped: false,
        errors: []
    };
    
    // Helper function for consistent logging
    const log = (level, message, data = {}) => {
        const logData = {
            url,
            entityId,
            tournamentId,
            forceRefresh,
            ...data
        };
        
        if (level === 'error') {
            console.error(`[handleFetch] ${message}`, logData);
        } else if (level === 'warn') {
            console.warn(`[handleFetch] ${message}`, logData);
        } else if (level === 'info' || VERBOSE_LOGGING) {
            console.log(`[handleFetch] ${message}`, logData);
        }
    };
    
    log('info', `Starting fetch process`, { 
        hasS3Key: !!scrapeURLRecord?.latestS3Key,
        cacheEnabled: !forceRefresh 
    });
    
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
        // STEP 1: CHECK S3 STORAGE FIRST (SKIP IF forceRefresh)
        // ========================================
        if (!forceRefresh && s3Enabled && scrapeURLRecord.latestS3Key) {
            fetchStats.s3Checked = true;
            
            try {
                log('debug', 'Checking S3 cache', { s3Key: scrapeURLRecord.latestS3Key });
                
                const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
                
                if (s3Content && s3Content.html) {
                    // Validate the HTML content
                    if (isValidHtml(s3Content.html)) {
                        log('info', '✅ S3 cache hit - using cached content', {
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
            }
        } else if (forceRefresh && scrapeURLRecord.latestS3Key) {
            log('info', '⚠️ Skipping S3 cache due to forceRefresh=true', { 
                s3Key: scrapeURLRecord.latestS3Key 
            });
        }
        
        // ========================================
        // STEP 2: CHECK HTTP CACHING HEADERS (SKIP IF forceRefresh)
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
                    log('info', '✅ HTTP 304 Not Modified - content unchanged');
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
            }
        } else if (forceRefresh && (scrapeURLRecord.etag || scrapeURLRecord.lastModifiedHeader)) {
            log('info', '⚠️ Skipping HTTP header check due to forceRefresh=true');
        }
        
        // ========================================
        // STEP 3: FETCH FROM LIVE SITE (ALWAYS REACHED IF forceRefresh OR NO CACHE)
        // ========================================
        log('info', '🌐 Fetching from live website', { 
            reason: forceRefresh ? 'Force refresh requested' : 'No valid cache found' 
        });
        fetchStats.liveScraped = true;
        
        const liveResult = await fetchFromLiveSiteWithRetries(url, MAX_RETRIES);
        
        if (!liveResult.success) {
            log('error', 'Live fetch failed after retries', { 
                error: liveResult.error,
                attempts: liveResult.attempts 
            });
            
            // Update error in ScrapeURL record
            await updateScrapeURLError(
                scrapeURLRecord.id, 
                liveResult.error,
                ddbDocClient,
                scrapeURLTable
            );
            
            return {
                ...liveResult,
                fetchStats,
                fetchDuration: Date.now() - startTime
            };
        }
        
        log('info', '✅ Successfully fetched from live site', {
            contentLength: liveResult.html.length,
            headers: Object.keys(liveResult.headers)
        });
        
        // ========================================
        // STEP 4: VALIDATE AND STORE (KEEPING ORIGINAL)
        // ========================================
        
        // Check for "Tournament Not Found" (KEEPING ORIGINAL)
        if (isTournamentNotFound(liveResult.html)) {
            log('info', 'Tournament not found (404 equivalent)');
            
            // Update ScrapeURL to mark as not found
            await updateScrapeURLRecord(
                scrapeURLRecord, 
                liveResult.html,
                liveResult.headers,
                'NOT_FOUND',
                'NOT_FOUND',
                null,
                ddbDocClient,
                scrapeURLTable
            );
            
            return {
                success: false,
                error: 'Tournament not found',
                isNotFound: true,
                html: liveResult.html,
                headers: liveResult.headers,
                fetchStats,
                fetchDuration: Date.now() - startTime
            };
        }
        
        // Store HTML in S3 if enabled
        let s3Key = null;
        let s3StorageId = null;
        if (s3Enabled) {
            try {
                // 1. Store raw file
                const s3Result = await storeHtmlInS3(
                    liveResult.html, 
                    url, 
                    entityId, 
                    tournamentId, 
                    liveResult.headers
                );
                s3Key = s3Result.s3Key;
                log('info', '✅ HTML stored in S3', { 
                    s3Key,
                    size: s3Result.contentSize 
                });

                // 2. Extract status metadata for the DB record
                let gameStatus = null;
                let registrationStatus = null;
                try {
                    const statusData = getStatusAndReg(liveResult.html);
                    gameStatus = statusData.gameStatus;
                    registrationStatus = statusData.registrationStatus;
                    log('debug', 'Extracted status for S3 metadata', { gameStatus, registrationStatus });
                } catch (parseError) {
                    log('warn', 'Failed to extract status from HTML for S3 record', { error: parseError.message });
                }

                // 3. Create S3Storage DB record
                try {
                    s3StorageId = await createS3StorageRecord(
                        scrapeURLRecord.id,
                        s3Key,
                        liveResult.html,
                        url,
                        entityId,
                        tournamentId,
                        liveResult.headers,
                        ddbDocClient,
                        gameStatus,        // Passed to DB record
                        registrationStatus // Passed to DB record
                    );
                    log('info', '✅ Created S3Storage record in DynamoDB', { s3StorageId });
                } catch (s3DbError) {
                    log('warn', 'Failed to create S3Storage record in DynamoDB', { error: s3DbError.message });
                    fetchStats.errors.push(`S3Storage DB error: ${s3DbError.message}`);
                }

            } catch (s3Error) {
                log('warn', 'Failed to store in S3', { error: s3Error.message });
                fetchStats.errors.push(`S3 storage error: ${s3Error.message}`);
            }
        }
        
        // Update ScrapeURL record with new fetch info (KEEPING ORIGINAL)
        await updateScrapeURLRecord(
            scrapeURLRecord,
            liveResult.html,
            liveResult.headers,
            'SUCCESS',
            'SCRAPED_SUCCESS',
            s3Key,
            ddbDocClient,
            scrapeURLTable
        );
        
        return {
            success: true,
            html: liveResult.html,
            source: 'LIVE',
            s3Key,
            headers: liveResult.headers,
            usedCache: false,
            cacheType: null,
            contentHash: calculateContentHash(liveResult.html),
            contentSize: liveResult.html.length,
            fetchDuration: Date.now() - startTime,
            fetchStats,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        log('error', 'Unexpected error in fetch process', { 
            error: error.message,
            stack: error.stack 
        });
        
        // Update error in database
        try {
            await updateScrapeURLError(
                scrapeURLRecord.id, 
                error.message,
                ddbDocClient,
                scrapeURLTable
            );
        } catch (updateError) {
            log('error', 'Failed to update error status', { error: updateError.message });
        }
        
        return {
            success: false,
            error: error.message,
            fetchStats,
            fetchDuration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
};

/**
 * Create S3Storage record (NEW FOR UNIFIED + METADATA)
 */
const createS3StorageRecord = async (scrapeURLId, s3Key, html, url, entityId, tournamentId, headers, ddbDocClient, gameStatus = null, registrationStatus = null) => {
    const now = new Date().toISOString();
    const s3StorageId = uuidv4();
    const s3StorageTable = getTableName('S3Storage');
    
    const s3StorageRecord = {
        id: s3StorageId,
        scrapeURLId,
        url, 
        tournamentId, 
        entityId, 
        s3Key,
        s3Bucket: process.env.S3_BUCKET || 'pokerpro-scraped-content',
        contentSize: Buffer.byteLength(html, 'utf8'),
        contentHash: calculateContentHash(html),
        contentType: 'text/html',
        source: 'WEB_SCRAPER',
        uploadedBy: 'system',
        isManualUpload: false,
        httpStatus: headers?.statusCode || 200,
        etag: headers?.etag,
        lastModified: headers?.['last-modified'],
        headers: JSON.stringify(headers),
        
        // --- NEW STATUS METADATA FIELDS ---
        gameStatus: gameStatus,
        registrationStatus: registrationStatus,
        
        isParsed: false,
        dataExtracted: false,
        wasGameCreated: false,
        wasGameUpdated: false,
        scrapedAt: now, 
        storedAt: now,
        createdAt: now,
        updatedAt: now,
        _lastChangedAt: Date.now(),
        _version: 1,
        __typename: 'S3Storage'
    };
    
    const putParams = {
        TableName: s3StorageTable,
        Item: s3StorageRecord
    };
    
    await ddbDocClient.send(new PutCommand(putParams));
    return s3StorageId;
};

/**
 * Check HTTP headers to determine if content has changed (KEEPING ORIGINAL)
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
 * Fetch HTML from live website with retry logic (KEEPING ORIGINAL)
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
 * Fetch HTML from live website using ScraperAPI (KEEPING ORIGINAL)
 */
const fetchFromLiveSite = async (url) => {
    if (!SCRAPERAPI_KEY) {
        console.error('SCRAPERAPI_KEY environment variable is not set!');
        return { success: false, error: 'ScraperAPI key is not configured.' };
    }

    // Construct the ScraperAPI URL with country_code=au for local appearance
    const encodedUrl = encodeURIComponent(url);
    const scraperApiUrl = `http://api.scraperapi.com?api_key=${SCRAPERAPI_KEY}&url=${encodedUrl}&country_code=au`;

    try {
        const response = await axios.get(scraperApiUrl, {
            timeout: REQUEST_TIMEOUT,
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

        return {
            success: false,
            error: errorMessage,
            statusCode: errorCode
        };
    }
};

/**
 * Update cache hit statistics in ScrapeURL record (KEEPING ORIGINAL)
 */
const updateCacheHitStats = async (scrapeURLId, ddbDocClient, tableName) => {
    const now = new Date();
    const params = {
        TableName: tableName,
        Key: { id: scrapeURLId },
        UpdateExpression: `
            SET cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :one,
                lastCacheHitAt = :now,
                #status = :active,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
            '#status': 'status',
            '#lca': '_lastChangedAt',
            '#v': '_version'
        },
        ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':now': now.toISOString(),
            ':active': 'ACTIVE',
            ':timestamp': now.getTime()
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Update header check statistics (KEEPING ORIGINAL)
 */
const updateHeaderCheckStats = async (scrapeURLId, ddbDocClient, tableName) => {
    const now = new Date();
    const params = {
        TableName: tableName,
        Key: { id: scrapeURLId },
        UpdateExpression: `
            SET lastHeaderCheckAt = :now,
                cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :one,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
            '#lca': '_lastChangedAt',
            '#v': '_version'
        },
        ExpressionAttributeValues: {
            ':now': now.toISOString(),
            ':zero': 0,
            ':one': 1,
            ':timestamp': now.getTime()
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Update ScrapeURL record with new data (KEEPING ORIGINAL)
 */
const updateScrapeURLRecord = async (id, updates, ddbDocClient, tableName) => {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Track if updatedAt is already being set
    let hasUpdatedAt = false;
    
    Object.keys(updates).forEach(key => {
        const placeholder = `:${key}`;
        if (key === 'status') {
            updateExpression.push(`#status = ${placeholder}`);
            expressionAttributeNames['#status'] = 'status';
        } else if (key === '_lastChangedAt') {
            updateExpression.push(`#lca = ${placeholder}`);
            expressionAttributeNames['#lca'] = '_lastChangedAt';
        } else if (key === '_version') {
            // Don't update version directly, increment it
            return;
        } else if (key === 'updatedAt') {
            // Track that updatedAt is being set
            hasUpdatedAt = true;
            updateExpression.push(`${key} = ${placeholder}`);
        } else {
            updateExpression.push(`${key} = ${placeholder}`);
        }
        expressionAttributeValues[placeholder] = updates[key];
    });
    
    // Only add updatedAt if it wasn't already in the updates
    const now = new Date();
    if (!hasUpdatedAt) {
        updateExpression.push('updatedAt = :updatedAt');
        expressionAttributeValues[':updatedAt'] = now.toISOString();
    }
    
    // Always update DataStore sync fields (if not already in updates)
    if (!updates._lastChangedAt) {
        updateExpression.push('#lca = :lastChangedAt');
        expressionAttributeNames['#lca'] = '_lastChangedAt';
        expressionAttributeValues[':lastChangedAt'] = now.getTime();
    }
    
    // Increment version for conflict resolution
    updateExpression.push('#v = if_not_exists(#v, :zero) + :one');
    expressionAttributeNames['#v'] = '_version';
    expressionAttributeValues[':zero'] = 0;
    expressionAttributeValues[':one'] = 1;
    
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
 * Update ScrapeURL record on error (KEEPING ORIGINAL)
 */
const updateScrapeURLError = async (id, errorMessage, ddbDocClient, tableName) => {
    const now = new Date();
    const params = {
        TableName: tableName,
        Key: { id },
        UpdateExpression: `
            SET consecutiveFailures = if_not_exists(consecutiveFailures, :zero) + :one,
                timesFailed = if_not_exists(timesFailed, :zero) + :one,
                failedScrapes = if_not_exists(failedScrapes, :zero) + :one,
                lastScrapeStatus = :failed,
                lastScrapeMessage = :errorMessage,
                lastError = :errorMessage,
                lastInteractionType = :errorType,
                lastInteractionAt = :now,
                #status = :errorStatus,
                updatedAt = :now,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
            '#status': 'status',
            '#lca': '_lastChangedAt',
            '#v': '_version'
        },
        ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':failed': 'FAILED',
            ':errorMessage': errorMessage.substring(0, 500),
            ':errorType': 'SCRAPED_ERROR',
            ':errorStatus': 'ERROR',
            ':now': now.toISOString(),
            ':timestamp': now.getTime()
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
};

/**
 * Validate URL format (KEEPING ORIGINAL)
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
 * Basic HTML validation (KEEPING ORIGINAL)
 */
const isValidHtml = (html) => {
    if (!html || typeof html !== 'string') return false;
    if (html.trim().length < 100) return false;
    
    // Check for basic HTML structure
    const hasHtmlTag = /<html/i.test(html) || /<\/html>/i.test(html);
    const hasBodyTag = /<body/i.test(html) || /<\/body>/i.test(html);
    const hasContent = html.length > 500;
    
    return hasContent && (hasHtmlTag || hasBodyTag);
};

/**
 * Lightweight check for "Tournament Not Found" (KEEPING ORIGINAL)
 */
const isTournamentNotFound = (html) => {
    if (!html) return false;
    // Match the specific badge class and text
    const notFoundRegex = /class=["']cw-badge\s+cw-bg-warning["'][^>]*>\s*Tournament\s+not\s+found/i;
    return notFoundRegex.test(html);
};

/**
 * Helper to get table name with environment (KEEPING ORIGINAL)
 */
const getTableName = (modelName) => {
    // Check for environment-specific table name variables first
    const envTableName = process.env[`API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`];
    if (envTableName) {
        return envTableName;
    }
    
    // Fall back to constructing table name
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Unable to determine table name for ${modelName}`);
    }
    return `${modelName}-${apiId}-${env}`;
};

// Export all functions for testing and use (KEEPING ORIGINAL EXPORTS)
module.exports = {
    enhancedHandleFetch, // Main export for simple usage
    handleFetch,         // Full featured handler
    checkHTTPHeaders,
    fetchFromLiveSite,
    fetchFromLiveSiteWithRetries,
    updateCacheHitStats,
    updateHeaderCheckStats,
    updateScrapeURLRecord,
    updateScrapeURLError,
    isValidUrl,
    isValidHtml,
    isTournamentNotFound,
    getTableName
};