/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

const axios = require('axios');
const cheerio = require('cheerio');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
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
const scrapeDataFromHtml = (html) => {
    const $ = cheerio.load(html);

    // Helper functions
    const parseNumeric = (str) => {
        if (!str) return undefined;
        const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10);
        return isNaN(num) ? undefined : num;
    };
    
    const parseGuarantee = (text) => {
        if (!text) return { hasGuarantee: false };
        const guaranteeRegex = /(gtd|guaranteed|g'teed)/i;
        if (guaranteeRegex.test(text)) {
            return { hasGuarantee: true, guaranteeAmount: parseNumeric(text) };
        }
        return { hasGuarantee: false };
    };
    
    // Scrape all fields
    const registrationDiv = $('label:contains("Registration")').parent();
    const registrationStatus = registrationDiv.text().replace(/Registration/gi, '').trim() || undefined;

    const guaranteeText = $('.cw-game-shortdesc').text().trim();
    const { hasGuarantee, guaranteeAmount } = parseGuarantee(guaranteeText);

    const levelsScriptRegex = /const cw_tt_levels = (\[.*?\]);/s;
    const match = html.match(levelsScriptRegex);
    let levels = [];
    if (match && match[1]) {
        levels = JSON.parse(match[1]).map(level => ({
            levelNumber: level.ID || 0,
            durationMinutes: level.duration || 0,
            smallBlind: level.smallblind || 0,
            bigBlind: level.bigblind || 0,
            ante: level.ante || 0,
        }));
    }

    const results = [];
    $('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
        results.push({
            rank: parseInt($(el).find('td').eq(0).text().trim(), 10),
            name: $(el).find('td').eq(2).text().trim(),
            winnings: parseNumeric($(el).find('td').eq(3).text().trim()) || 0,
        });
    });

    return {
        name: $('.cw-game-title').first().text().trim(),
        gameDateTime: $('#cw_clock_start_date_time_local').text().trim(),
        status: $('label:contains("Status")').first().next('strong').text().trim().toUpperCase() || 'SCHEDULED',
        registrationStatus,
        gameVariant: $('#cw_clock_shortlimitgame').text().trim() || undefined,
        prizepool: parseNumeric($('#cw_clock_prizepool').text().trim()),
        totalEntries: parseNumeric($('#cw_clock_playersentries').text().trim()),
        totalRebuys: parseNumeric($('#cw_clock_rebuys').text().trim()),
        totalAddons: parseNumeric($('div.cw-clock-label:contains("Add-Ons")').next().text().trim()),
        totalDuration: $('div.cw-clock-label:contains("Total Time")').next().text().trim() || undefined,
        gameTags: $('.cw-game-buyins .cw-badge').map((i, el) => $(el).text().trim()).get(),
        buyIn: parseNumeric($('#cw_clock_buyin').text().trim()),
        startingStack: parseNumeric($('#cw_clock_startchips').text().trim()),
        hasGuarantee,
        guaranteeAmount,
        levels,
        results,
        rawHtml: html,
    };
};

// --- HANDLER FOR FETCHING DATA ---
const handleFetch = async (url) => {
    console.log(`Fetching data from: ${url}`);
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return scrapeDataFromHtml(response.data);
};

// --- HANDLER FOR SAVING/UPDATING DATA ---
const handleSave = async (input) => {
    const { sourceUrl, venueId, data } = input;
    const now = new Date().toISOString();
    
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
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
            // Keep existing fields
            venueId,
            gameDateTime: data.gameDateTime ? new Date(data.gameDateTime).toISOString() : existingGame.gameDateTime,
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
            await Promise.all([
                ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem })),
                ddbDocClient.send(new PutCommand(structureUpdate))
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
            gameDateTime: data.gameDateTime ? new Date(data.gameDateTime).toISOString() : now,
            sourceUrl,
            venueId,
            // Tournament-specific fields (moved from TournamentStructure)
            tournamentType: data.tournamentType || 'FREEZEOUT',
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
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