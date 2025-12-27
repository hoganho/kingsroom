// s3-management-unified.js
// Complete S3 management Lambda with unified ScrapeURL approach
// and restored operational functions.
// REFACTORED FOR AWS SDK V3
// FIX: Added proper handleListStoredHTML function
// MONITORING: Added LambdaMonitoring integration

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// --- AWS Clients (SDK v3) ---
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');

// Initialize v3 S3 Client
const s3 = new S3Client({});

// Initialize v3 DynamoDB Document Client with monitoring
const ddbClient = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Lambda Monitoring Initialization ---
const monitoring = new LambdaMonitoring('s3ManagementFunction', null);
const dynamodb = monitoring.wrapDynamoDBClient(originalDdbDocClient);

// --- DynamoDB Table Constants ---
const SCRAPE_URL_TABLE = process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME || process.env.SCRAPE_URL_TABLE || 'ScrapeURL-prod';
const S3_STORAGE_TABLE = process.env.API_KINGSROOM_S3STORAGETABLE_NAME || process.env.S3_STORAGE_TABLE || 'S3Storage-prod';

// --- S3 Bucket Constant ---
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
    
    monitoring.trackOperation('QUERY_BY_URL', 'ScrapeURL', null, { url });
    
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
    
    monitoring.trackOperation('CREATE_SCRAPEURL', 'ScrapeURL', null, { 
        url, 
        entityId, 
        tournamentId,
        source: 'MANUAL_UPLOAD'
    });
    
    // Create new ScrapeURL record for manual upload
    const now = new Date().toISOString();
    const newRecord = {
        id: uuidv4(),
        url,
        tournamentId,
        entityId,
        lastInteractionType: 'MANUAL_UPLOAD',
        lastInteractionAt: now,
        hasStoredContent: false,
        status: 'ACTIVE',
        doNotScrape: false,
        isActive: true,
        totalInteractions: 1,
        successfulScrapes: 0,
        failedScrapes: 0,
        manualUploads: 1,
        contentChangeCount: 0,
        cacheHits: 0,
        hasEtag: false,
        hasLastModified: false,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeURL'
    };
    
    await dynamodb.send(new PutCommand({
        TableName: SCRAPE_URL_TABLE,
        Item: newRecord
    }));
    
    console.log(`[Manual Upload] Created new ScrapeURL record: ${newRecord.id}`);
    return newRecord;
}

/**
 * Get storage statistics (STUB)
 */
async function getStorageStats(entityId) {
    console.warn(`[getStorageStats] STUB FUNCTION for ${entityId}. Implement real logic.`);
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

    // Set entity for monitoring context
    if (entityId) monitoring.entityId = entityId;

    monitoring.trackOperation('MANUAL_UPLOAD_START', 'S3Storage', null, {
        entityId,
        sourceUrl,
        fileName
    });

    const tournamentId = providedTournamentId || extractTournamentId(sourceUrl);
    const contentHash = calculateContentHash(fileContent);
    const metadata = extractMetadata(fileContent);
    const now = new Date().toISOString();

    try {
        // 1. Get or create ScrapeURL record
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
            monitoring.trackOperation('MANUAL_UPLOAD_DUPLICATE', 'S3Storage', existingStorage.id, {
                entityId,
                contentHash
            });
            return {
                statusCode: 200,
                body: { success: true, message: 'Duplicate content, no update needed.' }
            };
        }

        // 4. Upload NEW content to S3
        const timestamp = now.replace(/[:.]/g, '-');
        const s3Key = `manual/${entityId}/${tournamentId}/${timestamp}${fileName ? `-${fileName}` : '.html'}`;
        
        monitoring.trackOperation('S3_UPLOAD', 'S3', s3Key, {
            entityId,
            tournamentId,
            contentSize: Buffer.byteLength(fileContent, 'utf8')
        });

        await s3.send(new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'text/html',
            Metadata: {
                entityid: entityId || '',
                tournamentid: String(tournamentId),
                uploadedby: uploadedBy || '',
                contenthash: contentHash
            }
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
            id: scrapeURL.latestS3StorageId || uuidv4(),
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

        monitoring.trackOperation(existingStorage ? 'S3STORAGE_UPDATE' : 'S3STORAGE_CREATE', 'S3Storage', s3StorageItem.id, {
            entityId,
            tournamentId,
            s3Key
        });

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

        monitoring.trackOperation('MANUAL_UPLOAD_COMPLETE', 'S3Storage', s3StorageItem.id, {
            entityId,
            versionsStored: updatedHistory.length + 1
        });

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
        monitoring.trackOperation('MANUAL_UPLOAD_ERROR', 'S3Storage', null, {
            entityId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Handle listStoredHTML query
 */
async function handleListStoredHTML(event) {
    const { url, limit = 10 } = event;
    
    if (!url) {
        throw new Error('URL is required for listStoredHTML');
    }
    
    console.log(`[listStoredHTML] Querying S3Storage for URL: ${url}, limit: ${limit}`);
    
    monitoring.trackOperation('LIST_STORED_HTML', 'S3Storage', null, { url, limit });
    
    try {
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
            ScanIndexForward: false,
            Limit: limit || 10
        };
        
        const result = await dynamodb.send(new QueryCommand(queryParams));
        
        console.log(`[listStoredHTML] Found ${result.Items?.length || 0} items`);
        
        const items = (result.Items || []).map(item => ({
            ...item,
            s3Key: item.s3Key || '',
            scrapedAt: item.scrapedAt || new Date().toISOString(),
            s3Bucket: item.s3Bucket || S3_BUCKET,
            entityId: item.entityId || '',
            tournamentId: item.tournamentId || 0,
            url: item.url || url
        }));
        
        return {
            statusCode: 200,
            body: {
                items: items,
                nextToken: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
            }
        };
        
    } catch (error) {
        console.error('[listStoredHTML] Error:', error);
        monitoring.trackOperation('LIST_STORED_HTML_ERROR', 'S3Storage', null, { url, error: error.message });
        throw error;
    }
}

/**
 * Handle getS3StorageHistory query
 */
async function handleGetS3StorageHistory(event) {
    const { tournamentId, entityId, limit = 10 } = event;
    
    if (!tournamentId || !entityId) {
        throw new Error('Both tournamentId and entityId are required for getS3StorageHistory');
    }
    
    console.log(`[getS3StorageHistory] Query for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    if (entityId) monitoring.entityId = entityId;
    monitoring.trackOperation('GET_STORAGE_HISTORY', 'S3Storage', null, { tournamentId, entityId });
    
    try {
        const queryParams = {
            TableName: S3_STORAGE_TABLE,
            IndexName: 'byEntity',
            KeyConditionExpression: 'entityId = :eid',
            FilterExpression: 'tournamentId = :tid',
            ExpressionAttributeValues: {
                ':eid': entityId,
                ':tid': tournamentId
            },
            ScanIndexForward: false,
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
        monitoring.trackOperation('GET_STORAGE_HISTORY_ERROR', 'S3Storage', null, { error: error.message });
        throw error;
    }
}

/**
 * Query URL knowledge from ScrapeURL table
 */
async function handleQueryURLKnowledge(event) {
    const { 
        url,
        tournamentId,
        entityId,
        includeStorageHistory = false,
        limit = 10
    } = event;
    
    if (entityId) monitoring.entityId = entityId;
    monitoring.trackOperation('QUERY_URL_KNOWLEDGE', 'ScrapeURL', null, { url, tournamentId, entityId });
    
    try {
        let scrapeURLs = [];
        
        if (url) {
            const scrapeURL = await getScrapeURLByUrl(url);
            if (scrapeURL) {
                scrapeURLs = [scrapeURL];
            }
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
        } else if (entityId) {
            const queryParams = {
                TableName: SCRAPE_URL_TABLE,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :eid',
                ExpressionAttributeValues: {
                    ':eid': entityId
                },
                ScanIndexForward: false,
                Limit: limit
            };
            
            const result = await dynamodb.send(new QueryCommand(queryParams));
            scrapeURLs = result.Items || [];
        } else {
            throw new Error('Must provide url, tournamentId, or entityId');
        }
        
        if (includeStorageHistory && scrapeURLs.length > 0) {
            for (const scrapeURL of scrapeURLs) {
                const storageParams = {
                    TableName: S3_STORAGE_TABLE,
                    IndexName: 'byScrapeURL',
                    KeyConditionExpression: 'scrapeURLId = :suid',
                    ExpressionAttributeValues: {
                        ':suid': scrapeURL.id
                    },
                    ScanIndexForward: false,
                    Limit: 5
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
        monitoring.trackOperation('QUERY_URL_KNOWLEDGE_ERROR', 'ScrapeURL', null, { error: error.message });
        throw error;
    }
}

/**
 * Get S3 content by storage ID or S3 Key
 */
async function handleGetS3Content(event) {
    const { s3StorageId, s3Key } = event;
    
    monitoring.trackOperation('GET_S3_CONTENT', 'S3Storage', s3StorageId || s3Key, { s3StorageId, s3Key });
    
    try {
        let storageRecord;
        
        if (s3StorageId) {
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
            
            const result = await dynamodb.send(new QueryCommand(queryParams));
            storageRecord = result.Items?.[0];
        } else {
            throw new Error('Either s3StorageId or s3Key is required');
        }
        
        if (!storageRecord) {
            throw new Error('Storage record not found');
        }
        
        monitoring.trackOperation('S3_GET', 'S3', storageRecord.s3Key, { 
            entityId: storageRecord.entityId 
        });
        
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
        monitoring.trackOperation('GET_S3_CONTENT_ERROR', 'S3Storage', s3StorageId || s3Key, { error: error.message });
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
    
    monitoring.trackOperation('GET_URL_STATS', 'ScrapeURL', null, { url });
    
    try {
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
        monitoring.trackOperation('GET_URL_STATS_ERROR', 'ScrapeURL', null, { url, error: error.message });
        throw error;
    }
}

/**
 * Clear cache for a URL
 */
async function handleClearCache(event) {
    const { url } = event;
    
    if (!url) {
        throw new Error('URL is required');
    }
    
    console.log(`[handleClearCache] Clearing cache for: ${url}`);
    monitoring.trackOperation('CLEAR_CACHE_START', 'ScrapeURL', null, { url });
    
    try {
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
        
        monitoring.trackOperation('CLEAR_CACHE_COMPLETE', 'ScrapeURL', scrapeURL.id, { 
            url, 
            itemsCleared: storageItems.length 
        });
        
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
        monitoring.trackOperation('CLEAR_CACHE_ERROR', 'ScrapeURL', null, { url, error: error.message });
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
    monitoring.trackOperation('FORCE_REFRESH_START', 'ScrapeURL', null, { url });
    
    try {
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
        
        monitoring.trackOperation('FORCE_REFRESH_COMPLETE', 'ScrapeURL', scrapeURL.id, { url });
        
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
        monitoring.trackOperation('FORCE_REFRESH_ERROR', 'ScrapeURL', null, { url, error: error.message });
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
    monitoring.trackOperation('MARK_REPROCESS_START', 'S3Storage', s3StorageId);
    
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
        monitoring.trackOperation('MARK_REPROCESS_COMPLETE', 'S3Storage', s3StorageId);
        
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
        monitoring.trackOperation('MARK_REPROCESS_ERROR', 'S3Storage', s3StorageId, { error: error.message });
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
    monitoring.entityId = entityId;
    monitoring.trackOperation('GET_CACHING_STATS_START', 'ScrapeURL', null, { entityId });
    
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
        
        monitoring.trackOperation('GET_CACHING_STATS_COMPLETE', 'ScrapeURL', null, { 
            entityId, 
            totalURLs: stats.totalURLs 
        });
        
        return {
            statusCode: 200,
            body: {
                success: true,
                ...stats
            }
        };

    } catch (error) {
        console.error('[CachingStats] Error:', error);
        monitoring.trackOperation('GET_CACHING_STATS_ERROR', 'ScrapeURL', null, { entityId, error: error.message });
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
    
    const operation = event.operation || event.fieldName;
    const args = event.arguments || event;
    
    monitoring.trackOperation('HANDLER_START', 'Handler', operation, { operation });
    
    try {
        let response;
        switch (operation) {
            case 'upload':
            case 'uploadManualHTML':
                response = await handleManualUpload(args.input || args);
                break;
                
            case 'listStoredHTML':
                response = await handleListStoredHTML(args);
                break;
                
            case 'getS3StorageHistory':
                response = await handleGetS3StorageHistory(args);
                break;
                
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
        
        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', operation, { success: true });
        
        return response.body || response;
        
    } catch (error) {
        console.error('[S3Management] Error:', error);
        
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', operation, { 
            error: error.message,
            operation 
        });
        
        if (event.fieldName) {
            throw error;
        }
        
        return {
            statusCode: 500,
            body: {
                success: false,
                error: error.message,
                stack: error.stack
            }
        };
    } finally {
        // Always flush metrics before Lambda exits
        console.log('[S3Management] Flushing monitoring metrics...');
        await monitoring.flush();
        console.log('[S3Management] Monitoring flush complete.');
    }
};