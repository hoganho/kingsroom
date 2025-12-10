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
const MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '50', 10);
const UPDATE_CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10); // 1 hour
const MAX_LOG_SIZE = 25;
const MAX_GAME_LIST_SIZE = 10;
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0"; // Fallback

// --- NEW: AppSync Environment Variables ---
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
const AWS_REGION = process.env.REGION;

// --- Lambda Monitoring Initialization ---
const monitoring = new LambdaMonitoring('autoScraper', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
// --- End Lambda Monitoring ---


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

// --- NEW: GraphQL Mutations (from schema.graphql) ---
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
// HELPER FUNCTIONS (Preserved)
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
// REMOVED: scrapeAttemptTable (Handled by webScraperFunction)

const buildTournamentUrl = (entityId, tournamentId) => {
    // TODO: This should look up entityConfig. For now, hardcoding pattern.
    return `https://kingsroom.com.au/dashboard/tournament/view?id=${tournamentId}`;
};

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

/**
 * NEW: Helper to map full ScrapedGameData to ScrapedGameDataInput
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
// PRESERVED: Get Update Candidate URLs (Preserved)
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
// REFACTORED: Process Update Candidates
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
// This is the CORE ORCHESTRATION LOGIC, now using callGraphQL
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
        s3CacheHits: 0,
        consecutiveBlanks: 0,
        lastProcessedId: scraperState.lastScannedId
    };
    
    let currentId = options.startId || scraperState.lastScannedId;
    const endId = options.endId || currentId + (options.maxGames || 1000);
    let consecutiveBlanks = scraperState.consecutiveBlankCount || 0;
    
    console.log(`[ScrapingEngine] Starting from ID ${currentId} to ${endId}`);
    
    // Main scraping loop (REFACTORED)
    while (currentId <= endId) {
        // Check for timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout, stopping at ID ${currentId}`);
            break;
        }
        
        const url = buildTournamentUrl(entityId, currentId);
        results.totalProcessed++;
        results.lastProcessedId = currentId;

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

            // --- Check Stop Condition (from your ScrapeTab logic) ---
            if (parsedData.gameStatus === 'NOT_FOUND' || parsedData.gameStatus === 'NOT_IN_USE' || parsedData.doNotScrape) {
                consecutiveBlanks++;
                if (parsedData.doNotScrape) {
                    results.gamesSkipped++;
                } else {
                    results.blanks++;
                }
                
                if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && !options.isFullScan) {
                    console.log(`[ScrapingEngine] Hit ${consecutiveBlanks} consecutive blanks, stopping`);
                    break; // Exit loop
                }
            } else {
                consecutiveBlanks = 0; // Reset
            }

            // --- STEP 2: "SAVE" (Call AppSync) ---
            // Only save if it's not a "doNotScrape" game
            if (!parsedData.doNotScrape) {
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
            consecutiveBlanks++; // Count errors as blanks for stopping
        }

        // Update scraper state periodically
        if (results.totalProcessed % 10 === 0) {
            await updateScraperState(scraperState.id, {
                lastScannedId: currentId,
                consecutiveBlankCount: consecutiveBlanks,
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
                s3CacheHits: results.s3CacheHits
            });
        }
        
        currentId++;
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    results.consecutiveBlanks = consecutiveBlanks;
    
    // Final state update
    await updateScraperState(scraperState.id, {
        lastScannedId: results.lastProcessedId,
        consecutiveBlankCount: consecutiveBlanks,
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
// ===================================================================
exports.handler = async (event) => {
    console.log('[AutoScraper] Event:', JSON.stringify(event, null, 2));
    
    try {
        // Support both direct invocation and AppSync
        const operation = event.operation || event.fieldName;
        const args = event.arguments || event;
        
        // Get entity ID
        const entityId = args.entityId || process.env.DEFAULT_ENTITY_ID || DEFAULT_ENTITY_ID;
        monitoring.entityId = entityId; // Set entityId for monitoring
        
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
            
            // Create scraper job
            const job = await createScraperJob(entityId, args.triggerSource || 'MANUAL', args.triggeredBy || 'user', {
                maxGames: args.maxGames,
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId
            });

            await logStatus(entityId, 'INFO', 'Scraper job started', `Job ID: ${job.id}`);
            
            // First, process any update candidates (RUNNING games)
            console.log('[AutoScraper] Checking for update candidates...');
            const updateResults = await processUpdateCandidates(entityId, job);
            
            // Then perform main scraping
            console.log('[AutoScraper] Starting main scraping...');
            const scrapeResults = await performScrapingEnhanced(entityId, scraperState, job, {
                maxGames: args.maxGames,
                isFullScan: args.isFullScan,
                startId: args.startId,
                endId: args.endId,
                forceRefresh: args.forceRefresh
            });
            
            // Combine results
            const totalResults = {
                ...scrapeResults,
                gamesUpdated: scrapeResults.gamesUpdated + updateResults.updated,
                totalProcessed: scrapeResults.totalProcessed + updateResults.totalProcessed,
                s3CacheHits: scrapeResults.s3CacheHits + updateResults.s3CacheHits
            };
            
            // Update job with final results
            await updateScraperJob(job.id, {
                ...totalResults,
                status: 'COMPLETED',
                endTime: new Date().toISOString(),
                durationSeconds: Math.floor((Date.now() - new Date(job.startTime).getTime()) / 1000)
            });

            await logStatus(entityId, 'INFO', 'Scraper job finished', `New: ${totalResults.newGamesScraped}, Updated: ${totalResults.gamesUpdated}, Blanks: ${totalResults.blanks}`);
            
            return {
                success: true,
                message: `Scraped ${totalResults.totalProcessed} tournaments`,
                state: await getOrCreateScraperState(entityId), // Return fresh state
                results: totalResults,
                job
            };
        }
        
        throw new Error(`Unknown operation: ${operation}`);
        
    } catch (error) {
        console.error('[AutoScraper] Error:', error);
        
        // If this was triggered by triggerAutoScraping, try to set state to not running
        try {
            const entityId = event.arguments?.entityId || process.env.DEFAULT_ENTITY_ID || DEFAULT_ENTITY_ID;
            const scraperState = await getOrCreateScraperState(entityId);
            if (scraperState.isRunning) {
                await updateScraperState(scraperState.id, { isRunning: false, lastRunEndTime: new Date().toISOString() });
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