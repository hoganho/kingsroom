#!/usr/bin/env node
/**
 * Merge "Kings Cup @ Churchills" into "Kings Cup"
 * 
 * This script will:
 * 1. Move games from "Kings Cup @ Churchills 2025" → "Kings Cup 2025"
 * 2. Rename "Kings Cup @ Churchills 2026" → "Kings Cup 2026" (update titleId)
 * 3. Delete the duplicate series and titles
 * 4. Update metrics seriesName
 * 5. Add aliases to "Kings Cup" title
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
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

const REGION = 'ap-southeast-2';

// MERGE CONFIGURATION - Based on your data
const MERGE_CONFIG = {
  // The canonical "Kings Cup" title that everything will merge into
  canonicalTitleId: '63f7b050-3f65-4474-83b0-04b2a7ae8bac',
  canonicalTitleName: 'Kings Cup',
  
  // Aliases to add to the canonical title
  aliasesToAdd: [
    'Kings Cup @ Churchills',
    'KC @ Churchills',
    'KC@Churchills',
    'KC Churchills',
  ],
  
  // Series to merge (source → target)
  seriesToMerge: [
    {
      // KC @ Churchills 2025 → Kings Cup 2025
      sourceSeriesId: 'b624d8d0-e014-47f4-b445-d0ce510bab57',
      sourceSeriesName: 'Kings Cup @ Churchills 2025',
      targetSeriesId: 'fc15c4c8-e2d3-4037-a6ea-61e0e5961526',
      targetSeriesName: 'Kings Cup 2025',
      action: 'MERGE', // Move games, delete source
    },
    {
      // KC @ Churchills 2026 → Kings Cup 2026 (rename, no existing target)
      sourceSeriesId: '13725bc4-4264-424d-a981-804771cd5c64',
      sourceSeriesName: 'Kings Cup @ Churchills 2026',
      targetSeriesId: null, // Will rename in place
      targetSeriesName: 'Kings Cup 2026',
      action: 'RENAME', // Rename and update titleId
    },
  ],
  
  // Titles to delete after merge
  titlesToDelete: [
    '3caf0e59-8b24-4140-920d-397a74aa58f4', // Kings Cup @ Churchills (2026)
    'bf896c7a-d867-40a5-90ce-16793a6fe8b3', // Kings Cup @ Churchills (2025)
  ],
};

let SELECTED_ENV = null;
let CONFIG = null;
let docClient = null;

// ============================================================================
// HELPERS
// ============================================================================

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

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;
};

function initializeClient() {
  const client = new DynamoDBClient({ region: REGION });
  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function getGamesBySeriesId(seriesId) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const result = await docClient.send(new QueryCommand({
      TableName: getTableName('Game'),
      IndexName: 'byTournamentSeries',
      KeyConditionExpression: 'tournamentSeriesId = :sid',
      ExpressionAttributeValues: { ':sid': seriesId },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getMetricsBySeriesId(seriesId) {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: getTableName('TournamentSeriesMetrics'),
      IndexName: 'byTournamentSeriesMetrics',
      KeyConditionExpression: 'tournamentSeriesId = :sid',
      ExpressionAttributeValues: { ':sid': seriesId },
    }));
    return result.Items || [];
  } catch (err) {
    console.log(`   ⚠️  Could not query metrics: ${err.message}`);
    return [];
  }
}

async function updateGame(gameId, updates) {
  const updateParts = [];
  const values = {};
  const names = {};
  
  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    names[attrName] = key;
    values[attrValue] = value;
    updateParts.push(`${attrName} = ${attrValue}`);
  }
  
  await docClient.send(new UpdateCommand({
    TableName: getTableName('Game'),
    Key: { id: gameId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function updateSeries(seriesId, updates) {
  const updateParts = [];
  const values = {};
  const names = {};
  
  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#${key}`;
    const attrValue = `:${key}`;
    names[attrName] = key;
    values[attrValue] = value;
    updateParts.push(`${attrName} = ${attrValue}`);
  }
  
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeries'),
    Key: { id: seriesId },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function updateMetric(metricId, seriesName) {
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeriesMetrics'),
    Key: { id: metricId },
    UpdateExpression: 'SET seriesName = :name',
    ExpressionAttributeValues: { ':name': seriesName },
  }));
}

async function deleteSeries(seriesId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeries'),
    Key: { id: seriesId },
  }));
}

async function deleteMetric(metricId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeriesMetrics'),
    Key: { id: metricId },
  }));
}

async function deleteTitle(titleId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeriesTitle'),
    Key: { id: titleId },
  }));
}

async function addAliasesToTitle(titleId, aliases) {
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeriesTitle'),
    Key: { id: titleId },
    UpdateExpression: 'SET aliases = :aliases',
    ExpressionAttributeValues: { ':aliases': aliases },
  }));
}

// ============================================================================
// MAIN
// ============================================================================

async function runMerge() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║        MERGE: Kings Cup @ Churchills → Kings Cup                  ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  // Environment selection
  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}\n`);
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}\n`);
  
  const envChoice = await askQuestion('Select environment (dev/prod or 1/2): ');
  
  if (envChoice === '1' || envChoice.toLowerCase() === 'dev') {
    SELECTED_ENV = 'dev';
    CONFIG = ENVIRONMENTS.dev;
  } else if (envChoice === '2' || envChoice.toLowerCase() === 'prod') {
    SELECTED_ENV = 'prod';
    CONFIG = ENVIRONMENTS.prod;
  } else {
    console.log('Invalid selection. Exiting.');
    process.exit(1);
  }
  
  initializeClient();
  
  const isPreview = !process.argv.includes('--execute');
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`API ID: ${CONFIG.API_ID}`);
  console.log(`Mode: ${isPreview ? '🟢 PREVIEW' : '🔴 EXECUTE'}`);
  console.log(`${'─'.repeat(70)}\n`);

  // ========================================
  // STEP 1: Analyze what will be done
  // ========================================
  console.log('📊 MERGE PLAN:\n');
  
  let totalGamesToMove = 0;
  let totalMetricsToUpdate = 0;
  let totalMetricsToDelete = 0;
  
  for (const merge of MERGE_CONFIG.seriesToMerge) {
    console.log(`\n${merge.action === 'MERGE' ? '🔀' : '📝'} ${merge.sourceSeriesName}`);
    
    const games = await getGamesBySeriesId(merge.sourceSeriesId);
    const metrics = await getMetricsBySeriesId(merge.sourceSeriesId);
    
    console.log(`   Games: ${games.length}`);
    console.log(`   Metrics: ${metrics.length}`);
    
    if (merge.action === 'MERGE') {
      console.log(`   → Move to: ${merge.targetSeriesName}`);
      console.log(`   → Then delete source series`);
      totalGamesToMove += games.length;
      totalMetricsToDelete += metrics.length;
    } else {
      console.log(`   → Rename to: ${merge.targetSeriesName}`);
      console.log(`   → Update titleId to: ${MERGE_CONFIG.canonicalTitleId}`);
      totalMetricsToUpdate += metrics.length;
    }
    
    merge._games = games;
    merge._metrics = metrics;
  }
  
  console.log(`\n\n📌 Titles to delete: ${MERGE_CONFIG.titlesToDelete.length}`);
  for (const titleId of MERGE_CONFIG.titlesToDelete) {
    console.log(`   - ${titleId}`);
  }
  
  console.log(`\n📌 Aliases to add to "${MERGE_CONFIG.canonicalTitleName}":`);
  for (const alias of MERGE_CONFIG.aliasesToAdd) {
    console.log(`   - "${alias}"`);
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`Games to move:      ${totalGamesToMove}`);
  console.log(`Metrics to update:  ${totalMetricsToUpdate}`);
  console.log(`Metrics to delete:  ${totalMetricsToDelete}`);
  console.log(`Series to delete:   ${MERGE_CONFIG.seriesToMerge.filter(m => m.action === 'MERGE').length}`);
  console.log(`Titles to delete:   ${MERGE_CONFIG.titlesToDelete.length}`);
  console.log(`Aliases to add:     ${MERGE_CONFIG.aliasesToAdd.length}`);
  
  if (isPreview) {
    console.log('\n💡 Run with --execute to apply these changes\n');
    return;
  }
  
  // ========================================
  // STEP 2: Execute
  // ========================================
  const confirm = await askQuestion('\n⚠️  This will modify the database. Continue? (yes/no): ');
  if (confirm !== 'yes') {
    console.log('Aborted.\n');
    return;
  }
  
  console.log('\n🔧 Executing merge...\n');
  
  let gamesUpdated = 0;
  let metricsUpdated = 0;
  let metricsDeleted = 0;
  let seriesDeleted = 0;
  let titlesDeleted = 0;
  let errors = 0;
  
  for (const merge of MERGE_CONFIG.seriesToMerge) {
    console.log(`\n📦 Processing: ${merge.sourceSeriesName}`);
    
    if (merge.action === 'MERGE') {
      // Move games to target series
      console.log(`   Moving ${merge._games.length} games to ${merge.targetSeriesName}...`);
      
      for (const game of merge._games) {
        try {
          await updateGame(game.id, {
            tournamentSeriesId: merge.targetSeriesId,
            seriesName: merge.targetSeriesName,
            tournamentSeriesTitleId: MERGE_CONFIG.canonicalTitleId,
          });
          gamesUpdated++;
          process.stdout.write('.');
        } catch (err) {
          console.error(`\n   ❌ Error updating game ${game.id}: ${err.message}`);
          errors++;
        }
      }
      console.log('');
      
      // Delete metrics for source series (they'll be recalculated)
      console.log(`   Deleting ${merge._metrics.length} metrics (will be recalculated)...`);
      for (const metric of merge._metrics) {
        try {
          await deleteMetric(metric.id);
          metricsDeleted++;
        } catch (err) {
          console.error(`   ❌ Error deleting metric: ${err.message}`);
          errors++;
        }
      }
      
      // Delete source series
      console.log(`   Deleting source series...`);
      try {
        await deleteSeries(merge.sourceSeriesId);
        seriesDeleted++;
      } catch (err) {
        console.error(`   ❌ Error deleting series: ${err.message}`);
        errors++;
      }
      
    } else if (merge.action === 'RENAME') {
      // Rename series and update titleId
      console.log(`   Renaming series and updating titleId...`);
      try {
        await updateSeries(merge.sourceSeriesId, {
          name: merge.targetSeriesName,
          tournamentSeriesTitleId: MERGE_CONFIG.canonicalTitleId,
        });
      } catch (err) {
        console.error(`   ❌ Error renaming series: ${err.message}`);
        errors++;
      }
      
      // Update games with new name
      console.log(`   Updating ${merge._games.length} games with new name...`);
      for (const game of merge._games) {
        try {
          await updateGame(game.id, {
            seriesName: merge.targetSeriesName,
            tournamentSeriesTitleId: MERGE_CONFIG.canonicalTitleId,
          });
          gamesUpdated++;
          process.stdout.write('.');
        } catch (err) {
          console.error(`\n   ❌ Error updating game ${game.id}: ${err.message}`);
          errors++;
        }
      }
      console.log('');
      
      // Update metrics with new name
      console.log(`   Updating ${merge._metrics.length} metrics with new name...`);
      for (const metric of merge._metrics) {
        try {
          await updateMetric(metric.id, merge.targetSeriesName);
          metricsUpdated++;
        } catch (err) {
          console.error(`   ❌ Error updating metric: ${err.message}`);
          errors++;
        }
      }
    }
    
    console.log(`   ✅ Done`);
  }
  
  // Delete orphaned titles
  console.log(`\n🗑️  Deleting orphaned titles...`);
  for (const titleId of MERGE_CONFIG.titlesToDelete) {
    try {
      await deleteTitle(titleId);
      titlesDeleted++;
      console.log(`   Deleted: ${titleId}`);
    } catch (err) {
      console.error(`   ❌ Error deleting title ${titleId}: ${err.message}`);
      errors++;
    }
  }
  
  // Add aliases to canonical title
  console.log(`\n📝 Adding aliases to "${MERGE_CONFIG.canonicalTitleName}"...`);
  try {
    await addAliasesToTitle(MERGE_CONFIG.canonicalTitleId, MERGE_CONFIG.aliasesToAdd);
    console.log(`   Added ${MERGE_CONFIG.aliasesToAdd.length} aliases`);
  } catch (err) {
    console.error(`   ❌ Error adding aliases: ${err.message}`);
    errors++;
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('COMPLETE');
  console.log(`${'='.repeat(70)}`);
  console.log(`Games updated:     ${gamesUpdated}`);
  console.log(`Metrics updated:   ${metricsUpdated}`);
  console.log(`Metrics deleted:   ${metricsDeleted}`);
  console.log(`Series deleted:    ${seriesDeleted}`);
  console.log(`Titles deleted:    ${titlesDeleted}`);
  console.log(`Errors:            ${errors}`);
  
  console.log(`
⚠️  IMPORTANT: Run the metrics refresh to recalculate Kings Cup 2025 metrics!
   The merged games need their metrics recalculated.
`);
  
  console.log('✅ Done!\n');
}

runMerge().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
