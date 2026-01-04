/**
 * ===================================================================
 * syncActiveGame.js - ActiveGame Table Synchronization
 * ===================================================================
 * 
 * PURPOSE:
 * Maintains the ActiveGame and RecentlyFinishedGame tables as lightweight
 * projections of the Game table for fast dashboard queries.
 * 
 * INTEGRATION:
 * Called from saveGameFunction after every game create/update.
 * 
 * LIFECYCLE:
 * - INITIATING, REGISTERING, RUNNING, CLOCK_STOPPED → Create/Update ActiveGame
 * - FINISHED → Delete ActiveGame, Create RecentlyFinishedGame
 * - CANCELLED, NOT_IN_USE, NOT_PUBLISHED → Delete ActiveGame (if exists)
 * 
 * ===================================================================
 */

const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CONSTANTS
// ===================================================================

// Statuses that should have an ActiveGame record
const ACTIVE_STATUSES = ['INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED'];

// Statuses that trigger move to RecentlyFinishedGame
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];

// Statuses that trigger deletion (no projection needed)
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_IN_USE', 'NOT_PUBLISHED', 'UNKNOWN'];

// Refresh intervals by status (in minutes)
const REFRESH_INTERVALS = {
    RUNNING: 15,
    CLOCK_STOPPED: 30,
    REGISTERING: 60,
    INITIATING: 120
};

// TTL for RecentlyFinishedGame (7 days in seconds)
const RECENTLY_FINISHED_TTL_DAYS = 7;

// ===================================================================
// TABLE NAME HELPER
// ===================================================================

const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error('API ID or environment not found');
    }
    const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
    if (process.env[envVarName]) return process.env[envVarName];
    return `${modelName}-${apiId}-${env}`;
};

// ===================================================================
// MAIN SYNC FUNCTION
// ===================================================================

/**
 * Synchronize ActiveGame table based on game state
 * 
 * @param {Object} game - The saved Game record
 * @param {Object} input - The original input (contains venue/entity info)
 * @param {boolean} wasNewGame - Whether this was a new game creation
 * @param {Object} existingGame - The previous game state (for transition detection)
 * @param {Object} ddbDocClient - DynamoDB Document Client
 * @returns {Object} Sync result with action taken
 */
async function syncActiveGame(game, input, wasNewGame, existingGame, ddbDocClient) {
    const startTime = Date.now();
    const gameId = game.id;
    const gameStatus = game.gameStatus;
    const previousStatus = existingGame?.gameStatus;
    
    console.log(`[syncActiveGame] Starting sync for game ${gameId}`, {
        gameStatus,
        previousStatus,
        wasNewGame
    });
    
    try {
        // Determine what action to take based on status
        const isActive = ACTIVE_STATUSES.includes(gameStatus);
        const isFinished = FINISHED_STATUSES.includes(gameStatus);
        const isInactive = INACTIVE_STATUSES.includes(gameStatus);
        const wasActive = previousStatus && ACTIVE_STATUSES.includes(previousStatus);
        const wasFinished = previousStatus && FINISHED_STATUSES.includes(previousStatus);
        
        let action = 'NO_CHANGE';
        let activeGameId = null;
        
        // Case 1: Game is in an active state → Create/Update ActiveGame
        if (isActive) {
            const result = await upsertActiveGame(game, input, ddbDocClient);
            action = result.created ? 'ACTIVE_GAME_CREATED' : 'ACTIVE_GAME_UPDATED';
            activeGameId = result.id;
        }
        
        // Case 2: Game just finished → Delete ActiveGame, Create RecentlyFinishedGame
        else if (isFinished && !wasFinished) {
            // Delete from ActiveGame (if exists)
            await deleteActiveGame(gameId, ddbDocClient);
            
            // Create RecentlyFinishedGame
            const rfgResult = await createRecentlyFinishedGame(game, input, ddbDocClient);
            action = 'MOVED_TO_RECENTLY_FINISHED';
            activeGameId = rfgResult.id;
        }
        
        // Case 3: Game is inactive (cancelled, etc.) → Delete ActiveGame
        else if (isInactive && wasActive) {
            await deleteActiveGame(gameId, ddbDocClient);
            action = 'ACTIVE_GAME_DELETED';
        }
        
        // Case 4: Game was already finished and is being re-scraped → Update RecentlyFinishedGame
        else if (isFinished && wasFinished) {
            const result = await updateRecentlyFinishedGame(game, input, ddbDocClient);
            action = result.updated ? 'RECENTLY_FINISHED_UPDATED' : 'NO_CHANGE';
            activeGameId = result.id;
        }
        
        const duration = Date.now() - startTime;
        console.log(`[syncActiveGame] Completed in ${duration}ms`, { action, gameId, activeGameId });
        
        return {
            success: true,
            action,
            activeGameId,
            gameStatus,
            durationMs: duration
        };
        
    } catch (error) {
        console.error(`[syncActiveGame] Error syncing game ${gameId}:`, error);
        return {
            success: false,
            action: 'ERROR',
            error: error.message,
            gameStatus
        };
    }
}

// ===================================================================
// ACTIVE GAME OPERATIONS
// ===================================================================

/**
 * Create or update an ActiveGame record
 */
async function upsertActiveGame(game, input, ddbDocClient) {
    const activeGameTable = getTableName('ActiveGame');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Check if record exists
    let existingActiveGame = null;
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: activeGameTable,
            IndexName: 'byGameIdActive',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': game.id },
            Limit: 1
        }));
        existingActiveGame = result.Items?.[0];
    } catch (err) {
        console.warn('[syncActiveGame] Error checking existing ActiveGame:', err.message);
    }
    
    // Calculate refresh timing
    const refreshInterval = REFRESH_INTERVALS[game.gameStatus] || 60;
    const nextRefreshAt = new Date(timestamp + refreshInterval * 60 * 1000).toISOString();
    
    // Calculate hasOverlay flag
    const hasOverlay = game.hasGuarantee && 
        game.guaranteeAmount > 0 && 
        (game.prizepoolPaid || game.prizepoolCalculated || 0) < game.guaranteeAmount;
    
    // Build the ActiveGame record
    const activeGameRecord = {
        id: existingActiveGame?.id || game.id, // Use game ID as ActiveGame ID for 1:1 mapping
        gameId: game.id,
        entityId: game.entityId || input?.source?.entityId,
        venueId: game.venueId || null,
        tournamentId: game.tournamentId || null,
        
        // Status
        gameStatus: game.gameStatus,
        registrationStatus: game.registrationStatus || null,
        previousStatus: existingActiveGame?.gameStatus || null,
        statusChangedAt: existingActiveGame?.gameStatus !== game.gameStatus ? now : (existingActiveGame?.statusChangedAt || now),
        
        // Denormalized display fields
        name: game.name,
        venueName: input?.venue?.venueName || game.venueName || null,
        venueLogoCached: game.venueLogoCached || null,
        entityName: input?.entityName || game.entityName || null,
        
        gameStartDateTime: game.gameStartDateTime,
        gameEndDateTime: game.gameEndDateTime || null,
        
        // Live stats
        totalEntries: game.totalEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        playersRemaining: game.playersRemaining || null,
        totalChipsInPlay: game.totalChipsInPlay || null,
        averagePlayerStack: game.averagePlayerStack || null,
        
        // Financials
        buyIn: game.buyIn || 0,
        prizepoolPaid: game.prizepoolPaid || null,
        prizepoolCalculated: game.prizepoolCalculated || null,
        guaranteeAmount: game.guaranteeAmount || null,
        hasGuarantee: game.hasGuarantee || false,
        
        // Classification
        gameType: game.gameType || null,
        gameVariant: game.gameVariant || null,
        tournamentType: game.tournamentType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        
        // Source
        sourceUrl: game.sourceUrl || input?.source?.sourceId || null,
        
        // Refresh scheduling
        refreshEnabled: true,
        refreshIntervalMinutes: refreshInterval,
        lastRefreshedAt: now,
        nextRefreshAt: nextRefreshAt,
        refreshCount: (existingActiveGame?.refreshCount || 0) + (existingActiveGame ? 1 : 0),
        consecutiveRefreshFailures: 0,
        lastRefreshError: null,
        
        // Priority flags
        isPriority: existingActiveGame?.isPriority || false,
        hasOverlay: hasOverlay,
        isMainEvent: game.isMainEvent || false,
        
        // Metadata
        createdAt: existingActiveGame?.createdAt || now,
        updatedAt: now,
        activatedAt: existingActiveGame?.activatedAt || now,
        activatedBy: existingActiveGame?.activatedBy || 'SAVE_GAME',
        
        // DynamoDB metadata
        _version: (existingActiveGame?._version || 0) + 1,
        _lastChangedAt: timestamp,
        __typename: 'ActiveGame'
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: activeGameTable,
        Item: activeGameRecord
    }));
    
    console.log(`[syncActiveGame] ${existingActiveGame ? 'Updated' : 'Created'} ActiveGame for game ${game.id}`);
    
    return {
        id: activeGameRecord.id,
        created: !existingActiveGame
    };
}

/**
 * Delete an ActiveGame record
 */
async function deleteActiveGame(gameId, ddbDocClient) {
    const activeGameTable = getTableName('ActiveGame');
    
    // Find by gameId
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: activeGameTable,
            IndexName: 'byGameIdActive',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId },
            Limit: 1
        }));
        
        if (result.Items?.[0]) {
            await ddbDocClient.send(new DeleteCommand({
                TableName: activeGameTable,
                Key: { id: result.Items[0].id }
            }));
            console.log(`[syncActiveGame] Deleted ActiveGame for game ${gameId}`);
            return true;
        }
    } catch (err) {
        console.warn('[syncActiveGame] Error deleting ActiveGame:', err.message);
    }
    
    return false;
}

// ===================================================================
// RECENTLY FINISHED GAME OPERATIONS
// ===================================================================

/**
 * Create a RecentlyFinishedGame record
 */
async function createRecentlyFinishedGame(game, input, ddbDocClient) {
    const recentlyFinishedTable = getTableName('RecentlyFinishedGame');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Calculate TTL (7 days from game START date, since most games start/end same day)
    const gameStartMs = game.gameStartDateTime 
        ? new Date(game.gameStartDateTime).getTime() 
        : timestamp;
    const ttlTimestamp = Math.floor(gameStartMs / 1000) + (RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60);
    
    // Calculate duration if we have start and end times
    let totalDuration = null;
    if (game.gameStartDateTime && game.gameEndDateTime) {
        const start = new Date(game.gameStartDateTime).getTime();
        const end = new Date(game.gameEndDateTime).getTime();
        const durationMs = end - start;
        if (durationMs > 0) {
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            totalDuration = `${hours}h ${minutes}m`;
        }
    }
    
    const recentlyFinishedRecord = {
        id: game.id, // Use game ID for 1:1 mapping
        gameId: game.id,
        entityId: game.entityId || input?.source?.entityId,
        venueId: game.venueId || null,
        tournamentId: game.tournamentId || null,
        
        // Denormalized display fields
        name: game.name,
        venueName: input?.venue?.venueName || game.venueName || null,
        venueLogoCached: game.venueLogoCached || null,
        entityName: input?.entityName || game.entityName || null,
        
        gameStartDateTime: game.gameStartDateTime,
        finishedAt: game.gameEndDateTime || now,
        totalDuration: totalDuration,
        
        // Final results
        totalEntries: game.totalEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        prizepoolPaid: game.prizepoolPaid || null,
        prizepoolCalculated: game.prizepoolCalculated || null,
        buyIn: game.buyIn || 0,
        
        // Classification
        gameType: game.gameType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        isMainEvent: game.isMainEvent || false,
        
        sourceUrl: game.sourceUrl || input?.source?.sourceId || null,
        
        // TTL for auto-cleanup
        ttl: ttlTimestamp,
        
        // Metadata
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'RecentlyFinishedGame'
    };
    
    await ddbDocClient.send(new PutCommand({
        TableName: recentlyFinishedTable,
        Item: recentlyFinishedRecord
    }));
    
    console.log(`[syncActiveGame] Created RecentlyFinishedGame for game ${game.id}`);
    
    return { id: recentlyFinishedRecord.id };
}

/**
 * Update an existing RecentlyFinishedGame record
 */
async function updateRecentlyFinishedGame(game, input, ddbDocClient) {
    const recentlyFinishedTable = getTableName('RecentlyFinishedGame');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Check if exists
    try {
        const result = await ddbDocClient.send(new GetCommand({
            TableName: recentlyFinishedTable,
            Key: { id: game.id }
        }));
        
        if (result.Item) {
            // Update with latest data
            const updateRecord = {
                ...result.Item,
                totalEntries: game.totalEntries || result.Item.totalEntries,
                totalUniquePlayers: game.totalUniquePlayers || result.Item.totalUniquePlayers,
                prizepoolPaid: game.prizepoolPaid || result.Item.prizepoolPaid,
                prizepoolCalculated: game.prizepoolCalculated || result.Item.prizepoolCalculated,
                updatedAt: now,
                _version: (result.Item._version || 0) + 1,
                _lastChangedAt: timestamp
            };
            
            await ddbDocClient.send(new PutCommand({
                TableName: recentlyFinishedTable,
                Item: updateRecord
            }));
            
            console.log(`[syncActiveGame] Updated RecentlyFinishedGame for game ${game.id}`);
            return { id: game.id, updated: true };
        }
    } catch (err) {
        console.warn('[syncActiveGame] Error updating RecentlyFinishedGame:', err.message);
    }
    
    // If doesn't exist, create it
    return await createRecentlyFinishedGame(game, input, ddbDocClient);
}

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    syncActiveGame,
    // Export constants for testing
    ACTIVE_STATUSES,
    FINISHED_STATUSES,
    INACTIVE_STATUSES,
    REFRESH_INTERVALS
};