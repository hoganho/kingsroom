// backfill-entity-venue-counters.js
// Backfills the gameCount, venueCount, and timestamp fields on Entity and Venue records.
//
// This script:
// 1. Scans ALL Games to calculate game counts and find the latest game date per Entity/Venue.
// 2. Scans ALL Venues to calculate venue counts per Entity.
// 3. Updates the Entity and Venue tables with the calculated stats.
//
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// --- CONFIGURATION ---
const DRY_RUN = true; // Set to false to actually update records
const ENV_ID = 'fosb7ek5argnhctz4odpt52eia-staging'; // Your specific env ID
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Table Names
const GAME_TABLE = `Game-${ENV_ID}`;
const VENUE_TABLE = `Venue-${ENV_ID}`;
const ENTITY_TABLE = `Entity-${ENV_ID}`;

// --- Logger ---
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// --- Setup Clients ---
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function main() {
  logger.warn('==============================================');
  logger.warn('  Backfill Counters: Entity & Venue Stats     ');
  logger.warn('==============================================');
  
  if (DRY_RUN) {
    logger.warn('*** DRY_RUN IS ENABLED. NO DATA WILL BE WRITTEN. ***');
  } else {
    logger.warn('*** DRY_RUN IS DISABLED. SCRIPT WILL UPDATE DYNAMODB. ***');
  }

  console.log('\n📋 Configuration:');
  console.log(`   Game Table:      ${GAME_TABLE}`);
  console.log(`   Venue Table:     ${VENUE_TABLE}`);
  console.log(`   Entity Table:    ${ENTITY_TABLE}`);
  console.log(`   Region:          ${REGION}\n`);

  // --- DATA STRUCTURES ---
  // Store aggregations here
  // Format: { [id]: { gameCount: 0, venueCount: 0, lastGameAddedAt: null } }
  const entityStats = {}; 
  const venueStats = {};  

  // --- STEP 1: SCAN GAMES ---
  logger.info('🔍 Step 1: Scanning ALL Games to aggregate counts...');

  let processedGames = 0;
  let lastEvaluatedKey = undefined;

  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: GAME_TABLE,
      // We only need these fields to count and date check
      ProjectionExpression: 'id, entityId, venueId, gameStartDateTime',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    const games = scanResult.Items || [];
    processedGames += games.length;

    for (const game of games) {
      // 1. Aggregate for ENTITY
      if (game.entityId) {
        if (!entityStats[game.entityId]) {
          entityStats[game.entityId] = { gameCount: 0, venueCount: 0, lastGameAddedAt: null };
        }
        entityStats[game.entityId].gameCount++;
        
        // Check for latest date
        if (game.gameStartDateTime) {
          const currentMax = entityStats[game.entityId].lastGameAddedAt;
          if (!currentMax || game.gameStartDateTime > currentMax) {
            entityStats[game.entityId].lastGameAddedAt = game.gameStartDateTime;
          }
        }
      }

      // 2. Aggregate for VENUE
      if (game.venueId) {
        if (!venueStats[game.venueId]) {
          venueStats[game.venueId] = { gameCount: 0, lastGameAddedAt: null };
        }
        venueStats[game.venueId].gameCount++;

        // Check for latest date
        if (game.gameStartDateTime) {
          const currentMax = venueStats[game.venueId].lastGameAddedAt;
          if (!currentMax || game.gameStartDateTime > currentMax) {
            venueStats[game.venueId].lastGameAddedAt = game.gameStartDateTime;
          }
        }
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    if (processedGames % 1000 === 0) process.stdout.write('.'); // Progress dot
  } while (lastEvaluatedKey);

  console.log(''); // New line after dots
  logger.success(`Scanned ${processedGames} games.`);


  // --- STEP 2: SCAN VENUES ---
  logger.info('🔍 Step 2: Scanning ALL Venues to aggregate Entity.venueCount...');

  let processedVenues = 0;
  lastEvaluatedKey = undefined;

  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: VENUE_TABLE,
      ProjectionExpression: 'id, entityId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    const venues = scanResult.Items || [];
    processedVenues += venues.length;

    for (const venue of venues) {
      // Update Entity venue count
      if (venue.entityId) {
        if (!entityStats[venue.entityId]) {
          entityStats[venue.entityId] = { gameCount: 0, venueCount: 0, lastGameAddedAt: null };
        }
        entityStats[venue.entityId].venueCount++;
      }
      
      // Ensure this venue exists in our stats object (even if it has 0 games)
      if (!venueStats[venue.id]) {
        venueStats[venue.id] = { gameCount: 0, lastGameAddedAt: null };
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    if (processedVenues % 500 === 0) process.stdout.write('.');
  } while (lastEvaluatedKey);

  console.log('');
  logger.success(`Scanned ${processedVenues} venues.`);


  // --- STEP 3: UPDATE ENTITIES ---
  logger.info('\n💾 Step 3: Updating Entity Records...');
  
  const entityIds = Object.keys(entityStats);
  let entityUpdatedCount = 0;
  let entityErrors = 0;

  for (const entityId of entityIds) {
    const stats = entityStats[entityId];
    
    if (DRY_RUN) {
      logger.info(`[DRY_RUN] Would update Entity ${entityId}: GameCount=${stats.gameCount}, VenueCount=${stats.venueCount}, LastGame=${stats.lastGameAddedAt}`);
      entityUpdatedCount++;
      continue;
    }

    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: ENTITY_TABLE,
        Key: { id: entityId },
        UpdateExpression: `
          SET gameCount = :gc, 
              venueCount = :vc, 
              lastGameAddedAt = :lg, 
              lastDataRefreshedAt = :now,
              updatedAt = :now,
              #lca = :timestamp,
              #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
          '#lca': '_lastChangedAt',
          '#v': '_version',
        },
        ExpressionAttributeValues: {
          ':gc': stats.gameCount,
          ':vc': stats.venueCount,
          ':lg': stats.lastGameAddedAt,
          ':now': new Date().toISOString(),
          ':timestamp': Date.now(),
          ':zero': 0,
          ':one': 1,
        },
      }));
      // logger.success(`Updated Entity ${entityId}`); // Optional: noisy if many entities
      entityUpdatedCount++;
    } catch (error) {
      logger.error(`Failed to update Entity ${entityId}: ${error.message}`);
      entityErrors++;
    }
  }


  // --- STEP 4: UPDATE VENUES ---
  logger.info('\n💾 Step 4: Updating Venue Records...');
  
  const venueIds = Object.keys(venueStats);
  let venueUpdatedCount = 0;
  let venueErrors = 0;

  for (const venueId of venueIds) {
    const stats = venueStats[venueId];

    if (DRY_RUN) {
      // logger.info(`[DRY_RUN] Would update Venue ${venueId}: GameCount=${stats.gameCount}`);
      venueUpdatedCount++;
      continue;
    }

    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: VENUE_TABLE,
        Key: { id: venueId },
        UpdateExpression: `
          SET gameCount = :gc, 
              lastGameAddedAt = :lg, 
              lastDataRefreshedAt = :now,
              updatedAt = :now,
              #lca = :timestamp,
              #v = if_not_exists(#v, :zero) + :one
        `,
        ExpressionAttributeNames: {
          '#lca': '_lastChangedAt',
          '#v': '_version',
        },
        ExpressionAttributeValues: {
          ':gc': stats.gameCount,
          ':lg': stats.lastGameAddedAt,
          ':now': new Date().toISOString(),
          ':timestamp': Date.now(),
          ':zero': 0,
          ':one': 1,
        },
      }));
      venueUpdatedCount++;
      if (venueUpdatedCount % 100 === 0) process.stdout.write('.');
    } catch (error) {
      logger.error(`Failed to update Venue ${venueId}: ${error.message}`);
      venueErrors++;
    }
  }

  // --- SUMMARY ---
  logger.success('\n========================================');
  logger.success('           COMPLETED                    ');
  logger.success('========================================');
  logger.success(`Entities Processed: ${entityUpdatedCount} (Errors: ${entityErrors})`);
  logger.success(`Venues Processed:   ${venueUpdatedCount} (Errors: ${venueErrors})`);

  if (DRY_RUN) {
    logger.warn('\n*** DRY_RUN WAS ENABLED. NO DATA WAS WRITTEN. ***');
    logger.info('Review the output, then set DRY_RUN = false to update data.');
  } else {
    logger.success('\n✅ All records have been updated in DynamoDB.');
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});