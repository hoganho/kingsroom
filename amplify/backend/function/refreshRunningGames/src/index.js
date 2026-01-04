/**
 * ===================================================================
 * REFRESH RUNNING GAMES - Scheduled Lambda
 * ===================================================================
 * 
 * VERSION: 1.0.0
 * 
 * PURPOSE:
 * Runs on a schedule (every 15 minutes) to find stale ActiveGame records
 * and trigger re-scraping to keep dashboard data fresh.
 * 
 * TRIGGER:
 * EventBridge scheduled rule: rate(15 minutes)
 * 
 * ENVIRONMENT VARIABLES:
 * - API_KINGSROOM_GRAPHQLAPIIDOUTPUT
 * - API_KINGSROOM_ACTIVEGAMETABLE_NAME
 * - SCRAPER_FUNCTION_NAME (e.g., webScraperFunction-dev)
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

// How long before each status is considered "stale" and needs refresh
const STALE_THRESHOLD_MINUTES = {
    RUNNING: 15,        // Running games should refresh every 15 min
    CLOCK_STOPPED: 30,  // Clock stopped games every 30 min
    REGISTERING: 60,    // Registering games every hour
    INITIATING: 120     // Initiating games every 2 hours
};

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
 * Check if a game is stale based on its status and last refresh time
 */
const isStale = (game, now) => {
    const thresholdMinutes = STALE_THRESHOLD_MINUTES[game.gameStatus] || 30;
    const lastRefresh = new Date(game.lastRefreshedAt || game.activatedAt || game.createdAt);
    const minutesSinceRefresh = (now - lastRefresh) / (1000 * 60);
    
    return {
        isStale: minutesSinceRefresh >= thresholdMinutes,
        minutesSinceRefresh: Math.round(minutesSinceRefresh),
        thresholdMinutes
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
    for (const status of ['RUNNING', 'REGISTERING', 'CLOCK_STOPPED', 'INITIATING']) {
        try {
            let lastEvaluatedKey = null;
            
            do {
                const params = {
                    TableName: tableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: 'gameStatus = :status',
                    ExpressionAttributeValues: { ':status': status },
                    ProjectionExpression: 'id, gameId, gameStatus, sourceUrl, lastRefreshedAt, activatedAt, createdAt, entityId, #name',
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
            ProjectionExpression: 'id, gameId, gameStatus, sourceUrl, lastRefreshedAt, activatedAt, createdAt, entityId, #name',
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
 */
async function triggerScraper(game) {
    if (!game.sourceUrl) {
        console.log(`[REFRESH] Skipping game ${game.gameId} - no sourceUrl`);
        return false;
    }
    
    const scraperPayload = {
        urls: [game.sourceUrl],
        entityId: game.entityId,
        options: {
            isRefresh: true,
            gameId: game.gameId,
            priority: 'low'
        }
    };
    
    try {
        await lambdaClient.send(new InvokeCommand({
            FunctionName: getScraperFunctionName(),
            InvocationType: 'Event', // Async - don't wait for response
            Payload: JSON.stringify(scraperPayload)
        }));
        
        console.log(`[REFRESH] ✅ Triggered scraper for: ${game.name} (${game.sourceUrl.substring(0, 50)}...)`);
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
    console.log('[REFRESH] Starting scheduled refresh check');
    console.log('[REFRESH] Config:', {
        tableName: getTableName(),
        scraperFunction: getScraperFunctionName(),
        thresholds: STALE_THRESHOLD_MINUTES
    });
    
    const now = new Date();
    const results = {
        checked: 0,
        stale: 0,
        refreshed: 0,
        skipped: 0,
        errors: [],
        byStatus: {}
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
        
        // Step 2: Filter to stale games
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
                    minutesSinceRefresh: staleness.minutesSinceRefresh
                });
                results.byStatus[game.gameStatus].stale++;
            }
        }
        
        results.stale = staleGames.length;
        console.log(`[REFRESH] ${staleGames.length} games are stale and need refresh`);
        
        if (staleGames.length === 0) {
            console.log('[REFRESH] No stale games, exiting');
            return { success: true, ...results, durationMs: Date.now() - startTime };
        }
        
        // Step 3: Sort by staleness (most stale first) and limit
        staleGames.sort((a, b) => b.minutesSinceRefresh - a.minutesSinceRefresh);
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