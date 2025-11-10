/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_PLAYERENTRYTABLE_ARN
	API_KINGSROOM_PLAYERENTRYTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_S3STORAGETABLE_ARN
	API_KINGSROOM_S3STORAGETABLE_NAME
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	API_KINGSROOM_SCRAPESTRUCTURETABLE_ARN
	API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
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
const { handleFetch: handleFetchEnhanced } = require('./enhanced-handleFetch');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// DEFAULT ENTITY - Replace with your actual default entity ID
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0"; 

const {
    runScraper,
    getStatusAndReg
} = require('./scraperStrategies.js');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

// --- Entity Helper Functions ---
const getEntityIdFromUrl = async (url) => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const entityTable = getTableName('Entity');
        const scanResult = await ddbDocClient.send(new ScanCommand({
            TableName: entityTable,
            FilterExpression: 'gameUrlDomain = :domain',
            ExpressionAttributeValues: { ':domain': domain }
        }));
        if (scanResult.Items && scanResult.Items.length > 0) {
            return scanResult.Items[0].id;
        }
        return DEFAULT_ENTITY_ID;
    } catch (error) {
        console.error('[Entity] Error determining entity from URL:', error);
        return DEFAULT_ENTITY_ID;
    }
};

const ensureDefaultEntity = async () => {
    const entityTable = getTableName('Entity');
    const entityId = DEFAULT_ENTITY_ID;
    try {
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: entityTable, Key: { id: entityId }
        }));
        if (!getResult.Item) {
            const now = new Date().toISOString();
            await ddbDocClient.send(new PutCommand({
                TableName: entityTable,
                Item: {
                    id: entityId, entityName: 'Default Entity', gameUrlDomain: 'default.com',
                    gameUrlPath: '/', isActive: true, createdAt: now, updatedAt: now,
                    _version: 1, __typename: 'Entity'
                }
            }));
            console.log('[Entity] Created default entity');
        }
        return entityId;
    } catch (error) {
        console.error('[Entity] Error ensuring default entity:', error);
        return DEFAULT_ENTITY_ID;
    }
};

// --- Date Helper Functions ---
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) return fallback || new Date().toISOString();
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) return dateValue;
        } catch (e) {}
    }
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return `${dateValue}T00:00:00.000Z`;
    }
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {
        console.error(`Failed to parse date: ${dateValue}`, error);
    }
    return fallback || new Date().toISOString();
};

// --- Configuration ---
const PLAYER_PROCESSOR_QUEUE_URL = process.env.PLAYER_PROCESSOR_QUEUE_URL;

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
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return hash.substring(0, 32);
};

const getTableName = (modelName) => {
    const specialTables = {
        'Entity': process.env.API_KINGSROOM_ENTITYTABLE_NAME,
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME,
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME,
        'ScrapeAttempt': process.env.API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME,
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
        'Venue': process.env.API_KINGSROOM_VENUETABLE_NAME,
        'TournamentStructure': process.env.API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME,
        'TournamentSeries': process.env.API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME,
        'TournamentSeriesTitle': process.env.API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME,
        'PlayerEntry': process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME,
        'PlayerResult': process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME,
        'PlayerSummary': process.env.API_KINGSROOM_PLAYERSUMMARYTABLE_NAME,
        'Player': process.env.API_KINGSROOM_PLAYERTABLE_NAME,
        'PlayerTransaction': process.env.API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME,
        'PlayerVenue': process.env.API_KINGSROOM_PLAYERVENUETABLE_NAME,
        'ScrapeStructure': process.env.API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME,
    };
    if (specialTables[modelName]) return specialTables[modelName];
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) throw new Error(`API ID or environment name not found.`);
    return `${modelName}-${apiId}-${env}`;
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
    const gameStartDateTime = ensureISODate(gameData.gameStartDateTime);
    const gameDateObj = new Date(gameStartDateTime);

    try {
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: playerTable, Key: { id: playerId }
        }));
        const existingPlayer = getResult.Item;

        if (existingPlayer) {
            const currentRegDate = new Date(existingPlayer.registrationDate);
            const currentLastPlayed = new Date(existingPlayer.lastPlayedDate || existingPlayer.registrationDate);
            let updateExpression = 'SET updatedAt = :now';
            let expressionValues = { ':now': now };
            let needsUpdate = false;

            if (gameDateObj < currentRegDate) {
                updateExpression += ', registrationDate = :regDate, firstGamePlayed = :firstGame';
                expressionValues[':regDate'] = gameStartDateTime;
                expressionValues[':firstGame'] = gameStartDateTime;
                if (gameData.venueId && gameData.venueId !== UNASSIGNED_VENUE_ID) {
                    updateExpression += ', registrationVenueId = :regVenue';
                    expressionValues[':regVenue'] = gameData.venueId;
                }
                needsUpdate = true;
            }
            if (gameDateObj > currentLastPlayed) {
                updateExpression += ', lastPlayedDate = :lastPlayed';
                expressionValues[':lastPlayed'] = gameStartDateTime;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await ddbDocClient.send(new UpdateCommand({
                    TableName: playerTable, Key: { id: playerId },
                    UpdateExpression: updateExpression, ExpressionAttributeValues: expressionValues
                }));
            }
        } else {
            const nameParts = parsePlayerName(playerName);
            const canAssignVenue = gameData.venueId && gameData.venueId !== UNASSIGNED_VENUE_ID;
            const newPlayer = {
                id: playerId, firstName: nameParts.firstName, lastName: nameParts.lastName,
                givenName: nameParts.givenName, registrationDate: gameStartDateTime,
                firstGamePlayed: gameStartDateTime, lastPlayedDate: gameStartDateTime,
                registrationVenueId: canAssignVenue ? gameData.venueId : null,
                creditBalance: 0, pointsBalance: 0, status: 'ACTIVE', category: 'NEW',
                targetingClassification: 'NotPlayed', createdAt: now, updatedAt: now,
                _version: 1, _lastChangedAt: Date.now(), __typename: 'Player'
            };
            await ddbDocClient.send(new PutCommand({
                TableName: playerTable, Item: newPlayer, ConditionExpression: 'attribute_not_exists(id)'
            }));
        }
    } catch (error) {
        if (error.name !== 'ConditionalCheckFailedException') {
            console.error(`[upsertLeanPlayerRecord] Error processing player ${playerId}:`, error);
            throw error;
        }
    }
};

const upsertPlayerEntries = async (savedGameItem, scrapedData) => {
    const playerEntryTable = getTableName('PlayerEntry');
    const now = new Date().toISOString();
    const { allPlayers } = extractPlayerDataForProcessing(scrapedData);
    if (allPlayers.length === 0) return;
    
    const effectiveVenueId = savedGameItem.venueId || UNASSIGNED_VENUE_ID;
    const gameDataForLeanPlayer = {
        gameStartDateTime: savedGameItem.gameStartDateTime,
        venueId: effectiveVenueId
    };

    const promises = allPlayers.map(async (playerData) => {
        const playerId = generatePlayerId(playerData.name);
        await upsertLeanPlayerRecord(playerId, playerData.name, gameDataForLeanPlayer);
        const entryId = `${savedGameItem.id}#${playerId}`;
        const status = playerData.rank ? 'ELIMINATED' : 'PLAYING';
        const playerEntry = {
            id: entryId, playerId: playerId, gameId: savedGameItem.id, venueId: effectiveVenueId,
            status: status, registrationTime: savedGameItem.gameStartDateTime,
            gameStartDateTime: savedGameItem.gameStartDateTime,
            lastKnownStackSize: playerData.lastKnownStack || null,
            tableNumber: playerData.lastKnownTable || null,
            seatNumber: playerData.lastKnownSeat || null,
            numberOfReEntries: 0, isMultiDayTournament: savedGameItem.isSeries || false,
            _version: 1, _lastChangedAt: Date.now(), __typename: 'PlayerEntry',
            createdAt: now, updatedAt: now
        };
        await ddbDocClient.send(new PutCommand({ TableName: playerEntryTable, Item: playerEntry }));
    });
    await Promise.all(promises);
};

const extractPlayerDataForProcessing = (scrapedData) => {
    if (!scrapedData) return { allPlayers: [], finishedPlayers: [], playersInTheMoney: [], playersWithPoints: [], qualifiedPlayers: [], totalPlayers: 0, totalFinished: 0, totalInTheMoney: 0, totalWithPoints: 0, totalPrizesPaid: 0, hasCompleteResults: false, hasEntryList: false, hasSeatingData: false };
    const results = scrapedData.results || [];
    const entries = scrapedData.entries || [];
    const seating = scrapedData.seating || [];
    const playerMap = new Map();
    
    if (results.length > 0) {
        results.forEach(result => {
            if (result.name) playerMap.set(result.name, { name: result.name, entered: true, finished: true, rank: result.rank, winnings: result.winnings || 0, points: result.points || 0, isQualification: result.isQualification || false });
        });
    } else {
        entries.forEach(entry => {
            if (entry.name) playerMap.set(entry.name, { name: entry.name, entered: true, finished: false, rank: null, winnings: 0, points: 0, isQualification: false });
        });
    }
    seating.forEach(seat => {
        if (seat.name && playerMap.has(seat.name)) {
            const existing = playerMap.get(seat.name);
            existing.lastKnownStack = seat.playerStack;
            existing.lastKnownTable = seat.table;
            existing.lastKnownSeat = seat.seat;
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

    return { allPlayers, finishedPlayers, playersInTheMoney, playersWithPoints, qualifiedPlayers, totalPlayers: allPlayers.length, totalFinished: finishedPlayers.length, totalInTheMoney: playersInTheMoney.length, totalWithPoints: playersWithPoints.length, totalPrizesPaid, hasCompleteResults: finishedPlayers.length > 0, hasEntryList: entries.length > 0 || results.length > 0, hasSeatingData: seating.length > 0 };
};

const createOptimizedPlayerPayload = (savedGameItem, scrapedData, metadata) => {
    const now = new Date().toISOString();
    const playerData = extractPlayerDataForProcessing(scrapedData);
    const authoritativeGameStart = ensureISODate(savedGameItem.gameStartDateTime);
    return {
        game: {
            id: savedGameItem.id, name: savedGameItem.name, venueId: savedGameItem.venueId,
            venueAssignmentStatus: savedGameItem.venueAssignmentStatus,
            entityId: savedGameItem.entityId || DEFAULT_ENTITY_ID,
            gameStartDateTime: authoritativeGameStart,
            gameEndDateTime: ensureISODate(savedGameItem.gameEndDateTime, authoritativeGameStart),
            gameType: savedGameItem.gameType, gameVariant: savedGameItem.gameVariant,
            buyIn: savedGameItem.buyIn || 0, rake: savedGameItem.rake || 0,
            totalRake: savedGameItem.totalRake || 0, prizepool: savedGameItem.prizepool || 0,
            totalEntries: savedGameItem.totalEntries || 0, totalRebuys: savedGameItem.totalRebuys || 0,
            totalAddons: savedGameItem.totalAddons || 0, isSeries: savedGameItem.isSeries || false,
            seriesName: savedGameItem.seriesName || null, gameFrequency: savedGameItem.gameFrequency || 'UNKNOWN',
            isSatellite: savedGameItem.isSatellite || false
        },
        players: playerData,
        processingInstructions: createPlayerProcessingInstructions(playerData, savedGameItem),
        metadata: {
            processedAt: now, sourceUrl: metadata.sourceUrl, venueId: metadata.venueId,
            entityId: metadata.entityId || DEFAULT_ENTITY_ID, scrapedAt: scrapedData.fetchedAt || now,
            hasCompleteResults: playerData.hasCompleteResults,
            totalPlayersProcessed: playerData.allPlayers.length, totalPrizesPaid: playerData.totalPrizesPaid
        }
    };
};

const createPlayerProcessingInstructions = (playerData, gameInfo) => {
    const transactionTime = ensureISODate(gameInfo.gameStartDateTime) || ensureISODate(gameInfo.gameEndDateTime);
    return playerData.allPlayers.map(player => {
        const createTransactions = [{ type: 'BUY_IN', amount: (gameInfo.buyIn || 0) + (gameInfo.rake || 0), rake: gameInfo.rake || 0, paymentSource: 'CASH', transactionDate: transactionTime }];
        if (player.isQualification) createTransactions.push({ type: 'QUALIFICATION', amount: 0, rake: 0, paymentSource: 'UNKNOWN', transactionDate: transactionTime });
        return {
            playerName: player.name,
            requiredActions: {
                upsertPlayer: true,
                createPlayerResult: { finishingPlace: player.rank, prizeWon: player.winnings > 0 || player.isQualification, amountWon: player.winnings || 0, pointsEarned: player.points || 0, isMultiDayQualification: player.isQualification, totalRunners: gameInfo.totalEntries || playerData.totalPlayers },
                createTransactions: createTransactions,
                updatePlayerSummary: { incrementTournaments: 1, addWinnings: player.winnings || 0, addBuyIn: (gameInfo.buyIn || 0) + (gameInfo.rake || 0), incrementITM: player.winnings > 0 || player.isQualification ? 1 : 0, incrementCashes: player.winnings > 0 ? 1 : 0 },
                updatePlayerVenue: { incrementGamesPlayed: 1, lastPlayedDate: transactionTime }
            }
        };
    });
};

// --- SCRAPING & SAVING LOGIC ---

/**
 * Restored: Fingerprinting logic for structural changes.
 */
const processStructureFingerprint = async (foundKeys, structureLabel, sourceUrl) => {
    if (!foundKeys || foundKeys.length === 0) return { isNewStructure: false, structureLabel: structureLabel };
    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();
    try {
        const getResponse = await ddbDocClient.send(new QueryCommand({
            TableName: structureTable, KeyConditionExpression: 'id = :id', ExpressionAttributeValues: { ':id': structureId }
        }));
        const isNew = getResponse.Items.length === 0;
        if (isNew) {
            console.log(`Saving new structure fingerprint: ${structureId}`);
            await ddbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId, fields: foundKeys, structureLabel: structureLabel,
                    occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now, exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure", createdAt: now, updatedAt: now, _version: 1
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            await ddbDocClient.send(new UpdateCommand({
                TableName: structureTable, Key: { id: structureId },
                UpdateExpression: 'SET lastSeenAt = :now, occurrenceCount = occurrenceCount + :inc, updatedAt = :now',
                ExpressionAttributeValues: { ':now': now, ':inc': 1 }
            }));
            return { isNewStructure: false, structureLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return { isNewStructure: false, structureLabel };
    }
};

const getOrCreateScrapeURL = async (url, tournamentId, entityId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    try {
        const response = await ddbDocClient.send(new GetCommand({ 
            TableName: scrapeURLTable, 
            Key: { id: url } 
        }));
        
        if (response.Item) return response.Item;
        
        const now = new Date().toISOString();
        const timestamp = new Date().getTime(); // For _lastChangedAt
        
        const newRecord = {
            id: url, 
            url, 
            tournamentId: parseInt(tournamentId, 10), 
            entityId: entityId || DEFAULT_ENTITY_ID,
            status: 'ACTIVE', 
            doNotScrape: false, 
            placedIntoDatabase: false, 
            firstScrapedAt: now, 
            lastScrapedAt: now,
            timesScraped: 0, 
            timesSuccessful: 0, 
            timesFailed: 0, 
            consecutiveFailures: 0, 
            sourceSystem: "KINGSROOM_WEB",
            s3StorageEnabled: true, 
            createdAt: now, 
            updatedAt: now, 
            __typename: 'ScrapeURL', 
            
            // ✅ ADD ALL DataStore sync fields:
            _version: 1,
            _lastChangedAt: timestamp,  // Required field - use timestamp in milliseconds
            _deleted: null  // Optional but good to include
        };
        
        await ddbDocClient.send(new PutCommand({ 
            TableName: scrapeURLTable, 
            Item: newRecord 
        }));
        
        return newRecord;
    } catch (error) {
        console.error('[getOrCreateScrapeURL] Error:', error);
        return { 
            id: url, 
            tournamentId: parseInt(tournamentId, 10), 
            s3StorageEnabled: false 
        };
    }
};

const extractTournamentId = (url) => {
    if (!url) return 0;
    const match = url.match(/[?&]id=(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
};

/**
 * Restored and Updated: Now async to support fingerprinting.
 */
const scrapeDataFromHtml = async (html, venues, seriesTitles, url) => {
    // Use updated strategies which detect new states (NOT_FOUND, NOT_PUBLISHED)
    const { data, foundKeys } = runScraper(html, null, venues, seriesTitles, url);
    
    if (!data.structureLabel) {
         data.structureLabel = `STATUS: ${data.gameStatus || 'UNKNOWN'} | REG: ${data.registrationStatus || 'UNKNOWN'}`;
    }
    if (!foundKeys.includes('structureLabel')) foundKeys.push('structureLabel');

    // Apply fingerprinting
    const { isNewStructure } = await processStructureFingerprint(foundKeys, data.structureLabel, url);
    data.isNewStructure = isNewStructure;

    console.log(`[DEBUG-SCRAPER] Scraped status: ${data.gameStatus}, doNotScrape: ${data.doNotScrape}`);
    return { data, foundKeys };
};

const handleFetch = handleFetchEnhanced;

// --- MAIN SAVE HANDLER ---
const handleSave = async (input) => {
    const jobId = input.jobId || null;
    const triggerSource = input.triggerSource || null;
    console.log(`[handleSave] START. Job: ${jobId}, Source: ${triggerSource}`);
    
    const { sourceUrl, existingGameId, data } = input;
    const venueId = input.venueId || UNASSIGNED_VENUE_ID;
    const isUnassigned = venueId === UNASSIGNED_VENUE_ID;
    const entityId = input.entityId || await getEntityIdFromUrl(sourceUrl);
    const now = new Date().toISOString();
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    
    let savedGameItem = null;
    let parsedOriginalData = {};
    const rawOriginalData = input.originalScrapedData || null;

    if (rawOriginalData) {
        if (typeof rawOriginalData === 'string') {
            try { parsedOriginalData = JSON.parse(rawOriginalData); } 
            catch (e) { console.error('[HANDLE-SAVE] Failed to parse original data JSON.', e); }
        } else if (typeof rawOriginalData === 'object') {
            parsedOriginalData = rawOriginalData;
        }
    }

    if (parsedOriginalData) {
        if (parsedOriginalData.tournamentId !== undefined && !data.tournamentId) data.tournamentId = parsedOriginalData.tournamentId;
        if (parsedOriginalData.playersRemaining !== undefined && data.playersRemaining === undefined) data.playersRemaining = parsedOriginalData.playersRemaining;
    }

    const processedLevels = (data.levels || []).map(level => ({
        levelNumber: level.levelNumber, durationMinutes: level.durationMinutes || 0,
        smallBlind: level.smallBlind || 0, bigBlind: level.bigBlind || 0, ante: level.ante || 0,
        isBreak: level.breakMinutes > 0, breakMinutes: level.breakMinutes || 0
    }));
    
    const doNotScrape = input.doNotScrape || false;

    if (existingGameId) {
        const existingGame = await ddbDocClient.send(new GetCommand({ TableName: gameTable, Key: { id: existingGameId } }));
        if (!existingGame.Item) throw new Error(`No game found with ID: ${existingGameId}`);
        
        const newGameStart = data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : null;
        const authoritativeStart = (newGameStart && newGameStart !== existingGame.Item.gameStartDateTime) ? newGameStart : existingGame.Item.gameStartDateTime;

        const updatedGameItem = {
            ...existingGame.Item, name: data.name, gameType: data.gameType || existingGame.Item.gameType,
            gameStatus: data.gameStatus || existingGame.Item.gameStatus, gameVariant: data.gameVariant || existingGame.Item.gameVariant,
            gameStartDateTime: authoritativeStart, gameEndDateTime: ensureISODate(data.gameEndDateTime),
            venueId: venueId || existingGame.Item.venueId || UNASSIGNED_VENUE_ID,
            entityId: entityId || existingGame.Item.entityId || DEFAULT_ENTITY_ID,
            venueAssignmentStatus: input.venueAssignmentStatus || existingGame.Item.venueAssignmentStatus || (isUnassigned ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED'),
            requiresVenueAssignment: isUnassigned || existingGame.Item.requiresVenueAssignment,
            suggestedVenueName: input.suggestedVenueName || existingGame.Item.suggestedVenueName || data.venueName || null,
            venueAssignmentConfidence: input.venueAssignmentConfidence || existingGame.Item.venueAssignmentConfidence || 0,
            tournamentType: data.tournamentType || existingGame.Item.tournamentType,
            buyIn: data.buyIn !== undefined ? data.buyIn : existingGame.Item.buyIn,
            rake: data.rake !== undefined ? data.rake : existingGame.Item.rake,
            startingStack: data.startingStack !== undefined ? data.startingStack : existingGame.Item.startingStack,
            hasGuarantee: data.hasGuarantee !== undefined ? data.hasGuarantee : existingGame.Item.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount !== undefined ? data.guaranteeAmount : existingGame.Item.guaranteeAmount,
            tournamentId: data.tournamentId, registrationStatus: data.registrationStatus, prizepool: data.prizepool,
            totalEntries: data.totalEntries, playersRemaining: data.playersRemaining, totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons, gameTags: data.gameTags, isSatellite: data.isSatellite, isSeries: data.isSeries,
            isRegular: data.isRegular, gameFrequency: data.gameFrequency, seriesName: data.seriesName,
            totalDuration: data.totalDuration, revenueByBuyIns: data.revenueByBuyIns, profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus, guaranteeOverlay: data.guaranteeOverlay, totalRake: data.totalRake,
            doNotScrape: doNotScrape, sourceDataIssue: data.sourceDataIssue || false, gameDataVerified: data.gameDataVerified || false,
            updatedAt: now, _lastChangedAt: Date.now()
        };

        if (processedLevels.length > 0) {
            let structureId = existingGame.Item.tournamentStructureId || crypto.randomUUID();
            updatedGameItem.tournamentStructureId = structureId;
            await ddbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId, name: `${data.name} - Blind Structure`, description: `Blind structure for ${data.name}`,
                    levels: processedLevels, createdAt: now, updatedAt: now, _version: 1, __typename: "TournamentStructure"
                }
            }));
        } else { delete updatedGameItem.tournamentStructureId; }
        
        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: updatedGameItem }));
        savedGameItem = updatedGameItem;
    } else {
        const gameId = crypto.randomUUID();
        let structureId = null;
        if (processedLevels.length > 0) {
            structureId = crypto.randomUUID();
            await ddbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId, name: `${data.name} - Blind Structure`, description: `Blind structure for ${data.name}`,
                    levels: processedLevels, createdAt: now, updatedAt: now, _version: 1, __typename: "TournamentStructure"
                }
            }));
        }
        const authoritativeStart = data.gameStartDateTime ? new Date(data.gameStartDateTime).toISOString() : now;
        const gameItem = {
            id: gameId, name: data.name, entityId: entityId, gameType: data.gameType || 'TOURNAMENT',
            gameStatus: data.gameStatus || 'SCHEDULED', gameVariant: data.gameVariant || 'NLHE',
            gameStartDateTime: authoritativeStart, gameEndDateTime: ensureISODate(data.gameEndDateTime),
            sourceUrl, venueId, venueAssignmentStatus: input.venueAssignmentStatus || (isUnassigned ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED'),
            requiresVenueAssignment: isUnassigned, suggestedVenueName: input.suggestedVenueName || data.venueName || null,
            venueAssignmentConfidence: input.venueAssignmentConfidence || 0, tournamentType: data.tournamentType,
            buyIn: data.buyIn, rake: data.rake || 0, startingStack: data.startingStack, hasGuarantee: data.hasGuarantee,
            guaranteeAmount: data.guaranteeAmount, revenueByBuyIns: data.revenueByBuyIns, profitLoss: data.profitLoss,
            guaranteeSurplus: data.guaranteeSurplus, guaranteeOverlay: data.guaranteeOverlay, totalRake: data.totalRake,
            isSatellite: data.isSatellite, isSeries: data.isSeries, isRegular: data.isRegular, gameFrequency: data.gameFrequency,
            seriesName: data.seriesName, registrationStatus: data.registrationStatus, prizepool: data.prizepool,
            totalEntries: data.totalEntries, playersRemaining: data.playersRemaining, totalRebuys: data.totalRebuys,
            totalAddons: data.totalAddons, totalDuration: data.totalDuration, tournamentId: data.tournamentId,
            gameTags: data.gameTags, doNotScrape: doNotScrape, sourceDataIssue: data.sourceDataIssue || false,
            gameDataVerified: data.gameDataVerified || false, createdAt: now, updatedAt: now, _version: 1, __typename: "Game"
        };
        if (structureId) gameItem.tournamentStructureId = structureId;
        await ddbDocClient.send(new PutCommand({ TableName: gameTable, Item: gameItem }));
        savedGameItem = gameItem;
    }

    const liveStatuses = ['RUNNING', 'REGISTERING'];
    if (savedGameItem && savedGameItem.gameStatus === 'FINISHED' && PLAYER_PROCESSOR_QUEUE_URL) {
        try {
            const sqsPayload = createOptimizedPlayerPayload(savedGameItem, parsedOriginalData, { sourceUrl, venueId, entityId });
            const tournamentId = savedGameItem.tournamentId || (sourceUrl.match(/id=(\d+)/) ? sourceUrl.match(/id=(\d+)/)[1] : savedGameItem.id);
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: PLAYER_PROCESSOR_QUEUE_URL, MessageBody: JSON.stringify(sqsPayload),
                MessageGroupId: String(tournamentId), MessageDeduplicationId: `${tournamentId}-${Date.now()}`
            }));
            console.log(`[handleSave] SQS message sent for ${tournamentId}`);
        } catch (error) { console.error(`[handleSave] SQS failed: ${error.message}`); }
    } else if (savedGameItem && liveStatuses.includes(savedGameItem.gameStatus)) {
        await upsertPlayerEntries(savedGameItem, parsedOriginalData);
    }
    return savedGameItem;
};

/**
 * Restored: Handle Fetch Range with new enhanced fetcher integration.
 */
const handleFetchRange = async (startId, endId, entityId) => {
    console.log(`[handleFetchRange] Processing ${startId} to ${endId}`);
    if (startId > endId || endId - startId + 1 > 100) throw new Error('Invalid range (max 100).');

    const allResults = [];
    const chunkSize = 10;
    // Use provided entityId or default if running manually
    const effectiveEntityId = entityId || DEFAULT_ENTITY_ID;

    for (let i = startId; i <= endId; i += chunkSize) {
        const chunkEnd = Math.min(i + chunkSize - 1, endId);
        const chunkPromises = [];
        for (let j = i; j <= chunkEnd; j++) {
            const url = `https://kingsroom.com.au/tournament/?id=${j}`;
            // Use an async IIFE to allow await for getOrCreateScrapeURL within the loop
            chunkPromises.push((async () => {
                try {
                     // Get record for caching
                     const scrapeURLRecord = await getOrCreateScrapeURL(url, j, effectiveEntityId);
                     // Call enhanced fetcher
                     const result = await handleFetchEnhanced(url, scrapeURLRecord, effectiveEntityId, j, false, ddbDocClient);
                     
                     if (!result.success) throw new Error(result.error);
                     
                     // Scrape the data from the fetched HTML
                     // We need venues/series for accurate scraping, but for range fetch summary 
                     // we might skip perfectly accurate venue matching to save time, 
                     // or we can load them once outside the loop. 
                     // For now, let's do a quick scrape without them for speed in this admin tool,
                     // OR you can pass them if you want full fidelity.
                     // Let's use empty arrays for speed as this is usually just for checking status.
                     const { data } = await scrapeDataFromHtml(result.html, [], [], url);
                     
                     return { ...data, id: j.toString(), rawHtml: null }; // exclude rawHtml from bulk output
                } catch (error) {
                     return { id: j.toString(), error: error.message };
                }
            })());
        }
        const settled = await Promise.allSettled(chunkPromises);
        allResults.push(...settled.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }));
    }
    return allResults;
};

// --- MAIN LAMBDA HANDLER ---
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    await ensureDefaultEntity();
    
    const operationName = event.fieldName || event.arguments?.operation || event.field;
    const jobId = event.arguments?.jobId || null;
    const triggerSource = event.arguments?.triggerSource || null;
    const args = event.arguments || event;
    const entityId = args.entityId || DEFAULT_ENTITY_ID;

    console.log(`[HANDLER] Op: ${operationName}. Job: ${jobId || 'N/A'}, Entity: ${entityId}`);
    
    try {
        switch (operationName) {
            case 'fetchTournamentData':
            case 'FETCH':
                const fetchUrl = args.url;
                if (!fetchUrl) throw new Error('URL required');
                
                const tournamentId = extractTournamentId(fetchUrl);
                const scrapeURLRecord = await getOrCreateScrapeURL(fetchUrl, tournamentId, entityId);
                const fetchResult = await handleFetchEnhanced(fetchUrl, scrapeURLRecord, entityId, tournamentId, args.forceRefresh, ddbDocClient);
                if (!fetchResult.success) throw new Error(fetchResult.error || 'Fetch failed');

                const [venues, seriesTitles] = await Promise.all([getAllVenues(), getAllSeriesTitles()]);
                // NOW AWAITING the async scrapeDataFromHtml
                const { data: scrapedData, foundKeys } = await scrapeDataFromHtml(fetchResult.html, venues, seriesTitles, fetchUrl);

                return {
                    ...scrapedData, rawHtml: fetchResult.html, s3Key: fetchResult.s3Key,
                    source: fetchResult.source, contentHash: fetchResult.contentHash,
                    fetchedAt: new Date().toISOString(),
                    doNotScrape: scrapedData.doNotScrape || false,
                    gameStatus: scrapedData.gameStatus || 'UNKNOWN'
                };

            case 'saveTournamentData':
            case 'SAVE':
                return await handleSave(args.input || {
                    sourceUrl: args.sourceUrl, venueId: args.venueId, existingGameId: args.existingGameId,
                    doNotScrape: args.doNotScrape, data: args.scrapedData || args.data,
                    originalScrapedData: args.originalScrapedData, jobId: jobId,
                    triggerSource: triggerSource, entityId: args.entityId
                });
                
            case 'fetchTournamentDataRange':
                // Pass entityId to handleFetchRange
                return await handleFetchRange(args.startId, args.endId, entityId);
                
            default:
                throw new Error(`Unknown operation: ${operationName}.`);
        }
    } catch (error) {
        console.error('[HANDLER] CRITICAL Error:', error);
        return { errorMessage: error.message || 'Internal Lambda Error' };
    }
};