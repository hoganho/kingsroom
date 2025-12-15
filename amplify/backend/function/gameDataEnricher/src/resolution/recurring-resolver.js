/**
 * recurring-resolver.js
 * ENHANCED: Better disambiguation for multiple games at same venue on same night
 * 
 * Recurring game detection, matching, and creation logic
 * Handles:
 * - Matching incoming games to existing recurring game templates
 * - Scoring with gameVariant, buyIn, time, and tournamentType
 * - Ambiguity detection when multiple candidates score similarly
 * - Field inheritance (guarantee, etc.) from templates
 * - Auto-creation of new recurring games
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, PutCommand } = require('../utils/db-client');
const { DAYS_OF_WEEK, VALIDATION_THRESHOLDS } = require('../utils/constants');

// ===================================================================
// CONSTANTS
// ===================================================================

const SCORING_WEIGHTS = {
  NAME_EXACT: 60,
  NAME_CONTAINS: 50,
  NAME_FUZZY_MAX: 60,
  VARIANT_MATCH: 15,
  BUYIN_EXACT: 25,
  BUYIN_CLOSE: 20,      // Within 5%
  BUYIN_NEAR: 10,       // Within 15%
  BUYIN_FAR: 5,         // Within 30%
  BUYIN_MISMATCH: -10,  // More than 30% different
  TIME_EXACT: 15,       // Within 15 minutes
  TIME_CLOSE: 12,       // Within 30 minutes
  TIME_NEAR: 8,         // Within 60 minutes
  TIME_FAR: 3,          // Within 120 minutes
  TIME_MISMATCH: -5,    // More than 120 minutes
  TOURNAMENT_TYPE_MATCH: 10,
  TOURNAMENT_TYPE_MISMATCH: -15,
  GUARANTEE_MISMATCH: -5,
};

const MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: VALIDATION_THRESHOLDS?.RECURRING_MATCH_THRESHOLD || 75,
  MEDIUM_CONFIDENCE: 50,
  AMBIGUITY_MARGIN: 10,  // If top 2 scores within this margin, flag as ambiguous
};

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
 * Get time as minutes from midnight (UTC)
 */
const getTimeAsMinutes = (isoDate) => {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return null;
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  } catch (error) {
    return null;
  }
};

/**
 * Format time from ISO date as HH:MM
 */
const formatTimeFromISO = (isoDate) => {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return null;
    const hours = d.getUTCHours().toString().padStart(2, '0');
    const minutes = d.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (error) {
    return null;
  }
};

/**
 * Parse time string (HH:MM) to minutes from midnight
 */
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

/**
 * Normalize game name for comparison
 * Strips buy-in amounts, guarantee text, tournament types, and special characters
 */
const normalizeGameName = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    // Remove dollar amounts with optional "k" and "gtd/guaranteed"
    .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)?/gi, '')
    // Remove standalone gtd/guaranteed
    .replace(/\b(gtd|guaranteed)\b/gi, '')
    // Remove frequency words
    .replace(/\b(weekly|monthly|annual|daily)\b/gi, '')
    // Remove tournament structure words at end
    .replace(/\b(rebuy|re-entry|freezeout|knockout|bounty|turbo|hyper|deepstack)\b.*$/gi, '')
    // Remove leading dollar amount
    .replace(/^\$[0-9]+\s+/, '')
    // Remove special characters except spaces
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Generate display name for new recurring game
 */
const generateRecurringDisplayName = (rawName) => {
  const clean = normalizeGameName(rawName);
  // Title case each word
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
  
  // Inherit buy-in if missing (less common but useful)
  if ((!game.buyIn || game.buyIn === 0) && recurringGame.typicalBuyIn) {
    gameUpdates.buyIn = recurringGame.typicalBuyIn;
    inheritedFields.push('buyIn');
    console.log(`[RECURRING] Inheriting buy-in $${recurringGame.typicalBuyIn} from template "${recurringGame.name}"`);
  }
  
  // Inherit game variant if missing
  if (!game.gameVariant && recurringGame.gameVariant) {
    gameUpdates.gameVariant = recurringGame.gameVariant;
    inheritedFields.push('gameVariant');
    console.log(`[RECURRING] Inheriting gameVariant ${recurringGame.gameVariant} from template "${recurringGame.name}"`);
  }
  
  return inheritedFields;
};

// ===================================================================
// SCORING LOGIC (ENHANCED)
// ===================================================================

/**
 * Calculate match score between game and recurring game candidate
 * 
 * ENHANCED: Better disambiguation for multiple games at same venue on same night
 * - gameVariant as hard filter + bonus
 * - Tighter buy-in windows with penalties
 * - Time proximity with stricter windows
 * - Tournament type matching
 * - Guarantee sanity check
 * 
 * @param {Object} gameInput - The incoming game to match
 * @param {Object} candidate - The recurring game candidate
 * @returns {Object} { score, bonuses, penalties, disqualified, reason }
 */
const calculateMatchScore = (gameInput, candidate) => {
  let score = 0;
  const bonuses = [];
  const penalties = [];
  
  // ==========================================
  // HARD FILTERS (instant disqualification)
  // ==========================================
  
  // Game type must match (TOURNAMENT vs CASH_GAME)
  if (candidate.gameType && gameInput.gameType && candidate.gameType !== gameInput.gameType) {
    return {
      score: 0,
      bonuses: [],
      penalties: [],
      disqualified: true,
      reason: 'gameType_mismatch'
    };
  }
  
  // Game variant MUST match if both are specified
  // This is critical for venues with multiple games (PLO vs NLHE on same night)
  if (candidate.gameVariant && gameInput.gameVariant) {
    if (candidate.gameVariant !== gameInput.gameVariant) {
      return {
        score: 0,
        bonuses: [],
        penalties: [],
        disqualified: true,
        reason: 'gameVariant_mismatch'
      };
    }
    // Exact variant match is a strong signal
    score += SCORING_WEIGHTS.VARIANT_MATCH;
    bonuses.push(`variant_match:+${SCORING_WEIGHTS.VARIANT_MATCH}`);
  }
  
  // ==========================================
  // NAME SIMILARITY (0-60 points)
  // ==========================================
  
  const inputName = normalizeGameName(gameInput.name);
  const candidateName = normalizeGameName(candidate.name);
  
  if (inputName && candidateName) {
    // Check for exact or contains match first
    if (inputName === candidateName) {
      score += SCORING_WEIGHTS.NAME_EXACT;
      bonuses.push(`name_exact:+${SCORING_WEIGHTS.NAME_EXACT}`);
    } else if (inputName.includes(candidateName) || candidateName.includes(inputName)) {
      score += SCORING_WEIGHTS.NAME_CONTAINS;
      bonuses.push(`name_contains:+${SCORING_WEIGHTS.NAME_CONTAINS}`);
    } else {
      // Fuzzy match using string-similarity
      const sim = stringSimilarity.compareTwoStrings(inputName, candidateName);
      const nameScore = Math.round(sim * SCORING_WEIGHTS.NAME_FUZZY_MAX);
      score += nameScore;
      bonuses.push(`name_fuzzy(${(sim * 100).toFixed(0)}%):+${nameScore}`);
    }
  }
  
  // ==========================================
  // BUY-IN MATCH (with penalties for mismatch)
  // ==========================================
  
  const candidateBuyIn = candidate.typicalBuyIn || 0;
  const gameBuyIn = gameInput.buyIn || 0;
  
  if (candidateBuyIn > 0 && gameBuyIn > 0) {
    const diff = Math.abs(candidateBuyIn - gameBuyIn);
    const avgBuyIn = (candidateBuyIn + gameBuyIn) / 2;
    const pctDiff = diff / avgBuyIn;
    
    if (diff === 0) {
      // Exact match - strongest signal for disambiguation
      score += SCORING_WEIGHTS.BUYIN_EXACT;
      bonuses.push(`buyIn_exact:+${SCORING_WEIGHTS.BUYIN_EXACT}`);
    } else if (pctDiff < 0.05) {
      // Within 5% (e.g., $50 vs $52)
      score += SCORING_WEIGHTS.BUYIN_CLOSE;
      bonuses.push(`buyIn_close(<5%):+${SCORING_WEIGHTS.BUYIN_CLOSE}`);
    } else if (pctDiff < 0.15) {
      // Within 15%
      score += SCORING_WEIGHTS.BUYIN_NEAR;
      bonuses.push(`buyIn_near(<15%):+${SCORING_WEIGHTS.BUYIN_NEAR}`);
    } else if (pctDiff < 0.30) {
      // Within 30% - marginal match
      score += SCORING_WEIGHTS.BUYIN_FAR;
      bonuses.push(`buyIn_far(<30%):+${SCORING_WEIGHTS.BUYIN_FAR}`);
    } else {
      // Different buy-in level - strong signal this is wrong match
      score += SCORING_WEIGHTS.BUYIN_MISMATCH; // negative
      penalties.push(`buyIn_mismatch(${(pctDiff * 100).toFixed(0)}%):${SCORING_WEIGHTS.BUYIN_MISMATCH}`);
    }
  } else if (candidateBuyIn === 0 && gameBuyIn === 0) {
    // Both zero/null - neutral, slight bonus
    score += 5;
    bonuses.push('buyIn_both_zero:+5');
  } else if (candidateBuyIn === 0) {
    // Template has no buy-in set - can't use for matching
    // No bonus or penalty
  }
  
  // ==========================================
  // TIME PROXIMITY (with penalties for mismatch)
  // ==========================================
  
  const candidateMinutes = parseTimeToMinutes(candidate.startTime);
  const gameMinutes = getTimeAsMinutes(gameInput.gameStartDateTime);
  
  if (candidateMinutes !== null && gameMinutes !== null) {
    const diffMinutes = Math.abs(gameMinutes - candidateMinutes);
    
    if (diffMinutes <= 15) {
      // Within 15 minutes - very likely same game
      score += SCORING_WEIGHTS.TIME_EXACT;
      bonuses.push(`time_exact(${diffMinutes}min):+${SCORING_WEIGHTS.TIME_EXACT}`);
    } else if (diffMinutes <= 30) {
      // Within 30 minutes
      score += SCORING_WEIGHTS.TIME_CLOSE;
      bonuses.push(`time_close(${diffMinutes}min):+${SCORING_WEIGHTS.TIME_CLOSE}`);
    } else if (diffMinutes <= 60) {
      // Within 1 hour
      score += SCORING_WEIGHTS.TIME_NEAR;
      bonuses.push(`time_near(${diffMinutes}min):+${SCORING_WEIGHTS.TIME_NEAR}`);
    } else if (diffMinutes <= 120) {
      // Within 2 hours - could be different game
      score += SCORING_WEIGHTS.TIME_FAR;
      bonuses.push(`time_far(${diffMinutes}min):+${SCORING_WEIGHTS.TIME_FAR}`);
    } else {
      // More than 2 hours apart - likely different game
      score += SCORING_WEIGHTS.TIME_MISMATCH; // negative
      penalties.push(`time_mismatch(${diffMinutes}min):${SCORING_WEIGHTS.TIME_MISMATCH}`);
    }
  }
  
  // ==========================================
  // TOURNAMENT TYPE BONUS/PENALTY
  // ==========================================
  
  if (candidate.tournamentType && gameInput.tournamentType) {
    if (candidate.tournamentType === gameInput.tournamentType) {
      score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH;
      bonuses.push(`tournamentType_match:+${SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH}`);
    } else {
      // Different tournament types (REBUY vs FREEZEOUT) - penalty
      score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH; // negative
      penalties.push(`tournamentType_mismatch:${SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH}`);
    }
  }
  
  // ==========================================
  // GUARANTEE SANITY CHECK
  // ==========================================
  
  const candidateGtd = candidate.typicalGuarantee || 0;
  const gameGtd = gameInput.guaranteeAmount || 0;
  
  if (candidateGtd > 0 && gameGtd > 0) {
    const gtdDiff = Math.abs(candidateGtd - gameGtd);
    const gtdAvg = (candidateGtd + gameGtd) / 2;
    const gtdPct = gtdDiff / gtdAvg;
    
    if (gtdPct > 0.5) {
      // More than 50% difference in guarantee - suspicious
      score += SCORING_WEIGHTS.GUARANTEE_MISMATCH; // negative
      penalties.push(`guarantee_mismatch(${(gtdPct * 100).toFixed(0)}%):${SCORING_WEIGHTS.GUARANTEE_MISMATCH}`);
    }
  }
  
  // Ensure score is not negative
  score = Math.max(0, score);
  
  return {
    score,
    bonuses,
    penalties,
    disqualified: false,
    reason: score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE ? 'high_confidence' 
          : score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE ? 'medium_confidence' 
          : 'low_confidence'
  };
};

/**
 * Find best match among candidates with ambiguity detection
 * 
 * @param {Object} gameInput - The incoming game
 * @param {Array} candidates - Array of recurring game candidates
 * @returns {Object} { match, score, isAmbiguous, metadata }
 */
const findBestMatch = (gameInput, candidates) => {
  if (!candidates || candidates.length === 0) {
    return {
      match: null,
      score: 0,
      isAmbiguous: false,
      metadata: {
        reason: 'no_candidates',
        candidatesScored: 0,
        topScores: []
      }
    };
  }
  
  // Score all candidates
  const scoredCandidates = candidates.map(candidate => {
    const result = calculateMatchScore(gameInput, candidate);
    return {
      candidate,
      ...result
    };
  });
  
  // Filter out disqualified candidates
  const qualifiedCandidates = scoredCandidates.filter(c => !c.disqualified);
  
  if (qualifiedCandidates.length === 0) {
    // All candidates were disqualified
    const disqualifyReasons = scoredCandidates.map(c => ({
      name: c.candidate.name,
      reason: c.reason
    }));
    
    return {
      match: null,
      score: 0,
      isAmbiguous: false,
      metadata: {
        reason: 'all_disqualified',
        disqualifyReasons,
        candidatesScored: scoredCandidates.length,
        topScores: []
      }
    };
  }
  
  // Sort by score descending
  qualifiedCandidates.sort((a, b) => b.score - a.score);
  
  const best = qualifiedCandidates[0];
  const secondBest = qualifiedCandidates[1];
  
  // Check for ambiguity - if top 2 scores are very close, flag it
  const isAmbiguous = secondBest && 
    (best.score - secondBest.score) < MATCH_THRESHOLDS.AMBIGUITY_MARGIN && 
    best.score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE;
  
  if (isAmbiguous) {
    console.warn(`[RECURRING] ⚠️ AMBIGUOUS MATCH! Top 2 candidates within ${MATCH_THRESHOLDS.AMBIGUITY_MARGIN} points:`, {
      game: gameInput.name,
      first: { 
        name: best.candidate.name, 
        score: best.score,
        buyIn: best.candidate.typicalBuyIn,
        time: best.candidate.startTime
      },
      second: { 
        name: secondBest.candidate.name, 
        score: secondBest.score,
        buyIn: secondBest.candidate.typicalBuyIn,
        time: secondBest.candidate.startTime
      }
    });
  }
  
  // Log detailed scoring
  console.log(`[RECURRING] Match scoring for "${gameInput.name}":`, {
    bestMatch: best.candidate.name,
    bestScore: best.score,
    bonuses: best.bonuses.join(', '),
    penalties: best.penalties.join(', ') || 'none',
    isAmbiguous,
    candidatesScored: qualifiedCandidates.length
  });
  
  // Build top scores for metadata
  const topScores = qualifiedCandidates.slice(0, 5).map(c => ({
    id: c.candidate.id,
    name: c.candidate.name,
    score: c.score,
    buyIn: c.candidate.typicalBuyIn,
    time: c.candidate.startTime,
    bonuses: c.bonuses,
    penalties: c.penalties
  }));
  
  return {
    match: best.score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE ? best.candidate : null,
    score: best.score,
    isAmbiguous,
    scoringDetails: {
      bonuses: best.bonuses,
      penalties: best.penalties
    },
    metadata: {
      reason: best.reason,
      candidatesScored: qualifiedCandidates.length,
      disqualifiedCount: scoredCandidates.length - qualifiedCandidates.length,
      topScores
    }
  };
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
    frequency: data.frequency || 'WEEKLY',
    gameType: data.gameType || 'TOURNAMENT',
    gameVariant: data.gameVariant || 'NLHE',
    tournamentType: data.tournamentType || null,
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
    console.log(`[RECURRING] ✅ Created new recurring game: "${newGame.name}" (${newGame.id})`);
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
    
    const items = result.Items || [];
    console.log(`[RECURRING] Found ${items.length} candidate(s) for ${dayOfWeek} at venue ${venueId.substring(0, 8)}...`);
    
    return items;
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
 * ENHANCED: Uses improved scoring with ambiguity detection
 * 
 * @param {Object} params
 * @param {Object} params.game - Game data
 * @param {string} params.entityId - Entity ID
 * @param {boolean} params.autoCreate - Whether to auto-create recurring games
 * @returns {Object} { gameUpdates, metadata }
 */
const resolveRecurringAssignment = async ({ game, entityId, autoCreate = false }) => {
  const venueId = game.venueId;
  
  console.log(`[RECURRING] Resolving assignment for: "${game.name}"`);
  
  // ==========================================
  // VALIDATION
  // ==========================================
  
  if (!venueId) {
    console.log('[RECURRING] ⏭️ Skipping: No venueId provided');
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
    console.log('[RECURRING] ⏭️ Skipping: No gameStartDateTime provided');
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
    console.log('[RECURRING] ⏭️ Skipping: No gameVariant provided');
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
    console.log('[RECURRING] ⏭️ Skipping: Game is part of a series');
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
    console.warn('[RECURRING] ⚠️ Could not determine day of week from:', game.gameStartDateTime);
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
  
  // ==========================================
  // QUERY AND MATCH
  // ==========================================
  
  try {
    // Query candidates
    const candidates = await getRecurringGamesByVenueAndDay(venueId, dayOfWeek);
    
    // Find best match using enhanced scoring
    if (candidates.length > 0) {
      const matchResult = findBestMatch(game, candidates);
      
      // High confidence match
      if (matchResult.match && matchResult.score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
        const confidence = Math.min(matchResult.score / 100, 0.99);
        
        const gameUpdates = {
          recurringGameId: matchResult.match.id,
          recurringGameAssignmentStatus: matchResult.isAmbiguous ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED',
          recurringGameAssignmentConfidence: confidence
        };
        
        // Inherit fields from template (including guarantee)
        const inheritedFields = inheritFieldsFromTemplate(game, matchResult.match, gameUpdates);
        
        console.log(`[RECURRING] ✅ High confidence match: "${matchResult.match.name}" (score: ${matchResult.score})`);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence,
            matchedRecurringGameId: matchResult.match.id,
            matchedRecurringGameName: matchResult.match.name,
            wasCreated: false,
            inheritedFields,
            matchReason: matchResult.isAmbiguous ? 'high_score_ambiguous' : 'score_match',
            isAmbiguous: matchResult.isAmbiguous,
            templateGuarantee: matchResult.match.typicalGuarantee || null,
            scoringDetails: matchResult.scoringDetails,
            topCandidates: matchResult.metadata.topScores
          }
        };
      }
      
      // Medium confidence - pending review
      if (matchResult.match && matchResult.score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE) {
        const confidence = matchResult.score / 100;
        
        const gameUpdates = {
          recurringGameId: matchResult.match.id,
          recurringGameAssignmentStatus: 'PENDING_ASSIGNMENT',
          recurringGameAssignmentConfidence: confidence
        };
        
        // Inherit fields from template even at medium confidence
        const inheritedFields = inheritFieldsFromTemplate(game, matchResult.match, gameUpdates);
        
        console.log(`[RECURRING] ⚠️ Medium confidence match: "${matchResult.match.name}" (score: ${matchResult.score})`);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence,
            matchedRecurringGameId: matchResult.match.id,
            matchedRecurringGameName: matchResult.match.name,
            wasCreated: false,
            inheritedFields,
            matchReason: 'low_confidence_match',
            isAmbiguous: matchResult.isAmbiguous,
            templateGuarantee: matchResult.match.typicalGuarantee || null,
            scoringDetails: matchResult.scoringDetails,
            topCandidates: matchResult.metadata.topScores
          }
        };
      }
      
      // No match above threshold
      console.log(`[RECURRING] ❌ No match above threshold (best score: ${matchResult.score})`);
    }
    
    // ==========================================
    // AUTO-CREATE NEW RECURRING GAME
    // ==========================================
    
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
            tournamentType: game.tournamentType,
            typicalBuyIn: game.buyIn,
            typicalGuarantee: game.guaranteeAmount,
            startTime: formatTimeFromISO(game.gameStartDateTime)
          });
          
          console.log(`[RECURRING] ✅ Auto-created new recurring game: "${newGame.name}"`);
          
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
          console.error('[RECURRING] Failed to auto-create recurring game:', err);
        }
      }
    }
    
    // ==========================================
    // NO MATCH FOUND
    // ==========================================
    
    console.log(`[RECURRING] ⏭️ No recurring game match for "${game.name}"`);
    
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
        matchReason: candidates.length > 0 ? 'no_match_above_threshold' : 'no_candidates'
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
        matchReason: 'error',
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
  
  // Scoring functions (exported for testing)
  calculateMatchScore,
  findBestMatch,
  
  // Helpers
  normalizeGameName,
  getDayOfWeek,
  getTimeAsMinutes,
  formatTimeFromISO,
  inheritFieldsFromTemplate,
  
  // Database operations
  createRecurringGame,
  getRecurringGamesByVenueAndDay,
  
  // Constants (for external configuration)
  SCORING_WEIGHTS,
  MATCH_THRESHOLDS
};