#!/usr/bin/env node
// ============================================================================
// RECURRING GAME MIGRATION - ADD REQUIRED FIELDS
// ============================================================================
// Fixes RecurringGame records missing required fields: gameVariant, frequency
//
// USAGE:
//   node migrate-recurring-games-required-fields.js [options]
//
// OPTIONS:
//   --preview, -p          Preview changes without executing (default)
//   --execute, -e          Execute the migration
//   --venue-id <id>        Only migrate for specific venue (optional)
//   --help, -h             Show this help message
//
// ============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  RATE_LIMIT_DELAY: 50,
};

// Runtime state
let SELECTED_ENV = null;
let ENV_CONFIG = null;

// Helper to get full table name
const getTableName = (modelName) => `${modelName}-${ENV_CONFIG.API_ID}-${ENV_CONFIG.ENV_SUFFIX}`;

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  step: (n, total, msg) => console.log(`\n[STEP ${n}/${total}] ${msg}`),
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

// ============================================================================
// DETECTION LOGIC
// ============================================================================

/**
 * Detect game variant from name
 * Priority: Uses name patterns to infer variant
 */
const detectGameVariant = (name) => {
  if (!name) return 'NLHE';

  const nameLower = name.toLowerCase();

  if (/\bplo5\b|pot.?limit.?omaha.?5|5.?card.?plo|plo.?5/i.test(nameLower)) return 'PLO5';
  if (/\bplo4?\b|pot.?limit.?omaha|omaha/i.test(nameLower)) return 'PLO';
  if (/\bmixed\b|horse|h\.?o\.?r\.?s\.?e/i.test(nameLower)) return 'MIXED';
  if (/\bstud\b|7.?card/i.test(nameLower)) return 'STUD';
  if (/\brazz\b/i.test(nameLower)) return 'RAZZ';
  if (/\bdraw\b|2-7|27/i.test(nameLower)) return 'DRAW';
  if (/\blimit\b(?!.*(no|pot))/i.test(nameLower)) return 'LHE';

  return 'NLHE';
};

/**
 * Detect frequency from name
 * Priority: 1. Explicit keywords, 2. Day patterns → WEEKLY, 3. Month patterns → MONTHLY, 4. Default WEEKLY
 */
const detectFrequency = (name) => {
  if (!name) return 'WEEKLY';

  const nameLower = name.toLowerCase();

  // Check for explicit frequency keywords first
  if (/\bweekly\b/i.test(nameLower)) return 'WEEKLY';
  if (/\bmonthly\b/i.test(nameLower)) return 'MONTHLY';
  if (/\bdaily\b/i.test(nameLower)) return 'DAILY';
  if (/\bfortnightly\b|\bbi-?weekly\b/i.test(nameLower)) return 'BIWEEKLY';

  // Check for day names/abbreviations → WEEKLY
  const dayPatterns = [
    /\bmon(?:day)?\b/i,
    /\btue(?:s(?:day)?)?\b/i,
    /\bwed(?:nesday)?\b/i,
    /\bthu(?:rs(?:day)?)?\b/i,
    /\bfri(?:day)?\b/i,
    /\bsat(?:urday)?\b/i,
    /\bsun(?:day)?\b/i,
  ];

  for (const pattern of dayPatterns) {
    if (pattern.test(nameLower)) return 'WEEKLY';
  }

  // Check for month names/abbreviations → MONTHLY
  const monthPatterns = [
    /\bjan(?:uary)?\b/i,
    /\bfeb(?:ruary)?\b/i,
    /\bmar(?:ch)?\b/i,
    /\bapr(?:il)?\b/i,
    /\bmay\b/i,
    /\bjun(?:e)?\b/i,
    /\bjul(?:y)?\b/i,
    /\baug(?:ust)?\b/i,
    /\bsep(?:t(?:ember)?)?\b/i,
    /\boct(?:ober)?\b/i,
    /\bnov(?:ember)?\b/i,
    /\bdec(?:ember)?\b/i,
    /\b1st\s+(of\s+)?(the\s+)?month\b/i,
    /\bfirst\s+(of\s+)?(the\s+)?month\b/i,
    /\blast\s+(of\s+)?(the\s+)?month\b/i,
    /\bend\s+of\s+month\b/i,
  ];

  for (const pattern of monthPatterns) {
    if (pattern.test(nameLower)) return 'MONTHLY';
  }

  // Default to WEEKLY (most common for recurring poker games)
  return 'WEEKLY';
};

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         RECURRING GAME MIGRATION - ADD REQUIRED FIELDS            ║');
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
 * Get all recurring games that need fixing
 */
const getRecurringGamesNeedingFix = async (venueId = null) => {
  const games = [];
  let lastKey = null;
  const tableName = getTableName('RecurringGame');

  do {
    const params = {
      TableName: tableName,
    };

    if (venueId) {
      params.FilterExpression = 'venueId = :vid';
      params.ExpressionAttributeValues = { ':vid': venueId };
    }

    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddbDocClient.send(new ScanCommand(params));

    // Filter to games missing required fields
    const needsFix = (result.Items || []).filter(
      (game) => !game.gameVariant || !game.frequency
    );

    games.push(...needsFix);
    lastKey = result.LastEvaluatedKey;

    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastKey);

  return games;
};

/**
 * Update a recurring game with missing fields
 */
const fixRecurringGame = async (game, dryRun = false) => {
  const updates = {};
  const expressionParts = [];
  const names = {};
  const values = {};

  if (!game.gameVariant) {
    const variant = detectGameVariant(game.name);
    expressionParts.push('#gameVariant = :gameVariant');
    names['#gameVariant'] = 'gameVariant';
    values[':gameVariant'] = variant;
    updates.gameVariant = variant;
  }

  if (!game.frequency) {
    const frequency = detectFrequency(game.name);
    expressionParts.push('#frequency = :frequency');
    names['#frequency'] = 'frequency';
    values[':frequency'] = frequency;
    updates.frequency = frequency;
  }

  if (dryRun || expressionParts.length === 0) {
    return updates;
  }

  // Update _lastChangedAt for DataStore sync
  expressionParts.push('#lastChangedAt = :lastChangedAt');
  names['#lastChangedAt'] = '_lastChangedAt';
  values[':lastChangedAt'] = Date.now();

  // Increment _version
  expressionParts.push('#version = #version + :one');
  names['#version'] = '_version';
  values[':one'] = 1;

  const tableName = getTableName('RecurringGame');

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: game.id },
      UpdateExpression: 'SET ' + expressionParts.join(', '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );

  return updates;
};

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

async function performMigration(venueId, dryRun) {
  const tableName = getTableName('RecurringGame');
  logger.info(`Table: ${tableName}`);

  // Get games needing fix
  logger.info('Scanning for records with missing fields...');
  const games = await getRecurringGamesNeedingFix(venueId);

  logger.info(`Found ${games.length} records needing updates\n`);

  if (games.length === 0) {
    logger.success('All records have required fields. Nothing to do.');
    return { success: true, updated: 0, errors: 0 };
  }

  // Show what will be updated
  const summary = {
    missingGameVariant: 0,
    missingFrequency: 0,
    missingBoth: 0,
  };

  for (const game of games) {
    const missingVariant = !game.gameVariant;
    const missingFreq = !game.frequency;

    if (missingVariant && missingFreq) summary.missingBoth++;
    else if (missingVariant) summary.missingGameVariant++;
    else if (missingFreq) summary.missingFrequency++;

    const detectedVariant = detectGameVariant(game.name);
    const detectedFrequency = detectFrequency(game.name);
    console.log(`  ${game.name || game.id}`);
    if (missingVariant) console.log(`    → gameVariant: null → ${detectedVariant}`);
    if (missingFreq) console.log(`    → frequency: null → ${detectedFrequency}`);
  }

  console.log('\n  Summary:');
  console.log(`    Missing gameVariant only: ${summary.missingGameVariant}`);
  console.log(`    Missing frequency only: ${summary.missingFrequency}`);
  console.log(`    Missing both: ${summary.missingBoth}`);
  console.log(`    Total to update: ${games.length}`);
  console.log('');

  if (dryRun) {
    logger.info('DRY RUN: No changes were made.');
    return { success: true, updated: 0, wouldUpdate: games.length, errors: 0 };
  }

  // Execute updates
  logger.info('Applying updates...');
  let updated = 0;
  let errors = 0;

  for (const game of games) {
    try {
      const updates = await fixRecurringGame(game, false);
      updated++;
      console.log(`  ✓ ${game.name || game.id}: ${JSON.stringify(updates)}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${game.name || game.id}: ${err.message}`);
    }

    await sleep(CONFIG.RATE_LIMIT_DELAY);
  }

  return { success: errors === 0, updated, errors };
}

// ============================================================================
// CLI PARSING
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true, // Default to preview mode
    venueId: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--execute' || arg === '-e') {
      options.dryRun = false;
    } else if (arg === '--preview' || arg === '-p') {
      options.dryRun = true;
    } else if (arg === '--venue-id' && args[i + 1]) {
      options.venueId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║         RECURRING GAME MIGRATION - ADD REQUIRED FIELDS            ║
╚════════════════════════════════════════════════════════════════════╝

USAGE:
  node migrate-recurring-games-required-fields.mjs [options]

OPTIONS:
  --preview, -p          Preview changes without executing (default)
  --execute, -e          Execute the migration
  --venue-id <id>        Only migrate for specific venue (optional)
  --help, -h             Show this help message

EXAMPLES:
  # Preview all venues
  node migrate-recurring-games-required-fields.mjs --preview

  # Execute migration for all venues
  node migrate-recurring-games-required-fields.mjs --execute

  # Execute for specific venue
  node migrate-recurring-games-required-fields.mjs --execute --venue-id abc123

WHAT THIS SCRIPT DOES:
  Adds missing required fields to RecurringGame records:
  
  • gameVariant: Detected from name patterns (PLO, Mixed, Stud, etc.)
                 Defaults to NLHE
  
  • frequency:   Detected from name patterns:
                 - Day names (Mon, Monday, etc.) → WEEKLY
                 - Month names (Jan, January, etc.) → MONTHLY
                 - Keywords (weekly, monthly, daily) → respective value
                 Defaults to WEEKLY

DETECTION EXAMPLES:
  "Monday $5k GTD"           → gameVariant: NLHE,  frequency: WEEKLY
  "Thursday PLO Tournament"  → gameVariant: PLO,   frequency: WEEKLY
  "January Main Event"       → gameVariant: NLHE,  frequency: MONTHLY
  "Monthly Deep Stack"       → gameVariant: NLHE,  frequency: MONTHLY
  "Weekly Omaha Cash"        → gameVariant: PLO,   frequency: WEEKLY
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

  console.log(`  Mode:     ${options.dryRun ? 'PREVIEW (no changes)' : 'EXECUTE'}`);

  // Confirmation for execute mode
  if (!options.dryRun) {
    console.log('\n' + '─'.repeat(70));
    console.log('This will update RecurringGame records to add:');
    console.log('  • gameVariant (detected from name, defaults to NLHE)');
    console.log('  • frequency (detected from name, defaults to WEEKLY)');
    console.log('─'.repeat(70));

    let confirmPrompt;
    if (SELECTED_ENV === 'prod') {
      confirmPrompt = `\n⚠️  You are about to update PRODUCTION data!\nType "migrate prod" to confirm: `;
    } else {
      confirmPrompt = `\nType "migrate" to confirm: `;
    }

    const confirm = await askQuestion(confirmPrompt);

    if (SELECTED_ENV === 'prod' && confirm.trim() !== 'migrate prod') {
      logger.info('Aborted.');
      process.exit(0);
    } else if (SELECTED_ENV !== 'prod' && confirm.trim() !== 'migrate') {
      logger.info('Aborted.');
      process.exit(0);
    }
  }

  console.log('\n' + '═'.repeat(70));

  // Perform migration
  const result = await performMigration(options.venueId, options.dryRun);

  // Summary
  console.log('\n' + '═'.repeat(70));
  logger.success('MIGRATION COMPLETE');
  console.log('═'.repeat(70));

  if (options.dryRun) {
    console.log('\n  🔍 This was a PREVIEW - no actual changes were made');
    console.log(`     Would update: ${result.wouldUpdate || 0} records`);
    console.log('\n  Run with --execute to apply these changes.');
  } else {
    console.log(`\n  📊 Results:`);
    console.log(`     Updated: ${result.updated}`);
    console.log(`     Errors:  ${result.errors}`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  process.exit(result.success ? 0 : 1);
}

// Execute
main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
