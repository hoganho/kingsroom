#!/usr/bin/env node
/**
 * verify-table-sync.mjs
 * 
 * Checks if games in the Game table have corresponding records in 
 * ActiveGame, UpcomingGame, or RecentlyFinishedGame tables.
 * 
 * Run: node verify-table-sync.mjs [--entity-id YOUR_ENTITY_ID]
 * 
 * Prerequisites:
 * - AWS credentials configured
 * - npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

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

const ENTITY_ID = getArg('entity-id') || process.env.DEFAULT_ENTITY_ID;
const LIMIT = parseInt(getArg('limit') || '100', 10);
const VERBOSE = args.includes('--verbose') || args.includes('-v');

const getTableName = (modelName) => `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client);

// Status classifications (must match syncActiveGame.js)
const ACTIVE_STATUSES = ['INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED'];
const UPCOMING_STATUSES = ['SCHEDULED'];
const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_FOUND', 'NOT_PUBLISHED', 'UNKNOWN'];

// 7 days in milliseconds (stale threshold)
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

async function fetchGames(entityId, limit) {
    const games = [];
    let lastKey = null;
    
    const tableName = getTableName('Game');
    console.log(`\n📥 Fetching games from ${tableName}...`);
    
    do {
        const params = {
            TableName: tableName,
            Limit: Math.min(limit - games.length, 100),
        };
        
        if (entityId) {
            params.FilterExpression = 'entityId = :entityId';
            params.ExpressionAttributeValues = { ':entityId': entityId };
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
            console.error(`\n❌ Error scanning Game table: ${error.message}`);
            break;
        }
    } while (lastKey && games.length < limit);
    
    console.log(`   ✅ Fetched ${games.length} games total`);
    return games;
}

async function checkActiveGame(gameId) {
    try {
        // Try direct get first (if ID matches)
        const directResult = await docClient.send(new GetCommand({
            TableName: getTableName('ActiveGame'),
            Key: { id: gameId }
        }));
        
        if (directResult.Item) return directResult.Item;
        
        // Try GSI query
        const queryResult = await docClient.send(new QueryCommand({
            TableName: getTableName('ActiveGame'),
            IndexName: 'byGameIdActive',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId },
            Limit: 1
        }));
        
        return queryResult.Items?.[0] || null;
    } catch (error) {
        if (VERBOSE) console.log(`   ⚠️ Error checking ActiveGame: ${error.message}`);
        return null;
    }
}

async function checkUpcomingGame(gameId) {
    try {
        const directResult = await docClient.send(new GetCommand({
            TableName: getTableName('UpcomingGame'),
            Key: { id: gameId }
        }));
        
        if (directResult.Item) return directResult.Item;
        
        const queryResult = await docClient.send(new QueryCommand({
            TableName: getTableName('UpcomingGame'),
            IndexName: 'byGameIdUpcoming',
            KeyConditionExpression: 'gameId = :gameId',
            ExpressionAttributeValues: { ':gameId': gameId },
            Limit: 1
        }));
        
        return queryResult.Items?.[0] || null;
    } catch (error) {
        if (VERBOSE) console.log(`   ⚠️ Error checking UpcomingGame: ${error.message}`);
        return null;
    }
}

async function checkRecentlyFinishedGame(gameId) {
    try {
        const result = await docClient.send(new GetCommand({
            TableName: getTableName('RecentlyFinishedGame'),
            Key: { id: gameId }
        }));
        
        return result.Item || null;
    } catch (error) {
        if (VERBOSE) console.log(`   ⚠️ Error checking RecentlyFinishedGame: ${error.message}`);
        return null;
    }
}

function isGameStale(game) {
    if (!game.gameStartDateTime) return false;
    const startTime = new Date(game.gameStartDateTime).getTime();
    return (Date.now() - startTime) > STALE_THRESHOLD_MS;
}

function isGameScheduledInFuture(game) {
    if (!game.gameStartDateTime) return false;
    return new Date(game.gameStartDateTime).getTime() > Date.now();
}

async function analyzeGame(game) {
    const status = game.gameStatus;
    const gameId = game.id;
    
    const result = {
        gameId,
        tournamentId: game.tournamentId,
        name: game.name?.substring(0, 40),
        status,
        startDateTime: game.gameStartDateTime,
        expected: null,
        actual: null,
        synced: false,
        issue: null
    };
    
    // Determine expected location
    if (ACTIVE_STATUSES.includes(status)) {
        result.expected = 'ActiveGame';
        
        // Check for stale games
        if (isGameStale(game)) {
            result.expected = 'STALE (should be removed)';
        }
    } else if (UPCOMING_STATUSES.includes(status)) {
        if (isGameScheduledInFuture(game)) {
            result.expected = 'UpcomingGame';
        } else {
            result.expected = 'None (SCHEDULED but past start)';
        }
    } else if (FINISHED_STATUSES.includes(status)) {
        if (!isGameStale(game)) {
            result.expected = 'RecentlyFinishedGame';
        } else {
            result.expected = 'None (finished >7 days ago)';
        }
    } else if (INACTIVE_STATUSES.includes(status)) {
        result.expected = 'None (inactive status)';
    } else {
        result.expected = 'Unknown status';
    }
    
    // Check actual location
    const [activeGame, upcomingGame, recentlyFinished] = await Promise.all([
        checkActiveGame(gameId),
        checkUpcomingGame(gameId),
        checkRecentlyFinishedGame(gameId)
    ]);
    
    const locations = [];
    if (activeGame) locations.push('ActiveGame');
    if (upcomingGame) locations.push('UpcomingGame');
    if (recentlyFinished) locations.push('RecentlyFinishedGame');
    
    result.actual = locations.length > 0 ? locations.join(', ') : 'None';
    
    // Determine if synced correctly
    if (result.expected === 'ActiveGame') {
        result.synced = !!activeGame;
        if (!result.synced) result.issue = 'MISSING from ActiveGame';
    } else if (result.expected === 'UpcomingGame') {
        result.synced = !!upcomingGame;
        if (!result.synced) result.issue = 'MISSING from UpcomingGame';
    } else if (result.expected === 'RecentlyFinishedGame') {
        result.synced = !!recentlyFinished;
        if (!result.synced) result.issue = 'MISSING from RecentlyFinishedGame';
    } else if (result.expected.startsWith('None') || result.expected === 'STALE (should be removed)') {
        // Should NOT be in any projection table
        result.synced = locations.length === 0;
        if (!result.synced) result.issue = `ORPHANED in ${result.actual}`;
    } else {
        result.synced = true; // Unknown - assume OK
    }
    
    return result;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Table Synchronization Verification Tool            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n🔧 Configuration:`);
    console.log(`   Environment: ${CONFIG.env}`);
    console.log(`   API ID: ${CONFIG.apiId}`);
    console.log(`   Region: ${CONFIG.region}`);
    console.log(`   Entity ID: ${ENTITY_ID || '(all entities)'}`);
    console.log(`   Limit: ${LIMIT} games`);
    
    // Fetch games
    const games = await fetchGames(ENTITY_ID, LIMIT);
    
    if (games.length === 0) {
        console.log('\n❌ No games found to analyze');
        process.exit(0);
    }
    
    // Analyze each game
    console.log(`\n🔍 Analyzing ${games.length} games...\n`);
    
    const results = {
        total: games.length,
        synced: 0,
        missingFromActive: [],
        missingFromUpcoming: [],
        missingFromRecentlyFinished: [],
        orphaned: [],
        stale: [],
        byStatus: {}
    };
    
    let processed = 0;
    for (const game of games) {
        const analysis = await analyzeGame(game);
        processed++;
        
        process.stdout.write(`   Analyzed ${processed}/${games.length} games...\r`);
        
        // Track by status
        if (!results.byStatus[analysis.status]) {
            results.byStatus[analysis.status] = { total: 0, synced: 0, issues: [] };
        }
        results.byStatus[analysis.status].total++;
        
        if (analysis.synced) {
            results.synced++;
            results.byStatus[analysis.status].synced++;
        } else {
            results.byStatus[analysis.status].issues.push(analysis);
            
            if (analysis.issue?.includes('MISSING from ActiveGame')) {
                results.missingFromActive.push(analysis);
            } else if (analysis.issue?.includes('MISSING from UpcomingGame')) {
                results.missingFromUpcoming.push(analysis);
            } else if (analysis.issue?.includes('MISSING from RecentlyFinishedGame')) {
                results.missingFromRecentlyFinished.push(analysis);
            } else if (analysis.issue?.includes('ORPHANED')) {
                results.orphaned.push(analysis);
            }
        }
    }
    
    // Print results
    console.log(`\n\n${'═'.repeat(70)}`);
    console.log('📊 RESULTS SUMMARY');
    console.log(`${'═'.repeat(70)}`);
    
    const syncRate = ((results.synced / results.total) * 100).toFixed(1);
    console.log(`\n✅ Synced: ${results.synced}/${results.total} (${syncRate}%)`);
    
    // By status breakdown
    console.log(`\n📈 By Game Status:`);
    for (const [status, data] of Object.entries(results.byStatus)) {
        const statusSyncRate = data.total > 0 ? ((data.synced / data.total) * 100).toFixed(0) : 100;
        const icon = data.issues.length === 0 ? '✅' : '⚠️';
        console.log(`   ${icon} ${status}: ${data.synced}/${data.total} synced (${statusSyncRate}%)`);
    }
    
    // Issues breakdown
    const totalIssues = results.missingFromActive.length + 
                        results.missingFromUpcoming.length + 
                        results.missingFromRecentlyFinished.length + 
                        results.orphaned.length;
    
    if (totalIssues > 0) {
        console.log(`\n${'═'.repeat(70)}`);
        console.log('⚠️  SYNC ISSUES FOUND');
        console.log(`${'═'.repeat(70)}`);
        
        if (results.missingFromActive.length > 0) {
            console.log(`\n❌ Missing from ActiveGame (${results.missingFromActive.length}):`);
            results.missingFromActive.slice(0, 10).forEach(g => {
                console.log(`   - [${g.status}] ${g.name || 'Unnamed'} (ID: ${g.gameId.slice(0, 8)}...)`);
            });
            if (results.missingFromActive.length > 10) {
                console.log(`   ... and ${results.missingFromActive.length - 10} more`);
            }
        }
        
        if (results.missingFromUpcoming.length > 0) {
            console.log(`\n❌ Missing from UpcomingGame (${results.missingFromUpcoming.length}):`);
            results.missingFromUpcoming.slice(0, 10).forEach(g => {
                console.log(`   - [${g.status}] ${g.name || 'Unnamed'} (ID: ${g.gameId.slice(0, 8)}...)`);
            });
            if (results.missingFromUpcoming.length > 10) {
                console.log(`   ... and ${results.missingFromUpcoming.length - 10} more`);
            }
        }
        
        if (results.missingFromRecentlyFinished.length > 0) {
            console.log(`\n❌ Missing from RecentlyFinishedGame (${results.missingFromRecentlyFinished.length}):`);
            results.missingFromRecentlyFinished.slice(0, 10).forEach(g => {
                console.log(`   - [${g.status}] ${g.name || 'Unnamed'} (ID: ${g.gameId.slice(0, 8)}...)`);
            });
            if (results.missingFromRecentlyFinished.length > 10) {
                console.log(`   ... and ${results.missingFromRecentlyFinished.length - 10} more`);
            }
        }
        
        if (results.orphaned.length > 0) {
            console.log(`\n⚠️  Orphaned records (${results.orphaned.length}):`);
            results.orphaned.slice(0, 10).forEach(g => {
                console.log(`   - [${g.status}] ${g.name || 'Unnamed'} in ${g.actual} (ID: ${g.gameId.slice(0, 8)}...)`);
            });
            if (results.orphaned.length > 10) {
                console.log(`   ... and ${results.orphaned.length - 10} more`);
            }
        }
        
        console.log(`\n${'═'.repeat(70)}`);
        console.log('💡 RECOMMENDATIONS');
        console.log(`${'═'.repeat(70)}`);
        
        if (results.missingFromActive.length > 0 || results.missingFromUpcoming.length > 0 || results.missingFromRecentlyFinished.length > 0) {
            console.log(`\n1. Run the backfill script to populate missing projection records:`);
            console.log(`   node backfill-projections.mjs`);
        }
        
        if (results.orphaned.length > 0) {
            console.log(`\n2. Orphaned records can be cleaned up by:`);
            console.log(`   - Re-scraping the affected games (will trigger proper sync)`);
            console.log(`   - Or run: node cleanup-orphans.mjs`);
        }
        
        process.exit(1);
    } else {
        console.log(`\n${'═'.repeat(70)}`);
        console.log('✅ ALL GAMES ARE PROPERLY SYNCED');
        console.log(`${'═'.repeat(70)}`);
        process.exit(0);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
