/**
 * ===================================================================
 * REFRESH RUNNING GAMES - Scheduled Lambda
 * ===================================================================
 * 
 * VERSION: 3.1.0 - Optimized refresh logic
 * 
 * CHANGELOG:
 * - v3.1.0: OPTIMIZATION - More efficient refresh logic
 *           - RUNNING/CLOCK_STOPPED: Refresh every 1 hour (was 30 mins)
 *           - Pre-start games: Only refresh when gameStartDateTime has PASSED
 *           - EventBridge schedule changed to rate(1 hour)
 *           - Preserved manual invocation options for backward compatibility
 * - v3.0.0: ARCHITECTURAL CHANGE - Query Game table directly instead of ActiveGame
 * 
 * NEW REFRESH LOGIC (v3.1.0):
 * - RUNNING/CLOCK_STOPPED: Every 1 hour (based on updatedAt staleness)
 * - INITIATING/REGISTERING/SCHEDULED: ONLY when gameStartDateTime has passed
 *   (no more periodic refreshes for games that haven't started yet)
 * 
 * MANUAL INVOCATION OPTIONS:
 * - forceRefresh: true - bypasses auto-refresh enabled check
 * - maxGames: number - override MAX_REFRESH_PER_RUN
 * - statuses: ['RUNNING', ...] - override which statuses to check (backward compat)
 * - checkRunning: boolean - enable/disable RUNNING/CLOCK_STOPPED check
 * - checkPreStart: boolean - enable/disable pre-start games check
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Initialize clients
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const lambdaClient = new LambdaClient({});

// ===================================================================
// CONFIGURATION
// ===================================================================

const GLOBAL_SETTINGS_ID = 'GLOBAL_SCRAPER_SETTINGS';

// v3.1.0: Simplified thresholds - only RUNNING games use time-based staleness
const DEFAULT_STALE_THRESHOLD_MINUTES = {
    RUNNING: 60,        // Changed from 30 to 60 minutes
    CLOCK_STOPPED: 60   // Changed from 30 to 60 minutes
};

const MAX_REFRESH_PER_RUN = 50;
const BATCH_SIZE = 10;

// Statuses to check
const RUNNING_STATUSES = ['RUNNING', 'CLOCK_STOPPED'];
const PRE_START_STATUSES = ['REGISTERING', 'INITIATING', 'SCHEDULED'];
const ALL_ACTIVE_STATUSES = [...RUNNING_STATUSES, ...PRE_START_STATUSES];

// ===================================================================
// TABLE NAME HELPERS
// ===================================================================

const getGameTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_GAMETABLE_NAME) {
        return process.env.API_KINGSROOM_GAMETABLE_NAME;
    }
    
    return `Game-${apiId}-${env}`;
};

const getScraperSettingsTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_SCRAPERSETTINGSTABLE_NAME) {
        return process.env.API_KINGSROOM_SCRAPERSETTINGSTABLE_NAME;
    }
    
    return `ScraperSettings-${apiId}-${env}`;
};

const getScrapeURLTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME) {
        return process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME;
    }
    
    return `ScrapeURL-${apiId}-${env}`;
};

const getScraperFunctionName = () => {
    return process.env.FUNCTION_WEBSCRAPERFUNCTION_NAME || `webScraperFunction-${process.env.ENV || 'dev'}`;
};

// ===================================================================
// CHECK GLOBAL SETTINGS
// ===================================================================

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

        console.log('[REFRESH] No ScraperSettings found, defaulting to enabled');
        return { enabled: true, settings: null };

    } catch (error) {
        console.warn('[REFRESH] Could not check ScraperSettings:', error.message);
        return { enabled: true, settings: null };
    }
}

/**
 * Get refresh thresholds from settings or use defaults
 * v3.1.0: Only RUNNING/CLOCK_STOPPED use time-based thresholds now
 */
function getThresholdsFromSettings(settings) {
    if (!settings) return DEFAULT_STALE_THRESHOLD_MINUTES;

    return {
        RUNNING: settings.runningRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.RUNNING,
        CLOCK_STOPPED: settings.runningRefreshIntervalMinutes || DEFAULT_STALE_THRESHOLD_MINUTES.CLOCK_STOPPED
    };
}

// ===================================================================
// DO NOT SCRAPE CHECK
// ===================================================================

async function checkDoNotScrape(sourceUrl) {
    if (!sourceUrl) return false;
    
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: getScrapeURLTableName(),
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': sourceUrl },
            ProjectionExpression: 'doNotScrape, doNotScrapeReason',
            Limit: 1
        }));

        if (result.Items && result.Items.length > 0) {
            const scrapeURL = result.Items[0];
            if (scrapeURL.doNotScrape === true) {
                console.log(`[REFRESH] ⏭️  Skipping URL (doNotScrape=true): ${sourceUrl}`);
                if (scrapeURL.doNotScrapeReason) {
                    console.log(`[REFRESH]    Reason: ${scrapeURL.doNotScrapeReason}`);
                }
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.warn(`[REFRESH] Could not check doNotScrape for ${sourceUrl}:`, error.message);
        return false;
    }
}

async function batchCheckDoNotScrape(games) {
    const doNotScrapeUrls = new Set();
    const uniqueUrls = [...new Set(games.map(g => g.sourceUrl).filter(Boolean))];
    
    if (uniqueUrls.length === 0) return doNotScrapeUrls;
    
    console.log(`[REFRESH] Checking doNotScrape for ${uniqueUrls.length} unique URLs...`);
    
    const checkBatchSize = 10;
    for (let i = 0; i < uniqueUrls.length; i += checkBatchSize) {
        const batch = uniqueUrls.slice(i, i + checkBatchSize);
        const checks = await Promise.all(batch.map(async (url) => {
            const shouldSkip = await checkDoNotScrape(url);
            return { url, shouldSkip };
        }));
        
        checks.forEach(({ url, shouldSkip }) => {
            if (shouldSkip) {
                doNotScrapeUrls.add(url);
            }
        });
    }
    
    if (doNotScrapeUrls.size > 0) {
        console.log(`[REFRESH] Found ${doNotScrapeUrls.size} URLs marked as doNotScrape`);
    }
    
    return doNotScrapeUrls;
}

// ===================================================================
// v3.1.0: STALENESS & REFRESH LOGIC
// ===================================================================

/**
 * Check if a RUNNING/CLOCK_STOPPED game is stale (based on updatedAt)
 */
const isRunningGameStale = (game, now, thresholds) => {
    const thresholdMinutes = thresholds[game.gameStatus] || thresholds.RUNNING;
    const lastUpdate = new Date(game.updatedAt || game.createdAt);
    const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60);
    
    return {
        isStale: minutesSinceUpdate >= thresholdMinutes,
        minutesSinceUpdate: Math.round(minutesSinceUpdate),
        thresholdMinutes
    };
};

/**
 * v3.1.0: Check if a pre-start game's start time has passed
 * Only refresh games whose gameStartDateTime is in the past
 */
const hasGameStartTimePassed = (game, now) => {
    if (!game.gameStartDateTime) {
        // If no start time, assume it might have started
        console.log(`[REFRESH] Game ${game.name} has no gameStartDateTime, including for refresh`);
        return true;
    }
    
    const startTime = new Date(game.gameStartDateTime);
    const hasPassed = now >= startTime;
    
    if (hasPassed) {
        const minutesPastStart = Math.round((now - startTime) / (1000 * 60));
        console.log(`[REFRESH] Game "${game.name}" start time passed ${minutesPastStart} mins ago`);
    }
    
    return hasPassed;
};

/**
 * Categorize a game for reporting purposes (preserved from v3.0.0)
 */
const categorizeGame = (game) => {
    const status = game.gameStatus;
    
    if (RUNNING_STATUSES.includes(status)) {
        return 'RUNNING';
    }
    
    if (PRE_START_STATUSES.includes(status)) {
        return 'START_TIME_PASSED';
    }
    
    return status;
};

// ===================================================================
// CORE FUNCTIONS
// ===================================================================

/**
 * Query Game table by status using byStatus GSI
 */
async function queryGamesByStatus(statusesToCheck) {
    const allGames = [];
    const gameTableName = getGameTableName();
    
    console.log(`[REFRESH] Querying Game table: ${gameTableName}`);
    
    for (const status of statusesToCheck) {
        try {
            let lastEvaluatedKey = null;
            
            do {
                const params = {
                    TableName: gameTableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: 'gameStatus = :status',
                    ExpressionAttributeValues: { 
                        ':status': status,
                        ':false': false
                    },
                    ProjectionExpression: [
                        'id',
                        'gameStatus',
                        'sourceUrl',
                        'updatedAt',
                        'createdAt',
                        'entityId',
                        '#name',
                        'gameStartDateTime',
                        'registrationStatus',
                        'isStatusDataStale'
                    ].join(', '),
                    ExpressionAttributeNames: { '#name': 'name' },
                    FilterExpression: 'attribute_not_exists(isStatusDataStale) OR isStatusDataStale = :false',
                    Limit: 100
                };
                
                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }
                
                const result = await docClient.send(new QueryCommand(params));
                
                if (result.Items) {
                    const mapped = result.Items.map(game => ({
                        ...game,
                        gameId: game.id
                    }));
                    allGames.push(...mapped);
                }
                
                lastEvaluatedKey = result.LastEvaluatedKey;
                
            } while (lastEvaluatedKey);
            
            const countForStatus = allGames.filter(g => g.gameStatus === status).length;
            console.log(`[REFRESH] Found ${countForStatus} games with status ${status}`);
            
        } catch (error) {
            if (error.name === 'ValidationException' && error.message.includes('byStatus')) {
                console.warn(`[REFRESH] byStatus GSI not found, falling back to scan`);
                await findGamesByScan(gameTableName, status, allGames);
            } else {
                console.error(`[REFRESH] Error querying ${status} games:`, error.message);
            }
        }
    }
    
    return allGames;
}

async function findGamesByScan(tableName, status, accumulator) {
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: tableName,
            FilterExpression: 'gameStatus = :status AND (attribute_not_exists(isStatusDataStale) OR isStatusDataStale = :false)',
            ExpressionAttributeValues: { 
                ':status': status,
                ':false': false
            },
            ProjectionExpression: 'id, gameStatus, sourceUrl, updatedAt, createdAt, entityId, #name, gameStartDateTime, registrationStatus',
            ExpressionAttributeNames: { '#name': 'name' }
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new ScanCommand(params));
        
        if (result.Items) {
            const mapped = result.Items.map(game => ({
                ...game,
                gameId: game.id
            }));
            accumulator.push(...mapped);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
}

async function triggerScraper(game) {
    if (!game.sourceUrl) {
        console.log(`[REFRESH] Skipping game ${game.gameId} - no sourceUrl`);
        return { triggered: false, reason: 'no_source_url' };
    }
    
    const scraperPayload = {
        operation: 'fetchTournamentData',
        url: game.sourceUrl,
        entityId: game.entityId,
        forceRefresh: true,
        saveAfterFetch: true,
        scraperJobId: `REFRESH_${game.gameId}_${Date.now()}`
    };
    
    try {
        await lambdaClient.send(new InvokeCommand({
            FunctionName: getScraperFunctionName(),
            InvocationType: 'Event',
            Payload: JSON.stringify(scraperPayload)
        }));
        
        console.log(`[REFRESH] ✅ Triggered scraper for: ${game.name} (${game.gameStatus})`);
        return { triggered: true };
        
    } catch (error) {
        console.error(`[REFRESH] ❌ Failed to trigger scraper for ${game.gameId}:`, error.message);
        return { triggered: false, reason: 'lambda_error', error: error.message };
    }
}

async function processBatch(games, results, doNotScrapeUrls) {
    const promises = games.map(async (game) => {
        try {
            if (game.sourceUrl && doNotScrapeUrls.has(game.sourceUrl)) {
                console.log(`[REFRESH] ⏭️  Skipping ${game.name} - doNotScrape=true`);
                results.skippedDoNotScrape++;
                return;
            }
            
            const triggerResult = await triggerScraper(game);
            results.gamesRefreshed++;
            
            if (triggerResult.triggered) {
                results.gamesUpdated++;
                results.byCategory[game.category] = (results.byCategory[game.category] || 0) + 1;
            } else {
                if (triggerResult.reason === 'no_source_url') {
                    results.skippedNoUrl++;
                }
            }
        } catch (error) {
            console.error(`[REFRESH] Error processing game ${game.gameId}:`, error.message);
            results.gamesFailed++;
            results.errors.push(`${game.name || game.gameId}: ${error.message}`);
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
    console.log('[REFRESH] Starting scheduled refresh check v3.1.0');
    console.log('[REFRESH] Optimization: RUNNING every 1h, pre-start only when gameStartDateTime passed');
    
    const input = event?.arguments?.input || event || {};
    
    console.log('[REFRESH] Received input:', JSON.stringify(input, null, 2));
    
    // ================================================================
    // PARSE OPTIONS - Support both old and new formats
    // ================================================================
    // Old format (backward compat): { statuses: ['RUNNING', ...] }
    // New format: { checkRunning: true, checkPreStart: false }
    const options = {
        forceRefresh: input?.forceRefresh === true,
        maxGames: input?.maxGames || MAX_REFRESH_PER_RUN,
        // Backward compatibility: if statuses is provided, use it
        statuses: input?.statuses || null,
        // New options (ignored if statuses is provided)
        checkRunning: input?.checkRunning !== false,
        checkPreStart: input?.checkPreStart !== false
    };
    
    console.log('[REFRESH] Options:', options);
    
    if (options.forceRefresh) {
        console.log('[REFRESH] 🔧 Manual invocation with forceRefresh=true');
    }
    
    // Check if auto-refresh is enabled
    const { enabled: autoRefreshEnabled, settings: scraperSettings } = await checkAutoRefreshEnabled();
    
    if (!autoRefreshEnabled && !options.forceRefresh) {
        console.log('[REFRESH] ⏸️  Auto-refresh is DISABLED in ScraperSettings');
        console.log('[REFRESH] 💡 Tip: Use { "forceRefresh": true } to bypass this check');
        
        if (scraperSettings?.disabledReason) {
            console.log(`[REFRESH] Reason: ${scraperSettings.disabledReason}`);
        }
        
        return {
            success: true,
            gamesRefreshed: 0,
            gamesUpdated: 0,
            gamesFailed: 0,
            errors: [],
            skippedReason: 'AUTO_REFRESH_DISABLED',
            executionTimeMs: Date.now() - startTime
        };
    }
    
    if (!autoRefreshEnabled && options.forceRefresh) {
        console.log('[REFRESH] ⚠️  Auto-refresh is DISABLED but forceRefresh=true, proceeding...');
    }
    
    console.log('[REFRESH] ✅ Auto-refresh is ENABLED');
    
    const thresholds = getThresholdsFromSettings(scraperSettings);
    const now = new Date();
    
    // ================================================================
    // DETERMINE WHICH STATUSES TO CHECK
    // ================================================================
    let runningStatusesToCheck = [];
    let preStartStatusesToCheck = [];
    
    if (options.statuses) {
        // Backward compatibility: use provided statuses array
        console.log('[REFRESH] Using provided statuses array (backward compat mode)');
        runningStatusesToCheck = options.statuses.filter(s => RUNNING_STATUSES.includes(s));
        preStartStatusesToCheck = options.statuses.filter(s => PRE_START_STATUSES.includes(s));
    } else {
        // New mode: use checkRunning/checkPreStart flags
        if (options.checkRunning) {
            runningStatusesToCheck = RUNNING_STATUSES;
        }
        if (options.checkPreStart) {
            preStartStatusesToCheck = PRE_START_STATUSES;
        }
    }
    
    console.log('[REFRESH] Config:', {
        gameTableName: getGameTableName(),
        scraperFunction: getScraperFunctionName(),
        maxGames: options.maxGames,
        runningStatuses: runningStatusesToCheck,
        preStartStatuses: preStartStatusesToCheck,
        thresholds: {
            'RUNNING/CLOCK_STOPPED': `${thresholds.RUNNING} mins`
        }
    });
    
    const results = {
        gamesRefreshed: 0,
        gamesUpdated: 0,
        gamesFailed: 0,
        errors: [],
        checked: { running: 0, preStart: 0, total: 0 },
        needsRefresh: { running: 0, preStart: 0 },
        skippedDoNotScrape: 0,
        skippedNoUrl: 0,
        skippedLimit: 0,
        byStatus: {},
        byCategory: {}
    };
    
    const gamesToRefresh = [];
    
    try {
        // ================================================================
        // STEP 1: Find and filter RUNNING/CLOCK_STOPPED games (stale check)
        // ================================================================
        if (runningStatusesToCheck.length > 0) {
            console.log('[REFRESH] --- Checking RUNNING/CLOCK_STOPPED games ---');
            const runningGames = await queryGamesByStatus(runningStatusesToCheck);
            results.checked.running = runningGames.length;
            
            for (const game of runningGames) {
                const staleness = isRunningGameStale(game, now, thresholds);
                
                if (!results.byStatus[game.gameStatus]) {
                    results.byStatus[game.gameStatus] = { total: 0, needsRefresh: 0, refreshed: 0 };
                }
                results.byStatus[game.gameStatus].total++;
                
                if (staleness.isStale) {
                    gamesToRefresh.push({
                        ...game,
                        category: categorizeGame(game),
                        minutesSinceUpdate: staleness.minutesSinceUpdate,
                        thresholdMinutes: staleness.thresholdMinutes,
                        priority: 1  // Highest priority
                    });
                    results.byStatus[game.gameStatus].needsRefresh++;
                    results.needsRefresh.running++;
                }
            }
            
            console.log(`[REFRESH] RUNNING/CLOCK_STOPPED: ${results.needsRefresh.running}/${results.checked.running} need refresh`);
        }
        
        // ================================================================
        // STEP 2: Find pre-start games where gameStartDateTime has passed
        // ================================================================
        if (preStartStatusesToCheck.length > 0) {
            console.log('[REFRESH] --- Checking pre-start games (start time passed) ---');
            const preStartGames = await queryGamesByStatus(preStartStatusesToCheck);
            results.checked.preStart = preStartGames.length;
            
            for (const game of preStartGames) {
                if (!results.byStatus[game.gameStatus]) {
                    results.byStatus[game.gameStatus] = { total: 0, needsRefresh: 0, refreshed: 0 };
                }
                results.byStatus[game.gameStatus].total++;
                
                if (hasGameStartTimePassed(game, now)) {
                    gamesToRefresh.push({
                        ...game,
                        category: categorizeGame(game),
                        priority: 2  // Second priority after running games
                    });
                    results.byStatus[game.gameStatus].needsRefresh++;
                    results.needsRefresh.preStart++;
                }
            }
            
            console.log(`[REFRESH] Pre-start (time passed): ${results.needsRefresh.preStart}/${results.checked.preStart} need refresh`);
        }
        
        results.checked.total = results.checked.running + results.checked.preStart;
        
        // ================================================================
        // STEP 3: Check doNotScrape URLs
        // ================================================================
        if (gamesToRefresh.length === 0) {
            console.log('[REFRESH] No games need refresh, exiting');
            return { 
                success: true, 
                gamesRefreshed: 0,
                gamesUpdated: 0,
                gamesFailed: 0,
                errors: [],
                checked: results.checked.total,
                executionTimeMs: Date.now() - startTime 
            };
        }
        
        const doNotScrapeUrls = await batchCheckDoNotScrape(gamesToRefresh);
        
        // ================================================================
        // STEP 4: Sort by priority and limit
        // ================================================================
        gamesToRefresh.sort((a, b) => {
            // First by priority (1 = RUNNING, 2 = pre-start)
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            // Then by staleness (for running) or how far past start time
            return (b.minutesSinceUpdate || 0) - (a.minutesSinceUpdate || 0);
        });
        
        const limitedGames = gamesToRefresh.slice(0, options.maxGames);
        
        if (gamesToRefresh.length > options.maxGames) {
            results.skippedLimit = gamesToRefresh.length - options.maxGames;
            console.log(`[REFRESH] Limiting to ${options.maxGames} games, skipping ${results.skippedLimit}`);
        }
        
        // ================================================================
        // STEP 5: Process in batches
        // ================================================================
        console.log(`[REFRESH] Processing ${limitedGames.length} games in batches of ${BATCH_SIZE}`);
        
        for (let i = 0; i < limitedGames.length; i += BATCH_SIZE) {
            const batch = limitedGames.slice(i, i + BATCH_SIZE);
            console.log(`[REFRESH] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(limitedGames.length / BATCH_SIZE)}`);
            await processBatch(batch, results, doNotScrapeUrls);
        }
        
        // Update status counters for refreshed games
        for (const game of limitedGames) {
            if (!results.errors.find(e => e.includes(game.gameId))) {
                if (results.byStatus[game.gameStatus]) {
                    results.byStatus[game.gameStatus].refreshed++;
                }
            }
        }
        
        // ================================================================
        // STEP 6: Summary
        // ================================================================
        const duration = Date.now() - startTime;
        console.log('[REFRESH] ========================================');
        console.log('[REFRESH] Completed in', duration, 'ms');
        console.log('[REFRESH] Summary:', {
            checked: results.checked.total,
            needsRefresh: results.needsRefresh,
            gamesRefreshed: results.gamesRefreshed,
            gamesUpdated: results.gamesUpdated,
            gamesFailed: results.gamesFailed,
            skippedDoNotScrape: results.skippedDoNotScrape,
            skippedNoUrl: results.skippedNoUrl,
            skippedLimit: results.skippedLimit
        });
        console.log('[REFRESH] By status:', results.byStatus);
        console.log('[REFRESH] By category:', results.byCategory);
        
        if (results.errors.length > 0) {
            console.log('[REFRESH] Errors:', results.errors);
        }
        
        return {
            success: true,
            gamesRefreshed: results.gamesRefreshed,
            gamesUpdated: results.gamesUpdated,
            gamesFailed: results.gamesFailed,
            errors: results.errors,
            checked: results.checked.total,
            executionTimeMs: duration
        };
        
    } catch (error) {
        console.error('[REFRESH] Fatal error:', error);
        
        return {
            success: false,
            gamesRefreshed: results.gamesRefreshed,
            gamesUpdated: results.gamesUpdated,
            gamesFailed: results.gamesFailed + 1,
            errors: [...results.errors, `Fatal error: ${error.message}`],
            executionTimeMs: Date.now() - startTime
        };
    }
};