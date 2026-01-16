#!/usr/bin/env node
/**
 * ===================================================================
 * Fix Invalid GameStatus Values in ScrapeURL Table
 * ===================================================================
 * 
 * This script scans the ScrapeURL table for records with invalid gameStatus
 * values and fixes them by mapping to valid enum values.
 * 
 * Usage:
 *   node fix-invalid-gamestatus.mjs --preview    # Show what would be fixed
 *   node fix-invalid-gamestatus.mjs --execute    # Actually fix the records
 * 
 * ===================================================================
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ynuahifnznb5zddz727oiqnicy',
  env: process.env.ENV || 'prod',
};

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;
};

// Valid GameStatus enum values (from 00-enums.graphql)
const VALID_GAME_STATUSES = new Set([
  'INITIATING',
  'SCHEDULED',
  'REGISTERING',
  'RUNNING',
  'CANCELLED',
  'FINISHED',
  'NOT_FOUND',
  'NOT_PUBLISHED',
  'CLOCK_STOPPED',
  'UNKNOWN',
]);

// Mapping for known invalid values to valid ones
const STATUS_MAPPING = {
  'COMPLETED': 'FINISHED',      // Common mistake - COMPLETED should be FINISHED
  'COMPLETE': 'FINISHED',
  'DONE': 'FINISHED',
  'ENDED': 'FINISHED',
  'ACTIVE': 'RUNNING',
  'IN_PROGRESS': 'RUNNING',
  'PENDING': 'SCHEDULED',
  'UPCOMING': 'SCHEDULED',
  'STOPPED': 'CLOCK_STOPPED',
  'PAUSED': 'CLOCK_STOPPED',
  'ERROR': 'UNKNOWN',
  'INVALID': 'UNKNOWN',
  '': 'UNKNOWN',
  null: 'UNKNOWN',
  undefined: 'UNKNOWN',
};

// ============================================================================
// PARSE ARGS
// ============================================================================

const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
};

for (const arg of args) {
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
    case '--help':
    case '-h':
      console.log(`
Fix Invalid GameStatus Values in ScrapeURL Table

Usage:
  node fix-invalid-gamestatus.mjs [options]

Options:
  --preview, -p    Preview changes without executing (default)
  --execute, -e    Execute the fixes
  --help, -h       Show this help message
      `);
      process.exit(0);
  }
}

// ============================================================================
// AWS CLIENT
// ============================================================================

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// MAIN
// ============================================================================

async function findAndFixInvalidStatuses() {
  const tableName = getTableName('ScrapeURL');
  
  console.log('='.repeat(70));
  console.log('FIX INVALID GAMESTATUS VALUES IN SCRAPEURL TABLE');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Table: ${tableName}`);
  console.log('');
  
  // Scan for all records with gameStatus field
  console.log('Scanning ScrapeURL table...');
  
  const invalidRecords = [];
  let scanned = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: 'id, gameStatus, tournamentId, entityId',
    }));
    
    for (const item of response.Items || []) {
      scanned++;
      
      const status = item.gameStatus;
      
      // Check if status is invalid
      if (status !== undefined && status !== null && !VALID_GAME_STATUSES.has(status)) {
        invalidRecords.push({
          id: item.id,
          tournamentId: item.tournamentId,
          entityId: item.entityId,
          currentStatus: status,
          suggestedStatus: STATUS_MAPPING[status] || STATUS_MAPPING[status?.toUpperCase?.()] || 'UNKNOWN',
        });
      }
    }
    
    lastEvaluatedKey = response.LastEvaluatedKey;
    process.stdout.write(`\rScanned ${scanned} records, found ${invalidRecords.length} invalid...`);
    
  } while (lastEvaluatedKey);
  
  console.log(`\nScan complete: ${scanned} records scanned, ${invalidRecords.length} invalid found`);
  console.log('');
  
  if (invalidRecords.length === 0) {
    console.log('✅ No invalid gameStatus values found!');
    return;
  }
  
  // Group by invalid status value
  const byStatus = {};
  for (const record of invalidRecords) {
    const key = record.currentStatus || '(null/empty)';
    if (!byStatus[key]) byStatus[key] = [];
    byStatus[key].push(record);
  }
  
  console.log('Invalid status values found:');
  console.log('-'.repeat(50));
  for (const [status, records] of Object.entries(byStatus)) {
    const suggestedFix = records[0].suggestedStatus;
    console.log(`  "${status}" → "${suggestedFix}" (${records.length} records)`);
  }
  console.log('');
  
  // Show sample records
  console.log('Sample invalid records:');
  console.log('-'.repeat(50));
  const samples = invalidRecords.slice(0, 10);
  for (const record of samples) {
    console.log(`  ID: ${record.id}`);
    console.log(`    Tournament: ${record.tournamentId || 'N/A'}`);
    console.log(`    Current: "${record.currentStatus}" → Fix to: "${record.suggestedStatus}"`);
  }
  if (invalidRecords.length > 10) {
    console.log(`  ... and ${invalidRecords.length - 10} more`);
  }
  console.log('');
  
  // Execute fixes if requested
  if (options.execute) {
    console.log('='.repeat(70));
    console.log('EXECUTING FIXES');
    console.log('='.repeat(70));
    
    let fixed = 0;
    let errors = 0;
    
    for (const record of invalidRecords) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: record.id },
          UpdateExpression: 'SET gameStatus = :status, updatedAt = :now',
          ExpressionAttributeValues: {
            ':status': record.suggestedStatus,
            ':now': new Date().toISOString(),
          },
        }));
        fixed++;
        process.stdout.write('.');
        
        // Rate limiting
        if (fixed % 25 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`\n❌ Error fixing ${record.id}: ${err.message}`);
        errors++;
      }
    }
    
    console.log(`\n\n✅ Fixed ${fixed} records (${errors} errors)`);
  } else {
    console.log('💡 Run with --execute to apply these fixes');
  }
}

// Also check the Game table for invalid statuses
async function findInvalidInGameTable() {
  const tableName = getTableName('Game');
  
  console.log('\n');
  console.log('='.repeat(70));
  console.log('CHECKING GAME TABLE FOR INVALID STATUSES');
  console.log('='.repeat(70));
  
  const invalidRecords = [];
  let scanned = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: 'id, gameStatus, #n, tournamentId',
      ExpressionAttributeNames: { '#n': 'name' },
    }));
    
    for (const item of response.Items || []) {
      scanned++;
      
      const status = item.gameStatus;
      
      if (status !== undefined && status !== null && !VALID_GAME_STATUSES.has(status)) {
        invalidRecords.push({
          id: item.id,
          name: item.name,
          tournamentId: item.tournamentId,
          currentStatus: status,
          suggestedStatus: STATUS_MAPPING[status] || STATUS_MAPPING[status?.toUpperCase?.()] || 'UNKNOWN',
        });
      }
    }
    
    lastEvaluatedKey = response.LastEvaluatedKey;
    process.stdout.write(`\rScanned ${scanned} Game records, found ${invalidRecords.length} invalid...`);
    
  } while (lastEvaluatedKey);
  
  console.log(`\nGame table: ${scanned} records scanned, ${invalidRecords.length} invalid found`);
  
  if (invalidRecords.length > 0) {
    console.log('\nInvalid Game records:');
    for (const record of invalidRecords.slice(0, 10)) {
      console.log(`  - ${record.name?.substring(0, 40)} (${record.currentStatus} → ${record.suggestedStatus})`);
    }
    
    if (options.execute) {
      console.log('\nFixing Game table...');
      let fixed = 0;
      for (const record of invalidRecords) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: record.id },
            UpdateExpression: 'SET gameStatus = :status, updatedAt = :now',
            ExpressionAttributeValues: {
              ':status': record.suggestedStatus,
              ':now': new Date().toISOString(),
            },
          }));
          fixed++;
        } catch (err) {
          console.error(`Error fixing Game ${record.id}: ${err.message}`);
        }
      }
      console.log(`✅ Fixed ${fixed} Game records`);
    }
  }
}

// Run
async function main() {
  await findAndFixInvalidStatuses();
  await findInvalidInGameTable();
  console.log('\n✅ Done!\n');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
