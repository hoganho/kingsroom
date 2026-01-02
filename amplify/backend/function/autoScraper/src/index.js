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
// UPDATED v4.4.0:
// - Added JobProgressPublisher for real-time job monitoring via onJobProgress subscription
// - Progress events published periodically during processing (replaces polling on frontend)
// - Completion events always published immediately
// - Reduced DynamoDB update frequency (progress now primarily via subscription)
//
// Previous updates:
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
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { v4: uuidv4 } = require('uuid');

// AppSync Client
const { URL } = require('url');
const fetch = require('node-fetch');
const aws4 = require('aws4');

// Extracted modules
const { PUBLISH_GAME_PROCESSED, PUBLISH_JOB_PROGRESS } = require('./graphql/queries');
const { performScrapingEnhanced } = require('./engine/scrapingEngine');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({});

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

// Job progress publish frequency (in milliseconds) - rate limit for subscription events
const JOB_PROGRESS_MIN_INTERVAL_MS = 1000;

// Stop reason enum
const STOP_REASON = {
    COMPLETED: 'COMPLETED',
    TIMEOUT: 'STOPPED_TIMEOUT',
    CONTINUING: 'CONTINUING',  // Self-continuation triggered
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
// JOB PROGRESS PUBLISHING (NEW in v4.4.0)
// ===================================================================

/**
 * JobProgressPublisher - Manages rate-limited publishing of job progress events
 * Events are published to the onJobProgress subscription for real-time UI updates
 */
class JobProgressPublisher {
    constructor(jobId, entityId, jobStartTime, startId = null, endId = null) {
        this.jobId = jobId;
        this.entityId = entityId;
        this.jobStartTime = jobStartTime;
        this.startId = startId;
        this.endId = endId;
        this.lastPublishTime = 0;
        this.minIntervalMs = JOB_PROGRESS_MIN_INTERVAL_MS;
    }

    /**
     * Check if enough time has passed since last publish
     */
    canPublish() {
        return Date.now() - this.lastPublishTime >= this.minIntervalMs;
    }

    /**
     * Calculate duration since job started
     */
    getDurationSeconds() {
        return Math.floor((Date.now() - this.jobStartTime) / 1000);
    }

    /**
     * Publish job progress event (rate-limited unless forced)
     */
    async publishProgress(stats, status = 'RUNNING', options = {}) {
        const { force = false, stopReason = null, lastErrorMessage = null, currentId = null } = options;

        // Skip if we've published too recently (unless forced)
        if (!force && !this.canPublish()) {
            return;
        }

        const event = {
            jobId: this.jobId,
            entityId: this.entityId,
            status: status,
            stopReason: stopReason,
            totalURLsProcessed: stats.totalProcessed || 0,
            newGamesScraped: stats.newGamesScraped || 0,
            gamesUpdated: stats.gamesUpdated || 0,
            gamesSkipped: stats.gamesSkipped || 0,
            errors: stats.errors || 0,
            blanks: stats.blanks || 0,
            currentId: currentId,
            startId: this.startId,
            endId: this.endId,
            startTime: new Date(this.jobStartTime).toISOString(),
            durationSeconds: this.getDurationSeconds(),
            successRate: stats.successRate ?? null,
            averageScrapingTime: stats.averageScrapingTime ?? null,
            s3CacheHits: stats.s3CacheHits ?? null,
            consecutiveNotFound: stats.consecutiveNotFound ?? null,
            consecutiveErrors: stats.consecutiveErrors ?? null,
            consecutiveBlanks: stats.consecutiveBlanks ?? null,
            lastErrorMessage: lastErrorMessage,
        };

        try {
            await callGraphQL(PUBLISH_JOB_PROGRESS, { jobId: this.jobId, event }, this.entityId);
            this.lastPublishTime = Date.now();
            console.log(`[JobProgressPublisher] Published: ${status} - ${stats.totalProcessed || 0} processed`);
        } catch (error) {
            // Log but don't throw - subscription failures shouldn't break the job
            console.warn(`[JobProgressPublisher] Failed to publish progress:`, error.message);
        }
    }

    /**
     * Publish completion event (always publishes immediately)
     */
    async publishCompletion(stats, finalStatus, options = {}) {
        return this.publishProgress(stats, finalStatus, { ...options, force: true });
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
        jobId: uuidv4(),  // Also set jobId for consistency
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
        _version: 1
    };
    
    // Ensure jobId matches id
    job.jobId = job.id;
    
    await monitoredDdbDocClient.send(new PutCommand({
        TableName: scraperJobTable,
        Item: job
    }));
    
    return job;
}

// ===================================================================
// SCRAPING CONTEXT BUILDER
// ===================================================================

function buildScrapingContext(jobId = null, entityId = null, options = {}) {
    const invocationStartTime = Date.now();
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    // Create job progress publisher if we have a jobId
    const progressPublisher = jobId && entityId 
        ? new JobProgressPublisher(
            jobId, 
            entityId, 
            invocationStartTime,
            options.startId,
            options.endId
          )
        : null;
    
    return {
        // Timing
        invocationStartTime,
        lambdaTimeout: LAMBDA_TIMEOUT,
        timeoutBuffer: LAMBDA_TIMEOUT_BUFFER,
        
        // Thresholds (use job config or defaults)
        maxConsecutiveBlanks: options.maxConsecutiveBlanks || DEFAULT_MAX_CONSECUTIVE_BLANKS,
        maxConsecutiveErrors: options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS,
        maxConsecutiveNotFound: options.maxConsecutiveNotFound || DEFAULT_MAX_CONSECUTIVE_NOT_FOUND,
        maxTotalErrors: options.maxTotalErrors || DEFAULT_MAX_TOTAL_ERRORS,
        
        // Progress tracking
        progressUpdateFrequency: PROGRESS_UPDATE_FREQUENCY,
        
        // Job progress publisher (NEW in v4.4.0)
        progressPublisher,
        
        // Callbacks
        onGameProcessed: publishGameProcessedEvent,
        onProgress: async (stats, currentId) => {
            // Publish progress to subscription (rate-limited)
            if (progressPublisher) {
                await progressPublisher.publishProgress(stats, 'RUNNING', { currentId });
            }
        },
        
        // Continuation support
        selfContinue: jobId ? async (currentId, accumulatedResults, originalOptions) => {
            console.log(`[AutoScraper] Self-continuing from ID ${currentId}`);
            
            // Publish continuation status
            if (progressPublisher) {
                await progressPublisher.publishProgress(accumulatedResults, 'RUNNING', { 
                    currentId,
                    stopReason: STOP_REASON.CONTINUING 
                });
            }
            
            const continuationPayload = {
                operation: 'executeJob',
                jobId,
                entityId,
                isContinuation: true,
                continueFromId: currentId,
                originalEndId: originalOptions.endId || options.endId,
                accumulatedResults: {
                    totalProcessed: accumulatedResults.totalProcessed || 0,
                    newGamesScraped: accumulatedResults.newGamesScraped || 0,
                    gamesUpdated: accumulatedResults.gamesUpdated || 0,
                    gamesSkipped: accumulatedResults.gamesSkipped || 0,
                    errors: accumulatedResults.errors || 0,
                    blanks: accumulatedResults.blanks || 0,
                    notFoundCount: accumulatedResults.notFoundCount || 0,
                    s3CacheHits: accumulatedResults.s3CacheHits || 0,
                },
                // Pass through original options
                ...originalOptions,
            };
            
            await lambdaClient.send(new InvokeCommand({
                FunctionName: functionName,
                InvocationType: 'Event',  // Async - fire and forget
                Payload: JSON.stringify(continuationPayload),
            }));
            
            console.log(`[AutoScraper] Continuation invoked successfully for job ${jobId}`);
        } : null  // No continuation if no jobId
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

    // Handle continuation - check if this is a continuation invocation
    const isContinuation = event.isContinuation || false;
    const accumulatedResults = event.accumulatedResults || null;
    const continueFromId = event.continueFromId || null;
    const originalEndId = event.originalEndId || null;

    if (isContinuation) {
        console.log(`[executeJob] CONTINUATION for job ${jobId} from ID ${continueFromId}`);
        console.log(`[executeJob] Accumulated results:`, JSON.stringify(accumulatedResults));
    } else {
        console.log(`[executeJob] Starting job ${jobId} for entity ${entityId}`);
    }
    
    const jobStartTime = Date.now();
    
    const job = await getScraperJob(jobId);
    if (!job) {
        return { success: false, error: `Job ${jobId} not found` };
    }
    
    const scraperState = await getOrCreateScraperState(entityId);
    
    // Create progress publisher for this job
    const progressPublisher = new JobProgressPublisher(
        jobId, 
        entityId, 
        jobStartTime,
        job.startId,
        job.endId
    );
    
    // Only update state if not a continuation (continuation keeps isRunning true)
    if (!isContinuation) {
        await updateScraperState(scraperState.id, {
            isRunning: true,
            lastRunStartTime: new Date(jobStartTime).toISOString(),
            currentJobId: jobId
        });
        
        await updateScraperJob(jobId, { status: 'RUNNING' });
        
        // Publish initial "RUNNING" status
        await progressPublisher.publishProgress({
            totalProcessed: 0,
            newGamesScraped: 0,
            gamesUpdated: 0,
            gamesSkipped: 0,
            errors: 0,
            blanks: 0,
        }, 'RUNNING', { force: true });
    }
    
    try {
        // Build options for scraping
        const scrapingOptions = {
            mode: job.mode || 'bulk',
            bulkCount: job.bulkCount,
            startId: isContinuation ? continueFromId : job.startId,
            endId: isContinuation ? originalEndId : job.endId,
            maxId: job.maxId,
            gapIds: job.gapIds,
            forceRefresh: job.forceRefresh,
            skipNotPublished: job.skipNotPublished,
            skipNotFoundGaps: job.skipNotFoundGaps,
            saveToDatabase: job.saveToDatabase !== false,
            defaultVenueId: job.defaultVenueId,
            scraperApiKey: job.scraperApiKey || null,
            maxConsecutiveNotFound: job.maxConsecutiveNotFound,
            maxConsecutiveErrors: job.maxConsecutiveErrors,
            maxConsecutiveBlanks: job.maxConsecutiveBlanks,
            maxTotalErrors: job.maxTotalErrors,
            // Pass accumulated results for continuation
            accumulatedResults: accumulatedResults,
        };

        // Build context with job progress publisher
        const ctx = buildScrapingContext(jobId, entityId, scrapingOptions);
        
        const results = await performScrapingEnhanced(entityId, scraperState, jobId, scrapingOptions, ctx);
        
        const jobEndTime = Date.now();
        const durationSeconds = Math.floor((jobEndTime - jobStartTime) / 1000);
        
        // Handle CONTINUING status - don't finalize the job
        if (results.stopReason === STOP_REASON.CONTINUING || results.stopReason === 'CONTINUING') {
            console.log(`[executeJob] Job ${jobId} continuing in new invocation from ID ${results.currentId}`);
            
            // Update job with progress but keep status as RUNNING
            await updateScraperJob(jobId, {
                totalURLsProcessed: results.totalProcessed,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
                blanks: results.blanks,
                s3CacheHits: results.s3CacheHits,
                currentId: results.currentId,
                // Don't set endTime or final status - job is still running
            });
            
            // Publish continuation progress
            await progressPublisher.publishProgress(results, 'RUNNING', {
                currentId: results.currentId,
                stopReason: STOP_REASON.CONTINUING,
            });
            
            // Don't reset scraper state - let continuation handle it
            return {
                success: true,
                jobId,
                status: 'CONTINUING',
                results,
                durationSeconds,
                message: `Continuation invoked from ID ${results.currentId}`
            };
        }
        
        const finalStatus = results.stopReason || STOP_REASON.COMPLETED;
        
        // Update DynamoDB with final results
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

        // Publish completion event (always publishes immediately)
        await progressPublisher.publishCompletion(results, finalStatus, {
            stopReason: results.stopReason !== STOP_REASON.COMPLETED ? results.stopReason : null,
            lastErrorMessage: results.lastErrorMessage,
            currentId: results.currentId,
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
        
        // Update DynamoDB with failure
        await updateScraperJob(jobId, {
            status: 'FAILED',
            stopReason: 'FAILED',
            lastErrorMessage: error.message,
            endTime: new Date(jobEndTime).toISOString(),
            durationSeconds: durationSeconds
        });

        // Publish failure event
        await progressPublisher.publishCompletion({
            totalProcessed: 0,
            newGamesScraped: 0,
            gamesUpdated: 0,
            gamesSkipped: 0,
            errors: 1,
            blanks: 0,
        }, 'FAILED', {
            stopReason: 'FAILED',
            lastErrorMessage: error.message,
        });

        throw error;

    } finally {
        // Only reset scraper state if job is truly done (not continuing)
        const currentJob = await getScraperJob(jobId);
        const isStillRunning = currentJob?.status === 'RUNNING' || currentJob?.status === 'CONTINUING';
        
        if (!isStillRunning) {
            await updateScraperState(scraperState.id, {
                isRunning: false,
                lastRunEndTime: new Date().toISOString(),
                currentJobId: null
            });
        }
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

            // Create progress publisher for this job
            const progressPublisher = new JobProgressPublisher(
                job.id,
                entityId,
                jobStartTime,
                args.startId,
                args.endId
            );

            // Publish initial status
            await progressPublisher.publishProgress({
                totalProcessed: 0,
                newGamesScraped: 0,
                gamesUpdated: 0,
                gamesSkipped: 0,
                errors: 0,
                blanks: 0,
            }, 'RUNNING', { force: true });

            const ctx = buildScrapingContext(job.id, entityId, {
                startId: args.startId,
                endId: args.endId,
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

            // Publish completion event
            await progressPublisher.publishCompletion(scrapeResults, jobStatus, {
                stopReason: jobStatus !== STOP_REASON.COMPLETED ? jobStatus : null,
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