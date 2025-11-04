/* Enhanced Auto Scraper Lambda with ScraperJobs and ScrapeURLs tracking
 * This file replaces the existing index.js with comprehensive record keeping
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');
const { TextDecoder } = require('util');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// --- Configuration & Clients ---
const client = new DynamoDBClient({});
const marshallOptions = {
    // Instructs the client to remove undefined values
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
    const specialTables = {
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
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
const createScraperJob = async (triggerSource, triggeredBy, config = {}) => {
    const jobId = crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    
    const jobRecord = {
        id: jobId,
        jobId: jobId,
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
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    for (const [key, value] of Object.entries(updates)) {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
    }
    
    // Always update timestamps
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = now;
    
    updateExpressions.push('#_lastChangedAt = :_lastChangedAt');
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
        status: results.errors > 0 ? 'COMPLETED' : 'COMPLETED', // Could be FAILED if many errors
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
const getOrCreateScrapeURL = async (url, tournamentId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    const urlId = url; // Use URL as ID for uniqueness
    
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
const updateScrapeURL = async (url, result, scrapedData = null) => {
    const now = new Date().toISOString();
    const urlId = url;
    
    // Get current record
    const current = await getOrCreateScrapeURL(url, result.tournamentId);
    
    // Calculate new metrics
    const timesScraped = (current.timesScraped || 0) + 1;
    const isSuccess = ['SAVED', 'UPDATED', 'NO_CHANGES'].includes(result.status);
    const timesSuccessful = (current.timesSuccessful || 0) + (isSuccess ? 1 : 0);
    const timesFailed = (current.timesFailed || 0) + (!isSuccess ? 1 : 0);
    const consecutiveFailures = isSuccess ? 0 : (current.consecutiveFailures || 0) + 1;
    
    // Calculate data hash if we have scraped data
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
    
    // Determine new status
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
    
    // Update record
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
const getUpdateCandidateURLs = async (limit = 10) => {
    const response = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('Game'),
        IndexName: 'byStatus',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
            '#status': 'gameStatus'
        },
        ExpressionAttributeValues: {
            ':status': 'RUNNING'
        },
        Limit: limit
    }));
    
    return response.Items ? response.Items.map(game => game.sourceUrl) : [];
};

/**
 * Enhanced scrape and process function with full tracking
 */
const scrapeAndProcessTournament = async (url, existingGameData, jobId, triggerSource) => {
    const startTime = Date.now();
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    const idMatch = url.match(/id=(\d+)/);
    const tournamentId = idMatch ? parseInt(idMatch[1], 10) : (existingGameData?.id || null);
    
    if (!tournamentId) {
        throw new Error(`Could not determine tournament ID from URL: ${url}`);
    }
    
    // Initialize result tracking
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
        // Log to ScraperState
        await logStatus('INFO', `Fetching/Scraping ID #${tournamentId}`);
        
        // Fetch tournament data
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
        console.log(`[AUTO-SCRAPER-TRACE] Fetched data for ${url}. Player entries:`, scrapedData?.entries?.length, 'Player results:', scrapedData?.results?.length);

        if (scraperResult.errorMessage) {
            result.error = scraperResult.errorMessage;
            if (result.error.includes('Scraping is disabled')) {
                result.status = 'SKIPPED_DONOTSCRAPE';
            } else {
                result.status = 'FAILED';
            }
        } else if (scrapedData && scrapedData.name) {
            // Check for inactive tournament
            if (scrapedData.isInactive) {
                result.status = 'INACTIVE';
            } else {
                // Get venue assignment - use UNASSIGNED_VENUE_ID if no match
                const autoAssignedVenueId = scrapedData?.venueMatch?.autoAssignedVenue?.id || existingGameData?.venueId || UNASSIGNED_VENUE_ID;
                const isUnassigned = autoAssignedVenueId === UNASSIGNED_VENUE_ID;
                
                result.venueId = autoAssignedVenueId;
                
                // Save tournament data even without venue
                const savePayload = {
                    fieldName: 'saveTournamentData',
                    arguments: {
                        input: {
                            sourceUrl: url,
                            venueId: autoAssignedVenueId,
                            existingGameId: gameIdFromFetch,
                            doNotScrape: scrapedData.doNotScrape || false,
                            originalScrapedData: JSON.stringify(scrapedData),
                            data: createCleanDataForSave(scrapedData),
                            // Add venue assignment tracking
                            venueAssignmentStatus: isUnassigned ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED',
                            requiresVenueAssignment: isUnassigned,
                            suggestedVenueName: scrapedData?.venueName || scrapedData?.venueMatch?.extractedVenueName || null,
                            venueAssignmentConfidence: scrapedData?.venueMatch?.autoAssignedVenue?.score || 0
                        }
                    },
                    identity: { claims: { jobId, triggerSource }}
                };
                console.log(`[AUTO-SCRAPER-TRACE] Building savePayload for ${url}.`);
                console.log(`[AUTO-SCRAPER-TRACE] Type of originalScrapedData being sent:`, typeof savePayload.arguments.input.originalScrapedData);
                console.log(`[AUTO-SCRAPER-TRACE] Length of originalScrapedData string:`, savePayload.arguments.input.originalScrapedData?.length);

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
        
        // Calculate processing time
        result.processingTime = (Date.now() - startTime) / 1000;
        
        // Update all tracking records
        await Promise.all([
            // Update ScrapeURL record
            updateScrapeURL(url, result, scrapedData),
            
            // Create ScrapeAttempt record
            createScrapeAttempt(url, tournamentId, jobId, result, scrapedData),
            
            // Update game list in ScraperState
            updateGameList(tournamentId, scrapedData?.name || `ID ${tournamentId}`, result.status),
            
            // Add to job's URL results
            addURLResultToJob(jobId, result)
        ]);
        
        return result;
        
    } catch (error) {
        result.error = error.message;
        result.processingTime = (Date.now() - startTime) / 1000;
        
        await Promise.all([
            updateScrapeURL(url, result),
            createScrapeAttempt(url, tournamentId, jobId, result),
            logStatus('ERROR', `Failed for ID #${tournamentId}`, error.message)
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
        
        // Get current job
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
                gameName: result.gameName,
                processingTime: result.processingTime,
                error: result.error
            });
            
            // Update counters
            const updates = {
                urlResults,
                totalURLsProcessed: (response.Item.totalURLsProcessed || 0) + 1
            };
            
            // Update specific counters based on status
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
        endId = null
    } = config;
    
    // Create job record
    const job = await createScraperJob(triggerSource, triggeredBy, {
        maxGames,
        targetURLs,
        startId,
        endId
    });
    
    const jobId = job.id;
    
    // Update ScraperState
    await updateScraperState({
        isRunning: true,
        lastRunStartTime: new Date().toISOString(),
        currentLog: [],
        lastGamesProcessed: [],
        consecutiveBlankCount: 0,
        currentJobId: jobId
    });
    
    await logStatus('INFO', `Scraper job started`, `Job ID: ${jobId}, Source: ${triggerSource}`);
    
    const results = {
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0
    };
    
    try {
        if (targetURLs && targetURLs.length > 0) {
            // Process specific URLs
            await logStatus('INFO', `Processing ${targetURLs.length} specific URLs`);
            
            for (const url of targetURLs) {
                if (Date.now() - startTime >= LAMBDA_TIMEOUT_BUFFER) break;
                
                const result = await scrapeAndProcessTournament(url, null, jobId, triggerSource);
                updateResultCounters(results, result.status);
            }
        } else {
            // Phase 1: Check active games for updates
            if (triggerSource === 'SCHEDULED') {
                await logStatus('INFO', 'Phase 1: Checking active games for updates');
                const updateCandidates = await getUpdateCandidateURLs(5);
                
                for (const url of updateCandidates) {
                    if (Date.now() - startTime >= LAMBDA_TIMEOUT_BUFFER) break;
                    
                    const result = await scrapeAndProcessTournament(url, null, jobId, triggerSource);
                    updateResultCounters(results, result.status);
                }
            }
            
            // Phase 2: Scan for new games
            const state = await getScraperState(true);
            const scanStartId = startId || state.lastScannedId + 1;
            const scanEndId = endId || scanStartId + maxGames - 1;
            
            await logStatus('INFO', `Phase 2: Scanning for new games from ID ${scanStartId}`);
            
            let currentId = scanStartId;
            let consecutiveBlanks = 0;
            
            while (
                results.newGamesScraped < maxGames &&
                consecutiveBlanks < MAX_CONSECUTIVE_BLANKS &&
                currentId <= scanEndId &&
                (Date.now() - startTime < LAMBDA_TIMEOUT_BUFFER)
            ) {
                const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
                const result = await scrapeAndProcessTournament(url, null, jobId, triggerSource);
                
                updateResultCounters(results, result.status);
                
                if (result.status === 'INACTIVE' || result.status === 'BLANK') {
                    consecutiveBlanks++;
                } else {
                    consecutiveBlanks = 0;
                }
                
                await updateScraperState({
                    lastScannedId: currentId,
                    consecutiveBlankCount: consecutiveBlanks
                });
                
                currentId++;
            }
        }
        
        // Finalize job
        await finalizeScraperJob(jobId, startTime, results);
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        await logStatus('INFO', 'Scraper job completed', `Duration: ${duration}s, Results: ${JSON.stringify(results)}`);
        
        return {
            success: true,
            message: 'Scraping completed successfully',
            jobId,
            results
        };
        
    } catch (error) {
        console.error(`Fatal error in scraping job: ${error.message}`);
        await logStatus('ERROR', 'Fatal error during scraping', error.message);
        
        // Update job as failed
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
        // Update ScraperState
        const finalState = await getScraperState(true);
        await updateScraperState({
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
const updateScraperState = async (updates) => {
    const stateId = 'AUTO_SCRAPER_STATE';
    const now = new Date().toISOString();
    try {
        const scraperStateTable = getTableName('ScraperState');
        const currentState = await getScraperState(true);
        const mergedItem = {
            ...currentState,
            ...updates,
            id: stateId,
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

const getScraperState = async (isInternalCall = false) => {
    const stateId = 'AUTO_SCRAPER_STATE';
    const scraperStateTable = getTableName('ScraperState');
    const defaultState = {
        id: stateId,
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

const logStatus = async (level, message, details = '') => {
    const state = await getScraperState(true);
    const newEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        details
    };
    const newLog = [newEntry, ...(state.currentLog || [])].slice(0, MAX_LOG_SIZE);
    await updateScraperState({ currentLog: newLog });
};

const updateGameList = async (id, name, status) => {
    const state = await getScraperState(true);
    const newGameEntry = {
        id: id.toString(),
        name,
        status
    };
    const newList = [newGameEntry, ...(state.lastGamesProcessed || [])].slice(0, MAX_GAME_LIST_SIZE);
    await updateScraperState({ lastGamesProcessed: newList });
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
    
    try {
        // Handle GraphQL operations
        if (fieldName) {
            switch (fieldName) {
                case 'triggerAutoScraping':
                    return await performScrapingEnhanced({
                        maxGames: args?.maxGames,
                        triggerSource: 'MANUAL',
                        triggeredBy: event.identity?.username || 'UNKNOWN'
                    });
                    
                case 'controlScraperOperation':
                    return await controlScraperEnhanced(args?.operation);
                    
                case 'getScraperControlState':
                    const state = await getScraperState();
                    return { success: true, state };
                    
                case 'startScraperJob':
                    return await performScrapingEnhanced({
                        ...args?.input,
                        triggeredBy: event.identity?.username || 'UNKNOWN'
                    });
                    
                case 'getScraperJobs':
                    return await getScraperJobs(args);
                    
                case 'getScrapeURLs':
                    return await getScrapeURLs(args);
                    
                case 'getUpdateCandidateURLs':
                    const urls = await getUpdateCandidateURLs(args?.limit);
                    return urls;
                    
                default:
                    throw new Error(`Unknown fieldName: ${fieldName}`);
            }
        }
        
        // Handle scheduled events
        if (source === 'aws.scheduler' || detailType === 'Scheduled Event') {
            return await performScrapingEnhanced({
                triggerSource: 'SCHEDULED'
            });
        }
        
        // Handle async worker
        if (operation === 'START_WORKER') {
            return await performScrapingEnhanced(event.config);
        }
        
        // Default
        const state = await getScraperState();
        return { success: true, state };
        
    } catch (error) {
        console.error(`[HANDLER] Fatal error: ${error.message}`);
        throw error;
    }
};

/**
 * Enhanced control function
 */
const controlScraperEnhanced = async (operation) => {
    const state = await getScraperState();
    
    switch (operation) {
        case 'START':
            if (state.isRunning || !state.enabled) {
                return {
                    success: false,
                    message: state.isRunning ? 'Already running' : 'Disabled',
                    state
                };
            }
            
            // Start async worker
            await lambdaClient.send(new InvokeCommand({
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                InvocationType: 'Event',
                Payload: JSON.stringify({
                    operation: 'START_WORKER',
                    config: { triggerSource: 'CONTROL' }
                })
            }));
            
            return { success: true, message: 'Scraper started', state };
            
        case 'STOP':
            await updateScraperState({ isRunning: false });
            return { success: true, message: 'Scraper stopped', state };
            
        case 'ENABLE':
            await updateScraperState({ enabled: true });
            return { success: true, message: 'Auto-scraping enabled', state };
            
        case 'DISABLE':
            await updateScraperState({ enabled: false });
            return { success: true, message: 'Auto-scraping disabled', state };
            
        case 'RESET':
            if (state.isRunning) {
                return { success: false, message: 'Cannot reset while running', state };
            }
            const resetState = await updateScraperState({
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
const getScraperJobs = async (args = {}) => {
    const { status, limit = 20, nextToken } = args;
    const params = {
        TableName: getTableName('ScraperJob'),
        Limit: limit
    };
    
    if (status) {
        params.IndexName = 'byStatus';
        params.KeyConditionExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { ':status': status };
    }
    
    if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const response = await ddbDocClient.send(
        status ? new QueryCommand(params) : new ScanCommand(params)
    );
    
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
const getScrapeURLs = async (args = {}) => {
    const { status, limit = 20, nextToken } = args;
    const params = {
        TableName: getTableName('ScrapeURL'),
        Limit: limit
    };
    
    if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { ':status': status };
    }
    
    if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const response = await ddbDocClient.send(new ScanCommand(params));
    
    return {
        items: response.Items || [],
        nextToken: response.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64') 
            : null
    };
};
