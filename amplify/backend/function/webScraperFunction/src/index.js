/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_PLAYERENTRYTABLE_ARN
    API_KINGSROOM_PLAYERENTRYTABLE_NAME
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
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const {
    runScraper,
    getStatusAndReg
} = require('./scraperStrategies.js');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

// --- Date Helper Functions ---
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) return fallback || new Date().toISOString();
    
    // If already in ISO format with 'T', return as is
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) return dateValue;
        } catch (e) {}
    }
    
    // Handle date-only strings (YYYY-MM-DD)
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return `${dateValue}T00:00:00.000Z`;
    }
    
    // Try to parse as date
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {
        console.error(`Failed to parse date: ${dateValue}`, error);
    }
    
    return fallback || new Date().toISOString();
};

// --- Configuration (Assumed from environment) ---
// Note: PLAYER_PROCESSOR_QUEUE_URL must be configured as the FIFO queue URL

const parsePlayerName = (fullName) => {
    if (!fullName) return { firstName: 'Unknown', lastName: '', givenName: 'Unknown' };
    const trimmedName = fullName.trim();
    if (trimmedName.includes(',')) {
        const parts = trimmedName.split(',');
        const lastName = parts[0] ? parts[0].trim() : 'Unknown';
        const firstName = parts[1] ? parts[1].trim() : 'Unknown';
        return { firstName, lastName, givenName: firstName };
    } else {
        const parts = trimmedName.split(/\s+/);
        const firstName = parts[0] || 'Unknown';
        const lastName = parts.slice(1).join(' ') || '';
        return { firstName: firstName, lastName: lastName, givenName: firstName };
    }
};

const generatePlayerId = (playerName) => {
    const normalized = playerName.toLowerCase().trim();
    const hash = crypto.createHash('sha256')
        .update(normalized)
        .digest('hex');
    return hash.substring(0, 32);
};

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;

    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables. Amplify push may have failed.`);
    }

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
        return [];
    }
};

const getAllSeriesTitles = async () => {
    const seriesTitleTable = getTableName('TournamentSeriesTitle');
    try {
        const command = new ScanCommand({
            TableName: seriesTitleTable,
            ProjectionExpression: 'id, title, aliases'
        });
        const response = await ddbDocClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Error fetching series titles from DynamoDB:', error);
        return [];
    }
};

// --- SQS & PLAYER ENTRY LOGIC ---

const upsertLeanPlayerRecord = async (playerId, playerName, gameData) => {
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();

    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: playerTable,
            Key: { id: playerId },
            UpdateExpression: 'SET updatedAt = :now, lastPlayedDate = :lastPlayed',
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeValues: { 
                ':now': now,
                ':lastPlayed': ensureISODate(gameData.gameStartDateTime)
            }
        }));
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`[upsertLeanPlayerRecord] Player ${playerId} not found, creating new record.`);
            
            const nameParts = parsePlayerName(playerName);
            
            const newPlayer = {
                id: playerId,
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                givenName: nameParts.givenName,
                registrationDate: ensureISODate(gameData.gameStartDateTime),
                firstGamePlayed: ensureISODate(gameData.gameStartDateTime),
                lastPlayedDate: ensureISODate(gameData.gameStartDateTime),
                registrationVenueId: gameData.venueId,
                creditBalance: 0,
                pointsBalance: 0,
                status: 'ACTIVE',
                category: 'NEW',
                targetingClassification: 'NotPlayed',
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'Player'
            };
            await ddbDocClient.send(new PutCommand({
                TableName: playerTable,
                Item: newPlayer
            }));
        } else {
            console.error(`[upsertLeanPlayerRecord] Error checking for player ${playerId}:`, error);
            throw error;
        }
    }
};

const upsertPlayerEntries = async (savedGameItem, scrapedData) => {
    console.log(`[WEB-SCRAPER-TRACE] upsertPlayerEntries received. Player entries:`, scrapedData?.entries?.length, 'Player results:', scrapedData?.results?.length);
    console.log(`[upsertPlayerEntries] Starting player entry upsert for game ${savedGameItem.id}.`);
    const playerEntryTable = getTableName('PlayerEntry');
    const now = new Date().toISOString();
    
    // Use the helper function to get player data
    const { allPlayers } = extractPlayerDataForProcessing(scrapedData);
    
    if (allPlayers.length === 0) {
        console.log(`[upsertPlayerEntries] No player entries to process for game ${savedGameItem.id}.`);
        return;
    }

    const promises = allPlayers.map(async (playerData) => {
        const playerId = generatePlayerId(playerData.name);
        
        await upsertLeanPlayerRecord(playerId, playerData.name, savedGameItem);

        const entryId = `${savedGameItem.id}#${playerId}`;
        const status = playerData.rank ? 'ELIMINATED' : 'PLAYING';

        const playerEntry = {
            id: entryId,
            playerId: playerId,
            gameId: savedGameItem.id,
            venueId: savedGameItem.venueId,
            status: status,
            registrationTime: savedGameItem.gameStartDateTime,
            gameStartDateTime: savedGameItem.gameStartDateTime,
            lastKnownStackSize: playerData.lastKnownStack || null,
            tableNumber: playerData.lastKnownTable || null,
            seatNumber: playerData.lastKnownSeat || null,
            numberOfReEntries: 0,
            isMultiDayTournament: savedGameItem.isSeries || false,
            _version: 1,
            _lastChangedAt: Date.now(),
            createdAt: now,
            updatedAt: now,
            __typename: 'PlayerEntry'
        };

        return ddbDocClient.send(new PutCommand({
            TableName: playerEntryTable,
            Item: playerEntry
        }));
    });

    try {
        await Promise.all(promises);
        console.log(`[upsertPlayerEntries] Successfully processed ${allPlayers.length} players and their entries for game ${savedGameItem.id}.`);
    } catch (error) {
        console.error(`[upsertPlayerEntries] Error while processing player entries for game ${savedGameItem.id}:`, error);
    }
};

const createOptimizedPlayerPayload = (savedGameItem, scrapedData, metadata) => {
    const now = new Date().toISOString();
    const playerData = extractPlayerDataForProcessing(scrapedData);
    return {
        game: {
            id: savedGameItem.id,
            name: savedGameItem.name,
            venueId: savedGameItem.venueId,
            gameStartDateTime: savedGameItem.gameStartDateTime,
            gameEndDateTime: savedGameItem.gameEndDateTime,
            gameType: savedGameItem.gameType,
            gameVariant: savedGameItem.gameVariant,
            buyIn: savedGameItem.buyIn || 0,
            rake: savedGameItem.rake || 0,
            totalRake: savedGameItem.totalRake || 0,
            prizepool: savedGameItem.prizepool || 0,
            totalEntries: savedGameItem.totalEntries || 0,
            totalRebuys: savedGameItem.totalRebuys || 0,
            totalAddons: savedGameItem.totalAddons || 0,
            isSeries: savedGameItem.isSeries || false,
            seriesName: savedGameItem.seriesName || null,
            gameFrequency: savedGameItem.gameFrequency || 'UNKNOWN',
            isSatellite: savedGameItem.isSatellite || false
        },
        players: playerData,
        processingInstructions: createPlayerProcessingInstructions(playerData, savedGameItem),
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

const extractPlayerDataForProcessing = (scrapedData) => {
    // Failsafe: If scrapedData is null or undefined, return empty structure
    if (!scrapedData) {
        return { allPlayers: [], finishedPlayers: [], playersInTheMoney: [], playersWithPoints: [], qualifiedPlayers: [], totalPlayers: 0, totalFinished: 0, totalInTheMoney: 0, totalWithPoints: 0, totalPrizesPaid: 0, hasCompleteResults: false, hasEntryList: false, hasSeatingData: false };
    }
    
    const results = scrapedData.results || [];
    const entries = scrapedData.entries || [];
    const seating = scrapedData.seating || [];
    const playerMap = new Map();
    
    if (results.length > 0) {
        results.forEach(result => {
            if (result.name) {
                playerMap.set(result.name, {
                    name: result.name, entered: true, finished: true,
                    rank: result.rank, winnings: result.winnings || 0,
                    points: result.points || 0, isQualification: result.isQualification || false,
                });
            }
        });
    } else {
        entries.forEach(entry => {
            if (entry.name) {
                playerMap.set(entry.name, {
                    name: entry.name, entered: true, finished: false,
                    rank: null, winnings: 0, points: 0, isQualification: false,
                });
            }
        });
    }
    
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
    
    const allPlayers = Array.from(playerMap.values()).sort((a, b) => {
        if (a.rank === null) return 1;
        if (b.rank === null) return -1;
        return a.rank - b.rank;
    });
    
    const finishedPlayers = allPlayers.filter(p => p.finished);
    const totalPrizesPaid = finishedPlayers.reduce((sum, p) => sum + (p.winnings || 0), 0);
    const playersInTheMoney = finishedPlayers.filter(p => p.winnings > 0);
    const playersWithPoints = finishedPlayers.filter(p => p.points > 0);
    const qualifiedPlayers = finishedPlayers.filter(p => p.isQualification);

    return {
        allPlayers, finishedPlayers, playersInTheMoney, playersWithPoints, qualifiedPlayers,
        totalPlayers: allPlayers.length, totalFinished: finishedPlayers.length,
        totalInTheMoney: playersInTheMoney.length, totalWithPoints: playersWithPoints.length,
        totalPrizesPaid, hasCompleteResults: finishedPlayers.length > 0,
        hasEntryList: entries.length > 0 || results.length > 0,
        hasSeatingData: seating.length > 0
    };
};

const createPlayerProcessingInstructions = (playerData, gameInfo) => {
    const transactionTime = gameInfo.gameEndDateTime || gameInfo.gameStartDateTime;
    return playerData.allPlayers.map(player => {
        const createTransactions = [];
        createTransactions.push({
            type: 'BUY_IN', amount: (gameInfo.buyIn || 0) + (gameInfo.rake || 0),
            rake: gameInfo.rake || 0, paymentSource: 'CASH', transactionDate: transactionTime 
        });
        if (player.isQualification) {
            createTransactions.push({
                type: 'QUALIFICATION', amount: 0, rake: 0,
                paymentSource: 'UNKNOWN', transactionDate: transactionTime
            });
        }
        return {
            playerName: player.name,
            requiredActions: {
                upsertPlayer: true,
                createPlayerResult: {
                    finishingPlace: player.rank, prizeWon: player.winnings > 0 || player.isQualification,
                    amountWon: player.winnings || 0, pointsEarned: player.points || 0,
                    isMultiDayQualification: player.isQualification,
                    totalRunners: gameInfo.totalEntries || playerData.totalPlayers
                },
                createTransactions: createTransactions,
                updatePlayerSummary: {
                    incrementTournaments: 1, addWinnings: player.winnings || 0,
                    addBuyIn: (gameInfo.buyIn || 0) + (gameInfo.rake || 0),
                    incrementITM: player.winnings > 0 || player.isQualification ? 1 : 0,
                    incrementCashes: player.winnings > 0 ? 1 : 0
                },
                updatePlayerVenue: {
                    incrementGamesPlayed: 1,
                    lastPlayedDate: gameInfo.gameEndDateTime || gameInfo.gameStartDateTime
                }
            }
        };
    });
};

// --- SCRAPING & SAVING LOGIC ---

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
                    id: structureId, fields: foundKeys, structureLabel: structureLabel,
                    occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now, exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure", createdAt: now, updatedAt: now,
                    _lastChangedAt: Date.now(), _version: 1,
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            console.log(`Updated existing structure fingerprint with ID: ${structureId}`);
            await ddbDocClient.send(new UpdateCommand({
                TableName: structureTable, Key: { id: structureId },
                UpdateExpression: 'SET #lastSeenAt = :now, #occurrenceCount = #occurrenceCount + :inc, #updatedAt = :now',
                ExpressionAttributeNames: { '#lastSeenAt': 'lastSeenAt', '#occurrenceCount': 'occurrenceCount', '#updatedAt': 'updatedAt' },
                ExpressionAttributeValues: { ':now': now, ':inc': 1 }
            }));
            return { isNewStructure: false, structureLabel: structureLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return { isNewStructure: false, structureLabel: structureLabel };
    }
};

const handleFetch = async (url, jobId = null, triggerSource = null) => {
    console.log(`[handleFetch] Processing URL: ${url}. Job ID: ${jobId || 'N/A'}, Source: ${triggerSource || 'N/A'}`);
    const gameTable = getTableName('Game');
    let existingGameId = null;
    let doNotScrape = false;
    let scrapedData = null;
    let foundKeys = [];
    
    try {
        console.log('[handleFetch] Checking for existing game.');
        const queryResult = await ddbDocClient.send(new QueryCommand({
            TableName: gameTable, IndexName: 'bySourceUrl',
            KeyConditionExpression: 'sourceUrl = :sourceUrl',
            ExpressionAttributeValues: { ':sourceUrl': url },
            ProjectionExpression: 'id, doNotScrape' 
        }));
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
        console.log('[handleFetch] Starting HTTP request for HTML content.');
        const response = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'KingsRoom-Scraper/1.0' } });
        const html = response.data;
        console.log('[handleFetch] HTTP request successful. Starting scrape logic.');
        
        const scrapingResult = scrapeDataFromHtml(html, venues, seriesTitles);
        scrapedData = scrapingResult.data;
        foundKeys = scrapingResult.foundKeys;
        
        if (scrapedData.gameStatus === 'UNKNOWN_STATUS' || scrapedData.gameStatus === 'UNKNOWN' || !scrapedData.name || scrapedData.name.trim() === '') {
            console.log(`[handleFetch] Tournament ID not in use for ${url}`);
            return {
                id: existingGameId, name: 'Tournament ID Not In Use', gameStatus: 'NOT_IN_USE',
                registrationStatus: 'N_A', gameStartDateTime: null, gameEndDateTime: null,
                gameVariant: 'UNKNOWN', prizepool: 0, totalEntries: 0, tournamentType: 'UNKNOWN',
                buyIn: 0, rake: 0, startingStack: 0, hasGuarantee: false, guaranteeAmount: 0,
                gameTags: [], levels: [], isInactive: true, sourceUrl: url, existingGameId: existingGameId
            };
        }
        
        const fingerprint = await processStructureFingerprint(foundKeys, scrapedData.structureLabel, url);
        scrapedData.existingGameId = existingGameId;
        scrapedData.sourceUrl = url;
        scrapedData.fetchedAt = new Date().toISOString();
        
        console.log(`[handleFetch] Scraped data successfully for ${url}. END handleFetch.`);
        return { ...scrapedData, existingGameId, scrapedData: scrapedData, foundKeys: foundKeys };
    } catch (error) {
        console.error(`[handleFetch] ERROR fetching or scraping ${url}: ${error.message}`);
        return { existingGameId, errorMessage: error.message };
    }
};

const handleSave = async (input) => {
    const PLAYER_PROCESSOR_QUEUE_URL = process.env.PLAYER_PROCESSOR_QUEUE_URL;
    
    const jobId = input.jobId || null;
    const triggerSource = input.triggerSource || null;
    console.log(`[WEB-SCRAPER-TRACE] handleSave received. Type of input.originalScrapedData:`, typeof input.originalScrapedData);
    console.log(`[WEB-SCRAPER-TRACE] input.originalScrapedData (first 200 chars):`, String(input.originalScrapedData).substring(0, 200));

    console.log(`[handleSave] START processing save request. Job ID: ${jobId || 'N/A'}, Source: ${triggerSource || 'N/A'}`);
    
    const { sourceUrl, venueId, existingGameId, data } = input;
    const now = new Date().toISOString();
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    let savedGameItem = null;

    // --- ⚡️ START: ROBUST AWSJSON PARSING FIX ⚡️ ---
    // This handles both the pre-parsed object from AppSync (manual) 
    // and the raw string from Lambda.invoke (automated).
    
    let originalScrapedData = {}; // Default to empty object
    const rawOriginalData = input.originalScrapedData || null;

    if (rawOriginalData) {
        if (typeof rawOriginalData === 'string') {
            try {
                // This is the missing step for the automated flow
                originalScrapedData = JSON.parse(rawOriginalData);
                console.log(`[HANDLE-SAVE-DEBUG] Successfully parsed stringified originalScrapedData. Entries found: ${originalScrapedData.entries?.length || 0}`);
            } catch (e) {
                console.error('[HANDLE-SAVE-DEBUG] CRITICAL: Failed to parse originalScrapedData JSON string. Player data will be lost.', e);
            }
        } else if (typeof rawOriginalData === 'object') {
            // This handles the "magic" pre-parsed object from the manual flow
            originalScrapedData = rawOriginalData;
            console.log(`[HANDLE-SAVE-DEBUG] Received pre-parsed object for originalScrapedData. Entries found: ${originalScrapedData.entries?.length || 0}`);
        } else {
             console.warn(`[HANDLE-SAVE-DEBUG] originalScrapedData was of an unexpected type: ${typeof rawOriginalData}`);
        }
    } else {
        console.warn('[HANDLE-SAVE-DEBUG] WARNING: originalScrapedData field was missing from the input. No player data can be processed.');
    }
    // --- ⚡️ END: ROBUST AWSJSON PARSING FIX ⚡️ ---

    console.log(`[WEB-SCRAPER-TRACE] Parsed originalScrapedData. Is now object:`, typeof originalScrapedData === 'object');
    console.log(`[WEB-SCRAPER-TRACE] Parsed player entries:`, originalScrapedData?.entries?.length, 'Parsed player results:', originalScrapedData?.results?.length);

    const processedLevels = (data.levels || []).map(level => ({
        levelNumber: level.levelNumber, durationMinutes: level.durationMinutes || 0,
        smallBlind: level.smallBlind || 0, bigBlind: level.bigBlind || 0, ante: level.ante || 0,
        isBreak: level.breakMinutes > 0, breakMinutes: level.breakMinutes || 0
    }));
    
    const doNotScrape = input.doNotScrape || false;

    // --- 1. UPSERT GAME RECORD (Original working logic) ---
    if (existingGameId) {
        console.log('[handleSave] Updating existing game record.');
        const getCommand = new GetCommand({ TableName: gameTable, Key: { id: existingGameId } });
        const existingGame = await ddbDocClient.send(getCommand);
        if (!existingGame.Item) {
            throw new Error(`No game found with ID: ${existingGameId}`);
        }
        const updatedGameItem = {
            ...existingGame.Item, name: data.name,
            gameType: data.gameType || existingGame.Item.gameType || 'TOURNAMENT',
            gameStatus: data.gameStatus || existingGame.Item.gameStatus || 'SCHEDULED',
            gameVariant: data.gameVariant || existingGame.Item.gameVariant || 'NLHE',
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : existingGame.Item.gameStartDateTime,
            gameEndDateTime: data.gameEndDateTime,
            tournamentType: data.tournamentType || existingGame.Item.tournamentType,
            buyIn: data.buyIn !== undefined ? data.buyIn : existingGame.Item.buyIn,
            rake: data.rake !== undefined ? data.rake : existingGame.Item.rake,
            startingStack: data.startingStack !== undefined ? data.startingStack : existingGame.Item.startingStack,
            hasGuarantee: data.hasGuarantee !== undefined ? data.hasGuarantee : existingGame.Item.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount !== undefined ? data.guaranteeAmount : existingGame.Item.guaranteeAmount,
            revenueByBuyIns: data.revenueByBuyIns, profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus, guaranteeOverlay: data.guaranteeOverlay,
            totalRake: data.totalRake, isSatellite: data.isSatellite, isSeries: data.isSeries,
            isRegular: data.isRegular, gameFrequency: data.gameFrequency, seriesName: data.seriesName,
            registrationStatus: data.registrationStatus || existingGame.Item.registrationStatus,
            prizepool: data.prizepool !== undefined ? data.prizepool : existingGame.Item.prizepool,
            totalEntries: data.totalEntries !== undefined ? data.totalEntries : existingGame.Item.totalEntries,
            playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys !== undefined ? data.totalRebuys : existingGame.Item.totalRebuys,
            totalAddons: data.totalAddons !== undefined ? data.totalAddons : existingGame.Item.totalAddons,
            totalDuration: data.totalDuration !== undefined ? data.totalDuration : existingGame.Item.totalDuration,
            gameTags: data.gameTags || existingGame.Item.gameTags,
            doNotScrape: doNotScrape, sourceDataIssue: data.sourceDataIssue || false,
            gameDataVerified: data.gameDataVerified || false,
            updatedAt: now, _lastChangedAt: Date.now(),
        };
        
        if (processedLevels.length > 0) {
            let structureId = existingGame.Item.tournamentStructureId || crypto.randomUUID();
            updatedGameItem.tournamentStructureId = structureId;
            const structureItem = {
                id: structureId, name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`, levels: processedLevels,
                createdAt: now, updatedAt: now, _lastChangedAt: Date.now(),
                _version: 1, __typename: "TournamentStructure",
            };
            await ddbDocClient.send(new PutCommand({ TableName: structureTable, Item: structureItem }));
            console.log('[handleSave] Blind structure (re)saved.');
        } else {
            delete updatedGameItem.tournamentStructureId;
            console.log('[handleSave] No blind structure data to save.');
        }
        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        savedGameItem = updatedGameItem;

    } else {
        console.log('[handleSave] Creating new game record.');
        const gameId = crypto.randomUUID();
        let structureId = null;
        if (processedLevels.length > 0) {
            structureId = crypto.randomUUID();
            const structureItem = {
                id: structureId, name: `${data.name} - Blind Structure`,
                description: `Blind structure for ${data.name}`, levels: processedLevels,
                createdAt: now, updatedAt: now, _lastChangedAt: Date.now(),
                _version: 1, __typename: "TournamentStructure",
            };
            await ddbDocClient.send(new PutCommand({ TableName: structureTable, Item: structureItem }));
        }
        const gameItem = {
            id: gameId, name: data.name,
            gameType: data.gameType || 'TOURNAMENT', gameStatus: data.gameStatus || 'SCHEDULED',
            gameVariant: data.gameVariant || 'NLHE',
            gameStartDateTime: data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : now,
            gameEndDateTime: ensureISODate(data.gameEndDateTime), sourceUrl, venueId,
            tournamentType: data.tournamentType, buyIn: data.buyIn, rake: data.rake || 0,
            startingStack: data.startingStack, hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount, revenueByBuyIns: data.revenueByBuyIns,
            profitLoss: data.profitLoss, guaranteeSurplus: data.guaranteeSurplus,
            guaranteeOverlay: data.guaranteeOverlay, totalRake: data.totalRake,
            isSatellite: data.isSatellite, isSeries: data.isSeries, isRegular: data.isRegular,
            gameFrequency: data.gameFrequency, seriesName: data.seriesName,
            registrationStatus: data.registrationStatus, prizepool: data.prizepool,
            totalEntries: data.totalEntries, playersRemaining: data.playersRemaining,
            totalRebuys: data.totalRebuys, totalAddons: data.totalAddons,
            totalDuration: data.totalDuration, tournamentId: data.tournamentId,
            gameTags: data.gameTags,
            doNotScrape: doNotScrape, sourceDataIssue: data.sourceDataIssue || false,
            gameDataVerified: data.gameDataVerified || false,
            createdAt: now, updatedAt: now, _lastChangedAt: Date.now(),
            _version: 1, __typename: "Game",
        };
        
        if (structureId) {
            gameItem.tournamentStructureId = structureId;
        }
        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: gameItem }));
        savedGameItem = gameItem;
        console.log(`[handleSave] New game record ${gameId} created successfully.`);
    }
    
    // --- 2. PLAYER PROCESSING LOGIC (Business Rule Enforcement) ---
    
    const liveStatuses = ['RUNNING', 'REGISTERING'];
    
    if (savedGameItem && savedGameItem.gameStatus === 'FINISHED') {
        console.log(`[handleSave] DIAGNOSTIC: Status is FINISHED. Triggering full processing via SQS.`);
        try {
            if (!PLAYER_PROCESSOR_QUEUE_URL) {
                 throw new Error("PLAYER_PROCESSOR_QUEUE_URL environment variable is missing.");
            }
            
            // ⚡️ FIX: Pass the newly parsed 'originalScrapedData' object, not the 'data' fallback.
            const sqsPayload = createOptimizedPlayerPayload(savedGameItem, originalScrapedData, { sourceUrl, venueId });
            
            const idMatch = sourceUrl.match(/id=(\d+)/);
            const tournamentId = idMatch ? idMatch[1] : savedGameItem.id;

            console.log(`[handleSave] DIAGNOSTIC: FIFO Group ID: ${tournamentId}. Total Players: ${sqsPayload.players.allPlayers.length}`);

            const command = new SendMessageCommand({
                QueueUrl: process.env.PLAYER_PROCESSOR_QUEUE_URL, 
                MessageBody: JSON.stringify(sqsPayload),
                MessageGroupId: String(tournamentId),
                MessageDeduplicationId: String(tournamentId),
                MessageAttributes: {
                    gameId: { DataType: 'String', StringValue: savedGameItem.id },
                    gameStatus: { DataType: 'String', StringValue: savedGameItem.gameStatus },
                    venueId: { DataType: 'String', StringValue: venueId },
                    totalPlayers: { DataType: 'Number', StringValue: String(sqsPayload.players.allPlayers.length || 0) },
                    jobId: { DataType: 'String', StringValue: jobId || 'N/A' },
                    triggerSource: { DataType: 'String', StringValue: triggerSource || 'N/A' }
                }
            });
            
            await sqsClient.send(command);
            
            console.log(`[handleSave] DIAGNOSTIC: SUCCESS - Message sent to SQS for ID: ${tournamentId}.`);
        } catch (error) {
            console.error(`[handleSave] DIAGNOSTIC: FAILED - Error sending SQS message for ID ${tournamentId}: ${error.message}`);
        }
    } else if (savedGameItem && liveStatuses.includes(savedGameItem.gameStatus)) {
        console.log(`[handleSave] DIAGNOSTIC: Status is LIVE. Updating PlayerEntries only.`);
        console.log(`[WEB-SCRAPER-TRACE] Passing to upsertPlayerEntries. Player entries:`, originalScrapedData?.entries?.length);
        // ⚡️ FIX: Pass the newly parsed 'originalScrapedData' object, not the 'data' fallback.
        await upsertPlayerEntries(savedGameItem, originalScrapedData);
    }

    console.log('[handleSave] END processing save request.');
    return savedGameItem;
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
            if (data.isInactive || data.gameStatus === 'NOT_IN_USE') {
                return {
                    id: data.id,
                    name: 'Tournament ID Not In Use',
                    gameStatus: 'NOT_IN_USE',
                    registrationStatus: 'N_A',
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
    
    const operationName = event.fieldName || event.arguments?.operation;
    
    const jobId = event.arguments?.jobId || null;
    const triggerSource = event.arguments?.triggerSource || null;
    
    const args = event.arguments || event; 

    console.log(`[HANDLER] Operation detected: ${operationName}. Job ID: ${jobId || 'N/A'}`);
    
    try {
        switch (operationName) {
            
            case 'fetchTournamentData':
            case 'FETCH':
                const fetchResult = await handleFetch(args.url, jobId, triggerSource);
                if (fetchResult.errorMessage) {
                    throw new Error(fetchResult.errorMessage);
                }
                return fetchResult;

            case 'saveTournamentData':
            case 'SAVE':
                const saveInput = args.input || { 
                    sourceUrl: args.sourceUrl, 
                    venueId: args.venueId,
                    existingGameId: args.existingGameId,
                    doNotScrape: args.doNotScrape,
                    data: args.scrapedData,
                    originalScrapedData: args.originalScrapedData,
                    jobId: jobId, 
                    triggerSource: triggerSource
                };
                return await handleSave(saveInput);
                
            case 'fetchTournamentDataRange':
                return await handleFetchRange(args.startId, args.endId);
                
            default:
                throw new Error(`Unknown operation: ${operationName}.`);
        }
    } catch (error) {
        console.error('[HANDLER] CRITICAL Error:', error);
        return { errorMessage: error.message || 'Internal Lambda Error' }; 
    }
};