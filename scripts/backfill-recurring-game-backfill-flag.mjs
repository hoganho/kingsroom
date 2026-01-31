// backfill-recurring-game-backfill-flag.mjs
// 
// This script sets backfillGameInstance=false for all existing RecurringGame records.
// This ensures only explicitly opted-in recurring games will have instances backfilled.
//
// After running this script:
// - All existing RecurringGame records will have backfillGameInstance=false
// - New recurring games will need backfillGameInstance=true to be included in backfill
// - You can selectively enable backfill for specific games in the admin UI
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
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './backfill-reports';

// Batch size for updates
const UPDATE_BATCH_SIZE = 25;

// Delay between batches to avoid throttling (ms)
const BATCH_DELAY_MS = 200;

// If set to 1, we don't modify data; we just report what would be updated
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
  update: (msg) => console.log(`[UPDATE] 📝 ${msg}`),
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

// ------------------------------------------------------------------
// FIND RECURRING GAMES NEEDING UPDATE
// ------------------------------------------------------------------

async function findRecurringGamesNeedingUpdate() {
  const tableName = getTableName('RecurringGame');
  logger.info(`Scanning table: ${tableName}`);
  
  const needsUpdate = [];
  const alreadySet = [];
  const stats = {
    total: 0,
    needsUpdate: 0,
    alreadyFalse: 0,
    alreadyTrue: 0,
    nullOrUndefined: 0,
  };
  
  let lastEvaluatedKey = undefined;
  let scanCount = 0;
  
  do {
    scanCount++;
    process.stdout.write(`\r  Scanning... (batch ${scanCount})`);
    
    const scanParams = {
      TableName: tableName,
      // Only get fields we need
      ProjectionExpression: 'id, #name, venueId, dayOfWeek, isActive, backfillGameInstance, #version',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#version': '_version',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    const result = await ddbDocClient.send(new ScanCommand(scanParams));
    
    for (const item of result.Items || []) {
      stats.total++;
      
      // Check current value of backfillGameInstance
      const currentValue = item.backfillGameInstance;
      
      if (currentValue === undefined || currentValue === null) {
        stats.nullOrUndefined++;
        needsUpdate.push({
          id: item.id,
          name: item.name,
          venueId: item.venueId,
          dayOfWeek: item.dayOfWeek,
          isActive: item.isActive,
          currentValue: currentValue,
          _version: item._version,
        });
      } else if (currentValue === false) {
        stats.alreadyFalse++;
        alreadySet.push(item);
      } else if (currentValue === true) {
        stats.alreadyTrue++;
        alreadySet.push(item);
      }
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  console.log(''); // Clear the scanning line
  
  stats.needsUpdate = needsUpdate.length;
  
  return { needsUpdate, alreadySet, stats };
}

// ------------------------------------------------------------------
// UPDATE RECURRING GAMES
// ------------------------------------------------------------------

async function updateRecurringGames(games) {
  const tableName = getTableName('RecurringGame');
  
  const results = {
    updated: 0,
    failed: 0,
    errors: [],
    details: [],
  };
  
  // Process in batches
  for (let i = 0; i < games.length; i += UPDATE_BATCH_SIZE) {
    const batch = games.slice(i, i + UPDATE_BATCH_SIZE);
    const batchNum = Math.floor(i / UPDATE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(games.length / UPDATE_BATCH_SIZE);
    
    process.stdout.write(`\r  Processing batch ${batchNum}/${totalBatches} (${results.updated + results.failed}/${games.length} done)`);
    
    // Process batch items sequentially to avoid throttling
    for (const game of batch) {
      try {
        if (!DRY_RUN) {
          const now = new Date().toISOString();
          
          // Build update params - handle _version and _lastChangedAt properly
          const updateParams = {
            TableName: tableName,
            Key: { id: game.id },
          };
          
          if (game._version !== undefined) {
            // With DataStore sync fields - increment _version and update _lastChangedAt
            updateParams.UpdateExpression = 'SET backfillGameInstance = :val, updatedAt = :now, #version = :newVersion, #lastChanged = :lastChanged';
            updateParams.ExpressionAttributeNames = {
              '#version': '_version',
              '#lastChanged': '_lastChangedAt',
            };
            updateParams.ExpressionAttributeValues = {
              ':val': false,
              ':now': now,
              ':newVersion': game._version + 1,
              ':lastChanged': Date.now(),
            };
            // Optimistic locking
            updateParams.ConditionExpression = '#version = :expectedVersion';
            updateParams.ExpressionAttributeValues[':expectedVersion'] = game._version;
          } else {
            // Without DataStore sync fields - simple update
            updateParams.UpdateExpression = 'SET backfillGameInstance = :val, updatedAt = :now';
            updateParams.ExpressionAttributeValues = {
              ':val': false,
              ':now': now,
            };
          }
          
          await ddbDocClient.send(new UpdateCommand(updateParams));
        }
        
        results.updated++;
        results.details.push({
          id: game.id,
          name: game.name,
          status: 'updated',
          previousValue: game.currentValue,
          newValue: false,
        });
        
      } catch (err) {
        results.failed++;
        results.errors.push({
          id: game.id,
          name: game.name,
          error: err.message,
        });
        results.details.push({
          id: game.id,
          name: game.name,
          status: 'failed',
          error: err.message,
        });
      }
    }
    
    // Delay between batches
    if (i + UPDATE_BATCH_SIZE < games.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  console.log(''); // Clear the progress line
  
  return results;
}

// ------------------------------------------------------------------
// GENERATE REPORT
// ------------------------------------------------------------------

async function generateReport(stats, updateResults, timestamp) {
  const reportDir = path.join(REPORT_OUTPUT_DIR, `backfill_flag_${config.ENV_SUFFIX}_${timestamp}`);
  await fs.mkdir(reportDir, { recursive: true });
  
  // Summary report
  const summaryPath = path.join(reportDir, 'summary.txt');
  const summaryContent = `
RECURRING GAME BACKFILL FLAG UPDATE REPORT
==========================================
Generated: ${new Date().toISOString()}
Environment: ${SELECTED_ENV.toUpperCase()}
Dry Run: ${DRY_RUN ? 'YES' : 'NO'}

SCAN STATISTICS
---------------
Total RecurringGame records: ${stats.total}
Already set to false: ${stats.alreadyFalse}
Already set to true: ${stats.alreadyTrue}
Null/undefined (needed update): ${stats.nullOrUndefined}

UPDATE RESULTS
--------------
Successfully updated: ${updateResults.updated}
Failed: ${updateResults.failed}

${updateResults.errors.length > 0 ? `
ERRORS
------
${updateResults.errors.map(e => `${e.id} (${e.name}): ${e.error}`).join('\n')}
` : ''}

WHAT THIS SCRIPT DOES
---------------------
Sets backfillGameInstance=false for all RecurringGame records that don't
already have this field set. This ensures:

1. Existing recurring games won't be included in automatic backfill
2. Only games explicitly marked with backfillGameInstance=true will have
   schedule instances automatically created
3. You can selectively enable backfill for specific games through the admin UI

NEXT STEPS
----------
1. Review the games that need backfill enabled
2. Enable backfillGameInstance=true for those specific games
3. Run the backfill process to create schedule instances
`;
  
  await fs.writeFile(summaryPath, summaryContent);
  logger.success(`Summary saved to: ${summaryPath}`);
  
  // Detailed CSV
  if (updateResults.details.length > 0) {
    const csvPath = path.join(reportDir, 'updated_games.csv');
    const headers = ['id', 'name', 'status', 'previousValue', 'newValue', 'error'];
    
    const rows = updateResults.details.map(d => [
      d.id,
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.status,
      d.previousValue === undefined ? 'undefined' : String(d.previousValue),
      d.newValue === undefined ? '' : String(d.newValue),
      d.error || '',
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
  console.log('║     RECURRING GAME BACKFILL FLAG UPDATE SCRIPT                    ║');
  console.log('║     Sets backfillGameInstance=false for all existing records      ║');
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
  logger.info(`RecurringGame table: ${getTableName('RecurringGame')}`);
  logger.info(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will modify data!)'}`);
  console.log('─'.repeat(70) + '\n');

  // Production safety check
  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    logger.warn('⚠️  You are about to MODIFY PRODUCTION data!');
    logger.warn('⚠️  Make sure you have a recent backup!');
    const confirm = await askQuestion('Type "update prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'update prod') {
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

  // Step 1: Find recurring games needing update
  logger.info('\n📊 STEP 1: Scanning for RecurringGame records without backfillGameInstance...\n');
  const { needsUpdate, stats } = await findRecurringGamesNeedingUpdate();
  
  console.log('\n' + '─'.repeat(70));
  logger.info('SCAN RESULTS:');
  logger.info(`  Total RecurringGame records: ${stats.total}`);
  logger.info(`  Already set to false: ${stats.alreadyFalse}`);
  logger.info(`  Already set to true: ${stats.alreadyTrue}`);
  logger.info(`  Needs update (null/undefined): ${stats.nullOrUndefined}`);
  console.log('─'.repeat(70) + '\n');

  if (needsUpdate.length === 0) {
    logger.success('No records need updating! All RecurringGame records already have backfillGameInstance set.');
    return;
  }

  // Show sample
  logger.info('Sample of records needing update:');
  const sample = needsUpdate.slice(0, 10);
  for (const game of sample) {
    console.log(`\n  📋 ${game.name}`);
    console.log(`     ID: ${game.id}`);
    console.log(`     Day: ${game.dayOfWeek}`);
    console.log(`     Active: ${game.isActive}`);
    console.log(`     Current value: ${game.currentValue === undefined ? 'undefined' : game.currentValue}`);
  }
  if (needsUpdate.length > 10) {
    console.log(`\n  ... and ${needsUpdate.length - 10} more`);
  }
  console.log('');

  // Confirm before processing
  if (!DRY_RUN) {
    const confirmUpdate = await askQuestion(`\nUpdate ${needsUpdate.length} records to backfillGameInstance=false? Type "update" to continue: `);
    if (confirmUpdate.toLowerCase().trim() !== 'update') {
      logger.info('Aborted by user.');
      return;
    }
  }

  // Step 2: Update records
  logger.info('\n📝 STEP 2: Updating RecurringGame records...\n');
  const updateResults = await updateRecurringGames(needsUpdate);

  // Step 3: Generate report
  logger.info('\n📄 STEP 3: Generating report...\n');
  const reportDir = await generateReport(stats, updateResults, timestamp);

  // Final summary
  console.log('\n' + '═'.repeat(70));
  logger.success('UPDATE COMPLETE!');
  console.log('═'.repeat(70));
  console.log(`
  Records updated: ${updateResults.updated}
  Records failed: ${updateResults.failed}
  
  Report saved to: ${reportDir}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
  `);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
