/**
 * instance-manager.js
 * Manages RecurringGameInstance records (hybrid lazy-creation approach)
 * 
 * Used by:
 * - gameDataEnricher (creates CONFIRMED instances when games match)
 * - recurringGameAdmin (gap detection, reconciliation, manual recording)
 * 
 * Key Functions:
 * - createConfirmedInstance() - Called when a game is matched to a recurring game
 * - findInstanceByGameId() - Check if instance already exists for a game
 * - findInstanceByDate() - Check if instance exists for a recurring game + date
 * - detectGaps() - Find missing instances in a date range
 * - recordMissedInstance() - Admin marks a date as cancelled/skipped
 * - reconcileInstances() - Create instances for games that have recurringGameId but no instance
 */

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, PutCommand, UpdateCommand, GetCommand } = require('../utils/db-client');

// ===================================================================
// DATE UTILITIES
// ===================================================================

/**
 * Get ISO week key from date (e.g., "2026-W02")
 */
const getWeekKey = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

/**
 * Get date string in YYYY-MM-DD format (AEST)
 */
const getDateString = (date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
};

/**
 * Get day of week from date
 */
const getDayOfWeekFromDate = (date) => {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[new Date(date).getDay()];
};

/**
 * Generate all dates for a specific day of week within a range
 */
const generateDatesForDayOfWeek = (startDate, endDate, dayOfWeek) => {
    const dayIndex = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].indexOf(dayOfWeek);
    if (dayIndex === -1) return [];
    
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Find first occurrence of dayOfWeek
    const current = new Date(start);
    while (current.getDay() !== dayIndex) {
        current.setDate(current.getDate() + 1);
    }
    
    // Collect all occurrences
    while (current <= end) {
        dates.push(getDateString(current));
        current.setDate(current.getDate() + 7);
    }
    
    return dates;
};

// ===================================================================
// INSTANCE QUERIES
// ===================================================================

/**
 * Find instance by game ID
 */
const findInstanceByGameId = async (gameId) => {
    if (!gameId) return null;
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byGameInstance',
            KeyConditionExpression: 'gameId = :gid',
            ExpressionAttributeValues: { ':gid': gameId },
            Limit: 1
        }));
        
        return result.Items?.[0] || null;
    } catch (error) {
        console.error('[INSTANCE] Error finding instance by game:', error);
        return null;
    }
};

/**
 * Find instance by recurring game ID and date
 */
const findInstanceByDate = async (recurringGameId, expectedDate) => {
    if (!recurringGameId || !expectedDate) return null;
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byRecurringGameInstance',
            KeyConditionExpression: 'recurringGameId = :rid AND expectedDate = :date',
            ExpressionAttributeValues: {
                ':rid': recurringGameId,
                ':date': expectedDate
            },
            Limit: 1
        }));
        
        return result.Items?.[0] || null;
    } catch (error) {
        console.error('[INSTANCE] Error finding instance by date:', error);
        return null;
    }
};

/**
 * Get all instances for a recurring game in a date range
 */
const getInstancesForRecurringGame = async (recurringGameId, startDate, endDate) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byRecurringGameInstance',
            KeyConditionExpression: 'recurringGameId = :rid AND expectedDate BETWEEN :start AND :end',
            ExpressionAttributeValues: {
                ':rid': recurringGameId,
                ':start': startDate,
                ':end': endDate
            }
        }));
        
        return result.Items || [];
    } catch (error) {
        console.error('[INSTANCE] Error getting instances:', error);
        return [];
    }
};

/**
 * Get all instances for a venue in a date range
 */
const getInstancesForVenue = async (venueId, startDate, endDate) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byVenueInstance',
            KeyConditionExpression: 'venueId = :vid AND expectedDate BETWEEN :start AND :end',
            ExpressionAttributeValues: {
                ':vid': venueId,
                ':start': startDate,
                ':end': endDate
            }
        }));
        
        return result.Items || [];
    } catch (error) {
        console.error('[INSTANCE] Error getting venue instances:', error);
        return [];
    }
};

/**
 * Get instances by week key
 */
const getInstancesByWeek = async (venueId, weekKey) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    try {
        const result = await client.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byWeekKey',
            KeyConditionExpression: 'weekKey = :wk AND venueId = :vid',
            ExpressionAttributeValues: {
                ':wk': weekKey,
                ':vid': venueId
            }
        }));
        
        return result.Items || [];
    } catch (error) {
        console.error('[INSTANCE] Error getting week instances:', error);
        return [];
    }
};

// ===================================================================
// INSTANCE CREATION
// ===================================================================

/**
 * Create a CONFIRMED instance when a game is matched to a recurring game
 * Called by the enricher when recurringGameId is assigned
 * 
 * @param {Object} params
 * @param {Object} params.game - The game that was matched
 * @param {Object} params.recurringGame - The recurring game template
 * @param {number} params.matchConfidence - Confidence of the match
 * @returns {Object} Created instance or existing instance
 */
const createConfirmedInstance = async ({ game, recurringGame, matchConfidence = 1.0 }) => {
    if (!game?.id || !recurringGame?.id) {
        console.error('[INSTANCE] Missing game or recurringGame');
        return null;
    }
    
    // Get date from game
    const gameDate = getDateString(game.gameStartDateTime);
    const dayOfWeek = game.gameDayOfWeek || getDayOfWeekFromDate(game.gameStartDateTime);
    const weekKey = getWeekKey(game.gameStartDateTime);
    
    // Check if instance already exists for this game
    const existingByGame = await findInstanceByGameId(game.id);
    if (existingByGame) {
        console.log(`[INSTANCE] Instance already exists for game ${game.id}`);
        return { instance: existingByGame, wasCreated: false };
    }
    
    // Check if instance exists for this recurring game + date
    const existingByDate = await findInstanceByDate(recurringGame.id, gameDate);
    if (existingByDate) {
        // Update existing instance to link to this game
        console.log(`[INSTANCE] Updating existing instance ${existingByDate.id} with game ${game.id}`);
        const updated = await updateInstance(existingByDate.id, {
            gameId: game.id,
            status: 'CONFIRMED'
        });
        return { instance: updated, wasCreated: false, wasUpdated: true };
    }
    
    // Check for deviations from typical values
    const deviations = detectDeviations(game, recurringGame);
    
    // Create new instance
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const instance = {
        id,
        recurringGameId: recurringGame.id,
        gameId: game.id,
        expectedDate: gameDate,
        dayOfWeek,
        weekKey,
        venueId: recurringGame.venueId,
        entityId: recurringGame.entityId,
        recurringGameName: recurringGame.name,
        status: 'CONFIRMED',
        hasDeviation: deviations.hasDeviation,
        deviationType: deviations.type,
        deviationDetails: deviations.hasDeviation ? JSON.stringify(deviations.details) : null,
        needsReview: deviations.hasDeviation && deviations.significant,
        reviewReason: deviations.significant ? 'Significant deviation from typical values' : null,
        source: 'GAME_MATCH',
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'RecurringGameInstance'
    };
    
    try {
        await client.send(new PutCommand({
            TableName: tableName,
            Item: instance,
            ConditionExpression: 'attribute_not_exists(id)'
        }));
        
        console.log(`[INSTANCE] Created CONFIRMED instance ${id} for game ${game.id}`);
        return { instance, wasCreated: true };
        
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            console.warn('[INSTANCE] Instance ID collision, retrying');
            return createConfirmedInstance({ game, recurringGame, matchConfidence });
        }
        console.error('[INSTANCE] Error creating instance:', error);
        return null;
    }
};

/**
 * Detect deviations between a game and its recurring template
 */
const detectDeviations = (game, recurringGame) => {
    const details = {};
    const deviations = [];
    
    // Buy-in deviation
    if (game.buyIn && recurringGame.typicalBuyIn) {
        const diff = Math.abs(game.buyIn - recurringGame.typicalBuyIn);
        const percent = diff / recurringGame.typicalBuyIn;
        
        if (percent > 0.1) {  // More than 10% difference
            details.expectedBuyIn = recurringGame.typicalBuyIn;
            details.actualBuyIn = game.buyIn;
            details.buyInDifferencePercent = Math.round(percent * 100);
            deviations.push('BUYIN_CHANGE');
        }
    }
    
    // Guarantee deviation
    if (game.guaranteeAmount && recurringGame.typicalGuarantee) {
        const diff = Math.abs(game.guaranteeAmount - recurringGame.typicalGuarantee);
        const percent = diff / recurringGame.typicalGuarantee;
        
        if (percent > 0.2) {  // More than 20% difference
            details.expectedGuarantee = recurringGame.typicalGuarantee;
            details.actualGuarantee = game.guaranteeAmount;
            details.guaranteeDifferencePercent = Math.round(percent * 100);
            deviations.push('GUARANTEE_CHANGE');
        }
    }
    
    // Time deviation (compare AEST times)
    // TODO: Add time comparison if needed
    
    if (deviations.length === 0) {
        return { hasDeviation: false, type: 'NONE', details: {}, significant: false };
    }
    
    return {
        hasDeviation: true,
        type: deviations.length > 1 ? 'MULTIPLE' : deviations[0],
        details,
        significant: details.buyInDifferencePercent > 50 || details.guaranteeDifferencePercent > 50
    };
};

/**
 * Create an instance for a missed/cancelled/skipped date
 * Called by admin when recording a missed game
 */
const createMissedInstance = async ({
    recurringGameId,
    recurringGame,  // Optional - will be fetched if not provided
    expectedDate,
    status,  // 'CANCELLED', 'SKIPPED', 'NO_SHOW', 'UNKNOWN'
    cancellationReason,
    notes
}) => {
    if (!recurringGameId || !expectedDate) {
        throw new Error('recurringGameId and expectedDate are required');
    }
    
    // Check if instance already exists
    const existing = await findInstanceByDate(recurringGameId, expectedDate);
    if (existing) {
        // Update existing instance
        console.log(`[INSTANCE] Updating existing instance ${existing.id} to ${status}`);
        return updateInstance(existing.id, {
            status,
            cancellationReason,
            notes
        });
    }
    
    // Fetch recurring game if not provided
    let template = recurringGame;
    if (!template) {
        const client = getDocClient();
        const rgTable = getTableName('RecurringGame');
        const result = await client.send(new GetCommand({
            TableName: rgTable,
            Key: { id: recurringGameId }
        }));
        template = result.Item;
    }
    
    if (!template) {
        throw new Error(`RecurringGame ${recurringGameId} not found`);
    }
    
    const dayOfWeek = template.dayOfWeek || getDayOfWeekFromDate(expectedDate);
    const weekKey = getWeekKey(expectedDate);
    
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const instance = {
        id,
        recurringGameId,
        gameId: null,  // No game for missed instance
        expectedDate,
        dayOfWeek,
        weekKey,
        venueId: template.venueId,
        entityId: template.entityId,
        recurringGameName: template.name,
        status,
        hasDeviation: false,
        cancellationReason,
        notes,
        needsReview: status === 'UNKNOWN',
        reviewReason: status === 'UNKNOWN' ? 'Gap detected - needs investigation' : null,
        source: 'MANUAL',
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'RecurringGameInstance'
    };
    
    try {
        await client.send(new PutCommand({
            TableName: tableName,
            Item: instance
        }));
        
        console.log(`[INSTANCE] Created ${status} instance ${id} for ${template.name} on ${expectedDate}`);
        return { instance, wasCreated: true };
        
    } catch (error) {
        console.error('[INSTANCE] Error creating missed instance:', error);
        throw error;
    }
};

/**
 * Update an existing instance
 */
const updateInstance = async (instanceId, updates) => {
    const client = getDocClient();
    const tableName = getTableName('RecurringGameInstance');
    
    const updateExpressions = [];
    const expressionNames = {};
    const expressionValues = { ':now': new Date().toISOString() };
    
    Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
            updateExpressions.push(`#${key} = :${key}`);
            expressionNames[`#${key}`] = key;
            expressionValues[`:${key}`] = value;
        }
    });
    
    updateExpressions.push('updatedAt = :now');
    
    try {
        const result = await client.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: instanceId },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues,
            ReturnValues: 'ALL_NEW'
        }));
        
        return result.Attributes;
    } catch (error) {
        console.error('[INSTANCE] Error updating instance:', error);
        throw error;
    }
};

// ===================================================================
// GAP DETECTION
// ===================================================================

/**
 * Detect gaps in recurring game schedule
 * Compares expected occurrences vs actual instances
 * 
 * @param {Object} params
 * @param {string} params.venueId - Venue to check
 * @param {string} params.startDate - Start of date range (YYYY-MM-DD)
 * @param {string} params.endDate - End of date range (YYYY-MM-DD)
 * @param {boolean} params.createInstances - If true, create UNKNOWN instances for gaps
 * @param {Array} params.recurringGames - Optional pre-fetched recurring games
 * @returns {Object} Gap detection results
 */
const detectGaps = async ({
    venueId,
    startDate,
    endDate,
    createInstances = false,
    recurringGames = null
}) => {
    console.log(`[INSTANCE] Detecting gaps for venue ${venueId} from ${startDate} to ${endDate}`);
    
    // Fetch recurring games if not provided
    let templates = recurringGames;
    if (!templates) {
        const { getRecurringGamesByVenue } = require('./recurring-resolver');
        templates = await getRecurringGamesByVenue(venueId);
    }
    
    // Filter to active games only
    templates = templates.filter(rg => rg.isActive !== false);
    console.log(`[INSTANCE] Checking ${templates.length} active recurring games`);
    
    if (templates.length === 0) {
        return {
            success: true,
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
    
    // Get existing instances for the date range
    const existingInstances = await getInstancesForVenue(venueId, startDate, endDate);
    
    // Build lookup map: recurringGameId + date → instance
    const instanceMap = new Map();
    existingInstances.forEach(inst => {
        instanceMap.set(`${inst.recurringGameId}|${inst.expectedDate}`, inst);
    });
    
    // Find gaps
    const gaps = [];
    let expectedCount = 0;
    let confirmedCount = 0;
    
    for (const template of templates) {
        if (!template.dayOfWeek) continue;
        
        // Generate expected dates for this recurring game
        const expectedDates = generateDatesForDayOfWeek(startDate, endDate, template.dayOfWeek);
        
        for (const date of expectedDates) {
            expectedCount++;
            
            const key = `${template.id}|${date}`;
            const instance = instanceMap.get(key);
            
            if (instance && instance.status === 'CONFIRMED') {
                confirmedCount++;
            } else if (!instance) {
                // Gap found - no instance for this date
                gaps.push({
                    recurringGameId: template.id,
                    recurringGameName: template.name,
                    expectedDate: date,
                    dayOfWeek: template.dayOfWeek,
                    weekKey: getWeekKey(date)
                });
            }
            // Note: instances with status CANCELLED/SKIPPED/etc are not gaps
        }
    }
    
    console.log(`[INSTANCE] Found ${gaps.length} gaps out of ${expectedCount} expected occurrences`);
    
    // Create UNKNOWN instances for gaps if requested
    let instancesCreated = 0;
    if (createInstances && gaps.length > 0) {
        for (const gap of gaps) {
            try {
                await createMissedInstance({
                    recurringGameId: gap.recurringGameId,
                    expectedDate: gap.expectedDate,
                    status: 'UNKNOWN',
                    notes: 'Created by gap detection'
                });
                instancesCreated++;
            } catch (error) {
                console.error(`[INSTANCE] Failed to create instance for gap:`, error);
            }
        }
        console.log(`[INSTANCE] Created ${instancesCreated} UNKNOWN instances`);
    }
    
    // Calculate weeks analyzed
    const start = new Date(startDate);
    const end = new Date(endDate);
    const weeksAnalyzed = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
    
    return {
        success: true,
        venueId,
        startDate,
        endDate,
        weeksAnalyzed,
        recurringGamesChecked: templates.length,
        expectedOccurrences: expectedCount,
        confirmedOccurrences: confirmedCount,
        gapsFound: gaps.length,
        gaps,
        instancesCreated
    };
};

/**
 * Reconcile games with instances
 * Creates CONFIRMED instances for games that have recurringGameId but no instance
 */
const reconcileInstances = async ({
    venueId,
    startDate,
    endDate,
    preview = true
}) => {
    console.log(`[INSTANCE] Reconciling instances for venue ${venueId} (preview: ${preview})`);
    
    const client = getDocClient();
    const gameTable = getTableName('Game');
    
    // Get games at venue in date range that have recurringGameId
    const gamesResult = await client.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byVenue',
        KeyConditionExpression: 'venueId = :vid AND gameStartDateTime BETWEEN :start AND :end',
        FilterExpression: 'attribute_exists(recurringGameId) AND recurringGameId <> :empty',
        ExpressionAttributeValues: {
            ':vid': venueId,
            ':start': `${startDate}T00:00:00.000Z`,
            ':end': `${endDate}T23:59:59.999Z`,
            ':empty': ''
        }
    }));
    
    const games = gamesResult.Items || [];
    console.log(`[INSTANCE] Found ${games.length} games with recurringGameId`);
    
    // Get recurring games for reference
    const { getRecurringGamesByVenue } = require('./recurring-resolver');
    const recurringGames = await getRecurringGamesByVenue(venueId);
    const rgMap = new Map(recurringGames.map(rg => [rg.id, rg]));
    
    const details = [];
    let instancesCreated = 0;
    let instancesUpdated = 0;
    let orphanGames = 0;
    
    for (const game of games) {
        const recurringGame = rgMap.get(game.recurringGameId);
        
        if (!recurringGame) {
            details.push({
                gameId: game.id,
                gameName: game.name,
                gameDate: getDateString(game.gameStartDateTime),
                action: 'ORPHAN',
                recurringGameId: game.recurringGameId
            });
            orphanGames++;
            continue;
        }
        
        // Check if instance exists
        const existingInstance = await findInstanceByGameId(game.id);
        
        if (existingInstance) {
            details.push({
                gameId: game.id,
                gameName: game.name,
                gameDate: getDateString(game.gameStartDateTime),
                action: 'INSTANCE_EXISTS',
                instanceId: existingInstance.id,
                recurringGameId: recurringGame.id,
                recurringGameName: recurringGame.name
            });
        } else {
            // Create instance
            if (!preview) {
                const result = await createConfirmedInstance({ game, recurringGame });
                if (result?.wasCreated) instancesCreated++;
                if (result?.wasUpdated) instancesUpdated++;
            }
            
            details.push({
                gameId: game.id,
                gameName: game.name,
                gameDate: getDateString(game.gameStartDateTime),
                action: preview ? 'WOULD_CREATE_INSTANCE' : 'INSTANCE_CREATED',
                recurringGameId: recurringGame.id,
                recurringGameName: recurringGame.name
            });
            
            if (preview) instancesCreated++;  // Count for preview
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
        details
    };
};

// ===================================================================
// COMPLIANCE REPORTING
// ===================================================================

/**
 * Generate compliance report for a venue
 */
const getComplianceReport = async ({
    venueId,
    startDate,
    endDate,
    venueName = null
}) => {
    // Get all instances in range
    const instances = await getInstancesForVenue(venueId, startDate, endDate);
    
    // Get recurring games to calculate expected count
    const { getRecurringGamesByVenue } = require('./recurring-resolver');
    const recurringGames = await getRecurringGamesByVenue(venueId);
    const activeRGs = recurringGames.filter(rg => rg.isActive !== false);
    
    // Calculate expected occurrences
    let totalExpected = 0;
    for (const rg of activeRGs) {
        if (rg.dayOfWeek) {
            const dates = generateDatesForDayOfWeek(startDate, endDate, rg.dayOfWeek);
            totalExpected += dates.length;
        }
    }
    
    // Count by status
    const statusCounts = {
        CONFIRMED: 0,
        CANCELLED: 0,
        SKIPPED: 0,
        UNKNOWN: 0,
        NO_SHOW: 0,
        REPLACED: 0
    };
    
    instances.forEach(inst => {
        statusCounts[inst.status] = (statusCounts[inst.status] || 0) + 1;
    });
    
    // Group by week
    const weekMap = new Map();
    instances.forEach(inst => {
        if (!weekMap.has(inst.weekKey)) {
            weekMap.set(inst.weekKey, []);
        }
        weekMap.get(inst.weekKey).push(inst);
    });
    
    const weekSummaries = Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekKey, weekInstances]) => {
            const counts = {
                confirmedCount: 0,
                cancelledCount: 0,
                skippedCount: 0,
                unknownCount: 0,
                noShowCount: 0
            };
            
            weekInstances.forEach(inst => {
                if (inst.status === 'CONFIRMED') counts.confirmedCount++;
                else if (inst.status === 'CANCELLED') counts.cancelledCount++;
                else if (inst.status === 'SKIPPED') counts.skippedCount++;
                else if (inst.status === 'UNKNOWN') counts.unknownCount++;
                else if (inst.status === 'NO_SHOW') counts.noShowCount++;
            });
            
            // Calculate expected for this week
            // This is approximate - would need to check which days fall in this week
            const totalWeekExpected = activeRGs.length;  // Simplified: 1 per RG per week
            
            return {
                weekKey,
                weekStartDate: weekInstances[0]?.expectedDate,
                ...counts,
                totalExpected: totalWeekExpected,
                complianceRate: totalWeekExpected > 0 
                    ? Math.round((counts.confirmedCount / totalWeekExpected) * 100) / 100 
                    : 1.0,
                instances: weekInstances
            };
        });
    
    const needsReviewCount = instances.filter(i => i.needsReview).length;
    
    return {
        success: true,
        venueId,
        venueName,
        startDate,
        endDate,
        totalExpected,
        totalConfirmed: statusCounts.CONFIRMED,
        totalCancelled: statusCounts.CANCELLED,
        totalSkipped: statusCounts.SKIPPED,
        totalUnknown: statusCounts.UNKNOWN,
        totalNoShow: statusCounts.NO_SHOW,
        overallComplianceRate: totalExpected > 0 
            ? Math.round((statusCounts.CONFIRMED / totalExpected) * 100) / 100 
            : 1.0,
        weekSummaries,
        needsReviewCount,
        unknownCount: statusCounts.UNKNOWN
    };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Date utilities
    getWeekKey,
    getDateString,
    getDayOfWeekFromDate,
    generateDatesForDayOfWeek,
    
    // Instance queries
    findInstanceByGameId,
    findInstanceByDate,
    getInstancesForRecurringGame,
    getInstancesForVenue,
    getInstancesByWeek,
    
    // Instance creation
    createConfirmedInstance,
    createMissedInstance,
    updateInstance,
    detectDeviations,
    
    // Gap detection & reconciliation
    detectGaps,
    reconcileInstances,
    
    // Reporting
    getComplianceReport
};