/**
 * instance-manager.js
 * 
 * Instance tracking operations for recurring game compliance.
 * Manages RecurringGameInstance records for schedule compliance tracking.
 * 
 * Operations:
 * - detectRecurringGameGaps
 * - reconcileRecurringInstances
 * - recordMissedInstance
 * - updateInstanceStatus
 * - getVenueComplianceReport
 * - getWeekInstances
 * - listInstancesNeedingReview
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolvers/instance-manager.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, PutCommand, UpdateCommand, ScanCommand } = require('../utils/db-client');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get week key from date (YYYY-Www format)
 */
function getWeekKey(dateStr) {
    const date = new Date(dateStr);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get day of week from date
 */
function getDayOfWeek(dateStr) {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const date = new Date(dateStr + 'T12:00:00Z');
    return days[date.getUTCDay()];
}

/**
 * Generate all expected dates for a recurring game within a date range
 */
function getExpectedDates(dayOfWeek, startDate, endDate) {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const targetDayIndex = days.indexOf(dayOfWeek);
    if (targetDayIndex === -1) return [];
    
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Find first occurrence
    let current = new Date(start);
    while (current.getDay() !== targetDayIndex) {
        current.setDate(current.getDate() + 1);
    }
    
    // Collect all occurrences
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
    }
    
    return dates;
}

// ============================================================================
// DETECT GAPS
// ============================================================================

/**
 * Detect gaps in recurring game instances
 */
async function detectRecurringGameGaps(venueId, startDate, endDate, createInstances = false) {
    const docClient = getDocClient();
    const recurringGameTable = getTableName('RecurringGame');
    const instanceTable = getTableName('RecurringGameInstance');
    const gameTable = getTableName('Game');
    
    // Get active recurring games for venue
    const rgResult = await docClient.send(new ScanCommand({
        TableName: recurringGameTable,
        FilterExpression: 'venueId = :venueId AND (attribute_not_exists(isActive) OR isActive = :true)',
        ExpressionAttributeValues: {
            ':venueId': venueId,
            ':true': true,
        },
    }));
    
    const recurringGames = rgResult.Items || [];
    const gaps = [];
    let instancesCreated = 0;
    
    for (const rg of recurringGames) {
        const expectedDates = getExpectedDates(rg.dayOfWeek, startDate, endDate);
        
        for (const expectedDate of expectedDates) {
            const weekKey = getWeekKey(expectedDate);
            
            // Check if instance exists
            const instanceResult = await docClient.send(new QueryCommand({
                TableName: instanceTable,
                IndexName: 'byRecurringGame',
                KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
                ExpressionAttributeValues: {
                    ':rgId': rg.id,
                    ':date': expectedDate,
                },
            }));
            
            if (!instanceResult.Items || instanceResult.Items.length === 0) {
                // Check if there's a game on this date
                const gameResult = await docClient.send(new QueryCommand({
                    TableName: gameTable,
                    IndexName: 'byRecurringGame',
                    KeyConditionExpression: 'recurringGameId = :rgId',
                    FilterExpression: 'begins_with(#date, :datePrefix)',
                    ExpressionAttributeNames: { '#date': 'date' },
                    ExpressionAttributeValues: {
                        ':rgId': rg.id,
                        ':datePrefix': expectedDate,
                    },
                }));
                
                const matchedGame = gameResult.Items?.[0];
                
                gaps.push({
                    recurringGameId: rg.id,
                    recurringGameName: rg.name || rg.displayName,
                    expectedDate,
                    dayOfWeek: rg.dayOfWeek,
                    weekKey,
                    possibleMatchGameId: matchedGame?.id,
                    possibleMatchGameName: matchedGame?.name,
                    matchConfidence: matchedGame ? 0.9 : undefined,
                });
                
                // Create UNKNOWN instance if requested
                if (createInstances) {
                    await docClient.send(new PutCommand({
                        TableName: instanceTable,
                        Item: {
                            id: uuidv4(),
                            recurringGameId: rg.id,
                            gameId: matchedGame?.id,
                            expectedDate,
                            dayOfWeek: rg.dayOfWeek,
                            weekKey,
                            venueId,
                            entityId: rg.entityId,
                            status: matchedGame ? 'CONFIRMED' : 'UNKNOWN',
                            needsReview: !matchedGame,
                            reviewReason: matchedGame ? null : 'Auto-created gap instance',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                    }));
                    instancesCreated++;
                }
            }
        }
    }
    
    return {
        success: true,
        venueId,
        startDate,
        endDate,
        weeksAnalyzed: Math.ceil((new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000)),
        recurringGamesChecked: recurringGames.length,
        expectedOccurrences: recurringGames.reduce((sum, rg) => sum + getExpectedDates(rg.dayOfWeek, startDate, endDate).length, 0),
        confirmedOccurrences: 0, // Would need to count confirmed instances
        gapsFound: gaps.length,
        gaps,
        instancesCreated: createInstances ? instancesCreated : undefined,
    };
}

// ============================================================================
// RECONCILE INSTANCES
// ============================================================================

/**
 * Reconcile recurring instances with actual games
 */
async function reconcileRecurringInstances(venueId, startDate, endDate, preview = true) {
    const docClient = getDocClient();
    const gameTable = getTableName('Game');
    const instanceTable = getTableName('RecurringGameInstance');
    
    // Get games in date range
    const gamesResult = await docClient.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :venueId',
        FilterExpression: '#date BETWEEN :start AND :end',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: {
            ':venueId': venueId,
            ':start': startDate,
            ':end': endDate,
        },
    }));
    
    const games = gamesResult.Items || [];
    const details = [];
    let instancesCreated = 0;
    let instancesUpdated = 0;
    let orphanGames = 0;
    
    for (const game of games) {
        if (!game.recurringGameId) {
            orphanGames++;
            details.push({
                gameId: game.id,
                gameName: game.name,
                gameDate: game.date?.split('T')[0],
                action: 'ORPHAN',
            });
            continue;
        }
        
        const gameDate = game.date?.split('T')[0];
        const weekKey = getWeekKey(gameDate);
        
        // Check for existing instance
        const instanceResult = await docClient.send(new QueryCommand({
            TableName: instanceTable,
            IndexName: 'byRecurringGame',
            KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
            ExpressionAttributeValues: {
                ':rgId': game.recurringGameId,
                ':date': gameDate,
            },
        }));
        
        if (instanceResult.Items && instanceResult.Items.length > 0) {
            // Update existing instance
            const instance = instanceResult.Items[0];
            if (instance.gameId !== game.id || instance.status !== 'CONFIRMED') {
                if (!preview) {
                    await docClient.send(new UpdateCommand({
                        TableName: instanceTable,
                        Key: { id: instance.id },
                        UpdateExpression: 'SET gameId = :gameId, #status = :status, updatedAt = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':gameId': game.id,
                            ':status': 'CONFIRMED',
                            ':now': new Date().toISOString(),
                        },
                    }));
                }
                instancesUpdated++;
                details.push({
                    gameId: game.id,
                    gameName: game.name,
                    gameDate,
                    action: 'UPDATED',
                    instanceId: instance.id,
                    recurringGameId: game.recurringGameId,
                });
            }
        } else {
            // Create new instance
            if (!preview) {
                await docClient.send(new PutCommand({
                    TableName: instanceTable,
                    Item: {
                        id: uuidv4(),
                        recurringGameId: game.recurringGameId,
                        gameId: game.id,
                        expectedDate: gameDate,
                        dayOfWeek: getDayOfWeek(gameDate),
                        weekKey,
                        venueId,
                        entityId: game.entityId,
                        status: 'CONFIRMED',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                }));
            }
            instancesCreated++;
            details.push({
                gameId: game.id,
                gameName: game.name,
                gameDate,
                action: 'CREATED',
                recurringGameId: game.recurringGameId,
            });
        }
    }
    
    return {
        success: true,
        venueId,
        gamesAnalyzed: games.length,
        instancesCreated,
        instancesUpdated,
        orphanGames,
        preview,
        details,
    };
}

// ============================================================================
// RECORD MISSED INSTANCE
// ============================================================================

/**
 * Record a missed/cancelled/skipped instance
 */
async function recordMissedInstance(recurringGameId, expectedDate, status, reason, notes) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    const recurringGameTable = getTableName('RecurringGame');
    
    // Get recurring game for context
    const rgResult = await docClient.send(new QueryCommand({
        TableName: recurringGameTable,
        KeyConditionExpression: 'id = :id',
        ExpressionAttributeValues: { ':id': recurringGameId },
    }));
    
    const recurringGame = rgResult.Items?.[0];
    if (!recurringGame) {
        return { success: false, message: 'Recurring game not found', wasCreated: false };
    }
    
    const weekKey = getWeekKey(expectedDate);
    
    // Check for existing instance
    const existingResult = await docClient.send(new QueryCommand({
        TableName: instanceTable,
        IndexName: 'byRecurringGame',
        KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
        ExpressionAttributeValues: {
            ':rgId': recurringGameId,
            ':date': expectedDate,
        },
    }));
    
    let instance;
    let wasCreated = false;
    
    if (existingResult.Items && existingResult.Items.length > 0) {
        // Update existing
        instance = existingResult.Items[0];
        await docClient.send(new UpdateCommand({
            TableName: instanceTable,
            Key: { id: instance.id },
            UpdateExpression: 'SET #status = :status, cancellationReason = :reason, notes = :notes, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': status,
                ':reason': reason,
                ':notes': notes,
                ':now': new Date().toISOString(),
            },
        }));
        instance.status = status;
        instance.cancellationReason = reason;
        instance.notes = notes;
    } else {
        // Create new
        instance = {
            id: uuidv4(),
            recurringGameId,
            expectedDate,
            dayOfWeek: recurringGame.dayOfWeek,
            weekKey,
            venueId: recurringGame.venueId,
            entityId: recurringGame.entityId,
            status,
            cancellationReason: reason,
            notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await docClient.send(new PutCommand({
            TableName: instanceTable,
            Item: instance,
        }));
        wasCreated = true;
    }
    
    return {
        success: true,
        message: wasCreated ? 'Instance created' : 'Instance updated',
        wasCreated,
        instance,
    };
}

// ============================================================================
// UPDATE INSTANCE STATUS
// ============================================================================

/**
 * Update an existing instance's status
 */
async function updateInstanceStatus(instanceId, status, reason, notes) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    await docClient.send(new UpdateCommand({
        TableName: instanceTable,
        Key: { id: instanceId },
        UpdateExpression: 'SET #status = :status, cancellationReason = :reason, notes = :notes, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':status': status,
            ':reason': reason,
            ':notes': notes,
            ':now': new Date().toISOString(),
        },
    }));
    
    return {
        success: true,
        message: 'Instance updated',
        instance: { id: instanceId, status, cancellationReason: reason, notes },
    };
}

// ============================================================================
// COMPLIANCE REPORT
// ============================================================================

/**
 * Get compliance report for a venue
 */
async function getVenueComplianceReport(venueId, startDate, endDate) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    // Get all instances in date range
    const instancesResult = await docClient.send(new QueryCommand({
        TableName: instanceTable,
        IndexName: 'byVenueDate',
        KeyConditionExpression: 'venueId = :venueId AND expectedDate BETWEEN :start AND :end',
        ExpressionAttributeValues: {
            ':venueId': venueId,
            ':start': startDate,
            ':end': endDate,
        },
    }));
    
    const instances = instancesResult.Items || [];
    
    // Count by status
    const statusCounts = {
        CONFIRMED: 0,
        CANCELLED: 0,
        SKIPPED: 0,
        UNKNOWN: 0,
        NO_SHOW: 0,
    };
    
    let needsReviewCount = 0;
    const weekSummaries = {};
    
    for (const instance of instances) {
        statusCounts[instance.status] = (statusCounts[instance.status] || 0) + 1;
        if (instance.needsReview) needsReviewCount++;
        
        // Group by week
        const weekKey = instance.weekKey || getWeekKey(instance.expectedDate);
        if (!weekSummaries[weekKey]) {
            weekSummaries[weekKey] = {
                weekKey,
                confirmedCount: 0,
                cancelledCount: 0,
                skippedCount: 0,
                unknownCount: 0,
                noShowCount: 0,
                totalExpected: 0,
                instances: [],
            };
        }
        
        weekSummaries[weekKey].totalExpected++;
        weekSummaries[weekKey][`${instance.status.toLowerCase()}Count`]++;
        weekSummaries[weekKey].instances.push(instance);
    }
    
    // Calculate compliance rates
    const total = instances.length;
    const confirmed = statusCounts.CONFIRMED;
    
    for (const week of Object.values(weekSummaries)) {
        week.complianceRate = week.totalExpected > 0 ? week.confirmedCount / week.totalExpected : 0;
    }
    
    return {
        success: true,
        venueId,
        startDate,
        endDate,
        totalExpected: total,
        totalConfirmed: statusCounts.CONFIRMED,
        totalCancelled: statusCounts.CANCELLED,
        totalSkipped: statusCounts.SKIPPED,
        totalUnknown: statusCounts.UNKNOWN,
        totalNoShow: statusCounts.NO_SHOW,
        overallComplianceRate: total > 0 ? confirmed / total : 0,
        weekSummaries: Object.values(weekSummaries).sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
        needsReviewCount,
        unknownCount: statusCounts.UNKNOWN,
    };
}

// ============================================================================
// GET WEEK INSTANCES
// ============================================================================

/**
 * Get instances for a specific week
 */
async function getWeekInstances(venueOrEntityId, weekKey) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    const result = await docClient.send(new QueryCommand({
        TableName: instanceTable,
        IndexName: 'byWeek',
        KeyConditionExpression: 'weekKey = :weekKey',
        FilterExpression: 'venueId = :id OR entityId = :id',
        ExpressionAttributeValues: {
            ':weekKey': weekKey,
            ':id': venueOrEntityId,
        },
    }));
    
    return {
        weekKey,
        instances: result.Items || [],
        totalCount: result.Count || 0,
    };
}

// ============================================================================
// LIST INSTANCES NEEDING REVIEW
// ============================================================================

/**
 * List instances that need review
 */
async function listInstancesNeedingReview(venueOrEntityId, limit = 50, nextToken) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    const params = {
        TableName: instanceTable,
        FilterExpression: 'needsReview = :true AND (venueId = :id OR entityId = :id)',
        ExpressionAttributeValues: {
            ':true': true,
            ':id': venueOrEntityId,
        },
        Limit: limit,
    };
    
    if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const result = await docClient.send(new ScanCommand(params));
    
    return {
        items: result.Items || [],
        nextToken: result.LastEvaluatedKey 
            ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
            : null,
        totalCount: result.Count,
    };
}

// ============================================================================
// CREATE CONFIRMED INSTANCE (for resolver use)
// ============================================================================

/**
 * Create a confirmed instance when a game is assigned to a template
 */
async function createConfirmedInstance({ recurringGame, game }) {
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    const gameDate = game.date?.split('T')[0];
    const weekKey = getWeekKey(gameDate);
    
    // Check for existing
    const existingResult = await docClient.send(new QueryCommand({
        TableName: instanceTable,
        IndexName: 'byRecurringGame',
        KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
        ExpressionAttributeValues: {
            ':rgId': recurringGame.id,
            ':date': gameDate,
        },
    }));
    
    if (existingResult.Items && existingResult.Items.length > 0) {
        // Update existing
        const instance = existingResult.Items[0];
        await docClient.send(new UpdateCommand({
            TableName: instanceTable,
            Key: { id: instance.id },
            UpdateExpression: 'SET gameId = :gameId, #status = :status, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':gameId': game.id,
                ':status': 'CONFIRMED',
                ':now': new Date().toISOString(),
            },
        }));
        return instance.id;
    }
    
    // Create new
    const instanceId = uuidv4();
    await docClient.send(new PutCommand({
        TableName: instanceTable,
        Item: {
            id: instanceId,
            recurringGameId: recurringGame.id,
            gameId: game.id,
            expectedDate: gameDate,
            dayOfWeek: recurringGame.dayOfWeek,
            weekKey,
            venueId: recurringGame.venueId,
            entityId: recurringGame.entityId,
            status: 'CONFIRMED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    }));
    
    return instanceId;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Gap detection
    detectRecurringGameGaps,
    
    // Reconciliation
    reconcileRecurringInstances,
    
    // Manual instance management
    recordMissedInstance,
    updateInstanceStatus,
    
    // Reporting
    getVenueComplianceReport,
    getWeekInstances,
    listInstancesNeedingReview,
    
    // For resolver use
    createConfirmedInstance,
    
    // Utilities
    getWeekKey,
    getDayOfWeek,
    getExpectedDates,
};
