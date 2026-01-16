#!/usr/bin/env node
/**
 * ===================================================================
 * Backfill Script: Populate Projection Tables from Game Table
 * ===================================================================
 * 
 * VERSION: 1.0.0
 * 
 * This script reads from the Game table and populates the projection tables
 * (ActiveGame, UpcomingGame, RecentlyFinishedGame) based on game status and dates.
 * 
 * PROJECTION TABLE RULES:
 * - ActiveGame: RUNNING, REGISTERING, CLOCK_STOPPED, INITIATING games
 *               (that started within last 7 days - older ones are "stale")
 * - UpcomingGame: SCHEDULED games with future gameStartDateTime
 * - RecentlyFinishedGame: FINISHED/COMPLETED games from last 7 days
 * 
 * Usage:
 *   node backfill-projection-from-games.mjs --preview
 *   node backfill-projection-from-games.mjs --execute
 *   node backfill-projection-from-games.mjs --execute --entity-id <id>
 *   node backfill-projection-from-games.mjs --execute --table ActiveGame
 *   node backfill-projection-from-games.mjs --execute --cleanup  # Also remove orphaned records
 * 
 * Options:
 *   --preview, -p              Preview changes without executing (default)
 *   --execute, -e              Execute the migration
 *   --table <name>             Only process specific table (ActiveGame, UpcomingGame, RecentlyFinishedGame)
 *   --entity-id <id>           Filter by entity ID
 *   --limit <n>                Limit number of games to process
 *   --batch-size <n>           Batch size for writes (default: 25)
 *   --cleanup                  Also remove orphaned projection records
 *   --dry-run-cleanup          Preview cleanup without executing
 *   --help, -h                 Show this help message
 * 
 * ===================================================================
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ht3nugt6lvddpeeuwj3x6mkite',
  env: process.env.ENV || 'dev',
};

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;
};

// ============================================================================
// STATUS CLASSIFICATIONS
// ============================================================================

// Statuses that should have an ActiveGame record
const ACTIVE_STATUSES = ['INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED'];

// Statuses that should have an UpcomingGame record (if future start date)
const UPCOMING_STATUSES = ['SCHEDULED'];

// Statuses that should have a RecentlyFinishedGame record
const FINISHED_STATUSES = ['FINISHED'];

// Statuses that should NOT be in any projection table
const INACTIVE_STATUSES = ['CANCELLED', 'NOT_FOUND', 'NOT_PUBLISHED', 'UNKNOWN'];

// Maximum age for various categories
const STALE_GAME_THRESHOLD_DAYS = 7;
const RECENTLY_FINISHED_TTL_DAYS = 7;

// Refresh intervals by status (in minutes) - for ActiveGame
const REFRESH_INTERVALS = {
  RUNNING: 15,
  CLOCK_STOPPED: 30,
  REGISTERING: 60,
  INITIATING: 120,
};

// ============================================================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================================================

const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  table: null,
  entityId: null,
  limit: null,
  batchSize: 25,
  cleanup: false,
  dryRunCleanup: false,
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '--preview':
    case '-p':
      options.preview = true;
      options.execute = false;
      break;
    case '--execute':
    case '-e':
      options.execute = true;
      options.preview = false;
      break;
    case '--table':
      options.table = args[++i];
      break;
    case '--entity-id':
      options.entityId = args[++i];
      break;
    case '--limit':
      options.limit = parseInt(args[++i], 10);
      break;
    case '--batch-size':
      options.batchSize = parseInt(args[++i], 10);
      break;
    case '--cleanup':
      options.cleanup = true;
      break;
    case '--dry-run-cleanup':
      options.dryRunCleanup = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Backfill Script: Populate Projection Tables from Game Table

Usage:
  node backfill-projection-from-games.mjs [options]

Options:
  --preview, -p              Preview changes without executing (default)
  --execute, -e              Execute the migration
  --table <name>             Only process specific table (ActiveGame, UpcomingGame, RecentlyFinishedGame)
  --entity-id <id>           Filter by entity ID
  --limit <n>                Limit number of games to process
  --batch-size <n>           Batch size for writes (default: 25)
  --cleanup                  Also remove orphaned projection records
  --dry-run-cleanup          Preview cleanup without executing
  --help, -h                 Show this help message
      `);
      process.exit(0);
  }
}

// Validate table option
const VALID_TABLES = ['ActiveGame', 'UpcomingGame', 'RecentlyFinishedGame'];
if (options.table && !VALID_TABLES.includes(options.table)) {
  console.error(`Invalid table: ${options.table}. Must be one of: ${VALID_TABLES.join(', ')}`);
  process.exit(1);
}

// ============================================================================
// AWS CLIENT SETUP
// ============================================================================

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate number of days since a date
 */
function daysSince(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return null;
  const now = Date.now();
  const diffMs = now - date.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Check if a date is in the future
 */
function isInFuture(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date.getTime() > Date.now();
}

// ============================================================================
// CACHES
// ============================================================================

const venueCache = new Map();

async function getVenue(venueId) {
  if (!venueId) return null;
  
  if (venueCache.has(venueId)) {
    return venueCache.get(venueId);
  }
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: getTableName('Venue'),
      Key: { id: venueId },
      ProjectionExpression: '#name, logo',
      ExpressionAttributeNames: { '#name': 'name' },
    }));
    
    const venue = result.Item || null;
    venueCache.set(venueId, venue);
    return venue;
  } catch (err) {
    console.warn(`   Error fetching venue ${venueId}: ${err.message}`);
    venueCache.set(venueId, null);
    return null;
  }
}

// ============================================================================
// SCAN FUNCTIONS
// ============================================================================

/**
 * Scan all games from Game table
 */
async function scanGames() {
  const games = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeValues = {};
  
  if (options.entityId) {
    filterExpressions.push('entityId = :entityId');
    expressionAttributeValues[':entityId'] = options.entityId;
  }

  console.log('📊 Scanning Game table...');
  
  do {
    const params = {
      TableName: getTableName('Game'),
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    const result = await docClient.send(new ScanCommand(params));
    games.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    process.stdout.write(`\r   Found ${games.length} games...`);
    
    // Check limit
    if (options.limit && games.length >= options.limit) {
      console.log('');
      return games.slice(0, options.limit);
    }
    
    await sleep(100);
  } while (lastEvaluatedKey);

  console.log('');
  return games;
}

/**
 * Scan projection table to find existing records
 */
async function scanProjectionTable(tableName) {
  const records = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeValues = {};
  
  if (options.entityId) {
    filterExpressions.push('entityId = :entityId');
    expressionAttributeValues[':entityId'] = options.entityId;
  }

  do {
    const params = {
      TableName: getTableName(tableName),
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    const result = await docClient.send(new ScanCommand(params));
    records.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    await sleep(100);
  } while (lastEvaluatedKey);

  return records;
}

// ============================================================================
// RECORD BUILDERS
// ============================================================================

/**
 * Build an ActiveGame record from a Game
 */
async function buildActiveGameRecord(game) {
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  // Get venue details
  let venueName = game.venueName || null;
  let venueLogoCached = null;
  
  if (game.venueId) {
    const venue = await getVenue(game.venueId);
    if (venue) {
      venueName = venue.name || venueName;
      venueLogoCached = venue.logo || null;
    }
  }
  
  const refreshInterval = REFRESH_INTERVALS[game.gameStatus] || 60;
  const nextRefreshAt = new Date(timestamp + refreshInterval * 60 * 1000).toISOString();
  
  // Calculate hasOverlay flag
  const hasOverlay = game.hasGuarantee && 
    game.guaranteeAmount > 0 && 
    (game.prizepoolPaid || game.prizepoolCalculated || 0) < game.guaranteeAmount;
  
  return {
    id: game.id,
    gameId: game.id,
    entityId: game.entityId,
    venueId: game.venueId || null,
    tournamentId: game.tournamentId || null,
    
    gameStatus: game.gameStatus,
    registrationStatus: game.registrationStatus || null,
    previousStatus: null,
    statusChangedAt: now,
    
    name: game.name,
    venueName,
    venueLogoCached,
    entityName: game.entityName || null,
    
    gameStartDateTime: game.gameStartDateTime,
    gameEndDateTime: game.gameEndDateTime || null,
    
    totalEntries: game.totalEntries || 0,
    totalUniquePlayers: game.totalUniquePlayers || 0,
    playersRemaining: game.playersRemaining || null,
    totalChipsInPlay: game.totalChipsInPlay || null,
    averagePlayerStack: game.averagePlayerStack || null,
    buyIn: game.buyIn || null,
    prizepoolPaid: game.prizepoolPaid || null,
    prizepoolCalculated: game.prizepoolCalculated || null,
    guaranteeAmount: game.guaranteeAmount || null,
    hasGuarantee: game.hasGuarantee || false,
    
    gameType: game.gameType || null,
    gameVariant: game.gameVariant || null,
    tournamentType: game.tournamentType || null,
    isSeries: game.isSeries || false,
    seriesName: game.seriesName || null,
    
    isSatellite: game.isSatellite || false,
    isRecurring: !!game.recurringGameId,
    recurringGameName: game.recurringGameName || null,
    
    sourceUrl: game.sourceUrl || null,
    
    refreshEnabled: true,
    refreshIntervalMinutes: refreshInterval,
    lastRefreshedAt: now,
    nextRefreshAt,
    refreshCount: 0,
    consecutiveRefreshFailures: 0,
    lastRefreshError: null,
    
    isPriority: false,
    hasOverlay,
    isMainEvent: game.isMainEvent || false,
    
    createdAt: now,
    updatedAt: now,
    activatedAt: now,
    activatedBy: 'BACKFILL_SCRIPT',
    
    _version: 1,
    _lastChangedAt: timestamp,
    __typename: 'ActiveGame',
  };
}

/**
 * Build an UpcomingGame record from a Game
 */
async function buildUpcomingGameRecord(game) {
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  // Get venue details
  let venueName = game.venueName || null;
  let venueLogoCached = null;
  
  if (game.venueId) {
    const venue = await getVenue(game.venueId);
    if (venue) {
      venueName = venue.name || venueName;
      venueLogoCached = venue.logo || null;
    }
  }
  
  return {
    id: game.id,
    gameId: game.id,
    entityId: game.entityId,
    venueId: game.venueId || null,
    tournamentId: game.tournamentId || null,
    
    name: game.name,
    venueName,
    venueLogoCached,
    entityName: game.entityName || null,
    
    gameStartDateTime: game.gameStartDateTime,
    scheduledToStartAt: game.gameStartDateTime,
    
    buyIn: game.buyIn || null,
    guaranteeAmount: game.guaranteeAmount || null,
    hasGuarantee: game.hasGuarantee || false,
    
    gameType: game.gameType || null,
    gameVariant: game.gameVariant || null,
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
    __typename: 'UpcomingGame',
  };
}

/**
 * Build a RecentlyFinishedGame record from a Game
 */
async function buildRecentlyFinishedGameRecord(game) {
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  // Get venue details
  let venueName = game.venueName || null;
  let venueLogoCached = null;
  
  if (game.venueId) {
    const venue = await getVenue(game.venueId);
    if (venue) {
      venueName = venue.name || venueName;
      venueLogoCached = venue.logo || null;
    }
  }
  
  // Calculate TTL (7 days from game START date)
  const gameStartMs = game.gameStartDateTime 
    ? new Date(game.gameStartDateTime).getTime() 
    : timestamp;
  const ttlTimestamp = Math.floor(gameStartMs / 1000) + (RECENTLY_FINISHED_TTL_DAYS * 24 * 60 * 60);
  
  // Calculate duration
  let totalDuration = null;
  if (game.gameStartDateTime && game.gameEndDateTime) {
    const start = new Date(game.gameStartDateTime).getTime();
    const end = new Date(game.gameEndDateTime).getTime();
    const durationMs = end - start;
    totalDuration = Math.floor(durationMs / 1000);
  }
  
  return {
    id: game.id,
    gameId: game.id,
    entityId: game.entityId,
    venueId: game.venueId || null,
    tournamentId: game.tournamentId || null,
    
    name: game.name,
    venueName,
    venueLogoCached,
    entityName: game.entityName || null,
    
    gameStartDateTime: game.gameStartDateTime,
    finishedAt: game.gameEndDateTime || now,
    totalDuration,
    
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
    __typename: 'RecentlyFinishedGame',
  };
}

// ============================================================================
// CLASSIFICATION LOGIC
// ============================================================================

/**
 * Determine which projection table(s) a game should be in
 */
function classifyGame(game) {
  const result = {
    activeGame: false,
    upcomingGame: false,
    recentlyFinishedGame: false,
    skip: false,
    skipReason: null,
  };
  
  const status = game.gameStatus;
  
  // Inactive statuses - should not be in any projection table
  if (INACTIVE_STATUSES.includes(status)) {
    result.skip = true;
    result.skipReason = `Status ${status} is inactive`;
    return result;
  }
  
  // Active statuses -> ActiveGame
  if (ACTIVE_STATUSES.includes(status)) {
    // Check if game is stale (started >7 days ago)
    const daysOld = daysSince(game.gameStartDateTime);
    if (daysOld !== null && daysOld > STALE_GAME_THRESHOLD_DAYS) {
      result.skip = true;
      result.skipReason = `Game started ${Math.floor(daysOld)} days ago (stale)`;
      return result;
    }
    
    result.activeGame = true;
    return result;
  }
  
  // Scheduled statuses -> UpcomingGame (if future) or skip
  if (UPCOMING_STATUSES.includes(status)) {
    if (isInFuture(game.gameStartDateTime)) {
      result.upcomingGame = true;
    } else {
      result.skip = true;
      result.skipReason = `SCHEDULED but start date in past`;
    }
    return result;
  }
  
  // Finished statuses -> RecentlyFinishedGame (if within 7 days)
  if (FINISHED_STATUSES.includes(status)) {
    const daysOld = daysSince(game.gameStartDateTime);
    if (daysOld !== null && daysOld > RECENTLY_FINISHED_TTL_DAYS) {
      result.skip = true;
      result.skipReason = `Game started ${Math.floor(daysOld)} days ago (too old for RecentlyFinished)`;
      return result;
    }
    
    result.recentlyFinishedGame = true;
    return result;
  }
  
  // Unknown status
  result.skip = true;
  result.skipReason = `Unknown status: ${status}`;
  return result;
}

// ============================================================================
// MAIN BACKFILL LOGIC
// ============================================================================

async function runBackfill() {
  console.log('\n' + '='.repeat(70));
  console.log('BACKFILL: Populate Projection Tables from Game Table');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Environment: ${CONFIG.env}`);
  console.log(`API ID: ${CONFIG.apiId}`);
  console.log(`Tables: ${options.table || 'All (ActiveGame, UpcomingGame, RecentlyFinishedGame)'}`);
  console.log(`Filters:`);
  if (options.entityId) console.log(`  - Entity ID: ${options.entityId}`);
  if (options.limit) console.log(`  - Limit: ${options.limit}`);
  if (options.cleanup) console.log(`  - Cleanup orphaned records: YES`);
  console.log('='.repeat(70));

  // Confirmation for execute mode
  if (options.execute) {
    const confirm = await prompt('⚠️  You are about to WRITE to projection tables. Type "yes" to continue: ');
    if (confirm !== 'yes') {
      console.log('Backfill cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  // Step 1: Scan all games
  const games = await scanGames();
  console.log(`\n📊 Found ${games.length} games to process`);

  // Step 2: Classify and build records
  const results = {
    activeGame: { toCreate: [], toUpdate: [], skipped: 0, errors: 0 },
    upcomingGame: { toCreate: [], toUpdate: [], skipped: 0, errors: 0 },
    recentlyFinishedGame: { toCreate: [], toUpdate: [], skipped: 0, errors: 0 },
    skipped: [],
  };

  // Get existing records for comparison
  const existingActiveGames = new Map();
  const existingUpcomingGames = new Map();
  const existingRecentlyFinished = new Map();
  
  if (!options.table || options.table === 'ActiveGame') {
    console.log('\n📊 Scanning existing ActiveGame records...');
    const existing = await scanProjectionTable('ActiveGame');
    existing.forEach(r => existingActiveGames.set(r.gameId, r));
    console.log(`   Found ${existing.length} existing ActiveGame records`);
  }
  
  if (!options.table || options.table === 'UpcomingGame') {
    console.log('📊 Scanning existing UpcomingGame records...');
    const existing = await scanProjectionTable('UpcomingGame');
    existing.forEach(r => existingUpcomingGames.set(r.gameId, r));
    console.log(`   Found ${existing.length} existing UpcomingGame records`);
  }
  
  if (!options.table || options.table === 'RecentlyFinishedGame') {
    console.log('📊 Scanning existing RecentlyFinishedGame records...');
    const existing = await scanProjectionTable('RecentlyFinishedGame');
    existing.forEach(r => existingRecentlyFinished.set(r.gameId, r));
    console.log(`   Found ${existing.length} existing RecentlyFinishedGame records`);
  }

  // Process each game
  console.log('\n🔄 Classifying games...');
  let processedCount = 0;
  
  for (const game of games) {
    processedCount++;
    if (processedCount % 100 === 0) {
      process.stdout.write(`\r   Processed ${processedCount}/${games.length}...`);
    }
    
    const classification = classifyGame(game);
    
    if (classification.skip) {
      results.skipped.push({
        id: game.id,
        name: game.name?.substring(0, 40),
        status: game.gameStatus,
        reason: classification.skipReason,
      });
      continue;
    }
    
    // ActiveGame
    if (classification.activeGame && (!options.table || options.table === 'ActiveGame')) {
      const existing = existingActiveGames.get(game.id);
      if (!existing) {
        results.activeGame.toCreate.push(game);
      } else {
        results.activeGame.toUpdate.push(game);
      }
    }
    
    // UpcomingGame
    if (classification.upcomingGame && (!options.table || options.table === 'UpcomingGame')) {
      const existing = existingUpcomingGames.get(game.id);
      if (!existing) {
        results.upcomingGame.toCreate.push(game);
      } else {
        results.upcomingGame.toUpdate.push(game);
      }
    }
    
    // RecentlyFinishedGame
    if (classification.recentlyFinishedGame && (!options.table || options.table === 'RecentlyFinishedGame')) {
      const existing = existingRecentlyFinished.get(game.id);
      if (!existing) {
        results.recentlyFinishedGame.toCreate.push(game);
      } else {
        results.recentlyFinishedGame.toUpdate.push(game);
      }
    }
  }
  
  console.log(`\r   Processed ${processedCount}/${games.length} games`);

  // Print classification summary
  console.log('\n' + '='.repeat(70));
  console.log('CLASSIFICATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`ActiveGame:           ${results.activeGame.toCreate.length} to create, ${results.activeGame.toUpdate.length} to update`);
  console.log(`UpcomingGame:         ${results.upcomingGame.toCreate.length} to create, ${results.upcomingGame.toUpdate.length} to update`);
  console.log(`RecentlyFinishedGame: ${results.recentlyFinishedGame.toCreate.length} to create, ${results.recentlyFinishedGame.toUpdate.length} to update`);
  console.log(`Skipped:              ${results.skipped.length} games`);
  
  // Show sample skipped
  if (results.skipped.length > 0 && results.skipped.length <= 20) {
    console.log('\nSkipped games:');
    results.skipped.forEach(s => {
      console.log(`  - ${s.name} (${s.status}): ${s.reason}`);
    });
  } else if (results.skipped.length > 20) {
    console.log('\nSample skipped games (first 10):');
    results.skipped.slice(0, 10).forEach(s => {
      console.log(`  - ${s.name} (${s.status}): ${s.reason}`);
    });
  }

  // Execute mode: write records
  if (options.execute) {
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTING WRITES');
    console.log('='.repeat(70));
    
    // Write ActiveGame records
    if (!options.table || options.table === 'ActiveGame') {
      console.log('\n📝 Writing ActiveGame records...');
      const toWrite = [...results.activeGame.toCreate, ...results.activeGame.toUpdate];
      let written = 0;
      let errors = 0;
      
      for (const game of toWrite) {
        try {
          const record = await buildActiveGameRecord(game);
          await docClient.send(new PutCommand({
            TableName: getTableName('ActiveGame'),
            Item: record,
          }));
          written++;
          process.stdout.write('.');
          
          if (written % options.batchSize === 0) {
            await sleep(500);
          }
        } catch (err) {
          console.error(`\n   ❌ Error writing ActiveGame for ${game.id}: ${err.message}`);
          errors++;
        }
      }
      
      console.log(`\n   ✅ Wrote ${written} ActiveGame records (${errors} errors)`);
    }
    
    // Write UpcomingGame records
    if (!options.table || options.table === 'UpcomingGame') {
      console.log('\n📝 Writing UpcomingGame records...');
      const toWrite = [...results.upcomingGame.toCreate, ...results.upcomingGame.toUpdate];
      let written = 0;
      let errors = 0;
      
      for (const game of toWrite) {
        try {
          const record = await buildUpcomingGameRecord(game);
          await docClient.send(new PutCommand({
            TableName: getTableName('UpcomingGame'),
            Item: record,
          }));
          written++;
          process.stdout.write('.');
          
          if (written % options.batchSize === 0) {
            await sleep(500);
          }
        } catch (err) {
          console.error(`\n   ❌ Error writing UpcomingGame for ${game.id}: ${err.message}`);
          errors++;
        }
      }
      
      console.log(`\n   ✅ Wrote ${written} UpcomingGame records (${errors} errors)`);
    }
    
    // Write RecentlyFinishedGame records
    if (!options.table || options.table === 'RecentlyFinishedGame') {
      console.log('\n📝 Writing RecentlyFinishedGame records...');
      const toWrite = [...results.recentlyFinishedGame.toCreate, ...results.recentlyFinishedGame.toUpdate];
      let written = 0;
      let errors = 0;
      
      for (const game of toWrite) {
        try {
          const record = await buildRecentlyFinishedGameRecord(game);
          await docClient.send(new PutCommand({
            TableName: getTableName('RecentlyFinishedGame'),
            Item: record,
          }));
          written++;
          process.stdout.write('.');
          
          if (written % options.batchSize === 0) {
            await sleep(500);
          }
        } catch (err) {
          console.error(`\n   ❌ Error writing RecentlyFinishedGame for ${game.id}: ${err.message}`);
          errors++;
        }
      }
      
      console.log(`\n   ✅ Wrote ${written} RecentlyFinishedGame records (${errors} errors)`);
    }
  }

  // Cleanup mode: remove orphaned records
  if (options.cleanup || options.dryRunCleanup) {
    console.log('\n' + '='.repeat(70));
    console.log('CLEANUP: Finding Orphaned Records');
    console.log('='.repeat(70));
    
    const gameIds = new Set(games.map(g => g.id));
    
    // Find orphaned ActiveGame records
    if (!options.table || options.table === 'ActiveGame') {
      const orphaned = [...existingActiveGames.values()].filter(r => !gameIds.has(r.gameId));
      console.log(`\nActiveGame: ${orphaned.length} orphaned records`);
      
      if (orphaned.length > 0 && orphaned.length <= 10) {
        orphaned.forEach(r => console.log(`  - ${r.name?.substring(0, 40)} (gameId: ${r.gameId})`));
      }
      
      if (options.cleanup && options.execute && orphaned.length > 0) {
        console.log('   Deleting orphaned ActiveGame records...');
        let deleted = 0;
        for (const record of orphaned) {
          try {
            await docClient.send(new DeleteCommand({
              TableName: getTableName('ActiveGame'),
              Key: { id: record.id },
            }));
            deleted++;
          } catch (err) {
            console.error(`   ❌ Error deleting ${record.id}: ${err.message}`);
          }
        }
        console.log(`   ✅ Deleted ${deleted} orphaned ActiveGame records`);
      }
    }
    
    // Find orphaned UpcomingGame records
    if (!options.table || options.table === 'UpcomingGame') {
      const orphaned = [...existingUpcomingGames.values()].filter(r => !gameIds.has(r.gameId));
      console.log(`\nUpcomingGame: ${orphaned.length} orphaned records`);
      
      if (orphaned.length > 0 && orphaned.length <= 10) {
        orphaned.forEach(r => console.log(`  - ${r.name?.substring(0, 40)} (gameId: ${r.gameId})`));
      }
      
      if (options.cleanup && options.execute && orphaned.length > 0) {
        console.log('   Deleting orphaned UpcomingGame records...');
        let deleted = 0;
        for (const record of orphaned) {
          try {
            await docClient.send(new DeleteCommand({
              TableName: getTableName('UpcomingGame'),
              Key: { id: record.id },
            }));
            deleted++;
          } catch (err) {
            console.error(`   ❌ Error deleting ${record.id}: ${err.message}`);
          }
        }
        console.log(`   ✅ Deleted ${deleted} orphaned UpcomingGame records`);
      }
    }
    
    // Find orphaned RecentlyFinishedGame records
    if (!options.table || options.table === 'RecentlyFinishedGame') {
      const orphaned = [...existingRecentlyFinished.values()].filter(r => !gameIds.has(r.gameId));
      console.log(`\nRecentlyFinishedGame: ${orphaned.length} orphaned records`);
      
      if (orphaned.length > 0 && orphaned.length <= 10) {
        orphaned.forEach(r => console.log(`  - ${r.name?.substring(0, 40)} (gameId: ${r.gameId})`));
      }
      
      if (options.cleanup && options.execute && orphaned.length > 0) {
        console.log('   Deleting orphaned RecentlyFinishedGame records...');
        let deleted = 0;
        for (const record of orphaned) {
          try {
            await docClient.send(new DeleteCommand({
              TableName: getTableName('RecentlyFinishedGame'),
              Key: { id: record.id },
            }));
            deleted++;
          } catch (err) {
            console.error(`   ❌ Error deleting ${record.id}: ${err.message}`);
          }
        }
        console.log(`   ✅ Deleted ${deleted} orphaned RecentlyFinishedGame records`);
      }
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(70));
  console.log(`Cache stats: ${venueCache.size} venues cached`);
  
  if (options.preview) {
    console.log('\n💡 Run with --execute to apply these changes');
  }

  console.log('\n✅ Done!\n');
}

// ============================================================================
// RUN
// ============================================================================

runBackfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
