// enhanced-handleFetch.js
// HYBRID SOLUTION - Best of both approaches
// - Follows executive summary's UPSERT logic (works with existing schema)
// - Uses existing byURL index (no schema changes needed)
// - Incorporates clean code patterns (helper functions)
// - Keeps UUID primary keys (less invasive)

const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { getHtmlFromS3, storeHtmlInS3, calculateContentHash } = require('./s3-helpers');
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
 * ✅ NEW HELPER: Build updates object from scrape data
 * Centralizes logic for creating update parameters
 */
const buildScrapeUpdates = (html, headers, status, interactionType, s3Key = null) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Extract status and registration from HTML if available
    let gameStatus = null;
    let registrationStatus = null;
    
    if (html && status === 'SUCCESS') {
        try {
            const statusResult = getStatusAndReg(html);
            gameStatus = statusResult.gameStatus || null;
            registrationStatus = statusResult.registrationStatus || null;
        } catch (error) {
            console.log('[BuildUpdates] Could not extract status from HTML:', error.message);
        }
    }
    
    // Build updates object
    const updates = {
        lastInteractionType: interactionType,
        lastInteractionAt: now,
        lastScrapedAt: now,
        lastScrapeStatus: status,
        updatedAt: now,
        _lastChangedAt: timestamp
    };
    
    if (status === 'SUCCESS') {
        updates.lastSuccessfulScrapeAt = now;
        updates.consecutiveFailures = 0;
    }
    
    if (s3Key) {
        updates.latestS3Key = s3Key;
    }
    
    if (gameStatus) {
        updates.gameStatus = gameStatus;
    }
    
    if (registrationStatus) {
        updates.registrationStatus = registrationStatus;
    }
    
    // Return both updates and extracted metadata
    return { updates, gameStatus, registrationStatus };
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
 * ✅ NEW: Get existing S3Storage record by scrapeURLId or URL
 * Uses the existing byURL index from your schema
 */
const getExistingS3StorageRecord = async (scrapeURLId, url, ddbDocClient) => {
    const s3StorageTable = getTableName('S3Storage');
    
    try {
        // Query by URL using the byURL index (remove the wrong scrapeURLId lookup)
        const queryParams = {
            TableName: s3StorageTable,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': url },
            Limit: 1,
            ScanIndexForward: false
        };
        
        const queryResult = await ddbDocClient.send(new QueryCommand(queryParams));
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            console.log(`[S3Storage] Found existing record by URL: ${url}`);
            return queryResult.Items[0];
        }
        
        console.log(`[S3Storage] No existing record found for URL: ${url}`);
        return null;
        
    } catch (error) {
        console.error(`[S3Storage] Error checking for existing record:`, error);
        return null;
    }
};

/**
 * Enhanced wrapper for simplified usage - includes monitoring
 * This is the main entry point that other Lambda functions call
 */
const enhancedHandleFetch = async (url, scrapeURLRecord, entityId, tournamentId, forceRefresh = false, monitoredDdbClient = null, scraperApiKey = null) => {
    // Use provided client or create new one
    const ddbDocClient = monitoredDdbClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
    
    console.log(`[enhancedHandleFetch] Starting fetch for ${url}`);
    console.log(`[enhancedHandleFetch] Force refresh: ${forceRefresh}`);
    console.log(`[enhancedHandleFetch] Entity ID: ${entityId}`);
    console.log(`[enhancedHandleFetch] Has S3 key: ${!!scrapeURLRecord?.latestS3Key}`);
    console.log(`[enhancedHandleFetch] Has custom API key: ${!!scraperApiKey}`);  // ✅ NEW: Log API key presence
    
    try {
        const result = await handleFetch(
            url,
            scrapeURLRecord,
            entityId,
            tournamentId,
            forceRefresh,
            ddbDocClient,
            scraperApiKey  // ✅ NEW: Pass the API key
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
 * Simplified fetch for when we don't have database access
 */
const simplifiedFetch = async (url, entityId, tournamentId, scraperApiKey = null) => {
    const startTime = Date.now();
    
    console.log(`[SimplifiedFetch] Fetching ${url} for entity ${entityId}, tournament ${tournamentId}`);
    
    try {
        // Fetch from live site using ScraperAPI
        // ✅ NEW: Pass the API key
        const liveResult = await fetchFromLiveSiteWithRetries(url, MAX_RETRIES, scraperApiKey);
        
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
const handleFetch = async (url, scrapeURLRecord, entityId, tournamentId, forceRefresh = false, ddbDocClient = null, scraperApiKey = null) => {
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
        let s3KeyToUse = scrapeURLRecord.latestS3Key;
        
        // If no latestS3Key on ScrapeURL, check S3Storage table directly by URL
        if (!forceRefresh && s3Enabled && !s3KeyToUse) {
            log('info', '🔍 No latestS3Key on ScrapeURL, checking S3Storage by URL');
            try {
                const existingS3Storage = await getExistingS3StorageRecord(scrapeURLRecord.id, url, ddbDocClient);
                if (existingS3Storage && existingS3Storage.s3Key) {
                    s3KeyToUse = existingS3Storage.s3Key;
                    log('info', '✅ Found S3Storage record by URL', { 
                        s3Key: s3KeyToUse,
                        s3StorageId: existingS3Storage.id 
                    });
                }
            } catch (lookupError) {
                log('warn', 'S3Storage lookup by URL failed', { error: lookupError.message });
            }
        }
        
        if (!forceRefresh && s3Enabled && s3KeyToUse) {
            fetchStats.s3Checked = true;
            
            try {
                log('debug', 'Checking S3 cache', { s3Key: s3KeyToUse });
                
                const s3Content = await getHtmlFromS3(s3KeyToUse);
                
                if (s3Content && s3Content.html) {
                    // Validate the HTML content
                    if (isValidHtml(s3Content.html)) {
                        log('info', '✅ S3 cache hit - using cached content', {
                            s3Key: s3KeyToUse,
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
                            s3Key: s3KeyToUse,
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
                        log('warn', 'S3 content failed validation', { s3Key: s3KeyToUse });
                        fetchStats.errors.push('S3 content validation failed');
                    }
                }
            } catch (s3Error) {
                log('warn', 'S3 retrieval failed', { 
                    error: s3Error.message,
                    s3Key: s3KeyToUse 
                });
                fetchStats.errors.push(`S3 error: ${s3Error.message}`);
            }
        } else if (forceRefresh && (scrapeURLRecord.latestS3Key || s3KeyToUse)) {
            log('info', '⚠️ Skipping S3 cache due to forceRefresh=true', { 
                s3Key: s3KeyToUse || scrapeURLRecord.latestS3Key 
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
        // STEP 3: FETCH FROM LIVE SITE
        // ========================================
        log('info', '🌐 Fetching from live website', { 
            reason: forceRefresh ? 'Force refresh requested' : 'No valid cache found' 
        });
        fetchStats.liveScraped = true;
        
        // ✅ NEW: Pass the API key to fetchFromLiveSiteWithRetries
        const liveResult = await fetchFromLiveSiteWithRetries(url, MAX_RETRIES, scraperApiKey);
        
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
        // STEP 4: VALIDATE AND STORE
        // ========================================
        
        // Check for "Tournament Not Found"
        if (isTournamentNotFound(liveResult.html)) {
            log('info', 'Tournament not found (404 equivalent)');
            
            // ✅ REFACTORED: Use helper to build updates
            const { updates } = buildScrapeUpdates(liveResult.html, liveResult.headers, 'NOT_FOUND', 'NOT_FOUND', null);
            await updateScrapeURLRecord(scrapeURLRecord.id, updates, ddbDocClient, scrapeURLTable);
            
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
                // 1. Store raw file in S3
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

                // 2. Extract status metadata
                const { gameStatus, registrationStatus } = buildScrapeUpdates(
                    liveResult.html, 
                    liveResult.headers, 
                    'SUCCESS', 
                    'SCRAPED_SUCCESS', 
                    s3Key
                );

                // 3. ✅ UPSERT S3Storage record (following executive summary approach)
                try {
                    s3StorageId = await upsertS3StorageRecord(
                        scrapeURLRecord.id,  // scrapeURLId
                        s3Key,
                        liveResult.html,
                        url,
                        entityId,
                        tournamentId,
                        liveResult.headers,
                        ddbDocClient,
                        gameStatus,
                        registrationStatus
                    );
                    log('info', '✅ Upserted S3Storage record in DynamoDB', { s3StorageId });
                    
                    // 4. Update ScrapeURL with latest S3Storage ID and S3 Key
                    if (s3StorageId) {
                        await updateScrapeURLWithS3StorageId(scrapeURLRecord.id, s3StorageId, s3Key, ddbDocClient, scrapeURLTable);
                    }
                    
                } catch (s3DbError) {
                    log('warn', 'Failed to upsert S3Storage record in DynamoDB', { error: s3DbError.message });
                    fetchStats.errors.push(`S3Storage DB error: ${s3DbError.message}`);
                }

            } catch (s3Error) {
                log('warn', 'Failed to store in S3', { error: s3Error.message });
                fetchStats.errors.push(`S3 storage error: ${s3Error.message}`);
            }
        }
        
        // ✅ REFACTORED: Use helper to build updates
        const { updates } = buildScrapeUpdates(liveResult.html, liveResult.headers, 'SUCCESS', 'SCRAPED_SUCCESS', s3Key);
        await updateScrapeURLRecord(scrapeURLRecord.id, updates, ddbDocClient, scrapeURLTable);
        
        return {
            success: true,
            html: liveResult.html,
            source: 'LIVE',
            s3Key,
            s3StorageId,  // Include for reference
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
 * Remove undefined values from an object (required for DynamoDB)
 * DynamoDB doesn't support undefined values in arrays/objects
 */
const removeUndefinedValues = (obj) => {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {});
};

/**
 * ✅ EXECUTIVE SUMMARY APPROACH: UPSERT S3Storage record
 * - Uses existing byURL index to find record
 * - Reuses same UUID across updates (no new ID each time!)
 * - Maintains version history in previousVersions array
 * - Works with existing DynamoDB schema
 */
const upsertS3StorageRecord = async (
    scrapeURLId, 
    s3Key, 
    html, 
    url, 
    entityId, 
    tournamentId, 
    headers, 
    ddbDocClient, 
    gameStatus = null, 
    registrationStatus = null
) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const contentHash = calculateContentHash(html);
    const contentSize = Buffer.byteLength(html, 'utf8');
    
    // Check for existing record
    const existingRecord = await getExistingS3StorageRecord(scrapeURLId, url, ddbDocClient);
    
    if (existingRecord) {
        // ✅ RECORD EXISTS - UPDATE IT
        console.log(`[UPSERT] Updating existing S3Storage record: ${existingRecord.id}`);
        
        // CRITICAL CHECK 1: If s3Key is the same, we're re-storing the EXACT same HTML
        // This shouldn't happen in normal flow, but if it does, definitely skip versioning
        if (existingRecord.s3Key === s3Key) {
            console.log(`[UPSERT] Same s3Key detected - skipping update (same HTML file)`);
            return existingRecord.id;
        }
        
        // CRITICAL CHECK 2: Compare content hashes
        // If both hashes exist and match, content is identical
        if (existingRecord.contentHash && contentHash && existingRecord.contentHash === contentHash) {
            console.log(`[UPSERT] Content unchanged (hash match), skipping update`);
            return existingRecord.id;
        }
        
        // FALLBACK CHECK 3: If old record has NULL hash but same size, likely identical
        // (This handles migration from old records without hashes)
        if (!existingRecord.contentHash && contentSize === existingRecord.contentSize) {
            console.log(`[UPSERT] Content likely unchanged (same size, old record has NULL hash), skipping update`);
            return existingRecord.id;
        }
        
        // If we reach here, content has actually changed - create new version
        console.log(`[UPSERT] Content changed - creating new version`, {
            oldHash: existingRecord.contentHash || 'NULL',
            newHash: contentHash,
            oldSize: existingRecord.contentSize,
            newSize: contentSize
        });
        
        // Build previous version object from current data
        const previousVersionRaw = {
            s3Key: existingRecord.s3Key,
            s3Bucket: existingRecord.s3Bucket,
            scrapedAt: existingRecord.scrapedAt,
            contentHash: existingRecord.contentHash,
            contentSize: existingRecord.contentSize,
            gameStatus: existingRecord.gameStatus,
            registrationStatus: existingRecord.registrationStatus,
            wasGameCreated: existingRecord.wasGameCreated || false,
            wasGameUpdated: existingRecord.wasGameUpdated || false,
            versionNumber: existingRecord.versionNumber || 1
        };
        
        // Remove undefined values to prevent DynamoDB errors
        const previousVersion = removeUndefinedValues(previousVersionRaw);
        
        // Get existing previous versions array or create new one
        const previousVersions = existingRecord.previousVersions || [];
        previousVersions.push(previousVersion);
        
        // Calculate new version number
        const newVersionNumber = (existingRecord.versionNumber || 1) + 1;
        
        const s3StorageTable = getTableName('S3Storage');
        
        // Update the record with new data
        const updateParams = {
            TableName: s3StorageTable,
            Key: { id: existingRecord.id },
            UpdateExpression: `
                SET s3Key = :s3Key,
                    s3Bucket = :s3Bucket,
                    contentHash = :contentHash,
                    contentSize = :contentSize,
                    gameStatus = :gameStatus,
                    registrationStatus = :registrationStatus,
                    httpStatus = :httpStatus,
                    etag = :etag,
                    lastModified = :lastModified,
                    headers = :headers,
                    scrapedAt = :scrapedAt,
                    storedAt = :storedAt,
                    updatedAt = :updatedAt,
                    previousVersions = :previousVersions,
                    versionNumber = :versionNumber,
                    totalVersions = :totalVersions,
                    #lca = :timestamp,
                    #v = if_not_exists(#v, :zero) + :one
            `,
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ':s3Key': s3Key,
                ':s3Bucket': process.env.S3_BUCKET || 'pokerpro-scraper-storage',
                ':contentHash': contentHash,
                ':contentSize': contentSize,
                ':gameStatus': gameStatus || null,
                ':registrationStatus': registrationStatus || null,
                ':httpStatus': headers?.statusCode || 200,
                ':etag': headers?.etag || null,
                ':lastModified': headers?.['last-modified'] || null,
                ':headers': JSON.stringify(headers || {}),
                ':scrapedAt': now,
                ':storedAt': now,
                ':updatedAt': now,
                ':previousVersions': previousVersions,
                ':versionNumber': newVersionNumber,
                ':totalVersions': previousVersions.length + 1,
                ':timestamp': timestamp,
                ':zero': 0,
                ':one': 1
            }
        };
        
        await ddbDocClient.send(new UpdateCommand(updateParams));
        console.log(`[UPSERT] ✅ Updated record to version ${newVersionNumber}, ${previousVersions.length} previous versions stored`);
        
        return existingRecord.id;  // Return SAME ID
        
    } else {
        // ✅ RECORD DOESN'T EXIST - CREATE NEW ONE
        console.log(`[UPSERT] Creating new S3Storage record for URL: ${url}`);
        
        const s3StorageTable = getTableName('S3Storage');
        const s3StorageId = uuidv4();  // Generate NEW UUID only for first creation
        
        const newRecord = {
            id: s3StorageId,
            scrapeURLId,
            url,
            tournamentId,
            entityId,
            s3Key,
            s3Bucket: process.env.S3_BUCKET || 'pokerpro-scraper-storage',
            contentSize,
            contentHash,
            contentType: 'text/html',
            source: 'WEB_SCRAPER',
            uploadedBy: 'system',
            isManualUpload: false,
            httpStatus: headers?.statusCode || 200,
            etag: headers?.etag || null,
            lastModified: headers?.['last-modified'] || null,
            headers: JSON.stringify(headers || {}),
            gameStatus: gameStatus || null,
            registrationStatus: registrationStatus || null,
            isParsed: false,
            dataExtracted: false,
            wasGameCreated: false,
            wasGameUpdated: false,
            scrapedAt: now,
            storedAt: now,
            versionNumber: 1,
            totalVersions: 1,
            previousVersions: [],  // Empty array for first version
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: timestamp,
            _version: 1,
            __typename: 'S3Storage'
        };
        
        const putParams = {
            TableName: s3StorageTable,
            Item: newRecord
        };
        
        await ddbDocClient.send(new PutCommand(putParams));
        console.log(`[UPSERT] ✅ Created new record version 1`);
        
        return s3StorageId;
    }
};

/**
 * ✅ NEW: Update ScrapeURL record with latest S3Storage ID
 */
const updateScrapeURLWithS3StorageId = async (scrapeURLId, s3StorageId, s3Key, ddbDocClient, tableName) => {
    const now = new Date();
    const params = {
        TableName: tableName,
        Key: { id: scrapeURLId },
        UpdateExpression: `
            SET latestS3StorageId = :s3StorageId,
                latestS3Key = :s3Key,
                updatedAt = :now,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
            '#lca': '_lastChangedAt',
            '#v': '_version'
        },
        ExpressionAttributeValues: {
            ':s3StorageId': s3StorageId,
            ':s3Key': s3Key,
            ':now': now.toISOString(),
            ':timestamp': now.getTime(),
            ':zero': 0,
            ':one': 1
        }
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
    console.log(`[ScrapeURL] Updated latestS3StorageId to: ${s3StorageId}, latestS3Key to: ${s3Key}`);
};

/**
 * Check HTTP headers to determine if content has changed
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
 * ✅ UPDATED: Now accepts scraperApiKey parameter
 */
const fetchFromLiveSiteWithRetries = async (url, maxRetries = 3, scraperApiKey = null) => {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // ✅ NEW: Pass the API key to fetchFromLiveSite
            const result = await fetchFromLiveSite(url, scraperApiKey);
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
 * Fetch HTML from live website using ScraperAPI
 * ✅ UPDATED: Now accepts scraperApiKey parameter with fallback logic
 */
const fetchFromLiveSite = async (url, scraperApiKey = null) => {
    // ✅ NEW: Use provided API key or fall back to environment/constant
    const apiKey = scraperApiKey || process.env.SCRAPERAPI_KEY || SCRAPERAPI_KEY;
    
    if (!apiKey) {
        console.error('ScraperAPI key not provided and environment variable is not set!');
        return { success: false, error: 'ScraperAPI key is not configured.' };
    }

    console.log(`[fetchFromLiveSite] Using API key:`, {
        source: scraperApiKey ? 'parameter' : (process.env.SCRAPERAPI_KEY ? 'environment' : 'constant'),
        keyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : 'none'
    });

    // Construct the ScraperAPI URL with country_code=au for local appearance
    const encodedUrl = encodeURIComponent(url);
    const scraperApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodedUrl}&country_code=au`;

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
 * Update cache hit statistics in ScrapeURL record
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
 * Update header check statistics
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
 * ✅ REFACTORED: Update ScrapeURL record - simplified signature
 * Expects an updates object built by buildScrapeUpdates()
 */
const updateScrapeURLRecord = async (id, updates, ddbDocClient, tableName) => {
    const updateExpression = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Track if updatedAt is already being set
    let hasUpdatedAt = false;
    
    Object.keys(updates).forEach(key => {
        const placeholder = `:${key}`;
        
        // Skip fields that will be handled specially
        if (key === 'timesScraped' || key === 'timesSuccessful') {
            return; // These will be incremented
        }
        
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
        
        if (updates[key] !== null && updates[key] !== undefined) {
            expressionAttributeValues[placeholder] = updates[key];
        }
    });
    
    // Always increment timesScraped counter
    updateExpression.push('timesScraped = if_not_exists(timesScraped, :zero) + :one');
    
    // Increment timesSuccessful if this was a successful scrape
    if (updates.lastScrapeStatus === 'SUCCESS') {
        updateExpression.push('timesSuccessful = if_not_exists(timesSuccessful, :zero) + :one');
    }
    
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
 * Update ScrapeURL record on error
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
    if (html.trim().length < 100) return false;
    
    // Check for basic HTML structure
    const hasHtmlTag = /<html/i.test(html) || /<\/html>/i.test(html);
    const hasBodyTag = /<body/i.test(html) || /<\/body>/i.test(html);
    const hasContent = html.length > 500;
    
    return hasContent && (hasHtmlTag || hasBodyTag);
};

/**
 * Lightweight check for "Tournament Not Found"
 */
const isTournamentNotFound = (html) => {
    if (!html) return false;
    // Match the specific badge class and text
    const notFoundRegex = /class=["']cw-badge\s+cw-bg-warning["'][^>]*>\s*Tournament\s+not\s+found/i;
    return notFoundRegex.test(html);
};

/**
 * Helper to get table name with environment
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

// Export all functions for testing and use
module.exports = {
    enhancedHandleFetch,
    handleFetch,
    simplifiedFetch,
    checkHTTPHeaders,
    fetchFromLiveSite,
    fetchFromLiveSiteWithRetries,
    updateCacheHitStats,
    updateHeaderCheckStats,
    updateScrapeURLRecord,
    updateScrapeURLError,
    getExistingS3StorageRecord,  // NEW
    upsertS3StorageRecord,       // NEW (replaces createS3StorageRecord)
    updateScrapeURLWithS3StorageId,  // NEW
    buildScrapeUpdates,          // NEW: Helper function
    isValidUrl,
    isValidHtml,
    isTournamentNotFound,
    getTableName
};