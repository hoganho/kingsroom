/**
 * backfill-scheduler.js
 * 
 * Handles scheduled and manual backfill of RecurringGameInstance records.
 * Creates UNKNOWN instances for all gaps between last recorded instance and current date.
 * 
 * VERSION 1.0.0
 * 
 * Features:
 * - Invokable via EventBridge (daily scheduled)
 * - Invokable via GraphQL mutation (manual trigger)
 * - Processes ALL active, non-paused recurring games
 * - Uses lastGameDate or firstGameDate as start reference
 * - Creates UNKNOWN instances for missing dates
 * - Supports filtering by venueId, entityId, or recurringGameId
 * - Dry-run mode for preview
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolution/backfill-scheduler.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, PutCommand, ScanCommand, GetCommand } = require('../utils/db-client');

// Import date utilities - try enhanced version first
let calculateExpectedDatesEnhanced = null;
let getWeekKeyFromUtils = null;

try {
    const dateUtils = require('../utils/date-utils');
    calculateExpectedDatesEnhanced = dateUtils.calculateExpectedDates;
    getWeekKeyFromUtils = dateUtils.getWeekKey;
} catch (e) {
    console.warn('[backfill-scheduler] Enhanced date-utils not available, using fallback calculations');
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LOOKBACK_DAYS = 365; // Default to 1 year if no firstGameDate
const MAX_INSTANCES_PER_RUN = 5000; // Safety limit

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get week key from date (YYYY-Www format)
 */
function getWeekKey(dateStr) {
    if (getWeekKeyFromUtils) {
        try {
            return getWeekKeyFromUtils(dateStr);
        } catch (e) {
            // Fall back to simple calculation
        }
    }
    
    const date = new Date(dateStr);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

/**
 * Generate expected dates for a recurring game within a date range
 */
function getExpectedDates(recurringGame, startDate, endDate) {
    // Use enhanced calculation if available
    if (calculateExpectedDatesEnhanced && typeof recurringGame === 'object') {
        try {
            return calculateExpectedDatesEnhanced(recurringGame, startDate, endDate);
        } catch (e) {
            console.warn('[backfill-scheduler] Enhanced date calculation failed, using fallback:', e.message);
        }
    }
    
    // Simple weekly calculation fallback
    const dayOfWeek = typeof recurringGame === 'string' ? recurringGame : recurringGame?.dayOfWeek;
    if (!dayOfWeek) return [];
    
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const targetDayIndex = days.indexOf(dayOfWeek.toUpperCase());
    if (targetDayIndex === -1) return [];
    
    const dates = [];
    const start = new Date(startDate + 'T12:00:00Z');
    const end = new Date(endDate + 'T12:00:00Z');
    
    // Find first occurrence
    let current = new Date(start);
    while (current.getUTCDay() !== targetDayIndex) {
        current.setUTCDate(current.getUTCDate() + 1);
    }
    
    // Collect all occurrences (assuming WEEKLY frequency for fallback)
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setUTCDate(current.getUTCDate() + 7);
    }
    
    return dates;
}

/**
 * Get the start date for backfill calculation
 * Priority: lastGameDate -> firstGameDate -> default lookback
 */
function getBackfillStartDate(recurringGame) {
    // If we have a lastGameDate, start from the day after
    if (recurringGame.lastGameDate) {
        const lastDate = new Date(recurringGame.lastGameDate);
        lastDate.setDate(lastDate.getDate() + 1);
        return lastDate.toISOString().split('T')[0];
    }
    
    // If we have a firstGameDate, use that
    if (recurringGame.firstGameDate) {
        return recurringGame.firstGameDate.split('T')[0];
    }
    
    // Default: look back DEFAULT_LOOKBACK_DAYS from today
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - DEFAULT_LOOKBACK_DAYS);
    return lookbackDate.toISOString().split('T')[0];
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// ============================================================================
// MAIN BACKFILL FUNCTION
// ============================================================================

/**
 * Backfill RecurringGameInstance records for all active recurring games
 * 
 * @param {Object} input - Input parameters
 * @param {string} [input.venueId] - Optional: Filter to specific venue
 * @param {string} [input.entityId] - Optional: Filter to specific entity
 * @param {string} [input.recurringGameId] - Optional: Filter to specific recurring game
 * @param {string} [input.startDate] - Optional: Override start date (YYYY-MM-DD)
 * @param {string} [input.endDate] - Optional: Override end date (YYYY-MM-DD), defaults to today
 * @param {boolean} [input.dryRun=false] - If true, don't create instances, just report what would be created
 * @param {number} [input.limit] - Maximum instances to create (safety limit)
 * @returns {Object} Result with statistics and details
 */
async function backfillRecurringGameInstances(input = {}) {
    const {
        venueId,
        entityId,
        recurringGameId,
        startDate: overrideStartDate,
        endDate: overrideEndDate,
        dryRun = false,
        limit = MAX_INSTANCES_PER_RUN,
    } = input;
    
    console.log('[backfillRecurringGameInstances] Starting with input:', JSON.stringify(input));
    
    const docClient = getDocClient();
    const recurringGameTable = getTableName('RecurringGame');
    const instanceTable = getTableName('RecurringGameInstance');
    
    const endDate = overrideEndDate || getTodayDate();
    const stats = {
        success: true,
        dryRun,
        startedAt: new Date().toISOString(),
        endDate,
        recurringGamesProcessed: 0,
        recurringGamesSkipped: 0,
        totalExpectedInstances: 0,
        existingInstancesFound: 0,
        gapsFound: 0,
        instancesCreated: 0,
        errors: 0,
        details: [],
        byVenue: {},
        byEntity: {},
    };
    
    try {
        // ====================================================================
        // 1. GET ACTIVE RECURRING GAMES
        // ====================================================================
        
        let recurringGames = [];
        
        if (recurringGameId) {
            // Fetch single recurring game
            const result = await docClient.send(new GetCommand({
                TableName: recurringGameTable,
                Key: { id: recurringGameId },
            }));
            if (result.Item && result.Item.isActive !== false && !result.Item.isPaused) {
                recurringGames = [result.Item];
            }
        } else {
            // Scan for all active, non-paused games
            let scanParams = {
                TableName: recurringGameTable,
                FilterExpression: '(attribute_not_exists(isActive) OR isActive = :true) AND (attribute_not_exists(isPaused) OR isPaused = :false)',
                ExpressionAttributeValues: {
                    ':true': true,
                    ':false': false,
                },
            };
            
            // Add optional filters
            if (venueId) {
                scanParams.FilterExpression += ' AND venueId = :venueId';
                scanParams.ExpressionAttributeValues[':venueId'] = venueId;
            }
            if (entityId) {
                scanParams.FilterExpression += ' AND entityId = :entityId';
                scanParams.ExpressionAttributeValues[':entityId'] = entityId;
            }
            
            let lastEvaluatedKey = null;
            do {
                if (lastEvaluatedKey) {
                    scanParams.ExclusiveStartKey = lastEvaluatedKey;
                }
                
                const result = await docClient.send(new ScanCommand(scanParams));
                recurringGames.push(...(result.Items || []));
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);
        }
        
        console.log(`[backfillRecurringGameInstances] Found ${recurringGames.length} active recurring games`);
        
        if (recurringGames.length === 0) {
            return {
                ...stats,
                message: 'No active recurring games found matching criteria',
            };
        }
        
        // ====================================================================
        // 2. PROCESS EACH RECURRING GAME
        // ====================================================================
        
        let totalInstancesCreated = 0;
        
        for (const rg of recurringGames) {
            // Check safety limit
            if (totalInstancesCreated >= limit) {
                console.log(`[backfillRecurringGameInstances] Reached limit of ${limit} instances`);
                stats.details.push({
                    type: 'LIMIT_REACHED',
                    message: `Stopped at ${limit} instances`,
                });
                break;
            }
            
            // Skip games without dayOfWeek
            if (!rg.dayOfWeek) {
                console.log(`[backfillRecurringGameInstances] Skipping ${rg.id} - no dayOfWeek`);
                stats.recurringGamesSkipped++;
                continue;
            }
            
            // Determine date range for this game
            const gameStartDate = overrideStartDate || getBackfillStartDate(rg);
            
            // Skip if start date is after end date
            if (gameStartDate > endDate) {
                console.log(`[backfillRecurringGameInstances] Skipping ${rg.id} - start date ${gameStartDate} > end date ${endDate}`);
                stats.recurringGamesSkipped++;
                continue;
            }
            
            stats.recurringGamesProcessed++;
            
            // Initialize venue/entity stats
            if (!stats.byVenue[rg.venueId]) {
                stats.byVenue[rg.venueId] = { gapsFound: 0, instancesCreated: 0 };
            }
            if (!stats.byEntity[rg.entityId]) {
                stats.byEntity[rg.entityId] = { gapsFound: 0, instancesCreated: 0 };
            }
            
            // Calculate expected dates
            const expectedDates = getExpectedDates(rg, gameStartDate, endDate);
            stats.totalExpectedInstances += expectedDates.length;
            
            // Check each expected date for existing instance
            for (const expectedDate of expectedDates) {
                // Check safety limit again
                if (totalInstancesCreated >= limit) break;
                
                const weekKey = getWeekKey(expectedDate);
                
                // Check if instance already exists
                try {
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
                        stats.existingInstancesFound++;
                        continue; // Instance already exists
                    }
                } catch (queryError) {
                    console.warn(`[backfillRecurringGameInstances] Error checking instance for ${rg.id}/${expectedDate}:`, queryError.message);
                    // Continue to create instance anyway
                }
                
                // Gap found - create UNKNOWN instance
                stats.gapsFound++;
                stats.byVenue[rg.venueId].gapsFound++;
                stats.byEntity[rg.entityId].gapsFound++;
                
                if (!dryRun) {
                    try {
                        const instanceId = uuidv4();
                        const instanceItem = {
                            id: instanceId,
                            recurringGameId: rg.id,
                            recurringGameName: rg.displayName || rg.name,
                            expectedDate,
                            dayOfWeek: rg.dayOfWeek,
                            weekKey,
                            venueId: rg.venueId,
                            entityId: rg.entityId,
                            status: 'UNKNOWN',
                            needsReview: true,
                            reviewReason: 'Auto-created by scheduled backfill',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            __typename: 'RecurringGameInstance',
                        };
                        
                        await docClient.send(new PutCommand({
                            TableName: instanceTable,
                            Item: instanceItem,
                            ConditionExpression: 'attribute_not_exists(id)', // Prevent overwrites
                        }));
                        
                        stats.instancesCreated++;
                        stats.byVenue[rg.venueId].instancesCreated++;
                        stats.byEntity[rg.entityId].instancesCreated++;
                        totalInstancesCreated++;
                        
                    } catch (putError) {
                        if (putError.name === 'ConditionalCheckFailedException') {
                            // Instance was created by another process - that's fine
                            stats.existingInstancesFound++;
                        } else {
                            console.error(`[backfillRecurringGameInstances] Error creating instance:`, putError);
                            stats.errors++;
                        }
                    }
                } else {
                    // Dry run - just count
                    stats.instancesCreated++;
                    stats.byVenue[rg.venueId].instancesCreated++;
                    stats.byEntity[rg.entityId].instancesCreated++;
                    totalInstancesCreated++;
                }
            }
        }
        
        stats.completedAt = new Date().toISOString();
        stats.message = dryRun 
            ? `Dry run complete. Would create ${stats.instancesCreated} instances for ${stats.gapsFound} gaps.`
            : `Created ${stats.instancesCreated} instances for ${stats.gapsFound} gaps across ${stats.recurringGamesProcessed} recurring games.`;
        
        console.log(`[backfillRecurringGameInstances] Complete:`, JSON.stringify(stats, null, 2));
        
        return stats;
        
    } catch (error) {
        console.error('[backfillRecurringGameInstances] Fatal error:', error);
        return {
            ...stats,
            success: false,
            error: error.message,
            completedAt: new Date().toISOString(),
        };
    }
}

// ============================================================================
// EVENTBRIDGE HANDLER
// ============================================================================

/**
 * Handle EventBridge scheduled event
 * Runs backfill for all active recurring games
 */
async function handleScheduledBackfill(event) {
    console.log('[handleScheduledBackfill] Triggered by EventBridge:', JSON.stringify(event));
    
    // Run full backfill with defaults
    const result = await backfillRecurringGameInstances({
        dryRun: false,
    });
    
    // Log summary for CloudWatch
    console.log('[handleScheduledBackfill] Summary:', {
        success: result.success,
        recurringGamesProcessed: result.recurringGamesProcessed,
        gapsFound: result.gapsFound,
        instancesCreated: result.instancesCreated,
        errors: result.errors,
    });
    
    return result;
}

// ============================================================================
// LAST RUN TRACKING (Optional - for UI display)
// ============================================================================

/**
 * Get the last backfill run status
 * Can be extended to store in DynamoDB for persistence
 */
async function getBackfillStatus() {
    // For now, return basic info
    // Could be extended to track in a ScraperState-like table
    return {
        available: true,
        lastRun: null, // Would come from DynamoDB
        nextScheduledRun: null, // Would come from EventBridge
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    backfillRecurringGameInstances,
    handleScheduledBackfill,
    getBackfillStatus,
    // Utilities for testing
    getBackfillStartDate,
    getExpectedDates,
    getWeekKey,
};
