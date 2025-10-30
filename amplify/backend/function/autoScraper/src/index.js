/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_SCRAPERSTATETABLE_ARN
	API_KINGSROOM_SCRAPERSTATETABLE_NAME
	ENV
	FUNCTION_PLAYERDATAPROCESSOR_NAME
	FUNCTION_WEBSCRAPERFUNCTION_NAME
	REGION
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand, InvokeCommandInput } = require('@aws-sdk/client-lambda');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

// ⚡ OPTIMIZED SETTINGS - For worker mode
const MAX_NON_COMPLETE_GAMES_PER_RUN = 5; 
const MAX_NEW_GAMES_PER_RUN = 10;          
const LAMBDA_TIMEOUT_BUFFER = 30000;       // Leave 30 seconds buffer for graceful shutdown
const MAX_CONSECUTIVE_BLANKS = 2;

// Log and Game List Configuration
const MAX_LOG_SIZE = 25; 
const MAX_GAME_LIST_SIZE = 5; 

/**
 * Get table name using Amplify naming convention
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables.`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Update the scraper state.
 * This is a simple PUT operation, relying on the calling function to manage versioning and fields.
 */
const updateScraperState = async (updates) => {
    const stateId = 'AUTO_SCRAPER_STATE';
    const now = new Date().toISOString();
    
    try {
        const scraperStateTable = getTableName('ScraperState');
        const item = {
            id: stateId,
            ...updates,
            updatedAt: now,
            _lastChangedAt: Date.now(),
            __typename: 'ScraperState'
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: item
        }));
        
        return item;
    } catch (error) {
        console.error('Error updating scraper state (table may not exist):', error.message);
        return { id: stateId, ...updates, updatedAt: now };
    }
};


/**
 * Get or create the scraper state record
 */
const getScraperState = async () => {
    const stateId = 'AUTO_SCRAPER_STATE';
    
    // Default state with new log fields initialized
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
        currentLog: [], // New logging field
        lastGamesProcessed: [] // New game list field
    };
    
    try {
        const scraperStateTable = getTableName('ScraperState');
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId }
        }));
        
        if (response.Item) {
            // Ensure new fields exist for backward compatibility with old records
            return {
                ...defaultState,
                ...response.Item,
                currentLog: response.Item.currentLog || [],
                lastGamesProcessed: response.Item.lastGamesProcessed || []
            };
        }
        
        // Create initial record if it doesn't exist
        await updateScraperState(defaultState);
        return defaultState;
        
    } catch (error) {
        console.log('ScraperState table might not exist yet, using default state:', error.message);
        return defaultState;
    }
};


/**
 * NEW HELPER: Pushes a new log entry to the database and trims the log size.
 */
const logStatus = async (level, message, details = '') => {
    const state = await getScraperState();
    
    const newEntry = {
        timestamp: new Date().toISOString(),
        level: level,
        message: message,
        details: details
    };

    // Use unshift to add to the front (making it a circular buffer/queue when trimmed)
    const newLog = [newEntry, ...(state.currentLog || [])];
    
    // Trim to maintain max size
    if (newLog.length > MAX_LOG_SIZE) {
        newLog.splice(MAX_LOG_SIZE);
    }
    
    await updateScraperState({
        ...state,
        currentLog: newLog
    });
};

/**
 * NEW HELPER: Pushes a new game status to the dashboard list and trims the size.
 */
const updateGameList = async (id, name, status) => {
    const state = await getScraperState();
    
    const newGameEntry = {
        id: id,
        name: name,
        status: status
    };

    // Add to the start of the list
    const newList = [newGameEntry, ...(state.lastGamesProcessed || [])];

    // Trim to maintain max size
    if (newList.length > MAX_GAME_LIST_SIZE) {
        newList.splice(MAX_GAME_LIST_SIZE);
    }
    
    await updateScraperState({
        ...state,
        lastGamesProcessed: newList
    });
};

/**
 * Get the highest game ID from the Game table
 */
const getHighestGameId = async () => {
    const gameTable = getTableName('Game');
    
    try {
        const response = await ddbDocClient.send(new ScanCommand({
            TableName: gameTable,
            ProjectionExpression: 'sourceUrl',
            FilterExpression: 'attribute_exists(sourceUrl)'
        }));
        
        let highestId = 0;
        
        if (response.Items && response.Items.length > 0) {
            response.Items.forEach(item => {
                if (item.sourceUrl) {
                    const match = item.sourceUrl.match(/id=(\d+)/);
                    if (match) {
                        const id = parseInt(match[1]);
                        if (id > highestId) {
                            highestId = id;
                        }
                    }
                }
            });
        }
        
        return highestId;
    } catch (error) {
        console.error('Error getting highest game ID:', error);
        return 0;
    }
};

/**
 * Get limited non-complete games that need rescanning
 */
const getNonCompleteGames = async (limit = MAX_NON_COMPLETE_GAMES_PER_RUN) => {
    const gameTable = getTableName('Game');
    
    try {
        const response = await ddbDocClient.send(new ScanCommand({
            TableName: gameTable,
            FilterExpression: 'gameStatus <> :finished AND gameStatus <> :cancelled AND doNotScrape <> :true AND attribute_exists(sourceUrl)',
            ExpressionAttributeValues: {
                ':finished': 'FINISHED',
                ':cancelled': 'CANCELLED',
                ':true': true
            },
            ProjectionExpression: 'id, sourceUrl, gameStatus, #name',
            ExpressionAttributeNames: {
                '#name': 'name'
            },
            Limit: limit 
        }));
        
        return response.Items || [];
    } catch (error) {
        console.error('Error getting non-complete games:', error);
        return [];
    }
};

/**
 * CORE WORKER: Invokes the webScraperFunction to first scrape (FETCH), then save (SAVE).
 */
const scrapeAndSaveTournament = async (url) => {
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    
    // --- Step 1: Scrape the data (FETCH operation) ---
    const fetchPayload = { arguments: { operation: 'FETCH', url: url } };
    let scrapedData;
    
    try {
        await logStatus('INFO', `Fetching HTML for ${url}`);
        
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(fetchPayload)
        }));

        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        if (result.errorMessage) throw new Error(result.errorMessage);

        scrapedData = result.data; 
        
        // Log basic info
        const gameName = scrapedData.name || 'Unnamed Game';
        
        if (scrapedData.isInactive) {
            await logStatus('WARN', `Inactive ID detected: ${url}`, gameName);
            return { scrapedData, status: 'INACTIVE' };
        }
        
        await logStatus('INFO', `Scrape SUCCESS: ${gameName} (${scrapedData.gameStatus})`);
        
        // Check for an auto-assigned venue before saving
        const autoAssignedVenueId = scrapedData?.venueMatch?.autoAssignedVenue?.id;

        if (!autoAssignedVenueId) {
            await logStatus('WARN', `Venue match failed for ${gameName}. Skipping save.`, 'No high-confidence venue found.');
            return { scrapedData, status: 'SKIPPED_VENUE' };
        }

        // --- Step 2: Save the data (SAVE operation) ---
        await logStatus('INFO', `Saving game data: ${gameName}`, `Auto-matched venue: ${autoAssignedVenueId}`);
        
        const savePayload = {
            arguments: {
                operation: 'SAVE',
                url: url,
                venueId: autoAssignedVenueId,
                scrapedData: scrapedData // Pass the already scraped data
            }
        };
        
        // Invoke the save operation (which triggers SQS and playerDataProcessor)
        await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse', 
            Payload: JSON.stringify(savePayload)
        }));

        await logStatus('INFO', `SAVE COMPLETE: ${gameName}`, 'SQS message sent to process player data.');
        return { scrapedData, status: 'SAVED' };

    } catch (error) {
        const errorMsg = error.message || 'Lambda execution error';
        await logStatus('ERROR', `Scrape/Save failed for ${url}`, errorMsg);
        throw error;
    }
};


/**
 * Main scraping logic
 */
const performScraping = async () => {
    console.log('[AutoScraper] Starting automated scraping process...');
    const startTime = Date.now();
    
    const state = await getScraperState();
    
    // Check if already running or disabled
    if (state.isRunning) return { success: false, message: 'Scraper is already in progress' };
    if (!state.enabled) return { success: false, message: 'Auto scraping is disabled' };
    
    // Mark as running and clear logs/game list
    await updateScraperState({
        ...state,
        isRunning: true,
        lastRunStartTime: new Date().toISOString(),
        currentLog: [], // Clear logs
        lastGamesProcessed: [], // Clear game list
        consecutiveBlankCount: 0
    });
    
    await logStatus('INFO', 'Worker initialized.', `Max runtime: ${LAMBDA_TIMEOUT_BUFFER / 1000}s`);

    const results = { newGamesScraped: 0, gamesUpdated: 0, errors: 0, blanks: 0 };
    
    try {
        // Step 1: Rescrape non-complete games
        await logStatus('INFO', `Step 1: Rescanning up to ${MAX_NON_COMPLETE_GAMES_PER_RUN} non-complete games.`);
        const nonCompleteGames = await getNonCompleteGames(MAX_NON_COMPLETE_GAMES_PER_RUN);
        
        for (const game of nonCompleteGames) {
            if (Date.now() - startTime > LAMBDA_TIMEOUT_BUFFER) break;
            
            let status = 'ERROR';
            try {
                const response = await scrapeAndSaveTournament(game.sourceUrl);
                status = response.status;
            } catch (error) {
                status = 'ERROR';
                results.errors++;
            }
            
            await updateGameList(game.id, game.name, status);
            if (status === 'SAVED') results.gamesUpdated++;
        }
        
        // Step 2: Find and save new games
        await logStatus('INFO', `Step 2: Scanning for up to ${MAX_NEW_GAMES_PER_RUN} new games.`);
        
        const highestDbId = await getHighestGameId();
        const startId = Math.max(state.lastScannedId || 0, highestDbId) + 1;
        await logStatus('INFO', `Starting new ID scan from: ${startId}`);
        
        let currentId = startId;
        let consecutiveBlanks = 0;
        
        while (
            consecutiveBlanks < MAX_CONSECUTIVE_BLANKS && 
            results.newGamesScraped < MAX_NEW_GAMES_PER_RUN &&
            (Date.now() - startTime) < LAMBDA_TIMEOUT_BUFFER
        ) {
            const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
            
            let status = 'ERROR';
            try {
                const response = await scrapeAndSaveTournament(url);
                status = response.status;
            } catch (error) {
                status = 'ERROR';
                results.errors++;
            }
            
            if (status === 'INACTIVE') {
                consecutiveBlanks++;
                results.blanks++;
                await updateGameList(currentId, 'Inactive/Blank', 'BLANK');
            } else if (status === 'SAVED') {
                consecutiveBlanks = 0;
                results.newGamesScraped++;
                await updateGameList(currentId, 'New Game', 'SAVED'); // Name updated inside scrapeAndSave
            } else if (status === 'SKIPPED_VENUE') {
                consecutiveBlanks = 0; // Skip saves are not true blanks
                await updateGameList(currentId, 'New Game (Skipped)', 'SKIPPED');
            } else if (status === 'ERROR') {
                consecutiveBlanks = 0; // Skip saves are not true blanks
                await updateGameList(currentId, 'Failed ID', 'FAILED');
            }
            
            // Update last scanned ID, total scraped count, and log status
            const newState = await getScraperState();
            await updateScraperState({
                ...newState,
                lastScannedId: currentId,
                totalScraped: (newState.totalScraped || 0) + 1
            });
            
            currentId++;
        }
        
        if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS) {
            await logStatus('INFO', `Stopped scan after ${MAX_CONSECUTIVE_BLANKS} consecutive blank IDs.`);
        }
        
    } catch (error) {
        await logStatus('ERROR', 'A fatal, unhandled error occurred during the run.', error.message);
        throw error;
    } finally {
        // Finalize state
        const finalState = await getScraperState();
        const runDuration = Math.round((Date.now() - startTime) / 1000);

        await logStatus('INFO', 'Worker run complete. Finalizing state.', `Duration: ${runDuration}s`);

        await updateScraperState({
            ...finalState,
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            totalErrors: (finalState.totalErrors || 0) + results.errors
        });
        
        // Return results for GraphQL mutation response
        return { 
            success: true, 
            message: `Scraping completed in ${runDuration}s.`,
            results: results
        };
    }
};

/**
 * Control operations for the scraper
 */
const controlScraper = async (operation) => {
    const state = await getScraperState();
    
    switch (operation) {
        case 'START':
            if (state.isRunning) {
                return { success: false, message: 'Scraper is already running', state };
            }
            // Invoke Lambda asynchronously to prevent GraphQL timeout
            const params = {
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                InvocationType: 'Event', // Asynchronous invocation
                Payload: JSON.stringify({ operation: 'START_WORKER' }) // Trigger internal worker
            };
            await lambdaClient.send(new InvokeCommand(params));
            
            // Return status immediately
            return { success: true, message: 'Scraper worker started asynchronously.', state };
            
        case 'STOP':
            // Logic handled by the worker itself checking isRunning=false on the next iteration
            const stoppedState = await updateScraperState({ 
                ...state, 
                isRunning: false, 
                lastRunEndTime: new Date().toISOString() 
            });
            return { success: true, message: 'Scraper stop requested. Worker will exit soon.', state: stoppedState };
            
        case 'ENABLE':
            const enabledState = await updateScraperState({ ...state, enabled: true });
            return { success: true, message: 'Auto scraping enabled', state: enabledState };
            
        case 'DISABLE':
            const disabledState = await updateScraperState({ ...state, enabled: false });
            return { success: true, message: 'Auto scraping disabled', state: disabledState };
            
        case 'STATUS':
            return { success: true, state };
            
        case 'RESET':
            const resetState = {
                id: 'AUTO_SCRAPER_STATE',
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
            await updateScraperState(resetState);
            return { success: true, message: 'Scraper state reset', state: resetState };
            
        default:
            return { success: false, message: `Unknown operation: ${operation}` };
    }
};

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    
    try {
        // Handle GraphQL resolver calls
        if (event.fieldName) {
            // GraphQL mutations that trigger a background worker (START, MANUAL)
            if (event.fieldName === 'triggerAutoScraping' || event.fieldName === 'performAutoScraping') {
                 // Use the same logic as START, but invoke the Lambda itself
                const params = {
                    FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                    InvocationType: 'Event', // Asynchronous invocation
                    Payload: JSON.stringify({ operation: 'START_WORKER' }) // Trigger internal worker
                };
                await lambdaClient.send(new InvokeCommand(params));
                
                const state = await getScraperState();
                return { success: true, message: 'Manual scrape started asynchronously.', state };
            }
            
            // GraphQL queries/mutations that control/read status
            if (event.fieldName === 'controlScraperOperation' || event.fieldName === 'controlAutoScraper') {
                const { operation } = event.arguments;
                return await controlScraper(operation);
            }
            
            if (event.fieldName === 'getScraperControlState' || event.fieldName === 'getScraperState') {
                return await controlScraper('STATUS');
            }
            
            throw new Error(`Unknown fieldName: ${event.fieldName}`);
        }
        
        // Handle EventBridge scheduled events
        if (event.source === 'aws.scheduler' || event['detail-type'] === 'Scheduled Event') {
            await logStatus('INFO', 'Scheduled run received from EventBridge. Starting worker.');
            return await performScraping();
        }
        
        // Handle ASYNCHRONOUS worker invocation
        if (event.operation === 'START_WORKER') {
            await logStatus('INFO', 'Asynchronous worker signal received. Starting core process.');
            return await performScraping();
        }
        
        // Default to returning status if no fieldName or scheduled event is present
        return await controlScraper('STATUS');
        
    } catch (error) {
        console.error('Error in handler:', error);
        return { 
            success: false, 
            message: error.message,
            error: error.message 
        };
    }
};