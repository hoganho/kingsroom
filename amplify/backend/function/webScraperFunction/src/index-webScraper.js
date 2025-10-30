/* Amplify Params - DO NOT EDIT
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
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_ARN
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME
	API_KINGSROOM_PLAYERVENUETABLE_ARN
	API_KINGSROOM_PLAYERVENUETABLE_NAME
	API_KINGSROOM_SCRAPESTRUCTURETABLE_ARN
	API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME
	API_KINGSROOM_TOURNAMENTSERIESTABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_ARN
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

const axios = require('axios');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
// ✅ 1. Import the SQS client and command
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const {
    runScraper,
    getStatusAndReg
} = require('./scraperStrategies.js');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
// ✅ 2. Instantiate the SQS client
const sqsClient = new SQSClient({});

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;

    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables. Amplify push may have failed.`);
    }

    // The pattern is always: ModelName-ApiId-Env
    const tableName = `${modelName}-${apiId}-${env}`;
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

const getAllSeriesTitles = async () => {
    // Note: The model name is 'TournamentSeriesTitle'
    const seriesTitleTable = getTableName('TournamentSeriesTitle');
    try {
        const command = new ScanCommand({
            TableName: seriesTitleTable,
            // Fetch the fields needed for matching
            ProjectionExpression: 'id, title, aliases'
        });
        const response = await ddbDocClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Error fetching series titles from DynamoDB:', error);
        return [];
    }
};

// --- OPTIMIZED SQS PAYLOAD CREATION ---
/**
 * Creates an optimized SQS payload specifically structured for player processing
 * @param {Object} savedGameItem - The saved game record from DynamoDB
 * @param {Object} scrapedData - The raw scraped data from the page
 * @param {Object} metadata - Additional metadata (sourceUrl, venueId, etc.)
 * @returns {Object} Optimized payload for SQS with focus on player data
 */
const createOptimizedPlayerPayload = (savedGameItem, scrapedData, metadata) => {
    const now = new Date().toISOString();
    
    // Extract and structure player-specific data
    const playerData = extractPlayerDataForProcessing(scrapedData);
    
    return {
        // Essential game information for context
        game: {
            id: savedGameItem.id,
            name: savedGameItem.name,
            venueId: savedGameItem.venueId,
            gameStartDateTime: savedGameItem.gameStartDateTime,
            gameEndDateTime: savedGameItem.gameEndDateTime || now,
            gameType: savedGameItem.gameType,
            gameVariant: savedGameItem.gameVariant,
            
            // Financial data needed for transaction records
            buyIn: savedGameItem.buyIn || 0,
            rake: savedGameItem.rake || 0,
            totalRake: savedGameItem.totalRake || 0,
            prizepool: savedGameItem.prizepool || 0,
            totalEntries: savedGameItem.totalEntries || 0,
            totalRebuys: savedGameItem.totalRebuys || 0,
            totalAddons: savedGameItem.totalAddons || 0,
            
            // Game categorization for player analytics
            isSeries: savedGameItem.isSeries || false,
            seriesName: savedGameItem.seriesName || null,
            gameFrequency: savedGameItem.gameFrequency || 'UNKNOWN',
            isSatellite: savedGameItem.isSatellite || false
        },
        
        // Structured player data ready for processing
        players: playerData,
        
        // Processing instructions for each player
        processingInstructions: createPlayerProcessingInstructions(playerData, savedGameItem),
        
        // Metadata for tracking and debugging
        metadata: {
            processedAt: now,
            sourceUrl: metadata.sourceUrl,
            venueId: metadata.venueId,
            scrapedAt: scrapedData.fetchedAt || now,
            hasCompleteResults: playerData.hasCompleteResults,
            totalPlayersProcessed: playerData.allPlayers.length,
            totalPrizesPaid: playerData.totalPrizesPaid
        }
    };
};

/**
 * Extracts player data from scraped results and structures it for processing
 */
const extractPlayerDataForProcessing = (scrapedData) => {
    const results = scrapedData.results || [];
    const entries = scrapedData.entries || [];
    const seating = scrapedData.seating || [];
    
    // Build comprehensive player records
    const playerMap = new Map();
    
    // ✅ START: REVISED LOGIC
    // If we have a final results list, use it as the single source of truth.
    // This is more reliable for finished games and avoids the bug.
    if (results.length > 0) {
        results.forEach(result => {
            if (result.name) {
                playerMap.set(result.name, {
                    name: result.name,
                    entered: true,
                    finished: true,
                    rank: result.rank,
                    winnings: result.winnings || 0,
                    points: result.points || 0,
                    isQualification: result.isQualification || false,
                });
            }
        });
    } else {
        // Fallback to the entries list ONLY if no results are present (e.g., for a live game).
        entries.forEach(entry => {
            if (entry.name) {
                playerMap.set(entry.name, {
                    name: entry.name,
                    entered: true,
                    finished: false, // Not finished yet if we're using the entries list
                    rank: null,
                    winnings: 0,
                    points: 0,
                    isQualification: false,
                });
            }
        });
    }
    // ✅ END: REVISED LOGIC
    
    // Add seating data if available (this logic remains the same)
    seating.forEach(seat => {
        if (seat.name) {
            const existing = playerMap.get(seat.name);
            if (existing) {
                existing.lastKnownStack = seat.playerStack;
                existing.lastKnownTable = seat.table;
                existing.lastKnownSeat = seat.seat;
            }
        }
    });
    
    // Convert to array and sort (this logic remains the same)
    const allPlayers = Array.from(playerMap.values())
        .sort((a, b) => {
            if (a.rank === null) return 1;
            if (b.rank === null) return -1;
            return a.rank - b.rank;
        });
    
    // Calculate aggregates (this logic remains the same)
    const finishedPlayers = allPlayers.filter(p => p.finished);
    const totalPrizesPaid = finishedPlayers.reduce((sum, p) => sum + (p.winnings || 0), 0);
    const playersInTheMoney = finishedPlayers.filter(p => p.winnings > 0);
    const playersWithPoints = finishedPlayers.filter(p => p.points > 0);
    const qualifiedPlayers = finishedPlayers.filter(p => p.isQualification);

    return {
        allPlayers,
        finishedPlayers,
        playersInTheMoney,
        playersWithPoints,
        qualifiedPlayers,
        totalPlayers: allPlayers.length,
        totalFinished: finishedPlayers.length,
        totalInTheMoney: playersInTheMoney.length,
        totalWithPoints: playersWithPoints.length,
        totalPrizesPaid,
        hasCompleteResults: finishedPlayers.length > 0,
        hasEntryList: entries.length > 0 || results.length > 0,
        hasSeatingData: seating.length > 0
    };
};

/**
 * Creates specific processing instructions for the downstream Lambda
 */
const createPlayerProcessingInstructions = (playerData, gameInfo) => {
    // Use the game's end time as the transaction time, or 'now' if it's missing
    const transactionTime = gameInfo.gameEndDateTime || new Date().toISOString();

    return playerData.allPlayers.map(player => {
        
        const createTransactions = [];

        // All players who entered the game get a BUY_IN transaction
        createTransactions.push({
            type: 'BUY_IN',
            amount: (gameInfo.buyIn || 0) + (gameInfo.rake || 0),
            rake: gameInfo.rake || 0,
            // --- ✅ FIX: Add missing non-nullable fields ---
            paymentSource: 'CASH', // Default to 'CASH'. Can be updated later.
            transactionDate: transactionTime 
            // --- End Fix ---
        });

        // If the player qualified, add a second transaction for the qualification prize
        if (player.isQualification) {
            createTransactions.push({
                type: 'QUALIFICATION',
                amount: 0, // A qualification is a non-monetary prize
                rake: 0,
                // --- ✅ FIX: Add missing non-nullable fields ---
                paymentSource: 'UNKNOWN', // No payment source for a non-monetary prize
                transactionDate: transactionTime
                // --- End Fix ---
            });
        }

        return {
            playerName: player.name,
            requiredActions: {
                upsertPlayer: true,
                createPlayerResult: {
                    finishingPlace: player.rank,
                    prizeWon: player.winnings > 0 || player.isQualification,
                    amountWon: player.winnings || 0,
                    pointsEarned: player.points || 0, // Pass the points to be saved
                    isMultiDayQualification: player.isQualification,
                    totalRunners: gameInfo.totalEntries || playerData.totalPlayers
                },
                createTransactions: createTransactions,
                updatePlayerSummary: {
                    incrementTournaments: 1,
                    addWinnings: player.winnings || 0,
                    addBuyIn: (gameInfo.buyIn || 0) + (gameInfo.rake || 0),
                    incrementITM: player.winnings > 0 || player.isQualification ? 1 : 0,
                    incrementCashes: player.winnings > 0 ? 1 : 0
                },
                updatePlayerVenue: {
                    incrementGamesPlayed: 1,
                    lastPlayedDate: gameInfo.gameEndDateTime || new Date().toISOString()
                }
            }
        };
    });
};


// --- SCRAPING LOGIC ---
const scrapeDataFromHtml = (html, venues, seriesTitles) => {
    const { gameStatus, registrationStatus } = getStatusAndReg(html);
    const structureLabel = `STATUS: ${gameStatus || 'UNKNOWN'} | REG: ${registrationStatus || 'UNKNOWN'}`;
    console.log(`[DEBUG-SCRAPER] Identified Structure: ${structureLabel}`);
    const { data, foundKeys } = runScraper(html, structureLabel, venues, seriesTitles);
    if (!data.hasOwnProperty('gameStatus') && gameStatus !== 'UNKNOWN_STATUS') {
        data.gameStatus = gameStatus;
        if (!foundKeys.includes('gameStatus')) {
             foundKeys.push('gameStatus');
        }
    }
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
            return { isNewStructure: false, structureLabel: structureLabel }; 
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
    
    // Store all scraped data for potential SQS message
    let scrapedData = null;
    let foundKeys = [];
    
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
        throw new Error('Scraping is disabled for this tournament (doNotScrape=true)');
    }
    
    console.log(`[handleFetch] Fetching content from ${url}...`);
    const venues = await getAllVenues();
    const seriesTitles = await getAllSeriesTitles();
    
    try {
        const response = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'KingsRoom-Scraper/1.0' } });
        const html = response.data;
        
        // Scrape the data
        const scrapingResult = scrapeDataFromHtml(html, venues, seriesTitles);
        scrapedData = scrapingResult.data;
        foundKeys = scrapingResult.foundKeys;
        
        // ✅ ENHANCEMENT 1: Check if tournament ID is not in use (UNKNOWN_STATUS or empty name)
        if (scrapedData.gameStatus === 'UNKNOWN_STATUS' || 
            scrapedData.gameStatus === 'UNKNOWN' ||
            !scrapedData.name || 
            scrapedData.name.trim() === '') {
            
            console.log(`[handleFetch] Tournament ID not in use for ${url}`);
            
            // Return a special response that indicates tournament ID is not in use
            return {
                id: existingGameId,
                name: 'Tournament ID Not In Use',
                gameStatus: 'NOT_IN_USE',
                registrationStatus: 'N/A',
                gameStartDateTime: null,
                gameEndDateTime: null,
                gameVariant: 'UNKNOWN',
                prizepool: 0,
                totalEntries: 0,
                tournamentType: 'UNKNOWN',
                buyIn: 0,
                rake: 0,
                startingStack: 0,
                hasGuarantee: false,
                guaranteeAmount: 0,
                gameTags: [],
                levels: [],
                isInactive: true,  // Special flag to indicate this tournament ID is not active
                sourceUrl: url,
                existingGameId: existingGameId
            };
        }
        
        // Process structure fingerprint
        const fingerprint = await processStructureFingerprint(foundKeys, scrapedData.structureLabel, url);
        
        // Add metadata
        scrapedData.existingGameId = existingGameId;
        scrapedData.sourceUrl = url;
        scrapedData.fetchedAt = new Date().toISOString();
        
        console.log(`[handleFetch] Scraped data successfully for ${url}`);
        return {
            ...scrapedData,
            existingGameId,
            scrapedData: scrapedData,  // Include the full scraped data
            foundKeys: foundKeys        // Include the found keys
        };
    } catch (error) {
        console.error(`[handleFetch] Error fetching or scraping ${url}: ${error.message}`);
        return { existingGameId, errorMessage: error.message };
    }
};

const handleSave = async (input) => {
    console.log('[handleSave] Processing save request...');
    const { sourceUrl, venueId, existingGameId, data } = input;
    const now = new Date().toISOString();
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    // Store a reference to the saved game item
    let savedGameItem = null;
    
    // Store the original scraped data if available
    let originalScrapedData = input.originalScrapedData || null;

    const processedLevels = (data.levels || []).map(level => ({
        levelNumber: level.levelNumber,
        durationMinutes: level.durationMinutes || 0,
        smallBlind: level.smallBlind || 0,
        bigBlind: level.bigBlind || 0,
        ante: level.ante || 0,
        isBreak: level.breakMinutes > 0,
        breakMinutes: level.breakMinutes || 0
    }));
    
    const doNotScrape = input.doNotScrape || false;

    if (existingGameId) {
        console.log('[handleSave] Updating existing game...');
        const getCommand = new GetCommand({ TableName: gameTable, Key: { id: existingGameId } });
        const existingGame = await ddbDocClient.send(getCommand);
        
        if (!existingGame.Item) {
            console.error(`[handleSave] No game found with ID: ${existingGameId}`);
            throw new Error(`No game found with ID: ${existingGameId}`);
        }
        
        const updatedGameItem = {
            ...existingGame.Item,
            name: data.name,
            gameType: data.gameType || existingGame.Item.gameType || 'TOURNAMENT',
            gameStatus: data.gameStatus || existingGame.Item.gameStatus || 'SCHEDULED',
            gameVariant: data.gameVariant || existingGame.Item.gameVariant || 'NLHE',
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.Item.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : existingGame.Item.gameEndDateTime,
            tournamentType: data.tournamentType || existingGame.Item.tournamentType,
            buyIn: data.buyIn !== undefined ? data.buyIn : existingGame.Item.buyIn,
            rake: data.rake !== undefined ? data.rake : existingGame.Item.rake,
            startingStack: data.startingStack !== undefined ? data.startingStack : existingGame.Item.startingStack,
            hasGuarantee: data.hasGuarantee !== undefined ? data.hasGuarantee : existingGame.Item.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount !== undefined ? data.guaranteeAmount : existingGame.Item.guaranteeAmount,
            revenueByBuyIns: data.revenueByBuyIns,
            profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus,
            guaranteeOverlay: data.guaranteeOverlay,
            totalRake: data.totalRake,
            isSatellite: data.isSatellite,
            isSeries: data.isSeries,
            isRegular: data.isRegular,
            gameFrequency: data.gameFrequency,
            seriesName: data.seriesName,
            registrationStatus: data.registrationStatus || existingGame.Item.registrationStatus,
            prizepool: data.prizepool !== undefined ? data.prizepool : existingGame.Item.prizepool,
            totalEntries: data.totalEntries !== undefined ? data.totalEntries : existingGame.Item.totalEntries,
            playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys !== undefined ? data.totalRebuys : existingGame.Item.totalRebuys,
            totalAddons: data.totalAddons !== undefined ? data.totalAddons : existingGame.Item.totalAddons,
            totalDuration: data.totalDuration !== undefined ? data.totalDuration : existingGame.Item.totalDuration,
            gameTags: data.gameTags || existingGame.Item.gameTags,
            doNotScrape: doNotScrape,
            sourceDataIssue: data.sourceDataIssue || false,
            gameDataVerified: data.gameDataVerified || false,
            updatedAt: now,
            _lastChangedAt: Date.now(),
        };
        
        if (processedLevels.length > 0) {
            let structureId = existingGame.Item.tournamentStructureId;
            if (!structureId) {
                structureId = crypto.randomUUID();
            }
            // ✅ CHANGE 1: Always assign the structureId to the item being saved
            updatedGameItem.tournamentStructureId = structureId;
            
            const structureItem = {
                id: structureId,
                name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`,
                levels: processedLevels,
                createdAt: now,
                updatedAt: now,
                _lastChangedAt: Date.now(),
                _version: 1,
                __typename: "TournamentStructure",
            };
            await ddbDocClient.send(new PutCommand({ TableName: structureTable, Item: structureItem }));
        } else {
            // If there are no levels, ensure we don't have a null ID
            delete updatedGameItem.tournamentStructureId;
        }

        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        savedGameItem = updatedGameItem; // Assign the updated item

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
                levels: processedLevels,
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
            gameType: data.gameType || 'TOURNAMENT',
            gameStatus: data.gameStatus || 'SCHEDULED',
            gameVariant: data.gameVariant || 'NLHE',
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : now,
            gameEndDateTime: data.gameEndDateTime ? new Date(data.gameEndDateTime).toISOString() : null,
            sourceUrl,
            venueId,
            tournamentType: data.tournamentType,
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
            isSatellite: data.isSatellite,
            isSeries: data.isSeries,
            isRegular: data.isRegular,
            gameFrequency: data.gameFrequency,
            seriesName: data.seriesName,
            registrationStatus: data.registrationStatus,
            prizepool: data.prizepool,
            totalEntries: data.totalEntries,
            playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons,
            totalDuration: data.totalDuration,
            gameTags: data.gameTags,
            // tournamentStructureId is now handled below
            doNotScrape: doNotScrape,
            sourceDataIssue: data.sourceDataIssue || false,
            gameDataVerified: data.gameDataVerified || false,
            createdAt: now,
            updatedAt: now,
            _lastChangedAt: Date.now(),
            _version: 1,
            __typename: "Game",
        };
        
        // ✅ CHANGE 2: Conditionally add the tournamentStructureId to the object.
        // If structureId is null, the key will not be added to the object.
        if (structureId) {
            gameItem.tournamentStructureId = structureId;
        }

        await ddbDocClient.send(new PutCommand({ 
            TableName: gameTable, 
            Item: gameItem 
        }));
        savedGameItem = gameItem; // Assign the new item
    }

    // Send SQS message if game is FINISHED
    if (savedGameItem && savedGameItem.gameStatus === 'FINISHED') {
        try {
            // Create an optimized payload focused on player processing
            const sqsPayload = createOptimizedPlayerPayload(
                savedGameItem, 
                originalScrapedData || data,
                { sourceUrl, venueId }
            );
            
            const command = new SendMessageCommand({
                // This environment variable MUST be configured on the function
                QueueUrl: process.env.PLAYER_PROCESSOR_QUEUE_URL,
                MessageBody: JSON.stringify(sqsPayload),
                // Optional: Add message attributes for easier filtering/routing
                MessageAttributes: {
                    gameId: {
                        DataType: 'String',
                        StringValue: savedGameItem.id
                    },
                    gameStatus: {
                        DataType: 'String',
                        StringValue: 'FINISHED'
                    },
                    venueId: {
                        DataType: 'String',
                        StringValue: venueId
                    },
                    totalPlayers: {
                        DataType: 'Number',
                        StringValue: String(sqsPayload.players.totalPlayers || 0)
                    }
                }
            });

            await sqsClient.send(command);
            console.log(`[handleSave] Successfully sent finished game ${savedGameItem.id} to SQS queue with optimized player data.`);
            console.log(`[handleSave] Payload contains ${sqsPayload.players.totalPlayers} players, ${sqsPayload.players.totalInTheMoney} ITM.`);

        } catch (error) {
            console.error('[handleSave] FAILED to send message to SQS:', error);
            // We only log the error here; we don't throw it, because the primary
            // goal (saving the game) was successful.
        }
    }

    return savedGameItem; // Return the saved item
};

const handleFetchRange = async (startId, endId) => {
    console.log(`[handleFetchRange] Processing range from ID ${startId} to ${endId}`);

    if (startId > endId) {
        throw new Error('Start ID cannot be greater than End ID.');
    }
    if (endId - startId + 1 > 100) { 
        throw new Error('The requested range is too large. Please fetch a maximum of 100 games at a time.');
    }

    const allResults = [];
    const chunkSize = 10;

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

        const settledResults = await Promise.allSettled(chunkPromises);
        allResults.push(...settledResults);
    }

    return allResults.map(res => {
        if (res.status === 'fulfilled' && !res.value.error) {
            const data = res.value;
            // Handle the special case where tournament ID is not in use
            if (data.isInactive || data.gameStatus === 'NOT_IN_USE') {
                return {
                    id: data.id,
                    name: 'Tournament ID Not In Use',
                    gameStatus: 'NOT_IN_USE',
                    registrationStatus: 'N/A',
                    gameStartDateTime: null,
                    inDatabase: !!data.existingGameId,
                    doNotScrape: false,
                    isInactive: true,
                    error: null
                };
            }
            return {
                id: data.id,
                name: data.name || 'Name not found',
                gameStatus: data.gameStatus || 'UNKNOWN',
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
    const { arguments, fieldName } = event;

    try {
        switch (fieldName) {
            case 'fetchTournamentData':
                const result = await handleFetch(arguments.url);
                
                // ✅ ENHANCEMENT 1: Handle NOT_IN_USE tournaments gracefully
                if (result.isInactive || result.gameStatus === 'NOT_IN_USE') {
                    console.log('[Handler] Tournament is not in use, returning placeholder data');
                    return result; // Return the placeholder data directly
                }
                
                if (result.errorMessage) throw new Error(result.errorMessage);
                return result;
                
            case 'saveTournamentData':
                // Pass the original scraped data along if available
                if (arguments.input.originalScrapedData) {
                    return await handleSave(arguments.input);
                }
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
