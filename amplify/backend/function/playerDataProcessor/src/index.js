/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
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

/*
 * ===================================================================
 * FINAL MERGED Player Data Processor Lambda with Database Monitoring
 *
 * This version combines the advanced business logic from the original
 * index.js (complex targeting, wasNewVenue, skip logic) with the
 * multi-entity support from PDP-index-enhanced.js.
 * 
 * MONITORING ADDED: Complete database operation tracking
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// VENUE ASSIGNMENT CONSTANTS  
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// --- MERGE ---: Added from PDP-index-enhanced.js
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0";

// === DATABASE MONITORING ===
const { LambdaMonitoring } = require('./lambda-monitoring');
const monitoring = new LambdaMonitoring('playerDataProcessor', DEFAULT_ENTITY_ID);

const client = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(client);
const ddbDocClient = monitoring.wrapDynamoDBClient(originalDdbDocClient);

// ===================================================================
// HELPER FUNCTIONS (PRESERVED FROM index.js)
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
 * (Preserved from index.js)
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
        if (daysSinceLastActivity <= 120) return 'Retain_Inactive61-90d';
        if (daysSinceLastActivity <= 180) return 'Churned_91_120d';
        if (daysSinceLastActivity <= 360) return 'Churned_121-180d';
        if (daysSinceLastActivity <= 720) return 'Churned_181_360d';
        return 'Churned_361d';
    }
};

/**
 * Calculate Player targeting classification based on flowchart logic
 * (Preserved from index.js)
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
        if (daysSinceLastPlayed <= 360) return 'Churned_121-180d';
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
        if (daysSinceLastPlayed <= 360) return 'Churned_121-180d';
        if (daysSinceLastPlayed <= 720) return 'Churned_181_360d';
        return 'Churned_361d';
    } catch (error) {
        console.error('[TARGETING] Error fetching PlayerVenue data:', error);
        return 'NotPlayed';
    }
};

/**
 * Generate a deterministic player ID based on name and venue
 * (Preserved from index.js)
 */
const generatePlayerId = (playerName) => {
    const normalized = playerName.toLowerCase().trim();
    const hash = crypto.createHash('sha256')
        .update(normalized)
        .digest('hex');
    return hash.substring(0, 32);
};

// ===================================================================
// MAIN PROCESSING FUNCTIONS (MERGED & REFACTORED)
// ===================================================================

/**
 * Create or update a Player record
 * (Merged: Preserved index.js logic, added entityId)
 *
 * ===================================================================
 * REFACTORED (Nov 2025):
 * 1. Adds conditional logic for date fields based on Game.gameStartDateTime.
 * 2. Only updates lastPlayedDate/targetingClassification if the new game is the LATEST.
 * 3. Back-fills registrationDate/firstGamePlayed/registrationVenueId if the new game is the EARLIEST.
 * 4. Adds 'firstGamePlayed' to new player records.
 * 5. Corrects registrationVenueId logic based on venueAssignmentStatus.
 * ===================================================================
 */
const upsertPlayerRecord = async (playerId, playerName, gameData, playerData, entityId) => {
    console.log(`[PLAYER-UPSERT] Starting upsert for player ${playerName} (${playerId})`);
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();
    const nameParts = parsePlayerName(playerName);
    
    // Use gameStartDateTime as the authoritative timestamp for all logic
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime;
    const gameDate = gameDateTime ? (gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`) : now;
    const gameDateObj = new Date(gameDate);

    try {
        const existingPlayer = await ddbDocClient.send(new GetCommand({
            TableName: playerTable,
            Key: { id: playerId }
        }));

        if (existingPlayer.Item) {
            // Player exists globally. Apply conditional updates.
            console.log(`[PLAYER-UPSERT] Existing player ${playerId} found. Applying conditional logic.`);
            
            monitoring.trackOperation('PLAYER_UPDATE', 'Player', playerId, {
                entityId,
                gameId: gameData.game.id
            });
            
            const currentRegDate = new Date(existingPlayer.Item.registrationDate);
            const currentLastPlayed = new Date(existingPlayer.Item.lastPlayedDate || existingPlayer.Item.registrationDate);

            // Build dynamic update expression
            let updateExpression = 'SET #version = #version + :inc, #ent = :entityId, updatedAt = :now, pointsBalance = pointsBalance + :points';
            let expressionNames = { 
                '#version': '_version',
                '#ent': 'primaryEntityId'
            };
            let expressionValues = {
                ':inc': 1,
                ':entityId': entityId || existingPlayer.Item.primaryEntityId || DEFAULT_ENTITY_ID,
                ':now': now,
                ':points': playerData.points || 0
            };

            // REFACTOR RULE 1: Game is EARLIER than registration date
            if (gameDateObj < currentRegDate) {
                console.log(`[PLAYER-UPSERT] Game date ${gameDate} is earlier than reg date ${existingPlayer.Item.registrationDate}. Back-filling first-play data.`);
                updateExpression += ', registrationDate = :regDate, firstGamePlayed = :firstGame';
                expressionValues[':regDate'] = gameDate;
                expressionValues[':firstGame'] = gameDate;
                
                // Only assign reg venue if it's not pending/unassigned
                const canAssignVenue = gameData.game.venueAssignmentStatus !== "PENDING_ASSIGNMENT" && gameData.game.venueId && gameData.game.venueId !== UNASSIGNED_VENUE_ID;
                if (canAssignVenue) {
                    updateExpression += ', registrationVenueId = :regVenue';
                    expressionValues[':regVenue'] = gameData.game.venueId;
                }
            }

            // REFACTOR RULE 2: Game is LATER than last played date
            if (gameDateObj > currentLastPlayed) {
                console.log(`[PLAYER-UPSERT] Game date ${gameDate} is later than last played ${existingPlayer.Item.lastPlayedDate}. Updating last-play data.`);
                const targetingClassification = await calculatePlayerTargetingClassification(
                    playerId, gameDate, existingPlayer.Item.registrationDate, false
                );
                
                updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                expressionValues[':lastPlayed'] = gameDate;
                expressionValues[':targeting'] = targetingClassification;
            }

            // Only send update if there's something to change (points or dates)
            if (Object.keys(expressionValues).length > 4) { // More than the base 4 values
                 await ddbDocClient.send(new UpdateCommand({
                    TableName: playerTable,
                    Key: { id: playerId },
                    UpdateExpression: updateExpression,
                    ExpressionAttributeNames: expressionNames,
                    ExpressionAttributeValues: expressionValues
                }));
                console.log(`[PLAYER-UPSERT] Updated existing player ${playerId}`);
            } else {
                 console.log(`[PLAYER-UPSERT] No date or point updates for player ${playerId}.`);
            }
            return playerId;
            
        } else {
            // Player does NOT exist globally. Create a new record.
            // This game is by definition the first and last.
            console.log(`[PLAYER-UPSERT] New player ${playerId}. Creating record.`);
            
            monitoring.trackOperation('PLAYER_CREATE', 'Player', playerId, {
                entityId,
                gameId: gameData.game.id,
                playerName
            });
            
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId, gameDate, gameDate, true
            );
            
            // Use game's venue assignment status to determine registration venue
            const canAssignVenue = gameData.game.venueAssignmentStatus !== "PENDING_ASSIGNMENT" && gameData.game.venueId && gameData.game.venueId !== UNASSIGNED_VENUE_ID;

            const newPlayer = {
                id: playerId,
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                givenName: nameParts.givenName,
                registrationDate: gameDate,
                firstGamePlayed: gameDate, // REFACTOR: Added this field
                registrationVenueId: canAssignVenue ? gameData.game.venueId : null, // REFACTOR: Corrected logic
                status: 'ACTIVE',
                category: 'NEW',
                lastPlayedDate: gameDate,
                targetingClassification: targetingClassification,
                venueAssignmentStatus: canAssignVenue ? 'AUTO_ASSIGNED' : 'PENDING_ASSIGNMENT', // REFACTOR: Corrected logic
                creditBalance: 0,
                pointsBalance: playerData.points || 0,
                primaryEntityId: entityId || DEFAULT_ENTITY_ID,
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
        if (error.name !== 'ConditionalCheckFailedException') {
            console.error(`[PLAYER-UPSERT] CRITICAL ERROR for ${playerName}:`, error);
            monitoring.trackOperation('PLAYER_ERROR', 'Player', playerId, {
                error: error.message,
                entityId
            });
        } else {
             console.warn(`[PLAYER-UPSERT] Condition check failed for ${playerName}, likely race condition. Skipping.`);
        }
        // Re-throw to fail SQS message processing if it's a real error
        if (error.name !== 'ConditionalCheckFailedException') {
            throw error;
        }
    }
};

/**
 * Upserts a PlayerEntry record
 * (Merged: Preserved index.js logic [Update/Catch/Put], added entityId)
 */
// --- MERGE ---: Added entityId parameter
const upsertPlayerEntry = async (playerId, gameData, entityId) => {
    console.log(`[ENTRY-UPSERT] Starting upsert for game ${gameData.game.id}.`);
    const playerEntryTable = getTableName('PlayerEntry');
    const entryId = `${gameData.game.id}#${playerId}`; // Preserved from index.js
    const now = new Date().toISOString();

    try {
        // Try to update existing record to 'COMPLETED'
        await ddbDocClient.send(new UpdateCommand({
            TableName: playerEntryTable,
            Key: { id: entryId },
            // --- MERGE ---: Added entityId = :entityId
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, entityId = :entityId',
            ExpressionAttributeNames: { '#status': 'status' },
            // --- MERGE ---: Added :entityId
            ExpressionAttributeValues: {
                ':status': 'COMPLETED',
                ':updatedAt': now,
                ':entityId': entityId || DEFAULT_ENTITY_ID
            },
            ConditionExpression: 'attribute_exists(id)'
        }));
        console.log(`[ENTRY-UPSERT] Updated existing entry for ${playerId}.`);
        
        monitoring.trackOperation('ENTRY_UPDATE', 'PlayerEntry', entryId, {
            playerId,
            gameId: gameData.game.id,
            entityId
        });
    } catch (error) {
        // If update fails, item does not exist, so create it
        if (error.name === 'ConditionalCheckFailedException') {
            console.log(`[ENTRY-UPSERT] Entry not found, creating new COMPLETED entry.`);
            
            monitoring.trackOperation('ENTRY_CREATE', 'PlayerEntry', entryId, {
                playerId,
                gameId: gameData.game.id,
                entityId
            });
            
            const newEntry = {
                id: entryId,
                playerId: playerId,
                gameId: gameData.game.id,
                venueId: gameData.game.venueId,
                // --- MERGE ---: Added entityId
                entityId: entityId || DEFAULT_ENTITY_ID,
                status: 'COMPLETED',
                registrationTime: gameData.game.gameStartDateTime,
                gameStartDateTime: gameData.game.gameStartDateTime,
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
                monitoring.trackOperation('ENTRY_ERROR', 'PlayerEntry', entryId, {
                    error: putError.message,
                    entityId
                });
                throw putError;
            }
        } else {
            console.error(`[ENTRY-UPSERT] Unexpected error:`, error);
            monitoring.trackOperation('ENTRY_ERROR', 'PlayerEntry', entryId, {
                error: error.message,
                entityId
            });
            throw error;
        }
    }
};

/**
 * Create PlayerResult record
 * (Merged: Preserved index.js logic [incl. venueId], added entityId)
 */
// --- MERGE ---: Added entityId parameter
const createPlayerResult = async (playerId, gameData, playerData, entityId) => {
    console.log(`[RESULT-CREATE] Attempting result creation for ${playerId}.`);
    const playerResultTable = getTableName('PlayerResult');
    const resultId = `${playerId}#${gameData.game.id}`;
    const now = new Date().toISOString();
    
    monitoring.trackOperation('RESULT_CREATE', 'PlayerResult', resultId, {
        playerId,
        gameId: gameData.game.id,
        finishingPlace: playerData.rank,
        entityId
    });
    
    try {
        const playerResult = {
            id: resultId,
            playerId: playerId,
            gameId: gameData.game.id,
            venueId: gameData.game.venueId, // Preserved from index.js
            // --- MERGE ---: Added entityId
            entityId: entityId || DEFAULT_ENTITY_ID,
            finishingPlace: playerData.rank || null,
            prizeWon: playerData.winnings > 0 || playerData.isQualification || false,
            amountWon: playerData.winnings || 0,
            pointsEarned: playerData.points || 0,
            isMultiDayQualification: playerData.isQualification || false,
            totalRunners: gameData.game.totalEntries || gameData.players.totalPlayers,
            gameStartDateTime: gameData.game.gameStartDateTime || gameData.game.gameEndDateTime || now, // Added for sorting support
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
        monitoring.trackOperation('RESULT_ERROR', 'PlayerResult', resultId, {
            error: error.message,
            entityId
        });
        throw error;
    }
};

/**
 * Update or create PlayerSummary record
 * (Merged: Preserved index.js logic [wasNewVenue], added entityId)
 */
// --- MERGE ---: Added entityId parameter
const upsertPlayerSummary = async (playerId, gameData, playerData, wasNewVenue, entityId) => {
    console.log(`[SUMMARY-UPSERT] Starting upsert for player ${playerId}. (NewVenue: ${wasNewVenue})`);
    const playerSummaryTable = getTableName('PlayerSummary');
    const summaryId = `${playerId}`;
    const now = new Date().toISOString();
    
    // Use gameStartDateTime as the authoritative timestamp
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime;

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
            
            monitoring.trackOperation('SUMMARY_UPDATE', 'PlayerSummary', summaryId, {
                playerId,
                entityId,
                wasNewVenue
            });
            
            // REFACTOR: Apply conditional date logic to lastPlayed
            const currentLastPlayed = new Date(existingSummary.Item.lastPlayed);
            const gameDateObj = new Date(gameDateTime);
            
            let updateExpression = `
                SET sessionsPlayed = sessionsPlayed + :one,
                    tournamentsPlayed = tournamentsPlayed + :one,
                    tournamentWinnings = tournamentWinnings + :winnings,
                    tournamentBuyIns = tournamentBuyIns + :buyIn,
                    tournamentITM = tournamentITM + :itm,
                    tournamentsCashed = tournamentsCashed + :cash,
                    totalWinnings = totalWinnings + :winnings,
                    totalBuyIns = totalBuyIns + :buyIn,
                    netBalance = netBalance + :profitLoss,
                    venuesVisited = venuesVisited + :venueInc,
                    updatedAt = :updatedAt,
                    #v = if_not_exists(#v, :zero) + :one,
                    #ent = :entityId
            `;
            let expressionNames = {
                '#v': '_version', // <-- Changed to #v
                '#ent': 'entityId'
            };
            let expressionValues = {
                ':one': 1,
                ':winnings': winningsAmount,
                ':buyIn': buyInAmount,
                ':itm': isITM ? 1 : 0,
                ':cash': isCash ? 1 : 0,
                ':profitLoss': winningsAmount - buyInAmount,
                ':venueInc': wasNewVenue ? 1 : 0, 
                ':updatedAt': now,
                ':entityId': entityId || existingSummary.Item.entityId || DEFAULT_ENTITY_ID,
                ':zero': 0 // <-- Add this
            };
            
            // REFACTOR RULE: Only update lastPlayed if this game is later
            if (gameDateObj > currentLastPlayed) {
                console.log(`[SUMMARY-UPSERT] Updating lastPlayed date.`);
                updateExpression += ', #lastPlayed = :lastPlayed';
                expressionNames['#lastPlayed'] = 'lastPlayed';
                expressionValues[':lastPlayed'] = gameDateTime;
            }

            await ddbDocClient.send(new UpdateCommand({
                TableName: playerSummaryTable,
                Key: { id: summaryId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionNames,
                ExpressionAttributeValues: expressionValues
            }));
            console.log(`[SUMMARY-UPSERT] Updated existing summary.`);
        } else {
            
            monitoring.trackOperation('SUMMARY_CREATE', 'PlayerSummary', summaryId, {
                playerId,
                entityId
            });
            
            const newSummary = {
                id: summaryId,
                playerId: playerId,
                // --- MERGE ---: Added entityId
                entityId: entityId || DEFAULT_ENTITY_ID,
                sessionsPlayed: 1,
                tournamentsPlayed: 1,
                cashGamesPlayed: 0,
                venuesVisited: 1, 
                tournamentWinnings: winningsAmount,
                tournamentBuyIns: buyInAmount,
                tournamentITM: isITM ? 1 : 0,
                tournamentsCashed: isCash ? 1 : 0,
                cashGameWinnings: 0,
                cashGameBuyIns: 0,
                totalWinnings: winningsAmount,
                totalBuyIns: buyInAmount,
                netBalance: winningsAmount - buyInAmount,
                lastPlayed: gameDateTime, // REFACTOR: Set based on game date
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
        monitoring.trackOperation('SUMMARY_ERROR', 'PlayerSummary', summaryId, {
            error: error.message,
            entityId
        });
        throw error;
    }
};

/**
 * Update or create PlayerVenue record
 * (Merged: Preserved index.js logic [returns wasNewVenue], added entityId)
 *
 * ===================================================================
 * REFACTORED (Nov 2025):
 * 1. Adds conditional logic for date fields based on Game.gameStartDateTime.
 * 2. Only updates lastPlayedDate/targetingClassification if the new game is the LATEST for this venue.
 * 3. Back-fills firstPlayedDate if the new game is the EARLIEST for this venue.
 * ===================================================================
 */
const upsertPlayerVenue = async (playerId, gameData, playerData, entityId) => {
    console.log(`[VENUE-UPSERT] Starting upsert for player ${playerId} at venue ${gameData.game.venueId}.`);
    
    // This logic is correct and preserved
    if (!gameData.game.venueId || gameData.game.venueId === UNASSIGNED_VENUE_ID) {
        console.log(`[VENUE-UPSERT] Skipping - venue is unassigned for game ${gameData.game.id}`);
        return { success: true, skipped: true, wasNewVenue: false };
    }
    
    const playerVenueTable = getTableName('PlayerVenue');
    const playerVenueId = `${playerId}#${gameData.game.venueId}`;
    const now = new Date().toISOString();
    
    // Use gameStartDateTime as the authoritative timestamp
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime;
    const gameDate = gameDateTime ? (gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`) : now;
    const gameDateObj = new Date(gameDate);
    
    const currentGameBuyIn = (gameData.game.buyIn || 0) + (gameData.game.rake || 0);
    
    try {
        const existingRecord = await ddbDocClient.send(new GetCommand({
            TableName: playerVenueTable,
            Key: { id: playerVenueId }
        }));
        
        if (existingRecord.Item) {
            // PlayerVenue exists. Apply conditional updates.
            
            monitoring.trackOperation('PLAYERVENUE_UPDATE', 'PlayerVenue', playerVenueId, {
                playerId,
                venueId: gameData.game.venueId,
                entityId
            });
            
            const currentFirstPlayed = new Date(existingRecord.Item.firstPlayedDate);
            const currentLastPlayed = new Date(existingRecord.Item.lastPlayedDate);

            // Calculate metrics that are always updated
            const oldGamesPlayed = existingRecord.Item.totalGamesPlayed || 0;
            const oldAverageBuyIn = existingRecord.Item.averageBuyIn || 0;
            const newTotalGames = oldGamesPlayed + 1;
            const newAverageBuyIn = newTotalGames > 0
                ? ((oldAverageBuyIn * oldGamesPlayed) + currentGameBuyIn) / newTotalGames
                : currentGameBuyIn;

            // Build dynamic update expression
            let updateExpression = 'SET #version = #version + :inc, #ent = :entityId, updatedAt = :updatedAt, totalGamesPlayed = totalGamesPlayed + :inc, averageBuyIn = :newAverageBuyIn';
            let expressionNames = {
                '#version': '_version',
                '#ent': 'entityId'
            };
            let expressionValues = {
                ':inc': 1,
                ':entityId': entityId || existingRecord.Item.entityId || DEFAULT_ENTITY_ID,
                ':updatedAt': now,
                ':newAverageBuyIn': newAverageBuyIn
            };

            // REFACTOR RULE 1: Game is EARLIER than first played date
            if (gameDateObj < currentFirstPlayed) {
                console.log(`[VENUE-UPSERT] Game date ${gameDate} is earlier than first played ${existingRecord.Item.firstPlayedDate}. Back-filling.`);
                updateExpression += ', firstPlayedDate = :firstPlayed';
                expressionValues[':firstPlayed'] = gameDate;
            }

            // REFACTOR RULE 2: Game is LATER than last played date
            if (gameDateObj > currentLastPlayed) {
                console.log(`[VENUE-UPSERT] Game date ${gameDate} is later than last played ${existingRecord.Item.lastPlayedDate}. Updating.`);
                const targetingClassification = calculatePlayerVenueTargetingClassification(
                    gameDate, // Use new game date as last activity
                    existingRecord.Item.membershipCreatedDate
                );
                
                updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                expressionValues[':lastPlayed'] = gameDate;
                expressionValues[':targeting'] = targetingClassification;
            }

            await ddbDocClient.send(new UpdateCommand({
                TableName: playerVenueTable,
                Key: { id: playerVenueId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames: expressionNames,
                ExpressionAttributeValues: expressionValues
            }));
            
            console.log(`[VENUE-UPSERT] Updated existing PlayerVenue record.`);
            return { wasNewVenue: false };

        } else {
            // PlayerVenue does NOT exist. Create new.
            // This game is by definition the first and last.
            
            monitoring.trackOperation('PLAYERVENUE_CREATE', 'PlayerVenue', playerVenueId, {
                playerId,
                venueId: gameData.game.venueId,
                entityId
            });
            
            const targetingClassification = calculatePlayerVenueTargetingClassification(
                gameDate, // lastActivityDate
                gameDate  // membershipCreatedDate
            );
            
            const newPlayerVenue = {
                id: playerVenueId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                // --- MERGE ---: Added entityId
                entityId: entityId || DEFAULT_ENTITY_ID,
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
            return { wasNewVenue: true }; // Preserved from index.js
        }
        
    } catch (error) {
        console.error(`[VENUE-UPSERT] CRITICAL ERROR:`, error);
        monitoring.trackOperation('PLAYERVENUE_ERROR', 'PlayerVenue', playerVenueId, {
            error: error.message,
            entityId
        });
        throw error;
    }
};


/**
 * Create PlayerTransaction records
 * (Merged: Preserved index.js logic [uuidv4, BatchWrite], added entityId)
 */
// --- MERGE ---: Added entityId parameter, REFACTOR: Removed processingInstructions dependency
const createPlayerTransactions = async (playerId, gameData, playerData, entityId) => {
    console.log(`[TRANSACTION-CREATE] Starting creation for player ${playerId}.`);
    const playerTransactionTable = getTableName('PlayerTransaction');
    const transactions = [];
    const now = new Date().toISOString();
    
    // Use gameStartDateTime as the authoritative timestamp
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime;

    // Build transactions directly from gameData and playerData
    const transactionsToCreate = [];
    
    // Always create BUY_IN transaction
    const buyInAmount = (gameData.game.buyIn || 0) + (gameData.game.rake || 0);
    transactionsToCreate.push({
        type: 'BUY_IN',
        amount: buyInAmount,
        rake: gameData.game.rake || 0,
        paymentSource: 'CASH'
    });
    
    // Add QUALIFICATION transaction if player qualified
    if (playerData.isQualification) {
        transactionsToCreate.push({
            type: 'QUALIFICATION',
            amount: 0,
            rake: 0,
            paymentSource: 'UNKNOWN'
        });
    }
    
    monitoring.trackOperation('TRANSACTIONS_BATCH', 'PlayerTransaction', playerId, {
        count: transactionsToCreate.length,
        gameId: gameData.game.id,
        entityId
    });
    
    try {
        for (const transaction of transactionsToCreate) {
            const transactionId = uuidv4(); // Preserved from index.js
            
            const playerTransaction = {
                id: transactionId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                gameId: gameData.game.id,
                // --- MERGE ---: Added entityId
                entityId: entityId || DEFAULT_ENTITY_ID,
                type: transaction.type,
                amount: transaction.amount,
                paymentSource: transaction.paymentSource,
                transactionDate: gameDateTime, // Use authoritative date
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
        monitoring.trackOperation('TRANSACTIONS_ERROR', 'PlayerTransaction', playerId, {
            error: error.message,
            entityId
        });
        throw error;
    }
};

/**
 * Process a single player
 * (Merged: Preserved index.js logic [skip, call order], added entityId)
 */
const processPlayer = async (playerData, gameData) => {
    const playerName = playerData.name;
    const playerResultTable = getTableName('PlayerResult');
    // --- MERGE ---: Added entityId extraction
    const entityId = gameData.game.entityId || DEFAULT_ENTITY_ID;
    
    // Update monitoring context
    monitoring.entityId = entityId;
    
    try {
        const playerId = generatePlayerId(playerName);
        const resultId = `${playerId}#${gameData.game.id}`;

        // --- MERGE ---: Added entityId to log
        console.log(`[PROCESS-PLAYER] Starting processing for player: ${playerName} (ID: ${playerId}) with entity ${entityId}`);

        // Track player processing start
        monitoring.trackOperation('PLAYER_PROCESS_START', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId
        });

        // Preserved skip logic from index.js
        const existingResult = await ddbDocClient.send(new GetCommand({
            TableName: playerResultTable,
            Key: { id: resultId }
        }));

        if (existingResult.Item) {
            console.log(`[PROCESS-PLAYER] SKIPPING: Result already exists for game ${gameData.game.id}`);
            monitoring.trackOperation('PLAYER_SKIPPED', 'PlayerProcessing', playerId, {
                reason: 'Result exists',
                gameId: gameData.game.id,
                entityId
            });
            // --- MERGE ---: Added entityId to return
            return { success: true, playerName, playerId, entityId, status: 'SKIPPED' };
        }
        
        // --- MERGE ---: All calls updated to pass entityId
        
        console.log(`[PROCESS-PLAYER] Step 1: upsertPlayerRecord...`);
        await upsertPlayerRecord(playerId, playerName, gameData, playerData, entityId);
        
        console.log(`[PROCESS-PLAYER] Step 2: createPlayerResult...`);
        await createPlayerResult(playerId, gameData, playerData, entityId);
        
        // Call order preserved from index.js
        console.log(`[PROCESS-PLAYER] Step 3: upsertPlayerVenue...`);
        const { wasNewVenue } = await upsertPlayerVenue(playerId, gameData, playerData, entityId);
        
        console.log(`[PROCESS-PLAYER] Step 4: upsertPlayerSummary...`);
        await upsertPlayerSummary(playerId, gameData, playerData, wasNewVenue, entityId);
        
        console.log(`[PROCESS-PLAYER] Step 5: createPlayerTransactions...`);
        await createPlayerTransactions(playerId, gameData, playerData, entityId);
        
        console.log(`[PROCESS-PLAYER] Step 6: upsertPlayerEntry...`);
        await upsertPlayerEntry(playerId, gameData, entityId);

        // Track successful completion
        monitoring.trackOperation('PLAYER_PROCESS_COMPLETE', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId,
            wasNewVenue
        });

        // --- MERGE ---: Added entityId to log
        console.log(`[PROCESS-PLAYER] SUCCESS: Player ${playerName} completely processed with entity ${entityId}`);
        // --- MERGE ---: Added entityId to return
        return { success: true, playerName, playerId, entityId, status: 'PROCESSED' };
        
    } catch (error) {
        console.error(`[PROCESS-PLAYER] CRITICAL FAILURE for player ${playerName}:`, error);
        
        monitoring.trackOperation('PLAYER_PROCESS_ERROR', 'PlayerProcessing', playerName, {
            error: error.message,
            gameId: gameData.game.id,
            entityId
        });
        
        // --- MERGE ---: Added entityId to return
        return { success: false, playerName, entityId, error: error.message };
    }
};

/**
 * Main Lambda handler
 * (Merged: Added entityId reporting)
 */
exports.handler = async (event) => {
    console.log('[HANDLER] START: Player Data Processor invoked.');
    console.log('Received Lambda Event (Raw):', JSON.stringify(event, null, 2));

    // Track Lambda invocation
    monitoring.trackOperation('LAMBDA_START', 'Handler', 'playerDataProcessor', {
        recordCount: event.Records?.length || 0
    });

    // --- MERGE ---: Added entityId to results object
    const results = {
        successful: [],
        failed: [],
        totalProcessed: 0,
        entityId: null
    };
    
    if (!event.Records || event.Records.length === 0) {
        console.warn('[HANDLER] WARNING: No records found in event payload.');
        await monitoring.flush();
        return { statusCode: 204, body: JSON.stringify({ message: 'No records to process.' }) };
    }

    console.log(`[HANDLER] Processing ${event.Records.length} SQS message(s).`);

    for (const record of event.Records) {
        let gameData = null;
        try {
            console.log(`[HANDLER] Processing message ID: ${record.messageId}`);
            
            const messageBody = record.body;
            gameData = JSON.parse(messageBody);
            
            console.log(`[HANDLER] SUCCESS: Message body parsed.`);
            console.log(`[HANDLER] Game ID from SQS: ${gameData.game.id}`);
            
            // --- MERGE ---: Added entityId extraction and logging
            console.log(`[HANDLER] Entity ID from SQS: ${gameData.game.entityId}`);
            if (!results.entityId) {
                results.entityId = gameData.game.entityId || DEFAULT_ENTITY_ID;
            }
            
            // Update monitoring context for this game
            monitoring.entityId = results.entityId;
            
            monitoring.trackOperation('GAME_PROCESS_START', 'Game', gameData.game.id, {
                entityId: results.entityId,
                playerCount: gameData.players?.allPlayers?.length || 0,
                gameStatus: gameData.game.gameStatus
            });
            
            if (!gameData.players) {
                console.error('[HANDLER] CRITICAL ERROR: SQS Payload missing required fields (players).');
                throw new Error('SQS Payload validation failed.');
            }

            const playerPromises = [];
            
            for (let i = 0; i < gameData.players.allPlayers.length; i++) {
                const playerData = gameData.players.allPlayers[i];
                
                playerPromises.push(
                    processPlayer(playerData, gameData)
                );
            }
            
            const batchSize = 10;
            for (let i = 0; i < playerPromises.length; i += batchSize) {
                const batch = playerPromises.slice(i, i + batchSize);
                const batchResults = await Promise.allSettled(batch);
                
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        results.successful.push(result.value);
                    } else {
                        const failureReason = result.reason || result.value;
                        console.error('[HANDLER] Player Processing Failed:', JSON.stringify(failureReason));
                        results.failed.push(failureReason);
                    }
                    results.totalProcessed++;
                });
            }
            
            // Track game completion
            monitoring.trackOperation('GAME_PROCESS_COMPLETE', 'Game', gameData.game.id, {
                entityId: results.entityId,
                successfulPlayers: results.successful.length,
                failedPlayers: results.failed.length
            });
            
            // --- MERGE ---: Added entityId to log
            console.log(`[HANDLER] Game ${gameData.game.id} batch processing completed for entity ${results.entityId}.`);
            
        } catch (error) {
            console.error('[HANDLER] CRITICAL FAILURE: Unhandled error processing SQS message record:', error);
            
            monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', {
                error: error.message,
                gameId: gameData?.game?.id,
                entityId: results.entityId
            });
            
            await monitoring.flush();
            throw error; 
        }
    }
    
    console.log('--- FINAL SUMMARY ---');
    // --- MERGE ---: Added entityId to log
    console.log(`Entity ID: ${results.entityId}`);
    console.log(`Total Players Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    // Track final results
    monitoring.trackOperation('LAMBDA_COMPLETE', 'Handler', 'playerDataProcessor', {
        entityId: results.entityId,
        totalProcessed: results.totalProcessed,
        successful: results.successful.length,
        failed: results.failed.length
    });
    
    // Flush all metrics before Lambda ends
    await monitoring.flush();
    
    if (results.failed.length > 0) {
        console.error('Final result contains failures. Triggering SQS redelivery.');
        throw new Error(`Failed to process ${results.failed.length} players. Check logs for details.`);
    }
    
    // --- MERGE ---: Added entityId to response body
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Successfully processed all messages.',
            entityId: results.entityId,
            results: {
                totalProcessed: results.totalProcessed,
                successful: results.successful.length,
                failed: results.failed.length
            }
        })
    };
};