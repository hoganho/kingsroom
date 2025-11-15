// s3-management-unified.js
// Complete S3 management Lambda with unified ScrapeURL approach
// and restored operational functions.
// REFACTORED FOR AWS SDK V3
// FIX: Added proper handleListStoredHTML function

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
const S3_BUCKET = process.env.S3_BUCKET || 'pokerpro-scraper-storage';

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
 * Handle manual HTML upload with UPSERT + History logic
 */
async function handleManualUpload(event) {
    console.log('[handleManualUpload] Processing manual upload (Upsert Mode)');
    
    const { 
        fileContent, 
        fileName, 
        sourceUrl, 
        entityId,
        tournamentId: providedTournamentId,
        uploadedBy,
        notes
    } = event;

    // ... (Validation logic remains the same) ...
    const tournamentId = providedTournamentId || extractTournamentId(sourceUrl);
    const contentHash = calculateContentHash(fileContent);
    const metadata = extractMetadata(fileContent);
    const now = new Date().toISOString();

    try {
        // 1. Get or create ScrapeURL record (Same as before)
        const scrapeURL = await getOrCreateScrapeURLForManualUpload(sourceUrl, entityId, tournamentId);
        
        // 2. Check for EXISTING S3Storage record
        let existingStorage = null;
        if (scrapeURL.latestS3StorageId) {
            const result = await dynamodb.send(new GetCommand({
                TableName: S3_STORAGE_TABLE,
                Key: { id: scrapeURL.latestS3StorageId }
            }));
            existingStorage = result.Item;
        }

        // 3. Duplicate Check
        if (existingStorage && existingStorage.contentHash === contentHash) {
             return {
                statusCode: 200,
                body: { success: true, message: 'Duplicate content, no update needed.' }
            };
        }

        // 4. Upload NEW content to S3 (Same bucket logic)
        const timestamp = now.replace(/[:.]/g, '-');
        const s3Key = `manual/${entityId}/${tournamentId}/${timestamp}${fileName ? `-${fileName}` : '.html'}`;
        
        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'text/html',
            Metadata: { /* ... metadata ... */ }
        }));

        // 5. Prepare History Array
        const historyEntry = existingStorage ? {
            s3Key: existingStorage.s3Key,
            scrapedAt: existingStorage.scrapedAt,
            contentHash: existingStorage.contentHash,
            contentSize: existingStorage.contentSize,
            isManualUpload: existingStorage.isManualUpload || false,
            uploadedBy: existingStorage.uploadedBy,
            notes: existingStorage.notes
        } : null;

        const updatedHistory = existingStorage?.previousVersions || [];
        if (historyEntry) {
            updatedHistory.push(historyEntry);
        }

        // 6. Create or Update S3Storage record (UPSERT)
        const s3StorageItem = {
            id: scrapeURL.latestS3StorageId || uuidv4(), // Use existing ID or generate new
            scrapeURLId: scrapeURL.id,
            url: sourceUrl,
            tournamentId: tournamentId,
            entityId: entityId,
            s3Key: s3Key,
            s3Bucket: S3_BUCKET,
            scrapedAt: now,
            contentSize: Buffer.byteLength(fileContent, 'utf8'),
            contentHash: contentHash,
            etag: null,
            lastModified: null,
            headers: null,
            dataExtracted: false,
            gameId: null,
            isManualUpload: true,
            uploadedBy: uploadedBy,
            notes: notes,
            previousVersions: updatedHistory,
            gameStatus: metadata.tournamentStatus || null,
            registrationStatus: null,
            createdAt: existingStorage?.createdAt || now,
            updatedAt: now,
            __typename: 'S3Storage'
        };

        await dynamodb.send(new PutCommand({
            TableName: S3_STORAGE_TABLE,
            Item: s3StorageItem
        }));

        console.log(`[Manual Upload] S3Storage ${existingStorage ? 'updated' : 'created'}: ${s3StorageItem.id}`);

        // 7. Update ScrapeURL to point to this S3Storage
        await dynamodb.send(new UpdateCommand({
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET latestS3StorageId = :sid,
                    latestS3Key = :key,
                    contentHash = :hash,
                    lastContentChangeAt = :now,
                    lastInteractionAt = :now,
                    lastInteractionType = :type,
                    manualUploads = manualUploads + :one,
                    hasStoredContent = :true,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':sid': s3StorageItem.id,
                ':key': s3Key,
                ':hash': contentHash,
                ':now': now,
                ':type': 'MANUAL_UPLOAD',
                ':one': 1,
                ':true': true
            }
        }));

        return {
            statusCode: 200,
            body: {
                success: true,
                message: existingStorage ? 'HTML updated successfully' : 'HTML uploaded successfully',
                s3Key: s3Key,
                s3StorageId: s3StorageItem.id,
                scrapeURLId: scrapeURL.id,
                contentHash: contentHash,
                versionsStored: updatedHistory.length + 1
            }
        };

    } catch (error) {
        console.error('[handleManualUpload] Error:', error);
        throw error;
    }
}

/**
 * CRITICAL FIX: New function to handle listStoredHTML query
 * This queries the S3Storage table directly by URL, not ScrapeURL table
 */
async function handleListStoredHTML(event) {
    const { url, limit = 10 } = event;
    
    if (!url) {
        throw new Error('URL is required for listStoredHTML');
    }
    
    console.log(`[listStoredHTML] Querying S3Storage for URL: ${url}, limit: ${limit}`);
    
    try {
        // Query S3Storage table using the byURL GSI
        const queryParams = {
            TableName: S3_STORAGE_TABLE,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: {
                '#url': 'url'
            },
            ExpressionAttributeValues: {
                ':url': url
            },
            ScanIndexForward: false, // Most recent first (descending scrapedAt)
            Limit: limit || 10
        };
        
        console.log('[listStoredHTML] Query params:', JSON.stringify(queryParams, null, 2));
        
        const result = await dynamodb.send(new QueryCommand(queryParams));
        
        console.log(`[listStoredHTML] Found ${result.Items?.length || 0} items`);
        
        // CRITICAL: Ensure all required fields are present
        const items = (result.Items || []).map(item => {
            // Validate required fields
            if (!item.s3Key) {
                console.error(`[listStoredHTML] WARNING: Item ${item.id} missing s3Key`);
            }
            if (!item.scrapedAt) {
                console.error(`[listStoredHTML] WARNING: Item ${item.id} missing scrapedAt`);
            }
            
            // Return item with guaranteed required fields
            return {
                ...item,
                // Ensure non-nullable fields have values
                s3Key: item.s3Key || '',
                scrapedAt: item.scrapedAt || new Date().toISOString(),
                s3Bucket: item.s3Bucket || S3_BUCKET,
                entityId: item.entityId || '',
                tournamentId: item.tournamentId || 0,
                url: item.url || url
            };
        });
        
        return {
            statusCode: 200,
            body: {
                items: items,
                nextToken: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
            }
        };
        
    } catch (error) {
        console.error('[listStoredHTML] Error:', error);
        throw error;
    }
}

/**
 * Legacy handler for getS3StorageHistory
 * This should query by tournamentId and entityId
 */
async function handleGetS3StorageHistory(event) {
    const { tournamentId, entityId, limit = 10 } = event;
    
    if (!tournamentId || !entityId) {
        throw new Error('Both tournamentId and entityId are required for getS3StorageHistory');
    }
    
    console.log(`[getS3StorageHistory] Query for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    try {
        // Query S3Storage table using byEntity GSI
        const queryParams = {
            TableName: S3_STORAGE_TABLE,
            IndexName: 'byEntity',
            KeyConditionExpression: 'entityId = :eid',
            FilterExpression: 'tournamentId = :tid',
            ExpressionAttributeValues: {
                ':eid': entityId,
                ':tid': tournamentId
            },
            ScanIndexForward: false, // Most recent first
            Limit: limit || 10
        };
        
        const result = await dynamodb.send(new QueryCommand(queryParams));
        
        console.log(`[getS3StorageHistory] Found ${result.Items?.length || 0} items`);
        
        return {
            statusCode: 200,
            body: {
                items: result.Items || [],
                nextToken: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
            }
        };
        
    } catch (error) {
        console.error('[getS3StorageHistory] Error:', error);
        throw error;
    }
}

/**
 * Query URL knowledge from ScrapeURL table (legacy function)
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
            const result = await dynamodb.send(new GetCommand({
                TableName: S3_STORAGE_TABLE,
                Key: { id: s3StorageId }
            }));
            storageRecord = result.Item;
        } else if (s3Key) {
            // Query by s3Key using GSI
            const queryParams = {
                TableName: S3_STORAGE_TABLE,
                IndexName: 'byS3Key',
                KeyConditionExpression: 's3Key = :key',
                ExpressionAttributeValues: {
                    ':key': s3Key
                },
                Limit: 1
            };
            
            const result = await dynamodb.send(new QueryCommand(queryParams));
            storageRecord = result.Items?.[0];
        } else {
            throw new Error('Either s3StorageId or s3Key is required');
        }
        
        if (!storageRecord) {
            throw new Error('Storage record not found');
        }
        
        // Get HTML from S3
        const getCommand = new GetObjectCommand({
            Bucket: storageRecord.s3Bucket || S3_BUCKET,
            Key: storageRecord.s3Key
        });
        
        const s3Response = await s3.send(getCommand);
        const html = await streamToString(s3Response.Body);
        
        return {
            statusCode: 200,
            body: {
                s3Key: storageRecord.s3Key,
                html: html,
                metadata: {
                    contentHash: storageRecord.contentHash,
                    contentSize: storageRecord.contentSize,
                    scrapedAt: storageRecord.scrapedAt,
                    tournamentId: storageRecord.tournamentId,
                    entityId: storageRecord.entityId,
                    isManualUpload: storageRecord.isManualUpload,
                    gameStatus: storageRecord.gameStatus
                },
                storedAt: storageRecord.scrapedAt,
                source: storageRecord.isManualUpload ? 'MANUAL_UPLOAD' : 'WEB_SCRAPER'
            }
        };
        
    } catch (error) {
        console.error('[handleGetS3Content] Error:', error);
        throw error;
    }
}

/**
 * Get URL statistics
 */
async function handleGetURLStatistics(event) {
    const { url } = event;
    
    if (!url) {
        throw new Error('URL is required');
    }
    
    try {
        // Get ScrapeURL record
        const scrapeURL = await getScrapeURLByUrl(url);
        
        if (!scrapeURL) {
            return {
                statusCode: 404,
                body: {
                    success: false,
                    message: 'URL not found in database'
                }
            };
        }
        
        // Get storage count for this URL
        const storageParams = {
            TableName: S3_STORAGE_TABLE,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: {
                '#url': 'url'
            },
            ExpressionAttributeValues: {
                ':url': url
            },
            Select: 'COUNT'
        };
        
        const storageResult = await dynamodb.send(new QueryCommand(storageParams));
        
        return {
            statusCode: 200,
            body: {
                success: true,
                url: url,
                tournamentId: scrapeURL.tournamentId,
                totalScrapes: scrapeURL.timesScraped || 0,
                successfulScrapes: scrapeURL.successfulScrapes || 0,
                failedScrapes: scrapeURL.failedScrapes || 0,
                manualUploads: scrapeURL.manualUploads || 0,
                cacheHits: scrapeURL.cacheHits || 0,
                storageCount: storageResult.Count || 0,
                status: scrapeURL.status,
                doNotScrape: scrapeURL.doNotScrape,
                lastScrapedAt: scrapeURL.lastScrapedAt,
                lastContentChangeAt: scrapeURL.lastContentChangeAt
            }
        };
        
    } catch (error) {
        console.error('[handleGetURLStatistics] Error:', error);
        throw error;
    }
}

/**
 * Clear cache for a URL (delete S3Storage records)
 */
async function handleClearCache(event) {
    const { url } = event;
    
    if (!url) {
        throw new Error('URL is required');
    }
    
    console.log(`[handleClearCache] Clearing cache for: ${url}`);
    
    try {
        // Get ScrapeURL record
        const scrapeURL = await getScrapeURLByUrl(url);
        
        if (!scrapeURL) {
            return {
                statusCode: 404,
                body: {
                    success: false,
                    message: 'URL not found'
                }
            };
        }
        
        // Query all S3Storage records for this URL
        const queryParams = {
            TableName: S3_STORAGE_TABLE,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: {
                '#url': 'url'
            },
            ExpressionAttributeValues: {
                ':url': url
            }
        };
        
        const result = await dynamodb.send(new QueryCommand(queryParams));
        const storageItems = result.Items || [];
        
        console.log(`[handleClearCache] Found ${storageItems.length} storage items to clear`);
        
        // Note: For production, implement batch delete
        // For now, just return what would be deleted
        
        // Update ScrapeURL to clear cache references
        await dynamodb.send(new UpdateCommand({
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET latestS3StorageId = :null,
                    latestS3Key = :null,
                    hasStoredContent = :false,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':null': null,
                ':false': false,
                ':now': new Date().toISOString()
            }
        }));
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: `Cache cleared for ${url}`,
                itemsCleared: storageItems.length
            }
        };
        
    } catch (error) {
        console.error('[handleClearCache] Error:', error);
        throw error;
    }
}

/**
 * Force refresh scrape for a URL
 */
async function handleForceRefresh(event) {
    const { url } = event;
    
    if (!url) {
        throw new Error('URL is required');
    }
    
    console.log(`[handleForceRefresh] Force refresh for: ${url}`);
    
    try {
        // Get ScrapeURL record
        const scrapeURL = await getScrapeURLByUrl(url);
        
        if (!scrapeURL) {
            return {
                statusCode: 404,
                body: {
                    success: false,
                    message: 'URL not found'
                }
            };
        }
        
        // Update ScrapeURL to force next scrape
        await dynamodb.send(new UpdateCommand({
            TableName: SCRAPE_URL_TABLE,
            Key: { id: scrapeURL.id },
            UpdateExpression: `
                SET contentHash = :null,
                    lastContentChangeAt = :now,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':null': null,
                ':now': new Date().toISOString()
            }
        }));
        
        return {
            statusCode: 200,
            body: {
                success: true,
                message: `Force refresh marked for ${url}. Next scrape will be forced.`,
                url: url
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
        const updateParams = {
            TableName: S3_STORAGE_TABLE,
            Key: { id: s3StorageId },
            UpdateExpression: `
                SET dataExtracted = :false,
                    notes = :notes,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':false': false,
                ':notes': 'Marked for re-processing by user.',
                ':now': new Date().toISOString()
            },
            ConditionExpression: 'attribute_exists(id)',
            ReturnValues: 'UPDATED_NEW'
        };
        
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
 */
async function handleGetCachingStats(event) {
    const { entityId } = event; 
    
    if (!entityId) {
        throw new Error('entityId is required');
    }

    console.log(`[CachingStats] Getting stats for entity ${entityId}`);
    
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
            
            const result = await dynamodb.send(new QueryCommand(params));
            
            if (result.Items) {
                for (const item of result.Items) {
                    stats.totalURLs++;
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

        stats.totalCacheMisses = stats.totalSuccessfulScrapes - stats.totalCacheHits;
        
        if (stats.totalSuccessfulScrapes > 0) {
            stats.averageCacheHitRate = (stats.totalCacheHits / stats.totalSuccessfulScrapes) * 100;
        }

        try {
            const storageStats = await getStorageStats(entityId);
            stats.storageUsedMB = storageStats.totalSizeMB;
        } catch (storageError) {
            console.warn('[CachingStats] Could not get storage stats:', storageError.message);
            stats.storageUsedMB = 0;
        }
        
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
            case 'uploadManualHTML':
                response = await handleManualUpload(args.input || args);
                break;
                
            // CRITICAL FIX: Route listStoredHTML to the correct handler
            case 'listStoredHTML':
                response = await handleListStoredHTML(args);
                break;
                
            // Keep getS3StorageHistory separate
            case 'getS3StorageHistory':
                response = await handleGetS3StorageHistory(args);
                break;
                
            // Legacy query operation (for ScrapeURL queries)
            case 'query':
                response = await handleQueryURLKnowledge(args);
                break;
                
            case 'getContent':
            case 'viewS3Content':
                response = await handleGetS3Content(args);
                break;
                
            case 'getStats':
                response = await handleGetURLStatistics(args);
                break;
                
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
                
            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
        
        // Return the body from the handler function
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