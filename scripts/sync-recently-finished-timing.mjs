// sync-recently-finished-timing.mjs
// 
// This script syncs corrected timing data from the Game table to the 
// RecentlyFinishedGame table.
//
// RUN THIS AFTER running backfill-game-duration-fields.mjs on the Game table.
//
// The RecentlyFinishedGame table has:
// - finishedAt (corresponds to Game.gameEndDateTime)
// - totalDuration (corresponds to Game.totalDuration)
//
// This script will:
// 1. Scan all RecentlyFinishedGame records
// 2. Look up the corresponding Game record via gameId
// 3. If Game has corrected timing, update RecentlyFinishedGame
//
// ⚠️ WARNING: This modifies production data. Always backup first!

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './sync-reports';
const UPDATE_BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;
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

function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// ------------------------------------------------------------------
// FIND RECORDS NEEDING SYNC
// ------------------------------------------------------------------

async function findRecordsNeedingSync() {
  const recentlyFinishedTable = getTableName('RecentlyFinishedGame');
  const gameTable = getTableName('Game');
  
  logger.info(`Scanning table: ${recentlyFinishedTable}`);
  
  const recordsNeedingSync = [];
  const stats = {
    totalScanned: 0,
    needsSync: 0,
    alreadyCorrect: 0,
    gameNotFound: 0,
    gameHasNoTiming: 0,
  };
  
  let lastEvaluatedKey = undefined;
  
  do {
    const scanParams = {
      TableName: recentlyFinishedTable,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: 'id, gameId, #name, finishedAt, totalDuration, gameStartDateTime',
      ExpressionAttributeNames: {
        '#name': 'name'
      }
    };
    
    const result = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = result.Items || [];
    
    for (const record of items) {
      stats.totalScanned++;
      
      // Look up the corresponding Game record
      const gameResult = await ddbDocClient.send(new GetCommand({
        TableName: gameTable,
        Key: { id: record.gameId },
        ProjectionExpression: 'id, gameEndDateTime, totalDuration, gameActualStartDateTime'
      }));
      
      const game = gameResult.Item;
      
      if (!game) {
        stats.gameNotFound++;
        continue;
      }
      
      // Check if Game has timing data
      if (!game.gameEndDateTime && !game.totalDuration) {
        stats.gameHasNoTiming++;
        continue;
      }
      
      // Check if RecentlyFinishedGame needs updating
      const needsFinishedAtUpdate = game.gameEndDateTime && record.finishedAt !== game.gameEndDateTime;
      const needsDurationUpdate = game.totalDuration && record.totalDuration !== game.totalDuration;
      
      if (needsFinishedAtUpdate || needsDurationUpdate) {
        stats.needsSync++;
        recordsNeedingSync.push({
          id: record.id,
          gameId: record.gameId,
          name: record.name,
          current: {
            finishedAt: record.finishedAt,
            totalDuration: record.totalDuration,
          },
          correct: {
            finishedAt: game.gameEndDateTime,
            totalDuration: game.totalDuration,
          },
          updates: {
            finishedAt: needsFinishedAtUpdate,
            totalDuration: needsDurationUpdate,
          }
        });
      } else {
        stats.alreadyCorrect++;
      }
    }
    
    if (stats.totalScanned % 50 === 0) {
      logger.info(`Scanned ${stats.totalScanned} records, found ${stats.needsSync} needing sync...`);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return { recordsNeedingSync, stats };
}

// ------------------------------------------------------------------
// SYNC RECORDS
// ------------------------------------------------------------------

async function syncRecord(record) {
  const tableName = getTableName('RecentlyFinishedGame');
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  const updates = {};
  const fieldsUpdated = [];
  
  if (record.updates.finishedAt && record.correct.finishedAt) {
    updates.finishedAt = record.correct.finishedAt;
    fieldsUpdated.push('finishedAt');
  }
  
  if (record.updates.totalDuration && record.correct.totalDuration) {
    updates.totalDuration = record.correct.totalDuration;
    fieldsUpdated.push('totalDuration');
  }
  
  if (fieldsUpdated.length === 0) {
    return { success: false, reason: 'No fields to update' };
  }
  
  updates.updatedAt = now;
  updates._lastChangedAt = timestamp;
  
  if (DRY_RUN) {
    return { success: true, dryRun: true, fieldsUpdated };
  }
  
  try {
    const updateExpression = 'SET ' + Object.keys(updates).map(key => `#${key} = :${key}`).join(', ');
    const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
    const expressionAttributeValues = Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]]));
    
    await ddbDocClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id: record.id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }));
    
    return { success: true, fieldsUpdated };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function syncRecords(records) {
  const results = {
    synced: 0,
    failed: 0,
    errors: [],
    details: [],
  };
  
  for (let i = 0; i < records.length; i += UPDATE_BATCH_SIZE) {
    const batch = records.slice(i, i + UPDATE_BATCH_SIZE);
    
    for (const record of batch) {
      try {
        const syncResult = await syncRecord(record);
        
        if (syncResult.success) {
          results.synced++;
          results.details.push({
            id: record.id,
            name: record.name,
            status: 'SYNCED',
            fieldsUpdated: syncResult.fieldsUpdated,
            oldFinishedAt: record.current.finishedAt,
            newFinishedAt: record.correct.finishedAt,
            oldDuration: record.current.totalDuration,
            newDuration: record.correct.totalDuration,
          });
          logger.fix(`${record.name} - Synced: ${syncResult.fieldsUpdated.join(', ')}`);
        } else {
          results.failed++;
          results.errors.push({ id: record.id, error: syncResult.error || syncResult.reason });
          logger.error(`${record.name} - ${syncResult.error || syncResult.reason}`);
        }
        
      } catch (e) {
        results.failed++;
        results.errors.push({ id: record.id, error: e.message });
        logger.error(`${record.name} - ${e.message}`);
      }
    }
    
    const processed = Math.min(i + UPDATE_BATCH_SIZE, records.length);
    logger.info(`Progress: ${processed}/${records.length} records processed`);
    
    if (i + UPDATE_BATCH_SIZE < records.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
  
  return results;
}

// ------------------------------------------------------------------
// GENERATE REPORT
// ------------------------------------------------------------------

async function generateReport(records, stats, syncResults, timestamp) {
  const reportDir = path.join(REPORT_OUTPUT_DIR, `sync_recently_finished_${config.ENV_SUFFIX}_${timestamp}`);
  await fs.mkdir(reportDir, { recursive: true });
  
  const summaryPath = path.join(reportDir, 'summary.txt');
  const summaryContent = `
RECENTLY FINISHED GAME TIMING SYNC REPORT
==========================================
Generated: ${new Date().toISOString()}
Environment: ${SELECTED_ENV.toUpperCase()}
Dry Run: ${DRY_RUN ? 'YES' : 'NO'}

SCAN STATISTICS
---------------
Total RecentlyFinishedGame records: ${stats.totalScanned}
Need sync from Game table: ${stats.needsSync}
Already correct: ${stats.alreadyCorrect}
Game not found: ${stats.gameNotFound}
Game has no timing data: ${stats.gameHasNoTiming}

SYNC RESULTS
------------
Successfully synced: ${syncResults.synced}
Failed to sync: ${syncResults.failed}

${syncResults.errors.length > 0 ? `
ERRORS
------
${syncResults.errors.map(e => `${e.id}: ${e.error}`).join('\n')}
` : ''}

WHAT WAS SYNCED
---------------
For each RecentlyFinishedGame record:
- finishedAt: Synced from Game.gameEndDateTime
- totalDuration: Synced from Game.totalDuration

NOTE: Run backfill-game-duration-fields.mjs FIRST to fix the Game table,
then run this script to sync the fixes to RecentlyFinishedGame.
`;
  
  await fs.writeFile(summaryPath, summaryContent);
  logger.success(`Summary saved to: ${summaryPath}`);
  
  if (syncResults.details.length > 0) {
    const csvPath = path.join(reportDir, 'synced_records.csv');
    const headers = [
      'id', 'name', 'status',
      'oldFinishedAt', 'newFinishedAt',
      'oldDuration', 'newDuration', 'durationChange'
    ];
    
    const rows = syncResults.details.map(d => {
      const oldHours = d.oldDuration ? (d.oldDuration / 3600).toFixed(1) : '';
      const newHours = d.newDuration ? (d.newDuration / 3600).toFixed(1) : '';
      const change = d.oldDuration && d.newDuration 
        ? `${oldHours}h → ${newHours}h`
        : '';
      
      return [
        d.id,
        `"${(d.name || '').replace(/"/g, '""')}"`,
        d.status,
        d.oldFinishedAt || '',
        d.newFinishedAt || '',
        d.oldDuration || '',
        d.newDuration || '',
        change,
      ].join(',');
    });
    
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
  console.log('║        RECENTLY FINISHED GAME TIMING SYNC SCRIPT                  ║');
  console.log('║        Syncs corrected timing from Game → RecentlyFinishedGame    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  Run backfill-game-duration-fields.mjs FIRST to fix Game table!\n');

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
  SELECTED_ENV = await selectEnvironment();
  config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`Game table: ${getTableName('Game')}`);
  logger.info(`RecentlyFinishedGame table: ${getTableName('RecentlyFinishedGame')}`);
  logger.info(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will modify data!)'}`);
  console.log('─'.repeat(70) + '\n');

  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    logger.warn('⚠️  You are about to MODIFY PRODUCTION data!');
    logger.warn('⚠️  Make sure you have run backfill-game-duration-fields.mjs first!');
    const confirm = await askQuestion('Type "sync prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'sync prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.warn('AWS credentials not found in environment variables.');
    logger.info('Using default credential chain (profile, instance role, etc.)');
  }

  const timestamp = makeTimestamp();

  // Step 1: Find records needing sync
  logger.info('\n📊 STEP 1: Finding RecentlyFinishedGame records that need sync...\n');
  const { recordsNeedingSync, stats } = await findRecordsNeedingSync();
  
  console.log('\n' + '─'.repeat(70));
  logger.info('SCAN RESULTS:');
  logger.info(`  Total records scanned: ${stats.totalScanned}`);
  logger.info(`  Need sync: ${stats.needsSync}`);
  logger.info(`  Already correct: ${stats.alreadyCorrect}`);
  logger.info(`  Game not found: ${stats.gameNotFound}`);
  logger.info(`  Game has no timing: ${stats.gameHasNoTiming}`);
  console.log('─'.repeat(70) + '\n');

  if (recordsNeedingSync.length === 0) {
    logger.success('No records need syncing! All timing data is already correct.');
    return;
  }

  // Show sample
  logger.info('Sample of records needing sync:');
  const sample = recordsNeedingSync.slice(0, 5);
  for (const record of sample) {
    console.log(`\n  📋 ${record.name}`);
    console.log(`     ID: ${record.id}`);
    console.log(`     finishedAt: ${record.current.finishedAt || 'null'} → ${record.correct.finishedAt || 'null'}`);
    console.log(`     totalDuration: ${formatDuration(record.current.totalDuration)} → ${formatDuration(record.correct.totalDuration)}`);
  }
  if (recordsNeedingSync.length > 5) {
    console.log(`\n  ... and ${recordsNeedingSync.length - 5} more`);
  }
  console.log('');

  if (!DRY_RUN) {
    const confirmSync = await askQuestion(`\nSync ${recordsNeedingSync.length} records? Type "sync" to continue: `);
    if (confirmSync.toLowerCase().trim() !== 'sync') {
      logger.info('Aborted by user.');
      return;
    }
  }

  // Step 2: Sync records
  logger.info('\n🔧 STEP 2: Syncing timing data from Game to RecentlyFinishedGame...\n');
  const syncResults = await syncRecords(recordsNeedingSync);

  // Step 3: Generate report
  logger.info('\n📝 STEP 3: Generating report...\n');
  const reportDir = await generateReport(recordsNeedingSync, stats, syncResults, timestamp);

  // Final summary
  console.log('\n' + '═'.repeat(70));
  logger.success('SYNC COMPLETE!');
  console.log('═'.repeat(70));
  console.log(`
  Records synced: ${syncResults.synced}
  Records failed: ${syncResults.failed}
  
  Report saved to: ${reportDir}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
  `);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
