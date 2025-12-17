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

// autoScraper Lambda
// UPDATED v4.0.0:
// - Added `executeJob` operation for scraperManagement integration
// - Configurable thresholds via job payload (not just env vars)
// - Job record created by scraperManagement, updated by autoScraper
// - Added `cancelJob` operation to handle cancellation signals
// - Progress updates published more frequently for real-time UI

const { 
    DynamoDBClient, 
    QueryCommand, 
    PutCommand, 
    UpdateCommand, 
    GetCommand,
    ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

// AppSync Client
const { URL } = require('url');
const https = require('https');
const { default: fetch, Request } = require('node-fetch');
const aws4 = require('aws4');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Lambda Monitoring
const { LambdaMonitoring } = require('./lambda-monitoring'); 

// Environment variables and constants
const LAMBDA_TIMEOUT = parseInt(process.env.AWS_LAMBDA_TIMEOUT || '270', 10) * 1000;
const LAMBDA_TIMEOUT_BUFFER = 45000;
const UPDATE_CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10);

// Default thresholds (can be overridden by job config)
const DEFAULT_MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '5', 10);
const DEFAULT_MAX_CONSECUTIVE_ERRORS = parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '3', 10);
const DEFAULT_MAX_CONSECUTIVE_NOT_FOUND = parseInt(process.env.MAX_CONSECUTIVE_NOT_FOUND || '10', 10);
const DEFAULT_MAX_TOTAL_ERRORS = parseInt(process.env.MAX_TOTAL_ERRORS || '15', 10);

// Prefetch configuration
const PREFETCH_BATCH_SIZE = 100;
const PREFETCH_BUFFER = 20;

// Progress update frequency (publish every N items)
const PROGRESS_UPDATE_FREQUENCY = 5;

// Stop reason enum
const STOP_REASON = {
    COMPLETED: 'COMPLETED',
    TIMEOUT: 'STOPPED_TIMEOUT',
    BLANKS: 'STOPPED_BLANKS',
    NOT_FOUND: 'STOPPED_NOT_FOUND',
    ERROR: 'STOPPED_ERROR',
    MANUAL: 'STOPPED_MANUAL',
    NO_VENUE: 'STOPPED_NO_VENUE',
    MAX_ID: 'STOPPED_MAX_ID'
};

// AppSync Environment Variables
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
const AWS_REGION = process.env.REGION;

// Lambda Monitoring Initialization
const monitoring = new LambdaMonitoring('autoScraper', 'pending-entity');
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// ===================================================================
// TABLE NAMES
// ===================================================================

const getTableName = (modelName) => {
    const envTableName = process.env[`API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`];
    if (envTableName) return envTableName;
    
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Unable to determine table name for ${modelName}`);
    }
    return `${modelName}-${apiId}-${env}`;
};

const scraperStateTable = getTableName('ScraperState');
const scraperJobTable = getTableName('ScraperJob');
const scrapeURLTable = getTableName('ScrapeURL');

// ===================================================================
// ENTITY RESOLUTION
// ===================================================================

function resolveEntityId(event, args) {
    if (args?.entityId) return args.entityId;
    if (event?.entityId) return event.entityId;
    if (event?.detail?.entityId) return event.detail.entityId;
    if (process.env.DEFAULT_ENTITY_ID) return process.env.DEFAULT_ENTITY_ID;
    
    throw new Error(
        '[autoScraper] entityId is required. Provide via args, event, or DEFAULT_ENTITY_ID env var.'
    );
}

// ===================================================================
// APPSYNC GRAPHQL CLIENT
// ===================================================================

async function callGraphQL(query, variables, entityId = null) {
    const endpoint = new URL(APPSYNC_ENDPOINT);
    const operationName = query.match(/(\w+)\s*(\(|{)/)?.[1] || 'unknown';
    
    if (entityId) monitoring.entityId = entityId;
    
    const request = new Request(endpoint.href, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'host': endpoint.host
        },
        body: JSON.stringify({ query, variables })
    });

    const credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
    };
    
    const signedRequest = aws4.sign(request, credentials);
    
    try {
        const response = await fetch(signedRequest);
        const responseBody = await response.json();

        if (responseBody.errors) {
            throw new Error(JSON.stringify(responseBody.errors));
        }
        
        return responseBody.data;
        
    } catch (error) {
        console.error(`[callGraphQL] Error calling ${operationName}:`, error);
        throw error;
    }
}

// GraphQL Mutations
const FETCH_TOURNAMENT_DATA = /* GraphQL */ `
    mutation FetchTournamentData($url: AWSURL, $forceRefresh: Boolean, $entityId: ID, $scraperApiKey: String) {
        fetchTournamentData(url: $url, forceRefresh: $forceRefresh, entityId: $entityId, scraperApiKey: $scraperApiKey) {
            name
            gameStatus
            tournamentId
            sourceUrl
            existingGameId
            doNotScrape
            venueMatch {
                autoAssignedVenue {
                    id
                    name
                }
            }
            results { rank }
            gameStartDateTime
            gameEndDateTime
            registrationStatus
            gameType
            gameVariant
            tournamentType
            prizepoolPaid
            prizepoolCalculated
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            totalUniquePlayers
            totalInitialEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            entityId
            s3Key
            source
            contentHash
            fetchedAt
        }
    }
`;

const SAVE_TOURNAMENT_DATA = /* GraphQL */ `
    mutation SaveTournamentData($input: SaveTournamentInput!) {
        saveTournamentData(input: $input) {
            id
            name
            gameStatus
            venueId
        }
    }
`;

// ===================================================================
// SCRAPER STATE MANAGEMENT
// ===================================================================

async function getOrCreateScraperState(entityId) {
    const stateId = `scraper-${entityId}`;
    try {
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId }
        }));
        
        if (result.Item) {
            return result.Item;
        }
        
        // Create new state
        const now = new Date().toISOString();
        const newState = {
            id: stateId,
            entityId,
            lastScannedId: 0,
            consecutiveBlankCount: 0,
            consecutiveNotFoundCount: 0,
            totalScraped: 0,
            totalErrors: 0,
            enabled: true,
            isRunning: false,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now()
        };
        
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: newState
        }));
        
        return newState;
    } catch (error) {
        console.error('[ScraperState] Error:', error);
        throw error;
    }
}

async function updateScraperState(stateId, updates) {
    const updateExpressions = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};
    
    Object.keys(updates).forEach(key => {
        if (key === 'id') return;
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updates[key];
    });
    
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    updateExpressions.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = Date.now();
    
    await monitoredDdbDocClient.send(new UpdateCommand({
        TableName: scraperStateTable,
        Key: { id: stateId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
}

// ===================================================================
// SCRAPER JOB MANAGEMENT (Updated for scraperManagement integration)
// ===================================================================

async function getScraperJob(jobId) {
    const result = await monitoredDdbDocClient.send(new GetCommand({
        TableName: scraperJobTable,
        Key: { id: jobId }
    }));
    return result.Item || null;
}

async function updateScraperJob(jobId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updates).forEach(key => {
        if (key === 'id') return;
        const attrName = key === 'status' ? '#status' : key;
        const placeholder = `:${key}`;
        
        if (key === 'status') {
            expressionAttributeNames['#status'] = 'status';
        }
        
        updateExpressions.push(`${attrName} = ${placeholder}`);
        expressionAttributeValues[placeholder] = updates[key];
    });
    
    // Always update timestamps
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    updateExpressions.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = Date.now();
    
    updateExpressions.push('#v = if_not_exists(#v, :zero) + :one');
    expressionAttributeNames['#v'] = '_version';
    expressionAttributeValues[':zero'] = 0;
    expressionAttributeValues[':one'] = 1;
    
    const params = {
        TableName: scraperJobTable,
        Key: { id: jobId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues
    };
    
    if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
    }
    
    await monitoredDdbDocClient.send(new UpdateCommand(params));
}

// Legacy: Create job (used by triggerAutoScraping, not executeJob)
async function createScraperJob(entityId, triggerSource, triggeredBy, options = {}) {
    const now = new Date().toISOString();
    const job = {
        id: uuidv4(),
        entityId,
        status: 'RUNNING',
        triggerSource,
        triggeredBy,
        startTime: now,
        totalProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        notFoundCount: 0,
        s3CacheHits: 0,
        ...options,
        createdAt: now,
        updatedAt: now,
        _lastChangedAt: Date.now(),
        _version: 1,
        __typename: 'ScraperJob'
    };
    
    await monitoredDdbDocClient.send(new PutCommand({
        TableName: scraperJobTable,
        Item: job
    }));
    
    return job;
}

// ===================================================================
// URL BUILDING
// ===================================================================

const buildTournamentUrl = (entityId, tournamentId) => {
    // TODO: Look up entity config for URL pattern
    return `https://kingsroom.com.au/dashboard/tournament/view?id=${tournamentId}`;
};

// ===================================================================
// SCRAPEURL PREFETCH CACHE
// ===================================================================

class ScrapeURLPrefetchCache {
    constructor(entityId) {
        this.entityId = entityId;
        this.cache = new Map();
        this.cacheRangeStart = null;
        this.cacheRangeEnd = null;
        this.stats = { prefetchCount: 0, cacheHits: 0, cacheMisses: 0 };
    }
    
    async getStatus(tournamentId) {
        if (this._needsPrefetch(tournamentId)) {
            await this._prefetchBatch(tournamentId);
        }
        
        if (this.cache.has(tournamentId)) {
            this.stats.cacheHits++;
            return this.cache.get(tournamentId);
        }
        
        this.stats.cacheMisses++;
        return { found: false };
    }
    
    _needsPrefetch(tournamentId) {
        if (this.cacheRangeStart === null) return true;
        if (tournamentId < this.cacheRangeStart) return true;
        if (tournamentId > this.cacheRangeEnd - PREFETCH_BUFFER) return true;
        return false;
    }
    
    async _prefetchBatch(startId) {
        const endId = startId + PREFETCH_BATCH_SIZE - 1;
        
        try {
            const result = await monitoredDdbDocClient.send(new QueryCommand({
                TableName: scrapeURLTable,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :entityId',
                FilterExpression: 'tournamentId BETWEEN :startId AND :endId',
                ExpressionAttributeValues: {
                    ':entityId': this.entityId,
                    ':startId': startId,
                    ':endId': endId
                }
            }));
            
            // Clear old entries
            if (this.cacheRangeStart !== null && startId > this.cacheRangeStart) {
                for (const id of this.cache.keys()) {
                    if (id < startId - PREFETCH_BUFFER) {
                        this.cache.delete(id);
                    }
                }
            }
            
            // Populate cache
            for (const item of (result.Items || [])) {
                this.cache.set(item.tournamentId, {
                    found: true,
                    lastScrapeStatus: item.lastScrapeStatus || null,
                    gameStatus: item.gameStatus || null,
                    doNotScrape: item.doNotScrape || false,
                    status: item.status || null
                });
            }
            
            this.cacheRangeStart = startId;
            this.cacheRangeEnd = endId;
            this.stats.prefetchCount++;
            
        } catch (error) {
            console.error(`[ScrapeURLPrefetch] Error: ${error.message}`);
            throw error;
        }
    }
    
    getStats() {
        return { ...this.stats, cacheSize: this.cache.size };
    }
}

// ===================================================================
// SKIP LOGIC
// ===================================================================

function shouldSkipNotPublished(scrapeURLStatus, options) {
    if (!options.skipNotPublished) return false;
    return scrapeURLStatus.found && scrapeURLStatus.gameStatus === 'NOT_PUBLISHED';
}

function shouldSkipNotFoundGap(scrapeURLStatus, options) {
    if (!options.skipNotFoundGaps) return false;
    if (!scrapeURLStatus.found) return false;
    
    const status = (scrapeURLStatus.lastScrapeStatus || '').toUpperCase();
    return status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE';
}

function isNotFoundResponse(parsedData) {
    if (!parsedData) return false;
    const status = parsedData.gameStatus;
    return status === 'NOT_FOUND' || status === 'NOT_IN_USE' || status === 'NOT_PUBLISHED';
}

// ===================================================================
// MAIN SCRAPING ENGINE (with configurable thresholds)
// ===================================================================

async function performScrapingEnhanced(entityId, scraperState, jobId, options = {}) {
    const startTime = Date.now();
    
    // Extract thresholds from options (passed from scraperManagement) with defaults
    const MAX_CONSECUTIVE_NOT_FOUND = options.maxConsecutiveNotFound || DEFAULT_MAX_CONSECUTIVE_NOT_FOUND;
    const MAX_CONSECUTIVE_ERRORS = options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS;
    const MAX_CONSECUTIVE_BLANKS = options.maxConsecutiveBlanks || DEFAULT_MAX_CONSECUTIVE_BLANKS;
    const MAX_TOTAL_ERRORS = options.maxTotalErrors || DEFAULT_MAX_TOTAL_ERRORS;
    
    console.log(`[ScrapingEngine] Using thresholds: NOT_FOUND=${MAX_CONSECUTIVE_NOT_FOUND}, ERRORS=${MAX_CONSECUTIVE_ERRORS}, BLANKS=${MAX_CONSECUTIVE_BLANKS}, TOTAL_ERRORS=${MAX_TOTAL_ERRORS}`);
    
    const results = {
        totalProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        notFoundCount: 0,
        s3CacheHits: 0,
        consecutiveBlanks: 0,
        consecutiveNotFound: 0,
        consecutiveErrors: 0,
        currentId: null,
        lastProcessedId: scraperState.lastScannedId,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
    };
    
    // Determine ID range based on mode
    let currentId, endId;
    const mode = options.mode || 'bulk';
    
    switch (mode) {
        case 'bulk':
            currentId = (options.startId || scraperState.lastScannedId) + 1;
            endId = currentId + (options.bulkCount || 10) - 1;
            break;
        case 'range':
            currentId = options.startId || scraperState.lastScannedId + 1;
            endId = options.endId || currentId + 100;
            break;
        case 'auto':
            currentId = scraperState.lastScannedId + 1;
            endId = options.maxId || currentId + 10000; // High default for auto
            break;
        case 'gaps':
            // Special handling below
            break;
        case 'refresh':
            // TODO: Implement refresh mode
            break;
        default:
            currentId = scraperState.lastScannedId + 1;
            endId = currentId + (options.maxGames || 100);
    }
    
    const maxId = options.maxId || null;
    
    // Handle gaps mode specially
    if (mode === 'gaps' && options.gapIds?.length > 0) {
        return await processGapIds(entityId, jobId, options.gapIds, options);
    }
    
    // Initialize prefetch cache
    let prefetchCache = null;
    if (options.skipNotPublished || options.skipNotFoundGaps) {
        prefetchCache = new ScrapeURLPrefetchCache(entityId);
    }
    
    console.log(`[ScrapingEngine] Starting ${mode} mode: ID ${currentId} to ${endId}${maxId ? `, maxId: ${maxId}` : ''}`);
    
    // Main scraping loop
    while (currentId <= endId) {
        results.currentId = currentId;
        
        // Check cancellation (job status changed to STOPPED_MANUAL)
        if (results.totalProcessed % 10 === 0) {
            const job = await getScraperJob(jobId);
            if (job?.status === 'STOPPED_MANUAL') {
                console.log(`[ScrapingEngine] Job cancelled by user at ID ${currentId}`);
                results.stopReason = STOP_REASON.MANUAL;
                break;
            }
        }
        
        // Check Max ID
        if (maxId && currentId > maxId) {
            console.log(`[ScrapingEngine] Reached Max ID (${maxId})`);
            results.stopReason = STOP_REASON.MAX_ID;
            break;
        }
        
        // Check timeout
        if (Date.now() - startTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout at ID ${currentId}`);
            results.stopReason = STOP_REASON.TIMEOUT;
            break;
        }
        
        const url = buildTournamentUrl(entityId, currentId);
        results.lastProcessedId = currentId;

        // Skip checks using prefetch cache
        if (prefetchCache) {
            try {
                const scrapeURLStatus = await prefetchCache.getStatus(currentId);
                
                if (shouldSkipNotPublished(scrapeURLStatus, options)) {
                    results.gamesSkipped++;
                    currentId++;
                    continue;
                }
                
                if (shouldSkipNotFoundGap(scrapeURLStatus, options)) {
                    results.gamesSkipped++;
                    currentId++;
                    continue;
                }
            } catch (error) {
                console.warn(`[ScrapingEngine] Prefetch error, continuing: ${error.message}`);
            }
        }
        
        results.totalProcessed++;

        try {
            // Fetch via AppSync
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: url,
                forceRefresh: options.forceRefresh || false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;

            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }

            // Check response type
            const isNotFound = isNotFoundResponse(parsedData);
            
            if (isNotFound) {
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveErrors = 0; // Reset on successful fetch
                
                console.log(`[ScrapingEngine] ID ${currentId}: ${parsedData.gameStatus} (consecutive: ${results.consecutiveNotFound}/${MAX_CONSECUTIVE_NOT_FOUND})`);
                
                if (results.consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && mode !== 'gaps') {
                    console.log(`[ScrapingEngine] NOT_FOUND threshold reached: ${results.consecutiveNotFound}`);
                    results.stopReason = STOP_REASON.NOT_FOUND;
                    break;
                }
                
                if (results.consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && mode !== 'gaps') {
                    console.log(`[ScrapingEngine] BLANKS threshold reached: ${results.consecutiveBlanks}`);
                    results.stopReason = STOP_REASON.BLANKS;
                    break;
                }
                
            } else {
                // Valid game data
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.consecutiveErrors = 0;
                
                // Save if enabled
                if (options.saveToDatabase !== false) {
                    const venueId = parsedData.venueMatch?.autoAssignedVenue?.id || options.defaultVenueId;
                    
                    if (!venueId) {
                        console.warn(`[ScrapingEngine] No venue for ID ${currentId}, skipping save`);
                        results.gamesSkipped++;
                    } else {
                        try {
                            const saveResult = await callGraphQL(SAVE_TOURNAMENT_DATA, {
                                input: {
                                    url: url,
                                    venueId: venueId,
                                    parsedData: parsedData,
                                    entityId: entityId
                                }
                            });
                            
                            if (parsedData.existingGameId) {
                                results.gamesUpdated++;
                            } else {
                                results.newGamesScraped++;
                            }
                        } catch (saveError) {
                            console.error(`[ScrapingEngine] Save error for ID ${currentId}:`, saveError);
                            results.errors++;
                        }
                    }
                } else {
                    // Scrape-only mode
                    results.newGamesScraped++;
                }
            }
            
        } catch (error) {
            console.error(`[ScrapingEngine] Error at ID ${currentId}:`, error.message);
            results.errors++;
            results.consecutiveErrors++;
            results.lastErrorMessage = error.message;
            
            // Reset not-found counters on error
            results.consecutiveNotFound = 0;
            results.consecutiveBlanks = 0;
            
            if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.log(`[ScrapingEngine] ERRORS threshold reached: ${results.consecutiveErrors}`);
                results.stopReason = STOP_REASON.ERROR;
                break;
            }
            
            if (results.errors >= MAX_TOTAL_ERRORS) {
                console.log(`[ScrapingEngine] TOTAL ERRORS threshold reached: ${results.errors}`);
                results.stopReason = STOP_REASON.ERROR;
                results.lastErrorMessage = `Total errors exceeded: ${results.errors}`;
                break;
            }
        }

        // Publish progress update
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            await updateScraperJob(jobId, {
                totalProcessed: results.totalProcessed,
                currentId: currentId,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
                blanks: results.blanks,
                s3CacheHits: results.s3CacheHits,
                consecutiveNotFound: results.consecutiveNotFound,
                consecutiveErrors: results.consecutiveErrors,
                consecutiveBlanks: results.consecutiveBlanks,
            });
        }

        currentId++;
    }
    
    // Update scraper state
    await updateScraperState(scraperState.id, {
        lastScannedId: results.lastProcessedId,
        consecutiveBlankCount: results.consecutiveBlanks,
        consecutiveNotFoundCount: results.consecutiveNotFound,
        totalScraped: (scraperState.totalScraped || 0) + results.newGamesScraped,
        totalErrors: (scraperState.totalErrors || 0) + results.errors
    });
    
    if (prefetchCache) {
        console.log(`[ScrapingEngine] Prefetch stats:`, prefetchCache.getStats());
    }
    
    return results;
}

// Process specific gap IDs
async function processGapIds(entityId, jobId, gapIds, options) {
    console.log(`[ScrapingEngine] Processing ${gapIds.length} gap IDs`);
    
    const results = {
        totalProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        notFoundCount: 0,
        s3CacheHits: 0,
        consecutiveErrors: 0,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
    };
    
    for (const tournamentId of gapIds) {
        const url = buildTournamentUrl(entityId, tournamentId);
        results.totalProcessed++;
        
        try {
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: url,
                forceRefresh: options.forceRefresh || false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            
            if (isNotFoundResponse(parsedData)) {
                results.notFoundCount++;
                results.blanks++;
            } else if (options.saveToDatabase !== false) {
                const venueId = parsedData.venueMatch?.autoAssignedVenue?.id || options.defaultVenueId;
                if (venueId) {
                    await callGraphQL(SAVE_TOURNAMENT_DATA, {
                        input: { url, venueId, parsedData, entityId }
                    });
                    results.newGamesScraped++;
                }
            }
            
            results.consecutiveErrors = 0;
            
        } catch (error) {
            console.error(`[ScrapingEngine] Gap error at ID ${tournamentId}:`, error.message);
            results.errors++;
            results.consecutiveErrors++;
        }
        
        // Progress update
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            await updateScraperJob(jobId, {
                totalProcessed: results.totalProcessed,
                currentId: tournamentId,
                newGamesScraped: results.newGamesScraped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
            });
        }
    }
    
    return results;
}

// ===================================================================
// CONTROL OPERATIONS
// ===================================================================

async function controlScraperOperation(operation, entityId) {
    const scraperState = await getOrCreateScraperState(entityId);
    
    switch (operation) {
        case 'START':
            await updateScraperState(scraperState.id, { enabled: true, isRunning: true });
            return { success: true, message: 'Scraper started', state: await getOrCreateScraperState(entityId) };
            
        case 'STOP':
            await updateScraperState(scraperState.id, { enabled: false, isRunning: false });
            return { success: true, message: 'Scraper stopped', state: await getOrCreateScraperState(entityId) };
            
        case 'ENABLE':
            await updateScraperState(scraperState.id, { enabled: true });
            return { success: true, message: 'Scraper enabled', state: await getOrCreateScraperState(entityId) };
            
        case 'DISABLE':
            await updateScraperState(scraperState.id, { enabled: false });
            return { success: true, message: 'Scraper disabled', state: await getOrCreateScraperState(entityId) };
            
        case 'STATUS':
            return { success: true, state: scraperState };
            
        case 'RESET':
            await updateScraperState(scraperState.id, {
                lastScannedId: 1,
                consecutiveBlankCount: 0,
                consecutiveNotFoundCount: 0,
                totalScraped: 0,
                totalErrors: 0,
                isRunning: false
            });
            return { success: true, message: 'Scraper reset', state: await getOrCreateScraperState(entityId) };
            
        default:
            throw new Error(`Unknown control operation: ${operation}`);
    }
}

// ===================================================================
// NEW: executeJob - Entry point from scraperManagement
// ===================================================================

async function executeJob(event) {
    const {
        jobId,
        entityId,
        mode = 'bulk',
        
        // Scrape options
        useS3 = true,
        forceRefresh = false,
        skipNotPublished = true,
        skipNotFoundGaps = true,
        skipInProgress = false,
        ignoreDoNotScrape = false,
        
        // Save options
        saveToDatabase = true,
        defaultVenueId,
        
        // Mode params
        bulkCount,
        startId,
        endId,
        maxId,
        gapIds,
        
        // Thresholds (from scraperManagement/frontend)
        maxConsecutiveNotFound,
        maxConsecutiveErrors,
        maxConsecutiveBlanks,
        maxTotalErrors,
    } = event;

    if (!jobId) {
        throw new Error('executeJob requires jobId');
    }
    if (!entityId) {
        throw new Error('executeJob requires entityId');
    }

    console.log(`[executeJob] Starting job ${jobId} for entity ${entityId}, mode: ${mode}`);
    console.log(`[executeJob] Thresholds: NOT_FOUND=${maxConsecutiveNotFound}, ERRORS=${maxConsecutiveErrors}, BLANKS=${maxConsecutiveBlanks}`);

    monitoring.entityId = entityId;

    // Get scraper state
    const scraperState = await getOrCreateScraperState(entityId);
    
    // Mark as running
    await updateScraperState(scraperState.id, {
        isRunning: true,
        lastRunStartTime: new Date().toISOString(),
        currentJobId: jobId
    });

    try {
        // Execute scraping with all passed options
        const results = await performScrapingEnhanced(entityId, scraperState, jobId, {
            mode,
            useS3,
            forceRefresh,
            skipNotPublished,
            skipNotFoundGaps,
            skipInProgress,
            ignoreDoNotScrape,
            saveToDatabase,
            defaultVenueId,
            bulkCount,
            startId,
            endId,
            maxId,
            gapIds,
            maxConsecutiveNotFound,
            maxConsecutiveErrors,
            maxConsecutiveBlanks,
            maxTotalErrors,
        });

        // Update job with final results
        const finalStatus = results.stopReason || STOP_REASON.COMPLETED;
        await updateScraperJob(jobId, {
            status: finalStatus,
            totalProcessed: results.totalProcessed,
            currentId: results.lastProcessedId,
            newGamesScraped: results.newGamesScraped,
            gamesUpdated: results.gamesUpdated,
            gamesSkipped: results.gamesSkipped,
            errors: results.errors,
            notFoundCount: results.notFoundCount,
            blanks: results.blanks,
            s3CacheHits: results.s3CacheHits,
            consecutiveNotFound: results.consecutiveNotFound,
            consecutiveErrors: results.consecutiveErrors,
            consecutiveBlanks: results.consecutiveBlanks,
            stopReason: results.stopReason !== STOP_REASON.COMPLETED ? results.stopReason : null,
            lastErrorMessage: results.lastErrorMessage,
            endTime: new Date().toISOString(),
            durationSeconds: Math.floor((Date.now() - new Date(scraperState.lastRunStartTime || Date.now()).getTime()) / 1000)
        });

        console.log(`[executeJob] Job ${jobId} completed: ${finalStatus}`);
        console.log(`[executeJob] Results:`, JSON.stringify(results, null, 2));

        return {
            success: finalStatus === STOP_REASON.COMPLETED,
            jobId,
            status: finalStatus,
            results
        };

    } catch (error) {
        console.error(`[executeJob] Job ${jobId} failed:`, error);
        
        await updateScraperJob(jobId, {
            status: 'FAILED',
            stopReason: 'FAILED',
            lastErrorMessage: error.message,
            endTime: new Date().toISOString()
        });

        throw error;

    } finally {
        // Mark as not running
        await updateScraperState(scraperState.id, {
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            currentJobId: null
        });
    }
}

// ===================================================================
// NEW: cancelJob - Handle cancellation from scraperManagement
// ===================================================================

async function cancelJob(event) {
    const { jobId } = event;
    
    if (!jobId) {
        return { success: false, error: 'jobId required' };
    }

    console.log(`[cancelJob] Marking job ${jobId} for cancellation`);
    
    // The job status is already set to STOPPED_MANUAL by scraperManagement
    // The running executeJob will check this and stop
    // This is just an acknowledgment
    
    return {
        success: true,
        message: `Job ${jobId} marked for cancellation`
    };
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[AutoScraper] Event:', JSON.stringify(event, null, 2));
    
    const isEventBridge = event.source === 'aws.events' || event['detail-type'];
    const isAppSync = !!event.fieldName;
    
    try {
        // NEW: Handle executeJob operation (from scraperManagement)
        if (event.operation === 'executeJob') {
            return await executeJob(event);
        }
        
        // NEW: Handle cancelJob operation
        if (event.operation === 'cancelJob') {
            return await cancelJob(event);
        }
        
        // Legacy: AppSync operations
        const operation = event.operation || event.fieldName;
        const args = event.arguments || event;
        
        const entityId = resolveEntityId(event, args);
        monitoring.entityId = entityId;
        
        // Control operations
        if (operation === 'controlScraperOperation') {
            return await controlScraperOperation(args.operation, entityId);
        }
        
        if (operation === 'getScraperControlState') {
            return await controlScraperOperation('STATUS', entityId);
        }

        // Legacy: triggerAutoScraping (creates its own job)
        if (operation === 'triggerAutoScraping') {
            const scraperState = await getOrCreateScraperState(entityId);

            if (scraperState.isRunning) {
                return { success: false, message: 'Scraper is already running', state: scraperState };
            }
            
            if (!scraperState.enabled) {
                return { success: false, message: 'Scraper is disabled', state: scraperState };
            }
            
            await updateScraperState(scraperState.id, {
                isRunning: true,
                lastRunStartTime: new Date().toISOString()
            });
            
            const triggerSource = isEventBridge ? 'SCHEDULED' : (args.triggerSource || 'MANUAL');
            const triggeredBy = isEventBridge ? 'eventbridge' : (args.triggeredBy || 'user');
            
            const job = await createScraperJob(entityId, triggerSource, triggeredBy, {
                maxGames: args.maxGames,
                maxId: args.maxId,
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId
            });

            const scrapeResults = await performScrapingEnhanced(entityId, scraperState, job.id, {
                mode: 'bulk',
                maxGames: args.maxGames,
                maxId: args.maxId,
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId,
                forceRefresh: args.forceRefresh,
                skipNotPublished: args.skipNotPublished,
                skipNotFoundGaps: args.skipNotFoundGaps
            });
            
            const jobStatus = scrapeResults.stopReason || STOP_REASON.COMPLETED;
            
            await updateScraperJob(job.id, {
                ...scrapeResults,
                status: jobStatus,
                endTime: new Date().toISOString(),
                durationSeconds: Math.floor((Date.now() - new Date(job.startTime).getTime()) / 1000)
            });
            
            await updateScraperState(scraperState.id, {
                isRunning: false,
                lastRunEndTime: new Date().toISOString()
            });
            
            return {
                success: jobStatus === STOP_REASON.COMPLETED,
                jobId: job.id,
                state: await getOrCreateScraperState(entityId),
                results: scrapeResults,
                stopReason: jobStatus
            };
        }
        
        throw new Error(`Unknown operation: ${operation}`);
        
    } catch (error) {
        console.error('[AutoScraper] Error:', error);
        
        // Try to reset running state
        try {
            const cleanupEntityId = resolveEntityId(event, event.arguments || event);
            if (cleanupEntityId) {
                const scraperState = await getOrCreateScraperState(cleanupEntityId);
                if (scraperState.isRunning) {
                    await updateScraperState(scraperState.id, { 
                        isRunning: false, 
                        lastRunEndTime: new Date().toISOString() 
                    });
                }
            }
        } catch (stateError) {
            console.error('[AutoScraper] Failed to reset state:', stateError);
        }

        if (event.fieldName) {
            throw error;
        }
        
        return { success: false, error: error.message };
        
    } finally {
        if (monitoring) {
            await monitoring.flush();
        }
    }
};