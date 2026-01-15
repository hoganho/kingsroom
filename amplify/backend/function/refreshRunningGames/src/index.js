/**
 * ===================================================================
 * REFRESH RUNNING GAMES - Scheduled Lambda
 * ===================================================================
 * 
 * VERSION: 2.2.0 - Added saveAfterFetch to complete the refresh cycle
 * 
 * CHANGELOG:
 * - v2.2.0: Added saveAfterFetch: true to scraper payload
 *           This ensures fetched data is actually saved to Game table
 *           and triggers syncActiveGame for dashboard updates
 *           FIXES: Games were being fetched but data was discarded
 * - v2.1.0: Added global auto-refresh toggle check
 * 
 * PURPOSE:
 * Runs on a schedule to find stale ActiveGame records and trigger 
 * re-scraping to keep dashboard data fresh from the live source (not S3 cache).
 * 
 * THE COMPLETE REFRESH CYCLE (v2.2.0):
 * 1. refreshRunningGames finds stale ActiveGame records
 * 2. Invokes webScraperFunction with saveAfterFetch: true
 * 3. webScraperFunction fetches fresh HTML and parses it
 * 4. webScraperFunction auto-saves via save-handler -> gameDataEnricher -> saveGameFunction
 * 5. saveGameFunction calls syncActiveGame to update ActiveGame table
 * 6. ActiveGame.lastRefreshedAt is updated, preventing immediate re-refresh
 * 
 * REFRESH SCHEDULE (when enabled):
 * - RUNNING/CLOCK_STOPPED: Every 30 minutes (clock-aligned)
 * - INITIATING/REGISTERING/SCHEDULED (<24h): Every 1 hour
 * - INITIATING/REGISTERING/SCHEDULED (>24h): Every 12 hours
 * 
 * TRIGGER:
 * EventBridge scheduled rule: rate(15 minutes)
 * (Lambda runs every 15 mins but only refreshes games when their threshold is met)
 * 
 * ENVIRONMENT VARIABLES:
 * - API_KINGSROOM_GRAPHQLAPIIDOUTPUT
 * - API_KINGSROOM_ACTIVEGAMETABLE_NAME
 * - API_KINGSROOM_SCRAPERSETTINGSTABLE_NAME
 * - FUNCTION_WEBSCRAPERFUNCTION_NAME (e.g., webScraperFunction-dev)
 * - ENV
 * - REGION
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize clients
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({});

// ===================================================================
// CONFIGURATION
// ===================================================================

// Global settings record ID (must match frontend)
const GLOBAL_SETTINGS_ID = 'GLOBAL_SCRAPER_SETTINGS';

// Default thresholds (can be overridden by ScraperSettings)
const DEFAULT_STALE_THRESHOLD_MINUTES = {
    RUNNING: 30,
    CLOCK_STOPPED: 30,
    STARTING_SOON: 60,
    UPCOMING: 720
};

// 24 hours in milliseconds
const STARTING_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Maximum games to refresh per invocation (to avoid timeout)
const MAX_REFRESH_PER_RUN = 50;

// Batch size for Lambda invocations
const BATCH_SIZE = 10;

// ===================================================================
// TABLE NAME HELPERS
// ===================================================================

const getActiveGameTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_ACTIVEGAMETABLE_NAME) {
        return process.env.API_KINGSROOM_ACTIVEGAMETABLE_NAME;
    }
    
    return `ActiveGame-${apiId}-${env}`;
};

const getScraperSettingsTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_SCRAPERSETTINGSTABLE_NAME) {
        return process.env.API_KINGSROOM_SCRAPERSETTINGSTABLE_NAME;
    }
    
    return `ScraperSettings-${apiId}-${env}`;
};

const getScraperFunctionName = () => {
    return process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME || `webScraperFunction-${process.env.ENV || 'dev'}`;
};

// ===================================================================
// CHECK GLOBAL SETTINGS
// ===================================================================

/**
 * Check if auto-refresh is enabled in ScraperSettings
 * Returns { enabled: boolean, settings: object | null }
 */
async function checkAutoRefreshEnabled() {
    try {
        const result = await docClient.send(new GetCommand({
            TableName: getScraperSettingsTableName(),
            Key: { id: GLOBAL_SETTINGS_ID }
        }));

        if (result.Item) {
            return {
                enabled: result.Item.autoRefreshEnabled === true,
                settings: result.Item
            };
        }

        // No settings found - default to enabled
        console.log('[REFRESH] No ScraperSettings found, defaulting to enabled');
        return { enabled: true, settings: null };

    } catch (error) {
        // If table doesn't exist or other error, default to enabled
        // This ensures the system works before ScraperSettings is set up
        console.warn('[REFRESH] Could not check ScraperSettings:', error.message);
        console.log('[REFRESH] Defaulting to enabled');
        return { enabled: true, settings: null };
    }
}

/**
 * Get refresh thresholds from settings or use defaults
 */
function getThresholdsFromSettings(settings) {
    if (!settings) return DEFAULT_STALE_THRESHOLD_MINUTES;

    return {
        RUNNING: settings.runningRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.RUNNING,
        CLOCK_STOPPED: settings.runningRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.CLOCK_STOPPED,
        STARTING_SOON: settings.startingSoonRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.STARTING_SOON,
        UPCOMING: settings.upcomingRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.UPCOMING
    };
}

// ===================================================================
// STALENESS HELPERS
// ===================================================================

/**
 * Determine the appropriate stale threshold based on game status and start time
 */
const getStaleThreshold = (game, thresholds) => {
    const status = game.gameStatus;
    
    // Running and clock stopped games
    if (status === 'RUNNING') {
        return thresholds.RUNNING;
    }
    if (status === 'CLOCK_STOPPED') {
        return thresholds.CLOCK_STOPPED;
    }
    
    // For pre-start statuses, check if it's starting soon (<24h) or upcoming (>24h)
    if (['INITIATING', 'REGISTERING', 'SCHEDULED'].includes(status)) {
        const startTime = new Date(game.gameStartDateTime);
        const now = new Date();
        const timeUntilStart = startTime.getTime() - now.getTime();
        
        if (timeUntilStart <= 0) {
            return thresholds.STARTING_SOON;
        } else if (timeUntilStart <= STARTING_SOON_THRESHOLD_MS) {
            return thresholds.STARTING_SOON;
        } else {
            return thresholds.UPCOMING;
        }
    }
    
    // Fallback
    return thresholds.STARTING_SOON;
};

/**
 * Categorize a game for reporting purposes
 */
const categorizeGame = (game) => {
    const status = game.gameStatus;
    
    if (status === 'RUNNING' || status === 'CLOCK_STOPPED') {
        return 'RUNNING';
    }
    
    if (['INITIATING', 'REGISTERING', 'SCHEDULED'].includes(status)) {
        const startTime = new Date(game.gameStartDateTime);
        const now = new Date();
        const timeUntilStart = startTime.getTime() - now.getTime();
        
        if (timeUntilStart <= STARTING_SOON_THRESHOLD_MS) {
            return 'STARTING_SOON';
        } else {
            return 'UPCOMING';
        }
    }
    
    return status;
};

/**
 * Check if a game is stale based on its status, start time, and last refresh time
 */
const isStale = (game, now, thresholds) => {
    const thresholdMinutes = getStaleThreshold(game, thresholds);
    const lastRefresh = new Date(game.lastRefreshedAt || game.activatedAt || game.createdAt);
    const minutesSinceRefresh = (now - lastRefresh) / (1000 * 60);
    
    return {
        isStale: minutesSinceRefresh >= thresholdMinutes,
        minutesSinceRefresh: Math.round(minutesSinceRefresh),
        thresholdMinutes,
        category: categorizeGame(game)
    };
};

// ===================================================================
// CORE FUNCTIONS
// ===================================================================

/**
 * Query all games in active statuses
 */
async function findActiveGames() {
    const allGames = [];
    const tableName = getActiveGameTableName();
    
    const activeStatuses = ['RUNNING', 'REGISTERING', 'CLOCK_STOPPED', 'INITIATING', 'SCHEDULED'];
    
    for (const status of activeStatuses) {
        try {
            let lastEvaluatedKey = null;
            
            do {
                const params = {
                    TableName: tableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: 'gameStatus = :status',
                    ExpressionAttributeValues: { ':status': status },
                    ProjectionExpression: 'id, gameId, gameStatus, sourceUrl, lastRefreshedAt, activatedAt, createdAt, entityId, #name, gameStartDateTime, registrationStatus',
                    ExpressionAttributeNames: { '#name': 'name' },
                    Limit: 100
                };
                
                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }
                
                const result = await docClient.send(new QueryCommand(params));
                
                if (result.Items) {
                    allGames.push(...result.Items);
                }
                
                lastEvaluatedKey = result.LastEvaluatedKey;
                
            } while (lastEvaluatedKey);
            
            console.log(`[REFRESH] Found ${allGames.filter(g => g.gameStatus === status).length} games with status ${status}`);
            
        } catch (error) {
            if (error.name === 'ValidationException' && error.message.includes('byStatus')) {
                console.warn(`[REFRESH] byStatus GSI not found, falling back to scan for ${status}`);
                await findActiveGamesByScan(tableName, status, allGames);
            } else {
                console.error(`[REFRESH] Error querying ${status} games:`, error.message);
            }
        }
    }
    
    return allGames;
}

/**
 * Fallback: Scan table if GSI not available
 */
async function findActiveGamesByScan(tableName, status, accumulator) {
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: tableName,
            FilterExpression: 'gameStatus = :status',
            ExpressionAttributeValues: { ':status': status },
            ProjectionExpression: 'id, gameId, gameStatus, sourceUrl, lastRefreshedAt, activatedAt, createdAt, entityId, #name, gameStartDateTime, registrationStatus',
            ExpressionAttributeNames: { '#name': 'name' }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new ScanCommand(params));
        
        if (result.Items) {
            accumulator.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
}

/**
 * Trigger the scraper Lambda for a specific game
 * 
 * v2.2.0: Now includes saveAfterFetch: true to ensure the fetched data
 * is saved to the Game table and syncActiveGame is triggered.
 */
async function triggerScraper(game) {
    if (!game.sourceUrl) {
        console.log(`[REFRESH] Skipping game ${game.gameId} - no sourceUrl`);
        return false;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // v2.2.0: CRITICAL FIX - Added saveAfterFetch: true
    // 
    // Previously, fetchTournamentData only fetched and parsed data without saving.
    // The data was discarded since InvocationType is 'Event' (fire-and-forget).
    // 
    // With saveAfterFetch: true, the fetch-handler will automatically invoke
    // save-handler after a successful fetch, which:
    // 1. Calls gameDataEnricher to enrich the data
    // 2. Calls saveGameFunction to persist to Game table
    // 3. saveGameFunction calls syncActiveGame to update ActiveGame table
    // 4. ActiveGame.lastRefreshedAt is updated
    // 
    // This completes the refresh cycle and prevents immediate re-refresh.
    // ═══════════════════════════════════════════════════════════════════════
    const scraperPayload = {
        operation: 'fetchTournamentData',
        url: game.sourceUrl,
        entityId: game.entityId,
        forceRefresh: true,          // Bypasses S3 cache for fresh data
        saveAfterFetch: true,        // v2.2.0: AUTO-SAVE after fetch!
        scraperJobId: `REFRESH_${game.gameId}_${Date.now()}`
    };
    
    try {
        await lambdaClient.send(new InvokeCommand({
            FunctionName: getScraperFunctionName(),
            InvocationType: 'Event',  // Async - fire and forget
            Payload: JSON.stringify(scraperPayload)
        }));
        
        console.log(`[REFRESH] ✅ Triggered scraper for: ${game.name} (${game.gameStatus}) [saveAfterFetch=true]`);
        return true;
        
    } catch (error) {
        console.error(`[REFRESH] ❌ Failed to trigger scraper for ${game.gameId}:`, error.message);
        return false;
    }
}

/**
 * Update ActiveGame record to mark refresh attempt
 * Note: The actual lastRefreshedAt update happens in syncActiveGame
 * after the save is complete. This just tracks when we triggered the scraper.
 */
async function markRefreshAttempt(activeGameId) {
    const now = new Date().toISOString();
    
    try {
        await docClient.send(new UpdateCommand({
            TableName: getActiveGameTableName(),
            Key: { id: activeGameId },
            UpdateExpression: 'SET lastRefreshAttemptAt = :now, refreshAttemptCount = if_not_exists(refreshAttemptCount, :zero) + :one',
            ExpressionAttributeValues: {
                ':now': now,
                ':zero': 0,
                ':one': 1
            }
        }));
    } catch (error) {
        console.warn(`[REFRESH] Could not mark refresh attempt for ${activeGameId}:`, error.message);
    }
}

/**
 * Process a batch of stale games
 */
async function processBatch(games, results) {
    const promises = games.map(async (game) => {
        try {
            const triggered = await triggerScraper(game);
            if (triggered) {
                results.refreshed++;
                results.byCategory[game.category] = (results.byCategory[game.category] || 0) + 1;
                await markRefreshAttempt(game.id);
            }
        } catch (error) {
            console.error(`[REFRESH] Error processing game ${game.gameId}:`, error.message);
            results.errors.push({
                gameId: game.gameId,
                name: game.name,
                error: error.message
            });
        }
    });
    
    await Promise.all(promises);
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    const startTime = Date.now();
    console.log('[REFRESH] ========================================');
    console.log('[REFRESH] Starting scheduled refresh check v2.2.0');
    console.log('[REFRESH] Key change: saveAfterFetch=true ensures data is saved');
    
    // ================================================================
    // STEP 0: Check if auto-refresh is enabled
    // ================================================================
    const { enabled: autoRefreshEnabled, settings: scraperSettings } = await checkAutoRefreshEnabled();
    
    if (!autoRefreshEnabled) {
        console.log('[REFRESH] ⏸️  Auto-refresh is DISABLED in ScraperSettings');
        console.log('[REFRESH] Exiting without processing any games');
        
        if (scraperSettings?.disabledReason) {
            console.log(`[REFRESH] Reason: ${scraperSettings.disabledReason}`);
        }
        
        return {
            success: true,
            autoRefreshEnabled: false,
            message: 'Auto-refresh is disabled. No games processed.',
            disabledReason: scraperSettings?.disabledReason || null,
            durationMs: Date.now() - startTime
        };
    }
    
    console.log('[REFRESH] ✅ Auto-refresh is ENABLED');
    
    // Get thresholds from settings (or use defaults)
    const thresholds = getThresholdsFromSettings(scraperSettings);
    
    console.log('[REFRESH] Config:', {
        tableName: getActiveGameTableName(),
        scraperFunction: getScraperFunctionName(),
        thresholds: {
            'RUNNING/CLOCK_STOPPED': `${thresholds.RUNNING} mins`,
            'STARTING_SOON (<24h)': `${thresholds.STARTING_SOON} mins`,
            'UPCOMING (>24h)': `${thresholds.UPCOMING} mins`
        }
    });
    
    const now = new Date();
    const results = {
        checked: 0,
        stale: 0,
        refreshed: 0,
        skipped: 0,
        errors: [],
        byStatus: {},
        byCategory: {}
    };
    
    try {
        // Step 1: Find all active games
        const activeGames = await findActiveGames();
        results.checked = activeGames.length;
        console.log(`[REFRESH] Found ${activeGames.length} total active games`);
        
        if (activeGames.length === 0) {
            console.log('[REFRESH] No active games found, exiting');
            return { 
                success: true, 
                autoRefreshEnabled: true,
                ...results, 
                durationMs: Date.now() - startTime 
            };
        }
        
        // Step 2: Filter to stale games
        const staleGames = [];
        
        for (const game of activeGames) {
            const staleness = isStale(game, now, thresholds);
            
            if (!results.byStatus[game.gameStatus]) {
                results.byStatus[game.gameStatus] = { total: 0, stale: 0, refreshed: 0 };
            }
            results.byStatus[game.gameStatus].total++;
            
            if (staleness.isStale) {
                staleGames.push({
                    ...game,
                    minutesSinceRefresh: staleness.minutesSinceRefresh,
                    thresholdMinutes: staleness.thresholdMinutes,
                    category: staleness.category
                });
                results.byStatus[game.gameStatus].stale++;
            }
        }
        
        results.stale = staleGames.length;
        console.log(`[REFRESH] ${staleGames.length} games are stale and need refresh`);
        
        // Log breakdown by category
        const categoryBreakdown = {};
        staleGames.forEach(g => {
            categoryBreakdown[g.category] = (categoryBreakdown[g.category] || 0) + 1;
        });
        console.log('[REFRESH] Stale by category:', categoryBreakdown);
        
        if (staleGames.length === 0) {
            console.log('[REFRESH] No stale games, exiting');
            return { 
                success: true, 
                autoRefreshEnabled: true,
                ...results, 
                durationMs: Date.now() - startTime 
            };
        }
        
        // Step 3: Prioritize games
        const priorityOrder = ['RUNNING', 'CLOCK_STOPPED', 'STARTING_SOON', 'UPCOMING'];
        staleGames.sort((a, b) => {
            const aPriority = priorityOrder.indexOf(a.category);
            const bPriority = priorityOrder.indexOf(b.category);
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            return b.minutesSinceRefresh - a.minutesSinceRefresh;
        });
        
        const gamesToRefresh = staleGames.slice(0, MAX_REFRESH_PER_RUN);
        
        if (staleGames.length > MAX_REFRESH_PER_RUN) {
            results.skipped = staleGames.length - MAX_REFRESH_PER_RUN;
            console.log(`[REFRESH] Limiting to ${MAX_REFRESH_PER_RUN} games, skipping ${results.skipped}`);
        }
        
        // Step 4: Process in batches
        console.log(`[REFRESH] Processing ${gamesToRefresh.length} games in batches of ${BATCH_SIZE}`);
        
        for (let i = 0; i < gamesToRefresh.length; i += BATCH_SIZE) {
            const batch = gamesToRefresh.slice(i, i + BATCH_SIZE);
            console.log(`[REFRESH] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(gamesToRefresh.length / BATCH_SIZE)}`);
            await processBatch(batch, results);
        }
        
        // Update status counters
        for (const game of gamesToRefresh) {
            if (!results.errors.find(e => e.gameId === game.gameId)) {
                results.byStatus[game.gameStatus].refreshed++;
            }
        }
        
        // Step 5: Summary
        const duration = Date.now() - startTime;
        console.log('[REFRESH] ========================================');
        console.log('[REFRESH] Completed in', duration, 'ms');
        console.log('[REFRESH] Summary:', {
            checked: results.checked,
            stale: results.stale,
            refreshed: results.refreshed,
            skipped: results.skipped,
            errors: results.errors.length
        });
        console.log('[REFRESH] By status:', results.byStatus);
        console.log('[REFRESH] By category:', results.byCategory);
        
        if (results.errors.length > 0) {
            console.log('[REFRESH] Errors:', results.errors);
        }
        
        return {
            success: true,
            autoRefreshEnabled: true,
            ...results,
            durationMs: duration
        };
        
    } catch (error) {
        console.error('[REFRESH] Fatal error:', error);
        return {
            success: false,
            autoRefreshEnabled: true,
            error: error.message,
            ...results,
            durationMs: Date.now() - startTime
        };
    }
};