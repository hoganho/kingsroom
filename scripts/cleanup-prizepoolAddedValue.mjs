// cleanup-prizepoolAddedValue.mjs
// 
// This script fixes the data corruption where prizepoolAddedValue was incorrectly
// set to the same value as guaranteeOverlayCost (should be 0 for non-promotional games).
//
// The bug was in html-parser.js calculatePokerEconomics() which set:
//   prizepoolAddedValue = shortfall (WRONG - this is overlay, not promotional added value)
//
// This script will:
// 1. Find all Game records where prizepoolAddedValue == guaranteeOverlayCost (and > 0)
// 2. Reset prizepoolAddedValue to 0
// 3. Recalculate prizepoolCalculated = prizepoolPlayerContributions (base only)
// 4. Update dataChangedAt to trigger DynamoDB stream → gameFinancialsProcessor
//    (which will auto-update GameFinancialSnapshot)
//
// ⚠️ WARNING: This modifies production data. Always backup first!

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Output directory for reports
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './cleanup-reports';

// Batch size for updates (DynamoDB limit is 25 for BatchWrite, but we use individual updates)
const UPDATE_BATCH_SIZE = 10;

// Delay between batches to avoid throttling (ms)
const BATCH_DELAY_MS = 500;

// If set to 1, we don't modify data; we just report what would be fixed
const DRY_RUN = process.env.DRY_RUN === '1';

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

let SELECTED_ENV = null;
let config = null;

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  fix: (msg) => console.log(`[FIX] 🔧 ${msg}`),
  skip: (msg) => console.log(`[SKIP] ⏭️  ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENTS
// ------------------------------------------------------------------

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getTableName(modelName) {
  return `${modelName}-${config.API_ID}-${config.ENV_SUFFIX}`;
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'N/A';
  return `$${amount.toLocaleString()}`;
}

// ------------------------------------------------------------------
// FIND CORRUPTED RECORDS
// ------------------------------------------------------------------

async function findCorruptedGames() {
  const tableName = getTableName('Game');
  logger.info(`Scanning table: ${tableName}`);
  
  const corruptedGames = [];
  const stats = {
    totalScanned: 0,
    withOverlay: 0,
    corrupted: 0,
    alreadyCorrect: 0,
  };
  
  let lastEvaluatedKey = undefined;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      // Only scan games that have guaranteeOverlayCost > 0 (potential candidates)
      FilterExpression: 'guaranteeOverlayCost > :zero',
      ExpressionAttributeValues: {
        ':zero': 0
      }
    };
    
    const result = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = result.Items || [];
    
    stats.totalScanned += items.length;
    
    for (const game of items) {
      stats.withOverlay++;
      
      const guaranteeOverlayCost = game.guaranteeOverlayCost || 0;
      const prizepoolAddedValue = game.prizepoolAddedValue || 0;
      
      // Check if corrupted: prizepoolAddedValue equals guaranteeOverlayCost
      // This indicates the bug where overlay was incorrectly set as added value
      if (prizepoolAddedValue > 0 && prizepoolAddedValue === guaranteeOverlayCost) {
        stats.corrupted++;
        
        // Calculate what the correct values should be
        const prizepoolPlayerContributions = game.prizepoolPlayerContributions || 0;
        const correctPrizepoolCalculated = prizepoolPlayerContributions; // Base only, no added value
        
        corruptedGames.push({
          id: game.id,
          name: game.name,
          gameStartDateTime: game.gameStartDateTime,
          venueId: game.venueId,
          entityId: game.entityId,
          
          // Current (wrong) values
          current: {
            guaranteeOverlayCost,
            prizepoolAddedValue,
            prizepoolCalculated: game.prizepoolCalculated,
            prizepoolPlayerContributions,
          },
          
          // Correct values
          correct: {
            guaranteeOverlayCost, // This stays the same
            prizepoolAddedValue: 0, // Should be 0
            prizepoolCalculated: correctPrizepoolCalculated,
            prizepoolPlayerContributions, // This stays the same
          },
          
          // For reporting
          overlayCost: guaranteeOverlayCost,
          wasDoubleCountedAs: prizepoolAddedValue,
        });
      } else if (prizepoolAddedValue === 0) {
        stats.alreadyCorrect++;
      }
    }
    
    if (stats.totalScanned % 100 === 0) {
      logger.info(`Scanned ${stats.totalScanned} games with overlay, found ${stats.corrupted} corrupted...`);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return { corruptedGames, stats };
}

// ------------------------------------------------------------------
// FIX CORRUPTED RECORDS
// ------------------------------------------------------------------

async function fixGame(game) {
  const tableName = getTableName('Game');
  const now = new Date().toISOString();
  
  try {
    await ddbDocClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: game.id },
      UpdateExpression: `
        SET prizepoolAddedValue = :addedValue,
            prizepoolCalculated = :calculated,
            updatedAt = :updatedAt,
            #dataChangedAt = :dataChangedAt
      `,
      ExpressionAttributeNames: {
        '#dataChangedAt': 'dataChangedAt'
      },
      ExpressionAttributeValues: {
        ':addedValue': game.correct.prizepoolAddedValue,
        ':calculated': game.correct.prizepoolCalculated,
        ':updatedAt': now,
        ':dataChangedAt': now, // This triggers DynamoDB stream → gameFinancialsProcessor
      },
      ReturnValues: 'NONE'
    }));
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function fixCorruptedGames(corruptedGames) {
  const results = {
    fixed: 0,
    failed: 0,
    errors: [],
  };
  
  logger.info(`\nFixing ${corruptedGames.length} corrupted games...`);
  logger.info(`(GameFinancialSnapshot will auto-update via DynamoDB stream)\n`);
  
  for (let i = 0; i < corruptedGames.length; i++) {
    const game = corruptedGames[i];
    
    // Progress indicator
    if ((i + 1) % 10 === 0 || i === 0) {
      logger.info(`Processing ${i + 1}/${corruptedGames.length}...`);
    }
    
    if (DRY_RUN) {
      logger.fix(`[DRY RUN] Would fix: ${game.name} (${game.id})`);
      logger.info(`  prizepoolAddedValue: ${formatCurrency(game.current.prizepoolAddedValue)} → ${formatCurrency(game.correct.prizepoolAddedValue)}`);
      logger.info(`  prizepoolCalculated: ${formatCurrency(game.current.prizepoolCalculated)} → ${formatCurrency(game.correct.prizepoolCalculated)}`);
      results.fixed++;
      continue;
    }
    
    // Fix the game record
    const fixResult = await fixGame(game);
    
    if (fixResult.success) {
      results.fixed++;
      logger.fix(`Fixed: ${game.name} (${game.id})`);
    } else {
      results.failed++;
      results.errors.push({ gameId: game.id, error: fixResult.error });
      logger.error(`Failed to fix: ${game.name} (${game.id}) - ${fixResult.error}`);
    }
    
    // Delay between updates to avoid throttling
    if ((i + 1) % UPDATE_BATCH_SIZE === 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  return results;
}

// ------------------------------------------------------------------
// GENERATE REPORT
// ------------------------------------------------------------------

async function generateReport(corruptedGames, stats, fixResults, timestamp) {
  const reportDir = path.join(REPORT_OUTPUT_DIR, `cleanup_${config.ENV_SUFFIX}_${timestamp}`);
  await fs.mkdir(reportDir, { recursive: true });
  
  // Summary report
  const summaryPath = path.join(reportDir, 'summary.txt');
  const summaryContent = `
PRIZEPOOL ADDED VALUE CLEANUP REPORT
====================================
Generated: ${new Date().toISOString()}
Environment: ${SELECTED_ENV.toUpperCase()}
Dry Run: ${DRY_RUN ? 'YES' : 'NO'}

SCAN STATISTICS
---------------
Games with overlay scanned: ${stats.totalScanned}
Games with overlay > 0: ${stats.withOverlay}
Corrupted (prizepoolAddedValue == guaranteeOverlayCost): ${stats.corrupted}
Already correct (prizepoolAddedValue == 0): ${stats.alreadyCorrect}

FIX RESULTS
-----------
Successfully fixed: ${fixResults.fixed}
Failed to fix: ${fixResults.failed}

NOTE: GameFinancialSnapshot records will auto-update via DynamoDB stream
      triggering gameFinancialsProcessor when dataChangedAt changes.

${fixResults.errors.length > 0 ? `
ERRORS
------
${fixResults.errors.map(e => `${e.gameId}: ${e.error}`).join('\n')}
` : ''}

WHAT WAS FIXED
--------------
For each corrupted game:
- prizepoolAddedValue: was set to guaranteeOverlayCost value → reset to 0
- prizepoolCalculated: was inflated by overlay amount → recalculated as prizepoolPlayerContributions only
- GameFinancialSnapshot: will be recalculated via gameFinancialsProcessor stream trigger
`;
  
  await fs.writeFile(summaryPath, summaryContent);
  logger.success(`Summary saved to: ${summaryPath}`);
  
  // Detailed CSV of corrupted games
  if (corruptedGames.length > 0) {
    const csvPath = path.join(reportDir, 'corrupted_games.csv');
    const headers = [
      'id', 'name', 'gameStartDateTime', 'venueId', 'entityId',
      'old_prizepoolAddedValue', 'new_prizepoolAddedValue',
      'old_prizepoolCalculated', 'new_prizepoolCalculated',
      'guaranteeOverlayCost', 'prizepoolPlayerContributions'
    ];
    
    const rows = corruptedGames.map(g => [
      g.id,
      `"${(g.name || '').replace(/"/g, '""')}"`,
      g.gameStartDateTime,
      g.venueId,
      g.entityId,
      g.current.prizepoolAddedValue,
      g.correct.prizepoolAddedValue,
      g.current.prizepoolCalculated,
      g.correct.prizepoolCalculated,
      g.current.guaranteeOverlayCost,
      g.current.prizepoolPlayerContributions,
    ].join(','));
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    await fs.writeFile(csvPath, csvContent);
    logger.success(`Detailed CSV saved to: ${csvPath}`);
  }
  
  return reportDir;
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        PRIZEPOOL ADDED VALUE CLEANUP SCRIPT                       ║');
  console.log('║        Fixes prizepoolAddedValue == guaranteeOverlayCost bug      ║');
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
    logger.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`Game table: ${getTableName('Game')}`);
  logger.info(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will modify data!)'}`);
  console.log('─'.repeat(70) + '\n');

  // Production safety check
  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    logger.warn('⚠️  You are about to MODIFY PRODUCTION data!');
    logger.warn('⚠️  Make sure you have a recent backup!');
    const confirm = await askQuestion('Type "fix prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'fix prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.warn('AWS credentials not found in environment variables.');
    logger.info('Using default credential chain (profile, instance role, etc.)');
  }

  const timestamp = makeTimestamp();

  // Step 1: Find corrupted games
  logger.info('\n📊 STEP 1: Scanning for corrupted games...\n');
  const { corruptedGames, stats } = await findCorruptedGames();
  
  console.log('\n' + '─'.repeat(70));
  logger.info('SCAN RESULTS:');
  logger.info(`  Games with overlay scanned: ${stats.totalScanned}`);
  logger.info(`  Corrupted (need fixing): ${stats.corrupted}`);
  logger.info(`  Already correct: ${stats.alreadyCorrect}`);
  console.log('─'.repeat(70) + '\n');

  if (corruptedGames.length === 0) {
    logger.success('No corrupted games found! Nothing to fix.');
    return;
  }

  // Show sample of corrupted games
  logger.info('Sample of corrupted games:');
  const sample = corruptedGames.slice(0, 5);
  for (const game of sample) {
    console.log(`\n  📋 ${game.name}`);
    console.log(`     ID: ${game.id}`);
    console.log(`     Date: ${game.gameStartDateTime}`);
    console.log(`     guaranteeOverlayCost: ${formatCurrency(game.current.guaranteeOverlayCost)}`);
    console.log(`     prizepoolAddedValue: ${formatCurrency(game.current.prizepoolAddedValue)} → ${formatCurrency(game.correct.prizepoolAddedValue)}`);
    console.log(`     prizepoolCalculated: ${formatCurrency(game.current.prizepoolCalculated)} → ${formatCurrency(game.correct.prizepoolCalculated)}`);
  }
  if (corruptedGames.length > 5) {
    console.log(`\n  ... and ${corruptedGames.length - 5} more`);
  }
  console.log('');

  // Confirm before fixing
  if (!DRY_RUN) {
    const confirmFix = await askQuestion(`\nFix ${corruptedGames.length} corrupted games? Type "fix" to continue: `);
    if (confirmFix.toLowerCase().trim() !== 'fix') {
      logger.info('Aborted by user.');
      return;
    }
  }

  // Step 2: Fix corrupted games
  logger.info('\n🔧 STEP 2: Fixing corrupted games...\n');
  const fixResults = await fixCorruptedGames(corruptedGames);

  // Step 3: Generate report
  logger.info('\n📝 STEP 3: Generating report...\n');
  const reportDir = await generateReport(corruptedGames, stats, fixResults, timestamp);

  // Final summary
  console.log('\n' + '═'.repeat(70));
  logger.success('CLEANUP COMPLETE!');
  console.log('═'.repeat(70));
  console.log(`
  Games fixed: ${fixResults.fixed}
  Games failed: ${fixResults.failed}
  
  Report saved to: ${reportDir}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
  
  Next steps:
  1. Verify the fix by checking a few games in the UI
  2. The GameFinancialSnapshot records will auto-update via DynamoDB stream
     (dataChangedAt change triggers gameFinancialsProcessor)
  3. If financials don't update within a few minutes, check CloudWatch logs
     for gameFinancialsProcessor Lambda
  `);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
