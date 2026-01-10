/**
 * bulk-recurring-processor.js
 * 
 * UPDATED: v2.1.0
 * - Aligned CLUSTERING_CONFIG with recurring-resolver.PATTERN_DETECTION thresholds
 * - buyInTolerance: 0.5 → 1.0 (2x ratio, aligned with BUYIN_TOLERANCE_RATIO)
 * - timeToleranceMinutes: 60 → 90 (aligned with TIME_TOLERANCE_MINUTES)
 * 
 * Handles bulk processing of unassigned games through recurring-resolver.
 * Includes structural clustering from bootstrap-recurring-games.js for proper preview.
 * 
 * Called via GraphQL mutations:
 * - processUnassignedGames(venueId, entityId, options)
 * - getUnassignedGamesStats(venueId, entityId)
 */

const { getDocClient, getTableName, QueryCommand, ScanCommand } = require('../utils/db-client');
const { resolveRecurringAssignment, detectCandidatePatterns } = require('./recurring-resolver');
const { getDayOfWeekAEST, getStartTimeMinutesAEST, formatMinutes } = require('../utils/date-utils');

// ===================================================================
// STRING SIMILARITY
// ===================================================================

// Simple Dice coefficient string similarity
const stringSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1.length < 2 || s2.length < 2) return 0;
    
    const bigrams1 = new Set();
    for (let i = 0; i < s1.length - 1; i++) {
        bigrams1.add(s1.substring(i, i + 2));
    }
    
    let matches = 0;
    for (let i = 0; i < s2.length - 1; i++) {
        if (bigrams1.has(s2.substring(i, i + 2))) {
            matches++;
        }
    }
    
    return (2.0 * matches) / (s1.length + s2.length - 2);
};

/**
 * Normalize game name for comparison
 */
const normalizeGameName = (name) => {
    if (!name) return '';
    
    let clean = name.toLowerCase();
    
    // Remove common variations
    clean = clean.replace(/\$[\d,]+k?\s*(gtd|guaranteed)?/gi, '');
    clean = clean.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '');
    clean = clean.replace(/\b(weekly|daily|tonight|this\s+week)\b/gi, '');
    clean = clean.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '');
    clean = clean.replace(/\b(at|the|a|an|on)\b/gi, '');
    clean = clean.replace(/\bre-?entry\b/gi, '');
    clean = clean.replace(/\bfreezeout\b/gi, '');
    clean = clean.replace(/[^\w\s]/g, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return clean;
};

// ===================================================================
// STRUCTURAL CLUSTERING (from bootstrap-recurring-games.js)
// ===================================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const CLUSTERING_CONFIG = {
    // Buy-in tolerance - ALIGNED with recurring-resolver.PATTERN_DETECTION
    // Games within this ratio (max/min) are considered same tier
    // 1.0 means 2x ratio (e.g., $100 and $200 cluster, but $100 and $300 don't)
    buyInTolerance: 1.0,        // Changed from 0.5 to align with PATTERN_DETECTION.BUYIN_TOLERANCE_RATIO (2.0)
    
    // Time tolerance - ALIGNED with recurring-resolver.PATTERN_DETECTION
    timeToleranceMinutes: 90,   // Changed from 60 to align with PATTERN_DETECTION.TIME_TOLERANCE_MINUTES
    
    minGamesForTemplate: 2,     // Minimum games to create a template
    structuralThreshold: 0.7    // Minimum structural similarity to cluster
};

// Cash game detection patterns
const CASH_GAME_PATTERNS = [
    /\bcash\s*game/i,
    /\bcash\s*session/i,
    /\bring\s*game/i,
    /\bcash\s*table/i,
    /\blive\s*cash/i,
    /\$?\d+\s*\/\s*\$?\d+/,  // Stake notation: "$1/$2", "1/2"
];

/**
 * Detect poker variant from game name or game data
 * Returns: NLHE, PLO, PLO5, MIX, or null if unknown
 */
const detectVariant = (game) => {
    // Check explicit variant field first
    if (game.variant) return game.variant.toUpperCase();
    if (game.pokerVariant) return game.pokerVariant.toUpperCase();
    
    const name = (game.name || '').toUpperCase();
    
    // Check for PLO variants first (more specific)
    if (/\bPLO\s*5\b|\bPLO5\b|\b5\s*CARD\s*PLO\b/i.test(name)) return 'PLO5';
    if (/\bPLO\b|\bPOT\s*LIMIT\s*OMAHA\b|\bOMOHA\b/i.test(name)) return 'PLO';
    
    // Check for Hold'em variants
    if (/\bNLHE?\b|\bNO\s*LIMIT\s*HOLD'?EM\b|\bTEXAS\s*HOLD'?EM\b/i.test(name)) return 'NLHE';
    if (/\bLIMIT\s*HOLD'?EM\b|\bLHE\b/i.test(name)) return 'LHE';
    
    // Check for mixed games
    if (/\bMIX(ED)?\b|\bHORSE\b|\b8\s*GAME\b/i.test(name)) return 'MIX';
    
    // Default to NLHE for tournaments without specific variant
    return null;
};

/**
 * Detect if a game is CASH or TOURNAMENT
 */
const detectSessionMode = (game) => {
    if (game.gameType === 'CASH_GAME' || game.gameType === 'CASH') {
        return { mode: 'CASH', confidence: 1.0, reason: 'explicit_gameType' };
    }
    if (game.sessionMode === 'CASH') {
        return { mode: 'CASH', confidence: 1.0, reason: 'explicit_sessionMode' };
    }
    
    const name = game.name || '';
    for (const pattern of CASH_GAME_PATTERNS) {
        if (pattern.test(name)) {
            return { mode: 'CASH', confidence: 0.95, reason: 'name_pattern' };
        }
    }
    
    return { mode: 'TOURNAMENT', confidence: 0.8, reason: 'default' };
};

/**
 * Check if two buy-ins are in the same tier
 */
const buyInsAreSimilar = (buyIn1, buyIn2, tolerance = CLUSTERING_CONFIG.buyInTolerance) => {
    if (!buyIn1 || !buyIn2 || buyIn1 <= 0 || buyIn2 <= 0) return true;
    const ratio = Math.max(buyIn1, buyIn2) / Math.min(buyIn1, buyIn2);
    return ratio <= (1 + tolerance);
};

/**
 * Check if two start times are in the same slot
 */
const timesAreSimilar = (time1, time2, toleranceMinutes = CLUSTERING_CONFIG.timeToleranceMinutes) => {
    if (time1 === null || time2 === null) return true;
    const diff = Math.abs(time1 - time2);
    return diff <= toleranceMinutes;
};

/**
 * Calculate structural similarity score (0-1)
 */
const calculateStructuralSimilarity = (game1, game2) => {
    const buyInMatch = buyInsAreSimilar(game1.buyIn, game2.buyIn);
    const timeMatch = timesAreSimilar(game1._startTimeMinutes, game2._startTimeMinutes);
    
    if (buyInMatch && timeMatch) return 1.0;
    
    const buyIn1Valid = game1.buyIn && game1.buyIn > 0;
    const buyIn2Valid = game2.buyIn && game2.buyIn > 0;
    const time1Valid = game1._startTimeMinutes !== null;
    const time2Valid = game2._startTimeMinutes !== null;
    
    if (!buyIn1Valid || !buyIn2Valid) return timeMatch ? 0.8 : 0;
    if (!time1Valid || !time2Valid) return buyInMatch ? 0.8 : 0;
    
    if (buyInMatch && !timeMatch) return 0.4;
    if (!buyInMatch && timeMatch) return 0.4;
    
    return 0;
};

/**
 * Union-Find for transitive clustering
 */
class UnionFind {
    constructor() {
        this.parent = new Map();
        this.rank = new Map();
    }
    
    makeSet(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
        }
    }
    
    find(x) {
        if (!this.parent.has(x)) this.makeSet(x);
        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x)));
        }
        return this.parent.get(x);
    }
    
    union(x, y) {
        const rootX = this.find(x);
        const rootY = this.find(y);
        if (rootX === rootY) return false;
        
        const rankX = this.rank.get(rootX);
        const rankY = this.rank.get(rootY);
        
        if (rankX < rankY) {
            this.parent.set(rootX, rootY);
        } else if (rankX > rankY) {
            this.parent.set(rootY, rootX);
        } else {
            this.parent.set(rootY, rootX);
            this.rank.set(rootX, rankX + 1);
        }
        return true;
    }
}

/**
 * Cluster games using structural similarity (buy-in + time)
 */
const clusterGamesStructurally = (games, options = {}) => {
    const { structuralThreshold = CLUSTERING_CONFIG.structuralThreshold } = options;
    
    if (games.length === 0) return [];
    if (games.length === 1) return [[games[0]]];
    
    const uf = new UnionFind();
    games.forEach(g => uf.makeSet(g.id));
    
    // Compare all pairs
    for (let i = 0; i < games.length; i++) {
        for (let j = i + 1; j < games.length; j++) {
            const structuralSim = calculateStructuralSimilarity(games[i], games[j]);
            if (structuralSim >= structuralThreshold) {
                uf.union(games[i].id, games[j].id);
            }
        }
    }
    
    // Group by root
    const clusterMap = new Map();
    games.forEach(g => {
        const root = uf.find(g.id);
        if (!clusterMap.has(root)) clusterMap.set(root, []);
        clusterMap.get(root).push(g);
    });
    
    return Array.from(clusterMap.values());
};

/**
 * Generate a template name from a cluster of games
 */
const generateTemplateNameFromCluster = (cluster, dayOfWeek, category = 'TOURNAMENT') => {
    const day = dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
    
    if (!cluster || cluster.length === 0) {
        return category === 'CASH' ? `${day} Cash Game` : `${day} Tournament`;
    }
    
    // For CASH games
    if (category === 'CASH') {
        const stakePattern = /\$?(\d+)\s*\/\s*\$?(\d+)/;
        for (const g of cluster) {
            const match = g.name?.match(stakePattern);
            if (match) {
                return `${day} $${match[1]}/$${match[2]} Cash`;
            }
        }
        return `${day} Cash Game`;
    }
    
    // For tournaments - find most common name pattern
    const nameCounts = {};
    cluster.forEach(g => {
        if (g.name) nameCounts[g.name] = (nameCounts[g.name] || 0) + 1;
    });
    
    const sorted = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
        // Clean up the name
        let name = sorted[0][0];
        // Remove amounts, dates, common suffixes
        name = name.replace(/\$[\d,]+k?\s*(gtd|guaranteed)?/gi, '');
        name = name.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '');
        name = name.replace(/\b(weekly|daily|tonight|this\s+week)\b/gi, '');
        name = name.replace(/\s+/g, ' ').trim();
        
        if (name.length > 5) {
            return name;
        }
    }
    
    // Fallback: use buy-in tier
    const buyIns = cluster.map(g => g.buyIn).filter(b => b && b > 0);
    if (buyIns.length > 0) {
        const avgBuyIn = buyIns.reduce((a, b) => a + b, 0) / buyIns.length;
        if (avgBuyIn >= 300) return `${day} Main Event`;
        if (avgBuyIn >= 150) return `${day} Feature`;
        if (avgBuyIn >= 50) return `${day} Tournament`;
        return `${day} Micro`;
    }
    
    return `${day} Tournament`;
};

/**
 * Enrich games with computed fields for clustering
 */
const enrichGamesForClustering = (games) => {
    return games.map(game => {
        const sessionInfo = detectSessionMode(game);
        const variant = detectVariant(game);
        
        // Use AEST-aware functions for day of week and start time
        const dayOfWeek = game.gameStartDateTime 
            ? getDayOfWeekAEST(game.gameStartDateTime) 
            : null;
        const startTimeMinutes = game.gameStartDateTime 
            ? getStartTimeMinutesAEST(game.gameStartDateTime) 
            : null;
        
        return {
            ...game,
            _dayOfWeek: dayOfWeek,                    // <-- AEST DAY (CORRECT)
            _startTimeMinutes: startTimeMinutes,      // <-- AEST TIME (CORRECT)
            _sessionMode: sessionInfo.mode,
            _sessionConfidence: sessionInfo.confidence,
            _variant: variant
        };
    });
};

// ===================================================================
// QUERY UNASSIGNED GAMES
// ===================================================================

/**
 * Get games that haven't been processed for recurring assignment
 * 
 * A game is "unassigned" if:
 * - recurringGameAssignmentStatus is null/undefined/empty
 * - OR recurringGameAssignmentStatus is 'PENDING_ASSIGNMENT' (venue assigned, needs recurring processing)
 * - OR recurringGameAssignmentStatus is 'CANDIDATE_RECURRING' (deferred, needs reprocessing)
 * 
 * OPTIMIZED: Query all games for venue using GSI, filter in memory (much faster than DynamoDB filter)
 */
const getUnassignedGames = async (venueId, entityId, options = {}) => {
    const { limit = 500, includeDeferred = true, includePending = true } = options;
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    console.log(`[BULK_PROCESSOR] getUnassignedGames - venueId=${venueId}, limit=${limit}, table=${tableName}`);
    
    try {
        const allGames = [];
        let lastKey = null;
        let pageCount = 0;
        
        // Query all games for venue (no filter - much faster), then filter in memory
        if (venueId) {
            do {
                pageCount++;
                const params = {
                    TableName: tableName,
                    IndexName: 'byVenue',
                    KeyConditionExpression: 'venueId = :vid',
                    ExpressionAttributeValues: { ':vid': venueId }
                };
                if (lastKey) params.ExclusiveStartKey = lastKey;
                
                console.log(`[BULK_PROCESSOR] getUnassignedGames query page ${pageCount}`);
                const result = await client.send(new QueryCommand(params));
                allGames.push(...(result.Items || []));
                lastKey = result.LastEvaluatedKey;
                console.log(`[BULK_PROCESSOR] Page ${pageCount} returned ${result.Items?.length || 0} items`);
            } while (lastKey);
        } else if (entityId) {
            // Scan with entity filter
            do {
                pageCount++;
                const params = {
                    TableName: tableName,
                    FilterExpression: 'entityId = :eid',
                    ExpressionAttributeValues: { ':eid': entityId }
                };
                if (lastKey) params.ExclusiveStartKey = lastKey;
                
                const result = await client.send(new ScanCommand(params));
                allGames.push(...(result.Items || []));
                lastKey = result.LastEvaluatedKey;
            } while (lastKey);
        } else {
            // Full scan (be careful with large tables)
            do {
                pageCount++;
                const params = { TableName: tableName };
                if (lastKey) params.ExclusiveStartKey = lastKey;
                
                const result = await client.send(new ScanCommand(params));
                allGames.push(...(result.Items || []));
                lastKey = result.LastEvaluatedKey;
            } while (lastKey);
        }
        
        console.log(`[BULK_PROCESSOR] Fetched ${allGames.length} total games in ${pageCount} pages, filtering...`);
        
        // Filter in memory - much faster than DynamoDB filter expressions
        const unassignedStatuses = new Set(['', 'PENDING_ASSIGNMENT']);
        if (includePending) unassignedStatuses.add('PENDING_ASSIGNMENT');
        if (includeDeferred) unassignedStatuses.add('CANDIDATE_RECURRING');
        
        const unassigned = allGames.filter(game => {
            // EXCLUDE series games - they shouldn't be part of recurring game analysis
            // Handle both boolean true and string "true"
            if (game.isSeries === true || game.isSeries === 'true') {
                return false;
            }
            
            const status = game.recurringGameAssignmentStatus;
            // Unassigned if: no status, empty status, or in our target statuses
            return !status || unassignedStatuses.has(status);
        });
        
        console.log(`[BULK_PROCESSOR] Found ${unassigned.length} unassigned non-series games (limit: ${limit})`);
        
        return unassigned.slice(0, limit);
    } catch (error) {
        console.error(`[BULK_PROCESSOR] getUnassignedGames error:`, error.message);
        console.error(`[BULK_PROCESSOR] Error stack:`, error.stack);
        throw error;
    }
};

/**
 * Get statistics about unassigned games
 * Returns both venue-specific stats (if venueId provided) and overall stats
 */
const getUnassignedGamesStats = async (input) => {
    const { venueId, entityId } = input || {};
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    console.log(`[BULK_PROCESSOR] getUnassignedGamesStats - venueId=${venueId}, entityId=${entityId}, table=${tableName}`);
    
    // Initialize stats structure for both venue and overall
    const createEmptyStats = () => ({
        total: 0,
        unprocessed: 0,
        candidateRecurring: 0,
        notRecurring: 0,
        assigned: 0,
        other: 0
    });
    
    const venueStats = createEmptyStats();
    const overallStats = createEmptyStats();
    const byVenue = {};
    const byDay = {};
    const byStatus = {};
    
    let lastKey = null;
    let pageCount = 0;
    
    try {
        // Always scan all games for the entity to get overall stats
        // Filter by venue in memory for venue-specific stats
        do {
            pageCount++;
            const params = { TableName: tableName };
            
            if (lastKey) params.ExclusiveStartKey = lastKey;
            
            console.log(`[BULK_PROCESSOR] Scan page ${pageCount}`);
            const result = await client.send(new ScanCommand(params));
            
            console.log(`[BULK_PROCESSOR] Page ${pageCount} returned ${result.Items?.length || 0} items`);
            
            // Track series games separately for debugging
            let seriesCount = 0;
            let nonSeriesCount = 0;
            let isSeriesValues = {};  // Track what values we see
            
            for (const game of (result.Items || [])) {
                // Track isSeries values for debugging
                const isSeriesVal = String(game.isSeries);
                isSeriesValues[isSeriesVal] = (isSeriesValues[isSeriesVal] || 0) + 1;
                
                // EXCLUDE series games - they shouldn't be part of recurring game analysis
                // Handle both boolean true and string "true"
                if (game.isSeries === true || game.isSeries === 'true') {
                    seriesCount++;
                    continue;
                }
                nonSeriesCount++;
                
                const status = game.recurringGameAssignmentStatus;
                const gameVenueId = game.venueId || 'unknown';
                const day = game.gameDayOfWeek || 'unknown';
                const hasRecurringGameId = !!game.recurringGameId;
                
                // Determine category
                let category;
                if (!status || status === '' || status === 'PENDING_ASSIGNMENT') {
                    category = 'unprocessed';
                } else if (status === 'CANDIDATE_RECURRING') {
                    category = 'candidateRecurring';
                } else if (status === 'NOT_RECURRING') {
                    category = 'notRecurring';
                } else if (hasRecurringGameId) {
                    category = 'assigned';
                } else {
                    category = 'other';
                }
                
                // Update overall stats
                overallStats.total++;
                overallStats[category]++;
                
                // Track by status (overall)
                const statusKey = status || '(empty)';
                byStatus[statusKey] = (byStatus[statusKey] || 0) + 1;
                
                // Track by venue
                if (!byVenue[gameVenueId]) {
                    byVenue[gameVenueId] = { unprocessed: 0, assigned: 0, notRecurring: 0, other: 0, total: 0 };
                }
                byVenue[gameVenueId].total++;
                if (category === 'unprocessed' || category === 'candidateRecurring') {
                    byVenue[gameVenueId].unprocessed++;
                } else if (category === 'assigned') {
                    byVenue[gameVenueId].assigned++;
                } else if (category === 'notRecurring') {
                    byVenue[gameVenueId].notRecurring++;
                } else {
                    byVenue[gameVenueId].other++;
                }
                
                // Track by day (overall)
                if (!byDay[day]) {
                    byDay[day] = { unprocessed: 0, assigned: 0, notRecurring: 0, other: 0, total: 0 };
                }
                byDay[day].total++;
                if (category === 'unprocessed' || category === 'candidateRecurring') {
                    byDay[day].unprocessed++;
                } else if (category === 'assigned') {
                    byDay[day].assigned++;
                } else if (category === 'notRecurring') {
                    byDay[day].notRecurring++;
                } else {
                    byDay[day].other++;
                }
                
                // Update venue-specific stats if this game matches the filter
                if (venueId && gameVenueId === venueId) {
                    venueStats.total++;
                    venueStats[category]++;
                }
            }
            
            // Debug: log isSeries distribution for this page
            console.log(`[BULK_PROCESSOR] Page ${pageCount} isSeries values:`, JSON.stringify(isSeriesValues));
            console.log(`[BULK_PROCESSOR] Page ${pageCount}: ${seriesCount} series games filtered, ${nonSeriesCount} non-series processed`);
            
            lastKey = result.LastEvaluatedKey;
        } while (lastKey);
        
        console.log(`[BULK_PROCESSOR] Stats complete - overall.total=${overallStats.total}, venue.total=${venueStats.total}, pages=${pageCount}`);
        console.log(`[BULK_PROCESSOR] Overall breakdown: unprocessed=${overallStats.unprocessed}, assigned=${overallStats.assigned}, notRecurring=${overallStats.notRecurring}, other=${overallStats.other}`);
        console.log(`[BULK_PROCESSOR] Venue breakdown: unprocessed=${venueStats.unprocessed}, assigned=${venueStats.assigned}, notRecurring=${venueStats.notRecurring}, other=${venueStats.other}`);
        console.log(`[BULK_PROCESSOR] Status values found:`, JSON.stringify(byStatus));
        
        // Return both venue and overall stats
        // If no venueId provided, venue stats will be zeros
        return {
            // Venue-specific stats (for selected venue)
            total: venueStats.total,
            unprocessed: venueStats.unprocessed,
            candidateRecurring: venueStats.candidateRecurring,
            notRecurring: venueStats.notRecurring,
            assigned: venueStats.assigned,
            other: venueStats.other,
            // Overall stats (all venues)
            overallTotal: overallStats.total,
            overallUnprocessed: overallStats.unprocessed,
            overallCandidateRecurring: overallStats.candidateRecurring,
            overallNotRecurring: overallStats.notRecurring,
            overallAssigned: overallStats.assigned,
            overallOther: overallStats.other,
            // Breakdowns (AWSJSON)
            byVenue: JSON.stringify(byVenue),
            byDay: JSON.stringify(byDay),
            byStatus: JSON.stringify(byStatus)
        };
    } catch (error) {
        console.error(`[BULK_PROCESSOR] getUnassignedGamesStats error:`, error);
        console.error(`[BULK_PROCESSOR] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        return {
            total: 0, unprocessed: 0, candidateRecurring: 0, notRecurring: 0, assigned: 0, other: 0,
            overallTotal: 0, overallUnprocessed: 0, overallCandidateRecurring: 0, overallNotRecurring: 0, overallAssigned: 0, overallOther: 0,
            byVenue: JSON.stringify({}),
            byDay: JSON.stringify({}),
            byStatus: JSON.stringify({ error: error.message })
        };
    }
};

// ===================================================================
// BULK PROCESSING
// ===================================================================

/**
 * Process unassigned games through recurring-resolver
 * 
 * Options:
 * - venueId: Filter to specific venue
 * - entityId: Filter to specific entity (required if no venueId)
 * - limit: Max games to process (default 100)
 * - autoCreate: Allow auto-creation of templates (default true)
 * - requirePatternConfirmation: Require 2+ similar games before creating (default true)
 * - dryRun: Preview without making changes (default false)
 * - batchSize: Games per batch (default 10)
 * - delayMs: Delay between batches (default 100)
 */
const processUnassignedGames = async (input) => {
    const {
        venueId,
        entityId,
        limit = 100,
        autoCreate = true,
        requirePatternConfirmation = true,
        dryRun = false,
        batchSize = 10,
        delayMs = 100
    } = input || {};
    
    console.log(`[BULK_PROCESSOR] Starting - venue=${venueId || 'all'}, entity=${entityId || 'all'}, limit=${limit}, dryRun=${dryRun}`);
    console.log(`[BULK_PROCESSOR] Options: autoCreate=${autoCreate}, requirePatternConfirmation=${requirePatternConfirmation}, batchSize=${batchSize}`);
    console.log(`[BULK_PROCESSOR] About to call getUnassignedGames...`);
    
    const startTime = Date.now();
    
    const result = {
        success: true,
        processed: 0,
        assigned: 0,
        created: 0,
        deferred: 0,
        noMatch: 0,
        errors: 0,
        details: [],
        potentialTemplates: [],  // New templates that would/will be created
        dryRun
    };
    
    try {
        // Get unassigned games
        console.log(`[BULK_PROCESSOR] Step 1: Fetching unassigned games at ${Date.now() - startTime}ms...`);
        const fetchStart = Date.now();
        const games = await getUnassignedGames(venueId, entityId, { limit });
        console.log(`[BULK_PROCESSOR] Step 1 complete: Found ${games.length} games in ${Date.now() - fetchStart}ms`);
        
        if (games.length === 0) {
            result.message = 'No unassigned games found';
            console.log(`[BULK_PROCESSOR] No games found, returning early`);
            return result;
        }
        
        // DRY RUN: Use structural clustering to preview what templates would be created
        if (dryRun) {
            console.log(`[BULK_PROCESSOR] Starting dry run preview with structural clustering...`);
            
            // Get existing recurring games for matching simulation
            const { getRecurringGamesByVenue } = require('./recurring-resolver');
            const existingTemplates = await getRecurringGamesByVenue(venueId);
            console.log(`[BULK_PROCESSOR] Found ${existingTemplates.length} existing templates`);
            
            // Enrich games with computed fields
            const enrichedGames = enrichGamesForClustering(games);
            console.log(`[BULK_PROCESSOR] Enriched ${enrichedGames.length} games for clustering`);
            
            // Track preview results
            const preview = {
                wouldMatchExisting: [],    // Games that would match existing templates
                wouldCreateNew: [],        // Games that would go into new templates
                wouldDefer: [],            // Games deferred (not enough pattern confirmation)
                wouldSkip: [],             // Games skipped (invalid date, etc.)
                potentialTemplates: []     // New templates that would be created
            };
            
            // Separate games by category and day
            const gamesByDayAndCategory = {};
            
            for (const game of enrichedGames) {
                if (!game._dayOfWeek) {
                    preview.wouldSkip.push({
                        gameId: game.id,
                        gameName: game.name,
                        status: 'WOULD_SKIP',
                        reason: 'invalid_date'
                    });
                    continue;
                }
                
                const key = `${game._dayOfWeek}_${game._sessionMode}`;
                if (!gamesByDayAndCategory[key]) {
                    gamesByDayAndCategory[key] = [];
                }
                gamesByDayAndCategory[key].push(game);
            }
            
            const minGamesForTemplate = requirePatternConfirmation ? CLUSTERING_CONFIG.minGamesForTemplate : 1;
            
            // Process each day + category combination
            for (const [key, dayGames] of Object.entries(gamesByDayAndCategory)) {
                const [dayOfWeek, category] = key.split('_');
                
                console.log(`[BULK_PROCESSOR] ${dayOfWeek} ${category}: Processing ${dayGames.length} games...`);
                
                // First, try to match against existing templates
                const unmatched = [];
                
                for (const game of dayGames) {
                    let matched = false;
                    let bestMatch = null;
                    let bestScore = 0;
                    
                    for (const template of existingTemplates) {
                        // Check day match
                        if (template.dayOfWeek !== dayOfWeek) continue;
                        
                        // Check session mode match
                        const templateMode = template.gameType === 'CASH_GAME' ? 'CASH' : 'TOURNAMENT';
                        if (templateMode !== category) continue;
                        
                        // Check structural similarity (buy-in + time)
                        const buyInMatch = buyInsAreSimilar(game.buyIn, template.typicalBuyIn);
                        
                        // Parse template start time to minutes for comparison
                        let templateMinutes = null;
                        if (template.startTime) {
                            const [h, m] = template.startTime.split(':').map(Number);
                            templateMinutes = h * 60 + (m || 0);
                        }
                        const timeMatch = timesAreSimilar(game._startTimeMinutes, templateMinutes);
                        
                        // Calculate combined score
                        let score = 0;
                        if (buyInMatch && timeMatch) score = 0.9;
                        else if (buyInMatch || timeMatch) score = 0.6;
                        
                        // Add name bonus
                        const normalizedName = normalizeGameName(game.name);
                        const templateNormalized = normalizeGameName(template.name);
                        const nameSim = stringSimilarity(normalizedName, templateNormalized);
                        score += nameSim * 0.1;
                        
                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = template;
                        }
                    }
                    
                    if (bestMatch && bestScore >= 0.6) {
                        preview.wouldMatchExisting.push({
                            gameId: game.id,
                            gameName: game.name,
                            dayOfWeek,
                            sessionMode: category,
                            buyIn: game.buyIn,
                            time: formatMinutes(game._startTimeMinutes),
                            status: 'WOULD_MATCH_EXISTING',
                            matchedTemplateId: bestMatch.id,
                            matchedTemplateName: bestMatch.name,
                            confidence: Math.round(bestScore * 100) / 100
                        });
                        result.assigned++;
                        matched = true;
                    }
                    
                    if (!matched) {
                        unmatched.push(game);
                    }
                }
                
                if (unmatched.length === 0) continue;
                
                // Cluster unmatched games structurally
                console.log(`[BULK_PROCESSOR] ${dayOfWeek} ${category}: Clustering ${unmatched.length} unmatched games...`);
                
                const clusters = clusterGamesStructurally(unmatched, {
                    structuralThreshold: CLUSTERING_CONFIG.structuralThreshold
                });
                
                console.log(`[BULK_PROCESSOR] ${dayOfWeek} ${category}: Created ${clusters.length} clusters`);
                
                // Analyze each cluster
                for (const cluster of clusters) {
                    const wouldCreate = autoCreate && cluster.length >= minGamesForTemplate;
                    const wouldDefer = !wouldCreate && cluster.length >= 1 && requirePatternConfirmation;
                    
                    // Calculate cluster statistics
                    const buyIns = cluster.map(g => g.buyIn).filter(b => b > 0);
                    const avgBuyIn = buyIns.length > 0 
                        ? Math.round(buyIns.reduce((a, b) => a + b, 0) / buyIns.length) 
                        : 0;
                    const minBuyIn = buyIns.length > 0 ? Math.min(...buyIns) : 0;
                    const maxBuyIn = buyIns.length > 0 ? Math.max(...buyIns) : 0;
                    
                    // Calculate median start time
                    const validTimes = cluster
                        .map(g => g._startTimeMinutes)
                        .filter(t => t !== null)
                        .sort((a, b) => a - b);
                    const medianTime = validTimes.length > 0 
                        ? validTimes[Math.floor(validTimes.length / 2)] 
                        : null;
                    
                    // Generate template name
                    const templateName = generateTemplateNameFromCluster(cluster, dayOfWeek, category);
                    
                    // Calculate confidence
                    let confidence = 0.85;  // Base confidence for structural clustering
                    // Add name consistency bonus
                    const names = cluster.map(g => normalizeGameName(g.name)).filter(n => n);
                    if (names.length >= 2) {
                        let similarPairs = 0;
                        const checkCount = Math.min(names.length, 10);
                        for (let i = 0; i < checkCount; i++) {
                            for (let j = i + 1; j < checkCount; j++) {
                                if (stringSimilarity(names[i], names[j]) > 0.6) similarPairs++;
                            }
                        }
                        const totalPairs = (checkCount * (checkCount - 1)) / 2;
                        confidence += (similarPairs / totalPairs) * 0.1;
                    }
                    confidence = Math.min(0.95, confidence);
                    
                    // Get most common variant in cluster
                    const variantCounts = {};
                    cluster.forEach(g => {
                        const v = g._variant || 'NLHE';
                        variantCounts[v] = (variantCounts[v] || 0) + 1;
                    });
                    const clusterVariant = Object.entries(variantCounts)
                        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'NLHE';
                    
                    if (wouldCreate) {
                        // This cluster would create a new template
                        preview.potentialTemplates.push({
                            suggestedName: templateName,  // UI expects suggestedName
                            name: templateName,           // Keep for backwards compat
                            dayOfWeek,
                            gameType: category === 'CASH' ? 'CASH_GAME' : 'TOURNAMENT',
                            sessionMode: category,
                            variant: clusterVariant,      // Use detected variant from cluster
                            gameCount: cluster.length,
                            avgBuyIn,
                            buyInRange: minBuyIn !== maxBuyIn ? `$${minBuyIn}-$${maxBuyIn}` : `$${avgBuyIn}`,
                            timeSlot: formatMinutes(medianTime),
                            confidence: Math.round(confidence * 100) + '%',
                            sampleGames: cluster.slice(0, 5).map(g => ({
                                id: g.id,
                                name: g.name,
                                date: g.gameStartDateTime,  // UI expects date not time
                                buyIn: g.buyIn,
                                time: formatMinutes(g._startTimeMinutes)
                            })),
                            status: 'WOULD_CREATE'
                        });
                        
                        // Mark games as would create
                        for (const game of cluster) {
                            preview.wouldCreateNew.push({
                                gameId: game.id,
                                gameName: game.name,
                                dayOfWeek,
                                sessionMode: category,
                                buyIn: game.buyIn,
                                time: formatMinutes(game._startTimeMinutes),
                                status: 'WOULD_CREATE_TEMPLATE',
                                suggestedTemplateName: templateName,
                                clusterSize: cluster.length
                            });
                            result.created++;
                            result.assigned++;
                        }
                    } else if (wouldDefer) {
                        // Not enough games to create template yet
                        for (const game of cluster) {
                            preview.wouldDefer.push({
                                gameId: game.id,
                                gameName: game.name,
                                dayOfWeek,
                                sessionMode: category,
                                buyIn: game.buyIn,
                                time: formatMinutes(game._startTimeMinutes),
                                status: 'WOULD_DEFER',
                                reason: `Only ${cluster.length} game(s), need ${minGamesForTemplate} for template`,
                                clusterSize: cluster.length,
                                potentialTemplateName: templateName
                            });
                            result.deferred++;
                        }
                    } else {
                        // autoCreate is off
                        for (const game of cluster) {
                            preview.wouldDefer.push({
                                gameId: game.id,
                                gameName: game.name,
                                dayOfWeek,
                                sessionMode: category,
                                buyIn: game.buyIn,
                                time: formatMinutes(game._startTimeMinutes),
                                status: 'NO_MATCH',
                                reason: 'autoCreate disabled',
                                clusterSize: cluster.length
                            });
                            result.noMatch++;
                        }
                    }
                }
            }
            
            result.processed = games.length;
            result.message = `Preview: ${result.assigned} would be assigned (${preview.wouldMatchExisting.length} to existing, ${preview.wouldCreateNew.length} via ${preview.potentialTemplates.length} new templates), ${result.deferred} would be deferred, ${preview.wouldSkip.length} skipped`;
            
            // Build details array from preview data
            result.details = [
                ...preview.wouldMatchExisting,
                ...preview.wouldCreateNew,
                ...preview.wouldDefer,
                ...preview.wouldSkip
            ].slice(0, 100);  // Limit details to 100 items
            
            // Add summary of potential new templates
            result.potentialTemplates = preview.potentialTemplates;
            
            // Add summary stats for UI display
            result.summary = {
                totalGames: games.length,
                wouldAssign: result.assigned,
                wouldMatchExisting: preview.wouldMatchExisting.length,
                wouldCreateNew: preview.wouldCreateNew.length,
                newTemplatesCount: preview.potentialTemplates.length,
                wouldDefer: preview.wouldDefer.length,
                wouldSkip: preview.wouldSkip.length
            };
            
            console.log(`[BULK_PROCESSOR] Dry run complete in ${Date.now() - startTime}ms`);
            console.log(`[BULK_PROCESSOR] Preview summary:`);
            console.log(`  - Would match existing: ${preview.wouldMatchExisting.length}`);
            console.log(`  - Would create new templates: ${preview.potentialTemplates.length}`);
            console.log(`  - Games in new templates: ${preview.wouldCreateNew.length}`);
            console.log(`  - Would defer: ${preview.wouldDefer.length}`);
            console.log(`  - Would skip: ${preview.wouldSkip.length}`);
            
            // Log each potential template for visibility
            if (preview.potentialTemplates.length > 0) {
                console.log(`[BULK_PROCESSOR] Potential new templates:`);
                preview.potentialTemplates.forEach((t, i) => {
                    console.log(`  ${i + 1}. ${t.suggestedName} (${t.dayOfWeek} ${t.sessionMode}) - ${t.gameCount} games, ${t.buyInRange}, ${t.timeSlot}`);
                });
            }
            
            return result;
        }
        
        // ACTUAL PROCESSING: Process in batches
        const totalBatches = Math.ceil(games.length / batchSize);
        console.log(`[BULK_PROCESSOR] Step 2: Processing ${games.length} games in ${totalBatches} batches...`);
        
        for (let i = 0; i < games.length; i += batchSize) {
            const batch = games.slice(i, i + batchSize);
            const batchNum = Math.floor(i/batchSize) + 1;
            const batchStart = Date.now();
            console.log(`[BULK_PROCESSOR] Batch ${batchNum}/${totalBatches} starting at ${Date.now() - startTime}ms...`);
            
            for (const game of batch) {
                try {
                    // Run through resolver
                    const resolution = await resolveRecurringAssignment({
                        game,
                        entityId: game.entityId || entityId,
                        autoCreate,
                        requirePatternConfirmation
                    });
                    
                    result.processed++;
                    
                    // Track outcome
                    const status = resolution.metadata?.status;
                    if (status === 'MATCHED_EXISTING') {
                        result.assigned++;
                    } else if (status === 'CREATED_NEW') {
                        result.created++;
                        result.assigned++;
                    } else if (status === 'DEFERRED') {
                        result.deferred++;
                    } else {
                        result.noMatch++;
                    }
                    
                    result.details.push({
                        gameId: game.id,
                        gameName: game.name,
                        status,
                        recurringGameId: resolution.gameUpdates?.recurringGameId,
                        recurringGameName: resolution.metadata?.matchedRecurringGameName,
                        confidence: resolution.gameUpdates?.recurringGameAssignmentConfidence,
                        wasCreated: resolution.metadata?.wasCreated
                    });
                    
                } catch (error) {
                    console.error(`[BULK_PROCESSOR] Error processing game ${game.id}:`, error.message);
                    result.errors++;
                    result.details.push({
                        gameId: game.id,
                        gameName: game.name,
                        status: 'ERROR',
                        error: error.message
                    });
                }
            }
            
            console.log(`[BULK_PROCESSOR] Batch ${batchNum}/${totalBatches} complete in ${Date.now() - batchStart}ms - totals: processed=${result.processed}, assigned=${result.assigned}, errors=${result.errors}`);
            
            // Rate limiting between batches
            if (i + batchSize < games.length && delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        console.log(`[BULK_PROCESSOR] Complete in ${Date.now() - startTime}ms:`, {
            processed: result.processed,
            assigned: result.assigned,
            created: result.created,
            deferred: result.deferred,
            noMatch: result.noMatch,
            errors: result.errors
        });
        
        return result;
        
    } catch (error) {
        console.error('[BULK_PROCESSOR] Fatal error:', error);
        result.success = false;
        result.error = error.message;
        return result;
    }
};

/**
 * Reprocess games that were deferred (CANDIDATE_RECURRING)
 * 
 * These are games where we're waiting for pattern confirmation.
 * Running this again may find enough similar games to create templates.
 */
const reprocessDeferredGames = async (input) => {
    const { venueId, entityId, limit = 100 } = input;
    
    console.log(`[BULK_PROCESSOR] Reprocessing deferred games`);
    
    // Get only CANDIDATE_RECURRING games
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    const games = [];
    let lastKey = null;
    
    do {
        const params = {
            TableName: tableName,
            FilterExpression: 'recurringGameAssignmentStatus = :candidate',
            ExpressionAttributeValues: {
                ':candidate': 'CANDIDATE_RECURRING'
            }
        };
        
        if (venueId) {
            params.IndexName = 'byVenue';
            params.KeyConditionExpression = 'venueId = :vid';
            params.ExpressionAttributeValues[':vid'] = venueId;
        }
        
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const result = venueId 
            ? await client.send(new QueryCommand(params))
            : await client.send(new ScanCommand(params));
        
        games.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
        
    } while (lastKey && games.length < limit);
    
    console.log(`[BULK_PROCESSOR] Found ${games.length} deferred games to reprocess`);
    
    // Process them with pattern confirmation disabled (they've waited long enough)
    return processUnassignedGames({
        ...input,
        requirePatternConfirmation: false,  // Force creation now
        limit: games.length
    });
};

// ===================================================================
// PATTERN PREVIEW
// ===================================================================

/**
 * Preview candidate patterns at a venue
 * Shows what templates WOULD be created without creating them
 * 
 * Uses detectCandidatePatterns from recurring-resolver
 */
const previewCandidatePatterns = async (input) => {
    const { venueId, minOccurrences = 2 } = input || {};
    console.log(`[BULK_PROCESSOR] Previewing patterns for venue ${venueId}`);
    
    const patterns = await detectCandidatePatterns(venueId, minOccurrences);
    
    return {
        venueId,
        minOccurrences,
        patternCount: patterns.length,
        patterns: patterns.map(p => ({
            dayOfWeek: p.dayOfWeek,
            sessionMode: p.sessionMode,
            variant: p.variant,
            gameCount: p.gameCount,
            suggestedName: p.suggestedName,
            sampleGames: p.sampleGames
        }))
    };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Query functions
    getUnassignedGames,
    getUnassignedGamesStats,
    
    // Processing functions
    processUnassignedGames,
    reprocessDeferredGames,
    
    // Preview
    previewCandidatePatterns
};