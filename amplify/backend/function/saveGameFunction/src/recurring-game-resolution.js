// recurring-game-resolution.js
const { QueryCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');

// ===================================================================
// HELPERS
// ===================================================================

const getDayOfWeek = (isoDate) => {
    if (!isoDate) return null;
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[new Date(isoDate).getDay()];
};

const getTimeAsMinutes = (isoDate) => {
    if (!isoDate) return 0;
    const d = new Date(isoDate);
    return d.getHours() * 60 + d.getMinutes();
};

const formatTimeFromISO = (isoDate) => {
    if (!isoDate) return null;
    const d = new Date(isoDate);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
};

const normalizeGameName = (name) => {
    if (!name) return '';
    return name.toLowerCase()
        // Remove guarantees and money patterns
        .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)/gi, '')
        .replace(/\b(gtd|guaranteed)\b/gi, '')
        // Remove structural keywords
        .replace(/\b(weekly|monthly|annual)\b/gi, '')
        .replace(/\b(rebuy|re-entry|freezeout|entry)\b.*$/gi, '') 
        // Remove strictly numeric money amounts usually at start ($100)
        .replace(/^\$[0-9]+\s+/, '')
        // Clean special chars and extra spaces
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
    // Capitalize words
    return clean.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
};

// ===================================================================
// DB OPERATIONS
// ===================================================================

const createRecurringGame = async (ddbDocClient, tableName, data) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    const newGame = {
        id: uuidv4(),
        name: data.name,
        venueId: data.venueId,
        entityId: data.entityId,
        dayOfWeek: data.dayOfWeek,
        frequency: 'WEEKLY', // Default safe assumption
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
        console.log(`[RECURRING] Created new game: ${newGame.name} (${newGame.id})`);
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
    
    if (!venueId || !gameInput.gameStartDateTime || !gameInput.gameVariant) return null;

    const dayOfWeek = getDayOfWeek(gameInput.gameStartDateTime);
    const tableName = getTableName('RecurringGame');

    try {
        // 1. Fetch Candidates
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenueRecurringGame', 
            KeyConditionExpression: 'venueId = :vid AND dayOfWeek = :dow',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':dow': dayOfWeek,
                ':active': true
            }
        }));

        const candidates = result.Items || [];
        
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
                // If input game has no guarantee (0 or null), but parent has one, suggest it.
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