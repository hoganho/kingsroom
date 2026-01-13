/**
 * recurring-game-stats.js
 * 
 * Utility for managing evolving statistics on RecurringGame templates.
 * 
 * PURPOSE:
 * A weekly tournament that starts as a $100 buy-in can evolve to $300 over time.
 * If we only store typicalBuyIn from creation, we'd stop matching new $300 games.
 * 
 * SOLUTION:
 * Track rolling averages that update as games are linked. New games are compared
 * against RECENT averages, not the original typical values.
 * 
 * KEY FUNCTIONS:
 * - updateRecurringGameStats: Called when a game is linked to a template
 * - getEffectiveBuyIn: Returns the value to compare against (average or typical)
 * - calculateTrend: Determines if values are increasing/decreasing/stable
 * 
 * VERSION: 3.1.0 - Added firstGameDate tracking
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/utils/recurring-game-stats.js
 *           (also copy to recurringGameAdmin/src/)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const RECURRING_GAME_TABLE = process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME;

// Default rolling window size
const DEFAULT_EVOLUTION_WINDOW = 12;

// ===================================================================
// TREND DETECTION
// ===================================================================

/**
 * Calculate trend from a series of values
 * @param {Array<{value: number, date: string}>} history - Recent values with dates
 * @returns {'STABLE' | 'INCREASING' | 'DECREASING'}
 */
const calculateTrend = (history) => {
    if (!history || history.length < 3) return 'STABLE';
    
    // Compare first half average to second half average
    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);
    
    const firstAvg = firstHalf.reduce((sum, h) => sum + h.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.value, 0) / secondHalf.length;
    
    if (firstAvg === 0) return 'STABLE';
    
    const changeRatio = (secondAvg - firstAvg) / firstAvg;
    
    // More than 20% change = trending
    if (changeRatio > 0.2) return 'INCREASING';
    if (changeRatio < -0.2) return 'DECREASING';
    return 'STABLE';
};

/**
 * Calculate rolling average from history array
 * @param {Array<{value: number}>} history
 * @returns {number}
 */
const calculateAverage = (history) => {
    if (!history || history.length === 0) return 0;
    const validValues = history.filter(h => h.value && h.value > 0);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, h) => sum + h.value, 0) / validValues.length;
};

// ===================================================================
// DATE COMPARISON HELPERS
// ===================================================================

/**
 * Compare two datetime strings and return the earlier one
 * @param {string} date1 - DateTime string (ISO format)
 * @param {string} date2 - DateTime string (ISO format)
 * @returns {string} The earlier datetime
 */
const getEarlierDateTime = (date1, date2) => {
    if (!date1) return date2;
    if (!date2) return date1;
    
    // Compare as strings (ISO format sorts correctly)
    return date1 < date2 ? date1 : date2;
};

/**
 * Compare two datetime strings and return the later one
 * @param {string} date1 - DateTime string (ISO format)
 * @param {string} date2 - DateTime string (ISO format)
 * @returns {string} The later datetime
 */
const getLaterDateTime = (date1, date2) => {
    if (!date1) return date2;
    if (!date2) return date1;
    
    // Compare as strings (ISO format sorts correctly)
    return date1 > date2 ? date1 : date2;
};

// ===================================================================
// MAIN UPDATE FUNCTION
// ===================================================================

/**
 * Update recurring game statistics when a game is linked
 * 
 * Called by:
 * - recurring-resolver.js when a game is matched to a template
 * - bootstrap-recurring-games.js when creating templates
 * - reprocess-recurring-games.js when re-assigning games
 * 
 * @param {Object} params
 * @param {string} params.recurringGameId - The template to update
 * @param {Object} params.game - The game being linked
 * @param {number} params.game.buyIn - Buy-in amount
 * @param {number} params.game.guaranteeAmount - Guarantee (if any)
 * @param {number} params.game.totalUniquePlayers - Entry count (if any)
 * @param {number} params.game.prizepoolPaid - Actual prizepool
 * @param {string} params.game.gameStartDateTime - Game date
 * @param {string} params.game.id - Game ID
 * @param {Object} [params.existingRecurringGame] - If already fetched, pass it to avoid extra query
 * @returns {Object} Updated statistics
 */
const updateRecurringGameStats = async ({ recurringGameId, game, existingRecurringGame = null }) => {
    if (!recurringGameId || !game) {
        console.warn('[STATS] Missing recurringGameId or game');
        return { success: false, reason: 'missing_params' };
    }
    
    console.log(`[STATS] Updating stats for recurring game ${recurringGameId} with game ${game.id}`);
    
    try {
        // Get current recurring game data if not provided
        const recurringGame = existingRecurringGame || await getRecurringGame(recurringGameId);
        if (!recurringGame) {
            console.warn(`[STATS] Recurring game ${recurringGameId} not found`);
            return { success: false, reason: 'not_found' };
        }
        
        const evolutionWindow = recurringGame.evolutionWindow || DEFAULT_EVOLUTION_WINDOW;
        // Use full ISO datetime from gameStartDateTime
        const gameDateTime = game.gameStartDateTime || new Date().toISOString();
        const gameDate = gameDateTime.split('T')[0]; // For history tracking
        
        // Parse existing history (stored as JSON strings)
        let recentBuyIns = parseHistory(recurringGame.recentBuyIns);
        let recentGuarantees = parseHistory(recurringGame.recentGuarantees);
        let recentEntries = parseHistory(recurringGame.recentEntries);
        
        // Add new values to history
        if (game.buyIn && game.buyIn > 0) {
            recentBuyIns = addToHistory(recentBuyIns, {
                value: game.buyIn,
                gameId: game.id,
                date: gameDate
            }, evolutionWindow);
        }
        
        if (game.guaranteeAmount && game.guaranteeAmount > 0) {
            recentGuarantees = addToHistory(recentGuarantees, {
                value: game.guaranteeAmount,
                gameId: game.id,
                date: gameDate
            }, evolutionWindow);
        }
        
        const entries = game.totalUniquePlayers || game.entryCount || 0;
        if (entries > 0) {
            recentEntries = addToHistory(recentEntries, {
                value: entries,
                gameId: game.id,
                date: gameDate
            }, evolutionWindow);
        }
        
        // Calculate new averages
        const averageBuyIn = calculateAverage(recentBuyIns);
        const averageGuarantee = calculateAverage(recentGuarantees);
        const averageEntries = calculateAverage(recentEntries);
        const averagePrizepool = game.prizepoolPaid || 0; // Could track this too
        
        // Calculate trends
        const buyInTrend = calculateTrend(recentBuyIns);
        const guaranteeTrend = calculateTrend(recentGuarantees);
        const entriesTrend = calculateTrend(recentEntries);
        
        // Build update - use full ISO datetime for both date fields
        const updates = {
            averageBuyIn: Math.round(averageBuyIn),
            averageGuarantee: Math.round(averageGuarantee),
            averageEntries: Math.round(averageEntries * 10) / 10,
            recentBuyIns: JSON.stringify(recentBuyIns),
            recentGuarantees: JSON.stringify(recentGuarantees),
            recentEntries: JSON.stringify(recentEntries),
            recentGameCount: recentBuyIns.length,
            buyInTrend,
            guaranteeTrend,
            entriesTrend,
            lastStatsUpdate: new Date().toISOString(),
            // Update last game date (keep the later datetime)
            lastGameDate: getLaterDateTime(gameDateTime, recurringGame.lastGameDate),
            // Update first game date (keep the earlier datetime)
            firstGameDate: getEarlierDateTime(gameDateTime, recurringGame.firstGameDate),
            // Increment instance count
            totalInstancesRun: (recurringGame.totalInstancesRun || 0) + 1
        };
        
        // Set baseline if not already set
        if (!recurringGame.baselineBuyIn && game.buyIn > 0) {
            updates.baselineBuyIn = game.buyIn;
            updates.baselineDate = gameDate;
        }
        if (!recurringGame.baselineGuarantee && game.guaranteeAmount > 0) {
            updates.baselineGuarantee = game.guaranteeAmount;
        }
        
        // Apply update to DynamoDB
        await updateRecurringGame(recurringGameId, updates);
        
        console.log(`[STATS] Updated: avgBuyIn=$${averageBuyIn}, avgGtd=$${averageGuarantee}, trend=${buyInTrend}, firstGameDate=${updates.firstGameDate}, lastGameDate=${updates.lastGameDate}`);
        
        return {
            success: true,
            recurringGameId,
            updates: {
                averageBuyIn: Math.round(averageBuyIn),
                averageGuarantee: Math.round(averageGuarantee),
                averageEntries: Math.round(averageEntries * 10) / 10,
                buyInTrend,
                recentGameCount: recentBuyIns.length,
                firstGameDate: updates.firstGameDate,
                lastGameDate: updates.lastGameDate
            }
        };
        
    } catch (error) {
        console.error(`[STATS] Error updating stats for ${recurringGameId}:`, error);
        return { success: false, reason: 'error', error: error.message };
    }
};

// ===================================================================
// HISTORY MANAGEMENT
// ===================================================================

/**
 * Parse history JSON safely
 */
const parseHistory = (historyJson) => {
    if (!historyJson) return [];
    if (Array.isArray(historyJson)) return historyJson;
    try {
        return JSON.parse(historyJson);
    } catch (e) {
        return [];
    }
};

/**
 * Add a value to history, maintaining max size
 */
const addToHistory = (history, entry, maxSize) => {
    // Check if this game is already in history
    const existingIndex = history.findIndex(h => h.gameId === entry.gameId);
    if (existingIndex >= 0) {
        // Update existing entry
        history[existingIndex] = entry;
        return history;
    }
    
    // Add new entry
    const updated = [...history, entry];
    
    // Sort by date (newest last) and trim to window size
    updated.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    
    if (updated.length > maxSize) {
        return updated.slice(-maxSize);
    }
    return updated;
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Get recurring game from database
 */
const getRecurringGame = async (recurringGameId) => {
    const result = await docClient.send(new GetCommand({
        TableName: RECURRING_GAME_TABLE,
        Key: { id: recurringGameId }
    }));
    return result.Item;
};

/**
 * Update recurring game in database
 */
const updateRecurringGame = async (recurringGameId, updates) => {
    const updateExpressions = [];
    const expressionNames = {};
    const expressionValues = { ':now': new Date().toISOString() };
    
    Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
            updateExpressions.push(`#${key} = :${key}`);
            expressionNames[`#${key}`] = key;
            expressionValues[`:${key}`] = value;
        }
    });
    
    // Always update updatedAt
    updateExpressions.push('updatedAt = :now');
    
    await docClient.send(new UpdateCommand({
        TableName: RECURRING_GAME_TABLE,
        Key: { id: recurringGameId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues
    }));
};

// ===================================================================
// COMPARISON UTILITIES (for matching logic)
// ===================================================================

/**
 * Get the effective buy-in to compare against for matching
 * Prefers average if available and has enough data, falls back to typical
 * 
 * @param {Object} recurringGame - The template
 * @returns {number} The buy-in value to compare against
 */
const getEffectiveBuyIn = (recurringGame) => {
    // If we have recent data, use average
    if (recurringGame.averageBuyIn && recurringGame.recentGameCount >= 3) {
        return recurringGame.averageBuyIn;
    }
    // Fall back to typical
    return recurringGame.typicalBuyIn || 0;
};

/**
 * Get the effective guarantee to compare against
 */
const getEffectiveGuarantee = (recurringGame) => {
    if (recurringGame.averageGuarantee && recurringGame.recentGameCount >= 3) {
        return recurringGame.averageGuarantee;
    }
    return recurringGame.typicalGuarantee || 0;
};

/**
 * Check if a game's buy-in is compatible with a recurring game template
 * Uses evolving averages and considers trends
 * 
 * @param {number} gameBuyIn - The incoming game's buy-in
 * @param {Object} recurringGame - The template to compare against
 * @param {Object} options
 * @param {number} options.toleranceRatio - Max ratio difference (default 2.0)
 * @returns {{compatible: boolean, confidence: number, reason: string}}
 */
const isBuyInCompatible = (gameBuyIn, recurringGame, options = {}) => {
    const { toleranceRatio = 2.0 } = options;
    
    if (!gameBuyIn || gameBuyIn <= 0) {
        return { compatible: true, confidence: 0.5, reason: 'no_buyin_to_compare' };
    }
    
    const effectiveBuyIn = getEffectiveBuyIn(recurringGame);
    
    if (!effectiveBuyIn || effectiveBuyIn <= 0) {
        return { compatible: true, confidence: 0.5, reason: 'no_template_buyin' };
    }
    
    const ratio = Math.max(gameBuyIn, effectiveBuyIn) / Math.min(gameBuyIn, effectiveBuyIn);
    
    // Base compatibility on ratio
    if (ratio <= 1.25) {
        return { compatible: true, confidence: 1.0, reason: 'exact_match' };
    }
    if (ratio <= 1.5) {
        return { compatible: true, confidence: 0.9, reason: 'close_match' };
    }
    if (ratio <= toleranceRatio) {
        // Check if trending in the right direction
        const trend = recurringGame.buyInTrend;
        const isGrowing = gameBuyIn > effectiveBuyIn;
        
        if (isGrowing && trend === 'INCREASING') {
            return { compatible: true, confidence: 0.8, reason: 'follows_growth_trend' };
        }
        if (!isGrowing && trend === 'DECREASING') {
            return { compatible: true, confidence: 0.8, reason: 'follows_decline_trend' };
        }
        
        return { compatible: true, confidence: 0.6, reason: 'within_tolerance' };
    }
    
    // Beyond tolerance - but check for extreme evolution
    if (ratio <= 3.0 && recurringGame.buyInTrend === 'INCREASING' && gameBuyIn > effectiveBuyIn) {
        return { compatible: true, confidence: 0.5, reason: 'possible_evolution' };
    }
    
    return { compatible: false, confidence: 0, reason: 'beyond_tolerance' };
};

/**
 * Initialize statistics for a newly created recurring game
 * Called by bootstrap or when first creating a template
 */
const initializeStats = (templateData, initialGames = []) => {
    const buyIns = initialGames.map(g => g.buyIn).filter(b => b > 0);
    const guarantees = initialGames.map(g => g.guaranteeAmount).filter(g => g > 0);
    const entries = initialGames.map(g => g.totalUniquePlayers || g.entryCount).filter(e => e > 0);
    
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    
    // Find first and last game datetimes from initial games
    const gameDateTimes = initialGames
        .map(g => g.gameStartDateTime)
        .filter(d => d)
        .sort();
    
    // Both use AWSDateTime format (ISO)
    const firstGameDate = gameDateTimes.length > 0 ? gameDateTimes[0] : null;
    const lastGameDate = gameDateTimes.length > 0 ? gameDateTimes[gameDateTimes.length - 1] : null;
    
    // Build history arrays
    const recentBuyIns = initialGames
        .filter(g => g.buyIn > 0)
        .map(g => ({
            value: g.buyIn,
            gameId: g.id,
            date: g.gameStartDateTime?.split('T')[0] || today
        }))
        .slice(-DEFAULT_EVOLUTION_WINDOW);
    
    const recentGuarantees = initialGames
        .filter(g => g.guaranteeAmount > 0)
        .map(g => ({
            value: g.guaranteeAmount,
            gameId: g.id,
            date: g.gameStartDateTime?.split('T')[0] || today
        }))
        .slice(-DEFAULT_EVOLUTION_WINDOW);
    
    const recentEntries = initialGames
        .filter(g => (g.totalUniquePlayers || g.entryCount) > 0)
        .map(g => ({
            value: g.totalUniquePlayers || g.entryCount,
            gameId: g.id,
            date: g.gameStartDateTime?.split('T')[0] || today
        }))
        .slice(-DEFAULT_EVOLUTION_WINDOW);
    
    return {
        ...templateData,
        // Date tracking
        firstGameDate,
        lastGameDate,
        // Averages
        averageBuyIn: buyIns.length > 0 ? Math.round(buyIns.reduce((a, b) => a + b, 0) / buyIns.length) : templateData.typicalBuyIn || 0,
        averageGuarantee: guarantees.length > 0 ? Math.round(guarantees.reduce((a, b) => a + b, 0) / guarantees.length) : templateData.typicalGuarantee || 0,
        averageEntries: entries.length > 0 ? Math.round(entries.reduce((a, b) => a + b, 0) / entries.length * 10) / 10 : 0,
        // History
        recentBuyIns: JSON.stringify(recentBuyIns),
        recentGuarantees: JSON.stringify(recentGuarantees),
        recentEntries: JSON.stringify(recentEntries),
        recentGameCount: recentBuyIns.length,
        evolutionWindow: DEFAULT_EVOLUTION_WINDOW,
        // Trends (need more data)
        buyInTrend: 'STABLE',
        guaranteeTrend: 'STABLE',
        entriesTrend: 'STABLE',
        lastStatsUpdate: now,
        // Baseline
        baselineBuyIn: buyIns.length > 0 ? buyIns[0] : templateData.typicalBuyIn,
        baselineGuarantee: guarantees.length > 0 ? guarantees[0] : templateData.typicalGuarantee,
        baselineDate: today,
        // Instance count
        totalInstancesRun: initialGames.length
    };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Main update function
    updateRecurringGameStats,
    
    // Comparison utilities
    getEffectiveBuyIn,
    getEffectiveGuarantee,
    isBuyInCompatible,
    
    // Initialization
    initializeStats,
    
    // Trend calculation
    calculateTrend,
    calculateAverage,
    
    // DateTime helpers
    getEarlierDateTime,
    getLaterDateTime,
    
    // History helpers
    parseHistory,
    addToHistory,
    
    // Constants
    DEFAULT_EVOLUTION_WINDOW
};