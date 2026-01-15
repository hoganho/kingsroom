/**
 * ===================================================================
 * S3Storage Manager
 * ===================================================================
 * * Manages S3Storage DynamoDB records - tracking metadata about
 * stored HTML files, their parse status, and version history.
 * * ===================================================================
 */

const { UpdateCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getTableName } = require('../config/tables');
const { S3_BUCKET } = require('../config/constants');

/**
 * Calculate content hash for deduplication
 */
const calculateContentHash = (content) => {
    return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * Remove undefined AND null values from object (prevents DynamoDB errors)
 * UPDATED: Now also removes nulls to prevent "Type mismatch" on String indexes
 */
const removeUndefinedValues = (obj) => {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
            acc[key] = value;
        }
        return acc;
    }, {});
};

/**
 * Get existing S3Storage record by scrapeURLId or URL
 * * @param {string} scrapeURLId - ScrapeURL record ID
 * @param {string} url - URL for fallback lookup
 * @param {object} context - Shared context with ddbDocClient
 * @returns {object|null} Existing record or null
 */
const getExistingS3StorageRecord = async (scrapeURLId, url, context) => {
    const { ddbDocClient } = context;
    const s3StorageTable = getTableName('S3Storage');
    
    // FIX: Removed broken 'byScrapeURLId' query that was causing errors
    
    // Fallback to URL lookup
    if (url) {
        try {
            const result = await ddbDocClient.send(new QueryCommand({
                TableName: s3StorageTable,
                IndexName: 'byURL',
                KeyConditionExpression: '#url = :url',
                ExpressionAttributeNames: { '#url': 'url' },
                ExpressionAttributeValues: { ':url': url },
                Limit: 1
            }));
            
            if (result.Items && result.Items.length > 0) {
                return result.Items[0];
            }
        } catch (error) {
            console.warn(`[S3StorageManager] Error querying by URL:`, error.message);
        }
    }
    
    return null;
};

/**
 * Upsert S3Storage record
 * Creates new or updates existing record with version history
 */
const upsertS3StorageRecord = async (params, context) => {
    const {
        scrapeURLId,
        s3Key,
        html,
        url,
        entityId,
        tournamentId,
        headers = {},
        contentHash: providedHash,
        gameStatus = null,
        registrationStatus = null,
        options = {}
    } = params;
    
    const { ddbDocClient } = context;
    const { skipUpdate = false, contentDefinitelyChanged = false } = options;
    
    if (skipUpdate) {
        console.log(`[S3StorageManager] Skipping upsert - cache hit`);
        return null;
    }
    
    const s3StorageTable = getTableName('S3Storage');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const contentHash = providedHash || calculateContentHash(html);
    const contentSize = Buffer.byteLength(html, 'utf8');
    
    const existingRecord = await getExistingS3StorageRecord(scrapeURLId, url, context);
    
    if (existingRecord) {
        // UPDATE EXISTING RECORD
        console.log(`[S3StorageManager] Updating existing record: ${existingRecord.id}`);
        
        if (existingRecord.s3Key === s3Key) {
            console.log(`[S3StorageManager] Same s3Key - skipping update`);
            return existingRecord.id;
        }
        
        if (!contentDefinitelyChanged) {
            if (existingRecord.contentHash === contentHash) {
                console.log(`[S3StorageManager] Content unchanged (hash match) - skipping`);
                return existingRecord.id;
            }
            if (!existingRecord.contentHash && contentSize === existingRecord.contentSize) {
                console.log(`[S3StorageManager] Content likely unchanged (same size) - skipping`);
                return existingRecord.id;
            }
        }
        
        console.log(`[S3StorageManager] Content changed - creating new version`, {
            oldHash: existingRecord.contentHash || 'NULL',
            newHash: contentHash
        });
        
        const previousVersion = removeUndefinedValues({
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
        });
        
        const previousVersions = existingRecord.previousVersions || [];
        previousVersions.push(previousVersion);
        const newVersionNumber = (existingRecord.versionNumber || 1) + 1;
        
        // FIX: Build dynamic update expression to avoid sending NULL values for indexed fields
        const updateExpressions = [
            's3Key = :s3Key',
            's3Bucket = :s3Bucket',
            'contentHash = :contentHash',
            'contentSize = :contentSize',
            'httpStatus = :httpStatus',
            'etag = :etag',
            'lastModified = :lastModified',
            'headers = :headers',
            'scrapedAt = :scrapedAt',
            'storedAt = :storedAt',
            'updatedAt = :updatedAt',
            'previousVersions = :previousVersions',
            'versionNumber = :versionNumber',
            'totalVersions = :totalVersions',
            'entityTournamentKey = :entityTournamentKey',
            '#lca = :timestamp',
            '#v = if_not_exists(#v, :zero) + :one'
        ];

        const updateValues = {
            ':s3Key': s3Key,
            ':s3Bucket': S3_BUCKET,
            ':contentHash': contentHash,
            ':contentSize': contentSize,
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
            ':entityTournamentKey': `${entityId}#${tournamentId}`,
            ':timestamp': timestamp,
            ':zero': 0,
            ':one': 1
        };

        // Only update status fields if they have values (prevent NULL on String Index)
        if (gameStatus) {
            updateExpressions.push('gameStatus = :gameStatus');
            updateValues[':gameStatus'] = gameStatus;
        } else {
            // If it's null/undefined, we might want to REMOVE it from the record
            // But usually we just leave the old value or don't set it. 
            // For now, let's just not set it if it's null.
        }

        if (registrationStatus) {
            updateExpressions.push('registrationStatus = :registrationStatus');
            updateValues[':registrationStatus'] = registrationStatus;
        }

        await ddbDocClient.send(new UpdateCommand({
            TableName: s3StorageTable,
            Key: { id: existingRecord.id },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: updateValues
        }));
        
        console.log(`[S3StorageManager] ✅ Updated to version ${newVersionNumber}`);
        return existingRecord.id;
        
    } else {
        // CREATE NEW RECORD
        console.log(`[S3StorageManager] Creating new record for URL: ${url}`);
        
        const s3StorageId = uuidv4();
        
        // FIX: Use removeUndefinedValues to strip NULLs from new record
        const newRecord = removeUndefinedValues({
            id: s3StorageId,
            scrapeURLId,
            url,
            tournamentId,
            entityId,
            entityTournamentKey: `${entityId}#${tournamentId}`,
            s3Key,
            s3Bucket: S3_BUCKET,
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
            gameStatus, // Will be removed if null
            registrationStatus, // Will be removed if null
            isParsed: false,
            dataExtracted: false,
            wasGameCreated: false,
            wasGameUpdated: false,
            scrapedAt: now,
            storedAt: now,
            versionNumber: 1,
            totalVersions: 1,
            previousVersions: [],
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: timestamp,
            _version: 1,
            __typename: 'S3Storage'
        });
        
        await ddbDocClient.send(new PutCommand({
            TableName: s3StorageTable,
            Item: newRecord
        }));
        
        console.log(`[S3StorageManager] ✅ Created new record v1`);
        return s3StorageId;
    }
};

/**
 * Update ScrapeURL with S3Storage reference
 */
const updateScrapeURLWithS3StorageId = async (scrapeURLId, s3StorageId, s3Key, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
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
        }));
        
        console.log(`[S3StorageManager] Updated ScrapeURL with S3Storage reference`);
        
    } catch (error) {
        console.warn(`[S3StorageManager] Failed to update ScrapeURL:`, error.message);
    }
};

/**
 * Update S3Storage record with parsed data
 * Called after HTML is parsed to store metadata
 */
const updateS3StorageWithParsedData = async (s3Key, scrapedData, foundKeys, options, context) => {
    const { ddbDocClient } = context;
    const { isRescrape = false, url, tournamentId, entityId } = options;
    const s3StorageTable = getTableName('S3Storage');
    
    try {
        let queryResult = null;
        
        if (tournamentId && entityId) {
            try {
                const compositeKey = `${entityId}#${tournamentId}`;
                queryResult = await ddbDocClient.send(new QueryCommand({
                    TableName: s3StorageTable,
                    IndexName: 'byEntityTournament',
                    KeyConditionExpression: 'entityTournamentKey = :key',
                    ExpressionAttributeValues: {
                        ':key': compositeKey
                    },
                    Limit: 1
                }));
            } catch (gsiError) {
                console.warn(`[S3StorageManager] byEntityTournament GSI query failed:`, gsiError.message);
            }
        }
        
        if ((!queryResult?.Items || queryResult.Items.length === 0) && s3Key) {
            queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: s3StorageTable,
                IndexName: 'byS3Key',
                KeyConditionExpression: 's3Key = :key',
                ExpressionAttributeValues: { ':key': s3Key },
                Limit: 1
            }));
        }
        
        if (!queryResult?.Items || queryResult.Items.length === 0) {
            console.warn(`[S3StorageManager] No record found for parsed data update`);
            return { success: false, reason: 'Record not found' };
        }
        
        const existingRecord = queryResult.Items[0];
        
        const dataHash = calculateDataHash(scrapedData);
        const dataChanged = existingRecord.parsedDataHash !== dataHash;
        
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        let updateExpression = `
            SET isParsed = :isParsed,
                dataExtracted = :dataExtracted,
                parsedDataHash = :dataHash,
                extractedFields = :fields,
                lastParsedAt = :parsedAt,
                parseCount = if_not_exists(parseCount, :zero) + :one,
                updatedAt = :updatedAt,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
        `;
        
        const updateValues = {
            ':isParsed': true,
            ':dataExtracted': dataChanged,
            ':dataHash': dataHash,
            ':fields': getExtractedFields(scrapedData, foundKeys),
            ':parsedAt': now,
            ':zero': 0,
            ':one': 1,
            ':updatedAt': now,
            ':timestamp': timestamp
        };
        
        // FIX: Only update status if value exists (prevent NULL on String Index)
        if (scrapedData.gameStatus) {
            updateExpression += `, gameStatus = :gameStatus`;
            updateValues[':gameStatus'] = scrapedData.gameStatus;
        }
        
        if (scrapedData.registrationStatus) {
            updateExpression += `, registrationStatus = :registrationStatus`;
            updateValues[':registrationStatus'] = scrapedData.registrationStatus;
        }
        
        if (isRescrape) {
            updateExpression += `, rescrapeCount = if_not_exists(rescrapeCount, :zero) + :one, lastRescrapeAt = :parsedAt`;
        }
        
        if (dataChanged) {
            updateExpression += `, dataChangedAt = :parsedAt, dataChangeCount = if_not_exists(dataChangeCount, :zero) + :one`;
        }
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: s3StorageTable,
            Key: { id: existingRecord.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: updateValues
        }));
        
        console.log(`[S3StorageManager] ✅ Updated with parsed data`, { dataChanged, isRescrape });
        
        return {
            success: true,
            dataChanged,
            dataHash,
            isRescrape
        };
        
    } catch (error) {
        console.error(`[S3StorageManager] Error updating with parsed data:`, error);
        throw error;
    }
};

/**
 * Calculate hash of parsed data for change detection
 */
const calculateDataHash = (scrapedData) => {
    const dataToHash = {
        tournamentId: scrapedData.tournamentId,
        name: scrapedData.name,
        gameStatus: scrapedData.gameStatus,
        registrationStatus: scrapedData.registrationStatus,
        buyIn: scrapedData.buyIn,
        rake: scrapedData.rake,
        prizepoolPaid: scrapedData.prizepoolPaid,
        totalUniquePlayers: scrapedData.totalUniquePlayers,
        totalInitialEntries: scrapedData.totalInitialEntries,
        totalEntries: scrapedData.totalEntries,
        gameStartDateTime: scrapedData.gameStartDateTime
    };
    
    const jsonString = JSON.stringify(dataToHash, Object.keys(dataToHash).sort());
    return crypto.createHash('sha256').update(jsonString).digest('hex').substring(0, 16);
};

/**
 * Get list of fields successfully extracted
 */
const getExtractedFields = (scrapedData, foundKeys) => {
    const fields = [];
    
    if (scrapedData.name) fields.push('name');
    if (scrapedData.gameStatus) fields.push('gameStatus');
    if (scrapedData.registrationStatus) fields.push('registrationStatus');
    if (scrapedData.buyIn != null) fields.push('buyIn');
    if (scrapedData.rake != null) fields.push('rake');
    if (scrapedData.prizepoolPaid != null) fields.push('prizepoolPaid');
    if (scrapedData.totalUniquePlayers != null) fields.push('totalUniquePlayers');
    if (scrapedData.totalEntries != null) fields.push('totalEntries');
    if (scrapedData.gameStartDateTime) fields.push('gameStartDateTime');
    if (scrapedData.levels?.length > 0) fields.push('levels');
    if (scrapedData.results?.length > 0) fields.push('results');
    
    // Add foundKeys
    foundKeys?.forEach(key => {
        if (!fields.includes(key)) fields.push(key);
    });
    
    return fields;
};

module.exports = {
    getExistingS3StorageRecord,
    upsertS3StorageRecord,
    updateScrapeURLWithS3StorageId,
    updateS3StorageWithParsedData,
    calculateDataHash,
    getExtractedFields
};