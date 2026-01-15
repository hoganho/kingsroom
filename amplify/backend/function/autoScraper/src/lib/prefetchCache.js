/**
 * ScrapeURL Prefetch Cache
 * 
 * Batches DynamoDB queries for ScrapeURL records to reduce per-item lookups.
 * Used to skip known NOT_FOUND or NOT_PUBLISHED URLs without hitting the web scraper.
 * 
 * VERSION: 1.1.0
 * 
 * CHANGELOG:
 * - v1.1.0: Added clarifying comments for NOT_FOUND terminology
 *           lastScrapeStatus in ScrapeURL = scrapeStatus in parsed responses
 *           Both represent URL/scrape-level status (NOT_FOUND, NOT_PUBLISHED, etc.)
 * - v1.0.0: Initial implementation
 * 
 * FIELD MAPPING:
 * - ScrapeURL.lastScrapeStatus = The URL/scrape-level status from last scrape
 *   Equivalent to parsedData.scrapeStatus in fetch responses
 *   Values: NOT_FOUND, NOT_PUBLISHED, SUCCESS, FAILED, etc.
 * - ScrapeURL.gameStatus = The game status from last scrape (if tournament exists)
 *   Values: SCHEDULED, RUNNING, COMPLETED, NOT_FOUND, NOT_PUBLISHED, etc.
 * 
 * NOTE: For backward compatibility, we check BOTH lastScrapeStatus AND gameStatus
 * for NOT_FOUND/NOT _IN_USE/BLANK values. Older records may have the status in
 * gameStatus field only.
 */

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Prefetch configuration
const PREFETCH_BATCH_SIZE = 100;
const PREFETCH_BUFFER = 20;

class ScrapeURLPrefetchCache {
    /**
     * @param {string} entityId - The entity to fetch URLs for
     * @param {object} ddbDocClient - DynamoDB Document Client instance
     * @param {string} scrapeURLTable - Table name for ScrapeURL
     */
    constructor(entityId, ddbDocClient, scrapeURLTable) {
        this.entityId = entityId;
        this.ddbDocClient = ddbDocClient;
        this.scrapeURLTable = scrapeURLTable;
        this.cache = new Map();
        this.cacheRangeStart = null;
        this.cacheRangeEnd = null;
        this.stats = { prefetchCount: 0, cacheHits: 0, cacheMisses: 0 };
    }
    
    /**
     * Get the cached status for a tournament ID
     * 
     * Returns an object with:
     * - found: boolean - Whether a ScrapeURL record exists
     * - lastScrapeStatus: string|null - URL/scrape-level status (NOT_FOUND, NOT_PUBLISHED, SUCCESS, etc.)
     * - gameStatus: string|null - Game status from last scrape (for backward compat, may contain URL status)
     * - doNotScrape: boolean - Whether this URL should be skipped
     * - status: string|null - Overall ScrapeURL status
     * 
     * @param {number} tournamentId - Tournament ID to look up
     * @returns {Promise<object>} Status object
     */
    async getStatus(tournamentId) {
        if (this._needsPrefetch(tournamentId)) {
            await this._prefetchBatch(tournamentId);
        }
        
        if (this.cache.has(tournamentId)) {
            this.stats.cacheHits++;
            return this.cache.get(tournamentId);
        }
        
        this.stats.cacheMisses++;
        return { found: false };
    }
    
    /**
     * Check if we need to prefetch a new batch
     * @private
     */
    _needsPrefetch(tournamentId) {
        if (this.cacheRangeStart === null) return true;
        if (tournamentId < this.cacheRangeStart) return true;
        if (tournamentId > this.cacheRangeEnd - PREFETCH_BUFFER) return true;
        return false;
    }
    
    /**
     * Prefetch a batch of ScrapeURL records starting from the given ID
     * @private
     */
    async _prefetchBatch(startId) {
        const endId = startId + PREFETCH_BATCH_SIZE - 1;
        
        try {
            const result = await this.ddbDocClient.send(new QueryCommand({
                TableName: this.scrapeURLTable,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :entityId',
                FilterExpression: 'tournamentId BETWEEN :startId AND :endId',
                ExpressionAttributeValues: {
                    ':entityId': this.entityId,
                    ':startId': startId,
                    ':endId': endId
                }
            }));
            
            // Clear old entries outside the buffer zone
            if (this.cacheRangeStart !== null && startId > this.cacheRangeStart) {
                for (const id of this.cache.keys()) {
                    if (id < startId - PREFETCH_BUFFER) {
                        this.cache.delete(id);
                    }
                }
            }
            
            // Populate cache with fetched records
            // v1.1.0: lastScrapeStatus is the URL/scrape-level status
            // gameStatus may also contain URL status for backward compatibility
            for (const item of (result.Items || [])) {
                this.cache.set(item.tournamentId, {
                    found: true,
                    // lastScrapeStatus = URL/scrape-level status (preferred)
                    // This is equivalent to scrapeStatus in parsed responses
                    lastScrapeStatus: item.lastScrapeStatus || null,
                    // gameStatus may contain URL status in older records (backward compat)
                    gameStatus: item.gameStatus || null,
                    doNotScrape: item.doNotScrape || false,
                    status: item.status || null
                });
            }
            
            this.cacheRangeStart = startId;
            this.cacheRangeEnd = endId;
            this.stats.prefetchCount++;
            
            console.log(`[ScrapeURLPrefetch] Prefetched ${result.Items?.length || 0} records for IDs ${startId}-${endId}`);
            
        } catch (error) {
            console.error(`[ScrapeURLPrefetch] Error prefetching batch: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        return { 
            ...this.stats, 
            cacheSize: this.cache.size,
            cacheRange: this.cacheRangeStart !== null 
                ? `${this.cacheRangeStart}-${this.cacheRangeEnd}`
                : 'empty'
        };
    }
    
    /**
     * Clear the cache (useful for testing or memory management)
     */
    clear() {
        this.cache.clear();
        this.cacheRangeStart = null;
        this.cacheRangeEnd = null;
    }
}

module.exports = {
    ScrapeURLPrefetchCache,
    PREFETCH_BATCH_SIZE,
    PREFETCH_BUFFER
};