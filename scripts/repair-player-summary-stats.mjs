#!/usr/bin/env node
/**
 * ===================================================================
 * Repair Corrupted PlayerSummary Statistics
 * ===================================================================
 * 
 * This script fixes PlayerSummary records that have negative values for
 * sessionsPlayed and tournamentsPlayed due to non-idempotent consolidation
 * adjustments being applied multiple times.
 * 
 * ROOT CAUSE:
 * The player-consolidation-logic.js was applying negative adjustments
 * every time consolidation ran, without checking if adjustments had
 * already been applied. This caused cumulative subtractions.
 * 
 * FIX STRATEGY:
 * Recalculate sessionsPlayed/tournamentsPlayed from the actual source
 * of truth: PlayerResult records (excluding SUPERSEDED records which
 * are child tournament records consolidated into parents).
 * 
 * Usage:
 *   node repair-player-summary-stats.mjs                     # Interactive env selection + preview
 *   node repair-player-summary-stats.mjs --execute           # Interactive env selection + execute
 *   node repair-player-summary-stats.mjs --player <id>       # Fix specific player
 *   node repair-player-summary-stats.mjs --entity <id>       # Fix players for entity
 * 
 * ===================================================================
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';

// ============================================================================
// ENVIRONMENT CONFIGURATIONS
// ============================================================================

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
  },
};

const REGION = 'ap-southeast-2';

// ============================================================================
// RUNTIME STATE
// ============================================================================

let SELECTED_ENV = null;
let CONFIG = null;

// ============================================================================
// HELPERS
// ============================================================================

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;
};

// ============================================================================
// PARSE ARGS
// ============================================================================

const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  playerId: null,
  entityId: null,
  includeAll: false,  // Include records that aren't negative but have lastConsolidationAt
  verbose: false,
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
    case '--player':
      options.playerId = args[++i];
      break;
    case '--entity':
      options.entityId = args[++i];
      break;
    case '--all':
      options.includeAll = true;
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Repair Corrupted PlayerSummary Statistics

This script fixes PlayerSummary records that have negative values for
sessionsPlayed and tournamentsPlayed due to duplicate consolidation adjustments.

Usage:
  node repair-player-summary-stats.mjs [options]

Options:
  --preview, -p        Preview changes without executing (default)
  --execute, -e        Execute the fixes
  --player <id>        Fix specific player by ID
  --entity <id>        Fix all players for a specific entity
  --all                Include all consolidated records (not just negative)
  --verbose, -v        Show detailed output
  --help, -h           Show this help message

Examples:
  # Preview all players with negative stats
  node repair-player-summary-stats.mjs --preview

  # Fix a specific player
  node repair-player-summary-stats.mjs --execute --player abc123

  # Fix all players for an entity
  node repair-player-summary-stats.mjs --execute --entity f6785dbb-ab2e-4e83-8ad8-3034e7f1947b
      `);
      process.exit(0);
  }
}

// ============================================================================
// AWS CLIENT
// ============================================================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch all items with pagination
 */
async function fetchAllItems(params) {
  const items = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      ...params,
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    if (response.Items) {
      items.push(...response.Items);
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return items;
}

/**
 * Count valid PlayerResults for a player (excluding SUPERSEDED records)
 * SUPERSEDED records are child tournament results that have been consolidated
 * into a parent tournament record.
 */
async function countValidPlayerResults(playerId) {
  const playerResultTable = getTableName('PlayerResult');
  
  const results = await fetchAllItems({
    TableName: playerResultTable,
    IndexName: 'byPlayer',
    KeyConditionExpression: 'playerId = :pid',
    ExpressionAttributeValues: { ':pid': playerId },
  });
  
  // Filter out SUPERSEDED records - they shouldn't be counted
  const validResults = results.filter(r => 
    r.recordType !== 'SUPERSEDED'
  );
  
  // Count tournament vs cash game results
  let tournamentCount = 0;
  let cashGameCount = 0;
  let totalWinnings = 0;
  let totalBuyIns = 0;
  let tournamentWinnings = 0;
  let tournamentBuyIns = 0;
  let tournamentITM = 0;
  let tournamentsCashed = 0;
  
  for (const result of validResults) {
    // Determine if tournament or cash game based on game type
    // For now, treat all as tournaments (adjust if you have cash games)
    tournamentCount++;
    
    const winnings = result.amountWon || 0;
    totalWinnings += winnings;
    tournamentWinnings += winnings;
    
    // Buy-ins from consolidated records
    if (result.isConsolidatedRecord && result.totalBuyInsPaid) {
      totalBuyIns += result.totalBuyInsPaid;
      tournamentBuyIns += result.totalBuyInsPaid;
    }
    
    // ITM and cashed
    if (result.prizeWon || winnings > 0 || result.isMultiDayQualification) {
      tournamentITM++;
      if (winnings > 0) {
        tournamentsCashed++;
      }
    }
  }
  
  return {
    total: validResults.length,
    tournaments: tournamentCount,
    cashGames: cashGameCount,
    validResults,
    // Financial stats we can derive
    totalWinnings,
    totalBuyIns,
    tournamentWinnings,
    tournamentBuyIns,
    tournamentITM,
    tournamentsCashed,
  };
}

/**
 * Count unique venues from PlayerVenue records
 */
async function countPlayerVenues(playerId) {
  const playerVenueTable = getTableName('PlayerVenue');
  
  const venues = await fetchAllItems({
    TableName: playerVenueTable,
    IndexName: 'byPlayer',
    KeyConditionExpression: 'playerId = :pid',
    ExpressionAttributeValues: { ':pid': playerId },
  });
  
  return venues.length;
}

/**
 * Get corrected stats for a player
 */
async function calculateCorrectStats(playerId, currentSummary) {
  const resultCounts = await countValidPlayerResults(playerId);
  const venueCount = await countPlayerVenues(playerId);
  
  const current = {
    sessionsPlayed: currentSummary.sessionsPlayed || 0,
    tournamentsPlayed: currentSummary.tournamentsPlayed || 0,
    cashGamesPlayed: currentSummary.cashGamesPlayed || 0,
    venuesVisited: currentSummary.venuesVisited || 0,
  };
  
  const correct = {
    sessionsPlayed: resultCounts.total,
    tournamentsPlayed: resultCounts.tournaments,
    cashGamesPlayed: resultCounts.cashGames,
    venuesVisited: venueCount,
  };
  
  // Determine if fix is needed
  const isNegative = current.sessionsPlayed < 0 || current.tournamentsPlayed < 0;
  const needsFix = isNegative || 
    current.sessionsPlayed !== correct.sessionsPlayed ||
    current.tournamentsPlayed !== correct.tournamentsPlayed;
  
  return {
    current,
    correct,
    resultCount: resultCounts.total,
    isNegative,
    needsFix,
  };
}

/**
 * Find corrupted PlayerSummary records
 */
async function findCorruptedSummaries() {
  const playerSummaryTable = getTableName('PlayerSummary');
  
  console.log(`Scanning ${playerSummaryTable} for corrupted records...`);
  
  let items = [];
  let lastEvaluatedKey = undefined;
  
  // Build scan/query based on options
  if (options.playerId) {
    // Single player
    const response = await docClient.send(new GetCommand({
      TableName: playerSummaryTable,
      Key: { id: options.playerId },
    }));
    if (response.Item) {
      items = [response.Item];
    }
  } else if (options.entityId) {
    // Filter by entity
    do {
      const response = await docClient.send(new ScanCommand({
        TableName: playerSummaryTable,
        FilterExpression: 'entityId = :eid',
        ExpressionAttributeValues: { ':eid': options.entityId },
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      items.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } else {
    // Full scan - look for negative values or consolidation markers
    do {
      const response = await docClient.send(new ScanCommand({
        TableName: playerSummaryTable,
        FilterExpression: options.includeAll 
          ? 'attribute_exists(lastConsolidationAt)'
          : 'sessionsPlayed < :zero OR tournamentsPlayed < :zero',
        ExpressionAttributeValues: options.includeAll 
          ? {}
          : { ':zero': 0 },
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      items.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
      
      if (items.length % 100 === 0) {
        console.log(`  Found ${items.length} records so far...`);
      }
    } while (lastEvaluatedKey);
  }
  
  console.log(`Found ${items.length} records to check`);
  return items;
}

/**
 * Repair a single PlayerSummary record
 */
async function repairPlayerSummary(summary, stats) {
  const playerSummaryTable = getTableName('PlayerSummary');
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: playerSummaryTable,
    Key: { id: summary.id },
    UpdateExpression: `
      SET sessionsPlayed = :sessions,
          tournamentsPlayed = :tournaments,
          cashGamesPlayed = :cashGames,
          venuesVisited = :venues,
          updatedAt = :now,
          lastRepairAt = :now,
          repairReason = :reason
      REMOVE lastConsolidationAt, lastConsolidationKey, appliedConsolidations
    `,
    ExpressionAttributeValues: {
      ':sessions': stats.correct.sessionsPlayed,
      ':tournaments': stats.correct.tournamentsPlayed,
      ':cashGames': stats.correct.cashGamesPlayed,
      ':venues': stats.correct.venuesVisited,
      ':now': now,
      ':reason': 'Fixed negative values from duplicate consolidation adjustments',
    },
  }));
}

/**
 * Main repair function
 */
async function repairCorruptedSummaries() {
  console.log('='.repeat(70));
  console.log('REPAIR CORRUPTED PLAYERSUMMARY STATISTICS');
  console.log('='.repeat(70));
  console.log(`Environment: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`Mode: ${options.execute ? '🔧 EXECUTE' : '👁️  PREVIEW'}`);
  console.log(`Table: ${getTableName('PlayerSummary')}`);
  if (options.playerId) console.log(`Player: ${options.playerId}`);
  if (options.entityId) console.log(`Entity: ${options.entityId}`);
  console.log('');
  
  // Find corrupted records
  const corrupted = await findCorruptedSummaries();
  
  if (corrupted.length === 0) {
    console.log('✅ No corrupted PlayerSummary records found!');
    return;
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`FOUND ${corrupted.length} RECORDS TO REPAIR`);
  console.log('='.repeat(70));
  console.log('');
  
  // Calculate correct stats for each
  const repairs = [];
  let processed = 0;
  
  for (const summary of corrupted) {
    processed++;
    process.stdout.write(`\rCalculating correct stats: ${processed}/${corrupted.length}...`);
    
    const stats = await calculateCorrectStats(summary.id, summary);
    repairs.push({ summary, stats });
  }
  console.log('\n');
  
  // Summary of what needs fixing
  const byIssue = {
    negativeValues: repairs.filter(r => r.stats.isNegative).length,
    incorrectCounts: repairs.filter(r => r.stats.needsFix && !r.stats.isNegative).length,
  };
  
  console.log('Issues found:');
  console.log('-'.repeat(50));
  console.log(`  Negative values (critical): ${byIssue.negativeValues}`);
  console.log(`  Incorrect counts: ${byIssue.incorrectCounts}`);
  console.log('');
  
  // Show sample repairs
  console.log('Sample repairs:');
  console.log('-'.repeat(50));
  
  const samples = repairs.slice(0, 10);
  for (const { summary, stats } of samples) {
    const sessionsDiff = stats.correct.sessionsPlayed - stats.current.sessionsPlayed;
    const tournamentsDiff = stats.correct.tournamentsPlayed - stats.current.tournamentsPlayed;
    
    console.log(`  Player: ${summary.id.substring(0, 16)}...`);
    console.log(`    sessionsPlayed:    ${stats.current.sessionsPlayed} → ${stats.correct.sessionsPlayed} (${sessionsDiff >= 0 ? '+' : ''}${sessionsDiff})`);
    console.log(`    tournamentsPlayed: ${stats.current.tournamentsPlayed} → ${stats.correct.tournamentsPlayed} (${tournamentsDiff >= 0 ? '+' : ''}${tournamentsDiff})`);
    console.log(`    (Based on ${stats.resultCount} valid PlayerResult records)`);
    console.log('');
  }
  
  if (repairs.length > 10) {
    console.log(`  ... and ${repairs.length - 10} more`);
    console.log('');
  }
  
  // Show most severely affected
  const mostNegative = repairs
    .filter(r => r.stats.isNegative)
    .sort((a, b) => a.stats.current.sessionsPlayed - b.stats.current.sessionsPlayed)
    .slice(0, 5);
  
  if (mostNegative.length > 0) {
    console.log('Most severely affected (lowest negative values):');
    console.log('-'.repeat(50));
    for (const { summary, stats } of mostNegative) {
      console.log(`  ${summary.id.substring(0, 16)}...: sessionsPlayed=${stats.current.sessionsPlayed}, correct=${stats.correct.sessionsPlayed}`);
    }
    console.log('');
  }
  
  // Execute repairs if requested
  if (options.execute) {
    console.log('='.repeat(70));
    console.log('EXECUTING REPAIRS');
    console.log('='.repeat(70));
    
    let fixed = 0;
    let errors = 0;
    
    for (const { summary, stats } of repairs) {
      if (!stats.needsFix) continue;
      
      try {
        await repairPlayerSummary(summary, stats);
        fixed++;
        process.stdout.write('.');
        
        // Rate limiting
        if (fixed % 25 === 0) {
          process.stdout.write(` ${fixed}/${repairs.length}\n`);
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`\n❌ Error repairing ${summary.id}: ${err.message}`);
        errors++;
      }
    }
    
    console.log(`\n\n✅ Repaired ${fixed} records (${errors} errors)`);
  } else {
    console.log('💡 Run with --execute to apply these repairs');
  }
}

/**
 * Additional diagnostics for specific player
 */
async function showDiagnostics() {
  if (!options.playerId) return;
  
  console.log('\n');
  console.log('='.repeat(70));
  console.log('DETAILED DIAGNOSTICS');
  console.log('='.repeat(70));
  
  const playerId = options.playerId;
  
  // Get PlayerSummary
  const playerSummaryTable = getTableName('PlayerSummary');
  const summaryResp = await docClient.send(new GetCommand({
    TableName: playerSummaryTable,
    Key: { id: playerId },
  }));
  
  if (!summaryResp.Item) {
    console.log(`No PlayerSummary found for ${playerId}`);
    return;
  }
  
  const summary = summaryResp.Item;
  console.log('\nCurrent PlayerSummary:');
  console.log('-'.repeat(50));
  console.log(`  sessionsPlayed: ${summary.sessionsPlayed}`);
  console.log(`  tournamentsPlayed: ${summary.tournamentsPlayed}`);
  console.log(`  cashGamesPlayed: ${summary.cashGamesPlayed || 0}`);
  console.log(`  venuesVisited: ${summary.venuesVisited}`);
  console.log(`  lastConsolidationAt: ${summary.lastConsolidationAt || 'N/A'}`);
  console.log(`  lastConsolidationKey: ${summary.lastConsolidationKey || 'N/A'}`);
  
  // Get PlayerResults
  const playerResultTable = getTableName('PlayerResult');
  const results = await fetchAllItems({
    TableName: playerResultTable,
    IndexName: 'byPlayer',
    KeyConditionExpression: 'playerId = :pid',
    ExpressionAttributeValues: { ':pid': playerId },
  });
  
  console.log('\nPlayerResult records:');
  console.log('-'.repeat(50));
  console.log(`  Total records: ${results.length}`);
  
  const byRecordType = {};
  for (const r of results) {
    const type = r.recordType || 'ORIGINAL';
    byRecordType[type] = (byRecordType[type] || 0) + 1;
  }
  
  for (const [type, count] of Object.entries(byRecordType)) {
    console.log(`    ${type}: ${count}`);
  }
  
  const validResults = results.filter(r => r.recordType !== 'SUPERSEDED');
  console.log(`  Valid (non-SUPERSEDED): ${validResults.length}`);
  
  if (options.verbose) {
    console.log('\n  Individual results:');
    for (const r of results.slice(0, 20)) {
      const gameIdShort = r.gameId?.substring(0, 8) || 'N/A';
      const type = r.recordType || 'ORIGINAL';
      const won = r.amountWon || 0;
      console.log(`    - ${gameIdShort}... | ${type.padEnd(12)} | Won: $${won}`);
    }
    if (results.length > 20) {
      console.log(`    ... and ${results.length - 20} more`);
    }
  }
  
  // Calculate what it should be
  const correctStats = await calculateCorrectStats(playerId, summary);
  
  console.log('\nCalculated correct values:');
  console.log('-'.repeat(50));
  console.log(`  sessionsPlayed should be: ${correctStats.correct.sessionsPlayed}`);
  console.log(`  tournamentsPlayed should be: ${correctStats.correct.tournamentsPlayed}`);
  console.log(`  venuesVisited should be: ${correctStats.correct.venuesVisited}`);
  
  const sessionsDiff = correctStats.correct.sessionsPlayed - summary.sessionsPlayed;
  console.log(`\n  Correction needed: ${sessionsDiff >= 0 ? '+' : ''}${sessionsDiff} sessions`);
}

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        REPAIR CORRUPTED PLAYERSUMMARY STATISTICS                  ║');
  console.log('║        Fixes negative sessionsPlayed/tournamentsPlayed values     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    console.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ============================================================================
// RUN
// ============================================================================

async function main() {
  try {
    // Select environment first
    SELECTED_ENV = await selectEnvironment();
    CONFIG = ENVIRONMENTS[SELECTED_ENV];

    console.log('\n' + '─'.repeat(70));
    console.log(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
    console.log(`API ID: ${CONFIG.API_ID}`);
    console.log('─'.repeat(70) + '\n');

    // Production safety check
    if (SELECTED_ENV === 'prod' && options.execute) {
      console.log('⚠️  You are about to MODIFY PRODUCTION data!');
      const confirm = await askQuestion('Type "fix prod" to confirm: ');
      if (confirm.toLowerCase().trim() !== 'fix prod') {
        console.log('Aborted by user.');
        return;
      }
      console.log('');
    }

    await repairCorruptedSummaries();
    
    if (options.verbose || options.playerId) {
      await showDiagnostics();
    }
    
    console.log('\n✅ Done!\n');
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  }
}

main();
