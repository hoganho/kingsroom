/**
 * Update S3Storage Record with Parsed Data
 * 
 * This module handles updating S3Storage records with newly parsed data,
 * regardless of whether the HTML was fetched live or from S3 cache.
 * 
 * Key Concept: Scraper strategies evolve, so even old HTML can yield new data!
 */

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

/**
 * Calculate a hash of the parsed data to detect changes
 */
const calculateDataHash = (scrapedData) => {
    // Create a stable representation of the data
    const dataToHash = {
        tournamentId: scrapedData.tournamentId,
        name: scrapedData.name,
        gameStatus: scrapedData.gameStatus,
        registrationStatus: scrapedData.registrationStatus,
        buyIn: scrapedData.buyIn,
        rake: scrapedData.rake,
        prizepoolPaid: scrapedData.prizepoolPaid,
        totalUniquePlayers: scrapedData.totalUniquePlayers,
        totalEntries: scrapedData.totalEntries,
        playersRemaining: scrapedData.playersRemaining,
        gameStartDateTime: scrapedData.gameStartDateTime,
        gameEndDateTime: scrapedData.gameEndDateTime,
        levels: scrapedData.levels,
        results: scrapedData.results,
        // Add other key fields
        foundKeys: scrapedData.foundKeys || [],
        structureLabel: scrapedData.structureLabel
    };
    
    const jsonString = JSON.stringify(dataToHash, Object.keys(dataToHash).sort());
    return crypto.createHash('sha256').update(jsonString).digest('hex').substring(0, 16);
};

/**
 * Compare two data hashes to determine if data has changed
 */
const hasDataChanged = (existingHash, newHash) => {
    if (!existingHash) return true; // No existing hash = first parse
    return existingHash !== newHash;
};

/**
 * Get the fields that were successfully extracted from the scrape
 */
const getExtractedFields = (scrapedData, foundKeys) => {
    const fields = [];
    
    // Check which fields have non-null/non-empty values
    if (scrapedData.name) fields.push('name');
    if (scrapedData.gameStatus) fields.push('gameStatus');
    if (scrapedData.registrationStatus) fields.push('registrationStatus');
    if (scrapedData.buyIn != null) fields.push('buyIn');
    if (scrapedData.rake != null) fields.push('rake');
    if (scrapedData.prizepoolPaid != null) fields.push('prizepoolPaid');
    if (scrapedData.totalUniquePlayers != null) fields.push('totalUniquePlayers');
    if (scrapedData.totalEntries != null) fields.push('totalEntries');
    if (scrapedData.playersRemaining != null) fields.push('playersRemaining');
    if (scrapedData.gameStartDateTime) fields.push('gameStartDateTime');
    if (scrapedData.gameEndDateTime) fields.push('gameEndDateTime');
    if (scrapedData.levels && scrapedData.levels.length > 0) fields.push('levels');
    if (scrapedData.results && scrapedData.results.length > 0) fields.push('results');
    if (scrapedData.entries && scrapedData.entries.length > 0) fields.push('entries');
    if (scrapedData.seating && scrapedData.seating.length > 0) fields.push('seating');
    
    // Add foundKeys if provided
    if (foundKeys && foundKeys.length > 0) {
        foundKeys.forEach(key => {
            if (!fields.includes(key)) fields.push(key);
        });
    }
    
    return fields;
};

/**
 * Update S3Storage record with parsed data
 * 
 * @param {string} s3Key - S3 key of the HTML file (may not exist in DB yet if UPSERT failed)
 * @param {object} scrapedData - Parsed data from scraper
 * @param {array} foundKeys - Keys found during scraping
 * @param {object} ddbDocClient - DynamoDB client
 * @param {string} s3StorageTable - S3Storage table name
 * @param {boolean} isRescrape - Whether this is a re-scrape from cache
 * @param {string} url - URL of the tournament (for fallback lookup)
 * @param {number} tournamentId - Tournament ID (for primary lookup)
 * @param {string} entityId - Entity ID (for primary lookup)
 * @returns {object} Update result with dataChanged flag
 */
const updateS3StorageWithParsedData = async (
    s3Key,
    scrapedData,
    foundKeys,
    ddbDocClient,
    s3StorageTable,
    isRescrape = false,
    url = null,
    tournamentId = null,
    entityId = null
) => {
    try {
        console.log(`[updateS3StorageWithParsedData] Looking for S3Storage record:`, {
            tournamentId,
            entityId,
            s3Key: s3Key?.substring(s3Key.length - 50) // Last 50 chars for logging
        });
        
        const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
        let queryResult = null;
        
        // STRATEGY 1: Look up by tournamentId + entityId (most reliable)
        // This finds the current record regardless of which s3Key we're parsing
        if (tournamentId && entityId) {
            console.log(`[updateS3StorageWithParsedData] Strategy 1: Querying by tournamentId ${tournamentId} + entityId ${entityId}`);
            queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: s3StorageTable,
                IndexName: 'byTournamentId',
                KeyConditionExpression: 'tournamentId = :tid',
                FilterExpression: 'entityId = :eid',
                ExpressionAttributeValues: { 
                    ':tid': tournamentId,
                    ':eid': entityId
                },
                ScanIndexForward: false, // Most recent first
                Limit: 1
            }));
        }
        
        // STRATEGY 2: If not found by tournamentId+entityId, try s3Key
        if ((!queryResult?.Items || queryResult.Items.length === 0) && s3Key) {
            console.log(`[updateS3StorageWithParsedData] Strategy 2: Querying by s3Key`);
            queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: s3StorageTable,
                IndexName: 'byS3Key',
                KeyConditionExpression: 's3Key = :key',
                ExpressionAttributeValues: { ':key': s3Key },
                Limit: 1
            }));
        }
        
        // STRATEGY 3: If still not found, try URL as last resort
        if ((!queryResult?.Items || queryResult.Items.length === 0) && url) {
            console.log(`[updateS3StorageWithParsedData] Strategy 3: Querying by URL ${url}`);
            queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: s3StorageTable,
                IndexName: 'byURL',
                KeyConditionExpression: '#url = :url',
                ExpressionAttributeNames: { '#url': 'url' },
                ExpressionAttributeValues: { ':url': url },
                ScanIndexForward: false, // Most recent first
                Limit: 1
            }));
        }
        
        if (!queryResult?.Items || queryResult.Items.length === 0) {
            console.warn(`[updateS3StorageWithParsedData] No S3Storage record found using any strategy:`, {
                tournamentId,
                entityId,
                s3Key: s3Key?.substring(s3Key.length - 30),
                url
            });
            return { success: false, reason: 'Record not found' };
        }
        
        const existingRecord = queryResult.Items[0];
        console.log(`[updateS3StorageWithParsedData] Found record:`, {
            id: existingRecord.id,
            currentS3Key: existingRecord.s3Key?.substring(existingRecord.s3Key.length - 50),
            tournamentId: existingRecord.tournamentId
        });
        
        // 3. Calculate hash of newly parsed data
        const newDataHash = calculateDataHash(scrapedData);
        const existingDataHash = existingRecord.parsedDataHash;
        
        // 4. Determine if data has changed
        const dataChanged = hasDataChanged(existingDataHash, newDataHash);
        
        console.log(`[updateS3StorageWithParsedData] Data comparison:`, {
            existingHash: existingDataHash || 'none',
            newHash: newDataHash,
            dataChanged,
            isRescrape,
            recordId: existingRecord.id
        });
        
        // 5. Get extracted fields
        const extractedFields = getExtractedFields(scrapedData, foundKeys);
        
        // 6. Extract gameStatus and registrationStatus from scrapedData
        const gameStatus = scrapedData.gameStatus || null;
        const registrationStatus = scrapedData.registrationStatus || null;
        
        // 7. Update the record
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        // Build update expression dynamically
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
            ':dataExtracted': dataChanged, // Mark as extracted if data changed
            ':dataHash': newDataHash,
            ':fields': extractedFields,
            ':parsedAt': now,
            ':zero': 0,
            ':one': 1,
            ':updatedAt': now,
            ':timestamp': timestamp
        };
        
        // Add gameStatus if available
        if (gameStatus !== null) {
            updateExpression += `, gameStatus = :gameStatus`;
            updateValues[':gameStatus'] = gameStatus;
        }
        
        // Add registrationStatus if available
        if (registrationStatus !== null) {
            updateExpression += `, registrationStatus = :registrationStatus`;
            updateValues[':registrationStatus'] = registrationStatus;
        }
        
        // Add rescrape tracking if this is a re-scrape
        if (isRescrape) {
            updateExpression += `, rescrapeCount = if_not_exists(rescrapeCount, :zero) + :one,
                                  lastRescrapeAt = :parsedAt`;
        }
        
        // Add data change tracking
        if (dataChanged) {
            updateExpression += `, dataChangedAt = :parsedAt,
                                  dataChangeCount = if_not_exists(dataChangeCount, :zero) + :one`;
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
        
        console.log(`[updateS3StorageWithParsedData] ✅ Updated S3Storage record:`, {
            id: existingRecord.id,
            dataChanged,
            fieldsExtracted: extractedFields.length,
            gameStatus,
            registrationStatus,
            isRescrape
        });
        
        return {
            success: true,
            dataChanged,
            extractedFields,
            dataHash: newDataHash,
            gameStatus,
            registrationStatus,
            isRescrape
        };
        
    } catch (error) {
        console.error(`[updateS3StorageWithParsedData] Error:`, error);
        throw error;
    }
};

module.exports = {
    updateS3StorageWithParsedData,
    calculateDataHash,
    hasDataChanged,
    getExtractedFields
};