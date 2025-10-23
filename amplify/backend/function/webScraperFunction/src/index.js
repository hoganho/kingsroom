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
const cheerio = require('cheerio');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

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
 * ✅ NEW: Helper to parse duration strings (e.g., "1h 30m") into milliseconds.
 */
const parseDurationToMilliseconds = (durationStr) => {
    if (!durationStr) return 0;
    
    let totalMilliseconds = 0;
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minMatch = durationStr.match(/(\d+)\s*m/);
    
    if (hourMatch && hourMatch[1]) {
        totalMilliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    if (minMatch && minMatch[1]) {
        totalMilliseconds += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    
    return totalMilliseconds;
};

// ✅ UPDATED: The function now also returns a list of keys for the data it found.
const scrapeDataFromHtml = (html) => {
    const $ = cheerio.load(html);
    const foundKeys = new Set();

    const parseNumeric = (str, key) => {
        if (!str) return undefined;
        const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10);
        if (!isNaN(num)) {
            if (key) foundKeys.add(key);
            return num;
        }
        return undefined;
    };

    const getText = (selector, key) => {
        const text = $(selector).first().text().trim();
        if (text) {
            if (key) foundKeys.add(key);
            return text;
        }
        return undefined;
    };

    // ✅ FIX: Re-added the missing parseGuarantee helper function
    const parseGuarantee = (text) => {
        if (!text) return { hasGuarantee: false, guaranteeAmount: undefined };
        const guaranteeRegex = /(gtd|guaranteed|g'teed)/i;
        if (guaranteeRegex.test(text)) {
            foundKeys.add('hasGuarantee');
            return { hasGuarantee: true, guaranteeAmount: parseNumeric(text, 'guaranteeAmount') };
        }
        return { hasGuarantee: false, guaranteeAmount: undefined };
    };

    const registrationDiv = $('label:contains("Registration")').parent();
    const registrationStatus = registrationDiv.text().replace(/Registration/gi, '').trim() || undefined;
    if (registrationStatus) foundKeys.add('registrationStatus');

    const guaranteeText = $('.cw-game-shortdesc').text().trim();
    const { hasGuarantee, guaranteeAmount } = parseGuarantee(guaranteeText);

    const levelsScriptRegex = /const cw_tt_levels = (\[.*?\]);/s;
    const match = html.match(levelsScriptRegex);
    let levels = [];
    if (match && match[1]) {
        try {
            levels = JSON.parse(match[1]).map(level => ({
                levelNumber: level.ID || 0,
                durationMinutes: level.duration || 0,
                smallBlind: level.smallblind || 0,
                bigBlind: level.bigblind || 0,
                ante: level.ante || 0,
            }));
            if (levels.length > 0) foundKeys.add('levels');
        } catch (e) {
            console.warn('Could not parse blind levels JSON:', e.message);
        }
    }

    const results = [];
    $('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
        results.push({
            rank: parseInt($(el).find('td').eq(0).text().trim(), 10),
            name: $(el).find('td').eq(2).text().trim(),
            winnings: parseNumeric($(el).find('td').eq(3).text().trim(), null) || 0,
        });
    });
    if (results.length > 0) foundKeys.add('results');

    // ✅ UPDATED: Corrected totalDuration selector
    const totalDurationText = $('div.cw-clock-label:contains("Total Time")').next().text().trim() || undefined;
    if(totalDurationText) foundKeys.add('totalDuration');

    const data = {
        name: getText('.cw-game-title', 'name'),
        gameStartDateTime: getText('#cw_clock_start_date_time_local', 'gameStartDateTime'), // ✅ RENAMED
        status: $('label:contains("Status")').first().next('strong').text().trim().toUpperCase() || undefined,
        registrationStatus,
        gameVariant: getText('#cw_clock_shortlimitgame', 'gameVariant'),
        prizepool: parseNumeric($('#cw_clock_prizepool').text().trim(), 'prizepool'),
        totalEntries: parseNumeric($('#cw_clock_playersentries').text().trim(), 'totalEntries'),
        totalRebuys: parseNumeric($('#cw_clock_rebuys').text().trim(), 'totalRebuys'),
        totalAddons: parseNumeric($('div.cw-clock-label:contains("Add-Ons")').next().text().trim(), 'totalAddons'),
        totalDuration: totalDurationText, // ✅ UPDATED
        buyIn: parseNumeric($('#cw_clock_buyin').text().trim(), 'buyIn'),
        startingStack: parseNumeric($('#cw_clock_startchips').text().trim(), 'startingStack'),
        hasGuarantee,
        guaranteeAmount,
        levels,
        results,
        rawHtml: html,
    };
    
    // ✅ NEW: Calculate gameEndDateTime
    let gameEndDateTime;
    if (data.gameStartDateTime && data.totalDuration) {
        try {
            const startDate = new Date(data.gameStartDateTime);
            const durationMs = parseDurationToMilliseconds(data.totalDuration);
            // Check for valid start date and positive duration
            if (!isNaN(startDate.getTime()) && durationMs > 0) {
                const endDate = new Date(startDate.getTime() + durationMs);
                gameEndDateTime = endDate.toISOString();
                foundKeys.add('gameEndDateTime');
            }
        } catch (e) {
            console.warn('Could not parse gameStartDateTime or totalDuration:', e.message);
        }
    }
    
    if (data.status) foundKeys.add('status');
    if (data.rawHtml) foundKeys.add('rawHtml');

    // Return data with gameEndDateTime included
    return { data: { ...data, gameEndDateTime }, foundKeys: Array.from(foundKeys) };
};


/**
 * ✅ UPDATED: Logic to create/update the structure fingerprint in DynamoDB.
 * Now includes the structureLabel based on game status.
 */
const processStructureFingerprint = async (foundKeys, sourceUrl, status, registrationStatus) => {
    if (!foundKeys || foundKeys.length === 0) {
        console.log('No keys found, skipping fingerprint generation.');
        return false;
    }

    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();

    // ✅ NEW: Create the structureLabel
    const statusLabel = status || 'UNKNOWN_STATUS';
    const regLabel = registrationStatus || 'UNKNOWN_REG_STATUS';
    const structureLabel = `STATUS: ${statusLabel} | REG: ${regLabel}`;

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
                    structureLabel: structureLabel, // ✅ NEW
                    occurrenceCount: 1,
                    firstSeenAt: now,
                    lastSeenAt: now,
                    exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure",
                    _lastChangedAt: Date.now(),
                    _version: 1,
                }
            }));
            return true;
        } else {
            console.log(`Updated existing structure fingerprint with ID: ${structureId}`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: structureTable,
                Key: { id: structureId },
                // ✅ UPDATED: Also update label and exampleUrl on subsequent finds
                UpdateExpression: 'SET #lastSeen = :now, #occ = #occ + :inc, #label = :label, #exampleUrl = :exampleUrl',
                ExpressionAttributeNames: {
                    '#lastSeen': 'lastSeenAt',
                    '#occ': 'occurrenceCount',
                    '#label': 'structureLabel', // ✅ NEW
                    '#exampleUrl': 'exampleUrl' // ✅ NEW
                },
                ExpressionAttributeValues: {
                    ':now': now,
                    ':inc': 1,
                    ':label': structureLabel, // ✅ NEW
                    ':exampleUrl': sourceUrl // ✅ NEW
                }
            }));
            return false;
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return false;
    }
};

/**
 * ✅ UPDATED: The handler now passes status flags to the fingerprint processor
 * and adds the result to the response.
 */
const handleFetch = async (url) => {
    console.log(`Fetching data from: ${url}`);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const { data, foundKeys } = scrapeDataFromHtml(response.data);
    
    // ✅ UPDATED: Pass status and registrationStatus to fingerprint function
    const isNewStructure = await processStructureFingerprint(foundKeys, url, data.status, data.registrationStatus);
    
    return { ...data, isNewStructure };
};

// --- HANDLER FOR SAVING/UPDATING DATA ---
const handleSave = async (input) => {
    const { sourceUrl, venueId, data } = input;
    const now = new Date().toISOString();
    
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    // ✅ NEW: Helper function to calculate revenue from entries
    const calculateRevenueByEntries = (buyIn, totalEntries) => {
        if (buyIn && totalEntries) {
            return buyIn * totalEntries;
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

    if (existingGame) {
        console.log(`Found existing game with ID: ${existingGame.id}. Updating...`);
        
        // Update existing game with new data
        const updatedGameItem = {
            ...existingGame,
            // Update with new scraped data
            name: data.name,
            status: data.status || 'SCHEDULED',
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            // Tournament-specific fields now on Game
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            tournamentType: data.tournamentType || 'FREEZEOUT',
            // ✅ UPDATED: Calculate and add revenueByEntries
            revenueByEntries: calculateRevenueByEntries(data.buyIn, data.totalEntries),
            // Keep existing fields
            venueId,
            // ✅ UPDATED: Use new field names
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : existingGame.gameEndDateTime || null,
            updatedAt: now,
        };

        // If there's a tournament structure, update its levels
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
            
            // Update both game and structure
            // ✅ UPDATED: Use PutCommand for game update as it's a full replace
            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new UpdateCommand(structureUpdate)) // Use UpdateCommand for structure
            ]);
        } else {
            // Just update the game
            await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        }

        return updatedGameItem;

    } else {
        console.log('No existing game found. Creating new records...');
        
        const gameId = crypto.randomUUID();
        let structureId = null;
        
        // Only create a tournament structure if we have levels
        if (data.levels && data.levels.length > 0) {
            structureId = crypto.randomUUID();
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                // Embed levels directly in the structure
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
            
            // Save the tournament structure
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
            // ✅ UPDATED: Use new field names
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : now,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : null,
            sourceUrl,
            venueId,
            // Tournament-specific fields (moved from TournamentStructure)
            tournamentType: data.tournamentType || 'FREEZEOUT',
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            // ✅ UPDATED: Calculate and add revenueByEntries
            revenueByEntries: calculateRevenueByEntries(data.buyIn, data.totalEntries),
            // Other game data
            registrationStatus: data.registrationStatus,
            gameVariant: data.gameVariant,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            // Reference to tournament structure (if levels exist)
            tournamentStructureId: structureId,
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
