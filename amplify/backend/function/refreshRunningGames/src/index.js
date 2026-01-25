/**
 * ===================================================================
 * REFRESH RUNNING GAMES - Scheduled Lambda
 * ===================================================================
 * 
 * VERSION: 3.2.0 - Added RecentlyFinishedGame sync
 * 
 * CHANGELOG:
 * - v3.2.0: NEW - RecentlyFinishedGame sync step
 *           - Queries Game table for FINISHED games in last 7 days
 *           - Creates missing RecentlyFinishedGame records
 *           - Deletes expired RecentlyFinishedGame records (>7 days old)
 *           - New option: syncFinished (default: true)
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
 * - syncFinished: boolean - enable/disable RecentlyFinishedGame sync (default: true)
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
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

// v3.2.0: RecentlyFinishedGame configuration
const RECENTLY_FINISHED_TTL_DAYS = 7;
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];

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

// v3.2.0: New table name helpers
const getRecentlyFinishedGameTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_RECENTLYFINISHEDGAMETABLE_NAME) {
        return process.env.API_KINGSROOM_RECENTLYFINISHEDGAMETABLE_NAME;
    }
    
    return `RecentlyFinishedGame-${apiId}-${env}`;
};

const getVenueTableName = () => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    
    if (process.env.API_KINGSROOM_VENUETABLE_NAME) {
        return process.env.API_KINGSROOM_VENUETABLE_NAME;
    }
    
    return `Venue-${apiId}-${env}`;
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
// v3.2.0: RECENTLY FINISHED GAME SYNC
// ===================================================================

/**
 * Fetch venue details for RecentlyFinishedGame record
 */
async function fetchVenueDetails(venueId) {
    if (!venueId) return { name: null, logo: null };
    
    try {
        const result = await docClient.send(new GetCommand({
            TableName: getVenueTableName(),
            Key: { id: venueId },
            ProjectionExpression: '#name, logo',
            ExpressionAttributeNames: { '#name': 'name' }
        }));
        
        if (result.Item) {
            return {
                name: result.Item.name || null,
                logo: result.Item.logo || null
            };
        }
    } catch (err) {
        console.warn(`[SYNC-FINISHED] Error fetching venue ${venueId}:`, err.message);
    }
    
    return { name: null, logo: null };
}

/**
 * Query FINISHED games from Game table within the last N days
 */
async function queryFinishedGames(daysBack = 7) {
    const finishedGames = [];
    const gameTableName = getGameTableName();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffIso = cutoffDate.toISOString();
    
    console.log(`[SYNC-FINISHED] Querying FINISHED games since ${cutoffIso}`);
    
    for (const status of FINISHED_STATUSES) {
        try {
            let lastEvaluatedKey = null;
            
            do {
                const params = {
                    TableName: gameTableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: 'gameStatus = :status',
                    FilterExpression: 'gameStartDateTime >= :cutoff',
                    ExpressionAttributeValues: {
                        ':status': status,
                        ':cutoff': cutoffIso
                    },
                    Limit: 100
                };
                
                if (lastEvaluatedKey) {
                    params.ExclusiveStartKey = lastEvaluatedKey;
                }
                
                const result = await docClient.send(new QueryCommand(params));
                
                if (result.Items) {
                    finishedGames.push(...result.Items);
                }
                
                lastEvaluatedKey = result.LastEvaluatedKey;
                
            } while (lastEvaluatedKey);
            
        } catch (error) {
            console.error(`[SYNC-FINISHED] Error querying ${status} games:`, error.message);
        }
    }
    
    console.log(`[SYNC-FINISHED] Found ${finishedGames.length} finished games in last ${daysBack} days`);
    return finishedGames;
}

/**
 * Get existing RecentlyFinishedGame IDs for comparison
 */
async function getExistingRecentlyFinishedGameIds() {
    const existingIds = new Set();
    const tableName = getRecentlyFinishedGameTableName();
    
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: tableName,
            ProjectionExpression: 'id, gameId',
            Limit: 500
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new ScanCommand(params));
        
        if (result.Items) {
            result.Items.forEach(item => {
                existingIds.add(item.gameId || item.id);
            });
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    console.log(`[SYNC-FINISHED] Found ${existingIds.size} existing RecentlyFinishedGame records`);
    return existingIds;
}

/**
 * Create a RecentlyFinishedGame record from a Game record
 */
async function createRecentlyFinishedGameRecord(game) {
    const tableName = getRecentlyFinishedGameTableName();
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Fetch venue details
    const venueDetails = await fetchVenueDetails(game.venueId);
    
    // Calculate TTL (7 days from game start date)
    const gameStartMs = game.gameStartDateTime 
        ? new Date(game.gameStartDateTime).getTime() 
        : timestamp;
    const ttlTimestamp = Math.floor(gameStartMs / 1000) + (RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60);
    
    // Calculate duration if we have start and end times
    let totalDuration = null;
    if (game.gameStartDateTime && game.gameEndDateTime) {
        const start = new Date(game.gameStartDateTime).getTime();
        const end = new Date(game.gameEndDateTime).getTime();
        totalDuration = Math.floor((end - start) / 1000);
    }
    
    const record = {
        id: game.id,
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId || null,
        tournamentId: game.tournamentId || null,
        
        // Denormalized display fields
        name: game.name,
        venueName: venueDetails.name || game.venueName || null,
        venueLogoCached: venueDetails.logo || null,
        entityName: game.entityName || null,
        
        gameStartDateTime: game.gameStartDateTime,
        finishedAt: game.gameEndDateTime || now,
        totalDuration: totalDuration,
        
        // Final results
        totalEntries: game.totalEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        prizepoolPaid: game.prizepoolPaid || null,
        prizepoolCalculated: game.prizepoolCalculated || null,
        buyIn: game.buyIn || 0,
        
        // Classification
        gameType: game.gameType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        isMainEvent: game.isMainEvent || false,
        
        // Badges
        isSatellite: game.isSatellite || false,
        isRecurring: !!game.recurringGameId,
        recurringGameName: game.recurringGameName || null,
        
        sourceUrl: game.sourceUrl || null,
        
        // TTL for auto-cleanup - IMPORTANT: Use _ttl to match DynamoDB config
        _ttl: ttlTimestamp,
        
        // Metadata
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'RecentlyFinishedGame'
    };
    
    await docClient.send(new PutCommand({
        TableName: tableName,
        Item: record,
        ConditionExpression: 'attribute_not_exists(id)'
    }));
    
    return record;
}

/**
 * Delete expired RecentlyFinishedGame records (backup cleanup if TTL fails)
 */
async function deleteExpiredRecentlyFinishedGames() {
    const tableName = getRecentlyFinishedGameTableName();
    const nowSeconds = Math.floor(Date.now() / 1000);
    let deletedCount = 0;
    
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: tableName,
            ProjectionExpression: 'id, #ttl, gameStartDateTime',
            ExpressionAttributeNames: { '#ttl': '_ttl' },
            Limit: 100
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new ScanCommand(params));
        
        if (result.Items) {
            for (const item of result.Items) {
                // Check both _ttl and calculate from gameStartDateTime
                const ttl = item._ttl;
                let shouldDelete = false;
                
                if (ttl && ttl < nowSeconds) {
                    shouldDelete = true;
                } else if (item.gameStartDateTime) {
                    // Fallback: calculate if game is older than 7 days
                    const gameStartMs = new Date(item.gameStartDateTime).getTime();
                    const maxAgeMs = RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60 * 1000;
                    if (Date.now() - gameStartMs > maxAgeMs) {
                        shouldDelete = true;
                    }
                }
                
                if (shouldDelete) {
                    try {
                        await docClient.send(new DeleteCommand({
                            TableName: tableName,
                            Key: { id: item.id }
                        }));
                        deletedCount++;
                    } catch (delErr) {
                        console.warn(`[SYNC-FINISHED] Failed to delete expired record ${item.id}:`, delErr.message);
                    }
                }
            }
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    return deletedCount;
}

/**
 * Main sync function for RecentlyFinishedGame table
 */
async function syncRecentlyFinishedGames() {
    console.log('[SYNC-FINISHED] ========================================');
    console.log('[SYNC-FINISHED] Starting RecentlyFinishedGame sync v3.2.0');
    
    const results = {
        finishedGamesFound: 0,
        alreadyExists: 0,
        created: 0,
        createFailed: 0,
        expiredDeleted: 0,
        errors: []
    };
    
    try {
        // Step 1: Get existing RecentlyFinishedGame IDs
        const existingIds = await getExistingRecentlyFinishedGameIds();
        
        // Step 2: Query finished games from Game table
        const finishedGames = await queryFinishedGames(RECENTLY_FINISHED_TTL_DAYS);
        results.finishedGamesFound = finishedGames.length;
        
        // Step 3: Create missing records
        for (const game of finishedGames) {
            if (existingIds.has(game.id)) {
                results.alreadyExists++;
                continue;
            }
            
            try {
                await createRecentlyFinishedGameRecord(game);
                results.created++;
                console.log(`[SYNC-FINISHED] ✅ Created RecentlyFinishedGame for: ${game.name}`);
            } catch (err) {
                if (err.name === 'ConditionalCheckFailedException') {
                    // Record already exists (race condition)
                    results.alreadyExists++;
                } else {
                    results.createFailed++;
                    results.errors.push(`${game.name || game.id}: ${err.message}`);
                    console.error(`[SYNC-FINISHED] ❌ Failed to create for ${game.id}:`, err.message);
                }
            }
        }
        
        // Step 4: Delete expired records (backup cleanup)
        results.expiredDeleted = await deleteExpiredRecentlyFinishedGames();
        
        console.log('[SYNC-FINISHED] ========================================');
        console.log('[SYNC-FINISHED] Sync completed:', results);
        
        return results;
        
    } catch (error) {
        console.error('[SYNC-FINISHED] Fatal error:', error);
        results.errors.push(`Fatal: ${error.message}`);
        return results;
    }
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    const startTime = Date.now();
    console.log('[REFRESH] ========================================');
    console.log('[REFRESH] Starting scheduled refresh check v3.2.0');
    console.log('[REFRESH] Includes: Running game refresh + RecentlyFinishedGame sync');
    
    const input = event?.arguments?.input || event || {};
    
    console.log('[REFRESH] Received input:', JSON.stringify(input, null, 2));
    
    // ================================================================
    // PARSE OPTIONS - Support both old and new formats
    // ================================================================
    const options = {
        forceRefresh: input?.forceRefresh === true,
        maxGames: input?.maxGames || MAX_REFRESH_PER_RUN,
        statuses: input?.statuses || null,
        checkRunning: input?.checkRunning !== false,
        checkPreStart: input?.checkPreStart !== false,
        // v3.2.0: New option for finished game sync
        syncFinished: input?.syncFinished !== false
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
        console.log('[REFRESH] Using provided statuses array (backward compat mode)');
        runningStatusesToCheck = options.statuses.filter(s => RUNNING_STATUSES.includes(s));
        preStartStatusesToCheck = options.statuses.filter(s => PRE_START_STATUSES.includes(s));
    } else {
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
        syncFinished: options.syncFinished,
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
        byCategory: {},
        // v3.2.0: RecentlyFinishedGame sync results
        finishedSync: null
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
        if (gamesToRefresh.length > 0) {
            const doNotScrapeUrls = await batchCheckDoNotScrape(gamesToRefresh);
            
            // ================================================================
            // STEP 4: Sort by priority and limit
            // ================================================================
            gamesToRefresh.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
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
        } else {
            console.log('[REFRESH] No games need refresh');
        }
        
        // ================================================================
        // STEP 6: v3.2.0 - Sync RecentlyFinishedGame table
        // ================================================================
        if (options.syncFinished) {
            results.finishedSync = await syncRecentlyFinishedGames();
        } else {
            console.log('[REFRESH] Skipping RecentlyFinishedGame sync (disabled)');
        }
        
        // ================================================================
        // STEP 7: Summary
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
            skippedLimit: results.skippedLimit,
            finishedSync: results.finishedSync ? {
                created: results.finishedSync.created,
                expiredDeleted: results.finishedSync.expiredDeleted
            } : 'disabled'
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
            finishedSync: results.finishedSync,
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