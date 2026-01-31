/**
 * backfill-scheduler.js
 * 
 * Handles scheduled and manual backfill of RecurringGameInstance records.
 * Creates UNKNOWN instances for all gaps between last recorded instance and current date.
 * 
 * VERSION 1.2.0 - Added SES notifications for EventBridge scheduled runs
 * 
 * CHANGELOG:
 * v1.2.0 - Added SES email notifications when triggered by EventBridge
 * v1.1.0 - Added backfillGameInstance filter
 * v1.0.0 - Initial release
 * 
 * Features:
 * - Invokable via EventBridge (daily scheduled)
 * - Invokable via GraphQL mutation (manual trigger)
 * - Processes ONLY recurring games with backfillGameInstance=true
 * - Uses lastGameDate or firstGameDate as start reference
 * - Creates UNKNOWN instances for missing dates
 * - Supports filtering by venueId, entityId, or recurringGameId
 * - Dry-run mode for preview
 * - SES email notifications on scheduled runs
 * 
 * IMPORTANT: Only recurring games with backfillGameInstance=true will be processed.
 * This allows selective backfill for specific games rather than all games.
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolution/backfill-scheduler.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, PutCommand, ScanCommand, GetCommand } = require('../utils/db-client');

// SES Notification (optional - gracefully handle if not available)
let sendNotification = null;
let isEventBridgeTrigger = null;
try {
    const sesNotification = require('../ses-notification');
    sendNotification = sesNotification.sendNotification;
    isEventBridgeTrigger = sesNotification.isEventBridgeTrigger;
} catch (e) {
    console.warn('[backfill-scheduler] SES notification module not available, notifications disabled');
}

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

/**
 * Check if a recurring game is eligible for backfill
 * @param {Object} recurringGame - The recurring game record
 * @returns {boolean} - True if eligible for backfill
 */
function isEligibleForBackfill(recurringGame) {
    // Must have backfillGameInstance explicitly set to true
    if (recurringGame.backfillGameInstance !== true) {
        return false;
    }
    
    // Must be active
    if (recurringGame.isActive === false) {
        return false;
    }
    
    // Must not be paused
    if (recurringGame.isPaused === true) {
        return false;
    }
    
    // Must not be deleted
    if (recurringGame._deleted === true) {
        return false;
    }
    
    return true;
}

// ============================================================================
// MAIN BACKFILL FUNCTION
// ============================================================================

/**
 * Backfill RecurringGameInstance records for recurring games with backfillGameInstance=true
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
        recurringGamesNotEligible: 0, // NEW: Track games without backfillGameInstance=true
        totalExpectedInstances: 0,
        existingInstancesFound: 0,
        gapsFound: 0,
        instancesCreated: 0,
        errors: 0,
        details: [],
        byVenue: {},
        byEntity: {},
        // NEW: Per-game details for notifications
        gameDetails: [],
    };
    
    try {
        // ====================================================================
        // 1. GET RECURRING GAMES WITH backfillGameInstance=true
        // ====================================================================
        
        let recurringGames = [];
        
        if (recurringGameId) {
            // Fetch single recurring game
            const result = await docClient.send(new GetCommand({
                TableName: recurringGameTable,
                Key: { id: recurringGameId },
            }));
            
            if (result.Item) {
                // Check if eligible for backfill (including backfillGameInstance=true)
                if (isEligibleForBackfill(result.Item)) {
                    recurringGames = [result.Item];
                } else {
                    console.log(`[backfillRecurringGameInstances] Recurring game ${recurringGameId} not eligible for backfill (backfillGameInstance=${result.Item.backfillGameInstance}, isActive=${result.Item.isActive}, isPaused=${result.Item.isPaused})`);
                    stats.recurringGamesNotEligible = 1;
                    return {
                        ...stats,
                        message: `Recurring game ${recurringGameId} is not eligible for backfill. Ensure backfillGameInstance=true, isActive=true, and isPaused=false.`,
                    };
                }
            } else {
                return {
                    ...stats,
                    message: `Recurring game ${recurringGameId} not found.`,
                };
            }
        } else {
            // Scan for games with backfillGameInstance=true (and active, not paused)
            let scanParams = {
                TableName: recurringGameTable,
                FilterExpression: 'backfillGameInstance = :backfillEnabled AND (attribute_not_exists(isActive) OR isActive = :true) AND (attribute_not_exists(isPaused) OR isPaused = :false) AND (attribute_not_exists(#deleted) OR #deleted = :false)',
                ExpressionAttributeNames: {
                    '#deleted': '_deleted',
                },
                ExpressionAttributeValues: {
                    ':backfillEnabled': true,  // KEY FILTER: Only process games with backfillGameInstance=true
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
        
        console.log(`[backfillRecurringGameInstances] Found ${recurringGames.length} recurring games with backfillGameInstance=true`);
        
        if (recurringGames.length === 0) {
            return {
                ...stats,
                message: 'No recurring games with backfillGameInstance=true found matching criteria. Enable backfillGameInstance for games you want to include in automatic backfill.',
            };
        }
        
        // ====================================================================
        // 2. PROCESS EACH RECURRING GAME
        // ====================================================================
        
        // Fetch entity names for reporting
        const entityNames = {};
        const entityTable = getTableName('Entity');
        
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
                stats.byEntity[rg.entityId] = { gapsFound: 0, instancesCreated: 0, name: null };
            }
            
            // Fetch entity name if not already cached
            if (rg.entityId && !entityNames[rg.entityId]) {
                try {
                    const entityResult = await docClient.send(new GetCommand({
                        TableName: entityTable,
                        Key: { id: rg.entityId },
                        ProjectionExpression: '#name',
                        ExpressionAttributeNames: { '#name': 'name' },
                    }));
                    entityNames[rg.entityId] = entityResult.Item?.name || rg.entityId;
                    stats.byEntity[rg.entityId].name = entityNames[rg.entityId];
                } catch (entityErr) {
                    console.warn(`[backfillRecurringGameInstances] Could not fetch entity name for ${rg.entityId}:`, entityErr.message);
                    entityNames[rg.entityId] = rg.entityId; // Fallback to ID
                }
            }
            
            // Track per-game details
            const gameDetail = {
                recurringGameId: rg.id,
                recurringGameName: rg.displayName || rg.name || 'Unnamed',
                entityId: rg.entityId,
                entityName: entityNames[rg.entityId] || rg.entityId,
                venueId: rg.venueId,
                dayOfWeek: rg.dayOfWeek,
                instanceDatesCreated: [],
                gapsFound: 0,
                existingFound: 0,
            };
            
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
                        gameDetail.existingFound++;
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
                gameDetail.gapsFound++;
                
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
                        gameDetail.instanceDatesCreated.push(expectedDate);
                        
                    } catch (putError) {
                        if (putError.name === 'ConditionalCheckFailedException') {
                            // Instance was created by another process - that's fine
                            stats.existingInstancesFound++;
                            gameDetail.existingFound++;
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
                    gameDetail.instanceDatesCreated.push(expectedDate);
                }
            }
            
            // Add game detail to stats (only if instances were created)
            if (gameDetail.instanceDatesCreated.length > 0) {
                stats.gameDetails.push(gameDetail);
            }
        }
        
        stats.completedAt = new Date().toISOString();
        stats.message = dryRun 
            ? `Dry run complete. Would create ${stats.instancesCreated} instances for ${stats.gapsFound} gaps across ${stats.recurringGamesProcessed} recurring games (with backfillGameInstance=true).`
            : `Created ${stats.instancesCreated} instances for ${stats.gapsFound} gaps across ${stats.recurringGamesProcessed} recurring games (with backfillGameInstance=true).`;
        
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
 * Runs backfill for all recurring games with backfillGameInstance=true
 * Sends SES notification on completion
 */
async function handleScheduledBackfill(event) {
    console.log('[handleScheduledBackfill] Triggered by EventBridge:', JSON.stringify(event));
    
    const startTime = Date.now();
    let result = null;
    let error = null;
    
    try {
        // Run full backfill with defaults (only processes games with backfillGameInstance=true)
        result = await backfillRecurringGameInstances({
            dryRun: false,
        });
        
        // Log summary for CloudWatch
        console.log('[handleScheduledBackfill] Summary:', {
            success: result.success,
            recurringGamesProcessed: result.recurringGamesProcessed,
            recurringGamesNotEligible: result.recurringGamesNotEligible,
            gapsFound: result.gapsFound,
            instancesCreated: result.instancesCreated,
            errors: result.errors,
        });
        
    } catch (err) {
        console.error('[handleScheduledBackfill] Error:', err);
        error = err;
        result = {
            success: false,
            error: err.message,
            recurringGamesProcessed: 0,
            instancesCreated: 0,
            gapsFound: 0,
            errors: 1,
        };
    }
    
    const durationMs = Date.now() - startTime;
    
    // Send SES notification
    if (sendNotification) {
        try {
            // Build venue breakdown for email
            const venueBreakdown = result.byVenue ? Object.entries(result.byVenue)
                .filter(([_, v]) => v.instancesCreated > 0)
                .map(([venueId, v]) => `${venueId}: ${v.instancesCreated} created`)
                .slice(0, 10) : [];
            
            // Format per-game details for email
            const gameDetails = result.gameDetails || [];
            const formattedGameDetails = gameDetails.length > 0 
                ? formatGameDetailsForEmail(gameDetails)
                : null;
            
            await sendNotification({
                lambdaName: 'recurringGameBackfill',
                status: result.success ? 'success' : 'failure',
                triggerSource: 'EVENTBRIDGE',
                durationMs,
                error: error ? error.message : (result.error || null),
                summary: {
                    recurringGamesProcessed: result.recurringGamesProcessed || 0,
                    recurringGamesSkipped: result.recurringGamesSkipped || 0,
                    totalExpectedInstances: result.totalExpectedInstances || 0,
                    existingInstancesFound: result.existingInstancesFound || 0,
                    gapsFound: result.gapsFound || 0,
                    instancesCreated: result.instancesCreated || 0,
                    errors: result.errors || 0,
                    endDate: result.endDate || 'N/A',
                    message: result.message || '',
                    ...(venueBreakdown.length > 0 && { venueBreakdown: venueBreakdown.join(', ') }),
                },
                // Pass formatted game details as custom section
                customSections: formattedGameDetails ? [{
                    title: `📅 INSTANCES CREATED BY GAME (${gameDetails.length})`,
                    content: formattedGameDetails,
                }] : null,
            });
            
            console.log('[handleScheduledBackfill] SES notification sent');
        } catch (notifyErr) {
            // Don't fail the job if notification fails
            console.error('[handleScheduledBackfill] Failed to send notification:', notifyErr);
        }
    }
    
    return result;
}

/**
 * Format game details for email notification
 * @param {Array} gameDetails - Array of game detail objects
 * @returns {string} Formatted string for email
 */
function formatGameDetailsForEmail(gameDetails) {
    if (!gameDetails || gameDetails.length === 0) return '';
    
    const lines = [];
    
    // Group by entity for cleaner display
    const byEntity = {};
    for (const game of gameDetails) {
        const entityKey = game.entityName || game.entityId || 'Unknown Entity';
        if (!byEntity[entityKey]) {
            byEntity[entityKey] = [];
        }
        byEntity[entityKey].push(game);
    }
    
    for (const [entityName, games] of Object.entries(byEntity)) {
        lines.push(`\n  🏢 ${entityName}`);
        lines.push('  ' + '─'.repeat(40));
        
        for (const game of games) {
            const gameName = game.recurringGameName || 'Unnamed Game';
            const dates = game.instanceDatesCreated || [];
            
            lines.push(`\n    🎮 ${gameName}`);
            lines.push(`       Day: ${game.dayOfWeek || 'N/A'}`);
            lines.push(`       Instances Created: ${dates.length}`);
            
            if (dates.length > 0) {
                // Show dates - limit to 10, then summarize
                const displayDates = dates.slice(0, 10);
                lines.push(`       Dates: ${displayDates.join(', ')}${dates.length > 10 ? ` ... +${dates.length - 10} more` : ''}`);
            }
        }
    }
    
    return lines.join('\n');
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
    isEligibleForBackfill,
    formatGameDetailsForEmail,
};