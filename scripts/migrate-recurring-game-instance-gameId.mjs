#!/usr/bin/env node
/**
 * Migration Script: Populate gameId on RecurringGameInstance records
 * 
 * This script finds matching Game records for each RecurringGameInstance by:
 * 1. Matching recurringGameId
 * 2. Matching expectedDate to gameStartDateTime (date portion)
 * 
 * Usage:
 *   node migrate-recurring-game-instance-gameId.mjs --preview
 *   node migrate-recurring-game-instance-gameId.mjs --execute
 *   node migrate-recurring-game-instance-gameId.mjs --execute --venue-id <id>
 *   node migrate-recurring-game-instance-gameId.mjs --execute --recurring-game-id <id>
 * 
 * Options:
 *   --preview, -p              Preview changes without executing (default)
 *   --execute, -e              Execute the migration
 *   --venue-id <id>            Filter by venue ID
 *   --entity-id <id>           Filter by entity ID
 *   --recurring-game-id <id>   Filter by specific recurring game
 *   --limit <n>                Limit number of instances to process
 *   --batch-size <n>           Batch size for updates (default: 25)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  // Table names - update these to match your environment
  recurringGameInstanceTable: 'RecurringGameInstance-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  gameTable: 'Game-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  venueId: null,
  entityId: null,
  recurringGameId: null,
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
    case '--recurring-game-id':
      options.recurringGameId = args[++i];
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
Migration Script: Populate gameId on RecurringGameInstance records

Usage:
  node migrate-recurring-game-instance-gameId.mjs [options]

Options:
  --preview, -p              Preview changes without executing (default)
  --execute, -e              Execute the migration
  --venue-id <id>            Filter by venue ID
  --entity-id <id>           Filter by entity ID
  --recurring-game-id <id>   Filter by specific recurring game
  --limit <n>                Limit number of instances to process
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
 * Scan RecurringGameInstance table with optional filters
 */
async function scanRecurringGameInstances() {
  const instances = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  // Only get instances without gameId (or with null gameId)
  filterExpressions.push('(attribute_not_exists(gameId) OR gameId = :nullVal)');
  expressionAttributeValues[':nullVal'] = null;
  
  // Filter by status = CONFIRMED
  filterExpressions.push('#status = :confirmed');
  expressionAttributeNames['#status'] = 'status';
  expressionAttributeValues[':confirmed'] = 'CONFIRMED';
  
  if (options.venueId) {
    filterExpressions.push('venueId = :venueId');
    expressionAttributeValues[':venueId'] = options.venueId;
  }
  
  if (options.entityId) {
    filterExpressions.push('entityId = :entityId');
    expressionAttributeValues[':entityId'] = options.entityId;
  }
  
  if (options.recurringGameId) {
    filterExpressions.push('recurringGameId = :recurringGameId');
    expressionAttributeValues[':recurringGameId'] = options.recurringGameId;
  }

  do {
    const params = {
      TableName: CONFIG.recurringGameInstanceTable,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
      if (Object.keys(expressionAttributeNames).length > 0) {
        params.ExpressionAttributeNames = expressionAttributeNames;
      }
    }

    const result = await docClient.send(new ScanCommand(params));
    instances.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    // Check limit
    if (options.limit && instances.length >= options.limit) {
      return instances.slice(0, options.limit);
    }
    
    // Rate limiting
    await sleep(100);
  } while (lastEvaluatedKey);

  return instances;
}

/**
 * Query Games by recurringGameId using GSI
 */
async function queryGamesByRecurringGameId(recurringGameId) {
  const games = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: CONFIG.gameTable,
      IndexName: 'byRecurringGame',
      KeyConditionExpression: 'recurringGameId = :rgId',
      ExpressionAttributeValues: {
        ':rgId': recurringGameId,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const result = await docClient.send(new QueryCommand(params));
    games.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return games;
}

/**
 * Build a map of Games by date for a recurring game
 */
function buildGamesByDateMap(games) {
  const byDate = new Map();
  
  for (const game of games) {
    if (game.gameStartDateTime && game.gameStatus === 'FINISHED') {
      // Extract date part (YYYY-MM-DD) from gameStartDateTime
      const dateKey = game.gameStartDateTime.split('T')[0];
      
      // If multiple games on same date, prefer the one that's not a series
      const existing = byDate.get(dateKey);
      if (!existing || (existing.isSeries && !game.isSeries)) {
        byDate.set(dateKey, game);
      }
    }
  }
  
  return byDate;
}

/**
 * Update RecurringGameInstance with gameId
 */
async function updateInstanceGameId(instanceId, gameId) {
  const now = new Date().toISOString();
  
  const params = {
    TableName: CONFIG.recurringGameInstanceTable,
    Key: { id: instanceId },
    UpdateExpression: 'SET gameId = :gameId, updatedAt = :updatedAt, #lastChangedAt = :lastChangedAt',
    ExpressionAttributeNames: {
      '#lastChangedAt': '_lastChangedAt',
    },
    ExpressionAttributeValues: {
      ':gameId': gameId,
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
  console.log('MIGRATION: Populate gameId on RecurringGameInstance records');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Tables:`);
  console.log(`  - RecurringGameInstance: ${CONFIG.recurringGameInstanceTable}`);
  console.log(`  - Game: ${CONFIG.gameTable}`);
  console.log(`Filters:`);
  if (options.venueId) console.log(`  - Venue ID: ${options.venueId}`);
  if (options.entityId) console.log(`  - Entity ID: ${options.entityId}`);
  if (options.recurringGameId) console.log(`  - Recurring Game ID: ${options.recurringGameId}`);
  if (options.limit) console.log(`  - Limit: ${options.limit}`);
  console.log('='.repeat(70) + '\n');

  // Confirmation for execute mode
  if (options.execute) {
    const confirm = await prompt('⚠️  You are about to UPDATE records. Type "yes" to continue: ');
    if (confirm !== 'yes') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  // Step 1: Scan instances without gameId
  console.log('📊 Scanning RecurringGameInstance records without gameId...');
  const instances = await scanRecurringGameInstances();
  console.log(`   Found ${instances.length} instances to process\n`);

  if (instances.length === 0) {
    console.log('✅ No instances need updating. Migration complete.');
    return;
  }

  // Step 2: Group instances by recurringGameId
  const instancesByRecurringGame = new Map();
  for (const instance of instances) {
    const rgId = instance.recurringGameId;
    if (!instancesByRecurringGame.has(rgId)) {
      instancesByRecurringGame.set(rgId, []);
    }
    instancesByRecurringGame.get(rgId).push(instance);
  }
  console.log(`📁 Grouped into ${instancesByRecurringGame.size} recurring games\n`);

  // Step 3: Process each recurring game
  const results = {
    processed: 0,
    matched: 0,
    updated: 0,
    noMatch: 0,
    errors: 0,
  };

  const updates = []; // For preview mode

  for (const [recurringGameId, rgInstances] of instancesByRecurringGame) {
    console.log(`\n🎮 Processing recurring game: ${recurringGameId}`);
    console.log(`   Instances: ${rgInstances.length}`);

    // Query games for this recurring game
    const games = await queryGamesByRecurringGameId(recurringGameId);
    console.log(`   Games found: ${games.length}`);

    if (games.length === 0) {
      console.log(`   ⚠️  No games found for this recurring game`);
      results.noMatch += rgInstances.length;
      results.processed += rgInstances.length;
      continue;
    }

    // Build date map
    const gamesByDate = buildGamesByDateMap(games);
    console.log(`   Unique game dates: ${gamesByDate.size}`);

    // Match instances to games
    for (const instance of rgInstances) {
      results.processed++;
      
      const expectedDate = instance.expectedDate;
      const matchedGame = gamesByDate.get(expectedDate);

      if (matchedGame) {
        results.matched++;
        
        const update = {
          instanceId: instance.id,
          expectedDate,
          recurringGameName: instance.recurringGameName,
          gameId: matchedGame.id,
          gameName: matchedGame.name,
          gameDate: matchedGame.gameStartDateTime?.split('T')[0],
        };
        updates.push(update);

        if (options.execute) {
          try {
            await updateInstanceGameId(instance.id, matchedGame.id);
            results.updated++;
            process.stdout.write('.');
          } catch (err) {
            console.error(`\n   ❌ Error updating ${instance.id}: ${err.message}`);
            results.errors++;
          }
          
          // Rate limiting
          if (results.updated % options.batchSize === 0) {
            await sleep(500);
          }
        }
      } else {
        results.noMatch++;
      }
    }
  }

  // Step 4: Print summary
  console.log('\n\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total instances processed: ${results.processed}`);
  console.log(`Matched to games:          ${results.matched}`);
  console.log(`No matching game:          ${results.noMatch}`);
  if (options.execute) {
    console.log(`Successfully updated:      ${results.updated}`);
    console.log(`Errors:                    ${results.errors}`);
  }
  console.log('='.repeat(70));

  // Preview mode: show sample updates
  if (options.preview && updates.length > 0) {
    console.log('\n📋 PREVIEW: Sample updates (first 20)\n');
    console.log('| Expected Date | Instance Name | Game ID | Game Name |');
    console.log('|---------------|---------------|---------|-----------|');
    
    for (const update of updates.slice(0, 20)) {
      const name = (update.recurringGameName || '').substring(0, 30);
      const gameName = (update.gameName || '').substring(0, 30);
      console.log(`| ${update.expectedDate} | ${name.padEnd(30)} | ${update.gameId.substring(0, 8)}... | ${gameName} |`);
    }
    
    if (updates.length > 20) {
      console.log(`\n... and ${updates.length - 20} more updates`);
    }
    
    console.log('\n💡 Run with --execute to apply these changes');
  }

  // Check for unmatched
  if (results.noMatch > 0) {
    console.log(`\n⚠️  ${results.noMatch} instances could not be matched to a game.`);
    console.log('   This could mean:');
    console.log('   - The game has a different recurringGameId');
    console.log('   - The game date doesn\'t match expectedDate');
    console.log('   - The game doesn\'t exist or was deleted');
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
