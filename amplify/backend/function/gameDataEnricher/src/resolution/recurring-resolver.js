/**
 * recurring-resolver.js
 * REFACTORED: More forgiving matching logic for recurring game resolution
 * 
 * Key Changes:
 * 1. STRUCTURAL MATCHING FIRST - venue + day + sessionMode + variant is primary
 * 2. HEAVY NAME NORMALIZATION - strips marketing terms, amounts, structure keywords
 * 3. CASH GAMES SIMPLIFIED - purely structural matching (no name matching needed)
 * 4. FLEXIBLE TIMES - time barely factors into scoring
 * 5. DEFERRED AUTO-CREATION - only creates recurring games after seeing 2+ similar games
 * 6. BUY-IN/GUARANTEE TOLERANCE - very permissive (games evolve over time)
 * 
 * Matching Philosophy:
 * - Most venues have ONE main tournament per day per variant
 * - Cash games are ALWAYS grouped by venue + day + variant only
 * - Name variations are marketing, not different games
 * - Buy-ins and guarantees change over time (growth/shrinkage is normal)
 * 
 * Detection Order:
 * 1. Filter by venue + day + sessionMode (hard requirements)
 * 2. For CASH: Group by gameVariant only → done
 * 3. For TOURNAMENTS: 
 *    a. If only ONE candidate after variant filter → high confidence match
 *    b. If multiple → use normalized name similarity to pick best
 *    c. Sanity check buy-in isn't wildly different (10x)
 * 4. Auto-create only if we've seen a similar game before OR if explicitly enabled
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, PutCommand, ScanCommand } = require('../utils/db-client');
const { DAYS_OF_WEEK, VALIDATION_THRESHOLDS } = require('../utils/constants');
const { 
    normalizeGameName: sharedNormalizeGameName,
    stringSimilarity: diceStringSimilarity,
    generateDisplayName
} = require('../utils/game-name-utils');

// Evolving statistics utilities
const { 
    updateRecurringGameStats,
    getEffectiveBuyIn,
    getEffectiveGuarantee,
    isBuyInCompatible
} = require('../utils/recurring-game-stats');

// ===================================================================
// AEST/AEDT TIMEZONE UTILITIES (unchanged)
// ===================================================================

const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

const isAEDT = (date) => {
    const month = date.getUTCMonth();
    if (month >= 3 && month <= 8) return false;
    if (month >= 10 || month <= 1) return true;
    const dayOfMonth = date.getUTCDate();
    if (month === 9) return dayOfMonth >= 7;
    return true;
};

const getAustralianOffset = (date) => {
    return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
};

const toAEST = (utcDate) => {
    const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
    if (isNaN(d.getTime())) return null;
    
    const offset = getAustralianOffset(d);
    const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
    
    return {
        year: aestTime.getUTCFullYear(),
        month: aestTime.getUTCMonth(),
        day: aestTime.getUTCDate(),
        hours: aestTime.getUTCHours(),
        minutes: aestTime.getUTCMinutes(),
        seconds: aestTime.getUTCSeconds(),
        dayOfWeek: aestTime.getUTCDay(),
        isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`
    };
};

// ===================================================================
// CONSTANTS (REFACTORED)
// ===================================================================

/**
 * Simplified scoring - structural matches are worth most
 * Name matching is secondary confirmation
 */
const SCORING_WEIGHTS = {
    // Structural (hard requirements - filtered, not scored)
    // venue, dayOfWeek, sessionMode are pre-filtered
    
    // Variant match is important
    VARIANT_EXACT: 40,
    VARIANT_MISSING: 0,  // Don't penalize if one side doesn't have variant
    
    // Name scoring (for tournaments with multiple candidates)
    NAME_EXACT: 50,
    NAME_HIGH_SIMILARITY: 40,  // >= 0.8
    NAME_MEDIUM_SIMILARITY: 30, // >= 0.6
    NAME_LOW_SIMILARITY: 15,   // >= 0.4
    NAME_POOR_SIMILARITY: 0,   // < 0.4
    
    // Buy-in is sanity check only (don't penalize normal variance)
    BUYIN_REASONABLE: 10,      // Within 3x of template
    BUYIN_SUSPICIOUS: -20,     // More than 5x difference (probably different game)
    
    // Time is nearly irrelevant (venues shift start times all the time)
    TIME_BONUS: 5,             // Small bonus for same time, no penalty for different
    
    // Single candidate bonus (if only one option after filtering, probably right)
    SINGLE_CANDIDATE_BONUS: 25,
};

const MATCH_THRESHOLDS = {
    HIGH_CONFIDENCE: 60,       // Lowered from 75 - structural match + variant is enough
    MEDIUM_CONFIDENCE: 40,     // Lowered from 50
    
    // For deferred creation - similarity needed to consider games as "same pattern"
    PATTERN_SIMILARITY: 0.6,
    
    // Buy-in sanity check ratios
    BUYIN_SUSPICIOUS_RATIO: 5,  // 5x difference is suspicious
    BUYIN_IMPOSSIBLE_RATIO: 10, // 10x difference is probably different game
};

// ===================================================================
// SESSION MODE DETECTION (SIMPLIFIED)
// ===================================================================

/**
 * Cash game indicators - if ANY of these match, it's a cash game
 * Much simpler than before - cash games are explicitly named
 */
const CASH_GAME_PATTERNS = [
    /\bcash\s*game/i,
    /\bcash\s*session/i,
    /\bring\s*game/i,
    /\bcash\s*table/i,
    /\blive\s*cash/i,
    /\$?\d+\s*\/\s*\$?\d+/,  // Stake notation: "$1/$2", "1/2"
];

/**
 * Detect if a game is CASH or TOURNAMENT
 * Simple rule: if it has cash game indicators OR gameType is already set, use that
 * Default is TOURNAMENT (most scraped games are tournaments)
 */
const detectSessionMode = (game) => {
    // If explicitly set, use it
    if (game.gameType === 'CASH_GAME' || game.gameType === 'CASH') {
        return { mode: 'CASH', confidence: 1.0, reason: 'explicit_gameType' };
    }
    if (game.sessionMode === 'CASH') {
        return { mode: 'CASH', confidence: 1.0, reason: 'explicit_sessionMode' };
    }
    
    // Check name for cash game patterns
    const name = game.name || '';
    for (const pattern of CASH_GAME_PATTERNS) {
        if (pattern.test(name)) {
            return { mode: 'CASH', confidence: 0.95, reason: 'name_pattern', pattern: pattern.toString() };
        }
    }
    
    // Default to tournament
    return { mode: 'TOURNAMENT', confidence: 0.8, reason: 'default' };
};

/**
 * Normalize session mode to consistent values
 */
const normalizeSessionMode = (mode) => {
    if (!mode) return 'TOURNAMENT';
    const upper = mode.toUpperCase();
    if (upper === 'CASH' || upper === 'CASH_GAME') return 'CASH';
    return 'TOURNAMENT';
};

// ===================================================================
// NAME NORMALIZATION (HEAVILY IMPROVED)
// ===================================================================

/**
 * Normalize game name using shared utility
 * This wrapper ensures consistent options across the codebase
 */
const normalizeGameName = (name) => {
    return sharedNormalizeGameName(name, {
        removeDays: true,
        removeTournamentTypes: true,  // recurring-resolver uses aggressive stripping
        removeAmounts: true,
        removeTimes: true
    });
};

/**
 * Extract "core tokens" from a name - the essential identifying words
 * Used for matching when full fuzzy comparison isn't decisive
 */
const extractCoreTokens = (name) => {
    const normalized = normalizeGameName(name);
    const words = normalized.split(' ').filter(w => w.length > 2);
    
    // Remove very common words that don't identify the game
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from']);
    return words.filter(w => !stopWords.has(w));
};

/**
 * Calculate name similarity using multiple strategies
 * Returns score from 0 to 1
 */
const calculateNameSimilarity = (name1, name2) => {
    const norm1 = normalizeGameName(name1);
    const norm2 = normalizeGameName(name2);
    
    // Exact match after normalization
    if (norm1 === norm2) return 1.0;
    
    // One contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;
    
    // Token overlap (Jaccard similarity)
    const tokens1 = new Set(extractCoreTokens(name1));
    const tokens2 = new Set(extractCoreTokens(name2));
    
    if (tokens1.size === 0 || tokens2.size === 0) {
        // Fall back to string similarity if no tokens
        return stringSimilarity.compareTwoStrings(norm1, norm2);
    }
    
    const intersection = [...tokens1].filter(t => tokens2.has(t));
    const union = new Set([...tokens1, ...tokens2]);
    const jaccard = intersection.length / union.size;
    
    // Also do fuzzy string comparison
    const fuzzy = stringSimilarity.compareTwoStrings(norm1, norm2);
    
    // Weight: 60% token overlap, 40% fuzzy string
    return (jaccard * 0.6) + (fuzzy * 0.4);
};

/**
 * Generate display name using shared utility
 */
const generateRecurringDisplayName = (rawName) => {
    return generateDisplayName(rawName);
};


// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getDayOfWeek = (isoDate) => {
    if (!isoDate) return null;
    try {
        const aest = toAEST(isoDate);
        if (!aest) return null;
        return DAYS_OF_WEEK[aest.dayOfWeek];
    } catch (error) {
        console.error('[RECURRING] Error getting day of week:', error);
        return null;
    }
};

const getTimeAsMinutes = (isoDate) => {
    if (!isoDate) return null;
    try {
        const aest = toAEST(isoDate);
        if (!aest) return null;
        return aest.hours * 60 + aest.minutes;
    } catch (error) {
        return null;
    }
};

const formatTimeFromISO = (isoDate) => {
    if (!isoDate) return null;
    try {
        const aest = toAEST(isoDate);
        if (!aest) return null;
        return `${String(aest.hours).padStart(2, '0')}:${String(aest.minutes).padStart(2, '0')}`;
    } catch (error) {
        return null;
    }
};

const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    try {
        const [h, m] = timeStr.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
    } catch (error) {
        return null;
    }
};

// ===================================================================
// DATABASE QUERIES
// ===================================================================

/**
 * Get all recurring games for a venue (all days)
 */
const getRecurringGamesByVenue = async (venueId) => {
    if (!venueId) return [];
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGame');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':active': true
            }
        }));
        
        return result.Items || [];
    } catch (error) {
        console.error('[RECURRING] Error fetching recurring games:', error);
        return [];
    }
};

/**
 * Get recurring games for a specific venue and day
 */
const getRecurringGamesByVenueAndDay = async (venueId, dayOfWeek) => {
    if (!venueId || !dayOfWeek) return [];
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGame');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'dayOfWeek = :dow AND isActive = :active',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':dow': dayOfWeek,
                ':active': true
            }
        }));
        
        return result.Items || [];
    } catch (error) {
        console.error('[RECURRING] Error fetching recurring games:', error);
        return [];
    }
};

/**
 * Check if we've seen a similar game pattern before (for deferred creation)
 * Looks for games with similar attributes that aren't assigned to a recurring game
 * 
 * This helps us decide whether to create a new RecurringGame:
 * - If we've seen 1+ similar unassigned games → pattern is repeating → create
 * - If this is the first → might be ad-hoc → defer creation
 * 
 * @param {string} venueId - Venue ID
 * @param {string} dayOfWeek - Day of week (e.g., "MONDAY")
 * @param {string} sessionMode - "CASH" or "TOURNAMENT"
 * @param {string} gameVariant - Game variant (e.g., "NLHE")
 * @param {string} gameName - Game name for similarity matching
 * @param {string} excludeGameId - Game ID to exclude from results (the current game)
 * @returns {Array} Array of similar unassigned games
 */
const findSimilarUnassignedGames = async (venueId, dayOfWeek, sessionMode, gameVariant, gameName, excludeGameId = null) => {
    if (!venueId || !dayOfWeek) return [];
    
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    console.log(`[RECURRING] Checking for similar unassigned games: venue=${venueId}, day=${dayOfWeek}, mode=${sessionMode}`);
    
    try {
        // Query games at this venue
        // Use byVenue index, filter by day and assignment status
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'gameDayOfWeek = :dow AND (attribute_not_exists(recurringGameId) OR recurringGameId = :empty OR recurringGameAssignmentStatus = :notRecurring OR recurringGameAssignmentStatus = :candidate)',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':dow': dayOfWeek,
                ':empty': '',
                ':notRecurring': 'NOT_RECURRING',
                ':candidate': 'CANDIDATE_RECURRING'
            },
            Limit: 100,  // Reasonable limit for pattern detection
            ScanIndexForward: false  // Most recent first
        }));
        
        const candidates = result.Items || [];
        console.log(`[RECURRING] Found ${candidates.length} unassigned games on ${dayOfWeek}`);
        
        if (candidates.length === 0) return [];
        
        // Filter by session mode
        const normalizedMode = normalizeSessionMode(sessionMode);
        const modeFiltered = candidates.filter(g => {
            const gameMode = detectSessionMode(g).mode;
            return normalizeSessionMode(gameMode) === normalizedMode;
        });
        
        console.log(`[RECURRING] After session mode filter: ${modeFiltered.length} games`);
        
        // Filter by variant (if provided)
        let variantFiltered = modeFiltered;
        if (gameVariant) {
            variantFiltered = modeFiltered.filter(g => 
                !g.gameVariant || g.gameVariant === gameVariant
            );
        }
        
        // For CASH games: structural match is enough
        if (normalizedMode === 'CASH') {
            const similar = variantFiltered.filter(g => g.id !== excludeGameId);
            console.log(`[RECURRING] Cash game pattern: ${similar.length} similar games found`);
            return similar;
        }
        
        // For TOURNAMENTS: also check name similarity
        const normalizedInput = normalizeGameName(gameName);
        const similar = variantFiltered.filter(g => {
            if (g.id === excludeGameId) return false;
            
            const similarity = calculateNameSimilarity(gameName, g.name);
            return similarity >= MATCH_THRESHOLDS.PATTERN_SIMILARITY;
        });
        
        console.log(`[RECURRING] Tournament pattern: ${similar.length} similar games found (name similarity >= ${MATCH_THRESHOLDS.PATTERN_SIMILARITY})`);
        
        return similar;
        
    } catch (error) {
        console.error('[RECURRING] Error finding similar unassigned games:', error);
        return [];
    }
};

/**
 * Get candidate recurring patterns at a venue
 * Used by admin tools to suggest new RecurringGames
 * 
 * Groups unassigned games by day + variant + normalized name
 * Returns groups with 2+ games (confirmed patterns)
 */
const detectCandidatePatterns = async (venueId, minOccurrences = 2) => {
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    console.log(`[RECURRING] Detecting candidate patterns at venue ${venueId}`);
    
    try {
        // Get all unassigned games at venue
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'attribute_not_exists(recurringGameId) OR recurringGameId = :empty OR recurringGameAssignmentStatus = :notRecurring',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':empty': '',
                ':notRecurring': 'NOT_RECURRING'
            }
        }));
        
        const games = result.Items || [];
        console.log(`[RECURRING] Found ${games.length} unassigned games at venue`);
        
        // Group by day + session mode + variant
        const groups = new Map();
        
        for (const game of games) {
            const sessionInfo = detectSessionMode(game);
            const sessionMode = sessionInfo.mode;
            const dayOfWeek = game.gameDayOfWeek || getDayOfWeek(game.gameStartDateTime);
            const variant = game.gameVariant || 'UNKNOWN';
            
            // Create group key
            const groupKey = `${dayOfWeek}|${sessionMode}|${variant}`;
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    dayOfWeek,
                    sessionMode,
                    variant,
                    games: [],
                    nameGroups: new Map()  // Sub-group by normalized name
                });
            }
            
            const group = groups.get(groupKey);
            group.games.push(game);
            
            // For tournaments, also group by normalized name
            if (sessionMode === 'TOURNAMENT') {
                const normalizedName = normalizeGameName(game.name);
                if (!group.nameGroups.has(normalizedName)) {
                    group.nameGroups.set(normalizedName, []);
                }
                group.nameGroups.get(normalizedName).push(game);
            }
        }
        
        // Build candidate patterns
        const candidates = [];
        
        for (const [key, group] of groups) {
            if (group.sessionMode === 'CASH') {
                // Cash games: single pattern per day+variant
                if (group.games.length >= minOccurrences) {
                    candidates.push({
                        type: 'CASH',
                        dayOfWeek: group.dayOfWeek,
                        sessionMode: group.sessionMode,
                        variant: group.variant,
                        gameCount: group.games.length,
                        suggestedName: `${group.dayOfWeek} ${group.variant} Cash`,
                        sampleGames: group.games.slice(0, 5).map(g => ({
                            id: g.id,
                            name: g.name,
                            date: g.gameStartDateTime
                        }))
                    });
                }
            } else {
                // Tournaments: pattern per name group
                for (const [normalizedName, nameGames] of group.nameGroups) {
                    if (nameGames.length >= minOccurrences) {
                        // Find most common actual name
                        const nameCounts = {};
                        nameGames.forEach(g => {
                            nameCounts[g.name] = (nameCounts[g.name] || 0) + 1;
                        });
                        const suggestedName = Object.entries(nameCounts)
                            .sort((a, b) => b[1] - a[1])[0][0];
                        
                        candidates.push({
                            type: 'TOURNAMENT',
                            dayOfWeek: group.dayOfWeek,
                            sessionMode: group.sessionMode,
                            variant: group.variant,
                            normalizedName,
                            gameCount: nameGames.length,
                            suggestedName: generateRecurringDisplayName(suggestedName),
                            sampleGames: nameGames.slice(0, 5).map(g => ({
                                id: g.id,
                                name: g.name,
                                date: g.gameStartDateTime,
                                buyIn: g.buyIn
                            }))
                        });
                    }
                }
            }
        }
        
        console.log(`[RECURRING] Found ${candidates.length} candidate patterns`);
        return candidates;
        
    } catch (error) {
        console.error('[RECURRING] Error detecting candidate patterns:', error);
        return [];
    }
};

/**
 * Create a new recurring game
 */
const createRecurringGame = async (gameData) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGame');
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // Determine gameType
    const gameType = gameData.gameType || 
        (gameData.sessionMode === 'CASH' ? 'CASH_GAME' : 'TOURNAMENT');
    
    const { initializeStats } = require('../utils/recurring-game-stats');
    
    // Initialize with evolving statistics
    const initialGames = gameData._sourceGames || [];  // If provided during bootstrap
    const statsData = initializeStats(gameData, initialGames);
    
    const item = {
        id,
        ...gameData,
        ...statsData,  // Add evolving statistics
        gameType,
        'dayOfWeek#name': `${gameData.dayOfWeek}#${gameData.name}`,
        frequency: gameData.frequency || 'WEEKLY',
        isActive: true,
        isPaused: false,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'RecurringGame'
    };
    
    try {
        await client.send(new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(id)'
        }));
        
        console.log(`[RECURRING] Created new recurring game: "${item.name}" (${id}) [${gameType}]`);
        return item;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.warn('[RECURRING] ID collision, retrying');
            return createRecurringGame(gameData);
        }
        throw error;
    }
};

// ===================================================================
// FIELD INHERITANCE
// ===================================================================

/**
 * Inherit fields from recurring game template to game
 */
const inheritFieldsFromTemplate = (game, recurringGame, gameUpdates) => {
    const inheritedFields = [];
    
    // Guarantee (with exception for under-target games)
    const effectiveGuarantee = getEffectiveGuarantee(recurringGame);
    if ((!game.guaranteeAmount || game.guaranteeAmount === 0) && effectiveGuarantee > 0) {
        if (game.prizepoolPaid && game.prizepoolPaid > 0 && game.prizepoolPaid < effectiveGuarantee) {
            // Game ran under guarantee - don't inherit
            gameUpdates.hasGuarantee = false;
            gameUpdates.guaranteeAmount = 0;
            inheritedFields.push('hasGuarantee_exception');
        } else {
            gameUpdates.guaranteeAmount = effectiveGuarantee;
            gameUpdates.hasGuarantee = true;
            inheritedFields.push('guaranteeAmount', 'hasGuarantee');
        }
    }
    
    // Buy-in (prefer average if available)
    if ((!game.buyIn || game.buyIn === 0)) {
        const effectiveBuyIn = getEffectiveBuyIn(recurringGame);
        if (effectiveBuyIn > 0) {
            gameUpdates.buyIn = effectiveBuyIn;
            inheritedFields.push('buyIn');
        }
    }
    
    // Game variant
    if (!game.gameVariant && recurringGame.gameVariant) {
        gameUpdates.gameVariant = recurringGame.gameVariant;
        inheritedFields.push('gameVariant');
    }
    
    // Jackpot contributions
    if (recurringGame.hasJackpotContributions) {
        gameUpdates.hasJackpotContributions = true;
        gameUpdates.jackpotContributionAmount = recurringGame.jackpotContributionAmount || 2;
        inheritedFields.push('hasJackpotContributions');
    }
    
    // Accumulator tickets
    if (recurringGame.hasAccumulatorTickets) {
        gameUpdates.hasAccumulatorTickets = true;
        gameUpdates.accumulatorTicketValue = recurringGame.accumulatorTicketValue || 100;
        inheritedFields.push('hasAccumulatorTickets');
    }
    
    return inheritedFields;
};

// ===================================================================
// MATCHING FUNCTIONS (REFACTORED)
// ===================================================================

/**
 * Filter candidates by session mode (CASH vs TOURNAMENT)
 * This is a HARD filter - never match across session modes
 */
const filterBySessionMode = (candidates, sessionMode) => {
    const normalizedMode = normalizeSessionMode(sessionMode);
    
    return candidates.filter(c => {
        const candidateMode = normalizeSessionMode(c.gameType || c.sessionMode);
        return candidateMode === normalizedMode;
    });
};

/**
 * Filter candidates by game variant
 * Returns exact matches first, then all if no exact matches
 */
const filterByVariant = (candidates, gameVariant) => {
    if (!gameVariant) return { exact: [], all: candidates };
    
    const exact = candidates.filter(c => c.gameVariant === gameVariant);
    const compatible = candidates.filter(c => !c.gameVariant || c.gameVariant === gameVariant);
    
    return { exact, compatible, all: candidates };
};

/**
 * Calculate match score for a candidate
 * SIMPLIFIED: Focus on structural matching, use name as tiebreaker
 */
const calculateMatchScore = (game, candidate, context = {}) => {
    let score = 0;
    const details = {};
    
    // Variant matching
    if (game.gameVariant && candidate.gameVariant) {
        if (game.gameVariant === candidate.gameVariant) {
            score += SCORING_WEIGHTS.VARIANT_EXACT;
            details.variant = { match: true, score: SCORING_WEIGHTS.VARIANT_EXACT };
        } else {
            // Different variants - significant penalty
            score -= 30;
            details.variant = { match: false, score: -30 };
        }
    } else {
        details.variant = { match: 'unknown', score: 0 };
    }
    
    // Name similarity (secondary for tournaments, ignored for cash)
    if (context.sessionMode !== 'CASH') {
        const nameSimilarity = calculateNameSimilarity(game.name, candidate.name);
        details.nameSimilarity = nameSimilarity;
        
        if (nameSimilarity >= 0.8) {
            score += SCORING_WEIGHTS.NAME_HIGH_SIMILARITY;
            details.name = { type: 'high', similarity: nameSimilarity, score: SCORING_WEIGHTS.NAME_HIGH_SIMILARITY };
        } else if (nameSimilarity >= 0.6) {
            score += SCORING_WEIGHTS.NAME_MEDIUM_SIMILARITY;
            details.name = { type: 'medium', similarity: nameSimilarity, score: SCORING_WEIGHTS.NAME_MEDIUM_SIMILARITY };
        } else if (nameSimilarity >= 0.4) {
            score += SCORING_WEIGHTS.NAME_LOW_SIMILARITY;
            details.name = { type: 'low', similarity: nameSimilarity, score: SCORING_WEIGHTS.NAME_LOW_SIMILARITY };
        } else {
            details.name = { type: 'poor', similarity: nameSimilarity, score: 0 };
        }
    }
    
    // Buy-in compatibility check using evolving averages
    if (game.buyIn && game.buyIn > 0) {
        const compatibility = isBuyInCompatible(game.buyIn, candidate, {
            toleranceRatio: MATCH_THRESHOLDS.BUYIN_SUSPICIOUS_RATIO
        });
        
        if (compatibility.compatible) {
            if (compatibility.confidence >= 0.9) {
                score += SCORING_WEIGHTS.BUYIN_REASONABLE;
                details.buyIn = { 
                    gameBuyIn: game.buyIn,
                    effectiveBuyIn: getEffectiveBuyIn(candidate),
                    compatible: true, 
                    confidence: compatibility.confidence,
                    reason: compatibility.reason,
                    score: SCORING_WEIGHTS.BUYIN_REASONABLE 
                };
            } else if (compatibility.confidence >= 0.6) {
                // Partial score for lower confidence matches
                const partialScore = Math.round(SCORING_WEIGHTS.BUYIN_REASONABLE * compatibility.confidence);
                score += partialScore;
                details.buyIn = { 
                    gameBuyIn: game.buyIn,
                    effectiveBuyIn: getEffectiveBuyIn(candidate),
                    compatible: true,
                    confidence: compatibility.confidence,
                    reason: compatibility.reason,
                    score: partialScore 
                };
            } else {
                details.buyIn = { 
                    compatible: true, 
                    confidence: compatibility.confidence,
                    reason: compatibility.reason,
                    score: 0 
                };
            }
        } else {
            // Buy-in incompatible - significant penalty
            score += SCORING_WEIGHTS.BUYIN_SUSPICIOUS;
            details.buyIn = { 
                gameBuyIn: game.buyIn,
                effectiveBuyIn: getEffectiveBuyIn(candidate),
                compatible: false, 
                reason: compatibility.reason,
                score: SCORING_WEIGHTS.BUYIN_SUSPICIOUS 
            };
        }
    }
    
    // Time bonus (small positive for matching, no penalty for different)
    const gameTime = getTimeAsMinutes(game.gameStartDateTime);
    const templateTime = parseTimeToMinutes(candidate.startTime);
    
    if (gameTime !== null && templateTime !== null) {
        const timeDiff = Math.abs(gameTime - templateTime);
        if (timeDiff <= 30) {
            score += SCORING_WEIGHTS.TIME_BONUS;
            details.time = { diff: timeDiff, bonus: true, score: SCORING_WEIGHTS.TIME_BONUS };
        } else {
            details.time = { diff: timeDiff, bonus: false, score: 0 };
        }
    }
    
    // Single candidate bonus
    if (context.isSingleCandidate) {
        score += SCORING_WEIGHTS.SINGLE_CANDIDATE_BONUS;
        details.singleCandidate = { bonus: true, score: SCORING_WEIGHTS.SINGLE_CANDIDATE_BONUS };
    }
    
    return { score, details };
};

/**
 * Find the best match from candidates
 * CASH: Purely structural - first variant match wins
 * TOURNAMENT: Score-based with name tiebreaker
 */
const findBestMatch = (game, candidates, sessionMode) => {
    if (!candidates || candidates.length === 0) {
        return { match: null, score: 0, details: {}, metadata: {} };
    }
    
    const context = {
        sessionMode,
        isSingleCandidate: candidates.length === 1
    };
    
    // For CASH games: Simple - just match by variant
    if (sessionMode === 'CASH') {
        // Filter by variant
        const variantMatches = candidates.filter(c => 
            !game.gameVariant || !c.gameVariant || c.gameVariant === game.gameVariant
        );
        
        if (variantMatches.length === 1) {
            return {
                match: variantMatches[0],
                score: 100,  // High confidence for structural match
                details: { matchType: 'cash_structural', variant: game.gameVariant },
                metadata: { reason: 'cash_game_variant_match' }
            };
        }
        
        // Multiple matches - return first (could add more logic)
        if (variantMatches.length > 0) {
            return {
                match: variantMatches[0],
                score: 80,
                details: { matchType: 'cash_first_match', candidates: variantMatches.length },
                metadata: { reason: 'cash_game_multiple_variants', isAmbiguous: true }
            };
        }
        
        return { match: null, score: 0, details: {}, metadata: { reason: 'no_variant_match' } };
    }
    
    // For TOURNAMENTS: Score-based matching
    const scores = candidates.map(candidate => {
        const { score, details } = calculateMatchScore(game, candidate, context);
        return { candidate, score, details };
    });
    
    scores.sort((a, b) => b.score - a.score);
    
    const best = scores[0];
    const secondBest = scores[1];
    
    // Check for ambiguity
    const isAmbiguous = secondBest && (secondBest.score >= best.score - 10);
    
    return {
        match: best.candidate,
        score: best.score,
        details: best.details,
        isAmbiguous,
        metadata: {
            topScores: scores.slice(0, 3).map(s => ({
                name: s.candidate.name,
                id: s.candidate.id,
                score: s.score,
                details: s.details
            }))
        }
    };
};

// ===================================================================
// MAIN RESOLVER
// ===================================================================

/**
 * Resolve recurring game assignment for a game
 * 
 * @param {Object} params
 * @param {Object} params.game - The game to resolve
 * @param {string} params.entityId - Entity ID
 * @param {boolean} params.autoCreate - Whether to auto-create recurring games
 * @param {boolean} params.requirePatternConfirmation - If true, only create when pattern is confirmed
 */
const resolveRecurringAssignment = async ({ 
    game, 
    entityId, 
    autoCreate = false,
    requirePatternConfirmation = true  // NEW: Default to requiring pattern confirmation
}) => {
    try {
        const { venueId, gameStartDateTime, name } = game;
        
        if (!venueId) {
            console.log('[RECURRING] No venueId - skipping');
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: { status: 'SKIPPED', reason: 'no_venue' }
            };
        }
        
        // Detect session mode
        const sessionInfo = detectSessionMode(game);
        const sessionMode = sessionInfo.mode;
        console.log(`[RECURRING] Session mode: ${sessionMode} (confidence: ${sessionInfo.confidence}, reason: ${sessionInfo.reason})`);
        
        // Get day of week
        const dayOfWeek = getDayOfWeek(gameStartDateTime);
        if (!dayOfWeek) {
            console.log('[RECURRING] Could not determine day of week');
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: { status: 'FAILED', reason: 'invalid_date' }
            };
        }
        
        console.log(`[RECURRING] Resolving: venue=${venueId}, day=${dayOfWeek}, mode=${sessionMode}, variant=${game.gameVariant || 'unknown'}`);
        
        // ============================================================
        // STEP 1: Get candidates for this venue + day
        // ============================================================
        const allCandidates = await getRecurringGamesByVenueAndDay(venueId, dayOfWeek);
        console.log(`[RECURRING] Found ${allCandidates.length} candidates for ${dayOfWeek}`);
        
        // ============================================================
        // STEP 2: Filter by session mode (HARD filter)
        // ============================================================
        const modeFiltered = filterBySessionMode(allCandidates, sessionMode);
        console.log(`[RECURRING] After session mode filter: ${modeFiltered.length} candidates`);
        
        if (modeFiltered.length === 0 && allCandidates.length > 0) {
            console.log(`[RECURRING] All candidates filtered out by session mode (${sessionMode})`);
        }
        
        // ============================================================
        // STEP 3: Find best match
        // ============================================================
        if (modeFiltered.length > 0) {
            const matchResult = findBestMatch(game, modeFiltered, sessionMode);
            
            if (matchResult.match) {
                const { match, score, details, isAmbiguous } = matchResult;
                
                // Determine confidence level
                let status, confidence;
                
                if (score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
                    status = isAmbiguous ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED';
                    confidence = Math.min(score / 100, 0.99);
                    console.log(`[RECURRING] ✅ High confidence match: "${match.name}" (score: ${score})`);
                } else if (score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE) {
                    status = 'PENDING_ASSIGNMENT';
                    confidence = score / 100;
                    console.log(`[RECURRING] ⚠️ Medium confidence match: "${match.name}" (score: ${score})`);
                } else {
                    // Score too low - no match
                    console.log(`[RECURRING] ❌ Score below threshold: ${score} < ${MATCH_THRESHOLDS.MEDIUM_CONFIDENCE}`);
                    matchResult.match = null;
                }
                
                if (matchResult.match) {
                    const gameUpdates = {
                        recurringGameId: match.id,
                        recurringGameAssignmentStatus: status,
                        recurringGameAssignmentConfidence: confidence,
                        isRegular: true,
                        isSeries: false
                    };
                    
                    const inheritedFields = inheritFieldsFromTemplate(game, match, gameUpdates);
                    
                    // Create CONFIRMED instance for tracking (lazy creation)
                    let instanceInfo = null;
                    try {
                        const { createConfirmedInstance } = require('./instance-manager');
                        const instanceResult = await createConfirmedInstance({
                            game: { ...game, ...gameUpdates },
                            recurringGame: match,
                            matchConfidence: confidence
                        });
                        instanceInfo = instanceResult ? {
                            instanceId: instanceResult.instance?.id,
                            wasCreated: instanceResult.wasCreated,
                            hasDeviation: instanceResult.instance?.hasDeviation
                        } : null;
                    } catch (instanceError) {
                        console.warn('[RECURRING] Failed to create instance (non-fatal):', instanceError.message);
                    }
                    
                    // Update evolving statistics on the recurring game template
                    let statsUpdateResult = null;
                    try {
                        statsUpdateResult = await updateRecurringGameStats({
                            recurringGameId: match.id,
                            game: { ...game, ...gameUpdates },
                            existingRecurringGame: match
                        });
                        if (statsUpdateResult.success) {
                            console.log(`[RECURRING] Updated stats: avgBuyIn=$${statsUpdateResult.updates?.averageBuyIn}`);
                        }
                    } catch (statsError) {
                        console.warn('[RECURRING] Failed to update stats (non-fatal):', statsError.message);
                    }

                    return {
                        gameUpdates,
                        metadata: {
                            status: 'MATCHED_EXISTING',
                            confidence,
                            matchedRecurringGameId: match.id,
                            matchedRecurringGameName: match.name,
                            matchedRecurringGameDay: match.dayOfWeek,
                            wasCreated: false,
                            inheritedFields,
                            isAmbiguous,
                            scoringDetails: details,
                            topCandidates: matchResult.metadata.topScores,
                            sessionMode: {
                                detected: sessionMode,
                                confidence: sessionInfo.confidence
                            },
                            instance: instanceInfo
                        }
                    };
                }
            }
        }
        
        // ============================================================
        // STEP 4: No match found - Consider auto-creation
        // ============================================================
        
        if (!autoCreate) {
            console.log(`[RECURRING] No match, autoCreate disabled`);
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: {
                    status: 'NO_MATCH',
                    confidence: 0,
                    wasCreated: false,
                    reason: modeFiltered.length > 0 ? 'below_threshold' : 'no_candidates',
                    sessionMode: { detected: sessionMode, confidence: sessionInfo.confidence }
                }
            };
        }
        
        // Check if we should defer creation
        if (requirePatternConfirmation) {
            // Look for similar unassigned games to confirm this is a pattern
            const similarGames = await findSimilarUnassignedGames(
                venueId, 
                dayOfWeek, 
                sessionMode, 
                game.gameVariant, 
                name,
                game.id  // Exclude current game from results
            );
            
            if (similarGames.length === 0) {
                console.log(`[RECURRING] Deferring creation - no pattern confirmation yet`);
                return {
                    gameUpdates: {
                        recurringGameAssignmentStatus: 'CANDIDATE_RECURRING',
                        recurringGameAssignmentConfidence: 0.5,
                        // Store attributes for future pattern matching
                        _candidatePattern: {
                            venueId,
                            dayOfWeek,
                            sessionMode,
                            gameVariant: game.gameVariant,
                            normalizedName: normalizeGameName(name)
                        }
                    },
                    metadata: {
                        status: 'DEFERRED',
                        confidence: 0.5,
                        wasCreated: false,
                        reason: 'awaiting_pattern_confirmation',
                        sessionMode: { detected: sessionMode, confidence: sessionInfo.confidence }
                    }
                };
            }
            
            console.log(`[RECURRING] Pattern confirmed - found ${similarGames.length} similar games`);
        }
        
        // ============================================================
        // STEP 5: Auto-create new recurring game
        // ============================================================
        
        const displayName = generateRecurringDisplayName(name);
        
        if (displayName.length < 3) {
            console.log(`[RECURRING] Name too short for auto-creation: "${displayName}"`);
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: {
                    status: 'NO_MATCH',
                    reason: 'name_too_short',
                    wasCreated: false
                }
            };
        }
        
        try {
            const newGame = await createRecurringGame({
                name: displayName,
                venueId,
                entityId,
                dayOfWeek,
                sessionMode,
                gameType: sessionMode === 'CASH' ? 'CASH_GAME' : 'TOURNAMENT',
                gameVariant: game.gameVariant,
                tournamentType: game.tournamentType,
                typicalBuyIn: game.buyIn,
                typicalGuarantee: game.guaranteeAmount,
                startTime: formatTimeFromISO(gameStartDateTime)
            });
            
            console.log(`[RECURRING] ✅ Created: "${newGame.name}" on ${dayOfWeek} [${newGame.gameType}]`);
            
            // Create CONFIRMED instance for this first game
            let instanceInfo = null;
            try {
                const { createConfirmedInstance } = require('./instance-manager');
                const instanceResult = await createConfirmedInstance({
                    game: { ...game, recurringGameId: newGame.id },
                    recurringGame: newGame,
                    matchConfidence: 0.9
                });
                instanceInfo = instanceResult ? {
                    instanceId: instanceResult.instance?.id,
                    wasCreated: instanceResult.wasCreated
                } : null;
            } catch (instanceError) {
                console.warn('[RECURRING] Failed to create instance for new game (non-fatal):', instanceError.message);
            }
            
            return {
                gameUpdates: {
                    recurringGameId: newGame.id,
                    recurringGameAssignmentStatus: 'AUTO_ASSIGNED',
                    recurringGameAssignmentConfidence: 0.9,
                    isRegular: true,
                    isSeries: false
                },
                metadata: {
                    status: 'CREATED_NEW',
                    confidence: 0.9,
                    matchedRecurringGameId: newGame.id,
                    matchedRecurringGameName: newGame.name,
                    wasCreated: true,
                    sessionMode: {
                        detected: sessionMode,
                        confidence: sessionInfo.confidence,
                        createdWithType: newGame.gameType
                    },
                    instance: instanceInfo
                }
            };
        } catch (error) {
            console.error('[RECURRING] Failed to create:', error);
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: {
                    status: 'FAILED',
                    reason: 'creation_error',
                    error: error.message
                }
            };
        }
        
    } catch (error) {
        console.error('[RECURRING] Resolution error:', error);
        return {
            gameUpdates: {
                recurringGameAssignmentStatus: 'NOT_RECURRING',
                recurringGameAssignmentConfidence: 0
            },
            metadata: {
                status: 'FAILED',
                reason: 'error',
                error: error.message
            }
        };
    }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Main resolver
    resolveRecurringAssignment,
    
    // Matching functions
    calculateMatchScore,
    findBestMatch,
    filterBySessionMode,
    filterByVariant,
    
    // Name utilities
    normalizeGameName,
    calculateNameSimilarity,
    extractCoreTokens,
    generateRecurringDisplayName,
    
    // Session mode
    detectSessionMode,
    normalizeSessionMode,
    CASH_GAME_PATTERNS,
    
    // Database
    getRecurringGamesByVenue,
    getRecurringGamesByVenueAndDay,
    createRecurringGame,
    findSimilarUnassignedGames,
    detectCandidatePatterns,  // NEW: Admin pattern detection
    
    // Field inheritance
    inheritFieldsFromTemplate,
    
    // Time utilities
    getDayOfWeek,
    getTimeAsMinutes,
    formatTimeFromISO,
    parseTimeToMinutes,
    
    // Timezone (for testing)
    toAEST,
    isAEDT,
    getAustralianOffset,
    
    // Constants
    SCORING_WEIGHTS,
    MATCH_THRESHOLDS
};