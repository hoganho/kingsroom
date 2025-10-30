/* OPTIMIZED VERSION - Handles timeouts better */
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
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

// ⚡ OPTIMIZED SETTINGS - Reduce these to avoid timeouts
const MAX_NON_COMPLETE_GAMES_PER_RUN = 5;  // Process only 5 non-complete games at a time
const MAX_NEW_GAMES_PER_RUN = 10;          // Scan only 10 new games per run
const LAMBDA_TIMEOUT_BUFFER = 30000;       // Leave 30 seconds buffer before timeout
const MAX_CONSECUTIVE_BLANKS = 2;

/**
 * Get table name using Amplify naming convention
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables.`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Get or create the scraper state record
 */
const getScraperState = async () => {
    const stateId = 'AUTO_SCRAPER_STATE';
    
    // Default state
    const defaultState = {
        id: stateId,
        isRunning: false,
        lastScannedId: 0,
        lastRunStartTime: null,
        lastRunEndTime: null,
        consecutiveBlankCount: 0,
        totalScraped: 0,
        totalErrors: 0,
        enabled: true
    };
    
    try {
        const scraperStateTable = getTableName('ScraperState');
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId }
        }));
        
        if (response.Item) {
            return response.Item;
        }
        
        // Create initial record if it doesn't exist
        await ddbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: {
                ...defaultState,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                _lastChangedAt: Date.now(),
                _version: 1,
                __typename: 'ScraperState'
            }
        }));
        
        return defaultState;
    } catch (error) {
        console.log('ScraperState table might not exist yet, using default state:', error.message);
        return defaultState;
    }
};

/**
 * Update the scraper state
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
            Limit: limit  // ⚡ LIMIT the results
        }));
        
        return response.Items || [];
    } catch (error) {
        console.error('Error getting non-complete games:', error);
        return [];
    }
};

/**
 * Simple fetch operation - just scrapes without saving
 * This is faster and used for checking game status
 */
const fetchTournamentData = async (url) => {
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    if (!functionName) {
        throw new Error('webScraperFunction name not found in environment variables.');
    }

    try {
        const payload = {
            fieldName: 'fetchTournamentData',
            arguments: { url }
        };

        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(payload)
        }));

        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        if (result.errorMessage) throw new Error(result.errorMessage);
        
        return result;
    } catch (error) {
        console.error(`Error fetching tournament data for ${url}:`, error);
        throw error;
    }
};

/**
 * ⚡ OPTIMIZED: Lighter-weight main scraping logic
 */
const performScraping = async () => {
    console.log('[AutoScraper] Starting optimized scraping process...');
    const startTime = Date.now();
    
    const state = await getScraperState();
    
    // Check if already running or disabled
    if (state.isRunning) {
        console.log('[AutoScraper] Already running, skipping...');
        return { success: false, message: 'Scraper is already in progress' };
    }
    if (!state.enabled) {
        console.log('[AutoScraper] Auto scraping is disabled');
        return { success: false, message: 'Auto scraping is disabled' };
    }
    
    // Mark as running
    await updateScraperState({
        ...state,
        isRunning: true,
        lastRunStartTime: new Date().toISOString()
    });
    
    const results = { 
        newGamesScraped: 0, 
        gamesUpdated: 0, 
        errors: 0, 
        blanks: 0,
        timeElapsed: 0
    };
    
    try {
        // Step 1: Process LIMITED non-complete games
        console.log(`[AutoScraper] Step 1: Checking ${MAX_NON_COMPLETE_GAMES_PER_RUN} non-complete games...`);
        const nonCompleteGames = await getNonCompleteGames(MAX_NON_COMPLETE_GAMES_PER_RUN);
        console.log(`[AutoScraper] Found ${nonCompleteGames.length} non-complete games to check`);
        
        for (const game of nonCompleteGames) {
            // Check if we're approaching timeout
            if (Date.now() - startTime > LAMBDA_TIMEOUT_BUFFER) {
                console.log('[AutoScraper] Approaching timeout, stopping early...');
                break;
            }
            
            try {
                console.log(`[AutoScraper] Checking game: ${game.name}`);
                await fetchTournamentData(game.sourceUrl);
                results.gamesUpdated++;
            } catch (error) {
                console.error(`[AutoScraper] Error checking game ${game.id}:`, error.message);
                results.errors++;
            }
        }
        
        // Step 2: Find LIMITED new games
        console.log(`[AutoScraper] Step 2: Scanning for up to ${MAX_NEW_GAMES_PER_RUN} new games...`);
        
        const highestDbId = await getHighestGameId();
        const startId = Math.max(state.lastScannedId || 0, highestDbId) + 1;
        console.log(`[AutoScraper] Starting from ID: ${startId}`);
        
        let currentId = startId;
        let consecutiveBlanks = 0;
        
        while (
            consecutiveBlanks < MAX_CONSECUTIVE_BLANKS && 
            results.newGamesScraped < MAX_NEW_GAMES_PER_RUN &&
            (Date.now() - startTime) < LAMBDA_TIMEOUT_BUFFER
        ) {
            const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
            
            try {
                console.log(`[AutoScraper] Checking tournament ID ${currentId}...`);
                const data = await fetchTournamentData(url);
                
                if (data.gameStatus === 'NOT_IN_USE' || data.isInactive) {
                    console.log(`[AutoScraper] Tournament ID ${currentId} is blank/inactive`);
                    consecutiveBlanks++;
                    results.blanks++;
                } else {
                    console.log(`[AutoScraper] Found active tournament ID ${currentId}: ${data.name}`);
                    consecutiveBlanks = 0;
                    results.newGamesScraped++;
                }
                
            } catch (error) {
                console.error(`[AutoScraper] Error scraping ID ${currentId}:`, error.message);
                results.errors++;
                consecutiveBlanks = 0; // Don't count errors as blanks
            }
            
            // Update state with progress
            await updateScraperState({
                ...state,
                lastScannedId: currentId,
                totalScraped: (state.totalScraped || 0) + 1
            });
            
            currentId++;
        }
        
        if (consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS) {
            console.log(`[AutoScraper] Stopped after ${MAX_CONSECUTIVE_BLANKS} consecutive blank tournaments`);
        }
        
    } catch (error) {
        console.error('[AutoScraper] Error during scraping process:', error);
        throw error;
    } finally {
        // Calculate time elapsed
        results.timeElapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[AutoScraper] Completed in ${results.timeElapsed} seconds`);
        
        // Mark as not running
        const finalState = await getScraperState();
        await updateScraperState({
            ...finalState,
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            totalErrors: (finalState.totalErrors || 0) + results.errors
        });
    }
    
    console.log('[AutoScraper] Results:', results);
    return { success: true, results };
};

/**
 * Control operations for the scraper
 */
const controlScraper = async (operation) => {
    console.log(`[controlScraper] Operation: ${operation}`);
    const state = await getScraperState();
    
    switch (operation) {
        case 'START':
            if (state.isRunning) {
                return { success: false, message: 'Scraper is already running', state };
            }
            return await performScraping();
            
        case 'STOP':
            if (!state.isRunning) {
                return { success: false, message: 'Scraper is not running', state };
            }
            const stoppedState = await updateScraperState({ 
                ...state, 
                isRunning: false, 
                lastRunEndTime: new Date().toISOString() 
            });
            return { success: true, message: 'Scraper stopped', state: stoppedState };
            
        case 'ENABLE':
            const enabledState = await updateScraperState({ ...state, enabled: true });
            return { success: true, message: 'Auto scraping enabled', state: enabledState };
            
        case 'DISABLE':
            const disabledState = await updateScraperState({ ...state, enabled: false });
            return { success: true, message: 'Auto scraping disabled', state: disabledState };
            
        case 'STATUS':
            return { success: true, state };
            
        case 'RESET':
            const resetState = await updateScraperState({
                id: 'AUTO_SCRAPER_STATE',
                isRunning: false,
                lastScannedId: 0,
                lastRunStartTime: null,
                lastRunEndTime: null,
                consecutiveBlankCount: 0,
                totalScraped: 0,
                totalErrors: 0,
                enabled: true
            });
            return { success: true, message: 'Scraper state reset', state: resetState };
            
        default:
            return { success: false, message: `Unknown operation: ${operation}` };
    }
};

/**
 * Lambda handler
 */
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    try {
        // Handle GraphQL resolver calls
        if (event.fieldName) {
            switch (event.fieldName) {
                case 'triggerAutoScraping':
                case 'performAutoScraping':  // Support both field names
                    return await performScraping();
                    
                case 'controlScraperOperation':
                case 'controlAutoScraper':   // Support both field names
                    const { operation } = event.arguments;
                    return await controlScraper(operation);
                    
                case 'getScraperControlState':
                case 'getScraperState':      // Support both field names
                    return await controlScraper('STATUS');
                    
                default:
                    throw new Error(`Unknown fieldName: ${event.fieldName}`);
            }
        }
        
        // Handle EventBridge scheduled events
        if (event.source === 'aws.scheduler' || event['detail-type'] === 'Scheduled Event') {
            console.log('[AutoScraper] Triggered by EventBridge schedule');
            return await performScraping();
        }
        
        // Handle direct invocations
        if (event.operation) {
            return await controlScraper(event.operation);
        }
        
        // Default to performing scraping
        return await performScraping();
        
    } catch (error) {
        console.error('Error in handler:', error);
        return { 
            success: false, 
            message: error.message,
            error: error.message 
        };
    }
};