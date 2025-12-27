/**
 * ===================================================================
 * Structure Fingerprint
 * ===================================================================
 * 
 * Tracks HTML structure patterns to detect changes in website layout.
 * Generates fingerprints from found keys and structure labels.
 * 
 * REQUIRES: ScrapeStructure model with byFingerprint GSI on fingerprint field
 * 
 * ===================================================================
 */

const crypto = require('crypto');
const { QueryCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const { getTableName } = require('../config/tables');

/**
 * Generate a fingerprint from found keys
 * 
 * @param {array} foundKeys - Keys found during parsing
 * @returns {string} Fingerprint hash
 */
const generateFingerprint = (foundKeys) => {
    if (!foundKeys || foundKeys.length === 0) return 'empty';
    
    // Sort keys for consistent fingerprinting
    const sortedKeys = [...foundKeys].sort();
    const keyString = sortedKeys.join('|');
    
    return crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 16);
};

/**
 * Generate a structure label for quick identification
 * 
 * @param {object} scrapedData - Parsed data
 * @param {array} foundKeys - Keys found during parsing
 * @returns {string} Human-readable structure label
 */
const generateStructureLabel = (scrapedData, foundKeys) => {
    const parts = [];
    
    // Status indicator
    if (scrapedData.gameStatus) {
        parts.push(`STATUS:${scrapedData.gameStatus}`);
    }
    
    // Registration indicator
    if (scrapedData.registrationStatus) {
        parts.push(`REG:${scrapedData.registrationStatus}`);
    }
    
    // Key counts
    const hasResults = foundKeys.includes('results');
    const hasSeating = foundKeys.includes('seating');
    const hasLevels = foundKeys.includes('levels');
    const hasEntries = foundKeys.includes('entries');
    
    if (hasResults) parts.push('RESULTS');
    if (hasSeating) parts.push('SEATING');
    if (hasLevels) parts.push('LEVELS');
    if (hasEntries) parts.push('ENTRIES');
    
    return parts.join(' | ') || 'MINIMAL';
};

/**
 * Process and track structure fingerprint
 * Records new structures and updates counts for existing ones
 * 
 * @param {array} foundKeys - Keys found during parsing
 * @param {string} structureLabel - Structure label
 * @param {string} url - Source URL
 * @param {object} context - Shared context with ddbDocClient
 * @returns {object} { isNewStructure, fingerprint, structureId }
 */
const processStructureFingerprint = async (foundKeys, structureLabel, url, context) => {
    const { ddbDocClient } = context;
    const fingerprint = generateFingerprint(foundKeys);
    
    try {
        const scrapeStructureTable = getTableName('ScrapeStructure');
        
        // Query by fingerprint using GSI
        const queryResult = await ddbDocClient.send(new QueryCommand({
            TableName: scrapeStructureTable,
            IndexName: 'byFingerprint',
            KeyConditionExpression: 'fingerprint = :fp',
            ExpressionAttributeValues: { ':fp': fingerprint },
            Limit: 1
        }));
        
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            // Existing structure - update count
            const existingRecord = queryResult.Items[0];
            
            await ddbDocClient.send(new UpdateCommand({
                TableName: scrapeStructureTable,
                Key: { id: existingRecord.id },
                UpdateExpression: `
                    SET hitCount = if_not_exists(hitCount, :zero) + :one,
                        lastSeenAt = :now,
                        updatedAt = :now,
                        #lca = :timestamp
                `,
                ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
                ExpressionAttributeValues: {
                    ':zero': 0,
                    ':one': 1,
                    ':now': now,
                    ':timestamp': timestamp
                }
            }));
            
            return {
                isNewStructure: false,
                fingerprint,
                structureId: existingRecord.id,
                structureLabel: existingRecord.structureLabel
            };
        }
        
        // New structure - create record
        const structureId = randomUUID();
        
        const newRecord = {
            id: structureId,
            fingerprint,
            structureLabel,
            foundKeys,
            keyCount: foundKeys.length,
            firstSeenAt: now,
            lastSeenAt: now,
            hitCount: 1,
            exampleUrl: url || null,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: timestamp,
            _version: 1,
            __typename: 'ScrapeStructure'
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scrapeStructureTable,
            Item: newRecord
        }));
        
        console.log(`[StructureFingerprint] New structure detected: ${fingerprint} - "${structureLabel}"`);
        
        return {
            isNewStructure: true,
            fingerprint,
            structureId,
            structureLabel
        };
        
    } catch (error) {
        console.warn('[StructureFingerprint] Error tracking structure:', error.message);
        
        // Return non-blocking result
        return {
            isNewStructure: false,
            fingerprint,
            structureId: null,
            structureLabel,
            error: error.message
        };
    }
};

/**
 * Get structure statistics
 * 
 * @param {object} context - Shared context
 * @returns {object} Structure statistics
 */
const getStructureStats = async (context) => {
    const { ddbDocClient } = context;
    
    try {
        const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
        const scrapeStructureTable = getTableName('ScrapeStructure');
        
        const result = await ddbDocClient.send(new ScanCommand({
            TableName: scrapeStructureTable,
            ProjectionExpression: 'fingerprint, structureLabel, hitCount, firstSeenAt, lastSeenAt'
        }));
        
        const structures = result.Items || [];
        const totalHits = structures.reduce((sum, s) => sum + (s.hitCount || 0), 0);
        
        // Sort by hit count
        structures.sort((a, b) => (b.hitCount || 0) - (a.hitCount || 0));
        
        return {
            totalStructures: structures.length,
            totalHits,
            topStructures: structures.slice(0, 10).map(s => ({
                fingerprint: s.fingerprint,
                label: s.structureLabel,
                hits: s.hitCount,
                firstSeen: s.firstSeenAt,
                lastSeen: s.lastSeenAt
            }))
        };
        
    } catch (error) {
        console.error('[StructureFingerprint] Error getting stats:', error);
        return {
            totalStructures: 0,
            totalHits: 0,
            topStructures: [],
            error: error.message
        };
    }
};

module.exports = {
    generateFingerprint,
    generateStructureLabel,
    processStructureFingerprint,
    getStructureStats
};
