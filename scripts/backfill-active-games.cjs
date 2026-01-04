/**
 * ===================================================================
 * BACKFILL SCRIPT: Populate ActiveGame & RecentlyFinishedGame Tables
 * ===================================================================
 * 
 * PURPOSE:
 * One-time script to populate the ActiveGame and RecentlyFinishedGame
 * projection tables from existing Game records.
 * 
 * USAGE:
 * 1. Set environment variables (or update the CONFIG section below)
 * 2. Run: node backfill-active-games.js
 * 
 * OPTIONS:
 * --dry-run     Preview changes without writing to DynamoDB
 * --active-only Only backfill ActiveGame table
 * --finished-only Only backfill RecentlyFinishedGame table
 * 
 * EXAMPLES:
 * node backfill-active-games.js --dry-run
 * node backfill-active-games.js --active-only
 * node backfill-active-games.js
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// CONFIGURATION - Update these or set environment variables
// ===================================================================

const CONFIG = {
    region: process.env.AWS_REGION || 'ap-southeast-2',
    
    // Table names - update these to match your environment
    gameTableName: process.env.GAME_TABLE_NAME || 'Game-XXXXX-dev',
    activeGameTableName: process.env.ACTIVEGAME_TABLE_NAME || 'ActiveGame-XXXXX-dev',
    recentlyFinishedTableName: process.env.RECENTLYFINISHED_TABLE_NAME || 'RecentlyFinishedGame-XXXXX-dev',
    venueTableName: process.env.VENUE_TABLE_NAME || 'Venue-XXXXX-dev',
    entityTableName: process.env.ENTITY_TABLE_NAME || 'Entity-XXXXX-dev',
    
    // How many days back to look for finished games
    finishedGamesDays: 7,
    
    // Batch size for writes
    batchSize: 25,
    
    // Rate limiting delay between batches (ms)
    batchDelayMs: 100
};

// ===================================================================
// CONSTANTS
// ===================================================================

const ACTIVE_STATUSES = ['INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED'];
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];

const REFRESH_INTERVALS = {
    RUNNING: 15,
    CLOCK_STOPPED: 30,
    REGISTERING: 60,
    INITIATING: 120
};

const RECENTLY_FINISHED_TTL_DAYS = 7;

// ===================================================================
// INITIALIZE CLIENT
// ===================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true }
});

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scan entire table with pagination
 */
async function scanTable(tableName, filterExpression, expressionValues, expressionNames) {
    const items = [];
    let lastEvaluatedKey = null;
    
    do {
        const params = {
            TableName: tableName,
            Limit: 100
        };
        
        if (filterExpression) {
            params.FilterExpression = filterExpression;
            params.ExpressionAttributeValues = expressionValues;
        }
        
        if (expressionNames) {
            params.ExpressionAttributeNames = expressionNames;
        }
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await docClient.send(new ScanCommand(params));
        
        if (result.Items) {
            items.push(...result.Items);
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
        // Progress indicator
        process.stdout.write(`\r  Scanned ${items.length} items...`);
        
    } while (lastEvaluatedKey);
    
    console.log(`\r  Scanned ${items.length} items total`);
    return items;
}

/**
 * Get venue details for caching
 */
async function getVenue(venueId) {
    if (!venueId) return null;
    
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: CONFIG.venueTableName,
            KeyConditionExpression: 'id = :id',
            ExpressionAttributeValues: { ':id': venueId },
            Limit: 1
        }));
        return result.Items?.[0] || null;
    } catch (error) {
        console.warn(`  Warning: Could not fetch venue ${venueId}:`, error.message);
        return null;
    }
}

/**
 * Get entity details for caching
 */
async function getEntity(entityId) {
    if (!entityId) return null;
    
    try {
        const result = await docClient.send(new QueryCommand({
            TableName: CONFIG.entityTableName,
            KeyConditionExpression: 'id = :id',
            ExpressionAttributeValues: { ':id': entityId },
            Limit: 1
        }));
        return result.Items?.[0] || null;
    } catch (error) {
        console.warn(`  Warning: Could not fetch entity ${entityId}:`, error.message);
        return null;
    }
}

/**
 * Build ActiveGame record from Game record
 */
function buildActiveGameRecord(game, venue, entity) {
    const now = new Date().toISOString();
    const refreshInterval = REFRESH_INTERVALS[game.gameStatus] || 60;
    const nextRefreshAt = new Date(Date.now() + refreshInterval * 60 * 1000).toISOString();
    
    return {
        id: game.id,  // Use same ID as Game for easy correlation
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId,
        tournamentId: game.tournamentId,
        
        // Denormalized display fields
        name: game.name,
        venueName: venue?.name || game.venueName || null,
        venueLogoCached: venue?.logo || null,
        entityName: entity?.name || null,
        
        // Status fields
        gameStatus: game.gameStatus,
        previousStatus: null,
        statusChangedAt: now,
        registrationStatus: game.registrationStatus,
        
        // Timing
        gameStartDateTime: game.gameStartDateTime,
        gameEndDateTime: game.gameEndDateTime,
        
        // Live stats
        totalEntries: game.totalEntries || game.totalInitialEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        playersRemaining: game.playersRemaining || game.totalUniquePlayers || 0,
        
        // Financials
        buyIn: game.buyIn,
        prizepoolPaid: game.prizepoolPaid,
        prizepoolCalculated: game.prizepoolCalculated,
        guaranteeAmount: game.guaranteeAmount,
        hasGuarantee: game.hasGuarantee || false,
        hasOverlay: game.hasOverlay || false,
        
        // Classification
        gameType: game.gameType,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName,
        isMainEvent: game.isMainEvent || false,
        
        // Source tracking
        sourceUrl: game.sourceUrl,
        
        // Refresh management
        refreshIntervalMinutes: refreshInterval,
        lastRefreshedAt: game.updatedAt || now,
        nextRefreshAt: nextRefreshAt,
        refreshCount: 0,
        
        // Metadata
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'ActiveGame'
    };
}

/**
 * Build RecentlyFinishedGame record from Game record
 */
function buildRecentlyFinishedRecord(game, venue, entity) {
    const now = new Date().toISOString();
    const finishedAt = game.gameEndDateTime || game.gameStartDateTime || now;
    
    // Calculate TTL (7 days from game START date, since most games start/end same day)
    const gameStartDate = new Date(game.gameStartDateTime || now);
    const ttlDate = new Date(gameStartDate.getTime() + RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60 * 1000);
    const ttl = Math.floor(ttlDate.getTime() / 1000);
    
    // Calculate duration if we have start and end times
    let totalDuration = null;
    if (game.gameStartDateTime && game.gameEndDateTime) {
        const startMs = new Date(game.gameStartDateTime).getTime();
        const endMs = new Date(game.gameEndDateTime).getTime();
        const durationMs = endMs - startMs;
        
        if (durationMs > 0) {
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            totalDuration = `${hours}h ${minutes}m`;
        }
    }
    
    return {
        id: game.id,  // Use same ID as Game
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId,
        tournamentId: game.tournamentId,
        
        // Denormalized display fields
        name: game.name,
        venueName: venue?.name || game.venueName || null,
        venueLogoCached: venue?.logo || null,
        entityName: entity?.name || null,
        
        // Timing
        gameStartDateTime: game.gameStartDateTime,
        finishedAt: finishedAt,
        totalDuration: totalDuration,
        
        // Final stats
        totalEntries: game.totalEntries || game.totalInitialEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        
        // Financials
        buyIn: game.buyIn,
        prizepoolPaid: game.prizepoolPaid,
        prizepoolCalculated: game.prizepoolCalculated,
        
        // Classification
        gameType: game.gameType,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName,
        isMainEvent: game.isMainEvent || false,
        
        // Source
        sourceUrl: game.sourceUrl,
        
        // TTL for automatic cleanup
        ttl: ttl,
        
        // Metadata
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: Date.now(),
        __typename: 'RecentlyFinishedGame'
    };
}

/**
 * Write items in batches
 */
async function batchWriteItems(tableName, items, dryRun) {
    if (items.length === 0) return { success: 0, failed: 0 };
    
    if (dryRun) {
        console.log(`  [DRY RUN] Would write ${items.length} items to ${tableName}`);
        return { success: items.length, failed: 0 };
    }
    
    let success = 0;
    let failed = 0;
    
    // Process in batches of 25 (DynamoDB limit)
    for (let i = 0; i < items.length; i += CONFIG.batchSize) {
        const batch = items.slice(i, i + CONFIG.batchSize);
        
        const writeRequests = batch.map(item => ({
            PutRequest: { Item: item }
        }));
        
        try {
            const result = await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: writeRequests
                }
            }));
            
            // Handle unprocessed items
            const unprocessed = result.UnprocessedItems?.[tableName]?.length || 0;
            success += batch.length - unprocessed;
            failed += unprocessed;
            
            if (unprocessed > 0) {
                console.warn(`  Warning: ${unprocessed} items were not processed in batch`);
            }
            
        } catch (error) {
            console.error(`  Error writing batch:`, error.message);
            failed += batch.length;
        }
        
        // Progress
        process.stdout.write(`\r  Written ${Math.min(i + CONFIG.batchSize, items.length)}/${items.length} items...`);
        
        // Rate limiting
        if (i + CONFIG.batchSize < items.length) {
            await sleep(CONFIG.batchDelayMs);
        }
    }
    
    console.log(`\r  Written ${success} items, ${failed} failed`);
    return { success, failed };
}

// ===================================================================
// MAIN BACKFILL FUNCTIONS
// ===================================================================

/**
 * Backfill ActiveGame table from active games
 */
async function backfillActiveGames(dryRun) {
    console.log('\n📊 Backfilling ActiveGame table...');
    console.log(`  Looking for games with status: ${ACTIVE_STATUSES.join(', ')}`);
    
    // Build filter for active statuses
    const statusPlaceholders = ACTIVE_STATUSES.map((_, i) => `:status${i}`).join(', ');
    const expressionValues = {};
    ACTIVE_STATUSES.forEach((status, i) => {
        expressionValues[`:status${i}`] = status;
    });
    
    // Scan for active games
    console.log(`  Scanning ${CONFIG.gameTableName}...`);
    const activeGames = await scanTable(
        CONFIG.gameTableName,
        `gameStatus IN (${statusPlaceholders})`,
        expressionValues
    );
    
    console.log(`  Found ${activeGames.length} active games`);
    
    if (activeGames.length === 0) {
        console.log('  No active games to backfill');
        return { total: 0, success: 0, failed: 0 };
    }
    
    // Cache for venues and entities
    const venueCache = new Map();
    const entityCache = new Map();
    
    // Build ActiveGame records
    console.log('  Building ActiveGame records...');
    const activeGameRecords = [];
    
    for (const game of activeGames) {
        // Get cached venue or fetch
        let venue = venueCache.get(game.venueId);
        if (game.venueId && !venue && !venueCache.has(game.venueId)) {
            venue = await getVenue(game.venueId);
            venueCache.set(game.venueId, venue);
        }
        
        // Get cached entity or fetch
        let entity = entityCache.get(game.entityId);
        if (game.entityId && !entity && !entityCache.has(game.entityId)) {
            entity = await getEntity(game.entityId);
            entityCache.set(game.entityId, entity);
        }
        
        const record = buildActiveGameRecord(game, venue, entity);
        activeGameRecords.push(record);
    }
    
    // Write to ActiveGame table
    console.log(`  Writing to ${CONFIG.activeGameTableName}...`);
    const result = await batchWriteItems(CONFIG.activeGameTableName, activeGameRecords, dryRun);
    
    return { total: activeGames.length, ...result };
}

/**
 * Backfill RecentlyFinishedGame table from recently finished games
 */
async function backfillRecentlyFinished(dryRun) {
    console.log('\n📊 Backfilling RecentlyFinishedGame table...');
    console.log(`  Looking for games started in last ${CONFIG.finishedGamesDays} days (using gameStartDateTime)`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CONFIG.finishedGamesDays);
    const cutoffIso = cutoffDate.toISOString();
    
    // Build filter - use gameStartDateTime as it's more reliable than gameEndDateTime
    const statusPlaceholders = FINISHED_STATUSES.map((_, i) => `:fstatus${i}`).join(', ');
    const expressionValues = {
        ':cutoff': cutoffIso
    };
    FINISHED_STATUSES.forEach((status, i) => {
        expressionValues[`:fstatus${i}`] = status;
    });
    
    // Scan for finished games using gameStartDateTime
    console.log(`  Scanning ${CONFIG.gameTableName}...`);
    const finishedGames = await scanTable(
        CONFIG.gameTableName,
        `gameStatus IN (${statusPlaceholders}) AND gameStartDateTime >= :cutoff`,
        expressionValues
    );
    
    console.log(`  Found ${finishedGames.length} recently finished games`);
    
    if (finishedGames.length === 0) {
        console.log('  No recently finished games to backfill');
        return { total: 0, success: 0, failed: 0 };
    }
    
    // Cache for venues and entities
    const venueCache = new Map();
    const entityCache = new Map();
    
    // Build RecentlyFinishedGame records
    console.log('  Building RecentlyFinishedGame records...');
    const finishedRecords = [];
    
    for (const game of finishedGames) {
        // Get cached venue or fetch
        let venue = venueCache.get(game.venueId);
        if (game.venueId && !venue && !venueCache.has(game.venueId)) {
            venue = await getVenue(game.venueId);
            venueCache.set(game.venueId, venue);
        }
        
        // Get cached entity or fetch
        let entity = entityCache.get(game.entityId);
        if (game.entityId && !entity && !entityCache.has(game.entityId)) {
            entity = await getEntity(game.entityId);
            entityCache.set(game.entityId, entity);
        }
        
        const record = buildRecentlyFinishedRecord(game, venue, entity);
        finishedRecords.push(record);
    }
    
    // Write to RecentlyFinishedGame table
    console.log(`  Writing to ${CONFIG.recentlyFinishedTableName}...`);
    const result = await batchWriteItems(CONFIG.recentlyFinishedTableName, finishedRecords, dryRun);
    
    return { total: finishedGames.length, ...result };
}

// ===================================================================
// MAIN
// ===================================================================

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ActiveGame & RecentlyFinishedGame Backfill Script');
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const activeOnly = args.includes('--active-only');
    const finishedOnly = args.includes('--finished-only');
    
    if (dryRun) {
        console.log('\n🔍 DRY RUN MODE - No changes will be made');
    }
    
    console.log('\n📋 Configuration:');
    console.log(`  Region: ${CONFIG.region}`);
    console.log(`  Game Table: ${CONFIG.gameTableName}`);
    console.log(`  ActiveGame Table: ${CONFIG.activeGameTableName}`);
    console.log(`  RecentlyFinished Table: ${CONFIG.recentlyFinishedTableName}`);
    console.log(`  Finished Games Window: ${CONFIG.finishedGamesDays} days`);
    
    // Validate table names
    if (CONFIG.gameTableName.includes('XXXXX') || 
        CONFIG.activeGameTableName.includes('XXXXX') ||
        CONFIG.recentlyFinishedTableName.includes('XXXXX')) {
        console.error('\n❌ ERROR: Please update the table names in CONFIG or set environment variables');
        console.error('  Required: GAME_TABLE_NAME, ACTIVEGAME_TABLE_NAME, RECENTLYFINISHED_TABLE_NAME');
        process.exit(1);
    }
    
    const results = {
        activeGames: null,
        recentlyFinished: null
    };
    
    try {
        // Backfill ActiveGame table
        if (!finishedOnly) {
            results.activeGames = await backfillActiveGames(dryRun);
        }
        
        // Backfill RecentlyFinishedGame table
        if (!activeOnly) {
            results.recentlyFinished = await backfillRecentlyFinished(dryRun);
        }
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (results.activeGames) {
            console.log(`\n  ActiveGame:`);
            console.log(`    Total found: ${results.activeGames.total}`);
            console.log(`    Written: ${results.activeGames.success}`);
            console.log(`    Failed: ${results.activeGames.failed}`);
        }
        
        if (results.recentlyFinished) {
            console.log(`\n  RecentlyFinishedGame:`);
            console.log(`    Total found: ${results.recentlyFinished.total}`);
            console.log(`    Written: ${results.recentlyFinished.success}`);
            console.log(`    Failed: ${results.recentlyFinished.failed}`);
        }
        
        if (dryRun) {
            console.log('\n  🔍 This was a DRY RUN - no changes were made');
            console.log('  Run without --dry-run to apply changes');
        } else {
            console.log('\n  ✅ Backfill complete!');
        }
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run if executed directly
main();