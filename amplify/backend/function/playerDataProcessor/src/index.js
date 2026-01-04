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
 * TRANSACTIONAL Player Data Processor Lambda
 *
 * VERSION: 2.0.0 - Transactional writes for all-or-nothing consistency
 * 
 * MAJOR CHANGE: Steps 2-6 (PlayerResult, PlayerVenue, PlayerSummary, 
 * PlayerTransactions, PlayerEntry) are now written atomically using 
 * DynamoDB TransactWriteItems.
 * 
 * Either ALL records are created/updated, or NONE are.
 * This prevents orphaned PlayerResult records without matching PlayerEntry.
 * 
 * Step 1 (upsertPlayerRecord/Player table) remains separate because it has
 * complex async targeting classification logic.
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    PutCommand, 
    UpdateCommand, 
    GetCommand, 
    QueryCommand, 
    BatchWriteCommand,
    TransactWriteCommand  // NEW: For atomic writes
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// VENUE ASSIGNMENT CONSTANTS  
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// ===================================================================
// ENTITY ID HELPER
// ===================================================================

const resolveEntityId = (providedEntityId, existingEntityId = null, context = 'unknown') => {
    if (providedEntityId) {
        return providedEntityId;
    }
    
    if (existingEntityId) {
        console.warn(`[ENTITY-RESOLVE] ${context}: Using existing record entityId (game data missing entityId)`);
        return existingEntityId;
    }
    
    if (process.env.DEFAULT_ENTITY_ID) {
        console.warn(
            `[ENTITY-RESOLVE] ${context}: entityId missing from game data, using DEFAULT_ENTITY_ID env var. ` +
            `This indicates upstream (saveGameFunction/webScraperFunction) may not be passing entityId.`
        );
        return process.env.DEFAULT_ENTITY_ID;
    }
    
    throw new Error(
        `[playerDataProcessor] ${context}: entityId is required but was not provided. ` +
        `Expected in gameData.game.entityId. ` +
        `Set DEFAULT_ENTITY_ID environment variable as fallback via: amplify update function`
    );
};

// ===================================================================
// ENTITY-AWARE HELPERS
// ===================================================================

const generateVisitKey = (playerId, entityId, venueId) => {
    return `${playerId}#${entityId}#${venueId}`;
};

const getVenueInfo = async (venueId) => {
    if (!venueId || venueId === UNASSIGNED_VENUE_ID) {
        return { canonicalVenueId: null };
    }
    
    try {
        const venueTable = getTableName('Venue');
        const result = await ddbDocClient.send(new GetCommand({
            TableName: venueTable,
            Key: { id: venueId },
            ProjectionExpression: 'id, canonicalVenueId'
        }));
        
        if (result.Item) {
            return { 
                canonicalVenueId: result.Item.canonicalVenueId || result.Item.id 
            };
        }
        
        return { canonicalVenueId: venueId };
    } catch (error) {
        console.warn(`[VENUE-INFO] Error fetching venue ${venueId}:`, error.message);
        return { canonicalVenueId: venueId };
    }
};

const findPlayerVenueByVisitKey = async (visityKey, playerId = null, venueId = null) => {
    const playerVenueTable = getTableName('PlayerVenue');
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: playerVenueTable,
            IndexName: 'byVisitKey',
            KeyConditionExpression: 'visityKey = :vk',
            ExpressionAttributeValues: { ':vk': visityKey }
        }));
        
        if (result.Items && result.Items.length > 0) {
            return result.Items[0];
        }
    } catch (error) {
        console.warn(`[PLAYERVENUE-LOOKUP] Error querying by visityKey:`, error.message);
    }
    
    // Fallback: Try legacy ID format
    if (playerId && venueId) {
        try {
            const legacyId = `${playerId}#${venueId}`;
            const legacyResult = await ddbDocClient.send(new GetCommand({
                TableName: playerVenueTable,
                Key: { id: legacyId }
            }));
            
            if (legacyResult.Item) {
                console.log(`[PLAYERVENUE-LOOKUP] Found legacy record with id: ${legacyId}`);
                return legacyResult.Item;
            }
        } catch (error) {
            console.warn(`[PLAYERVENUE-LOOKUP] Error fetching legacy record:`, error.message);
        }
    }
    
    return null;
};

// === DATABASE MONITORING ===
const { LambdaMonitoring } = require('./lambda-monitoring');
const monitoring = new LambdaMonitoring('playerDataProcessor', 'pending-entity');

const client = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(client);
const ddbDocClient = monitoring.wrapDynamoDBClient(originalDdbDocClient);

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (!apiId || !env) {
        throw new Error(`API ID or environment name not found in environment variables.`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

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

const daysBetween = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
};

const calculatePlayerVenueTargetingClassification = (lastActivityDate, membershipCreatedDate) => {
    const now = new Date();
    
    if (!lastActivityDate) {
        if (!membershipCreatedDate) return 'NotActivated_EL';
        
        const daysSinceMembership = daysBetween(membershipCreatedDate, now);
        
        if (daysSinceMembership <= 30) return 'NotActivated_EL';
        if (daysSinceMembership <= 60) return 'NotActivated_31_60d';
        if (daysSinceMembership <= 90) return 'NotActivated_61_90d';
        if (daysSinceMembership <= 120) return 'NotActivated_91_120d';
        if (daysSinceMembership <= 180) return 'NotActivated_121_180d';
        if (daysSinceMembership <= 360) return 'NotActivated_181_360d';
        return 'Not Activated - 361d+';
    } else {
        const daysSinceLastActivity = daysBetween(lastActivityDate, now);
        
        if (daysSinceLastActivity <= 30) return 'Active_EL'; 
        if (daysSinceLastActivity <= 60) return 'Retain_Inactive31_60d';
        if (daysSinceLastActivity <= 90) return 'Retain_Inactive61_90d';
        if (daysSinceLastActivity <= 120) return 'Churned_91_120d';
        if (daysSinceLastActivity <= 180) return 'Churned_121_180d';
        if (daysSinceLastActivity <= 360) return 'Churned_181_360d';
        
        return 'Churned_361d';
    }
};

const calculatePlayerTargetingClassification = async (playerId, lastPlayedDate, registrationDate, isNewPlayer = false) => {
    const now = new Date();

    const getStatusFromDays = (days) => {
        if (days <= 30) return 'Active_EL';
        if (days <= 60) return 'Retain_Inactive31_60d';
        if (days <= 90) return 'Retain_Inactive61_90d';
        if (days <= 120) return 'Churned_91_120d';
        if (days <= 180) return 'Churned_121_180d';
        if (days <= 360) return 'Churned_181_360d';
        return 'Churned_361d';
    };

    if (isNewPlayer) {
        console.log(`[TARGETING] New player ${playerId}. Classifying based on game date: ${lastPlayedDate}`);
        if (!lastPlayedDate) {
            return 'NotPlayed'; 
        }
        const daysSinceLastPlayed = daysBetween(lastPlayedDate, now);
        return getStatusFromDays(daysSinceLastPlayed);
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
            const newPlayerClassifications = ['Active_EL', 'Retain_Inactive31_60d', 'Retain_Inactive61_90d'];
            if (newPlayerClassifications.includes(venueClassification)) {
                return venueClassification;
            }
        }
        
        if (!lastPlayedDate) return 'NotPlayed';
        const daysSinceLastPlayed = daysBetween(lastPlayedDate, now);
        
        return getStatusFromDays(daysSinceLastPlayed);

    } catch (error) {
        console.error('[TARGETING] Error fetching PlayerVenue data:', error);
        return 'NotPlayed';
    }
};

const generatePlayerId = (playerName) => {
    const normalized = playerName.toLowerCase().trim();
    const hash = crypto.createHash('sha256')
        .update(normalized)
        .digest('hex');
    return hash.substring(0, 32);
};

// ===================================================================
// PLAYER RECORD (Step 1 - Separate from transaction due to async logic)
// ===================================================================

const upsertPlayerRecord = async (playerId, playerName, gameData, playerData, entityId) => {
    console.log(`[PLAYER-UPSERT] Starting upsert for player ${playerName} (${playerId})`);
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();
    const nameParts = parsePlayerName(playerName);
    
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime;
    const gameDate = gameDateTime ? (gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`) : now;
    const gameDateObj = new Date(gameDate);

    try {
        const existingPlayer = await ddbDocClient.send(new GetCommand({
            TableName: playerTable,
            Key: { id: playerId }
        }));

        if (existingPlayer.Item) {
            console.log(`[PLAYER-UPSERT] Existing player ${playerId} found. Applying conditional logic.`);
            
            monitoring.trackOperation('PLAYER_UPDATE', 'Player', playerId, {
                entityId,
                gameId: gameData.game.id
            });
            
            const currentRegDate = new Date(existingPlayer.Item.registrationDate);
            const currentLastPlayed = new Date(existingPlayer.Item.lastPlayedDate || existingPlayer.Item.registrationDate);

            const effectiveEntityId = resolveEntityId(
                entityId, 
                existingPlayer.Item.primaryEntityId, 
                `upsertPlayerRecord(${playerId})`
            );

            let updateExpression = 'SET #version = #version + :inc, #ent = :entityId, updatedAt = :now, pointsBalance = pointsBalance + :points';
            let expressionNames = { 
                '#version': '_version',
                '#ent': 'primaryEntityId'
            };
            let expressionValues = {
                ':inc': 1,
                ':entityId': effectiveEntityId,
                ':now': now,
                ':points': playerData.points || 0
            };

            if (gameDateObj < currentRegDate) {
                console.log(`[PLAYER-UPSERT] Game date ${gameDate} is earlier than reg date. Back-filling.`);
                updateExpression += ', registrationDate = :regDate, firstGamePlayed = :firstGame';
                expressionValues[':regDate'] = gameDate;
                expressionValues[':firstGame'] = gameDate;
                
                const canAssignVenue = gameData.game.venueAssignmentStatus !== "PENDING_ASSIGNMENT" && gameData.game.venueId && gameData.game.venueId !== UNASSIGNED_VENUE_ID;
                if (canAssignVenue) {
                    updateExpression += ', registrationVenueId = :regVenue';
                    expressionValues[':regVenue'] = gameData.game.venueId;
                }
            }

            if (gameDateObj > currentLastPlayed) {
                console.log(`[PLAYER-UPSERT] Game date ${gameDate} is later than last played. Updating.`);
                const targetingClassification = await calculatePlayerTargetingClassification(
                    playerId, gameDate, existingPlayer.Item.registrationDate, false
                );
                
                updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                expressionValues[':lastPlayed'] = gameDate;
                expressionValues[':targeting'] = targetingClassification;
            }

            if (Object.keys(expressionValues).length > 4) {
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
            console.log(`[PLAYER-UPSERT] New player ${playerId}. Creating record.`);
            
            const effectiveEntityId = resolveEntityId(entityId, null, `upsertPlayerRecord-new(${playerId})`);
            
            monitoring.trackOperation('PLAYER_CREATE', 'Player', playerId, {
                entityId: effectiveEntityId,
                gameId: gameData.game.id,
                playerName
            });
            
            const targetingClassification = await calculatePlayerTargetingClassification(
                playerId, gameDate, gameDate, true
            );
            
            const canAssignVenue = gameData.game.venueAssignmentStatus !== "PENDING_ASSIGNMENT" && gameData.game.venueId && gameData.game.venueId !== UNASSIGNED_VENUE_ID;

            const newPlayer = {
                id: playerId,
                firstName: nameParts.firstName,
                lastName: nameParts.lastName,
                givenName: nameParts.givenName,
                registrationDate: gameDate,
                firstGamePlayed: gameDate,
                registrationVenueId: canAssignVenue ? gameData.game.venueId : null,
                status: 'ACTIVE',
                category: 'NEW',
                lastPlayedDate: gameDate,
                targetingClassification: targetingClassification,
                venueAssignmentStatus: canAssignVenue ? 'AUTO_ASSIGNED' : 'PENDING_ASSIGNMENT',
                creditBalance: 0,
                pointsBalance: playerData.points || 0,
                primaryEntityId: effectiveEntityId,
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
        if (error.name !== 'ConditionalCheckFailedException') {
            throw error;
        }
    }
};

// ===================================================================
// TRANSACTIONAL PLAYER PROCESSING (Steps 2-6)
// ===================================================================

/**
 * Process Steps 2-6 atomically using DynamoDB TransactWriteItems
 * 
 * Either ALL of these are written, or NONE:
 * - PlayerResult
 * - PlayerVenue (update or create)
 * - PlayerSummary (update or create)
 * - PlayerTransaction(s)
 * - PlayerEntry (update or create)
 */
const processPlayerRecordsTransactional = async (playerId, playerName, gameData, playerData, entityId) => {
    console.log(`[TXN-PROCESS] Starting transactional processing for ${playerName} (${playerId})`);
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Table names
    const playerResultTable = getTableName('PlayerResult');
    const playerVenueTable = getTableName('PlayerVenue');
    const playerSummaryTable = getTableName('PlayerSummary');
    const playerTransactionTable = getTableName('PlayerTransaction');
    const playerEntryTable = getTableName('PlayerEntry');
    
    // Record IDs
    const resultId = `${playerId}#${gameData.game.id}`;
    const summaryId = playerId;
    const entryId = `${gameData.game.id}#${playerId}`;
    
    // Game metadata
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime || now;
    const gameDate = gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`;
    const gameDateObj = new Date(gameDate);
    
    const buyInAmount = gameData.game.buyIn || 0;
    const rakeAmount = gameData.game.rake || 0;
    const winningsAmount = playerData.winnings || 0;
    const isITM = winningsAmount > 0 || playerData.isQualification;
    const isCash = winningsAmount > 0;
    
    const skipVenueProcessing = !gameData.game.venueId || gameData.game.venueId === UNASSIGNED_VENUE_ID;
    
    // ===================================================================
    // PHASE 1: Pre-fetch existing records (parallel)
    // ===================================================================
    console.log(`[TXN-PROCESS] Phase 1: Pre-fetching existing records...`);
    
    const visityKey = skipVenueProcessing ? null : generateVisitKey(playerId, entityId, gameData.game.venueId);
    
    const [existingResult, existingSummary, existingEntry, existingVenue, venueInfo] = await Promise.all([
        // PlayerResult
        ddbDocClient.send(new GetCommand({
            TableName: playerResultTable,
            Key: { id: resultId }
        })).then(r => r.Item).catch(() => null),
        
        // PlayerSummary
        ddbDocClient.send(new GetCommand({
            TableName: playerSummaryTable,
            Key: { id: summaryId }
        })).then(r => r.Item).catch(() => null),
        
        // PlayerEntry
        ddbDocClient.send(new GetCommand({
            TableName: playerEntryTable,
            Key: { id: entryId }
        })).then(r => r.Item).catch(() => null),
        
        // PlayerVenue (via index lookup)
        skipVenueProcessing ? Promise.resolve(null) : findPlayerVenueByVisitKey(visityKey, playerId, gameData.game.venueId),
        
        // VenueInfo for canonicalVenueId
        skipVenueProcessing ? Promise.resolve({ canonicalVenueId: null }) : getVenueInfo(gameData.game.venueId)
    ]);
    
    // Skip if PlayerResult already exists
    if (existingResult) {
        console.log(`[TXN-PROCESS] PlayerResult already exists for ${playerName}, skipping`);
        return { success: true, playerName, playerId, status: 'ALREADY_EXISTS', wasNewVenue: false };
    }
    
    const wasNewVenue = !existingVenue && !skipVenueProcessing;
    
    console.log(`[TXN-PROCESS] Pre-fetch complete:`, {
        existingResult: !!existingResult,
        existingSummary: !!existingSummary,
        existingEntry: !!existingEntry,
        existingVenue: !!existingVenue,
        skipVenueProcessing,
        wasNewVenue
    });
    
    // ===================================================================
    // PHASE 2: Build transaction items
    // ===================================================================
    console.log(`[TXN-PROCESS] Phase 2: Building transaction items...`);
    
    const transactItems = [];
    
    // --- 1. PlayerResult (always PUT) ---
    transactItems.push({
        Put: {
            TableName: playerResultTable,
            Item: {
                id: resultId,
                playerId: playerId,
                gameId: gameData.game.id,
                venueId: gameData.game.venueId,
                entityId: entityId,
                finishingPlace: playerData.rank || null,
                prizeWon: isITM,
                amountWon: winningsAmount,
                pointsEarned: playerData.points || 0,
                isMultiDayQualification: playerData.isQualification || false,
                totalRunners: gameData.game.totalUniquePlayers || gameData.players?.totalUniquePlayers || 0,
                gameStartDateTime: gameDateTime,
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: timestamp,
                __typename: 'PlayerResult'
            },
            ConditionExpression: 'attribute_not_exists(id)'
        }
    });
    
    // --- 2. PlayerVenue (PUT or UPDATE) ---
    if (!skipVenueProcessing) {
        if (existingVenue) {
            // UPDATE existing PlayerVenue
            const currentFirstPlayed = new Date(existingVenue.firstPlayedDate);
            const currentLastPlayed = new Date(existingVenue.lastPlayedDate);
            
            const oldGamesPlayed = existingVenue.totalGamesPlayed || 0;
            const oldAverageBuyIn = existingVenue.averageBuyIn || 0;
            const newTotalGames = oldGamesPlayed + 1;
            const newAverageBuyIn = newTotalGames > 0
                ? ((oldAverageBuyIn * oldGamesPlayed) + buyInAmount) / newTotalGames
                : buyInAmount;
            
            let updateExpression = 'SET #version = #version + :inc, updatedAt = :updatedAt, totalGamesPlayed = totalGamesPlayed + :inc, averageBuyIn = :newAverageBuyIn';
            const expressionNames = { '#version': '_version' };
            const expressionValues = {
                ':inc': 1,
                ':updatedAt': now,
                ':newAverageBuyIn': newAverageBuyIn
            };
            
            // Migrate entityId if not set
            if (!existingVenue.entityId) {
                updateExpression += ', entityId = :entityId';
                expressionValues[':entityId'] = entityId;
            }
            
            // Migrate visityKey if not set
            if (!existingVenue.visityKey) {
                updateExpression += ', visityKey = :visityKey';
                expressionValues[':visityKey'] = visityKey;
            }
            
            // Migrate canonicalVenueId if not set
            if (!existingVenue.canonicalVenueId && venueInfo.canonicalVenueId) {
                updateExpression += ', canonicalVenueId = :canonicalVenueId';
                expressionValues[':canonicalVenueId'] = venueInfo.canonicalVenueId;
            }
            
            // Update firstPlayedDate if this game is earlier
            if (gameDateObj < currentFirstPlayed) {
                updateExpression += ', firstPlayedDate = :firstPlayed';
                expressionValues[':firstPlayed'] = gameDate;
            }
            
            // Update lastPlayedDate if this game is later
            if (gameDateObj > currentLastPlayed) {
                const targetingClassification = calculatePlayerVenueTargetingClassification(
                    gameDate,
                    existingVenue.membershipCreatedDate
                );
                updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                expressionValues[':lastPlayed'] = gameDate;
                expressionValues[':targeting'] = targetingClassification;
            }
            
            transactItems.push({
                Update: {
                    TableName: playerVenueTable,
                    Key: { id: existingVenue.id },
                    UpdateExpression: updateExpression,
                    ExpressionAttributeNames: expressionNames,
                    ExpressionAttributeValues: expressionValues
                }
            });
        } else {
            // PUT new PlayerVenue
            const newPlayerVenueId = uuidv4();
            const targetingClassification = calculatePlayerVenueTargetingClassification(gameDate, gameDate);
            
            transactItems.push({
                Put: {
                    TableName: playerVenueTable,
                    Item: {
                        id: newPlayerVenueId,
                        playerId: playerId,
                        venueId: gameData.game.venueId,
                        entityId: entityId,
                        visityKey: visityKey,
                        canonicalVenueId: venueInfo.canonicalVenueId,
                        membershipCreatedDate: gameDate,
                        firstPlayedDate: gameDate,
                        lastPlayedDate: gameDate,
                        totalGamesPlayed: 1,
                        averageBuyIn: buyInAmount,
                        totalBuyIns: buyInAmount,
                        totalWinnings: 0,
                        netProfit: 0,
                        targetingClassification: targetingClassification,
                        createdAt: now,
                        updatedAt: now,
                        _version: 1,
                        _lastChangedAt: timestamp,
                        __typename: 'PlayerVenue'
                    }
                }
            });
        }
    }
    
    // --- 3. PlayerSummary (PUT or UPDATE) ---
    if (existingSummary) {
        // UPDATE existing PlayerSummary
        const currentLastPlayed = new Date(existingSummary.lastPlayed);
        
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
        const expressionNames = {
            '#v': '_version',
            '#ent': 'entityId'
        };
        const expressionValues = {
            ':one': 1,
            ':winnings': winningsAmount,
            ':buyIn': buyInAmount,
            ':itm': isITM ? 1 : 0,
            ':cash': isCash ? 1 : 0,
            ':profitLoss': winningsAmount - buyInAmount,
            ':venueInc': wasNewVenue ? 1 : 0,
            ':updatedAt': now,
            ':entityId': entityId,
            ':zero': 0
        };
        
        // Only update lastPlayed if this game is later
        if (gameDateObj > currentLastPlayed) {
            updateExpression += ', #lastPlayed = :lastPlayed';
            expressionNames['#lastPlayed'] = 'lastPlayed';
            expressionValues[':lastPlayed'] = gameDateTime;
        }
        
        transactItems.push({
            Update: {
                TableName: playerSummaryTable,
                Key: { id: summaryId },
                UpdateExpression: updateExpression.trim(),
                ExpressionAttributeNames: expressionNames,
                ExpressionAttributeValues: expressionValues
            }
        });
    } else {
        // PUT new PlayerSummary
        transactItems.push({
            Put: {
                TableName: playerSummaryTable,
                Item: {
                    id: summaryId,
                    playerId: playerId,
                    entityId: entityId,
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
                    lastPlayed: gameDateTime,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerSummary'
                }
            }
        });
    }
    
    // --- 4. PlayerTransactions (always PUT) ---
    // BUY_IN transaction (always)
    const buyInTxnId = uuidv4();
    transactItems.push({
        Put: {
            TableName: playerTransactionTable,
            Item: {
                id: buyInTxnId,
                playerId: playerId,
                venueId: gameData.game.venueId,
                gameId: gameData.game.id,
                entityId: entityId,
                type: 'BUY_IN',
                amount: buyInAmount,
                rake: rakeAmount,
                paymentSource: 'CASH',
                transactionDate: gameDateTime,
                notes: 'SYSTEM insert from scraped data',
                createdAt: now,
                updatedAt: now,
                _version: 1,
                _lastChangedAt: timestamp,
                __typename: 'PlayerTransaction'
            }
        }
    });
    
    // QUALIFICATION transaction (if applicable)
    if (playerData.isQualification) {
        const qualTxnId = uuidv4();
        transactItems.push({
            Put: {
                TableName: playerTransactionTable,
                Item: {
                    id: qualTxnId,
                    playerId: playerId,
                    venueId: gameData.game.venueId,
                    gameId: gameData.game.id,
                    entityId: entityId,
                    type: 'QUALIFICATION',
                    amount: 0,
                    paymentSource: 'UNKNOWN',
                    transactionDate: gameDateTime,
                    notes: 'SYSTEM insert from scraped data',
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerTransaction'
                }
            }
        });
    }
    
    // --- 5. PlayerEntry (PUT or UPDATE) ---
    if (existingEntry) {
        transactItems.push({
            Update: {
                TableName: playerEntryTable,
                Key: { id: entryId },
                UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, entityId = :entityId',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'COMPLETED',
                    ':updatedAt': now,
                    ':entityId': entityId
                }
            }
        });
    } else {
        transactItems.push({
            Put: {
                TableName: playerEntryTable,
                Item: {
                    id: entryId,
                    playerId: playerId,
                    gameId: gameData.game.id,
                    venueId: gameData.game.venueId,
                    entityId: entityId,
                    status: 'COMPLETED',
                    registrationTime: gameDateTime,
                    gameStartDateTime: gameDateTime,
                    createdAt: now,
                    updatedAt: now,
                    _version: 1,
                    _lastChangedAt: timestamp,
                    __typename: 'PlayerEntry'
                }
            }
        });
    }
    
    // ===================================================================
    // PHASE 3: Execute transaction
    // ===================================================================
    console.log(`[TXN-PROCESS] Phase 3: Executing transaction with ${transactItems.length} items...`);
    
    // DynamoDB limit is 100 items
    if (transactItems.length > 100) {
        throw new Error(`Transaction too large: ${transactItems.length} items (max 100)`);
    }
    
    try {
        await ddbDocClient.send(new TransactWriteCommand({
            TransactItems: transactItems
        }));
        
        console.log(`[TXN-PROCESS] ✅ Transaction SUCCESS for ${playerName} - ${transactItems.length} items committed atomically`);
        
        monitoring.trackOperation('PLAYER_TXN_COMPLETE', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId,
            itemCount: transactItems.length,
            wasNewVenue
        });
        
        return {
            success: true,
            playerName,
            playerId,
            entityId,
            status: 'PROCESSED',
            wasNewVenue,
            itemsWritten: transactItems.length
        };
        
    } catch (error) {
        console.error(`[TXN-PROCESS] ❌ Transaction FAILED for ${playerName}:`, error);
        
        if (error.name === 'TransactionCanceledException') {
            console.error(`[TXN-PROCESS] Cancellation reasons:`, JSON.stringify(error.CancellationReasons, null, 2));
        }
        
        monitoring.trackOperation('PLAYER_TXN_ERROR', 'PlayerProcessing', playerName, {
            error: error.message,
            gameId: gameData.game.id,
            entityId
        });
        
        throw error;
    }
};

// ===================================================================
// MAIN PROCESS PLAYER FUNCTION
// ===================================================================

/**
 * Process a single player with transactional guarantees
 * 
 * Step 1 (Player record) is separate due to async targeting logic.
 * Steps 2-6 are atomic: all succeed or all fail.
 */
const processPlayer = async (playerData, gameData) => {
    const playerName = playerData.name;
    const playerResultTable = getTableName('PlayerResult');
    
    const entityId = resolveEntityId(
        gameData.game.entityId, 
        null, 
        `processPlayer(${playerName})`
    );
    
    monitoring.entityId = entityId;
    
    try {
        const playerId = generatePlayerId(playerName);
        const resultId = `${playerId}#${gameData.game.id}`;

        console.log(`[PROCESS-PLAYER] Starting processing for player: ${playerName} (ID: ${playerId}) with entity ${entityId}`);

        monitoring.trackOperation('PLAYER_PROCESS_START', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId
        });

        // Check if already processed
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
            return { success: true, playerName, playerId, entityId, status: 'SKIPPED' };
        }
        
        // Step 1: Player record (separate - has async targeting logic)
        console.log(`[PROCESS-PLAYER] Step 1: upsertPlayerRecord...`);
        await upsertPlayerRecord(playerId, playerName, gameData, playerData, entityId);
        
        // Steps 2-6: Transactional (all-or-nothing)
        console.log(`[PROCESS-PLAYER] Steps 2-6: Transactional processing...`);
        const txnResult = await processPlayerRecordsTransactional(
            playerId, 
            playerName, 
            gameData, 
            playerData, 
            entityId
        );

        monitoring.trackOperation('PLAYER_PROCESS_COMPLETE', 'PlayerProcessing', playerId, {
            playerName,
            gameId: gameData.game.id,
            entityId,
            wasNewVenue: txnResult.wasNewVenue,
            itemsWritten: txnResult.itemsWritten
        });

        console.log(`[PROCESS-PLAYER] SUCCESS: Player ${playerName} completely processed with entity ${entityId}`);
        return { success: true, playerName, playerId, entityId, status: 'PROCESSED' };
        
    } catch (error) {
        console.error(`[PROCESS-PLAYER] CRITICAL FAILURE for player ${playerName}:`, error);
        
        monitoring.trackOperation('PLAYER_PROCESS_ERROR', 'PlayerProcessing', playerName, {
            error: error.message,
            gameId: gameData.game.id,
            entityId
        });
        
        return { success: false, playerName, entityId, error: error.message };
    }
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[HANDLER] START: Player Data Processor invoked (TRANSACTIONAL MODE).');
    console.log('Received Lambda Event (Raw):', JSON.stringify(event, null, 2));

    monitoring.trackOperation('LAMBDA_START', 'Handler', 'playerDataProcessor', {
        recordCount: event.Records?.length || 0,
        mode: 'TRANSACTIONAL'
    });

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
            
            const entityId = resolveEntityId(
                gameData.game.entityId, 
                null, 
                `handler(game:${gameData.game.id})`
            );
            
            console.log(`[HANDLER] Entity ID resolved: ${entityId}`);
            
            if (!results.entityId) {
                results.entityId = entityId;
            }
            
            monitoring.entityId = entityId;
            
            monitoring.trackOperation('GAME_PROCESS_START', 'Game', gameData.game.id, {
                entityId: entityId,
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
            
            monitoring.trackOperation('GAME_PROCESS_COMPLETE', 'Game', gameData.game.id, {
                entityId: entityId,
                successfulPlayers: results.successful.length,
                failedPlayers: results.failed.length
            });
            
            console.log(`[HANDLER] Game ${gameData.game.id} batch processing completed for entity ${entityId}.`);
            
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
    console.log(`Entity ID: ${results.entityId}`);
    console.log(`Total Players Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    monitoring.trackOperation('LAMBDA_COMPLETE', 'Handler', 'playerDataProcessor', {
        entityId: results.entityId,
        totalProcessed: results.totalProcessed,
        successful: results.successful.length,
        failed: results.failed.length
    });
    
    await monitoring.flush();
    
    if (results.failed.length > 0) {
        console.error('Final result contains failures. Triggering SQS redelivery.');
        throw new Error(`Failed to process ${results.failed.length} players. Check logs for details.`);
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Successfully processed all messages (TRANSACTIONAL MODE).',
            entityId: results.entityId,
            results: {
                totalProcessed: results.totalProcessed,
                successful: results.successful.length,
                failed: results.failed.length
            }
        })
    };
};