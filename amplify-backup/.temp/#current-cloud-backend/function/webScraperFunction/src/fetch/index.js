/**
 * ===================================================================
 * Fetch Orchestrator
 * ===================================================================
 * 
 * Main entry point for HTML retrieval.
 * Coordinates the multi-tier caching strategy:
 * 
 * 1. S3 cache check (stored HTML)
 * 2. HTTP 304 check (ETag/Last-Modified)
 * 3. Live fetch via ScraperAPI
 * 
 * ===================================================================
 */

const { checkAllCaches, storeInS3Cache } = require('./cache-manager');
const { fetchFromLiveSiteWithRetries } = require('./http-client');
const { isValidHtml, isTournamentNotFound, validateFetchOptions } = require('./validators');
const { upsertS3StorageRecord, updateScrapeURLWithS3StorageId } = require('../storage/s3-storage-manager');
const { updateScrapeURLRecord, updateScrapeURLError, buildScrapeUpdates } = require('../core/scrape-url-manager');
const { getTableName } = require('../config/tables');
const { DATA_SOURCES, VERBOSE_LOGGING } = require('../config/constants');
const { calculateContentHash } = require('../storage/s3-client');

/**
 * Enhanced fetch handler - main entry point
 * 
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {object} options.scrapeURLRecord - Existing ScrapeURL record
 * @param {string} options.entityId - Entity ID
 * @param {number} options.tournamentId - Tournament ID
 * @param {boolean} options.forceRefresh - Skip all caches
 * @param {string} options.scraperApiKey - Optional ScraperAPI key override
 * @param {object} context - Shared context (ddbDocClient, s3Client, etc.)
 * @returns {object} Fetch result
 */
const enhancedHandleFetch = async (url, options, context) => {
    const {
        scrapeURLRecord,
        entityId,
        tournamentId,
        forceRefresh = false,
        scraperApiKey = null
    } = options;
    
    const { ddbDocClient } = context;
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
    
    // Logging helper
    const log = (level, message, data = {}) => {
        const logData = { url: url?.substring(0, 60), entityId, tournamentId, ...data };
        
        if (level === 'error') {
            console.error(`[FetchOrchestrator] ${message}`, logData);
        } else if (level === 'warn') {
            console.warn(`[FetchOrchestrator] ${message}`, logData);
        } else if (level === 'info' || VERBOSE_LOGGING) {
            console.log(`[FetchOrchestrator] ${message}`, logData);
        }
    };
    
    log('info', 'Starting fetch', { forceRefresh, hasS3Key: !!scrapeURLRecord?.latestS3Key });
    
    try {
        // Validate inputs
        if (!url) {
            throw new Error('URL is required for fetch operation');
        }
        
        if (!entityId) {
            throw new Error('Entity ID is required for fetch operation');
        }
        
        if (!scrapeURLRecord || !scrapeURLRecord.id) {
            throw new Error('Valid ScrapeURL record is required');
        }
        
        const s3Enabled = scrapeURLRecord.s3StorageEnabled !== false;
        
        // ════════════════════════════════════════════════════════════════
        // STEP 1 & 2: CHECK CACHES (S3 + HTTP 304)
        // ════════════════════════════════════════════════════════════════
        const cacheResult = await checkAllCaches(url, scrapeURLRecord, forceRefresh, context);
        
        fetchStats.s3Checked = cacheResult.stats.s3Checked;
        fetchStats.s3Hit = cacheResult.stats.s3Hit;
        fetchStats.httpHeadersChecked = cacheResult.stats.httpChecked;
        fetchStats.httpNotModified = cacheResult.stats.http304;
        
        if (cacheResult.cacheHit) {
            log('info', `✅ Cache hit - source: ${cacheResult.source}`);
            
            return {
                success: true,
                html: cacheResult.html,
                source: cacheResult.source,
                s3Key: cacheResult.s3Key,
                headers: cacheResult.metadata || {},
                usedCache: true,
                cacheType: cacheResult.source,
                contentHash: cacheResult.contentHash,
                contentSize: cacheResult.html.length,
                fetchDuration: Date.now() - startTime,
                fetchStats,
                timestamp: new Date().toISOString()
            };
        }
        
        // ════════════════════════════════════════════════════════════════
        // STEP 3: FETCH FROM LIVE SITE
        // ════════════════════════════════════════════════════════════════
        log('info', '🌐 Fetching from live site', {
            reason: forceRefresh ? 'Force refresh' : 'No valid cache'
        });
        
        fetchStats.liveScraped = true;
        
        const liveResult = await fetchFromLiveSiteWithRetries(url, 3, scraperApiKey);
        
        if (!liveResult.success) {
            log('error', 'Live fetch failed', { error: liveResult.error, attempts: liveResult.attempts });
            
            // Update error in ScrapeURL record
            await updateScrapeURLError(scrapeURLRecord.id, liveResult.error, context);
            
            return {
                success: false,
                error: liveResult.error,
                fetchStats,
                fetchDuration: Date.now() - startTime
            };
        }
        
        log('info', '✅ Live fetch successful', {
            contentLength: liveResult.html?.length,
            attempts: liveResult.attempts
        });
        
        // ════════════════════════════════════════════════════════════════
        // STEP 4: VALIDATE RESPONSE
        // ════════════════════════════════════════════════════════════════
        
        // Check for "Tournament Not Found"
        if (isTournamentNotFound(liveResult.html)) {
            log('info', 'Tournament not found (404 equivalent)');
            
            const { updates } = buildScrapeUpdates(
                liveResult.html,
                liveResult.headers,
                'NOT_FOUND',
                'NOT_FOUND',
                null
            );
            
            await updateScrapeURLRecord(scrapeURLRecord.id, updates, context);
            
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
        
        // ════════════════════════════════════════════════════════════════
        // STEP 5: STORE IN S3 CACHE
        // ════════════════════════════════════════════════════════════════
        let s3Key = null;
        let s3StorageId = null;
        const contentHash = calculateContentHash(liveResult.html);
        
        if (s3Enabled) {
            try {
                // Store raw HTML in S3
                const s3Result = await storeInS3Cache(
                    liveResult.html,
                    url,
                    entityId,
                    tournamentId,
                    liveResult.headers,
                    context
                );
                
                s3Key = s3Result.s3Key;
                
                log('info', '✅ Stored in S3', { s3Key, size: s3Result.contentSize });
                
                // Upsert S3Storage record
                try {
                    s3StorageId = await upsertS3StorageRecord({
                        scrapeURLId: scrapeURLRecord.id,
                        s3Key,
                        html: liveResult.html,
                        url,
                        entityId,
                        tournamentId,
                        headers: liveResult.headers,
                        contentHash,
                        options: {
                            skipUpdate: false,
                            contentDefinitelyChanged: true // Live fetch = new content
                        }
                    }, context);
                    
                    log('info', '✅ S3Storage record upserted', { s3StorageId });
                    
                } catch (s3StorageError) {
                    log('warn', 'S3Storage upsert failed', { error: s3StorageError.message });
                    fetchStats.errors.push(`S3Storage error: ${s3StorageError.message}`);
                }
                
                // Update ScrapeURL with S3 references
                if (s3StorageId) {
                    await updateScrapeURLWithS3StorageId(
                        scrapeURLRecord.id,
                        s3StorageId,
                        s3Key,
                        context
                    );
                }
                
            } catch (s3Error) {
                log('warn', 'S3 storage failed', { error: s3Error.message });
                fetchStats.errors.push(`S3 error: ${s3Error.message}`);
            }
        }
        
        // ════════════════════════════════════════════════════════════════
        // STEP 6: UPDATE SCRAPEURL RECORD
        // ════════════════════════════════════════════════════════════════
        const { updates } = buildScrapeUpdates(
            liveResult.html,
            liveResult.headers,
            'SUCCESS',
            'SCRAPED_WITH_HTML',
            s3Key
        );
        
        // Add HTTP caching headers for future 304 checks
        if (liveResult.headers?.etag) {
            updates.etag = liveResult.headers.etag;
        }
        if (liveResult.headers?.['last-modified']) {
            updates.lastModifiedHeader = liveResult.headers['last-modified'];
        }
        
        updates.contentHash = contentHash;
        
        await updateScrapeURLRecord(scrapeURLRecord.id, updates, context);
        
        // ════════════════════════════════════════════════════════════════
        // RETURN RESULT
        // ════════════════════════════════════════════════════════════════
        return {
            success: true,
            html: liveResult.html,
            source: DATA_SOURCES.LIVE,
            s3Key: s3Key || '',
            headers: liveResult.headers,
            usedCache: false,
            contentHash,
            contentSize: liveResult.html.length,
            fetchDuration: Date.now() - startTime,
            fetchStats,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        log('error', 'Fetch failed', { error: error.message });
        fetchStats.errors.push(error.message);
        
        return {
            success: false,
            error: error.message,
            fetchStats,
            fetchDuration: Date.now() - startTime
        };
    }
};

/**
 * Simplified fetch for when we don't have database access
 * Used for quick one-off fetches without tracking
 * 
 * @param {string} url - URL to fetch
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {string} scraperApiKey - Optional API key
 * @returns {object} Fetch result
 */
const simplifiedFetch = async (url, entityId, tournamentId, scraperApiKey = null) => {
    const startTime = Date.now();
    
    console.log(`[SimplifiedFetch] Fetching ${url}`);
    
    try {
        const liveResult = await fetchFromLiveSiteWithRetries(url, 3, scraperApiKey);
        
        if (!liveResult.success) {
            throw new Error(`Live fetch failed: ${liveResult.error}`);
        }
        
        const contentHash = calculateContentHash(liveResult.html);
        const isNotFound = isTournamentNotFound(liveResult.html);
        
        // Store in S3 if not a "not found" page
        let s3Result = null;
        if (!isNotFound) {
            try {
                s3Result = await storeInS3Cache(
                    liveResult.html,
                    url,
                    entityId,
                    tournamentId,
                    liveResult.headers,
                    {}
                );
            } catch (s3Error) {
                console.warn(`[SimplifiedFetch] S3 storage failed:`, s3Error.message);
            }
        }
        
        return {
            success: true,
            html: liveResult.html,
            source: DATA_SOURCES.LIVE,
            s3Key: s3Result?.s3Key || '',
            headers: liveResult.headers,
            usedCache: false,
            contentHash,
            contentSize: liveResult.html.length,
            fetchDuration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error(`[SimplifiedFetch] Error:`, error.message);
        return {
            success: false,
            error: error.message,
            source: 'ERROR',
            fetchDuration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
};

module.exports = {
    enhancedHandleFetch,
    simplifiedFetch
};
