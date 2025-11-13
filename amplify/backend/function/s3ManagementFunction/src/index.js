// s3-management-unified.js
// Complete S3 management Lambda with unified ScrapeURL approach
// and restored operational functions.
// REFACTORED FOR AWS SDK V3

// const AWS = require('aws-sdk'); // <-- REMOVED V2
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// --- AWS Clients (SDK v3) ---
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize v3 S3 Client
const s3 = new S3Client({});

// Initialize v3 DynamoDB Document Client
const ddbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

// --- DynamoDB Table Constants ---
const SCRAPE_URL_TABLE = process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME || process.env.SCRAPE_URL_TABLE || 'ScrapeURL-prod';
const S3_STORAGE_TABLE = process.env.API_KINGSROOM_S3STORAGETABLE_NAME || process.env.S3_STORAGE_TABLE || 'S3Storage-prod';

// --- S3 Bucket Constant ---
// Ensure this environment variable is set in your Lambda
const S3_BUCKET = process.env.S3_BUCKET || 'pokerpro-scraped-content';

/**
 * Helper to convert S3 GetObject stream to string
 */
const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

// ===================================================================
// 1. HELPER FUNCTIONS
// ===================================================================

/**
 * Extract tournament ID from URL or filename
 */
function extractTournamentId(url) {
    const match = url.match(/[?&]id=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Calculate content hash
 */
function calculateContentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract metadata from HTML content
 */
function extractMetadata(html) {
    const metadata = {};
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
        metadata.extractedTitle = titleMatch[1].trim();
    }
    
    // Check for tournament status
    if (html.includes('Tournament not in use')) {
        metadata.tournamentStatus = 'NOT_IN_USE';
    } else if (html.includes('Not Published')) {
        metadata.tournamentStatus = 'NOT_PUBLISHED';
    } else if (html.includes('Registration Open')) {
        metadata.tournamentStatus = 'REGISTERING';
    } else if (html.includes('Running')) {
        metadata.tournamentStatus = 'RUNNING';
    } else if (html.includes('Finished')) {
        metadata.tournamentStatus = 'FINISHED';
    }
    
    // Extract tournament name if possible
    const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (nameMatch) {
        metadata.gameName = nameMatch[1].trim();
    }
    
    return metadata;
}

/**
 * Find a ScrapeURL item by its URL.
 * Helper function for clearCache and forceRefresh
 */
async function getScrapeURLByUrl(url) {
    if (!url) {
        throw new Error('URL is required');
    }
    
    const queryParams = {
        TableName: SCRAPE_URL_TABLE,
        IndexName: 'byURL',
        KeyConditionExpression: '#url = :url',
        ExpressionAttributeNames: {
            '#url': 'url'
        },
        ExpressionAttributeValues: {
            ':url': url
        },
        Limit: 1
    };
    
    // V3 Change: .promise() -> .send(new Command())
    const result = await dynamodb.send(new QueryCommand(queryParams));
    return result.Items?.[0];
}

/**
 * Get or create ScrapeURL record for manual upload
 */
async function getOrCreateScrapeURLForManualUpload(url, entityId, tournamentId) {
    // First check if record exists
    const scrapeURL = await getScrapeURLByUrl(url);
    if (scrapeURL) {
        return scrapeURL;
    }
    
    // Create new ScrapeURL record for manual upload
    const now = new Date().toISOString();
    const newRecord = {
        id: uuidv4(),
        url,
        tournamentId,
        entityId,
        lastInteractionType: 'MANUAL_UPLOAD',
        lastInteractionAt: now,
        hasStoredContent: false, // Will be set to true after S3Storage creation
        status: 'ACTIVE',
        doNotScrape: false,
        isActive: true,
        totalInteractions: 1,
        successfulScrapes: 0,
        failedScrapes: 0,
        manualUploads: 1,
        contentChangeCount: 0,
        cacheHits: 0, // Initialize new cache field
        hasEtag: false, // Initialize new cache field
        hasLastModified: false, // Initialize new cache field
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeURL'
    };
    
    // V3 Change: .promise() -> .send(new Command())
    await dynamodb.send(new PutCommand({
        TableName: SCRAPE_URL_TABLE,
        Item: newRecord
    }));
    
    console.log(`[Manual Upload] Created new ScrapeURL record: ${newRecord.id}`);
    return newRecord;
}

/**
 * Get storage statistics (STUB)
 * TODO: Implement a performant version of this. A full scan or
 * N+1 query is not suitable for production. This should ideally
 * be a value aggregated onto the Entity table.
 */
async function getStorageStats(entityId) {
    console.warn(`[getStorageStats] STUB FUNCTION for ${entityId}. Implement real logic.`);
    // The query-heavy version from your 'refactored' code
    // is not performant. A simple stub is safer.
    return {
        totalFiles: 0,
        totalSizeMB: 0,
        bySource: {
            WEB_SCRAPER: 0,
            MANUAL_UPLOAD: 0,
            API_IMPORT: 0,
            MIGRATION: 0
        }
    };
}

// ===================================================================
// 2. MAIN OPERATION HANDLERS
// ===================================================================

/**
 * Handle manual HTML upload
 */
async function handleManualUpload(event) {
    console.log('[handleManualUpload] Processing manual upload');
    
    const { 
        fileContent, 
        fileName, 
        sourceUrl, 
        entityId,
        tournamentId: providedTournamentId,
        uploadedBy,
        notes
    } = event;
    
    if (!fileContent || !sourceUrl || !entityId) {
        throw new Error('fileContent, sourceUrl, and entityId are required');
    }
    
    // Extract tournament ID
    const tournamentId = providedTournamentId || extractTournamentId(sourceUrl);
    if (!tournamentId) {
        throw new Error('Could not determine tournament ID from URL or input');
    }
    
    const contentHash = calculateContentHash(fileContent);
    const metadata = extractMetadata(fileContent);
    const now = new Date().toISOString();
    
    try {
        // Step 1: Get or create ScrapeURL record
        const scrapeURL = await getOrCreateScrapeURLForManualUpload(sourceUrl, entityId, tournamentId);
        
        // Step 2: Check for duplicate content
        if (scrapeURL.latestS3StorageId) {
            // Get the latest storage record
            // V3 Change: .promise() -> .send(new Command())
            const latestStorage = await dynamodb.send(new GetCommand({
                TableName: S3_STORAGE_TABLE,
                Key: { id: scrapeURL.latestS3StorageId }
            }));
            
            if (latestStorage.Item && latestStorage.Item.contentHash === contentHash) {
                console.log('[handleManualUpload] Duplicate content detected, skipping upload');
                return {
                    statusCode: 200,
                    body: {
                        success: true,
                        message: 'Duplicate content already exists',
                        isDuplicate: true,
                        scrapeURLId: scrapeURL.id,
                        s3StorageId: latestStorage.Item.id,
                        s3Key: latestStorage.Item.s3Key
                    }
                };
            }
        }
        
        // Step 3: Upload to S3
        const timestamp = now.replace(/[:.]/g, '-');
        const s3Key = `manual/${entityId}/${tournamentId}/${timestamp}${fileName ? `-${fileName}` : '.html'}`;
        
        // V3 Change: .promise() -> .send(new Command())
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'text/html',
            Metadata: {
                'source': 'manual-upload',
                'source-url': sourceUrl,
                'entity-id': entityId,
                'tournament-id': String(tournamentId),
                'uploaded-by': uploadedBy || 'unknown',
                'content-hash': contentHash
            }
        }));
        
        console.log(`[handleManualUpload] Uploaded to S3: ${s3Key}`);
        
        // Step 4: Create S3Storage record
        const s3StorageId = uuidv4();
        const s3StorageItem = {
            id: s3StorageId,
            scrapeURLId: scrapeURL.id,
            s3Key,
            s3Bucket: S3_BUCKET,
            contentSize: Buffer.byteLength(fileContent, 'utf8'),
            contentHash,
            contentType: 'text/html',
            source: 'MANUAL_UPLOAD', // From S3StorageSource enum
            uploadedBy: uploadedBy || 'unknown',
            extractedTitle: metadata.extractedTitle,
            extractedGameStatus: metadata.tournamentStatus,
            extractedData: JSON.stringify(metadata),
            foundKeys: Object.keys(metadata),
            isParsed: false,
            wasGameCreated: false,
            wasGameUpdated: false,
            notes: notes || null,
            storedAt: now,
            createdAt: now,
            updatedAt: now,
            __typename: 'S3Storage'
        };
        
        // V3 Change: .promise() -> .send(new Command())
        await dynamodb.send(new PutCommand({
            TableName: S3_STORAGE_TABLE,
            Item: s3StorageItem
        }));
        
        console.log(`[handleManualUpload] Created S3Storage record: ${s3StorageId}`);
        
        // Step 5: Update ScrapeURL record
        const updateParams = {
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET lastInteractionType = :lit,
                    lastInteractionAt = :now,
                    hasStoredContent = :hsc,
                    latestS3StorageId = :lsid,
                    manualUploads = :mu,
                    totalInteractions = totalInteractions + :inc,
                    updatedAt = :now
                    ${metadata.gameName ? ', gameName = :gname' : ''}
                    ${metadata.tournamentStatus ? ', gameStatus = :gstatus' : ''}
                    ${scrapeURL.manualUploads ? '' : ', contentChangeCount = contentChangeCount + :inc'}
            `,
            ExpressionAttributeValues: {
                ':lit': 'MANUAL_UPLOAD',
                ':now': now,
                ':hsc': true,
                ':lsid': s3StorageId,
                ':mu': (scrapeURL.manualUploads || 0) + 1,
                ':inc': 1,
                ...(metadata.gameName && { ':gname': metadata.gameName }),
                ...(metadata.tournamentStatus && { ':gstatus': metadata.tournamentStatus })
            }
        };
        
        // V3 Change: .promise() -> .send(new Command())
        await dynamodb.send(new UpdateCommand(updateParams));
        console.log(`[handleManualUpload] Updated ScrapeURL record: ${scrapeURL.id}`);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: 'File uploaded successfully',
                scrapeURLId: scrapeURL.id,
                s3StorageId: s3StorageId,
                s3Key: s3Key,
                metadata: metadata
            }
        };
        
    } catch (error) {
        console.error('[handleManualUpload] Error:', error);
        throw error;
    }
}

/**
 * Query URL knowledge - single entry point for all URL queries
 */
async function handleQueryURLKnowledge(event) {
    const { 
        url,
        tournamentId,
        entityId,
        includeStorageHistory = false,
        limit = 10
    } = event;
    
    try {
        let scrapeURLs = [];
        
        // Query by URL (most specific)
        if (url) {
            const scrapeURL = await getScrapeURLByUrl(url);
            if (scrapeURL) {
                 scrapeURLs = [scrapeURL];
            }
            
        // Query by tournament ID
        } else if (tournamentId) {
            const queryParams = {
                TableName: SCRAPE_URL_TABLE,
                IndexName: 'byTournamentId',
                KeyConditionExpression: 'tournamentId = :tid',
                ExpressionAttributeValues: {
                    ':tid': tournamentId
                },
                Limit: limit
            };
            
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new QueryCommand(queryParams));
            scrapeURLs = result.Items || [];
            
        // Query by entity (broader search)
        } else if (entityId) {
            const queryParams = {
                TableName: SCRAPE_URL_TABLE,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :eid',
                ExpressionAttributeValues: {
                    ':eid': entityId
                },
                ScanIndexForward: false, // Most recent first
                Limit: limit
            };
            
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new QueryCommand(queryParams));
            scrapeURLs = result.Items || [];
            
        } else {
            throw new Error('Must provide url, tournamentId, or entityId');
        }
        
        // Optionally include storage history
        if (includeStorageHistory && scrapeURLs.length > 0) {
            for (const scrapeURL of scrapeURLs) {
                // Get storage history for this URL
                const storageParams = {
                    TableName: S3_STORAGE_TABLE,
                    IndexName: 'byScrapeURL',
                    KeyConditionExpression: 'scrapeURLId = :suid',
                    ExpressionAttributeValues: {
                        ':suid': scrapeURL.id
                    },
                    ScanIndexForward: false, // Most recent first
                    Limit: 5 // Last 5 storage records
                };
                
                // V3 Change: .promise() -> .send(new Command())
                const storageResult = await dynamodb.send(new QueryCommand(storageParams));
                scrapeURL.storageHistory = storageResult.Items || [];
            }
        }
        
        return {
            statusCode: 200,
            body: {
                success: true,
                items: scrapeURLs,
                count: scrapeURLs.length
            }
        };
        
    } catch (error) {
        console.error('[handleQueryURLKnowledge] Error:', error);
        throw error;
    }
}

/**
 * Get S3 content by storage ID or S3 Key
 */
async function handleGetS3Content(event) {
    const { s3StorageId, s3Key } = event;
    
    try {
        let storageRecord;
        
        // Get storage record by ID or key
        if (s3StorageId) {
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new GetCommand({
                TableName: S3_STORAGE_TABLE,
                Key: { id: s3StorageId }
            }));
            
            storageRecord = result.Item;
        } else if (s3Key) {
            const queryParams = {
                TableName: S3_STORAGE_TABLE,
                IndexName: 'byS3Key',
                KeyConditionExpression: 's3Key = :key',
                ExpressionAttributeValues: {
                    ':key': s3Key
                },
                Limit: 1
            };
            
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new QueryCommand(queryParams));
            storageRecord = result.Items?.[0];
        } else {
            throw new Error('Must provide s3StorageId or s3Key');
        }
        
        if (!storageRecord) {
            throw new Error('Storage record not found');
        }
        
        // Fetch content from S3
        // V3 Change: .promise() -> .send(new Command())
        const s3Data = await s3.send(new GetObjectCommand({
            Bucket: storageRecord.s3Bucket || S3_BUCKET,
            Key: storageRecord.s3Key
        }));
        
        // V3 Change: Convert S3 body stream to a string
        const htmlBody = await streamToString(s3Data.Body);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                s3Key: storageRecord.s3Key,
                html: htmlBody, // <-- CHANGED
                metadata: JSON.parse(storageRecord.extractedData || '{}'),
                contentHash: storageRecord.contentHash,
                source: storageRecord.source,
                storedAt: storageRecord.storedAt
            }
        };
        
    } catch (error) {
        console.error('[handleGetS3Content] Error:', error);
        throw error;
    }
}

/**
 * Get high-level statistics for URL management
 */
async function handleGetURLStatistics(event) {
    const { entityId } = event;
    
    if (!entityId) {
        throw new Error('entityId is required');
    }
    
    try {
        // Count different interaction types
        const stats = {
            totalURLs: 0,
            withHTML: 0,
            notPublished: 0,
            notInUse: 0,
            errors: 0,
            manualUploads: 0,
            neverChecked: 0
        };
        
        // Query all URLs for entity
        let lastEvaluatedKey;
        do {
            const params = {
                TableName: SCRAPE_URL_TABLE,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :eid',
                ExpressionAttributeValues: {
                    ':eid': entityId
                },
                ExclusiveStartKey: lastEvaluatedKey
            };
            
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new QueryCommand(params));
            
            for (const item of result.Items || []) {
                stats.totalURLs++;
                
                switch (item.lastInteractionType) {
                    case 'SCRAPED_WITH_HTML':
                        stats.withHTML++;
                        break;
                    case 'SCRAPED_NOT_PUBLISHED':
                        stats.notPublished++;
                        break;
                    case 'SCRAPED_NOT_IN_USE':
                        stats.notInUse++;
                        break;
                    case 'SCRAPED_ERROR':
                        stats.errors++;
                        break;
                    case 'MANUAL_UPLOAD':
                        stats.manualUploads++;
                        stats.withHTML++; // Manual uploads also have HTML
                        break;
                    case 'NEVER_CHECKED':
                        stats.neverChecked++;
                        break;
                }
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        // Get storage statistics
        const storageStats = await getStorageStats(entityId);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                urlStats: stats,
                storageStats: storageStats,
                summary: {
                    coverageRate: stats.totalURLs > 0 ? 
                        ((stats.withHTML / stats.totalURLs) * 100).toFixed(2) + '%' : '0%',
                    successRate: stats.totalURLs > 0 ? 
                        (((stats.withHTML + stats.notPublished + stats.notInUse) / stats.totalURLs) * 100).toFixed(2) + '%' : '0%'
                }
            }
        };
        
    } catch (error) {
        console.error('[handleGetURLStatistics] Error:', error);
        throw error;
    }
}

/**
 * Clear caching headers for a specific URL
 */
async function handleClearCache(event) {
    const { url } = event;
    
    console.log(`[handleClearCache] Attempting to clear cache for: ${url}`);
    
    try {
        const scrapeURL = await getScrapeURLByUrl(url);
        
        if (!scrapeURL) {
            console.warn(`[handleClearCache] URL not found: ${url}`);
            return {
                statusCode: 404,
                body: { success: false, message: 'URL not found' }
            };
        }
        
        // Update the record to clear cache fields
        const updateParams = {
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET etag = :null,
                    lastModifiedHeader = :null,
                    contentHash = :null,
                    cachedContentUsedCount = :zero,
                    hasEtag = :false,
                    hasLastModified = :false,
                    lastInteractionType = :lit,
                    lastInteractionAt = :now,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':null': null,
                ':zero': 0,
                ':false': false,
                ':lit': 'CACHE_CLEARED',
                ':now': new Date().toISOString()
            },
            ReturnValues: 'UPDATED_NEW'
        };
        
        // V3 Change: .promise() -> .send(new Command())
        await dynamodb.send(new UpdateCommand(updateParams));
        
        console.log(`[handleClearCache] Cache cleared for ${scrapeURL.id}`);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: 'Cache cleared successfully',
                scrapeURLId: scrapeURL.id
            }
        };
        
    } catch (error) {
        console.error('[handleClearCache] Error:', error);
        throw error;
    }
}

/**
 * Set a 'forceRefreshNext' flag on a ScrapeURL item
 */
async function handleForceRefresh(event) {
    const { url } = event;
    
    console.log(`[handleForceRefresh] Setting forceRefreshNext for: ${url}`);
    
    try {
        const scrapeURL = await getScrapeURLByUrl(url);
        
        if (!scrapeURL) {
            console.warn(`[handleForceRefresh] URL not found: ${url}`);
            return {
                statusCode: 404,
                body: { success: false, message: 'URL not found' }
            };
        }
        
        // Update the record to set the flag
        // NOTE: 'forceRefreshNext' is not in your schema, 
        // using 'doNotScrape' as a proxy. A better solution
        // would be to add 'forceRefreshNext: Boolean' to the schema.
        // For now, we set doNotScrape to false and clear cache.
        
        const updateParams = {
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET doNotScrape = :false,
                    status = :active,
                    hasEtag = :false,
                    hasLastModified = :false,
                    lastInteractionType = :lit,
                    lastInteractionAt = :now,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':false': false,
                ':active': 'ACTIVE',
                ':lit': 'FORCE_REFRESH_REQUESTED',
                ':now': new Date().toISOString()
            },
            ReturnValues: 'UPDATED_NEW'
        };
        
        // V3 Change: .promise() -> .send(new Command())
        await dynamodb.send(new UpdateCommand(updateParams));
        
        console.log(`[handleForceRefresh] Flag set for ${scrapeURL.id}`);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: 'Force refresh flag set successfully',
                scrapeURLId: scrapeURL.id
            }
        };
        
    } catch (error) {
        console.error('[handleForceRefresh] Error:', error);
        throw error;
    }
}

/**
 * Mark an S3Storage item for re-processing
 */
async function handleMarkForReProcess(event) {
    const { s3StorageId } = event;
    
    if (!s3StorageId) {
        throw new Error('s3StorageId is required');
    }
    
    console.log(`[handleMarkForReProcess] Marking ${s3StorageId} for re-processing`);
    
    try {
        // We set 'isParsed' back to false, which should trigger a re-parse
        const updateParams = {
            TableName: S3_STORAGE_TABLE,
            Key: { id: s3StorageId },
            UpdateExpression: `
                SET isParsed = :false,
                    wasGameCreated = :false,
                    wasGameUpdated = :false,
                    notes = :notes,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':false': false,
                ':notes': 'Marked for re-processing by user.',
                ':now': new Date().toISOString()
            },
            ConditionExpression: 'attribute_exists(id)', // Ensure item exists
            ReturnValues: 'UPDATED_NEW'
        };
        
        // V3 Change: .promise() -> .send(new Command())
        const result = await dynamodb.send(new UpdateCommand(updateParams));
        
        console.log(`[handleMarkForReProcess] ${s3StorageId} marked.`);
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: 'Item marked for re-processing',
                s3StorageId: s3StorageId,
                updatedAttributes: result.Attributes
            }
        };
        
    } catch (error) {
        console.error('[handleMarkForReProcess] Error:', error);
        // Handle 'ConditionalCheckFailedException' if item doesn't exist
        if (error.code === 'ConditionalCheckFailedException') {
             return {
                statusCode: 404,
                body: { success: false, message: 'S3Storage item not found' }
            };
        }
        throw error;
    }
}

/**
 * Get caching statistics for an entity
 * (Assumes ScrapeURL schema is updated with cacheHits, hasEtag, etc.)
 */
async function handleGetCachingStats(event) {
    const { entityId } = event; 
    
    if (!entityId) {
        throw new Error('entityId is required');
    }

    console.log(`[CachingStats] Getting stats for entity ${entityId}`);
    
    // Initialize stats
    const stats = {
        totalURLs: 0,
        urlsWithETags: 0,
        urlsWithLastModified: 0,
        totalCacheHits: 0,
        totalCacheMisses: 0,
        averageCacheHitRate: 0.0,
        storageUsedMB: 0.0,
        totalSuccessfulScrapes: 0
    };

    let lastEvaluatedKey;
    
    try {
        // Paginate through all ScrapeURL records for the entity
        do {
            const params = {
                TableName: SCRAPE_URL_TABLE,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :eid',
                ExpressionAttributeValues: {
                    ':eid': entityId
                },
                ExclusiveStartKey: lastEvaluatedKey
            };
            
            // V3 Change: .promise() -> .send(new Command())
            const result = await dynamodb.send(new QueryCommand(params));
            
            if (result.Items) {
                for (const item of result.Items) {
                    stats.totalURLs++;
                    
                    // Sum the new summary fields
                    stats.totalSuccessfulScrapes += (item.successfulScrapes || 0);
                    stats.totalCacheHits += (item.cacheHits || 0);
                    
                    if (item.hasEtag) {
                        stats.urlsWithETags++;
                    }
                    if (item.hasLastModified) {
                        stats.urlsWithLastModified++;
                    }
                }
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        // Calculate derived stats
        stats.totalCacheMisses = stats.totalSuccessfulScrapes - stats.totalCacheHits;
        
        if (stats.totalSuccessfulScrapes > 0) {
            stats.averageCacheHitRate = (stats.totalCacheHits / stats.totalSuccessfulScrapes) * 100;
        }

        // Get storage statistics
        try {
            const storageStats = await getStorageStats(entityId);
            stats.storageUsedMB = storageStats.totalSizeMB;
        } catch (storageError) {
            console.warn('[CachingStats] Could not get storage stats:', storageError.message);
            stats.storageUsedMB = 0; // Default to 0 if sub-function fails
        }
        
        // Return the full stats object
        return {
            statusCode: 200,
            body: {
                success: true,
                ...stats
            }
        };

    } catch (error) {
        console.error('[CachingStats] Error:', error);
        throw error;
    }
}


// ===================================================================
// 3. MAIN LAMBDA HANDLER
// ===================================================================

/**
 * Main handler
 */
exports.handler = async (event) => {
    console.log('[S3Management] Received event:', JSON.stringify(event, null, 2));
    
    // Support AppSync (event.fieldName) and direct invoke (event.operation)
    const operation = event.operation || event.fieldName;
    // Support AppSync (event.arguments) and direct invoke (event)
    const args = event.arguments || event;
    
    try {
        let response;
        switch (operation) {
            case 'upload':
            case 'uploadManualHTML': // Keep old name for AppSync compatibility
                response = await handleManualUpload(args.input || args);
                break;
                
            case 'query':
            case 'getS3StorageHistory': // Legacy
            case 'listStoredHTML': // Legacy
                response = await handleQueryURLKnowledge(args);
                break;
                
            case 'getContent':
            case 'viewS3Content': // Keep old name
                response = await handleGetS3Content(args);
                break;
                
            case 'getStats':
                response = await handleGetURLStatistics(args);
                break;
                
            // --- RESTORED FUNCTIONS ---
            
            case 'getCachingStats':
                response = await handleGetCachingStats(args);
                break;

            case 'clearURLCache':
                response = await handleClearCache(args);
                break;
                
            case 'forceRefreshScrape':
                response = await handleForceRefresh(args);
                break;
                
            case 'reScrapeFromCache':
                response = await handleMarkForReProcess(args.input || args);
                break;
            
            // --- END RESTORED FUNCTIONS ---
                
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
        
        // Return the body from the handler function,
        // which includes { statusCode, body } for direct invokes,
        // or just the data for AppSync
        return response.body || response;
        
    } catch (error) {
        console.error('[S3Management] Error:', error);
        // AppSync expects errors to be thrown
        if (event.fieldName) {
            throw error;
        }
        // Direct invoke expects an error object
        return {
            statusCode: 500,
            body: {
                success: false,
                error: error.message,
                stack: error.stack
            }
        };
    }
};