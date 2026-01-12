/**
 * ===================================================================
 * REFRESH RUNNING GAMES - Scheduled Lambda
 * ===================================================================
 * 
 * VERSION: 2.0.0 - Updated refresh intervals to align with HomePage
 * 
 * PURPOSE:
 * Runs on a schedule to find stale ActiveGame records and trigger 
 * re-scraping to keep dashboard data fresh from the live source (not S3 cache).
 * 
 * REFRESH SCHEDULE:
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
 * - FUNCTION_WEBSCRAPERFUNCTION_NAME (e.g., webScraperFunction-dev)
 * - ENV
 * - REGION
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize clients
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({});

// ===================================================================
// CONFIGURATION
// ===================================================================

// How long before each status/category is considered "stale" and needs refresh
// These align with the HomePage auto-refresh intervals
const STALE_THRESHOLD_MINUTES = {
    // Running games - refresh every 30 minutes
    RUNNING: 30,
    CLOCK_STOPPED: 30,
    
    // Starting soon (<24h) - refresh every 60 minutes (1 hour)
    STARTING_SOON: 60,
    
    // Upcoming (>24h) - refresh every 720 minutes (12 hours)
    UPCOMING: 720,
    
    // Legacy fallbacks for any status not explicitly handled
    REGISTERING: 60,
    INITIATING: 60,
    SCHEDULED: 60
};

// 24 hours in milliseconds
const STARTING_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Maximum games to refresh per invocation (to avoid timeout)
const MAX_REFRESH_PER_RUN = 50;

// Batch size for Lambda invocations
const BATCH_SIZE = 10;

// ===================================================================
// HELPERS
// ===================================================================

const getTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    // Use explicit env var if available
    if (process.env.API_KINGSROOM_ACTIVEGAMETABLE_NAME) {
        return process.env.API_KINGSROOM_ACTIVEGAMETABLE_NAME;
    }
    
    // Fallback to constructed name
    return `ActiveGame-${apiId}-${env}`;
};

const getScraperFunctionName = () => {
    return process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME || `webScraperFunction-${process.env.ENV || 'dev'}`;
};

/**
 * Determine the appropriate stale threshold based on game status and start time
 */
const getStaleThreshold = (game) => {
    const status = game.gameStatus;
    
    // Running and clock stopped games always use the 30-minute threshold
    if (status === 'RUNNING' || status === 'CLOCK_STOPPED') {
        return STALE_THRESHOLD_MINUTES.RUNNING;
    }
    
    // For pre-start statuses, check if it's starting soon (<24h) or upcoming (>24h)
    if (['INITIATING', 'REGISTERING', 'SCHEDULED'].includes(status)) {
        const startTime = new Date(game.gameStartDateTime);
        const now = new Date();
        const timeUntilStart = startTime.getTime() - now.getTime();
        
        if (timeUntilStart <= 0) {
            // Already past start time - treat as starting soon
            return STALE_THRESHOLD_MINUTES.STARTING_SOON;
        } else if (timeUntilStart <= STARTING_SOON_THRESHOLD_MS) {
            // Starting within 24 hours
            return STALE_THRESHOLD_MINUTES.STARTING_SOON;
        } else {
            // More than 24 hours away
            return STALE_THRESHOLD_MINUTES.UPCOMING;
        }
    }
    
    // Fallback
    return STALE_THRESHOLD_MINUTES[status] || 60;
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
const isStale = (game, now) => {
    const thresholdMinutes = getStaleThreshold(game);
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
    const tableName = getTableName();
    
    // Query each active status using the byStatus GSI
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
            // If byStatus GSI doesn't exist, fall back to scan
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
 * Setting forceRefresh: true ensures we get fresh data from the live site
 */
async function triggerScraper(game) {
    if (!game.sourceUrl) {
        console.log(`[REFRESH] Skipping game ${game.gameId} - no sourceUrl`);
        return false;
    }
    
    const scraperPayload = {
        operation: 'fetchTournamentData',
        url: game.sourceUrl,
        entityId: game.entityId,
        forceRefresh: true, // CRITICAL: This bypasses S3 cache and fetches from live site
        scraperJobId: `REFRESH_${game.gameId}_${Date.now()}`
    };
    
    try {
        await lambdaClient.send(new InvokeCommand({
            FunctionName: getScraperFunctionName(),
            InvocationType: 'Event', // Async invocation
            Payload: JSON.stringify(scraperPayload)
        }));
        
        console.log(`[REFRESH] ✅ Triggered scraper for: ${game.name} (${game.gameStatus})`);
        return true;
        
    } catch (error) {
        console.error(`[REFRESH] ❌ Failed to trigger scraper for ${game.gameId}:`, error.message);
        return false;
    }
}

/**
 * Update ActiveGame record to mark refresh attempt
 */
async function markRefreshAttempt(activeGameId) {
    const now = new Date().toISOString();
    
    try {
        await docClient.send(new UpdateCommand({
            TableName: getTableName(),
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
    console.log('[REFRESH] Starting scheduled refresh check v2.0.0');
    console.log('[REFRESH] Config:', {
        tableName: getTableName(),
        scraperFunction: getScraperFunctionName(),
        thresholds: {
            'RUNNING/CLOCK_STOPPED': `${STALE_THRESHOLD_MINUTES.RUNNING} mins`,
            'STARTING_SOON (<24h)': `${STALE_THRESHOLD_MINUTES.STARTING_SOON} mins`,
            'UPCOMING (>24h)': `${STALE_THRESHOLD_MINUTES.UPCOMING} mins`
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
            return { success: true, ...results, durationMs: Date.now() - startTime };
        }
        
        // Step 2: Filter to stale games based on dynamic thresholds
        const staleGames = [];
        
        for (const game of activeGames) {
            const staleness = isStale(game, now);
            
            // Initialize status counter
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
            return { success: true, ...results, durationMs: Date.now() - startTime };
        }
        
        // Step 3: Prioritize games for refresh
        // Priority: RUNNING > CLOCK_STOPPED > STARTING_SOON > UPCOMING
        const priorityOrder = ['RUNNING', 'CLOCK_STOPPED', 'STARTING_SOON', 'UPCOMING'];
        staleGames.sort((a, b) => {
            const aPriority = priorityOrder.indexOf(a.category);
            const bPriority = priorityOrder.indexOf(b.category);
            
            // First sort by category priority
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            // Within same category, sort by staleness (most stale first)
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
        
        // Update status counters for refreshed games
        for (const game of gamesToRefresh) {
            if (!results.errors.find(e => e.gameId === game.gameId)) {
                results.byStatus[game.gameStatus].refreshed++;
            }
        }
        
        // Step 5: Log summary
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
            ...results,
            durationMs: duration
        };
        
    } catch (error) {
        console.error('[REFRESH] Fatal error:', error);
        return {
            success: false,
            error: error.message,
            ...results,
            durationMs: Date.now() - startTime
        };
    }
};