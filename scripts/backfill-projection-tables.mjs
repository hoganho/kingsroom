#!/usr/bin/env node
/**
 * Backfill Script: Populate venueLogoCached and new fields on projection tables
 * 
 * This script updates ActiveGame, RecentlyFinishedGame, and UpcomingGame tables
 * with missing venueLogoCached (from Venue table) and isSatellite, isRecurring,
 * recurringGameName fields (from Game table).
 * 
 * Usage:
 *   node backfill-projection-tables.mjs --preview
 *   node backfill-projection-tables.mjs --execute
 *   node backfill-projection-tables.mjs --execute --table ActiveGame
 *   node backfill-projection-tables.mjs --execute --entity-id <id>
 * 
 * Options:
 *   --preview, -p              Preview changes without executing (default)
 *   --execute, -e              Execute the migration
 *   --table <name>             Only process specific table (ActiveGame, RecentlyFinishedGame, UpcomingGame)
 *   --entity-id <id>           Filter by entity ID
 *   --limit <n>                Limit number of records to process
 *   --batch-size <n>           Batch size for updates (default: 25)
 *   --venue-logo-only          Only update venueLogoCached field
 *   --game-fields-only         Only update isSatellite, isRecurring, recurringGameName
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
  // Or set via environment variables
  apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ht3nugt6lvddpeeuwj3x6mkite',
  env: process.env.ENV || 'dev',
};

// Generate table name
const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;
};

// Tables to process
const PROJECTION_TABLES = ['ActiveGame', 'RecentlyFinishedGame', 'UpcomingGame'];

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  table: null, // null = all tables
  entityId: null,
  limit: null,
  batchSize: 25,
  venueLogoOnly: false,
  gameFieldsOnly: false,
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
      options.table = args[++i];
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
    case '--venue-logo-only':
      options.venueLogoOnly = true;
      break;
    case '--game-fields-only':
      options.gameFieldsOnly = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Backfill Script: Populate venueLogoCached and new fields on projection tables

Usage:
  node backfill-projection-tables.mjs [options]

Options:
  --preview, -p              Preview changes without executing (default)
  --execute, -e              Execute the migration
  --table <name>             Only process specific table (ActiveGame, RecentlyFinishedGame, UpcomingGame)
  --entity-id <id>           Filter by entity ID
  --limit <n>                Limit number of records to process
  --batch-size <n>           Batch size for updates (default: 25)
  --venue-logo-only          Only update venueLogoCached field
  --game-fields-only         Only update isSatellite, isRecurring, recurringGameName
  --help, -h                 Show this help message
      `);
      process.exit(0);
  }
}

// Validate table option
if (options.table && !PROJECTION_TABLES.includes(options.table)) {
  console.error(`Invalid table: ${options.table}. Must be one of: ${PROJECTION_TABLES.join(', ')}`);
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

// Cache for venue lookups
const venueCache = new Map();

/**
 * Get venue details (with caching)
 */
async function getVenue(venueId) {
  if (!venueId) return null;
  
  if (venueCache.has(venueId)) {
    return venueCache.get(venueId);
  }
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: getTableName('Venue'),
      Key: { id: venueId },
      ProjectionExpression: '#name, logo',
      ExpressionAttributeNames: { '#name': 'name' },
    }));
    
    const venue = result.Item || null;
    venueCache.set(venueId, venue);
    return venue;
  } catch (err) {
    console.warn(`   Error fetching venue ${venueId}: ${err.message}`);
    venueCache.set(venueId, null);
    return null;
  }
}

// Cache for game lookups
const gameCache = new Map();

/**
 * Get game details (with caching)
 */
async function getGame(gameId) {
  if (!gameId) return null;
  
  if (gameCache.has(gameId)) {
    return gameCache.get(gameId);
  }
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: getTableName('Game'),
      Key: { id: gameId },
      ProjectionExpression: 'id, isSatellite, recurringGameId',
    }));
    
    const game = result.Item || null;
    gameCache.set(gameId, game);
    return game;
  } catch (err) {
    console.warn(`   Error fetching game ${gameId}: ${err.message}`);
    gameCache.set(gameId, null);
    return null;
  }
}

/**
 * Scan a projection table
 */
async function scanProjectionTable(tableName) {
  const records = [];
  let lastEvaluatedKey = undefined;
  
  const filterExpressions = [];
  const expressionAttributeValues = {};
  
  if (options.entityId) {
    filterExpressions.push('entityId = :entityId');
    expressionAttributeValues[':entityId'] = options.entityId;
  }

  do {
    const params = {
      TableName: getTableName(tableName),
      ExclusiveStartKey: lastEvaluatedKey,
    };
    
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    const result = await docClient.send(new ScanCommand(params));
    records.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    // Check limit
    if (options.limit && records.length >= options.limit) {
      return records.slice(0, options.limit);
    }
    
    // Rate limiting
    await sleep(100);
  } while (lastEvaluatedKey);

  return records;
}

/**
 * Update a projection record
 */
async function updateProjectionRecord(tableName, id, updates) {
  const now = new Date().toISOString();
  
  const updateExpressions = ['updatedAt = :updatedAt', '#lastChangedAt = :lastChangedAt'];
  const expressionAttributeNames = { '#lastChangedAt': '_lastChangedAt' };
  const expressionAttributeValues = {
    ':updatedAt': now,
    ':lastChangedAt': Date.now(),
  };
  
  for (const [key, value] of Object.entries(updates)) {
    updateExpressions.push(`#${key} = :${key}`);
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = value;
  }
  
  const params = {
    TableName: getTableName(tableName),
    Key: { id },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  return docClient.send(new UpdateCommand(params));
}

/**
 * Determine what updates are needed for a record
 */
async function determineUpdates(record, tableName) {
  const updates = {};
  const reasons = [];
  
  // Check venue logo
  if (!options.gameFieldsOnly) {
    if (record.venueId && !record.venueLogoCached) {
      const venue = await getVenue(record.venueId);
      if (venue?.logo) {
        updates.venueLogoCached = venue.logo;
        reasons.push('venueLogoCached');
      }
      // Also update venueName if missing
      if (!record.venueName && venue?.name) {
        updates.venueName = venue.name;
        reasons.push('venueName');
      }
    }
  }
  
  // Check game fields (only for tables that have gameId)
  if (!options.venueLogoOnly && record.gameId) {
    const game = await getGame(record.gameId);
    if (game) {
      // isSatellite
      if (record.isSatellite === undefined || record.isSatellite === null) {
        updates.isSatellite = game.isSatellite || false;
        reasons.push('isSatellite');
      }
      
      // isRecurring (derived from recurringGameId)
      if (record.isRecurring === undefined || record.isRecurring === null) {
        updates.isRecurring = !!game.recurringGameId;
        reasons.push('isRecurring');
      }
      
      // recurringGameName - we'd need to fetch RecurringGame for this
      // For now, just set to null if missing
      if (record.recurringGameName === undefined) {
        updates.recurringGameName = null;
        reasons.push('recurringGameName');
      }
    }
  }
  
  return { updates, reasons };
}

// ============================================================================
// MAIN MIGRATION LOGIC
// ============================================================================

async function processTable(tableName) {
  console.log(`\n📊 Processing ${tableName}...`);
  
  // Scan records
  const records = await scanProjectionTable(tableName);
  console.log(`   Found ${records.length} records to check`);
  
  if (records.length === 0) {
    return { processed: 0, updated: 0, skipped: 0, errors: 0 };
  }
  
  const results = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  
  const pendingUpdates = [];
  
  for (const record of records) {
    results.processed++;
    
    try {
      const { updates, reasons } = await determineUpdates(record, tableName);
      
      if (Object.keys(updates).length === 0) {
        results.skipped++;
        continue;
      }
      
      pendingUpdates.push({
        id: record.id,
        name: record.name || 'Unknown',
        updates,
        reasons,
      });
      
      if (options.execute) {
        try {
          await updateProjectionRecord(tableName, record.id, updates);
          results.updated++;
          process.stdout.write('.');
        } catch (err) {
          console.error(`\n   ❌ Error updating ${record.id}: ${err.message}`);
          results.errors++;
        }
        
        // Rate limiting
        if (results.updated % options.batchSize === 0) {
          await sleep(500);
        }
      }
    } catch (err) {
      console.error(`\n   ❌ Error processing ${record.id}: ${err.message}`);
      results.errors++;
    }
  }
  
  if (options.execute && results.updated > 0) {
    console.log(''); // New line after dots
  }
  
  // Preview mode: show sample updates
  if (options.preview && pendingUpdates.length > 0) {
    console.log(`\n   📋 PREVIEW: Sample updates (first 10)\n`);
    
    for (const update of pendingUpdates.slice(0, 10)) {
      const name = update.name.substring(0, 40);
      console.log(`   • ${name}`);
      console.log(`     Fields: ${update.reasons.join(', ')}`);
    }
    
    if (pendingUpdates.length > 10) {
      console.log(`\n   ... and ${pendingUpdates.length - 10} more updates`);
    }
  }
  
  results.pendingCount = pendingUpdates.length;
  return results;
}

async function runBackfill() {
  console.log('\n' + '='.repeat(70));
  console.log('BACKFILL: Projection Tables (venueLogoCached + Game Fields)');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Environment: ${CONFIG.env}`);
  console.log(`API ID: ${CONFIG.apiId}`);
  console.log(`Tables: ${options.table || 'All (ActiveGame, RecentlyFinishedGame, UpcomingGame)'}`);
  console.log(`Filters:`);
  if (options.entityId) console.log(`  - Entity ID: ${options.entityId}`);
  if (options.limit) console.log(`  - Limit: ${options.limit}`);
  if (options.venueLogoOnly) console.log(`  - Venue logo only`);
  if (options.gameFieldsOnly) console.log(`  - Game fields only`);
  console.log('='.repeat(70));

  // Confirmation for execute mode
  if (options.execute) {
    const confirm = await prompt('⚠️  You are about to UPDATE projection tables. Type "yes" to continue: ');
    if (confirm !== 'yes') {
      console.log('Backfill cancelled.');
      process.exit(0);
    }
    console.log('');
  }

  const tablesToProcess = options.table ? [options.table] : PROJECTION_TABLES;
  const totalResults = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    pendingCount: 0,
  };
  
  for (const tableName of tablesToProcess) {
    const results = await processTable(tableName);
    totalResults.processed += results.processed;
    totalResults.updated += results.updated;
    totalResults.skipped += results.skipped;
    totalResults.errors += results.errors;
    totalResults.pendingCount += results.pendingCount || 0;
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('BACKFILL SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total records processed: ${totalResults.processed}`);
  console.log(`Already complete:        ${totalResults.skipped}`);
  console.log(`Need updates:            ${totalResults.pendingCount}`);
  if (options.execute) {
    console.log(`Successfully updated:    ${totalResults.updated}`);
    console.log(`Errors:                  ${totalResults.errors}`);
  }
  console.log('='.repeat(70));
  
  if (options.preview && totalResults.pendingCount > 0) {
    console.log('\n💡 Run with --execute to apply these changes');
  }

  // Clear caches
  console.log(`\nCache stats: ${venueCache.size} venues, ${gameCache.size} games cached`);
  
  console.log('\n✅ Backfill complete!\n');
}

// ============================================================================
// RUN
// ============================================================================

runBackfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
