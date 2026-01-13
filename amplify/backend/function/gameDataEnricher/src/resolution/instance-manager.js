/**
 * instance-manager.js
 * 
 * Instance tracking operations for recurring game compliance.
 * Manages RecurringGameInstance records for schedule compliance tracking.
 * 
 * VERSION 2.0.0 - Enhanced with frequency-aware date calculations
 * 
 * Operations:
 * - detectRecurringGameGaps
 * - reconcileRecurringInstances
 * - recordMissedInstance
 * - updateInstanceStatus
 * - getVenueComplianceReport
 * - getWeekInstances
 * - listInstancesNeedingReview
 * - createConfirmedInstance (for resolver use)
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolution/instance-manager.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, PutCommand, UpdateCommand, ScanCommand, GetCommand } = require('../utils/db-client');

// Import enhanced date utilities (optional - gracefully degrade if not available)
let calculateExpectedDatesEnhanced = null;
let getWeekKeyFromUtils = null;
let getWeekStartFromKey = null;

try {
    const dateUtils = require('../utils/date-utils');
    calculateExpectedDatesEnhanced = dateUtils.calculateExpectedDates;
    getWeekKeyFromUtils = dateUtils.getWeekKey;
    getWeekStartFromKey = dateUtils.getWeekStartFromKey;
} catch (e) {
    console.warn('[instance-manager] Enhanced date-utils not available, using fallback calculations');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get week key from date (YYYY-Www format)
 * Uses the enhanced version from date-utils if available, falls back to simple calculation
 */
function getWeekKey(dateStr) {
    // Try to use the enhanced version first
    if (getWeekKeyFromUtils) {
        try {
            return getWeekKeyFromUtils(dateStr);
        } catch (e) {
            // Fall back to simple calculation
        }
    }
    
    // Simple fallback calculation
    const date = new Date(dateStr);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Get day of week from date IN AEST TIMEZONE
 * 
 * IMPORTANT: If passed a full datetime string, converts to AEST first!
 * If passed just a date string (YYYY-MM-DD), treats it as AEST date.
 */
function getDayOfWeek(dateStr) {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    // If it's a full datetime string, convert to AEST first
    if (dateStr && dateStr.includes('T')) {
        const aest = toAEST(dateStr);
        if (aest) {
            return days[aest.dayOfWeek];
        }
    }
    
    // For date-only strings (YYYY-MM-DD), treat as AEST date
    // Add noon to avoid any edge cases
    const date = new Date(dateStr + 'T12:00:00Z');
    return days[date.getUTCDay()];
}

/**
 * Generate all expected dates for a recurring game within a date range
 * Supports different frequencies (WEEKLY, FORTNIGHTLY, MONTHLY, etc.)
 * 
 * @param {string|Object} dayOfWeekOrGame - Day of week string OR recurring game object
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {string[]} Array of expected dates
 */
function getExpectedDates(dayOfWeekOrGame, startDate, endDate) {
    // If passed a recurring game object, use the enhanced calculation
    if (typeof dayOfWeekOrGame === 'object' && dayOfWeekOrGame !== null) {
        const recurringGame = dayOfWeekOrGame;
        
        // Use enhanced calculation from date-utils if available
        if (calculateExpectedDatesEnhanced) {
            try {
                return calculateExpectedDatesEnhanced(recurringGame, startDate, endDate);
            } catch (e) {
                console.warn('[instance-manager] Enhanced date calculation failed, using fallback:', e.message);
            }
        }
        
        // Fall back to simple weekly calculation
        return getExpectedDatesSimple(recurringGame.dayOfWeek, startDate, endDate);
    }
    
    // Simple string dayOfWeek - use basic calculation
    return getExpectedDatesSimple(dayOfWeekOrGame, startDate, endDate);
}

/**
 * Simple expected dates calculation (WEEKLY only)
 */
function getExpectedDatesSimple(dayOfWeek, startDate, endDate) {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const targetDayIndex = days.indexOf(dayOfWeek?.toUpperCase());
    if (targetDayIndex === -1) return [];
    
    const dates = [];
    const start = new Date(startDate + 'T12:00:00Z');
    const end = new Date(endDate + 'T12:00:00Z');
    
    // Find first occurrence
    let current = new Date(start);
    while (current.getUTCDay() !== targetDayIndex) {
        current.setUTCDate(current.getUTCDate() + 1);
    }
    
    // Collect all occurrences
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setUTCDate(current.getUTCDate() + 7);
    }
    
    return dates;
}

/**
 * Convert a UTC date to AEST/AEDT and return date components
 * (Copied from date-utils.js for self-contained use)
 */
function toAEST(utcDate) {
    const AEST_OFFSET_HOURS = 10;
    const AEDT_OFFSET_HOURS = 11;
    
    const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
    
    if (isNaN(d.getTime())) {
        return null;
    }
    
    // Check if date falls within AEDT (first Sunday in October to first Sunday in April)
    const month = d.getUTCMonth();
    let isAEDT = false;
    if (month >= 3 && month <= 8) {
        isAEDT = false;
    } else if (month >= 10 || month <= 1) {
        isAEDT = true;
    } else {
        const dayOfMonth = d.getUTCDate();
        if (month === 9) {
            isAEDT = dayOfMonth >= 7;
        } else {
            isAEDT = true;
        }
    }
    
    const offset = isAEDT ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
    
    // Add offset to get AEST/AEDT time
    const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
    
    return {
        year: aestTime.getUTCFullYear(),
        month: aestTime.getUTCMonth(),
        day: aestTime.getUTCDate(),
        hours: aestTime.getUTCHours(),
        minutes: aestTime.getUTCMinutes(),
        dayOfWeek: aestTime.getUTCDay(),
        isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`
    };
}

/**
 * Extract date from datetime string IN AEST TIMEZONE
 * 
 * IMPORTANT: This converts to AEST before extracting the date!
 * A game at 8:00 AM AEST on Wednesday = 9:00 PM Tuesday UTC
 * We need the AEST date (Wednesday), not the UTC date (Tuesday)
 */
function extractDate(dateTimeStr) {
    if (!dateTimeStr) return null;
    
    // Convert to AEST and extract the date
    const aest = toAEST(dateTimeStr);
    if (!aest) {
        // Fallback to UTC if conversion fails
        console.warn('[extractDate] Failed to convert to AEST, falling back to UTC:', dateTimeStr);
        return dateTimeStr.split('T')[0];
    }
    
    return aest.isoDate;
}

// ============================================================================
// DETECT GAPS
// ============================================================================

/**
 * Detect gaps in recurring game instances
 * Finds dates where a recurring game was expected but no instance exists
 */
async function detectRecurringGameGaps(venueId, startDate, endDate, createInstances = false) {
    console.log(`[detectRecurringGameGaps] Starting for venue ${venueId}, range ${startDate} to ${endDate}`);
    
    const docClient = getDocClient();
    const recurringGameTable = getTableName('RecurringGame');
    const instanceTable = getTableName('RecurringGameInstance');
    const gameTable = getTableName('Game');
    const venueTable = getTableName('Venue');
    
    try {
        // Get venue name
        let venueName = null;
        try {
            const venueResult = await docClient.send(new GetCommand({
                TableName: venueTable,
                Key: { id: venueId },
                ProjectionExpression: '#n',
                ExpressionAttributeNames: { '#n': 'name' },
            }));
            venueName = venueResult.Item?.name;
        } catch (e) {
            console.warn('[detectRecurringGameGaps] Could not fetch venue name:', e.message);
        }
        
        // Get active recurring games for venue
        const rgResult = await docClient.send(new ScanCommand({
            TableName: recurringGameTable,
            FilterExpression: 'venueId = :venueId AND (attribute_not_exists(isActive) OR isActive = :true) AND (attribute_not_exists(isPaused) OR isPaused = :false)',
            ExpressionAttributeValues: {
                ':venueId': venueId,
                ':true': true,
                ':false': false,
            },
        }));
        
        const recurringGames = rgResult.Items || [];
        console.log(`[detectRecurringGameGaps] Found ${recurringGames.length} active recurring games`);
        
        if (recurringGames.length === 0) {
            return {
                success: true,
                venueId,
                venueName,
                startDate,
                endDate,
                weeksAnalyzed: Math.ceil((new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000)),
                recurringGamesChecked: 0,
                expectedOccurrences: 0,
                confirmedOccurrences: 0,
                gapsFound: 0,
                gaps: [],
                instancesCreated: createInstances ? 0 : undefined,
            };
        }
        
        const gaps = [];
        let instancesCreated = 0;
        let totalExpectedOccurrences = 0;
        let confirmedOccurrences = 0;
        
        for (const rg of recurringGames) {
            if (!rg.dayOfWeek) {
                console.log(`[detectRecurringGameGaps] Skipping ${rg.id} - no dayOfWeek`);
                continue;
            }
            
            // Use enhanced calculation that respects frequency
            const expectedDates = getExpectedDates(rg, startDate, endDate);
            totalExpectedOccurrences += expectedDates.length;
            
            for (const expectedDate of expectedDates) {
                const weekKey = getWeekKey(expectedDate);
                
                // Check if instance exists
                const instanceResult = await docClient.send(new QueryCommand({
                    TableName: instanceTable,
                    IndexName: 'byRecurringGameInstance',
                    KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
                    ExpressionAttributeValues: {
                        ':rgId': rg.id,
                        ':date': expectedDate,
                    },
                }));
                
                if (instanceResult.Items && instanceResult.Items.length > 0) {
                    // Instance exists - count if confirmed
                    if (instanceResult.Items[0].status === 'CONFIRMED') {
                        confirmedOccurrences++;
                    }
                    continue;
                }
                
                // No instance - check if there's a game on this date
                let matchedGame = null;
                try {
                    const gameResult = await docClient.send(new QueryCommand({
                        TableName: gameTable,
                        IndexName: 'byRecurringGame',
                        KeyConditionExpression: 'recurringGameId = :rgId',
                        FilterExpression: 'begins_with(gameStartDateTime, :datePrefix)',
                        ExpressionAttributeValues: {
                            ':rgId': rg.id,
                            ':datePrefix': expectedDate,
                        },
                    }));
                    matchedGame = gameResult.Items?.[0];
                } catch (e) {
                    // Try alternative: query by venue with date as sort key
                    try {
                        const gameResult = await docClient.send(new QueryCommand({
                            TableName: gameTable,
                            IndexName: 'byVenue',
                            KeyConditionExpression: 'venueId = :venueId AND begins_with(gameStartDateTime, :datePrefix)',
                            FilterExpression: 'recurringGameId = :rgId',
                            ExpressionAttributeValues: {
                                ':venueId': venueId,
                                ':rgId': rg.id,
                                ':datePrefix': expectedDate,
                            },
                        }));
                        matchedGame = gameResult.Items?.[0];
                    } catch (e2) {
                        console.warn('[detectRecurringGameGaps] Could not query games:', e2.message);
                    }
                }
                
                gaps.push({
                    recurringGameId: rg.id,
                    recurringGameName: rg.displayName || rg.name,
                    expectedDate,
                    dayOfWeek: rg.dayOfWeek,
                    weekKey,
                    possibleMatchGameId: matchedGame?.id || null,
                    possibleMatchGameName: matchedGame?.name || null,
                    matchConfidence: matchedGame ? 90 : 0,
                });
                
                // Create UNKNOWN instance if requested
                if (createInstances) {
                    const newStatus = matchedGame ? 'CONFIRMED' : 'UNKNOWN';
                    const instanceItem = {
                        id: uuidv4(),
                        recurringGameId: rg.id,
                        recurringGameName: rg.displayName || rg.name,
                        expectedDate,
                        dayOfWeek: rg.dayOfWeek,
                        weekKey,
                        venueId,
                        entityId: rg.entityId,
                        status: newStatus,
                        needsReview: !matchedGame,
                        reviewReason: matchedGame ? null : 'Auto-created gap instance',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        __typename: 'RecurringGameInstance',
                    };
                    
                    // Only include gameId if we have a matched game (GSI can't index null values)
                    if (matchedGame?.id) {
                        instanceItem.gameId = matchedGame.id;
                    }
                    
                    await docClient.send(new PutCommand({
                        TableName: instanceTable,
                        Item: instanceItem,
                    }));
                    instancesCreated++;
                    
                    if (matchedGame) {
                        confirmedOccurrences++;
                    }
                }
            }
        }
        
        console.log(`[detectRecurringGameGaps] Found ${gaps.length} gaps, created ${instancesCreated} instances`);
        
        return {
            success: true,
            venueId,
            venueName,
            startDate,
            endDate,
            weeksAnalyzed: Math.ceil((new Date(endDate) - new Date(startDate)) / (7 * 24 * 60 * 60 * 1000)),
            recurringGamesChecked: recurringGames.length,
            expectedOccurrences: totalExpectedOccurrences,
            confirmedOccurrences,
            gapsFound: gaps.length,
            gaps,
            instancesCreated: createInstances ? instancesCreated : undefined,
        };
    } catch (error) {
        console.error('[detectRecurringGameGaps] Error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            venueId,
            startDate,
            endDate,
            weeksAnalyzed: 0,
            recurringGamesChecked: 0,
            expectedOccurrences: 0,
            confirmedOccurrences: 0,
            gapsFound: 0,
            gaps: [],
        };
    }
}

// ============================================================================
// RECONCILE INSTANCES
// ============================================================================

/**
 * Reconcile recurring instances with actual games
 */
async function reconcileRecurringInstances(venueId, startDate, endDate, preview = true) {
    console.log(`[reconcileRecurringInstances] Starting for venue ${venueId}, preview=${preview}`);
    
    const docClient = getDocClient();
    const gameTable = getTableName('Game');
    const instanceTable = getTableName('RecurringGameInstance');
    const recurringGameTable = getTableName('RecurringGame');
    
    try {
        // Get games in date range
        const gamesResult = await docClient.send(new QueryCommand({
            TableName: gameTable,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            FilterExpression: 'gameStartDateTime BETWEEN :start AND :end',
            ExpressionAttributeValues: {
                ':venueId': venueId,
                ':start': startDate + 'T00:00:00.000Z',
                ':end': endDate + 'T23:59:59.999Z',
            },
        }));
        
        const games = gamesResult.Items || [];
        console.log(`[reconcileRecurringInstances] Found ${games.length} games`);
        
        // Get recurring games for orphan detection
        const rgResult = await docClient.send(new ScanCommand({
            TableName: recurringGameTable,
            FilterExpression: 'venueId = :venueId AND (attribute_not_exists(isActive) OR isActive = :true)',
            ExpressionAttributeValues: {
                ':venueId': venueId,
                ':true': true,
            },
        }));
        const recurringGames = rgResult.Items || [];
        const recurringGameMap = new Map(recurringGames.map(rg => [rg.id, rg]));
        
        const details = [];
        let instancesCreated = 0;
        let instancesUpdated = 0;
        let orphanGames = 0;
        
        for (const game of games) {
            const gameDate = extractDate(game.gameStartDateTime || game.date);
            
            if (!game.recurringGameId) {
                orphanGames++;
                details.push({
                    gameId: game.id,
                    gameName: game.name,
                    gameDate,
                    action: 'ORPHAN',
                    recurringGameId: null,
                    recurringGameName: null,
                });
                continue;
            }
            
            const weekKey = getWeekKey(gameDate);
            const rg = recurringGameMap.get(game.recurringGameId);
            
            // Check for existing instance
            const instanceResult = await docClient.send(new QueryCommand({
                TableName: instanceTable,
                IndexName: 'byRecurringGameInstance',
                KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
                ExpressionAttributeValues: {
                    ':rgId': game.recurringGameId,
                    ':date': gameDate,
                },
            }));
            
            if (instanceResult.Items && instanceResult.Items.length > 0) {
                // Update existing instance if needed
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
                        recurringGameName: rg?.displayName || rg?.name || null,
                    });
                }
            } else {
                // Create new instance
                const newInstanceId = uuidv4();
                if (!preview) {
                    await docClient.send(new PutCommand({
                        TableName: instanceTable,
                        Item: {
                            id: newInstanceId,
                            recurringGameId: game.recurringGameId,
                            recurringGameName: rg?.displayName || rg?.name || null,
                            gameId: game.id,
                            expectedDate: gameDate,
                            dayOfWeek: getDayOfWeek(gameDate),
                            weekKey,
                            venueId,
                            entityId: game.entityId || rg?.entityId,
                            status: 'CONFIRMED',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            __typename: 'RecurringGameInstance',
                        },
                    }));
                }
                instancesCreated++;
                details.push({
                    gameId: game.id,
                    gameName: game.name,
                    gameDate,
                    action: 'CREATED',
                    instanceId: preview ? null : newInstanceId,
                    recurringGameId: game.recurringGameId,
                    recurringGameName: rg?.displayName || rg?.name || null,
                });
            }
        }
        
        console.log(`[reconcileRecurringInstances] Complete. Created: ${instancesCreated}, Updated: ${instancesUpdated}, Orphans: ${orphanGames}`);
        
        return {
            success: true,
            venueId,
            gamesAnalyzed: games.length,
            instancesCreated: preview ? 0 : instancesCreated,
            instancesUpdated: preview ? 0 : instancesUpdated,
            orphanGames,
            preview,
            details,
        };
    } catch (error) {
        console.error('[reconcileRecurringInstances] Error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
            venueId,
            gamesAnalyzed: 0,
            instancesCreated: 0,
            instancesUpdated: 0,
            orphanGames: 0,
            preview,
            details: [],
        };
    }
}

// ============================================================================
// RECORD MISSED INSTANCE
// ============================================================================

/**
 * Record a missed/cancelled/skipped instance
 */
async function recordMissedInstance(recurringGameId, expectedDate, status, reason, notes) {
    console.log(`[recordMissedInstance] Recording ${status} for ${recurringGameId} on ${expectedDate}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    const recurringGameTable = getTableName('RecurringGame');
    
    try {
        // Get recurring game for context
        let recurringGame = null;
        try {
            const rgResult = await docClient.send(new GetCommand({
                TableName: recurringGameTable,
                Key: { id: recurringGameId },
            }));
            recurringGame = rgResult.Item;
        } catch (e) {
            // Try query if GetCommand fails (table might use different key schema)
            const rgResult = await docClient.send(new QueryCommand({
                TableName: recurringGameTable,
                KeyConditionExpression: 'id = :id',
                ExpressionAttributeValues: { ':id': recurringGameId },
            }));
            recurringGame = rgResult.Items?.[0];
        }
        
        if (!recurringGame) {
            return { 
                success: false, 
                message: 'Recurring game not found', 
                wasCreated: false,
                error: `Recurring game not found: ${recurringGameId}`,
            };
        }
        
        const weekKey = getWeekKey(expectedDate);
        
        // Check for existing instance
        const existingResult = await docClient.send(new QueryCommand({
            TableName: instanceTable,
            IndexName: 'byRecurringGameInstance',
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
                UpdateExpression: 'SET #status = :status, cancellationReason = :reason, notes = :notes, updatedAt = :now, needsReview = :needsReview',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': status,
                    ':reason': reason || null,
                    ':notes': notes || null,
                    ':now': new Date().toISOString(),
                    ':needsReview': false,
                },
            }));
            instance.status = status;
            instance.cancellationReason = reason;
            instance.notes = notes;
            
            console.log(`[recordMissedInstance] Updated existing instance ${instance.id}`);
        } else {
            // Create new
            instance = {
                id: uuidv4(),
                recurringGameId,
                recurringGameName: recurringGame.displayName || recurringGame.name,
                expectedDate,
                dayOfWeek: recurringGame.dayOfWeek,
                weekKey,
                venueId: recurringGame.venueId,
                entityId: recurringGame.entityId,
                status,
                cancellationReason: reason || null,
                notes: notes || null,
                needsReview: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                __typename: 'RecurringGameInstance',
            };
            await docClient.send(new PutCommand({
                TableName: instanceTable,
                Item: instance,
            }));
            wasCreated = true;
            
            console.log(`[recordMissedInstance] Created new instance ${instance.id}`);
        }
        
        return {
            success: true,
            message: wasCreated ? 'Instance created' : 'Instance updated',
            wasCreated,
            instance: {
                id: instance.id,
                recurringGameId,
                recurringGameName: recurringGame.displayName || recurringGame.name,
                expectedDate,
                dayOfWeek: recurringGame.dayOfWeek,
                status,
                cancellationReason: reason,
                notes,
            },
        };
    } catch (error) {
        console.error('[recordMissedInstance] Error:', error);
        return {
            success: false,
            message: 'Failed to record instance',
            wasCreated: false,
            error: error.message || 'Unknown error',
        };
    }
}

// ============================================================================
// UPDATE INSTANCE STATUS
// ============================================================================

/**
 * Update an existing instance's status
 */
async function updateInstanceStatus(instanceId, status, reason, notes, adminNotes) {
    console.log(`[updateInstanceStatus] Updating instance ${instanceId} to ${status}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    try {
        const updateExpressions = ['#status = :status', 'updatedAt = :now'];
        const expressionAttributeNames = { '#status': 'status' };
        const expressionAttributeValues = {
            ':status': status,
            ':now': new Date().toISOString(),
        };
        
        if (reason !== undefined) {
            updateExpressions.push('cancellationReason = :reason');
            expressionAttributeValues[':reason'] = reason;
        }
        
        if (notes !== undefined) {
            updateExpressions.push('notes = :notes');
            expressionAttributeValues[':notes'] = notes;
        }
        
        if (adminNotes !== undefined) {
            updateExpressions.push('adminNotes = :adminNotes');
            expressionAttributeValues[':adminNotes'] = adminNotes;
        }
        
        // Clear needsReview when status is explicitly set
        updateExpressions.push('needsReview = :needsReview');
        expressionAttributeValues[':needsReview'] = false;
        
        await docClient.send(new UpdateCommand({
            TableName: instanceTable,
            Key: { id: instanceId },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        }));
        
        return {
            success: true,
            message: 'Instance updated',
            instance: { 
                id: instanceId, 
                status, 
                cancellationReason: reason, 
                notes,
                adminNotes,
            },
        };
    } catch (error) {
        console.error('[updateInstanceStatus] Error:', error);
        return {
            success: false,
            message: 'Failed to update instance',
            error: error.message || 'Unknown error',
        };
    }
}

// ============================================================================
// COMPLIANCE REPORT
// ============================================================================

/**
 * Get compliance report for a venue
 */
async function getVenueComplianceReport(venueId, startDate, endDate) {
    console.log(`[getVenueComplianceReport] Starting for venue ${venueId}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    const recurringGameTable = getTableName('RecurringGame');
    const venueTable = getTableName('Venue');
    
    try {
        // Get venue name
        let venueName = null;
        try {
            const venueResult = await docClient.send(new GetCommand({
                TableName: venueTable,
                Key: { id: venueId },
                ProjectionExpression: '#n',
                ExpressionAttributeNames: { '#n': 'name' },
            }));
            venueName = venueResult.Item?.name;
        } catch (e) {
            console.warn('[getVenueComplianceReport] Could not fetch venue name');
        }
        
        // Get active recurring games to calculate expected occurrences
        const rgResult = await docClient.send(new ScanCommand({
            TableName: recurringGameTable,
            FilterExpression: 'venueId = :venueId AND (attribute_not_exists(isActive) OR isActive = :true)',
            ExpressionAttributeValues: {
                ':venueId': venueId,
                ':true': true,
            },
        }));
        const recurringGames = rgResult.Items || [];
        
        // Calculate total expected from recurring games
        let totalExpectedFromRG = 0;
        for (const rg of recurringGames) {
            if (rg.dayOfWeek) {
                totalExpectedFromRG += getExpectedDates(rg, startDate, endDate).length;
            }
        }
        
        // Get all instances in date range
        const instancesResult = await docClient.send(new QueryCommand({
            TableName: instanceTable,
            IndexName: 'byVenueInstance',
            KeyConditionExpression: 'venueId = :venueId AND expectedDate BETWEEN :start AND :end',
            ExpressionAttributeValues: {
                ':venueId': venueId,
                ':start': startDate,
                ':end': endDate,
            },
        }));
        
        const instances = instancesResult.Items || [];
        console.log(`[getVenueComplianceReport] Found ${instances.length} instances`);
        
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
            const status = instance.status || 'UNKNOWN';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            if (instance.needsReview) needsReviewCount++;
            
            // Group by week
            const weekKey = instance.weekKey || getWeekKey(instance.expectedDate);
            if (!weekSummaries[weekKey]) {
                // Calculate week start date
                let weekStartDate = null;
                if (getWeekStartFromKey) {
                    try {
                        const weekStart = getWeekStartFromKey(weekKey);
                        weekStartDate = weekStart.toISOString().split('T')[0];
                    } catch (e) {}
                }
                
                weekSummaries[weekKey] = {
                    weekKey,
                    weekStartDate,
                    confirmedCount: 0,
                    cancelledCount: 0,
                    skippedCount: 0,
                    unknownCount: 0,
                    noShowCount: 0,
                    totalExpected: 0,
                    complianceRate: 0,
                    instances: [],
                };
            }
            
            weekSummaries[weekKey].totalExpected++;
            
            // Increment status count
            const statusKey = `${status.toLowerCase()}Count`;
            if (weekSummaries[weekKey][statusKey] !== undefined) {
                weekSummaries[weekKey][statusKey]++;
            }
            
            // Add instance summary
            weekSummaries[weekKey].instances.push({
                id: instance.id,
                recurringGameId: instance.recurringGameId,
                recurringGameName: instance.recurringGameName,
                gameId: instance.gameId,
                expectedDate: instance.expectedDate,
                dayOfWeek: instance.dayOfWeek,
                status: instance.status,
                hasDeviation: instance.hasDeviation,
                deviationType: instance.deviationType,
                cancellationReason: instance.cancellationReason,
                notes: instance.notes,
                needsReview: instance.needsReview,
            });
        }
        
        // Calculate compliance rates for each week
        for (const week of Object.values(weekSummaries)) {
            week.complianceRate = week.totalExpected > 0 ? week.confirmedCount / week.totalExpected : 0;
        }
        
        // Use instance count or RG expected count (whichever is higher/more accurate)
        const totalExpected = Math.max(instances.length, totalExpectedFromRG);
        const totalConfirmed = statusCounts.CONFIRMED;
        
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
            overallComplianceRate: totalExpected > 0 ? totalConfirmed / totalExpected : 0,
            weekSummaries: Object.values(weekSummaries).sort((a, b) => a.weekKey.localeCompare(b.weekKey)),
            needsReviewCount,
            unknownCount: statusCounts.UNKNOWN,
        };
    } catch (error) {
        console.error('[getVenueComplianceReport] Error:', error);
        return {
            success: false,
            error: error.message || 'Unknown error',
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
            unknownCount: 0,
        };
    }
}

// ============================================================================
// GET WEEK INSTANCES
// ============================================================================

/**
 * Get instances for a specific week
 */
async function getWeekInstances(venueOrEntityId, weekKey) {
    console.log(`[getWeekInstances] Getting instances for ${venueOrEntityId}, week ${weekKey}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    const recurringGameTable = getTableName('RecurringGame');
    
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: instanceTable,
            IndexName: 'byWeekKey',
            KeyConditionExpression: 'weekKey = :weekKey',
            FilterExpression: 'venueId = :id OR entityId = :id',
            ExpressionAttributeValues: {
                ':weekKey': weekKey,
                ':id': venueOrEntityId,
            },
        }));
        
        const instances = result.Items || [];
        
        // Calculate week start date
        let weekStartDate = null;
        if (getWeekStartFromKey) {
            try {
                const weekStart = getWeekStartFromKey(weekKey);
                weekStartDate = weekStart.toISOString().split('T')[0];
            } catch (e) {}
        }
        
        // Count by status
        const confirmed = instances.filter(i => i.status === 'CONFIRMED').length;
        const cancelled = instances.filter(i => i.status === 'CANCELLED').length;
        const skipped = instances.filter(i => i.status === 'SKIPPED').length;
        const unknown = instances.filter(i => i.status === 'UNKNOWN').length;
        const noShow = instances.filter(i => i.status === 'NO_SHOW').length;
        
        // Get expected count from recurring games
        let totalExpected = instances.length;
        try {
            const rgResult = await docClient.send(new ScanCommand({
                TableName: recurringGameTable,
                FilterExpression: '(venueId = :id OR entityId = :id) AND (attribute_not_exists(isActive) OR isActive = :true)',
                ExpressionAttributeValues: {
                    ':id': venueOrEntityId,
                    ':true': true,
                },
            }));
            
            if (rgResult.Items && weekStartDate) {
                const weekEnd = new Date(weekStartDate);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const weekEndStr = weekEnd.toISOString().split('T')[0];
                
                let expectedCount = 0;
                for (const rg of rgResult.Items) {
                    if (rg.dayOfWeek) {
                        expectedCount += getExpectedDates(rg, weekStartDate, weekEndStr).length;
                    }
                }
                totalExpected = Math.max(totalExpected, expectedCount);
            }
        } catch (e) {
            console.warn('[getWeekInstances] Could not calculate expected count');
        }
        
        return {
            weekKey,
            weekStartDate,
            confirmedCount: confirmed,
            cancelledCount: cancelled,
            skippedCount: skipped,
            unknownCount: unknown,
            noShowCount: noShow,
            totalExpected,
            complianceRate: totalExpected > 0 ? confirmed / totalExpected : 0,
            instances: instances.map(i => ({
                id: i.id,
                recurringGameId: i.recurringGameId,
                recurringGameName: i.recurringGameName,
                gameId: i.gameId,
                expectedDate: i.expectedDate,
                dayOfWeek: i.dayOfWeek,
                status: i.status,
                hasDeviation: i.hasDeviation,
                deviationType: i.deviationType,
                cancellationReason: i.cancellationReason,
                notes: i.notes,
                needsReview: i.needsReview,
                reviewReason: i.reviewReason,
            })),
            totalCount: instances.length,
        };
    } catch (error) {
        console.error('[getWeekInstances] Error:', error);
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
            instances: [],
            totalCount: 0,
            error: error.message,
        };
    }
}

// ============================================================================
// LIST INSTANCES NEEDING REVIEW
// ============================================================================

/**
 * List instances that need review
 */
async function listInstancesNeedingReview(venueOrEntityId, limit = 50, nextToken) {
    console.log(`[listInstancesNeedingReview] Getting instances needing review`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    try {
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
            items: (result.Items || []).map(i => ({
                id: i.id,
                recurringGameId: i.recurringGameId,
                recurringGameName: i.recurringGameName,
                gameId: i.gameId,
                expectedDate: i.expectedDate,
                dayOfWeek: i.dayOfWeek,
                weekKey: i.weekKey,
                venueId: i.venueId,
                status: i.status,
                hasDeviation: i.hasDeviation,
                deviationType: i.deviationType,
                deviationDetails: i.deviationDetails,
                cancellationReason: i.cancellationReason,
                notes: i.notes,
                needsReview: i.needsReview,
                reviewReason: i.reviewReason,
            })),
            nextToken: result.LastEvaluatedKey 
                ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
                : null,
            totalCount: result.Count,
        };
    } catch (error) {
        console.error('[listInstancesNeedingReview] Error:', error);
        return {
            items: [],
            nextToken: null,
            totalCount: 0,
            error: error.message,
        };
    }
}

// ============================================================================
// CREATE CONFIRMED INSTANCE (for resolver use)
// ============================================================================

/**
 * Create a confirmed instance when a game is assigned to a template
 * Called by the enricher/resolver when a game gets linked to a recurring game
 * 
 * @returns {{ instance: Object, wasCreated: boolean } | null}
 */
async function createConfirmedInstance({ recurringGame, game, matchConfidence }) {
    console.log(`[createConfirmedInstance] Creating instance for game ${game.id} -> recurring ${recurringGame.id}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    try {
        const gameDate = extractDate(game.gameStartDateTime || game.date);
        if (!gameDate) {
            console.warn('[createConfirmedInstance] Could not extract game date');
            return null;
        }
        
        const weekKey = getWeekKey(gameDate);
        
        // Check for existing instance
        const existingResult = await docClient.send(new QueryCommand({
            TableName: instanceTable,
            IndexName: 'byRecurringGameInstance',
            KeyConditionExpression: 'recurringGameId = :rgId AND expectedDate = :date',
            ExpressionAttributeValues: {
                ':rgId': recurringGame.id,
                ':date': gameDate,
            },
        }));
        
        if (existingResult.Items && existingResult.Items.length > 0) {
            // Update existing instance
            const existingInstance = existingResult.Items[0];
            await docClient.send(new UpdateCommand({
                TableName: instanceTable,
                Key: { id: existingInstance.id },
                UpdateExpression: 'SET gameId = :gameId, #status = :status, updatedAt = :now, needsReview = :needsReview',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':gameId': game.id,
                    ':status': 'CONFIRMED',
                    ':now': new Date().toISOString(),
                    ':needsReview': false,
                },
            }));
            
            console.log(`[createConfirmedInstance] Updated existing instance ${existingInstance.id}`);
            return {
                instance: {
                    id: existingInstance.id,
                    recurringGameId: recurringGame.id,
                    gameId: game.id,
                    expectedDate: gameDate,
                    status: 'CONFIRMED',
                    hasDeviation: existingInstance.hasDeviation || false,
                },
                wasCreated: false,
            };
        }
        
        // Create new instance
        const instanceId = uuidv4();
        const newInstance = {
            id: instanceId,
            recurringGameId: recurringGame.id,
            recurringGameName: recurringGame.displayName || recurringGame.name,
            gameId: game.id,
            expectedDate: gameDate,
            dayOfWeek: recurringGame.dayOfWeek || getDayOfWeek(gameDate),
            weekKey,
            venueId: recurringGame.venueId,
            entityId: recurringGame.entityId,
            status: 'CONFIRMED',
            needsReview: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            __typename: 'RecurringGameInstance',
        };
        
        await docClient.send(new PutCommand({
            TableName: instanceTable,
            Item: newInstance,
        }));
        
        console.log(`[createConfirmedInstance] Created new instance ${instanceId}`);
        return {
            instance: {
                id: instanceId,
                recurringGameId: recurringGame.id,
                gameId: game.id,
                expectedDate: gameDate,
                status: 'CONFIRMED',
                hasDeviation: false,
            },
            wasCreated: true,
        };
    } catch (error) {
        console.error('[createConfirmedInstance] Error:', error);
        return null;
    }
}

// ============================================================================
// UPDATE INSTANCE GAME ID (for post-save linkage)
// ============================================================================

/**
 * Update an instance's gameId after the game has been saved
 * Called by the enricher after saveGameFunction returns with the actual gameId
 * 
 * This is needed because createConfirmedInstance is called during recurring
 * resolution (Step 5), but the game doesn't have an ID until it's saved (Step 8).
 * 
 * @param {string} instanceId - The instance ID to update
 * @param {string} gameId - The actual game ID from the save result
 * @returns {Promise<boolean>} Whether the update succeeded
 */
async function updateInstanceGameId(instanceId, gameId) {
    if (!instanceId || !gameId) {
        console.warn('[updateInstanceGameId] Missing instanceId or gameId');
        return false;
    }
    
    console.log(`[updateInstanceGameId] Updating instance ${instanceId} with gameId ${gameId}`);
    
    const docClient = getDocClient();
    const instanceTable = getTableName('RecurringGameInstance');
    
    try {
        await docClient.send(new UpdateCommand({
            TableName: instanceTable,
            Key: { id: instanceId },
            UpdateExpression: 'SET gameId = :gameId, updatedAt = :now',
            ExpressionAttributeValues: {
                ':gameId': gameId,
                ':now': new Date().toISOString(),
            },
        }));
        
        console.log(`[updateInstanceGameId] Successfully updated instance ${instanceId}`);
        return true;
    } catch (error) {
        console.error('[updateInstanceGameId] Error:', error);
        return false;
    }
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
    updateInstanceGameId,
    
    // Utilities
    getWeekKey,
    getDayOfWeek,
    getExpectedDates,
    getExpectedDatesSimple,
    extractDate,
};