#!/usr/bin/env node
/**
 * backfill-financial-snapshots.mjs
 * 
 * PURPOSE: Reprocess games to fix financial snapshots where
 * totalGuaranteeOverlayCost is 0 but game.guaranteeOverlayCost > 0
 * 
 * USAGE:
 *   # Interactive mode - prompts for environment
 *   node backfill-financial-snapshots.mjs
 * 
 *   # With environment flag
 *   node backfill-financial-snapshots.mjs --env dev
 *   node backfill-financial-snapshots.mjs --env prod
 * 
 *   # Execute mode (actually makes changes)
 *   node backfill-financial-snapshots.mjs --env dev --execute
 * 
 *   # Specific entity
 *   node backfill-financial-snapshots.mjs --entityId abc123 --execute
 * 
 * ENVIRONMENT VARIABLES:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use AWS profile)
 *   AWS_REGION (defaults to ap-southeast-2)
 * 
 * ⚠️ WARNING: This performs full table scans and may incur RCU costs.
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import * as readline from 'readline';

// ------------------------------------------------------------------
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
    LAMBDA_SUFFIX: 'dev',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
    LAMBDA_SUFFIX: 'prod',
  },
};

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// For large tables, you might want to limit scan page size
const SCAN_PAGE_LIMIT = Number(process.env.SCAN_PAGE_LIMIT || 0);

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

let SELECTED_ENV = null;
let EXECUTE_MODE = false;
let ENTITY_ID_FILTER = null;

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENTS
// ------------------------------------------------------------------

const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function getTableName(model) {
  const config = ENVIRONMENTS[SELECTED_ENV];
  return `${model}-${config.API_ID}-${config.ENV_SUFFIX}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  
  // Check for --env flag
  const envIndex = args.indexOf('--env');
  if (envIndex !== -1 && args[envIndex + 1]) {
    const env = args[envIndex + 1].toLowerCase();
    if (env === 'dev' || env === 'prod') {
      SELECTED_ENV = env;
    }
  }
  
  // Check for --entityId flag
  const entityIndex = args.indexOf('--entityId');
  if (entityIndex !== -1 && args[entityIndex + 1]) {
    ENTITY_ID_FILTER = args[entityIndex + 1];
  }
  
  // Check for --execute flag
  EXECUTE_MODE = args.includes('--execute');
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          FINANCIAL SNAPSHOT BACKFILL SCRIPT                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    logger.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// DATA FUNCTIONS
// ------------------------------------------------------------------

/**
 * Find games where guaranteeOverlayCost > 0
 */
async function findGamesWithOverlay() {
  const games = [];
  let lastEvaluatedKey = undefined;
  
  logger.info('Scanning for games with guaranteeOverlayCost > 0...');
  
  do {
    const params = {
      TableName: getTableName('Game'),
      FilterExpression: 'guaranteeOverlayCost > :zero',
      ExpressionAttributeValues: {
        ':zero': { N: '0' }
      },
      ExclusiveStartKey: lastEvaluatedKey
    };
    
    if (ENTITY_ID_FILTER) {
      params.FilterExpression += ' AND entityId = :entityId';
      params.ExpressionAttributeValues[':entityId'] = { S: ENTITY_ID_FILTER };
    }
    
    if (SCAN_PAGE_LIMIT > 0) {
      params.Limit = SCAN_PAGE_LIMIT;
    }
    
    const result = await ddbClient.send(new ScanCommand(params));
    
    if (result.Items) {
      for (const item of result.Items) {
        const game = unmarshall(item);
        games.push(game);
      }
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    process.stdout.write(`  Found ${games.length} games so far...\r`);
    
  } while (lastEvaluatedKey);
  
  console.log(''); // Clear the line
  logger.success(`Found ${games.length} games with guaranteeOverlayCost > 0`);
  return games;
}

/**
 * Check if a game's snapshot has mismatched overlay cost
 */
async function checkSnapshotMismatch(game) {
  if (!game.gameFinancialSnapshotId) {
    return { hasMismatch: true, reason: 'No snapshot exists', snapshotValue: null };
  }
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: getTableName('GameFinancialSnapshot'),
      Key: { id: game.gameFinancialSnapshotId }
    }));
    
    if (!result.Item) {
      return { hasMismatch: true, reason: 'Snapshot not found', snapshotValue: null };
    }
    
    const snapshotOverlay = result.Item.totalGuaranteeOverlayCost || 0;
    const gameOverlay = game.guaranteeOverlayCost || 0;
    
    if (snapshotOverlay !== gameOverlay) {
      return { 
        hasMismatch: true, 
        reason: `Mismatch: snapshot=$${snapshotOverlay}, game=$${gameOverlay}`,
        snapshotValue: snapshotOverlay
      };
    }
    
    return { hasMismatch: false, snapshotValue: snapshotOverlay };
    
  } catch (error) {
    return { hasMismatch: true, reason: `Error: ${error.message}`, snapshotValue: null };
  }
}

/**
 * Directly update the GameFinancialSnapshot with correct overlay cost
 * Also updates GameCost if it exists
 */
async function updateSnapshotOverlayCost(game) {
  const now = new Date().toISOString();
  const guaranteeOverlayCost = game.guaranteeOverlayCost || 0;
  
  const results = {
    snapshotUpdated: false,
    costUpdated: false,
    error: null
  };
  
  // Update GameFinancialSnapshot
  if (game.gameFinancialSnapshotId) {
    try {
      // First get the existing snapshot to recalculate totals
      const snapshotResult = await docClient.send(new GetCommand({
        TableName: getTableName('GameFinancialSnapshot'),
        Key: { id: game.gameFinancialSnapshotId }
      }));
      
      if (snapshotResult.Item) {
        const snapshot = snapshotResult.Item;
        
        // Recalculate totalCost with correct overlay
        const oldOverlay = snapshot.totalGuaranteeOverlayCost || 0;
        const oldTotalCost = snapshot.totalCost || 0;
        const newTotalCost = oldTotalCost - oldOverlay + guaranteeOverlayCost;
        
        // Recalculate profit metrics
        const totalRevenue = snapshot.totalRevenue || 0;
        const newNetProfit = totalRevenue - newTotalCost;
        const newProfitMargin = totalRevenue > 0 ? newNetProfit / totalRevenue : 0;
        
        // Recalculate per-player metrics
        const totalUniquePlayers = snapshot.totalUniquePlayers || 1;
        const newCostPerPlayer = newTotalCost / totalUniquePlayers;
        const newProfitPerPlayer = newNetProfit / totalUniquePlayers;
        const newGuaranteeOverlayPerPlayer = guaranteeOverlayCost / totalUniquePlayers;
        
        await docClient.send(new UpdateCommand({
          TableName: getTableName('GameFinancialSnapshot'),
          Key: { id: game.gameFinancialSnapshotId },
          UpdateExpression: `SET 
            totalGuaranteeOverlayCost = :overlay,
            totalCost = :totalCost,
            netProfit = :netProfit,
            profitMargin = :profitMargin,
            costPerPlayer = :costPerPlayer,
            profitPerPlayer = :profitPerPlayer,
            guaranteeOverlayPerPlayer = :overlayPerPlayer,
            updatedAt = :now`,
          ExpressionAttributeValues: {
            ':overlay': guaranteeOverlayCost,
            ':totalCost': Math.round(newTotalCost * 100) / 100,
            ':netProfit': Math.round(newNetProfit * 100) / 100,
            ':profitMargin': Math.round(newProfitMargin * 10000) / 10000,
            ':costPerPlayer': Math.round(newCostPerPlayer * 100) / 100,
            ':profitPerPlayer': Math.round(newProfitPerPlayer * 100) / 100,
            ':overlayPerPlayer': Math.round(newGuaranteeOverlayPerPlayer * 100) / 100,
            ':now': now
          }
        }));
        
        results.snapshotUpdated = true;
      }
    } catch (error) {
      results.error = `Snapshot update failed: ${error.message}`;
    }
  }
  
  // Update GameCost if it exists
  if (game.gameCostId) {
    try {
      // Get existing cost to recalculate
      const costResult = await docClient.send(new GetCommand({
        TableName: getTableName('GameCost'),
        Key: { id: game.gameCostId }
      }));
      
      if (costResult.Item) {
        const cost = costResult.Item;
        
        // Recalculate totalCost
        const oldOverlay = cost.totalGuaranteeOverlayCost || 0;
        const oldTotalCost = cost.totalCost || 0;
        const newTotalCost = oldTotalCost - oldOverlay + guaranteeOverlayCost;
        
        await docClient.send(new UpdateCommand({
          TableName: getTableName('GameCost'),
          Key: { id: game.gameCostId },
          UpdateExpression: `SET 
            totalGuaranteeOverlayCost = :overlay,
            totalCost = :totalCost,
            updatedAt = :now`,
          ExpressionAttributeValues: {
            ':overlay': guaranteeOverlayCost,
            ':totalCost': Math.round(newTotalCost * 100) / 100,
            ':now': now
          }
        }));
        
        results.costUpdated = true;
      }
    } catch (error) {
      // Non-fatal - snapshot is the primary target
      console.log(`    [WARN] GameCost update failed: ${error.message}`);
    }
  }
  
  return results;
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Parse command line arguments
  parseArgs();
  
  // Select environment if not provided via args
  if (!SELECTED_ENV) {
    SELECTED_ENV = await selectEnvironment();
  } else {
    console.log('\n╔════════════════════════════════════════════════════════════════════╗');
    console.log('║          FINANCIAL SNAPSHOT BACKFILL SCRIPT                        ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  }
  
  const config = ENVIRONMENTS[SELECTED_ENV];
  
  console.log('─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`Mode: ${EXECUTE_MODE ? '🔴 EXECUTE' : '🟢 PREVIEW'}`);
  if (ENTITY_ID_FILTER) {
    logger.info(`Entity filter: ${ENTITY_ID_FILTER}`);
  }
  console.log('─'.repeat(70) + '\n');
  
  // Production warning
  if (SELECTED_ENV === 'prod' && EXECUTE_MODE) {
    logger.warn('⚠️  You are about to modify PRODUCTION data!');
    const confirm = await askQuestion('Type "prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }
  
  // Check credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    logger.warn('AWS credentials not found in environment variables.');
    logger.info('Using default credential chain (AWS CLI profile, EC2 role, etc.)');
  }
  
  logger.info(`Region: ${REGION}`);
  logger.warn('This performs full table scans and may incur RCU costs.\n');
  
  try {
    // Step 1: Find all games with overlay cost
    const gamesWithOverlay = await findGamesWithOverlay();
    
    if (gamesWithOverlay.length === 0) {
      logger.success('No games with guaranteeOverlayCost > 0 found. Nothing to do.');
      return;
    }
    
    // Step 2: Check which ones have mismatched snapshots
    logger.info('\nChecking for snapshot mismatches...');
    
    const mismatchedGames = [];
    
    for (let i = 0; i < gamesWithOverlay.length; i++) {
      const game = gamesWithOverlay[i];
      const check = await checkSnapshotMismatch(game);
      
      if (check.hasMismatch) {
        mismatchedGames.push({
          gameId: game.id,
          name: game.name,
          gameOverlayCost: game.guaranteeOverlayCost,
          snapshotOverlayCost: check.snapshotValue,
          reason: check.reason
        });
      }
      
      process.stdout.write(`  Checked ${i + 1}/${gamesWithOverlay.length} games...\r`);
    }
    
    console.log(''); // Clear the line
    logger.info(`Found ${mismatchedGames.length} games with mismatched snapshots`);
    
    if (mismatchedGames.length === 0) {
      logger.success('\nAll snapshots are in sync! Nothing to fix.');
      return;
    }
    
    // Display mismatches
    console.log('\n' + '─'.repeat(110));
    console.log(
      'Game ID'.padEnd(40) + 
      'Name'.padEnd(35) + 
      'Game $'.padEnd(10) + 
      'Snapshot $'.padEnd(12) + 
      'Reason'
    );
    console.log('─'.repeat(110));
    
    for (const game of mismatchedGames) {
      console.log(
        (game.gameId || 'N/A').substring(0, 38).padEnd(40) +
        (game.name || 'N/A').substring(0, 33).padEnd(35) +
        `$${game.gameOverlayCost || 0}`.padEnd(10) +
        `$${game.snapshotOverlayCost ?? 'N/A'}`.padEnd(12) +
        (game.reason || '').substring(0, 30)
      );
    }
    console.log('─'.repeat(110));
    
    console.log(`\nTotal games to fix: ${mismatchedGames.length}`);
    
    // Step 3: Reprocess if in execute mode
    if (!EXECUTE_MODE) {
      console.log('\n' + '═'.repeat(70));
      logger.warn('PREVIEW MODE - No changes made');
      logger.info('Run with --execute flag to reprocess these games');
      logger.info('Example: node backfill-financial-snapshots.mjs --env dev --execute');
      console.log('═'.repeat(70));
      return;
    }
    
    // Confirm execution
    const confirmation = await askQuestion('\nType "backfill" to continue with reprocessing: ');
    if (confirmation.toLowerCase().trim() !== 'backfill') {
      logger.info('Aborted by user.');
      return;
    }
    
    console.log('\n');
    logger.info('Updating snapshots...\n');
    
    let success = 0;
    let failed = 0;
    const errors = [];
    
    for (let i = 0; i < mismatchedGames.length; i++) {
      const game = mismatchedGames[i];
      
      // Get the full game record for the update
      const gameRecord = gamesWithOverlay.find(g => g.id === game.gameId);
      
      if (!gameRecord) {
        console.log(`  ❌ [${i + 1}/${mismatchedGames.length}] ${game.gameId.substring(0, 20)}... - Game record not found`);
        failed++;
        errors.push({ gameId: game.gameId, error: 'Game record not found' });
        continue;
      }
      
      try {
        const result = await updateSnapshotOverlayCost(gameRecord);
        
        if (result.snapshotUpdated) {
          console.log(`  ✅ [${i + 1}/${mismatchedGames.length}] ${game.gameId.substring(0, 20)}... - Updated (overlay: $${game.gameOverlayCost}${result.costUpdated ? ', cost updated' : ''})`);
          success++;
        } else if (result.error) {
          console.log(`  ❌ [${i + 1}/${mismatchedGames.length}] ${game.gameId.substring(0, 20)}... - ${result.error}`);
          failed++;
          errors.push({ gameId: game.gameId, error: result.error });
        } else {
          console.log(`  ⚠️  [${i + 1}/${mismatchedGames.length}] ${game.gameId.substring(0, 20)}... - No snapshot to update`);
          failed++;
          errors.push({ gameId: game.gameId, error: 'No snapshot found' });
        }
      } catch (error) {
        console.log(`  ❌ [${i + 1}/${mismatchedGames.length}] ${game.gameId.substring(0, 20)}... - Error: ${error.message}`);
        failed++;
        errors.push({ gameId: game.gameId, error: error.message });
      }
      
      // Small delay to avoid throttling
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Summary
    console.log('\n' + '═'.repeat(70));
    logger.success(`COMPLETE: ${success} succeeded, ${failed} failed`);
    console.log('═'.repeat(70));
    
    if (errors.length > 0) {
      console.log('\nFailed games:');
      errors.forEach(e => console.log(`  - ${e.gameId}: ${e.error}`));
    }
    
  } catch (error) {
    logger.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});
