/**
 * query-keys.js
 * Query optimization key computation for games
 * Adapted from existing game-query-keys.js
 */

const { DAYS_OF_WEEK, BUY_IN_BUCKETS } = require('../utils/constants');

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

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
  
  return '1001-PLUS';
};

/**
 * Determine the game classification type based on boolean flags
 * Priority order: SERIES > SATELLITE > REGULAR > STANDARD
 * 
 * @param {boolean} isRegular 
 * @param {boolean} isSeries 
 * @param {boolean} isSatellite 
 * @returns {string} Game type: REGULAR, SERIES, SATELLITE, or STANDARD
 */
const getGameClassificationType = (isRegular, isSeries, isSatellite) => {
  // Series takes priority
  if (isSeries) return 'SERIES';
  if (isSatellite) return 'SATELLITE';
  if (isRegular) return 'REGULAR';
  return 'STANDARD';
};

// ===================================================================
// COMPOSITE KEY BUILDERS
// ===================================================================

/**
 * Build venue schedule key for venue + day + variant queries
 * Format: {venueId}#{dayOfWeek}#{variant}
 */
const buildVenueScheduleKey = (venueId, dayOfWeek, gameVariant) => {
  if (!venueId || !dayOfWeek || !gameVariant) return null;
  const variant = (gameVariant || 'NLHE').toUpperCase();
  return `${venueId}#${dayOfWeek}#${variant}`;
};

/**
 * Build entity query key for cross-venue queries within an entity
 * Format: {entityId}#{dayOfWeek}#{variant}#{buyInBucket}
 */
const buildEntityQueryKey = (entityId, dayOfWeek, gameVariant, buyInBucket) => {
  if (!entityId || !dayOfWeek || !gameVariant || !buyInBucket) return null;
  const variant = (gameVariant || 'NLHE').toUpperCase();
  return `${entityId}#${dayOfWeek}#${variant}#${buyInBucket}`;
};

/**
 * Build venue game type key for venue + game type queries
 * Format: {venueId}#{gameType}#{dayOfWeek}#{variant}
 */
const buildVenueGameTypeKey = (venueId, gameType, dayOfWeek, variant) => {
  if (!venueId || !gameType) return null;
  const day = dayOfWeek || 'UNKNOWN';
  const v = variant || 'NLHE';
  return `${venueId}#${gameType}#${day}#${v}`;
};

/**
 * Build entity game type key for entity-wide + game type queries
 * Format: {entityId}#{gameType}#{dayOfWeek}#{variant}#{buyInBucket}
 */
const buildEntityGameTypeKey = (entityId, gameType, dayOfWeek, variant, buyInBucket) => {
  if (!entityId || !gameType) return null;
  const day = dayOfWeek || 'UNKNOWN';
  const v = variant || 'NLHE';
  const bucket = buyInBucket || '0000-0025';
  return `${entityId}#${gameType}#${day}#${v}#${bucket}`;
};

// ===================================================================
// MAIN COMPUTATION FUNCTION
// ===================================================================

/**
 * Compute all query optimization keys for a game
 * 
 * @param {Object} gameData - Game data object
 * @param {string} entityId - Entity ID
 * @returns {Object} Computed query keys
 */
const computeQueryKeys = (gameData, entityId) => {
  const {
    gameStartDateTime,
    buyIn,
    gameVariant,
    venueId,
    isRegular,
    isSeries,
    isSatellite
  } = gameData;
  
  // Compute individual components
  const gameDayOfWeek = getDayOfWeek(gameStartDateTime);
  const buyInBucket = getBuyInBucket(buyIn);
  const variant = (gameVariant || 'NLHE').toUpperCase();
  
  // Determine game classification type
  const gameClassificationType = getGameClassificationType(isRegular, isSeries, isSatellite);
  
  // Build composite keys
  const venueScheduleKey = buildVenueScheduleKey(venueId, gameDayOfWeek, variant);
  const entityQueryKey = buildEntityQueryKey(entityId, gameDayOfWeek, variant, buyInBucket);
  const venueGameTypeKey = buildVenueGameTypeKey(venueId, gameClassificationType, gameDayOfWeek, variant);
  const entityGameTypeKey = buildEntityGameTypeKey(entityId, gameClassificationType, gameDayOfWeek, variant, buyInBucket);
  
  return {
    gameDayOfWeek,
    buyInBucket,
    venueScheduleKey,
    entityQueryKey,
    venueGameTypeKey,
    entityGameTypeKey
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  computeQueryKeys,
  getDayOfWeek,
  getBuyInBucket,
  getGameClassificationType,
  buildVenueScheduleKey,
  buildEntityQueryKey,
  buildVenueGameTypeKey,
  buildEntityGameTypeKey
};
