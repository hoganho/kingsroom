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
// UPDATED v4.3.0:
// - Modularized: GraphQL queries, prefetch cache, and scraping engine extracted
// - Added real-time game streaming via publishGameProcessed mutation
// - Events published after each game is processed (fire-and-forget pattern)
// - FIXED: Duration calculation now uses local jobStartTime instead of stale state
// - FIXED: Renamed totalProcessed -> totalURLsProcessed to match frontend expectations
// - Added `executeJob` operation for scraperManagement integration
// - Configurable thresholds via job payload (not just env vars)
// - Job record created by scraperManagement, updated by autoScraper
// - Added `cancelJob` operation to handle cancellation signals
// - Progress updates published more frequently for real-time UI

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');

// AppSync Client
const { URL } = require('url');
const fetch = require('node-fetch');
const aws4 = require('aws4');

// Extracted modules
const { PUBLISH_GAME_PROCESSED } = require('./graphql/queries');
const { performScrapingEnhanced } = require('./engine/scrapingEngine');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Lambda Monitoring
const { LambdaMonitoring } = require('./lambda-monitoring'); 

// ===================================================================
// CONFIGURATION
// ===================================================================

const LAMBDA_TIMEOUT = parseInt(process.env.AWS_LAMBDA_TIMEOUT || '270', 10) * 1000;
const LAMBDA_TIMEOUT_BUFFER = 45000;

// Default thresholds (can be overridden by job config)
const DEFAULT_MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '5', 10);
const DEFAULT_MAX_CONSECUTIVE_ERRORS = parseInt(process.env.MAX_CONSECUTIVE_ERRORS || '3', 10);
const DEFAULT_MAX_CONSECUTIVE_NOT_FOUND = parseInt(process.env.MAX_CONSECUTIVE_NOT_FOUND || '10', 10);
const DEFAULT_MAX_TOTAL_ERRORS = parseInt(process.env.MAX_TOTAL_ERRORS || '15', 10);

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
    
    const body = JSON.stringify({ query, variables });
    
    const requestOptions = {
        host: endpoint.host,
        path: endpoint.pathname || '/graphql',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: body,
        service: 'appsync',
        region: AWS_REGION
    };

    aws4.sign(requestOptions, {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
    });
    
    try {
        const response = await fetch(endpoint.href, {
            method: 'POST',
            headers: requestOptions.headers,
            body: body
        });
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

// ===================================================================
// GAME EVENT PUBLISHING (for real-time streaming)
// ===================================================================

async function publishGameProcessedEvent(jobId, entityId, tournamentId, url, result) {
    console.log(`[publishGameProcessedEvent] Publishing event for ID ${tournamentId}, action: ${result.action}`);

    const event = {
        jobId,
        entityId,
        tournamentId,
        url,
        action: result.action,
        message: result.message || null,
        errorMessage: result.errorMessage || null,
        processedAt: new Date().toISOString(),
        durationMs: result.durationMs || null,
        dataSource: result.dataSource || null,
        s3Key: result.s3Key || null,
        gameData: result.parsedData ? {
            name: result.parsedData.name || null,
            gameStatus: result.parsedData.gameStatus || null,
            registrationStatus: result.parsedData.registrationStatus || null,
            gameStartDateTime: result.parsedData.gameStartDateTime || null,
            gameEndDateTime: result.parsedData.gameEndDateTime || null,
            buyIn: result.parsedData.buyIn ?? null,
            rake: result.parsedData.rake ?? null,
            guaranteeAmount: result.parsedData.guaranteeAmount ?? null,
            prizepoolPaid: result.parsedData.prizepoolPaid ?? null,
            totalEntries: result.parsedData.totalEntries ?? null,
            totalUniquePlayers: result.parsedData.totalUniquePlayers ?? null,
            totalRebuys: result.parsedData.totalRebuys ?? null,
            totalAddons: result.parsedData.totalAddons ?? null,
            gameType: result.parsedData.gameType || null,
            gameVariant: result.parsedData.gameVariant || null,
            tournamentType: result.parsedData.tournamentType || null,
            gameTags: result.parsedData.gameTags || null,
            venueId: result.parsedData.venueMatch?.autoAssignedVenue?.id || null,
            venueName: result.parsedData.venueMatch?.autoAssignedVenue?.name || null,
            doNotScrape: result.parsedData.doNotScrape ?? null,
            existingGameId: result.parsedData.existingGameId || null,
        } : null,
        saveResult: result.saveResult ? {
            success: result.saveResult.success ?? true,
            gameId: result.saveResult.gameId || null,
            action: result.saveResult.action || null,
            message: result.saveResult.message || null,
        } : null,
    };

    try {
        await callGraphQL(PUBLISH_GAME_PROCESSED, { jobId, event }, entityId);
        console.log(`[publishGameProcessedEvent] Success for ID ${tournamentId}`); 
    } catch (error) {
        console.warn(`[publishGameProcessedEvent] Failed to publish event for ID ${tournamentId}:`, error.message);
    }
}

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
        // Skip undefined values - DynamoDB SDK strips them from ExpressionAttributeValues
        if (updates[key] === undefined) return;
        
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
// SCRAPER JOB MANAGEMENT
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
        // Skip undefined values - DynamoDB SDK strips them from ExpressionAttributeValues
        // but leaves the expression reference, causing ValidationException
        if (updates[key] === undefined) return;
        
        const attrName = key === 'status' ? '#status' : key;
        const placeholder = `:${key}`;
        
        if (key === 'status') {
            expressionAttributeNames['#status'] = 'status';
        }
        
        updateExpressions.push(`${attrName} = ${placeholder}`);
        expressionAttributeValues[placeholder] = updates[key];
    });
    
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

async function createScraperJob(entityId, triggerSource, triggeredBy, options = {}) {
    const now = new Date().toISOString();
    const job = {
        id: uuidv4(),
        entityId,
        status: 'RUNNING',
        triggerSource,
        triggeredBy,
        startTime: now,
        totalURLsProcessed: 0,
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
// ENTITY LOOKUP (for URL building)
// ===================================================================

const entityCache = new Map();

async function getEntity(entityId) {
    if (entityCache.has(entityId)) {
        return entityCache.get(entityId);
    }
    
    try {
        const entityTable = getTableName('Entity');
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: entityTable,
            Key: { id: entityId }
        }));
        
        if (result.Item) {
            entityCache.set(entityId, result.Item);
            return result.Item;
        }
        
        throw new Error(`Entity not found: ${entityId}`);
    } catch (error) {
        console.error(`[getEntity] Error fetching entity ${entityId}:`, error);
        throw error;
    }
}

// ===================================================================
// URL BUILDING
// ===================================================================

async function buildTournamentUrl(entityId, tournamentId) {
    const entity = await getEntity(entityId);
    
    if (!entity.gameUrlDomain || !entity.gameUrlPath) {
        throw new Error(`Entity ${entityId} missing gameUrlDomain or gameUrlPath`);
    }
    
    return `${entity.gameUrlDomain}${entity.gameUrlPath}${tournamentId}`;
}

// ===================================================================
// SCRAPING ENGINE CONTEXT
// ===================================================================

/**
 * Build context object with all dependencies for the scraping engine
 */
function buildScrapingContext() {
    return {
        callGraphQL,
        getEntity,
        buildTournamentUrl,
        getScraperJob,
        updateScraperJob,
        updateScraperState,
        publishGameProcessedEvent,
        ddbDocClient: monitoredDdbDocClient,
        scrapeURLTable,
        STOP_REASON,
        LAMBDA_TIMEOUT,
        LAMBDA_TIMEOUT_BUFFER,
        PROGRESS_UPDATE_FREQUENCY,
        DEFAULT_MAX_CONSECUTIVE_NOT_FOUND,
        DEFAULT_MAX_CONSECUTIVE_ERRORS,
        DEFAULT_MAX_CONSECUTIVE_BLANKS,
        DEFAULT_MAX_TOTAL_ERRORS
    };
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
            
        case 'RESET':
            await updateScraperState(scraperState.id, {
                lastScannedId: 0,
                consecutiveBlankCount: 0,
                consecutiveNotFoundCount: 0,
                isRunning: false
            });
            return { success: true, message: 'Scraper reset', state: await getOrCreateScraperState(entityId) };
            
        case 'STATUS':
        default:
            return { success: true, state: scraperState };
    }
}

// ===================================================================
// EXECUTE JOB (from scraperManagement)
// ===================================================================

async function executeJob(event) {
    const { jobId, entityId } = event;
    
    if (!jobId || !entityId) {
        return { success: false, error: 'jobId and entityId required' };
    }

    console.log(`[executeJob] Starting job ${jobId} for entity ${entityId}`);
    
    const jobStartTime = Date.now();
    
    const job = await getScraperJob(jobId);
    if (!job) {
        return { success: false, error: `Job ${jobId} not found` };
    }
    
    const scraperState = await getOrCreateScraperState(entityId);
    
    await updateScraperState(scraperState.id, {
        isRunning: true,
        lastRunStartTime: new Date(jobStartTime).toISOString(),
        currentJobId: jobId
    });
    
    await updateScraperJob(jobId, { status: 'RUNNING' });
    
    try {
        const ctx = buildScrapingContext();
        
        const results = await performScrapingEnhanced(entityId, scraperState, jobId, {
            mode: job.mode || 'bulk',
            bulkCount: job.bulkCount,
            startId: job.startId,
            endId: job.endId,
            maxId: job.maxId,
            gapIds: job.gapIds,
            forceRefresh: job.forceRefresh,
            skipNotPublished: job.skipNotPublished,
            skipNotFoundGaps: job.skipNotFoundGaps,
            saveToDatabase: job.saveToDatabase !== false,
            defaultVenueId: job.defaultVenueId,
            maxConsecutiveNotFound: job.maxConsecutiveNotFound,
            maxConsecutiveErrors: job.maxConsecutiveErrors,
            maxConsecutiveBlanks: job.maxConsecutiveBlanks,
            maxTotalErrors: job.maxTotalErrors,
        }, ctx);
        
        const jobEndTime = Date.now();
        const durationSeconds = Math.floor((jobEndTime - jobStartTime) / 1000);
        
        const finalStatus = results.stopReason || STOP_REASON.COMPLETED;
        
        await updateScraperJob(jobId, {
            status: finalStatus,
            totalURLsProcessed: results.totalProcessed,
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
            endTime: new Date(jobEndTime).toISOString(),
            durationSeconds: durationSeconds
        });

        console.log(`[executeJob] Job ${jobId} completed: ${finalStatus}`);
        console.log(`[executeJob] Results:`, JSON.stringify(results, null, 2));

        return {
            success: finalStatus === STOP_REASON.COMPLETED,
            jobId,
            status: finalStatus,
            results,
            durationSeconds
        };

    } catch (error) {
        console.error(`[executeJob] Job ${jobId} failed:`, error);
        
        const jobEndTime = Date.now();
        const durationSeconds = Math.floor((jobEndTime - jobStartTime) / 1000);
        
        await updateScraperJob(jobId, {
            status: 'FAILED',
            stopReason: 'FAILED',
            lastErrorMessage: error.message,
            endTime: new Date(jobEndTime).toISOString(),
            durationSeconds: durationSeconds
        });

        throw error;

    } finally {
        await updateScraperState(scraperState.id, {
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            currentJobId: null
        });
    }
}

// ===================================================================
// CANCEL JOB
// ===================================================================

async function cancelJob(event) {
    const { jobId } = event;
    
    if (!jobId) {
        return { success: false, error: 'jobId required' };
    }

    console.log(`[cancelJob] Marking job ${jobId} for cancellation`);
    
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
    
    try {
        // Handle executeJob operation (from scraperManagement)
        if (event.operation === 'executeJob') {
            return await executeJob(event);
        }
        
        // Handle cancelJob operation
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
            
            const jobStartTime = Date.now();
            const jobStartTimeISO = new Date(jobStartTime).toISOString();
            
            await updateScraperState(scraperState.id, {
                isRunning: true,
                lastRunStartTime: jobStartTimeISO
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

            const ctx = buildScrapingContext();
            
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
            }, ctx);
            
            const jobStatus = scrapeResults.stopReason || STOP_REASON.COMPLETED;
            
            const jobEndTime = Date.now();
            const durationSeconds = Math.floor((jobEndTime - jobStartTime) / 1000);
            
            await updateScraperJob(job.id, {
                totalURLsProcessed: scrapeResults.totalProcessed,
                newGamesScraped: scrapeResults.newGamesScraped,
                gamesUpdated: scrapeResults.gamesUpdated,
                gamesSkipped: scrapeResults.gamesSkipped,
                errors: scrapeResults.errors,
                blanks: scrapeResults.blanks,
                notFoundCount: scrapeResults.notFoundCount,
                s3CacheHits: scrapeResults.s3CacheHits,
                status: jobStatus,
                endTime: new Date(jobEndTime).toISOString(),
                durationSeconds: durationSeconds
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
                stopReason: jobStatus,
                durationSeconds: durationSeconds
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