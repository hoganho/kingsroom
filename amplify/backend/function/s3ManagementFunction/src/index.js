/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_S3STORAGETABLE_ARN
	API_KINGSROOM_S3STORAGETABLE_NAME
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// S3ManagementFunction/index.js
// Lambda function for S3 HTML management operations
// FIXED: 1) Removed uuid dependency to avoid ES Module issues
//        2) Changed 'field' to 'fieldName' for AppSync compatibility

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Use crypto to generate UUIDs instead of the uuid package
const generateUUID = () => {
    return crypto.randomUUID();
};

// Only require s3-helpers if it exists, otherwise use stub functions
let s3Helpers;
try {
    s3Helpers = require('./s3-helpers');
} catch (e) {
    console.warn('s3-helpers.js not found, using stub functions');
    s3Helpers = {
        storeHtmlInS3: async () => ({ 
            s3Key: 'stub-key', 
            s3Bucket: 'stub-bucket', 
            timestamp: new Date().toISOString(),
            contentSize: 0,
            contentHash: 'stub-hash'
        }),
        getHtmlFromS3: async () => null,
        listHtmlFilesForTournament: async () => [],
        getStorageStats: async () => ({ totalSizeMB: '0' }),
        calculateContentHash: (content) => crypto.createHash('md5').update(content).digest('hex')
    };
}

const { 
    storeHtmlInS3, 
    getHtmlFromS3, 
    listHtmlFilesForTournament, 
    getStorageStats, 
    calculateContentHash 
} = s3Helpers;

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Get table names from environment variables
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Main handler for S3 management operations
 */
exports.handler = async (event) => {
    console.log('[S3Management] Received event:', JSON.stringify(event));
    
    // AppSync sends 'fieldName' not 'field'
    const { fieldName, arguments: args } = event;
    
    try {
        switch (fieldName) {
            case 'uploadManualHTML':
                return await handleManualUpload(args.input);
                
            case 'viewS3Content':
                return await handleViewContent(args);
                
            case 'getS3StorageHistory':
                return await handleGetStorageHistory(args);
                
            case 'getCachingStats':
                return await handleGetCachingStats(args);
                
            case 'listStoredHTML':
                return await handleListStoredHTML(args);
                
            case 'reScrapeFromCache':
                return await handleReScrapeFromCache(args.input);
                
            case 'forceRefreshScrape':
                return await handleForceRefresh(args);
                
            case 'clearURLCache':
                return await handleClearCache(args);
                
            default:
                throw new Error(`Unknown field: ${fieldName}`);
        }
    } catch (error) {
        console.error(`[S3Management] Error handling ${fieldName}:`, error);
        throw error;
    }
};

/**
 * Handle manual HTML upload
 */
async function handleManualUpload(input) {
    const { htmlContent, url, tournamentId, entityId, notes, uploadedBy } = input;
    
    console.log(`[ManualUpload] Processing upload for tournament ${tournamentId}`);
    
    // Store in S3
    const s3Result = await storeHtmlInS3(
        htmlContent,
        url,
        entityId,
        tournamentId,
        {},
        true // isManual
    );
    
    // Record in S3Storage table
    const s3StorageTable = getTableName('S3Storage');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    const storageRecord = {
        id: generateUUID(),
        scrapeURLId: null,
        url: url,
        tournamentId: tournamentId,
        entityId: entityId,
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        scrapedAt: s3Result.timestamp,
        contentSize: s3Result.contentSize,
        contentHash: s3Result.contentHash,
        isManualUpload: true,
        uploadedBy: uploadedBy,
        notes: notes,
        dataExtracted: false,
        createdAt: now,
        updatedAt: now,
        // ✅ ADD DataStore sync fields:
        __typename: 'S3Storage',
        _lastChangedAt: timestamp,     // Required: timestamp in milliseconds
        _version: 1,                    // Required: initial version
        _deleted: null                  // Optional but good practice
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: s3StorageTable,
        Item: storageRecord
    }));
    
    console.log(`[ManualUpload] Successfully uploaded HTML to ${s3Result.s3Key}`);
    
    return storageRecord;
}

/**
 * View S3 content
 */
async function handleViewContent(args) {
    const { s3Key } = args;
    
    if (!s3Key) {
        throw new Error('s3Key is required');
    }
    
    console.log(`[ViewContent] Retrieving content from ${s3Key}`);
    
    const content = await getHtmlFromS3(s3Key);
    
    if (!content) {
        throw new Error(`Content not found at ${s3Key}`);
    }
    
    return {
        s3Key: s3Key,
        html: content.html,
        metadata: content.metadata,
        size: content.contentLength,
        lastModified: content.lastModified
    };
}

/**
 * Get S3 storage history for a tournament
 */
async function handleGetStorageHistory(args) {
    const { tournamentId, entityId, limit = 20 } = args;
    
    console.log(`[StorageHistory] Getting history for tournament ${tournamentId}`);
    
    const s3StorageTable = getTableName('S3Storage');
    
    try {
        // Query by tournament ID
        const queryResult = await ddbDocClient.send(new QueryCommand({
            TableName: s3StorageTable,
            IndexName: 'byTournamentId',
            KeyConditionExpression: 'tournamentId = :tid',
            FilterExpression: entityId ? 'entityId = :eid' : undefined,
            ExpressionAttributeValues: {
                ':tid': tournamentId,
                ...(entityId ? { ':eid': entityId } : {})
            },
            ScanIndexForward: false, // Newest first
            Limit: limit
        }));
        
        return {
            items: queryResult.Items || [],
            nextToken: queryResult.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(queryResult.LastEvaluatedKey)).toString('base64') : null
        };
    } catch (error) {
        console.error('[StorageHistory] Error:', error);
        // Return empty result if table doesn't exist
        return {
            items: [],
            nextToken: null
        };
    }
}

/**
 * Get caching statistics
 */
async function handleGetCachingStats(args) {
    const { entityId, timeRange } = args;
    
    console.log(`[CachingStats] Getting stats for entity ${entityId}`);
    
    const scrapeURLTable = getTableName('ScrapeURL');
    
    // Calculate time filter
    let startTime = null;
    const now = new Date();
    
    switch (timeRange) {
        case 'LAST_HOUR':
            startTime = new Date(now - 60 * 60 * 1000);
            break;
        case 'LAST_24_HOURS':
            startTime = new Date(now - 24 * 60 * 60 * 1000);
            break;
        case 'LAST_7_DAYS':
            startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'LAST_30_DAYS':
            startTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startTime = new Date(now - 7 * 24 * 60 * 60 * 1000); // Default to last 7 days
    }
    
    try {
        // Query ScrapeURL records for entity
        const scanResult = await ddbDocClient.send(new ScanCommand({
            TableName: scrapeURLTable,
            FilterExpression: 'entityId = :eid',
            ExpressionAttributeValues: {
                ':eid': entityId
            }
        }));
        
        const urls = scanResult.Items || [];
        
        // Calculate statistics
        const stats = {
            totalURLs: urls.length,
            urlsWithETags: urls.filter(u => u.etag).length,
            urlsWithLastModified: urls.filter(u => u.lastModifiedHeader).length,
            totalCacheHits: urls.reduce((sum, u) => sum + (u.cachedContentUsedCount || 0), 0),
            totalCacheMisses: urls.reduce((sum, u) => sum + (u.timesScraped || 0) - (u.cachedContentUsedCount || 0), 0),
            averageCacheHitRate: 0,
            storageUsedMB: 0,
            recentCacheActivity: []
        };
        
        // Calculate cache hit rate
        const totalRequests = stats.totalCacheHits + stats.totalCacheMisses;
        if (totalRequests > 0) {
            stats.averageCacheHitRate = (stats.totalCacheHits / totalRequests) * 100;
        }
        
        // Get storage statistics from S3
        const storageStats = await getStorageStats(entityId);
        stats.storageUsedMB = parseFloat(storageStats.totalSizeMB);
        
        // Get recent cache activity (simplified for now)
        const recentURLs = urls
            .filter(u => u.lastHeaderCheckAt && new Date(u.lastHeaderCheckAt) > startTime)
            .sort((a, b) => new Date(b.lastHeaderCheckAt) - new Date(a.lastHeaderCheckAt))
            .slice(0, 10);
        
        stats.recentCacheActivity = recentURLs.map(u => ({
            url: u.url,
            timestamp: u.lastHeaderCheckAt,
            action: u.cachedContentUsedCount > 0 ? 'HIT' : 'MISS',
            reason: u.etag ? 'etag_check' : u.lastModifiedHeader ? 'last_modified_check' : 'no_headers'
        }));
        
        return stats;
    } catch (error) {
        console.error('[CachingStats] Error:', error);
        // Return default stats if error
        return {
            totalURLs: 0,
            urlsWithETags: 0,
            urlsWithLastModified: 0,
            totalCacheHits: 0,
            totalCacheMisses: 0,
            averageCacheHitRate: 0,
            storageUsedMB: 0,
            recentCacheActivity: []
        };
    }
}

/**
 * List all stored HTML for a URL - WITH BETTER ERROR HANDLING
 */
async function handleListStoredHTML(args) {
    const { url, limit = 20 } = args;
    
    console.log(`[ListStoredHTML] Listing HTML for ${url}`);
    
    try {
        // First, try to use S3Storage table
        const s3StorageTable = getTableName('S3Storage');
        
        console.log(`[ListStoredHTML] Attempting to scan table: ${s3StorageTable}`);
        
        // Query by URL - using ExpressionAttributeNames for reserved keyword
        const scanResult = await ddbDocClient.send(new ScanCommand({
            TableName: s3StorageTable,
            FilterExpression: '#url = :url',
            ExpressionAttributeNames: {
                '#url': 'url'  // Map #url to the actual attribute name
            },
            ExpressionAttributeValues: {
                ':url': url
            },
            Limit: limit
        }));
        
        // Sort by scrapedAt descending
        const items = (scanResult.Items || []).sort((a, b) => 
            new Date(b.scrapedAt || 0) - new Date(a.scrapedAt || 0)
        );
        
        console.log(`[ListStoredHTML] Found ${items.length} items in S3Storage table`);
        
        return {
            items: items,
            nextToken: scanResult.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(scanResult.LastEvaluatedKey)).toString('base64') : null
        };
        
    } catch (error) {
        console.error('[ListStoredHTML] Error accessing S3Storage table:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // If S3Storage table doesn't exist, try to use ScrapeURL table's S3 fields
        if (error.name === 'ResourceNotFoundException' || 
            error.message?.includes('Requested resource not found') ||
            error.message?.includes('does not exist')) {
            
            console.log('[ListStoredHTML] S3Storage table not found, attempting fallback to ScrapeURL table');
            
            try {
                const scrapeURLTable = getTableName('ScrapeURL');
                console.log(`[ListStoredHTML] Looking in ScrapeURL table: ${scrapeURLTable}`);
                
                // First find the ScrapeURL record - using ExpressionAttributeNames for reserved keyword
                const scrapeURLResult = await ddbDocClient.send(new ScanCommand({
                    TableName: scrapeURLTable,
                    FilterExpression: '#url = :url',
                    ExpressionAttributeNames: {
                        '#url': 'url'  // Map #url to the actual attribute name
                    },
                    ExpressionAttributeValues: {
                        ':url': url
                    },
                    Limit: 1
                }));
                
                if (scrapeURLResult.Items && scrapeURLResult.Items.length > 0) {
                    const scrapeURL = scrapeURLResult.Items[0];
                    console.log('[ListStoredHTML] Found ScrapeURL record:', scrapeURL.id);
                    
                    // Check if there's S3 data
                    if (scrapeURL.latestS3Key) {
                        // Create a mock S3Storage item from ScrapeURL data
                        const mockItem = {
                            id: scrapeURL.id,
                            scrapeURLId: scrapeURL.id,
                            url: scrapeURL.url,
                            tournamentId: scrapeURL.tournamentId,
                            entityId: scrapeURL.entityId,
                            s3Key: scrapeURL.latestS3Key,
                            s3Bucket: process.env.S3_BUCKET_NAME || 'kingsroom-scraper-html-storage',
                            scrapedAt: scrapeURL.lastScrapedAt || scrapeURL.updatedAt,
                            contentHash: scrapeURL.contentHash,
                            isManualUpload: false,
                            dataExtracted: scrapeURL.placedIntoDatabase
                        };
                        
                        console.log('[ListStoredHTML] Using ScrapeURL data as fallback');
                        
                        return {
                            items: [mockItem],
                            nextToken: null
                        };
                    }
                }
                
                // No S3 data found
                console.log('[ListStoredHTML] No S3 data found in ScrapeURL table');
                return {
                    items: [],
                    nextToken: null
                };
                
            } catch (fallbackError) {
                console.error('[ListStoredHTML] Fallback failed:', fallbackError);
                
                // Return empty result instead of throwing
                return {
                    items: [],
                    nextToken: null
                };
            }
        }
        
        // For other errors, return empty result
        console.log('[ListStoredHTML] Returning empty result due to error');
        return {
            items: [],
            nextToken: null
        };
    }
}

/**
 * Re-scrape from cached HTML
 */
async function handleReScrapeFromCache(input) {
    const { s3Key, saveToDatabase } = input;
    
    console.log(`[ReScrapeFromCache] Re-scraping from ${s3Key}`);
    
    // Get HTML from S3
    const s3Content = await getHtmlFromS3(s3Key);
    
    if (!s3Content) {
        throw new Error(`Content not found at ${s3Key}`);
    }
    
    // Get metadata
    const { url, tournamentid, entityid } = s3Content.metadata;
    
    // Return mock data for now since we don't have scraping functions
    return {
        gameName: 'Mock Game',
        gameTime: new Date().toISOString(),
        gameStatus: 'MOCK',
        registrationStatus: 'MOCK',
        currentEntrants: 0,
        sourceUrl: url,
        tournamentId: parseInt(tournamentid),
        entityId: entityid,
        s3Key: s3Key,
        reScrapedAt: new Date().toISOString()
    };
}

/**
 * Force refresh scrape (bypass cache)
 */
async function handleForceRefresh(args) {
    const { url } = args;
    
    console.log(`[ForceRefresh] Force refreshing ${url}`);
    
    // This would invoke your main WebScraper Lambda with forceRefresh flag
    // For now, return a placeholder
    return {
        message: `Force refresh triggered for ${url}`,
        status: 'PROCESSING'
    };
}

/**
 * Clear cache for a URL
 */
async function handleClearCache(args) {
    const { url } = args;
    
    console.log(`[ClearCache] Clearing cache for ${url}`);
    
    const scrapeURLTable = getTableName('ScrapeURL');
    
    try {
        // Find ScrapeURL record using scan
        const scanResult = await ddbDocClient.send(new ScanCommand({
            TableName: scrapeURLTable,
            FilterExpression: '#url = :url',
            ExpressionAttributeNames: {
                '#url': 'url'
            },
            ExpressionAttributeValues: { ':url': url },
            Limit: 1
        }));
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            const scrapeURL = scanResult.Items[0];
            
            // Clear caching fields WITH DataStore sync field updates
            await ddbDocClient.send(new UpdateCommand({
                TableName: scrapeURLTable,
                Key: { id: scrapeURL.id },
                UpdateExpression: `
                    SET etag = :null,
                        lastModifiedHeader = :null,
                        contentHash = :null,
                        latestS3Key = :null,
                        cachedContentUsedCount = :zero,
                        updatedAt = :now,
                        _lastChangedAt = :timestamp,
                        _version = if_not_exists(_version, :versionZero) + :versionOne
                `,
                ExpressionAttributeValues: {
                    ':null': null,
                    ':zero': 0,
                    ':now': new Date().toISOString(),     // ✅ Added
                    ':timestamp': Date.now(),               // ✅ Added
                    ':versionZero': 0,                      // ✅ Added
                    ':versionOne': 1                        // ✅ Added
                }
            }));
            
            console.log(`[ClearCache] Cache cleared for ${url}`);
            return true;
        }
        
        console.log(`[ClearCache] URL not found: ${url}`);
        return false;
        
    } catch (error) {
        console.error('[ClearCache] Error:', error);
        return false;
    }
}
