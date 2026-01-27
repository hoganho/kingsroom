#!/usr/bin/env node
/**
 * Migration Script: Fix date formats on SocialAccount records
 * 
 * Problem:
 *   Some date fields (fullSyncOldestPostDate, lastScrapedAt, etc.) were stored 
 *   with timezone offset format like "2024-05-12T07:49:46+0000" instead of 
 *   proper ISO 8601 format "2024-05-12T07:49:46.000Z" that AppSync expects.
 * 
 *   This causes GraphQL serialization errors:
 *   "Can't serialize value: Unable to serialize `2024-05-12T07:49:46+0000` as a valid DateTime Object."
 * 
 * This script:
 * 1. Scans all SocialAccount records
 * 2. Identifies records with improperly formatted date fields
 * 3. Normalizes dates to proper ISO 8601 format (ending with Z)
 * 4. Updates the records
 * 
 * Usage:
 *   node migrate-fix-socialaccount-dates.mjs --preview
 *   node migrate-fix-socialaccount-dates.mjs --execute
 *   node migrate-fix-socialaccount-dates.mjs --execute --account-id <id>
 * 
 * Options:
 *   --preview, -p          Preview changes without executing (default)
 *   --execute, -e          Execute the migration
 *   --account-id <id>      Fix only a specific account
 *   --entity-id <id>       Filter by entity ID
 *   --limit <n>            Limit number of accounts to process
 *   --batch-size <n>       Batch size for updates (default: 25)
 *   --env <env>            Environment: 'prod' or 'dev' (default: prod)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';
import fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TABLE_CONFIG = {
  prod: {
    socialAccountTable: 'SocialAccount-ynuahifnznb5zddz727oiqnicy-prod',
  },
  dev: {
    socialAccountTable: 'SocialAccount-ht3nugt6lvddpeeuwj3x6mkite-dev',
  },
};

// Date fields to check and fix
const DATE_FIELDS = [
  'fullSyncOldestPostDate',
  'lastScrapedAt',
  'lastSuccessfulScrapeAt',
  'nextScheduledScrapeAt',
  'createdAt',
  'updatedAt',
];

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  accountId: null,
  entityId: null,
  limit: null,
  batchSize: 25,
  env: 'prod',
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
    case '--account-id':
      options.accountId = args[++i];
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
    case '--env':
      options.env = args[++i];
      break;
    case '--help':
    case '-h':
      console.log(`
Migration Script: Fix date formats on SocialAccount records

This fixes records where date fields like fullSyncOldestPostDate were stored
with timezone offset format (+0000) instead of proper ISO 8601 format (Z).

Usage:
  node migrate-fix-socialaccount-dates.mjs [options]

Options:
  --preview, -p          Preview changes without executing (default)
  --execute, -e          Execute the migration
  --account-id <id>      Fix only a specific account
  --entity-id <id>       Filter by entity ID
  --limit <n>            Limit number of accounts to process
  --batch-size <n>       Batch size for updates (default: 25)
  --env <env>            Environment: 'prod' or 'dev' (default: prod)
  --help, -h             Show this help message
      `);
      process.exit(0);
  }
}

const CONFIG = {
  region: 'ap-southeast-2',
  ...TABLE_CONFIG[options.env],
};

if (!CONFIG.socialAccountTable) {
  console.error(`❌ Unknown environment: ${options.env}`);
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
// DATE UTILITIES
// ============================================================================

/**
 * Check if a date string is in proper ISO 8601 format (ends with Z)
 */
function isProperISOFormat(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return true; // null/undefined is ok
  
  // Proper format ends with Z and has milliseconds
  // e.g., "2024-05-12T07:49:46.000Z"
  return dateStr.endsWith('Z');
}

/**
 * Normalize a date string to proper ISO 8601 format
 * Converts "2024-05-12T07:49:46+0000" to "2024-05-12T07:49:46.000Z"
 */
function normalizeToISO(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`  ⚠️  Invalid date: ${dateStr}`);
      return null;
    }
    return date.toISOString();
  } catch (err) {
    console.warn(`  ⚠️  Error parsing date: ${dateStr} - ${err.message}`);
    return null;
  }
}

/**
 * Check a record for date fields that need fixing
 * Returns an object with field names and their current/fixed values
 */
function checkDateFields(record) {
  const fixes = {};
  
  for (const field of DATE_FIELDS) {
    const value = record[field];
    if (value && !isProperISOFormat(value)) {
      const normalized = normalizeToISO(value);
      if (normalized && normalized !== value) {
        fixes[field] = {
          current: value,
          fixed: normalized,
        };
      }
    }
  }
  
  return fixes;
}

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
      resolve(answer.toLowerCase());
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Scan all social accounts (with optional filter)
 */
async function scanSocialAccounts() {
  console.log(`\n📂 Scanning ${CONFIG.socialAccountTable}...`);
  
  const accounts = [];
  let lastKey = undefined;
  let scanCount = 0;
  
  do {
    const params = {
      TableName: CONFIG.socialAccountTable,
      ExclusiveStartKey: lastKey,
    };
    
    // Add filter if entity ID specified
    if (options.entityId) {
      params.FilterExpression = 'entityId = :entityId';
      params.ExpressionAttributeValues = { ':entityId': options.entityId };
    }
    
    const result = await docClient.send(new ScanCommand(params));
    
    for (const item of result.Items || []) {
      // Skip deleted items
      if (item._deleted) continue;
      
      // Filter by account ID if specified
      if (options.accountId && item.id !== options.accountId) continue;
      
      accounts.push(item);
      
      // Check limit
      if (options.limit && accounts.length >= options.limit) {
        break;
      }
    }
    
    lastKey = result.LastEvaluatedKey;
    scanCount++;
    process.stdout.write(`\r   Scanned ${accounts.length} accounts...`);
    
  } while (lastKey && (!options.limit || accounts.length < options.limit));
  
  console.log(`\n   Found ${accounts.length} accounts to check`);
  return accounts;
}

/**
 * Get a single account by ID
 */
async function getSocialAccount(id) {
  const result = await docClient.send(new GetCommand({
    TableName: CONFIG.socialAccountTable,
    Key: { id },
  }));
  return result.Item;
}

/**
 * Update account with fixed date fields
 */
async function updateAccountDates(id, fixes) {
  const updateParts = [];
  const names = {};
  const values = {};
  
  for (const [field, { fixed }] of Object.entries(fixes)) {
    updateParts.push(`#${field} = :${field}`);
    names[`#${field}`] = field;
    values[`:${field}`] = fixed;
  }
  
  // Always update updatedAt
  if (!fixes.updatedAt) {
    updateParts.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();
  }
  
  await docClient.send(new UpdateCommand({
    TableName: CONFIG.socialAccountTable,
    Key: { id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// ============================================================================
// MAIN MIGRATION
// ============================================================================

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('  SOCIALACCOUNT DATE FORMAT MIGRATION');
  console.log('='.repeat(70));
  console.log(`  Mode:        ${options.execute ? '🔴 EXECUTE' : '🟢 PREVIEW'}`);
  console.log(`  Environment: ${options.env.toUpperCase()}`);
  console.log(`  Table:       ${CONFIG.socialAccountTable}`);
  if (options.accountId) console.log(`  Account ID:  ${options.accountId}`);
  if (options.entityId) console.log(`  Entity ID:   ${options.entityId}`);
  if (options.limit) console.log(`  Limit:       ${options.limit}`);
  console.log('='.repeat(70));

  // Confirmation for execute mode
  if (options.execute) {
    const answer = await prompt('\n⚠️  This will modify data. Type "yes" to continue: ');
    if (answer !== 'yes') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Step 1: Scan accounts
  const accounts = await scanSocialAccounts();
  
  if (accounts.length === 0) {
    console.log('\n✅ No accounts found to process.');
    return;
  }

  // Step 2: Check each account for date issues
  console.log('\n🔍 Checking date fields...\n');
  
  const results = {
    checked: 0,
    alreadyCorrect: 0,
    needsFix: 0,
    updated: 0,
    errors: 0,
    fieldCounts: {},
  };
  
  const allFixes = [];
  
  for (const account of accounts) {
    results.checked++;
    
    const fixes = checkDateFields(account);
    const fixCount = Object.keys(fixes).length;
    
    if (fixCount === 0) {
      results.alreadyCorrect++;
      continue;
    }
    
    results.needsFix++;
    
    // Count which fields need fixing
    for (const field of Object.keys(fixes)) {
      results.fieldCounts[field] = (results.fieldCounts[field] || 0) + 1;
    }
    
    const fixRecord = {
      accountId: account.id,
      accountName: account.accountName,
      platform: account.platform,
      fixes,
    };
    
    allFixes.push(fixRecord);
    
    // Execute if not preview
    if (options.execute) {
      try {
        await updateAccountDates(account.id, fixes);
        results.updated++;
        process.stdout.write('.');
        
        // Rate limiting
        if (results.updated % options.batchSize === 0) {
          await sleep(500);
        }
      } catch (err) {
        console.error(`\n❌ Error updating ${account.id}: ${err.message}`);
        results.errors++;
      }
    }
  }

  // Step 3: Print summary
  console.log('\n\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total accounts checked:    ${results.checked}`);
  console.log(`Already correct:           ${results.alreadyCorrect}`);
  console.log(`Needing fixes:             ${results.needsFix}`);
  
  if (Object.keys(results.fieldCounts).length > 0) {
    console.log('\nFields with bad format:');
    for (const [field, count] of Object.entries(results.fieldCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${field}: ${count} records`);
    }
  }
  
  if (options.execute) {
    console.log(`\nSuccessfully updated:      ${results.updated}`);
    console.log(`Errors:                    ${results.errors}`);
  }
  console.log('='.repeat(70));

  // Preview mode: show sample fixes
  if (options.preview && allFixes.length > 0) {
    console.log('\n📋 PREVIEW: Records needing fixes\n');
    
    for (const record of allFixes.slice(0, 20)) {
      console.log(`\n  📱 ${record.accountName} (${record.platform})`);
      console.log(`     ID: ${record.accountId}`);
      
      for (const [field, { current, fixed }] of Object.entries(record.fixes)) {
        console.log(`     ${field}:`);
        console.log(`       ❌ ${current}`);
        console.log(`       ✅ ${fixed}`);
      }
    }
    
    if (allFixes.length > 20) {
      console.log(`\n   ... and ${allFixes.length - 20} more records need fixing`);
    }
    
    console.log('\n💡 Run with --execute to apply these changes');
  }

  // Write detailed report to JSON file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const outputFile = `socialaccount-date-fix-report-${timestamp}.json`;
  const outputData = {
    generatedAt: new Date().toISOString(),
    mode: options.execute ? 'EXECUTE' : 'PREVIEW',
    environment: options.env,
    table: CONFIG.socialAccountTable,
    summary: {
      checked: results.checked,
      alreadyCorrect: results.alreadyCorrect,
      needsFix: results.needsFix,
      fieldCounts: results.fieldCounts,
      updated: results.updated,
      errors: results.errors,
    },
    fixes: allFixes,
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
  console.log(`\n📄 Detailed report written to: ${outputFile}`);

  console.log('\n✅ Migration complete!\n');
}

// ============================================================================
// RUN
// ============================================================================

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
