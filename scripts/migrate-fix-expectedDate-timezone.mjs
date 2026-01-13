#!/usr/bin/env node
/**
 * Migration Script: Fix expectedDate timezone on RecurringGameInstance records
 *                   AND backfill missing gameId
 * 
 * Problems fixed:
 * 1. expectedDate was incorrectly stored as UTC date instead of AEST date
 *    Example: A game at 8:00 AM AEST on Wednesday (2025-12-17T21:00:00Z in UTC)
 *             was stored with expectedDate "2025-12-16" (Tuesday) instead of "2025-12-17" (Wednesday)
 * 
 * 2. gameId was stored as undefined because instance was created before game was saved
 * 
 * This script:
 * 1. Groups instances by recurringGameId
 * 2. Queries games for each recurring game
 * 3. Matches instances to games by the (incorrectly stored) UTC date
 * 4. Updates expectedDate to correct AEST date
 * 5. Backfills gameId from the matched game
 * 6. Also updates weekKey and dayOfWeek
 * 
 * Usage:
 *   node migrate-fix-expectedDate-timezone.mjs --preview
 *   node migrate-fix-expectedDate-timezone.mjs --execute
 *   node migrate-fix-expectedDate-timezone.mjs --execute --venue-id <id>
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
  GetCommand,
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
  // prod
  recurringGameInstanceTable: 'RecurringGameInstance-ynuahifnznb5zddz727oiqnicy-prod',
  gameTable: 'Game-ynuahifnznb5zddz727oiqnicy-prod',
  // dev
  // recurringGameInstanceTable: 'RecurringGameInstance-ht3nugt6lvddpeeuwj3x6mkite-dev',
  // gameTable: 'Game-ht3nugt6lvddpeeuwj3x6mkite-dev',
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
Migration Script: Fix expectedDate timezone on RecurringGameInstance records

This fixes instances where expectedDate was incorrectly stored as UTC date
instead of AEST date.

Usage:
  node migrate-fix-expectedDate-timezone.mjs [options]

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
// TIMEZONE UTILITIES
// ============================================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * Convert a UTC date to AEST/AEDT and return date components
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
  const monthNum = aestTime.getUTCMonth();
  const day = aestTime.getUTCDate();
  const dayOfWeekIndex = aestTime.getUTCDay();
  
  return {
    year,
    month: monthNum,
    day,
    dayOfWeek: dayOfWeekIndex,
    dayOfWeekName: DAYS_OF_WEEK[dayOfWeekIndex],
    isoDate: `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/**
 * Extract date from datetime string IN AEST TIMEZONE
 */
function extractDateAEST(dateTimeStr) {
  if (!dateTimeStr) return null;
  
  const aest = toAEST(dateTimeStr);
  if (!aest) {
    return dateTimeStr.split('T')[0];
  }
  
  return aest.isoDate;
}

/**
 * Get day of week name from datetime in AEST
 */
function getDayOfWeekAEST(dateTimeStr) {
  if (!dateTimeStr) return null;
  
  const aest = toAEST(dateTimeStr);
  return aest ? aest.dayOfWeekName : null;
}

/**
 * Calculate ISO week key from a date string (YYYY-MM-DD)
 */
function getWeekKey(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  
  // Get ISO week number
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  
  // Get ISO week year
  const weekYear = d.getUTCFullYear();
  
  return `${weekYear}-W${weekNo.toString().padStart(2, '0')}`;
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
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scan RecurringGameInstance table with optional filters
 * Gets CONFIRMED instances (with or without gameId - we'll match by date)
 */
async function scanRecurringGameInstances() {
  const instances = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  // Get confirmed instances (gameId may or may not exist)
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
 * Get a game by ID
 */
async function getGame(gameId) {
  if (!gameId) return null;
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CONFIG.gameTable,
      Key: { id: gameId },
    }));
    return result.Item || null;
  } catch (err) {
    console.error(`Error fetching game ${gameId}:`, err.message);
    return null;
  }
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
 * Build maps of Games by date for matching
 * Returns both UTC and AEST date maps
 */
function buildGameDateMaps(games) {
  const byDateAEST = new Map();
  const byDateUTC = new Map();
  
  for (const game of games) {
    if (game.gameStartDateTime) {
      // AEST date (correct)
      const aestDate = extractDateAEST(game.gameStartDateTime);
      // UTC date (what was incorrectly stored)
      const utcDate = game.gameStartDateTime.split('T')[0];
      
      // Store in AEST map
      if (!byDateAEST.has(aestDate)) {
        byDateAEST.set(aestDate, game);
      }
      
      // Store in UTC map
      if (!byDateUTC.has(utcDate)) {
        byDateUTC.set(utcDate, game);
      }
    }
  }
  
  return { byDateAEST, byDateUTC };
}

/**
 * Update RecurringGameInstance with corrected date fields AND gameId
 */
async function updateInstanceDateFields(instanceId, updates) {
  const now = new Date().toISOString();
  
  const updateExpressions = [
    'expectedDate = :expectedDate',
    'dayOfWeek = :dayOfWeek', 
    'weekKey = :weekKey',
    'updatedAt = :updatedAt',
    '#lastChangedAt = :lastChangedAt',
  ];
  
  const expressionAttributeValues = {
    ':expectedDate': updates.expectedDate,
    ':dayOfWeek': updates.dayOfWeek,
    ':weekKey': updates.weekKey,
    ':updatedAt': now,
    ':lastChangedAt': Date.now(),
  };
  
  // Also update gameId if provided
  if (updates.gameId) {
    updateExpressions.push('gameId = :gameId');
    expressionAttributeValues[':gameId'] = updates.gameId;
  }
  
  const params = {
    TableName: CONFIG.recurringGameInstanceTable,
    Key: { id: instanceId },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: {
      '#lastChangedAt': '_lastChangedAt',
    },
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  return docClient.send(new UpdateCommand(params));
}

// ============================================================================
// MAIN MIGRATION LOGIC
// ============================================================================

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('MIGRATION: Fix expectedDate timezone (UTC → AEST) + backfill gameId');
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

  // Step 1: Scan confirmed instances
  console.log('📊 Scanning RecurringGameInstance records...');
  const instances = await scanRecurringGameInstances();
  console.log(`   Found ${instances.length} instances to check\n`);

  if (instances.length === 0) {
    console.log('✅ No instances to process. Migration complete.');
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
    checked: 0,
    needsFix: 0,
    gameIdBackfilled: 0,
    dateFixed: 0,
    alreadyCorrect: 0,
    noMatchingGame: 0,
    updated: 0,
    errors: 0,
  };

  const fixes = [];
  const noMatchInstances = [];

  console.log('🔍 Processing instances by recurring game...\n');

  for (const [recurringGameId, rgInstances] of instancesByRecurringGame) {
    // Query all games for this recurring game
    const games = await queryGamesByRecurringGameId(recurringGameId);
    
    if (games.length === 0) {
      // No games found for this recurring game
      for (const instance of rgInstances) {
        results.checked++;
        results.noMatchingGame++;
        noMatchInstances.push({
          instanceId: instance.id,
          recurringGameId,
          recurringGameName: instance.recurringGameName,
          expectedDate: instance.expectedDate,
          reason: 'NO_GAMES_FOR_RECURRING',
        });
      }
      continue;
    }
    
    // Build date maps for matching
    const { byDateAEST, byDateUTC } = buildGameDateMaps(games);
    
    // Process each instance
    for (const instance of rgInstances) {
      results.checked++;
      
      const currentExpectedDate = instance.expectedDate;
      const currentGameId = instance.gameId;
      
      // Try to find matching game
      // The stored expectedDate is likely the UTC date (bug), so check UTC map first
      let matchedGame = byDateUTC.get(currentExpectedDate);
      let matchedVia = 'UTC';
      
      // If not found in UTC map, try AEST map (in case some were correct)
      if (!matchedGame) {
        matchedGame = byDateAEST.get(currentExpectedDate);
        matchedVia = 'AEST';
      }
      
      if (!matchedGame) {
        results.noMatchingGame++;
        noMatchInstances.push({
          instanceId: instance.id,
          recurringGameId,
          recurringGameName: instance.recurringGameName,
          expectedDate: currentExpectedDate,
          reason: 'NO_GAME_ON_DATE',
          availableDatesUTC: Array.from(byDateUTC.keys()).slice(0, 5),
          availableDatesAEST: Array.from(byDateAEST.keys()).slice(0, 5),
        });
        continue;
      }
      
      // Calculate correct AEST values from the matched game
      const correctDate = extractDateAEST(matchedGame.gameStartDateTime);
      const correctDayOfWeek = getDayOfWeekAEST(matchedGame.gameStartDateTime);
      const correctWeekKey = getWeekKey(correctDate);
      const correctGameId = matchedGame.id;
      
      // Check what needs fixing
      const dateNeedsFix = currentExpectedDate !== correctDate;
      const dayNeedsFix = instance.dayOfWeek !== correctDayOfWeek;
      const weekNeedsFix = instance.weekKey !== correctWeekKey;
      const gameIdNeedsFix = !currentGameId || currentGameId !== correctGameId;
      
      if (dateNeedsFix || dayNeedsFix || weekNeedsFix || gameIdNeedsFix) {
        results.needsFix++;
        if (gameIdNeedsFix) results.gameIdBackfilled++;
        if (dateNeedsFix) results.dateFixed++;
        
        const fix = {
          instanceId: instance.id,
          recurringGameId,
          recurringGameName: instance.recurringGameName,
          matchedVia,
          gameId: correctGameId,
          gameName: matchedGame.name,
          gameStartDateTime: matchedGame.gameStartDateTime,
          current: {
            expectedDate: currentExpectedDate,
            dayOfWeek: instance.dayOfWeek,
            weekKey: instance.weekKey,
            gameId: currentGameId,
          },
          correct: {
            expectedDate: correctDate,
            dayOfWeek: correctDayOfWeek,
            weekKey: correctWeekKey,
            gameId: correctGameId,
          },
          changes: {
            dateChanged: dateNeedsFix,
            dayChanged: dayNeedsFix,
            weekChanged: weekNeedsFix,
            gameIdChanged: gameIdNeedsFix,
          },
        };
        
        fixes.push(fix);
        
        if (options.execute) {
          try {
            await updateInstanceDateFields(instance.id, {
              expectedDate: correctDate,
              dayOfWeek: correctDayOfWeek,
              weekKey: correctWeekKey,
              gameId: correctGameId,
            });
            results.updated++;
            process.stdout.write('.');
            
            // Rate limiting
            if (results.updated % options.batchSize === 0) {
              await sleep(500);
            }
          } catch (err) {
            console.error(`\n❌ Error updating ${instance.id}: ${err.message}`);
            results.errors++;
          }
        }
      } else {
        results.alreadyCorrect++;
      }
    }
    
    // Progress indicator
    process.stdout.write(`\r   Processed ${results.checked}/${instances.length} instances...`);
  }

  // Step 4: Print summary
  console.log('\n\n' + '='.repeat(70));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total instances checked:   ${results.checked}`);
  console.log(`Already correct:           ${results.alreadyCorrect}`);
  console.log(`Needing fixes:             ${results.needsFix}`);
  console.log(`  - gameId backfilled:     ${results.gameIdBackfilled}`);
  console.log(`  - expectedDate fixed:    ${results.dateFixed}`);
  console.log(`No matching game found:    ${results.noMatchingGame}`);
  if (options.execute) {
    console.log(`Successfully updated:      ${results.updated}`);
    console.log(`Errors:                    ${results.errors}`);
  }
  console.log('='.repeat(70));

  // Preview mode: show sample fixes
  if (options.preview && fixes.length > 0) {
    console.log('\n📋 PREVIEW: Sample fixes (first 30)\n');
    console.log('| Current Date | → | Correct Date | gameId? | Matched Via |');
    console.log('|--------------|---|--------------|---------|-------------|');
    
    for (const fix of fixes.slice(0, 30)) {
      const gameIdStatus = fix.changes.gameIdChanged ? 'NEW' : 'ok';
      console.log(`| ${fix.current.expectedDate} | → | ${fix.correct.expectedDate} | ${gameIdStatus.padEnd(7)} | ${fix.matchedVia.padEnd(11)} |`);
    }
    
    if (fixes.length > 30) {
      console.log(`\n... and ${fixes.length - 30} more fixes needed`);
    }
    
    console.log('\n💡 Run with --execute to apply these changes');
  }

  // Analyze the timezone shift pattern
  if (fixes.length > 0) {
    console.log('\n📊 ANALYSIS:');
    
    // Count patterns
    let shiftedPlusOne = 0;
    let shiftedOther = 0;
    let matchedViaUTC = 0;
    let matchedViaAEST = 0;
    
    for (const fix of fixes) {
      if (fix.matchedVia === 'UTC') matchedViaUTC++;
      else matchedViaAEST++;
      
      if (fix.changes.dateChanged) {
        const currentDateObj = new Date(fix.current.expectedDate + 'T12:00:00Z');
        const correctDateObj = new Date(fix.correct.expectedDate + 'T12:00:00Z');
        const diffDays = Math.round((correctDateObj - currentDateObj) / (24 * 60 * 60 * 1000));
        
        if (diffDays === 1) {
          shiftedPlusOne++;
        } else {
          shiftedOther++;
        }
      }
    }
    
    console.log(`   Matched via UTC date map:  ${matchedViaUTC} (confirms UTC bug)`);
    console.log(`   Matched via AEST date map: ${matchedViaAEST}`);
    console.log(`   Date shifted +1 day:       ${shiftedPlusOne}`);
    if (shiftedOther > 0) {
      console.log(`   Other date shifts:         ${shiftedOther}`);
    }
  }

  // Output instances with no matching game
  if (noMatchInstances.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log(`⚠️  ${noMatchInstances.length} instances could not be matched to a game:`);
    console.log('-'.repeat(70));
    
    // Group by reason
    const byReason = {
      NO_GAMES_FOR_RECURRING: noMatchInstances.filter(i => i.reason === 'NO_GAMES_FOR_RECURRING'),
      NO_GAME_ON_DATE: noMatchInstances.filter(i => i.reason === 'NO_GAME_ON_DATE'),
    };
    
    if (byReason.NO_GAMES_FOR_RECURRING.length > 0) {
      console.log(`\n   No games for recurring game: ${byReason.NO_GAMES_FOR_RECURRING.length}`);
      for (const item of byReason.NO_GAMES_FOR_RECURRING.slice(0, 5)) {
        console.log(`     - ${item.recurringGameName || item.recurringGameId}`);
      }
    }
    
    if (byReason.NO_GAME_ON_DATE.length > 0) {
      console.log(`\n   No game on expected date: ${byReason.NO_GAME_ON_DATE.length}`);
      for (const item of byReason.NO_GAME_ON_DATE.slice(0, 10)) {
        console.log(`     - ${item.expectedDate} (${item.recurringGameName || 'unknown'})`);
        if (item.availableDatesUTC?.length > 0) {
          console.log(`       Available UTC: ${item.availableDatesUTC.join(', ')}`);
        }
      }
    }
  }

  // Write detailed report to JSON file
  const outputFile = `timezone-fix-report-${new Date().toISOString().split('T')[0]}.json`;
  const outputData = {
    generatedAt: new Date().toISOString(),
    mode: options.execute ? 'EXECUTE' : 'PREVIEW',
    summary: {
      checked: results.checked,
      alreadyCorrect: results.alreadyCorrect,
      needsFix: results.needsFix,
      gameIdBackfilled: results.gameIdBackfilled,
      dateFixed: results.dateFixed,
      noMatchingGame: results.noMatchingGame,
      updated: results.updated,
      errors: results.errors,
    },
    fixes: fixes,
    noMatchInstances: noMatchInstances,
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
