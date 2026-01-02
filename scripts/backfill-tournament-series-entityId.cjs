/**
 * MIGRATION SCRIPT: Backfill entityId on TournamentSeries
 * 
 * Problem: TournamentSeries records don't have entityId set, causing
 * refreshAllMetrics to not find any series when querying by entity.
 * 
 * Solution: Look up the venueId on each TournamentSeries, find the
 * corresponding Venue record, and copy its entityId to the series.
 * 
 * Usage:
 *   1. Update the TABLE_NAMES below with your actual table names
 *   2. Run: node backfill-tournament-series-entityId.js
 * 
 * Or integrate into a Lambda function for production use.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  GetCommand,
  UpdateCommand 
} = require("@aws-sdk/lib-dynamodb");

// ==============================================
// CONFIGURATION - Update these!
// ==============================================

const REGION = "ap-southeast-2";
const API_ID = "ht3nugt6lvddpeeuwj3x6mkite";
const ENV = "dev";

// Table names
const TABLE_NAMES = {
  TournamentSeries: `TournamentSeries-${API_ID}-${ENV}`,
  Venue: `Venue-${API_ID}-${ENV}`
};

// Set to true to see what would happen without making changes
const DRY_RUN = false;

// ==============================================
// SETUP
// ==============================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// ==============================================
// HELPER FUNCTIONS
// ==============================================

async function scanAllItems(tableName) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getVenue(venueId) {
  if (!venueId) return null;
  
  try {
    const response = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.Venue,
      Key: { id: venueId }
    }));
    return response.Item || null;
  } catch (error) {
    console.error(`Error fetching venue ${venueId}:`, error.message);
    return null;
  }
}

async function updateTournamentSeriesEntityId(seriesId, entityId) {
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAMES.TournamentSeries,
    Key: { id: seriesId },
    UpdateExpression: 'SET entityId = :entityId, updatedAt = :now, #lca = :lastChanged ADD #v :inc',
    ExpressionAttributeNames: {
      '#lca': '_lastChangedAt',
      '#v': '_version'
    },
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':now': now,
      ':lastChanged': Date.now(),
      ':inc': 1
    }
  }));
}

// ==============================================
// MAIN MIGRATION
// ==============================================

async function runMigration() {
  console.log('='.repeat(60));
  console.log('TOURNAMENT SERIES ENTITYID BACKFILL MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : '🔴 LIVE RUN'}`);
  console.log(`Tables:`);
  console.log(`  TournamentSeries: ${TABLE_NAMES.TournamentSeries}`);
  console.log(`  Venue: ${TABLE_NAMES.Venue}`);
  console.log('');
  
  // Step 1: Fetch all TournamentSeries
  console.log('📋 Fetching all TournamentSeries records...');
  const allSeries = await scanAllItems(TABLE_NAMES.TournamentSeries);
  console.log(`   Found ${allSeries.length} TournamentSeries records`);
  
  // Step 2: Categorize records
  const needsUpdate = allSeries.filter(s => !s.entityId);
  const alreadyHasEntityId = allSeries.filter(s => s.entityId);
  
  console.log(`   ${alreadyHasEntityId.length} already have entityId`);
  console.log(`   ${needsUpdate.length} need entityId backfill`);
  console.log('');
  
  if (needsUpdate.length === 0) {
    console.log('✅ All TournamentSeries records already have entityId. Nothing to do!');
    return;
  }
  
  // Step 3: Build venue -> entity mapping
  console.log('📋 Building venue -> entity mapping...');
  const venueIds = [...new Set(needsUpdate.map(s => s.venueId).filter(Boolean))];
  console.log(`   Found ${venueIds.length} unique venueIds to look up`);
  
  const venueEntityMap = new Map();
  for (const venueId of venueIds) {
    const venue = await getVenue(venueId);
    if (venue && venue.entityId) {
      venueEntityMap.set(venueId, venue.entityId);
      console.log(`   ✓ Venue ${venueId} -> Entity ${venue.entityId} (${venue.name || 'unnamed'})`);
    } else {
      console.log(`   ⚠️ Venue ${venueId} not found or has no entityId`);
    }
  }
  console.log('');
  
  // Step 4: Process updates
  console.log('🔄 Processing updates...');
  
  const results = {
    updated: 0,
    skipped_no_venue: 0,
    skipped_venue_no_entity: 0,
    errors: 0
  };
  
  for (const series of needsUpdate) {
    const seriesName = series.name || series.id;
    
    // Check if series has venueId
    if (!series.venueId) {
      console.log(`   ⚠️ SKIP: "${seriesName}" - no venueId`);
      results.skipped_no_venue++;
      continue;
    }
    
    // Look up entityId from venue
    const entityId = venueEntityMap.get(series.venueId);
    if (!entityId) {
      console.log(`   ⚠️ SKIP: "${seriesName}" - venue ${series.venueId} has no entityId`);
      results.skipped_venue_no_entity++;
      continue;
    }
    
    // Update the record
    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would update: "${seriesName}" -> entityId: ${entityId}`);
      results.updated++;
    } else {
      try {
        await updateTournamentSeriesEntityId(series.id, entityId);
        console.log(`   ✓ Updated: "${seriesName}" -> entityId: ${entityId}`);
        results.updated++;
      } catch (error) {
        console.error(`   ❌ ERROR updating "${seriesName}":`, error.message);
        results.errors++;
      }
    }
  }
  
  // Step 5: Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Total TournamentSeries: ${allSeries.length}`);
  console.log(`Already had entityId: ${alreadyHasEntityId.length}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Skipped (no venueId): ${results.skipped_no_venue}`);
  console.log(`Skipped (venue has no entityId): ${results.skipped_venue_no_entity}`);
  console.log(`Errors: ${results.errors}`);
  console.log('');
  
  if (DRY_RUN && results.updated > 0) {
    console.log('💡 To apply changes, set DRY_RUN = false and run again.');
  } else if (!DRY_RUN && results.updated > 0) {
    console.log('✅ Migration complete! Re-run refreshAllMetrics to generate TournamentSeriesMetrics.');
  }
}

// ==============================================
// RUN
// ==============================================

runMigration()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
