/**
 * Refresh Targeting Classifications & Account Categories Lambda
 * 
 * VERSION: 2.1.0
 * 
 * Two-mode operation:
 * 
 * 1. DAILY (default): Refreshes targetingClassification for Player and PlayerVenue
 *    - Schedule: cron(10 20 * * ? *) - 20:10 UTC daily
 *    - Runs 5 mins before refreshPlayerMetrics
 * 
 * 2. MONTHLY: Refreshes Account Category (Player.category) 
 *    - Schedule: cron(0 19 1 * ? *) - 19:00 UTC on 1st of each month
 *    - Calculates behavioural categories: TRIALIST, CASUAL, COMMITTED, REGULAR, VIP
 *    - VIP is top 5% by buy-ins per entity (overrides other categories)
 * 
 * Account Category Framework (from design doc):
 * - TRIALIST: Early-stage explorer, <5 games, registered within 60 days
 * - CASUAL: Plays occasionally, <2 games/month average over last 90 days
 * - COMMITTED: 2-4 games/month, demonstrates repeat behaviour
 * - REGULAR: 3+ games/month sustained 6+ weeks (relaxed for holidays)
 * - VIP: Top 5% by total buy-ins over 12 months per entity (overrides REGULAR)
 * 
 * Key Principles:
 * - Categories are STABLE - no week-to-week flapping
 * - Upgrades require sustained behaviour
 * - Downgrades lag inactivity
 * - VIP is especially protected
 * 
 * NEW in 2.1.0:
 * - Activity Snapshot Storage: Saves daily/weekly/monthly snapshots to PlayerActivitySnapshot table
 * - Enables week-on-week and month-on-month trending analysis
 * - Snapshots consumed by metricsPackGenerator for AI reports
 * - Relaxed REGULAR thresholds (3+ games/month, 6+ weeks)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    QueryCommand,
    UpdateCommand,
    GetCommand,
    PutCommand
} = require('@aws-sdk/lib-dynamodb');
const { sendNotification, isEventBridgeTrigger } = require('./ses-notification');

// ===================================================================
// CONFIGURATION
// ===================================================================

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

// Concurrency control
const BATCH_SIZE = 25;
const CONCURRENCY_LIMIT = 10;
const SCAN_LIMIT = 1000;

// Account Category Thresholds
const CATEGORY_CONFIG = {
    // TRIALIST: New player still exploring
    TRIALIST_MAX_GAMES: 5,              // Less than 5 games played
    TRIALIST_MAX_DAYS_SINCE_REG: 60,    // Registered within 60 days
    
    // CASUAL: Occasional player
    CASUAL_MAX_GAMES_PER_MONTH: 2,      // Less than 2 games/month average
    
    // COMMITTED: Regular intent but not weekly
    COMMITTED_MIN_GAMES_PER_MONTH: 2,   // 2-4 games/month
    COMMITTED_MAX_GAMES_PER_MONTH: 4,
    
    // REGULAR: Weekly participation sustained
    REGULAR_MIN_GAMES_PER_MONTH: 3,     // 3+ games/month (relaxed for holidays)
    REGULAR_MIN_WEEKS_SUSTAINED: 6,     // Over 6 weeks (relaxed from 8)
    
    // VIP: Top percentile by value
    VIP_PERCENTILE: 0.95,               // Top 5%
    VIP_LOOKBACK_MONTHS: 12,            // Rolling 12 months
    VIP_MIN_GAMES: 3,                   // Must have some engagement (not single outlier)
    
    // Stability: Grace periods before downgrade
    DOWNGRADE_GRACE_DAYS: 30,           // Wait 30 days before downgrading
};

// ===================================================================
// TABLE NAMES
// ===================================================================

const getTableName = (modelName) => {
    const envTableName = process.env[`API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`];
    if (envTableName) return envTableName;
    
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Unable to determine table name for ${modelName}`);
    }
    return `${modelName}-${apiId}-${env}`;
};

// ===================================================================
// DATE HELPERS
// ===================================================================

const daysBetween = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
};

const monthsBetween = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
};

const getDateMonthsAgo = (months) => {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date.toISOString();
};

const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

// ===================================================================
// TARGETING CLASSIFICATION LOGIC (Daily)
// ===================================================================

const calculatePlayerTargetingClassification = (lastPlayedDate) => {
    if (!lastPlayedDate) return 'NotPlayed';
    
    const now = new Date();
    const daysSinceLastActivity = daysBetween(lastPlayedDate, now);
    
    if (daysSinceLastActivity <= 30) return 'Active_EL';
    if (daysSinceLastActivity <= 60) return 'Retain_Inactive31_60d';
    if (daysSinceLastActivity <= 90) return 'Retain_Inactive61_90d';
    if (daysSinceLastActivity <= 120) return 'Churned_91_120d';
    if (daysSinceLastActivity <= 180) return 'Churned_121_180d';
    if (daysSinceLastActivity <= 360) return 'Churned_181_360d';
    return 'Churned_361d';
};

const calculatePlayerVenueTargetingClassification = (lastPlayedDate, membershipCreatedDate) => {
    const now = new Date();
    
    if (!lastPlayedDate) {
        if (!membershipCreatedDate) return 'NotActivated_EL';
        const daysSinceMembership = daysBetween(membershipCreatedDate, now);
        if (daysSinceMembership <= 30) return 'NotActivated_EL';
        if (daysSinceMembership <= 60) return 'NotActivated_31_60d';
        if (daysSinceMembership <= 90) return 'NotActivated_61_90d';
        if (daysSinceMembership <= 120) return 'NotActivated_91_120d';
        if (daysSinceMembership <= 180) return 'NotActivated_121_180d';
        if (daysSinceMembership <= 360) return 'NotActivated_181_360d';
        return 'NotActivated_361d';
    }
    
    const daysSinceLastActivity = daysBetween(lastPlayedDate, now);
    if (daysSinceLastActivity <= 30) return 'Active_EL';
    if (daysSinceLastActivity <= 60) return 'Retain_Inactive31_60d';
    if (daysSinceLastActivity <= 90) return 'Retain_Inactive61_90d';
    if (daysSinceLastActivity <= 120) return 'Churned_91_120d';
    if (daysSinceLastActivity <= 180) return 'Churned_121_180d';
    if (daysSinceLastActivity <= 360) return 'Churned_181_360d';
    return 'Churned_361d';
};

// ===================================================================
// ACCOUNT CATEGORY LOGIC (Monthly)
// ===================================================================

/**
 * Calculate VIP thresholds per entity
 * Returns Map<entityId, { threshold, vipPlayerIds }>
 */
async function calculateVIPThresholdsPerEntity() {
    const playerTransactionTable = getTableName('PlayerTransaction');
    const cutoffDate = getDateMonthsAgo(CATEGORY_CONFIG.VIP_LOOKBACK_MONTHS);
    
    console.log(`[VIP] Calculating VIP thresholds with cutoff: ${cutoffDate}`);
    
    // Aggregate buy-ins per player per entity over last 12 months
    // Structure: { entityId: { playerId: totalBuyIns } }
    const entityPlayerBuyIns = {};
    const playerGameCounts = {};  // Track game counts for min engagement
    
    let lastEvaluatedKey = null;
    let scanCount = 0;
    
    do {
        const scanParams = {
            TableName: playerTransactionTable,
            FilterExpression: '#type = :buyIn AND transactionDate >= :cutoff',
            ExpressionAttributeNames: { '#type': 'type' },
            ExpressionAttributeValues: {
                ':buyIn': 'BUY_IN',
                ':cutoff': cutoffDate
            },
            ProjectionExpression: 'playerId, entityId, amount'
        };
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const response = await ddbDocClient.send(new ScanCommand(scanParams));
        scanCount++;
        
        for (const txn of response.Items || []) {
            const entityId = txn.entityId || 'UNKNOWN';
            const playerId = txn.playerId;
            const amount = txn.amount || 0;
            
            if (!entityPlayerBuyIns[entityId]) {
                entityPlayerBuyIns[entityId] = {};
            }
            
            if (!entityPlayerBuyIns[entityId][playerId]) {
                entityPlayerBuyIns[entityId][playerId] = 0;
            }
            
            entityPlayerBuyIns[entityId][playerId] += amount;
            
            // Track game count
            const countKey = `${entityId}#${playerId}`;
            playerGameCounts[countKey] = (playerGameCounts[countKey] || 0) + 1;
        }
        
        lastEvaluatedKey = response.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    console.log(`[VIP] Scanned ${scanCount} pages of transactions`);
    
    // Calculate thresholds and identify VIPs per entity
    const vipData = new Map();
    
    for (const [entityId, playerBuyIns] of Object.entries(entityPlayerBuyIns)) {
        // Filter out players who don't meet minimum engagement
        const qualifiedPlayers = Object.entries(playerBuyIns)
            .filter(([playerId]) => {
                const countKey = `${entityId}#${playerId}`;
                return (playerGameCounts[countKey] || 0) >= CATEGORY_CONFIG.VIP_MIN_GAMES;
            })
            .map(([playerId, total]) => ({ playerId, total }))
            .sort((a, b) => b.total - a.total);
        
        if (qualifiedPlayers.length === 0) {
            console.log(`[VIP] Entity ${entityId}: No qualified players`);
            continue;
        }
        
        // Calculate top 5% threshold
        // Players are sorted DESCENDING (highest first), so top 5% is at the start
        // For 1000 players, top 5% = 50 players (indices 0-49)
        const topPercentCount = Math.max(1, Math.ceil(qualifiedPlayers.length * (1 - CATEGORY_CONFIG.VIP_PERCENTILE)));
        const threshold = qualifiedPlayers[topPercentCount - 1]?.total || qualifiedPlayers[0].total;
        
        // Identify VIPs (take exactly the top N players)
        const vipPlayerIds = new Set(
            qualifiedPlayers
                .slice(0, topPercentCount)
                .map(p => p.playerId)
        );
        
        vipData.set(entityId, {
            threshold,
            vipPlayerIds,
            totalPlayers: qualifiedPlayers.length,
            vipCount: vipPlayerIds.size
        });
        
        console.log(`[VIP] Entity ${entityId}: threshold=$${threshold.toFixed(2)}, VIPs=${vipPlayerIds.size}/${qualifiedPlayers.length} players`);
    }
    
    return vipData;
}

/**
 * Get player activity data for category calculation
 */
async function getPlayerActivityData(playerId) {
    const playerResultTable = getTableName('PlayerResult');
    const cutoffDate = getDateMonthsAgo(3);  // Look at last 3 months for activity pattern
    
    try {
        const response = await ddbDocClient.send(new QueryCommand({
            TableName: playerResultTable,
            IndexName: 'byPlayer',
            KeyConditionExpression: 'playerId = :pid AND gameStartDateTime >= :cutoff',
            ExpressionAttributeValues: {
                ':pid': playerId,
                ':cutoff': cutoffDate
            },
            ProjectionExpression: 'gameStartDateTime'
        }));
        
        return response.Items || [];
    } catch (error) {
        console.warn(`[ACTIVITY] Error fetching activity for ${playerId}:`, error.message);
        return [];
    }
}

/**
 * Calculate weekly participation pattern
 * Returns { weeksWithActivity, totalWeeks, gamesPerMonth }
 */
function calculateWeeklyPattern(gameDates, lookbackMonths = 3) {
    if (!gameDates || gameDates.length === 0) {
        return { weeksWithActivity: 0, totalWeeks: lookbackMonths * 4, gamesPerMonth: 0 };
    }
    
    const now = new Date();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
    
    // Count unique weeks with activity
    const weeksWithGames = new Set();
    let gamesInPeriod = 0;
    
    for (const date of gameDates) {
        const gameDate = new Date(date);
        if (gameDate >= cutoff && gameDate <= now) {
            const weekKey = `${gameDate.getFullYear()}-W${getWeekNumber(gameDate)}`;
            weeksWithGames.add(weekKey);
            gamesInPeriod++;
        }
    }
    
    const totalWeeks = lookbackMonths * 4;  // Approximate
    const gamesPerMonth = gamesInPeriod / lookbackMonths;
    
    return {
        weeksWithActivity: weeksWithGames.size,
        totalWeeks,
        gamesPerMonth,
        gamesInPeriod
    };
}

/**
 * Determine Account Category for a player
 */
function determineAccountCategory(player, activityPattern, isVIP, currentCategory) {
    const now = new Date();
    
    // VIP overrides everything
    if (isVIP) {
        return 'VIP';
    }
    
    const totalGamesPlayed = player.gamesPlayedAllTime || player.tournamentsPlayed || 0;
    const registrationDate = player.registrationDate || player.createdAt;
    const daysSinceRegistration = registrationDate ? daysBetween(registrationDate, now) : 999;
    
    // TRIALIST: New player, still exploring
    if (totalGamesPlayed < CATEGORY_CONFIG.TRIALIST_MAX_GAMES && 
        daysSinceRegistration <= CATEGORY_CONFIG.TRIALIST_MAX_DAYS_SINCE_REG) {
        return 'TRIALIST';
    }
    
    // Calculate activity metrics
    const { weeksWithActivity, gamesPerMonth, gamesInPeriod } = activityPattern;
    
    // REGULAR: Weekly participation sustained over 8+ weeks
    // Check if they've played in at least 8 of the last 12 weeks
    if (gamesPerMonth >= CATEGORY_CONFIG.REGULAR_MIN_GAMES_PER_MONTH && 
        weeksWithActivity >= CATEGORY_CONFIG.REGULAR_MIN_WEEKS_SUSTAINED) {
        return 'REGULAR';
    }
    
    // COMMITTED: 2-4 games/month, showing repeat behaviour
    if (gamesPerMonth >= CATEGORY_CONFIG.COMMITTED_MIN_GAMES_PER_MONTH && 
        gamesPerMonth < CATEGORY_CONFIG.REGULAR_MIN_GAMES_PER_MONTH &&
        gamesInPeriod >= 4) {  // At least 4 games in 3 months to show commitment
        return 'COMMITTED';
    }
    
    // CASUAL: Has played but low frequency
    if (totalGamesPlayed >= CATEGORY_CONFIG.TRIALIST_MAX_GAMES || 
        daysSinceRegistration > CATEGORY_CONFIG.TRIALIST_MAX_DAYS_SINCE_REG) {
        // Check for downgrade protection
        if (currentCategory === 'REGULAR' || currentCategory === 'COMMITTED') {
            // Grace period: Don't immediately downgrade
            const lastPlayedDate = player.lastPlayedDate;
            if (lastPlayedDate) {
                const daysSinceLastPlayed = daysBetween(lastPlayedDate, now);
                if (daysSinceLastPlayed <= CATEGORY_CONFIG.DOWNGRADE_GRACE_DAYS) {
                    return currentCategory;  // Keep current category during grace period
                }
            }
        }
        return 'CASUAL';
    }
    
    // Default: TRIALIST (shouldn't reach here often)
    return 'TRIALIST';
}

// ===================================================================
// TRANSITION TRACKING
// ===================================================================

class TransitionTracker {
    constructor(name) {
        this.name = name;
        this.transitions = {};
        this.totalScanned = 0;
        this.totalUpdated = 0;
        this.totalUnchanged = 0;
        this.totalErrors = 0;
        this.errorDetails = [];
    }
    
    recordTransition(fromValue, toValue) {
        const key = `${fromValue || 'NULL'} → ${toValue}`;
        this.transitions[key] = (this.transitions[key] || 0) + 1;
        
        if (fromValue !== toValue) {
            this.totalUpdated++;
        } else {
            this.totalUnchanged++;
        }
        this.totalScanned++;
    }
    
    recordError(id, error) {
        this.totalErrors++;
        if (this.errorDetails.length < 10) {
            this.errorDetails.push({ id, error: error.message || String(error) });
        }
        this.totalScanned++;
    }
    
    getChangedTransitions() {
        const changed = {};
        for (const [key, count] of Object.entries(this.transitions)) {
            const [from, to] = key.split(' → ');
            if (from !== to) {
                changed[key] = count;
            }
        }
        return changed;
    }
    
    getSummary() {
        return {
            name: this.name,
            totalScanned: this.totalScanned,
            totalUpdated: this.totalUpdated,
            totalUnchanged: this.totalUnchanged,
            totalErrors: this.totalErrors,
            changedTransitions: this.getChangedTransitions(),
            allTransitions: this.transitions,
            errorDetails: this.errorDetails
        };
    }
}

// ===================================================================
// CONCURRENCY HELPERS
// ===================================================================

const processWithConcurrency = async (items, processor, limit = CONCURRENCY_LIMIT) => {
    const results = [];
    const executing = new Set();
    
    for (const item of items) {
        const promise = processor(item).then(result => {
            executing.delete(promise);
            return result;
        }).catch(error => {
            executing.delete(promise);
            return { success: false, error: error.message, item };
        });
        
        executing.add(promise);
        results.push(promise);
        
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    
    return Promise.all(results);
};

// ===================================================================
// DAILY: TARGETING CLASSIFICATION PROCESSING
// ===================================================================

async function processPlayerTargetingClassifications(tracker) {
    const playerTable = getTableName('Player');
    const now = new Date().toISOString();
    
    console.log(`[PLAYER-TARGETING] Starting scan of ${playerTable}`);
    
    let lastEvaluatedKey = null;
    let pageCount = 0;
    const updateBatches = [];
    
    do {
        const scanParams = {
            TableName: playerTable,
            Limit: SCAN_LIMIT,
            ProjectionExpression: 'id, lastPlayedDate, targetingClassification, #v',
            ExpressionAttributeNames: { '#v': '_version' }
        };
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const response = await ddbDocClient.send(new ScanCommand(scanParams));
        pageCount++;
        
        for (const player of response.Items || []) {
            const currentClassification = player.targetingClassification;
            const newClassification = calculatePlayerTargetingClassification(player.lastPlayedDate);
            
            tracker.recordTransition(currentClassification, newClassification);
            
            if (currentClassification !== newClassification) {
                updateBatches.push({
                    id: player.id,
                    newClassification,
                    currentVersion: player._version || 1
                });
            }
        }
        
        lastEvaluatedKey = response.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    console.log(`[PLAYER-TARGETING] Scan complete: ${tracker.totalScanned} scanned, ${updateBatches.length} need updates`);
    
    // Process updates
    if (updateBatches.length > 0) {
        const batches = [];
        for (let i = 0; i < updateBatches.length; i += BATCH_SIZE) {
            batches.push(updateBatches.slice(i, i + BATCH_SIZE));
        }
        
        await processWithConcurrency(batches, async (batch) => {
            for (const item of batch) {
                try {
                    await ddbDocClient.send(new UpdateCommand({
                        TableName: playerTable,
                        Key: { id: item.id },
                        UpdateExpression: 'SET targetingClassification = :tc, updatedAt = :now, #v = #v + :inc',
                        ExpressionAttributeNames: { '#v': '_version' },
                        ExpressionAttributeValues: {
                            ':tc': item.newClassification,
                            ':now': now,
                            ':inc': 1
                        }
                    }));
                } catch (error) {
                    tracker.recordError(item.id, error);
                }
            }
            return { success: true };
        }, CONCURRENCY_LIMIT);
    }
    
    return tracker.getSummary();
}

async function processPlayerVenueTargetingClassifications(tracker) {
    const playerVenueTable = getTableName('PlayerVenue');
    const now = new Date().toISOString();
    
    console.log(`[PLAYERVENUE-TARGETING] Starting scan of ${playerVenueTable}`);
    
    let lastEvaluatedKey = null;
    let pageCount = 0;
    const updateBatches = [];
    const venueTransitions = {};
    
    do {
        const scanParams = {
            TableName: playerVenueTable,
            Limit: SCAN_LIMIT,
            ProjectionExpression: 'id, venueId, lastPlayedDate, membershipCreatedDate, targetingClassification, #v',
            ExpressionAttributeNames: { '#v': '_version' }
        };
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const response = await ddbDocClient.send(new ScanCommand(scanParams));
        pageCount++;
        
        for (const pv of response.Items || []) {
            const currentClassification = pv.targetingClassification;
            const newClassification = calculatePlayerVenueTargetingClassification(
                pv.lastPlayedDate, 
                pv.membershipCreatedDate
            );
            
            tracker.recordTransition(currentClassification, newClassification);
            
            // Track per-venue
            const venueId = pv.venueId || 'UNKNOWN';
            if (!venueTransitions[venueId]) {
                venueTransitions[venueId] = {};
            }
            const transitionKey = `${currentClassification || 'NULL'} → ${newClassification}`;
            venueTransitions[venueId][transitionKey] = (venueTransitions[venueId][transitionKey] || 0) + 1;
            
            if (currentClassification !== newClassification) {
                updateBatches.push({
                    id: pv.id,
                    venueId,
                    newClassification,
                    currentVersion: pv._version || 1
                });
            }
        }
        
        lastEvaluatedKey = response.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    console.log(`[PLAYERVENUE-TARGETING] Scan complete: ${tracker.totalScanned} scanned, ${updateBatches.length} need updates`);
    
    // Process updates
    if (updateBatches.length > 0) {
        const batches = [];
        for (let i = 0; i < updateBatches.length; i += BATCH_SIZE) {
            batches.push(updateBatches.slice(i, i + BATCH_SIZE));
        }
        
        await processWithConcurrency(batches, async (batch) => {
            for (const item of batch) {
                try {
                    await ddbDocClient.send(new UpdateCommand({
                        TableName: playerVenueTable,
                        Key: { id: item.id },
                        UpdateExpression: 'SET targetingClassification = :tc, updatedAt = :now, #v = #v + :inc',
                        ExpressionAttributeNames: { '#v': '_version' },
                        ExpressionAttributeValues: {
                            ':tc': item.newClassification,
                            ':now': now,
                            ':inc': 1
                        }
                    }));
                } catch (error) {
                    tracker.recordError(item.id, error);
                }
            }
            return { success: true };
        }, CONCURRENCY_LIMIT);
    }
    
    const summary = tracker.getSummary();
    summary.venueTransitions = venueTransitions;
    
    return summary;
}

// ===================================================================
// MONTHLY: ACCOUNT CATEGORY PROCESSING
// ===================================================================

async function processAccountCategories(tracker) {
    const playerTable = getTableName('Player');
    const playerSummaryTable = getTableName('PlayerSummary');
    const now = new Date().toISOString();
    
    console.log(`[ACCOUNT-CATEGORY] Starting monthly Account Category refresh`);
    
    // Step 1: Calculate VIP thresholds per entity
    console.log(`[ACCOUNT-CATEGORY] Calculating VIP thresholds...`);
    const vipData = await calculateVIPThresholdsPerEntity();
    
    // Build a set of all VIP player IDs (across all entities)
    const allVIPPlayerIds = new Set();
    for (const [entityId, data] of vipData) {
        for (const playerId of data.vipPlayerIds) {
            allVIPPlayerIds.add(playerId);
        }
    }
    console.log(`[ACCOUNT-CATEGORY] Total unique VIPs across all entities: ${allVIPPlayerIds.size}`);
    
    // Track VIP stats by entity for reporting
    const vipStatsByEntity = {};
    for (const [entityId, data] of vipData) {
        vipStatsByEntity[entityId] = {
            threshold: data.threshold,
            vipCount: data.vipCount,
            totalPlayers: data.totalPlayers
        };
    }
    
    // Step 2: Scan all players and determine categories
    console.log(`[ACCOUNT-CATEGORY] Scanning players for category assignment...`);
    
    let lastEvaluatedKey = null;
    let pageCount = 0;
    const updateBatches = [];
    
    do {
        const scanParams = {
            TableName: playerTable,
            Limit: SCAN_LIMIT,
            ProjectionExpression: 'id, #cat, registrationDate, lastPlayedDate, primaryEntityId, #v',
            ExpressionAttributeNames: { 
                '#v': '_version',
                '#cat': 'category'
            }
        };
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const response = await ddbDocClient.send(new ScanCommand(scanParams));
        pageCount++;
        
        console.log(`[ACCOUNT-CATEGORY] Processing page ${pageCount}: ${response.Items?.length || 0} players`);
        
        // Process players in parallel batches
        const playerPromises = (response.Items || []).map(async (player) => {
            try {
                // Get player summary for game counts
                let summary = null;
                try {
                    const summaryResponse = await ddbDocClient.send(new GetCommand({
                        TableName: playerSummaryTable,
                        Key: { id: player.id }
                    }));
                    summary = summaryResponse.Item;
                } catch (e) {
                    // Summary might not exist
                }
                
                // Get activity pattern
                const activityData = await getPlayerActivityData(player.id);
                const activityPattern = calculateWeeklyPattern(
                    activityData.map(r => r.gameStartDateTime),
                    3  // Last 3 months
                );
                
                // Check if VIP
                const isVIP = allVIPPlayerIds.has(player.id);
                
                // Combine player data with summary
                const playerData = {
                    ...player,
                    gamesPlayedAllTime: summary?.tournamentsPlayed || summary?.sessionsPlayed || 0,
                    tournamentsPlayed: summary?.tournamentsPlayed || 0
                };
                
                // Determine category
                const currentCategory = player.category;
                const newCategory = determineAccountCategory(
                    playerData, 
                    activityPattern, 
                    isVIP,
                    currentCategory
                );
                
                return {
                    id: player.id,
                    currentCategory,
                    newCategory,
                    version: player._version || 1
                };
                
            } catch (error) {
                console.error(`[ACCOUNT-CATEGORY] Error processing ${player.id}:`, error.message);
                return {
                    id: player.id,
                    error: error.message
                };
            }
        });
        
        const results = await Promise.all(playerPromises);
        
        for (const result of results) {
            if (result.error) {
                tracker.recordError(result.id, { message: result.error });
            } else {
                tracker.recordTransition(result.currentCategory, result.newCategory);
                
                if (result.currentCategory !== result.newCategory) {
                    updateBatches.push({
                        id: result.id,
                        newCategory: result.newCategory,
                        currentVersion: result.version
                    });
                }
            }
        }
        
        lastEvaluatedKey = response.LastEvaluatedKey;
        
    } while (lastEvaluatedKey);
    
    console.log(`[ACCOUNT-CATEGORY] Scan complete: ${tracker.totalScanned} scanned, ${updateBatches.length} need updates`);
    
    // Step 3: Apply updates
    if (updateBatches.length > 0) {
        console.log(`[ACCOUNT-CATEGORY] Applying ${updateBatches.length} category updates...`);
        
        const batches = [];
        for (let i = 0; i < updateBatches.length; i += BATCH_SIZE) {
            batches.push(updateBatches.slice(i, i + BATCH_SIZE));
        }
        
        await processWithConcurrency(batches, async (batch) => {
            for (const item of batch) {
                try {
                    await ddbDocClient.send(new UpdateCommand({
                        TableName: playerTable,
                        Key: { id: item.id },
                        UpdateExpression: 'SET #cat = :cat, updatedAt = :now, #v = #v + :inc',
                        ExpressionAttributeNames: { 
                            '#v': '_version',
                            '#cat': 'category'
                        },
                        ExpressionAttributeValues: {
                            ':cat': item.newCategory,
                            ':now': now,
                            ':inc': 1
                        }
                    }));
                } catch (error) {
                    tracker.recordError(item.id, error);
                }
            }
            return { success: true };
        }, CONCURRENCY_LIMIT);
    }
    
    const summary = tracker.getSummary();
    summary.vipStatsByEntity = vipStatsByEntity;
    summary.totalVIPs = allVIPPlayerIds.size;
    
    return summary;
}

// ===================================================================
// NOTIFICATION FORMATTING
// ===================================================================

function formatTargetingNotification(playerSummary, playerVenueSummary) {
    const lines = [];
    
    // PLAYER TRANSITIONS
    lines.push('═══════════════════════════════════════');
    lines.push('PLAYER TARGETING CHANGES (Global)');
    lines.push('═══════════════════════════════════════');
    lines.push(`Total Players Scanned: ${playerSummary.totalScanned}`);
    lines.push(`Classifications Updated: ${playerSummary.totalUpdated}`);
    lines.push(`Unchanged: ${playerSummary.totalUnchanged}`);
    
    const playerChanges = playerSummary.changedTransitions;
    if (Object.keys(playerChanges).length > 0) {
        lines.push('');
        lines.push('Changes:');
        const sorted = Object.entries(playerChanges).sort((a, b) => b[1] - a[1]);
        for (const [transition, count] of sorted) {
            lines.push(`  ${count} players: ${transition}`);
        }
    } else {
        lines.push('');
        lines.push('No classification changes detected.');
    }
    
    // PLAYERVENUE TRANSITIONS
    lines.push('');
    lines.push('═══════════════════════════════════════');
    lines.push('PLAYERVENUE TARGETING CHANGES');
    lines.push('═══════════════════════════════════════');
    lines.push(`Total Records Scanned: ${playerVenueSummary.totalScanned}`);
    lines.push(`Classifications Updated: ${playerVenueSummary.totalUpdated}`);
    lines.push(`Unchanged: ${playerVenueSummary.totalUnchanged}`);
    
    const pvChanges = playerVenueSummary.changedTransitions;
    if (Object.keys(pvChanges).length > 0) {
        lines.push('');
        lines.push('Aggregate Changes:');
        const sorted = Object.entries(pvChanges).sort((a, b) => b[1] - a[1]);
        for (const [transition, count] of sorted) {
            lines.push(`  ${count} records: ${transition}`);
        }
    }
    
    // Per-venue breakdown (top 10 with changes)
    if (playerVenueSummary.venueTransitions) {
        const venuesWithChanges = [];
        for (const [venueId, transitions] of Object.entries(playerVenueSummary.venueTransitions)) {
            const changeCount = Object.entries(transitions)
                .filter(([key]) => {
                    const [from, to] = key.split(' → ');
                    return from !== to;
                })
                .reduce((sum, [, count]) => sum + count, 0);
            
            if (changeCount > 0) {
                venuesWithChanges.push({ venueId, changeCount, transitions });
            }
        }
        
        if (venuesWithChanges.length > 0) {
            lines.push('');
            lines.push('───────────────────────────────────────');
            lines.push('Per-Venue Breakdown (Top 10):');
            lines.push('───────────────────────────────────────');
            
            venuesWithChanges.sort((a, b) => b.changeCount - a.changeCount);
            const topVenues = venuesWithChanges.slice(0, 10);
            
            for (const { venueId, changeCount, transitions } of topVenues) {
                lines.push('');
                lines.push(`Venue ${venueId.slice(0, 8)}... (${changeCount} changes):`);
                
                const changedOnly = Object.entries(transitions)
                    .filter(([key]) => {
                        const [from, to] = key.split(' → ');
                        return from !== to;
                    })
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                
                for (const [transition, count] of changedOnly) {
                    lines.push(`    ${count}: ${transition}`);
                }
            }
        }
    }
    
    return lines.join('\n');
}

function formatCategoryNotification(categorySummary) {
    const lines = [];
    
    lines.push('═══════════════════════════════════════');
    lines.push('ACCOUNT CATEGORY CHANGES (Monthly)');
    lines.push('═══════════════════════════════════════');
    lines.push(`Total Players Scanned: ${categorySummary.totalScanned}`);
    lines.push(`Categories Updated: ${categorySummary.totalUpdated}`);
    lines.push(`Unchanged: ${categorySummary.totalUnchanged}`);
    lines.push(`Total VIPs (all entities): ${categorySummary.totalVIPs || 0}`);
    
    const changes = categorySummary.changedTransitions;
    if (Object.keys(changes).length > 0) {
        lines.push('');
        lines.push('Category Transitions:');
        
        // Group by destination category for clearer reading
        const byDestination = {};
        for (const [transition, count] of Object.entries(changes)) {
            const [from, to] = transition.split(' → ');
            if (!byDestination[to]) {
                byDestination[to] = [];
            }
            byDestination[to].push({ from, count });
        }
        
        // Show in order: VIP, REGULAR, COMMITTED, CASUAL, TRIALIST
        const categoryOrder = ['VIP', 'REGULAR', 'COMMITTED', 'CASUAL', 'TRIALIST'];
        
        for (const category of categoryOrder) {
            if (byDestination[category]) {
                lines.push('');
                lines.push(`  → ${category}:`);
                const sorted = byDestination[category].sort((a, b) => b.count - a.count);
                for (const { from, count } of sorted) {
                    lines.push(`      ${count} from ${from}`);
                }
            }
        }
    } else {
        lines.push('');
        lines.push('No category changes detected.');
    }
    
    // VIP thresholds by entity
    if (categorySummary.vipStatsByEntity && Object.keys(categorySummary.vipStatsByEntity).length > 0) {
        lines.push('');
        lines.push('───────────────────────────────────────');
        lines.push('VIP Thresholds by Entity:');
        lines.push('───────────────────────────────────────');
        
        const sorted = Object.entries(categorySummary.vipStatsByEntity)
            .sort((a, b) => b[1].vipCount - a[1].vipCount);
        
        for (const [entityId, stats] of sorted.slice(0, 10)) {
            lines.push(`  ${entityId.slice(0, 8)}...: $${stats.threshold.toFixed(0)} threshold, ${stats.vipCount} VIPs (top 5% of ${stats.totalPlayers})`);
        }
    }
    
    // All category distribution
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('Current Category Distribution:');
    lines.push('───────────────────────────────────────');
    
    const distribution = {};
    for (const [transition, count] of Object.entries(categorySummary.allTransitions)) {
        const [, to] = transition.split(' → ');
        distribution[to] = (distribution[to] || 0) + count;
    }
    
    const distSorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    for (const [category, count] of distSorted) {
        const pct = ((count / categorySummary.totalScanned) * 100).toFixed(1);
        lines.push(`  ${category}: ${count} (${pct}%)`);
    }
    
    return lines.join('\n');
}

// ===================================================================
// ACTIVITY SNAPSHOT STORAGE
// ===================================================================

/**
 * Get the week key for a date (e.g., "2025-W05")
 */
function getWeekKey(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get the month key for a date (e.g., "2025-01")
 */
function getMonthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Calculate distribution from tracker transitions
 * Returns the "current state" distribution (what everything ended up as)
 */
function calculateDistribution(allTransitions) {
    const distribution = {};
    for (const [transition, count] of Object.entries(allTransitions)) {
        const [, to] = transition.split(' → ');
        const category = to || 'UNKNOWN';
        distribution[category] = (distribution[category] || 0) + count;
    }
    return distribution;
}

/**
 * Extract just the changed transitions (for trend analysis)
 */
function extractChangedTransitions(allTransitions) {
    const changed = {};
    for (const [transition, count] of Object.entries(allTransitions)) {
        const [from, to] = transition.split(' → ');
        if (from !== to) {
            changed[transition] = count;
        }
    }
    return changed;
}

/**
 * Save activity snapshot for trending/analytics
 * Stores both daily and weekly/monthly aggregates
 */
async function saveActivitySnapshot(results, mode, durationMs) {
    const snapshotTable = getTableName('PlayerActivitySnapshot');
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // 2025-02-01
    const weekKey = getWeekKey(now);
    const monthKey = getMonthKey(now);
    
    console.log(`[SNAPSHOT] Saving activity snapshot for ${dateKey}`);
    
    // Build targeting distributions
    const playerTargetingDistribution = calculateDistribution(results.targeting.player.allTransitions);
    const playerVenueTargetingDistribution = calculateDistribution(results.targeting.playerVenue.allTransitions);
    
    // Build category distribution (if monthly run)
    const accountCategoryDistribution = results.category 
        ? calculateDistribution(results.category.allTransitions)
        : null;
    
    // Extract transitions (changes only)
    const playerTargetingTransitions = extractChangedTransitions(results.targeting.player.allTransitions);
    const playerVenueTargetingTransitions = extractChangedTransitions(results.targeting.playerVenue.allTransitions);
    const accountCategoryTransitions = results.category
        ? extractChangedTransitions(results.category.allTransitions)
        : null;
    
    // Build per-entity breakdown from VIP stats and venue transitions
    const entityBreakdown = {};
    
    // Add VIP stats by entity
    if (results.category?.vipStatsByEntity) {
        for (const [entityId, stats] of Object.entries(results.category.vipStatsByEntity)) {
            if (!entityBreakdown[entityId]) {
                entityBreakdown[entityId] = {};
            }
            entityBreakdown[entityId].vipStats = stats;
        }
    }
    
    // Add venue targeting by venue (approximates entity breakdown)
    if (results.targeting.playerVenue.venueTransitions) {
        for (const [venueId, transitions] of Object.entries(results.targeting.playerVenue.venueTransitions)) {
            // Note: venueId isn't entityId, but this gives per-venue granularity
            // We'll track this separately
        }
    }
    
    // Create the snapshot record
    const snapshot = {
        id: `DAILY_${dateKey}`,
        snapshotType: 'DAILY',
        snapshotDate: now.toISOString(),
        dateKey,
        weekKey,
        monthKey,
        
        // Processing mode
        mode,
        
        // Totals
        totalPlayers: results.targeting.player.totalScanned,
        totalPlayerVenues: results.targeting.playerVenue.totalScanned,
        
        // Targeting distributions (current state)
        playerTargetingDistribution: JSON.stringify(playerTargetingDistribution),
        playerVenueTargetingDistribution: JSON.stringify(playerVenueTargetingDistribution),
        
        // Account category distribution (monthly only)
        accountCategoryDistribution: accountCategoryDistribution 
            ? JSON.stringify(accountCategoryDistribution) 
            : null,
        
        // Transitions (what changed)
        playerTargetingTransitions: JSON.stringify(playerTargetingTransitions),
        playerVenueTargetingTransitions: JSON.stringify(playerVenueTargetingTransitions),
        accountCategoryTransitions: accountCategoryTransitions
            ? JSON.stringify(accountCategoryTransitions)
            : null,
        
        // Updates made
        playerTargetingUpdated: results.targeting.player.totalUpdated,
        playerVenueTargetingUpdated: results.targeting.playerVenue.totalUpdated,
        accountCategoryUpdated: results.category?.totalUpdated || 0,
        
        // VIP stats (monthly only)
        totalVIPs: results.category?.totalVIPs || null,
        vipStatsByEntity: results.category?.vipStatsByEntity 
            ? JSON.stringify(results.category.vipStatsByEntity)
            : null,
        
        // Per-venue breakdown for PlayerVenue
        venueTargetingBreakdown: results.targeting.playerVenue.venueTransitions
            ? JSON.stringify(results.targeting.playerVenue.venueTransitions)
            : null,
        
        // Errors
        totalErrors: results.targeting.player.totalErrors + 
                     results.targeting.playerVenue.totalErrors + 
                     (results.category?.totalErrors || 0),
        
        // Metadata
        executionTimeMs: durationMs,
        generatedBy: 'refreshTargetingClassifications',
        
        // Amplify fields
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        __typename: 'PlayerActivitySnapshot',
        _version: 1,
        _lastChangedAt: Date.now(),
        _deleted: null
    };
    
    try {
        await ddbDocClient.send(new PutCommand({
            TableName: snapshotTable,
            Item: snapshot
        }));
        console.log(`[SNAPSHOT] Saved daily snapshot: ${snapshot.id}`);
        
        // Also save/update weekly aggregate
        await saveWeeklyAggregate(snapshot, weekKey);
        
        // If monthly run, also save monthly aggregate
        if (mode === 'DAILY + MONTHLY') {
            await saveMonthlyAggregate(snapshot, monthKey);
        }
        
        return snapshot;
    } catch (error) {
        console.error(`[SNAPSHOT] Error saving snapshot:`, error.message);
        // Don't fail the main process if snapshot fails
        return null;
    }
}

/**
 * Save/update weekly aggregate snapshot
 */
async function saveWeeklyAggregate(dailySnapshot, weekKey) {
    const snapshotTable = getTableName('PlayerActivitySnapshot');
    const weeklyId = `WEEKLY_${weekKey}`;
    
    try {
        // Get existing weekly snapshot
        let existing = null;
        try {
            const response = await ddbDocClient.send(new GetCommand({
                TableName: snapshotTable,
                Key: { id: weeklyId }
            }));
            existing = response.Item;
        } catch (e) {
            // Doesn't exist yet
        }
        
        const now = new Date().toISOString();
        
        if (existing) {
            // Update existing: just update the latest distributions and increment counters
            await ddbDocClient.send(new UpdateCommand({
                TableName: snapshotTable,
                Key: { id: weeklyId },
                UpdateExpression: `SET 
                    playerTargetingDistribution = :ptd,
                    playerVenueTargetingDistribution = :pvtd,
                    accountCategoryDistribution = if_not_exists(accountCategoryDistribution, :acd),
                    totalPlayers = :tp,
                    totalPlayerVenues = :tpv,
                    lastDailySnapshot = :lds,
                    dailySnapshotCount = dailySnapshotCount + :one,
                    updatedAt = :now,
                    #v = #v + :one`,
                ExpressionAttributeNames: { '#v': '_version' },
                ExpressionAttributeValues: {
                    ':ptd': dailySnapshot.playerTargetingDistribution,
                    ':pvtd': dailySnapshot.playerVenueTargetingDistribution,
                    ':acd': dailySnapshot.accountCategoryDistribution,
                    ':tp': dailySnapshot.totalPlayers,
                    ':tpv': dailySnapshot.totalPlayerVenues,
                    ':lds': dailySnapshot.dateKey,
                    ':one': 1,
                    ':now': now
                }
            }));
        } else {
            // Create new weekly aggregate
            const weeklySnapshot = {
                id: weeklyId,
                snapshotType: 'WEEKLY',
                snapshotDate: now,
                weekKey,
                monthKey: dailySnapshot.monthKey,
                
                // Latest distributions
                playerTargetingDistribution: dailySnapshot.playerTargetingDistribution,
                playerVenueTargetingDistribution: dailySnapshot.playerVenueTargetingDistribution,
                accountCategoryDistribution: dailySnapshot.accountCategoryDistribution,
                
                // Totals
                totalPlayers: dailySnapshot.totalPlayers,
                totalPlayerVenues: dailySnapshot.totalPlayerVenues,
                totalVIPs: dailySnapshot.totalVIPs,
                
                // Tracking
                firstDailySnapshot: dailySnapshot.dateKey,
                lastDailySnapshot: dailySnapshot.dateKey,
                dailySnapshotCount: 1,
                
                // Amplify fields
                createdAt: now,
                updatedAt: now,
                __typename: 'PlayerActivitySnapshot',
                _version: 1,
                _lastChangedAt: Date.now(),
                _deleted: null
            };
            
            await ddbDocClient.send(new PutCommand({
                TableName: snapshotTable,
                Item: weeklySnapshot
            }));
        }
        
        console.log(`[SNAPSHOT] Updated weekly aggregate: ${weeklyId}`);
    } catch (error) {
        console.warn(`[SNAPSHOT] Error updating weekly aggregate:`, error.message);
    }
}

/**
 * Save/update monthly aggregate snapshot
 */
async function saveMonthlyAggregate(dailySnapshot, monthKey) {
    const snapshotTable = getTableName('PlayerActivitySnapshot');
    const monthlyId = `MONTHLY_${monthKey}`;
    
    try {
        const now = new Date().toISOString();
        
        // For monthly, we want to capture the account category state
        const monthlySnapshot = {
            id: monthlyId,
            snapshotType: 'MONTHLY',
            snapshotDate: now,
            monthKey,
            
            // Account categories (primary focus for monthly)
            accountCategoryDistribution: dailySnapshot.accountCategoryDistribution,
            accountCategoryTransitions: dailySnapshot.accountCategoryTransitions,
            
            // Targeting (also captured)
            playerTargetingDistribution: dailySnapshot.playerTargetingDistribution,
            playerVenueTargetingDistribution: dailySnapshot.playerVenueTargetingDistribution,
            
            // Totals
            totalPlayers: dailySnapshot.totalPlayers,
            totalPlayerVenues: dailySnapshot.totalPlayerVenues,
            totalVIPs: dailySnapshot.totalVIPs,
            
            // VIP breakdown by entity
            vipStatsByEntity: dailySnapshot.vipStatsByEntity,
            
            // Updates made
            accountCategoryUpdated: dailySnapshot.accountCategoryUpdated,
            
            // Amplify fields
            createdAt: now,
            updatedAt: now,
            __typename: 'PlayerActivitySnapshot',
            _version: 1,
            _lastChangedAt: Date.now(),
            _deleted: null
        };
        
        await ddbDocClient.send(new PutCommand({
            TableName: snapshotTable,
            Item: monthlySnapshot
        }));
        
        console.log(`[SNAPSHOT] Saved monthly aggregate: ${monthlyId}`);
    } catch (error) {
        console.warn(`[SNAPSHOT] Error saving monthly aggregate:`, error.message);
    }
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[RefreshClassifications] Starting...');
    console.log('[RefreshClassifications] Event:', JSON.stringify(event, null, 2));
    
    const startTime = Date.now();
    const isScheduled = isEventBridgeTrigger(event);
    
    // Determine mode: DAILY (targeting) or MONTHLY (category)
    // Monthly runs on 1st of month OR when explicitly requested
    const now = new Date();
    const isFirstOfMonth = now.getUTCDate() === 1;
    const forceMonthly = event.mode === 'monthly' || event.includeAccountCategory === true;
    const runAccountCategory = isFirstOfMonth || forceMonthly;
    
    console.log(`[RefreshClassifications] Mode: ${runAccountCategory ? 'DAILY + MONTHLY' : 'DAILY only'}`);
    console.log(`[RefreshClassifications] Is first of month: ${isFirstOfMonth}, Force monthly: ${forceMonthly}`);
    
    try {
        const results = {
            targeting: {},
            category: null
        };
        
        // DAILY: Targeting Classification
        console.log('[RefreshClassifications] === DAILY: Targeting Classification ===');
        
        const playerTargetingTracker = new TransitionTracker('PlayerTargeting');
        const playerVenueTargetingTracker = new TransitionTracker('PlayerVenueTargeting');
        
        results.targeting.player = await processPlayerTargetingClassifications(playerTargetingTracker);
        results.targeting.playerVenue = await processPlayerVenueTargetingClassifications(playerVenueTargetingTracker);
        
        // MONTHLY: Account Category
        if (runAccountCategory) {
            console.log('[RefreshClassifications] === MONTHLY: Account Category ===');
            
            const categoryTracker = new TransitionTracker('AccountCategory');
            results.category = await processAccountCategories(categoryTracker);
        }
        
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        const durationSec = Math.round(durationMs / 1000);
        
        // Calculate totals
        const targetingErrors = results.targeting.player.totalErrors + results.targeting.playerVenue.totalErrors;
        const targetingUpdated = results.targeting.player.totalUpdated + results.targeting.playerVenue.totalUpdated;
        const categoryErrors = results.category?.totalErrors || 0;
        const categoryUpdated = results.category?.totalUpdated || 0;
        const totalErrors = targetingErrors + categoryErrors;
        const isSuccess = totalErrors === 0;
        
        console.log('[RefreshClassifications] Summary:', {
            targetingUpdated,
            categoryUpdated,
            totalErrors,
            durationSec
        });
        
        // Save activity snapshot for trending/analytics
        console.log('[RefreshClassifications] Saving activity snapshot...');
        const snapshot = await saveActivitySnapshot(
            results, 
            runAccountCategory ? 'DAILY + MONTHLY' : 'DAILY',
            durationMs
        );
        
        // Send SES notification
        if (isScheduled || targetingUpdated > 0 || categoryUpdated > 0 || totalErrors > 0) {
            let customBody = formatTargetingNotification(
                results.targeting.player, 
                results.targeting.playerVenue
            );
            
            if (results.category) {
                customBody += '\n\n' + formatCategoryNotification(results.category);
            }
            
            await sendNotification({
                lambdaName: 'refreshTargetingClassifications',
                status: isSuccess ? 'success' : 'failure',
                triggerSource: isScheduled ? 'EVENTBRIDGE' : 'MANUAL',
                durationMs,
                summary: {
                    mode: runAccountCategory ? 'DAILY + MONTHLY' : 'DAILY',
                    playerTargetingUpdated: results.targeting.player.totalUpdated,
                    playerVenueTargetingUpdated: results.targeting.playerVenue.totalUpdated,
                    accountCategoryUpdated: results.category?.totalUpdated || 'N/A',
                    totalVIPs: results.category?.totalVIPs || 'N/A',
                    totalErrors,
                    durationSeconds: durationSec
                },
                customBody,
                error: totalErrors > 0 ? `${totalErrors} records failed to update` : null
            });
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: isSuccess,
                message: 'Classification refresh complete',
                mode: runAccountCategory ? 'DAILY + MONTHLY' : 'DAILY',
                targeting: results.targeting,
                category: results.category,
                durationMs,
                totalErrors
            })
        };
        
    } catch (error) {
        console.error('[RefreshClassifications] CRITICAL ERROR:', error);
        
        await sendNotification({
            lambdaName: 'refreshTargetingClassifications',
            status: 'failure',
            triggerSource: isScheduled ? 'EVENTBRIDGE' : 'MANUAL',
            durationMs: Date.now() - startTime,
            error: error.message,
            summary: { error: error.message }
        });
        
        throw error;
    }
};