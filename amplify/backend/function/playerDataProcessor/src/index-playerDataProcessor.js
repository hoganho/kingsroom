/* Amplify Params - DO NOT EDIT
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
 *
 * ✅ FIX 1: Updated logic to handle "LastName, FirstName" format.
 * - Splits by comma (,) first.
 * - If a comma exists, it assumes "LastName, FirstName" format.
 * - If no comma exists, it falls back to the original "FirstName LastName" logic.
 */
const parsePlayerName = (fullName) => {
    if (!fullName) return { firstName: 'Unknown', lastName: '', givenName: 'Unknown' };

    const trimmedName = fullName.trim();
    
    if (trimmedName.includes(',')) {
        // New logic for "LastName, FirstName"
        const parts = trimmedName.split(',');
        const lastName = parts[0] ? parts[0].trim() : 'Unknown';
        const firstName = parts[1] ? parts[1].trim() : 'Unknown';
        
        return {
            firstName: firstName,
            lastName: lastName,
            givenName: firstName 
        };
    } else {
        // Fallback logic for "FirstName LastName"
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
        // Member-level NO activity classifications
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
        // Member-level activity classifications
        const daysSinceLastActivity = daysBetween(lastActivityDate, now);
        
        if (daysSinceLastActivity <= 30) return 'Active_EL';
        if (daysSinceLastActivity <= 60) return 'Active';
        if (daysSinceLastActivity <= 90) return 'Retain_Inactive31_60d';
        if (daysSinceLastActivity <= 120) return 'Retain_Inactive61_90d';
        if (daysSinceLastActivity <= 180) return 'Churned_91_120d';
        if (daysSinceLastActivity <= 360) return 'Churned_121_180d';
        if (daysSinceLastActivity <= 720) return 'Churned_181_360d'; // Note: This seems to be 181-360d in enum
        return 'Churned_361d';
    }
};

/**
 * Calculate Player targeting classification based on flowchart logic
 * This requires checking venues across all PlayerVenue records
 */
const calculatePlayerTargetingClassification = async (playerId, lastPlayedDate, creationDate) => {
    try {
        // Query all PlayerVenue records for this player
        const playerVenueTable = getTableName('PlayerVenue');
        const queryResponse = await ddbDocClient.send(new QueryCommand({
            TableName: playerVenueTable,
            IndexName: 'byPlayer',
            KeyConditionExpression: 'playerId = :playerId',
            ExpressionAttributeValues: {
                ':playerId': playerId
            }
        }));
        
        const venues = queryResponse.Items || [];
        
        // Check if user has visited at least 2 venues
        if (venues.length < 2) {
            return 'NotPlayed';
        }
        
        // Find the venue with the most recent activity
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
        
        // If player created within 30 days
        const now = new Date();
        const daysSinceCreation = daysBetween(creationDate, now);
        
        if (daysSinceCreation <= 30 && mostRecentVenue) {
            // Use the classification from the most recent venue
            const venueClassification = mostRecentVenue.targetingClassification;
            
            // Check if it's a "new player" classification that should be passed through
            const newPlayerClassifications = [
                'Active_EL',
                'Active',
                'Retain_Inactive31_60d',
                'Retain_Inactive61_90d'
            ];
            
            if (newPlayerClassifications.includes(venueClassification)) {
                return venueClassification;
            }
        }
        
        // Default classification based on days since last played
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
        console.error('[calculatePlayerTargetingClassification] Error:', error);
        return 'NotPlayed'; // Default fallback
    }
};

/**
 * Generate a deterministic player ID based on name and venue
 */
const generatePlayerId = (playerName, venueId) => {
    const normalized = playerName.toLowerCase().trim();
    const hash = crypto.createHash('sha256')
        .update(`${normalized}#${venueId}`)
        .digest('hex');
    return hash.substring(0, 32); // Use first 32 chars for reasonable ID length
};

// ===================================================================
// MAIN PROCESSING FUNCTIONS
// ===================================================================

/**
 * Create or update a Player record
 */
const upsertPlayerRecord = async (playerId, playerName, gameData) => { // Now accepts playerId
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
            // Update existing player (logic remains the same)
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId,
                gameDateTime,
                existingPlayer.Item.creationDate
            );

            await ddbDocClient.send(new UpdateCommand({
                TableName: playerTable,
                Key: { id: playerId },
                UpdateExpression: `
                    SET lastPlayedDate = :lastPlayedDate,
                        targetingClassification = :targetingClassification,
                        #version = #version + :inc
                `,
                ExpressionAttributeNames: {
                    '#version': '_version'
                },
                ExpressionAttributeValues: {
                    ':lastPlayedDate': gameDate,
                    ':targetingClassification': targetingClassification,
                    ':inc': 1
                }
            }));

            console.log(`[upsertPlayerRecord] Updated player ${playerId} - ${playerName}`);
            return playerId;
        } else {
            // Create new player
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId,
                gameDateTime,
                now
            );

            const newPlayer = {
                id: playerId,
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                givenName: nameParts.givenName,
                creationDate: now,
                // ✅ FIX 2: Add the required registrationVenueId using the game's venueId
                registrationVenueId: gameData.game.venueId,
                status: 'ACTIVE',
                category: 'NEW',
                lastPlayedDate: gameDate,
                targetingClassification: targetingClassification,
                creditBalance: 0,
                pointsBalance: 0,
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

            console.log(`[upsertPlayerRecord] Created new player ${playerId} - ${playerName}`);
            return playerId;
        }
    } catch (error) {
        console.error(`[upsertPlayerRecord] Error processing player ${playerName}:`, error);
        throw error;
    }
};

/**
 * Create PlayerResult record
 */
const createPlayerResult = async (playerId, gameData, playerData) => {
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
        
        console.log(`[createPlayerResult] Created result for player ${playerId} in game ${gameData.game.id}`);
        return resultId;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`[createPlayerResult] Result already exists for player ${playerId} in game ${gameData.game.id}`);
            return resultId;
        }
        throw error;
    }
};

/**
 * Update or create PlayerSummary record
 */
const upsertPlayerSummary = async (playerId, gameData, playerData) => {
    const playerSummaryTable = getTableName('PlayerSummary');
    const summaryId = `${playerId}`; // The ID for PlayerSummary is just the player's ID for a 1:1 relationship.
    const now = new Date().toISOString();
    
    // ✅ 1. Use the definitive game date/time, not 'now'.
    const gameDateTime = gameData.game.gameEndDateTime || gameData.game.gameStartDateTime;

    const buyInAmount = (gameData.game.buyIn || 0) + (gameData.game.rake || 0);
    const winningsAmount = playerData.winnings || 0;
    const isITM = playerData.winnings > 0 || playerData.isQualification;
    const isCash = playerData.winnings > 0;

    try {
        // First, check if a summary already exists for this player
        const existingSummary = await ddbDocClient.send(new GetCommand({
            TableName: playerSummaryTable,
            Key: { id: summaryId }
        }));

        if (existingSummary.Item) {
            // If it exists, update it by incrementing values
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerSummaryTable,
                Key: { id: summaryId },
                UpdateExpression: `
                    SET #lastPlayed = :lastPlayed,
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
                    '#lastPlayed': 'lastPlayed' // ✅ 2. Target the correct 'lastPlayed' field
                },
                ExpressionAttributeValues: {
                    ':lastPlayed': gameDateTime, // ✅ 3. Set it to the game's timestamp
                    ':one': 1,
                    ':winnings': winningsAmount,
                    ':buyIn': buyInAmount,
                    ':itm': isITM ? 1 : 0,
                    ':cash': isCash ? 1 : 0,
                    ':profitLoss': winningsAmount - buyInAmount,
                    ':updatedAt': now
                }
            }));
            console.log(`[upsertPlayerSummary] Updated summary for player ${playerId}`);
        } else {
            // If it doesn't exist, create a new record
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
                lastPlayed: gameDateTime, // ✅ 3. Set it to the game's timestamp
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
            console.log(`[upsertPlayerSummary] Created new summary for player ${playerId}`);
        }
    } catch (error) {
        console.error(`[upsertPlayerSummary] Error processing summary for player ${playerId}:`, error);
        throw error;
    }
};

/**
 * Update or create PlayerVenue record
 */
const upsertPlayerVenue = async (playerId, gameData, playerData) => {
    const playerVenueTable = getTableName('PlayerVenue');
    const playerVenueId = `${playerId}#${gameData.game.venueId}`;
    const now = new Date().toISOString();
    const gameDate = gameData.game.gameEndDateTime.split('T')[0]; // Convert to AWSDate
    
    try {
        // First try to get existing record
        const existingRecord = await ddbDocClient.send(new GetCommand({
            TableName: playerVenueTable,
            Key: { id: playerVenueId }
        }));
        
        let membershipCreatedDate = existingRecord.Item?.membershipCreatedDate || gameDate;
        
        // Calculate targeting classification
        const targetingClassification = calculatePlayerVenueTargetingClassification(
            gameDate,
            membershipCreatedDate
        );
        
        if (existingRecord.Item) {
            // Update existing record
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerVenueTable,
                Key: { id: playerVenueId },
                UpdateExpression: `
                    SET gamesPlayed = gamesPlayed + :inc,
                        lastPlayedDate = :lastPlayedDate,
                        targetingClassification = :targetingClassification,
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
                    ':updatedAt': now
                }
            }));
        } else {
            // Create new record
            const newPlayerVenue = {
                id: playerVenueId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                membershipCreatedDate: gameDate,
                lastPlayedDate: gameDate,
                gamesPlayed: 1,
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
        }
        
        console.log(`[upsertPlayerVenue] Updated PlayerVenue for ${playerId} at venue ${gameData.game.venueId}`);
    } catch (error) {
        console.error(`[upsertPlayerVenue] Error:`, error);
        throw error;
    }
};

/**
 * Create PlayerTransaction records
 */
const createPlayerTransactions = async (playerId, gameData, playerData, processingInstructions) => {
    const playerTransactionTable = getTableName('PlayerTransaction');
    const transactions = [];
    const now = new Date().toISOString();
    
    // ✅ FIX 3: Corrected the path to the transactions array based on the SQS message structure.
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
                transactionDate: gameData.game.gameEndDateTime,
                description: `${transaction.type} for game ${gameData.game.name}`,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: Date.now(),
                __typename: 'PlayerTransaction'
            };
            
            // Add rake if it's a BUY_IN transaction
            if (transaction.type === 'BUY_IN' && transaction.rake) {
                playerTransaction.rake = transaction.rake;
            }
            
            transactions.push({
                PutRequest: {
                    Item: playerTransaction
                }
            });
        }
        
        // Batch write transactions
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
            
            console.log(`[createPlayerTransactions] Created ${transactions.length} transactions for player ${playerId}`);
        } else {
            console.log(`[createPlayerTransactions] No transactions to create for player ${playerId}`);
        }
    } catch (error) {
        console.error(`[createPlayerTransactions] Error creating transactions:`, error);
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
        // ✅ FIX 1: Check for existing result before any processing
        const playerId = generatePlayerId(playerName, gameData.game.venueId);
        const resultId = `${playerId}#${gameData.game.id}`;

        const existingResult = await ddbDocClient.send(new GetCommand({
            TableName: playerResultTable,
            Key: { id: resultId }
        }));

        if (existingResult.Item) {
            console.log(`[processPlayer] Skipping already processed player: ${playerName} for game ${gameData.game.id}`);
            // Return a success-like object to indicate it was intentionally skipped, not failed.
            return { success: true, playerName, playerId, status: 'SKIPPED' };
        }
        
        console.log(`[processPlayer] Processing player: ${playerName}`);
        
        // Step 1: Create/Update Player record (pass the pre-calculated playerId)
        await upsertPlayerRecord(playerId, playerName, gameData);
        
        // Step 2: Create PlayerResult record
        await createPlayerResult(playerId, gameData, playerData);
        
        // Step 3: Update/Create PlayerSummary
        await upsertPlayerSummary(playerId, gameData, playerData);
        
        // Step 4: Update/Create PlayerVenue
        await upsertPlayerVenue(playerId, gameData, playerData);
        
        // Step 5: Create PlayerTransaction records
        await createPlayerTransactions(playerId, gameData, playerData, processingInstructions);
        
        console.log(`[processPlayer] Successfully processed player: ${playerName}`);
        return { success: true, playerName, playerId, status: 'PROCESSED' };
        
    } catch (error) {
        console.error(`[processPlayer] Error processing player ${playerName}:`, error);
        return { 
            success: false, 
            playerName, 
            error: error.message 
        };
    }
};

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Received SQS event:', JSON.stringify(event, null, 2));
    console.log(`[playerDataProcessor] Function triggered with ${event.Records.length} message(s).`);

    const results = {
        successful: [],
        failed: [],
        totalProcessed: 0
    };
    
    for (const record of event.Records) {
        try {
            const messageBody = record.body;
            console.log('[playerDataProcessor] Processing message:', record.messageId);
            
            // Parse the game data from SQS message
            const gameData = JSON.parse(messageBody);
            
            console.log('--- Processing Game Data ---');
            console.log(`Game ID: ${gameData.game.id}`);
            console.log(`Game Name: ${gameData.game.name}`);
            console.log(`Venue ID: ${gameData.game.venueId}`);
            console.log(`Total Players to Process: ${gameData.players.totalPlayers}`);
            console.log(`Players In The Money: ${gameData.players.totalInTheMoney}`);
            
            // Process each player
            const playerPromises = [];
            
            for (let i = 0; i < gameData.players.allPlayers.length; i++) {
                const playerData = gameData.players.allPlayers[i];
                const processingInstructions = gameData.processingInstructions[i];
                
                playerPromises.push(
                    processPlayer(playerData, processingInstructions, gameData)
                );
            }
            
            // Process all players in parallel (with reasonable batching)
            const batchSize = 10;
            for (let i = 0; i < playerPromises.length; i += batchSize) {
                const batch = playerPromises.slice(i, i + batchSize);
                const batchResults = await Promise.allSettled(batch);
                
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        results.successful.push(result.value);
                    } else {
                        results.failed.push(result.reason || result.value);
                    }
                    results.totalProcessed++;
                });
            }
            
            console.log(`[playerDataProcessor] Game ${gameData.game.id} processing complete.`);
            console.log(`Successful: ${results.successful.length}, Failed: ${results.failed.length}`);
            
        } catch (error) {
            console.error('[playerDataProcessor] Error processing message:', error);
            // Re-throw to let SQS handle retry logic
            throw error;
        }
    }
    
    // Log final results
    console.log('--- Processing Complete ---');
    console.log(`Total Players Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
        console.error('Failed player processing details:', JSON.stringify(results.failed, null, 2));
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Successfully processed messages.',
            results: {
                totalProcessed: results.totalProcessed,
                successful: results.successful.length,
                failed: results.failed.length
            }
        })
    };
};