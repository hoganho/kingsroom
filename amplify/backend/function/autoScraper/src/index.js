/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_SCRAPERSTATETABLE_ARN
	API_KINGSROOM_SCRAPERSTATETABLE_NAME
	ENV
	FUNCTION_WEBSCRAPERFUNCTION_NAME
	REGION
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const crypto = require('crypto');
const { TextDecoder } = require('util'); 

// --- Configuration & Clients ---
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

const MAX_NEW_GAMES_PER_RUN = 10; 
const LAMBDA_TIMEOUT_BUFFER = (5 * 60 * 1000) - 30000; 
const MAX_CONSECUTIVE_BLANKS = 2; 
const MAX_LOG_SIZE = 25; 
const MAX_GAME_LIST_SIZE = 5; 

// --- Utility Functions ---
const getTableName = (modelName) => {
    if (modelName === 'ScraperState') return process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME;
    if (modelName === 'Game') return process.env.API_KINGSROOM_GAMETABLE_NAME;
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) throw new Error(`API ID or environment name not found.`);
    return `${modelName}-${apiId}-${env}`;
};

const updateScraperState = async (updates) => {
    const stateId = 'AUTO_SCRAPER_STATE';
    const now = new Date().toISOString();
    try {
        const scraperStateTable = getTableName('ScraperState');
        const currentState = await getScraperState(true); // Pass flag to avoid recursive logging
        const mergedItem = {
            ...currentState, ...updates, id: stateId, updatedAt: now,
            _lastChangedAt: Date.now(), __typename: 'ScraperState',
            currentLog: updates.currentLog !== undefined ? updates.currentLog : currentState.currentLog,
            lastGamesProcessed: updates.lastGamesProcessed !== undefined ? updates.lastGamesProcessed : currentState.lastGamesProcessed,
        };
        await ddbDocClient.send(new PutCommand({ TableName: scraperStateTable, Item: mergedItem }));
        return mergedItem;
    } catch (error) {
        console.error(`[STATE-UPDATE] ERROR: ${error.message}`);
        return { id: stateId, ...updates, updatedAt: now }; 
    }
};

const getScraperState = async (isInternalCall = false) => {
    const stateId = 'AUTO_SCRAPER_STATE';
    const scraperStateTable = getTableName('ScraperState');
    if (!isInternalCall) {
        console.log(`[DEBUG-DDB] Preparing to fetch state from table: ${scraperStateTable}`);
    }

    const defaultState = { id: stateId, isRunning: false, lastScannedId: 0, lastRunStartTime: null, lastRunEndTime: null, consecutiveBlankCount: 0, totalScraped: 0, totalErrors: 0, enabled: true, currentLog: [], lastGamesProcessed: [] };
    
    try {
        const command = new GetCommand({ TableName: scraperStateTable, Key: { id: stateId }, ConsistentRead: true });
        
        // --- TIMED LOGGING START ---
        if (!isInternalCall) console.time('DDB_GetScraperState_Duration');
        if (!isInternalCall) console.log('[DEBUG-DDB] Initiating GetCommand...');
        
        const response = await ddbDocClient.send(command);
        
        if (!isInternalCall) console.log('[DEBUG-DDB] GetCommand successful.');
        if (!isInternalCall) console.timeEnd('DDB_GetScraperState_Duration');
        // --- TIMED LOGGING END ---
        
        if (response.Item) {
            if (!isInternalCall) console.log('[DEBUG-DDB] Item found.');
            return { ...defaultState, ...response.Item };
        }
        
        if (!isInternalCall) console.log('[DEBUG-DDB] Item not found, returning default.');
        return defaultState;

    } catch (error) {
        // --- ERROR LOGGING ---
        console.error(`[DEBUG-DDB] CRITICAL ERROR during GetCommand: ${error.message}`);
        if (!isInternalCall) console.timeEnd('DDB_GetScraperState_Duration'); // End timer on error
        throw error; // Re-throw to be caught by the handler
    }
};

const logStatus = async (level, message, details = '') => {
    const state = await getScraperState(true);
    const newEntry = { timestamp: new Date().toISOString(), level, message, details };
    const newLog = [newEntry, ...(state.currentLog || [])].slice(0, MAX_LOG_SIZE);
    await updateScraperState({ currentLog: newLog });
};

const updateGameList = async (id, name, status) => {
    const state = await getScraperState(true);
    const newGameEntry = { id: id.toString(), name, status };
    const newList = [newGameEntry, ...(state.lastGamesProcessed || [])].slice(0, MAX_GAME_LIST_SIZE);
    await updateScraperState({ lastGamesProcessed: newList });
};

// --- DEBUG: Temporarily commenting out the slow ScanCommand functions ---
/*
const getHighestGameId = async () => { ... };
const getNonCompleteGames = async (limit = MAX_NON_COMPLETE_GAMES_PER_RUN) => { ... };
*/
// --- END DEBUG SECTION ---

const createCleanDataForSave = (scraped) => ({
    name: scraped.name, gameStartDateTime: scraped.gameStartDateTime || undefined, gameEndDateTime: scraped.gameEndDateTime || undefined,
    gameStatus: scraped.gameStatus || undefined, registrationStatus: scraped.registrationStatus || undefined, gameVariant: scraped.gameVariant || 'NLHE', 
    gameType: scraped.gameType || undefined, prizepool: scraped.prizepool || undefined, totalEntries: scraped.totalEntries || undefined,
    totalRebuys: scraped.totalRebuys || undefined, totalAddons: scraped.totalAddons || undefined, totalDuration: scraped.totalDuration || undefined,
    gameTags: scraped.gameTags ? scraped.gameTags.filter(tag => tag !== null) : [], tournamentType: scraped.tournamentType || undefined,
    buyIn: scraped.buyIn || undefined, rake: scraped.rake || undefined, startingStack: scraped.startingStack || undefined,
    hasGuarantee: scraped.hasGuarantee || false, guaranteeAmount: scraped.guaranteeAmount || undefined,
    levels: scraped.levels ? scraped.levels.map(l => ({ levelNumber: l.levelNumber, durationMinutes: l.durationMinutes || undefined, smallBlind: l.smallBlind || undefined, bigBlind: l.bigBlind || undefined, ante: l.ante || undefined, breakMinutes: l.breakMinutes || undefined })) : []
});

const scrapeAndProcessTournament = async (url, existingGameData, jobId, triggerSource) => {
    const functionName = process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME;
    const idMatch = url.match(/id=(\d+)/);
    const tournamentId = idMatch ? parseInt(idMatch[1], 10) : (existingGameData ? existingGameData.id : null);
    if (!tournamentId) throw new Error(`Could not determine tournament ID from URL: ${url}`);
    
    const existingGameId = existingGameData?.id || undefined;
    const fetchPayload = { fieldName: 'fetchTournamentData', arguments: { url, existingGameId }, identity: { claims: { jobId, triggerSource }}};
    let scrapedData, scrapeError = null;
    
    try {
        await logStatus('INFO', `Fetching/Scraping ID #${tournamentId}`);
        const response = await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'RequestResponse', Payload: JSON.stringify(fetchPayload)}));
        const result = JSON.parse(new TextDecoder().decode(response.Payload));
        
        let scrapedDataCandidate = result.data || result;
        if (result.errorMessage) {
            scrapeError = result.errorMessage;
        } else if (scrapedDataCandidate && scrapedDataCandidate.name) {
            scrapedData = scrapedDataCandidate;
        } else {
             scrapeError = 'webScraper returned no usable data payload.';
        }
        
        if (scrapeError) {
             if (scrapeError.includes('Scraping is disabled')) return { status: 'SKIPPED_DONOTSCRAPE' };
             throw new Error(scrapeError);
        }
        
        if (scrapedData && scrapedData.isInactive) return { scrapedData, status: 'INACTIVE' }; 
        
        const autoAssignedVenueId = scrapedData?.venueMatch?.autoAssignedVenue?.id || existingGameData?.venueId;
        if (!autoAssignedVenueId) return { scrapedData, status: 'SKIPPED_VENUE' };

        const savePayload = {
            fieldName: 'saveTournamentData', 
            arguments: { input: { sourceUrl: url, venueId: autoAssignedVenueId, existingGameId, doNotScrape: scrapedData.doNotScrape || false, originalScrapedData: JSON.stringify(scrapedData), data: createCleanDataForSave(scrapedData) }},
            identity: { claims: { jobId, triggerSource } }
        };
        
        const saveResponse = await lambdaClient.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'RequestResponse', Payload: JSON.stringify(savePayload) }));
        const saveResult = JSON.parse(new TextDecoder().decode(saveResponse.Payload));
        if (saveResult.errorMessage) throw new Error(`SAVE failed for ID #${tournamentId}: ${saveResult.errorMessage}`);

        return { scrapedData, status: existingGameId ? 'UPDATED' : 'SAVED' }; 
    } catch (error) {
        await logStatus('ERROR', `Scrape/Process failed for ID #${tournamentId}`, error.message);
        return { status: 'ERROR' };
    }
};

const performScraping = async (maxNewGamesOverride = null, triggerSource = 'SCHEDULED') => {
    const startTime = Date.now();
    let state = await getScraperState();
    if (state.isRunning || !state.enabled) return { success: false, message: state.isRunning ? 'Already running' : 'Disabled' };
    
    const maxNewGames = maxNewGamesOverride !== null ? maxNewGamesOverride : MAX_NEW_GAMES_PER_RUN;
    const jobId = crypto.randomBytes(16).toString('hex');

    await updateScraperState({ isRunning: true, lastRunStartTime: new Date().toISOString(), currentLog: [], lastGamesProcessed: [], consecutiveBlankCount: 0, jobId, triggerSource });
    await logStatus('INFO', `Worker initialized. Job ID: ${jobId}`);

    const results = { newGamesScraped: 0, gamesUpdated: 0, errors: 0, blanks: 0 };
    
    try {
        await logStatus('WARN', 'PHASE 1 (Targeted Scan) is temporarily disabled for debugging.');
        
        const startId = state.lastScannedId + 1;
        await logStatus('INFO', `Starting new ID scan from ScraperState ID: ${startId}`);
        
        let currentId = startId, consecutiveBlanks = 0;
        while (results.newGamesScraped < maxNewGames && consecutiveBlanks < MAX_CONSECUTIVE_BLANKS && (Date.now() - startTime < LAMBDA_TIMEOUT_BUFFER)) {
            const url = `https://kingsroom.com.au/tournament/?id=${currentId}`;
            const res = await scrapeAndProcessTournament(url, null, jobId, triggerSource);
            
            if (res.status === 'INACTIVE') consecutiveBlanks++; else consecutiveBlanks = 0;
            if (res.status === 'SAVED') results.newGamesScraped++;
            if (res.status === 'ERROR') results.errors++;
            
            await updateGameList(currentId, `ID ${currentId}`, res.status);
            await updateScraperState({ lastScannedId: currentId, consecutiveBlankCount: consecutiveBlanks });
            currentId++;
        }
        
    } catch (error) {
        await logStatus('ERROR', 'Fatal error during run.', error.message);
    } finally {
        const finalState = await getScraperState();
        const runDuration = Math.round((Date.now() - startTime) / 1000);
        await logStatus('INFO', `Worker run complete.`, `Duration: ${runDuration}s`);
        await updateScraperState({ ...finalState, isRunning: false, lastRunEndTime: new Date().toISOString(), totalErrors: (finalState.totalErrors || 0) + results.errors });
        return { success: true, message: `Scraping completed.`, results };
    }
};

const controlScraper = async (operation, maxGames = null) => {
    console.log(`[DEBUG-CONTROL] controlScraper called with operation: ${operation}`);

    if (operation === 'STATUS') {
        try {
            console.log('[DEBUG-CONTROL] Entering STATUS fast path.');
            const state = await getScraperState();
            console.log('[DEBUG-CONTROL] STATUS fast path successful. Returning state.');
            return { success: true, state };
        } catch (error) {
            console.error(`[DEBUG-CONTROL] Error in STATUS fast path: ${error.message}`);
            throw new Error(`Failed to get scraper state: ${error.message}`);
        }
    }
    
    const state = await getScraperState(true);
    
    switch (operation) {
        case 'START':
        case 'MANUAL':
            if (state.isRunning || !state.enabled) return { success: false, message: state.isRunning ? 'Already running' : 'Disabled', state };
            const triggerSource = operation === 'MANUAL' ? 'MANUAL' : 'CONTROL';
            await lambdaClient.send(new InvokeCommand({ FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME, InvocationType: 'Event', Payload: JSON.stringify({ operation: 'START_WORKER', maxGames, triggerSource }) }));
            return { success: true, message: 'Scraper worker started asynchronously.', state };
            
        case 'STOP':
            return { success: true, message: 'Scraper stop requested.', state: await updateScraperState({ ...state, isRunning: false }) };
        case 'ENABLE':
            return { success: true, message: 'Auto scraping enabled', state: await updateScraperState({ ...state, enabled: true }) };
        case 'DISABLE':
            return { success: true, message: 'Auto scraping disabled', state: await updateScraperState({ ...state, enabled: false }) };
        case 'RESET':
            if (state.isRunning) return { success: false, message: 'Cannot reset while running.', state };
            return { success: true, message: 'Scraper state reset', state: await updateScraperState({ isRunning: false, lastScannedId: 0, lastRunStartTime: null, lastRunEndTime: null, consecutiveBlankCount: 0, totalScraped: 0, totalErrors: 0, enabled: true, currentLog: [], lastGamesProcessed: [] }) };
        default:
            return { success: false, message: `Unknown operation: ${operation}` };
    }
};

exports.handler = async (event) => {
    console.log(`[DEBUG-HANDLER] Lambda handler invoked at ${new Date().toISOString()}`);
    console.log(`[DEBUG-HANDLER] Event received: ${JSON.stringify(event, null, 2)}`);
    
    const { fieldName, operation, arguments: args, source, ['detail-type']: detailType } = event;
    
    try {
        let route;
        if (fieldName) {
            switch (fieldName) {
                case 'triggerAutoScraping': route = 'MANUAL'; break;
                case 'controlScraperOperation': route = args?.operation; break;
                case 'getScraperControlState': route = 'STATUS'; break;
                default: throw new Error(`Unknown fieldName: ${fieldName}`);
            }
            console.log(`[DEBUG-HANDLER] Routing GraphQL request to controlScraper("${route}").`);
            return await controlScraper(route, args?.maxGames);
        }
        
        if (source === 'aws.scheduler' || detailType === 'Scheduled Event') {
            console.log('[DEBUG-HANDLER] Routing scheduled event to performScraping.');
            return await performScraping(null, 'SCHEDULED');
        }
        
        if (operation === 'START_WORKER') {
            console.log('[DEBUG-HANDLER] Routing async worker signal to performScraping.');
            return await performScraping(event.maxGames, event.triggerSource);
        }
        
        console.log(`[DEBUG-HANDLER] No specific route matched. Defaulting to STATUS check.`);
        return await controlScraper('STATUS');

    } catch (error) {
        console.error(`[DEBUG-HANDLER] FATAL ERROR caught in handler: ${error.message}`);
        // This re-throws the error so AppSync can format it correctly for the client
        throw error; 
    }
};