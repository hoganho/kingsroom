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

// S3ManagementLambda/index.js
// Lambda function for S3 HTML management operations

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const {
    storeHtmlInS3,
    getHtmlFromS3,
    listHtmlFilesForTournament,
    getStorageStats,
    calculateContentHash
} = require('./s3-helpers');

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
    
    const { field, arguments: args } = event;
    
    try {
        switch (field) {
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
                throw new Error(`Unknown field: ${field}`);
        }
    } catch (error) {
        console.error(`[S3Management] Error handling ${field}:`, error);
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
    const storageRecord = {
        id: uuidv4(),
        scrapeURLId: null, // Manual uploads may not have associated ScrapeURL
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
}

/**
 * List all stored HTML for a URL
 */
async function handleListStoredHTML(args) {
    const { url, limit = 20 } = args;
    
    console.log(`[ListStoredHTML] Listing HTML for ${url}`);
    
    const s3StorageTable = getTableName('S3Storage');
    
    // Query by URL
    const scanResult = await ddbDocClient.send(new ScanCommand({
        TableName: s3StorageTable,
        FilterExpression: 'url = :url',
        ExpressionAttributeValues: {
            ':url': url
        },
        Limit: limit
    }));
    
    // Sort by scrapedAt descending
    const items = (scanResult.Items || []).sort((a, b) => 
        new Date(b.scrapedAt) - new Date(a.scrapedAt)
    );
    
    return {
        items: items,
        nextToken: scanResult.LastEvaluatedKey ? 
            Buffer.from(JSON.stringify(scanResult.LastEvaluatedKey)).toString('base64') : null
    };
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
    
    // Import scraping functions (you'll need to adapt this to your structure)
    const { scrapeDataFromHtml } = require('./scraperStrategies');
    const { getAllVenues, getAllSeriesTitles } = require('./index');
    
    // Get venues and series titles
    const venues = await getAllVenues();
    const seriesTitles = await getAllSeriesTitles();
    
    // Re-scrape the HTML
    const scrapingResult = scrapeDataFromHtml(s3Content.html, venues, seriesTitles, url);
    
    // If saveToDatabase is true, you would save to the Game table here
    // This would require importing the save logic from your main Lambda
    
    return {
        ...scrapingResult.data,
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
    
    // Find ScrapeURL record
    const queryResult = await ddbDocClient.send(new QueryCommand({
        TableName: scrapeURLTable,
        IndexName: 'byURL',
        KeyConditionExpression: 'url = :url',
        ExpressionAttributeValues: { ':url': url },
        Limit: 1
    }));
    
    if (queryResult.Items && queryResult.Items.length > 0) {
        const scrapeURL = queryResult.Items[0];
        
        // Clear caching fields
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET etag = :null,
                    lastModifiedHeader = :null,
                    contentHash = :null,
                    latestS3Key = :null,
                    cachedContentUsedCount = :zero
            `,
            ExpressionAttributeValues: {
                ':null': null,
                ':zero': 0
            }
        }));
        
        console.log(`[ClearCache] Cache cleared for ${url}`);
        return true;
    }
    
    return false;
}
