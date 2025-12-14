/**
 * recurring-resolver.js
 * Recurring game detection, matching, and creation logic
 * Adapted from existing recurring-game-resolution.js
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, PutCommand } = require('../utils/db-client');
const { DAYS_OF_WEEK, VALIDATION_THRESHOLDS } = require('../utils/constants');

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Get day of week from ISO date string
 */
const getDayOfWeek = (isoDate) => {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return null;
    return DAYS_OF_WEEK[d.getUTCDay()];
  } catch (error) {
    console.error('[RECURRING] Error getting day of week:', error);
    return null;
  }
};

/**
 * Get time as minutes from midnight
 */
const getTimeAsMinutes = (isoDate) => {
  if (!isoDate) return 0;
  const d = new Date(isoDate);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/**
 * Format time from ISO date
 */
const formatTimeFromISO = (isoDate) => {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Normalize game name for comparison
 */
const normalizeGameName = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)/gi, '')
    .replace(/\b(gtd|guaranteed)\b/gi, '')
    .replace(/\b(weekly|monthly|annual)\b/gi, '')
    .replace(/\b(rebuy|re-entry|freezeout|entry)\b.*$/gi, '')
    .replace(/^\$[0-9]+\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Generate display name for new recurring game
 */
const generateRecurringDisplayName = (rawName) => {
  const clean = normalizeGameName(rawName);
  return clean.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
};

/**
 * Build composite key for GSI (dayOfWeek#name)
 */
const buildDayOfWeekNameKey = (dayOfWeek, name) => {
  if (!dayOfWeek || !name) return null;
  return `${dayOfWeek}#${name}`;
};

/**
 * Inherit fields from recurring game template to game
 * 
 * This handles inheriting typicalGuarantee -> guaranteeAmount/hasGuarantee
 * and any other fields we want to carry over from the recurring template.
 * 
 * @param {Object} game - The game being enriched
 * @param {Object} recurringGame - The matched recurring game template
 * @param {Object} gameUpdates - Object to add inherited fields to
 * @returns {string[]} List of field names that were inherited
 */
const inheritFieldsFromTemplate = (game, recurringGame, gameUpdates) => {
  const inheritedFields = [];
  
  // Inherit guarantee if not set on the game but exists on recurring template
  if ((!game.guaranteeAmount || game.guaranteeAmount === 0) && recurringGame.typicalGuarantee) {
    gameUpdates.guaranteeAmount = recurringGame.typicalGuarantee;
    gameUpdates.hasGuarantee = true;
    inheritedFields.push('guaranteeAmount', 'hasGuarantee');
    console.log(`[RECURRING] Inheriting guarantee $${recurringGame.typicalGuarantee} from template "${recurringGame.name}"`);
  }
  
  // Future: Add other field inheritance here
  // Examples:
  // - typicalBuyIn -> buyIn (if missing)
  // - startTime validation/correction
  // - gameVariant confirmation
  
  return inheritedFields;
};

// ===================================================================
// SCORING LOGIC
// ===================================================================

/**
 * Calculate match score between game and recurring game candidate
 */
const calculateMatchScore = (gameInput, candidate) => {
  let score = 0;
  
  // Hard filters
  if (candidate.gameType && candidate.gameType !== gameInput.gameType) return 0;
  if (candidate.gameVariant && gameInput.gameVariant && candidate.gameVariant !== gameInput.gameVariant) return 0;
  
  const inputName = normalizeGameName(gameInput.name);
  const candidateName = normalizeGameName(candidate.name);
  
  // Name similarity (80 pts)
  if (inputName.includes(candidateName)) {
    score += 80;
  } else {
    const sim = stringSimilarity.compareTwoStrings(inputName, candidateName);
    score += (sim * 80);
  }
  
  // Buy-in proximity (20 pts)
  if (candidate.typicalBuyIn > 0 && gameInput.buyIn > 0) {
    const diff = Math.abs(candidate.typicalBuyIn - gameInput.buyIn);
    const pctDiff = diff / ((candidate.typicalBuyIn + gameInput.buyIn) / 2);
    
    if (pctDiff < 0.1) score += 20;
    else if (pctDiff < 0.25) score += 10;
  } else if (candidate.typicalBuyIn === 0 && gameInput.buyIn === 0) {
    score += 20;
  } else if (!candidate.typicalBuyIn) {
    score += 10;
  }
  
  // Time proximity (10 pts)
  if (candidate.startTime) {
    const [h, m] = candidate.startTime.split(':').map(Number);
    const candidateMinutes = h * 60 + m;
    const gameMinutes = getTimeAsMinutes(gameInput.gameStartDateTime);
    const diff = Math.abs(gameMinutes - candidateMinutes);
    
    if (diff <= 60) score += 10;
  }
  
  return score;
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Create a new recurring game
 */
const createRecurringGame = async (data) => {
  const client = getDocClient();
  const tableName = getTableName('RecurringGame');
  
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  const dayOfWeekNameKey = buildDayOfWeekNameKey(data.dayOfWeek, data.name);
  
  if (!dayOfWeekNameKey) {
    console.error('[RECURRING] Cannot create game without dayOfWeek or name');
    throw new Error('dayOfWeek and name are required');
  }
  
  const newGame = {
    id: uuidv4(),
    name: data.name,
    venueId: data.venueId,
    entityId: data.entityId,
    dayOfWeek: data.dayOfWeek,
    'dayOfWeek#name': dayOfWeekNameKey,
    frequency: 'WEEKLY',
    gameType: data.gameType || 'TOURNAMENT',
    gameVariant: data.gameVariant || 'NLHE',
    startTime: data.startTime || null,
    typicalBuyIn: parseFloat(data.typicalBuyIn) || 0,
    typicalGuarantee: parseFloat(data.typicalGuarantee) || 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    _version: 1,
    _lastChangedAt: timestamp,
    __typename: 'RecurringGame'
  };
  
  try {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: newGame
    }));
    console.log(`[RECURRING] Created new game: ${newGame.name} (${newGame.id})`);
    return newGame;
  } catch (error) {
    console.error('[RECURRING] Error creating game:', error);
    throw error;
  }
};

/**
 * Query recurring games by venue and day
 */
const getRecurringGamesByVenueAndDay = async (venueId, dayOfWeek) => {
  const client = getDocClient();
  const tableName = getTableName('RecurringGame');
  
  try {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byVenueRecurringGame',
      KeyConditionExpression: 'venueId = :vid AND begins_with(#sortKey, :dayPrefix)',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeNames: {
        '#sortKey': 'dayOfWeek#name'
      },
      ExpressionAttributeValues: {
        ':vid': venueId,
        ':dayPrefix': `${dayOfWeek}#`,
        ':active': true
      }
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[RECURRING] Error querying by venue and day:', error);
    return [];
  }
};

// ===================================================================
// MAIN RESOLVER
// ===================================================================

/**
 * Resolve recurring game assignment for a game
 * 
 * @param {Object} params
 * @param {Object} params.game - Game data
 * @param {string} params.entityId - Entity ID
 * @param {boolean} params.autoCreate - Whether to auto-create recurring games
 * @returns {Object} { gameUpdates, metadata }
 */
const resolveRecurringAssignment = async ({ game, entityId, autoCreate = false }) => {
  const venueId = game.venueId;
  
  // Validation
  if (!venueId) {
    console.log('[RECURRING] No venueId provided, skipping resolution');
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'NOT_RECURRING',
        confidence: 0,
        wasCreated: false,
        matchReason: 'no_venue'
      }
    };
  }
  
  if (!game.gameStartDateTime) {
    console.log('[RECURRING] No gameStartDateTime provided, skipping resolution');
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'NOT_RECURRING',
        confidence: 0,
        wasCreated: false,
        matchReason: 'no_date'
      }
    };
  }
  
  if (!game.gameVariant) {
    console.log('[RECURRING] No gameVariant provided, skipping resolution');
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'NOT_RECURRING',
        confidence: 0,
        wasCreated: false,
        matchReason: 'no_variant'
      }
    };
  }
  
  // Series games are typically not recurring
  if (game.isSeries) {
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'NOT_RECURRING',
        confidence: 0,
        wasCreated: false,
        matchReason: 'is_series'
      }
    };
  }
  
  const dayOfWeek = getDayOfWeek(game.gameStartDateTime);
  
  if (!dayOfWeek) {
    console.warn('[RECURRING] Could not determine day of week from:', game.gameStartDateTime);
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'FAILED',
        confidence: 0,
        wasCreated: false,
        matchReason: 'invalid_date'
      }
    };
  }
  
  try {
    // Query candidates
    const candidates = await getRecurringGamesByVenueAndDay(venueId, dayOfWeek);
    
    console.log(`[RECURRING] Found ${candidates.length} candidates for ${dayOfWeek} at venue ${venueId.substring(0, 8)}...`);
    
    // Score and match
    if (candidates.length > 0) {
      let bestMatch = null;
      let bestScore = -1;
      
      for (const candidate of candidates) {
        const score = calculateMatchScore(game, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }
      
      // High confidence match
      if (bestMatch && bestScore >= VALIDATION_THRESHOLDS.RECURRING_MATCH_THRESHOLD) {
        const gameUpdates = {
          recurringGameId: bestMatch.id,
          recurringGameAssignmentStatus: 'AUTO_ASSIGNED',
          recurringGameAssignmentConfidence: Math.min(bestScore / 100, 0.99)
        };
        
        // Inherit fields from template (including guarantee)
        const inheritedFields = inheritFieldsFromTemplate(game, bestMatch, gameUpdates);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence: Math.min(bestScore / 100, 0.99),
            matchedRecurringGameId: bestMatch.id,
            matchedRecurringGameName: bestMatch.name,
            wasCreated: false,
            inheritedFields,
            matchReason: 'score_match',
            templateGuarantee: bestMatch.typicalGuarantee || null
          }
        };
      }
      
      // Medium confidence - pending review
      // Still inherit guarantee since the match is likely correct
      if (bestMatch && bestScore >= 50) {
        const gameUpdates = {
          recurringGameId: bestMatch.id,
          recurringGameAssignmentStatus: 'PENDING_ASSIGNMENT',
          recurringGameAssignmentConfidence: bestScore / 100
        };
        
        // Inherit fields from template (including guarantee)
        // Even at medium confidence, we want the guarantee for financial calculations
        // The assignment may be pending review but the guarantee is still valuable data
        const inheritedFields = inheritFieldsFromTemplate(game, bestMatch, gameUpdates);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence: bestScore / 100,
            matchedRecurringGameId: bestMatch.id,
            matchedRecurringGameName: bestMatch.name,
            wasCreated: false,
            inheritedFields,
            matchReason: 'low_confidence_match',
            templateGuarantee: bestMatch.typicalGuarantee || null
          }
        };
      }
    }
    
    // Auto-create new recurring game
    if (autoCreate && game.name) {
      const displayName = generateRecurringDisplayName(game.name);
      
      if (displayName.length > 3) {
        try {
          const newGame = await createRecurringGame({
            name: displayName,
            venueId: venueId,
            entityId: entityId,
            dayOfWeek: dayOfWeek,
            gameType: game.gameType,
            gameVariant: game.gameVariant,
            typicalBuyIn: game.buyIn,
            typicalGuarantee: game.guaranteeAmount,
            startTime: formatTimeFromISO(game.gameStartDateTime)
          });
          
          return {
            gameUpdates: {
              recurringGameId: newGame.id,
              recurringGameAssignmentStatus: 'AUTO_ASSIGNED',
              recurringGameAssignmentConfidence: 0.9
            },
            metadata: {
              status: 'CREATED_NEW',
              confidence: 0.9,
              matchedRecurringGameId: newGame.id,
              matchedRecurringGameName: newGame.name,
              wasCreated: true,
              createdRecurringGameId: newGame.id,
              inheritedFields: [],
              matchReason: 'auto_created',
              templateGuarantee: newGame.typicalGuarantee || null
            }
          };
        } catch (err) {
          console.error('[RECURRING] Failed to auto-create:', err);
        }
      }
    }
    
    // No match found
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'NOT_RECURRING',
        confidence: 0,
        wasCreated: false,
        inheritedFields: [],
        matchReason: 'no_match'
      }
    };
    
  } catch (error) {
    console.error('[RECURRING] Resolution error:', error);
    return {
      gameUpdates: {
        recurringGameAssignmentStatus: 'NOT_RECURRING',
        recurringGameAssignmentConfidence: 0
      },
      metadata: {
        status: 'FAILED',
        confidence: 0,
        wasCreated: false,
        inheritedFields: [],
        matchReason: 'error'
      }
    };
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  resolveRecurringAssignment,
  normalizeGameName,
  calculateMatchScore,
  getDayOfWeek,
  inheritFieldsFromTemplate
};