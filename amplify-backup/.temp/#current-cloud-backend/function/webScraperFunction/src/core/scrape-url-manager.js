/**
 * ===================================================================
 * ScrapeURL Manager
 * ===================================================================
 * 
 * Manages ScrapeURL records - tracking what URLs have been scraped,
 * their status, and caching metadata.
 * 
 * ===================================================================
 */

const { GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { getTableName } = require('../config/tables');
const { INTERACTION_TO_SCRAPE_STATUS } = require('../config/constants');

/**
 * Get or create a ScrapeURL record
 * 
 * @param {string} url - Tournament URL
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {object} context - Shared context with ddbDocClient
 * @returns {object} ScrapeURL record
 */
const getScrapeURL = async (url, entityId, tournamentId, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    
    try {
        // Try to get existing record (URL is the primary key)
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: scrapeURLTable,
            Key: { id: url }
        }));
        
        if (getResult.Item) {
            return getResult.Item;
        }
        
        // Create new record if doesn't exist
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        const newRecord = {
            id: url,
            url,
            tournamentId: parseInt(tournamentId, 10),
            entityId,
            status: 'ACTIVE',
            doNotScrape: false,
            placedIntoDatabase: false,
            firstScrapedAt: now,
            lastScrapedAt: now,
            timesScraped: 0,
            timesSuccessful: 0,
            timesFailed: 0,
            consecutiveFailures: 0,
            sourceSystem: 'KINGSROOM_WEB',
            s3StorageEnabled: true,
            createdAt: now,
            updatedAt: now,
            __typename: 'ScrapeURL',
            _version: 1,
            _lastChangedAt: timestamp,
            _deleted: null
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scrapeURLTable,
            Item: newRecord,
            ConditionExpression: 'attribute_not_exists(id)'
        }));
        
        console.log(`[ScrapeURLManager] Created new ScrapeURL record for ${url}`);
        return newRecord;
        
    } catch (error) {
        // If conditional check failed, record was created by another process
        if (error.name === 'ConditionalCheckFailedException') {
            const getResult = await ddbDocClient.send(new GetCommand({
                TableName: scrapeURLTable,
                Key: { id: url }
            }));
            return getResult.Item;
        }
        
        console.error('[ScrapeURLManager] Error getting/creating ScrapeURL:', error);
        
        // Return minimal record to allow operation to continue
        return {
            id: url,
            url,
            tournamentId: parseInt(tournamentId, 10),
            entityId,
            s3StorageEnabled: false,
            doNotScrape: false
        };
    }
};

/**
 * Update a ScrapeURL record
 * 
 * @param {string} scrapeURLId - ScrapeURL record ID (URL)
 * @param {object} updates - Fields to update
 * @param {object} context - Shared context with ddbDocClient
 */
const updateScrapeURLRecord = async (scrapeURLId, updates, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    // Build update expression dynamically
    const updateParts = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.entries(updates).forEach(([key, value]) => {
        // Skip internal fields that need special handling
        if (key === '_lastChangedAt' || key === '_version') return;
        
        const attrName = `#${key}`;
        const attrValue = `:${key}`;
        
        // Handle reserved words
        if (['status', 'name', 'source'].includes(key)) {
            expressionAttributeNames[attrName] = key;
            updateParts.push(`${attrName} = ${attrValue}`);
        } else {
            updateParts.push(`${key} = ${attrValue}`);
        }
        
        expressionAttributeValues[attrValue] = value;
    });
    
    // Always update timestamps
    updateParts.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = now.getTime();
    
    updateParts.push('#v = if_not_exists(#v, :zero) + :one');
    expressionAttributeNames['#v'] = '_version';
    expressionAttributeValues[':zero'] = 0;
    expressionAttributeValues[':one'] = 1;
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: scrapeURLId },
            UpdateExpression: `SET ${updateParts.join(', ')}`,
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 
                ? expressionAttributeNames 
                : undefined,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[ScrapeURLManager] Updated ScrapeURL ${scrapeURLId}`);
        
    } catch (error) {
        console.error(`[ScrapeURLManager] Failed to update ScrapeURL:`, error);
        throw error;
    }
};

/**
 * Update ScrapeURL with error information
 * 
 * @param {string} scrapeURLId - ScrapeURL record ID
 * @param {string} errorMessage - Error message
 * @param {object} context - Shared context
 */
const updateScrapeURLError = async (scrapeURLId, errorMessage, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: scrapeURLId },
            UpdateExpression: `
                SET lastScrapeStatus = :errorStatus,
                    lastErrorMessage = :error,
                    lastErrorAt = :now,
                    consecutiveFailures = if_not_exists(consecutiveFailures, :zero) + :one,
                    timesFailed = if_not_exists(timesFailed, :zero) + :one,
                    updatedAt = :now,
                    #lca = :timestamp,
                    #v = if_not_exists(#v, :zero) + :one
            `,
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ':errorStatus': 'ERROR',
                ':error': errorMessage,
                ':now': now.toISOString(),
                ':timestamp': now.getTime(),
                ':zero': 0,
                ':one': 1
            }
        }));
        
        console.log(`[ScrapeURLManager] Updated error for ${scrapeURLId}`);
        
    } catch (error) {
        console.warn(`[ScrapeURLManager] Failed to update error:`, error.message);
    }
};

/**
 * Update doNotScrape flag
 * 
 * @param {string} url - URL to update
 * @param {boolean} doNotScrape - Flag value
 * @param {string} reason - Reason for flag (e.g., game status)
 * @param {object} context - Shared context
 */
const updateScrapeURLDoNotScrape = async (url, doNotScrape, reason, context) => {
    const { ddbDocClient } = context;
    const scrapeURLTable = getTableName('ScrapeURL');
    const now = new Date();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: url },
            UpdateExpression: `
                SET doNotScrape = :doNotScrape,
                    doNotScrapeReason = :reason,
                    doNotScrapeSetAt = :now,
                    updatedAt = :now,
                    #lca = :timestamp,
                    #v = if_not_exists(#v, :zero) + :one
            `,
            ExpressionAttributeNames: {
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ':doNotScrape': doNotScrape,
                ':reason': reason || null,
                ':now': now.toISOString(),
                ':timestamp': now.getTime(),
                ':zero': 0,
                ':one': 1
            }
        }));
        
        console.log(`[ScrapeURLManager] Set doNotScrape=${doNotScrape} for ${url} (${reason})`);
        
    } catch (error) {
        console.warn(`[ScrapeURLManager] Failed to update doNotScrape:`, error.message);
    }
};

/**
 * Build scrape updates object from HTML content
 * Centralizes logic for creating update parameters
 * 
 * @param {string} html - HTML content
 * @param {object} headers - HTTP headers
 * @param {string} status - Scrape status (SUCCESS, FAILED, etc.)
 * @param {string} interactionType - Interaction type
 * @param {string} s3Key - S3 key if stored
 * @returns {object} Updates object and extracted metadata
 */
const buildScrapeUpdates = (html, headers, status, interactionType, s3Key = null) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Build updates object
    const updates = {
        lastInteractionType: interactionType,
        lastInteractionAt: now,
        lastScrapedAt: now,
        lastScrapeStatus: status,
        updatedAt: now,
        _lastChangedAt: timestamp
    };
    
    if (status === 'SUCCESS') {
        updates.lastSuccessfulScrapeAt = now;
        updates.consecutiveFailures = 0;
        updates.timesSuccessful = 1; // Will be incremented
    }
    
    if (s3Key) {
        updates.latestS3Key = s3Key;
    }
    
    // Extract game status from HTML if available
    let gameStatus = null;
    let registrationStatus = null;
    
    if (html && status === 'SUCCESS') {
        try {
            // Import here to avoid circular dependency
            const { getStatusAndReg } = require('../parse/html-parser');
            const statusResult = getStatusAndReg(html);
            gameStatus = statusResult.gameStatus || null;
            registrationStatus = statusResult.registrationStatus || null;
            
            if (gameStatus) updates.gameStatus = gameStatus;
            if (registrationStatus) updates.registrationStatus = registrationStatus;
        } catch (error) {
            // Status extraction is optional
            console.log('[ScrapeURLManager] Could not extract status from HTML');
        }
    }
    
    return { updates, gameStatus, registrationStatus };
};

/**
 * Map interaction type to legacy scrape status
 */
const mapInteractionTypeToScrapeStatus = (interactionType) => {
    return INTERACTION_TO_SCRAPE_STATUS[interactionType] || null;
};

module.exports = {
    getScrapeURL,
    updateScrapeURLRecord,
    updateScrapeURLError,
    updateScrapeURLDoNotScrape,
    buildScrapeUpdates,
    mapInteractionTypeToScrapeStatus
};
