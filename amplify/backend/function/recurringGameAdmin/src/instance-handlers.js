/**
 * instance-handlers.js
 * 
 * SELF-CONTAINED handlers for RecurringGameInstance operations
 * All DynamoDB operations are inline - no external dependencies needed
 * 
 * Add this to your recurringGameAdmin lambda
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    QueryCommand, 
    ScanCommand, 
    PutCommand,
    UpdateCommand,
    GetCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

// Table names from environment
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const RECURRING_GAME_TABLE = process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME;
const VENUE_TABLE = process.env.API_KINGSROOM_VENUETABLE_NAME;
const INSTANCE_TABLE = process.env.API_KINGSROOM_RECURRINGGAMEINSTANCETABLE_NAME;

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Get ISO week key for a date (e.g., "2026-W02")
 */
const getWeekKey = (dateStr) => {
    const date = new Date(dateStr);
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/**
 * Get day of week from ISO date string
 */
const getDayOfWeek = (dateStr) => {
    const date = new Date(dateStr);
    return DAYS_OF_WEEK[date.getUTCDay()];
};

/**
 * Generate all dates for a day of week within a range
 */
const getDatesForDayInRange = (dayOfWeek, startDate, endDate) => {
    const dates = [];
    const dayIndex = DAYS_OF_WEEK.indexOf(dayOfWeek);
    if (dayIndex === -1) return dates;
    
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    // Find first occurrence of the day
    while (current.getUTCDay() !== dayIndex && current <= end) {
        current.setUTCDate(current.getUTCDate() + 1);
    }
    
    // Collect all occurrences
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setUTCDate(current.getUTCDate() + 7);
    }
    
    return dates;
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

const getRecurringGame = async (recurringGameId) => {
    const result = await docClient.send(new GetCommand({
        TableName: RECURRING_GAME_TABLE,
        Key: { id: recurringGameId }
    }));
    return result.Item;
};

const getRecurringGamesByVenue = async (venueId) => {
    const items = [];
    let lastKey = null;
    
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
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const result = await docClient.send(new QueryCommand(params));
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    return items;
};

const getGamesByVenueAndDateRange = async (venueId, startDate, endDate) => {
    const items = [];
    let lastKey = null;
    
    do {
        const params = {
            TableName: GAME_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :vid',
            ExpressionAttributeValues: {
                ':vid': venueId
            }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const result = await docClient.send(new QueryCommand(params));
        
        // Filter by date range
        const filtered = (result.Items || []).filter(game => {
            if (!game.gameStartDateTime) return false;
            const gameDate = game.gameStartDateTime.split('T')[0];
            return gameDate >= startDate && gameDate <= endDate;
        });
        
        items.push(...filtered);
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    return items;
};

const findInstanceByDate = async (recurringGameId, expectedDate) => {
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: INSTANCE_TABLE,
            IndexName: 'byRecurringGameAndDate',
            KeyConditionExpression: 'recurringGameId = :rgid AND expectedDate = :date',
            ExpressionAttributeValues: {
                ':rgid': recurringGameId,
                ':date': expectedDate
            },
            Limit: 1
        }));
        return result.Items?.[0] || null;
    } catch (error) {
        // Index might not exist yet
        console.warn('[INSTANCE] byRecurringGameAndDate index query failed, falling back to scan');
        const result = await docClient.send(new ScanCommand({
            TableName: INSTANCE_TABLE,
            FilterExpression: 'recurringGameId = :rgid AND expectedDate = :date',
            ExpressionAttributeValues: {
                ':rgid': recurringGameId,
                ':date': expectedDate
            },
            Limit: 1
        }));
        return result.Items?.[0] || null;
    }
};

const getInstancesByVenueAndDateRange = async (venueId, startDate, endDate) => {
    const items = [];
    let lastKey = null;
    
    do {
        const params = {
            TableName: INSTANCE_TABLE,
            IndexName: 'byVenueInstance',
            KeyConditionExpression: 'venueId = :vid',
            FilterExpression: 'expectedDate BETWEEN :start AND :end',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':start': startDate,
                ':end': endDate
            }
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        
        const result = await docClient.send(new QueryCommand(params));
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    return items;
};

const createInstance = async (instanceData) => {
    const now = new Date().toISOString();
    const item = {
        id: uuidv4(),
        __typename: 'RecurringGameInstance',
        ...instanceData,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now()
    };
    
    await docClient.send(new PutCommand({
        TableName: INSTANCE_TABLE,
        Item: item
    }));
    
    return item;
};

const updateInstance = async (instanceId, updates) => {
    const updateExpressions = [];
    const expressionNames = {};
    const expressionValues = {};
    
    Object.entries(updates).forEach(([key, value]) => {
        if (key === 'id' || key === '_version' || value === undefined) return;
        updateExpressions.push(`#${key} = :${key}`);
        expressionNames[`#${key}`] = key;
        expressionValues[`:${key}`] = value;
    });
    
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();
    
    updateExpressions.push('#lastChangedAt = :lastChangedAt');
    expressionNames['#lastChangedAt'] = '_lastChangedAt';
    expressionValues[':lastChangedAt'] = Date.now();
    
    const result = await docClient.send(new UpdateCommand({
        TableName: INSTANCE_TABLE,
        Key: { id: instanceId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW'
    }));
    
    return result.Attributes;
};

// ===================================================================
// MUTATION HANDLERS
// ===================================================================

/**
 * Handle recordMissedInstance mutation
 */
const handleRecordMissedInstance = async (input) => {
    const { recurringGameId, expectedDate, status, cancellationReason, notes } = input;
    
    console.log('[INSTANCE] Recording missed instance:', { recurringGameId, expectedDate, status });
    
    try {
        const validStatuses = ['CANCELLED', 'SKIPPED', 'NO_SHOW', 'UNKNOWN'];
        if (!validStatuses.includes(status)) {
            return {
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
                wasCreated: false
            };
        }
        
        // Get recurring game details
        const recurringGame = await getRecurringGame(recurringGameId);
        if (!recurringGame) {
            return {
                success: false,
                message: 'Recurring game not found',
                wasCreated: false
            };
        }
        
        // Check if instance already exists
        const existing = await findInstanceByDate(recurringGameId, expectedDate);
        
        if (existing) {
            const updated = await updateInstance(existing.id, {
                status,
                cancellationReason,
                notes,
                source: 'MANUAL'
            });
            
            return {
                success: true,
                message: 'Updated existing instance',
                instance: updated,
                wasCreated: false
            };
        }
        
        // Create new instance
        const instance = await createInstance({
            recurringGameId,
            recurringGameName: recurringGame.name,
            expectedDate,
            dayOfWeek: recurringGame.dayOfWeek,
            weekKey: getWeekKey(expectedDate),
            venueId: recurringGame.venueId,
            entityId: recurringGame.entityId,
            status,
            cancellationReason,
            notes,
            source: 'MANUAL',
            needsReview: false
        });
        
        return {
            success: true,
            message: `Created ${status} instance for ${expectedDate}`,
            instance,
            wasCreated: true
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error recording missed instance:', error);
        return {
            success: false,
            message: error.message,
            wasCreated: false
        };
    }
};

/**
 * Handle updateInstanceStatus mutation
 */
const handleUpdateInstanceStatus = async (input) => {
    const { instanceId, status, cancellationReason, notes, adminNotes } = input;
    
    console.log('[INSTANCE] Updating instance status:', { instanceId, status });
    
    try {
        const updated = await updateInstance(instanceId, {
            status,
            cancellationReason,
            notes,
            adminNotes
        });
        
        return {
            success: true,
            message: `Updated instance status to ${status}`,
            instance: updated
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error updating instance:', error);
        return {
            success: false,
            message: error.message
        };
    }
};

/**
 * Handle detectRecurringGameGaps mutation
 */
const handleDetectGaps = async (input) => {
    const { venueId, startDate, endDate, createInstances = false } = input;
    
    console.log('[INSTANCE] Detecting gaps:', { venueId, startDate, endDate, createInstances });
    
    try {
        // Get venue name
        const venueResult = await docClient.send(new GetCommand({
            TableName: VENUE_TABLE,
            Key: { id: venueId }
        }));
        const venueName = venueResult.Item?.name || null;
        
        // Get all active recurring games for venue
        const recurringGames = await getRecurringGamesByVenue(venueId);
        
        // Get all games in date range
        const games = await getGamesByVenueAndDateRange(venueId, startDate, endDate);
        
        // Get existing instances
        const existingInstances = await getInstancesByVenueAndDateRange(venueId, startDate, endDate);
        
        // Build lookup maps
        const gamesByRecurringIdAndDate = {};
        games.forEach(game => {
            if (game.recurringGameId) {
                const gameDate = game.gameStartDateTime?.split('T')[0];
                const key = `${game.recurringGameId}:${gameDate}`;
                gamesByRecurringIdAndDate[key] = game;
            }
        });
        
        const instancesByRecurringIdAndDate = {};
        existingInstances.forEach(inst => {
            const key = `${inst.recurringGameId}:${inst.expectedDate}`;
            instancesByRecurringIdAndDate[key] = inst;
        });
        
        // Count weeks
        const start = new Date(startDate);
        const end = new Date(endDate);
        const weeksAnalyzed = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
        
        let expectedOccurrences = 0;
        let confirmedOccurrences = 0;
        const gaps = [];
        let instancesCreated = 0;
        
        // Check each recurring game
        for (const rg of recurringGames) {
            const expectedDates = getDatesForDayInRange(rg.dayOfWeek, startDate, endDate);
            
            for (const date of expectedDates) {
                expectedOccurrences++;
                const key = `${rg.id}:${date}`;
                
                const hasGame = !!gamesByRecurringIdAndDate[key];
                const hasInstance = !!instancesByRecurringIdAndDate[key];
                
                if (hasGame || (hasInstance && instancesByRecurringIdAndDate[key].status === 'CONFIRMED')) {
                    confirmedOccurrences++;
                } else if (!hasInstance) {
                    // This is a gap
                    gaps.push({
                        recurringGameId: rg.id,
                        recurringGameName: rg.name,
                        expectedDate: date,
                        dayOfWeek: rg.dayOfWeek,
                        weekKey: getWeekKey(date)
                    });
                    
                    // Create UNKNOWN instance if requested
                    if (createInstances) {
                        await createInstance({
                            recurringGameId: rg.id,
                            recurringGameName: rg.name,
                            expectedDate: date,
                            dayOfWeek: rg.dayOfWeek,
                            weekKey: getWeekKey(date),
                            venueId: rg.venueId,
                            entityId: rg.entityId,
                            status: 'UNKNOWN',
                            source: 'GAP_DETECTION',
                            needsReview: true,
                            reviewReason: 'Gap detected - status unknown'
                        });
                        instancesCreated++;
                    }
                }
            }
        }
        
        return {
            success: true,
            venueId,
            venueName,
            startDate,
            endDate,
            weeksAnalyzed,
            recurringGamesChecked: recurringGames.length,
            expectedOccurrences,
            confirmedOccurrences,
            gapsFound: gaps.length,
            gaps,
            instancesCreated
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error detecting gaps:', error);
        return {
            success: false,
            venueId,
            startDate,
            endDate,
            weeksAnalyzed: 0,
            recurringGamesChecked: 0,
            expectedOccurrences: 0,
            confirmedOccurrences: 0,
            gapsFound: 0,
            gaps: [],
            instancesCreated: 0
        };
    }
};

/**
 * Handle reconcileRecurringInstances mutation
 */
const handleReconcileInstances = async (input) => {
    const { venueId, startDate, endDate, preview = true } = input;
    
    console.log('[INSTANCE] Reconciling instances:', { venueId, startDate, endDate, preview });
    
    try {
        // Get all games with recurringGameId in date range
        const games = await getGamesByVenueAndDateRange(venueId, startDate, endDate);
        const gamesWithRecurring = games.filter(g => g.recurringGameId);
        
        // Get existing instances
        const existingInstances = await getInstancesByVenueAndDateRange(venueId, startDate, endDate);
        const instancesByKey = {};
        existingInstances.forEach(inst => {
            instancesByKey[`${inst.recurringGameId}:${inst.expectedDate}`] = inst;
        });
        
        // Get recurring games for names
        const recurringGames = await getRecurringGamesByVenue(venueId);
        const rgById = {};
        recurringGames.forEach(rg => { rgById[rg.id] = rg; });
        
        let instancesCreated = 0;
        let instancesUpdated = 0;
        let orphanGames = 0;
        const details = [];
        
        for (const game of gamesWithRecurring) {
            const gameDate = game.gameStartDateTime?.split('T')[0];
            if (!gameDate) continue;
            
            const rg = rgById[game.recurringGameId];
            if (!rg) {
                orphanGames++;
                details.push({
                    gameId: game.id,
                    gameName: game.name,
                    gameDate,
                    action: 'ORPHAN',
                    recurringGameId: game.recurringGameId
                });
                continue;
            }
            
            const key = `${game.recurringGameId}:${gameDate}`;
            const existingInstance = instancesByKey[key];
            
            if (existingInstance) {
                // Update if needed
                if (existingInstance.status !== 'CONFIRMED' || !existingInstance.gameId) {
                    if (!preview) {
                        await updateInstance(existingInstance.id, {
                            status: 'CONFIRMED',
                            gameId: game.id,
                            source: 'RECONCILIATION'
                        });
                    }
                    instancesUpdated++;
                    details.push({
                        gameId: game.id,
                        gameName: game.name,
                        gameDate,
                        action: 'UPDATE',
                        instanceId: existingInstance.id,
                        recurringGameId: game.recurringGameId,
                        recurringGameName: rg.name
                    });
                }
            } else {
                // Create new instance
                if (!preview) {
                    const newInstance = await createInstance({
                        recurringGameId: game.recurringGameId,
                        recurringGameName: rg.name,
                        gameId: game.id,
                        expectedDate: gameDate,
                        dayOfWeek: rg.dayOfWeek,
                        weekKey: getWeekKey(gameDate),
                        venueId: rg.venueId,
                        entityId: rg.entityId,
                        status: 'CONFIRMED',
                        source: 'RECONCILIATION'
                    });
                    details.push({
                        gameId: game.id,
                        gameName: game.name,
                        gameDate,
                        action: 'CREATE',
                        instanceId: newInstance.id,
                        recurringGameId: game.recurringGameId,
                        recurringGameName: rg.name
                    });
                } else {
                    details.push({
                        gameId: game.id,
                        gameName: game.name,
                        gameDate,
                        action: 'CREATE',
                        recurringGameId: game.recurringGameId,
                        recurringGameName: rg.name
                    });
                }
                instancesCreated++;
            }
        }
        
        return {
            success: true,
            venueId,
            gamesAnalyzed: gamesWithRecurring.length,
            instancesCreated,
            instancesUpdated,
            orphanGames,
            preview,
            details: details.slice(0, 100) // Limit response size
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error reconciling instances:', error);
        return {
            success: false,
            venueId,
            gamesAnalyzed: 0,
            instancesCreated: 0,
            instancesUpdated: 0,
            orphanGames: 0,
            preview,
            details: []
        };
    }
};

// ===================================================================
// QUERY HANDLERS
// ===================================================================

/**
 * Handle getVenueComplianceReport query
 */
const handleGetComplianceReport = async ({ venueId, startDate, endDate }) => {
    console.log('[INSTANCE] Getting compliance report:', { venueId, startDate, endDate });
    
    try {
        // Get venue name
        const venueResult = await docClient.send(new GetCommand({
            TableName: VENUE_TABLE,
            Key: { id: venueId }
        }));
        const venueName = venueResult.Item?.name || null;
        
        // Get recurring games
        const recurringGames = await getRecurringGamesByVenue(venueId);
        
        // Get all instances in range
        const instances = await getInstancesByVenueAndDateRange(venueId, startDate, endDate);
        
        // Get games to cross-reference
        const games = await getGamesByVenueAndDateRange(venueId, startDate, endDate);
        const gamesByRecurringAndDate = {};
        games.forEach(g => {
            if (g.recurringGameId) {
                const date = g.gameStartDateTime?.split('T')[0];
                gamesByRecurringAndDate[`${g.recurringGameId}:${date}`] = g;
            }
        });
        
        // Calculate totals
        let totalExpected = 0;
        let totalConfirmed = 0;
        let totalCancelled = 0;
        let totalSkipped = 0;
        let totalUnknown = 0;
        let totalNoShow = 0;
        let needsReviewCount = 0;
        
        // Group by week
        const weekMap = {};
        
        for (const rg of recurringGames) {
            const expectedDates = getDatesForDayInRange(rg.dayOfWeek, startDate, endDate);
            
            for (const date of expectedDates) {
                totalExpected++;
                const weekKey = getWeekKey(date);
                
                if (!weekMap[weekKey]) {
                    weekMap[weekKey] = {
                        weekKey,
                        weekStartDate: date,
                        confirmedCount: 0,
                        cancelledCount: 0,
                        skippedCount: 0,
                        unknownCount: 0,
                        noShowCount: 0,
                        totalExpected: 0,
                        instances: []
                    };
                }
                weekMap[weekKey].totalExpected++;
                
                // Find instance or game
                const instance = instances.find(i => 
                    i.recurringGameId === rg.id && i.expectedDate === date
                );
                const game = gamesByRecurringAndDate[`${rg.id}:${date}`];
                
                let status = 'UNKNOWN';
                if (instance) {
                    status = instance.status;
                } else if (game) {
                    status = 'CONFIRMED';
                }
                
                // Count by status
                if (status === 'CONFIRMED') {
                    totalConfirmed++;
                    weekMap[weekKey].confirmedCount++;
                } else if (status === 'CANCELLED') {
                    totalCancelled++;
                    weekMap[weekKey].cancelledCount++;
                } else if (status === 'SKIPPED') {
                    totalSkipped++;
                    weekMap[weekKey].skippedCount++;
                } else if (status === 'NO_SHOW') {
                    totalNoShow++;
                    weekMap[weekKey].noShowCount++;
                } else {
                    totalUnknown++;
                    weekMap[weekKey].unknownCount++;
                }
                
                if (instance?.needsReview) {
                    needsReviewCount++;
                }
                
                // Add to week instances
                weekMap[weekKey].instances.push({
                    id: instance?.id || null,
                    recurringGameId: rg.id,
                    recurringGameName: rg.name,
                    gameId: game?.id || instance?.gameId || null,
                    expectedDate: date,
                    dayOfWeek: rg.dayOfWeek,
                    status,
                    needsReview: instance?.needsReview || false,
                    cancellationReason: instance?.cancellationReason || null,
                    notes: instance?.notes || null
                });
            }
        }
        
        // Calculate compliance rates
        const weekSummaries = Object.values(weekMap)
            .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
            .map(week => ({
                ...week,
                complianceRate: week.totalExpected > 0 
                    ? Math.round((week.confirmedCount / week.totalExpected) * 100) / 100
                    : 1.0
            }));
        
        const overallComplianceRate = totalExpected > 0 
            ? Math.round((totalConfirmed / totalExpected) * 100) / 100
            : 1.0;
        
        return {
            success: true,
            venueId,
            venueName,
            startDate,
            endDate,
            totalExpected,
            totalConfirmed,
            totalCancelled,
            totalSkipped,
            totalUnknown,
            totalNoShow,
            overallComplianceRate,
            weekSummaries,
            needsReviewCount,
            unknownCount: totalUnknown
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error getting compliance report:', error);
        return {
            success: false,
            venueId,
            startDate,
            endDate,
            totalExpected: 0,
            totalConfirmed: 0,
            totalCancelled: 0,
            totalSkipped: 0,
            totalUnknown: 0,
            totalNoShow: 0,
            overallComplianceRate: 0,
            weekSummaries: [],
            needsReviewCount: 0,
            unknownCount: 0
        };
    }
};

/**
 * Handle getWeekInstances query
 */
const handleGetWeekInstances = async ({ venueId, weekKey }) => {
    console.log('[INSTANCE] Getting week instances:', { venueId, weekKey });
    
    try {
        // Query instances by week
        const result = await docClient.send(new QueryCommand({
            TableName: INSTANCE_TABLE,
            IndexName: 'byVenueAndWeek',
            KeyConditionExpression: 'venueId = :vid AND weekKey = :wk',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':wk': weekKey
            }
        }));
        
        const instances = result.Items || [];
        
        // Count by status
        const counts = {
            confirmedCount: 0,
            cancelledCount: 0,
            skippedCount: 0,
            unknownCount: 0,
            noShowCount: 0
        };
        
        instances.forEach(inst => {
            if (inst.status === 'CONFIRMED') counts.confirmedCount++;
            else if (inst.status === 'CANCELLED') counts.cancelledCount++;
            else if (inst.status === 'SKIPPED') counts.skippedCount++;
            else if (inst.status === 'UNKNOWN') counts.unknownCount++;
            else if (inst.status === 'NO_SHOW') counts.noShowCount++;
        });
        
        // Get expected count from recurring games
        const recurringGames = await getRecurringGamesByVenue(venueId);
        const activeCount = recurringGames.length;
        
        return {
            weekKey,
            weekStartDate: instances[0]?.expectedDate || null,
            ...counts,
            totalExpected: activeCount,
            complianceRate: activeCount > 0 
                ? Math.round((counts.confirmedCount / activeCount) * 100) / 100 
                : 1.0,
            instances
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error getting week instances:', error);
        return {
            weekKey,
            weekStartDate: null,
            confirmedCount: 0,
            cancelledCount: 0,
            skippedCount: 0,
            unknownCount: 0,
            noShowCount: 0,
            totalExpected: 0,
            complianceRate: 0,
            instances: []
        };
    }
};

/**
 * Handle listInstancesNeedingReview query
 */
const handleListInstancesNeedingReview = async ({ venueId, entityId, limit = 50, nextToken }) => {
    console.log('[INSTANCE] Listing instances needing review:', { venueId, entityId, limit });
    
    try {
        let queryParams;
        
        if (venueId) {
            queryParams = {
                TableName: INSTANCE_TABLE,
                IndexName: 'byVenueInstance',
                KeyConditionExpression: 'venueId = :vid',
                FilterExpression: 'needsReview = :true OR #status = :unknown',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':vid': venueId,
                    ':true': true,
                    ':unknown': 'UNKNOWN'
                },
                Limit: limit
            };
        } else if (entityId) {
            queryParams = {
                TableName: INSTANCE_TABLE,
                IndexName: 'byEntityInstance',
                KeyConditionExpression: 'entityId = :eid',
                FilterExpression: 'needsReview = :true OR #status = :unknown',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':eid': entityId,
                    ':true': true,
                    ':unknown': 'UNKNOWN'
                },
                Limit: limit
            };
        } else {
            // Scan if no filter
            queryParams = {
                TableName: INSTANCE_TABLE,
                FilterExpression: 'needsReview = :true OR #status = :unknown',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':true': true,
                    ':unknown': 'UNKNOWN'
                },
                Limit: limit
            };
        }
        
        if (nextToken) {
            queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const command = venueId || entityId ? new QueryCommand(queryParams) : new ScanCommand(queryParams);
        const result = await docClient.send(command);
        
        return {
            items: result.Items || [],
            nextToken: result.LastEvaluatedKey 
                ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
                : null,
            totalCount: result.Count || 0
        };
        
    } catch (error) {
        console.error('[INSTANCE] Error listing instances needing review:', error);
        return {
            items: [],
            nextToken: null,
            totalCount: 0
        };
    }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Mutations
    handleRecordMissedInstance,
    handleUpdateInstanceStatus,
    handleDetectGaps,
    handleReconcileInstances,
    
    // Queries
    handleGetComplianceReport,
    handleGetWeekInstances,
    handleListInstancesNeedingReview
};
