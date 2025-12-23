#!/usr/bin/env node
/*
  sync-counts.js
  
  One-time script to initialize gameCount, seriesGameCount, and venueCount
  from existing data. Run this after deploying EVDMC to sync up the counts.
  
  Usage:
    node sync-counts.js [--env dev|staging|prod] [--dry-run]
  
  Examples:
    node sync-counts.js                    # Runs on dev, applies changes
    node sync-counts.js --env prod         # Runs on prod
    node sync-counts.js --dry-run          # Preview mode, no changes
*/

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// Parse arguments
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const env = envIndex !== -1 ? args[envIndex + 1] : 'dev';
const dryRun = args.includes('--dry-run');

console.log(`\n🎯 Sync Counts Script`);
console.log(`   Environment: ${env}`);
console.log(`   Dry Run: ${dryRun}\n`);

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

// Table names based on environment
const GAME_TABLE = `Game-${env}`;
const VENUE_TABLE = `Venue-${env}`;
const ENTITY_TABLE = `Entity-${env}`;

/**
 * Scan all items from a DynamoDB table with pagination
 */
async function scanAll(tableName, projectionExpression) {
  const items = [];
  let lastKey = null;
  
  do {
    const result = await docClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: projectionExpression,
      ExclusiveStartKey: lastKey
    }));
    
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
    
    if (lastKey) {
      process.stdout.write(`\r   Scanned ${items.length} items from ${tableName}...`);
    }
  } while (lastKey);
  
  console.log(`\r   Scanned ${items.length} items from ${tableName}      `);
  return items;
}

/**
 * Check if a game is part of a series
 */
function isSeriesGame(game) {
  return !!(game.isSeries === true || game.tournamentSeriesId);
}

async function syncCounts() {
  try {
    console.log('📊 Scanning tables...\n');
    
    // 1. Scan all games
    const games = await scanAll(GAME_TABLE, 'id, entityId, venueId, isSeries, tournamentSeriesId');
    
    // 2. Scan all venues
    const venues = await scanAll(VENUE_TABLE, 'id, entityId');
    
    // 3. Calculate counts
    console.log('\n🔢 Calculating counts...\n');
    
    // Entity counts: { entityId: { regular: N, series: N, venues: N } }
    const entityCounts = new Map();
    
    // Venue counts: { venueId: { regular: N, series: N } }
    const venueCounts = new Map();
    
    // Process venues first (for entity venue counts)
    for (const venue of venues) {
      if (venue.entityId) {
        if (!entityCounts.has(venue.entityId)) {
          entityCounts.set(venue.entityId, { regular: 0, series: 0, venues: 0 });
        }
        entityCounts.get(venue.entityId).venues++;
      }
      
      // Initialize venue counts
      if (!venueCounts.has(venue.id)) {
        venueCounts.set(venue.id, { regular: 0, series: 0 });
      }
    }
    
    // Process games
    for (const game of games) {
      const isSeries = isSeriesGame(game);
      
      // Entity counts
      if (game.entityId) {
        if (!entityCounts.has(game.entityId)) {
          entityCounts.set(game.entityId, { regular: 0, series: 0, venues: 0 });
        }
        if (isSeries) {
          entityCounts.get(game.entityId).series++;
        } else {
          entityCounts.get(game.entityId).regular++;
        }
      }
      
      // Venue counts
      if (game.venueId) {
        if (!venueCounts.has(game.venueId)) {
          venueCounts.set(game.venueId, { regular: 0, series: 0 });
        }
        if (isSeries) {
          venueCounts.get(game.venueId).series++;
        } else {
          venueCounts.get(game.venueId).regular++;
        }
      }
    }
    
    // 4. Summary
    console.log('📋 Summary:\n');
    console.log(`   Entities to update: ${entityCounts.size}`);
    console.log(`   Venues to update: ${venueCounts.size}`);
    console.log(`   Total games: ${games.length}`);
    console.log(`   Total venues: ${venues.length}\n`);
    
    // Show sample data
    console.log('📝 Sample entity counts:');
    let sampleCount = 0;
    for (const [entityId, counts] of entityCounts) {
      if (sampleCount >= 3) break;
      console.log(`   ${entityId.substring(0, 8)}... → gameCount: ${counts.regular}, seriesGameCount: ${counts.series}, venueCount: ${counts.venues}`);
      sampleCount++;
    }
    
    console.log('\n📝 Sample venue counts:');
    sampleCount = 0;
    for (const [venueId, counts] of venueCounts) {
      if (sampleCount >= 3) break;
      console.log(`   ${venueId.substring(0, 8)}... → gameCount: ${counts.regular}, seriesGameCount: ${counts.series}`);
      sampleCount++;
    }
    
    if (dryRun) {
      console.log('\n⚠️  DRY RUN - No changes made. Remove --dry-run to apply.\n');
      return;
    }
    
    // 5. Apply updates
    console.log('\n🚀 Applying updates...\n');
    
    // Update entities
    let entityUpdates = 0;
    for (const [entityId, counts] of entityCounts) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: ENTITY_TABLE,
          Key: { id: entityId },
          UpdateExpression: 'SET gameCount = :gc, seriesGameCount = :sc, venueCount = :vc, lastDataRefreshedAt = :now',
          ExpressionAttributeValues: {
            ':gc': counts.regular,
            ':sc': counts.series,
            ':vc': counts.venues,
            ':now': new Date().toISOString()
          }
        }));
        entityUpdates++;
        process.stdout.write(`\r   Updated ${entityUpdates}/${entityCounts.size} entities...`);
      } catch (err) {
        console.error(`\n   ❌ Error updating entity ${entityId}:`, err.message);
      }
    }
    console.log(`\r   ✅ Updated ${entityUpdates}/${entityCounts.size} entities      `);
    
    // Update venues
    let venueUpdates = 0;
    for (const [venueId, counts] of venueCounts) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: VENUE_TABLE,
          Key: { id: venueId },
          UpdateExpression: 'SET gameCount = :gc, seriesGameCount = :sc, lastDataRefreshedAt = :now',
          ExpressionAttributeValues: {
            ':gc': counts.regular,
            ':sc': counts.series,
            ':now': new Date().toISOString()
          }
        }));
        venueUpdates++;
        process.stdout.write(`\r   Updated ${venueUpdates}/${venueCounts.size} venues...`);
      } catch (err) {
        console.error(`\n   ❌ Error updating venue ${venueId}:`, err.message);
      }
    }
    console.log(`\r   ✅ Updated ${venueUpdates}/${venueCounts.size} venues      `);
    
    console.log('\n✨ Done!\n');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

syncCounts();
