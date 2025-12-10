/**
 * ===================================================================
 * GAME QUERY KEY COMPUTATION HELPER
 * ===================================================================
 * 
 * This module provides functions to compute query optimization keys
 * for the Game model. These computed keys enable efficient DynamoDB
 * queries across multiple dimensions.
 * 
 * COMPUTED KEYS:
 * - gameDayOfWeek: Day of week (MONDAY, TUESDAY, etc.)
 * - buyInBucket: Buy-in range bucket for range queries
 * - venueScheduleKey: Composite key for venue + day + variant queries
 * - entityQueryKey: Composite key for entity-wide queries
 * 
 * USAGE:
 *   const { computeGameQueryKeys } = require('./game-query-keys');
 *   const queryKeys = computeGameQueryKeys(gameData);
 *   const gameRecord = { ...gameData, ...queryKeys };
 * 
 * ===================================================================
 */

// Day of week constants
const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Buy-in bucket thresholds (in dollars)
const BUY_IN_BUCKETS = [
    { max: 25, label: '0000-0025' },
    { max: 50, label: '0026-0050' },
    { max: 100, label: '0051-0100' },
    { max: 200, label: '0101-0200' },
    { max: 500, label: '0201-0500' },
    { max: 1000, label: '0501-1000' },
    { max: Infinity, label: '1001-PLUS' }
];

/**
 * Get day of week from a date
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {string|null} Day of week (e.g., "MONDAY") or null
 */
const getDayOfWeek = (dateValue) => {
    if (!dateValue) return null;
    
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        return DAYS_OF_WEEK[date.getUTCDay()];
    } catch (error) {
        console.error('[QueryKeys] Error getting day of week:', error);
        return null;
    }
};

/**
 * Get buy-in bucket for a given amount
 * @param {number} buyIn - Buy-in amount in dollars
 * @returns {string} Buy-in bucket label (e.g., "0051-0100")
 */
const getBuyInBucket = (buyIn) => {
    const amount = buyIn || 0;
    
    for (const bucket of BUY_IN_BUCKETS) {
        if (amount <= bucket.max) {
            return bucket.label;
        }
    }
    
    return '0501-PLUS'; // Fallback (shouldn't reach here)
};

/**
 * Build venue schedule key for venue + day + variant queries
 * @param {string} venueId - Venue ID
 * @param {string} dayOfWeek - Day of week
 * @param {string} gameVariant - Game variant (e.g., "NLHE")
 * @returns {string|null} Composite key or null if missing components
 */
const buildVenueScheduleKey = (venueId, dayOfWeek, gameVariant) => {
    if (!venueId || !dayOfWeek || !gameVariant) return null;
    
    // Normalize variant to uppercase
    const variant = (gameVariant || 'NLHE').toUpperCase();
    
    return `${venueId}#${dayOfWeek}#${variant}`;
};

/**
 * Build entity query key for cross-venue queries within an entity
 * @param {string} entityId - Entity ID
 * @param {string} dayOfWeek - Day of week
 * @param {string} gameVariant - Game variant
 * @param {string} buyInBucket - Buy-in bucket
 * @returns {string|null} Composite key or null if missing components
 */
const buildEntityQueryKey = (entityId, dayOfWeek, gameVariant, buyInBucket) => {
    if (!entityId || !dayOfWeek || !gameVariant || !buyInBucket) return null;
    
    // Normalize variant to uppercase
    const variant = (gameVariant || 'NLHE').toUpperCase();
    
    return `${entityId}#${dayOfWeek}#${variant}#${buyInBucket}`;
};

/**
 * Compute all query optimization keys for a game
 * 
 * @param {Object} gameData - Game data object
 * @param {string} gameData.gameStartDateTime - Game start date/time (ISO string)
 * @param {number} gameData.buyIn - Buy-in amount
 * @param {string} gameData.gameVariant - Game variant (NLHE, PLO, etc.)
 * @param {string} gameData.venueId - Venue ID
 * @param {string} gameData.entityId - Entity ID
 * @param {boolean} gameData.isRegular - Whether this is a regular (recurring) game
 * @param {boolean} gameData.isSeries - Whether this is a series event
 * @param {boolean} gameData.isSatellite - Whether this is a satellite
 * @returns {Object} Computed query keys
 */
const computeGameQueryKeys = (gameData) => {
    const {
        gameStartDateTime,
        buyIn,
        gameVariant,
        venueId,
        entityId,
        isRegular,
        isSeries,
        isSatellite
    } = gameData;

    // Compute individual components
    const gameDayOfWeek = getDayOfWeek(gameStartDateTime);
    const buyInBucket = getBuyInBucket(buyIn);
    const variant = (gameVariant || 'NLHE').toUpperCase();
    
    // Determine game type (priority order)
    const gameType = getGameType(isRegular, isSeries, isSatellite);
    
    // Build composite keys (existing)
    const venueScheduleKey = buildVenueScheduleKey(venueId, gameDayOfWeek, variant);
    const entityQueryKey = buildEntityQueryKey(entityId, gameDayOfWeek, variant, buyInBucket);
    
    // NEW: Game-type-aware keys for filtered queries
    // Format: {id}#{gameType}#{dayOfWeek}#{variant}
    const venueGameTypeKey = buildVenueGameTypeKey(venueId, gameType, gameDayOfWeek, variant);
    // Format: {id}#{gameType}#{dayOfWeek}#{variant}#{buyInBucket}
    const entityGameTypeKey = buildEntityGameTypeKey(entityId, gameType, gameDayOfWeek, variant, buyInBucket);

    const result = {
        gameDayOfWeek,
        buyInBucket,
        gameType,
        // Existing keys (all games)
        venueScheduleKey,
        entityQueryKey,
        // New game-type-aware keys
        venueGameTypeKey,
        entityGameTypeKey
    };

    // Log for debugging (can be disabled in production)
    if (process.env.DEBUG_QUERY_KEYS === 'true') {
        console.log('[QueryKeys] Computed:', {
            input: { gameStartDateTime, buyIn, gameVariant, venueId: venueId?.substring(0, 8), entityId: entityId?.substring(0, 8), isRegular, isSeries, isSatellite },
            output: result
        });
    }

    return result;
};

/**
 * Determine the game type based on boolean flags
 * Priority order: REGULAR > SERIES > SATELLITE > STANDARD
 * 
 * @param {boolean} isRegular 
 * @param {boolean} isSeries 
 * @param {boolean} isSatellite 
 * @returns {string} Game type: REGULAR, SERIES, SATELLITE, or STANDARD
 */
const getGameType = (isRegular, isSeries, isSatellite) => {
    if (isRegular) return 'REGULAR';
    if (isSeries) return 'SERIES';
    if (isSatellite) return 'SATELLITE';
    return 'STANDARD';
};

/**
 * Build venue game type key for venue + game type queries
 * Format: {venueId}#{gameType}#{dayOfWeek}#{variant}
 * 
 * Supports queries:
 *   - All REGULAR games at venue: begins_with("{venueId}#REGULAR")
 *   - All REGULAR Monday games: begins_with("{venueId}#REGULAR#MONDAY")
 *   - Exact: "{venueId}#REGULAR#MONDAY#NLHE"
 * 
 * @param {string} venueId 
 * @param {string} gameType 
 * @param {string} dayOfWeek 
 * @param {string} variant 
 * @returns {string|null}
 */
const buildVenueGameTypeKey = (venueId, gameType, dayOfWeek, variant) => {
    if (!venueId || !gameType) return null;
    
    // Include day and variant for more specific queries
    const day = dayOfWeek || 'UNKNOWN';
    const v = variant || 'NLHE';
    
    return `${venueId}#${gameType}#${day}#${v}`;
};

/**
 * Build entity game type key for entity-wide + game type queries
 * Format: {entityId}#{gameType}#{dayOfWeek}#{variant}#{buyInBucket}
 * 
 * Supports queries:
 *   - All REGULAR games in entity: begins_with("{entityId}#REGULAR")
 *   - All REGULAR Saturday games: begins_with("{entityId}#REGULAR#SATURDAY")
 *   - All REGULAR Saturday NLHE: begins_with("{entityId}#REGULAR#SATURDAY#NLHE")
 *   - Exact with buy-in: "{entityId}#REGULAR#SATURDAY#NLHE#0051-0100"
 * 
 * @param {string} entityId 
 * @param {string} gameType 
 * @param {string} dayOfWeek 
 * @param {string} variant 
 * @param {string} buyInBucket 
 * @returns {string|null}
 */
const buildEntityGameTypeKey = (entityId, gameType, dayOfWeek, variant, buyInBucket) => {
    if (!entityId || !gameType) return null;
    
    const day = dayOfWeek || 'UNKNOWN';
    const v = variant || 'NLHE';
    const bucket = buyInBucket || '0000-0025';
    
    return `${entityId}#${gameType}#${day}#${v}#${bucket}`;
};

/**
 * Build prefix for venue game type queries
 * @param {string} venueId 
 * @param {string} gameType - Optional: REGULAR, SERIES, SATELLITE, STANDARD
 * @param {string} dayOfWeek - Optional
 * @returns {string}
 */
const buildVenueGameTypePrefix = (venueId, gameType = null, dayOfWeek = null) => {
    if (!venueId) return null;
    
    let prefix = `${venueId}#`;
    if (gameType) {
        prefix += `${gameType}#`;
        if (dayOfWeek) {
            prefix += `${dayOfWeek}#`;
        }
    }
    return prefix;
};

/**
 * Build prefix for entity game type queries
 * @param {string} entityId 
 * @param {string} gameType - Optional
 * @param {string} dayOfWeek - Optional
 * @param {string} variant - Optional
 * @returns {string}
 */
const buildEntityGameTypePrefix = (entityId, gameType = null, dayOfWeek = null, variant = null) => {
    if (!entityId) return null;
    
    let prefix = `${entityId}#`;
    if (gameType) {
        prefix += `${gameType}#`;
        if (dayOfWeek) {
            prefix += `${dayOfWeek}#`;
            if (variant) {
                prefix += `${variant.toUpperCase()}#`;
            }
        }
    }
    return prefix;
};

/**
 * Check if query keys need to be recomputed based on field changes
 * Useful for update operations to avoid unnecessary recalculation
 * 
 * @param {Array<string>} changedFields - List of changed field names
 * @returns {boolean} True if query keys should be recomputed
 */
const shouldRecomputeQueryKeys = (changedFields) => {
    const triggerFields = [
        'gameStartDateTime',
        'buyIn',
        'gameVariant',
        'venueId',
        'entityId',
        'isRegular',
        'isSeries',
        'isSatellite'
    ];
    
    return changedFields.some(field => triggerFields.includes(field));
};

/**
 * Parse a venue schedule key back into components
 * @param {string} key - Venue schedule key
 * @returns {Object|null} Parsed components or null
 */
const parseVenueScheduleKey = (key) => {
    if (!key) return null;
    
    const parts = key.split('#');
    if (parts.length !== 3) return null;
    
    return {
        venueId: parts[0],
        dayOfWeek: parts[1],
        gameVariant: parts[2]
    };
};

/**
 * Parse an entity query key back into components
 * @param {string} key - Entity query key
 * @returns {Object|null} Parsed components or null
 */
const parseEntityQueryKey = (key) => {
    if (!key) return null;
    
    const parts = key.split('#');
    if (parts.length !== 4) return null;
    
    return {
        entityId: parts[0],
        dayOfWeek: parts[1],
        gameVariant: parts[2],
        buyInBucket: parts[3]
    };
};

/**
 * Build a partial venue schedule key for begins_with queries
 * @param {string} venueId - Venue ID
 * @param {string} dayOfWeek - Optional day of week
 * @returns {string} Partial key for begins_with
 */
const buildVenueSchedulePrefix = (venueId, dayOfWeek = null) => {
    if (!venueId) return null;
    
    if (dayOfWeek) {
        return `${venueId}#${dayOfWeek}`;
    }
    
    return `${venueId}#`;
};

/**
 * Build a partial entity query key for begins_with queries
 * @param {string} entityId - Entity ID
 * @param {string} dayOfWeek - Optional day of week
 * @param {string} gameVariant - Optional game variant
 * @returns {string} Partial key for begins_with
 */
const buildEntityQueryPrefix = (entityId, dayOfWeek = null, gameVariant = null) => {
    if (!entityId) return null;
    
    let prefix = `${entityId}#`;
    
    if (dayOfWeek) {
        prefix += `${dayOfWeek}#`;
        if (gameVariant) {
            prefix += `${gameVariant.toUpperCase()}#`;
        }
    }
    
    return prefix;
};

module.exports = {
    // Main computation function
    computeGameQueryKeys,
    
    // Individual helpers
    getDayOfWeek,
    getBuyInBucket,
    getGameType,
    buildVenueScheduleKey,
    buildEntityQueryKey,
    buildVenueGameTypeKey,
    buildEntityGameTypeKey,
    
    // Utility functions
    shouldRecomputeQueryKeys,
    parseVenueScheduleKey,
    parseEntityQueryKey,
    buildVenueSchedulePrefix,
    buildEntityQueryPrefix,
    buildVenueGameTypePrefix,
    buildEntityGameTypePrefix,
    
    // Constants for reference
    DAYS_OF_WEEK,
    BUY_IN_BUCKETS,
    GAME_TYPES: ['REGULAR', 'SERIES', 'SATELLITE', 'STANDARD']
};