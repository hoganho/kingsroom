/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_PLAYERCREDITSTABLE_ARN
	API_KINGSROOM_PLAYERCREDITSTABLE_NAME
	API_KINGSROOM_PLAYERENTRYTABLE_ARN
	API_KINGSROOM_PLAYERENTRYTABLE_NAME
	API_KINGSROOM_PLAYERPOINTSTABLE_ARN
	API_KINGSROOM_PLAYERPOINTSTABLE_NAME
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
	API_KINGSROOM_TICKETTEMPLATETABLE_ARN
	API_KINGSROOM_TICKETTEMPLATETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Generate table names based on Amplify naming convention
 */
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables.`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Parse player full name into first and last name
 */
const parsePlayerName = (fullName) => {
    if (!fullName) return { firstName: 'Unknown', lastName: '', givenName: 'Unknown' };

    const trimmedName = fullName.trim();
    
    if (trimmedName.includes(',')) {
        const parts = trimmedName.split(',');
        const lastName = parts[0] ? parts[0].trim() : 'Unknown';
        const firstName = parts[1] ? parts[1].trim() : 'Unknown';
        
        return {
            firstName: firstName,
            lastName: lastName,
            givenName: firstName 
        };
    } else {
        const parts = trimmedName.split(/\s+/);
        const firstName = parts[0] || 'Unknown';
        const lastName = parts.slice(1).join(' ') || '';
        
        return {
            firstName: firstName,
            lastName: lastName,
            givenName: firstName
        };
    }
};

/**
 * Calculate days between two dates
 */
const daysBetween = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

/**
 * Calculate PlayerVenue targeting classification based on flowchart logic
 */
const calculatePlayerVenueTargetingClassification = (lastActivityDate, membershipCreatedDate) => {
    const now = new Date();
    
    if (!lastActivityDate) {
        if (!membershipCreatedDate) return 'Not Activated - Early Life';
        
        const daysSinceMembership = daysBetween(membershipCreatedDate, now);
        
        if (daysSinceMembership <= 30) return 'Not Activated - Early Life';
        if (daysSinceMembership <= 60) return 'Not Activated - 31-60d';
        if (daysSinceMembership <= 90) return 'Not Activated - 61-90d';
        if (daysSinceMembership <= 120) return 'Not Activated - 91-120d';
        if (daysSinceMembership <= 180) return 'Not Activated - 121-180d';
        if (daysSinceMembership <= 360) return 'Not Activated - 181-360d';
        return 'Not Activated - 361d+';
    } else {
        const daysSinceLastActivity = daysBetween(lastActivityDate, now);
        
        if (daysSinceLastActivity <= 30) return 'Active_EL';
        if (daysSinceLastActivity <= 60) return 'Active';
        if (daysSinceLastActivity <= 90) return 'Retain_Inactive31_60d';
        if (daysSinceLastActivity <= 120) return 'Retain_Inactive61_90d';
        if (daysSinceLastActivity <= 180) return 'Churned_91_120d';
        if (daysSinceLastActivity <= 360) return 'Churned_121_180d';
        if (daysSinceLastActivity <= 720) return 'Churned_181_360d';
        return 'Churned_361d';
    }
};

/**
 * Calculate Player targeting classification based on flowchart logic
 */
const calculatePlayerTargetingClassification = async (playerId, lastPlayedDate, registrationDate, isNewPlayer = false) => {
    const now = new Date();

    if (isNewPlayer) {
        console.log(`[TARGETING] New player ${playerId}. Classifying based on game date: ${lastPlayedDate}`);
        if (!lastPlayedDate) {
            return 'NotPlayed'; 
        }
        const daysSinceLastPlayed = daysBetween(lastPlayedDate, now);
        if (daysSinceLastPlayed <= 30) return 'Active_EL';
        if (daysSinceLastPlayed <= 60) return 'Active';
        if (daysSinceLastPlayed <= 90) return 'Retain_Inactive31_60d';
        if (daysSinceLastPlayed <= 120) return 'Retain_Inactive61_90d';
        if (daysSinceLastPlayed <= 180) return 'Churned_91_120d';
        if (daysSinceLastPlayed <= 360) return 'Churned_121_180d';
        if (daysSinceLastPlayed <= 720) return 'Churned_181_360d';
        return 'Churned_361d';
    }

    try {
        const playerVenueTable = getTableName('PlayerVenue');
        const queryResponse = await ddbDocClient.send(new QueryCommand({
            TableName: playerVenueTable,
            IndexName: 'byPlayer',
            KeyConditionExpression: 'playerId = :playerId',
            ExpressionAttributeValues: { ':playerId': playerId }
        }));
        
        const venues = queryResponse.Items || [];
        if (venues.length < 2) {
            return 'NotPlayed';
        }
        
        let mostRecentVenue = null;
        let mostRecentDate = null;
        for (const venue of venues) {
            if (venue.lastPlayedDate) {
                const venueDate = new Date(venue.lastPlayedDate);
                if (!mostRecentDate || venueDate > mostRecentDate) {
                    mostRecentDate = venueDate;
                    mostRecentVenue = venue;
                }
            }
        }
        
        const daysSinceCreation = daysBetween(registrationDate, now);
        if (daysSinceCreation <= 30 && mostRecentVenue) {
            const venueClassification = mostRecentVenue.targetingClassification;
            const newPlayerClassifications = ['Active_EL', 'Active', 'Retain_Inactive31_60d', 'Retain_Inactive61_90d'];
            if (newPlayerClassifications.includes(venueClassification)) {
                return venueClassification;
            }
        }
        
        if (!lastPlayedDate) return 'NotPlayed';
        const daysSinceLastPlayed = daysBetween(lastPlayedDate, now);
        if (daysSinceLastPlayed <= 30) return 'Active_EL';
        if (daysSinceLastPlayed <= 60) return 'Active';
        if (daysSinceLastPlayed <= 90) return 'Retain_Inactive31_60d';
        if (daysSinceLastPlayed <= 120) return 'Retain_Inactive61_90d';
        if (daysSinceLastPlayed <= 180) return 'Churned_91_120d';
        if (daysSinceLastPlayed <= 360) return 'Churned_121_180d';
        if (daysSinceLastPlayed <= 720) return 'Churned_181_360d';
        return 'Churned_361d';
    } catch (error) {
        console.error('[TARGETING] Error fetching PlayerVenue data:', error);
        return 'NotPlayed';
    }
};

/**
 * Generate a deterministic player ID based on name and venue
 */
const generatePlayerId = (playerName) => {
    const normalized = playerName.toLowerCase().trim();
    const hash = crypto.createHash('sha256')
        .update(normalized)
        .digest('hex');
    return hash.substring(0, 32);
};

// ===================================================================
// MAIN PROCESSING FUNCTIONS
// ===================================================================

/**
 * Create or update a Player record
 */
const upsertPlayerRecord = async (playerId, playerName, gameData, playerData) => {
    console.log(`[PLAYER-UPSERT] Starting upsert for player ${playerName} (${playerId})`);
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();
    const nameParts = parsePlayerName(playerName);
    const gameDateTime = gameData.game.gameEndDateTime || gameData.game.gameStartDateTime;
    const gameDate = gameDateTime.split('T')[0];

    try {
        const existingPlayer = await ddbDocClient.send(new GetCommand({
            TableName: playerTable,
            Key: { id: playerId }
        }));

        if (existingPlayer.Item) {
            // Player exists globally. Update their record.
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId, gameDateTime, existingPlayer.Item.registrationDate, false
            );
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerTable,
                Key: { id: playerId },
                UpdateExpression: `
                    SET lastPlayedDate = :lastPlayedDate,
                        targetingClassification = :targetingClassification,
                        pointsBalance = pointsBalance + :points,
                        #version = #version + :inc
                `,
                ExpressionAttributeNames: { '#version': '_version' },
                ExpressionAttributeValues: {
                    ':lastPlayedDate': gameDate,
                    ':targetingClassification': targetingClassification,
                    ':points': playerData.points || 0,
                    ':inc': 1
                }
            }));
            console.log(`[PLAYER-UPSERT] Updated existing player ${playerId}`);
            return playerId;
        } else {
            // Player does NOT exist globally. Create a new record.
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId, gameDateTime, now, true
            );
            const newPlayer = {
                id: playerId,
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                givenName: nameParts.givenName,
                registrationDate: gameDateTime,
                registrationVenueId: gameData.game.venueId,
                status: 'ACTIVE',
                category: 'NEW',
                lastPlayedDate: gameDate,
                targetingClassification: targetingClassification,
                creditBalance: 0,
                pointsBalance: playerData.points || 0,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'Player'
            };
            await ddbDocClient.send(new PutCommand({
                TableName: playerTable,
                Item: newPlayer,
                ConditionExpression: 'attribute_not_exists(id)'
            }));
            console.log(`[PLAYER-UPSERT] Created new player ${playerId}`);
            return playerId;
        }
    } catch (error) {
        console.error(`[PLAYER-UPSERT] CRITICAL ERROR for ${playerName}:`, error);
        throw error;
    }
};

/**
 * Upserts a PlayerEntry record
 */
const upsertPlayerEntry = async (playerId, gameData) => {
    console.log(`[ENTRY-UPSERT] Starting upsert for game ${gameData.game.id}.`);
    const playerEntryTable = getTableName('PlayerEntry');
    const entryId = `${gameData.game.id}#${playerId}`;
    const now = new Date().toISOString();

    try {
        // Try to update existing record to 'COMPLETED'
        await ddbDocClient.send(new UpdateCommand({
            TableName: playerEntryTable,
            Key: { id: entryId },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'COMPLETED',
                ':updatedAt': now
            },
            ConditionExpression: 'attribute_exists(id)'
        }));
        console.log(`[ENTRY-UPSERT] Updated existing entry for ${playerId}.`);
    } catch (error) {
        // If update fails, item does not exist, so create it
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`[ENTRY-UPSERT] Entry not found, creating new COMPLETED entry.`);
            const newEntry = {
                id: entryId,
                playerId: playerId,
                gameId: gameData.game.id,
                venueId: gameData.game.venueId,
                status: 'COMPLETED',
                registrationTime: gameData.game.gameStartDateTime || now,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'PlayerEntry'
            };
            
            try {
                await ddbDocClient.send(new PutCommand({
                    TableName: playerEntryTable,
                    Item: newEntry
                }));
                console.log(`[ENTRY-UPSERT] Created new COMPLETED entry for ${playerId}.`);
            } catch (putError) {
                console.error(`[ENTRY-UPSERT] CRITICAL ERROR creating entry:`, putError);
                throw putError;
            }
        } else {
            console.error(`[ENTRY-UPSERT] Unexpected error:`, error);
            throw error;
        }
    }
};

/**
 * Create PlayerResult record
 */
const createPlayerResult = async (playerId, gameData, playerData) => {
    console.log(`[RESULT-CREATE] Attempting result creation for ${playerId}.`);
    const playerResultTable = getTableName('PlayerResult');
    const resultId = `${playerId}#${gameData.game.id}`;
    const now = new Date().toISOString();
    
    try {
        const playerResult = {
            id: resultId,
            playerId: playerId,
            gameId: gameData.game.id,
            venueId: gameData.game.venueId,
            finishingPlace: playerData.rank || null,
            prizeWon: playerData.winnings > 0 || playerData.isQualification || false,
            amountWon: playerData.winnings || 0,
            pointsEarned: playerData.points || 0,
            isMultiDayQualification: playerData.isQualification || false,
            totalRunners: gameData.game.totalEntries || gameData.players.totalPlayers,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'PlayerResult'
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: playerResultTable,
            Item: playerResult,
            ConditionExpression: 'attribute_not_exists(id)'
        }));
        
        console.log(`[RESULT-CREATE] Created result successfully.`);
        return resultId;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`[RESULT-CREATE] Result already exists, skipping.`);
            return resultId;
        }
        console.error(`[RESULT-CREATE] CRITICAL ERROR creating result:`, error);
        throw error;
    }
};

/**
 * Update or create PlayerSummary record
 */
const upsertPlayerSummary = async (playerId, gameData, playerData) => {
    console.log(`[SUMMARY-UPSERT] Starting upsert for player ${playerId}.`);
    const playerSummaryTable = getTableName('PlayerSummary');
    const summaryId = `${playerId}`;
    const now = new Date().toISOString();
    
    const gameDateTime = gameData.game.gameEndDateTime || gameData.game.gameStartDateTime;

    const buyInAmount = (gameData.game.buyIn || 0) + (gameData.game.rake || 0);
    const winningsAmount = playerData.winnings || 0;
    const isITM = playerData.winnings > 0 || playerData.isQualification;
    const isCash = playerData.winnings > 0;

    try {
        const existingSummary = await ddbDocClient.send(new GetCommand({
            TableName: playerSummaryTable,
            Key: { id: summaryId }
        }));

        if (existingSummary.Item) {
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerSummaryTable,
                Key: { id: summaryId },
                UpdateExpression: `
                    SET #lastPlayed = :lastPlayed,
                        sessionsPlayed = sessionsPlayed + :one,
                        tournamentsPlayed = tournamentsPlayed + :one,
                        tournamentWinnings = tournamentWinnings + :winnings,
                        tournamentBuyIns = tournamentBuyIns + :buyIn,
                        tournamentITM = tournamentITM + :itm,
                        tournamentsCashed = tournamentsCashed + :cash,
                        totalWinnings = totalWinnings + :winnings,
                        totalBuyIns = totalBuyIns + :buyIn,
                        netBalance = netBalance + :profitLoss,
                        updatedAt = :updatedAt,
                        #version = #version + :one
                `,
                ExpressionAttributeNames: {
                    '#version': '_version',
                    '#lastPlayed': 'lastPlayed'
                },
                ExpressionAttributeValues: {
                    ':lastPlayed': gameDateTime,
                    ':one': 1,
                    ':winnings': winningsAmount,
                    ':buyIn': buyInAmount,
                    ':itm': isITM ? 1 : 0,
                    ':cash': isCash ? 1 : 0,
                    ':profitLoss': winningsAmount - buyInAmount,
                    ':updatedAt': now
                }
            }));
            console.log(`[SUMMARY-UPSERT] Updated existing summary.`);
        } else {
            const newSummary = {
                id: summaryId,
                playerId: playerId,
                sessionsPlayed: 1,
                tournamentsPlayed: 1,
                cashGamesPlayed: 0,
                venuesVisited: [gameData.game.venueId],
                tournamentWinnings: winningsAmount,
                tournamentBuyIns: buyInAmount,
                tournamentITM: isITM ? 1 : 0,
                tournamentsCashed: isCash ? 1 : 0,
                cashGameWinnings: 0,
                cashGameBuyIns: 0,
                totalWinnings: winningsAmount,
                totalBuyIns: buyInAmount,
                netBalance: winningsAmount - buyInAmount,
                lastPlayed: gameDateTime,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'PlayerSummary'
            };
            
            await ddbDocClient.send(new PutCommand({
                TableName: playerSummaryTable,
                Item: newSummary
            }));
            console.log(`[SUMMARY-UPSERT] Created new summary.`);
        }
    } catch (error) {
        console.error(`[SUMMARY-UPSERT] CRITICAL ERROR processing summary:`, error);
        throw error;
    }
};

/**
 * Update or create PlayerVenue record
 */
const upsertPlayerVenue = async (playerId, gameData, playerData) => {
    console.log(`[VENUE-UPSERT] Starting upsert for player ${playerId} at venue ${gameData.game.venueId}.`);
    const playerVenueTable = getTableName('PlayerVenue');
    const playerVenueId = `${playerId}#${gameData.game.venueId}`;
    const now = new Date().toISOString();
    const gameDate = (gameData.game.gameEndDateTime || gameData.game.gameStartDateTime).split('T')[0];
    const currentGameBuyIn = (gameData.game.buyIn || 0) + (gameData.game.rake || 0);
    
    try {
        const existingRecord = await ddbDocClient.send(new GetCommand({
            TableName: playerVenueTable,
            Key: { id: playerVenueId }
        }));
        
        const membershipCreatedDate = existingRecord.Item?.membershipCreatedDate || gameDate;
        
        const targetingClassification = calculatePlayerVenueTargetingClassification(
            gameDate,
            membershipCreatedDate
        );
        
        if (existingRecord.Item) {
            const oldGamesPlayed = existingRecord.Item.totalGamesPlayed || 0;
            const oldAverageBuyIn = existingRecord.Item.averageBuyIn || 0;
            const newTotalGames = oldGamesPlayed + 1;
            const newAverageBuyIn = newTotalGames > 0
                ? ((oldAverageBuyIn * oldGamesPlayed) + currentGameBuyIn) / newTotalGames
                : currentGameBuyIn;

            await ddbDocClient.send(new UpdateCommand({
                TableName: playerVenueTable,
                Key: { id: playerVenueId },
                UpdateExpression: `
                    SET totalGamesPlayed = totalGamesPlayed + :inc,
                        lastPlayedDate = :lastPlayedDate,
                        targetingClassification = :targetingClassification,
                        averageBuyIn = :newAverageBuyIn,
                        updatedAt = :updatedAt,
                        #version = #version + :inc
                `,
                ExpressionAttributeNames: {
                    '#version': '_version'
                },
                ExpressionAttributeValues: {
                    ':inc': 1,
                    ':lastPlayedDate': gameDate,
                    ':targetingClassification': targetingClassification,
                    ':newAverageBuyIn': newAverageBuyIn,
                    ':updatedAt': now
                }
            }));
            console.log(`[VENUE-UPSERT] Updated existing PlayerVenue record.`);
        } else {
            const newPlayerVenue = {
                id: playerVenueId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                membershipCreatedDate: gameDate,
                firstPlayedDate: gameDate,
                lastPlayedDate: gameDate,
                totalGamesPlayed: 1,
                averageBuyIn: currentGameBuyIn,
                targetingClassification: targetingClassification,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'PlayerVenue'
            };
            
            await ddbDocClient.send(new PutCommand({
                TableName: playerVenueTable,
                Item: newPlayerVenue
            }));
            console.log(`[VENUE-UPSERT] Created new PlayerVenue record.`);
        }
        
    } catch (error) {
        console.error(`[VENUE-UPSERT] CRITICAL ERROR:`, error);
        throw error;
    }
};


/**
 * Create PlayerTransaction records
 */
const createPlayerTransactions = async (playerId, gameData, playerData, processingInstructions) => {
    console.log(`[TRANSACTION-CREATE] Starting creation for player ${playerId}.`);
    const playerTransactionTable = getTableName('PlayerTransaction');
    const transactions = [];
    const now = new Date().toISOString();
    
    const transactionsToCreate = processingInstructions.requiredActions?.createTransactions || [];
    
    try {
        for (const transaction of transactionsToCreate) {
            const transactionId = uuidv4();
            
            const playerTransaction = {
                id: transactionId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                gameId: gameData.game.id,
                type: transaction.type,
                amount: transaction.amount,
                paymentSource: transaction.paymentSource,
                transactionDate: gameData.game.gameEndDateTime || gameData.game.gameStartDateTime,
                notes: `SYSTEM insert from scraped data`,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'PlayerTransaction'
            };
            
            if (transaction.type === 'BUY_IN' && transaction.rake) {
                playerTransaction.rake = transaction.rake;
            }
            
            transactions.push({
                PutRequest: {
                    Item: playerTransaction
                }
            });
        }
        
        if (transactions.length > 0) {
            const chunks = [];
            for (let i = 0; i < transactions.length; i += 25) {
                chunks.push(transactions.slice(i, i + 25));
            }
            
            for (const chunk of chunks) {
                await ddbDocClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [playerTransactionTable]: chunk
                    }
                }));
            }
            
            console.log(`[TRANSACTION-CREATE] Created ${transactions.length} transactions.`);
        } else {
            console.log(`[TRANSACTION-CREATE] No transactions to create.`);
        }
    } catch (error) {
        console.error(`[TRANSACTION-CREATE] CRITICAL ERROR creating transactions:`, error);
        throw error;
    }
};

/**
 * Process a single player
 */
const processPlayer = async (playerData, processingInstructions, gameData) => {
    const playerName = playerData.name;
    const playerResultTable = getTableName('PlayerResult');
    
    try {
        const playerId = generatePlayerId(playerName);
        const resultId = `${playerId}#${gameData.game.id}`;

        console.log(`[PROCESS-PLAYER] Starting processing for player: ${playerName} (ID: ${playerId})`);

        const existingResult = await ddbDocClient.send(new GetCommand({
            TableName: playerResultTable,
            Key: { id: resultId }
        }));

        if (existingResult.Item) {
            console.log(`[PROCESS-PLAYER] SKIPPING: Result already exists for game ${gameData.game.id}`);
            return { success: true, playerName, playerId, status: 'SKIPPED' };
        }
        
        console.log(`[PROCESS-PLAYER] Step 1: upsertPlayerRecord...`);
        await upsertPlayerRecord(playerId, playerName, gameData, playerData);
        
        console.log(`[PROCESS-PLAYER] Step 2: createPlayerResult...`);
        await createPlayerResult(playerId, gameData, playerData);
        
        console.log(`[PROCESS-PLAYER] Step 3: upsertPlayerSummary...`);
        await upsertPlayerSummary(playerId, gameData, playerData);
        
        console.log(`[PROCESS-PLAYER] Step 4: upsertPlayerVenue...`);
        await upsertPlayerVenue(playerId, gameData, playerData);
        
        console.log(`[PROCESS-PLAYER] Step 5: createPlayerTransactions...`);
        await createPlayerTransactions(playerId, gameData, playerData, processingInstructions);
        
        console.log(`[PROCESS-PLAYER] Step 6: upsertPlayerEntry...`);
        await upsertPlayerEntry(playerId, gameData);

        console.log(`[PROCESS-PLAYER] SUCCESS: Player ${playerName} completely processed.`);
        return { success: true, playerName, playerId, status: 'PROCESSED' };
        
    } catch (error) {
        console.error(`[PROCESS-PLAYER] CRITICAL FAILURE for player ${playerName}:`, error);
        return { success: false, playerName, error: error.message };
    }
};

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('[HANDLER] START: Player Data Processor invoked.');

    // ✅ DIAGNOSTIC: Log the entire event structure
    // NOTE: SQS events wrap the actual message body inside event.Records[i].body
    console.log('Received Lambda Event (Raw):', JSON.stringify(event, null, 2));

    const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
    };
    
    if (!event.Records || event.Records.length === 0) {
        console.warn('[HANDLER] WARNING: No records found in event payload.');
        return { statusCode: 204, body: JSON.stringify({ message: 'No records to process.' }) };
    }

    console.log(`[HANDLER] Processing ${event.Records.length} SQS message(s).`);

    for (const record of event.Records) {
        let gameData = null;
        try {
            console.log(`[HANDLER] Processing message ID: ${record.messageId}`);
            
            // 1. Parse the SQS message body
            const messageBody = record.body;
            gameData = JSON.parse(messageBody);
            
            console.log(`[HANDLER] SUCCESS: Message body parsed.`);
            console.log(`[HANDLER] Game ID from SQS: ${gameData.game.id}`);
            
            if (!gameData.players || !gameData.processingInstructions) {
                console.error('[HANDLER] CRITICAL ERROR: SQS Payload missing required fields (players/instructions).');
                throw new Error('SQS Payload validation failed.');
            }

            const playerPromises = [];
            
            for (let i = 0; i < gameData.players.allPlayers.length; i++) {
                const playerData = gameData.players.allPlayers[i];
                const processingInstructions = gameData.processingInstructions[i];
                
                playerPromises.push(
                    processPlayer(playerData, processingInstructions, gameData)
                );
            }
            
            // 2. Batch Processing for Concurrency
            const batchSize = 10;
            for (let i = 0; i < playerPromises.length; i += batchSize) {
                const batch = playerPromises.slice(i, i + batchSize);
                const batchResults = await Promise.allSettled(batch);
                
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        results.successful.push(result.value);
                    } else {
                        // Log reason for failure (rejected promise or processPlayer failure)
                        const failureReason = result.reason || result.value;
                        console.error('[HANDLER] Player Processing Failed:', JSON.stringify(failureReason));
                        results.failed.push(failureReason);
                    }
                    results.totalProcessed++;
                });
            }
            
            console.log(`[HANDLER] Game ${gameData.game.id} batch processing completed.`);
            
        } catch (error) {
            console.error('[HANDLER] CRITICAL FAILURE: Unhandled error processing SQS message record:', error);
            // Re-throw the error so SQS knows to redeliver the message (or move to DLQ)
            throw error; 
        }
    }
    
    console.log('--- FINAL SUMMARY ---');
    console.log(`Total Players Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    // If any failures occurred, throw an error to trigger SQS redelivery mechanism
    if (results.failed.length > 0) {
        console.error('Final result contains failures. Triggering SQS redelivery.');
        throw new Error(`Failed to process ${results.failed.length} players. Check logs for details.`);
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Successfully processed all messages.',
            results: {
                totalProcessed: results.totalProcessed,
                successful: results.successful.length,
                failed: results.failed.length
            }
        })
    };
};