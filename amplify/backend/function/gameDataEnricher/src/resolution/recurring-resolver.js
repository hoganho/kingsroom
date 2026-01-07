/**
 * recurring-resolver.js
 * UPDATED: Added AEST timezone support for start time extraction and comparison
 * 
 * Changes from original:
 * 1. Added AEST/AEDT timezone conversion functions
 * 2. formatTimeFromISO() now converts UTC to AEST before extracting time
 * 3. getTimeAsMinutes() now converts UTC to AEST for comparison
 * 4. getDayOfWeek() now uses AEST to determine correct day
 * 5. getRecurringGamesByVenue() - queries ALL days, not just current day
 * 6. findExistingDuplicate() - checks for similar games before creating
 * 7. createRecurringGame() - uses conditional write to prevent race conditions
 * 8. extractDayFromName() - detects day hints in game names
 * 9. resolveRecurringAssignment() - validates day/name consistency
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, PutCommand, ScanCommand } = require('../utils/db-client');
const { DAYS_OF_WEEK, VALIDATION_THRESHOLDS } = require('../utils/constants');

// ===================================================================
// AEST/AEDT TIMEZONE UTILITIES
// ===================================================================

const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

/**
 * Check if a date falls within Australian Eastern Daylight Time
 * AEDT runs from first Sunday in October to first Sunday in April
 * 
 * @param {Date} date - Date to check
 * @returns {boolean} True if AEDT is in effect
 */
const isAEDT = (date) => {
    const month = date.getUTCMonth(); // 0-indexed
    
    // AEDT: October through March (roughly)
    if (month >= 3 && month <= 8) {
        // April through September - AEST
        return false;
    }
    if (month >= 10 || month <= 1) {
        // November through February - AEDT
        return true;
    }
    
    // October or March - use approximation
    const dayOfMonth = date.getUTCDate();
    if (month === 9) { // October
        return dayOfMonth >= 7;
    }
    return true; // March is still AEDT
};

/**
 * Get the current AEST/AEDT offset in hours
 * 
 * @param {Date} date - Date to check
 * @returns {number} Offset in hours (10 for AEST, 11 for AEDT)
 */
const getAustralianOffset = (date) => {
    return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
};

/**
 * Convert a UTC date to AEST/AEDT local date components
 * 
 * @param {Date|string} utcDate - UTC date to convert
 * @returns {Object} AEST date components
 */
const toAEST = (utcDate) => {
    const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
    if (isNaN(d.getTime())) return null;
    
    const offset = getAustralianOffset(d);
    
    // Add offset to get AEST time
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
// HELPER FUNCTIONS (UPDATED WITH AEST SUPPORT)
// ===================================================================

/**
 * Get day of week from ISO date string - NOW IN AEST
 * 
 * @param {string} isoDate - ISO date string (UTC)
 * @returns {string|null} Day of week in AEST (e.g., "MONDAY")
 */
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

/**
 * Get time as minutes from midnight - NOW IN AEST
 * 
 * @param {string} isoDate - ISO date string (UTC)
 * @returns {number|null} Minutes from midnight in AEST
 */
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

/**
 * Format time from ISO date - NOW RETURNS AEST TIME
 * Used when auto-creating RecurringGame templates
 * 
 * @param {string} isoDate - ISO date string (UTC)
 * @returns {string|null} Time string in AEST (e.g., "18:30")
 */
const formatTimeFromISO = (isoDate) => {
    if (!isoDate) return null;
    try {
        const aest = toAEST(isoDate);
        if (!aest) return null;
        
        const hours = String(aest.hours).padStart(2, '0');
        const minutes = String(aest.minutes).padStart(2, '0');
        
        console.log(`[RECURRING] Converted UTC time to AEST: ${isoDate} → ${hours}:${minutes} AEST`);
        
        return `${hours}:${minutes}`;
    } catch (error) {
        console.error('[RECURRING] Error formatting time from ISO:', error);
        return null;
    }
};

/**
 * Parse time string (HH:MM) to minutes from midnight
 * RecurringGame.startTime is stored in AEST
 * 
 * @param {string} timeStr - Time string (e.g., "18:30")
 * @returns {number|null} Minutes from midnight
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
 * Extract day hint from game name
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
 * Validate that name and dayOfWeek are consistent
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
        console.log(`[RECURRING] Inheriting jackpot contribution ($${gameUpdates.jackpotContributionAmount}) from template`);
    }
    
    // ===================================================================
    // ACCUMULATOR TICKET INHERITANCE (NEW)
    // ===================================================================
    if (recurringGame.hasAccumulatorTickets) {
        gameUpdates.hasAccumulatorTickets = true;
        gameUpdates.accumulatorTicketValue = recurringGame.accumulatorTicketValue || 100;
        inheritedFields.push('hasAccumulatorTickets', 'accumulatorTicketValue');
        console.log(`[RECURRING] Inheriting accumulator tickets ($${gameUpdates.accumulatorTicketValue}) from template`);
    }
    
    return inheritedFields;
};

// ===================================================================
// DATABASE QUERIES
// ===================================================================

/**
 * Get all recurring games for a venue (ALL days)
 */
const getRecurringGamesByVenue = async (venueId) => {
    if (!venueId) return [];
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGame');
    
    try {
        // Query using byVenue GSI
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
        
        console.log(`[RECURRING] Found ${result.Items?.length || 0} recurring games for venue (all days)`);
        return result.Items || [];
    } catch (error) {
        console.error('[RECURRING] Error fetching recurring games by venue:', error);
        return [];
    }
};

/**
 * Get recurring games for a specific venue and day of week
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
        
        console.log(`[RECURRING] Found ${result.Items?.length || 0} recurring games for ${dayOfWeek}`);
        return result.Items || [];
    } catch (error) {
        console.error('[RECURRING] Error fetching recurring games:', error);
        return [];
    }
};

/**
 * Find existing duplicate by name similarity (across all days)
 */
const findExistingDuplicate = async (venueId, displayName, gameVariant) => {
    const allGames = await getRecurringGamesByVenue(venueId);
    
    if (allGames.length === 0) return null;
    
    const normalizedInput = normalizeGameName(displayName);
    
    for (const existing of allGames) {
        const normalizedExisting = normalizeGameName(existing.name);
        const similarity = stringSimilarity.compareTwoStrings(normalizedInput, normalizedExisting);
        
        // Check for high similarity + same variant
        if (similarity >= MATCH_THRESHOLDS.DUPLICATE_THRESHOLD) {
            if (!gameVariant || !existing.gameVariant || gameVariant === existing.gameVariant) {
                console.log(`[RECURRING] Found potential duplicate: "${existing.name}" (similarity: ${(similarity * 100).toFixed(1)}%)`);
                return existing;
            }
        }
    }
    
    return null;
};

/**
 * Create a new recurring game with conditional write
 * Defaults frequency to 'WEEKLY' if not provided (required by GraphQL schema)
 */
const createRecurringGame = async (gameData) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGame');
    
    const id = uuidv4();
    const now = new Date().toISOString();
    const dayOfWeekNameKey = buildDayOfWeekNameKey(gameData.dayOfWeek, gameData.name);
    
    const item = {
        id,
        ...gameData,
        'dayOfWeek#name': dayOfWeekNameKey,
        frequency: gameData.frequency || 'WEEKLY',  // Default to WEEKLY - required field in GraphQL schema
        isActive: true,
        isPaused: false,
        totalInstancesRun: 0,
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
        
        console.log(`[RECURRING] Created new recurring game: ${item.name} (${id})`);
        return item;
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.warn('[RECURRING] Duplicate ID detected, retrying with new ID');
            return createRecurringGame(gameData);
        }
        throw error;
    }
};

// ===================================================================
// SCORING FUNCTIONS
// ===================================================================

/**
 * Calculate match score between a game and a recurring game template
 * 
 * NOTE: Time comparison now works correctly because:
 * - Game time is converted from UTC to AEST via getTimeAsMinutes()
 * - Template time is stored in AEST
 */
const calculateMatchScore = (game, recurringGame) => {
    let score = 0;
    const scoringDetails = {};
    
    // === NAME SCORING ===
    const gameName = normalizeGameName(game.name);
    const templateName = normalizeGameName(recurringGame.name);
    
    if (gameName === templateName) {
        score += SCORING_WEIGHTS.NAME_EXACT;
        scoringDetails.name = { type: 'exact', score: SCORING_WEIGHTS.NAME_EXACT };
    } else if (gameName.includes(templateName) || templateName.includes(gameName)) {
        score += SCORING_WEIGHTS.NAME_CONTAINS;
        scoringDetails.name = { type: 'contains', score: SCORING_WEIGHTS.NAME_CONTAINS };
    } else {
        const similarity = stringSimilarity.compareTwoStrings(gameName, templateName);
        const fuzzyScore = Math.round(similarity * SCORING_WEIGHTS.NAME_FUZZY_MAX);
        score += fuzzyScore;
        scoringDetails.name = { type: 'fuzzy', similarity, score: fuzzyScore };
    }
    
    // === VARIANT SCORING ===
    if (game.gameVariant && recurringGame.gameVariant) {
        if (game.gameVariant === recurringGame.gameVariant) {
            score += SCORING_WEIGHTS.VARIANT_MATCH;
            scoringDetails.variant = { match: true, score: SCORING_WEIGHTS.VARIANT_MATCH };
        } else {
            scoringDetails.variant = { match: false, score: 0 };
        }
    }
    
    // === BUY-IN SCORING ===
    if (game.buyIn && recurringGame.typicalBuyIn) {
        const buyInDiff = Math.abs(game.buyIn - recurringGame.typicalBuyIn);
        const buyInPercent = buyInDiff / recurringGame.typicalBuyIn;
        
        if (buyInDiff === 0) {
            score += SCORING_WEIGHTS.BUYIN_EXACT;
            scoringDetails.buyIn = { type: 'exact', score: SCORING_WEIGHTS.BUYIN_EXACT };
        } else if (buyInPercent <= 0.10) {
            score += SCORING_WEIGHTS.BUYIN_CLOSE;
            scoringDetails.buyIn = { type: 'close', percent: buyInPercent, score: SCORING_WEIGHTS.BUYIN_CLOSE };
        } else if (buyInPercent <= 0.25) {
            score += SCORING_WEIGHTS.BUYIN_NEAR;
            scoringDetails.buyIn = { type: 'near', percent: buyInPercent, score: SCORING_WEIGHTS.BUYIN_NEAR };
        } else if (buyInPercent <= 0.50) {
            score += SCORING_WEIGHTS.BUYIN_FAR;
            scoringDetails.buyIn = { type: 'far', percent: buyInPercent, score: SCORING_WEIGHTS.BUYIN_FAR };
        } else {
            score += SCORING_WEIGHTS.BUYIN_MISMATCH;
            scoringDetails.buyIn = { type: 'mismatch', percent: buyInPercent, score: SCORING_WEIGHTS.BUYIN_MISMATCH };
        }
    }
    
    // === TIME SCORING (NOW IN AEST) ===
    const gameTimeMinutes = getTimeAsMinutes(game.gameStartDateTime);  // Converts UTC → AEST
    const templateTimeMinutes = parseTimeToMinutes(recurringGame.startTime);  // Already in AEST
    
    if (gameTimeMinutes !== null && templateTimeMinutes !== null) {
        const timeDiff = Math.abs(gameTimeMinutes - templateTimeMinutes);
        
        if (timeDiff === 0) {
            score += SCORING_WEIGHTS.TIME_EXACT;
            scoringDetails.time = { type: 'exact', diff: timeDiff, score: SCORING_WEIGHTS.TIME_EXACT };
        } else if (timeDiff <= 15) {
            score += SCORING_WEIGHTS.TIME_CLOSE;
            scoringDetails.time = { type: 'close', diff: timeDiff, score: SCORING_WEIGHTS.TIME_CLOSE };
        } else if (timeDiff <= 30) {
            score += SCORING_WEIGHTS.TIME_NEAR;
            scoringDetails.time = { type: 'near', diff: timeDiff, score: SCORING_WEIGHTS.TIME_NEAR };
        } else if (timeDiff <= 60) {
            score += SCORING_WEIGHTS.TIME_FAR;
            scoringDetails.time = { type: 'far', diff: timeDiff, score: SCORING_WEIGHTS.TIME_FAR };
        } else {
            score += SCORING_WEIGHTS.TIME_MISMATCH;
            scoringDetails.time = { type: 'mismatch', diff: timeDiff, score: SCORING_WEIGHTS.TIME_MISMATCH };
        }
    } else {
        scoringDetails.time = { type: 'skipped', reason: templateTimeMinutes === null ? 'no_template_time' : 'no_game_time' };
    }
    
    // === TOURNAMENT TYPE SCORING ===
    if (game.tournamentType && recurringGame.tournamentType) {
        if (game.tournamentType === recurringGame.tournamentType) {
            score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH;
            scoringDetails.tournamentType = { match: true, score: SCORING_WEIGHTS.TOURNAMENT_TYPE_MATCH };
        } else {
            score += SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH;
            scoringDetails.tournamentType = { match: false, score: SCORING_WEIGHTS.TOURNAMENT_TYPE_MISMATCH };
        }
    }
    
    return { score, scoringDetails };
};

/**
 * Find the best matching recurring game from candidates
 */
const findBestMatch = (game, candidates) => {
    if (!candidates || candidates.length === 0) {
        return { match: null, score: 0, isAmbiguous: false, scoringDetails: {}, metadata: { topScores: [] } };
    }
    
    const scores = candidates.map(candidate => {
        const { score, scoringDetails } = calculateMatchScore(game, candidate);
        return { candidate, score, scoringDetails };
    });
    
    scores.sort((a, b) => b.score - a.score);
    
    const best = scores[0];
    const isAmbiguous = scores.length > 1 && 
                        scores[1].score >= (best.score - MATCH_THRESHOLDS.AMBIGUITY_MARGIN);
    
    return {
        match: best.candidate,
        score: best.score,
        isAmbiguous,
        scoringDetails: best.scoringDetails,
        metadata: {
            topScores: scores.slice(0, 3).map(s => ({
                name: s.candidate.name,
                score: s.score,
                details: s.scoringDetails
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
 * UPDATED: Now uses AEST for day-of-week determination and time comparison
 */
const resolveRecurringAssignment = async ({ game, entityId, autoCreate = false }) => {
    try {
        const { venueId, gameStartDateTime, name } = game;
        
        if (!venueId) {
            console.log('[RECURRING] No venueId - skipping recurring resolution');
            return {
                gameUpdates: {
                    recurringGameAssignmentStatus: 'NOT_RECURRING',
                    recurringGameAssignmentConfidence: 0
                },
                metadata: {
                    status: 'SKIPPED',
                    confidence: 0,
                    wasCreated: false,
                    inheritedFields: [],
                    matchReason: 'no_venue'
                }
            };
        }
        
        // Get day of week IN AEST
        const dayOfWeek = getDayOfWeek(gameStartDateTime);
        if (!dayOfWeek) {
            console.log('[RECURRING] Could not determine day of week');
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
                    matchReason: 'invalid_date'
                }
            };
        }
        
        console.log(`[RECURRING] Resolving for venue ${venueId}, day ${dayOfWeek} (AEST)`);
        
        // Check for day/name consistency
        const dayHint = extractDayFromName(name);
        const dayConsistency = validateDayConsistency(name, dayOfWeek);
        
        if (!dayConsistency.isValid) {
            console.warn(`[RECURRING] ${dayConsistency.warning}`);
        }
        
        // STEP 1: Get candidates for this venue and day
        const candidates = await getRecurringGamesByVenueAndDay(venueId, dayOfWeek);
        
        // STEP 2: Find best match
        if (candidates.length > 0) {
            const matchResult = findBestMatch(game, candidates);
            
            if (matchResult.match && matchResult.score >= MATCH_THRESHOLDS.HIGH_CONFIDENCE) {
                const confidence = Math.min(matchResult.score / 100, 0.99);
                const gameUpdates = {
                    recurringGameId: matchResult.match.id,
                    recurringGameAssignmentStatus: matchResult.isAmbiguous ? 'PENDING_ASSIGNMENT' : 'AUTO_ASSIGNED',
                    recurringGameAssignmentConfidence: confidence,
                    isRegular: true,
                    isSeries: false
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
                    recurringGameAssignmentConfidence: confidence,
                    isRegular: true,
                    isSeries: false
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
                        recurringGameAssignmentStatus: 'PENDING_ASSIGNMENT',
                        recurringGameAssignmentConfidence: 0.7,
                        isRegular: true,
                        isSeries: false
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
                        dayOfWeek: targetDay,
                        gameType: game.gameType,
                        gameVariant: game.gameVariant,
                        tournamentType: game.tournamentType,
                        typicalBuyIn: game.buyIn,
                        typicalGuarantee: game.guaranteeAmount,
                        startTime: formatTimeFromISO(game.gameStartDateTime)  // NOW SAVES AEST TIME
                    });
                    
                    console.log(`[RECURRING] ✅ Auto-created new recurring game: "${newGame.name}" on ${newGame.dayOfWeek} at ${newGame.startTime} AEST`);
                    
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
    // AEST utilities (exported for testing)
    toAEST,
    isAEDT,
    getAustralianOffset,
    SCORING_WEIGHTS,
    MATCH_THRESHOLDS
};