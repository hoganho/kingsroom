/**
 * ScrapeURL Prefetch Cache
 * 
 * Batches DynamoDB queries for ScrapeURL records to reduce per-item lookups.
 * Used to skip known NOT_FOUND or NOT_PUBLISHED URLs without hitting the web scraper.
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
    
    _needsPrefetch(tournamentId) {
        if (this.cacheRangeStart === null) return true;
        if (tournamentId < this.cacheRangeStart) return true;
        if (tournamentId > this.cacheRangeEnd - PREFETCH_BUFFER) return true;
        return false;
    }
    
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
            
            // Clear old entries
            if (this.cacheRangeStart !== null && startId > this.cacheRangeStart) {
                for (const id of this.cache.keys()) {
                    if (id < startId - PREFETCH_BUFFER) {
                        this.cache.delete(id);
                    }
                }
            }
            
            // Populate cache
            for (const item of (result.Items || [])) {
                this.cache.set(item.tournamentId, {
                    found: true,
                    lastScrapeStatus: item.lastScrapeStatus || null,
                    gameStatus: item.gameStatus || null,
                    doNotScrape: item.doNotScrape || false,
                    status: item.status || null
                });
            }
            
            this.cacheRangeStart = startId;
            this.cacheRangeEnd = endId;
            this.stats.prefetchCount++;
            
        } catch (error) {
            console.error(`[ScrapeURLPrefetch] Error: ${error.message}`);
            throw error;
        }
    }
    
    getStats() {
        return { ...this.stats, cacheSize: this.cache.size };
    }
}

module.exports = {
    ScrapeURLPrefetchCache,
    PREFETCH_BATCH_SIZE,
    PREFETCH_BUFFER
};
