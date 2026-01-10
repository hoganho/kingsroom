/**
 * admin-resolver.js
 * 
 * Admin operations for recurring game management.
 * Migrated from recurringGameAdmin Lambda to gameDataEnricher.
 * 
 * Operations:
 * - getRecurringGameVenueStats
 * - findRecurringGameDuplicates  
 * - reResolveRecurringAssignment
 * - reResolveRecurringAssignmentsForVenue
 * - mergeRecurringGameDuplicates
 * - cleanupOrphanedRecurringGames
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolvers/admin-resolver.js
 */

'use strict';

const { getDocClient, getTableName, QueryCommand, ScanCommand, UpdateCommand, BatchWriteCommand } = require('../utils/db-client');
const { normalizeGameName, calculateSimilarity } = require('../utils/game-name-utils');
const { resolveRecurringAssignment, getRecurringGamesByVenue, getRecurringGamesByVenueAndDay } = require('./recurring-resolver');

// ============================================================================
// VENUE STATS
// ============================================================================

/**
 * Get comprehensive stats about recurring games for a venue
 */
async function getRecurringGameVenueStats(venueId) {
    const docClient = getDocClient();
    const recurringGameTable = getTableName('RecurringGame');
    const gameTable = getTableName('Game');
    
    // Get all recurring games for venue
    const recurringGamesResult = await docClient.send(new ScanCommand({
        TableName: recurringGameTable,
        FilterExpression: 'venueId = :venueId AND (attribute_not_exists(isActive) OR isActive = :true)',
        ExpressionAttributeValues: {
            ':venueId': venueId,
            ':true': true,
        },
    }));
    
    const recurringGames = recurringGamesResult.Items || [];
    
    // Get all games for venue
    const gamesResult = await docClient.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :venueId',
        ExpressionAttributeValues: {
            ':venueId': venueId,
        },
    }));
    
    const games = gamesResult.Items || [];
    
    // Calculate stats
    const recurringGameIds = new Set(recurringGames.map(r => r.id));
    const gamesWithRecurring = games.filter(g => g.recurringGameId && recurringGameIds.has(g.recurringGameId));
    const unassignedGames = games.filter(g => !g.recurringGameId);
    
    // Count games per recurring game
    const gameCountMap = {};
    gamesWithRecurring.forEach(g => {
        gameCountMap[g.recurringGameId] = (gameCountMap[g.recurringGameId] || 0) + 1;
    });
    
    // Find orphaned recurring games (no games assigned)
    const orphans = recurringGames.filter(r => !gameCountMap[r.id] || gameCountMap[r.id] === 0);
    
    // Group by day
    const recurringGamesByDay = {};
    recurringGames.forEach(r => {
        const day = r.dayOfWeek || 'UNKNOWN';
        recurringGamesByDay[day] = (recurringGamesByDay[day] || 0) + 1;
    });
    
    // Game distribution (top recurring games by count)
    const gameDistribution = recurringGames
        .map(r => ({
            id: r.id,
            name: r.name || r.displayName,
            dayOfWeek: r.dayOfWeek,
            gameCount: gameCountMap[r.id] || 0,
        }))
        .sort((a, b) => b.gameCount - a.gameCount);
    
    return {
        success: true,
        venueId,
        totalRecurringGames: recurringGames.length,
        totalGames: games.length,
        orphanedRecurringGames: orphans.length,
        orphans: orphans.map(o => ({
            id: o.id,
            name: o.name || o.displayName,
            dayOfWeek: o.dayOfWeek,
            createdAt: o.createdAt,
        })),
        unassignedGames: unassignedGames.length,
        unassignedSample: unassignedGames.slice(0, 10).map(g => ({
            id: g.id,
            name: g.name,
            dayOfWeek: g.dayOfWeek,
        })),
        recurringGamesByDay: JSON.stringify(recurringGamesByDay),
        gameDistribution,
    };
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Find potential duplicate recurring games based on name similarity
 */
async function findRecurringGameDuplicates(venueId, similarityThreshold = 0.8) {
    const recurringGames = await getRecurringGamesByVenue(venueId);
    
    if (!recurringGames || recurringGames.length === 0) {
        return {
            success: true,
            venueId,
            totalRecurringGames: 0,
            duplicateGroups: 0,
            duplicateEntries: 0,
            groups: [],
        };
    }
    
    // Get game counts for each recurring game
    const docClient = getDocClient();
    const gameTable = getTableName('Game');
    
    const gameCountMap = {};
    for (const rg of recurringGames) {
        const result = await docClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byRecurringGame',
            KeyConditionExpression: 'recurringGameId = :rgId',
            ExpressionAttributeValues: { ':rgId': rg.id },
            Select: 'COUNT',
        }));
        gameCountMap[rg.id] = result.Count || 0;
    }
    
    // Group by day of week first
    const byDay = {};
    recurringGames.forEach(rg => {
        const day = rg.dayOfWeek || 'UNKNOWN';
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(rg);
    });
    
    // Find duplicates within each day
    const groups = [];
    const processed = new Set();
    
    for (const [day, dayGames] of Object.entries(byDay)) {
        for (let i = 0; i < dayGames.length; i++) {
            if (processed.has(dayGames[i].id)) continue;
            
            const canonical = dayGames[i];
            const duplicates = [];
            
            for (let j = i + 1; j < dayGames.length; j++) {
                if (processed.has(dayGames[j].id)) continue;
                
                const similarity = calculateSimilarity(canonical.name, dayGames[j].name);
                
                if (similarity >= similarityThreshold) {
                    duplicates.push({
                        id: dayGames[j].id,
                        name: dayGames[j].name || dayGames[j].displayName,
                        similarity,
                        gameCount: gameCountMap[dayGames[j].id] || 0,
                    });
                    processed.add(dayGames[j].id);
                }
            }
            
            if (duplicates.length > 0) {
                groups.push({
                    canonicalId: canonical.id,
                    canonicalName: canonical.name || canonical.displayName,
                    canonicalDayOfWeek: canonical.dayOfWeek,
                    canonicalGameCount: gameCountMap[canonical.id] || 0,
                    duplicates,
                    totalGamesToReassign: duplicates.reduce((sum, d) => sum + d.gameCount, 0),
                });
                processed.add(canonical.id);
            }
        }
    }
    
    return {
        success: true,
        venueId,
        totalRecurringGames: recurringGames.length,
        duplicateGroups: groups.length,
        duplicateEntries: groups.reduce((sum, g) => sum + g.duplicates.length, 0),
        groups,
    };
}

// ============================================================================
// MERGE DUPLICATES
// ============================================================================

/**
 * Merge duplicate recurring games into a canonical one
 */
async function mergeRecurringGameDuplicates(canonicalId, duplicateIds, preview = true) {
    const docClient = getDocClient();
    const recurringGameTable = getTableName('RecurringGame');
    const gameTable = getTableName('Game');
    
    // Get canonical recurring game
    const canonicalResult = await docClient.send(new QueryCommand({
        TableName: recurringGameTable,
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': canonicalId },
    }));
    
    if (!canonicalResult.Items || canonicalResult.Items.length === 0) {
        return { success: false, error: 'Canonical recurring game not found' };
    }
    
    const canonical = canonicalResult.Items[0];
    const details = [];
    let totalGamesReassigned = 0;
    
    for (const dupId of duplicateIds) {
        // Get games assigned to this duplicate
        const gamesResult = await docClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byRecurringGame',
            KeyConditionExpression: 'recurringGameId = :rgId',
            ExpressionAttributeValues: { ':rgId': dupId },
        }));
        
        const games = gamesResult.Items || [];
        details.push({ duplicateId: dupId, gamesCount: games.length });
        totalGamesReassigned += games.length;
        
        if (!preview) {
            // Reassign games to canonical
            for (const game of games) {
                await docClient.send(new UpdateCommand({
                    TableName: gameTable,
                    Key: { id: game.id },
                    UpdateExpression: 'SET recurringGameId = :canonicalId, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':canonicalId': canonicalId,
                        ':now': new Date().toISOString(),
                    },
                }));
            }
            
            // Deactivate the duplicate recurring game
            await docClient.send(new UpdateCommand({
                TableName: recurringGameTable,
                Key: { id: dupId },
                UpdateExpression: 'SET isActive = :false, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':false': false,
                    ':now': new Date().toISOString(),
                },
            }));
        }
    }
    
    return {
        success: true,
        canonicalId,
        canonicalName: canonical.name || canonical.displayName,
        duplicatesMerged: duplicateIds.length,
        gamesReassigned: totalGamesReassigned,
        preview,
        details,
    };
}

// ============================================================================
// CLEANUP ORPHANS
// ============================================================================

/**
 * Cleanup orphaned recurring games (templates with no games assigned)
 */
async function cleanupOrphanedRecurringGames(venueId, preview = true) {
    const stats = await getRecurringGameVenueStats(venueId);
    
    if (!preview && stats.orphans.length > 0) {
        const docClient = getDocClient();
        const recurringGameTable = getTableName('RecurringGame');
        
        for (const orphan of stats.orphans) {
            await docClient.send(new UpdateCommand({
                TableName: recurringGameTable,
                Key: { id: orphan.id },
                UpdateExpression: 'SET isActive = :false, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':false': false,
                    ':now': new Date().toISOString(),
                },
            }));
        }
    }
    
    return {
        success: true,
        venueId,
        orphansFound: stats.orphans.length,
        orphansRemoved: preview ? 0 : stats.orphans.length,
        preview,
        orphans: stats.orphans,
    };
}

// ============================================================================
// RE-RESOLVE ASSIGNMENTS
// ============================================================================

/**
 * Re-resolve recurring game assignment for a single game
 */
async function reResolveRecurringAssignment(gameId, thresholds = {}, preview = true) {
    const docClient = getDocClient();
    const gameTable = getTableName('Game');
    
    // Get the game
    const gameResult = await docClient.send(new QueryCommand({
        TableName: gameTable,
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': gameId },
    }));
    
    if (!gameResult.Items || gameResult.Items.length === 0) {
        return { success: false, error: 'Game not found' };
    }
    
    const game = gameResult.Items[0];
    
    // Run resolver
    const result = await resolveRecurringAssignment({
        game,
        forceResolve: true,
        thresholds,
        dryRun: preview,
    });
    
    return {
        success: true,
        gameId,
        gameName: game.name,
        previousRecurringGameId: game.recurringGameId,
        ...result,
        preview,
    };
}

/**
 * Re-resolve recurring game assignments for all games at a venue
 */
async function reResolveRecurringAssignmentsForVenue(venueId, thresholds = {}, preview = true) {
    const docClient = getDocClient();
    const gameTable = getTableName('Game');
    
    // Get all games for venue
    const gamesResult = await docClient.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :venueId',
        ExpressionAttributeValues: { ':venueId': venueId },
    }));
    
    const games = gamesResult.Items || [];
    
    const actions = {
        REASSIGN: 0,
        CONFIRM: 0,
        SUGGEST_REASSIGN: 0,
        SUGGEST_CROSS_DAY: 0,
        SUGGEST_UNASSIGN: 0,
        NO_CHANGE: 0,
        SKIPPED: 0,
        ERROR: 0,
    };
    
    const details = [];
    let processed = 0;
    
    const {
        highConfidence = 85,
        mediumConfidence = 65,
        crossDaySuggestion = 75,
    } = thresholds;
    
    for (const game of games) {
        try {
            const result = await resolveRecurringAssignment({
                game,
                forceResolve: true,
                thresholds: { highConfidence, mediumConfidence },
                dryRun: preview,
            });
            
            processed++;
            
            let action = 'NO_CHANGE';
            let matchDetails = null;
            
            if (result.matched) {
                const score = result.matchScore || 0;
                const previousId = game.recurringGameId;
                const newId = result.recurringGameId;
                
                if (previousId !== newId) {
                    if (score >= highConfidence) {
                        action = preview ? 'SUGGEST_REASSIGN' : 'REASSIGN';
                    } else if (score >= mediumConfidence) {
                        action = 'SUGGEST_REASSIGN';
                    }
                } else if (score >= highConfidence) {
                    action = 'CONFIRM';
                }
                
                matchDetails = {
                    matchedTo: result.recurringGameName,
                    score,
                    previousId,
                    newId,
                };
            } else if (result.candidates && result.candidates.length > 0) {
                const topCandidate = result.candidates[0];
                if (topCandidate.score >= crossDaySuggestion) {
                    action = 'SUGGEST_CROSS_DAY';
                    matchDetails = {
                        matchedTo: topCandidate.name,
                        score: topCandidate.score,
                        dayOfWeek: topCandidate.dayOfWeek,
                    };
                }
            }
            
            actions[action]++;
            details.push({
                gameId: game.id,
                gameName: game.name,
                action,
                matchDetails,
            });
            
        } catch (err) {
            actions.ERROR++;
            details.push({
                gameId: game.id,
                gameName: game.name,
                action: 'ERROR',
                error: err.message,
            });
        }
    }
    
    return {
        success: true,
        venueId,
        totalGames: games.length,
        eligibleGames: games.length,
        processed,
        actions,
        details,
        preview,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getRecurringGameVenueStats,
    findRecurringGameDuplicates,
    mergeRecurringGameDuplicates,
    cleanupOrphanedRecurringGames,
    reResolveRecurringAssignment,
    reResolveRecurringAssignmentsForVenue,
};
