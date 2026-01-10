/**
 * bootstrap-recurring-games.js (v3 - STRUCTURAL CLUSTERING)
 * 
 * Creates RecurringGame templates from existing games.
 * 
 * KEY INSIGHT: Name is just marketing. The same weekly tournament might be called
 * "Monday Madness" one week and "Bankroll Builder" the next. What actually
 * identifies a recurring game is:
 * 
 * 1. VENUE (hard requirement - pre-filtered)
 * 2. DAY OF WEEK (hard requirement - pre-filtered)
 * 3. BUY-IN TIER (primary clustering factor)
 * 4. TIME SLOT (primary clustering factor)
 * 5. NAME SIMILARITY (confidence bonus only - NOT a penalty)
 * 
 * Clustering Logic:
 * - Games with similar buy-in AND similar start time = same recurring game
 * - Name match increases confidence but name mismatch does NOT prevent clustering
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    QueryCommand, 
    PutCommand,
    UpdateCommand,
    GetCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Import shared utilities for name handling (used for display names and confidence)
const { 
    normalizeGameName, 
    stringSimilarity,
    generateTemplateName
} = require('./game-name-utils');

// Import evolving statistics utilities
const { initializeStats } = require('./recurring-game-stats');

// ===================================================================
// DETECTION UTILITIES (inline - no external dependencies)
// These are duplicated from recurring-resolver.js to avoid path issues
// between lambdas. Keep in sync if logic changes.
// ===================================================================

/**
 * Cash game indicators - if ANY of these match, it's a cash game
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
 * Detect game type category for clustering separation
 * Returns: 'CASH' | 'TOURNAMENT'
 */
const detectGameCategory = (game) => {
    const sessionInfo = detectSessionMode(game);
    return sessionInfo.mode === 'CASH' ? 'CASH' : 'TOURNAMENT';
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

/**
 * Detect game variant from name string
 * @param {string} name - Game name
 * @returns {string} - Game variant enum value (default: NLHE)
 */
const detectGameVariantFromName = (name) => {
    if (!name) return 'NLHE';
    
    const nameLower = name.toLowerCase();
    
    if (/\bplo5\b|pot.?limit.?omaha.?5|5.?card.?plo|plo.?5/i.test(nameLower)) return 'PLO5';
    if (/\bplo4?\b|pot.?limit.?omaha|omaha/i.test(nameLower)) return 'PLO';
    if (/\bmixed\b|horse|h\.?o\.?r\.?s\.?e|8.?game/i.test(nameLower)) return 'MIXED';
    if (/\bstud\b|7.?card/i.test(nameLower)) return 'STUD';
    if (/\brazz\b/i.test(nameLower)) return 'RAZZ';
    if (/\bdraw\b|2-7|27|badugi/i.test(nameLower)) return 'DRAW';
    if (/\blimit\b(?!.*(no|pot))/i.test(nameLower)) return 'LHE';
    
    return 'NLHE';
};

/**
 * Detect game variant from a cluster of games
 * Priority: 1. Most common explicit gameVariant, 2. Infer from names
 * @param {Object[]} games - Array of game objects
 * @returns {string} - Game variant enum value
 */
const detectGameVariantFromCluster = (games) => {
    if (!games || games.length === 0) return 'NLHE';
    
    const explicitVariants = games
        .map(g => g.gameVariant)
        .filter(v => v && typeof v === 'string');
    
    if (explicitVariants.length > 0) {
        const counts = {};
        explicitVariants.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return sorted[0][0];
    }
    
    const allNames = games.map(g => (g.name || '').toLowerCase()).join(' ');
    return detectGameVariantFromName(allNames);
};

/**
 * Detect frequency from name string
 * Priority: 1. Explicit keywords, 2. Day patterns → WEEKLY, 3. Month patterns → MONTHLY
 * @param {string} name - Game name
 * @returns {string} - Frequency enum value (default: WEEKLY)
 */
const detectFrequencyFromName = (name) => {
    if (!name) return 'WEEKLY';
    
    const nameLower = name.toLowerCase();
    
    // Explicit keywords
    if (/\bweekly\b/i.test(nameLower)) return 'WEEKLY';
    if (/\bmonthly\b/i.test(nameLower)) return 'MONTHLY';
    if (/\bdaily\b/i.test(nameLower)) return 'DAILY';
    if (/\bfortnightly\b|\bbi-?weekly\b/i.test(nameLower)) return 'BIWEEKLY';
    
    // Day patterns → WEEKLY
    const dayPatterns = [
        /\bmon(?:day)?\b/i, /\btue(?:s(?:day)?)?\b/i, /\bwed(?:nesday)?\b/i,
        /\bthu(?:rs(?:day)?)?\b/i, /\bfri(?:day)?\b/i, /\bsat(?:urday)?\b/i, /\bsun(?:day)?\b/i,
    ];
    for (const pattern of dayPatterns) {
        if (pattern.test(nameLower)) return 'WEEKLY';
    }
    
    // Month patterns → MONTHLY
    const monthPatterns = [
        /\bjan(?:uary)?\b/i, /\bfeb(?:ruary)?\b/i, /\bmar(?:ch)?\b/i, /\bapr(?:il)?\b/i,
        /\bmay\b/i, /\bjun(?:e)?\b/i, /\bjul(?:y)?\b/i, /\baug(?:ust)?\b/i,
        /\bsep(?:t(?:ember)?)?\b/i, /\boct(?:ober)?\b/i, /\bnov(?:ember)?\b/i, /\bdec(?:ember)?\b/i,
        /\b1st\s+(of\s+)?(the\s+)?month\b/i, /\bfirst\s+(of\s+)?(the\s+)?month\b/i,
        /\blast\s+(of\s+)?(the\s+)?month\b/i, /\bend\s+of\s+month\b/i,
    ];
    for (const pattern of monthPatterns) {
        if (pattern.test(nameLower)) return 'MONTHLY';
    }
    
    return 'WEEKLY';
};

/**
 * Detect frequency from a cluster of games
 * @param {Object[]} games - Array of game objects
 * @returns {string} - Frequency enum value
 */
const detectFrequencyFromCluster = (games) => {
    if (!games || games.length === 0) return 'WEEKLY';
    const allNames = games.map(g => (g.name || '').toLowerCase()).join(' ');
    return detectFrequencyFromName(allNames);
};

// Initialize DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

// Table names
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const RECURRING_GAME_TABLE = process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME;
const VENUE_TABLE = process.env.API_KINGSROOM_VENUETABLE_NAME;

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ===================================================================
// STRUCTURAL MATCHING CONFIGURATION
// ===================================================================

const CLUSTERING_CONFIG = {
    // Buy-in tolerance: games within this ratio are considered same tier
    // e.g., 0.5 means $100 and $150 are same tier (ratio 1.5 <= 1 + 0.5)
    buyInTolerance: 0.5,
    
    // Time tolerance in minutes: games within this window are same time slot
    // e.g., 60 means 7:00pm and 7:45pm are same slot
    timeToleranceMinutes: 60,
    
    // Minimum games to create a template
    minGamesForTemplate: 2,
    
    // If buy-in is missing/zero, use time-only clustering
    // If time is missing, use buy-in-only clustering
    // If both missing, cluster all together (rare edge case)
};

// ===================================================================
// STRUCTURAL SIMILARITY FUNCTIONS
// ===================================================================

/**
 * Check if two buy-ins are in the same tier
 */
const buyInsAreSimilar = (buyIn1, buyIn2, tolerance = CLUSTERING_CONFIG.buyInTolerance) => {
    // If either is missing, don't use buy-in as a differentiator
    if (!buyIn1 || !buyIn2 || buyIn1 <= 0 || buyIn2 <= 0) {
        return true;
    }
    
    const ratio = Math.max(buyIn1, buyIn2) / Math.min(buyIn1, buyIn2);
    return ratio <= (1 + tolerance);
};

/**
 * Check if two start times are in the same slot
 */
const timesAreSimilar = (time1, time2, toleranceMinutes = CLUSTERING_CONFIG.timeToleranceMinutes) => {
    // If either is missing, don't use time as a differentiator
    if (time1 === null || time2 === null) {
        return true;
    }
    
    const diff = Math.abs(time1 - time2);
    return diff <= toleranceMinutes;
};

/**
 * Calculate structural similarity score (0-1)
 * This determines if games should cluster together
 */
const calculateStructuralSimilarity = (game1, game2) => {
    const buyInMatch = buyInsAreSimilar(game1.buyIn, game2.buyIn);
    const timeMatch = timesAreSimilar(game1._startTimeMinutes, game2._startTimeMinutes);
    
    // Both match = definite cluster
    if (buyInMatch && timeMatch) {
        return 1.0;
    }
    
    // One matches, one doesn't have data = cluster
    const buyIn1Valid = game1.buyIn && game1.buyIn > 0;
    const buyIn2Valid = game2.buyIn && game2.buyIn > 0;
    const time1Valid = game1._startTimeMinutes !== null;
    const time2Valid = game2._startTimeMinutes !== null;
    
    // If only one factor has valid data on both sides, use that
    if (!buyIn1Valid || !buyIn2Valid) {
        return timeMatch ? 0.8 : 0;
    }
    if (!time1Valid || !time2Valid) {
        return buyInMatch ? 0.8 : 0;
    }
    
    // Both have valid data but only one matches = probably different games
    if (buyInMatch && !timeMatch) return 0.4;  // Same price, different time
    if (!buyInMatch && timeMatch) return 0.4;  // Different price, same time
    
    // Neither matches = definitely different
    return 0;
};

/**
 * Calculate name similarity bonus (adds to confidence, never subtracts)
 */
const calculateNameBonus = (game1, game2) => {
    if (!game1._normalizedName || !game2._normalizedName) {
        return 0;
    }
    
    const similarity = stringSimilarity(game1._normalizedName, game2._normalizedName);
    
    // Name similarity adds confidence but maxes out at 0.15 bonus
    // This means name can boost confidence from 0.85 to 1.0, but can't hurt it
    return similarity * 0.15;
};

// ===================================================================
// UNION-FIND FOR TRANSITIVE CLUSTERING
// ===================================================================

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
        if (!this.parent.has(x)) {
            this.makeSet(x);
        }
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
 * Cluster games using STRUCTURAL similarity (buy-in + time)
 * Name is only used for confidence scoring, not clustering decisions
 */
const clusterGamesStructurally = (games, options = {}) => {
    const { 
        debug = false,
        structuralThreshold = 0.7  // Minimum structural similarity to cluster
    } = options;
    
    if (games.length === 0) return [];
    if (games.length === 1) return [[games[0]]];
    
    const uf = new UnionFind();
    
    // Initialize all games
    games.forEach(g => uf.makeSet(g.id));
    
    // Compare all pairs using STRUCTURAL similarity
    for (let i = 0; i < games.length; i++) {
        for (let j = i + 1; j < games.length; j++) {
            const structuralSim = calculateStructuralSimilarity(games[i], games[j]);
            
            if (debug) {
                const nameBonus = calculateNameBonus(games[i], games[j]);
                if (structuralSim >= structuralThreshold || structuralSim >= 0.4) {
                    console.log(`[CLUSTER] "${games[i].name}" vs "${games[j].name}"`);
                    console.log(`  Buy-in: $${games[i].buyIn || '?'} vs $${games[j].buyIn || '?'}`);
                    console.log(`  Time: ${formatMinutes(games[i]._startTimeMinutes)} vs ${formatMinutes(games[j]._startTimeMinutes)}`);
                    console.log(`  Structural: ${(structuralSim * 100).toFixed(0)}% | Name bonus: +${(nameBonus * 100).toFixed(0)}%`);
                    console.log(`  Decision: ${structuralSim >= structuralThreshold ? 'CLUSTER ✓' : 'SEPARATE ✗'}`);
                }
            }
            
            // Cluster based on STRUCTURAL similarity only
            if (structuralSim >= structuralThreshold) {
                uf.union(games[i].id, games[j].id);
            }
        }
    }
    
    // Group by root
    const clusterMap = new Map();
    games.forEach(g => {
        const root = uf.find(g.id);
        if (!clusterMap.has(root)) {
            clusterMap.set(root, []);
        }
        clusterMap.get(root).push(g);
    });
    
    const clusters = Array.from(clusterMap.values());
    
    if (debug) {
        console.log(`[CLUSTER] Created ${clusters.length} clusters from ${games.length} games`);
        clusters.forEach((cluster, i) => {
            const avgBuyIn = cluster.reduce((sum, g) => sum + (g.buyIn || 0), 0) / cluster.length;
            console.log(`  Cluster ${i + 1}: ${cluster.length} games, avg buy-in $${Math.round(avgBuyIn)}`);
        });
    }
    
    return clusters;
};

const formatMinutes = (minutes) => {
    if (minutes === null || minutes === undefined) return '?';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${h12}:${String(m).padStart(2, '0')}${period}`;
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

const getVenue = async (venueId) => {
    const result = await docClient.send(new GetCommand({
        TableName: VENUE_TABLE,
        Key: { id: venueId }
    }));
    return result.Item;
};

const getGamesByVenue = async (venueId) => {
    const items = [];
    let lastKey = null;
    
    do {
        const params = {
            TableName: GAME_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            ExpressionAttributeValues: { ':vid': venueId }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const result = await docClient.send(new QueryCommand(params));
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    return items;
};

const createRecurringGame = async (templateData, sourceGames = []) => {
    const now = new Date().toISOString();
    const id = uuidv4();
    
    // Initialize with evolving statistics from source games
    const statsData = initializeStats(templateData, sourceGames);
    
    const item = {
        __typename: 'RecurringGame',
        id,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        isActive: true,
        source: 'BOOTSTRAP',
        ...templateData,
        ...statsData  // Merge evolving statistics
    };
    
    await docClient.send(new PutCommand({
        TableName: RECURRING_GAME_TABLE,
        Item: item
    }));
    
    return item;
};

const updateGameRecurringAssignment = async (gameId, recurringGameId, confidence) => {
    const now = new Date().toISOString();
    
    await docClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: gameId },
        UpdateExpression: `
            SET recurringGameId = :rgid,
                recurringGameAssignmentStatus = :status,
                recurringGameAssignmentConfidence = :conf,
                updatedAt = :now,
                #lca = :timestamp
        `,
        ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
        ExpressionAttributeValues: {
            ':rgid': recurringGameId,
            ':status': 'MATCHED_EXISTING',
            ':conf': confidence,
            ':now': now,
            ':timestamp': Date.now()
        }
    }));
};

// ===================================================================
// TEMPLATE NAME GENERATION (uses most common name from cluster)
// ===================================================================

/**
 * Clean a game name for use as a template name.
 * Removes buy-ins, guarantees, times, odds, venue suffixes - anything that changes.
 * 
 * Examples:
 * - "$5,000 GTD Monday Bankroll Builder Monday $120 Re-Entry Until" → "Monday Bankroll Builder"
 * - "Behemoth Satty 1 In 8" → "Behemoth Satty"
 * - "Wednesday PLO4 At KR STG" → "Wednesday PLO4"
 * - "$5,000 GTD Thursday Grind Thursday $120 Rebuy Until" → "Thursday Grind"
 */
const cleanTemplateDisplayName = (rawName) => {
    if (!rawName) return '';
    
    let clean = rawName;
    
    // 1. Remove dollar amounts and GTD/guaranteed
    clean = clean.replace(/\$[\d,]+k?\s*/gi, '');
    clean = clean.replace(/\b\d+k\s*(gtd|guaranteed)?\b/gi, '');
    clean = clean.replace(/\b(gtd|guaranteed)\b/gi, '');
    
    // 2. Remove times and "until" phrases
    clean = clean.replace(/until\s+[\w\d:]+(\s*(am|pm))?/gi, '');
    clean = clean.replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '');
    clean = clean.replace(/\buntil\b/gi, '');
    
    // 3. Remove odds patterns like "1 in 8", "1 in 6"
    clean = clean.replace(/\b\d+\s*in\s*\d+\b/gi, '');
    
    // 4. Remove "X seats GTD" patterns
    clean = clean.replace(/\d+\s*seats?\s*(gtd|guaranteed)?/gi, '');
    
    // 5. Remove venue abbreviations and suffixes
    clean = clean.replace(/\bat\s+(kr\s+)?stg\b/gi, '');
    clean = clean.replace(/\b(leagues?\s+club|bowling\s+club|sports\s+club|rsl)\b/gi, '');
    clean = clean.replace(/\bst\.?\s*george\b/gi, '');
    clean = clean.replace(/\bkings?\s*room\b/gi, '');
    
    // 6. Remove structure keywords that might have amounts stripped
    clean = clean.replace(/\bre-?entry\b/gi, '');
    clean = clean.replace(/\brebuy\b/gi, '');
    clean = clean.replace(/\bfreezeout\b/gi, '');
    
    // 7. Remove "weekly" and "daily"
    clean = clean.replace(/\b(weekly|daily)\b/gi, '');
    
    // 8. Remove duplicate day names (e.g., "Monday Bankroll Builder Monday" → "Monday Bankroll Builder")
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach(day => {
        const regex = new RegExp(`\\b${day}\\b.*\\b${day}\\b`, 'gi');
        if (regex.test(clean)) {
            // Keep only the first occurrence
            const firstMatch = clean.match(new RegExp(`\\b${day}\\b`, 'i'));
            if (firstMatch) {
                clean = clean.replace(new RegExp(`\\b${day}\\b`, 'gi'), (match, offset) => {
                    return offset === firstMatch.index ? match : '';
                });
            }
        }
    });
    
    // 9. Clean up punctuation and whitespace
    clean = clean.replace(/[^\w\s'-]/g, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();
    
    // 10. Remove leading/trailing filler words
    clean = clean.replace(/^(the|a|an|at|on)\s+/gi, '');
    clean = clean.replace(/\s+(the|a|an|at|on)$/gi, '');
    
    // 11. Title case
    clean = clean.replace(/\b\w/g, c => c.toUpperCase());
    
    // 12. Fix common abbreviations
    clean = clean.replace(/\bPlo\b/g, 'PLO');
    clean = clean.replace(/\bNlh\b/g, 'NLH');
    clean = clean.replace(/\bGtd\b/g, 'GTD');
    
    return clean.trim();
};

/**
 * Check if a cleaned name is just a day name (too generic)
 */
const isJustDayName = (name) => {
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const normalized = name.toLowerCase().trim();
    return dayNames.includes(normalized);
};

/**
 * Extract a distinctive identifier from cluster games
 * Looks for: guarantee amounts, distinctive words, tournament types
 */
const extractDistinctiveIdentifier = (cluster, dayOfWeek) => {
    const day = dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
    
    // 1. Check if most games have a similar guarantee - use that
    const guarantees = cluster
        .map(g => g.guaranteeAmount)
        .filter(g => g && g > 0);
    
    if (guarantees.length >= cluster.length * 0.5) {
        // More than half have guarantees
        const avgGuarantee = guarantees.reduce((a, b) => a + b, 0) / guarantees.length;
        if (avgGuarantee >= 1000) {
            const k = Math.round(avgGuarantee / 1000);
            return `${day} $${k}k GTD`;
        }
    }
    
    // 2. Look for distinctive words across all game names
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const stopWords = new Set([
        'tournament', 'poker', 'holdem', 'nlh', 'plo', 'the', 'at', 'on', 'gtd', 'guaranteed',
        'weekly', 'daily', 'club', 'leagues', 'george', 'kings', 'room', 'hotel',
        'rebuy', 'reentry', 'freezeout', 'until', 'end', 'level', 'seats', 'entry',
        ...dayNames
    ]);
    
    const wordFreq = {};
    cluster.forEach(g => {
        if (!g.name) return;
        // Split on spaces and common separators
        const words = g.name.toLowerCase().split(/[\s\-\/\$:,]+/);
        words.forEach(word => {
            const clean = word.replace(/[^\w]/g, '');
            // Must be 4+ chars, not a stop word, not a number
            if (clean.length >= 4 && !stopWords.has(clean) && !/^\d+$/.test(clean)) {
                wordFreq[clean] = (wordFreq[clean] || 0) + 1;
            }
        });
    });
    
    // Sort by frequency and pick the most common distinctive word
    const sortedWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
    
    if (sortedWords.length > 0) {
        // Use word if it appears in at least 20% of games
        const [word, count] = sortedWords[0];
        if (count >= cluster.length * 0.2) {
            return `${day} ${word.charAt(0).toUpperCase() + word.slice(1)}`;
        }
    }
    
    // 3. Check average buy-in for a descriptor
    const buyIns = cluster.map(g => g.buyIn).filter(b => b && b > 0);
    if (buyIns.length > 0) {
        const avgBuyIn = buyIns.reduce((a, b) => a + b, 0) / buyIns.length;
        if (avgBuyIn >= 300) {
            return `${day} Main Event`;
        } else if (avgBuyIn >= 150) {
            return `${day} Feature`;
        } else {
            return `${day} Tournament`;
        }
    }
    
    return `${day} Tournament`;
};

/**
 * Generate a template name from a cluster of games
 * Uses the most frequent actual game name pattern, heavily cleaned
 * @param {Object[]} cluster - Array of games
 * @param {string} dayOfWeek - Day of week (e.g., 'MONDAY')
 * @param {string} venueName - Venue name
 * @param {string} category - 'CASH' or 'TOURNAMENT'
 */
const generateTemplateNameFromCluster = (cluster, dayOfWeek, venueName, category = 'TOURNAMENT') => {
    const day = dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase();
    
    if (!cluster || cluster.length === 0) {
        return category === 'CASH' ? `${day} Cash Game` : `${day} Tournament`;
    }
    
    // For CASH games, generate cash-specific names
    if (category === 'CASH') {
        // Try to extract stake info from names (e.g., "1/2", "2/5")
        const stakePattern = /\$?(\d+)\s*\/\s*\$?(\d+)/;
        const stakeCounts = {};
        
        cluster.forEach(g => {
            if (!g.name) return;
            const match = g.name.match(stakePattern);
            if (match) {
                const stake = `${match[1]}/${match[2]}`;
                stakeCounts[stake] = (stakeCounts[stake] || 0) + 1;
            }
        });
        
        const sortedStakes = Object.entries(stakeCounts).sort((a, b) => b[1] - a[1]);
        if (sortedStakes.length > 0 && sortedStakes[0][1] >= cluster.length * 0.3) {
            return `${day} $${sortedStakes[0][0]} Cash`;
        }
        
        // Check for PLO or specific variants
        const hasOmaha = cluster.some(g => g.name && /\b(plo|omaha|plo4|plo5)\b/i.test(g.name));
        if (hasOmaha) {
            return `${day} PLO Cash`;
        }
        
        return `${day} Cash Game`;
    }
    
    // For TOURNAMENTS, use the existing logic
    // Clean all names and count frequencies
    const cleanNameFreq = {};
    cluster.forEach(g => {
        if (!g.name) return;
        const cleaned = cleanTemplateDisplayName(g.name);
        if (cleaned.length >= 3) {
            cleanNameFreq[cleaned] = (cleanNameFreq[cleaned] || 0) + 1;
        }
    });
    
    // Get most common clean name
    const sortedNames = Object.entries(cleanNameFreq).sort((a, b) => b[1] - a[1]);
    
    if (sortedNames.length > 0) {
        const bestName = sortedNames[0][0];
        // Check it's not just a day name
        if (bestName.length >= 5 && !isJustDayName(bestName)) {
            return bestName;
        }
    }
    
    // Fallback: extract distinctive identifier from cluster
    return extractDistinctiveIdentifier(cluster, dayOfWeek);
};

// ===================================================================
// MAIN BOOTSTRAP FUNCTION
// ===================================================================

const bootstrapRecurringGames = async (input) => {
    const {
        venueId,
        minGamesForTemplate = CLUSTERING_CONFIG.minGamesForTemplate,
        buyInTolerance = CLUSTERING_CONFIG.buyInTolerance,
        timeToleranceMinutes = CLUSTERING_CONFIG.timeToleranceMinutes,
        preview = true,
        includeAssigned = false,
        debug = false
    } = input;
    
    console.log('[BOOTSTRAP] Starting with STRUCTURAL clustering:', { 
        venueId, 
        minGamesForTemplate, 
        buyInTolerance,
        timeToleranceMinutes,
        preview,
        debug
    });
    
    const result = {
        success: true,
        venueId,
        venueName: null,
        preview,
        clusteringMethod: 'STRUCTURAL (buy-in + time)',
        totalGamesAnalyzed: 0,
        eligibleGames: 0,
        templatesCreated: 0,
        gamesAssigned: 0,
        templateDetails: [],
        errors: []
    };
    
    try {
        const venue = await getVenue(venueId);
        if (!venue) throw new Error(`Venue not found: ${venueId}`);
        result.venueName = venue.name;
        
        console.log('[BOOTSTRAP] Fetching games...');
        const allGames = await getGamesByVenue(venueId);
        result.totalGamesAnalyzed = allGames.length;
        
        // Filter eligible games
        // Note: We DON'T filter out cash games here - we'll cluster them separately
        const eligibleGames = allGames.filter(game => {
            if (game.isSeries || game.tournamentSeriesId) return false;
            if (!includeAssigned && game.recurringGameId) return false;
            if (!game.gameStartDateTime) return false;
            return true;
        });
        
        result.eligibleGames = eligibleGames.length;
        console.log(`[BOOTSTRAP] ${eligibleGames.length} eligible games`);
        
        if (eligibleGames.length === 0) return result;
        
        // Enrich games with computed fields
        eligibleGames.forEach(game => {
            const date = new Date(game.gameStartDateTime);
            game._dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()];
            game._startTimeMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
            game._normalizedName = game.name ? normalizeGameName(game.name) : '';
            game._gameCategory = detectGameCategory(game);
        });
        
        if (debug) {
            console.log('[BOOTSTRAP] Sample games:');
            eligibleGames.slice(0, 5).forEach(g => {
                console.log(`  "${g.name}" | $${g.buyIn || '?'} | ${formatMinutes(g._startTimeMinutes)}`);
            });
        }
        
        // Group by day AND game category (cash games must be separate from tournaments)
        const gamesByDayAndCategory = {};
        DAYS_OF_WEEK.forEach(day => { 
            gamesByDayAndCategory[`${day}_TOURNAMENT`] = [];
            gamesByDayAndCategory[`${day}_CASH`] = [];
        });
        eligibleGames.forEach(game => { 
            const key = `${game._dayOfWeek}_${game._gameCategory}`;
            gamesByDayAndCategory[key].push(game); 
        });
        
        // Log cash game detection
        const cashGames = eligibleGames.filter(g => g._gameCategory === 'CASH');
        const tournamentGames = eligibleGames.filter(g => g._gameCategory === 'TOURNAMENT');
        console.log(`[BOOTSTRAP] Detected ${cashGames.length} cash games and ${tournamentGames.length} tournament games`);
        
        // Process each day AND category combination
        for (const day of DAYS_OF_WEEK) {
            for (const category of ['TOURNAMENT', 'CASH']) {
                const key = `${day}_${category}`;
                const dayGames = gamesByDayAndCategory[key];
                if (dayGames.length < minGamesForTemplate) continue;
            
                console.log(`[BOOTSTRAP] ${day} ${category}: Clustering ${dayGames.length} games by structure...`);
            
            // Cluster using STRUCTURAL similarity
            let clusters = clusterGamesStructurally(dayGames, { 
                debug,
                structuralThreshold: 0.7
            });
            
            // Filter clusters below minimum threshold
            clusters = clusters.filter(c => c.length >= minGamesForTemplate);
            
            // === MERGE STEP: Combine clusters with same template name ===
            // This handles cases where games structurally cluster differently 
            // (e.g., different buy-in tiers) but are really the same recurring game
            const clustersByName = new Map();
            
            for (const cluster of clusters) {
                const templateName = generateTemplateNameFromCluster(cluster, day, venue.name, category);
                
                if (clustersByName.has(templateName)) {
                    // Merge into existing cluster
                    const existing = clustersByName.get(templateName);
                    existing.games.push(...cluster);
                    if (debug) {
                        console.log(`[BOOTSTRAP] Merging ${cluster.length} games into existing "${templateName}" cluster`);
                    }
                } else {
                    clustersByName.set(templateName, {
                        name: templateName,
                        games: [...cluster]
                    });
                }
            }
            
            // Convert back to array of merged clusters
            const mergedClusters = Array.from(clustersByName.values());
            
            if (debug && mergedClusters.length < clusters.length) {
                console.log(`[BOOTSTRAP] ${day}: Merged ${clusters.length} clusters into ${mergedClusters.length} templates`);
            }
            
            // Process merged clusters
            for (const { name: templateName, games: cluster } of mergedClusters) {
                
                // Calculate cluster statistics
                const avgBuyIn = cluster.reduce((sum, g) => sum + (g.buyIn || 0), 0) / cluster.length;
                const avgEntries = cluster.reduce((sum, g) => sum + (g.totalUniquePlayers || 0), 0) / cluster.length;
                
                // Calculate median start time
                const validTimes = cluster
                    .map(g => g._startTimeMinutes)
                    .filter(t => t !== null)
                    .sort((a, b) => a - b);
                const medianTime = validTimes.length > 0 
                    ? validTimes[Math.floor(validTimes.length / 2)] 
                    : null;
                const startHour = medianTime !== null ? Math.floor(medianTime / 60) : 19;
                const startMinute = medianTime !== null ? medianTime % 60 : 0;
                
                // Calculate confidence based on structural consistency + name bonus
                let baseConfidence = 0.85;  // High base because we clustered structurally
                
                // Add name bonus if names are similar
                const normalizedNames = cluster.map(g => g._normalizedName).filter(n => n);
                if (normalizedNames.length >= 2) {
                    // Check how many games share similar names
                    let nameSimilarityCount = 0;
                    for (let i = 0; i < Math.min(normalizedNames.length, 10); i++) {
                        for (let j = i + 1; j < Math.min(normalizedNames.length, 10); j++) {
                            if (stringSimilarity(normalizedNames[i], normalizedNames[j]) > 0.6) {
                                nameSimilarityCount++;
                            }
                        }
                    }
                    const totalPairs = (Math.min(normalizedNames.length, 10) * (Math.min(normalizedNames.length, 10) - 1)) / 2;
                    const nameConsistency = nameSimilarityCount / totalPairs;
                    baseConfidence += nameConsistency * 0.1;  // Up to +10% for name consistency
                }
                
                const confidence = Math.min(0.95, baseConfidence);
                
                // Buy-in range
                const buyIns = cluster.map(g => g.buyIn).filter(b => b > 0);
                const minBuyIn = buyIns.length > 0 ? Math.min(...buyIns) : 0;
                const maxBuyIn = buyIns.length > 0 ? Math.max(...buyIns) : 0;
                
                // Guarantee average
                const guarantees = cluster.map(g => g.guaranteeAmount).filter(g => g > 0);
                const avgGuarantee = guarantees.length > 0 
                    ? guarantees.reduce((sum, g) => sum + g, 0) / guarantees.length 
                    : 0;
                
                // Use shared detection utilities
                const detectedVariant = detectGameVariantFromCluster(cluster);
                const detectedFrequency = detectFrequencyFromCluster(cluster);
                
                const templateData = {
                    name: templateName,
                    dayOfWeek: day,
                    venueId,
                    entityId: venue.entityId,
                    gameType: category === 'CASH' ? 'CASH_GAME' : 'TOURNAMENT',
                    gameVariant: detectedVariant,
                    frequency: detectedFrequency,
                    typicalBuyIn: Math.round(avgBuyIn),
                    typicalGuarantee: avgGuarantee > 0 ? Math.round(avgGuarantee) : null,
                    typicalStartTime: `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`,
                    averageEntries: Math.round(avgEntries * 10) / 10,
                    totalOccurrences: cluster.length,
                    lastSeenDate: cluster.reduce((max, g) => {
                        const d = g.gameStartDateTime?.split('T')[0];
                        return d > max ? d : max;
                    }, '2000-01-01'),
                    firstSeenDate: cluster.reduce((min, g) => {
                        const d = g.gameStartDateTime?.split('T')[0];
                        return d < min ? d : min;
                    }, '9999-12-31'),
                    gameIds: cluster.map(g => g.id).slice(0, 10),
                    source: 'BOOTSTRAP'
                };
                
                result.templateDetails.push({
                    name: templateName,
                    dayOfWeek: day,
                    gameType: category === 'CASH' ? 'CASH_GAME' : 'TOURNAMENT',
                    gameCount: cluster.length,
                    avgBuyIn: Math.round(avgBuyIn),
                    buyInRange: minBuyIn !== maxBuyIn ? `$${minBuyIn}-$${maxBuyIn}` : `$${Math.round(avgBuyIn)}`,
                    timeSlot: formatMinutes(medianTime),
                    confidence: Math.round(confidence * 100) + '%',
                    sampleGames: cluster.slice(0, 5).map(g => ({ 
                        name: g.name, 
                        buyIn: g.buyIn,
                        time: formatMinutes(g._startTimeMinutes)
                    })),
                    status: preview ? 'WOULD_CREATE' : 'CREATING'
                });
                
                if (!preview) {
                    try {
                        // Pass cluster as sourceGames to initialize evolving statistics
                        const template = await createRecurringGame(templateData, cluster);
                        console.log(`[BOOTSTRAP] Created: ${templateName} (${template.id})`);
                        result.templatesCreated++;
                        
                        for (const game of cluster) {
                            await updateGameRecurringAssignment(game.id, template.id, confidence);
                            result.gamesAssigned++;
                        }
                        
                        const detail = result.templateDetails[result.templateDetails.length - 1];
                        detail.templateId = template.id;
                        detail.status = 'CREATED';
                        detail.gamesAssigned = cluster.length;
                    } catch (err) {
                        console.error(`[BOOTSTRAP] Error creating ${templateName}:`, err);
                        result.errors.push({ templateName, error: err.message });
                    }
                }
            }
            } // End category loop
        } // End day loop
        
        console.log('[BOOTSTRAP] Complete:', { 
            templatesCreated: result.templatesCreated, 
            gamesAssigned: result.gamesAssigned,
            templateCount: result.templateDetails.length
        });
        
        return result;
        
    } catch (error) {
        console.error('[BOOTSTRAP] Error:', error);
        result.success = false;
        result.errors.push({ error: error.message });
        return result;
    }
};

const handleBootstrapRecurringGames = async (input) => {
    return await bootstrapRecurringGames(input);
};

module.exports = {
    bootstrapRecurringGames,
    handleBootstrapRecurringGames,
    clusterGamesStructurally,
    calculateStructuralSimilarity,
    buyInsAreSimilar,
    timesAreSimilar,
    CLUSTERING_CONFIG,
    UnionFind
};
