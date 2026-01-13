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
import fs from 'fs';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  // Table names - update these to match your environment
  // dev
  //recurringGameInstanceTable: 'RecurringGameInstance-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  //gameTable: 'Game-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  // prod
  recurringGameInstanceTable: 'RecurringGameInstance-ynuahifnznb5zddz727oiqnicy-prod', // UPDATE THIS
  gameTable: 'Game-ynuahifnznb5zddz727oiqnicy-prod', // UPDATE THIS
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
 * Convert a UTC date to AEST/AEDT and return date components
 * AEST = UTC + 10, AEDT = UTC + 11 (during daylight saving)
 */
function toAEST(utcDateStr) {
  const AEST_OFFSET_HOURS = 10;
  const AEDT_OFFSET_HOURS = 11;
  
  const d = new Date(utcDateStr);
  
  if (isNaN(d.getTime())) {
    return null;
  }
  
  // Check if date falls within AEDT (first Sunday in October to first Sunday in April)
  const month = d.getUTCMonth();
  let isAEDT = false;
  if (month >= 3 && month <= 8) {
    isAEDT = false;
  } else if (month >= 10 || month <= 1) {
    isAEDT = true;
  } else {
    const dayOfMonth = d.getUTCDate();
    if (month === 9) {
      isAEDT = dayOfMonth >= 7;
    } else {
      isAEDT = true;
    }
  }
  
  const offset = isAEDT ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
  
  // Add offset to get AEST/AEDT time
  const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
  
  const year = aestTime.getUTCFullYear();
  const monthStr = String(aestTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(aestTime.getUTCDate()).padStart(2, '0');
  
  return `${year}-${monthStr}-${day}`;
}

/**
 * Extract date from datetime string IN AEST TIMEZONE
 */
function extractDateAEST(dateTimeStr) {
  if (!dateTimeStr) return null;
  
  const aestDate = toAEST(dateTimeStr);
  if (!aestDate) {
    // Fallback to UTC if conversion fails
    console.warn(`[extractDateAEST] Failed to convert to AEST: ${dateTimeStr}`);
    return dateTimeStr.split('T')[0];
  }
  
  return aestDate;
}

/**
 * Build a map of Games by date for a recurring game
 * IMPORTANT: Uses AEST dates, not UTC dates!
 */
function buildGamesByDateMap(games) {
  const byDate = new Map();
  
  for (const game of games) {
    if (game.gameStartDateTime && game.gameStatus === 'FINISHED') {
      // Extract date part in AEST timezone (not UTC!)
      const dateKey = extractDateAEST(game.gameStartDateTime);
      
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
  const unmatchedInstances = []; // Track unmatched instances for manual review

  for (const [recurringGameId, rgInstances] of instancesByRecurringGame) {
    console.log(`\n🎮 Processing recurring game: ${recurringGameId}`);
    console.log(`   Instances: ${rgInstances.length}`);

    // Query games for this recurring game
    const games = await queryGamesByRecurringGameId(recurringGameId);
    console.log(`   Games found: ${games.length}`);

    if (games.length === 0) {
      console.log(`   ⚠️  No games found for this recurring game`);
      // Track all instances from this recurring game as unmatched
      for (const instance of rgInstances) {
        unmatchedInstances.push({
          instanceId: instance.id,
          recurringGameId: instance.recurringGameId,
          recurringGameName: instance.recurringGameName || 'N/A',
          expectedDate: instance.expectedDate,
          venueId: instance.venueId,
          reason: 'NO_GAMES_FOR_RECURRING',
        });
      }
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
        // Track unmatched instance with details for manual review
        unmatchedInstances.push({
          instanceId: instance.id,
          recurringGameId: instance.recurringGameId,
          recurringGameName: instance.recurringGameName || 'N/A',
          expectedDate: instance.expectedDate,
          venueId: instance.venueId,
          reason: 'NO_GAME_ON_DATE',
          availableDates: Array.from(gamesByDate.keys()).slice(0, 10), // Show some available dates
        });
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

  // Output unmatched instances for manual review
  if (unmatchedInstances.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  UNMATCHED INSTANCES - MANUAL REVIEW REQUIRED');
    console.log('='.repeat(70));
    console.log(`\nTotal unmatched: ${unmatchedInstances.length}\n`);

    // Group by reason
    const byReason = {
      NO_GAMES_FOR_RECURRING: unmatchedInstances.filter(i => i.reason === 'NO_GAMES_FOR_RECURRING'),
      NO_GAME_ON_DATE: unmatchedInstances.filter(i => i.reason === 'NO_GAME_ON_DATE'),
    };

    // Print instances with no games for the recurring game
    if (byReason.NO_GAMES_FOR_RECURRING.length > 0) {
      console.log(`\n📌 NO GAMES FOUND FOR RECURRING GAME (${byReason.NO_GAMES_FOR_RECURRING.length} instances):`);
      console.log('   These recurring games have instances but no linked Game records.\n');
      
      // Group by recurring game for cleaner output
      const byRecurringGame = new Map();
      for (const item of byReason.NO_GAMES_FOR_RECURRING) {
        if (!byRecurringGame.has(item.recurringGameId)) {
          byRecurringGame.set(item.recurringGameId, {
            recurringGameId: item.recurringGameId,
            recurringGameName: item.recurringGameName,
            venueId: item.venueId,
            instances: [],
          });
        }
        byRecurringGame.get(item.recurringGameId).instances.push({
          instanceId: item.instanceId,
          expectedDate: item.expectedDate,
        });
      }

      for (const [rgId, data] of byRecurringGame) {
        console.log(`   Recurring Game: ${data.recurringGameName}`);
        console.log(`   ID: ${rgId}`);
        console.log(`   Venue: ${data.venueId}`);
        console.log(`   Instance IDs:`);
        for (const inst of data.instances.slice(0, 10)) {
          console.log(`     - ${inst.instanceId} (${inst.expectedDate})`);
        }
        if (data.instances.length > 10) {
          console.log(`     ... and ${data.instances.length - 10} more`);
        }
        console.log('');
      }
    }

    // Print instances with no game on expected date
    if (byReason.NO_GAME_ON_DATE.length > 0) {
      console.log(`\n📌 NO GAME ON EXPECTED DATE (${byReason.NO_GAME_ON_DATE.length} instances):`);
      console.log('   These instances have a date that doesn\'t match any finished game.\n');
      
      for (const item of byReason.NO_GAME_ON_DATE.slice(0, 30)) {
        console.log(`   Instance: ${item.instanceId}`);
        console.log(`   Recurring: ${item.recurringGameName} (${item.recurringGameId.substring(0, 8)}...)`);
        console.log(`   Expected Date: ${item.expectedDate}`);
        if (item.availableDates && item.availableDates.length > 0) {
          console.log(`   Available dates: ${item.availableDates.join(', ')}`);
        }
        console.log('');
      }
      
      if (byReason.NO_GAME_ON_DATE.length > 30) {
        console.log(`   ... and ${byReason.NO_GAME_ON_DATE.length - 30} more\n`);
      }
    }

    // Output all unmatched IDs in a simple list format for easy copy/paste
    console.log('\n' + '-'.repeat(70));
    console.log('UNMATCHED INSTANCE IDs (for manual review/scripts):');
    console.log('-'.repeat(70));
    for (const item of unmatchedInstances) {
      console.log(item.instanceId);
    }
    console.log('-'.repeat(70));

    // Also write to a JSON file for programmatic use
    const outputFile = `unmatched-instances-${new Date().toISOString().split('T')[0]}.json`;
    const outputData = {
      generatedAt: new Date().toISOString(),
      totalUnmatched: unmatchedInstances.length,
      summary: {
        noGamesForRecurring: byReason.NO_GAMES_FOR_RECURRING.length,
        noGameOnDate: byReason.NO_GAME_ON_DATE.length,
      },
      instances: unmatchedInstances,
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    console.log(`\n📄 Full unmatched details written to: ${outputFile}`);

    console.log('\n💡 Possible reasons for unmatched instances:');
    console.log('   - The game has a different recurringGameId');
    console.log('   - The game date doesn\'t match expectedDate (timezone issue?)');
    console.log('   - The game doesn\'t exist or was deleted');
    console.log('   - The game status is not FINISHED');
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
