#!/usr/bin/env node
/**
 * ===================================================================
 * Backfill DataStore Sync Fields for Player Metrics Tables
 * ===================================================================
 * 
 * This script adds missing _version and _lastChangedAt fields to
 * EntityPlayerMetrics, VenuePlayerMetrics, and GlobalPlayerMetrics
 * records that were created via direct DynamoDB writes.
 * 
 * ROOT CAUSE:
 * The refreshPlayerMetrics Lambda uses direct DynamoDB PutCommand
 * instead of Amplify DataStore, so it doesn't auto-populate the
 * _version and _lastChangedAt fields required by @model types.
 * 
 * FIX STRATEGY:
 * Scan each metrics table for records missing _version field,
 * then update them with _version: 1 and _lastChangedAt: Date.now()
 * 
 * Usage:
 *   node backfill-metrics-sync-fields.mjs                        # Interactive env selection + preview
 *   node backfill-metrics-sync-fields.mjs --execute              # Interactive env selection + execute
 *   node backfill-metrics-sync-fields.mjs --table entity         # Fix only EntityPlayerMetrics
 *   node backfill-metrics-sync-fields.mjs --table venue          # Fix only VenuePlayerMetrics
 *   node backfill-metrics-sync-fields.mjs --table global         # Fix only GlobalPlayerMetrics
 * 
 * ===================================================================
 */

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
  table: null,  // null = all tables, or 'entity', 'venue', 'global'
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
    case '--table':
    case '-t':
      options.table = args[++i];
      if (!['entity', 'venue', 'global'].includes(options.table)) {
        console.error(`Invalid table: ${options.table}. Must be 'entity', 'venue', or 'global'`);
        process.exit(1);
      }
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Backfill DataStore Sync Fields for Player Metrics Tables

This script adds missing _version and _lastChangedAt fields to metrics
records that were created via direct DynamoDB writes (bypassing DataStore).

Usage:
  node backfill-metrics-sync-fields.mjs [options]

Options:
  --preview, -p        Preview changes without executing (default)
  --execute, -e        Execute the fixes
  --table, -t <n>   Fix only specific table: 'entity', 'venue', or 'global'
  --verbose, -v        Show detailed output
  --help, -h           Show this help message

Examples:
  # Preview all tables
  node backfill-metrics-sync-fields.mjs --preview

  # Fix only EntityPlayerMetrics
  node backfill-metrics-sync-fields.mjs --execute --table entity

  # Fix all tables
  node backfill-metrics-sync-fields.mjs --execute
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
 * Scan for all items missing _version field
 */
async function findRecordsMissingSyncFields(tableName) {
  const items = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'attribute_not_exists(#v)',
      ExpressionAttributeNames: { '#v': '_version' },
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
 * Count total records in table (for progress)
 */
async function countTotalRecords(tableName) {
  let count = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      Select: 'COUNT',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    count += response.Count || 0;
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return count;
}

/**
 * Update a single record with sync fields
 */
async function addSyncFields(tableName, recordId) {
  const now = Date.now();
  
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { id: recordId },
    UpdateExpression: 'SET #v = :v, #lca = :lca',
    ExpressionAttributeNames: {
      '#v': '_version',
      '#lca': '_lastChangedAt',
    },
    ExpressionAttributeValues: {
      ':v': 1,
      ':lca': now,
    },
  }));
}

/**
 * Process a single table
 */
async function processTable(tableKey, tableName) {
  console.log('');
  console.log('-'.repeat(60));
  console.log(`Processing: ${tableKey.toUpperCase()} (${tableName})`);
  console.log('-'.repeat(60));
  
  // Count totals
  const totalRecords = await countTotalRecords(tableName);
  console.log(`  Total records in table: ${totalRecords}`);
  
  // Find records missing sync fields
  console.log('  Scanning for records missing _version...');
  const missing = await findRecordsMissingSyncFields(tableName);
  
  console.log(`  Records missing sync fields: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log('  ✅ All records have sync fields!');
    return { table: tableKey, total: totalRecords, missing: 0, fixed: 0, errors: 0 };
  }
  
  const percentMissing = ((missing.length / totalRecords) * 100).toFixed(1);
  console.log(`  Percentage needing fix: ${percentMissing}%`);
  
  // Show sample records
  if (options.verbose && missing.length > 0) {
    console.log('');
    console.log('  Sample records to fix:');
    const samples = missing.slice(0, 5);
    for (const record of samples) {
      const idShort = record.id?.substring(0, 30) || 'N/A';
      const timeRange = record.timeRange || 'N/A';
      console.log(`    - ${idShort}... (timeRange: ${timeRange})`);
    }
    if (missing.length > 5) {
      console.log(`    ... and ${missing.length - 5} more`);
    }
  }
  
  // Execute if requested
  if (options.execute) {
    console.log('');
    console.log('  Updating records...');
    
    let fixed = 0;
    let errors = 0;
    
    for (const record of missing) {
      try {
        await addSyncFields(tableName, record.id);
        fixed++;
        
        // Progress indicator
        if (fixed % 10 === 0) {
          process.stdout.write('.');
        }
        if (fixed % 100 === 0) {
          process.stdout.write(` ${fixed}/${missing.length}\n  `);
        }
        
        // Rate limiting - avoid throttling
        if (fixed % 25 === 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (err) {
        console.error(`\n  ❌ Error updating ${record.id}: ${err.message}`);
        errors++;
      }
    }
    
    console.log(`\n  ✅ Fixed ${fixed} records (${errors} errors)`);
    return { table: tableKey, total: totalRecords, missing: missing.length, fixed, errors };
  } else {
    return { table: tableKey, total: totalRecords, missing: missing.length, fixed: 0, errors: 0 };
  }
}

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        BACKFILL DATASTORE SYNC FIELDS                             ║');
  console.log('║        Fixes missing _version and _lastChangedAt fields           ║');
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
// MAIN
// ============================================================================

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  CONFIG = ENVIRONMENTS[SELECTED_ENV];

  // Build table names based on selected environment
  const METRICS_TABLES = {
    entity: getTableName('EntityPlayerMetrics'),
    venue: getTableName('VenuePlayerMetrics'),
    global: getTableName('GlobalPlayerMetrics'),
  };

  console.log('\n' + '─'.repeat(70));
  console.log(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`API ID: ${CONFIG.API_ID}`);
  console.log(`Mode: ${options.execute ? '🔧 EXECUTE' : '👁️  PREVIEW'}`);
  if (options.table) {
    console.log(`Table filter: ${options.table}`);
  }
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

  // Determine which tables to process
  const tablesToProcess = options.table 
    ? { [options.table]: METRICS_TABLES[options.table] }
    : METRICS_TABLES;
  
  const results = [];
  
  for (const [tableKey, tableName] of Object.entries(tablesToProcess)) {
    try {
      const result = await processTable(tableKey, tableName);
      results.push(result);
    } catch (err) {
      console.error(`\n❌ Error processing ${tableKey}: ${err.message}`);
      results.push({ table: tableKey, error: err.message });
    }
  }
  
  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  
  let totalMissing = 0;
  let totalFixed = 0;
  let totalErrors = 0;
  
  for (const result of results) {
    if (result.error) {
      console.log(`  ${result.table}: ERROR - ${result.error}`);
    } else {
      console.log(`  ${result.table.padEnd(8)}: ${result.missing} missing, ${result.fixed} fixed, ${result.errors} errors`);
      totalMissing += result.missing;
      totalFixed += result.fixed;
      totalErrors += result.errors;
    }
  }
  
  console.log('-'.repeat(50));
  console.log(`  TOTAL: ${totalMissing} missing, ${totalFixed} fixed, ${totalErrors} errors`);
  
  if (!options.execute && totalMissing > 0) {
    console.log('');
    console.log('💡 Run with --execute to apply these fixes');
  }
  
  console.log('');
  console.log('✅ Done!');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Script failed:', err);
  process.exit(1);
});
