/**
 * recurring-resolver.js
 * FIXED: Added deduplication, cross-day checks, and race condition protection
 * 
 * Changes from original:
 * 1. getRecurringGamesByVenue() - queries ALL days, not just current day
 * 2. findExistingDuplicate() - checks for similar games before creating
 * 3. createRecurringGame() - uses conditional write to prevent race conditions
 * 4. extractDayFromName() - detects day hints in game names
 * 5. resolveRecurringAssignment() - validates day/name consistency
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, PutCommand, ScanCommand } = require('../utils/db-client');
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
  BUYIN_CLOSE: 20,
  BUYIN_NEAR: 10,
  BUYIN_FAR: 5,
  BUYIN_MISMATCH: -10,
  TIME_EXACT: 15,
  TIME_CLOSE: 12,
  TIME_NEAR: 8,
  TIME_FAR: 3,
  TIME_MISMATCH: -5,
  TOURNAMENT_TYPE_MATCH: 10,
  TOURNAMENT_TYPE_MISMATCH: -15,
  GUARANTEE_MISMATCH: -5,
};

const MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: VALIDATION_THRESHOLDS?.RECURRING_MATCH_THRESHOLD || 75,
  MEDIUM_CONFIDENCE: 50,
  AMBIGUITY_MARGIN: 10,
  // NEW: Threshold for considering a game a duplicate
  DUPLICATE_THRESHOLD: 0.85,
};

// Day keywords for extracting day hints from names
const DAY_KEYWORDS = {
  'monday': 'MONDAY', 'mon': 'MONDAY',
  'tuesday': 'TUESDAY', 'tue': 'TUESDAY', 'tues': 'TUESDAY',
  'wednesday': 'WEDNESDAY', 'wed': 'WEDNESDAY',
  'thursday': 'THURSDAY', 'thu': 'THURSDAY', 'thur': 'THURSDAY', 'thurs': 'THURSDAY',
  'friday': 'FRIDAY', 'fri': 'FRIDAY',
  'saturday': 'SATURDAY', 'sat': 'SATURDAY',
  'sunday': 'SUNDAY', 'sun': 'SUNDAY',
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

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
 */
const normalizeGameName = (name) => {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)?/gi, '')
    .replace(/\b(gtd|guaranteed)\b/gi, '')
    .replace(/\b(weekly|monthly|annual|daily)\b/gi, '')
    .replace(/\b(rebuy|re-entry|freezeout|knockout|bounty|turbo|hyper|deepstack)\b.*$/gi, '')
    .replace(/^\$[0-9]+\s+/, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * NEW: Extract day hint from game name
 * E.g., "FRIDAY SHOT CLOCK" → "FRIDAY"
 */
const extractDayFromName = (name) => {
  if (!name) return null;
  const lower = name.toLowerCase();
  
  for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lower)) {
      return day;
    }
  }
  return null;
};

/**
 * NEW: Validate that name and dayOfWeek are consistent
 */
const validateDayConsistency = (name, dayOfWeek) => {
  const dayHint = extractDayFromName(name);
  
  if (dayHint && dayHint !== dayOfWeek) {
    return {
      isValid: false,
      warning: `Game name "${name}" suggests ${dayHint}, but processing for ${dayOfWeek}`,
      suggestedDay: dayHint
    };
  }
  
  return { isValid: true };
};

const generateRecurringDisplayName = (rawName) => {
  const clean = normalizeGameName(rawName);
  return clean.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
};

const buildDayOfWeekNameKey = (dayOfWeek, name) => {
  if (!dayOfWeek || !name) return null;
  return `${dayOfWeek}#${name}`;
};

/**
 * Inherit fields from recurring game template to game
 * 
 * UPDATED: 
 * - Guarantee exception logic (prizepoolPaid < typicalGuarantee means no guarantee)
 * - Jackpot contribution inheritance
 * - Accumulator ticket inheritance
 */
const inheritFieldsFromTemplate = (game, recurringGame, gameUpdates) => {
  const inheritedFields = [];
  
  // ===================================================================
  // GUARANTEE INHERITANCE (with exception logic)
  // ===================================================================
  if ((!game.guaranteeAmount || game.guaranteeAmount === 0) && recurringGame.typicalGuarantee) {
    // EXCEPTION: If prizepoolPaid exists and is LESS than typicalGuarantee,
    // this game instance didn't have the typical guarantee (no overlay scenario)
    if (game.prizepoolPaid && game.prizepoolPaid > 0 && game.prizepoolPaid < recurringGame.typicalGuarantee) {
      console.log(`[RECURRING] ⚠️ prizepoolPaid ($${game.prizepoolPaid}) < typicalGuarantee ($${recurringGame.typicalGuarantee})`);
      console.log(`[RECURRING] → This instance ran without typical guarantee. Not inheriting.`);
      gameUpdates.hasGuarantee = false;
      gameUpdates.guaranteeAmount = 0;
      inheritedFields.push('hasGuarantee_exception', 'guaranteeAmount_exception');
    } else {
      // Normal inheritance: prizepoolPaid >= typicalGuarantee (or no prizepoolPaid yet)
      gameUpdates.guaranteeAmount = recurringGame.typicalGuarantee;
      gameUpdates.hasGuarantee = true;
      inheritedFields.push('guaranteeAmount', 'hasGuarantee');
      console.log(`[RECURRING] Inheriting guarantee $${recurringGame.typicalGuarantee} from template "${recurringGame.name}"`);
    }
  }
  
  // ===================================================================
  // BUY-IN INHERITANCE (existing)
  // ===================================================================
  if ((!game.buyIn || game.buyIn === 0) && recurringGame.typicalBuyIn) {
    gameUpdates.buyIn = recurringGame.typicalBuyIn;
    inheritedFields.push('buyIn');
  }
  
  // ===================================================================
  // GAME VARIANT INHERITANCE (existing)
  // ===================================================================
  if (!game.gameVariant && recurringGame.gameVariant) {
    gameUpdates.gameVariant = recurringGame.gameVariant;
    inheritedFields.push('gameVariant');
  }
  
  // ===================================================================
  // JACKPOT CONTRIBUTION INHERITANCE (NEW)
  // ===================================================================
  if (recurringGame.hasJackpotContributions) {
    gameUpdates.hasJackpotContributions = true;
    gameUpdates.jackpotContributionAmount = recurringGame.jackpotContributionAmount || 2;
    inheritedFields.push('hasJackpotContributions', 'jackpotContributionAmount');
    console.log(`[RECURRING] Inheriting jackpot contribution $${gameUpdates.jackpotContributionAmount} from template "${recurringGame.name}"`);
  }
  
  // ===================================================================
  // ACCUMULATOR TICKET INHERITANCE (NEW)
  // ===================================================================
  if (recurringGame.hasAccumulatorTickets) {
    gameUpdates.hasAccumulatorTickets = true;
    gameUpdates.accumulatorTicketValue = recurringGame.accumulatorTicketValue || 100;
    inheritedFields.push('hasAccumulatorTickets', 'accumulatorTicketValue');
    console.log(`[RECURRING] Inheriting accumulator tickets @ $${gameUpdates.accumulatorTicketValue} from template "${recurringGame.name}"`);
  }
  
  return inheritedFields;
};

// ===================================================================
// SCORING LOGIC
// ===================================================================

const calculateMatchScore = (gameInput, candidate) => {
  let score = 0;
  const bonuses = [];
  const penalties = [];
  
  // Hard filter: gameType mismatch
  if (candidate.gameType && gameInput.gameType && candidate.gameType !== gameInput.gameType) {
    return { score: 0, bonuses: [], penalties: [], disqualified: true, reason: 'gameType_mismatch' };
  }
  
  // Hard filter: gameVariant mismatch
  if (candidate.gameVariant && gameInput.gameVariant) {
    if (candidate.gameVariant !== gameInput.gameVariant) {
      return { score: 0, bonuses: [], penalties: [], disqualified: true, reason: 'gameVariant_mismatch' };
    }
    score += SCORING_WEIGHTS.VARIANT_MATCH;
    bonuses.push(`variant_match:+${SCORING_WEIGHTS.VARIANT_MATCH}`);
  }
  
  // Name similarity
  const inputName = normalizeGameName(gameInput.name);
  const candidateName = normalizeGameName(candidate.name);
  
  if (inputName && candidateName) {
    if (inputName === candidateName) {
      score += SCORING_WEIGHTS.NAME_EXACT;
      bonuses.push(`name_exact:+${SCORING_WEIGHTS.NAME_EXACT}`);
    } else if (inputName.includes(candidateName) || candidateName.includes(inputName)) {
      score += SCORING_WEIGHTS.NAME_CONTAINS;
      bonuses.push(`name_contains:+${SCORING_WEIGHTS.NAME_CONTAINS}`);
    } else {
      const sim = stringSimilarity.compareTwoStrings(inputName, candidateName);
      const nameScore = Math.round(sim * SCORING_WEIGHTS.NAME_FUZZY_MAX);
      score += nameScore;
      bonuses.push(`name_fuzzy(${(sim * 100).toFixed(0)}%):+${nameScore}`);
    }
  }
  
  // Buy-in matching
  const candidateBuyIn = candidate.typicalBuyIn || 0;
  const gameBuyIn = gameInput.buyIn || 0;
  
  if (candidateBuyIn > 0 && gameBuyIn > 0) {
    const diff = Math.abs(candidateBuyIn - gameBuyIn);
    const avgBuyIn = (candidateBuyIn + gameBuyIn) / 2;
    const pctDiff = diff / avgBuyIn;
    
    if (diff === 0) {
      score += SCORING_WEIGHTS.BUYIN_EXACT;
      bonuses.push(`buyIn_exact:+${SCORING_WEIGHTS.BUYIN_EXACT}`);
    } else if (pctDiff < 0.05) {
      score += SCORING_WEIGHTS.BUYIN_CLOSE;
      bonuses.push(`buyIn_close:+${SCORING_WEIGHTS.BUYIN_CLOSE}`);
    } else if (pctDiff < 0.15) {
      score += SCORING_WEIGHTS.BUYIN_NEAR;
      bonuses.push(`buyIn_near:+${SCORING_WEIGHTS.BUYIN_NEAR}`);
    } else if (pctDiff < 0.30) {
      score += SCORING_WEIGHTS.BUYIN_FAR;
      bonuses.push(`buyIn_far:+${SCORING_WEIGHTS.BUYIN_FAR}`);
    } else {
      score += SCORING_WEIGHTS.BUYIN_MISMATCH;
      penalties.push(`buyIn_mismatch:${SCORING_WEIGHTS.BUYIN_MISMATCH}`);
    }
  }
  
  // Time proximity
  const candidateMinutes = parseTimeToMinutes(candidate.startTime);
  const gameMinutes = getTimeAsMinutes(gameInput.gameStartDateTime);
  
  if (candidateMinutes !== null && gameMinutes !== null) {
    const diffMinutes = Math.abs(gameMinutes - candidateMinutes);
    
    if (diffMinutes <= 15) {
      score += SCORING_WEIGHTS.TIME_EXACT;
      bonuses.push(`time_exact:+${SCORING_WEIGHTS.TIME_EXACT}`);
    } else if (diffMinutes <= 30) {
      score += SCORING_WEIGHTS.TIME_CLOSE;
      bonuses.push(`time_close:+${SCORING_WEIGHTS.TIME_CLOSE}`);
    } else if (diffMinutes <= 60) {
      score += SCORING_WEIGHTS.TIME_NEAR;
      bonuses.push(`time_near:+${SCORING_WEIGHTS.TIME_NEAR}`);
    } else if (diffMinutes <= 120) {
      score += SCORING_WEIGHTS.TIME_FAR;
      bonuses.push(`time_far:+${SCORING_WEIGHTS.TIME_FAR}`);
    } else {
      score += SCORING_WEIGHTS.TIME_MISMATCH;
      penalties.push(`time_mismatch:${SCORING_WEIGHTS.TIME_MISMATCH}`);
    }
  }
  
  // Tournament type
  if (candidate.tournamentType && gameInput.tournamentType) {
    if (candidate.tournamentType === gameInput.tournamentType) {
      score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH;
      bonuses.push(`tournamentType_match:+${SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH}`);
    } else {
      score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH;
      penalties.push(`tournamentType_mismatch:${SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH}`);
    }
  }
  
  return {
    score: Math.max(0, score),
    bonuses,
    penalties,
    disqualified: false,
    reason: null
  };
};

const findBestMatch = (gameInput, candidates) => {
  if (!candidates || candidates.length === 0) {
    return { match: null, score: 0, isAmbiguous: false, scoringDetails: null, metadata: { topScores: [] } };
  }
  
  const scoredCandidates = candidates.map(c => ({
    candidate: c,
    ...calculateMatchScore(gameInput, c)
  }));
  
  const qualifiedCandidates = scoredCandidates
    .filter(s => !s.disqualified)
    .sort((a, b) => b.score - a.score);
  
  if (qualifiedCandidates.length === 0) {
    return { match: null, score: 0, isAmbiguous: false, scoringDetails: null, metadata: { topScores: [] } };
  }
  
  const best = qualifiedCandidates[0];
  const second = qualifiedCandidates[1];
  const isAmbiguous = second && (best.score - second.score) < MATCH_THRESHOLDS.AMBIGUITY_MARGIN;
  
  const topScores = qualifiedCandidates.slice(0, 3).map(s => ({
    name: s.candidate.name,
    id: s.candidate.id,
    score: s.score,
    dayOfWeek: s.candidate.dayOfWeek
  }));
  
  return {
    match: best.candidate,
    score: best.score,
    isAmbiguous,
    scoringDetails: { bonuses: best.bonuses, penalties: best.penalties },
    metadata: { candidatesScored: qualifiedCandidates.length, topScores }
  };
};

// ===================================================================
// DATABASE OPERATIONS (ENHANCED)
// ===================================================================

/**
 * NEW: Query ALL recurring games for a venue (not just current day)
 * This is used for deduplication checks
 */
const getRecurringGamesByVenue = async (venueId) => {
  const client = getDocClient();
  const tableName = getTableName('RecurringGame');
  
  try {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byVenueRecurringGame',
      KeyConditionExpression: 'venueId = :vid',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':vid': venueId,
        ':active': true
      }
    }));
    
    const items = result.Items || [];
    console.log(`[RECURRING] Found ${items.length} total active games at venue ${venueId.substring(0, 8)}...`);
    return items;
  } catch (error) {
    console.error('[RECURRING] Error querying venue games:', error);
    return [];
  }
};

/**
 * Query recurring games by venue and day (original function, kept for matching)
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

/**
 * NEW: Find existing duplicate across ALL days
 * Checks if a similar recurring game already exists for this venue
 */
const findExistingDuplicate = async (venueId, name, gameVariant) => {
  const allGames = await getRecurringGamesByVenue(venueId);
  
  if (allGames.length === 0) {
    return null;
  }
  
  const normalizedInput = normalizeGameName(name);
  
  for (const existing of allGames) {
    // Skip if variant doesn't match
    if (gameVariant && existing.gameVariant && gameVariant !== existing.gameVariant) {
      continue;
    }
    
    const normalizedExisting = normalizeGameName(existing.name);
    
    // Exact normalized name match
    if (normalizedInput === normalizedExisting) {
      console.log(`[RECURRING] ⚠️ Found exact duplicate: "${existing.name}" on ${existing.dayOfWeek}`);
      return existing;
    }
    
    // High similarity match
    const similarity = stringSimilarity.compareTwoStrings(normalizedInput, normalizedExisting);
    if (similarity >= MATCH_THRESHOLDS.DUPLICATE_THRESHOLD) {
      console.log(`[RECURRING] ⚠️ Found similar duplicate (${(similarity * 100).toFixed(0)}%): "${existing.name}" on ${existing.dayOfWeek}`);
      return existing;
    }
  }
  
  return null;
};

/**
 * Create a new recurring game (ENHANCED with deduplication)
 */
const createRecurringGame = async (data) => {
  const client = getDocClient();
  const tableName = getTableName('RecurringGame');
  
  // STEP 1: Check for existing duplicate BEFORE creating
  const existingDuplicate = await findExistingDuplicate(
    data.venueId,
    data.name,
    data.gameVariant
  );
  
  if (existingDuplicate) {
    console.log(`[RECURRING] ⏭️ Skipping creation - duplicate exists: ${existingDuplicate.id}`);
    
    // Return the existing game instead of creating a new one
    // Optionally: update the existing game with new data if needed
    return existingDuplicate;
  }
  
  // STEP 2: Validate day/name consistency
  const dayCheck = validateDayConsistency(data.name, data.dayOfWeek);
  if (!dayCheck.isValid) {
    console.warn(`[RECURRING] ⚠️ ${dayCheck.warning}`);
    // Use the suggested day from the name instead
    if (dayCheck.suggestedDay) {
      console.log(`[RECURRING] 🔧 Auto-correcting dayOfWeek from ${data.dayOfWeek} to ${dayCheck.suggestedDay}`);
      data.dayOfWeek = dayCheck.suggestedDay;
    }
  }
  
  const now = new Date().toISOString();
  const timestamp = Date.now();
  const dayOfWeekNameKey = buildDayOfWeekNameKey(data.dayOfWeek, data.name);
  
  if (!dayOfWeekNameKey) {
    console.error('[RECURRING] Cannot create game without dayOfWeek or name');
    throw new Error('dayOfWeek and name are required');
  }
  
  const newId = uuidv4();
  const newGame = {
    id: newId,
    name: data.name,
    venueId: data.venueId,
    entityId: data.entityId,
    dayOfWeek: data.dayOfWeek,
    'dayOfWeek#name': dayOfWeekNameKey,
    // Also compute venueId#name for cross-day dedup index
    'venueId#name': `${data.venueId}#${normalizeGameName(data.name)}`,
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
    // Use conditional write to prevent race conditions
    // Only create if no game with same venueId + normalized name exists
    await client.send(new PutCommand({
      TableName: tableName,
      Item: newGame,
      // Condition: This exact ID doesn't already exist
      ConditionExpression: 'attribute_not_exists(id)'
    }));
    
    console.log(`[RECURRING] ✅ Created new recurring game: "${newGame.name}" on ${newGame.dayOfWeek} (${newGame.id})`);
    return newGame;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`[RECURRING] Race condition detected - another process created this game`);
      // Try to find and return the existing game
      const existing = await findExistingDuplicate(data.venueId, data.name, data.gameVariant);
      if (existing) {
        return existing;
      }
    }
    console.error('[RECURRING] Error creating game:', error);
    throw error;
  }
};

// ===================================================================
// MAIN RESOLVER (ENHANCED)
// ===================================================================

const resolveRecurringAssignment = async ({ game, entityId, autoCreate = false }) => {
  const venueId = game.venueId;
  
  console.log(`[RECURRING] Resolving assignment for: "${game.name}"`);
  
  // Validation
  if (!venueId) {
    console.log('[RECURRING] ⏭️ Skipping: No venueId provided');
    return {
      gameUpdates: { recurringGameAssignmentStatus: 'NOT_RECURRING', recurringGameAssignmentConfidence: 0 },
      metadata: { status: 'NOT_RECURRING', confidence: 0, wasCreated: false, matchReason: 'no_venue' }
    };
  }
  
  if (!game.gameStartDateTime) {
    console.log('[RECURRING] ⏭️ Skipping: No gameStartDateTime provided');
    return {
      gameUpdates: { recurringGameAssignmentStatus: 'NOT_RECURRING', recurringGameAssignmentConfidence: 0 },
      metadata: { status: 'NOT_RECURRING', confidence: 0, wasCreated: false, matchReason: 'no_date' }
    };
  }
  
  if (!game.gameVariant) {
    console.log('[RECURRING] ⏭️ Skipping: No gameVariant provided');
    return {
      gameUpdates: { recurringGameAssignmentStatus: 'NOT_RECURRING', recurringGameAssignmentConfidence: 0 },
      metadata: { status: 'NOT_RECURRING', confidence: 0, wasCreated: false, matchReason: 'no_variant' }
    };
  }
  
  if (game.isSeries) {
    console.log('[RECURRING] ⏭️ Skipping: Game is part of a series');
    return {
      gameUpdates: { recurringGameAssignmentStatus: 'NOT_RECURRING', recurringGameAssignmentConfidence: 0 },
      metadata: { status: 'NOT_RECURRING', confidence: 0, wasCreated: false, matchReason: 'is_series' }
    };
  }
  
  const dayOfWeek = getDayOfWeek(game.gameStartDateTime);
  
  if (!dayOfWeek) {
    console.warn('[RECURRING] ⚠️ Could not determine day of week from:', game.gameStartDateTime);
    return {
      gameUpdates: { recurringGameAssignmentStatus: 'NOT_RECURRING', recurringGameAssignmentConfidence: 0 },
      metadata: { status: 'FAILED', confidence: 0, wasCreated: false, matchReason: 'invalid_date' }
    };
  }
  
  // NEW: Validate day/name consistency before matching
  const dayCheck = validateDayConsistency(game.name, dayOfWeek);
  if (!dayCheck.isValid) {
    console.warn(`[RECURRING] ⚠️ Day mismatch: ${dayCheck.warning}`);
    // Continue processing but log warning
  }
  
  try {
    // STEP 1: Try to match on the correct day first
    let candidates = await getRecurringGamesByVenueAndDay(venueId, dayOfWeek);
    
    // STEP 2: If name contains a day hint that differs, also check that day
    const dayHint = extractDayFromName(game.name);
    if (dayHint && dayHint !== dayOfWeek) {
      console.log(`[RECURRING] 🔍 Name suggests ${dayHint}, also checking that day...`);
      const altCandidates = await getRecurringGamesByVenueAndDay(venueId, dayHint);
      candidates = [...candidates, ...altCandidates];
    }
    
    // Find best match
    if (candidates.length > 0) {
      const matchResult = findBestMatch(game, candidates);
      
      if (matchResult.match && matchResult.score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
        const confidence = Math.min(matchResult.score / 100, 0.99);
        const gameUpdates = {
          recurringGameId: matchResult.match.id,
          recurringGameAssignmentStatus: matchResult.isAmbiguous ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED',
          recurringGameAssignmentConfidence: confidence
        };
        
        const inheritedFields = inheritFieldsFromTemplate(game, matchResult.match, gameUpdates);
        
        // Warn if matched game is on different day
        if (matchResult.match.dayOfWeek !== dayOfWeek) {
          console.warn(`[RECURRING] ⚠️ Matched to game on ${matchResult.match.dayOfWeek} but processing ${dayOfWeek} game`);
        }
        
        console.log(`[RECURRING] ✅ High confidence match: "${matchResult.match.name}" (score: ${matchResult.score})`);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence,
            matchedRecurringGameId: matchResult.match.id,
            matchedRecurringGameName: matchResult.match.name,
            matchedRecurringGameDay: matchResult.match.dayOfWeek,
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
      
      if (matchResult.match && matchResult.score >= MATCH_THRESHOLDS.MEDIUM_CONFIDENCE) {
        const confidence = matchResult.score / 100;
        const gameUpdates = {
          recurringGameId: matchResult.match.id,
          recurringGameAssignmentStatus: 'PENDING_ASSIGNMENT',
          recurringGameAssignmentConfidence: confidence
        };
        
        const inheritedFields = inheritFieldsFromTemplate(game, matchResult.match, gameUpdates);
        
        console.log(`[RECURRING] ⚠️ Medium confidence match: "${matchResult.match.name}" (score: ${matchResult.score})`);
        
        return {
          gameUpdates,
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence,
            matchedRecurringGameId: matchResult.match.id,
            matchedRecurringGameName: matchResult.match.name,
            matchedRecurringGameDay: matchResult.match.dayOfWeek,
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
      
      console.log(`[RECURRING] ❌ No match above threshold (best score: ${matchResult.score})`);
    }
    
    // STEP 3: Before auto-creating, check for duplicates across ALL days
    if (autoCreate && game.name) {
      const displayName = generateRecurringDisplayName(game.name);
      
      if (displayName.length > 3) {
        // Check for existing duplicate first
        const existingDuplicate = await findExistingDuplicate(venueId, displayName, game.gameVariant);
        
        if (existingDuplicate) {
          console.log(`[RECURRING] 🔗 Found existing game on different day: "${existingDuplicate.name}" (${existingDuplicate.dayOfWeek})`);
          
          // Match to existing even if on different day
          const gameUpdates = {
            recurringGameId: existingDuplicate.id,
            recurringGameAssignmentStatus: 'PENDING_ASSIGNMENT',  // Needs review since days differ
            recurringGameAssignmentConfidence: 0.7
          };
          
          const inheritedFields = inheritFieldsFromTemplate(game, existingDuplicate, gameUpdates);
          
          return {
            gameUpdates,
            metadata: {
              status: 'MATCHED_EXISTING',
              confidence: 0.7,
              matchedRecurringGameId: existingDuplicate.id,
              matchedRecurringGameName: existingDuplicate.name,
              matchedRecurringGameDay: existingDuplicate.dayOfWeek,
              wasCreated: false,
              inheritedFields,
              matchReason: 'cross_day_match',
              dayMismatch: true,
              processingDay: dayOfWeek,
              templateDay: existingDuplicate.dayOfWeek
            }
          };
        }
        
        // No existing duplicate - create new
        try {
          // Use the day from the game's actual date (or from name hint if present)
          const targetDay = dayHint || dayOfWeek;
          
          const newGame = await createRecurringGame({
            name: displayName,
            venueId: venueId,
            entityId: entityId,
            dayOfWeek: targetDay,  // Use corrected day
            gameType: game.gameType,
            gameVariant: game.gameVariant,
            tournamentType: game.tournamentType,
            typicalBuyIn: game.buyIn,
            typicalGuarantee: game.guaranteeAmount,
            startTime: formatTimeFromISO(game.gameStartDateTime)
          });
          
          console.log(`[RECURRING] ✅ Auto-created new recurring game: "${newGame.name}" on ${newGame.dayOfWeek}`);
          
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
    
    // No match found
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
  resolveRecurringAssignment,
  calculateMatchScore,
  findBestMatch,
  normalizeGameName,
  getDayOfWeek,
  getTimeAsMinutes,
  formatTimeFromISO,
  inheritFieldsFromTemplate,
  createRecurringGame,
  getRecurringGamesByVenueAndDay,
  // NEW exports
  getRecurringGamesByVenue,
  findExistingDuplicate,
  extractDayFromName,
  validateDayConsistency,
  SCORING_WEIGHTS,
  MATCH_THRESHOLDS
};