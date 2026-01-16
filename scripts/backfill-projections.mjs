#!/usr/bin/env node
/**
 * backfill-projections.mjs
 * 
 * Populates ActiveGame, UpcomingGame, and RecentlyFinishedGame tables
 * by scanning the Game table and creating missing projection records.
 * 
 * Run: node backfill-projections.mjs [--dry-run] [--entity-id ID]
 * 
 * Options:
 *   --dry-run     Show what would be done without making changes
 *   --entity-id   Only process games for a specific entity
 *   --limit       Maximum number of games to process (default: 1000)
 *   --verbose     Show detailed progress
 * 
 * Prerequisites:
 * - AWS credentials configured
 * - npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb uuid
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const CONFIG = {
    region: getArg('region') || process.env.AWS_REGION || 'ap-southeast-2',
    apiId: getArg('api-id') || process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ynuahifnznb5zddz727oiqnicy',
    env: getArg('env') || process.env.ENV || 'prod',
};

const ENTITY_ID = getArg('entity-id') || null;
const LIMIT = parseInt(getArg('limit') || '1000', 10);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

const getTableName = (modelName) => `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client);

// Status classifications
const ACTIVE_STATUSES = ['INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED'];
const UPCOMING_STATUSES = ['SCHEDULED'];
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_FOUND', 'NOT_PUBLISHED', 'UNKNOWN'];

// Thresholds
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const RECENTLY_FINISHED_TTL_DAYS = 7;

// Refresh intervals
const REFRESH_INTERVALS = {
    RUNNING: 15,
    CLOCK_STOPPED: 30,
    REGISTERING: 60,
    INITIATING: 120
};

// Stats
const stats = {
    gamesScanned: 0,
    activeCreated: 0,
    activeSkipped: 0,
    upcomingCreated: 0,
    upcomingSkipped: 0,
    recentlyFinishedCreated: 0,
    recentlyFinishedSkipped: 0,
    errors: 0
};

function isGameStale(game) {
    if (!game.gameStartDateTime) return false;
    const startTime = new Date(game.gameStartDateTime).getTime();
    return (Date.now() - startTime) > STALE_THRESHOLD_MS;
}

function isGameInFuture(game) {
    if (!game.gameStartDateTime) return false;
    return new Date(game.gameStartDateTime).getTime() > Date.now();
}

async function checkExists(tableName, gameId, indexName = null) {
    try {
        if (indexName) {
            const result = await docClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: indexName,
                KeyConditionExpression: 'gameId = :gameId',
                ExpressionAttributeValues: { ':gameId': gameId },
                Limit: 1
            }));
            return result.Items?.[0] || null;
        } else {
            const result = await docClient.send(new GetCommand({
                TableName: tableName,
                Key: { id: gameId }
            }));
            return result.Item || null;
        }
    } catch (error) {
        return null;
    }
}

async function fetchVenueDetails(venueId) {
    if (!venueId) return { name: null, logo: null };
    
    try {
        const result = await docClient.send(new GetCommand({
            TableName: getTableName('Venue'),
            Key: { id: venueId },
            ProjectionExpression: '#name, logo',
            ExpressionAttributeNames: { '#name': 'name' }
        }));
        
        return result.Item || { name: null, logo: null };
    } catch (error) {
        return { name: null, logo: null };
    }
}

async function createActiveGame(game) {
    const tableName = getTableName('ActiveGame');
    
    // Check if already exists
    const existing = await checkExists(tableName, game.id, 'byGameIdActive');
    if (existing) {
        if (VERBOSE) console.log(`   ⏭️  ActiveGame exists for ${game.id.slice(0, 8)}`);
        stats.activeSkipped++;
        return false;
    }
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const venue = await fetchVenueDetails(game.venueId);
    const refreshInterval = REFRESH_INTERVALS[game.gameStatus] || 60;
    
    const record = {
        id: game.id,
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId || null,
        tournamentId: game.tournamentId || null,
        gameStatus: game.gameStatus,
        registrationStatus: game.registrationStatus || null,
        name: game.name,
        venueName: venue.name || game.venueName || null,
        venueLogoCached: venue.logo || null,
        gameStartDateTime: game.gameStartDateTime,
        gameEndDateTime: game.gameEndDateTime || null,
        totalEntries: game.totalEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        playersRemaining: game.playersRemaining || null,
        buyIn: game.buyIn || null,
        prizepoolPaid: game.prizepoolPaid || null,
        prizepoolCalculated: game.prizepoolCalculated || null,
        guaranteeAmount: game.guaranteeAmount || null,
        hasGuarantee: game.hasGuarantee || false,
        gameType: game.gameType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        isMainEvent: game.isMainEvent || false,
        isSatellite: game.isSatellite || false,
        isRecurring: !!game.recurringGameId,
        recurringGameName: game.recurringGameName || null,
        sourceUrl: game.sourceUrl || null,
        refreshEnabled: true,
        refreshIntervalMinutes: refreshInterval,
        lastRefreshedAt: now,
        nextRefreshAt: new Date(timestamp + refreshInterval * 60 * 1000).toISOString(),
        refreshCount: 0,
        createdAt: now,
        updatedAt: now,
        activatedAt: now,
        activatedBy: 'BACKFILL',
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'ActiveGame'
    };
    
    if (!DRY_RUN) {
        await docClient.send(new PutCommand({
            TableName: tableName,
            Item: record
        }));
    }
    
    stats.activeCreated++;
    if (VERBOSE) console.log(`   ✅ Created ActiveGame for ${game.name?.slice(0, 30) || game.id.slice(0, 8)}`);
    return true;
}

async function createUpcomingGame(game) {
    const tableName = getTableName('UpcomingGame');
    
    const existing = await checkExists(tableName, game.id, 'byGameIdUpcoming');
    if (existing) {
        if (VERBOSE) console.log(`   ⏭️  UpcomingGame exists for ${game.id.slice(0, 8)}`);
        stats.upcomingSkipped++;
        return false;
    }
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const venue = await fetchVenueDetails(game.venueId);
    
    const record = {
        id: game.id,
        gameId: game.id,
        entityId: game.entityId,
        venueId: game.venueId || null,
        tournamentId: game.tournamentId || null,
        name: game.name,
        venueName: venue.name || game.venueName || null,
        venueLogoCached: venue.logo || null,
        gameStartDateTime: game.gameStartDateTime,
        scheduledToStartAt: game.gameStartDateTime,
        buyIn: game.buyIn || null,
        guaranteeAmount: game.guaranteeAmount || null,
        hasGuarantee: game.hasGuarantee || false,
        gameType: game.gameType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        isMainEvent: game.isMainEvent || false,
        isSatellite: game.isSatellite || false,
        isRecurring: !!game.recurringGameId,
        recurringGameName: game.recurringGameName || null,
        sourceUrl: game.sourceUrl || null,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'UpcomingGame'
    };
    
    if (!DRY_RUN) {
        await docClient.send(new PutCommand({
            TableName: tableName,
            Item: record
        }));
    }
    
    stats.upcomingCreated++;
    if (VERBOSE) console.log(`   ✅ Created UpcomingGame for ${game.name?.slice(0, 30) || game.id.slice(0, 8)}`);
    return true;
}

async function createRecentlyFinishedGame(game) {
    const tableName = getTableName('RecentlyFinishedGame');
    
    const existing = await checkExists(tableName, game.id);
    if (existing) {
        if (VERBOSE) console.log(`   ⏭️  RecentlyFinishedGame exists for ${game.id.slice(0, 8)}`);
        stats.recentlyFinishedSkipped++;
        return false;
    }
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const venue = await fetchVenueDetails(game.venueId);
    
    // Calculate TTL
    const gameStartMs = game.gameStartDateTime 
        ? new Date(game.gameStartDateTime).getTime() 
        : timestamp;
    const ttlTimestamp = Math.floor(gameStartMs / 1000) + (RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60);
    
    // Calculate duration
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
        name: game.name,
        venueName: venue.name || game.venueName || null,
        venueLogoCached: venue.logo || null,
        gameStartDateTime: game.gameStartDateTime,
        finishedAt: game.gameEndDateTime || now,
        totalDuration: totalDuration,
        totalEntries: game.totalEntries || 0,
        totalUniquePlayers: game.totalUniquePlayers || 0,
        prizepoolPaid: game.prizepoolPaid || null,
        prizepoolCalculated: game.prizepoolCalculated || null,
        buyIn: game.buyIn || 0,
        gameType: game.gameType || null,
        isSeries: game.isSeries || false,
        seriesName: game.seriesName || null,
        isMainEvent: game.isMainEvent || false,
        isSatellite: game.isSatellite || false,
        isRecurring: !!game.recurringGameId,
        recurringGameName: game.recurringGameName || null,
        sourceUrl: game.sourceUrl || null,
        ttl: ttlTimestamp,
        createdAt: now,
        updatedAt: now,
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'RecentlyFinishedGame'
    };
    
    if (!DRY_RUN) {
        await docClient.send(new PutCommand({
            TableName: tableName,
            Item: record
        }));
    }
    
    stats.recentlyFinishedCreated++;
    if (VERBOSE) console.log(`   ✅ Created RecentlyFinishedGame for ${game.name?.slice(0, 30) || game.id.slice(0, 8)}`);
    return true;
}

async function processGame(game) {
    const status = game.gameStatus;
    
    try {
        if (ACTIVE_STATUSES.includes(status)) {
            // Check if stale
            if (isGameStale(game)) {
                if (VERBOSE) console.log(`   ⏭️  Skipping stale game ${game.id.slice(0, 8)} (started >7 days ago)`);
                return;
            }
            await createActiveGame(game);
            
        } else if (UPCOMING_STATUSES.includes(status)) {
            if (isGameInFuture(game)) {
                await createUpcomingGame(game);
            } else {
                if (VERBOSE) console.log(`   ⏭️  Skipping SCHEDULED game ${game.id.slice(0, 8)} (start date in past)`);
            }
            
        } else if (FINISHED_STATUSES.includes(status)) {
            if (!isGameStale(game)) {
                await createRecentlyFinishedGame(game);
            } else {
                if (VERBOSE) console.log(`   ⏭️  Skipping old finished game ${game.id.slice(0, 8)} (>7 days ago)`);
            }
            
        } else if (INACTIVE_STATUSES.includes(status)) {
            if (VERBOSE) console.log(`   ⏭️  Skipping inactive game ${game.id.slice(0, 8)} (${status})`);
        }
        
    } catch (error) {
        console.error(`   ❌ Error processing game ${game.id}: ${error.message}`);
        stats.errors++;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Projection Tables Backfill Tool                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n🔧 Configuration:`);
    console.log(`   Environment: ${CONFIG.env}`);
    console.log(`   API ID: ${CONFIG.apiId}`);
    console.log(`   Region: ${CONFIG.region}`);
    console.log(`   Entity filter: ${ENTITY_ID || '(all entities)'}`);
    console.log(`   Limit: ${LIMIT} games`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ LIVE (will create records)'}`);
    
    if (!DRY_RUN) {
        console.log('\n⚠️  WARNING: This will create records in your DynamoDB tables!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Scan Game table
    console.log(`\n📥 Scanning Game table...`);
    
    const games = [];
    let lastKey = null;
    const tableName = getTableName('Game');
    
    do {
        const params = {
            TableName: tableName,
            Limit: Math.min(LIMIT - games.length, 100),
        };
        
        if (ENTITY_ID) {
            params.FilterExpression = 'entityId = :entityId';
            params.ExpressionAttributeValues = { ':entityId': ENTITY_ID };
        }
        
        if (lastKey) {
            params.ExclusiveStartKey = lastKey;
        }
        
        try {
            const result = await docClient.send(new ScanCommand(params));
            games.push(...(result.Items || []));
            lastKey = result.LastEvaluatedKey;
            
            process.stdout.write(`   Fetched ${games.length} games...\r`);
        } catch (error) {
            console.error(`\n❌ Error scanning: ${error.message}`);
            break;
        }
    } while (lastKey && games.length < LIMIT);
    
    console.log(`   ✅ Found ${games.length} games to process\n`);
    
    // Process games
    console.log(`🔄 Processing games...`);
    
    for (const game of games) {
        stats.gamesScanned++;
        await processGame(game);
        
        if (stats.gamesScanned % 50 === 0) {
            process.stdout.write(`   Processed ${stats.gamesScanned}/${games.length}...\r`);
        }
    }
    
    // Summary
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`📊 BACKFILL ${DRY_RUN ? 'PREVIEW' : 'RESULTS'}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`\n📈 Games scanned: ${stats.gamesScanned}`);
    console.log(`\n📋 ActiveGame:`);
    console.log(`   ✅ ${DRY_RUN ? 'Would create' : 'Created'}: ${stats.activeCreated}`);
    console.log(`   ⏭️  Already existed: ${stats.activeSkipped}`);
    console.log(`\n📋 UpcomingGame:`);
    console.log(`   ✅ ${DRY_RUN ? 'Would create' : 'Created'}: ${stats.upcomingCreated}`);
    console.log(`   ⏭️  Already existed: ${stats.upcomingSkipped}`);
    console.log(`\n📋 RecentlyFinishedGame:`);
    console.log(`   ✅ ${DRY_RUN ? 'Would create' : 'Created'}: ${stats.recentlyFinishedCreated}`);
    console.log(`   ⏭️  Already existed: ${stats.recentlyFinishedSkipped}`);
    
    if (stats.errors > 0) {
        console.log(`\n❌ Errors: ${stats.errors}`);
    }
    
    const totalCreated = stats.activeCreated + stats.upcomingCreated + stats.recentlyFinishedCreated;
    
    console.log(`\n${'═'.repeat(60)}`);
    if (DRY_RUN) {
        console.log(`🔍 DRY RUN complete. ${totalCreated} records would be created.`);
        console.log(`   Run without --dry-run to apply changes.`);
    } else {
        console.log(`✅ BACKFILL complete. ${totalCreated} records created.`);
    }
    console.log(`${'═'.repeat(60)}`);
    
    process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
