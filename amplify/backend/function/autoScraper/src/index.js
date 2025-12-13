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

// autoScraper-unified-proper.js
// REFACTORED: This function is now a "headless client" of the AppSync API.
// It no longer invokes webScraperFunction directly. Instead, it calls the
// same fetchTournamentData and saveTournamentData mutations as the frontend.
//
// UPDATED v3.1.0: 
// - Added ScrapeURL batch prefetch optimization (reduces DynamoDB reads by ~50x)
// - Prefetches 100 ScrapeURL records at a time instead of 1-by-1 lookups

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

// --- NEW: AppSync Client (for calling our own API) ---
const { URL } = require('url');
const https = require('https');
const { default: fetch, Request } = require('node-fetch');
const aws4 = require('aws4');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring'); 

// Environment variables and constants
const LAMBDA_TIMEOUT = parseInt(process.env.AWS_LAMBDA_TIMEOUT || '270', 10) * 1000;
const LAMBDA_TIMEOUT_BUFFER = 45000;
const UPDATE_CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10);
const MAX_LOG_SIZE = 25;
const MAX_GAME_LIST_SIZE = 10;

// Error thresholds
const MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '2', 10);
const MAX_CONSECUTIVE_ERRORS = parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '1', 10);
const MAX_CONSECUTIVE_NOT_FOUND = parseInt(process.env.MAX_CONSECUTIVE_NOT_FOUND || '25', 10);

// ===================================================================
// NEW v3.1.0: Prefetch Configuration
// ===================================================================
const PREFETCH_BATCH_SIZE = 100;  // Number of IDs to prefetch at once
const PREFETCH_BUFFER = 20;       // Refetch when within this many IDs of cache end

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

// --- AppSync Environment Variables ---
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
const AWS_REGION = process.env.REGION;

// --- Lambda Monitoring Initialization ---
const monitoring = new LambdaMonitoring('autoScraper', 'pending-entity');
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// ===================================================================
// HELPER: Resolve Entity ID
// ===================================================================
function resolveEntityId(event, args) {
    if (args?.entityId) {
        console.log('[EntityResolver] Using entityId from args:', args.entityId);
        return args.entityId;
    }
    
    if (event?.entityId) {
        console.log('[EntityResolver] Using entityId from event payload:', event.entityId);
        return event.entityId;
    }
    
    if (event?.detail?.entityId) {
        console.log('[EntityResolver] Using entityId from event.detail:', event.detail.entityId);
        return event.detail.entityId;
    }
    
    if (process.env.DEFAULT_ENTITY_ID) {
        console.log('[EntityResolver] Using entityId from environment variable:', process.env.DEFAULT_ENTITY_ID);
        return process.env.DEFAULT_ENTITY_ID;
    }
    
    throw new Error(
        '[autoScraper] entityId is required but was not provided. ' +
        'Provide entityId via: (1) args.entityId from AppSync, ' +
        '(2) event.entityId from EventBridge, or ' +
        '(3) DEFAULT_ENTITY_ID environment variable.'
    );
}

async function getAllActiveEntityIds() {
    const entityTable = getTableName('Entity');
    
    try {
        const result = await monitoredDdbDocClient.send(new ScanCommand({
            TableName: entityTable,
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':active': { BOOL: true }
            },
            ProjectionExpression: 'id, entityName'
        }));
        
        const entities = (result.Items || []).map(item => ({
            id: item.id.S,
            name: item.entityName.S
        }));
        
        console.log(`[EntityResolver] Found ${entities.length} active entities`);
        return entities;
    } catch (error) {
        console.error('[EntityResolver] Error fetching entities:', error);
        throw error;
    }
}

// ===================================================================
// AppSync GraphQL Client
// ===================================================================
async function callGraphQL(query, variables, entityId = null) {
    const endpoint = new URL(APPSYNC_ENDPOINT);
    const operationName = query.match(/(\w+)\s*(\(|{)/)[1];
    
    if (entityId) monitoring.entityId = entityId;
    monitoring.trackOperation(`APPSYNC_CALL_START`, 'AppSync', operationName, { entityId });
    
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
        
        monitoring.trackOperation(`APPSYNC_CALL_SUCCESS`, 'AppSync', operationName, { entityId });
        return responseBody.data;
        
    } catch (error) {
        console.error(`[callGraphQL] Error calling ${operationName}:`, error);
        monitoring.trackOperation(`APPSYNC_CALL_ERROR`, 'AppSync', operationName, { entityId, error: error.message });
        throw error;
    }
}

// --- GraphQL Mutations ---
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
            results {
                rank
            }
            gameStartDateTime
            gameEndDateTime
            registrationStatus
            gameType
            gameVariant
            tournamentType
            prizepoolPaid
            prizepoolCalculated
            totalBuyInsCollected
            projectedRakeRevenue
            rakeSubsidy
            prizepoolPlayerContributions
            prizepoolAddedValue
            prizepoolSurplus
            guaranteeOverlayCost
            gameProfit
            fullRakeRealized
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
            playersRemaining
            totalChipsInPlay
            averagePlayerStack
            seriesName
            isRegular
            isSeries
            isSatellite
            gameFrequency
            gameTags
            levels {
                levelNumber
                durationMinutes
                smallBlind
                bigBlind
                ante
            }
            breaks {
                levelNumberBeforeBreak
                durationMinutes
            }
            entries {
                name
            }
            seating {
                name
                table
                seat
                playerStack
            }
            results {
                rank
                name
                winnings
                points
                isQualification
            }
            tables {
                tableName
                seats {
                    seat
                    isOccupied
                    playerName
                    playerStack
                }
            }
            rawHtml
            isNewStructure
            structureLabel
            foundKeys
            entityId
            s3Key
            source
            contentHash
            fetchedAt
            wasForced
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
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const envTableName = process.env[`API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`];
    if (envTableName) {
        return envTableName;
    }
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Unable to determine table name for ${modelName}`);
    }
    return `${modelName}-${apiId}-${env}`;
};

// Table names
const scraperStateTable = getTableName('ScraperState');
const scraperJobTable = getTableName('ScraperJob');
const scrapeURLTable = getTableName('ScrapeURL');

const buildTournamentUrl = (entityId, tournamentId) => {
    // TODO: This should look up entityConfig. For now, hardcoding pattern.
    return `https://kingsroom.com.au/dashboard/tournament/view?id=${tournamentId}`;
};

// ===================================================================
// ScraperState Management
// ===================================================================

async function getOrCreateScraperState(entityId) {
    const stateId = `scraper-${entityId}`;
    try {
        const getParams = {
            TableName: scraperStateTable,
            Key: { id: stateId }
        };
        const result = await monitoredDdbDocClient.send(new GetCommand(getParams));
        if (result.Item) {
            return result.Item;
        }
    } catch (error) {
        console.log('[ScraperState] Not found, creating new state');
    }
    
    const now = new Date().toISOString();
    const newState = {
        id: stateId,
        entityId,
        isRunning: false,
        lastScannedId: 1,
        lastRunStartTime: null,
        lastRunEndTime: null,
        consecutiveBlankCount: 0,
        consecutiveNotFoundCount: 0,
        totalScraped: 0,
        totalErrors: 0,
        enabled: true,
        currentLog: [],
        lastGamesProcessed: [],
        createdAt: now,
        updatedAt: now,
        _lastChangedAt: Date.now(),
        _version: 1,
        __typename: 'ScraperState'
    };
    await monitoredDdbDocClient.send(new PutCommand({
        TableName: scraperStateTable,
        Item: newState
    }));
    return newState;
}

async function updateScraperState(stateId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updates).forEach(key => {
        if (key === 'id') return;
        const placeholder = `:${key}`;
        updateExpressions.push(`${key} = ${placeholder}`);
        expressionAttributeValues[placeholder] = updates[key];
    });
    
    const now = new Date();
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now.toISOString();
    
    updateExpressions.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = now.getTime();
    
    updateExpressions.push('#v = if_not_exists(#v, :zero) + :one');
    expressionAttributeNames['#v'] = '_version';
    expressionAttributeValues[':zero'] = 0;
    expressionAttributeValues[':one'] = 1;
    
    const params = {
        TableName: scraperStateTable,
        Key: { id: stateId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues
    };
    
    if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
    }
    await monitoredDdbDocClient.send(new UpdateCommand(params));
}

async function logStatus(entityId, level, message, details = '') {
    const state = await getOrCreateScraperState(entityId);
    const newEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        details
    };
    const newLog = [newEntry, ...(state.currentLog || [])].slice(0, MAX_LOG_SIZE);
    await updateScraperState(state.id, { currentLog: newLog });
}

async function updateGameList(entityId, id, name, status) {
    const state = await getOrCreateScraperState(entityId);
    const newGameEntry = {
        id: id.toString(),
        name,
        status
    };
    const newList = [newGameEntry, ...(state.lastGamesProcessed || [])].slice(0, MAX_GAME_LIST_SIZE);
    await updateScraperState(state.id, { lastGamesProcessed: newList });
}

// ===================================================================
// ScraperJob Management
// ===================================================================

async function createScraperJob(entityId, triggerSource, triggeredBy, options = {}) {
    const now = new Date().toISOString();
    const jobId = uuidv4();
    
    const job = {
        id: jobId,
        jobId: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entityId,
        triggerSource,
        triggeredBy: triggeredBy || 'system',
        startTime: now,
        status: 'RUNNING',
        maxGames: options.maxGames || null,
        maxId: options.maxId || null,
        targetURLs: options.targetURLs || [],
        isFullScan: options.isFullScan || false,
        startId: options.startId || null,
        endId: options.endId || null,
        totalURLsProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        notFoundCount: 0,
        s3CacheHits: 0,
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

async function updateScraperJob(jobId, updates) {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updates).forEach(key => {
        if (key === 'id') return;
        const placeholder = `:${key}`;
        if (key === 'status') {
            updateExpressions.push(`#status = ${placeholder}`);
            expressionAttributeNames['#status'] = 'status';
        } else {
            updateExpressions.push(`${key} = ${placeholder}`);
        }
        expressionAttributeValues[placeholder] = updates[key];
    });
    
    const now = new Date();
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now.toISOString();
    
    updateExpressions.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = now.getTime();
    
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

function mapToSaveDataInput(data) {
    if (!data) {
        throw new Error("Cannot map null data to SaveDataInput");
    }
    
    return {
        name: data.name,
        gameStartDateTime: data.gameStartDateTime,
        gameEndDateTime: data.gameEndDateTime,
        gameStatus: data.gameStatus,
        registrationStatus: data.registrationStatus,
        gameVariant: data.gameVariant,
        gameType: data.gameType,
        prizepoolPaid: data.prizepoolPaid,
        prizepoolCalculated: data.prizepoolCalculated,
        totalUniquePlayers: data.totalUniquePlayers,
        totalInitialEntries: data.totalInitialEntries,
        totalEntries: data.totalEntries,
        totalRebuys: data.totalRebuys,
        totalAddons: data.totalAddons,
        totalDuration: data.totalDuration,
        gameTags: data.gameTags,
        tournamentType: data.tournamentType,
        buyIn: data.buyIn,
        rake: data.rake,
        startingStack: data.startingStack,
        hasGuarantee: data.hasGuarantee,
        guaranteeAmount: data.guaranteeAmount,
        levels: data.levels?.map(l => ({
            levelNumber: l.levelNumber,
            durationMinutes: l.durationMinutes,
            smallBlind: l.smallBlind,
            bigBlind: l.bigBlind,
            ante: l.ante,
            breakMinutes: l.breakMinutes
        })) || []
    };
}

// ===================================================================
// NEW v3.1.0: ScrapeURL Prefetch Cache
// ===================================================================
// Reduces DynamoDB reads by ~50x by batching lookups

class ScrapeURLPrefetchCache {
    constructor(entityId) {
        this.entityId = entityId;
        this.cache = new Map();
        this.cacheRangeStart = null;
        this.cacheRangeEnd = null;
        this.stats = {
            prefetchCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            dbQueriesAvoided: 0
        };
    }
    
    async getStatus(tournamentId) {
        // Check if we need to prefetch
        if (this._needsPrefetch(tournamentId)) {
            await this._prefetchBatch(tournamentId);
        }
        
        // Look up in cache
        if (this.cache.has(tournamentId)) {
            this.stats.cacheHits++;
            return this.cache.get(tournamentId);
        }
        
        // Not in cache means it wasn't in DB during prefetch
        this.stats.cacheMisses++;
        return { found: false };
    }
    
    _needsPrefetch(tournamentId) {
        if (this.cacheRangeStart === null || this.cacheRangeEnd === null) {
            return true;
        }
        if (tournamentId < this.cacheRangeStart) {
            return true;
        }
        if (tournamentId > this.cacheRangeEnd - PREFETCH_BUFFER) {
            return true;
        }
        return false;
    }
    
    async _prefetchBatch(startId) {
        const endId = startId + PREFETCH_BATCH_SIZE - 1;
        
        console.log(`[ScrapeURLPrefetch] Prefetching IDs ${startId} to ${endId} for entity ${this.entityId}`);
        
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
            
            // Clear old cache entries before this range
            if (this.cacheRangeStart !== null && startId > this.cacheRangeStart) {
                for (const id of this.cache.keys()) {
                    if (id < startId - PREFETCH_BUFFER) {
                        this.cache.delete(id);
                    }
                }
            }
            
            // Populate cache with results
            const items = result.Items || [];
            for (const item of items) {
                this.cache.set(item.tournamentId, {
                    found: true,
                    lastScrapeStatus: item.lastScrapeStatus || null,
                    gameStatus: item.gameStatus || null,
                    doNotScrape: item.doNotScrape || false,
                    status: item.status || null
                });
            }
            
            // Update cache range
            this.cacheRangeStart = startId;
            this.cacheRangeEnd = endId;
            
            // Update stats
            this.stats.prefetchCount++;
            this.stats.dbQueriesAvoided += PREFETCH_BATCH_SIZE - 1;
            
            console.log(`[ScrapeURLPrefetch] Cached ${items.length} records for IDs ${startId}-${endId}`);
            
        } catch (error) {
            console.error(`[ScrapeURLPrefetch] Error prefetching batch: ${error.message}`);
            throw error;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            cacheRange: this.cacheRangeStart !== null 
                ? `${this.cacheRangeStart}-${this.cacheRangeEnd}` 
                : 'empty'
        };
    }
    
    clear() {
        this.cache.clear();
        this.cacheRangeStart = null;
        this.cacheRangeEnd = null;
    }
}

// ===================================================================
// ScrapeURL Skip Logic (unchanged, but now uses prefetch cache)
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
    return status === 'NOT_FOUND' || 
           status === 'NOT_IN_USE' || 
           status === 'NOT_PUBLISHED';
}

// ===================================================================
// Update Candidates (for RUNNING games)
// ===================================================================

async function getUpdateCandidateURLs(entityId, limit = 50) {
    const candidates = [];
    let lastEvaluatedKey = null;
    const cutoffTime = new Date(Date.now() - UPDATE_CHECK_INTERVAL_MS).toISOString();
    
    do {
        const params = {
            TableName: scrapeURLTable,
            IndexName: 'byEntityScrapeURL',
            KeyConditionExpression: 'entityId = :entityId',
            FilterExpression: `
                #status = :active 
                AND doNotScrape = :false 
                AND gameStatus = :running
                AND (lastInteractionAt < :cutoff OR attribute_not_exists(lastInteractionAt))
            `,
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':entityId': entityId,
                ':active': 'ACTIVE',
                ':false': false,
                ':running': 'RUNNING',
                ':cutoff': cutoffTime
            },
            Limit: Math.min(limit - candidates.length, 25),
            ExclusiveStartKey: lastEvaluatedKey
        };
        
        const result = await monitoredDdbDocClient.send(new QueryCommand(params));
        
        if (result.Items) {
            candidates.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey && candidates.length < limit);
    
    console.log(`[UpdateCandidates] Found ${candidates.length} RUNNING games to update`);
    return candidates;
}

async function processUpdateCandidates(entityId, scraperJob) {
    const candidates = await getUpdateCandidateURLs(entityId, 50);
    
    if (candidates.length === 0) {
        console.log('[UpdateCandidates] No candidates to update');
        return {
            totalProcessed: 0,
            updated: 0,
            errors: 0,
            s3CacheHits: 0
        };
    }
    
    const results = {
        totalProcessed: 0,
        updated: 0,
        errors: 0,
        s3CacheHits: 0
    };
    
    for (const scrapeURL of candidates) {
        monitoring.trackOperation('CANDIDATE_FETCH', 'Game', scrapeURL.tournamentId, { entityId });
        try {
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: scrapeURL.url,
                forceRefresh: false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;
            
            results.totalProcessed++;
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            results.updated++;
            
        } catch (error) {
            console.error(`[UpdateCandidates] Error processing ${scrapeURL.url}:`, error);
            results.errors++;
        }
    }
    
    return results;
}

// ===================================================================
// MAIN SCRAPING ENGINE (with prefetch optimization)
// ===================================================================

async function performScrapingEnhanced(entityId, scraperState, scraperJob, options = {}) {
    const startTime = Date.now();
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
        lastProcessedId: scraperState.lastScannedId,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
        prefetchStats: null  // NEW: Track prefetch performance
    };
    
    let currentId = options.startId || scraperState.lastScannedId;
    const endId = options.endId || currentId + (options.maxGames || 1000);
    const maxId = options.maxId || null;
    
    // Initialize from saved state
    let consecutiveBlanks = scraperState.consecutiveBlankCount || 0;
    let consecutiveNotFound = scraperState.consecutiveNotFoundCount || 0;
    let consecutiveErrors = 0;
    
    // =========================================================================
    // NEW v3.1.0: Initialize prefetch cache for skip condition checks
    // =========================================================================
    let prefetchCache = null;
    if (options.skipNotPublished || options.skipNotFoundGaps) {
        prefetchCache = new ScrapeURLPrefetchCache(entityId);
        console.log(`[ScrapingEngine] Initialized ScrapeURL prefetch cache (batch size: ${PREFETCH_BATCH_SIZE})`);
    }
    
    console.log(`[ScrapingEngine] Starting from ID ${currentId} to ${endId}${maxId ? `, maxId: ${maxId}` : ''}`);
    if (options.skipNotPublished || options.skipNotFoundGaps) {
        console.log(`[ScrapingEngine] Skip options: skipNotPublished=${options.skipNotPublished}, skipNotFoundGaps=${options.skipNotFoundGaps}`);
    }
    
    // Main scraping loop
    while (currentId <= endId) {
        // Check Max ID stop condition
        if (maxId && currentId > maxId) {
            console.log(`[ScrapingEngine] Reached Max ID limit (${maxId}), stopping at ID ${currentId}`);
            results.stopReason = STOP_REASON.MAX_ID;
            break;
        }
        
        // Check for timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout, stopping at ID ${currentId}`);
            results.stopReason = STOP_REASON.TIMEOUT;
            break;
        }
        
        const url = buildTournamentUrl(entityId, currentId);
        results.lastProcessedId = currentId;

        // =========================================================================
        // OPTIMIZED: Use prefetch cache instead of individual lookups
        // =========================================================================
        if (prefetchCache) {
            try {
                const scrapeURLStatus = await prefetchCache.getStatus(currentId);
                
                if (shouldSkipNotPublished(scrapeURLStatus, options)) {
                    console.log(`[ScrapingEngine] Skipping ID ${currentId}: NOT_PUBLISHED (cached)`);
                    results.gamesSkipped++;
                    currentId++;
                    continue;
                }
                
                if (shouldSkipNotFoundGap(scrapeURLStatus, options)) {
                    console.log(`[ScrapingEngine] Skipping ID ${currentId}: NOT_FOUND gap (cached)`);
                    results.gamesSkipped++;
                    currentId++;
                    continue;
                }
            } catch (error) {
                console.warn(`[ScrapingEngine] Prefetch error for ID ${currentId}, continuing without skip: ${error.message}`);
            }
        }
        
        results.totalProcessed++;

        try {
            // --- STEP 1: FETCH via AppSync ---
            monitoring.trackOperation('AUTO_SCRAPE_FETCH', 'Game', currentId, { entityId });
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: url,
                forceRefresh: options.forceRefresh || false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;

            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }

            // Check response type and update counters
            const isNotFound = isNotFoundResponse(parsedData);
            
            if (isNotFound) {
                consecutiveBlanks++;
                consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                
                console.log(`[ScrapingEngine] ID ${currentId}: ${parsedData.gameStatus} (consecutive NOT_FOUND: ${consecutiveNotFound})`);
                
                if (consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && !options.isFullScan) {
                    console.log(`[ScrapingEngine] Hit ${consecutiveNotFound} consecutive NOT_FOUND (threshold: ${MAX_CONSECUTIVE_NOT_FOUND}), stopping`);
                    await logStatus(entityId, 'WARN', 'Auto-scraper stopped: consecutive NOT_FOUND threshold', 
                        `Hit ${consecutiveNotFound} consecutive NOT_FOUND at ID ${currentId}. May have reached end of published tournaments.`);
                    results.stopReason = STOP_REASON.NOT_FOUND;
                    break;
                }
                
                if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && !options.isFullScan) {
                    console.log(`[ScrapingEngine] Hit ${consecutiveBlanks} consecutive blanks (threshold: ${MAX_CONSECUTIVE_BLANKS}), stopping`);
                    await logStatus(entityId, 'WARN', 'Auto-scraper stopped: consecutive blanks threshold', 
                        `Hit ${consecutiveBlanks} consecutive blanks at ID ${currentId}. May have reached end of published tournaments.`);
                    results.stopReason = STOP_REASON.BLANKS;
                    break;
                }
            } else if (parsedData.doNotScrape) {
                results.gamesSkipped++;
                consecutiveBlanks++;
                console.log(`[ScrapingEngine] ID ${currentId}: doNotScrape, skipping`);
            } else {
                // ============================================================
                // SUCCESS PATH - Reset ALL consecutive counters
                // ============================================================
                consecutiveBlanks = 0;
                consecutiveNotFound = 0;
                consecutiveErrors = 0;

                // --- STEP 2: SAVE via AppSync ---
                const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
                
                if (!autoVenueId) {
                    await logStatus(entityId, 'WARN', `Skipping save for ${url}: No auto-venue found.`);
                    results.gamesSkipped++;
                } else {
                    monitoring.trackOperation('AUTO_SCRAPE_SAVE', 'Game', currentId, { entityId, venueId: autoVenueId });
                    
                    const saveInput = {
                        sourceUrl: url,
                        venueId: autoVenueId,
                        existingGameId: parsedData.existingGameId,
                        doNotScrape: parsedData.doNotScrape,
                        entityId: entityId,
                        originalScrapedData: parsedData,
                        data: mapToSaveDataInput(parsedData)
                    };
                    
                    await callGraphQL(SAVE_TOURNAMENT_DATA, { input: saveInput });

                    if (parsedData.existingGameId) {
                        results.gamesUpdated++;
                    } else {
                        results.newGamesScraped++;
                    }
                    await updateGameList(entityId, currentId, parsedData.name, parsedData.gameStatus);
                }
            }
            
        } catch (error) {
            console.error(`[ScrapingEngine] Failed to process ${url}:`, error);
            results.errors++;
            consecutiveErrors++;
            results.lastErrorMessage = error.message || 'Unknown error';
            
            const errorMsg = (error.message || '').toLowerCase();
            const isNotFoundError = errorMsg.includes('not found') || 
                                   errorMsg.includes('404') || 
                                   errorMsg.includes('blank');
            
            if (isNotFoundError) {
                consecutiveBlanks++;
                consecutiveNotFound++;
                results.notFoundCount++;
            } else {
                consecutiveBlanks++;
                consecutiveNotFound = 0;
            }
            
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !options.isFullScan) {
                console.log(`[ScrapingEngine] Hit ${consecutiveErrors} consecutive errors (threshold: ${MAX_CONSECUTIVE_ERRORS}), stopping`);
                await logStatus(entityId, 'ERROR', 'Auto-scraper stopped: error threshold', 
                    `Error at ID ${currentId}: ${results.lastErrorMessage}`);
                results.stopReason = STOP_REASON.ERROR;
                break;
            }
        }

        // Update scraper state periodically
        if (results.totalProcessed % 10 === 0) {
            await updateScraperState(scraperState.id, {
                lastScannedId: currentId,
                consecutiveBlankCount: consecutiveBlanks,
                consecutiveNotFoundCount: consecutiveNotFound,
                totalScraped: scraperState.totalScraped + results.newGamesScraped + results.gamesUpdated,
                totalErrors: scraperState.totalErrors + results.errors
            });
            
            await updateScraperJob(scraperJob.id, {
                totalURLsProcessed: results.totalProcessed,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                blanks: results.blanks,
                notFoundCount: results.notFoundCount,
                s3CacheHits: results.s3CacheHits
            });
        }
        
        currentId++;
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    results.consecutiveBlanks = consecutiveBlanks;
    results.consecutiveNotFound = consecutiveNotFound;
    results.consecutiveErrors = consecutiveErrors;
    
    // =========================================================================
    // NEW v3.1.0: Log prefetch cache stats at end of run
    // =========================================================================
    if (prefetchCache) {
        results.prefetchStats = prefetchCache.getStats();
        console.log(`[ScrapingEngine] Prefetch cache stats:`, results.prefetchStats);
        prefetchCache.clear();
    }
    
    // Final state update
    await updateScraperState(scraperState.id, {
        lastScannedId: results.lastProcessedId,
        consecutiveBlankCount: consecutiveBlanks,
        consecutiveNotFoundCount: consecutiveNotFound,
        totalScraped: scraperState.totalScraped + results.newGamesScraped + results.gamesUpdated,
        totalErrors: scraperState.totalErrors + results.errors,
        lastRunEndTime: new Date().toISOString(),
        isRunning: false
    });
    
    return results;
}

// ===================================================================
// Control Operations
// ===================================================================

async function controlScraperOperation(operation, entityId) {
    const scraperState = await getOrCreateScraperState(entityId);
    
    switch (operation) {
        case 'START':
            if (scraperState.isRunning) {
                return {
                    success: false,
                    message: 'Scraper is already running',
                    state: scraperState
                };
            }
            
            await updateScraperState(scraperState.id, {
                enabled: true,
                isRunning: true,
                lastRunStartTime: new Date().toISOString()
            });
            
            console.log('[Control] START registered. Main handler will now proceed.');
            return {
                success: true,
                message: 'Scraper run triggered.',
                state: await getOrCreateScraperState(entityId)
            };
            
        case 'STOP':
            await updateScraperState(scraperState.id, {
                enabled: false,
                isRunning: false
            });
            return {
                success: true,
                message: 'Scraper stopped',
                state: await getOrCreateScraperState(entityId)
            };
            
        case 'ENABLE':
            await updateScraperState(scraperState.id, {
                enabled: true
            });
            return {
                success: true,
                message: 'Scraper enabled',
                state: await getOrCreateScraperState(entityId)
            };
            
        case 'DISABLE':
            await updateScraperState(scraperState.id, {
                enabled: false
            });
            return {
                success: true,
                message: 'Scraper disabled',
                state: await getOrCreateScraperState(entityId)
            };
            
        case 'STATUS':
            return {
                success: true,
                state: scraperState
            };
            
        case 'RESET':
            await updateScraperState(scraperState.id, {
                lastScannedId: 1,
                consecutiveBlankCount: 0,
                consecutiveNotFoundCount: 0,
                totalScraped: 0,
                totalErrors: 0,
                isRunning: false
            });
            return {
                success: true,
                message: 'Scraper state reset',
                state: await getOrCreateScraperState(entityId)
            };
            
        default:
            throw new Error(`Unknown operation: ${operation}`);
    }
}

// ===================================================================
// Main Handler
// ===================================================================

exports.handler = async (event) => {
    console.log('[AutoScraper] Event:', JSON.stringify(event, null, 2));
    
    const isEventBridge = event.source === 'aws.events' || event['detail-type'];
    const isAppSync = !!event.fieldName;
    console.log(`[AutoScraper] Source: ${isEventBridge ? 'EventBridge' : isAppSync ? 'AppSync' : 'Direct'}`);
    
    try {
        const operation = event.operation || event.fieldName;
        const args = event.arguments || event;
        
        const entityId = resolveEntityId(event, args);
        monitoring.entityId = entityId;
        
        console.log(`[AutoScraper] Resolved entityId: ${entityId}`);
        
        // Handle control operations
        if (operation === 'controlScraperOperation') {
            return await controlScraperOperation(args.operation, entityId);
        }
        
        if (operation === 'getScraperControlState') {
            return await controlScraperOperation('STATUS', entityId);
        }

        // Scraping run
        if (operation === 'triggerAutoScraping') {
            const scraperState = await getOrCreateScraperState(entityId);

            if (scraperState.isRunning) {
                return {
                    success: false,
                    message: 'Scraper is already running',
                    state: scraperState
                };
            }
            
            if (!scraperState.enabled) {
                return {
                    success: false,
                    message: 'Scraper is disabled',
                    state: scraperState
                };
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

            await logStatus(entityId, 'INFO', 'Scraper job started', `Job ID: ${job.id}, Source: ${triggerSource}`);
            
            // Process update candidates first
            console.log('[AutoScraper] Checking for update candidates...');
            const updateResults = await processUpdateCandidates(entityId, job);
            
            // Then main scraping with prefetch optimization
            console.log('[AutoScraper] Starting main scraping...');
            const scrapeResults = await performScrapingEnhanced(entityId, scraperState, job, {
                maxGames: args.maxGames,
                maxId: args.maxId,
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId,
                forceRefresh: args.forceRefresh,
                skipNotPublished: args.skipNotPublished,
                skipNotFoundGaps: args.skipNotFoundGaps
            });
            
            // Combine results
            const totalResults = {
                ...scrapeResults,
                gamesUpdated: scrapeResults.gamesUpdated + updateResults.updated,
                totalProcessed: scrapeResults.totalProcessed + updateResults.totalProcessed,
                s3CacheHits: scrapeResults.s3CacheHits + updateResults.s3CacheHits
            };
            
            const jobStatus = scrapeResults.stopReason || STOP_REASON.COMPLETED;
            const wasStoppedEarly = jobStatus !== STOP_REASON.COMPLETED;
            
            // Update job with final results
            await updateScraperJob(job.id, {
                ...totalResults,
                status: jobStatus,
                endTime: new Date().toISOString(),
                durationSeconds: Math.floor((Date.now() - new Date(job.startTime).getTime()) / 1000)
            });

            // Log appropriate message
            if (wasStoppedEarly) {
                const stopMessage = jobStatus === STOP_REASON.ERROR 
                    ? `Stopped due to error: ${scrapeResults.lastErrorMessage || 'Unknown error'}`
                    : jobStatus === STOP_REASON.NOT_FOUND
                    ? `Stopped after ${scrapeResults.consecutiveNotFound} consecutive NOT_FOUND`
                    : jobStatus === STOP_REASON.BLANKS
                    ? `Stopped after ${scrapeResults.consecutiveBlanks} consecutive blanks`
                    : jobStatus === STOP_REASON.MAX_ID
                    ? `Reached Max ID limit`
                    : jobStatus === STOP_REASON.TIMEOUT
                    ? `Stopped due to Lambda timeout approaching`
                    : `Stopped: ${jobStatus}`;
                    
                await logStatus(entityId, 'WARN', `Scraper job stopped early: ${jobStatus}`, 
                    `${stopMessage}. Processed: ${totalResults.totalProcessed}, New: ${totalResults.newGamesScraped}, NOT_FOUND: ${totalResults.notFoundCount || 0}, Errors: ${totalResults.errors}`);
            } else {
                await logStatus(entityId, 'INFO', 'Scraper job finished', 
                    `New: ${totalResults.newGamesScraped}, Updated: ${totalResults.gamesUpdated}, NOT_FOUND: ${totalResults.notFoundCount || 0}, Blanks: ${totalResults.blanks}`);
            }
            
            return {
                success: !wasStoppedEarly || jobStatus === STOP_REASON.BLANKS || jobStatus === STOP_REASON.NOT_FOUND || jobStatus === STOP_REASON.MAX_ID,
                message: wasStoppedEarly 
                    ? `Scraper stopped: ${jobStatus}. Processed ${totalResults.totalProcessed} tournaments`
                    : `Scraped ${totalResults.totalProcessed} tournaments`,
                state: await getOrCreateScraperState(entityId),
                results: totalResults,
                job,
                stopReason: jobStatus
            };
        }
        
        throw new Error(`Unknown operation: ${operation}`);
        
    } catch (error) {
        console.error('[AutoScraper] Error:', error);
        
        // Try to reset running state
        try {
            let cleanupEntityId = null;
            try {
                cleanupEntityId = resolveEntityId(event, event.arguments || event);
            } catch (resolveError) {
                console.warn('[AutoScraper] Could not resolve entityId for cleanup:', resolveError.message);
            }
            
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
            console.error('[AutoScraper] CRITICAL: Failed to reset running state after error:', stateError);
        }

        if (event.fieldName) {
            throw error;
        }
        
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    } finally {
        if (monitoring) {
            console.log('[AutoScraper] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[AutoScraper] Monitoring flush complete.');
        }
    }
};
