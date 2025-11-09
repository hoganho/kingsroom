/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_S3STORAGETABLE_ARN
	API_KINGSROOM_S3STORAGETABLE_NAME
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	API_KINGSROOM_SCRAPERSTATETABLE_ARN
	API_KINGSROOM_SCRAPERSTATETABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	ENV
	FUNCTION_GETMODELCOUNT_NAME
	FUNCTION_PLAYERDATAPROCESSOR_NAME
	FUNCTION_WEBSCRAPERFUNCTION_NAME
	REGION
Amplify Params - DO NOT EDIT */

/* Enhanced Auto Scraper Lambda with Entity ID Support and S3 Caching
 * This file includes comprehensive Entity ID assignment for all scraper models
 * and S3-first caching to minimize live website scraping
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');
const { TextDecoder } = require('util');

// === S3 CACHING IMPORTS (NEW) ===
const { getHtmlFromS3, checkS3ObjectExists } = require('./s3-helpers');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// --- ENTITY ---: Added default entity ID
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";

// --- S3 CACHING CONFIGURATION (NEW) ---
const S3_CACHE_ENABLED = process.env.S3_CACHE_ENABLED !== 'false'; // Default to true
const S3_CACHE_CHECK_BEFORE_INVOKE = process.env.S3_CACHE_CHECK_BEFORE_INVOKE !== 'false'; // Default to true

// --- Configuration & Clients ---
const client = new DynamoDBClient({});
const marshallOptions = {
    removeUndefinedValues: true 
};
const translateConfig = { marshallOptions };
const ddbDocClient = DynamoDBDocumentClient.from(client, translateConfig);

const lambdaClient = new LambdaClient({});

const MAX_NEW_GAMES_PER_RUN = 10;
const LAMBDA_TIMEOUT_BUFFER = (5 * 60 * 1000) - 30000;
const MAX_CONSECUTIVE_BLANKS = 2;
const MAX_LOG_SIZE = 25;
const MAX_GAME_LIST_SIZE = 5;

// --- Table Name Helper ---
const getTableName = (modelName) => {
    // --- ENTITY ---: Added new table names from schema
    const specialTables = {
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME,
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME,
        'ScrapeAttempt': process.env.API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME,
    };
    
    if (specialTables[modelName]) return specialTables[modelName];
    
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) throw new Error(`API ID or environment name not found.`);
    return `${modelName}-${apiId}-${env}`;
};

// === S3 CACHING FUNCTIONS (NEW) ===

/**
 * Check S3 cache before invoking WebScraper Lambda
 * Returns cached HTML if available, null otherwise
 */
const checkS3CacheBeforeScraping = async (url, scrapeURLRecord) => {
    if (!S3_CACHE_ENABLED || !S3_CACHE_CHECK_BEFORE_INVOKE) {
        return null;
    }
    
    // Only check if we have an S3 key stored
    if (!scrapeURLRecord?.latestS3Key) {
        return null;
    }
    
    try {
        console.log(`[S3-Cache] Checking cache for ${url} with key: ${scrapeURLRecord.latestS3Key}`);
        const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
        
        if (s3Content && s3Content.html) {
            console.log(`[S3-Cache] ✅ Cache hit for ${url} (${s3Content.html.length} bytes)`);
            
            // Update cache hit statistics
            await updateCacheHitStats(scrapeURLRecord.id);
            
            return {
                cached: true,
                html: s3Content.html,
                s3Key: scrapeURLRecord.latestS3Key,
                metadata: s3Content.metadata,
                contentHash: s3Content.metadata?.contenthash
            };
        }
    } catch (error) {
        console.warn(`[S3-Cache] Failed to retrieve from S3: ${error.message}`);
    }
    
    return null;
};

/**
 * Update cache hit statistics in ScrapeURL record
 */
const updateCacheHitStats = async (scrapeURLId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    
    try {
        const now = new Date().toISOString();
        await ddbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: scrapeURLId },
            UpdateExpression: `
                SET cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :one,
                    lastCacheHitAt = :now,
                    updatedAt = :now
            `,
            ExpressionAttributeValues: {
                ':zero': 0,
                ':one': 1,
                ':now': now
            }
        }));
        console.log(`[S3-Cache] Updated cache hit stats for ${scrapeURLId}`);
    } catch (error) {
        console.error(`[S3-Cache] Failed to update cache hit stats: ${error.message}`);
        // Don't fail the whole operation for stats update failure
    }
};

// --- Enhanced Utility Functions ---

/**
 * Creates a new ScraperJob record with S3 cache tracking
 */
// --- ENTITY ---: Added entityId parameter and S3 cache fields
const createScraperJob = async (triggerSource, triggeredBy, entityId, config = {}) => {
    const jobId = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    
    const jobRecord = {
        id: jobId,
        jobId: jobId,
        // --- ENTITY ---: Added entityId to the record
        entityId: entityId || DEFAULT_ENTITY_ID,
        triggerSource,
        triggeredBy: triggeredBy || 'SYSTEM',
        startTime: now,
        status: 'RUNNING',
        maxGames: config.maxGames || MAX_NEW_GAMES_PER_RUN,
        targetURLs: config.targetURLs || null,
        isFullScan: config.isFullScan || false,
        startId: config.startId || null,
        endId: config.endId || null,
        totalURLsProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        urlResults: [],
        // === S3 CACHE TRACKING FIELDS (NEW) ===
        s3CacheHits: 0,
        s3CacheChecks: 0,
        liveScrapes: 0,
        cacheHitRate: 0,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScraperJob',
        _lastChangedAt: Date.now(),
        _version: 1
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: getTableName('ScraperJob'),
        Item: jobRecord
    }));
    
    console.log(`[JOB] Created new scraper job: ${jobId} for entity ${entityId}`);
    return jobRecord;
};

/**
 * Updates scraper job with results and cache statistics
 */
// Enhanced to include S3 cache statistics
const updateScraperJob = async (jobId, updates) => {
    const now = new Date().toISOString();
    const endTime = updates.endTime || now;
    
    // Calculate cache hit rate if we have the data
    if (updates.totalURLsProcessed && (updates.s3CacheHits !== undefined)) {
        updates.cacheHitRate = (updates.s3CacheHits / updates.totalURLsProcessed * 100).toFixed(2);
    }
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    const fieldsToUpdate = {
        ...updates,
        updatedAt: now,
        _lastChangedAt: Date.now()
    };
    
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
        if (value !== undefined) {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    }
    
    await ddbDocClient.send(new UpdateCommand({
        TableName: getTableName('ScraperJob'),
        Key: { id: jobId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
    
    console.log(`[JOB] Updated job ${jobId} with cache hit rate: ${updates.cacheHitRate || 'N/A'}%`);
};

/**
 * Gets or creates a ScrapeURL record
 */
// --- ENTITY ---: Added entityId parameter
const getOrCreateScrapeURL = async (url, tournamentId, entityId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    const urlId = url; // Using URL as ID for simplicity
    
    // Try to get existing record
    try {
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scrapeURLTable,
            Key: { id: urlId }
        }));
        
        if (response.Item) {
            return response.Item;
        }
    } catch (error) {
        console.log(`Creating new ScrapeURL record for ${url}`);
    }
    
    // Create new record
    const now = new Date().toISOString();
    const newRecord = {
        id: urlId,
        url,
        tournamentId,
        // --- ENTITY ---: Added entityId to the record
        entityId: entityId || DEFAULT_ENTITY_ID,
        status: 'ACTIVE',
        doNotScrape: false,
        placedIntoDatabase: false,
        firstScrapedAt: now,
        lastScrapedAt: now,
        timesScraped: 0,
        timesSuccessful: 0,
        timesFailed: 0,
        consecutiveFailures: 0,
        sourceSystem: "KINGSROOM_WEB",
        // === S3 CACHE FIELDS (NEW) ===
        s3StorageEnabled: true,
        cachedContentUsedCount: 0,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeURL',
        _lastChangedAt: Date.now(),
        _version: 1
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: scrapeURLTable,
        Item: newRecord
    }));
    
    return newRecord;
};

/**
 * Updates a ScrapeURL record after scraping
 */
// --- ENTITY ---: Added entityId parameter
const updateScrapeURL = async (url, entityId, result, scrapedData = null) => {
    const now = new Date().toISOString();
    const urlId = url;
    
    // --- ENTITY ---: Pass entityId to get/create
    const current = await getOrCreateScrapeURL(url, result.tournamentId, entityId);
    
    // ... (rest of the function is unchanged, but now operates on the correct record)
    const timesScraped = (current.timesScraped || 0) + 1;
    const isSuccess = ['SAVED', 'UPDATED', 'NO_CHANGES'].includes(result.status);
    const timesSuccessful = (current.timesSuccessful || 0) + (isSuccess ? 1 : 0);
    const timesFailed = (current.timesFailed || 0) + (!isSuccess ? 1 : 0);
    const consecutiveFailures = isSuccess ? 0 : (current.consecutiveFailures || 0) + 1;
    
    let dataHash = null;
    let hasDataChanges = false;
    if (scrapedData) {
        const hashData = JSON.stringify({
            name: scrapedData.name,
            gameStatus: scrapedData.gameStatus,
            prizepool: scrapedData.prizepool,
            totalEntries: scrapedData.totalEntries,
            playersRemaining: scrapedData.playersRemaining
        });
        dataHash = crypto.createHash('sha256').update(hashData).digest('hex');
        hasDataChanges = current.lastDataHash && current.lastDataHash !== dataHash;
    }
    
    let status = current.status;
    if (result.status === 'INACTIVE') {
        status = 'INACTIVE';
    } else if (consecutiveFailures >= 3) {
        status = 'ERROR';
    } else if (result.status === 'SKIPPED_DONOTSCRAPE') {
        status = 'DO_NOT_SCRAPE';
    }
    
    const updates = {
        status,
        lastScrapedAt: now,
        lastSuccessfulScrapeAt: isSuccess ? now : current.lastSuccessfulScrapeAt,
        timesScraped,
        timesSuccessful,
        timesFailed,
        consecutiveFailures,
        lastScrapeStatus: result.status,
        lastScrapeMessage: result.message || null,
        lastScrapeJobId: result.jobId,
        placedIntoDatabase: result.gameId ? true : current.placedIntoDatabase,
        gameId: result.gameId || current.gameId,
        gameName: scrapedData?.name || current.gameName,
        gameStatus: scrapedData?.gameStatus || current.gameStatus,
        venueId: result.venueId || current.venueId,
        lastDataHash: dataHash || current.lastDataHash,
        hasDataChanges,
        lastScrapingTime: result.processingTime || null,
        // === S3 CACHE FIELDS UPDATE (NEW) ===
        latestS3Key: result.s3Key || current.latestS3Key,
        contentHash: result.contentHash || current.contentHash,
        // ✅ NEW: Ensure doNotScrape is updated if returned by scraper (e.g. NOT_PUBLISHED)
        doNotScrape: (scrapedData && scrapedData.doNotScrape !== undefined) ? scrapedData.doNotScrape : current.doNotScrape,
        updatedAt: now,
        _lastChangedAt: Date.now()
    };
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = value;
        }
    }
    
    await ddbDocClient.send(new UpdateCommand({
        TableName: getTableName('ScrapeURL'),
        Key: { id: urlId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
    
    return { ...current, ...updates };
};

/**
 * Creates a ScrapeAttempt record for audit trail
 */
const createScrapeAttempt = async (url, tournamentId, jobId, result, scrapedData = null) => {
    const now = new Date().toISOString();
    const attemptId = crypto.randomBytes(16).toString('hex');
    
    const attempt = {
        id: attemptId,
        url,
        tournamentId,
        attemptTime: now,
        scraperJobId: jobId,
        scrapeURLId: url,
        status: result.status,
        processingTime: result.processingTime || 0,
        gameName: scrapedData?.name || null,
        gameStatus: scrapedData?.gameStatus || null,
        registrationStatus: scrapedData?.registrationStatus || null,
        errorMessage: result.error || null,
        gameId: result.gameId || null,
        wasNewGame: result.status === 'SAVED',
        fieldsUpdated: result.fieldsUpdated || null,
        // === S3 CACHE TRACKING (NEW) ===
        source: result.source || 'LIVE',
        s3Key: result.s3Key || null,
        usedCache: result.usedCache || false,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeAttempt',
        _lastChangedAt: Date.now(),
        _version: 1
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: getTableName('ScrapeAttempt'),
        Item: attempt
    }));
    
    return attempt;
};

/**
 * Gets URLs that need updating (active games)
 */
// --- ENTITY ---: Added entityId and updated query to use 'byEntityGame' index
const getUpdateCandidateURLs = async (entityId, limit = 10) => {
    const response = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('Game'),
        // Use the GSI for entity-specific game queries
        IndexName: 'byEntityGame', 
        KeyConditionExpression: '#ent = :entId',
        // Filter by status since it's not part of the GSI key
        FilterExpression: '#status = :status', 
        ExpressionAttributeNames: {
            '#ent': 'entityId',
            '#status': 'gameStatus'
        },
        ExpressionAttributeValues: {
            ':entId': entityId || DEFAULT_ENTITY_ID,
            ':status': 'RUNNING'
        },
        Limit: limit
    }));
    
    return response.Items ? response.Items.map(game => game.sourceUrl) : [];
};

/**
 * Enhanced scrape and process function with S3 caching support
 */
// --- ENTITY ---: Added entityId parameter and S3 cache checking
const scrapeAndProcessTournament = async (url, existingGameData, jobId, entityId, triggerSource) => {
    const startTime = Date.now();
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    const idMatch = url.match(/id=(\d+)/);
    const tournamentId = idMatch ? parseInt(idMatch[1], 10) : (existingGameData?.id || null);
    
    if (!tournamentId) {
        throw new Error(`Could not determine tournament ID from URL: ${url}`);
    }
    
    const result = {
        url,
        tournamentId,
        status: 'PENDING',
        processingTime: 0,
        jobId,
        source: 'LIVE', // Default, will be updated if cache used
        usedCache: false
    };
    
    console.log(`[SCRAPE] Processing tournament ${tournamentId} from URL: ${url}`);
    
    // === S3 CACHE CHECK (NEW) ===
    const forceRefresh = triggerSource === 'MANUAL' || triggerSource === 'CONTROL';
    let s3CacheResult = null;
    let scrapeURLRecord = null;
    
    if (!forceRefresh && S3_CACHE_CHECK_BEFORE_INVOKE) {
        // Get ScrapeURL record to check for S3 key
        scrapeURLRecord = await getOrCreateScrapeURL(url, tournamentId, entityId);
        
        // Check S3 cache
        s3CacheResult = await checkS3CacheBeforeScraping(url, scrapeURLRecord);
        
        if (s3CacheResult && s3CacheResult.cached) {
            console.log(`[SCRAPE] ✅ S3 cache available for ${url}, passing to WebScraper`);
            result.source = 'S3_CACHE';
            result.usedCache = true;
            result.s3Key = s3CacheResult.s3Key;
        }
    }
    
    // Prepare Lambda invocation payload
    const payload = {
        url: url,
        field: 'fetchTournamentData',
        forceRefresh: forceRefresh,
        arguments: {
            jobId: jobId,
            triggerSource: triggerSource,
            entityId: entityId // Ensure entityId passed
        }
    };
    
    // If we have cached HTML, pass it to WebScraper
    // The WebScraper can then skip the fetch step
    if (s3CacheResult?.cached) {
        payload.cachedHtml = s3CacheResult.html;
        payload.s3Key = s3CacheResult.s3Key;
        payload.source = 'S3_CACHE';
        payload.contentHash = s3CacheResult.contentHash;
        console.log(`[SCRAPE] Including cached HTML in Lambda payload (${s3CacheResult.html.length} bytes)`);
    }
    
    // === INVOKE WEBSCAPER LAMBDA ===
    const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload)
    });
    
    try {
        const lambdaResponse = await lambdaClient.send(command);
        const decoder = new TextDecoder('utf-8');
        const responsePayload = JSON.parse(decoder.decode(lambdaResponse.Payload));
        
        result.processingTime = Date.now() - startTime;
        
        // Handle errors
        if (responsePayload.errorMessage) {
            console.error(`[SCRAPE] ERROR from WebScraper: ${responsePayload.errorMessage}`);
            result.status = 'FAILED';
            result.error = responsePayload.errorMessage;
            
            // Check for specific error patterns
            if (responsePayload.errorMessage.includes('Scraping is disabled')) {
                result.status = 'SKIPPED_DONOTSCRAPE';
            } else if (responsePayload.errorMessage.includes('not found') || 
                      responsePayload.errorMessage.includes('404')) {
                result.status = 'INACTIVE';
            } else if (responsePayload.errorMessage.includes('blank') || 
                      responsePayload.errorMessage.includes('Not In Use')) {
                result.status = 'BLANK';
            }
            
            return result;
        }
        
        // Process successful response
        const scrapedData = responsePayload;
        
        // Update result with scraped data
        result.data = scrapedData;
        result.structureLabel = scrapedData.structureLabel;
        result.foundKeys = scrapedData.foundKeys;
        
        // If WebScraper actually used cache, update our tracking
        if (scrapedData.source === 'S3_CACHE') {
            result.source = 'S3_CACHE';
            result.usedCache = true;
            result.s3Key = scrapedData.s3Key;
        } else if (scrapedData.source === 'HTTP_304_CACHE') {
            result.source = 'HTTP_304_CACHE';
            result.usedCache = true;
        }
        
        // Update S3 key if WebScraper stored new content
        if (scrapedData.s3Key && scrapedData.s3Key !== result.s3Key) {
            result.s3Key = scrapedData.s3Key;
            result.contentHash = scrapedData.contentHash;
        }
        
        // Determine status based on scraped data
        // ✅ NEW: Handle NOT_FOUND (Treat as BLANK - Req #3) and NOT_PUBLISHED (Skip scraping - Req #4)
        if (!scrapedData.name || 
            scrapedData.gameStatus === 'NOT_IN_USE' || 
            scrapedData.gameStatus === 'NOT_FOUND') { // Added NOT_FOUND here
            result.status = 'BLANK';
        } else if (scrapedData.isInactive) {
            result.status = 'INACTIVE';
        } else if (scrapedData.doNotScrape || scrapedData.gameStatus === 'NOT_PUBLISHED') { // Added NOT_PUBLISHED here
            result.status = 'SKIPPED_DONOTSCRAPE';
        } else if (existingGameData) {
            result.status = 'UPDATED';
            result.gameId = existingGameData.id;
        } else {
            result.status = 'SAVED';
        }
        
        console.log(`[SCRAPE] Tournament ${tournamentId} processed successfully. Status: ${result.status}, Source: ${result.source}, GameStatus: ${scrapedData.gameStatus}`);
        
    } catch (error) {
        console.error(`[SCRAPE] Lambda invocation error: ${error.message}`);
        result.status = 'FAILED';
        result.error = error.message;
        result.processingTime = Date.now() - startTime;
    }
    
    return result;
};

/**
 * Process a URL ID by either scraping or using cached data
 */
// --- ENTITY ---: Added entityId parameter
const processUrlId = async (id, jobId, entityId, triggerSource) => {
    const url = `https://www.kingsroom.com.au/mtp-poker-tournament-clock/?id=${id}`;
    
    // Check if game exists in database
    const gameTable = getTableName('Game');
    const existingGame = await ddbDocClient.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byTournamentId',
        KeyConditionExpression: 'tournamentId = :tid',
        ExpressionAttributeValues: { ':tid': id },
        Limit: 1
    }));
    
    const existingGameData = existingGame.Items && existingGame.Items.length > 0 ? existingGame.Items[0] : null;
    
    // Check if we should skip
    if (existingGameData?.doNotScrape) {
        console.log(`[PROCESS] Skipping tournament ${id} - marked as doNotScrape`);
        return { status: 'SKIPPED_DONOTSCRAPE', tournamentId: id, url };
    }
    
    // Process the tournament with S3 cache checking
    // --- ENTITY ---: Pass entityId
    const result = await scrapeAndProcessTournament(url, existingGameData, jobId, entityId, triggerSource);
    
    // Update ScrapeURL and create ScrapeAttempt
    // --- ENTITY ---: Pass entityId
    await updateScrapeURL(url, entityId, result, result.data);
    await createScrapeAttempt(url, id, jobId, result, result.data);
    
    return result;
};

// --- ENTITY ---: Added entityId parameter
const updateScraperState = async (entityId, updates) => {
    const scraperStateTable = getTableName('ScraperState');
    // --- ENTITY ---: Use entityId as the state ID (one state per entity)
    const stateId = entityId || DEFAULT_ENTITY_ID;
    const now = new Date().toISOString();
    
    const defaultState = {
        id: stateId,
        entityId: entityId || DEFAULT_ENTITY_ID,
        isRunning: false,
        lastScannedId: 100000,
        lastRunStartTime: null,
        lastRunEndTime: null,
        consecutiveBlankCount: 0,
        totalScraped: 0,
        totalErrors: 0,
        enabled: true,
        currentLog: [],
        lastGamesProcessed: [],
        __typename: 'ScraperState',
        _lastChangedAt: Date.now(),
        _version: 1,
        createdAt: now,
        updatedAt: now
    };
    
    try {
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId }
        }));
        
        const current = response.Item || defaultState;
        const updatedItem = { ...current, ...updates, updatedAt: now };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: updatedItem
        }));
        
        return updatedItem;
    } catch (error) {
        console.error(`[UPDATE-STATE] ERROR: ${error.message}`);
        if (!updates.id) {
            await ddbDocClient.send(new PutCommand({
                TableName: scraperStateTable,
                Item: { ...defaultState, ...updates }
            }));
        }
    }
};

/**
 * Main scraping function with S3 cache support
 */
const performScrapingEnhanced = async (config = {}) => {
    const {
        maxGames = MAX_NEW_GAMES_PER_RUN,
        triggerSource = 'MANUAL',
        triggeredBy = 'UNKNOWN',
        // --- ENTITY ---: entityId is expected in config
        entityId = DEFAULT_ENTITY_ID
    } = config;
    
    // --- ENTITY ---: Pass entityId to all function calls
    const state = await getScraperState(entityId, true);
    
    if (!state.enabled && triggerSource !== 'MANUAL') {
        console.log(`[PERFORM] Auto-scraping disabled for entity ${entityId}.`);
        return { 
            success: false, 
            message: 'Auto-scraping is disabled', 
            state,
            entityId 
        };
    }
    
    if (state.isRunning && triggerSource !== 'MANUAL') {
        console.log(`[PERFORM] Already running for entity ${entityId}.`);
        return { 
            success: false, 
            message: 'Already running', 
            state,
            entityId 
        };
    }
    
    const job = await createScraperJob(triggerSource, triggeredBy, entityId, config);
    const runStartTime = Date.now();
    
    try {
        // --- ENTITY ---: Pass entityId to updateScraperState
        await updateScraperState(entityId, {
            isRunning: true,
            lastRunStartTime: new Date().toISOString()
        });
        
        // --- ENTITY ---: Pass entityId to logStatus
        await logStatus('INFO', `Scraping started. Max: ${maxGames}, Entity: ${entityId}`, '', entityId);
        
        let newGamesScraped = 0;
        let gamesUpdated = 0;
        let gamesSkipped = 0;
        let errors = 0;
        let blanks = 0;
        let consecutiveBlanks = 0;
        let lastScannedId = state.lastScannedId || 100000;
        let currentId = lastScannedId + 1;
        const urlResults = [];
        
        // === S3 CACHE TRACKING (NEW) ===
        let s3CacheHits = 0;
        let s3CacheChecks = 0;
        let liveScrapes = 0;
        
        console.log(`[PERFORM] Starting from ID ${currentId} for entity ${entityId}`);
        
        while (newGamesScraped < maxGames && 
               consecutiveBlanks < MAX_CONSECUTIVE_BLANKS &&
               (Date.now() - runStartTime) < LAMBDA_TIMEOUT_BUFFER) {
            
            const url = `https://www.kingsroom.com.au/mtp-poker-tournament-clock/?id=${currentId}`;
            console.log(`[PERFORM] Processing ID ${currentId}`);
            
            try {
                // --- ENTITY ---: Pass entityId to processUrlId
                const result = await processUrlId(currentId, job.jobId, entityId, triggerSource);
                
                // === TRACK S3 CACHE USAGE (NEW) ===
                s3CacheChecks++;
                if (result.source === 'S3_CACHE') {
                    s3CacheHits++;
                    console.log(`[PERFORM] ✅ S3 cache hit for ID ${currentId}`);
                } else if (result.source === 'LIVE') {
                    liveScrapes++;
                    console.log(`[PERFORM] 🌐 Live scrape for ID ${currentId}`);
                }
                
                urlResults.push({
                    url,
                    tournamentId: currentId,
                    status: result.status,
                    gameId: result.gameId || null,
                    source: result.source, // Track source in results
                    usedCache: result.usedCache
                });
                
                if (result.status === 'BLANK') {
                    blanks++;
                    consecutiveBlanks++;
                    console.log(`[PERFORM] Blank game at ID ${currentId}. Consecutive blanks: ${consecutiveBlanks}`);
                } else {
                    // Only reset consecutive blanks if it's NOT SKIPPED (e.g., don't reset for "Not Published" if we want to keep scanning)
                    // Actually, standard behavior is to reset on any non-blank to ensure we don't stop prematurely if there's a gap.
                    // Let's keep it standard for now.
                    consecutiveBlanks = 0;
                    
                    if (result.status === 'SAVED') {
                        newGamesScraped++;
                        if (result.data) {
                            // --- ENTITY ---: Pass entityId to updateGameList
                            await updateGameList(currentId, result.data.name, result.data.gameStatus, entityId);
                        }
                    } else if (result.status === 'UPDATED') {
                        gamesUpdated++;
                    } else if (result.status === 'SKIPPED_DONOTSCRAPE' || result.status === 'INACTIVE') {
                        gamesSkipped++;
                    }
                }
            } catch (error) {
                console.error(`[PERFORM] Error processing ID ${currentId}: ${error.message}`);
                errors++;
                urlResults.push({
                    url,
                    tournamentId: currentId,
                    status: 'FAILED',
                    error: error.message
                });
            }
            
            lastScannedId = currentId;
            currentId++;
        }
        
        // Update job with results and cache statistics
        await updateScraperJob(job.jobId, {
            endTime: new Date().toISOString(),
            status: 'COMPLETED',
            totalURLsProcessed: urlResults.length,
            newGamesScraped,
            gamesUpdated,
            gamesSkipped,
            errors,
            blanks,
            urlResults,
            // === S3 CACHE STATISTICS (NEW) ===
            s3CacheHits,
            s3CacheChecks,
            liveScrapes,
            cacheHitRate: s3CacheChecks > 0 ? (s3CacheHits / s3CacheChecks * 100).toFixed(2) : 0,
            successRate: urlResults.length > 0 
                ? ((urlResults.filter(r => r.status !== 'FAILED').length / urlResults.length) * 100).toFixed(2)
                : 100,
            durationSeconds: Math.ceil((Date.now() - runStartTime) / 1000)
        });
        
        // --- ENTITY ---: Pass entityId to updateScraperState
        await updateScraperState(entityId, {
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            lastScannedId,
            consecutiveBlankCount: consecutiveBlanks,
            totalScraped: (state.totalScraped || 0) + urlResults.length,
            totalErrors: (state.totalErrors || 0) + errors
        });
        
        // --- ENTITY ---: Pass entityId to logStatus with cache statistics
        await logStatus('INFO', 
            `Scraping completed. New: ${newGamesScraped}, Updated: ${gamesUpdated}, Cache Hits: ${s3CacheHits}/${s3CacheChecks}`, 
            `Entity: ${entityId}`, 
            entityId
        );
        
        console.log(`[PERFORM] === S3 CACHE STATISTICS ===`);
        console.log(`[PERFORM] Total checks: ${s3CacheChecks}`);
        console.log(`[PERFORM] Cache hits: ${s3CacheHits}`);
        console.log(`[PERFORM] Live scrapes: ${liveScrapes}`);
        console.log(`[PERFORM] Cache hit rate: ${s3CacheChecks > 0 ? (s3CacheHits / s3CacheChecks * 100).toFixed(2) : 0}%`);
        
        return {
            success: true,
            message: `Processed ${urlResults.length} URLs`,
            jobId: job.jobId,
            results: {
                newGamesScraped,
                gamesUpdated,
                gamesSkipped,
                errors,
                blanks,
                s3CacheHits,
                liveScrapes,
                cacheHitRate: s3CacheChecks > 0 ? (s3CacheHits / s3CacheChecks * 100).toFixed(2) : 0
            },
            state: await getScraperState(entityId),
            entityId
        };
        
    } catch (error) {
        console.error(`[PERFORM] Fatal error: ${error.message}`);
        
        await updateScraperJob(job.jobId, {
            endTime: new Date().toISOString(),
            status: 'FAILED',
            errorMessage: error.message
        });
        
        // --- ENTITY ---: Pass entityId to updateScraperState and logStatus
        await updateScraperState(entityId, {
            isRunning: false,
            lastRunEndTime: new Date().toISOString()
        });
        
        await logStatus('ERROR', `Scraping failed: ${error.message}`, '', entityId);
        
        throw error;
    }
};

// --- ENTITY ---: Added entityId parameter
const getScraperState = async (entityId, createIfNotExists = false) => {
    const scraperStateTable = getTableName('ScraperState');
    // --- ENTITY ---: Use entityId as the state ID (one state per entity)
    const stateId = entityId || DEFAULT_ENTITY_ID;
    
    const defaultState = {
        id: stateId,
        entityId: entityId || DEFAULT_ENTITY_ID,
        isRunning: false,
        lastScannedId: 100000,
        lastRunStartTime: null,
        lastRunEndTime: null,
        consecutiveBlankCount: 0,
        totalScraped: 0,
        totalErrors: 0,
        enabled: true,
        currentLog: [],
        lastGamesProcessed: []
    };
    
    try {
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId },
            ConsistentRead: true
        }));
        
        if (response.Item) {
            return { ...defaultState, ...response.Item };
        }
        return defaultState;
    } catch (error) {
        console.error(`[GET-STATE] ERROR: ${error.message}`);
        throw error;
    }
};

// --- ENTITY ---: Added entityId parameter
const logStatus = async (level, message, details = '', entityId) => {
    // --- ENTITY ---: Pass entityId to getScraperState
    const state = await getScraperState(entityId, true);
    const newEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        details
    };
    const newLog = [newEntry, ...(state.currentLog || [])].slice(0, MAX_LOG_SIZE);
    // --- ENTITY ---: Pass entityId to updateScraperState
    await updateScraperState(entityId, { currentLog: newLog });
};

// --- ENTITY ---: Added entityId parameter
const updateGameList = async (id, name, status, entityId) => {
    // --- ENTITY ---: Pass entityId to getScraperState
    const state = await getScraperState(entityId, true);
    const newGameEntry = {
        id: id.toString(),
        name,
        status
    };
    const newList = [newGameEntry, ...(state.lastGamesProcessed || [])].slice(0, MAX_GAME_LIST_SIZE);
    // --- ENTITY ---: Pass entityId to updateScraperState
    await updateScraperState(entityId, { lastGamesProcessed: newList });
};

const createCleanDataForSave = (scraped) => ({
    name: scraped.name,
    gameStartDateTime: scraped.gameStartDateTime || undefined,
    gameEndDateTime: scraped.gameEndDateTime || undefined,
    gameStatus: scraped.gameStatus || undefined,
    registrationStatus: scraped.registrationStatus || undefined,
    gameVariant: scraped.gameVariant || 'NLHE',
    gameType: scraped.gameType || undefined,
    prizepool: scraped.prizepool || undefined,
    totalEntries: scraped.totalEntries || undefined,
    totalRebuys: scraped.totalRebuys || undefined,
    totalAddons: scraped.totalAddons || undefined,
    totalDuration: scraped.totalDuration || undefined,
    gameTags: scraped.gameTags ? scraped.gameTags.filter(tag => tag !== null) : [],
    tournamentType: scraped.tournamentType || undefined,
    buyIn: scraped.buyIn || undefined,
    rake: scraped.rake || undefined,
    startingStack: scraped.startingStack || undefined,
    hasGuarantee: scraped.hasGuarantee || false,
    guaranteeAmount: scraped.guaranteeAmount || undefined,
    levels: scraped.levels ? scraped.levels.map(l => ({
        levelNumber: l.levelNumber,
        durationMinutes: l.durationMinutes || undefined,
        smallBlind: l.smallBlind || undefined,
        bigBlind: l.bigBlind || undefined,
        ante: l.ante || undefined,
        breakMinutes: l.breakMinutes || undefined
    })) : []
});

/**
 * Get S3 cache statistics for monitoring
 */
const getCacheStatistics = async (entityId, timeRange = 'LAST_24_HOURS') => {
    const scraperJobTable = getTableName('ScraperJob');
    
    // Calculate time filter
    const now = new Date();
    let startTime;
    
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
        default:
            startTime = new Date(now - 24 * 60 * 60 * 1000);
    }
    
    // Query recent jobs for the entity
    const response = await ddbDocClient.send(new QueryCommand({
        TableName: scraperJobTable,
        IndexName: 'byEntityScraperJob',
        KeyConditionExpression: 'entityId = :entityId',
        FilterExpression: 'startTime >= :startTime',
        ExpressionAttributeValues: {
            ':entityId': entityId || DEFAULT_ENTITY_ID,
            ':startTime': startTime.toISOString()
        }
    }));
    
    const jobs = response.Items || [];
    
    // Calculate aggregate statistics
    const stats = {
        totalJobs: jobs.length,
        totalURLsProcessed: jobs.reduce((sum, j) => sum + (j.totalURLsProcessed || 0), 0),
        totalS3CacheHits: jobs.reduce((sum, j) => sum + (j.s3CacheHits || 0), 0),
        totalLiveScrapes: jobs.reduce((sum, j) => sum + (j.liveScrapes || 0), 0),
        averageCacheHitRate: 0,
        timeRange,
        entityId
    };
    
    if (stats.totalURLsProcessed > 0) {
        stats.averageCacheHitRate = ((stats.totalS3CacheHits / stats.totalURLsProcessed) * 100).toFixed(2);
    }
    
    console.log(`[CACHE-STATS] Entity ${entityId} - ${timeRange}:`);
    console.log(`[CACHE-STATS] Total URLs: ${stats.totalURLsProcessed}`);
    console.log(`[CACHE-STATS] S3 Cache Hits: ${stats.totalS3CacheHits}`);
    console.log(`[CACHE-STATS] Live Scrapes: ${stats.totalLiveScrapes}`);
    console.log(`[CACHE-STATS] Cache Hit Rate: ${stats.averageCacheHitRate}%`);
    
    return stats;
};

/**
 * Main handler with enhanced routing and S3 cache support
 */
exports.handler = async (event) => {
    console.log(`[HANDLER] Invoked at ${new Date().toISOString()}`);
    console.log(`[HANDLER] Event: ${JSON.stringify(event, null, 2)}`);
    
    const { fieldName, operation, arguments: args, source, ['detail-type']: detailType } = event;
    
    // --- ENTITY ---: Determine entityId from various event sources
    const entityId = args?.entityId || args?.input?.entityId || event.entityId || DEFAULT_ENTITY_ID;
    
    try {
        if (fieldName) {
            switch (fieldName) {
                case 'triggerAutoScraping':
                    return await performScrapingEnhanced({
                        maxGames: args?.maxGames,
                        triggerSource: 'MANUAL',
                        triggeredBy: event.identity?.username || 'UNKNOWN',
                        entityId: entityId // Pass entityId
                    });
                    
                case 'controlScraperOperation':
                    // --- ENTITY ---: Pass entityId to control function
                    return await controlScraperEnhanced(args?.operation, entityId);
                    
                case 'getScraperControlState':
                    // --- ENTITY ---: Pass entityId to get state
                    const state = await getScraperState(entityId);
                    return { success: true, state };
                    
                case 'startScraperJob':
                    return await performScrapingEnhanced({
                        ...args?.input, // entityId is expected inside args.input
                        triggeredBy: event.identity?.username || 'UNKNOWN'
                    });
                    
                case 'getScraperJobs':
                    // --- ENTITY ---: Pass entityId from args
                    return await getScraperJobs(args);
                    
                case 'getScrapeURLs':
                    // --- ENTITY ---: Pass entityId from args
                    return await getScrapeURLs(args);
                    
                case 'getUpdateCandidateURLs':
                    // --- ENTITY ---: Pass entityId
                    const urls = await getUpdateCandidateURLs(entityId, args?.limit);
                    return urls;
                    
                case 'getCacheStatistics':
                    // === NEW: Get S3 cache statistics ===
                    return await getCacheStatistics(entityId, args?.timeRange);
                    
                default:
                    throw new Error(`Unknown fieldName: ${fieldName}`);
            }
        }
        
        if (source === 'aws.scheduler' || detailType === 'Scheduled Event') {
            return await performScrapingEnhanced({
                triggerSource: 'SCHEDULED',
                // --- ENTITY ---: entityId from scheduler input (or default)
                entityId: entityId
            });
        }
        
        if (operation === 'START_WORKER') {
            // --- ENTITY ---: entityId is expected in event.config
            return await performScrapingEnhanced(event.config);
        }
        
        // Default
        const state = await getScraperState(entityId);
        return { success: true, state };
        
    } catch (error) {
        console.error(`[HANDLER] Fatal error: ${error.message}`);
        throw error;
    }
};

/**
 * Enhanced control function
 */
// --- ENTITY ---: Added entityId parameter
const controlScraperEnhanced = async (operation, entityId) => {
    // --- ENTITY ---: Pass entityId to getScraperState
    const state = await getScraperState(entityId);
    
    switch (operation) {
        case 'START':
            if (state.isRunning || !state.enabled) {
                return { success: false, message: state.isRunning ? 'Already running' : 'Disabled', state };
            }
            
            await lambdaClient.send(new InvokeCommand({
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                InvocationType: 'Event',
                Payload: JSON.stringify({
                    operation: 'START_WORKER',
                    // --- ENTITY ---: Pass entityId in the async payload
                    config: { triggerSource: 'CONTROL', entityId: entityId }
                })
            }));
            
            return { success: true, message: 'Scraper started', state };
            
        case 'STOP':
            // --- ENTITY ---: Pass entityId to updateScraperState
            await updateScraperState(entityId, { isRunning: false });
            return { success: true, message: 'Scraper stopped', state };
            
        case 'ENABLE':
            // --- ENTITY ---: Pass entityId to updateScraperState
            await updateScraperState(entityId, { enabled: true });
            return { success: true, message: 'Auto-scraping enabled', state };
            
        case 'DISABLE':
            // --- ENTITY ---: Pass entityId to updateScraperState
            await updateScraperState(entityId, { enabled: false });
            return { success: true, message: 'Auto-scraping disabled', state };
            
        case 'RESET':
            // --- ENTITY ---: Pass entityId to updateScraperState
            await updateScraperState(entityId, {
                lastScannedId: 100000,
                consecutiveBlankCount: 0,
                currentLog: [],
                lastGamesProcessed: []
            });
            return { success: true, message: 'State reset', state };
            
        case 'STATUS':
            // === NEW: Include cache statistics in status ===
            const cacheStats = await getCacheStatistics(entityId, 'LAST_HOUR');
            return { 
                success: true, 
                state,
                cacheStats,
                message: `Status: ${state.isRunning ? 'Running' : 'Stopped'}, Cache Hit Rate: ${cacheStats.averageCacheHitRate}%`
            };
            
        default:
            return { success: false, message: `Unknown operation: ${operation}`, state };
    }
};

// --- ENTITY ---: Added entityId support to getScraperJobs
const getScraperJobs = async (args) => {
    const { entityId, status, limit = 10 } = args || {};
    const scraperJobTable = getTableName('ScraperJob');
    
    let params = {
        TableName: scraperJobTable
    };
    
    // If entityId provided, use GSI to filter by entity
    if (entityId) {
        params.IndexName = 'byEntityScraperJob';
        params.KeyConditionExpression = 'entityId = :entityId';
        params.ExpressionAttributeValues = { ':entityId': entityId };
    }
    
    // Add status filter if provided
    if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { 
            ...params.ExpressionAttributeValues,
            ':status': status 
        };
    }
    
    params.Limit = limit;
    
    const response = entityId 
        ? await ddbDocClient.send(new QueryCommand(params))
        : await ddbDocClient.send(new ScanCommand(params));
    
    return response.Items || [];
};

// --- ENTITY ---: Added entityId support to getScrapeURLs
const getScrapeURLs = async (args) => {
    const { entityId, status, limit = 20 } = args || {};
    const scrapeURLTable = getTableName('ScrapeURL');
    
    let params = {
        TableName: scrapeURLTable,
        Limit: limit
    };
    
    // If entityId provided, use GSI to filter by entity
    if (entityId) {
        params.IndexName = 'byEntityScrapeURL';
        params.KeyConditionExpression = 'entityId = :entityId';
        params.ExpressionAttributeValues = { ':entityId': entityId };
    }
    
    // Add status filter if provided
    if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = {
            ...params.ExpressionAttributeValues,
            ':status': status
        };
    }
    
    const response = entityId
        ? await ddbDocClient.send(new QueryCommand(params))
        : await ddbDocClient.send(new ScanCommand(params));
    
    return response.Items || [];
};