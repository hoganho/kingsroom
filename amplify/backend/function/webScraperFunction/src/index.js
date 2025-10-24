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
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { runScraper, getStatusAndReg } = require('./scraperStrategies'); // ✅ NEW: Import strategy runner

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
 * 🛑 DEPRECATED: All scraping logic is now in scraperStrategies.js
 * This function is kept for structural reference but is no longer used directly.
 */
// const scrapeDataFromHtml = (html) => { ... }


/**
 * ✅ UPDATED: Logic to create a fingerprint and save/update the structure in DynamoDB
 * Now takes status/regStatus as arguments.
 */
const processStructureFingerprint = async (foundKeys, sourceUrl, status, registrationStatus) => {
    if (!foundKeys || foundKeys.length === 0) {
        console.log('No keys found, skipping fingerprint generation.');
        return { isNewStructure: false, structureLabel: null };
    }

    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();

    // ✅ NEW: Create the structureLabel
    const structureLabel = `STATUS: ${status || 'UNKNOWN_STATUS'} | REG: ${registrationStatus || 'UNKNOWN_REG_STATUS'}`;

    try {
        const getResponse = await ddbDocClient.send(new QueryCommand({
            TableName: structureTable,
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
                    structureLabel: structureLabel, // ✅ Save the label
                    occurrenceCount: 1,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure",
                    _lastChangedAt: Date.now(),
                    _version: 1,
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            console.log(`Updated existing structure fingerprint with ID: ${structureId}`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: structureTable,
                Key: { id: structureId },
                UpdateExpression: 'SET #lastSeen = :now, #occ = #occ + :inc',
                ExpressionAttributeNames: {
                    '#lastSeen': 'lastSeenAt',
                    '#occ': 'occurrenceCount'
                },
                ExpressionAttributeValues: {
                    ':now': now,
                    ':inc': 1
                }
            }));
            
            // Return the existing label from the database
            const existingLabel = getResponse.Items[0].structureLabel || structureLabel;
            return { isNewStructure: false, structureLabel: existingLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return { isNewStructure: false, structureLabel: null };
    }
};

/**
 * ✅ UPDATED: The handler now runs the scraper twice:
 * 1. A quick pass to get status and determine the structureLabel.
 * 2. A full pass using the strategy for that specific structureLabel.
 */
const handleFetch = async (url) => {
    console.log(`Fetching data from: ${url}`);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = response.data;
    
    // 1. Quick pass just to get status and regStatus
    const { status, registrationStatus } = getStatusAndReg(html);
    
    // 2. Determine structure label (provisional)
    const provisionalLabel = `STATUS: ${status || 'UNKNOWN_STATUS'} | REG: ${registrationStatus || 'UNKNOWN_REG_STATUS'}`;
    console.log(`[Scraper] Provisional Label: ${provisionalLabel}`);
    
    // 3. Run the FULL scraper using the determined strategy
    const { data, foundKeys } = runScraper(html, provisionalLabel);
    
    // 4. Process the fingerprint with the keys *actually found*
    // This will return the *final* structureLabel (either new or existing)
    const fingerprintResult = await processStructureFingerprint(foundKeys, url, data.status, data.registrationStatus);
    
    // 5. Return all data, including the final keys and fingerprint result
    return { ...data, ...fingerprintResult, foundKeys };
};

// --- HANDLER FOR SAVING/UPDATING DATA ---
// (No changes to handleSave function... it remains the same)
const handleSave = async (input) => {
    const { sourceUrl, venueId, data } = input;
    const now = new Date().toISOString();
    
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    const calculateRevenueByEntries = (buyIn, totalEntries) => {
        const numBuyIn = parseFloat(buyIn);
        const numTotalEntries = parseInt(totalEntries, 10);
        
        if (!isNaN(numBuyIn) && !isNaN(numTotalEntries) && numBuyIn > 0 && numTotalEntries > 0) {
            return numBuyIn * numTotalEntries;
        }
        return null;
    };
    
    // Check if game already exists
    const queryCommand = new QueryCommand({
        TableName: gameTable,
        IndexName: 'bySourceUrl',
        KeyConditionExpression: 'sourceUrl = :sourceUrl',
        ExpressionAttributeValues: { ':sourceUrl': sourceUrl },
    });

    const queryResult = await ddbDocClient.send(queryCommand);
    const existingGame = queryResult.Items?.[0];

    const revenueByEntries = calculateRevenueByEntries(data.buyIn, data.totalEntries);

    if (existingGame) {
        console.log(`Found existing game with ID: ${existingGame.id}. Updating...`);
        
        const updatedGameItem = {
            ...existingGame,
            name: data.name,
            status: data.status || 'SCHEDULED',
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant,
            variant: data.gameVariant,
            seriesName: data.seriesName,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            tournamentType: data.tournamentType || 'FREEZEOUT',
            revenueByEntries: revenueByEntries,
            venueId,
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : existingGame.gameEndDateTime || null,
            updatedAt: now,
        };

        if (existingGame.tournamentStructureId && data.levels && data.levels.length > 0) {
            const structureUpdate = {
                TableName: structureTable,
                Key: { id: existingGame.tournamentStructureId },
                UpdateExpression: 'SET #levels = :levels, #updatedAt = :updatedAt',
                ExpressionAttributeNames: {
                    '#levels': 'levels',
                    '#updatedAt': 'updatedAt'
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
                    ':updatedAt': now
                }
            };
            
            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new UpdateCommand(structureUpdate))
            ]);
        } else {
            await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        }

        return updatedGameItem;

    } else {
        console.log('No existing game found. Creating new records...');
        
        const gameId = crypto.randomUUID();
        let structureId = null;
        
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
            variant: data.gameVariant,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            tournamentStructureId: structureId,
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
            return await handleFetch(arguments.url);
        } else {
            throw new Error(`Could not determine operation. No 'input' or 'url' argument found.`);
        }
    } catch (error) {
        console.error('Error during handler execution:', error);
        const fieldName = event.info?.fieldName || 'unknown'; 
        throw new Error(`Operation failed for field ${fieldName}. Reason: ${error.message}`);
    }
};