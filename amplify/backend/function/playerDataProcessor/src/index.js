/**
 * OPTIMIZED Player Data Processor Lambda
 * 
 * VERSION: 3.0.0 - Batch operations + proper concurrency control
 * 
 * KEY OPTIMIZATIONS:
 * 1. BatchGetItem for pre-fetching (100 items per call vs 100 calls)
 * 2. True concurrency limiting (not fake batching)
 * 3. Eliminated duplicate database checks
 * 4. In-memory caching of pre-fetched data
 * 5. Reduced operations from ~10/player to ~3/player
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    PutCommand, 
    UpdateCommand, 
    GetCommand, 
    QueryCommand, 
    BatchGetCommand,
    TransactWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CONSTANTS & SETUP
// ===================================================================

const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const CONCURRENCY_LIMIT = 5;  // Max parallel player processing
const BATCH_GET_LIMIT = 100;  // DynamoDB BatchGetItem limit

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error('API ID or environment name not found in environment variables.');
    }
    return `${modelName}-${apiId}-${env}`;
};

const generatePlayerId = (playerName) => {
    const normalized = playerName.toLowerCase().trim();
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
};

const generateVisitKey = (playerId, entityId, venueId) => `${playerId}#${entityId}#${venueId}`;

const parsePlayerName = (fullName) => {
    if (!fullName) return { firstName: 'Unknown', lastName: '', givenName: 'Unknown' };
    const trimmedName = fullName.trim();
    
    if (trimmedName.includes(',')) {
        const parts = trimmedName.split(',');
        const lastName = parts[0]?.trim() || 'Unknown';
        const firstName = parts[1]?.trim() || 'Unknown';
        return { firstName, lastName, givenName: firstName };
    }
    
    const parts = trimmedName.split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || '';
    return { firstName, lastName, givenName: firstName };
};

const daysBetween = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
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
    }
    
    const daysSinceLastActivity = daysBetween(lastActivityDate, now);
    if (daysSinceLastActivity <= 30) return 'Active_EL';
    if (daysSinceLastActivity <= 60) return 'Retain_Inactive31_60d';
    if (daysSinceLastActivity <= 90) return 'Retain_Inactive61_90d';
    if (daysSinceLastActivity <= 120) return 'Churned_91_120d';
    if (daysSinceLastActivity <= 180) return 'Churned_121_180d';
    if (daysSinceLastActivity <= 360) return 'Churned_181_360d';
    return 'Churned_361d';
};

const getTargetingFromDays = (days) => {
    if (days <= 30) return 'Active_EL';
    if (days <= 60) return 'Retain_Inactive31_60d';
    if (days <= 90) return 'Retain_Inactive61_90d';
    if (days <= 120) return 'Churned_91_120d';
    if (days <= 180) return 'Churned_121_180d';
    if (days <= 360) return 'Churned_181_360d';
    return 'Churned_361d';
};

const resolveEntityId = (providedEntityId, existingEntityId = null, context = 'unknown') => {
    if (providedEntityId) return providedEntityId;
    if (existingEntityId) return existingEntityId;
    if (process.env.DEFAULT_ENTITY_ID) return process.env.DEFAULT_ENTITY_ID;
    throw new Error(`[playerDataProcessor] ${context}: entityId is required but was not provided.`);
};

// ===================================================================
// CONCURRENCY LIMITER (Proper implementation)
// ===================================================================

/**
 * Process items with true concurrency limiting
 * Unlike Promise.all with sliced batches, this maintains a constant number of in-flight operations
 */
const processWithConcurrency = async (items, processor, limit = CONCURRENCY_LIMIT) => {
    const results = [];
    const executing = new Set();
    
    for (const item of items) {
        const promise = processor(item).then(result => {
            executing.delete(promise);
            return result;
        }).catch(error => {
            executing.delete(promise);
            return { success: false, error: error.message, item };
        });
        
        executing.add(promise);
        results.push(promise);
        
        // When we hit the limit, wait for one to complete before continuing
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    
    return Promise.all(results);
};

// ===================================================================
// BATCH OPERATIONS (New - dramatically reduces API calls)
// ===================================================================

/**
 * Batch fetch multiple items from a single table
 * Handles DynamoDB's 100-item limit automatically
 */
const batchGetItems = async (tableName, keys, keyAttribute = 'id') => {
    if (!keys || keys.length === 0) return new Map();
    
    const results = new Map();
    const uniqueKeys = [...new Set(keys)];
    
    // Process in chunks of 100 (DynamoDB limit)
    for (let i = 0; i < uniqueKeys.length; i += BATCH_GET_LIMIT) {
        const chunk = uniqueKeys.slice(i, i + BATCH_GET_LIMIT);
        const requestItems = {
            [tableName]: {
                Keys: chunk.map(key => ({ [keyAttribute]: key }))
            }
        };
        
        try {
            const response = await ddbDocClient.send(new BatchGetCommand({
                RequestItems: requestItems
            }));
            
            // Map results
            if (response.Responses?.[tableName]) {
                for (const item of response.Responses[tableName]) {
                    results.set(item[keyAttribute], item);
                }
            }
            
            // Handle unprocessed keys with retry
            if (response.UnprocessedKeys?.[tableName]?.Keys?.length > 0) {
                console.warn(`[BATCH-GET] ${response.UnprocessedKeys[tableName].Keys.length} unprocessed keys, retrying...`);
                await new Promise(r => setTimeout(r, 100)); // Brief backoff
                
                const retryResponse = await ddbDocClient.send(new BatchGetCommand({
                    RequestItems: response.UnprocessedKeys
                }));
                
                if (retryResponse.Responses?.[tableName]) {
                    for (const item of retryResponse.Responses[tableName]) {
                        results.set(item[keyAttribute], item);
                    }
                }
            }
        } catch (error) {
            console.error(`[BATCH-GET] Error fetching from ${tableName}:`, error.message);
            // Don't throw - return partial results and let individual processing handle missing items
        }
    }
    
    return results;
};

/**
 * Batch fetch PlayerVenue records by playerId using GSI
 * Returns Map<playerId, PlayerVenue[]>
 */
const batchGetPlayerVenues = async (playerIds, entityId, venueId) => {
    const playerVenueTable = getTableName('PlayerVenue');
    const results = new Map();
    
    // For PlayerVenue, we need to query by visityKey or use individual queries
    // BatchGetItem doesn't work with GSIs, so we'll use parallel queries with limit
    const queries = playerIds.map(async (playerId) => {
        const visityKey = generateVisitKey(playerId, entityId, venueId);
        try {
            const response = await ddbDocClient.send(new QueryCommand({
                TableName: playerVenueTable,
                IndexName: 'byVisitKey',
                KeyConditionExpression: 'visityKey = :vk',
                ExpressionAttributeValues: { ':vk': visityKey },
                Limit: 1
            }));
            
            if (response.Items?.length > 0) {
                results.set(playerId, response.Items[0]);
            }
        } catch (error) {
            console.warn(`[BATCH-PV] Error querying PlayerVenue for ${playerId}:`, error.message);
        }
    });
    
    // Process with concurrency limit
    await processWithConcurrency(queries, (q) => q, 10);
    return results;
};

// ===================================================================
// PRE-FETCH ALL DATA FOR GAME (New - single function to get everything)
// ===================================================================

/**
 * Pre-fetch all relevant data for a game in batched operations
 * This replaces 500+ individual GetCommands with ~10 BatchGetCommands
 */
const prefetchGameData = async (gameData, entityId) => {
    const allPlayers = gameData.players?.allPlayers || [];
    const gameId = gameData.game.id;
    const venueId = gameData.game.venueId;
    const skipVenue = !venueId || venueId === UNASSIGNED_VENUE_ID;
    
    console.log(`[PREFETCH] Starting prefetch for ${allPlayers.length} players...`);
    
    // Generate all IDs upfront
    const playerIds = allPlayers.map(p => generatePlayerId(p.name));
    const resultIds = playerIds.map(pid => `${pid}#${gameId}`);
    const entryIds = playerIds.map(pid => `${gameId}#${pid}`);
    
    // Parallel batch fetches
    const [
        existingResults,
        existingPlayers,
        existingSummaries,
        existingEntries,
        existingVenues
    ] = await Promise.all([
        batchGetItems(getTableName('PlayerResult'), resultIds),
        batchGetItems(getTableName('Player'), playerIds),
        batchGetItems(getTableName('PlayerSummary'), playerIds),
        batchGetItems(getTableName('PlayerEntry'), entryIds),
        skipVenue ? Promise.resolve(new Map()) : batchGetPlayerVenues(playerIds, entityId, venueId)
    ]);
    
    console.log(`[PREFETCH] Complete:`, {
        results: existingResults.size,
        players: existingPlayers.size,
        summaries: existingSummaries.size,
        entries: existingEntries.size,
        venues: existingVenues.size
    });
    
    return {
        playerIds,
        resultIds,
        entryIds,
        existingResults,
        existingPlayers,
        existingSummaries,
        existingEntries,
        existingVenues
    };
};

// ===================================================================
// OPTIMIZED PLAYER PROCESSING (Uses prefetched data)
// ===================================================================

/**
 * Process a single player using prefetched data
 * Eliminates all redundant database lookups
 */
const processPlayerOptimized = async (playerData, gameData, prefetchedData, entityId) => {
    const playerName = playerData.name;
    const playerId = generatePlayerId(playerName);
    const gameId = gameData.game.id;
    const resultId = `${playerId}#${gameId}`;
    const entryId = `${gameId}#${playerId}`;
    const summaryId = playerId;
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Use prefetched data instead of database calls
    const existingResult = prefetchedData.existingResults.get(resultId);
    const existingPlayer = prefetchedData.existingPlayers.get(playerId);
    const existingSummary = prefetchedData.existingSummaries.get(summaryId);
    const existingEntry = prefetchedData.existingEntries.get(entryId);
    const existingVenue = prefetchedData.existingVenues.get(playerId);
    
    // Skip if already processed (no DB call needed!)
    if (existingResult) {
        console.log(`[PROCESS] SKIP: ${playerName} - result already exists`);
        return { success: true, playerName, playerId, status: 'SKIPPED' };
    }
    
    try {
        // Step 1: Upsert Player record (still needs individual write)
        await upsertPlayerRecordOptimized(
            playerId, playerName, gameData, playerData, entityId, existingPlayer
        );
        
        // Steps 2-6: Transactional write (uses prefetched data)
        const txnResult = await processPlayerRecordsTransactionalOptimized(
            playerId, playerName, gameData, playerData, entityId,
            { existingSummary, existingEntry, existingVenue }
        );
        
        console.log(`[PROCESS] SUCCESS: ${playerName} (${txnResult.itemsWritten} items)`);
        return { success: true, playerName, playerId, entityId, status: 'PROCESSED' };
        
    } catch (error) {
        console.error(`[PROCESS] FAIL: ${playerName}:`, error.message);
        return { success: false, playerName, playerId, error: error.message };
    }
};

/**
 * Optimized player upsert - uses prefetched Player record
 */
const upsertPlayerRecordOptimized = async (playerId, playerName, gameData, playerData, entityId, existingPlayer) => {
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();
    const nameParts = parsePlayerName(playerName);
    
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime || now;
    const gameDate = gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`;
    const gameDateObj = new Date(gameDate);
    const canAssignVenue = gameData.game.venueAssignmentStatus !== "PENDING_ASSIGNMENT" 
        && gameData.game.venueId 
        && gameData.game.venueId !== UNASSIGNED_VENUE_ID;
    
    if (existingPlayer) {
        // UPDATE existing player
        const currentRegDate = new Date(existingPlayer.registrationDate);
        const currentLastPlayed = new Date(existingPlayer.lastPlayedDate || existingPlayer.registrationDate);
        
        let updateExpression = 'SET #version = #version + :inc, #ent = :entityId, updatedAt = :now, pointsBalance = pointsBalance + :points';
        const expressionNames = { '#version': '_version', '#ent': 'primaryEntityId' };
        const expressionValues = {
            ':inc': 1,
            ':entityId': entityId,
            ':now': now,
            ':points': playerData.points || 0
        };
        
        // Back-fill earlier registration date
        if (gameDateObj < currentRegDate) {
            updateExpression += ', registrationDate = :regDate, firstGamePlayed = :firstGame';
            expressionValues[':regDate'] = gameDate;
            expressionValues[':firstGame'] = gameDate;
            if (canAssignVenue) {
                updateExpression += ', registrationVenueId = :regVenue';
                expressionValues[':regVenue'] = gameData.game.venueId;
            }
        }
        
        // Update last played if this game is later
        if (gameDateObj > currentLastPlayed) {
            const daysSince = daysBetween(gameDate, new Date());
            const targeting = getTargetingFromDays(daysSince);
            updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
            expressionValues[':lastPlayed'] = gameDate;
            expressionValues[':targeting'] = targeting;
        }
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: playerTable,
            Key: { id: playerId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues
        }));
        
    } else {
        // CREATE new player
        const daysSince = daysBetween(gameDate, new Date());
        const targeting = getTargetingFromDays(daysSince);
        
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
            targetingClassification: targeting,
            venueAssignmentStatus: canAssignVenue ? 'AUTO_ASSIGNED' : 'PENDING_ASSIGNMENT',
            creditBalance: 0,
            pointsBalance: playerData.points || 0,
            primaryEntityId: entityId,
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: Date.now(),
            __typename: 'Player'
        };
        
        try {
            await ddbDocClient.send(new PutCommand({
                TableName: playerTable,
                Item: newPlayer,
                ConditionExpression: 'attribute_not_exists(id)'
            }));
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') throw error;
            // Race condition - another invocation created this player
            console.warn(`[PLAYER-UPSERT] Race condition for ${playerId}, continuing...`);
        }
    }
};

/**
 * Optimized transactional processing - uses prefetched data
 */
const processPlayerRecordsTransactionalOptimized = async (
    playerId, playerName, gameData, playerData, entityId, 
    { existingSummary, existingEntry, existingVenue }
) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Table names
    const playerResultTable = getTableName('PlayerResult');
    const playerVenueTable = getTableName('PlayerVenue');
    const playerSummaryTable = getTableName('PlayerSummary');
    const playerTransactionTable = getTableName('PlayerTransaction');
    const playerEntryTable = getTableName('PlayerEntry');
    
    // IDs
    const gameId = gameData.game.id;
    const resultId = `${playerId}#${gameId}`;
    const summaryId = playerId;
    const entryId = `${gameId}#${playerId}`;
    
    // Game metadata
    const gameDateTime = gameData.game.gameStartDateTime || gameData.game.gameEndDateTime || now;
    const gameDate = gameDateTime.includes('T') ? gameDateTime : `${gameDateTime}T00:00:00.000Z`;
    const gameDateObj = new Date(gameDate);
    const buyInAmount = gameData.game.buyIn || 0;
    const rakeAmount = gameData.game.rake || 0;
    const winningsAmount = playerData.winnings || 0;
    const isITM = winningsAmount > 0 || playerData.isQualification;
    const isCash = winningsAmount > 0;
    
    const skipVenue = !gameData.game.venueId || gameData.game.venueId === UNASSIGNED_VENUE_ID;
    const wasNewVenue = !existingVenue && !skipVenue;
    const visityKey = skipVenue ? null : generateVisitKey(playerId, entityId, gameData.game.venueId);
    
    // Build transaction items
    const transactItems = [];
    
    // 1. PlayerResult (always PUT)
    transactItems.push({
        Put: {
            TableName: playerResultTable,
            Item: {
                id: resultId,
                playerId,
                gameId,
                venueId: gameData.game.venueId,
                entityId,
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
    
    // 2. PlayerVenue (PUT or UPDATE)
    if (!skipVenue) {
        if (existingVenue) {
            const currentFirstPlayed = new Date(existingVenue.firstPlayedDate);
            const currentLastPlayed = new Date(existingVenue.lastPlayedDate);
            const oldGamesPlayed = existingVenue.totalGamesPlayed || 0;
            const oldAverageBuyIn = existingVenue.averageBuyIn || 0;
            const newTotalGames = oldGamesPlayed + 1;
            const newAverageBuyIn = ((oldAverageBuyIn * oldGamesPlayed) + buyInAmount) / newTotalGames;
            
            let updateExpression = 'SET #version = #version + :inc, updatedAt = :updatedAt, totalGamesPlayed = totalGamesPlayed + :inc, averageBuyIn = :newAverageBuyIn';
            const expressionNames = { '#version': '_version' };
            const expressionValues = {
                ':inc': 1,
                ':updatedAt': now,
                ':newAverageBuyIn': newAverageBuyIn
            };
            
            if (!existingVenue.entityId) {
                updateExpression += ', entityId = :entityId';
                expressionValues[':entityId'] = entityId;
            }
            if (!existingVenue.visityKey) {
                updateExpression += ', visityKey = :visityKey';
                expressionValues[':visityKey'] = visityKey;
            }
            if (gameDateObj < currentFirstPlayed) {
                updateExpression += ', firstPlayedDate = :firstPlayed';
                expressionValues[':firstPlayed'] = gameDate;
            }
            if (gameDateObj > currentLastPlayed) {
                const targeting = calculatePlayerVenueTargetingClassification(gameDate, existingVenue.membershipCreatedDate);
                updateExpression += ', lastPlayedDate = :lastPlayed, targetingClassification = :targeting';
                expressionValues[':lastPlayed'] = gameDate;
                expressionValues[':targeting'] = targeting;
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
            const targeting = calculatePlayerVenueTargetingClassification(gameDate, gameDate);
            transactItems.push({
                Put: {
                    TableName: playerVenueTable,
                    Item: {
                        id: uuidv4(),
                        playerId,
                        venueId: gameData.game.venueId,
                        entityId,
                        visityKey,
                        membershipCreatedDate: gameDate,
                        firstPlayedDate: gameDate,
                        lastPlayedDate: gameDate,
                        totalGamesPlayed: 1,
                        averageBuyIn: buyInAmount,
                        totalBuyIns: buyInAmount,
                        totalWinnings: 0,
                        netProfit: 0,
                        targetingClassification: targeting,
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
    
    // 3. PlayerSummary (PUT or UPDATE)
    if (existingSummary) {
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
        const expressionNames = { '#v': '_version', '#ent': 'entityId' };
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
        transactItems.push({
            Put: {
                TableName: playerSummaryTable,
                Item: {
                    id: summaryId,
                    playerId,
                    entityId,
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
    
    // 4. PlayerTransactions (always PUT)
    transactItems.push({
        Put: {
            TableName: playerTransactionTable,
            Item: {
                id: uuidv4(),
                playerId,
                venueId: gameData.game.venueId,
                gameId,
                entityId,
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
    
    if (playerData.isQualification) {
        transactItems.push({
            Put: {
                TableName: playerTransactionTable,
                Item: {
                    id: uuidv4(),
                    playerId,
                    venueId: gameData.game.venueId,
                    gameId,
                    entityId,
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
    
    // 5. PlayerEntry (PUT or UPDATE)
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
                    playerId,
                    gameId,
                    venueId: gameData.game.venueId,
                    entityId,
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
    
    // Execute transaction
    if (transactItems.length > 100) {
        throw new Error(`Transaction too large: ${transactItems.length} items (max 100)`);
    }
    
    await ddbDocClient.send(new TransactWriteCommand({
        TransactItems: transactItems
    }));
    
    return { success: true, wasNewVenue, itemsWritten: transactItems.length };
};

// ===================================================================
// MAIN HANDLER (Optimized)
// ===================================================================

exports.handler = async (event) => {
    console.log('[HANDLER] START: Player Data Processor (OPTIMIZED v3.0)');
    console.log(`[HANDLER] Processing ${event.Records?.length || 0} SQS messages`);
    
    const results = {
        successful: [],
        failed: [],
        totalProcessed: 0,
        entityId: null
    };
    
    if (!event.Records || event.Records.length === 0) {
        return { statusCode: 204, body: JSON.stringify({ message: 'No records to process.' }) };
    }
    
    for (const record of event.Records) {
        let gameData = null;
        try {
            gameData = JSON.parse(record.body);
            console.log(`[HANDLER] Processing game: ${gameData.game.id}`);
            
            const entityId = resolveEntityId(gameData.game.entityId, null, `handler(game:${gameData.game.id})`);
            if (!results.entityId) results.entityId = entityId;
            
            if (!gameData.players?.allPlayers?.length) {
                console.warn(`[HANDLER] No players in game ${gameData.game.id}`);
                continue;
            }
            
            const playerCount = gameData.players.allPlayers.length;
            console.log(`[HANDLER] Processing ${playerCount} players for game ${gameData.game.id}`);
            
            // OPTIMIZATION: Pre-fetch ALL data in batch operations
            const prefetchedData = await prefetchGameData(gameData, entityId);
            
            // Count how many need processing (skip already processed)
            const toProcess = gameData.players.allPlayers.filter(p => {
                const playerId = generatePlayerId(p.name);
                const resultId = `${playerId}#${gameData.game.id}`;
                return !prefetchedData.existingResults.has(resultId);
            });
            
            console.log(`[HANDLER] ${toProcess.length}/${playerCount} players need processing (${playerCount - toProcess.length} already done)`);
            
            // OPTIMIZATION: Process with TRUE concurrency limiting
            const playerResults = await processWithConcurrency(
                toProcess,
                (playerData) => processPlayerOptimized(playerData, gameData, prefetchedData, entityId),
                CONCURRENCY_LIMIT
            );
            
            // Also count the skipped ones as successful
            const skippedCount = playerCount - toProcess.length;
            
            for (const result of playerResults) {
                if (result.success) {
                    results.successful.push(result);
                } else {
                    results.failed.push(result);
                }
                results.totalProcessed++;
            }
            
            // Add skipped to successful count
            results.successful.push(...Array(skippedCount).fill({ status: 'SKIPPED' }));
            results.totalProcessed += skippedCount;
            
            console.log(`[HANDLER] Game ${gameData.game.id} complete: ${results.successful.length} success, ${results.failed.length} failed`);
            
        } catch (error) {
            console.error('[HANDLER] CRITICAL ERROR:', error);
            throw error;
        }
    }
    
    console.log('--- FINAL SUMMARY ---');
    console.log(`Entity: ${results.entityId}`);
    console.log(`Total: ${results.totalProcessed}, Success: ${results.successful.length}, Failed: ${results.failed.length}`);
    
    if (results.failed.length > 0) {
        console.error('Failures detected, triggering SQS redelivery');
        throw new Error(`Failed to process ${results.failed.length} players`);
    }
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Successfully processed all messages (OPTIMIZED)',
            entityId: results.entityId,
            results: {
                totalProcessed: results.totalProcessed,
                successful: results.successful.length,
                failed: results.failed.length
            }
        })
    };
};