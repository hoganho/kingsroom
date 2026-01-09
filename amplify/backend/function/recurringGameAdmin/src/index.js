/**
 * recurringGameAdmin/index.js
 * 
 * Lambda for recurring game administration operations:
 * - Re-resolve recurring assignments for games
 * - Find and merge duplicate RecurringGame entries
 * - Preview changes before applying
 * - Cleanup orphaned RecurringGame entries
 * - Instance tracking and compliance reporting
 * 
 * Operations:
 * - reResolveGame: Re-evaluate a single game's recurring assignment
 * - reResolveVenueGames: Re-evaluate all games at a venue
 * - findDuplicates: Find duplicate RecurringGame entries
 * - mergeDuplicates: Merge duplicate entries into one
 * - cleanupOrphans: Remove RecurringGame entries with no assigned games
 * - getRecurringGameStats: Get statistics about recurring games
 * - recordMissedInstance: Record a cancelled/skipped/no-show instance
 * - updateInstanceStatus: Update an existing instance
 * - detectRecurringGameGaps: Find missing games in schedule
 * - reconcileRecurringInstances: Backfill instances for existing games
 * - getVenueComplianceReport: Get compliance statistics
 * - getWeekInstances: Get instances for a specific week
 * - listInstancesNeedingReview: Get flagged instances
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    QueryCommand, 
    ScanCommand, 
    UpdateCommand,
    GetCommand,
    BatchWriteCommand 
} = require('@aws-sdk/lib-dynamodb');
const stringSimilarity = require('string-similarity');

// Instance tracking handlers
const instanceHandlers = require('./instance-handlers');

// Shared utilities - SINGLE SOURCE OF TRUTH for normalization
const { 
    normalizeGameName, 
    stringSimilarity: diceStringSimilarity,
    calculateNameSimilarity 
} = require('./game-name-utils');

// Initialize DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

// Table names from environment
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const RECURRING_GAME_TABLE = process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME;
const VENUE_TABLE = process.env.API_KINGSROOM_VENUETABLE_NAME;

const { handleBootstrapRecurringGames } = require('./bootstrap-recurring-games');

// ===================================================================
// CONSTANTS
// ===================================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const DEFAULT_THRESHOLDS = {
    highConfidence: 75,
    mediumConfidence: 50,
    duplicateSimilarity: 0.85,
    crossDaySuggestion: 60
};

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

const getDayOfWeek = (isoDate) => {
    if (!isoDate) return null;
    try {
        const date = new Date(isoDate);
        // Convert to AEST (UTC+10/11)
        const aestOffset = 10; // Simplified - use proper AEST/AEDT logic in production
        const aestDate = new Date(date.getTime() + (aestOffset * 60 * 60 * 1000));
        return DAYS_OF_WEEK[aestDate.getUTCDay()];
    } catch (error) {
        return null;
    }
};

const getTimeAsMinutes = (isoDate) => {
    if (!isoDate) return null;
    try {
        const date = new Date(isoDate);
        const aestOffset = 10;
        const aestDate = new Date(date.getTime() + (aestOffset * 60 * 60 * 1000));
        return aestDate.getUTCHours() * 60 + aestDate.getUTCMinutes();
    } catch (error) {
        return null;
    }
};

const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return isNaN(h) ? null : h * 60 + (m || 0);
};

// ===================================================================
// DATABASE QUERIES
// ===================================================================

const getRecurringGamesByVenue = async (venueId) => {
    const items = [];
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: RECURRING_GAME_TABLE,
            IndexName: 'byVenueRecurringGame',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':active': true
            }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(params));
        items.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return items;
};

const getGamesByVenue = async (venueId, limit = null) => {
    const items = [];
    let lastEvaluatedKey = null;
    let totalFetched = 0;
    
    do {
        const params = {
            TableName: GAME_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            ExpressionAttributeValues: {
                ':vid': venueId
            }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new QueryCommand(params));
        items.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
        totalFetched += (result.Items || []).length;
        
        // Check if we've hit our limit
        if (limit && totalFetched >= limit) {
            break;
        }
    } while (lastEvaluatedKey);
    
    console.log(`[RECURRING_ADMIN] Fetched ${items.length} games for venue ${venueId}`);
    return limit ? items.slice(0, limit) : items;
};

const getGamesByRecurringGameId = async (recurringGameId) => {
    // This requires a GSI on recurringGameId, or we scan with filter
    const result = await docClient.send(new ScanCommand({
        TableName: GAME_TABLE,
        FilterExpression: 'recurringGameId = :rgid',
        ExpressionAttributeValues: {
            ':rgid': recurringGameId
        }
    }));
    return result.Items || [];
};

const getGame = async (gameId) => {
    const result = await docClient.send(new GetCommand({
        TableName: GAME_TABLE,
        Key: { id: gameId }
    }));
    return result.Item;
};

const getRecurringGame = async (recurringGameId) => {
    const result = await docClient.send(new GetCommand({
        TableName: RECURRING_GAME_TABLE,
        Key: { id: recurringGameId }
    }));
    return result.Item;
};

const updateGameRecurringAssignment = async (gameId, updates) => {
    const updateExpressions = [];
    const expressionNames = {};
    const expressionValues = {};
    
    Object.entries(updates).forEach(([key, value]) => {
        if (key === 'id' || key === '_version') return;
        updateExpressions.push(`#${key} = :${key}`);
        expressionNames[`#${key}`] = key;
        expressionValues[`:${key}`] = value;
    });
    
    // Add updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();
    
    await docClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: gameId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues
    }));
};

const markRecurringGameInactive = async (recurringGameId, mergedIntoId = null) => {
    const updates = {
        isActive: false,
        updatedAt: new Date().toISOString()
    };
    
    if (mergedIntoId) {
        updates.mergedInto = mergedIntoId;
    }
    
    await docClient.send(new UpdateCommand({
        TableName: RECURRING_GAME_TABLE,
        Key: { id: recurringGameId },
        UpdateExpression: 'SET isActive = :inactive, updatedAt = :now' + 
            (mergedIntoId ? ', mergedInto = :merged' : ''),
        ExpressionAttributeValues: {
            ':inactive': false,
            ':now': new Date().toISOString(),
            ...(mergedIntoId && { ':merged': mergedIntoId })
        }
    }));
};

// ===================================================================
// SCORING & MATCHING
// ===================================================================

const calculateMatchScore = (game, recurringGame, thresholds = DEFAULT_THRESHOLDS) => {
    let score = 0;
    const details = {};
    
    // Check session mode compatibility
    const gameType = game.gameType || 'TOURNAMENT';
    const templateType = recurringGame.gameType || 'TOURNAMENT';
    
    if ((gameType === 'CASH_GAME') !== (templateType === 'CASH_GAME')) {
        return { score: -100, details: { sessionModeMismatch: true } };
    }
    
    // Name scoring (max 60)
    const gameName = normalizeGameName(game.name);
    const templateName = normalizeGameName(recurringGame.name);
    
    if (gameName === templateName) {
        score += 60;
        details.name = { type: 'exact', score: 60 };
    } else if (gameName.includes(templateName) || templateName.includes(gameName)) {
        score += 50;
        details.name = { type: 'contains', score: 50 };
    } else {
        const similarity = stringSimilarity.compareTwoStrings(gameName, templateName);
        const fuzzyScore = Math.round(similarity * 60);
        score += fuzzyScore;
        details.name = { type: 'fuzzy', similarity, score: fuzzyScore };
    }
    
    // Variant scoring (max 15)
    if (game.gameVariant && recurringGame.gameVariant) {
        if (game.gameVariant === recurringGame.gameVariant) {
            score += 15;
            details.variant = { match: true, score: 15 };
        }
    }
    
    // Buy-in scoring (max 25)
    if (game.buyIn && recurringGame.typicalBuyIn) {
        const diff = Math.abs(game.buyIn - recurringGame.typicalBuyIn);
        const percent = diff / recurringGame.typicalBuyIn;
        
        if (diff === 0) {
            score += 25;
            details.buyIn = { type: 'exact', score: 25 };
        } else if (percent <= 0.10) {
            score += 20;
            details.buyIn = { type: 'close', score: 20 };
        } else if (percent <= 0.25) {
            score += 10;
            details.buyIn = { type: 'near', score: 10 };
        } else if (percent > 0.50) {
            score -= 10;
            details.buyIn = { type: 'mismatch', score: -10 };
        }
    }
    
    // Time scoring (max 15)
    const gameTimeMinutes = getTimeAsMinutes(game.gameStartDateTime);
    const templateTimeMinutes = parseTimeToMinutes(recurringGame.startTime);
    
    if (gameTimeMinutes !== null && templateTimeMinutes !== null) {
        const timeDiff = Math.abs(gameTimeMinutes - templateTimeMinutes);
        
        if (timeDiff === 0) {
            score += 15;
            details.time = { type: 'exact', score: 15 };
        } else if (timeDiff <= 15) {
            score += 12;
            details.time = { type: 'close', score: 12 };
        } else if (timeDiff <= 30) {
            score += 8;
            details.time = { type: 'near', score: 8 };
        } else if (timeDiff > 60) {
            score -= 5;
            details.time = { type: 'mismatch', score: -5 };
        }
    }
    
    return { score, details };
};

const findBestMatch = (game, candidates, thresholds = DEFAULT_THRESHOLDS) => {
    if (!candidates || candidates.length === 0) {
        return { match: null, score: 0, allScores: [] };
    }
    
    const scores = candidates.map(candidate => {
        const { score, details } = calculateMatchScore(game, candidate, thresholds);
        return { candidate, score, details };
    });
    
    scores.sort((a, b) => b.score - a.score);
    
    return {
        match: scores[0]?.candidate || null,
        score: scores[0]?.score || 0,
        details: scores[0]?.details || {},
        allScores: scores.slice(0, 5) // Top 5 for review
    };
};

// ===================================================================
// OPERATIONS
// ===================================================================

/**
 * Re-resolve recurring assignment for a single game
 */
const reResolveGame = async (gameId, thresholds = DEFAULT_THRESHOLDS, preview = true) => {
    const game = await getGame(gameId);
    if (!game) {
        return { success: false, error: 'Game not found' };
    }
    
    if (!game.venueId) {
        return { success: false, error: 'Game has no venue assigned' };
    }
    
    // Skip series games
    if (game.isSeries) {
        return { 
            success: true, 
            action: 'SKIPPED', 
            reason: 'Series games are not recurring',
            game: { id: game.id, name: game.name }
        };
    }
    
    const dayOfWeek = getDayOfWeek(game.gameStartDateTime);
    if (!dayOfWeek) {
        return { success: false, error: 'Could not determine day of week' };
    }
    
    // Get all recurring games for this venue
    const allRecurringGames = await getRecurringGamesByVenue(game.venueId);
    
    // Filter to same day
    const sameDayCandidates = allRecurringGames.filter(rg => rg.dayOfWeek === dayOfWeek);
    
    // Find best match on same day
    const sameDayResult = findBestMatch(game, sameDayCandidates, thresholds);
    
    // Find best match across all days (for cross-day suggestions)
    const crossDayCandidates = allRecurringGames.filter(rg => rg.dayOfWeek !== dayOfWeek);
    const crossDayResult = findBestMatch(game, crossDayCandidates, thresholds);
    
    // Determine action
    let action = 'NO_CHANGE';
    let newRecurringGameId = game.recurringGameId;
    let confidence = game.recurringGameAssignmentConfidence || 0;
    let status = game.recurringGameAssignmentStatus || 'NOT_RECURRING';
    let matchDetails = null;
    
    // High confidence same-day match
    if (sameDayResult.match && sameDayResult.score >= thresholds.highConfidence) {
        if (game.recurringGameId !== sameDayResult.match.id) {
            action = 'REASSIGN';
            newRecurringGameId = sameDayResult.match.id;
            confidence = Math.min(sameDayResult.score / 100, 0.99);
            status = 'AUTO_ASSIGNED';
            matchDetails = {
                matchType: 'SAME_DAY_HIGH',
                matchedTo: sameDayResult.match.name,
                matchedToId: sameDayResult.match.id,
                score: sameDayResult.score,
                previousId: game.recurringGameId,
                scoringDetails: sameDayResult.details
            };
        } else {
            action = 'CONFIRM';
            matchDetails = {
                matchType: 'SAME_DAY_HIGH',
                matchedTo: sameDayResult.match.name,
                score: sameDayResult.score
            };
        }
    }
    // Medium confidence same-day match
    else if (sameDayResult.match && sameDayResult.score >= thresholds.mediumConfidence) {
        if (game.recurringGameId !== sameDayResult.match.id) {
            action = 'SUGGEST_REASSIGN';
            newRecurringGameId = sameDayResult.match.id;
            confidence = sameDayResult.score / 100;
            status = 'PENDING_ASSIGNMENT';
            matchDetails = {
                matchType: 'SAME_DAY_MEDIUM',
                matchedTo: sameDayResult.match.name,
                matchedToId: sameDayResult.match.id,
                score: sameDayResult.score,
                previousId: game.recurringGameId,
                needsReview: true
            };
        }
    }
    // Cross-day suggestion
    else if (crossDayResult.match && crossDayResult.score >= thresholds.crossDaySuggestion) {
        action = 'SUGGEST_CROSS_DAY';
        matchDetails = {
            matchType: 'CROSS_DAY',
            matchedTo: crossDayResult.match.name,
            matchedToId: crossDayResult.match.id,
            matchedToDay: crossDayResult.match.dayOfWeek,
            gameDay: dayOfWeek,
            score: crossDayResult.score,
            needsReview: true
        };
    }
    // No match - should unassign if currently assigned
    else if (game.recurringGameId) {
        action = 'SUGGEST_UNASSIGN';
        matchDetails = {
            matchType: 'NO_MATCH',
            previousId: game.recurringGameId,
            bestSameDayScore: sameDayResult.score,
            bestCrossDayScore: crossDayResult.score,
            needsReview: true
        };
    }
    
    const result = {
        success: true,
        game: {
            id: game.id,
            name: game.name,
            dayOfWeek,
            venueId: game.venueId,
            currentRecurringGameId: game.recurringGameId
        },
        action,
        newRecurringGameId: action === 'REASSIGN' ? newRecurringGameId : undefined,
        matchDetails,
        topCandidates: sameDayResult.allScores.map(s => ({
            id: s.candidate.id,
            name: s.candidate.name,
            score: s.score,
            dayOfWeek: s.candidate.dayOfWeek
        })),
        thresholdsUsed: thresholds
    };
    
    // Apply changes if not preview
    if (!preview && (action === 'REASSIGN' || action === 'CONFIRM')) {
        await updateGameRecurringAssignment(gameId, {
            recurringGameId: newRecurringGameId,
            recurringGameAssignmentStatus: status,
            recurringGameAssignmentConfidence: confidence,
            isRegular: newRecurringGameId ? true : false
        });
        result.applied = true;
    }
    
    return result;
};

/**
 * Re-resolve all games at a venue - OPTIMIZED VERSION
 * - Fetches recurring games once (not per game)
 * - Processes inline instead of calling reResolveGame
 * - Logs progress for debugging
 * - Limits details to avoid huge payloads
 */
const reResolveVenueGames = async (venueId, thresholds = DEFAULT_THRESHOLDS, preview = true) => {
    console.log(`[RECURRING_ADMIN] Starting reResolveVenueGames for venue ${venueId}, preview=${preview}`);
    
    // Fetch recurring games ONCE for the entire operation
    const recurringGames = await getRecurringGamesByVenue(venueId);
    console.log(`[RECURRING_ADMIN] Found ${recurringGames.length} recurring games`);
    
    // Group recurring games by day for efficient lookup
    const recurringByDay = {};
    for (const rg of recurringGames) {
        const day = rg.dayOfWeek || 'UNKNOWN';
        if (!recurringByDay[day]) recurringByDay[day] = [];
        recurringByDay[day].push(rg);
    }
    
    // Fetch games (limit for preview to avoid timeout)
    const maxGames = preview ? 500 : null;
    const games = await getGamesByVenue(venueId, maxGames);
    console.log(`[RECURRING_ADMIN] Processing ${games.length} games`);
    
    // Filter to non-series games
    const eligibleGames = games.filter(g => !g.isSeries && g.gameType !== 'CASH_GAME');
    console.log(`[RECURRING_ADMIN] ${eligibleGames.length} eligible games (non-series, non-cash)`);
    
    const results = {
        success: true,
        venueId,
        totalGames: games.length,
        eligibleGames: eligibleGames.length,
        processed: 0,
        actions: {
            REASSIGN: 0,
            CONFIRM: 0,
            SUGGEST_REASSIGN: 0,
            SUGGEST_CROSS_DAY: 0,
            SUGGEST_UNASSIGN: 0,
            NO_CHANGE: 0,
            SKIPPED: 0,
            ERROR: 0
        },
        details: [],
        preview
    };
    
    // Limit details to avoid huge payloads
    const MAX_DETAILS = 100;
    
    // Process games in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < eligibleGames.length; i += BATCH_SIZE) {
        const batch = eligibleGames.slice(i, i + BATCH_SIZE);
        
        console.log(`[RECURRING_ADMIN] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(eligibleGames.length/BATCH_SIZE)}`);
        
        for (const game of batch) {
            try {
                // Get game's day of week
                const gameDate = new Date(game.gameStartDateTime);
                const dayOfWeek = DAYS_OF_WEEK[gameDate.getUTCDay()];
                
                // Get same-day and all recurring games for matching
                const sameDayCandidates = recurringByDay[dayOfWeek] || [];
                const allCandidates = recurringGames;
                
                // Calculate scores
                const sameDayResult = findBestMatch(game, sameDayCandidates, thresholds);
                const crossDayResult = findBestMatch(game, allCandidates.filter(c => c.dayOfWeek !== dayOfWeek), thresholds);
                
                // Determine action
                let action = 'NO_CHANGE';
                let newRecurringGameId = null;
                let matchDetails = null;
                let status = null;
                let confidence = null;
                
                // High confidence same-day match
                if (sameDayResult.match && sameDayResult.score >= thresholds.highConfidence) {
                    newRecurringGameId = sameDayResult.match.id;
                    
                    if (game.recurringGameId === newRecurringGameId) {
                        action = 'CONFIRM';
                        status = 'AUTO_ASSIGNED';
                        confidence = sameDayResult.score / 100;
                        matchDetails = {
                            matchType: 'SAME_DAY_HIGH',
                            matchedTo: sameDayResult.match.name,
                            matchedToId: sameDayResult.match.id,
                            score: sameDayResult.score
                        };
                    } else {
                        action = 'REASSIGN';
                        status = 'AUTO_ASSIGNED';
                        confidence = sameDayResult.score / 100;
                        matchDetails = {
                            matchType: 'SAME_DAY_HIGH',
                            matchedTo: sameDayResult.match.name,
                            matchedToId: sameDayResult.match.id,
                            score: sameDayResult.score,
                            previousId: game.recurringGameId
                        };
                    }
                }
                // Medium confidence same-day match
                else if (sameDayResult.match && sameDayResult.score >= thresholds.mediumConfidence) {
                    if (game.recurringGameId === sameDayResult.match.id) {
                        action = 'CONFIRM';
                    } else {
                        action = 'SUGGEST_REASSIGN';
                        matchDetails = {
                            matchType: 'SAME_DAY_MEDIUM',
                            matchedTo: sameDayResult.match.name,
                            matchedToId: sameDayResult.match.id,
                            score: sameDayResult.score,
                            previousId: game.recurringGameId,
                            needsReview: true
                        };
                    }
                }
                // Cross-day suggestion
                else if (crossDayResult.match && crossDayResult.score >= thresholds.crossDaySuggestion) {
                    action = 'SUGGEST_CROSS_DAY';
                    matchDetails = {
                        matchType: 'CROSS_DAY',
                        matchedTo: crossDayResult.match.name,
                        matchedToId: crossDayResult.match.id,
                        matchedToDay: crossDayResult.match.dayOfWeek,
                        gameDay: dayOfWeek,
                        score: crossDayResult.score,
                        needsReview: true
                    };
                }
                // No match - suggest unassign if currently assigned
                else if (game.recurringGameId) {
                    action = 'SUGGEST_UNASSIGN';
                    matchDetails = {
                        matchType: 'NO_MATCH',
                        previousId: game.recurringGameId,
                        needsReview: true
                    };
                }
                
                results.processed++;
                results.actions[action]++;
                
                // Only add details for actionable items, and respect limit
                if (action !== 'NO_CHANGE' && action !== 'CONFIRM' && results.details.length < MAX_DETAILS) {
                    results.details.push({
                        gameId: game.id,
                        gameName: game.name,
                        action,
                        matchDetails
                    });
                }
                
                // Apply changes if not preview
                if (!preview && (action === 'REASSIGN')) {
                    await updateGameRecurringAssignment(game.id, {
                        recurringGameId: newRecurringGameId,
                        recurringGameAssignmentStatus: status,
                        recurringGameAssignmentConfidence: confidence,
                        isRegular: true
                    });
                }
                
            } catch (err) {
                results.actions.ERROR++;
                if (results.details.length < MAX_DETAILS) {
                    results.details.push({
                        gameId: game.id,
                        gameName: game.name,
                        action: 'ERROR',
                        error: err.message
                    });
                }
            }
        }
    }
    
    console.log(`[RECURRING_ADMIN] Completed: processed=${results.processed}, actions=`, results.actions);
    return results;
};

/**
 * Find duplicate RecurringGame entries - OPTIMIZED VERSION
 * Fetches games once and counts in memory
 */
const findDuplicates = async (venueId, similarityThreshold = 0.85) => {
    console.log(`[RECURRING_ADMIN] Finding duplicates for venue ${venueId} with threshold ${similarityThreshold}`);
    
    const recurringGames = await getRecurringGamesByVenue(venueId);
    console.log(`[RECURRING_ADMIN] Found ${recurringGames.length} recurring games`);
    
    // Fetch all games once and build count map
    const games = await getGamesByVenue(venueId);
    const gameCountMap = {};
    for (const game of games) {
        if (game.recurringGameId) {
            gameCountMap[game.recurringGameId] = (gameCountMap[game.recurringGameId] || 0) + 1;
        }
    }
    console.log(`[RECURRING_ADMIN] Built game count map from ${games.length} games`);
    
    const duplicateGroups = [];
    const processed = new Set();
    
    for (let i = 0; i < recurringGames.length; i++) {
        if (processed.has(recurringGames[i].id)) continue;
        
        const group = {
            canonical: recurringGames[i],
            duplicates: [],
            gameCountCanonical: gameCountMap[recurringGames[i].id] || 0,
            gameCountDuplicates: 0
        };
        
        const name1 = normalizeGameName(recurringGames[i].name);
        
        for (let j = i + 1; j < recurringGames.length; j++) {
            if (processed.has(recurringGames[j].id)) continue;
            
            // Must be same day and game type
            if (recurringGames[i].dayOfWeek !== recurringGames[j].dayOfWeek) continue;
            if ((recurringGames[i].gameType || 'TOURNAMENT') !== (recurringGames[j].gameType || 'TOURNAMENT')) continue;
            
            const name2 = normalizeGameName(recurringGames[j].name);
            const similarity = stringSimilarity.compareTwoStrings(name1, name2);
            
            if (similarity >= similarityThreshold) {
                const dupGameCount = gameCountMap[recurringGames[j].id] || 0;
                group.duplicates.push({
                    ...recurringGames[j],
                    similarity,
                    gameCount: dupGameCount
                });
                group.gameCountDuplicates += dupGameCount;
                processed.add(recurringGames[j].id);
            }
        }
        
        if (group.duplicates.length > 0) {
            duplicateGroups.push(group);
            processed.add(recurringGames[i].id);
        }
    }
    
    console.log(`[RECURRING_ADMIN] Found ${duplicateGroups.length} duplicate groups`);
    
    return {
        success: true,
        venueId,
        totalRecurringGames: recurringGames.length,
        duplicateGroups: duplicateGroups.length,
        duplicateEntries: duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0),
        groups: duplicateGroups.map(g => ({
            canonicalId: g.canonical.id,
            canonicalName: g.canonical.name,
            canonicalDayOfWeek: g.canonical.dayOfWeek,
            canonicalGameCount: g.gameCountCanonical,
            duplicates: g.duplicates.map(d => ({
                id: d.id,
                name: d.name,
                similarity: d.similarity,
                gameCount: d.gameCount
            })),
            totalGamesToReassign: g.gameCountDuplicates
        }))
    };
};

/**
 * Merge duplicate RecurringGame entries
 */
const mergeDuplicates = async (canonicalId, duplicateIds, preview = true) => {
    const canonical = await getRecurringGame(canonicalId);
    if (!canonical) {
        return { success: false, error: 'Canonical recurring game not found' };
    }
    
    const results = {
        canonicalId,
        canonicalName: canonical.name,
        duplicatesMerged: 0,
        gamesReassigned: 0,
        preview,
        details: []
    };
    
    for (const dupId of duplicateIds) {
        const games = await getGamesByRecurringGameId(dupId);
        
        results.details.push({
            duplicateId: dupId,
            gamesCount: games.length
        });
        
        if (!preview) {
            // Reassign all games to canonical
            for (const game of games) {
                await updateGameRecurringAssignment(game.id, {
                    recurringGameId: canonicalId,
                    recurringGameAssignmentStatus: 'AUTO_ASSIGNED',
                    recurringGameAssignmentConfidence: 0.95
                });
            }
            
            // Mark duplicate as inactive
            await markRecurringGameInactive(dupId, canonicalId);
        }
        
        results.gamesReassigned += games.length;
        results.duplicatesMerged++;
    }
    
    return { success: true, ...results };
};

/**
 * Get statistics about recurring games - OPTIMIZED VERSION
 */
const getRecurringGameStats = async (venueId) => {
    console.log(`[RECURRING_ADMIN] Getting stats for venue ${venueId}`);
    
    const recurringGames = await getRecurringGamesByVenue(venueId);
    console.log(`[RECURRING_ADMIN] Found ${recurringGames.length} recurring games`);
    
    const games = await getGamesByVenue(venueId);
    console.log(`[RECURRING_ADMIN] Found ${games.length} games`);
    
    // Count games per recurring game
    const gameCountMap = {};
    for (const game of games) {
        if (game.recurringGameId) {
            gameCountMap[game.recurringGameId] = (gameCountMap[game.recurringGameId] || 0) + 1;
        }
    }
    
    // Find orphans (recurring games with no assigned games)
    const orphans = recurringGames.filter(rg => !gameCountMap[rg.id]);
    
    // Find unassigned games (non-series, non-cash games without recurringGameId)
    const unassignedGames = games.filter(g => !g.recurringGameId && !g.isSeries && g.gameType !== 'CASH_GAME');
    
    console.log(`[RECURRING_ADMIN] Stats: orphans=${orphans.length}, unassigned=${unassignedGames.length}`);
    
    return {
        success: true,
        venueId,
        totalRecurringGames: recurringGames.length,
        totalGames: games.length,
        orphanedRecurringGames: orphans.length,
        orphans: orphans.map(o => ({
            id: o.id,
            name: o.name,
            dayOfWeek: o.dayOfWeek,
            createdAt: o.createdAt
        })),
        unassignedGames: unassignedGames.length,
        unassignedSample: unassignedGames.slice(0, 10).map(g => ({
            id: g.id,
            name: g.name,
            dayOfWeek: getDayOfWeek(g.gameStartDateTime)
        })),
        recurringGamesByDay: DAYS_OF_WEEK.reduce((acc, day) => {
            acc[day] = recurringGames.filter(rg => rg.dayOfWeek === day).length;
            return acc;
        }, {}),
        gameDistribution: recurringGames.map(rg => ({
            id: rg.id,
            name: rg.name,
            dayOfWeek: rg.dayOfWeek,
            gameCount: gameCountMap[rg.id] || 0
        })).sort((a, b) => b.gameCount - a.gameCount)
    };
};

/**
 * Cleanup orphaned RecurringGame entries
 */
const cleanupOrphans = async (venueId, preview = true) => {
    console.log(`[RECURRING_ADMIN] Cleanup orphans for venue ${venueId}, preview=${preview}`);
    
    const stats = await getRecurringGameStats(venueId);
    
    const results = {
        success: true,
        venueId,
        orphansFound: stats.orphanedRecurringGames,
        orphansRemoved: 0,
        preview,
        orphans: stats.orphans
    };
    
    if (!preview) {
        for (const orphan of stats.orphans) {
            await markRecurringGameInactive(orphan.id);
            results.orphansRemoved++;
        }
    }
    
    return results;
};

// ===================================================================
// LAMBDA HANDLER
// ===================================================================

const handler = async (event) => {
    console.log('[RECURRING_ADMIN] Event:', JSON.stringify(event, null, 2));
    
    const { typeName, fieldName, arguments: args } = event;
    const operation = fieldName || args?.operation;
    
    console.log('[RECURRING_ADMIN] Operation:', operation);
    
    let result;
    try {
        switch (operation) {
            // ===== EXISTING RECURRING GAME ADMIN OPERATIONS =====
            case 'reResolveGame':
            case 'reResolveRecurringAssignment':
                result = await reResolveGame(
                    args.gameId,
                    args.thresholds || DEFAULT_THRESHOLDS,
                    args.preview !== false
                );
                break;
                
            case 'reResolveVenueGames':
            case 'reResolveRecurringAssignmentsForVenue':
                result = await reResolveVenueGames(
                    args.venueId,
                    args.thresholds || DEFAULT_THRESHOLDS,
                    args.preview !== false
                );
                break;
                
            case 'findDuplicates':
            case 'findRecurringGameDuplicates':
                result = await findDuplicates(
                    args.venueId,
                    args.similarityThreshold || 0.85
                );
                break;
                
            case 'mergeDuplicates':
            case 'mergeRecurringGameDuplicates':
                result = await mergeDuplicates(
                    args.canonicalId,
                    args.duplicateIds,
                    args.preview !== false
                );
                break;
                
            case 'getStats':
            case 'getRecurringGameStats':
            case 'getRecurringGameVenueStats':
                result = await getRecurringGameStats(args.venueId);
                break;
                
            case 'cleanupOrphans':
            case 'cleanupOrphanedRecurringGames':
                result = await cleanupOrphans(
                    args.venueId,
                    args.preview !== false
                );
                break;
                
            // ===== INSTANCE TRACKING OPERATIONS =====
            case 'recordMissedInstance':
                result = await instanceHandlers.handleRecordMissedInstance(args.input);
                break;
                
            case 'updateInstanceStatus':
                result = await instanceHandlers.handleUpdateInstanceStatus(args.input);
                break;
                
            case 'detectRecurringGameGaps':
                result = await instanceHandlers.handleDetectGaps(args.input);
                break;
                
            case 'reconcileRecurringInstances':
                result = await instanceHandlers.handleReconcileInstances(args.input);
                break;
                
            case 'getVenueComplianceReport':
                result = await instanceHandlers.handleGetComplianceReport(args);
                break;
                
            case 'getWeekInstances':
                result = await instanceHandlers.handleGetWeekInstances(args);
                break;
                
            case 'listInstancesNeedingReview':
                result = await instanceHandlers.handleListInstancesNeedingReview(args);
                break;

            case 'bootstrapRecurringGames':
                result = await handleBootstrapRecurringGames(args.input);
                break;

            default:
                result = {
                    success: false,
                    error: `Unknown operation: ${operation}`
                };
        }
        
        console.log('[RECURRING_ADMIN] Result:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error('[RECURRING_ADMIN] Error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Export for testing and Lambda
module.exports = {
    handler,
    // Existing operations
    reResolveGame,
    reResolveVenueGames,
    findDuplicates,
    mergeDuplicates,
    getRecurringGameStats,
    cleanupOrphans,
    normalizeGameName,
    calculateMatchScore,
    DEFAULT_THRESHOLDS
};