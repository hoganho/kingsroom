// recurring-game-resolution.js
// VERSION: 1.2.0 - Fixed GSI query and record creation for dayOfWeek#name sort key
//
// GSI SCHEMA (byVenueRecurringGame):
//   - Partition Key: venueId
//   - Sort Key: dayOfWeek#name (composite attribute, e.g., "MONDAY#Big Friday Tournament")
//
const { QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Get day of week from ISO date string
 * Uses getUTCDay() for consistency with game-query-keys.js
 */
const getDayOfWeek = (isoDate) => {
    if (!isoDate) return null;
    try {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return null;
        return days[d.getUTCDay()];
    } catch (error) {
        console.error('[RECURRING] Error getting day of week:', error);
        return null;
    }
};

const getTimeAsMinutes = (isoDate) => {
    if (!isoDate) return 0;
    const d = new Date(isoDate);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const formatTimeFromISO = (isoDate) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    const hours = d.getUTCHours().toString().padStart(2, '0');
    const minutes = d.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

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
 * Creates a display-friendly name for a new Recurring Game
 * e.g. "big friday $20k" -> "Big Friday"
 */
const generateRecurringDisplayName = (rawName) => {
    const clean = normalizeGameName(rawName);
    return clean.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
};

/**
 * Build the composite sort key for the GSI
 * Format: "MONDAY#Big Friday Tournament"
 * 
 * @param {string} dayOfWeek - Day of week (MONDAY, TUESDAY, etc.)
 * @param {string} name - Game name
 * @returns {string} Composite key for GSI sort key
 */
const buildDayOfWeekNameKey = (dayOfWeek, name) => {
    if (!dayOfWeek || !name) return null;
    return `${dayOfWeek}#${name}`;
};

// ===================================================================
// DB OPERATIONS
// ===================================================================

const createRecurringGame = async (ddbDocClient, tableName, data) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Build the composite GSI sort key
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
        dayOfWeek: data.dayOfWeek,                    // Keep standalone for filtering
        'dayOfWeek#name': dayOfWeekNameKey,           // GSI sort key attribute
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
        await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: newGame
        }));
        console.log(`[RECURRING] Created new game: ${newGame.name} (${newGame.id}) with key: ${dayOfWeekNameKey}`);
        return newGame;
    } catch (error) {
        console.error('[RECURRING] Error creating game:', error);
        throw error;
    }
};

// ===================================================================
// SCORING LOGIC
// ===================================================================

const calculateMatchScore = (gameInput, candidate) => {
    let score = 0;
    
    // 1. HARD FILTERS (Must match to get any score)
    if (candidate.gameType && candidate.gameType !== gameInput.gameType) return 0;
    if (candidate.gameVariant && gameInput.gameVariant && candidate.gameVariant !== gameInput.gameVariant) return 0;

    // 2. SCORING FACTORS
    const inputName = normalizeGameName(gameInput.name);
    const candidateName = normalizeGameName(candidate.name);
    
    // A. Name Similarity (80 pts)
    if (inputName.includes(candidateName)) {
        score += 80;
    } else {
        const sim = stringSimilarity.compareTwoStrings(inputName, candidateName);
        score += (sim * 80);
    }

    // B. Buy-in Proximity (20 pts)
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

    // C. Time Proximity (10 pts)
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
// MAIN RESOLVER
// ===================================================================

const resolveRecurringGame = async (gameInput, venueId, entityId, ddbDocClient, getTableName, options = {}) => {
    const { autoCreate = true } = options;
    
    // Validation
    if (!venueId) {
        console.log('[RECURRING] No venueId provided, skipping resolution');
        return null;
    }
    
    if (!gameInput.gameStartDateTime) {
        console.log('[RECURRING] No gameStartDateTime provided, skipping resolution');
        return null;
    }
    
    if (!gameInput.gameVariant) {
        console.log('[RECURRING] No gameVariant provided, skipping resolution');
        return null;
    }

    const dayOfWeek = getDayOfWeek(gameInput.gameStartDateTime);
    
    if (!dayOfWeek) {
        console.warn('[RECURRING] Could not determine day of week from:', gameInput.gameStartDateTime);
        return null;
    }
    
    const tableName = getTableName('RecurringGame');

    try {
        // =====================================================================
        // QUERY USING GSI: byVenueRecurringGame
        // Partition Key: venueId
        // Sort Key: dayOfWeek#name (composite attribute)
        // 
        // Use begins_with to get all games for this venue on this day
        // e.g., begins_with("MONDAY#") returns all Monday games
        // =====================================================================
        
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenueRecurringGame',
            KeyConditionExpression: 'venueId = :vid AND begins_with(#sortKey, :dayPrefix)',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeNames: {
                '#sortKey': 'dayOfWeek#name'    // The literal attribute name
            },
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':dayPrefix': `${dayOfWeek}#`,  // e.g., "MONDAY#"
                ':active': true
            }
        }));

        const candidates = result.Items || [];
        
        console.log(`[RECURRING] Found ${candidates.length} candidates for ${dayOfWeek} at venue ${venueId.substring(0, 8)}...`);
        
        // 2. Score & Match
        if (candidates.length > 0) {
            let bestMatch = null;
            let bestScore = -1;

            for (const candidate of candidates) {
                const score = calculateMatchScore(gameInput, candidate);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = candidate;
                }
            }

            if (bestMatch && bestScore >= 75) {
                const response = {
                    recurringGameId: bestMatch.id,
                    name: bestMatch.name,
                    confidence: Math.min(bestScore / 100, 0.99),
                    status: 'AUTO_ASSIGNED',
                    typicalBuyIn: bestMatch.typicalBuyIn,
                    wasCreated: false
                };

                // === GUARANTEE LOGIC ===
                if ((!gameInput.guaranteeAmount || gameInput.guaranteeAmount === 0) && bestMatch.typicalGuarantee) {
                    response.suggestedGuarantee = bestMatch.typicalGuarantee;
                    console.log(`[RECURRING] Inheriting guarantee $${bestMatch.typicalGuarantee} from parent ${bestMatch.name}`);
                }

                return response;

            } else if (bestMatch && bestScore >= 50) {
                return {
                    recurringGameId: bestMatch.id, 
                    name: bestMatch.name,
                    confidence: bestScore / 100,
                    status: 'PENDING_ASSIGNMENT',
                    wasCreated: false
                };
            }
        }

        // 3. Auto-Create New Recurring Game
        if (autoCreate && gameInput.name) {
            const displayName = generateRecurringDisplayName(gameInput.name);
            
            if (displayName.length > 3) {
                try {
                    const newGame = await createRecurringGame(ddbDocClient, tableName, {
                        name: displayName,
                        venueId: venueId,
                        entityId: entityId,
                        dayOfWeek: dayOfWeek,
                        gameType: gameInput.gameType,
                        gameVariant: gameInput.gameVariant,
                        typicalBuyIn: gameInput.buyIn,
                        typicalGuarantee: gameInput.guaranteeAmount,
                        startTime: formatTimeFromISO(gameInput.gameStartDateTime)
                    });
                    
                    return {
                        recurringGameId: newGame.id,
                        name: newGame.name,
                        confidence: 0.9,
                        status: 'AUTO_ASSIGNED',
                        wasCreated: true,
                        note: 'New Recurring Game Created'
                    };
                } catch (err) {
                    console.error('[RECURRING] Failed to auto-create:', err);
                }
            }
        }

        return {
            recurringGameId: null,
            status: 'NOT_RECURRING',
            confidence: 0,
            name: null,
            wasCreated: false
        };

    } catch (error) {
        console.error('[RecurringGame] Resolution error:', error);
        return null;
    }
};

module.exports = { resolveRecurringGame };