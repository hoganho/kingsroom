/* Amplify Params - DO NOT EDIT
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
	API_KINGSROOM_TICKETTEMPLATETABLE_ARN
	API_KINGSROOM_TICKETTEMPLATETABLE_NAME
	API_KINGSROOM_TOURNAMENTLEVELTABLE_ARN
	API_KINGSROOM_TOURNAMENTLEVELTABLE_NAME
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_ARN
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
	API_KINGSROOM_USERTABLE_ARN
	API_KINGSROOM_USERTABLE_NAME
	API_KINGSROOM_VENUEDETAILSTABLE_ARN
	API_KINGSROOM_VENUEDETAILSTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// Triggering a redeploy

const axios = require('axios');
const cheerio = require('cheerio');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, TransactWriteCommand, QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Helper to get table names from environment variables
const getTableName = (modelName) => {
    const envVarName = `API_KINGSROOMDASHBOARD_${modelName.toUpperCase()}TABLE_NAME`;
    const tableName = process.env[envVarName];
    if (!tableName) throw new Error(`Table name for model ${modelName} not found in environment variables.`);
    return tableName;
};

// --- SCRAPING LOGIC (now in its own function) ---
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
        const structureId = existingGame.tournamentStructureId;

        const updatedGameItem = {
            ...existingGame,
            ...data,
            venueId,
            gameDateTime: data.gameDateTime ? new Date(data.gameDateTime).toISOString() : existingGame.gameDateTime,
            updatedAt: now,
        };

        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        return updatedGameItem;

    } else {
        console.log('No existing game found. Creating new records...');
        const structureId = crypto.randomUUID();
        const gameId = crypto.randomUUID();
        
        const structureItem = {
            id: structureId,
            name: `${data.name} Structure`,
            type: data.tournamentType || 'FREEZEOUT',
            buyIn: data.buyIn,
            rake: data.rake || 0,
            startingStack: data.startingStack,
            hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount,
            createdAt: now, updatedAt: now, _lastChangedAt: Date.now(), _version: 1, __typename: "TournamentStructure",
        };

        const gameItem = {
            id: gameId,
            ...data,
            sourceUrl,
            venueId,
            tournamentStructureId: structureId,
            gameDateTime: data.gameDateTime ? new Date(data.gameDateTime).toISOString() : now,
            createdAt: now, updatedAt: now, _lastChangedAt: Date.now(), _version: 1, __typename: "Game",
        };
        delete gameItem.levels;
        delete gameItem.results;
        
        const levelItems = data.levels.map(level => ({
            Put: {
                TableName: getTableName('TournamentLevel'),
                Item: { id: crypto.randomUUID(), structureId, ...level, createdAt: now, updatedAt: now, _lastChangedAt: Date.now(), _version: 1, __typename: "TournamentLevel" },
            },
        }));

        const transactItems = [
            { Put: { TableName: getTableName('TournamentStructure'), Item: structureItem } },
            ...levelItems,
            { Put: { TableName: gameTable, Item: gameItem } },
        ];

        await ddbDocClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
        return gameItem;
    }
};


// --- MAIN LAMBDA HANDLER (ROUTER) ---
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    // ✅ NEW, MORE ROBUST ROUTING LOGIC
    // Instead of relying on event.info, we check for the presence of specific arguments.
    const { arguments } = event;

    try {
        if (arguments.input) {
            // If 'input' exists, it's the saveTournamentData mutation
            return await handleSave(arguments.input);
        } else if (arguments.url) {
            // If 'url' exists, it's the fetchTournamentData mutation
            return await handleFetch(arguments.url);
        } else {
            throw new Error(`Could not determine operation. No 'input' or 'url' argument found.`);
        }
    } catch (error) {
        console.error('Error during handler execution:', error);
        // The fieldName is useful for debugging in CloudWatch if we can get it
        const fieldName = event.info?.fieldName || 'unknown'; 
        throw new Error(`Operation failed for field ${fieldName}. Reason: ${error.message}`);
    }
};