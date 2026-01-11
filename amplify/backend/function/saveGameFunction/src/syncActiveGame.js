/**
 * ===================================================================
 * syncActiveGame.js - ActiveGame Table Synchronization
 * ===================================================================
 * 
 * VERSION: 2.0.0
 * - Added stale game detection: games started >7 days ago but not FINISHED
 *   are removed from ActiveGame and marked with isStatusDataStale flag
 * - Added backdated game filtering: FINISHED games with gameStartDateTime >7 days ago
 *   are NOT added to RecentlyFinishedGame (historical backfill data)
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
 *   (unless game started >7 days ago → mark as stale instead)
 * - FINISHED → Delete ActiveGame, Create RecentlyFinishedGame
 *   (unless gameStartDateTime >7 days ago → skip RecentlyFinishedGame)
 * - CANCELLED, NOT_IN_USE, NOT_PUBLISHED → Delete ActiveGame (if exists)
 * 
 * ===================================================================
 */

const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
// STALE GAME CONFIGURATION
// ===================================================================

// Games started more than this many days ago with active status are considered stale
const STALE_GAME_THRESHOLD_DAYS = 7;

// Maximum age for games to be added to RecentlyFinishedGame (prevents backfill flooding)
const MAX_AGE_FOR_RECENTLY_FINISHED_DAYS = 7;

// Reason codes for stale status
const STALE_REASONS = {
    GAME_STARTED_OVER_7_DAYS_AGO_NOT_FINISHED: 'GAME_STARTED_OVER_7_DAYS_AGO_NOT_FINISHED',
    GAME_NEVER_STARTED: 'GAME_NEVER_STARTED',
    MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED'
};

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
// DATE/TIME HELPERS
// ===================================================================

/**
 * Calculate the number of days between a date and now
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {number} - Number of days (can be negative if date is in future)
 */
function daysSince(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    const now = Date.now();
    const diffMs = now - date.getTime();
    return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Check if a game is stale (started >7 days ago but not finished)
 * @param {Object} game - Game record
 * @returns {Object} - { isStale: boolean, reason: string|null }
 */
function checkIfGameIsStale(game) {
    const gameStatus = game.gameStatus;
    const gameStartDateTime = game.gameStartDateTime;
    
    // Only check games in active statuses
    if (!ACTIVE_STATUSES.includes(gameStatus)) {
        return { isStale: false, reason: null };
    }
    
    // If no start date, can't determine staleness
    if (!gameStartDateTime) {
        return { isStale: false, reason: null };
    }
    
    const daysOld = daysSince(gameStartDateTime);
    
    // If game started more than threshold days ago, it's stale
    if (daysOld !== null && daysOld > STALE_GAME_THRESHOLD_DAYS) {
        return {
            isStale: true,
            reason: STALE_REASONS.GAME_STARTED_OVER_7_DAYS_AGO_NOT_FINISHED,
            daysOld: Math.floor(daysOld)
        };
    }
    
    return { isStale: false, reason: null };
}

/**
 * Check if a finished game is too old for RecentlyFinishedGame
 * @param {Object} game - Game record
 * @returns {boolean} - true if game should be excluded from RecentlyFinishedGame
 */
function isGameTooOldForRecentlyFinished(game) {
    const gameStartDateTime = game.gameStartDateTime;
    
    if (!gameStartDateTime) {
        // No start date - probably shouldn't happen, but include it to be safe
        return false;
    }
    
    const daysOld = daysSince(gameStartDateTime);
    
    // If game started more than threshold days ago, exclude from RecentlyFinished
    if (daysOld !== null && daysOld > MAX_AGE_FOR_RECENTLY_FINISHED_DAYS) {
        return true;
    }
    
    return false;
}

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
        wasNewGame,
        gameStartDateTime: game.gameStartDateTime
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
        let staleGameUpdate = null;
        
        // ═══════════════════════════════════════════════════════════════════
        // Case 1: Game is in an active state → Check if stale, then Create/Update
        // ═══════════════════════════════════════════════════════════════════
        if (isActive) {
            const staleCheck = checkIfGameIsStale(game);
            
            if (staleCheck.isStale) {
                // Game is stale - remove from ActiveGame and mark on Game record
                console.log(`[syncActiveGame] Game ${gameId} is stale (${staleCheck.daysOld} days old), removing from active games`);
                
                // Delete from ActiveGame if exists
                await deleteActiveGame(gameId, ddbDocClient);
                
                // Mark the game as having stale status data
                staleGameUpdate = await markGameAsStale(gameId, staleCheck.reason, ddbDocClient);
                
                action = 'MARKED_AS_STALE';
            } else {
                // Game is not stale - normal upsert
                // But first, clear stale flag if it was previously set
                if (existingGame?.isStatusDataStale) {
                    await clearStaleFlag(gameId, ddbDocClient);
                }
                
                const result = await upsertActiveGame(game, input, ddbDocClient);
                action = result.created ? 'ACTIVE_GAME_CREATED' : 'ACTIVE_GAME_UPDATED';
                activeGameId = result.id;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Case 2: Game just finished → Delete ActiveGame, optionally create RecentlyFinished
        // ═══════════════════════════════════════════════════════════════════
        else if (isFinished && !wasFinished) {
            // Always delete from ActiveGame (if exists)
            await deleteActiveGame(gameId, ddbDocClient);
            
            // Clear stale flag if it was set (game is now properly finished)
            if (existingGame?.isStatusDataStale) {
                await clearStaleFlag(gameId, ddbDocClient);
            }
            
            // Check if game is too old for RecentlyFinished (backfill scenario)
            if (isGameTooOldForRecentlyFinished(game)) {
                const daysOld = Math.floor(daysSince(game.gameStartDateTime));
                console.log(`[syncActiveGame] Game ${gameId} started ${daysOld} days ago - skipping RecentlyFinishedGame (backdated data)`);
                action = 'FINISHED_BUT_TOO_OLD_FOR_RECENT';
            } else {
                // Create RecentlyFinishedGame
                const rfgResult = await createRecentlyFinishedGame(game, input, ddbDocClient);
                action = 'MOVED_TO_RECENTLY_FINISHED';
                activeGameId = rfgResult.id;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Case 3: Game is inactive (cancelled, etc.) → Delete ActiveGame
        // ═══════════════════════════════════════════════════════════════════
        else if (isInactive && wasActive) {
            await deleteActiveGame(gameId, ddbDocClient);
            
            // Clear stale flag if set
            if (existingGame?.isStatusDataStale) {
                await clearStaleFlag(gameId, ddbDocClient);
            }
            
            action = 'ACTIVE_GAME_DELETED';
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // Case 4: Game was already finished and is being re-scraped
        // ═══════════════════════════════════════════════════════════════════
        else if (isFinished && wasFinished) {
            // Check if this is a backfill scenario
            if (isGameTooOldForRecentlyFinished(game)) {
                console.log(`[syncActiveGame] Game ${gameId} is backdated finished game - not updating RecentlyFinished`);
                action = 'BACKDATED_FINISHED_SKIPPED';
            } else {
                const result = await updateRecentlyFinishedGame(game, input, ddbDocClient);
                action = result.updated ? 'RECENTLY_FINISHED_UPDATED' : 'NO_CHANGE';
                activeGameId = result.id;
            }
        }
        
        const duration = Date.now() - startTime;
        console.log(`[syncActiveGame] Completed in ${duration}ms`, { action, gameId, activeGameId });
        
        return {
            success: true,
            action,
            activeGameId,
            gameStatus,
            staleGameUpdate,
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
// STALE GAME OPERATIONS
// ===================================================================

/**
 * Mark a game as having stale status data
 * @param {string} gameId - Game ID
 * @param {string} reason - Reason code for staleness
 * @param {Object} ddbDocClient - DynamoDB Document Client
 */
async function markGameAsStale(gameId, reason, ddbDocClient) {
    const gameTable = getTableName('Game');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: gameTable,
            Key: { id: gameId },
            // CRITICAL: Only update if the record exists!
            // Without this, UpdateCommand would CREATE a new empty record
            ConditionExpression: 'attribute_exists(id)',
            UpdateExpression: 'SET #isStale = :isStale, #staleAt = :staleAt, #staleReason = :staleReason, #updatedAt = :updatedAt, #lastChangedAt = :lastChangedAt',
            ExpressionAttributeNames: {
                '#isStale': 'isStatusDataStale',
                '#staleAt': 'statusDataStaleAt',
                '#staleReason': 'statusDataStaleReason',
                '#updatedAt': 'updatedAt',
                '#lastChangedAt': '_lastChangedAt'
            },
            ExpressionAttributeValues: {
                ':isStale': true,
                ':staleAt': now,
                ':staleReason': reason,
                ':updatedAt': now,
                ':lastChangedAt': timestamp
            }
        }));
        
        console.log(`[syncActiveGame] Marked game ${gameId} as stale: ${reason}`);
        
        return {
            gameId,
            isStatusDataStale: true,
            statusDataStaleAt: now,
            statusDataStaleReason: reason
        };
    } catch (error) {
        // ConditionalCheckFailedException means the Game record doesn't exist
        if (error.name === 'ConditionalCheckFailedException') {
            console.warn(`[syncActiveGame] Game ${gameId} not found - cannot mark as stale (orphaned ActiveGame?)`);
            return {
                gameId,
                isStatusDataStale: false,
                error: 'GAME_NOT_FOUND'
            };
        }
        console.error(`[syncActiveGame] Error marking game ${gameId} as stale:`, error);
        throw error;
    }
}

/**
 * Clear the stale flag from a game (when it's properly finished or status is resolved)
 * @param {string} gameId - Game ID
 * @param {Object} ddbDocClient - DynamoDB Document Client
 */
async function clearStaleFlag(gameId, ddbDocClient) {
    const gameTable = getTableName('Game');
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: gameTable,
            Key: { id: gameId },
            // CRITICAL: Only update if the record exists!
            ConditionExpression: 'attribute_exists(id)',
            UpdateExpression: 'SET #isStale = :isStale, #updatedAt = :updatedAt, #lastChangedAt = :lastChangedAt REMOVE #staleAt, #staleReason',
            ExpressionAttributeNames: {
                '#isStale': 'isStatusDataStale',
                '#staleAt': 'statusDataStaleAt',
                '#staleReason': 'statusDataStaleReason',
                '#updatedAt': 'updatedAt',
                '#lastChangedAt': '_lastChangedAt'
            },
            ExpressionAttributeValues: {
                ':isStale': false,
                ':updatedAt': now,
                ':lastChangedAt': timestamp
            }
        }));
        
        console.log(`[syncActiveGame] Cleared stale flag from game ${gameId}`);
    } catch (error) {
        // ConditionalCheckFailedException means the Game record doesn't exist - that's OK
        if (error.name === 'ConditionalCheckFailedException') {
            console.warn(`[syncActiveGame] Game ${gameId} not found - cannot clear stale flag`);
            return;
        }
        console.error(`[syncActiveGame] Error clearing stale flag from game ${gameId}:`, error);
        // Non-fatal - don't throw
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
        buyIn: game.buyIn || null,
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
        totalDuration = Math.floor(durationMs / 1000);
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
    
    // If doesn't exist, create it (but check if it's too old first)
    if (isGameTooOldForRecentlyFinished(game)) {
        console.log(`[syncActiveGame] Game ${game.id} is too old for RecentlyFinished - skipping creation`);
        return { id: game.id, updated: false, skipped: true };
    }
    
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
    REFRESH_INTERVALS,
    STALE_GAME_THRESHOLD_DAYS,
    MAX_AGE_FOR_RECENTLY_FINISHED_DAYS,
    STALE_REASONS,
    // Export helpers for testing
    checkIfGameIsStale,
    isGameTooOldForRecentlyFinished,
    daysSince
};
