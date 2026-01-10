#!/usr/bin/env node
// ============================================================================
// RECURRING GAME DATA RESET SCRIPT
// ============================================================================
// Interactive script to reset RecurringGame data and clear assignments.
//
// ⚠️ WARNING: Deletion is irreversible!
//
// USAGE:
//   node resetRecurringGames.js [options]
//
// OPTIONS:
//   --dry-run              Preview changes without executing
//   --venue-id <id>        Only reset for specific venue (optional)
//   --skip-backup          Skip backup before reset
//   --skip-instances       Skip clearing RecurringGameInstance table
//   --help                 Show this help message
//
// WHAT THIS SCRIPT DOES:
//   1. Backs up RecurringGame and RecurringGameInstance tables
//   2. Deletes all RecurringGame records (or only for specified venue)
//   3. Clears recurringGameId from all Game records
//   4. Optionally clears RecurringGameInstance records
//   5. Resets RecurringGameMetrics
//
// AFTER RUNNING:
//   Re-run your scraper or trigger game reprocessing to rebuild
//   recurring game assignments with the improved matching logic.
//
// ============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// ENVIRONMENT CONFIGURATIONS
// ============================================================================

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
    BACKUP_PREFIX: 'recurring_backup_dev',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
    BACKUP_PREFIX: 'recurring_backup_prod',
  },
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  DATA_OUTPUT_DIR: process.env.DATA_OUTPUT_DIR || '../../Data',
  BATCH_SIZE: 25,
  RATE_LIMIT_DELAY: 50,
};

// Runtime state
let SELECTED_ENV = null;
let ENV_CONFIG = null;

// Helper to get full table name
const getTableName = (modelName) => `${modelName}-${ENV_CONFIG.API_ID}-${ENV_CONFIG.ENV_SUFFIX}`;

// ============================================================================
// TABLES TO PROCESS
// ============================================================================

const RECURRING_TABLES = [
  'RecurringGame',
  'RecurringGameInstance',
  'RecurringGameMetrics',
];

// Fields to clear on Game records
const GAME_RECURRING_FIELDS_TO_CLEAR = [
  'recurringGameId',
  'recurringGameAssignmentStatus',
  'recurringGameAssignmentConfidence',
  'recurringGameInstanceId',
];

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  step: (n, total, msg) => console.log(`\n[STEP ${n}/${total}] ${msg}`),
  progress: (current, total, item) => {
    const pct = Math.round((current / total) * 100);
    process.stdout.write(`\r  Processing: ${current}/${total} (${pct}%) - ${item.slice(0, 40).padEnd(40)}`);
  },
};

// ============================================================================
// AWS CLIENTS
// ============================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function makeTimestampedDirName(prefix) {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${timestamp}`;
}

function convertToCsv(items) {
  if (items.length === 0) return '';
  const allKeys = new Set();
  items.forEach((item) => Object.keys(item).forEach((key) => allKeys.add(key)));
  const headers = Array.from(allKeys);
  const headerRow = headers.map(sanitizeCell).join(',');
  const dataRows = items.map((item) =>
    headers.map((h) => sanitizeCell(item[h])).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

function sanitizeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' || Array.isArray(value)) {
    value = JSON.stringify(value);
  }
  let strValue = String(value);
  strValue = strValue.replace(/"/g, '""');
  if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
    strValue = `"${strValue}"`;
  }
  return strValue;
}

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              RECURRING GAME DATA RESET SCRIPT                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalized = answer.toLowerCase().trim();

  if (normalized === '1' || normalized === 'dev') {
    return 'dev';
  } else if (normalized === '2' || normalized === 'prod') {
    return 'prod';
  } else {
    logger.error('Invalid selection. Exiting.');
    process.exit(1);
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Scan all items from a table (with optional venue filter)
 */
async function scanTable(tableName, venueId = null) {
  const items = [];
  let lastKey = null;

  do {
    const params = {
      TableName: tableName,
    };

    if (venueId) {
      params.FilterExpression = 'venueId = :vid';
      params.ExpressionAttributeValues = { ':vid': venueId };
    }

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await ddbDocClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;

    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastKey);

  return items;
}

/**
 * Scan ALL games (optionally filtered by venue)
 * We reset ALL games to PENDING_ASSIGNMENT so they can be reprocessed
 */
async function scanGamesForRecurringReset(venueId = null) {
  const items = [];
  let lastKey = null;
  const tableName = getTableName('Game');

  logger.info('Scanning ALL games for recurring status reset...');

  do {
    const params = {
      TableName: tableName,
    };

    // If venue specified, filter by venue
    if (venueId) {
      params.FilterExpression = 'venueId = :vid';
      params.ExpressionAttributeValues = { ':vid': venueId };
    }

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await ddbDocClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;

    process.stdout.write(`\r  Found ${items.length} games so far...`);
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastKey);

  console.log(''); // New line
  
  // Show current status breakdown
  const statusCounts = {};
  items.forEach(g => {
    const status = g.recurringGameAssignmentStatus || '(empty)';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  logger.info('Current status breakdown:');
  Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    console.log(`    ${status}: ${count}`);
  });
  
  return items;
}

/**
 * Get table key schema
 */
async function getTableKeySchema(tableName) {
  try {
    const { DynamoDBClient, DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
    const client = new DynamoDBClient({ region: CONFIG.REGION });
    const result = await client.send(new DescribeTableCommand({ TableName: tableName }));
    return result.Table?.KeySchema || [{ AttributeName: 'id', KeyType: 'HASH' }];
  } catch (err) {
    // Default to 'id' if describe fails
    return [{ AttributeName: 'id', KeyType: 'HASH' }];
  }
}

/**
 * Delete items from table in batches
 */
async function batchDeleteItems(tableName, items, dryRun = false) {
  if (items.length === 0) return 0;

  const keySchema = await getTableKeySchema(tableName);
  const keyNames = keySchema.map((k) => k.AttributeName);

  let deleted = 0;

  for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
    const batch = items.slice(i, i + CONFIG.BATCH_SIZE);

    const deleteRequests = batch.map((item) => {
      const key = {};
      keyNames.forEach((keyName) => {
        key[keyName] = item[keyName];
      });
      return { DeleteRequest: { Key: key } };
    });

    if (!dryRun) {
      await ddbDocClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: deleteRequests,
          },
        })
      );
    }

    deleted += batch.length;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  }

  return deleted;
}

/**
 * Clear recurring fields from Game records
 */
async function clearGameRecurringFields(games, dryRun = false) {
  const tableName = getTableName('Game');
  let updated = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];

    if (!dryRun) {
      try {
        await ddbDocClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id: game.id },
            UpdateExpression:
              'REMOVE recurringGameId, recurringGameInstanceId, recurringGameAssignmentConfidence ' +
              'SET recurringGameAssignmentStatus = :status, ' +
              'updatedAt = :now',
            ExpressionAttributeValues: {
              ':status': 'PENDING_ASSIGNMENT',  // Changed from NOT_RECURRING so games can be reprocessed
              ':now': new Date().toISOString(),
            },
          })
        );
      } catch (err) {
        logger.warn(`Failed to update game ${game.id}: ${err.message}`);
      }
    }

    updated++;
    if (i % 50 === 0) {
      logger.progress(i + 1, games.length, game.name || game.id);
    }

    await sleep(CONFIG.RATE_LIMIT_DELAY / 2);
  }

  console.log(''); // New line after progress
  return updated;
}

/**
 * Backup table to CSV file
 */
async function backupTable(tableName, items, backupDir) {
  if (items.length === 0) {
    logger.info(`  ${tableName}: 0 items (skipped)`);
    return;
  }

  const csv = convertToCsv(items);
  const fileName = `${tableName.split('-')[0]}.csv`;
  const filePath = path.join(backupDir, fileName);

  await fs.writeFile(filePath, csv, 'utf8');
  logger.info(`  ${tableName}: ${items.length} items → ${fileName}`);
}

// ============================================================================
// MAIN OPERATIONS
// ============================================================================

async function performBackup(venueId, backupDir) {
  await fs.mkdir(backupDir, { recursive: true });

  const stats = {};

  for (const model of RECURRING_TABLES) {
    const tableName = getTableName(model);
    try {
      const items = await scanTable(tableName, venueId);
      await backupTable(tableName, items, backupDir);
      stats[model] = items.length;
    } catch (err) {
      logger.warn(`Could not backup ${model}: ${err.message}`);
      stats[model] = 'ERROR';
    }
  }

  // Also backup games with recurring assignments
  const gameTableName = getTableName('Game');
  const games = await scanGamesForRecurringReset(venueId);
  await backupTable(gameTableName + '_recurring', games, backupDir);
  stats['Game (with recurringGameId)'] = games.length;

  return stats;
}

async function performReset(venueId, options) {
  const stats = {
    recurringGamesDeleted: 0,
    instancesDeleted: 0,
    metricsDeleted: 0,
    gamesCleared: 0,
  };

  // Step 1: Delete RecurringGame records
  logger.info('Scanning RecurringGame table...');
  const rgTableName = getTableName('RecurringGame');
  const recurringGames = await scanTable(rgTableName, venueId);
  logger.info(`Found ${recurringGames.length} RecurringGame records to delete`);

  if (recurringGames.length > 0) {
    stats.recurringGamesDeleted = await batchDeleteItems(rgTableName, recurringGames, options.dryRun);
    logger.info(`Deleted ${stats.recurringGamesDeleted} RecurringGame records`);
  }

  // Step 2: Delete RecurringGameInstance records (if not skipped)
  if (!options.skipInstances) {
    logger.info('Scanning RecurringGameInstance table...');
    const instanceTableName = getTableName('RecurringGameInstance');
    try {
      const instances = await scanTable(instanceTableName, venueId);
      logger.info(`Found ${instances.length} RecurringGameInstance records to delete`);

      if (instances.length > 0) {
        stats.instancesDeleted = await batchDeleteItems(instanceTableName, instances, options.dryRun);
        logger.info(`Deleted ${stats.instancesDeleted} RecurringGameInstance records`);
      }
    } catch (err) {
      logger.warn(`Could not process RecurringGameInstance: ${err.message}`);
    }
  }

  // Step 3: Delete RecurringGameMetrics records
  logger.info('Scanning RecurringGameMetrics table...');
  const metricsTableName = getTableName('RecurringGameMetrics');
  try {
    const metrics = await scanTable(metricsTableName, venueId);
    logger.info(`Found ${metrics.length} RecurringGameMetrics records to delete`);

    if (metrics.length > 0) {
      stats.metricsDeleted = await batchDeleteItems(metricsTableName, metrics, options.dryRun);
      logger.info(`Deleted ${stats.metricsDeleted} RecurringGameMetrics records`);
    }
  } catch (err) {
    logger.warn(`Could not process RecurringGameMetrics: ${err.message}`);
  }

  // Step 4: Clear recurringGameId from Game records
  logger.info('Scanning Game records with recurring assignments...');
  const games = await scanGamesForRecurringReset(venueId);
  logger.info(`Found ${games.length} Game records to clear`);

  if (games.length > 0) {
    stats.gamesCleared = await clearGameRecurringFields(games, options.dryRun);
    logger.info(`Cleared ${stats.gamesCleared} Game records`);
  }

  return stats;
}

// ============================================================================
// CLI PARSING
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    venueId: null,
    skipBackup: false,
    skipInstances: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--venue-id' && args[i + 1]) {
      options.venueId = args[++i];
    } else if (arg === '--skip-backup') {
      options.skipBackup = true;
    } else if (arg === '--skip-instances') {
      options.skipInstances = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║              RECURRING GAME DATA RESET SCRIPT                      ║
╚════════════════════════════════════════════════════════════════════╝

USAGE:
  node resetRecurringGames.js [options]

OPTIONS:
  --dry-run              Preview changes without executing
  --venue-id <id>        Only reset for specific venue (optional)
  --skip-backup          Skip backup before reset
  --skip-instances       Skip clearing RecurringGameInstance table
  --help, -h             Show this help message

EXAMPLES:
  # Preview changes for all venues
  node resetRecurringGames.js --dry-run

  # Reset only a specific venue
  node resetRecurringGames.js --venue-id abc123-def456

  # Full reset without backup
  node resetRecurringGames.js --skip-backup

WHAT THIS SCRIPT DOES:
  1. Backs up RecurringGame, RecurringGameInstance, and affected Game records
  2. Deletes all RecurringGame records (or only for specified venue)
  3. Deletes all RecurringGameInstance records (optional)
  4. Deletes all RecurringGameMetrics records
  5. Clears recurringGameId from all Game records
  6. Sets recurringGameAssignmentStatus to 'PENDING_ASSIGNMENT' for reprocessing

AFTER RUNNING:
  Re-run your scraper to re-process games. The improved matching logic
  will rebuild recurring game assignments with better consolidation.
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Select environment
  SELECTED_ENV = await selectEnvironment();
  ENV_CONFIG = ENVIRONMENTS[SELECTED_ENV];

  console.log(`\n  Selected: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`  API ID:   ${ENV_CONFIG.API_ID}`);

  if (options.venueId) {
    console.log(`  Venue:    ${options.venueId}`);
  } else {
    console.log(`  Venue:    ALL VENUES`);
  }

  if (options.dryRun) {
    console.log(`  Mode:     DRY RUN (no actual changes)`);
  }

  // Confirmation
  console.log('\n' + '─'.repeat(70));
  console.log('This will:');
  console.log('  • Delete all RecurringGame records');
  if (!options.skipInstances) {
    console.log('  • Delete all RecurringGameInstance records');
  }
  console.log('  • Delete all RecurringGameMetrics records');
  console.log('  • Clear recurringGameId from all Game records');
  if (!options.skipBackup) {
    console.log('  • Backup data before deletion');
  }
  console.log('─'.repeat(70));

  let confirmPrompt;
  if (SELECTED_ENV === 'prod') {
    confirmPrompt = `\n⚠️  You are about to reset PRODUCTION data!\nType "reset prod" to confirm: `;
  } else {
    confirmPrompt = `\nType "reset" to confirm: `;
  }

  const confirm = await askQuestion(confirmPrompt);

  if (SELECTED_ENV === 'prod' && confirm.trim() !== 'reset prod') {
    logger.info('Aborted.');
    process.exit(0);
  } else if (SELECTED_ENV !== 'prod' && confirm.trim() !== 'reset') {
    logger.info('Aborted.');
    process.exit(0);
  }

  console.log('\n' + '═'.repeat(70));

  const stats = {
    backup: null,
    reset: null,
  };

  let currentStep = 0;
  const totalSteps = options.skipBackup ? 1 : 2;

  // STEP 1: BACKUP
  if (!options.skipBackup) {
    currentStep++;
    logger.step(currentStep, totalSteps, '💾 BACKUP DATA');
    console.log('─'.repeat(70));

    const backupDir = path.join(
      CONFIG.DATA_OUTPUT_DIR,
      makeTimestampedDirName(ENV_CONFIG.BACKUP_PREFIX)
    );

    if (!options.dryRun) {
      stats.backup = await performBackup(options.venueId, backupDir);
      logger.success(`Backup saved to: ${backupDir}`);
    } else {
      logger.info('DRY RUN: Would backup tables');
      stats.backup = { dryRun: true };
    }
  }

  // STEP 2: RESET
  currentStep++;
  logger.step(currentStep, totalSteps, '🗑️  RESET RECURRING DATA');
  console.log('─'.repeat(70));

  stats.reset = await performReset(options.venueId, options);

  // SUMMARY
  console.log('\n' + '═'.repeat(70));
  logger.success('RESET COMPLETE');
  console.log('═'.repeat(70));

  if (options.dryRun) {
    console.log('\n  🔍 This was a DRY RUN - no actual changes were made');
  }

  console.log('\n  📊 Summary:');
  console.log(`     RecurringGame deleted:         ${stats.reset.recurringGamesDeleted}`);
  console.log(`     RecurringGameInstance deleted: ${stats.reset.instancesDeleted}`);
  console.log(`     RecurringGameMetrics deleted:  ${stats.reset.metricsDeleted}`);
  console.log(`     Game records cleared:          ${stats.reset.gamesCleared}`);

  console.log('\n  📝 Next Steps:');
  console.log('     1. Re-run your scraper to re-process games');
  console.log('     2. Or trigger bulk reprocessing via RecurringGameAdmin');
  console.log('     3. The improved matching logic will consolidate better');

  console.log('\n' + '═'.repeat(70) + '\n');
}

// Execute
main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
