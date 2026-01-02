/**
 * Migration Script: Add gameCostId and gameFinancialSnapshotId to Game records
 * 
 * This script populates the new foreign key fields on Game records by:
 * 1. Scanning all GameCost records and updating corresponding Game.gameCostId
 * 2. Scanning all GameFinancialSnapshot records and updating corresponding Game.gameFinancialSnapshotId
 * 
 * SCHEMA CHANGES REQUIRED (apply before running this script):
 * 
 * In 30-games.graphql, update the Game model:
 * 
 *   # Add these new fields (around line 192):
 *   gameCostId: ID
 *   gameCost: GameCost @hasOne(fields: ["gameCostId"])
 *   gameFinancialSnapshotId: ID
 *   gameFinancialSnapshot: GameFinancialSnapshot @hasOne(fields: ["gameFinancialSnapshotId"])
 * 
 *   # Remove these old fields:
 *   # gameCost: GameCost @hasOne(fields: ["id"])  <-- DELETE
 *   # gameFinancialSnapshots: [GameFinancialSnapshot] @hasMany(indexName: "byGameFinancialSnapshot", fields: ["id"])  <-- DELETE
 * 
 * Run: node migrate-game-financial-fks.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  UpdateCommand,
  QueryCommand 
} = require('@aws-sdk/lib-dynamodb');

// Configuration
const CONFIG = {
  region: process.env.AWS_REGION || 'ap-southeast-2',
  gameTableName: process.env.GAME_TABLE || 'Game-ht3nugt6lvddpeeuwj3x6mkite-dev',           // UPDATE THIS
  gameCostTableName: process.env.GAME_COST_TABLE || 'GameCost-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  gameFinancialSnapshotTableName: process.env.GAME_FINANCIAL_SNAPSHOT_TABLE || 'GameFinancialSnapshot-ht3nugt6lvddpeeuwj3x6mkite-dev', // UPDATE THIS
  dryRun: process.env.DRY_RUN !== 'false', // Default to dry run
  batchSize: 25,
  delayBetweenBatches: 100, // ms
};

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

// Stats tracking
const stats = {
  gameCosts: { scanned: 0, updated: 0, skipped: 0, errors: 0 },
  snapshots: { scanned: 0, updated: 0, skipped: 0, errors: 0 },
};

/**
 * Scan all items from a table with pagination
 */
async function scanAllItems(tableName) {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const command = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const response = await docClient.send(command);
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;

    console.log(`  Scanned ${items.length} items from ${tableName}...`);
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Update a Game record with a new field value
 */
async function updateGame(gameId, fieldName, fieldValue) {
  if (CONFIG.dryRun) {
    console.log(`  [DRY RUN] Would update Game ${gameId}: ${fieldName} = ${fieldValue}`);
    return true;
  }

  try {
    const command = new UpdateCommand({
      TableName: CONFIG.gameTableName,
      Key: { id: gameId },
      UpdateExpression: 'SET #field = :value, updatedAt = :now',
      ExpressionAttributeNames: {
        '#field': fieldName,
      },
      ExpressionAttributeValues: {
        ':value': fieldValue,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(id)', // Only update if game exists
    });

    await docClient.send(command);
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn(`  Game ${gameId} not found, skipping`);
      return false;
    }
    throw error;
  }
}

/**
 * Process GameCost records
 */
async function migrateGameCosts() {
  console.log('\n=== Migrating GameCost -> Game.gameCostId ===\n');

  const gameCosts = await scanAllItems(CONFIG.gameCostTableName);
  stats.gameCosts.scanned = gameCosts.length;

  console.log(`\nProcessing ${gameCosts.length} GameCost records...\n`);

  for (let i = 0; i < gameCosts.length; i++) {
    const gameCost = gameCosts[i];
    const { id: gameCostId, gameId } = gameCost;

    if (!gameId) {
      console.warn(`  GameCost ${gameCostId} has no gameId, skipping`);
      stats.gameCosts.skipped++;
      continue;
    }

    try {
      const updated = await updateGame(gameId, 'gameCostId', gameCostId);
      if (updated) {
        stats.gameCosts.updated++;
      } else {
        stats.gameCosts.skipped++;
      }
    } catch (error) {
      console.error(`  Error updating Game ${gameId} with gameCostId:`, error.message);
      stats.gameCosts.errors++;
    }

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      console.log(`  Progress: ${i + 1}/${gameCosts.length}`);
    }

    // Rate limiting
    if ((i + 1) % CONFIG.batchSize === 0) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
    }
  }
}

/**
 * Process GameFinancialSnapshot records
 * Note: If multiple snapshots exist per game, this takes the most recent one
 */
async function migrateGameFinancialSnapshots() {
  console.log('\n=== Migrating GameFinancialSnapshot -> Game.gameFinancialSnapshotId ===\n');

  const snapshots = await scanAllItems(CONFIG.gameFinancialSnapshotTableName);
  stats.snapshots.scanned = snapshots.length;

  console.log(`\nProcessing ${snapshots.length} GameFinancialSnapshot records...\n`);

  // Group snapshots by gameId and take the most recent
  const snapshotsByGame = new Map();
  for (const snapshot of snapshots) {
    const { gameId, createdAt } = snapshot;
    if (!gameId) continue;

    const existing = snapshotsByGame.get(gameId);
    if (!existing || (createdAt && createdAt > existing.createdAt)) {
      snapshotsByGame.set(gameId, snapshot);
    }
  }

  console.log(`  Found ${snapshotsByGame.size} unique games with snapshots\n`);

  let processed = 0;
  for (const [gameId, snapshot] of snapshotsByGame) {
    const snapshotId = snapshot.id;

    try {
      const updated = await updateGame(gameId, 'gameFinancialSnapshotId', snapshotId);
      if (updated) {
        stats.snapshots.updated++;
      } else {
        stats.snapshots.skipped++;
      }
    } catch (error) {
      console.error(`  Error updating Game ${gameId} with gameFinancialSnapshotId:`, error.message);
      stats.snapshots.errors++;
    }

    processed++;

    // Progress indicator
    if (processed % 100 === 0) {
      console.log(`  Progress: ${processed}/${snapshotsByGame.size}`);
    }

    // Rate limiting
    if (processed % CONFIG.batchSize === 0) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenBatches));
    }
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Game Financial Foreign Key Migration                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Configuration:');
  console.log(`  Region: ${CONFIG.region}`);
  console.log(`  Game Table: ${CONFIG.gameTableName}`);
  console.log(`  GameCost Table: ${CONFIG.gameCostTableName}`);
  console.log(`  GameFinancialSnapshot Table: ${CONFIG.gameFinancialSnapshotTableName}`);
  console.log(`  Dry Run: ${CONFIG.dryRun}`);
  console.log('');

  if (CONFIG.dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Set DRY_RUN=false to apply changes\n');
  }

  const startTime = Date.now();

  try {
    // Migrate GameCosts
    await migrateGameCosts();

    // Migrate GameFinancialSnapshots
    await migrateGameFinancialSnapshots();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Migration Complete                                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('GameCost Migration:');
  console.log(`  Scanned:  ${stats.gameCosts.scanned}`);
  console.log(`  Updated:  ${stats.gameCosts.updated}`);
  console.log(`  Skipped:  ${stats.gameCosts.skipped}`);
  console.log(`  Errors:   ${stats.gameCosts.errors}`);
  console.log('');
  console.log('GameFinancialSnapshot Migration:');
  console.log(`  Scanned:  ${stats.snapshots.scanned}`);
  console.log(`  Updated:  ${stats.snapshots.updated}`);
  console.log(`  Skipped:  ${stats.snapshots.skipped}`);
  console.log(`  Errors:   ${stats.snapshots.errors}`);
  console.log('');
  console.log(`Duration: ${duration}s`);

  if (CONFIG.dryRun) {
    console.log('\n⚠️  This was a DRY RUN. Run with DRY_RUN=false to apply changes.');
  }
}

// Run migration
main().catch(console.error);
