#!/usr/bin/env node
// ============================================================================
// GAME FINANCIALS MIGRATION - RECALCULATE WITH OVERLAY IN TOTAL COST
// ============================================================================
// Recalculates GameFinancialSnapshot and GameCost records to:
// - Include totalGuaranteeOverlayCost in totalCost
// - Update costPerPlayer to reflect true cost including overlay
// - Add guaranteeOverlayPerPlayer metric
// - Separate prizepoolAddedValue (promotional) from overlay
//
// USAGE:
//   node migrate-financials-overlay-cost.mjs [options]
//
// OPTIONS:
//   --preview, -p          Preview changes without executing (default)
//   --execute, -e          Execute the migration
//   --venue-id <id>        Only migrate for specific venue (optional)
//   --entity-id <id>       Only migrate for specific entity (optional)
//   --limit <n>            Limit number of records to process (optional)
//   --only-with-overlay    Only process records with overlay cost > 0
//   --help, -h             Show this help message
//
// ============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';

// ============================================================================
// ENVIRONMENT CONFIGURATIONS
// ============================================================================

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
  },
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  RATE_LIMIT_DELAY: 50,
  DEALER_RATE_PER_ENTRY: 15,
};

// Runtime state
let SELECTED_ENV = null;
let ENV_CONFIG = null;

// Helper to get full table name
const getTableName = (modelName) => `${modelName}-${ENV_CONFIG.API_ID}-${ENV_CONFIG.ENV_SUFFIX}`;

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  step: (n, total, msg) => console.log(`\n[STEP ${n}/${total}] ${msg}`),
};

// ============================================================================
// AWS CLIENTS
// ============================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// ============================================================================
// FINANCIAL CALCULATION LOGIC (v2.0.0)
// ============================================================================

/**
 * Calculate the new totalCost including overlay
 */
const calculateTotalCost = (costData, guaranteeOverlayCost) => {
  const totalStaffCost = (costData.totalDealerCost || 0) +
    (costData.totalTournamentDirectorCost || 0) +
    (costData.totalFloorStaffCost || 0) +
    (costData.totalSecurityCost || 0);

  // totalPrizeContribution should be promotional added value only (NOT overlay)
  // For existing records, we need to check if it was incorrectly set to overlay
  const totalPrizeContribution = costData.totalAddedValueCost || costData.totalPrizeContribution || 0;

  const totalCost = totalStaffCost +
    totalPrizeContribution +
    (costData.totalJackpotContribution || 0) +
    (costData.totalBountyCost || 0) +
    (costData.totalVenueRentalCost || 0) +
    (costData.totalEquipmentRentalCost || 0) +
    (costData.totalFoodBeverageCost || 0) +
    (costData.totalMarketingCost || 0) +
    (costData.totalStreamingCost || 0) +
    (costData.totalInsuranceCost || 0) +
    (costData.totalLicensingCost || 0) +
    (costData.totalStaffTravelCost || 0) +
    (costData.totalPlayerAccommodationCost || 0) +
    (costData.totalPromotionCost || 0) +
    (costData.totalOtherCost || 0) +
    guaranteeOverlayCost; // NOW INCLUDES OVERLAY

  return {
    totalCost,
    totalStaffCost,
  };
};

/**
 * Calculate per-player metrics
 */
const calculatePerPlayerMetrics = (totalRevenue, totalCost, netProfit, totalUniquePlayers, guaranteeOverlayCost) => {
  const revenuePerPlayer = totalUniquePlayers > 0
    ? Math.round((totalRevenue / totalUniquePlayers) * 100) / 100
    : null;

  const costPerPlayer = totalUniquePlayers > 0
    ? Math.round((totalCost / totalUniquePlayers) * 100) / 100
    : null;

  const profitPerPlayer = totalUniquePlayers > 0
    ? Math.round((netProfit / totalUniquePlayers) * 100) / 100
    : null;

  const guaranteeOverlayPerPlayer = totalUniquePlayers > 0 && guaranteeOverlayCost > 0
    ? Math.round((guaranteeOverlayCost / totalUniquePlayers) * 100) / 100
    : null;

  return {
    revenuePerPlayer,
    costPerPlayer,
    profitPerPlayer,
    guaranteeOverlayPerPlayer,
  };
};

/**
 * Recalculate snapshot fields with new logic
 */
const recalculateSnapshot = (snapshot, game) => {
  // Get overlay cost from game or snapshot
  const guaranteeOverlayCost = game?.guaranteeOverlayCost || snapshot.guaranteeOverlayCost || 0;
  
  // Get promotional added value (separate from overlay)
  const prizepoolAddedValue = game?.prizepoolAddedValue || snapshot.prizepoolAddedValue || 0;
  
  // Revenue
  const rakeRevenue = snapshot.rakeRevenue || 0;
  const venueFee = snapshot.venueFee || 0;
  const totalRevenue = rakeRevenue + venueFee;
  
  // Calculate new totalCost including overlay
  const { totalCost: newTotalCost, totalStaffCost } = calculateTotalCost(snapshot, guaranteeOverlayCost);
  
  // Net profit (revenue - all costs, overlay is now in totalCost)
  const netProfit = totalRevenue - newTotalCost;
  
  // Profit margin
  const profitMargin = totalRevenue > 0
    ? Math.round((netProfit / totalRevenue) * 100) / 100
    : null;
  
  // Per-player metrics
  const totalUniquePlayers = snapshot.totalUniquePlayers || 0;
  const perPlayerMetrics = calculatePerPlayerMetrics(
    totalRevenue,
    newTotalCost,
    netProfit,
    totalUniquePlayers,
    guaranteeOverlayCost
  );
  
  return {
    // Updated cost fields
    totalCost: newTotalCost,
    totalGuaranteeOverlayCost: guaranteeOverlayCost,
    totalAddedValueCost: prizepoolAddedValue,
    totalPrizeContribution: prizepoolAddedValue, // = promotional, NOT overlay
    totalStaffCost,
    
    // Updated profit fields
    netProfit,
    profitMargin,
    
    // Updated per-player fields
    ...perPlayerMetrics,
    
    // Prizepool (ensure added value is separate)
    prizepoolAddedValue,
  };
};

/**
 * Recalculate GameCost fields
 */
const recalculateGameCost = (gameCost, guaranteeOverlayCost, prizepoolAddedValue) => {
  const { totalCost: newTotalCost, totalStaffCost } = calculateTotalCost(gameCost, guaranteeOverlayCost);
  
  return {
    totalCost: newTotalCost,
    totalGuaranteeOverlayCost: guaranteeOverlayCost,
    totalAddedValueCost: prizepoolAddedValue,
    totalPrizeContribution: prizepoolAddedValue,
    totalStaffCost,
  };
};

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║     GAME FINANCIALS MIGRATION - OVERLAY COST IN TOTAL COST        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalized = answer.toLowerCase().trim();

  if (normalized === '1' || normalized === 'dev') {
    return 'dev';
  } else if (normalized === '2' || normalized === 'prod') {
    return 'prod';
  } else {
    logger.error('Invalid selection. Exiting.');
    process.exit(1);
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get Game record by ID
 */
const getGame = async (gameId) => {
  if (!gameId) return null;
  
  try {
    const result = await ddbDocClient.send(new GetCommand({
      TableName: getTableName('Game'),
      Key: { id: gameId },
    }));
    return result.Item || null;
  } catch (err) {
    logger.warn(`Could not fetch game ${gameId}: ${err.message}`);
    return null;
  }
};

/**
 * Get GameCost record by gameId
 */
const getGameCost = async (gameId) => {
  if (!gameId) return null;
  
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName('GameCost'),
      IndexName: 'byGameCost',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: { ':gameId': gameId },
    }));
    return result.Items?.[0] || null;
  } catch (err) {
    logger.warn(`Could not fetch GameCost for game ${gameId}: ${err.message}`);
    return null;
  }
};

/**
 * Get all GameFinancialSnapshot records that need updating
 */
const getSnapshotsNeedingUpdate = async (options) => {
  const snapshots = [];
  let lastKey = null;
  const tableName = getTableName('GameFinancialSnapshot');
  let scanned = 0;

  do {
    const params = {
      TableName: tableName,
    };

    // Build filter expression
    const filterParts = [];
    const exprValues = {};

    if (options.venueId) {
      filterParts.push('venueId = :vid');
      exprValues[':vid'] = options.venueId;
    }

    if (options.entityId) {
      filterParts.push('entityId = :eid');
      exprValues[':eid'] = options.entityId;
    }

    if (options.onlyWithOverlay) {
      filterParts.push('guaranteeOverlayCost > :zero');
      exprValues[':zero'] = 0;
    }

    if (filterParts.length > 0) {
      params.FilterExpression = filterParts.join(' AND ');
      params.ExpressionAttributeValues = exprValues;
    }

    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddbDocClient.send(new ScanCommand(params));
    
    snapshots.push(...(result.Items || []));
    scanned += result.ScannedCount || 0;
    lastKey = result.LastEvaluatedKey;

    // Check limit
    if (options.limit && snapshots.length >= options.limit) {
      snapshots.length = options.limit;
      break;
    }

    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastKey);

  logger.info(`Scanned ${scanned} records, found ${snapshots.length} matching filters`);
  return snapshots;
};

/**
 * Update GameFinancialSnapshot record
 */
const updateSnapshot = async (snapshotId, updates) => {
  const expressionParts = [];
  const names = {};
  const values = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      expressionParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  }

  // Add updatedAt
  expressionParts.push('#updatedAt = :updatedAt');
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();

  // Update _lastChangedAt for DataStore sync
  expressionParts.push('#lastChangedAt = :lastChangedAt');
  names['#lastChangedAt'] = '_lastChangedAt';
  values[':lastChangedAt'] = Date.now();

  // Increment _version
  expressionParts.push('#version = if_not_exists(#version, :zero) + :one');
  names['#version'] = '_version';
  values[':zero'] = 0;
  values[':one'] = 1;

  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName('GameFinancialSnapshot'),
    Key: { id: snapshotId },
    UpdateExpression: 'SET ' + expressionParts.join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
};

/**
 * Update GameCost record
 */
const updateGameCost = async (gameCostId, updates) => {
  const expressionParts = [];
  const names = {};
  const values = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      expressionParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  }

  // Add updatedAt
  expressionParts.push('#updatedAt = :updatedAt');
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();

  // Update _lastChangedAt for DataStore sync
  expressionParts.push('#lastChangedAt = :lastChangedAt');
  names['#lastChangedAt'] = '_lastChangedAt';
  values[':lastChangedAt'] = Date.now();

  // Increment _version
  expressionParts.push('#version = if_not_exists(#version, :zero) + :one');
  names['#version'] = '_version';
  values[':zero'] = 0;
  values[':one'] = 1;

  await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName('GameCost'),
    Key: { id: gameCostId },
    UpdateExpression: 'SET ' + expressionParts.join(', '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
};

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

async function performMigration(options) {
  const snapshotTableName = getTableName('GameFinancialSnapshot');
  const costTableName = getTableName('GameCost');
  
  logger.info(`Snapshot Table: ${snapshotTableName}`);
  logger.info(`Cost Table: ${costTableName}`);

  // Get snapshots needing update
  logger.info('Scanning for GameFinancialSnapshot records...');
  const snapshots = await getSnapshotsNeedingUpdate(options);

  logger.info(`Found ${snapshots.length} records to process\n`);

  if (snapshots.length === 0) {
    logger.success('No records to process.');
    return { success: true, updated: 0, errors: 0 };
  }

  // Analyze what will change
  const analysis = {
    withOverlay: 0,
    withoutOverlay: 0,
    costWillChange: 0,
    costPerPlayerWillChange: 0,
    gameCostsToUpdate: 0,
  };

  const changes = [];

  for (const snapshot of snapshots) {
    const game = await getGame(snapshot.gameId);
    const gameCost = await getGameCost(snapshot.gameId);
    
    const guaranteeOverlayCost = game?.guaranteeOverlayCost || snapshot.guaranteeOverlayCost || 0;
    const prizepoolAddedValue = game?.prizepoolAddedValue || snapshot.prizepoolAddedValue || 0;
    
    if (guaranteeOverlayCost > 0) {
      analysis.withOverlay++;
    } else {
      analysis.withoutOverlay++;
    }

    // Calculate new values
    const newValues = recalculateSnapshot(snapshot, game);
    
    // Check what will change
    const oldTotalCost = snapshot.totalCost || 0;
    const oldCostPerPlayer = snapshot.costPerPlayer;
    
    const change = {
      snapshotId: snapshot.id,
      gameId: snapshot.gameId,
      gameCostId: gameCost?.id,
      guaranteeOverlayCost,
      prizepoolAddedValue,
      oldTotalCost,
      newTotalCost: newValues.totalCost,
      oldCostPerPlayer,
      newCostPerPlayer: newValues.costPerPlayer,
      oldNetProfit: snapshot.netProfit,
      newNetProfit: newValues.netProfit,
      snapshotUpdates: newValues,
      gameCostUpdates: gameCost ? recalculateGameCost(gameCost, guaranteeOverlayCost, prizepoolAddedValue) : null,
    };

    if (Math.abs(change.newTotalCost - change.oldTotalCost) > 0.01) {
      analysis.costWillChange++;
    }
    if (change.oldCostPerPlayer !== change.newCostPerPlayer) {
      analysis.costPerPlayerWillChange++;
    }
    if (gameCost) {
      analysis.gameCostsToUpdate++;
    }

    changes.push(change);
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  }

  // Show analysis
  console.log('\n  Analysis:');
  console.log(`    Records with overlay cost > 0: ${analysis.withOverlay}`);
  console.log(`    Records without overlay: ${analysis.withoutOverlay}`);
  console.log(`    totalCost will change: ${analysis.costWillChange}`);
  console.log(`    costPerPlayer will change: ${analysis.costPerPlayerWillChange}`);
  console.log(`    GameCost records to update: ${analysis.gameCostsToUpdate}`);
  console.log('');

  // Show sample changes (first 5 with overlay)
  const samplesWithOverlay = changes.filter(c => c.guaranteeOverlayCost > 0).slice(0, 5);
  if (samplesWithOverlay.length > 0) {
    console.log('  Sample changes (records with overlay):');
    for (const change of samplesWithOverlay) {
      console.log(`    Game ${change.gameId}:`);
      console.log(`      overlay: $${change.guaranteeOverlayCost}`);
      console.log(`      totalCost: $${change.oldTotalCost} → $${change.newTotalCost}`);
      console.log(`      costPerPlayer: $${change.oldCostPerPlayer || 'null'} → $${change.newCostPerPlayer || 'null'}`);
      console.log(`      netProfit: $${change.oldNetProfit || 'null'} → $${change.newNetProfit || 'null'}`);
    }
    console.log('');
  }

  if (options.dryRun) {
    logger.info('DRY RUN: No changes were made.');
    return { 
      success: true, 
      updated: 0, 
      wouldUpdate: snapshots.length,
      wouldUpdateCosts: analysis.gameCostsToUpdate,
      errors: 0 
    };
  }

  // Execute updates
  logger.info('Applying updates...');
  let updatedSnapshots = 0;
  let updatedCosts = 0;
  let errors = 0;

  for (const change of changes) {
    try {
      // Update snapshot
      await updateSnapshot(change.snapshotId, change.snapshotUpdates);
      updatedSnapshots++;

      // Update GameCost if exists
      if (change.gameCostId && change.gameCostUpdates) {
        await updateGameCost(change.gameCostId, change.gameCostUpdates);
        updatedCosts++;
      }

      if (change.guaranteeOverlayCost > 0) {
        console.log(`  ✓ Game ${change.gameId}: overlay=$${change.guaranteeOverlayCost}, totalCost: $${change.oldTotalCost}→$${change.newTotalCost}`);
      } else {
        process.stdout.write('.');
      }
    } catch (err) {
      errors++;
      console.error(`\n  ✗ Game ${change.gameId}: ${err.message}`);
    }

    await sleep(CONFIG.RATE_LIMIT_DELAY);
  }

  console.log(''); // New line after dots

  return { 
    success: errors === 0, 
    updatedSnapshots, 
    updatedCosts,
    errors 
  };
}

// ============================================================================
// CLI PARSING
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: true, // Default to preview mode
    venueId: null,
    entityId: null,
    limit: null,
    onlyWithOverlay: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--execute' || arg === '-e') {
      options.dryRun = false;
    } else if (arg === '--preview' || arg === '-p') {
      options.dryRun = true;
    } else if (arg === '--venue-id' && args[i + 1]) {
      options.venueId = args[++i];
    } else if (arg === '--entity-id' && args[i + 1]) {
      options.entityId = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--only-with-overlay') {
      options.onlyWithOverlay = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║     GAME FINANCIALS MIGRATION - OVERLAY COST IN TOTAL COST        ║
╚════════════════════════════════════════════════════════════════════╝

USAGE:
  node migrate-financials-overlay-cost.mjs [options]

OPTIONS:
  --preview, -p          Preview changes without executing (default)
  --execute, -e          Execute the migration
  --venue-id <id>        Only migrate for specific venue (optional)
  --entity-id <id>       Only migrate for specific entity (optional)
  --limit <n>            Limit number of records to process (optional)
  --only-with-overlay    Only process records with overlay cost > 0
  --help, -h             Show this help message

EXAMPLES:
  # Preview all records
  node migrate-financials-overlay-cost.mjs --preview

  # Preview only records with overlay
  node migrate-financials-overlay-cost.mjs --preview --only-with-overlay

  # Execute migration for specific venue
  node migrate-financials-overlay-cost.mjs --execute --venue-id abc123

  # Execute with limit (for testing)
  node migrate-financials-overlay-cost.mjs --execute --limit 10

WHAT THIS SCRIPT DOES:
  Updates GameFinancialSnapshot and GameCost records to:
  
  1. Include totalGuaranteeOverlayCost in totalCost calculation
     OLD: totalCost = staffCosts + prizeContribution + ...
     NEW: totalCost = staffCosts + prizeContribution + ... + totalGuaranteeOverlayCost

  2. Update costPerPlayer to reflect true cost including overlay
     costPerPlayer = totalCost / totalUniquePlayers

  3. Add guaranteeOverlayPerPlayer metric
     guaranteeOverlayPerPlayer = totalGuaranteeOverlayCost / totalUniquePlayers

  4. Separate prizepoolAddedValue (promotional) from overlay
     totalPrizeContribution = promotional added value only (NOT overlay)

EXAMPLE CALCULATION:
  Before:
    totalCost = $500 (staff only)
    totalGuaranteeOverlayCost = $2,000 (not included)
    costPerPlayer = $500 / 20 = $25

  After:
    totalCost = $500 + $2,000 = $2,500
    totalGuaranteeOverlayCost = $2,000 (now included in totalCost)
    costPerPlayer = $2,500 / 20 = $125
    guaranteeOverlayPerPlayer = $2,000 / 20 = $100
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Select environment
  SELECTED_ENV = await selectEnvironment();
  ENV_CONFIG = ENVIRONMENTS[SELECTED_ENV];

  console.log(`\n  Selected: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`  API ID:   ${ENV_CONFIG.API_ID}`);

  if (options.venueId) {
    console.log(`  Venue:    ${options.venueId}`);
  } else if (options.entityId) {
    console.log(`  Entity:   ${options.entityId}`);
  } else {
    console.log(`  Scope:    ALL RECORDS`);
  }

  if (options.limit) {
    console.log(`  Limit:    ${options.limit} records`);
  }

  if (options.onlyWithOverlay) {
    console.log(`  Filter:   Only records with overlay > 0`);
  }

  console.log(`  Mode:     ${options.dryRun ? 'PREVIEW (no changes)' : 'EXECUTE'}`);

  // Confirmation for execute mode
  if (!options.dryRun) {
    console.log('\n' + '─'.repeat(70));
    console.log('This will update GameFinancialSnapshot and GameCost records to:');
    console.log('  • Include totalGuaranteeOverlayCost in totalCost');
    console.log('  • Update costPerPlayer to reflect true cost');
    console.log('  • Add guaranteeOverlayPerPlayer metric');
    console.log('  • Separate prizepoolAddedValue from overlay');
    console.log('─'.repeat(70));

    let confirmPrompt;
    if (SELECTED_ENV === 'prod') {
      confirmPrompt = `\n⚠️  You are about to update PRODUCTION data!\nType "migrate prod" to confirm: `;
    } else {
      confirmPrompt = `\nType "migrate" to confirm: `;
    }

    const confirm = await askQuestion(confirmPrompt);

    if (SELECTED_ENV === 'prod' && confirm.trim() !== 'migrate prod') {
      logger.info('Aborted.');
      process.exit(0);
    } else if (SELECTED_ENV !== 'prod' && confirm.trim() !== 'migrate') {
      logger.info('Aborted.');
      process.exit(0);
    }
  }

  console.log('\n' + '═'.repeat(70));

  // Perform migration
  const result = await performMigration(options);

  // Summary
  console.log('\n' + '═'.repeat(70));
  logger.success('MIGRATION COMPLETE');
  console.log('═'.repeat(70));

  if (options.dryRun) {
    console.log('\n  🔍 This was a PREVIEW - no actual changes were made');
    console.log(`     Would update snapshots: ${result.wouldUpdate || 0}`);
    console.log(`     Would update costs: ${result.wouldUpdateCosts || 0}`);
    console.log('\n  Run with --execute to apply these changes.');
  } else {
    console.log(`\n  📊 Results:`);
    console.log(`     Snapshots updated: ${result.updatedSnapshots}`);
    console.log(`     GameCosts updated: ${result.updatedCosts}`);
    console.log(`     Errors: ${result.errors}`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');

  process.exit(result.success ? 0 : 1);
}

// Execute
main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
