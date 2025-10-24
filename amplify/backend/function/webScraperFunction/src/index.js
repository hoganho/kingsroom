/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ASSETTABLE_ARN
	API_KINGSROOM_ASSETTABLE_NAME
	API_KINGSROOM_CASHSTRUCTURETABLE_ARN
	API_KINGSROOM_CASHSTRUCTURETABLE_NAME
	API_KINGSROOM_DATASYNCTABLE_ARN
	API_KINGSROOM_DATASYNCTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_PLAYERRESULTTABLE_ARN
	API_KINGSROOM_PLAYERRESULTTABLE_NAME
	API_KINGSROOM_PLAYERSUMMARYTABLE_ARN
	API_KINGSROOM_PLAYERSUMMARYTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_PLAYERTICKETTABLE_ARN
	API_KINGSROOM_PLAYERTICKETTABLE_NAME
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_ARN
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME
	API_KINGSROOM_PLAYERVENUETABLE_ARN
	API_KINGSROOM_PLAYERVENUETABLE_NAME
	API_KINGSROOM_RAKESTRUCTURETABLE_ARN
	API_KINGSROOM_RAKESTRUCTURETABLE_NAME
	API_KINGSROOM_SCRAPESTRUCTURETABLE_ARN
	API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME
	API_KINGSROOM_TICKETTEMPLATETABLE_ARN
	API_KINGSROOM_TICKETTEMPLATETABLE_NAME
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_ARN
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
	API_KINGSROOM_VENUEDETAILSTABLE_ARN
	API_KINGSROOM_VENUEDETAILSTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

const axios = require('axios');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// ✅ NEW: Import the runScraper and getStatusAndReg functions
const {
    runScraper,
    getStatusAndReg
} = require('./scraperStrategies.js');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Helper to get table names from environment variables
const getTableName = (modelName) => {
    const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
    const tableName = process.env[envVarName];
    if (!tableName) throw new Error(`Table name for model ${modelName} not found in environment variables.`);
    return tableName;
};

// --- SCRAPING LOGIC ---

/**
 * ✅ REFACTORED: This function is now lightweight.
 * It determines the structure, selects the correct strategy, and executes it.
 */
const scrapeDataFromHtml = (html) => {
    // 1. Get Status and Reg to determine structure
    // NOTE: This is a quick pass just to get the label.
    // The main runScraper will re-run these functions as part of the full scrape.
    const { status, registrationStatus } = getStatusAndReg(html);
    
    // ✅ NEW: Create the structureLabel
    const structureLabel = `STATUS: ${status || 'UNKNOWN'} | REG: ${registrationStatus || 'UNKNOWN'}`;
    console.log(`[DEBUG-SCRAPER] Identified Structure: ${structureLabel}`);
    
    // 2. Run the full scraper strategy
    // The runScraper function will handle strategy selection based on the label
    // and execute all scraping functions.
    const { data, foundKeys } = runScraper(html, structureLabel);
    
    // 3. Manually add the structureLabel to the final data object
    // (runScraper doesn't add this itself, as it's metadata)
    data.structureLabel = structureLabel;
    
    // Add to foundKeys for validation, ensuring no duplicates
    if (!foundKeys.includes('structureLabel')) {
        foundKeys.push('structureLabel');
    }

    return { data, foundKeys };
};


/**
 * Processes the structure fingerprint
 */
const processStructureFingerprint = async (foundKeys, structureLabel, sourceUrl) => {
    if (!foundKeys || foundKeys.length === 0) {
        console.log('No keys found, skipping fingerprint generation.');
        return { isNewStructure: false, structureLabel: structureLabel }; // Return the label even if no keys
    }

    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();

    try {
        const getResponse = await ddbDocClient.send(new QueryCommand({
            TableName: structureTable,
            // Use the GSI 'byStructureLabel' if 'id' is not the primary key you want to query
            // Assuming 'id' (the hash) is the primary key
            KeyConditionExpression: 'id = :id',
            ExpressionAttributeValues: { ':id': structureId }
        }));

        const isNew = getResponse.Items.length === 0;

        if (isNew) {
            console.log(`Saving new structure fingerprint with ID: ${structureId}`);
            await ddbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId,
                    fields: foundKeys,
                    structureLabel: structureLabel, // Save the label
                    occurrenceCount: 1,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure",
                    createdAt: now, // Added createdAt
                    updatedAt: now, // Added updatedAt
                    _lastChangedAt: Date.now(),
                    _version: 1,
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            console.log(`Updated existing structure fingerprint with ID: ${structureId}`);
            // Use UpdateCommand on the primary key 'id'
            await ddbDocClient.send(new UpdateCommand({
                TableName: structureTable,
                Key: { id: structureId }, // Correctly target the item by its primary key
                UpdateExpression: 'SET #lastSeenAt = :now, #occurrenceCount = #occurrenceCount + :inc, #updatedAt = :now',
                ExpressionAttributeNames: {
                    '#lastSeenAt': 'lastSeenAt',
                    '#occurrenceCount': 'occurrenceCount',
                    '#updatedAt': 'updatedAt'
                },
                ExpressionAttributeValues: {
                    ':now': now,
                    ':inc': 1
                }
            }));
            
            return { isNewStructure: false, structureLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        // Return the best-effort info we have
        return { isNewStructure: false, structureLabel: structureLabel };
    }
};

/**
 * ✅ UPDATED: The handler now queries DynamoDB *first* to check for an existing game
 * and the `doNotScrape` flag before attempting to fetch the URL.
 */
const handleFetch = async (url) => {
    console.log(`[handleFetch] Processing URL: ${url}`);
    
    const gameTable = getTableName('Game');
    let existingGameId = null;
    let doNotScrape = false;
    
    // --- 1. Check for existing game and `doNotScrape` flag ---
    try {
        const queryCommand = new QueryCommand({
            TableName: gameTable,
            IndexName: 'bySourceUrl', // Assumes a GSI named 'bySourceUrl' on the 'sourceUrl' field
            KeyConditionExpression: 'sourceUrl = :sourceUrl',
            ExpressionAttributeValues: { ':sourceUrl': url },
            // Request only the fields we need for this check
            ProjectionExpression: 'id, doNotScrape' 
        });

        const queryResult = await ddbDocClient.send(queryCommand);
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            const game = queryResult.Items[0];
            existingGameId = game.id;
            doNotScrape = game.doNotScrape || false;
            console.log(`[handleFetch] Found existing game (ID: ${existingGameId}). doNotScrape = ${doNotScrape}`);
        } else {
            console.log(`[handleFetch] No existing game found for this URL.`);
        }

    } catch (error) {
        console.warn(`[handleFetch] Error querying for existing game: ${error.message}. Proceeding with scrape.`);
        // Don't block scraping if the query fails, just log it.
    }

    // --- 2. Honor the `doNotScrape` flag ---
    if (doNotScrape) {
        console.error(`[handleFetch] Scraping is disabled for this URL (doNotScrape=true). Aborting.`);
        // Throw an error to notify the frontend
        // Also return the existingGameId so the frontend can manage state
        return {
            existingGameId,
            doNotScrape,
            // Send minimal data to prevent frontend errors
            name: "Scraping Disabled",
            status: "UNKNOWN",
            gameStartDateTime: new Date().toISOString(),
            foundKeys: [],
            isNewStructure: false,
            structureLabel: "UNKNOWN",
            // Throwing an error is better
            errorMessage: "Scraping is disabled for this URL. To re-enable, uncheck \"Do Not Scrape\" and save."
        };
        // throw new Error('Scraping is disabled for this URL. To re-enable, uncheck "Do Not Scrape" and save.');
    }

    // --- 3. Proceed with scraping ---
    console.log(`[handleFetch] Fetching data from: ${url}`);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    
    const { data, foundKeys } = scrapeDataFromHtml(response.data);
    
    // --- 4. Process fingerprint ---
    const fingerprintResult = await processStructureFingerprint(foundKeys, data.structureLabel, url);
    
    // --- 5. Return all data to frontend ---
    // Includes scraped data, fingerprint results, foundKeys, and existingGameId
    return { 
        ...data, 
        ...fingerprintResult, 
        foundKeys,
        existingGameId, // ✅ NEW: Send existingGameId to frontend
        doNotScrape,    // ✅ NEW: Send current doNotScrape status to frontend
    };
};

/**
 * ✅ UPDATED: The handler for saving data.
 * It now correctly handles updates vs. creations based on `existingGameId`.
 * It also saves the `doNotScrape` flag.
 */
const handleSave = async (input) => {
    // Note: We need GetCommand for the update logic, it's imported in the handler
    const { sourceUrl, venueId, data, existingGameId, doNotScrape } = input;
    const now = new Date().toISOString();
    
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    // Helper function to calculate revenue from entries
    const calculateRevenueByEntries = (buyIn, totalEntries) => {
        const numBuyIn = parseFloat(buyIn);
        const numTotalEntries = parseInt(totalEntries, 10);
        
        if (!isNaN(numBuyIn) && !isNaN(numTotalEntries) && numBuyIn > 0 && numTotalEntries > 0) {
            return numBuyIn * numTotalEntries;
        }
        return null;
    };
    
    // Prepare revenueByEntries
    const revenueByEntries = calculateRevenueByEntries(data.buyIn, data.totalEntries);

    // --- 1. Check if this is an UPDATE or a NEW game ---
    if (existingGameId) {
        console.log(`[handleSave] Updating existing game with ID: ${existingGameId}.`);
        
        // Fetch the full existing game item to merge
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: existingGameId }
        }));

        if (!getResult.Item) {
            throw new Error(`Failed to update. Game with ID ${existingGameId} not found.`);
        }
        const existingGame = getResult.Item;
        
        // Update existing game with new data
        const updatedGameItem = {
            ...existingGame,
            // Update with new scraped data
            name: data.name,
            status: data.status || 'SCHEDULED',
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant, 
            variant: data.gameVariant, // Ensure variant is also updated
            seriesName: data.seriesName,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            buyIn: data.buyIn,
            rake: data.rake || existingGame.rake || 0, // Keep existing rake if new one isn't provided
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            tournamentType: data.tournamentType || 'FREEZEOUT',
            revenueByEntries: revenueByEntries,
            // Keep existing fields
            venueId, // Update venueId in case it was changed
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : (existingGame.gameEndDateTime || null),
            // ✅ NEW: Update the doNotScrape flag
            doNotScrape: doNotScrape,
            updatedAt: now,
            _lastChangedAt: Date.now(), // Update DynamoDB metadata
            _version: (existingGame._version || 1) + 1, // Increment version
        };

        // If there's a tournament structure, update its levels
        if (existingGame.tournamentStructureId && data.levels && data.levels.length > 0) {
            const structureUpdate = {
                TableName: structureTable,
                Key: { id: existingGame.tournamentStructureId },
                UpdateExpression: 'SET #levels = :levels, #updatedAt = :updatedAt, #_lastChangedAt = :_lastChangedAt, #_version = #_version + :inc',
                ExpressionAttributeNames: {
                    '#levels': 'levels',
                    '#updatedAt': 'updatedAt',
                    '#_lastChangedAt': '_lastChangedAt',
                    '#_version': '_version'
                },
                ExpressionAttributeValues: {
                    ':levels': data.levels.map(level => ({
                        levelNumber: level.levelNumber,
                        durationMinutes: level.durationMinutes,
                        smallBlind: level.smallBlind,
                        bigBlind: level.bigBlind,
                        ante: level.ante,
                        breakMinutes: level.breakMinutes || 0
                    })),
                    ':updatedAt': now,
                    ':_lastChangedAt': Date.now(),
                    ':inc': 1
                }
            };
            
            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new UpdateCommand(structureUpdate))
            ]);
        } else if (!existingGame.tournamentStructureId && data.levels && data.levels.length > 0) {
            // Case: Game exists but structure was missing, now we have levels
            console.log(`[handleSave] Adding new tournament structure to existing game: ${existingGameId}`);
            const structureId = crypto.randomUUID();
            updatedGameItem.tournamentStructureId = structureId; // Link new structure to game
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                levels: data.levels.map(level => ({
                    levelNumber: level.levelNumber,
                    durationMinutes: level.durationMinutes || 20,
                    smallBlind: level.smallBlind || 0,
                    bigBlind: level.bigBlind || 0,
                    ante: level.ante || 0,
                    breakMinutes: level.breakMinutes || 0
                })),
                createdAt: now,
                updatedAt: now,
                _lastChangedAt: Date.now(),
                _version: 1,
                __typename: "TournamentStructure",
            };

            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new PutCommand({ TableName: structureTable, Item: structureItem }))
            ]);

        } else {
            // Just update the game
            await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        }

        return updatedGameItem;

    } else {
        // --- 2. This is a NEW game ---
        console.log('[handleSave] No existing game found. Creating new records...');
        
        const gameId = crypto.randomUUID();
        let structureId = null;
        
        // Only create a tournament structure if we have levels
        if (data.levels && data.levels.length > 0) {
            structureId = crypto.randomUUID();
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                levels: data.levels.map(level => ({
                    levelNumber: level.levelNumber,
                    durationMinutes: level.durationMinutes || 20,
                    smallBlind: level.smallBlind || 0,
                    bigBlind: level.bigBlind || 0,
                    ante: level.ante || 0,
                    breakMinutes: level.breakMinutes || 0
                })),
                createdAt: now,
                updatedAt: now,
                _lastChangedAt: Date.now(),
                _version: 1,
                __typename: "TournamentStructure",
            };
            
            await ddbDocClient.send(new PutCommand({ 
                TableName: structureTable, 
                Item: structureItem 
            }));
        }
        
        // Create the game with all tournament fields
        const gameItem = {
            id: gameId,
            name: data.name,
            type: 'TOURNAMENT',
            status: data.status || 'SCHEDULED',
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : now,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : null,
            sourceUrl,
            venueId,
            tournamentType: data.tournamentType || 'FREEZEOUT',
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            revenueByEntries: revenueByEntries,
            seriesName: data.seriesName,
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant,
            variant: data.gameVariant, // Ensure variant is also set
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            tournamentStructureId: structureId,
            // ✅ NEW: Save the doNotScrape flag
            doNotScrape: doNotScrape,
            // Metadata
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: Date.now(),
            _version: 1,
            __typename: "Game",
        };
        
        await ddbDocClient.send(new PutCommand({ 
            TableName: gameTable, 
            Item: gameItem 
        }));
        
        return gameItem;
    }
};

// --- MAIN LAMBDA HANDLER ---
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    const { arguments } = event;

    try {
        if (arguments.input) {
            // saveTournamentData mutation
            return await handleSave(arguments.input);
        } else if (arguments.url) {
            // fetchTournamentData mutation
            const result = await handleFetch(arguments.url);
            // If handleFetch returned an error message (e.g., for doNotScrape), throw it
            if (result.errorMessage) {
                throw new Error(result.errorMessage);
            }
            return result;
        } else {
            throw new Error(`Could not determine operation. No 'input' or 'url' argument found.`);
        }
    } catch (error) {
        console.error('Error during handler execution:', error);
        // Forward the specific error message
        throw new Error(error.message);
    }
};