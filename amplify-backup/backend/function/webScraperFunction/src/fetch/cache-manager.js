/**
 * ===================================================================
 * Cache Manager
 * ===================================================================
 * 
 * Manages the multi-tier caching strategy:
 * 1. S3 cache (stored HTML)
 * 2. HTTP 304 cache (ETag/Last-Modified validation)
 * 
 * ===================================================================
 */

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { getHtmlFromS3, storeHtmlInS3, calculateContentHash } = require('../storage/s3-client');
const { checkHTTPHeaders } = require('./http-client');
const { isValidHtml } = require('./validators');
const { getTableName } = require('../config/tables');
const { DATA_SOURCES } = require('../config/constants');

/**
 * Try to get content from S3 cache
 * 
 * @param {string} s3Key - S3 key to retrieve
 * @param {object} context - Shared context
 * @returns {object|null} Cached content or null
 */
const getFromS3Cache = async (s3Key, context) => {
    if (!s3Key) return null;
    
    try {
        console.log(`[CacheManager] Checking S3 cache: ${s3Key}`);
        
        const s3Content = await getHtmlFromS3(s3Key);
        
        if (s3Content && s3Content.html && isValidHtml(s3Content.html)) {
            console.log(`[CacheManager] ✅ S3 cache hit`, {
                s3Key,
                contentLength: s3Content.html.length
            });
            
            return {
                html: s3Content.html,
                metadata: s3Content.metadata || {},
                contentHash: s3Content.metadata?.contenthash || calculateContentHash(s3Content.html),
                lastModified: s3Content.lastModified,
                source: DATA_SOURCES.S3_CACHE
            };
        }
        
        console.log(`[CacheManager] S3 content invalid or empty`);
        return null;
        
    } catch (error) {
        console.warn(`[CacheManager] S3 retrieval failed:`, error.message);
        return null;
    }
};

/**
 * Check if content has changed using HTTP 304
 * 
 * @param {string} url - URL to check
 * @param {object} cachedHeaders - Cached ETag and Last-Modified
 * @param {string} cachedS3Key - S3 key for cached content
 * @param {object} context - Shared context
 * @returns {object} Check result { notModified, cachedContent, newHeaders }
 */
const checkHttpCache = async (url, cachedHeaders, cachedS3Key, context) => {
    if (!cachedHeaders?.etag && !cachedHeaders?.lastModifiedHeader) {
        return { notModified: false, reason: 'No cached headers' };
    }
    
    try {
        console.log(`[CacheManager] Checking HTTP 304`, {
            etag: cachedHeaders.etag?.substring(0, 20),
            lastModified: cachedHeaders.lastModifiedHeader
        });
        
        const headerResult = await checkHTTPHeaders(url, cachedHeaders);
        
        if (headerResult.notModified) {
            console.log(`[CacheManager] ✅ HTTP 304 Not Modified`);
            
            // Try to return cached S3 content
            if (cachedS3Key) {
                const cachedContent = await getFromS3Cache(cachedS3Key, context);
                if (cachedContent) {
                    return {
                        notModified: true,
                        cachedContent: {
                            ...cachedContent,
                            source: DATA_SOURCES.HTTP_304_CACHE
                        }
                    };
                }
            }
            
            // Content unchanged but no cache available
            return {
                notModified: true,
                cachedContent: null,
                reason: 'No cached content available'
            };
        }
        
        return {
            notModified: false,
            newHeaders: {
                etag: headerResult.newEtag,
                lastModified: headerResult.newLastModified
            }
        };
        
    } catch (error) {
        console.warn(`[CacheManager] HTTP header check failed:`, error.message);
        return { notModified: false, error: error.message };
    }
};

/**
 * Store content in S3 cache
 * 
 * @param {string} html - HTML content to store
 * @param {string} url - Source URL
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {object} headers - HTTP headers
 * @param {object} context - Shared context
 * @returns {object} Storage result { s3Key, contentHash, contentSize }
 */
const storeInS3Cache = async (html, url, entityId, tournamentId, headers = {}, context) => {
    try {
        console.log(`[CacheManager] Storing in S3 cache`);
        
        const result = await storeHtmlInS3(html, url, entityId, tournamentId, headers);
        
        console.log(`[CacheManager] ✅ Stored in S3: ${result.s3Key}`);
        
        return {
            s3Key: result.s3Key,
            s3Bucket: result.s3Bucket,
            contentHash: result.contentHash,
            contentSize: result.contentSize,
            timestamp: result.timestamp
        };
        
    } catch (error) {
        console.error(`[CacheManager] S3 storage failed:`, error.message);
        throw error;
    }
};

/**
 * Update cache hit statistics in ScrapeURL record
 * 
 * @param {string} scrapeURLId - ScrapeURL record ID
 * @param {object} context - Shared context with ddbDocClient
 */
const updateCacheHitStats = async (scrapeURLId, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
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
        }));
        
        console.log(`[CacheManager] Updated cache hit stats for ${scrapeURLId}`);
        
    } catch (error) {
        console.warn(`[CacheManager] Failed to update cache stats:`, error.message);
    }
};

/**
 * Update HTTP 304 check statistics in ScrapeURL record
 * 
 * @param {string} scrapeURLId - ScrapeURL record ID
 * @param {object} context - Shared context with ddbDocClient
 */
const updateHeaderCheckStats = async (scrapeURLId, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: scrapeURLId },
            UpdateExpression: `
                SET headerCheckCount = if_not_exists(headerCheckCount, :zero) + :one,
                    last304At = :now,
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
        }));
        
        console.log(`[CacheManager] Updated header check stats for ${scrapeURLId}`);
        
    } catch (error) {
        console.warn(`[CacheManager] Failed to update header stats:`, error.message);
    }
};

/**
 * Build cache check result for fetch orchestrator
 * 
 * @param {object} scrapeURLRecord - ScrapeURL record
 * @param {boolean} forceRefresh - Whether to skip cache
 * @param {object} context - Shared context
 * @returns {object} Cache check result
 */
const checkAllCaches = async (url, scrapeURLRecord, forceRefresh, context) => {
    const result = {
        cacheHit: false,
        source: null,
        html: null,
        s3Key: null,
        contentHash: null,
        stats: {
            s3Checked: false,
            s3Hit: false,
            httpChecked: false,
            http304: false
        }
    };
    
    // Skip all caches if forceRefresh
    if (forceRefresh) {
        console.log(`[CacheManager] Skipping caches - forceRefresh=true`);
        return result;
    }
    
    const s3Key = scrapeURLRecord?.latestS3Key;
    const s3Enabled = scrapeURLRecord?.s3StorageEnabled !== false;
    
    // Step 1: Check S3 cache
    if (s3Enabled && s3Key) {
        result.stats.s3Checked = true;
        
        const s3Result = await getFromS3Cache(s3Key, context);
        
        if (s3Result) {
            result.stats.s3Hit = true;
            result.cacheHit = true;
            result.source = DATA_SOURCES.S3_CACHE;
            result.html = s3Result.html;
            result.s3Key = s3Key;
            result.contentHash = s3Result.contentHash;
            result.metadata = s3Result.metadata;
            
            // Update cache hit stats
            if (scrapeURLRecord?.id) {
                await updateCacheHitStats(scrapeURLRecord.id, context);
            }
            
            return result;
        }
    }
    
    // Step 2: Check HTTP 304
    if (scrapeURLRecord?.etag || scrapeURLRecord?.lastModifiedHeader) {
        result.stats.httpChecked = true;
        
        const httpResult = await checkHttpCache(
            url,
            {
                etag: scrapeURLRecord.etag,
                lastModifiedHeader: scrapeURLRecord.lastModifiedHeader
            },
            s3Key,
            context
        );
        
        if (httpResult.notModified && httpResult.cachedContent) {
            result.stats.http304 = true;
            result.cacheHit = true;
            result.source = DATA_SOURCES.HTTP_304_CACHE;
            result.html = httpResult.cachedContent.html;
            result.s3Key = s3Key;
            result.contentHash = httpResult.cachedContent.contentHash;
            
            // Update header check stats
            if (scrapeURLRecord?.id) {
                await updateHeaderCheckStats(scrapeURLRecord.id, context);
            }
            
            return result;
        }
    }
    
    return result;
};

module.exports = {
    getFromS3Cache,
    checkHttpCache,
    storeInS3Cache,
    updateCacheHitStats,
    updateHeaderCheckStats,
    checkAllCaches
};
