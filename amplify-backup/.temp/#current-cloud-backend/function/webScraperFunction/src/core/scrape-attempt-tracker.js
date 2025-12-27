/**
 * ===================================================================
 * Scrape Attempt Tracker
 * ===================================================================
 * 
 * Tracks individual scrape attempts for audit and debugging.
 * Each fetch operation creates a ScrapeAttempt record.
 * 
 * ===================================================================
 */

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { getTableName } = require('../config/tables');

/**
 * Create a ScrapeAttempt record
 * 
 * @param {object} attemptData - Attempt data
 * @param {string} attemptData.url - URL scraped
 * @param {number} attemptData.tournamentId - Tournament ID
 * @param {string} attemptData.entityId - Entity ID
 * @param {string} attemptData.scrapeURLId - ScrapeURL record ID
 * @param {string} attemptData.scraperJobId - Scraper job ID (optional)
 * @param {string} attemptData.status - Attempt status (SUCCESS, FAILED, SKIPPED_DONOTSCRAPE, etc.)
 * @param {number} attemptData.processingTime - Processing time in ms
 * @param {string} attemptData.errorMessage - Error message (if failed)
 * @param {string} attemptData.errorType - Error type (if failed)
 * @param {string} attemptData.gameName - Tournament name (if extracted)
 * @param {string} attemptData.gameStatus - Game status (if extracted)
 * @param {string} attemptData.registrationStatus - Registration status
 * @param {string} attemptData.dataHash - Content hash
 * @param {boolean} attemptData.hasChanges - Whether data changed
 * @param {array} attemptData.foundKeys - Keys found during parsing
 * @param {string} attemptData.structureLabel - Structure label
 * @param {string} attemptData.s3Key - S3 key of stored HTML
 * @param {string} attemptData.source - Source (SINGLE_SCRAPE, AUTO_SCRAPER, etc.)
 * @param {object} context - Shared context with ddbDocClient
 * @returns {string} ScrapeAttempt record ID
 */
const createScrapeAttempt = async (attemptData, context) => {
    const { ddbDocClient } = context;
    
    const {
        url,
        tournamentId,
        entityId,
        scrapeURLId,
        scraperJobId = null,
        status,
        processingTime = 0,
        errorMessage = null,
        errorType = null,
        gameName = null,
        gameStatus = null,
        registrationStatus = null,
        dataHash = null,
        hasChanges = false,
        foundKeys = [],
        structureLabel = null,
        s3Key = null,
        source = 'UNKNOWN'
    } = attemptData;
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const attemptId = uuidv4();
    
    try {
        const scrapeAttemptTable = getTableName('ScrapeAttempt');
        
        const record = {
            id: attemptId,
            url,
            tournamentId,
            entityId,
            scrapeURLId,
            scraperJobId,
            status,
            processingTimeMs: processingTime,
            
            // Error info (if failed)
            errorMessage,
            errorType,
            
            // Extracted data
            gameName,
            gameStatus,
            registrationStatus,
            
            // Content tracking
            dataHash,
            hasChanges,
            foundKeysCount: foundKeys?.length || 0,
            foundKeysSample: foundKeys?.slice(0, 10) || [],
            structureLabel,
            s3Key,
            
            // Metadata
            source,
            attemptedAt: now,
            completedAt: now,
            
            // DynamoDB standard fields
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: timestamp,
            _version: 1,
            __typename: 'ScrapeAttempt'
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scrapeAttemptTable,
            Item: record
        }));
        
        console.log(`[ScrapeAttemptTracker] Created attempt ${attemptId} - ${status}`);
        
        return attemptId;
        
    } catch (error) {
        // Non-blocking - log error but don't throw
        console.warn(`[ScrapeAttemptTracker] Failed to create attempt:`, error.message);
        return null;
    }
};

/**
 * Create a batch of ScrapeAttempt records
 * Used by autoScraper for bulk tracking
 * 
 * @param {array} attempts - Array of attempt data objects
 * @param {object} context - Shared context
 * @returns {number} Number of records created
 */
const createScrapeAttemptsBatch = async (attempts, context) => {
    let created = 0;
    
    // Process sequentially to avoid overwhelming DynamoDB
    for (const attemptData of attempts) {
        const result = await createScrapeAttempt(attemptData, context);
        if (result) created++;
    }
    
    return created;
};

/**
 * Extract error type from error message
 * 
 * @param {string} errorMessage - Error message
 * @returns {string} Error type
 */
const extractErrorType = (errorMessage) => {
    if (!errorMessage) return 'UNKNOWN';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('network')) return 'NETWORK';
    if (message.includes('404') || message.includes('not found')) return 'NOT_FOUND';
    if (message.includes('403') || message.includes('forbidden')) return 'FORBIDDEN';
    if (message.includes('429') || message.includes('rate limit')) return 'RATE_LIMITED';
    if (message.includes('500') || message.includes('server error')) return 'SERVER_ERROR';
    if (message.includes('parse') || message.includes('html')) return 'PARSE_ERROR';
    if (message.includes('scraper')) return 'SCRAPER_API_ERROR';
    
    return 'UNKNOWN';
};

module.exports = {
    createScrapeAttempt,
    createScrapeAttemptsBatch,
    extractErrorType
};
