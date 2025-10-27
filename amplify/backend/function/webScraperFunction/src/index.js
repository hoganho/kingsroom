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
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const {
    runScraper,
    getStatusAndReg
} = require('./scraperStrategies.js');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const getTableName = (modelName) => {
    const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
    const tableName = process.env[envVarName];
    if (!tableName) throw new Error(`Table name for model ${modelName} not found in environment variables.`);
    return tableName;
};

const getAllVenues = async () => {
    const venueTable = getTableName('Venue');
    try {
        const command = new ScanCommand({
            TableName: venueTable,
            ProjectionExpression: 'id, #name, aliases',
            ExpressionAttributeNames: { '#name': 'name' }
        });
        const response = await ddbDocClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Error fetching venues from DynamoDB:', error);
        return []; // Return empty array on error
    }
};

// --- SCRAPING LOGIC ---
const scrapeDataFromHtml = (html, venues) => {
    const { status, registrationStatus } = getStatusAndReg(html);
    
    const structureLabel = `STATUS: ${status || 'UNKNOWN'} | REG: ${registrationStatus || 'UNKNOWN'}`;
    console.log(`[DEBUG-SCRAPER] Identified Structure: ${structureLabel}`);
    
    // Pass venues to the scraper
    const { data, foundKeys } = runScraper(html, structureLabel, venues);
    
    data.structureLabel = structureLabel;
    
    if (!foundKeys.includes('structureLabel')) {
        foundKeys.push('structureLabel');
    }

    return { data, foundKeys };
};

const processStructureFingerprint = async (foundKeys, structureLabel, sourceUrl) => {
    if (!foundKeys || foundKeys.length === 0) {
        console.log('No keys found, skipping fingerprint generation.');
        return { isNewStructure: false, structureLabel: structureLabel };
    }

    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();

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
                    structureLabel: structureLabel,
                    occurrenceCount: 1,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure",
                    createdAt: now,
                    updatedAt: now,
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
        return { isNewStructure: false, structureLabel: structureLabel };
    }
};

const handleFetch = async (url) => {
    console.log(`[handleFetch] Processing URL: ${url}`);
    
    const gameTable = getTableName('Game');
    let existingGameId = null;
    let doNotScrape = false;
    
    try {
        const queryCommand = new QueryCommand({
            TableName: gameTable,
            IndexName: 'bySourceUrl',
            KeyConditionExpression: 'sourceUrl = :sourceUrl',
            ExpressionAttributeValues: { ':sourceUrl': url },
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
    }

    if (doNotScrape) {
        console.error(`[handleFetch] Scraping is disabled for this URL (doNotScrape=true). Aborting.`);
        return {
            existingGameId,
            doNotScrape,
            name: "Scraping Disabled",
            status: "UNKNOWN",
            gameStartDateTime: new Date().toISOString(),
            foundKeys: [],
            isNewStructure: false,
            structureLabel: "UNKNOWN",
            errorMessage: "Scraping is disabled for this URL. To re-enable, uncheck \"Do Not Scrape\" and save."
        };
    }

    // ✅ 1. Fetch all venues before scraping
    const venues = await getAllVenues();
    console.log(`[handleFetch] Loaded ${venues.length} venues for matching.`);

    console.log(`[handleFetch] Fetching data from: ${url}`);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    
    // ✅ 2. Pass the venues list to the scraper
    const { data, foundKeys } = scrapeDataFromHtml(response.data, venues);
    
    const fingerprintResult = await processStructureFingerprint(foundKeys, data.structureLabel, url);
    console.log(`[DEBUG-FETCH] Does data object have revenueByBuyIns before return? ${data.hasOwnProperty('revenueByBuyIns')}`);
    
    return { 
        ...data, 
        ...fingerprintResult, 
        foundKeys,
        existingGameId,
        doNotScrape,
    };
};

const handleSave = async (input) => {
    const { sourceUrl, venueId, data, existingGameId, doNotScrape } = input;
    const now = new Date().toISOString();
    
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');

    // ✅ **NEW**: Helper function to merge break data into the levels array.
    const processLevels = (levels = [], breaks = []) => {
        // Create a map for quick lookups of levels by their number.
        const levelMap = new Map(levels.map(l => [l.levelNumber, { ...l }]));

        // Iterate over each break and add its duration to the corresponding level.
        breaks.forEach(breakInfo => {
            if (levelMap.has(breakInfo.levelNumberBeforeBreak)) {
                const level = levelMap.get(breakInfo.levelNumberBeforeBreak);
                level.breakMinutes = breakInfo.durationMinutes || 0;
            }
        });

        // Convert the map back to an array and format it for DynamoDB.
        return Array.from(levelMap.values()).map(level => ({
            levelNumber: level.levelNumber,
            durationMinutes: level.durationMinutes || 20,
            smallBlind: level.smallBlind || 0,
            bigBlind: level.bigBlind || 0,
            ante: level.ante || 0,
            breakMinutes: level.breakMinutes || 0
        }));
    };

    // ✅ **NEW**: Call the helper to get the final, processed levels array.
    const processedLevels = processLevels(data.levels, data.breaks);

    if (existingGameId) {
        console.log(`[handleSave] Updating existing game with ID: ${existingGameId}.`);
        
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: existingGameId }
        }));

        if (!getResult.Item) {
            throw new Error(`Failed to update. Game with ID ${existingGameId} not found.`);
        }
        const existingGame = getResult.Item;
        
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
            playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            buyIn: data.buyIn,
            rake: data.rake || existingGame.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            tournamentType: data.tournamentType || 'FREEZEOUT',
            revenueByBuyIns: data.revenueByBuyIns,
            profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus,
            guaranteeOverlay: data.guaranteeOverlay,
            totalRake: data.totalRake,
            venueId,
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : (existingGame.gameEndDateTime || null),
            doNotScrape: doNotScrape,
            updatedAt: now,
            _lastChangedAt: Date.now(),
            _version: (existingGame._version || 1) + 1,
        };

        if (existingGame.tournamentStructureId && processedLevels.length > 0) {
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
                    ':levels': processedLevels, // ✅ Use the processed levels with breaks
                    ':updatedAt': now,
                    ':_lastChangedAt': Date.now(),
                    ':inc': 1
                }
            };
            
            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new UpdateCommand(structureUpdate))
            ]);
        } else if (!existingGame.tournamentStructureId && processedLevels.length > 0) {
            console.log(`[handleSave] Adding new tournament structure to existing game: ${existingGameId}`);
            const structureId = crypto.randomUUID();
            updatedGameItem.tournamentStructureId = structureId;
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                levels: processedLevels, // ✅ Use the processed levels with breaks
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
            await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        }

        return updatedGameItem;

    } else {
        console.log('[handleSave] No existing game found. Creating new records...');
        
        const gameId = crypto.randomUUID();
        let structureId = null;
        
        if (processedLevels.length > 0) {
            structureId = crypto.randomUUID();
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                levels: processedLevels, // ✅ Use the processed levels with breaks
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
            revenueByBuyIns: data.revenueByBuyIns,
            profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus,
            guaranteeOverlay: data.guaranteeOverlay,
            totalRake: data.totalRake,
            seriesName: data.seriesName,
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant,
            variant: data.gameVariant,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            tournamentStructureId: structureId,
            doNotScrape: doNotScrape,
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

/**
 * ✅ UPDATED: Handler for fetching a range of tournament data summaries.
 * It now processes the range in chunks of 10 to prevent timeouts.
 */
const handleFetchRange = async (startId, endId) => {
    console.log(`[handleFetchRange] Processing range from ID ${startId} to ${endId}`);

    if (startId > endId) {
        throw new Error('Start ID cannot be greater than End ID.');
    }
    // You can keep a reasonable upper limit to protect against very large requests
    if (endId - startId + 1 > 100) { 
        throw new Error('The requested range is too large. Please fetch a maximum of 100 games at a time.');
    }

    const allResults = [];
    const chunkSize = 10; // Process 10 IDs at a time

    // Loop through the total range in chunks
    for (let i = startId; i <= endId; i += chunkSize) {
        const chunkStart = i;
        const chunkEnd = Math.min(i + chunkSize - 1, endId);
        console.log(`[handleFetchRange] Processing chunk: ${chunkStart} to ${chunkEnd}`);
        
        const chunkPromises = [];
        for (let j = chunkStart; j <= chunkEnd; j++) {
            const url = `https://kingsroom.com.au/tournament/?id=${j}`;
            chunkPromises.push(
                handleFetch(url)
                    .then(result => ({ ...result, id: j.toString() }))
                    .catch(error => ({ id: j.toString(), error: error.message }))
            );
        }

        // Wait for the current chunk of 10 to complete before starting the next
        const settledResults = await Promise.allSettled(chunkPromises);
        allResults.push(...settledResults);
    }

    // Map the final accumulated results to the summary format
    return allResults.map(res => {
        if (res.status === 'fulfilled' && !res.value.error) {
            const data = res.value;
            return {
                id: data.id,
                name: data.name || 'Name not found',
                status: data.status || 'UNKNOWN',
                registrationStatus: data.registrationStatus || 'UNKNOWN',
                gameStartDateTime: data.gameStartDateTime,
                inDatabase: !!data.existingGameId,
                doNotScrape: data.doNotScrape || false,
                error: data.errorMessage || null
            };
        } else {
            const id = res.status === 'fulfilled' ? res.value.id : res.reason?.id || 'unknown';
            const errorMessage = res.status === 'fulfilled' ? res.value.error : res.reason?.message || 'Failed to fetch';
            return {
                id: id,
                name: 'Error Fetching Game',
                status: 'ERROR',
                registrationStatus: 'ERROR',
                gameStartDateTime: null,
                inDatabase: false,
                doNotScrape: false,
                error: errorMessage
            };
        }
    });
};


// --- MAIN LAMBDA HANDLER ---
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    const { arguments, fieldName } = event; // ✅ Use fieldName to route

    try {
        // ✅ NEW: Route to the correct handler based on the GraphQL field name
        switch (fieldName) {
            case 'fetchTournamentData':
                const result = await handleFetch(arguments.url);
                if (result.errorMessage) throw new Error(result.errorMessage);
                return result;
            case 'saveTournamentData':
                return await handleSave(arguments.input);
            case 'fetchTournamentDataRange':
                return await handleFetchRange(arguments.startId, arguments.endId);
            default:
                throw new Error(`Unknown operation: ${fieldName}. No 'input' or 'url' argument found.`);
        }
    } catch (error) {
        console.error('Error during handler execution:', error);
        throw new Error(error.message);
    }
};