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
// ✅ NEW: S3 Client for downloading cached HTML
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');
// --- End Lambda Monitoring ---

// Import the refactored modules
const { enhancedHandleFetch } = require('./enhanced-handleFetch');
const { runScraper, getTournamentId, getStatusAndReg } = require('./scraperStrategies');
const { updateS3StorageWithParsedData } = require('./update-s3storage-with-parsed-data');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// DEFAULT ENTITY - Replace with your actual default entity ID
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0"; 

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client); // Original client
const sqsClient = new SQSClient({});
// ✅ NEW: S3 Client for cache operations
const s3Client = new S3Client({});
const S3_BUCKET = process.env.S3_BUCKET || 'pokerpro-scraper-storage';

// --- Lambda Monitoring Initialization ---
// Initialize monitoring for this function
const monitoring = new LambdaMonitoring('webScraperFunction', DEFAULT_ENTITY_ID);
// Wrap the DynamoDB client to automatically track operations
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
// --- End Lambda Monitoring ---

// --- Entity Helper Functions ---
const getEntityIdFromUrl = async (url) => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const entityTable = getTableName('Entity');
        const scanResult = await monitoredDdbDocClient.send(new ScanCommand({
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
        const getResult = await monitoredDdbDocClient.send(new GetCommand({
            TableName: entityTable, Key: { id: entityId }
        }));
        if (!getResult.Item) {
            // ✅ Track business logic: Creating the default entity
            monitoring.trackOperation('DEFAULT_ENTITY_CREATE', 'Entity', entityId);
            const now = new Date().toISOString();
            const timestamp = Date.now();
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: entityTable,
                Item: {
                    id: entityId, 
                    entityName: 'Default Entity', 
                    gameUrlDomain: 'default.com',
                    gameUrlPath: '/', 
                    isActive: true, 
                    createdAt: now, 
                    updatedAt: now,
                    _version: 1, 
                    _lastChangedAt: timestamp,
                    __typename: 'Entity'
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
        'S3Storage': process.env.API_KINGSROOM_S3STORAGETABLE_NAME,
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
        const response = await monitoredDdbDocClient.send(command);
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
        const response = await monitoredDdbDocClient.send(command);
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
    const timestamp = Date.now();
    const gameStartDateTime = ensureISODate(gameData.gameStartDateTime);
    const gameDateObj = new Date(gameStartDateTime);

    try {
        const getResult = await monitoredDdbDocClient.send(new GetCommand({
            TableName: playerTable, Key: { id: playerId }
        }));
        const existingPlayer = getResult.Item;

        if (existingPlayer) {
            const currentRegDate = new Date(existingPlayer.registrationDate);
            const currentLastPlayed = new Date(existingPlayer.lastPlayedDate || existingPlayer.registrationDate);
            let updateExpression = 'SET updatedAt = :now, #lca = :timestamp';
            let expressionNames = { '#lca': '_lastChangedAt' }; 
            let expressionValues = { ':now': now, ':timestamp': timestamp };
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
                monitoring.trackOperation('UPSERT_LEAN_PLAYER', 'Player', playerId, { status: 'UPDATE_EXISTING' });
                await monitoredDdbDocClient.send(new UpdateCommand({
                    TableName: playerTable, Key: { id: playerId },
                    UpdateExpression: updateExpression,
                    ExpressionAttributeNames: expressionNames,
                    ExpressionAttributeValues: expressionValues
                }));
            }
        } else {
            monitoring.trackOperation('UPSERT_LEAN_PLAYER', 'Player', playerId, { status: 'CREATE_NEW', name: playerName });
            const nameParts = parsePlayerName(playerName);
            const canAssignVenue = gameData.venueId && gameData.venueId !== UNASSIGNED_VENUE_ID;
            const newPlayer = {
                id: playerId, firstName: nameParts.firstName, lastName: nameParts.lastName,
                givenName: nameParts.givenName, registrationDate: gameStartDateTime,
                firstGamePlayed: gameStartDateTime, lastPlayedDate: gameStartDateTime,
                registrationVenueId: canAssignVenue ? gameData.venueId : null,
                creditBalance: 0, pointsBalance: 0, status: 'ACTIVE', category: 'NEW',
                targetingClassification: 'NotPlayed', createdAt: now, updatedAt: now,
                _version: 1, _lastChangedAt: timestamp, __typename: 'Player'
            };
            await monitoredDdbDocClient.send(new PutCommand({
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
    const timestamp = Date.now();
    const { allPlayers } = extractPlayerDataForProcessing(scrapedData);
    if (allPlayers.length === 0) return;
    
    monitoring.trackOperation('UPSERT_PLAYER_ENTRIES_START', 'PlayerEntry', savedGameItem.id, { gameId: savedGameItem.id, playerCount: allPlayers.length });

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
            _version: 1, _lastChangedAt: timestamp, __typename: 'PlayerEntry',
            createdAt: now, updatedAt: now
        };
        await monitoredDdbDocClient.send(new PutCommand({ TableName: playerEntryTable, Item: playerEntry }));
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
 * Process structure fingerprint for detecting new scraping patterns
 */
const processStructureFingerprint = async (foundKeys, structureLabel, sourceUrl) => {
    if (!foundKeys || foundKeys.length === 0) return { isNewStructure: false, structureLabel: structureLabel };
    foundKeys.sort();
    const structureString = foundKeys.join(',');
    const structureId = crypto.createHash('sha256').update(structureString).digest('hex');
    const structureTable = getTableName('ScrapeStructure');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        const getResponse = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: structureTable, KeyConditionExpression: 'id = :id', ExpressionAttributeValues: { ':id': structureId }
        }));
        const isNew = getResponse.Items.length === 0;
        if (isNew) {
            monitoring.trackOperation('FINGERPRINT_NEW', 'ScrapeStructure', structureId, { structureLabel, sourceUrl });
            console.log(`Saving new structure fingerprint: ${structureId}`);
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId, fields: foundKeys, structureLabel: structureLabel,
                    occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now, exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure", createdAt: now, updatedAt: now, 
                    _version: 1, _lastChangedAt: timestamp
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: structureTable, Key: { id: structureId },
                UpdateExpression: 'SET lastSeenAt = :now, occurrenceCount = occurrenceCount + :inc, updatedAt = :now, #lca = :timestamp',
                ExpressionAttributeNames: {
                    '#lca': '_lastChangedAt'
                },
                ExpressionAttributeValues: { ':now': now, ':inc': 1, ':timestamp': timestamp }
            }));
            return { isNewStructure: false, structureLabel: structureLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return { isNewStructure: false, structureLabel };
    }
};

/**
 * Find existing Game by sourceUrl
 */
const findGameBySourceUrl = async (sourceUrl, entityId) => {
    const gameTable = getTableName('Game');
    console.log(`[findGameBySourceUrl] Looking for existing game with sourceUrl: ${sourceUrl}`);
    
    try {
        const params = {
            TableName: gameTable,
            IndexName: 'bySourceUrl',
            KeyConditionExpression: 'sourceUrl = :url',
            ExpressionAttributeValues: {
                ':url': sourceUrl
            }
        };
        
        const response = await monitoredDdbDocClient.send(new QueryCommand(params));
        
        if (response.Items && response.Items.length > 0) {
            const matchingGames = response.Items.filter(game => 
                !game._deleted && game.entityId === entityId
            );
            
            if (matchingGames.length > 0) {
                console.log(`[findGameBySourceUrl] Found existing game: ${matchingGames[0].id}`);
                return matchingGames[0];
            }
        }
        
        return null;
    } catch (error) {
        console.error(`[findGameBySourceUrl] Error: ${error.message}`);
        return null;
    }
};

/**
 * Create ScrapeAttempt record
 */
const createScrapeAttempt = async (data) => {
    const scrapeAttemptTable = getTableName('ScrapeAttempt');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    const scrapeAttempt = {
        id: crypto.randomUUID(),
        url: data.url,
        tournamentId: data.tournamentId,
        attemptTime: now,
        scraperJobId: data.scraperJobId || 'manual-scrape',
        scrapeURLId: data.scrapeURLId || data.url,
        status: data.status,
        processingTime: data.processingTime || 0,
        gameName: data.gameName || null,
        gameStatus: data.gameStatus || null,
        registrationStatus: data.registrationStatus || null,
        dataHash: data.dataHash || null,
        hasChanges: data.hasChanges || false,
        errorMessage: data.errorMessage || null,
        errorType: data.errorType || null,
        gameId: data.gameId || null,
        wasNewGame: data.wasNewGame || false,
        fieldsUpdated: data.fieldsUpdated || [],
        foundKeys: data.foundKeys || [],
        structureLabel: data.structureLabel || null,
        createdAt: now,
        updatedAt: now,
        __typename: 'ScrapeAttempt',
        _version: 1,
        _lastChangedAt: timestamp
    };
    
    try {
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: scrapeAttemptTable,
            Item: scrapeAttempt
        }));
        
        console.log(`[createScrapeAttempt] Created ScrapeAttempt: ${scrapeAttempt.id}`);
        return scrapeAttempt;
    } catch (error) {
        console.error(`[createScrapeAttempt] Error: ${error.message}`);
        return null;
    }
};

/**
 * Get or create ScrapeURL record
 */
const getOrCreateScrapeURL = async (url, tournamentId, entityId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    try {
        const response = await monitoredDdbDocClient.send(new GetCommand({ 
            TableName: scrapeURLTable, 
            Key: { id: url } 
        }));
        
        if (response.Item) {
            // Check if we need to update the doNotScrape status based on game status
            const gameTable = getTableName('Game');
            const gameResponse = await monitoredDdbDocClient.send(new QueryCommand({
                TableName: gameTable,
                IndexName: 'bySourceUrl',
                KeyConditionExpression: 'sourceUrl = :url',
                ExpressionAttributeValues: { ':url': url },
                Limit: 1
            }));
            
            if (gameResponse.Items && gameResponse.Items.length > 0) {
                const game = gameResponse.Items[0];
                const shouldNotScrape = game.gameStatus === 'NOT_PUBLISHED' || 
                                       game.gameStatus === 'NOT_IN_USE' ||
                                       game.doNotScrape === true;
                
                // Update ScrapeURL if doNotScrape status has changed
                if (response.Item.doNotScrape !== shouldNotScrape) {
                    console.log(`[ScrapeURL] Updating doNotScrape from ${response.Item.doNotScrape} to ${shouldNotScrape}`);
                    await monitoredDdbDocClient.send(new UpdateCommand({
                        TableName: scrapeURLTable,
                        Key: { id: url },
                        UpdateExpression: 'SET doNotScrape = :dns, gameStatus = :gs, updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':dns': shouldNotScrape,
                            ':gs': game.gameStatus,
                            ':now': new Date().toISOString()
                        }
                    }));
                    response.Item.doNotScrape = shouldNotScrape;
                    response.Item.gameStatus = game.gameStatus;
                }
            }
            
            return response.Item;
        }
        
        // Create new record if doesn't exist
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        const newRecord = {
            id: url, 
            url, 
            tournamentId: parseInt(tournamentId, 10), 
            entityId: entityId || DEFAULT_ENTITY_ID,
            status: 'ACTIVE', 
            doNotScrape: false, // Will be updated after first scrape if needed
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
            _version: 1,
            _lastChangedAt: timestamp,
            _deleted: null
        };
        
        await monitoredDdbDocClient.send(new PutCommand({ 
            TableName: scrapeURLTable, 
            Item: newRecord 
        }));
        
        return newRecord;
    } catch (error) {
        console.error('[getOrCreateScrapeURL] Error:', error);
        return { 
            id: url, 
            tournamentId: parseInt(tournamentId, 10), 
            s3StorageEnabled: false,
            doNotScrape: false
        };
    }
};

/**
 * Scrape data from HTML
 */
const scrapeDataFromHtml = async (html, venues, seriesTitles, url, forceRefresh = false) => {
    // Pass forceRefresh parameter to runScraper
    const { data, foundKeys } = runScraper(html, null, venues, seriesTitles, url, forceRefresh);
    
    // Ensure tournamentId is always set
    if (!data.tournamentId) {
        data.tournamentId = getTournamentId(url);
    }
    
    if (!data.structureLabel) {
        data.structureLabel = `STATUS: ${data.gameStatus || 'UNKNOWN'} | REG: ${data.registrationStatus || 'UNKNOWN'}`;
    }
    if (!foundKeys.includes('structureLabel')) foundKeys.push('structureLabel');

    // Apply fingerprinting
    const { isNewStructure } = await processStructureFingerprint(foundKeys, data.structureLabel, url);
    data.isNewStructure = isNewStructure;

    console.log(`[DEBUG-SCRAPER] Scraped status: ${data.gameStatus}, doNotScrape: ${data.doNotScrape}, tournamentId: ${data.tournamentId}, forceRefresh: ${forceRefresh}`);
    return { data, foundKeys };
};

// ✅ NEW: Helper function to download HTML from S3
/**
 * Downloads HTML content from S3 given an s3Key
 * @param {string} s3Key - The S3 object key
 * @returns {Promise<string>} The HTML content
 */
const downloadHtmlFromS3 = async (s3Key) => {
    console.log(`[S3_CACHE] Downloading HTML from S3: ${s3Key}`);
    
    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key
        });
        
        const response = await s3Client.send(command);
        
        // Convert stream to string
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const html = Buffer.concat(chunks).toString('utf8');
        
        console.log(`[S3_CACHE] Downloaded ${html.length} bytes of HTML from S3`);
        return html;
        
    } catch (error) {
        console.error(`[S3_CACHE] Error downloading from S3:`, error);
        throw new Error(`Failed to download HTML from S3: ${error.message}`);
    }
};

// --- ENHANCEMENT: New function to link S3Storage to Game ---
/**
 * Finds the S3Storage record by URL and updates it with the gameId
 */
const updateS3StorageWithGameId = async (sourceUrl, gameId) => {
    const s3StorageTable = getTableName('S3Storage');
    console.log(`[updateS3Storage] Attempting to link Game ${gameId} to S3Storage records for ${sourceUrl}`);
    
    try {
        // Find S3Storage records by URL using the 'byURL' index
        const queryCommand = new QueryCommand({
            TableName: s3StorageTable,
            IndexName: 'byURL', // Use the 'byURL' index from schema.graphql
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': sourceUrl },
            // Get the latest one first in case there are multiple
            ScanIndexForward: false, 
            Limit: 1 
        });
        
        const response = await monitoredDdbDocClient.send(queryCommand);
        
        if (response.Items && response.Items.length > 0) {
            const latestS3Record = response.Items[0];
            
            // Only update if it's not already set
            if (latestS3Record.gameId !== gameId) {
                console.log(`[updateS3Storage] Found record ${latestS3Record.id}. Updating gameId to ${gameId}.`);
                
                const updateCommand = new UpdateCommand({
                    TableName: s3StorageTable,
                    Key: { id: latestS3Record.id }, // Use the primary key 'id'
                    UpdateExpression: 'SET #gameId = :gameId, #dataExtracted = :true, #updatedAt = :now, #lca = :lca, #v = if_not_exists(#v, :zero) + :one',
                    ExpressionAttributeNames: {
                        '#gameId': 'gameId',
                        '#dataExtracted': 'dataExtracted',
                        '#updatedAt': 'updatedAt',
                        '#lca': '_lastChangedAt',
                        '#v': '_version'
                    },
                    ExpressionAttributeValues: {
                        ':gameId': gameId,
                        ':true': true,
                        ':now': new Date().toISOString(),
                        ':lca': Date.now(),
                        ':zero': 0,
                        ':one': 1
                    }
                });
                
                await monitoredDdbDocClient.send(updateCommand);
                console.log(`[updateS3Storage] Successfully linked S3 record ${latestS3Record.id} to Game ${gameId}.`);
            } else {
                console.log(`[updateS3Storage] Record ${latestS3Record.id} already linked to Game ${gameId}.`);
            }
        } else {
            console.warn(`[updateS3Storage] No S3Storage record found for URL: ${sourceUrl}`);
        }
    } catch (error) {
        console.error(`[updateS3Storage] Error linking S3 record to game: ${error.message}`);
        // Do not throw, as this is a non-critical update
    }
};

/**
 * Complete unabridged handleSave function with UPSERT logic and ScrapeAttempt tracking
 */
const handleSave = async (sourceUrl, venueId, data, existingGameId, doNotScrape = false, entityId, scraperJobId = null) => {
    const startTime = Date.now(); // Track processing time
    const effectiveEntityId = entityId || DEFAULT_ENTITY_ID;
    const gameTable = getTableName('Game');
    const structureTable = getTableName('TournamentStructure');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    console.log(`[handleSave] Starting save for ${sourceUrl}`);
    console.log(`[handleSave] Input - existingGameId: ${existingGameId}, entityId: ${effectiveEntityId}`);
    
    let fieldsUpdated = [];
    let wasNewGame = false;
    
    let parsedData;
    try {
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
        console.error('[handleSave] Failed to parse data:', error);
        parsedData = {};
    }
    
    const tournamentId = parsedData.tournamentId || getTournamentId(sourceUrl);
    
    if (!existingGameId) {
        console.log(`[handleSave] No existingGameId provided, checking for game by sourceUrl`);
        const existingGame = await findGameBySourceUrl(sourceUrl, effectiveEntityId);
        if (existingGame) {
            console.log(`[handleSave] Found existing game by sourceUrl: ${existingGame.id}`);
            existingGameId = existingGame.id;
        } else {
            console.log(`[handleSave] No existing game found for sourceUrl: ${sourceUrl}`);
        }
    }
    
    const processedLevels = [];
    if (parsedData.levels && Array.isArray(parsedData.levels)) {
        parsedData.levels.forEach(level => {
            if (level && level.levelNumber !== undefined) {
                processedLevels.push({
                    levelNumber: level.levelNumber,
                    durationMinutes: level.durationMinutes || 0,
                    smallBlind: level.smallBlind || 0,
                    bigBlind: level.bigBlind || 0,
                    ante: level.ante || null,
                    breakMinutes: level.breakMinutes || null
                });
            }
        });
    }
    
    let venueAssignmentStatus = 'PENDING_ASSIGNMENT';
    if (venueId) {
        venueAssignmentStatus = 'MANUALLY_ASSIGNED';
    } else if (parsedData.venueMatch?.autoAssignedVenue?.id) {
        venueAssignmentStatus = 'AUTO_ASSIGNED';
        venueId = venueId || parsedData.venueMatch.autoAssignedVenue.id;
    }
    
    const isUnassigned = !venueId;
    
    const ensureISODate = (dateValue) => {
        if (!dateValue) return null;
        try {
            return new Date(dateValue).toISOString();
        } catch (e) {
            return null;
        }
    };
    
    let savedGameItem = null;
    
    if (existingGameId) {
        // ========================================
        // UPDATE EXISTING GAME
        // ========================================
        wasNewGame = false;
        console.log(`[handleSave] Updating existing game: ${existingGameId}`);
        
        monitoring.trackOperation('HANDLE_SAVE_UPDATE', 'Game', existingGameId, { sourceUrl, name: parsedData.name });
        
        const existingGameResponse = await monitoredDdbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: existingGameId }
        }));
        
        const existingGame = existingGameResponse.Item;
        if (!existingGame) {
            throw new Error(`Game ${existingGameId} not found`);
        }
        
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        updateExpressions.push('#updatedAt = :updatedAt');
        updateExpressions.push('#lca = :lca');
        updateExpressions.push('#version = if_not_exists(#version, :zero) + :one');
        
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeNames['#lca'] = '_lastChangedAt';
        expressionAttributeNames['#version'] = '_version';
        
        expressionAttributeValues[':updatedAt'] = now;
        expressionAttributeValues[':lca'] = timestamp;
        expressionAttributeValues[':zero'] = 0;
        expressionAttributeValues[':one'] = 1;
        
        const updateFields = {
            name: parsedData.name,
            gameStatus: parsedData.gameStatus,
            registrationStatus: parsedData.registrationStatus,
            gameEndDateTime: ensureISODate(parsedData.gameEndDateTime),
            prizepool: parsedData.prizepool,
            totalEntries: parsedData.totalEntries,
            playersRemaining: parsedData.playersRemaining,
            totalRebuys: parsedData.totalRebuys,
            totalAddons: parsedData.totalAddons,
            totalDuration: parsedData.totalDuration,
            gameTags: parsedData.gameTags,
            venueId: venueId,
            venueAssignmentStatus: venueAssignmentStatus,
            requiresVenueAssignment: isUnassigned,
            suggestedVenueName: parsedData.venueName || null,
            venueAssignmentConfidence: parsedData.venueMatch?.suggestions?.[0]?.score || 0,
            doNotScrape: doNotScrape,
            totalRake: parsedData.totalRake,
            revenueByBuyIns: parsedData.revenueByBuyIns,
            profitLoss: parsedData.profitLoss,
            guaranteeSurplus: parsedData.guaranteeSurplus,
            guaranteeOverlay: parsedData.guaranteeOverlay
        };
        
        Object.entries(updateFields).forEach(([field, newValue]) => {
            if (newValue !== undefined && newValue !== existingGame[field]) {
                updateExpressions.push(`#${field} = :${field}`);
                expressionAttributeNames[`#${field}`] = field;
                expressionAttributeValues[`:${field}`] = newValue;
                fieldsUpdated.push(field);
            }
        });
        
        if (processedLevels.length > 0 && existingGame.tournamentStructureId) {
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: structureTable,
                Key: { id: existingGame.tournamentStructureId },
                UpdateExpression: 'SET #levels = :levels, #updatedAt = :updatedAt, #lca = :lca',
                ExpressionAttributeNames: {
                    '#levels': 'levels',
                    '#updatedAt': 'updatedAt',
                    '#lca': '_lastChangedAt'
                },
                ExpressionAttributeValues: {
                    ':levels': processedLevels,
                    ':updatedAt': now,
                    ':lca': timestamp
                }
            }));
        } else if (processedLevels.length > 0 && !existingGame.tournamentStructureId) {
            const structureId = crypto.randomUUID();
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId,
                    name: `${parsedData.name} - Blind Structure`,
                    description: `Blind structure for ${parsedData.name}`,
                    levels: processedLevels,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: "TournamentStructure"
                }
            }));
            
            updateExpressions.push('#tournamentStructureId = :tournamentStructureId');
            expressionAttributeNames['#tournamentStructureId'] = 'tournamentStructureId';
            expressionAttributeValues[':tournamentStructureId'] = structureId;
            fieldsUpdated.push('tournamentStructureId');
        }
        
        if (updateExpressions.length > 3) { 
            const updateCommand = {
                TableName: gameTable,
                Key: { id: existingGameId },
                UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW'
            };
            
            const updateResult = await monitoredDdbDocClient.send(new UpdateCommand(updateCommand));
            savedGameItem = updateResult.Attributes;
            
            console.log(`[handleSave] Updated game ${existingGameId}, fields changed: ${fieldsUpdated.join(', ')}`);
        } else {
            savedGameItem = existingGame;
            console.log(`[handleSave] No changes detected for game ${existingGameId}`);
        }
        
    } else {
        // ========================================
        // CREATE NEW GAME
        // ========================================
        wasNewGame = true;
        const gameId = crypto.randomUUID();
        
        console.log(`[handleSave] Creating new game: ${gameId}`);
        
        monitoring.trackOperation('HANDLE_SAVE_CREATE', 'Game', gameId, { sourceUrl, name: parsedData.name });
        
        let structureId = null;
        if (processedLevels.length > 0) {
            structureId = crypto.randomUUID();
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId,
                    name: `${parsedData.name} - Blind Structure`,
                    description: `Blind structure for ${parsedData.name}`,
                    levels: processedLevels,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: "TournamentStructure"
                }
            }));
        }
        
        const authoritativeStart = parsedData.gameStartDateTime ? 
            new Date(parsedData.gameStartDateTime).toISOString() : now;
        
        const gameItem = {
            id: gameId,
            name: parsedData.name || `Tournament ${tournamentId}`,
            entityId: effectiveEntityId,
            sourceUrl: sourceUrl, 
            gameType: parsedData.gameType || 'TOURNAMENT',
            gameStatus: parsedData.gameStatus || 'SCHEDULED',
            gameVariant: parsedData.gameVariant || 'NLHE',
            gameStartDateTime: authoritativeStart,
            gameEndDateTime: ensureISODate(parsedData.gameEndDateTime),
            venueId: venueId || null,
            venueAssignmentStatus: venueAssignmentStatus,
            requiresVenueAssignment: isUnassigned,
            suggestedVenueName: parsedData.venueName || null,
            venueAssignmentConfidence: parsedData.venueMatch?.suggestions?.[0]?.score || 0,
            tournamentType: parsedData.tournamentType || null,
            buyIn: parsedData.buyIn || 0,
            rake: parsedData.rake || 0,
            startingStack: parsedData.startingStack || 0,
            hasGuarantee: parsedData.hasGuarantee || false,
            guaranteeAmount: parsedData.guaranteeAmount || 0,
            revenueByBuyIns: parsedData.revenueByBuyIns || null,
            profitLoss: parsedData.profitLoss || null,
            guaranteeSurplus: parsedData.guaranteeSurplus || null,
            guaranteeOverlay: parsedData.guaranteeOverlay || null,
            totalRake: parsedData.totalRake || null,
            isSatellite: parsedData.isSatellite || false,
            isSeries: parsedData.isSeries || false,
            isRegular: parsedData.isRegular || false,
            gameFrequency: parsedData.gameFrequency || null,
            seriesName: parsedData.seriesName || null,
            registrationStatus: parsedData.registrationStatus || null,
            prizepool: parsedData.prizepool || 0,
            totalEntries: parsedData.totalEntries || 0,
            playersRemaining: parsedData.playersRemaining || null,
            totalRebuys: parsedData.totalRebuys || 0,
            totalAddons: parsedData.totalAddons || 0,
            totalDuration: parsedData.totalDuration || null,
            tournamentId: tournamentId,
            gameTags: parsedData.gameTags || [],
            doNotScrape: doNotScrape,
            sourceDataIssue: parsedData.sourceDataIssue || false,
            gameDataVerified: parsedData.gameDataVerified || false,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: timestamp,
            __typename: "Game"
        };
        
        if (structureId) {
            gameItem.tournamentStructureId = structureId;
        }
        
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: gameTable,
            Item: gameItem
        }));
        
        savedGameItem = gameItem;
        fieldsUpdated = Object.keys(gameItem).filter(key => !key.startsWith('_') && key !== '__typename');
        
        console.log(`[handleSave] Created new game ${gameId}`);
    }
    
    // --- ENHANCEMENT: Update S3Storage record with this gameId ---
    if (savedGameItem && savedGameItem.id && sourceUrl) {
        await updateS3StorageWithGameId(sourceUrl, savedGameItem.id);
    }
    
    // ✅ Create ScrapeAttempt record for audit trail
    const processingTime = Date.now() - startTime;
    const dataHash = crypto.createHash('sha256').update(JSON.stringify(parsedData)).digest('hex');
    
    await createScrapeAttempt({
        url: sourceUrl,
        tournamentId: tournamentId,
        scraperJobId: scraperJobId || 'manual-save',
        scrapeURLId: sourceUrl,
        status: 'SUCCESS',
        processingTime: processingTime,
        gameName: parsedData.name,
        gameStatus: parsedData.gameStatus,
        registrationStatus: parsedData.registrationStatus,
        dataHash: dataHash,
        hasChanges: fieldsUpdated.length > 0,
        gameId: savedGameItem.id,
        wasNewGame: wasNewGame,
        fieldsUpdated: fieldsUpdated,
        foundKeys: parsedData.foundKeys || [],
        structureLabel: parsedData.structureLabel || null
    });
    
    console.log(`[handleSave] Created ScrapeAttempt - wasNewGame: ${wasNewGame}, fieldsUpdated: ${fieldsUpdated.length}`);
    
    // Handle player processing based on game status
    const liveStatuses = ['RUNNING', 'REGISTERING'];
    
    if (savedGameItem && savedGameItem.gameStatus === 'FINISHED' && PLAYER_PROCESSOR_QUEUE_URL) {
        try {
            monitoring.trackOperation('SQS_SEND_START', 'PlayerProcessor', savedGameItem.id, { 
                tournamentId, 
                gameStatus: 'FINISHED' 
            });
            
            const sqsPayload = createOptimizedPlayerPayload(savedGameItem, parsedData, { 
                sourceUrl, 
                venueId, 
                entityId: effectiveEntityId 
            });
            
            await sqsClient.send(new SendMessageCommand({
                QueueUrl: PLAYER_PROCESSOR_QUEUE_URL,
                MessageBody: JSON.stringify(sqsPayload),
                MessageGroupId: String(tournamentId),
                MessageDeduplicationId: `${tournamentId}-${Date.now()}`
            }));
            
            console.log(`[handleSave] SQS message sent for finished tournament ${tournamentId}`);
        } catch (error) {
            console.error(`[handleSave] SQS failed: ${error.message}`);
        }
    } else if (savedGameItem && liveStatuses.includes(savedGameItem.gameStatus)) {
        monitoring.trackOperation('UPSERT_ENTRIES_START', 'PlayerEntry', savedGameItem.id, { 
            gameStatus: savedGameItem.gameStatus 
        });
        await upsertPlayerEntries(savedGameItem, parsedData);
    }
    
    return savedGameItem;
};

/**
 * Handle Fetch Range
 */
const handleFetchRange = async (startId, endId, entityId) => {
    monitoring.trackOperation('FETCH_RANGE_START', 'Game', `${startId}-${endId}`, { entityId });
    console.log(`[handleFetchRange] Processing ${startId} to ${endId}`);
    if (startId > endId || endId - startId + 1 > 100) throw new Error('Invalid range (max 100).');

    const allResults = [];
    const chunkSize = 10;
    const effectiveEntityId = entityId || DEFAULT_ENTITY_ID;

    for (let i = startId; i <= endId; i += chunkSize) {
        const chunkEnd = Math.min(i + chunkSize - 1, endId);
        const chunkPromises = [];
        for (let j = i; j <= chunkEnd; j++) {
            const url = `https://kingsroom.com.au/tournament/?id=${j}`;
            chunkPromises.push((async () => {
                try {
                    const scrapeURLRecord = await getOrCreateScrapeURL(url, j, effectiveEntityId);
                    const result = await enhancedHandleFetch(url, scrapeURLRecord, effectiveEntityId, j, false, monitoredDdbDocClient);
                    
                    if (!result.success) throw new Error(result.error);
                    
                    const { data } = await scrapeDataFromHtml(result.html, [], [], url);
                    
                    return { ...data, id: j.toString(), rawHtml: null };
                } catch (error) {
                    return { id: j.toString(), error: error.message };
                }
            })());
        }
        const settled = await Promise.allSettled(chunkPromises);
        allResults.push(...settled.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }));
    }
    
    monitoring.trackOperation('FETCH_RANGE_COMPLETE', 'Game', `${startId}-${endId}`, { resultsCount: allResults.length, entityId });
    return allResults;
};

// --- MAIN LAMBDA HANDLER ---
exports.handler = async (event) => {
    console.log('[HANDLER] Incoming event:', JSON.stringify(event, null, 2));
    
    let entityId = DEFAULT_ENTITY_ID;
    let jobId = null;
    let triggerSource = 'MANUAL';
    
    const operationName = event.fieldName || event.operationType || event.operation || 'fetchTournamentData';
    const args = event.arguments || event || {};
    
    if (args.jobId) jobId = args.jobId;
    if (args.triggerSource) triggerSource = args.triggerSource;
    
    await ensureDefaultEntity();
    
    try {
        if (operationName === 'fetchTournamentData' || operationName === 'FETCH') {
            const url = args.url;
            if (url) {
                const urlEntityId = await getEntityIdFromUrl(url);
                if (urlEntityId) entityId = urlEntityId;
            }
        }
        
        entityId = args.entityId || DEFAULT_ENTITY_ID;
        
        monitoring.entityId = entityId; 
        
        monitoring.trackOperation('HANDLER_START', 'Handler', operationName, { entityId, jobId, triggerSource });
        console.log(`[HANDLER] Op: ${operationName}. Job: ${jobId || 'N/A'}, Entity: ${entityId}`);
        
        try {
            switch (operationName) {
                case 'fetchTournamentData':
                case 'FETCH':
                    const fetchUrl = args.url;
                    const s3KeyParam = args.s3Key; // ✅ NEW: Accept s3Key parameter
                    
                    // ✅ NEW: Handle S3 cache scenario
                    if (s3KeyParam) {
                        console.log(`[FETCH] 🔒 S3 CACHE MODE - Using cached HTML`);
                        console.log(`[FETCH] 🔒 S3 key: ${s3KeyParam}`);
                        console.log(`[FETCH] 🔒 This path should NEVER create new S3 files`);
                        
                        monitoring.trackOperation('FETCH_FROM_CACHE', 'Game', 'cached', { 
                            s3Key: s3KeyParam, 
                            entityId 
                        });
                        
                        try {
                            // Download HTML from S3
                            const cachedHtml = await downloadHtmlFromS3(s3KeyParam);
                            
                            // Get venues and series titles for parsing
                            const [venues, seriesTitles] = await Promise.all([
                                getAllVenues(), 
                                getAllSeriesTitles()
                            ]);
                            
                            // Parse using existing scrapeDataFromHtml function
                            const { data: scrapedData, foundKeys } = await scrapeDataFromHtml(
                                cachedHtml,
                                venues,
                                seriesTitles,
                                fetchUrl || 'cached',
                                false
                            );
                            
                            // Get S3Storage metadata
                            let s3StorageRecord = null;
                            try {
                                const s3StorageTable = getTableName('S3Storage');
                                const queryCommand = new QueryCommand({
                                    TableName: s3StorageTable,
                                    IndexName: 'byS3Key',
                                    KeyConditionExpression: 's3Key = :key',
                                    ExpressionAttributeValues: { ':key': s3KeyParam },
                                    Limit: 1
                                });
                                const result = await monitoredDdbDocClient.send(queryCommand);
                                s3StorageRecord = result.Items?.[0];
                                
                                if (!s3StorageRecord) {
                                    console.warn('[FETCH] ⚠️ No S3Storage record found for s3Key:', s3KeyParam);
                                }
                            } catch (metadataError) {
                                console.warn('[FETCH] Could not fetch S3Storage metadata:', metadataError.message);
                            }
                            
                            // Build response with S3_CACHE source
                            const result = {
                                tournamentId: scrapedData.tournamentId || s3StorageRecord?.tournamentId || 1,
                                name: scrapedData.name || 'Unnamed Tournament',
                                gameStatus: scrapedData.gameStatus || 'SCHEDULED',
                                hasGuarantee: scrapedData.hasGuarantee || false,
                                doNotScrape: scrapedData.doNotScrape || false,
                                s3Key: s3KeyParam,
                                ...scrapedData,
                                source: 'S3_CACHE',
                                sourceUrl: s3StorageRecord?.url || fetchUrl || null,  // ✅ null not ''
                                reScrapedAt: new Date().toISOString(),
                                contentHash: s3StorageRecord?.contentHash || null,
                                entityId: entityId || s3StorageRecord?.entityId || DEFAULT_ENTITY_ID
                            };
                            
                            // ✅ NEW: Update S3Storage with parsed data (even if HTML unchanged)
                            // This captures improvements from evolved scraper strategies
                            try {
                                const s3StorageTable = getTableName('S3Storage');
                                const updateResult = await updateS3StorageWithParsedData(
                                    s3KeyParam,
                                    scrapedData,
                                    foundKeys,
                                    monitoredDdbDocClient,
                                    s3StorageTable,
                                    true, // isRescrape = true (from cache)
                                    s3StorageRecord?.url || fetchUrl, // URL for fallback lookup
                                    scrapedData.tournamentId || s3StorageRecord?.tournamentId, // tournamentId for primary lookup
                                    entityId || s3StorageRecord?.entityId // entityId for primary lookup
                                );
                                
                                console.log(`[FETCH] S3Storage update result:`, {
                                    source: 'S3_CACHE',
                                    dataChanged: updateResult.dataChanged,
                                    gameStatus: updateResult.gameStatus,
                                    registrationStatus: updateResult.registrationStatus,
                                    fieldsExtracted: updateResult.extractedFields?.length
                                });
                                
                                // Add update info to result
                                result.s3StorageUpdated = updateResult.success;
                                result.dataChanged = updateResult.dataChanged;
                                
                            } catch (s3UpdateError) {
                                console.warn('[FETCH] Failed to update S3Storage with parsed data:', s3UpdateError.message);
                                // Don't fail the whole operation if S3Storage update fails
                            }
                            
                            console.log(`[FETCH] ✅ Successfully parsed cached HTML for tournament ${result.tournamentId}`);
                            console.log(`[FETCH] ✅ NO NEW S3 FILE CREATED (cache mode)`);
                            
                            monitoring.trackOperation('CACHE_PARSE_SUCCESS', 'Game', result.tournamentId, {
                                s3Key: s3KeyParam,
                                entityId: result.entityId
                            });
                            
                            // CRITICAL: Return here to prevent falling through to live fetch
                            return result;
                            
                        } catch (cacheError) {
                            console.error('[FETCH] Error processing S3 cache:', cacheError);
                            throw new Error(`Failed to process cached HTML: ${cacheError.message}`);
                        }
                    }

                    // LIVE FETCH PATH - only executed if s3KeyParam is NOT provided
                    console.log('[FETCH] 🌐 LIVE FETCH MODE - Will create new S3 file');
                    
                    // ✅ EXISTING: Normal fetch/scrape flow (when no s3Key provided)
                    if (!fetchUrl) throw new Error('URL required');
                    
                    const tournamentId = getTournamentId(fetchUrl);
                    monitoring.trackOperation('FETCH_DATA', 'Game', tournamentId, { url: fetchUrl, entityId });
                    
                    const scrapeURLRecord = await getOrCreateScrapeURL(fetchUrl, tournamentId, entityId);
                    
                    const forceRefresh = args.forceRefresh || false;
                    const overrideDoNotScrape = args.overrideDoNotScrape || false;
                    
                    console.log(`[HANDLER] Fetch params:`, {
                        doNotScrape: scrapeURLRecord.doNotScrape,
                        forceRefresh,
                        overrideDoNotScrape,
                        lastScrapeStatus: scrapeURLRecord.lastScrapeStatus
                    });
                    
                    if (scrapeURLRecord.doNotScrape && !forceRefresh && !overrideDoNotScrape) {
                        console.log('[HANDLER] Tournament marked as doNotScrape, returning status info without scraping');
                        
                        monitoring.trackOperation('SKIP_DONOTSCRAPE', 'Game', tournamentId, { 
                            url: fetchUrl, 
                            entityId,
                            lastScrapeStatus: scrapeURLRecord.lastScrapeStatus 
                        });
                        
                        return {
                            tournamentId: tournamentId,
                            name: 'Tournament Not Available',
                            gameStatus: scrapeURLRecord.gameStatus || 'NOT_PUBLISHED',
                            hasGuarantee: false,
                            doNotScrape: true,
                            s3Key: scrapeURLRecord.latestS3Key || '',
                            error: 'This tournament is marked as do not scrape',
                            status: 'DO_NOT_SCRAPE',
                            lastScrapeStatus: scrapeURLRecord.lastScrapeStatus,
                            lastScrapedAt: scrapeURLRecord.lastScrapedAt,
                            message: 'This tournament is not available for automatic scraping. Use force refresh to override.',
                            registrationStatus: 'N_A',
                            entityId: entityId
                        };
                    }
                    
                    if (scrapeURLRecord.doNotScrape && (forceRefresh || overrideDoNotScrape)) {
                        console.log('[HANDLER] OVERRIDE: User forcing scrape of doNotScrape tournament');
                        monitoring.trackOperation('FORCE_SCRAPE_OVERRIDE', 'Game', tournamentId, { 
                            url: fetchUrl, 
                            entityId,
                            override: true,
                            previousStatus: scrapeURLRecord.lastScrapeStatus 
                        });
                    }
                    
                    const fetchResult = await enhancedHandleFetch(
                        fetchUrl, 
                        scrapeURLRecord, 
                        entityId, 
                        tournamentId, 
                        forceRefresh, 
                        monitoredDdbDocClient
                    );
                    
                    monitoring.trackOperation('FETCH_SOURCE', 'Game', tournamentId, { 
                        source: fetchResult.source, 
                        s3Key: fetchResult.s3Key, 
                        success: fetchResult.success, 
                        entityId,
                        wasForced: forceRefresh || overrideDoNotScrape
                    });

                    if (!fetchResult.success) {
                        console.log('[HANDLER] Fetch failed:', fetchResult.error);
                        
                        const isNotFoundError = fetchResult.isNotFound || 
                                               fetchResult.error?.includes('not found') ||
                                               fetchResult.error?.includes('not published');
                        
                        if (isNotFoundError) {
                            await updateScrapeURLDoNotScrape(fetchUrl, true, 'UNKNOWN');
                        }
                        
                        return {
                            tournamentId: tournamentId,
                            name: fetchResult.isNotFound ? 'Tournament Not Found' : 'Failed to fetch tournament',
                            gameStatus: fetchResult.isNotFound ? 'UNKNOWN' : 'SCHEDULED',
                            hasGuarantee: false,
                            doNotScrape: fetchResult.isNotFound,
                            s3Key: '',
                            error: fetchResult.error || 'Fetch failed',
                            status: 'FETCH_ERROR',
                            registrationStatus: 'N_A',
                            entityId: entityId
                        };
                    }

                    const [venues, seriesTitles] = await Promise.all([getAllVenues(), getAllSeriesTitles()]);
                    const { data: scrapedData, foundKeys } = await scrapeDataFromHtml(
                        fetchResult.html, 
                        venues, 
                        seriesTitles, 
                        fetchUrl,
                        forceRefresh
                    );
                    
                    const shouldMarkDoNotScrape = scrapedData.gameStatus === 'NOT_PUBLISHED' || 
                                                 scrapedData.gameStatus === 'NOT_IN_USE' ||
                                                 scrapedData.doNotScrape === true;
                    
                    if (shouldMarkDoNotScrape && !scrapeURLRecord.doNotScrape) {
                        console.log(`[HANDLER] Marking tournament as doNotScrape due to status: ${scrapedData.gameStatus}`);
                        await updateScrapeURLDoNotScrape(fetchUrl, true, scrapedData.gameStatus);
                    }

                    const result = {
                        tournamentId: scrapedData.tournamentId || tournamentId,
                        name: scrapedData.name || 'Unnamed Tournament',
                        gameStatus: scrapedData.gameStatus || 'SCHEDULED',
                        hasGuarantee: scrapedData.hasGuarantee || false,
                        doNotScrape: scrapedData.doNotScrape || false,
                        s3Key: fetchResult.s3Key || '',
                        ...scrapedData,
                        rawHtml: fetchResult.html,
                        source: fetchResult.source,
                        contentHash: fetchResult.contentHash,
                        fetchedAt: new Date().toISOString(),
                        entityId: entityId,
                        wasForced: forceRefresh || overrideDoNotScrape
                    };
                    
                    // ✅ NEW: Update S3Storage with parsed data (for both live and cache)
                    // This ensures S3Storage always has the latest extracted data
                    if (fetchResult.s3Key) {
                        try {
                            const s3StorageTable = getTableName('S3Storage');
                            const updateResult = await updateS3StorageWithParsedData(
                                fetchResult.s3Key,
                                scrapedData,
                                foundKeys,
                                monitoredDdbDocClient,
                                s3StorageTable,
                                false, // isRescrape = false (live fetch)
                                fetchUrl, // URL for fallback lookup
                                scrapedData.tournamentId || tournamentId, // tournamentId for primary lookup
                                entityId // entityId for primary lookup
                            );
                            
                            console.log(`[FETCH] S3Storage update result:`, {
                                source: fetchResult.source,
                                dataChanged: updateResult.dataChanged,
                                gameStatus: updateResult.gameStatus,
                                registrationStatus: updateResult.registrationStatus,
                                fieldsExtracted: updateResult.extractedFields?.length
                            });
                            
                            // Add update info to result
                            result.s3StorageUpdated = updateResult.success;
                            result.dataChanged = updateResult.dataChanged;
                            
                        } catch (s3UpdateError) {
                            console.warn('[FETCH] Failed to update S3Storage with parsed data:', s3UpdateError.message);
                            // Don't fail the whole operation if S3Storage update fails
                        }
                    }
                    
                    return result;

                case 'saveTournamentData':
                case 'SAVE': {
                    monitoring.trackOperation('SAVE_DATA', 'Game', args.input?.existingGameId || args.existingGameId || 'new', { entityId });
                    
                    // --- ENHANCEMENT: Extract all args for handleSave ---
                    const input = args.input || args;
                    return await handleSave(
                        input.sourceUrl, 
                        input.venueId, 
                        input.scrapedData || input.data,
                        input.existingGameId,
                        input.doNotScrape, 
                        input.entityId || entityId, // Ensure entityId is passed
                        jobId // Pass jobId
                    );
                }
                case 'fetchTournamentDataRange': {
                    monitoring.trackOperation('FETCH_RANGE', 'Game', `${args.startId}-${args.endId}`, { entityId });
                    const rangeForceRefresh = args.forceRefresh || false;
                    return await handleFetchRange(args.startId, args.endId, entityId, rangeForceRefresh);
                }
                case 'reScrapeFromCache': {
                    // ✅ NEW: Alias for fetching from S3 cache
                    // Routes to the same logic as fetchTournamentData with s3Key
                    console.log('[HANDLER] reScrapeFromCache invoked');
                    monitoring.trackOperation('RESCRAPE_CACHE', 'Game', 'cached', { entityId });
                    
                    const input = args.input || args;
                    if (!input.s3Key) {
                        throw new Error('s3Key is required for reScrapeFromCache');
                    }
                    
                    // Use fetchTournamentData logic with s3Key
                    return await exports.handler({
                        operation: 'fetchTournamentData',
                        arguments: {
                            s3Key: input.s3Key,
                            url: input.url || null // Optional URL for context
                        },
                        identity: event.identity
                    });
                }
                default:
                    throw new Error(`Unknown operation: ${operationName}.`);
            }
        } catch (error) {
            console.error('[HANDLER] CRITICAL Error:', error);
            monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', { 
                error: error.message, 
                operationName, 
                entityId 
            });

            if (operationName === 'fetchTournamentData' || operationName === 'FETCH') {
                const url = args.url || '';
                const tournamentId = getTournamentId(url) || 1;
                
                return {
                    tournamentId: tournamentId,
                    name: 'Error processing tournament',
                    gameStatus: 'SCHEDULED', 
                    hasGuarantee: false,
                    doNotScrape: true,
                    s3Key: '',
                    error: error.message || 'Internal Lambda Error',
                    status: 'ERROR',
                    registrationStatus: 'N_A',
                    entityId: entityId
                };
            }
            
            return { errorMessage: error.message || 'Internal Lambda Error' };
        }
    } finally {
        if (monitoring) {
            console.log('[HANDLER] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[HANDLER] Monitoring flush complete.');
        }
    }
};

// Helper function to update ScrapeURL doNotScrape status
const updateScrapeURLDoNotScrape = async (url, doNotScrape, gameStatus) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    try {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: url },
            UpdateExpression: 'SET doNotScrape = :dns, gameStatus = :gs, lastScrapeStatus = :lss, updatedAt = :now',
            ExpressionAttributeValues: {
                ':dns': doNotScrape,
                ':gs': gameStatus,
                ':lss': doNotScrape ? 'SKIPPED_DONOTSCRAPE' : 'SUCCESS',
                ':now': new Date().toISOString()
            }
        }));
        console.log(`[UpdateScrapeURL] Set doNotScrape=${doNotScrape} for ${url}`);
    } catch (error) {
        console.error('[UpdateScrapeURL] Error updating doNotScrape:', error);
    }
};