/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	API_KINGSROOM_SCRAPERSTATETABLE_ARN
	API_KINGSROOM_SCRAPERSTATETABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	ENV
	FUNCTION_PLAYERDATAPROCESSOR_NAME
	FUNCTION_WEBSCRAPERFUNCTION_NAME
	REGION
Amplify Params - DO NOT EDIT *//* Enhanced Auto Scraper Lambda with Entity ID Support
 * This file includes comprehensive Entity ID assignment for all scraper models
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');
const { TextDecoder } = require('util');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// --- ENTITY ---: Added default entity ID
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";

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

// --- Enhanced Utility Functions ---

/**
 * Creates a new ScraperJob record
 */
// --- ENTITY ---: Added entityId parameter
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
        errorMessages: [],
        failedURLs: [],
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
    
    return jobRecord;
};

/**
 * Updates a ScraperJob record
 */
const updateScraperJob = async (jobId, updates) => {
    const now = new Date().toISOString();
    
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    for (const [key, value] of Object.entries(updates)) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
    }
    
    updateExpressions.push('#updatedAt = :updatedAt, #_lastChangedAt = :_lastChangedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = now;
    expressionAttributeNames['#_lastChangedAt'] = '_lastChangedAt';
    expressionAttributeValues[':_lastChangedAt'] = Date.now();
    
    await ddbDocClient.send(new UpdateCommand({
        TableName: getTableName('ScraperJob'),
        Key: { id: jobId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));
    
    return { ...updates, updatedAt: now };
};

/**
 * Finalizes a ScraperJob with metrics
 */
const finalizeScraperJob = async (jobId, startTime, results) => {
    const endTime = new Date().toISOString();
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    
    const totalProcessed = results.newGamesScraped + results.gamesUpdated + 
                          results.gamesSkipped + results.errors + results.blanks;
    
    const successRate = totalProcessed > 0 
        ? ((results.newGamesScraped + results.gamesUpdated) / totalProcessed) * 100 
        : 0;
    
    const updates = {
        endTime,
        durationSeconds,
        status: 'COMPLETED', // Set to COMPLETED, errors are tracked inside
        totalURLsProcessed: totalProcessed,
        newGamesScraped: results.newGamesScraped,
        gamesUpdated: results.gamesUpdated,
        gamesSkipped: results.gamesSkipped,
        errors: results.errors,
        blanks: results.blanks,
        successRate: Math.round(successRate * 100) / 100,
        averageScrapingTime: totalProcessed > 0 ? durationSeconds / totalProcessed : 0
    };
    
    await updateScraperJob(jobId, updates);
};

/**
 * Gets or creates a ScrapeURL record
 */
// --- ENTITY ---: Added entityId parameter
const getOrCreateScrapeURL = async (url, tournamentId, entityId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    const urlId = url;
    
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
 * Enhanced scrape and process function with full tracking
 */
// --- ENTITY ---: Added entityId parameter
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
        jobId,
        status: 'FAILED',
        processingTime: 0,
        error: null,
        gameId: existingGameData?.id || null,
        venueId: existingGameData?.venueId || null
    };
    
    try {
        // --- ENTITY ---: Pass entityId to log
        await logStatus('INFO', `Fetching/Scraping ID #${tournamentId}`, `Entity: ${entityId}`, entityId);
        
        const fetchPayload = {
            fieldName: 'fetchTournamentData',
            arguments: { url, existingGameId: existingGameData?.id },
            identity: { claims: { jobId, triggerSource }}
        };
        
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(fetchPayload)
        }));
        
        const scraperResult = JSON.parse(new TextDecoder().decode(response.Payload));
        let scrapedData = scraperResult.data || scraperResult;
        const gameIdFromFetch = scraperResult.existingGameId || existingGameData?.id;

        if (scraperResult.errorMessage) {
            result.error = scraperResult.errorMessage;
            result.status = result.error.includes('Scraping is disabled') ? 'SKIPPED_DONOTSCRAPE' : 'FAILED';
        } else if (scrapedData && scrapedData.name) {
            if (scrapedData.isInactive) {
                result.status = 'INACTIVE';
            } else {
                const autoAssignedVenueId = scrapedData?.venueMatch?.autoAssignedVenue?.id || existingGameData?.venueId || UNASSIGNED_VENUE_ID;
                const isUnassigned = autoAssignedVenueId === UNASSIGNED_VENUE_ID;
                
                result.venueId = autoAssignedVenueId;
                
                const savePayload = {
                    fieldName: 'saveTournamentData',
                    arguments: {
                        input: {
                            // --- ENTITY ---: Pass entityId to the saveTournamentData mutation
                            entityId: entityId,
                            sourceUrl: url,
                            venueId: autoAssignedVenueId,
                            existingGameId: gameIdFromFetch,
                            doNotScrape: scrapedData.doNotScrape || false,
                            originalScrapedData: JSON.stringify(scrapedData),
                            data: createCleanDataForSave(scrapedData),
                            venueAssignmentStatus: isUnassigned ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED',
                            requiresVenueAssignment: isUnassigned,
                            suggestedVenueName: scrapedData?.venueName || scrapedData?.venueMatch?.extractedVenueName || null,
                            venueAssignmentConfidence: scrapedData?.venueMatch?.autoAssignedVenue?.score || 0
                        }
                    },
                    identity: { claims: { jobId, triggerSource }}
                };

                const saveResponse = await lambdaClient.send(new InvokeCommand({
                    FunctionName: functionName,
                    InvocationType: 'RequestResponse',
                    Payload: JSON.stringify(savePayload)
                }));
                
                const saveResult = JSON.parse(new TextDecoder().decode(saveResponse.Payload));
                
                if (saveResult.errorMessage) {
                    result.error = `SAVE failed: ${saveResult.errorMessage}`;
                    result.status = 'FAILED';
                } else {
                    result.gameId = saveResult.id || existingGameData?.id;
                    result.status = existingGameData ? 'UPDATED' : 'SAVED';
                }
            }
        } else {
            result.error = 'No usable data returned from scraper';
            result.status = 'BLANK';
        }
        
        result.processingTime = (Date.now() - startTime) / 1000;
        
        await Promise.all([
            // --- ENTITY ---: Pass entityId to updateScrapeURL
            updateScrapeURL(url, entityId, result, scrapedData),
            createScrapeAttempt(url, tournamentId, jobId, result, scrapedData),
            // --- ENTITY ---: Pass entityId to updateGameList
            updateGameList(tournamentId, scrapedData?.name || `ID ${tournamentId}`, result.status, entityId),
            addURLResultToJob(jobId, result)
        ]);
        
        return result;
        
    } catch (error) {
        result.error = error.message;
        result.processingTime = (Date.now() - startTime) / 1000;
        
        await Promise.all([
            // --- ENTITY ---: Pass entityId to updateScrapeURL
            updateScrapeURL(url, entityId, result),
            createScrapeAttempt(url, tournamentId, jobId, result),
            // --- ENTITY ---: Pass entityId to logStatus
            logStatus('ERROR', `Failed for ID #${tournamentId}`, error.message, entityId)
        ]);
        
        return result;
    }
};

/**
 * Adds URL result to job's tracking
 */
const addURLResultToJob = async (jobId, result) => {
    try {
        const jobTable = getTableName('ScraperJob');
        
        const response = await ddbDocClient.send(new GetCommand({
            TableName: jobTable,
            Key: { id: jobId }
        }));
        
        if (response.Item) {
            const urlResults = response.Item.urlResults || [];
            urlResults.push({
                url: result.url,
                tournamentId: result.tournamentId,
                status: result.status,
                gameName: result.gameName, // This might be undefined, which is fine
                processingTime: result.processingTime,
                error: result.error
            });
            
            const updates = {
                urlResults,
                totalURLsProcessed: (response.Item.totalURLsProcessed || 0) + 1
            };
            
            switch (result.status) {
                case 'SAVED':
                    updates.newGamesScraped = (response.Item.newGamesScraped || 0) + 1;
                    break;
                case 'UPDATED':
                    updates.gamesUpdated = (response.Item.gamesUpdated || 0) + 1;
                    break;
                case 'SKIPPED_DONOTSCRAPE':
                case 'SKIPPED_VENUE':
                    updates.gamesSkipped = (response.Item.gamesSkipped || 0) + 1;
                    break;
                case 'FAILED':
                case 'ERROR':
                    updates.errors = (response.Item.errors || 0) + 1;
                    updates.failedURLs = [...(response.Item.failedURLs || []), result.url];
                    updates.errorMessages = [...(response.Item.errorMessages || []), result.error];
                    break;
                case 'BLANK':
                case 'INACTIVE':
                    updates.blanks = (response.Item.blanks || 0) + 1;
                    break;
            }
            
            await updateScraperJob(jobId, updates);
        }
    } catch (error) {
        console.error(`Failed to update job results: ${error.message}`);
    }
};

/**
 * Performs the enhanced scraping run with full tracking
 */
const performScrapingEnhanced = async (config = {}) => {
    const startTime = Date.now();
    const {
        maxGames = MAX_NEW_GAMES_PER_RUN,
        triggerSource = 'SCHEDULED',
        triggeredBy = 'SYSTEM',
        targetURLs = null,
        startId = null,
        endId = null,
        // --- ENTITY ---: Extract entityId from config
        entityId = DEFAULT_ENTITY_ID
    } = config;
    
    // --- ENTITY ---: Pass entityId to createScraperJob
    const job = await createScraperJob(triggerSource, triggeredBy, entityId, {
        maxGames,
        targetURLs,
        startId,
        endId
    });
    
    const jobId = job.id;
    
    // --- ENTITY ---: Pass entityId to updateScraperState
    await updateScraperState(entityId, {
        isRunning: true,
        lastRunStartTime: new Date().toISOString(),
        currentLog: [],
        lastGamesProcessed: [],
        consecutiveBlankCount: 0,
        currentJobId: jobId
    });
    
    // --- ENTITY ---: Pass entityId to logStatus
    await logStatus('INFO', `Scraper job started`, `Job ID: ${jobId}, Source: ${triggerSource}`, entityId);
    
    const results = {
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0
    };
    
    try {
        if (targetURLs && targetURLs.length > 0) {
            // --- ENTITY ---: Pass entityId to logStatus
            await logStatus('INFO', `Processing ${targetURLs.length} specific URLs`, `Entity: ${entityId}`, entityId);
            
            for (const url of targetURLs) {
                if (Date.now() - startTime >= LAMBDA_TIMEOUT_BUFFER) break;
                
                // --- ENTITY ---: Pass entityId to scrapeAndProcessTournament
                const result = await scrapeAndProcessTournament(url, null, jobId, entityId, triggerSource);
                updateResultCounters(results, result.status);
            }
        } else {
            if (triggerSource === 'SCHEDULED') {
                // --- ENTITY ---: Pass entityId to logStatus
                await logStatus('INFO', 'Phase 1: Checking active games for updates', `Entity: ${entityId}`, entityId);
                // --- ENTITY ---: Pass entityId to getUpdateCandidateURLs
                const updateCandidates = await getUpdateCandidateURLs(entityId, 5);
                
                for (const url of updateCandidates) {
                    if (Date.now() - startTime >= LAMBDA_TIMEOUT_BUFFER) break;
                    
                    // --- ENTITY ---: Pass entityId to scrapeAndProcessTournament
                    const result = await scrapeAndProcessTournament(url, null, jobId, entityId, triggerSource);
                    updateResultCounters(results, result.status);
                }
            }
            
            // --- ENTITY ---: Pass entityId to getScraperState
            const state = await getScraperState(entityId, true);
            const scanStartId = startId || state.lastScannedId + 1;
            const scanEndId = endId || scanStartId + maxGames - 1;
            
            // --- ENTITY ---: Pass entityId to logStatus
            await logStatus('INFO', `Phase 2: Scanning for new games from ID ${scanStartId}`, `Entity: ${entityId}`, entityId);
            
            let currentId = scanStartId;
            let consecutiveBlanks = 0;
            
            while (
                results.newGamesScraped < maxGames &&
                consecutiveBlanks < MAX_CONSECUTIVE_BLANKS &&
                currentId <= scanEndId &&
                (Date.now() - startTime < LAMBDA_TIMEOUT_BUFFER)
            ) {
                const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
                // --- ENTITY ---: Pass entityId to scrapeAndProcessTournament
                const result = await scrapeAndProcessTournament(url, null, jobId, entityId, triggerSource);
                
                updateResultCounters(results, result.status);
                
                if (result.status === 'INACTIVE' || result.status === 'BLANK') {
                    consecutiveBlanks++;
                } else {
                    consecutiveBlanks = 0;
                }
                
                // --- ENTITY ---: Pass entityId to updateScraperState
                await updateScraperState(entityId, {
                    lastScannedId: currentId,
                    consecutiveBlankCount: consecutiveBlanks
                });
                
                currentId++;
            }
        }
        
        await finalizeScraperJob(jobId, startTime, results);
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        // --- ENTITY ---: Pass entityId to logStatus
        await logStatus('INFO', 'Scraper job completed', `Duration: ${duration}s, Results: ${JSON.stringify(results)}`, entityId);
        
        return {
            success: true,
            message: 'Scraping completed successfully',
            jobId,
            results
        };
        
    } catch (error) {
        console.error(`Fatal error in scraping job: ${error.message}`);
        // --- ENTITY ---: Pass entityId to logStatus
        await logStatus('ERROR', 'Fatal error during scraping', error.message, entityId);
        
        await updateScraperJob(jobId, {
            status: 'FAILED',
            endTime: new Date().toISOString(),
            errorMessages: [error.message]
        });
        
        return {
            success: false,
            message: error.message,
            jobId,
            results
        };
        
    } finally {
        // --- ENTITY ---: Pass entityId to getScraperState and updateScraperState
        const finalState = await getScraperState(entityId, true);
        await updateScraperState(entityId, {
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            totalScraped: (finalState.totalScraped || 0) + results.newGamesScraped + results.gamesUpdated,
            totalErrors: (finalState.totalErrors || 0) + results.errors,
            currentJobId: null
        });
    }
};

/**
 * Helper to update result counters
 */
const updateResultCounters = (results, status) => {
    switch (status) {
        case 'SAVED':
            results.newGamesScraped++;
            break;
        case 'UPDATED':
            results.gamesUpdated++;
            break;
        case 'SKIPPED_DONOTSCRAPE':
        case 'SKIPPED_VENUE':
            results.gamesSkipped++;
            break;
        case 'FAILED':
        case 'ERROR':
            results.errors++;
            break;
        case 'BLANK':
        case 'INACTIVE':
            results.blanks++;
            break;
    }
};

// --- Legacy support functions (keeping compatibility) ---
// --- ENTITY ---: Added entityId parameter
const updateScraperState = async (entityId, updates) => {
    // --- ENTITY ---: State ID is now dynamic based on entityId
    const stateId = entityId ? `STATE_${entityId}` : 'AUTO_SCRAPER_STATE';
    const now = new Date().toISOString();
    try {
        const scraperStateTable = getTableName('ScraperState');
        // --- ENTITY ---: Pass entityId to getScraperState
        const currentState = await getScraperState(entityId, true);
        const mergedItem = {
            ...currentState,
            ...updates,
            id: stateId,
            // --- ENTITY ---: Store entityId on the state record
            entityId: entityId || null,
            updatedAt: now,
            _lastChangedAt: Date.now(),
            __typename: 'ScraperState'
        };
        await ddbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: mergedItem
        }));
        return mergedItem;
    } catch (error) {
        console.error(`[STATE-UPDATE] ERROR: ${error.message}`);
        return { id: stateId, ...updates, updatedAt: now };
    }
};

// --- ENTITY ---: Added entityId parameter
const getScraperState = async (entityId, isInternalCall = false) => {
    // --- ENTITY ---: State ID is now dynamic based on entityId
    const stateId = entityId ? `STATE_${entityId}` : 'AUTO_SCRAPER_STATE';
    const scraperStateTable = getTableName('ScraperState');
    const defaultState = {
        id: stateId,
        // --- ENTITY ---: Include entityId in default state
        entityId: entityId || null,
        isRunning: false,
        lastScannedId: 0,
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
 * Main handler with enhanced routing
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
            if (state.isRunning) {
                return { success: false, message: 'Cannot reset while running', state };
            }
            // --- ENTITY ---: Pass entityId to updateScraperState
            const resetState = await updateScraperState(entityId, {
                isRunning: false,
                lastScannedId: 0,
                lastRunStartTime: null,
                lastRunEndTime: null,
                consecutiveBlankCount: 0,
                totalScraped: 0,
                totalErrors: 0,
                enabled: true,
                currentLog: [],
                lastGamesProcessed: []
            });
            return { success: true, message: 'State reset', state: resetState };
            
        case 'STATUS':
            return { success: true, state };
            
        default:
            return { success: false, message: `Unknown operation: ${operation}`, state };
    }
};

/**
 * Get scraper jobs with filtering
 */
// --- ENTITY ---: Updated function to query by entityId
const getScraperJobs = async (args = {}) => {
    const { entityId, status, limit = 20, nextToken } = args;
    
    if (!entityId) {
        throw new Error("entityId is required to get ScraperJobs");
    }

    const params = {
        TableName: getTableName('ScraperJob'),
        IndexName: 'byEntityScraperJob', // GSI from schema
        KeyConditionExpression: '#ent = :entId',
        ExpressionAttributeNames: { '#ent': 'entityId' },
        ExpressionAttributeValues: { ':entId': entityId },
        Limit: limit,
        ScanIndexForward: false // Show newest jobs first
    };
    
    // Add filter for status if provided
    if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames['#status'] = 'status';
        params.ExpressionAttributeValues[':status'] = status;
    }
    
    if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const response = await ddbDocClient.send(new QueryCommand(params));
    
    return {
        items: response.Items || [],
        nextToken: response.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64') 
            : null
    };
};

/**
 * Get scrape URLs with filtering
 */
// --- ENTITY ---: Updated function to query by entityId
const getScrapeURLs = async (args = {}) => {
    const { entityId, status, limit = 20, nextToken } = args;

    if (!entityId) {
        throw new Error("entityId is required to get ScrapeURLs");
    }

    const params = {
        TableName: getTableName('ScrapeURL'),
        IndexName: 'byEntityScrapeURL', // GSI from schema
        KeyConditionExpression: '#ent = :entId',
        ExpressionAttributeNames: { '#ent': 'entityId' },
        ExpressionAttributeValues: { ':entId': entityId },
        Limit: limit
    };
    
    // Add filter for status if provided
    if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames['#status'] = 'status';
        params.ExpressionAttributeValues[':status'] = status;
    }
    
    if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const response = await ddbDocClient.send(new QueryCommand(params));
    
    return {
        items: response.Items || [],
        nextToken: response.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64') 
            : null
    };
};