#!/usr/bin/env node
/**
 * Migration Script: Populate gameFinancialSnapshotId on Game records
 * 
 * This script finds GameFinancialSnapshot records and updates the corresponding
 * Game records with the snapshot ID to enable the @hasOne relationship.
 * 
 * Usage:
 *   node migrate-game-financial-snapshot-id.mjs --preview
 *   node migrate-game-financial-snapshot-id.mjs --execute
 *   node migrate-game-financial-snapshot-id.mjs --execute --venue-id <id>
 * 
 * Options:
 *   --preview, -p              Preview changes without executing (default)
 *   --execute, -e              Execute the migration
 *   --venue-id <id>            Filter by venue ID
 *   --entity-id <id>           Filter by entity ID
 *   --limit <n>                Limit number of snapshots to process
 *   --batch-size <n>           Batch size for updates (default: 25)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  // Table names - update these to match your environment
  gameTable: 'Game-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  gameFinancialSnapshotTable: 'GameFinancialSnapshot-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  venueId: null,
  entityId: null,
  limit: null,
  batchSize: 25,
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
    case '--venue-id':
      options.venueId = args[++i];
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
    case '--help':
    case '-h':
      console.log(`
Migration Script: Populate gameFinancialSnapshotId on Game records

Usage:
  node migrate-game-financial-snapshot-id.mjs [options]

Options:
  --preview, -p              Preview changes without executing (default)
  --execute, -e              Execute the migration
  --venue-id <id>            Filter by venue ID
  --entity-id <id>           Filter by entity ID
  --limit <n>                Limit number of snapshots to process
  --batch-size <n>           Batch size for updates (default: 25)
  --help, -h                 Show this help message
      `);
      process.exit(0);
  }
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
 * Scan GameFinancialSnapshot table
 */
async function scanGameFinancialSnapshots() {
  const snapshots = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeValues = {};
  
  // Filter: must have gameId
  filterExpressions.push('attribute_exists(gameId)');
  
  if (options.venueId) {
    filterExpressions.push('venueId = :venueId');
    expressionAttributeValues[':venueId'] = options.venueId;
  }
  
  if (options.entityId) {
    filterExpressions.push('entityId = :entityId');
    expressionAttributeValues[':entityId'] = options.entityId;
  }

  do {
    const params = {
      TableName: CONFIG.gameFinancialSnapshotTable,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      if (Object.keys(expressionAttributeValues).length > 0) {
        params.ExpressionAttributeValues = expressionAttributeValues;
      }
    }

    const result = await docClient.send(new ScanCommand(params));
    snapshots.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    // Check limit
    if (options.limit && snapshots.length >= options.limit) {
      return snapshots.slice(0, options.limit);
    }
    
    // Rate limiting
    await sleep(100);
  } while (lastEvaluatedKey);

  return snapshots;
}

/**
 * Get a Game record by ID
 */
async function getGame(gameId) {
  const result = await docClient.send(new GetCommand({
    TableName: CONFIG.gameTable,
    Key: { id: gameId },
  }));
  return result.Item;
}

/**
 * Update Game with gameFinancialSnapshotId
 */
async function updateGameSnapshotId(gameId, snapshotId) {
  const now = new Date().toISOString();
  
  const params = {
    TableName: CONFIG.gameTable,
    Key: { id: gameId },
    UpdateExpression: 'SET gameFinancialSnapshotId = :snapshotId, updatedAt = :updatedAt, #lastChangedAt = :lastChangedAt',
    ExpressionAttributeNames: {
      '#lastChangedAt': '_lastChangedAt',
    },
    ExpressionAttributeValues: {
      ':snapshotId': snapshotId,
      ':updatedAt': now,
      ':lastChangedAt': Date.now(),
    },
    ReturnValues: 'ALL_NEW',
  };

  return docClient.send(new UpdateCommand(params));
}

// ============================================================================
// MAIN MIGRATION LOGIC
// ============================================================================

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION: Populate gameFinancialSnapshotId on Game records');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Tables:`);
  console.log(`  - Game: ${CONFIG.gameTable}`);
  console.log(`  - GameFinancialSnapshot: ${CONFIG.gameFinancialSnapshotTable}`);
  console.log(`Filters:`);
  if (options.venueId) console.log(`  - Venue ID: ${options.venueId}`);
  if (options.entityId) console.log(`  - Entity ID: ${options.entityId}`);
  if (options.limit) console.log(`  - Limit: ${options.limit}`);
  console.log('='.repeat(70) + '\n');

  // Confirmation for execute mode
  if (options.execute) {
    const confirm = await prompt('⚠️  You are about to UPDATE Game records. Type "yes" to continue: ');
    if (confirm !== 'yes') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  // Step 1: Scan GameFinancialSnapshot records
  console.log('📊 Scanning GameFinancialSnapshot records...');
  const snapshots = await scanGameFinancialSnapshots();
  console.log(`   Found ${snapshots.length} snapshots to process\n`);

  if (snapshots.length === 0) {
    console.log('✅ No snapshots found. Migration complete.');
    return;
  }

  // Step 2: Process each snapshot
  const results = {
    processed: 0,
    updated: 0,
    alreadySet: 0,
    gameNotFound: 0,
    errors: 0,
  };

  const updates = []; // For preview mode

  for (const snapshot of snapshots) {
    results.processed++;
    
    const gameId = snapshot.gameId;
    const snapshotId = snapshot.id;
    
    if (!gameId) {
      continue;
    }

    // Check if Game exists and if it already has snapshotId
    try {
      const game = await getGame(gameId);
      
      if (!game) {
        results.gameNotFound++;
        continue;
      }
      
      if (game.gameFinancialSnapshotId === snapshotId) {
        results.alreadySet++;
        continue;
      }
      
      const update = {
        gameId,
        gameName: game.name,
        snapshotId,
        currentSnapshotId: game.gameFinancialSnapshotId || null,
      };
      updates.push(update);

      if (options.execute) {
        try {
          await updateGameSnapshotId(gameId, snapshotId);
          results.updated++;
          process.stdout.write('.');
        } catch (err) {
          console.error(`\n   ❌ Error updating game ${gameId}: ${err.message}`);
          results.errors++;
        }
        
        // Rate limiting
        if (results.updated % options.batchSize === 0) {
          await sleep(500);
        }
      }
    } catch (err) {
      console.error(`\n   ❌ Error processing snapshot ${snapshotId}: ${err.message}`);
      results.errors++;
    }
  }

  // Step 3: Print summary
  console.log('\n\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total snapshots processed: ${results.processed}`);
  console.log(`Games already linked:      ${results.alreadySet}`);
  console.log(`Games not found:           ${results.gameNotFound}`);
  console.log(`Need to update:            ${updates.length}`);
  if (options.execute) {
    console.log(`Successfully updated:      ${results.updated}`);
    console.log(`Errors:                    ${results.errors}`);
  }
  console.log('='.repeat(70));

  // Preview mode: show sample updates
  if (options.preview && updates.length > 0) {
    console.log('\n📋 PREVIEW: Sample updates (first 20)\n');
    console.log('| Game Name | Current SnapshotId | New SnapshotId |');
    console.log('|-----------|-------------------|----------------|');
    
    for (const update of updates.slice(0, 20)) {
      const name = (update.gameName || 'Unknown').substring(0, 35);
      const current = update.currentSnapshotId ? update.currentSnapshotId.substring(0, 8) + '...' : 'null';
      const newId = update.snapshotId.substring(0, 8) + '...';
      console.log(`| ${name.padEnd(35)} | ${current.padEnd(17)} | ${newId} |`);
    }
    
    if (updates.length > 20) {
      console.log(`\n... and ${updates.length - 20} more updates`);
    }
    
    console.log('\n💡 Run with --execute to apply these changes');
  }

  console.log('\n✅ Migration complete!\n');
}

// ============================================================================
// RUN
// ============================================================================

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
