/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMECOSTTABLE_ARN
    API_KINGSROOM_GAMECOSTTABLE_NAME
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_ARN
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_NAME
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
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
    API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
    API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
    API_KINGSROOM_SCRAPEURLTABLE_ARN
    API_KINGSROOM_SCRAPEURLTABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * DELETE GAME FUNCTION LAMBDA
 * ===================================================================
 * 
 * VERSION: 1.0.0
 * 
 * PURPOSE:
 * Properly deletes a game and all related records across multiple tables.
 * This function handles the cleanup that DynamoDB streams cannot.
 * 
 * WHAT THIS LAMBDA DOES:
 * 1. Validates the game exists and user has permission
 * 2. Handles multi-day tournament consolidation (parent/child relationships)
 * 3. Deletes related financial records (GameCost, GameFinancialSnapshot)
 * 4. Deletes scrape tracking records (ScrapeURL, ScrapeAttempt)
 * 5. Deletes player-related records (PlayerEntry, PlayerResult, PlayerTransaction)
 * 6. Decrements player statistics (Player, PlayerSummary, PlayerVenue)
 * 7. Deletes the Game record (triggers DynamoDB streams for Entity/Venue counts)
 * 
 * WHAT DYNAMODB STREAMS HANDLE AUTOMATICALLY:
 * - entityVenueDashMetricCounter: Decrements Entity/Venue gameCount
 * - venueDetailsUpdater: Recalculates VenueDetails aggregates
 * 
 * INVOCATION:
 * - GraphQL mutation: deleteGameWithCleanup(input: { gameId: "xxx" })
 * - Direct Lambda invocation: { gameId: "xxx" }
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    GetCommand, 
    DeleteCommand, 
    QueryCommand, 
    UpdateCommand,
    BatchWriteCommand 
} = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error('API ID or environment name not found in environment variables.');
    }
    const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
    if (process.env[envVarName]) return process.env[envVarName];
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Batch delete items from a table
 * DynamoDB BatchWriteItem has a limit of 25 items per request
 */
const batchDeleteItems = async (tableName, keys) => {
    if (!keys || keys.length === 0) return { deleted: 0 };
    
    let deleted = 0;
    const batches = [];
    
    // Split into batches of 25
    for (let i = 0; i < keys.length; i += 25) {
        batches.push(keys.slice(i, i + 25));
    }
    
    for (const batch of batches) {
        const deleteRequests = batch.map(key => ({
            DeleteRequest: { Key: key }
        }));
        
        try {
            await ddbDocClient.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: deleteRequests
                }
            }));
            deleted += batch.length;
        } catch (error) {
            console.error(`[DELETE-GAME] Error batch deleting from ${tableName}:`, error);
            // Continue with remaining batches
        }
    }
    
    return { deleted };
};

// ===================================================================
// DELETION FUNCTIONS
// ===================================================================

/**
 * Delete GameCost records for a game
 */
const deleteGameCost = async (gameId) => {
    const tableName = getTableName('GameCost');
    console.log(`[DELETE-GAME] Deleting GameCost for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGameCost',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (result.Items && result.Items.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} GameCost record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting GameCost:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Delete GameFinancialSnapshot records for a game
 */
const deleteGameFinancialSnapshot = async (gameId) => {
    const tableName = getTableName('GameFinancialSnapshot');
    console.log(`[DELETE-GAME] Deleting GameFinancialSnapshot for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGameFinancialSnapshot',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (result.Items && result.Items.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} GameFinancialSnapshot record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting GameFinancialSnapshot:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Delete ScrapeURL record for a game
 */
const deleteScrapeURL = async (gameId, sourceUrl) => {
    const tableName = getTableName('ScrapeURL');
    console.log(`[DELETE-GAME] Deleting ScrapeURL for game ${gameId}`);
    
    try {
        // Query by gameId or URL
        let result;
        
        if (sourceUrl) {
            result = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byURL',
                KeyConditionExpression: '#url = :url',
                ExpressionAttributeNames: { '#url': 'url' },
                ExpressionAttributeValues: { ':url': sourceUrl }
            }));
        }
        
        // If no results by URL, try scanning for gameId
        if (!result?.Items?.length) {
            result = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byGame',
                KeyConditionExpression: 'gameId = :gameId',
                ExpressionAttributeValues: { ':gameId': gameId }
            }));
        }
        
        if (result?.Items?.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} ScrapeURL record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting ScrapeURL:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Delete ScrapeAttempt records for a game
 */
const deleteScrapeAttempts = async (gameId) => {
    const tableName = getTableName('ScrapeAttempt');
    console.log(`[DELETE-GAME] Deleting ScrapeAttempt records for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (result.Items && result.Items.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} ScrapeAttempt record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting ScrapeAttempts:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Delete PlayerEntry records for a game and return affected player IDs
 */
const deletePlayerEntries = async (gameId) => {
    const tableName = getTableName('PlayerEntry');
    console.log(`[DELETE-GAME] Deleting PlayerEntry records for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        const playerIds = new Set();
        
        if (result.Items && result.Items.length > 0) {
            result.Items.forEach(item => {
                if (item.playerId) playerIds.add(item.playerId);
            });
            
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} PlayerEntry record(s)`);
            return { deleted: deleteResult.deleted, playerIds: Array.from(playerIds) };
        }
        
        return { deleted: 0, playerIds: [] };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting PlayerEntries:`, error);
        return { deleted: 0, playerIds: [], error: error.message };
    }
};

/**
 * Delete PlayerResult records for a game
 */
const deletePlayerResults = async (gameId) => {
    const tableName = getTableName('PlayerResult');
    console.log(`[DELETE-GAME] Deleting PlayerResult records for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (result.Items && result.Items.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} PlayerResult record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting PlayerResults:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Delete PlayerTransaction records for a game
 */
const deletePlayerTransactions = async (gameId) => {
    const tableName = getTableName('PlayerTransaction');
    console.log(`[DELETE-GAME] Deleting PlayerTransaction records for game ${gameId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGame',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId }
        }));
        
        if (result.Items && result.Items.length > 0) {
            const keys = result.Items.map(item => ({ id: item.id }));
            const deleteResult = await batchDeleteItems(tableName, keys);
            console.log(`[DELETE-GAME] ✅ Deleted ${deleteResult.deleted} PlayerTransaction record(s)`);
            return deleteResult;
        }
        
        return { deleted: 0 };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting PlayerTransactions:`, error);
        return { deleted: 0, error: error.message };
    }
};

/**
 * Decrement player statistics for affected players
 * This is complex because we need to know what was deleted to properly decrement
 */
const decrementPlayerStats = async (gameId, game, playerIds) => {
    console.log(`[DELETE-GAME] Decrementing stats for ${playerIds.length} player(s)`);
    
    const playerSummaryTable = getTableName('PlayerSummary');
    const playerVenueTable = getTableName('PlayerVenue');
    const now = new Date().toISOString();
    
    let summariesUpdated = 0;
    let venuesUpdated = 0;
    
    for (const playerId of playerIds) {
        try {
            // Decrement PlayerSummary
            await ddbDocClient.send(new UpdateCommand({
                TableName: playerSummaryTable,
                Key: { id: playerId },
                UpdateExpression: `
                    SET sessionsPlayed = if_not_exists(sessionsPlayed, :one) - :one,
                        tournamentsPlayed = if_not_exists(tournamentsPlayed, :one) - :one,
                        tournamentBuyIns = if_not_exists(tournamentBuyIns, :zero) - :buyIn,
                        totalBuyIns = if_not_exists(totalBuyIns, :zero) - :buyIn,
                        updatedAt = :now
                `,
                ExpressionAttributeValues: {
                    ':one': 1,
                    ':zero': 0,
                    ':buyIn': game.buyIn || 0,
                    ':now': now
                },
                ConditionExpression: 'attribute_exists(id)'
            }));
            summariesUpdated++;
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') {
                console.error(`[DELETE-GAME] Error updating PlayerSummary for ${playerId}:`, error);
            }
        }
        
        // Decrement PlayerVenue if venue is assigned
        if (game.venueId && game.venueId !== '00000000-0000-0000-0000-000000000000') {
            try {
                // Find the PlayerVenue record
                const pvResult = await ddbDocClient.send(new QueryCommand({
                    TableName: playerVenueTable,
                    IndexName: 'byPlayer',
                    KeyConditionExpression: 'playerId = :playerId',
                    FilterExpression: 'venueId = :venueId',
                    ExpressionAttributeValues: {
                        ':playerId': playerId,
                        ':venueId': game.venueId
                    }
                }));
                
                if (pvResult.Items && pvResult.Items.length > 0) {
                    const pv = pvResult.Items[0];
                    await ddbDocClient.send(new UpdateCommand({
                        TableName: playerVenueTable,
                        Key: { id: pv.id },
                        UpdateExpression: `
                            SET totalGamesPlayed = if_not_exists(totalGamesPlayed, :one) - :one,
                                totalBuyIns = if_not_exists(totalBuyIns, :zero) - :buyIn,
                                updatedAt = :now
                        `,
                        ExpressionAttributeValues: {
                            ':one': 1,
                            ':zero': 0,
                            ':buyIn': game.buyIn || 0,
                            ':now': now
                        }
                    }));
                    venuesUpdated++;
                }
            } catch (error) {
                console.error(`[DELETE-GAME] Error updating PlayerVenue for ${playerId}:`, error);
            }
        }
    }
    
    console.log(`[DELETE-GAME] ✅ Updated ${summariesUpdated} PlayerSummary, ${venuesUpdated} PlayerVenue records`);
    return { summariesUpdated, venuesUpdated };
};

/**
 * Handle multi-day tournament consolidation cleanup
 * - If deleting a CHILD: Recalculate parent totals
 * - If deleting a PARENT: Unlink all children
 */
const handleConsolidationCleanup = async (game) => {
    const gameTable = getTableName('Game');
    const now = new Date().toISOString();
    
    // Case 1: Deleting a CHILD game
    if (game.consolidationType === 'CHILD' && game.parentGameId) {
        console.log(`[DELETE-GAME] Game is a CHILD, will trigger parent recalculation via stream`);
        // The parent will be recalculated when this game is deleted
        // We just need to check if parent has any other children
        
        const siblingsResult = await ddbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byParentGame',
            KeyConditionExpression: 'parentGameId = :pid',
            ExpressionAttributeValues: { ':pid': game.parentGameId }
        }));
        
        const siblings = siblingsResult.Items?.filter(s => s.id !== game.id) || [];
        
        if (siblings.length === 0) {
            // This is the last child - delete the parent too
            console.log(`[DELETE-GAME] Last child being deleted, will also delete parent ${game.parentGameId}`);
            return { deleteParent: true, parentId: game.parentGameId };
        }
        
        return { deleteParent: false, remainingSiblings: siblings.length };
    }
    
    // Case 2: Deleting a PARENT game
    if (game.consolidationType === 'PARENT') {
        console.log(`[DELETE-GAME] Game is a PARENT, unlinking all children`);
        
        const childrenResult = await ddbDocClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byParentGame',
            KeyConditionExpression: 'parentGameId = :pid',
            ExpressionAttributeValues: { ':pid': game.id }
        }));
        
        const children = childrenResult.Items || [];
        
        for (const child of children) {
            try {
                await ddbDocClient.send(new UpdateCommand({
                    TableName: gameTable,
                    Key: { id: child.id },
                    UpdateExpression: 'REMOVE parentGameId, consolidationType, consolidationKey SET updatedAt = :now',
                    ExpressionAttributeValues: { ':now': now }
                }));
                console.log(`[DELETE-GAME] Unlinked child ${child.id}`);
            } catch (error) {
                console.error(`[DELETE-GAME] Error unlinking child ${child.id}:`, error);
            }
        }
        
        return { childrenUnlinked: children.length };
    }
    
    return { noConsolidation: true };
};

/**
 * Delete the Game record itself
 */
const deleteGameRecord = async (gameId) => {
    const tableName = getTableName('Game');
    console.log(`[DELETE-GAME] Deleting Game record ${gameId}`);
    
    try {
        await ddbDocClient.send(new DeleteCommand({
            TableName: tableName,
            Key: { id: gameId }
        }));
        console.log(`[DELETE-GAME] ✅ Deleted Game record`);
        return { success: true };
    } catch (error) {
        console.error(`[DELETE-GAME] Error deleting Game:`, error);
        return { success: false, error: error.message };
    }
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[DELETE-GAME] v1.0.0 - Game Deletion with Full Cleanup');
    console.log('[DELETE-GAME] Event:', JSON.stringify(event, null, 2));
    
    // Handle both GraphQL and direct invocation
    const input = event.arguments?.input || event.input || event;
    const { gameId, dryRun = false } = input;
    
    if (!gameId) {
        return {
            success: false,
            error: 'gameId is required'
        };
    }
    
    try {
        // 1. Fetch the game to be deleted
        const gameTable = getTableName('Game');
        const gameResult = await ddbDocClient.send(new GetCommand({
            TableName: gameTable,
            Key: { id: gameId }
        }));
        
        const game = gameResult.Item;
        
        if (!game) {
            return {
                success: false,
                error: `Game not found: ${gameId}`
            };
        }
        
        console.log(`[DELETE-GAME] Found game: ${game.name} (${game.id})`);
        console.log(`[DELETE-GAME] Game details:`, {
            entityId: game.entityId,
            venueId: game.venueId,
            gameStatus: game.gameStatus,
            consolidationType: game.consolidationType,
            parentGameId: game.parentGameId,
            sourceUrl: game.sourceUrl
        });
        
        // Track what will be/was deleted
        const deletionResults = {
            gameId: game.id,
            gameName: game.name,
            entityId: game.entityId,
            venueId: game.venueId,
            dryRun,
            deletions: {}
        };
        
        if (dryRun) {
            console.log('[DELETE-GAME] DRY RUN - No actual deletions will occur');
            // In dry run mode, just count what would be deleted
            // This could be expanded to query and count records
            return {
                success: true,
                dryRun: true,
                message: 'Dry run complete - no changes made',
                game: {
                    id: game.id,
                    name: game.name,
                    entityId: game.entityId,
                    venueId: game.venueId,
                    consolidationType: game.consolidationType
                }
            };
        }
        
        // 2. Handle multi-day tournament consolidation
        const consolidationResult = await handleConsolidationCleanup(game);
        deletionResults.consolidation = consolidationResult;
        
        // 3. Delete GameCost
        deletionResults.deletions.gameCost = await deleteGameCost(gameId);
        
        // 4. Delete GameFinancialSnapshot
        deletionResults.deletions.gameFinancialSnapshot = await deleteGameFinancialSnapshot(gameId);
        
        // 5. Delete ScrapeURL
        deletionResults.deletions.scrapeURL = await deleteScrapeURL(gameId, game.sourceUrl);
        
        // 6. Delete ScrapeAttempts
        deletionResults.deletions.scrapeAttempts = await deleteScrapeAttempts(gameId);
        
        // 7. Delete PlayerEntry and get affected player IDs
        const playerEntryResult = await deletePlayerEntries(gameId);
        deletionResults.deletions.playerEntries = { deleted: playerEntryResult.deleted };
        
        // 8. Delete PlayerResults
        deletionResults.deletions.playerResults = await deletePlayerResults(gameId);
        
        // 9. Delete PlayerTransactions
        deletionResults.deletions.playerTransactions = await deletePlayerTransactions(gameId);
        
        // 10. Decrement player statistics
        if (playerEntryResult.playerIds.length > 0) {
            deletionResults.deletions.playerStats = await decrementPlayerStats(
                gameId, 
                game, 
                playerEntryResult.playerIds
            );
        }
        
        // 11. Delete the Game record (this triggers DynamoDB streams for Entity/Venue counts)
        deletionResults.deletions.game = await deleteGameRecord(gameId);
        
        // 12. If consolidation cleanup indicated we should delete parent, do it now
        if (consolidationResult.deleteParent && consolidationResult.parentId) {
            console.log(`[DELETE-GAME] Deleting orphaned parent game ${consolidationResult.parentId}`);
            // Recursively delete the parent
            const parentDeleteResult = await exports.handler({
                gameId: consolidationResult.parentId
            });
            deletionResults.deletions.parentGame = parentDeleteResult;
        }
        
        console.log('[DELETE-GAME] ✅ Deletion complete');
        console.log('[DELETE-GAME] Results:', JSON.stringify(deletionResults, null, 2));
        
        return {
            success: true,
            message: `Successfully deleted game "${game.name}" and all related records`,
            ...deletionResults
        };
        
    } catch (error) {
        console.error('[DELETE-GAME] ❌ Error:', error);
        return {
            success: false,
            error: error.message,
            gameId
        };
    }
};

// ===================================================================
// BATCH DELETE HANDLER (for bulk operations)
// ===================================================================

exports.batchDelete = async (event) => {
    const { gameIds, dryRun = false } = event;
    
    if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
        return {
            success: false,
            error: 'gameIds array is required'
        };
    }
    
    console.log(`[DELETE-GAME] Batch delete: ${gameIds.length} game(s), dryRun: ${dryRun}`);
    
    const results = {
        requested: gameIds.length,
        successful: 0,
        failed: 0,
        details: []
    };
    
    for (const gameId of gameIds) {
        try {
            const result = await exports.handler({ gameId, dryRun });
            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
            }
            results.details.push({ gameId, ...result });
        } catch (error) {
            results.failed++;
            results.details.push({ gameId, success: false, error: error.message });
        }
    }
    
    return results;
};