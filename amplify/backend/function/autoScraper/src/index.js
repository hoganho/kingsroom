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
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

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
    const scraperStateTable = getTableName('ScraperState');
    const stateId = 'AUTO_SCRAPER_STATE';
    
    try {
        const response = await ddbDocClient.send(new GetCommand({
            TableName: scraperStateTable,
            Key: { id: stateId }
        }));
        
        if (response.Item) {
            return response.Item;
        }
    } catch (error) {
        console.log('ScraperState table might not exist, will use default state');
    }
    
    // Default state if no record exists
    return {
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
};

/**
 * Update the scraper state
 */
const updateScraperState = async (updates) => {
    const scraperStateTable = getTableName('ScraperState');
    const stateId = 'AUTO_SCRAPER_STATE';
    const now = new Date().toISOString();
    
    try {
        const item = {
            id: stateId,
            ...updates,
            updatedAt: now,
            _lastChangedAt: Date.now()
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: scraperStateTable,
            Item: item
        }));
        
        return item;
    } catch (error) {
        console.error('Error updating scraper state:', error);
        // Continue execution even if state update fails
    }
};

/**
 * Get the highest game ID from the Game table
 */
const getHighestGameId = async () => {
    const gameTable = getTableName('Game');
    
    try {
        // Scan all games and extract IDs from sourceUrl
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
 * Get all non-complete games that need rescanning
 */
const getNonCompleteGames = async () => {
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
            }
        }));
        
        return response.Items || [];
    } catch (error) {
        console.error('Error getting non-complete games:', error);
        return [];
    }
};

/**
 * ✅ NEW: Invokes the webScraperFunction to first scrape, then save the data.
 * This is the full scrape-and-save pipeline for a single URL.
 */
const scrapeAndSaveTournament = async (url) => {
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    if (!functionName) {
        throw new Error('webScraperFunction name not found in environment variables.');
    }

    // --- Step 1: Scrape the data (FETCH operation) ---
    console.log(`[scrapeAndSaveTournament] Step 1: Scraping data from ${url}`);
    let scrapedData;
    try {
        const fetchPayload = {
            arguments: {
                operation: 'FETCH',
                url: url
            }
        };

        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(fetchPayload)
        }));

        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        if (result.errorMessage) throw new Error(result.errorMessage);

        scrapedData = result.data; // The scraped data object
        console.log(`[scrapeAndSaveTournament] Successfully scraped data for ${url}`);
    } catch (error) {
        console.error(`[scrapeAndSaveTournament] Error during scraping step for ${url}:`, error);
        throw error;
    }
    
    // Check for an auto-assigned venue before saving
    const autoAssignedVenueId = scrapedData?.venueMatch?.autoAssignedVenue?.id;

    if (!autoAssignedVenueId) {
        console.warn(`[scrapeAndSaveTournament] No auto-assigned venue found for ${url}. Skipping save.`);
        return { scrapedData, status: 'SKIPPED_SAVE' };
    }

    // --- Step 2: Save the data (SAVE operation) ---
    console.log(`[scrapeAndSaveTournament] Step 2: Saving data for ${url} with venue ID ${autoAssignedVenueId}`);
    try {
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

        console.log(`[scrapeAndSaveTournament] Successfully saved game for ${url}. SQS message triggered.`);
        return { scrapedData, status: 'SAVED' };

    } catch (error) {
        console.error(`[scrapeAndSaveTournament] Error during save step for ${url}:`, error);
        throw error;
    }
};


/**
 * Main scraping logic
 */
const performScraping = async () => {
    console.log('[AutoScraper] Starting automated scraping process...');
    
    const state = await getScraperState();
    
    // Check if already running or disabled
    if (state.isRunning) return { success: false, message: 'Scraper is already in progress' };
    if (!state.enabled) return { success: false, message: 'Auto scraping is disabled' };
    
    // Mark as running
    await updateScraperState({
        ...state,
        isRunning: true,
        lastRunStartTime: new Date().toISOString(),
        consecutiveBlankCount: 0
    });
    
    const results = { newGamesScraped: 0, gamesUpdated: 0, errors: 0, blanks: 0 };
    
    try {
        // Step 1: Rescrape non-complete games
        console.log('[AutoScraper] Step 1: Rescanning and saving non-complete games...');
        const nonCompleteGames = await getNonCompleteGames();
        
        for (const game of nonCompleteGames) {
            try {
                await scrapeAndSaveTournament(game.sourceUrl); // Scrape and Save
                results.gamesUpdated++;
            } catch (error) {
                console.error(`[AutoScraper] Error rescanning game ${game.id}:`, error);
                results.errors++;
            }
        }
        
        // Step 2: Find and save new games
        console.log('[AutoScraper] Step 2: Finding and saving new games...');
        
        const highestDbId = await getHighestGameId();
        const startId = Math.max(state.lastScannedId, highestDbId) + 1;
        
        let currentId = startId;
        let consecutiveBlanks = 0;
        const maxConsecutiveBlanks = 2;
        const maxNewGames = 50;
        
        while (consecutiveBlanks < maxConsecutiveBlanks && results.newGamesScraped < maxNewGames) {
            const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
            
            try {
                const { scrapedData } = await scrapeAndSaveTournament(url); // Scrape and Save
                
                if (scrapedData.isInactive) {
                    consecutiveBlanks++;
                    results.blanks++;
                } else {
                    consecutiveBlanks = 0;
                    results.newGamesScraped++;
                }
                
                // Update last scanned ID
                await updateScraperState({
                    ...state,
                    lastScannedId: currentId,
                    totalScraped: state.totalScraped + 1
                });
                
            } catch (error) {
                // Only count as an error if it's not a SKIPPED_SAVE, which is a successful scrape but no venue
                if (!error.message || !error.message.includes('SKIPPED_SAVE')) {
                     results.errors++;
                }
                consecutiveBlanks = 0; // Reset on true error to continue trying
            }
            
            currentId++;
        }
        
    } catch (error) {
        console.error('[AutoScraper] Error during scraping process:', error);
        throw error;
    } finally {
        // Mark as not running
        const finalState = await getScraperState();
        await updateScraperState({
            ...finalState,
            isRunning: false,
            lastRunEndTime: new Date().toISOString(),
            totalErrors: finalState.totalErrors + results.errors
        });
    }
    
    return { success: true, results };
};

/**
 * Control operations for the scraper
 */
const controlScraper = async (operation) => {
    const state = await getScraperState();
    
    switch (operation) {
        case 'START':
            if (state.isRunning) return { success: false, message: 'Scraper is already running', state };
            return await performScraping();
            
        case 'STOP':
            if (!state.isRunning) return { success: false, message: 'Scraper is not running', state };
            const stoppedState = await updateScraperState({ ...state, isRunning: false, lastRunEndTime: new Date().toISOString() });
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
                // ✅ UPDATED: Renamed field to triggerAutoScraping
                case 'triggerAutoScraping':
                    return await performScraping();
                    
                // ✅ UPDATED: Renamed field to controlScraperOperation
                case 'controlScraperOperation':
                    const { operation } = event.arguments;
                    return await controlScraper(operation);
                    
                // ✅ NEW: Handle the specific STATUS query for the client page load
                case 'getScraperControlState':
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
        
        // Handle direct invocations (for testing)
        if (event.operation) {
            return await controlScraper(event.operation);
        }
        
        // Default to performing scraping
        return await performScraping();
        
    } catch (error) {
        console.error('Error in handler:', error);
        return { success: false, error: error.message };
    }
};