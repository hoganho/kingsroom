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
// Properly refactored Auto-Scraper Orchestrator that preserves ALL original functionality
// while adapting to unified ScrapeURL model

const { 
    DynamoDBClient, 
    QueryCommand, 
    PutCommand, 
    UpdateCommand, 
    GetCommand,
    ScanCommand
} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { v4: uuidv4 } = require('uuid');

// Initialize AWS clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({});

// Environment variables and constants
const LAMBDA_TIMEOUT = parseInt(process.env.AWS_LAMBDA_TIMEOUT || '270', 10) * 1000; // Convert to milliseconds
const LAMBDA_TIMEOUT_BUFFER = 45000; // 45 seconds buffer
const MAX_CONSECUTIVE_BLANKS = parseInt(process.env.MAX_CONSECUTIVE_BLANKS || '50', 10);
const UPDATE_CHECK_INTERVAL_MS = parseInt(process.env.UPDATE_CHECK_INTERVAL_MS || '3600000', 10); // 1 hour
const MAX_LOG_SIZE = 25;
const MAX_GAME_LIST_SIZE = 10;

// ===================================================================
// PRESERVED: Helper function to get table names with environment
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
const scrapeAttemptTable = getTableName('ScrapeAttempt');
const scrapeURLTable = getTableName('ScrapeURL');

// Lambda function name
const webScraperFunctionName = process.env.WEB_SCRAPER_FUNCTION_NAME || 
    `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:webScraperFunction-${process.env.ENV}`;

// ===================================================================
// PRESERVED: Build tournament URL function
// ===================================================================
const buildTournamentUrl = (entityId, tournamentId) => {
    // In the future, this should look up the entity to get the correct URL pattern
    // For now, defaulting to kingsroom pattern
    return `https://kingsroom.com.au/dashboard/tournament/view?id=${tournamentId}`;
};

// ===================================================================
// PRESERVED: Get or Create Scraper State
// ===================================================================
async function getOrCreateScraperState(entityId) {
    const stateId = `scraper-${entityId}`;
    
    try {
        const getParams = {
            TableName: scraperStateTable,
            Key: { id: stateId }
        };
        
        const result = await ddbDocClient.send(new GetCommand(getParams));
        
        if (result.Item) {
            return result.Item;
        }
    } catch (error) {
        console.log('[ScraperState] Not found, creating new state');
    }
    
    // Create new state
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
    
    await ddbDocClient.send(new PutCommand({
        TableName: scraperStateTable,
        Item: newState
    }));
    
    return newState;
}

// ===================================================================
// PRESERVED: Update Scraper State
// ===================================================================
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
    
    // Always update timestamps
    const now = new Date();
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now.toISOString();
    
    // Update DataStore fields
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
    
    await ddbDocClient.send(new UpdateCommand(params));
}

// ===================================================================
// ADDED BACK: Scraper State Logging Helpers
// ===================================================================
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
// PRESERVED: Create Scraper Job
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
    
    await ddbDocClient.send(new PutCommand({
        TableName: scraperJobTable,
        Item: job
    }));
    
    return job;
}

// ===================================================================
// PRESERVED: Update Scraper Job
// ===================================================================
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
    
    // Always update timestamps
    const now = new Date();
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = now.toISOString();
    
    // Update DataStore fields
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
    
    await ddbDocClient.send(new UpdateCommand(params));
}

// ===================================================================
// PRESERVED: Create Scrape Attempt
// ===================================================================
async function createScrapeAttempt(scraperJobId, scrapeURLId, url, tournamentId, result) {
    const now = new Date().toISOString();
    const attemptId = uuidv4();
    
    const attempt = {
        id: attemptId,
        scraperJobId,
        scrapeURLId: scrapeURLId || attemptId, // Use attempt ID if no scrapeURL exists yet
        url,
        tournamentId,
        attemptTime: now,
        status: result.status || 'FAILED',
        processingTime: result.processingTime || 0,
        gameName: result.data?.name || result.gameName || null,
        gameStatus: result.data?.gameStatus || result.gameStatus || null,
        registrationStatus: result.data?.registrationStatus || result.registrationStatus || null,
        dataHash: result.data?.contentHash || result.dataHash || null,
        hasChanges: result.data?.contentChanged || result.hasChanges || false,
        errorMessage: result.error || result.errorMessage || null,
        errorType: result.errorType || null,
        gameId: result.data?.gameId || result.gameId || null,
        wasNewGame: result.data?.wasNewGame || result.wasNewGame || false,
        fieldsUpdated: result.data?.fieldsUpdated || result.fieldsUpdated || [],
        foundKeys: result.data?.foundKeys || result.foundKeys || [],
        structureLabel: result.data?.structureLabel || result.structureLabel || null,
        createdAt: now,
        updatedAt: now,
        _lastChangedAt: Date.now(),
        _version: 1,
        __typename: 'ScrapeAttempt'
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: scrapeAttemptTable,
        Item: attempt
    }));
    
    return attempt;
}

// ===================================================================
// NEW/UPDATED: Get or Create ScrapeURL (for unified tracking)
// ===================================================================
async function getOrCreateScrapeURL(url, entityId, tournamentId) {
    // First try to find existing ScrapeURL
    const queryParams = {
        TableName: scrapeURLTable,
        IndexName: 'byURL',
        KeyConditionExpression: '#url = :url',
        ExpressionAttributeNames: {
            '#url': 'url'
        },
        ExpressionAttributeValues: {
            ':url': url
        },
        Limit: 1
    };
    
    const result = await ddbDocClient.send(new QueryCommand(queryParams));
    
    if (result.Items && result.Items.length > 0) {
        return result.Items[0];
    }
    
    // Create new ScrapeURL record
    const now = new Date().toISOString();
    const newScrapeURL = {
        id: uuidv4(),
        url,
        tournamentId,
        entityId,
        
        // Unified fields
        lastInteractionType: 'NEVER_CHECKED',
        lastInteractionAt: now,
        hasStoredContent: false,
        totalInteractions: 0,
        successfulScrapes: 0,
        failedScrapes: 0,
        manualUploads: 0,
        contentChangeCount: 0,
        
        // Original fields
        doNotScrape: false,
        sourceDataIssue: false,
        gameDataVerified: false,
        missingKeysFromScrape: [],
        sourceSystem: 'KINGSROOM',
        status: 'ACTIVE',
        placedIntoDatabase: false,
        firstScrapedAt: now,
        lastScrapedAt: now,
        timesScraped: 0,
        timesSuccessful: 0,
        timesFailed: 0,
        consecutiveFailures: 0,
        
        // Cache fields
        cacheHits: 0,
        hasEtag: false,
        hasLastModified: false,
        s3StorageEnabled: true,
        
        createdAt: now,
        updatedAt: now,
        _lastChangedAt: Date.now(),
        _version: 1,
        __typename: 'ScrapeURL'
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: scrapeURLTable,
        Item: newScrapeURL
    }));
    
    return newScrapeURL;
}

// ===================================================================
// ADDED BACK: Update ScrapeURL
// This is the critical function to update our single source of truth
// ===================================================================
async function updateScrapeURL(scrapeURL, result) {
    const now = new Date();
    const isSuccess = result.success && result.status !== 'FAILED' && result.status !== 'BLANK' && result.status !== 'SKIPPED_DONOTSCRAPE';
    const isFailure = !result.success || result.status === 'FAILED';

    const updates = {
        lastInteractionAt: now.toISOString(),
        lastInteractionType: result.interactionType || (isFailure ? 'SCRAPED_ERROR' : 'SCRAPED_UNKNOWN'),
        lastScrapedAt: now.toISOString(),
        timesScraped: (scrapeURL.timesScraped || 0) + 1,
        timesSuccessful: (scrapeURL.timesSuccessful || 0) + (isSuccess ? 1 : 0),
        timesFailed: (scrapeURL.timesFailed || 0) + (isFailure ? 1 : 0),
        consecutiveFailures: isFailure ? (scrapeURL.consecutiveFailures || 0) + 1 : 0,
        
        // From the webScraper data, if it exists
        gameName: result.data?.name || scrapeURL.gameName,
        gameStatus: result.data?.gameStatus || scrapeURL.gameStatus,
        doNotScrape: (result.data?.doNotScrape !== undefined) ? result.data.doNotScrape : scrapeURL.doNotScrape,
        hasStoredContent: (result.data?.s3Key) ? true : scrapeURL.hasStoredContent,
        latestS3StorageId: result.data?.s3StorageId || scrapeURL.latestS3StorageId,
        contentHash: result.data?.contentHash || scrapeURL.contentHash,
        cacheHits: (scrapeURL.cacheHits || 0) + (result.usedCache ? 1 : 0),
        hasEtag: (result.data?.hasEtag !== undefined) ? result.data.hasEtag : scrapeURL.hasEtag,
        hasLastModified: (result.data?.hasLastModified !== undefined) ? result.data.hasLastModified : scrapeURL.hasLastModified,
        
        updatedAt: now.toISOString(),
    };

    // Build the UpdateCommand
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

    // Add versioning
    updateExpressions.push('#lca = :lca');
    expressionAttributeNames['#lca'] = '_lastChangedAt';
    expressionAttributeValues[':lca'] = now.getTime();
    
    updateExpressions.push('#v = if_not_exists(#v, :zero) + :one');
    expressionAttributeNames['#v'] = '_version';
    expressionAttributeValues[':zero'] = 0;
    expressionAttributeValues[':one'] = 1;

    const params = {
        TableName: scrapeURLTable,
        Key: { id: scrapeURL.id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    };

    try {
        await ddbDocClient.send(new UpdateCommand(params));
    } catch (error) {
        console.error(`[updateScrapeURL] Failed to update ${scrapeURL.id}: ${error.message}`);
    }
}

// ===================================================================
// PRESERVED BUT UPDATED: Scrape and Process Tournament
// Now updates unified ScrapeURL fields
// ===================================================================
async function scrapeAndProcessTournament(tournamentId, entityId, scraperJobId, options = {}) {
    const startTime = Date.now();
    const url = buildTournamentUrl(entityId, tournamentId);
    
    console.log(`[Scraper] Processing tournament ${tournamentId}: ${url}`);
    
    // Get or create ScrapeURL record FIRST
    const scrapeURL = await getOrCreateScrapeURL(url, entityId, tournamentId);
    
    // Check if should skip (unified logic)
    if (scrapeURL.doNotScrape && !options.forceRefresh) {
        console.log(`[Scraper] Skipping ${tournamentId} - doNotScrape flag is set`);
        
        const skipResult = {
            success: false,
            status: 'SKIPPED_DONOTSCRAPE',
            tournamentId,
            interactionType: 'SKIPPED',
            processingTime: Date.now() - startTime
        };

        // Create attempt record
        await createScrapeAttempt(scraperJobId, scrapeURL.id, url, tournamentId, {
            ...skipResult,
            errorMessage: 'URL marked as do not scrape'
        });
        
        // Update ScrapeURL record
        await updateScrapeURL(scrapeURL, skipResult);
        
        return skipResult;
    }
    
    try {
        // Invoke the web scraper Lambda (PRESERVED ORIGINAL LOGIC)
        const payload = {
            operation: 'fetchTournamentData',
            url,
            entityId,
            tournamentId,
            scraperJobId,
            scrapeURLId: scrapeURL.id,
            forceRefresh: options.forceRefresh || false
        };
        
        const command = new InvokeCommand({
            FunctionName: webScraperFunctionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(payload)
        });
        
        const response = await lambdaClient.send(command);
        const responsePayload = JSON.parse(new TextDecoder().decode(response.Payload));
        
        // Process the response
        if (responsePayload.statusCode === 200) {
            const body = typeof responsePayload.body === 'string' ? 
                JSON.parse(responsePayload.body) : responsePayload.body;
            
            // Determine interaction type and status
            let interactionType = 'SCRAPED_WITH_HTML';
            let attemptStatus = 'SUCCESS';
            
            if (body.gameStatus === 'NOT_IN_USE') {
                interactionType = 'SCRAPED_NOT_IN_USE';
                attemptStatus = 'BLANK';
            } else if (body.gameStatus === 'NOT_PUBLISHED') {
                interactionType = 'SCRAPED_NOT_PUBLISHED';
                attemptStatus = 'SKIPPED_DONOTSCRAPE';
            } else if (!body.data && !body.html) {
                interactionType = 'SCRAPED_ERROR';
                attemptStatus = 'FAILED';
            }

            if (body.wasNewGame) {
                attemptStatus = 'SAVED';
            } else if (body.contentChanged) {
                attemptStatus = 'UPDATED';
            } else if (!body.contentChanged && attemptStatus === 'SUCCESS') {
                attemptStatus = 'NO_CHANGES';
            }
            
            // Check if this was a cache hit
            const usedCache = body.usedCache || body.source === 'S3_CACHE' || body.source === 'HTTP_304_CACHE';
            
            const finalResult = {
                success: true,
                status: attemptStatus,
                tournamentId,
                data: body,
                usedCache,
                interactionType,
                processingTime: Date.now() - startTime
            };

            // Create attempt record (PRESERVED)
            await createScrapeAttempt(scraperJobId, scrapeURL.id, url, tournamentId, finalResult);
            
            // Update ScrapeURL record
            await updateScrapeURL(scrapeURL, finalResult);
            
            console.log(`[Scraper] Tournament ${tournamentId} processed: ${attemptStatus}`);
            
            return finalResult;
            
        } else {
            // Handle error response
            const errorMessage = responsePayload.body?.error || 'Unknown error';
            
            const errorResult = {
                success: false,
                status: 'FAILED',
                tournamentId,
                error: errorMessage,
                interactionType: 'SCRAPED_ERROR',
                processingTime: Date.now() - startTime
            };

            // Create attempt record for failure
            await createScrapeAttempt(scraperJobId, scrapeURL.id, url, tournamentId, errorResult);
            
            // Update ScrapeURL record
            await updateScrapeURL(scrapeURL, errorResult);

            console.error(`[Scraper] Failed to scrape tournament ${tournamentId}: ${errorMessage}`);
            
            return errorResult;
        }
        
    } catch (error) {
        console.error(`[Scraper] Error processing tournament ${tournamentId}:`, error);
        
        const errorResult = {
            success: false,
            status: 'FAILED',
            tournamentId,
            error: error.message,
            errorType: error.name || 'UNKNOWN_ERROR',
            interactionType: 'SCRAPED_ERROR',
            processingTime: Date.now() - startTime
        };

        // Create attempt record for error
        await createScrapeAttempt(scraperJobId, scrapeURL.id, url, tournamentId, errorResult);
        
        // Update ScrapeURL record
        await updateScrapeURL(scrapeURL, errorResult);

        return errorResult;
    }
}

// ===================================================================
// PRESERVED: Get Update Candidate URLs
// Updated to use ScrapeURL table with lastInteractionType
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
        
        const result = await ddbDocClient.send(new QueryCommand(params));
        
        if (result.Items) {
            candidates.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey && candidates.length < limit);
    
    console.log(`[UpdateCandidates] Found ${candidates.length} RUNNING games to update`);
    return candidates;
}

// ===================================================================
// PRESERVED: Main Scraping Engine
// This is the CORE ORCHESTRATION LOGIC
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
    
    // Main scraping loop (PRESERVED)
    while (currentId <= endId) {
        // Check for timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout, stopping at ID ${currentId}`);
            break;
        }
        
        // Process the tournament
        const result = await scrapeAndProcessTournament(
            currentId, 
            entityId, 
            scraperJob.id,
            { forceRefresh: options.forceRefresh }
        );
        
        results.totalProcessed++;
        results.lastProcessedId = currentId;
        
        // Update counters based on result
        if (result.success) {
            if (result.status === 'SAVED') {
                results.newGamesScraped++;
                consecutiveBlanks = 0;
                // Log new game to state
                await updateGameList(entityId, currentId, result.data?.name || 'Unnamed Game', result.status);
            } else if (result.status === 'UPDATED') {
                results.gamesUpdated++;
                consecutiveBlanks = 0;
            } else if (result.status === 'BLANK' || result.status === 'NO_CHANGES') {
                results.blanks++;
                consecutiveBlanks++;
            } else if (result.status === 'SKIPPED_DONOTSCRAPE') {
                results.gamesSkipped++;
                consecutiveBlanks++; // Count as blank for stopping logic
            }

            if (result.usedCache) {
                results.s3CacheHits++;
            }
        } else {
            if (result.status === 'FAILED') {
                results.errors++;
                consecutiveBlanks++; // Count errors as blanks for stopping
            } else {
                results.gamesSkipped++;
                consecutiveBlanks++;
            }
        }
        
        // Check for consecutive blanks limit
        if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && !options.isFullScan) {
            console.log(`[ScrapingEngine] Hit ${consecutiveBlanks} consecutive blanks, stopping`);
            break;
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
// PRESERVED: Process Update Candidates
// ===================================================================
async function processUpdateCandidates(entityId, scraperJob) {
    const candidates = await getUpdateCandidateURLs(entityId, 50);
    
    if (candidates.length === 0) {
        console.log('[UpdateCandidates] No candidates to update');
        return {
            totalProcessed: 0,
            updated: 0,
            errors: 0
        };
    }
    
    const results = {
        totalProcessed: 0,
        updated: 0,
        errors: 0,
        s3CacheHits: 0
    };
    
    for (const scrapeURL of candidates) {
        const result = await scrapeAndProcessTournament(
            scrapeURL.tournamentId,
            entityId,
            scraperJob.id,
            { forceRefresh: false }
        );
        
        results.totalProcessed++;
        
        if (result.success) {
            results.updated++;
            if (result.usedCache) {
                results.s3CacheHits++;
            }
        } else {
            results.errors++;
        }
    }
    
    return results;
}

// ===================================================================
// ADDED BACK: Get Cache Statistics
// ===================================================================
async function getCacheStatistics(entityId, timeRangeHours = 24) {
    const startTime = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000).toISOString();
    
    // Assumes GSI 'byEntityScraperJob' has PK=entityId, SK=startTime
    const params = {
        TableName: scraperJobTable,
        IndexName: 'byEntityScraperJob', 
        KeyConditionExpression: 'entityId = :entityId AND startTime > :startTime',
        ExpressionAttributeValues: {
            ':entityId': entityId,
            ':startTime': startTime
        }
    };

    let jobs = [];
    try {
        const response = await ddbDocClient.send(new QueryCommand(params));
        jobs = response.Items || [];
    } catch (e) {
        console.warn(`[CacheStats] GSI query failed (Is GSI 'byEntityScraperJob' configured with PK=entityId, SK=startTime?): ${e.message}`);
        // Fallback to Scan if GSI is just on entityId
        try {
            const scanParams = {
                TableName: scraperJobTable,
                IndexName: 'byEntityScraperJob',
                KeyConditionExpression: 'entityId = :entityId',
                FilterExpression: 'startTime > :startTime',
                ExpressionAttributeValues: {
                    ':entityId': entityId,
                    ':startTime': startTime
                }
            };
            const response = await ddbDocClient.send(new QueryCommand(scanParams));
            jobs = response.Items || [];
        } catch (scanError) {
             console.error(`[CacheStats] Fallback Scan also failed: ${scanError.message}`);
        }
    }
    
    const stats = {
        totalJobs: jobs.length,
        totalURLsProcessed: jobs.reduce((sum, j) => sum + (j.totalURLsProcessed || 0), 0),
        totalS3CacheHits: jobs.reduce((sum, j) => sum + (j.s3CacheHits || 0), 0),
        averageCacheHitRate: 0,
        timeRangeHours
    };
    
    if (stats.totalURLsProcessed > 0) {
        stats.averageCacheHitRate = ((stats.totalS3CacheHits / stats.totalURLsProcessed) * 100).toFixed(2);
    }
    
    return stats;
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
            
            // Start scraping (asynchronously - trigger main handler)
            // Note: This is now handled by the main handler logic,
            // which will proceed to run after this.
            // For a 'control' operation, we just set state
            // and let the main handler 'triggerAutoScraping' logic run.
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
            const cacheStats = await getCacheStatistics(entityId);
            return {
                success: true,
                state: scraperState,
                cacheStats: cacheStats
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
// PRESERVED: Main Handler
// ===================================================================
exports.handler = async (event) => {
    console.log('[AutoScraper] Event:', JSON.stringify(event, null, 2));
    
    try {
        // Support both direct invocation and AppSync
        const operation = event.operation || event.fieldName;
        const args = event.arguments || event;
        
        // Get entity ID
        const entityId = args.entityId || process.env.DEFAULT_ENTITY_ID || '42101695-1332-48e3-963b-3c6ad4e909a0';
        
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
        
        // Return error in AppSync format if needed
        if (event.fieldName) {
            throw error;
        }
        
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
};

// Export for testing
module.exports.performScrapingEnhanced = performScrapingEnhanced;
module.exports.scrapeAndProcessTournament = scrapeAndProcessTournament;
module.exports.getUpdateCandidateURLs = getUpdateCandidateURLs;