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
// UPDATED: Removed hardcoded DEFAULT_ENTITY_ID
// - entityId is now REQUIRED from args, event payload, or environment variable
// - Supports EventBridge scheduled invocations with entityId in event payload
// - Can optionally process ALL active entities if no specific entityId provided (multi-entity mode)
//
// UPDATED v3.0.0: 
// - Added consecutive NOT_FOUND tracking with reset on success
// - Added Max ID stop condition
// - Added new stop reasons: STOPPED_NOT_FOUND, STOPPED_MAX_ID
// - Skip NOT_PUBLISHED and NOT_FOUND gap options (via ScrapeURL lookup)

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
const aws4 = require('aws4'); // Use aws4 for signing v3 fetch requests

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Lambda Monitoring ---
// (Assuming lambda-monitoring.js is in the same directory)
const { LambdaMonitoring } = require('./lambda-monitoring'); 
// --- End Lambda Monitoring ---

// Environment variables and constants
const LAMBDA_TIMEOUT = parseInt(process.env.AWS_LAMBDA_TIMEOUT || '270', 10) * 1000; // Convert to milliseconds
const LAMBDA_TIMEOUT_BUFFER = 45000; // 45 seconds buffer
const UPDATE_CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10); // 1 hour
const MAX_LOG_SIZE = 25;
const MAX_GAME_LIST_SIZE = 10;

// UPDATED: Strict error thresholds for EventBridge-triggered auto mode
// When triggered by EventBridge (scheduled), we want to STOP (not pause) on errors
// This prevents runaway scraping when something is wrong
const MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '2', 10);  // Stop after 2 consecutive blanks
const MAX_CONSECUTIVE_ERRORS = parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '1', 10);  // Stop after ANY error
// NEW v3.0.0: Separate threshold for consecutive NOT_FOUND
const MAX_CONSECUTIVE_NOT_FOUND = parseInt(process.env.MAX_CONSECUTIVE_NOT_FOUND || '25', 10); // Stop after 25 consecutive NOT_FOUND

// Stop reason enum for job status tracking
// NEW v3.0.0: Added NOT_FOUND and MAX_ID stop reasons
const STOP_REASON = {
    COMPLETED: 'COMPLETED',           // Normal completion
    TIMEOUT: 'STOPPED_TIMEOUT',       // Lambda timeout approaching
    BLANKS: 'STOPPED_BLANKS',         // Hit consecutive blank threshold
    NOT_FOUND: 'STOPPED_NOT_FOUND',   // NEW: Hit consecutive NOT_FOUND threshold
    ERROR: 'STOPPED_ERROR',           // Hit error threshold
    MANUAL: 'STOPPED_MANUAL',         // User stopped via UI
    NO_VENUE: 'STOPPED_NO_VENUE',     // Too many games without venue match
    MAX_ID: 'STOPPED_MAX_ID'          // NEW: Reached max ID limit
};

// REMOVED: Hardcoded DEFAULT_ENTITY_ID
// Entity ID must now be provided via:
// 1. args.entityId (from AppSync)
// 2. event.entityId (from EventBridge)
// 3. process.env.DEFAULT_ENTITY_ID (from Lambda environment variable)

// --- NEW: AppSync Environment Variables ---
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
const AWS_REGION = process.env.REGION;

// --- Lambda Monitoring Initialization ---
// Initialize with placeholder - will be set per invocation
const monitoring = new LambdaMonitoring('autoScraper', 'pending-entity');
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
// --- End Lambda Monitoring ---

// ===================================================================
// HELPER: Resolve Entity ID
// ===================================================================
/**
 * Resolves the entityId from various sources with clear error messages
 * Priority: args.entityId > event.entityId > process.env.DEFAULT_ENTITY_ID
 * 
 * @param {Object} event - Lambda event
 * @param {Object} args - Parsed arguments
 * @returns {string} entityId
 * @throws {Error} if no entityId can be resolved
 */
function resolveEntityId(event, args) {
    // Priority 1: Explicit argument from AppSync
    if (args?.entityId) {
        console.log('[EntityResolver] Using entityId from args:', args.entityId);
        return args.entityId;
    }
    
    // Priority 2: EventBridge scheduled event payload
    if (event?.entityId) {
        console.log('[EntityResolver] Using entityId from event payload:', event.entityId);
        return event.entityId;
    }
    
    // Priority 3: Detail from EventBridge rule (nested structure)
    if (event?.detail?.entityId) {
        console.log('[EntityResolver] Using entityId from event.detail:', event.detail.entityId);
        return event.detail.entityId;
    }
    
    // Priority 4: Environment variable (set via amplify update function)
    if (process.env.DEFAULT_ENTITY_ID) {
        console.log('[EntityResolver] Using entityId from environment variable:', process.env.DEFAULT_ENTITY_ID);
        return process.env.DEFAULT_ENTITY_ID;
    }
    
    // No entityId found - throw descriptive error
    throw new Error(
        '[autoScraper] entityId is required but was not provided. ' +
        'Provide entityId via: (1) args.entityId from AppSync, ' +
        '(2) event.entityId from EventBridge, or ' +
        '(3) DEFAULT_ENTITY_ID environment variable. ' +
        'To set environment variable, run: amplify update function -> autoScraper -> Environment variables'
    );
}

/**
 * Optional: Fetch all active entities for multi-entity scheduled runs
 * Use this when you want to process ALL entities in a single scheduled invocation
 */
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
// NEW: AppSync GraphQL Client
// ===================================================================
/**
 * Makes a signed IAM request to the AppSync API.
 * This allows the Lambda to call its *own* API, re-using all logic.
 */
async function callGraphQL(query, variables, entityId = null) {
    const endpoint = new URL(APPSYNC_ENDPOINT);
    const operationName = query.match(/(\w+)\s*(\(|{)/)[1];
    
    // Set entityId for monitoring
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

    // Sign the request with IAM credentials
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

// --- GraphQL Mutations (from schema.graphql) ---
// PRESERVED: Full field list from original
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
            results { # Used to check if finished
                rank
            }
            # Add all fields from ScrapedGameData type
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

// PRESERVED: Original response fields
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
// HELPER FUNCTIONS (Preserved from original)
// ===================================================================

// PRESERVED: getTableName helper with fallback logic
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

// Table names (using helper)
const scraperStateTable = getTableName('ScraperState');
const scraperJobTable = getTableName('ScraperJob');
const scrapeURLTable = getTableName('ScrapeURL');
// REMOVED: scrapeAttemptTable (Handled by webScraperFunction)

// PRESERVED: Original simple buildTournamentUrl
const buildTournamentUrl = (entityId, tournamentId) => {
    // TODO: This should look up entityConfig. For now, hardcoding pattern.
    return `https://kingsroom.com.au/dashboard/tournament/view?id=${tournamentId}`;
};

// PRESERVED: Original getOrCreateScraperState using GetCommand with known ID pattern
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
        consecutiveNotFoundCount: 0,  // NEW v3.0.0: Track NOT_FOUND separately
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

// PRESERVED: Original updateScraperState
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

// PRESERVED: Original logStatus
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

// PRESERVED: Original updateGameList
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

// PRESERVED + UPDATED: createScraperJob with new fields
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
        maxId: options.maxId || null,  // NEW v3.0.0: Track max ID
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
        notFoundCount: 0,  // NEW v3.0.0: Track NOT_FOUND separately
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

// PRESERVED: Original updateScraperJob
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

/**
 * PRESERVED: Helper to map full ScrapedGameData to ScrapedGameDataInput
 * This is required for the saveTournamentData mutation
 */
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
// NEW v3.0.0: ScrapeURL Lookup for Skip Options
// ===================================================================

/**
 * Check if a tournament ID should be skipped based on ScrapeURL status
 * Used for skipNotPublished and skipNotFoundGaps options
 */
async function getScrapeURLStatus(entityId, tournamentId) {
    try {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: scrapeURLTable,
            IndexName: 'byEntityScrapeURL',
            KeyConditionExpression: 'entityId = :entityId',
            FilterExpression: 'tournamentId = :tournamentId',
            ExpressionAttributeValues: {
                ':entityId': entityId,
                ':tournamentId': tournamentId
            },
            Limit: 1
        }));
        
        if (result.Items && result.Items.length > 0) {
            const item = result.Items[0];
            return {
                found: true,
                lastScrapeStatus: item.lastScrapeStatus || null,
                gameStatus: item.gameStatus || null
            };
        }
        
        return { found: false };
    } catch (error) {
        console.warn(`[ScrapeURLLookup] Error checking status for ID ${tournamentId}:`, error);
        return { found: false, error: error.message };
    }
}

/**
 * Check if tournament should be skipped as NOT_PUBLISHED
 */
function shouldSkipNotPublished(scrapeURLStatus, options) {
    if (!options.skipNotPublished) return false;
    return scrapeURLStatus.found && scrapeURLStatus.gameStatus === 'NOT_PUBLISHED';
}

/**
 * Check if tournament should be skipped as NOT_FOUND gap
 */
function shouldSkipNotFoundGap(scrapeURLStatus, options) {
    if (!options.skipNotFoundGaps) return false;
    if (!scrapeURLStatus.found) return false;
    
    const status = (scrapeURLStatus.lastScrapeStatus || '').toUpperCase();
    return status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE';
}

// ===================================================================
// NEW v3.0.0: Helper to classify NOT_FOUND responses
// ===================================================================

/**
 * Determine if a response is a NOT_FOUND type
 * Used for consecutive NOT_FOUND tracking
 */
function isNotFoundResponse(parsedData) {
    if (!parsedData) return false;
    
    const status = parsedData.gameStatus;
    return status === 'NOT_FOUND' || 
           status === 'NOT_IN_USE' || 
           status === 'NOT_PUBLISHED';
}


// ===================================================================
// PRESERVED: Get Update Candidate URLs
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

// ===================================================================
// PRESERVED: Process Update Candidates
// Now uses callGraphQL instead of direct invocation
// ===================================================================
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
                forceRefresh: false, // Always use cache for simple refreshes
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;
            
            results.totalProcessed++;
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            results.updated++;
            
            // Note: We don't call saveTournamentData for "RUNNING" games.
            // fetchTournamentData (via webScraperFunction) has already updated
            // the S3/ScrapeURL records, which is all we need for running games.
            
        } catch (error) {
            console.error(`[UpdateCandidates] Error processing ${scrapeURL.url}:`, error);
            results.errors++;
        }
    }
    
    return results;
}

// ===================================================================
// REFACTORED: Main Scraping Engine
// UPDATED v3.0.0:
// - Separate consecutive NOT_FOUND tracking with reset on success
// - Max ID stop condition
// - Skip NOT_PUBLISHED and NOT_FOUND gap options
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
        notFoundCount: 0,  // NEW v3.0.0: Track NOT_FOUND separately
        s3CacheHits: 0,
        consecutiveBlanks: 0,
        consecutiveNotFound: 0,  // NEW v3.0.0: Track consecutive NOT_FOUND
        consecutiveErrors: 0,
        lastProcessedId: scraperState.lastScannedId,
        stopReason: STOP_REASON.COMPLETED,  // Default to normal completion
        lastErrorMessage: null              // Track last error for logging
    };
    
    let currentId = options.startId || scraperState.lastScannedId;
    const endId = options.endId || currentId + (options.maxGames || 1000);
    
    // NEW v3.0.0: Max ID stop condition (separate from endId)
    const maxId = options.maxId || null;
    
    // Initialize from saved state
    let consecutiveBlanks = scraperState.consecutiveBlankCount || 0;
    let consecutiveNotFound = scraperState.consecutiveNotFoundCount || 0;  // NEW v3.0.0
    let consecutiveErrors = 0;
    
    console.log(`[ScrapingEngine] Starting from ID ${currentId} to ${endId}${maxId ? `, maxId: ${maxId}` : ''}`);
    if (options.skipNotPublished || options.skipNotFoundGaps) {
        console.log(`[ScrapingEngine] Skip options: skipNotPublished=${options.skipNotPublished}, skipNotFoundGaps=${options.skipNotFoundGaps}`);
    }
    
    // Main scraping loop
    while (currentId <= endId) {
        // NEW v3.0.0: Check Max ID stop condition
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

        // NEW v3.0.0: Check skip conditions before scraping
        if (options.skipNotPublished || options.skipNotFoundGaps) {
            const scrapeURLStatus = await getScrapeURLStatus(entityId, currentId);
            
            if (shouldSkipNotPublished(scrapeURLStatus, options)) {
                console.log(`[ScrapingEngine] Skipping ID ${currentId}: NOT_PUBLISHED (cached)`);
                results.gamesSkipped++;
                // Skips don't affect consecutive counters - intentional skip
                currentId++;
                continue;
            }
            
            if (shouldSkipNotFoundGap(scrapeURLStatus, options)) {
                console.log(`[ScrapingEngine] Skipping ID ${currentId}: NOT_FOUND gap (cached)`);
                results.gamesSkipped++;
                // Skips don't affect consecutive counters - intentional skip
                currentId++;
                continue;
            }
        }
        
        results.totalProcessed++;

        try {
            // --- STEP 1: "SCRAPE" (Call AppSync) ---
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

            // --- UPDATED v3.0.0: Check response type and update counters appropriately ---
            const isNotFound = isNotFoundResponse(parsedData);
            
            if (isNotFound) {
                // NOT_FOUND response - increment counters
                consecutiveBlanks++;
                consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                
                console.log(`[ScrapingEngine] ID ${currentId}: ${parsedData.gameStatus} (consecutive NOT_FOUND: ${consecutiveNotFound})`);
                
                // Check consecutive NOT_FOUND threshold (use NOT_FOUND specific counter)
                if (consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && !options.isFullScan) {
                    console.log(`[ScrapingEngine] Hit ${consecutiveNotFound} consecutive NOT_FOUND (threshold: ${MAX_CONSECUTIVE_NOT_FOUND}), stopping`);
                    await logStatus(entityId, 'WARN', 'Auto-scraper stopped: consecutive NOT_FOUND threshold', 
                        `Hit ${consecutiveNotFound} consecutive NOT_FOUND at ID ${currentId}. May have reached end of published tournaments.`);
                    results.stopReason = STOP_REASON.NOT_FOUND;
                    break;
                }
                
                // PRESERVED: Also check legacy blanks threshold
                if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && !options.isFullScan) {
                    console.log(`[ScrapingEngine] Hit ${consecutiveBlanks} consecutive blanks (threshold: ${MAX_CONSECUTIVE_BLANKS}), stopping`);
                    await logStatus(entityId, 'WARN', 'Auto-scraper stopped: consecutive blanks threshold', 
                        `Hit ${consecutiveBlanks} consecutive blanks at ID ${currentId}. May have reached end of published tournaments.`);
                    results.stopReason = STOP_REASON.BLANKS;
                    break;
                }
            } else if (parsedData.doNotScrape) {
                // doNotScrape - skip but DON'T increment NOT_FOUND counter
                results.gamesSkipped++;
                // IMPORTANT: doNotScrape is NOT a NOT_FOUND - don't increment consecutiveNotFound
                // But it's still a "blank" in the legacy sense
                consecutiveBlanks++;
                console.log(`[ScrapingEngine] ID ${currentId}: doNotScrape, skipping`);
            } else {
                // ============================================================
                // SUCCESS PATH - Reset ALL consecutive counters
                // ============================================================
                consecutiveBlanks = 0;
                consecutiveNotFound = 0;  // CRITICAL v3.0.0: Reset NOT_FOUND counter on success
                consecutiveErrors = 0;

                // --- STEP 2: "SAVE" (Call AppSync) ---
                // Only save if it's not a "doNotScrape" game
                const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
                
                if (!autoVenueId) {
                    await logStatus(entityId, 'WARN', `Skipping save for ${url}: No auto-venue found.`);
                    results.gamesSkipped++;
                } else {
                    monitoring.trackOperation('AUTO_SCRAPE_SAVE', 'Game', currentId, { entityId, venueId: autoVenueId });
                    
                    // Build the SaveTournamentInput
                    const saveInput = {
                        sourceUrl: url,
                        venueId: autoVenueId,
                        existingGameId: parsedData.existingGameId,
                        doNotScrape: parsedData.doNotScrape,
                        entityId: entityId,
                        originalScrapedData: parsedData, // Pass the full object
                        data: mapToSaveDataInput(parsedData) // Map to the subset
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
            
            // Classify the error - is it a NOT_FOUND type?
            const errorMsg = (error.message || '').toLowerCase();
            const isNotFoundError = errorMsg.includes('not found') || 
                                   errorMsg.includes('404') || 
                                   errorMsg.includes('blank');
            
            if (isNotFoundError) {
                consecutiveBlanks++;
                consecutiveNotFound++;
                results.notFoundCount++;
            } else {
                // Non-NOT_FOUND error - still counts as blank for legacy, but resets NOT_FOUND
                consecutiveBlanks++;
                consecutiveNotFound = 0;
            }
            
            // Check consecutive errors threshold (stop on ANY error when threshold is 1)
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !options.isFullScan) {
                console.log(`[ScrapingEngine] Hit ${consecutiveErrors} consecutive errors (threshold: ${MAX_CONSECUTIVE_ERRORS}), stopping`);
                await logStatus(entityId, 'ERROR', 'Auto-scraper stopped: error threshold', 
                    `Error at ID ${currentId}: ${results.lastErrorMessage}`);
                results.stopReason = STOP_REASON.ERROR;
                break; // Exit loop - stop on error
            }
        }

        // Update scraper state periodically
        if (results.totalProcessed % 10 === 0) {
            await updateScraperState(scraperState.id, {
                lastScannedId: currentId,
                consecutiveBlankCount: consecutiveBlanks,
                consecutiveNotFoundCount: consecutiveNotFound,  // NEW v3.0.0: Persist NOT_FOUND counter
                totalScraped: scraperState.totalScraped + results.newGamesScraped + results.gamesUpdated,
                totalErrors: scraperState.totalErrors + results.errors
            });
            
            // Update job progress
            await updateScraperJob(scraperJob.id, {
                totalURLsProcessed: results.totalProcessed,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                blanks: results.blanks,
                notFoundCount: results.notFoundCount,  // NEW v3.0.0
                s3CacheHits: results.s3CacheHits
            });
        }
        
        currentId++;
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    results.consecutiveBlanks = consecutiveBlanks;
    results.consecutiveNotFound = consecutiveNotFound;  // NEW v3.0.0
    results.consecutiveErrors = consecutiveErrors;
    
    // Final state update
    await updateScraperState(scraperState.id, {
        lastScannedId: results.lastProcessedId,
        consecutiveBlankCount: consecutiveBlanks,
        consecutiveNotFoundCount: consecutiveNotFound,  // NEW v3.0.0: Persist NOT_FOUND counter
        totalScraped: scraperState.totalScraped + results.newGamesScraped + results.gamesUpdated,
        totalErrors: scraperState.totalErrors + results.errors,
        lastRunEndTime: new Date().toISOString(),
        isRunning: false
    });
    
    return results;
}

// ===================================================================
// PRESERVED & UPDATED: Control Scraper Operation
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
                state: await getOrCreateScraperState(entityId) // re-fetch state
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
            // const cacheStats = await getCacheStatistics(entityId); // This needs fixing if GSI is wrong
            return {
                success: true,
                state: scraperState,
                // cacheStats: cacheStats
            };
            
        case 'RESET':
            await updateScraperState(scraperState.id, {
                lastScannedId: 1,
                consecutiveBlankCount: 0,
                consecutiveNotFoundCount: 0,  // NEW v3.0.0: Reset NOT_FOUND counter too
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
// REFACTORED: Main Handler
// UPDATED: entityId resolution with clear error messages
// UPDATED v3.0.0: Added new options support
// ===================================================================
exports.handler = async (event) => {
    console.log('[AutoScraper] Event:', JSON.stringify(event, null, 2));
    
    // Detect event source for better logging
    const isEventBridge = event.source === 'aws.events' || event['detail-type'];
    const isAppSync = !!event.fieldName;
    console.log(`[AutoScraper] Source: ${isEventBridge ? 'EventBridge' : isAppSync ? 'AppSync' : 'Direct'}`);
    
    try {
        // Support both direct invocation and AppSync
        const operation = event.operation || event.fieldName;
        const args = event.arguments || event;
        
        // UPDATED: Resolve entityId with proper error handling
        const entityId = resolveEntityId(event, args);
        monitoring.entityId = entityId; // Set entityId for monitoring
        
        console.log(`[AutoScraper] Resolved entityId: ${entityId}`);
        
        // Handle control operations first, as they might stop a run
        if (operation === 'controlScraperOperation') {
            return await controlScraperOperation(args.operation, entityId);
        }
        
        if (operation === 'getScraperControlState') {
            return await controlScraperOperation('STATUS', entityId);
        }

        // Proceed with scraping run
        if (operation === 'triggerAutoScraping') {
            // Get or create scraper state
            const scraperState = await getOrCreateScraperState(entityId);

            // Check if already running
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
            
            // Update state to running
            await updateScraperState(scraperState.id, {
                isRunning: true,
                lastRunStartTime: new Date().toISOString()
            });
            
            // Determine trigger source
            const triggerSource = isEventBridge ? 'SCHEDULED' : (args.triggerSource || 'MANUAL');
            const triggeredBy = isEventBridge ? 'eventbridge' : (args.triggeredBy || 'user');
            
            // Create scraper job with new options
            const job = await createScraperJob(entityId, triggerSource, triggeredBy, {
                maxGames: args.maxGames,
                maxId: args.maxId,  // NEW v3.0.0: Max ID support
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId
            });

            await logStatus(entityId, 'INFO', 'Scraper job started', `Job ID: ${job.id}, Source: ${triggerSource}`);
            
            // First, process any update candidates (RUNNING games)
            console.log('[AutoScraper] Checking for update candidates...');
            const updateResults = await processUpdateCandidates(entityId, job);
            
            // Then perform main scraping with new options
            console.log('[AutoScraper] Starting main scraping...');
            const scrapeResults = await performScrapingEnhanced(entityId, scraperState, job, {
                maxGames: args.maxGames,
                maxId: args.maxId,  // NEW v3.0.0
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId,
                forceRefresh: args.forceRefresh,
                skipNotPublished: args.skipNotPublished,     // NEW v3.0.0
                skipNotFoundGaps: args.skipNotFoundGaps      // NEW v3.0.0
            });
            
            // Combine results
            const totalResults = {
                ...scrapeResults,
                gamesUpdated: scrapeResults.gamesUpdated + updateResults.updated,
                totalProcessed: scrapeResults.totalProcessed + updateResults.totalProcessed,
                s3CacheHits: scrapeResults.s3CacheHits + updateResults.s3CacheHits
            };
            
            // Determine final job status based on stopReason
            const jobStatus = scrapeResults.stopReason || STOP_REASON.COMPLETED;
            const wasStoppedEarly = jobStatus !== STOP_REASON.COMPLETED;
            
            // Update job with final results
            await updateScraperJob(job.id, {
                ...totalResults,
                status: jobStatus,
                endTime: new Date().toISOString(),
                durationSeconds: Math.floor((Date.now() - new Date(job.startTime).getTime()) / 1000)
            });

            // Log appropriate message based on how the job ended
            if (wasStoppedEarly) {
                const stopMessage = jobStatus === STOP_REASON.ERROR 
                    ? `Stopped due to error: ${scrapeResults.lastErrorMessage || 'Unknown error'}`
                    : jobStatus === STOP_REASON.NOT_FOUND
                    ? `Stopped after ${scrapeResults.consecutiveNotFound} consecutive NOT_FOUND (may have reached end of published tournaments)`
                    : jobStatus === STOP_REASON.BLANKS
                    ? `Stopped after ${scrapeResults.consecutiveBlanks} consecutive blanks (may have reached end of published tournaments)`
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
                success: !wasStoppedEarly || jobStatus === STOP_REASON.BLANKS || jobStatus === STOP_REASON.NOT_FOUND || jobStatus === STOP_REASON.MAX_ID, // These are often expected
                message: wasStoppedEarly 
                    ? `Scraper stopped: ${jobStatus}. Processed ${totalResults.totalProcessed} tournaments`
                    : `Scraped ${totalResults.totalProcessed} tournaments`,
                state: await getOrCreateScraperState(entityId), // Return fresh state
                results: totalResults,
                job,
                stopReason: jobStatus
            };
        }
        
        throw new Error(`Unknown operation: ${operation}`);
        
    } catch (error) {
        console.error('[AutoScraper] Error:', error);
        
        // Try to reset running state if we have an entityId
        try {
            // Attempt to resolve entityId for cleanup (may fail if that was the original error)
            let cleanupEntityId = null;
            try {
                cleanupEntityId = resolveEntityId(event, event.arguments || event);
            } catch (resolveError) {
                // If we can't resolve entityId, we can't clean up state - that's okay
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

        // Return error in AppSync format if needed
        if (event.fieldName) {
            throw error;
        }
        
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    } finally {
        // Always flush metrics before the Lambda exits
        if (monitoring) {
            console.log('[AutoScraper] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[AutoScraper] Monitoring flush complete.');
        }
    }
};