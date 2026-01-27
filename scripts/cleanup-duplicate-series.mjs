#!/usr/bin/env node
/**
 * ===================================================================
 * Cleanup Script: Merge Duplicate Tournament Series
 * ===================================================================
 * 
 * VERSION: 1.0.0
 * 
 * This script identifies and merges duplicate TournamentSeries and 
 * TournamentSeriesTitle records that were created due to the series
 * consolidation bug.
 * 
 * PROBLEM:
 * - Events like "CNY Lunar Series Event 4 - Mini Main" were creating
 *   separate TournamentSeries records instead of being grouped into
 *   one "CNY Lunar Series 2026" series.
 * 
 * SOLUTION:
 * This script:
 * 1. Scans TournamentSeriesTitle and TournamentSeries tables
 * 2. Groups duplicates by extracting base series names
 * 3. Selects a canonical record for each group
 * 4. Updates all Game records to point to the canonical series
 * 5. Deletes the duplicate series records
 * 
 * Usage:
 *   node cleanup-duplicate-series.mjs --preview
 *   node cleanup-duplicate-series.mjs --execute
 *   node cleanup-duplicate-series.mjs --execute --entity-id <id>
 *   node cleanup-duplicate-series.mjs --preview --verbose
 * 
 * Options:
 *   --preview, -p              Preview changes without executing (default)
 *   --execute, -e              Execute the migration
 *   --entity-id <id>           Filter by entity ID
 *   --venue-id <id>            Filter by venue ID
 *   --year <year>              Filter by year (e.g., 2026)
 *   --batch-size <n>           Batch size for writes (default: 25)
 *   --verbose, -v              Show detailed output
 *   --dry-run-games            Show games that would be updated
 *   --help, -h                 Show this help message
 * 
 * ===================================================================
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  region: 'ap-southeast-2',
  apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ynuahifnznb5zddz727oiqnicy',
  env: process.env.ENV || 'prod',
};

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;
};

// ============================================================================
// KNOWN SERIES PATTERNS - Used for base name extraction
// ============================================================================

const KNOWN_SERIES_PATTERNS = [
  // Specific named series
  /\b(CNY\s+Lunar\s+Series)\b/i,
  /\b(Dragon\s+Lunar)\b/i,
  /\b(Kings?\s+Cup)\b/i,
  /\b(Sydney\s+Millions)\b/i,
  /\b(Colossus\s+Series)\b/i,
  /\b(Signature\s+Series)\b/i,
  /\b(Super\s+Series)\b/i,
  /\b(Kings?\s+Birthday\s+Series)\b/i,
  /\b(Melbourne\s+Cup\s+Series)\b/i,
  /\b(Easter\s+Series)\b/i,
  /\b(Christmas\s+Series)\b/i,
  /\b(Anzac\s+Day\s+Series)\b/i,
  /\b(Australia\s+Day\s+Series)\b/i,
  /\b(New\s+Years?\s+Series)\b/i,
  /\b(Valentines?\s+Day\s+Series)\b/i,
  /\b(Mothers?\s+Day\s+Series)\b/i,
  /\b(Fathers?\s+Day\s+Series)\b/i,
  /\b(Labour\s+Day\s+Series)\b/i,
  /\b(St\.?\s*Patricks?\s+Day\s+Series)\b/i,
  /\b(Public\s+Holiday\s+Events?)\b/i,
  /\b(KC\s+@\s+Churchills)\b/i,
  
  // Major poker tours
  /\b(WSOP(?:\s+Circuit)?)\b/i,
  /\b(WPT)\b/i,
  /\b(EPT)\b/i,
  /\b(APT)\b/i,
  /\b(ANZPT)\b/i,
  /\b(APPT)\b/i,
];

// ============================================================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================================================

const args = process.argv.slice(2);
const options = {
  preview: true,
  execute: false,
  entityId: null,
  venueId: null,
  year: null,
  batchSize: 25,
  verbose: false,
  dryRunGames: false,
  renameCanonical: false,  // NEW: Rename canonical to clean base name
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
    case '--entity-id':
      options.entityId = args[++i];
      break;
    case '--venue-id':
      options.venueId = args[++i];
      break;
    case '--year':
      options.year = parseInt(args[++i], 10);
      break;
    case '--batch-size':
      options.batchSize = parseInt(args[++i], 10);
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--dry-run-games':
      options.dryRunGames = true;
      break;
    case '--rename-canonical':
      options.renameCanonical = true;
      break;
    case '--help':
    case '-h':
      console.log(`
Cleanup Script: Merge Duplicate Tournament Series

This script identifies and merges duplicate TournamentSeries and 
TournamentSeriesTitle records.

Usage:
  node cleanup-duplicate-series.mjs [options]

Options:
  --preview, -p              Preview changes without executing (default)
  --execute, -e              Execute the migration
  --entity-id <id>           Filter by entity ID
  --venue-id <id>            Filter by venue ID
  --year <year>              Filter by year (e.g., 2026)
  --batch-size <n>           Batch size for writes (default: 25)
  --verbose, -v              Show detailed output
  --dry-run-games            Show games that would be updated
  --rename-canonical         Rename canonical series to clean base name (e.g., "CNY Lunar Series 2026")
  --help, -h                 Show this help message

Examples:
  node cleanup-duplicate-series.mjs --preview
  node cleanup-duplicate-series.mjs --preview --year 2026 --verbose
  node cleanup-duplicate-series.mjs --execute --entity-id abc123
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
 * Extract the base series name from a full name
 * This is the key function for identifying duplicates
 */
function extractBaseSeriesName(name) {
  if (!name) return { baseName: null, normalized: null };
  
  const originalName = name.trim();
  
  // Try known patterns first
  for (const pattern of KNOWN_SERIES_PATTERNS) {
    const match = originalName.match(pattern);
    if (match) {
      const baseName = match[1].trim();
      return {
        baseName,
        normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
        method: 'KNOWN_PATTERN'
      };
    }
  }
  
  // Try event pattern extraction
  const eventPatterns = [
    /^(.+?)\s+Event\s*#?\s*\d+\s*[:\-]\s*.+$/i,
    /^(.+?)\s+Event\s*#?\s*\d+$/i,
    /^(.+?)\s+#\d+\s*[:\-]\s*.+$/i,
  ];
  
  for (const pattern of eventPatterns) {
    const match = originalName.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      if (baseName.length >= 5) {
        return {
          baseName,
          normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
          method: 'EVENT_PATTERN'
        };
      }
    }
  }
  
  // Try keyword extraction
  const keywordPatterns = [
    /^(.+?\s+Series)\b/i,
    /^(.+?\s+Championship)\b/i,
    /^(.+?\s+Festival)\b/i,
    /^(.+?\s+Classic)\b/i,
    /^(.+?\s+Cup)\b/i,
  ];
  
  for (const pattern of keywordPatterns) {
    const match = originalName.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      if (baseName.length >= 5) {
        return {
          baseName,
          normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
          method: 'KEYWORD_PATTERN'
        };
      }
    }
  }
  
  // Fallback: strip common suffixes
  let baseName = originalName
    .replace(/\s+Event\s*#?\s*\d+\s*[:\-]?\s*.*/i, '')
    .replace(/\s+Flight\s*\d*[A-Z]?\b.*/i, '')
    .replace(/\s+Day\s*\d+.*/i, '')
    .replace(/\s+[-–]\s+.+$/, '')
    .replace(/\s+\$[\d,]+[kK]?\s*(GTD|Guaranteed).*/i, '')
    .replace(/\s+20[2-3]\d$/, '')
    .trim();
  
  return {
    baseName: baseName || originalName,
    normalized: (baseName || originalName).toLowerCase().replace(/\s+/g, ' ').trim(),
    method: 'FALLBACK'
  };
}

/**
 * Calculate string similarity using Dice coefficient
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  const getBigrams = (str) => {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };
  
  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);
  
  let intersection = 0;
  bigrams1.forEach(b => {
    if (bigrams2.has(b)) intersection++;
  });
  
  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Scan all records from a table
 */
async function scanTable(tableName, filterExpression = null, expressionValues = null, expressionNames = null) {
  const items = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const params = {
      TableName: tableName,
    };
    
    // Only add ExclusiveStartKey if we have one
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    // Only add filter params if they exist
    if (filterExpression && expressionValues) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionValues;
    }
    
    // Only add expression names if they exist
    if (expressionNames) {
      params.ExpressionAttributeNames = expressionNames;
    }
    
    const result = await docClient.send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    if (options.verbose) {
      process.stdout.write(`\r   Scanned ${items.length} records...`);
    }
  } while (lastEvaluatedKey);
  
  if (options.verbose) {
    console.log(`\r   Scanned ${items.length} records total`);
  }
  
  return items;
}

/**
 * Get games by tournamentSeriesId
 */
async function getGamesBySeriesId(seriesId) {
  const tableName = getTableName('Game');
  
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byTournamentSeries',
      KeyConditionExpression: 'tournamentSeriesId = :seriesId',
      ExpressionAttributeValues: { ':seriesId': seriesId },
    }));
    return result.Items || [];
  } catch (error) {
    // Index might not exist, fall back to scan with filter
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('index')) {
      console.log('   ⚠️  byTournamentSeries index not found, using scan...');
      const games = await scanTable(
        tableName,
        'tournamentSeriesId = :seriesId',
        { ':seriesId': seriesId }
      );
      return games;
    }
    throw error;
  }
}

/**
 * Update game to point to new series
 */
async function updateGameSeriesId(gameId, newSeriesId, newSeriesName, newSeriesTitleId) {
  const tableName = getTableName('Game');
  const now = new Date().toISOString();
  
  const updateParams = {
    TableName: tableName,
    Key: { id: gameId },
    UpdateExpression: 'SET tournamentSeriesId = :seriesId, seriesName = :seriesName, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':seriesId': newSeriesId,
      ':seriesName': newSeriesName,
      ':updatedAt': now,
    },
  };
  
  if (newSeriesTitleId) {
    updateParams.UpdateExpression += ', tournamentSeriesTitleId = :titleId';
    updateParams.ExpressionAttributeValues[':titleId'] = newSeriesTitleId;
  }
  
  await docClient.send(new UpdateCommand(updateParams));
}

/**
 * Get TournamentSeriesMetrics by series ID
 */
async function getMetricsBySeriesId(seriesId) {
  const tableName = getTableName('TournamentSeriesMetrics');
  
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byTournamentSeriesMetrics',
      KeyConditionExpression: 'tournamentSeriesId = :seriesId',
      ExpressionAttributeValues: { ':seriesId': seriesId },
    }));
    return result.Items || [];
  } catch (error) {
    // Index might not exist or table might not exist
    if (error.name === 'ResourceNotFoundException') {
      console.log('   ⚠️  TournamentSeriesMetrics table/index not found, skipping...');
      return [];
    }
    throw error;
  }
}

/**
 * Delete TournamentSeriesMetrics records
 */
async function deleteSeriesMetrics(metricsId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeriesMetrics'),
    Key: { id: metricsId },
  }));
}

/**
 * Delete a TournamentSeries record
 */
async function deleteTournamentSeries(seriesId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeries'),
    Key: { id: seriesId },
  }));
}

/**
 * Delete a TournamentSeriesTitle record
 */
async function deleteTournamentSeriesTitle(titleId) {
  await docClient.send(new DeleteCommand({
    TableName: getTableName('TournamentSeriesTitle'),
    Key: { id: titleId },
  }));
}

/**
 * Update TournamentSeries to have correct title ID
 */
async function updateSeriesTitleId(seriesId, titleId) {
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeries'),
    Key: { id: seriesId },
    UpdateExpression: 'SET tournamentSeriesTitleId = :titleId, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':titleId': titleId,
      ':updatedAt': now,
    },
  }));
}

/**
 * Rename a TournamentSeries to a cleaner name
 */
async function renameTournamentSeries(seriesId, newName) {
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeries'),
    Key: { id: seriesId },
    UpdateExpression: 'SET #name = :newName, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: {
      ':newName': newName,
      ':updatedAt': now,
    },
  }));
}

/**
 * Generate a clean series name from base name and year
 */
function generateCleanSeriesName(baseName, year) {
  // Capitalize first letter of each word
  const cleanBase = baseName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return `${cleanBase} ${year}`;
}

/**
 * Generate a clean title name (without year)
 */
function generateCleanTitleName(baseName) {
  return baseName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Rename a TournamentSeriesTitle
 */
async function renameTournamentSeriesTitle(titleId, newTitle) {
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: getTableName('TournamentSeriesTitle'),
    Key: { id: titleId },
    UpdateExpression: 'SET title = :newTitle, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':newTitle': newTitle,
      ':updatedAt': now,
    },
  }));
}

// ============================================================================
// MAIN CLEANUP LOGIC
// ============================================================================

async function runCleanup() {
  console.log('\n' + '='.repeat(70));
  console.log('TOURNAMENT SERIES DUPLICATE CLEANUP');
  console.log('='.repeat(70));
  console.log(`Mode: ${options.execute ? '🔴 EXECUTE' : '🟢 PREVIEW'}`);
  console.log(`Environment: ${CONFIG.env}`);
  console.log(`API ID: ${CONFIG.apiId}`);
  if (options.entityId) console.log(`Entity filter: ${options.entityId}`);
  if (options.venueId) console.log(`Venue filter: ${options.venueId}`);
  if (options.year) console.log(`Year filter: ${options.year}`);
  console.log('='.repeat(70) + '\n');
  
  // ========================================
  // STEP 1: Load all TournamentSeriesTitle records
  // ========================================
  console.log('📖 Step 1: Loading TournamentSeriesTitle records...');
  const allTitles = await scanTable(getTableName('TournamentSeriesTitle'));
  console.log(`   Found ${allTitles.length} TournamentSeriesTitle records\n`);
  
  // ========================================
  // STEP 2: Load all TournamentSeries records
  // ========================================
  console.log('📖 Step 2: Loading TournamentSeries records...');
  let filterExpr = null;
  let filterValues = null;
  let filterNames = null;
  
  if (options.entityId) {
    filterExpr = 'entityId = :entityId';
    filterValues = { ':entityId': options.entityId };
  }
  if (options.venueId) {
    filterExpr = filterExpr ? `${filterExpr} AND venueId = :venueId` : 'venueId = :venueId';
    filterValues = filterValues || {};
    filterValues[':venueId'] = options.venueId;
  }
  if (options.year) {
    filterExpr = filterExpr ? `${filterExpr} AND #yr = :year` : '#yr = :year';
    filterValues = filterValues || {};
    filterValues[':year'] = options.year;
    filterNames = { '#yr': 'year' };
  }
  
  let allSeries = await scanTable(getTableName('TournamentSeries'), filterExpr, filterValues, filterNames);
  console.log(`   Found ${allSeries.length} TournamentSeries records\n`);
  
  // ========================================
  // STEP 3: Group series by base name + year
  // ========================================
  console.log('🔍 Step 3: Analyzing series for duplicates...\n');
  
  // Build title lookup
  const titleById = new Map();
  allTitles.forEach(t => titleById.set(t.id, t));
  
  // Group series by base name + year
  const seriesGroups = new Map(); // key: "baseName|year" -> array of series
  
  for (const series of allSeries) {
    const { baseName, normalized, method } = extractBaseSeriesName(series.name);
    const year = series.year || 'unknown';
    const groupKey = `${normalized}|${year}`;
    
    if (!seriesGroups.has(groupKey)) {
      seriesGroups.set(groupKey, {
        baseName,
        normalized,
        year,
        series: [],
      });
    }
    
    seriesGroups.get(groupKey).series.push({
      ...series,
      extractedBaseName: baseName,
      extractionMethod: method,
    });
  }
  
  // Find groups with duplicates
  const duplicateGroups = [];
  for (const [key, group] of seriesGroups) {
    if (group.series.length > 1) {
      duplicateGroups.push(group);
    }
  }
  
  console.log(`   Found ${duplicateGroups.length} groups with potential duplicates\n`);
  
  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicate series found. Nothing to clean up.\n');
    return;
  }
  
  // ========================================
  // STEP 4: Analyze each duplicate group
  // ========================================
  console.log('📊 Step 4: Analyzing duplicate groups...\n');
  
  const mergeOperations = [];
  
  for (const group of duplicateGroups) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📁 Base Name: "${group.baseName}" (${group.year})`);
    console.log(`   ${group.series.length} series records found:`);
    
    // Sort series: prefer ones with more games, cleaner names, existing title IDs
    const scoredSeries = await Promise.all(group.series.map(async (s) => {
      const games = await getGamesBySeriesId(s.id);
      const metrics = await getMetricsBySeriesId(s.id);
      const hasValidTitle = s.tournamentSeriesTitleId && titleById.has(s.tournamentSeriesTitleId);
      const nameLength = s.name.length;
      const nameLower = s.name.toLowerCase();
      
      // Penalties for messy names
      const hasEventInName = /event\s*#?\s*\d+/i.test(s.name);
      const hasSatellite = /sat(?:ty|ellite)/i.test(s.name);
      const hasFlightDay = /(?:flight|day)\s*\d/i.test(s.name);
      const hasDescription = /-\s*\w/.test(s.name); // Has "- something" suffix
      const hasGuarantee = /gtd|guaranteed|\$\d+/i.test(s.name);
      
      // Bonus for clean names that are just "Series Name YEAR"
      const isCleanName = !hasEventInName && !hasSatellite && !hasFlightDay && !hasDescription && !hasGuarantee;
      
      // Score: more games = better, has title = better, cleaner name = better
      let score = (games.length * 100) + 
                  (hasValidTitle ? 50 : 0) + 
                  (isCleanName ? 200 : 0) +
                  (hasEventInName ? -30 : 0) +
                  (hasSatellite ? -50 : 0) +
                  (hasFlightDay ? -20 : 0) +
                  (hasDescription ? -20 : 0) +
                  (hasGuarantee ? -20 : 0) +
                  (100 - Math.min(nameLength, 100));
      
      return {
        ...s,
        gameCount: games.length,
        games,
        metricsCount: metrics.length,
        metrics,
        hasValidTitle,
        isCleanName,
        score,
      };
    }));
    
    // Sort by score descending
    scoredSeries.sort((a, b) => b.score - a.score);
    
    // Select canonical (first one after sorting)
    const canonical = scoredSeries[0];
    const duplicates = scoredSeries.slice(1);
    
    console.log(`\n   🏆 CANONICAL: "${canonical.name}"`);
    console.log(`      ID: ${canonical.id}`);
    console.log(`      Games: ${canonical.gameCount}`);
    console.log(`      Metrics: ${canonical.metricsCount}`);
    console.log(`      Title ID: ${canonical.tournamentSeriesTitleId || 'NONE'}`);
    console.log(`      Score: ${canonical.score}`);
    
    console.log(`\n   🔄 DUPLICATES TO MERGE:`);
    for (const dup of duplicates) {
      console.log(`      - "${dup.name}"`);
      console.log(`        ID: ${dup.id}`);
      console.log(`        Games: ${dup.gameCount}`);
      console.log(`        Metrics: ${dup.metricsCount}`);
      console.log(`        Title ID: ${dup.tournamentSeriesTitleId || 'NONE'}`);
      
      if (options.dryRunGames && dup.games.length > 0) {
        console.log(`        Games to move:`);
        dup.games.slice(0, 5).forEach(g => {
          console.log(`          • ${g.name?.substring(0, 50)}...`);
        });
        if (dup.games.length > 5) {
          console.log(`          ... and ${dup.games.length - 5} more`);
        }
      }
    }
    
    // Calculate total games to move
    const totalGamesToMove = duplicates.reduce((sum, d) => sum + d.gameCount, 0);
    
    // Generate clean canonical name
    const cleanCanonicalName = generateCleanSeriesName(group.baseName, group.year);
    const cleanTitleName = generateCleanTitleName(group.baseName);
    const needsRename = canonical.name !== cleanCanonicalName;
    
    // Get the canonical's title to check if it needs renaming
    const canonicalTitle = canonical.tournamentSeriesTitleId ? titleById.get(canonical.tournamentSeriesTitleId) : null;
    const needsTitleRename = canonicalTitle && canonicalTitle.title !== cleanTitleName;
    
    if (options.renameCanonical && needsRename) {
      console.log(`\n   📝 RENAME SERIES: "${canonical.name}" → "${cleanCanonicalName}"`);
    }
    if (options.renameCanonical && needsTitleRename) {
      console.log(`   📝 RENAME TITLE: "${canonicalTitle.title}" → "${cleanTitleName}"`);
    }
    
    mergeOperations.push({
      group,
      canonical,
      duplicates,
      totalGamesToMove,
      cleanCanonicalName,
      cleanTitleName,
      needsRename,
      needsTitleRename,
      canonicalTitle,
    });
  }
  
  // ========================================
  // STEP 5: Summary
  // ========================================
  console.log('\n\n' + '='.repeat(70));
  console.log('MERGE SUMMARY');
  console.log('='.repeat(70));
  
  let totalDuplicateSeries = 0;
  let totalGamesToUpdate = 0;
  let totalTitlesToDelete = 0;
  let totalMetricsToDelete = 0;
  let totalSeriesToRename = 0;
  let totalTitlesToRename = 0;
  
  for (const op of mergeOperations) {
    totalDuplicateSeries += op.duplicates.length;
    totalGamesToUpdate += op.totalGamesToMove;
    
    // Count series and titles that need renaming
    if (options.renameCanonical && op.needsRename) {
      totalSeriesToRename++;
    }
    if (options.renameCanonical && op.needsTitleRename) {
      totalTitlesToRename++;
    }
    
    // Count metrics from duplicates that will be deleted
    for (const dup of op.duplicates) {
      totalMetricsToDelete += dup.metricsCount || 0;
    }
    
    // Count orphaned titles (titles only used by duplicates)
    const canonicalTitleId = op.canonical.tournamentSeriesTitleId;
    for (const dup of op.duplicates) {
      if (dup.tournamentSeriesTitleId && 
          dup.tournamentSeriesTitleId !== canonicalTitleId) {
        // Check if this title is used by any other series
        const otherUsers = allSeries.filter(s => 
          s.tournamentSeriesTitleId === dup.tournamentSeriesTitleId && 
          s.id !== dup.id
        );
        if (otherUsers.length === 0) {
          totalTitlesToDelete++;
        }
      }
    }
  }
  
  console.log(`\nDuplicate groups:           ${mergeOperations.length}`);
  console.log(`Series to delete:           ${totalDuplicateSeries}`);
  console.log(`Games to update:            ${totalGamesToUpdate}`);
  console.log(`Metrics to delete:          ${totalMetricsToDelete}`);
  console.log(`Orphaned titles to delete:  ${totalTitlesToDelete}`);
  if (options.renameCanonical) {
    console.log(`Series to rename:           ${totalSeriesToRename}`);
    console.log(`Titles to rename:           ${totalTitlesToRename}`);
  }
  
  // ========================================
  // STEP 6: Execute (if not preview)
  // ========================================
  if (options.execute) {
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTING MERGE OPERATIONS');
    console.log('='.repeat(70));
    
    // Confirm before executing
    const answer = await prompt('\n⚠️  This will modify the database. Continue? (yes/no): ');
    if (answer !== 'yes') {
      console.log('Aborted by user.\n');
      return;
    }
    
    let gamesUpdated = 0;
    let seriesDeleted = 0;
    let titlesDeleted = 0;
    let metricsDeleted = 0;
    let seriesRenamed = 0;
    let titlesRenamed = 0;
    let errors = 0;
    
    for (const op of mergeOperations) {
      console.log(`\n📁 Processing: "${op.group.baseName}" (${op.group.year})`);
      
      const canonicalId = op.canonical.id;
      let canonicalName = op.canonical.name;
      const canonicalTitleId = op.canonical.tournamentSeriesTitleId;
      
      // Rename canonical title FIRST if requested
      if (options.renameCanonical && op.needsTitleRename && canonicalTitleId) {
        try {
          console.log(`   Renaming title: "${op.canonicalTitle.title}" → "${op.cleanTitleName}"`);
          await renameTournamentSeriesTitle(canonicalTitleId, op.cleanTitleName);
          titlesRenamed++;
        } catch (err) {
          console.error(`   ❌ Error renaming title: ${err.message}`);
          errors++;
        }
      }
      
      // Rename canonical series if requested (so games get the new name)
      if (options.renameCanonical && op.needsRename) {
        try {
          console.log(`   Renaming series: "${canonicalName}" → "${op.cleanCanonicalName}"`);
          await renameTournamentSeries(canonicalId, op.cleanCanonicalName);
          canonicalName = op.cleanCanonicalName; // Use new name for games
          seriesRenamed++;
          
          // Update seriesName for games already in the canonical series
          if (op.canonical.games && op.canonical.games.length > 0) {
            console.log(`   Updating ${op.canonical.games.length} existing games in canonical...`);
            for (const game of op.canonical.games) {
              try {
                await updateGameSeriesId(
                  game.id, 
                  canonicalId, 
                  canonicalName,
                  canonicalTitleId
                );
                gamesUpdated++;
                process.stdout.write('.');
              } catch (err) {
                console.error(`\n   ❌ Error updating existing game ${game.id}: ${err.message}`);
                errors++;
              }
            }
            console.log('');
          }
        } catch (err) {
          console.error(`   ❌ Error renaming series: ${err.message}`);
          errors++;
        }
      }
      
      for (const dup of op.duplicates) {
        // Update all games from duplicate to canonical
        console.log(`   Moving ${dup.gameCount} games from "${dup.name}"...`);
        
        for (const game of dup.games) {
          try {
            await updateGameSeriesId(
              game.id, 
              canonicalId, 
              canonicalName,
              canonicalTitleId
            );
            gamesUpdated++;
            process.stdout.write('.');
            
            if (gamesUpdated % options.batchSize === 0) {
              await sleep(500);
            }
          } catch (err) {
            console.error(`\n   ❌ Error updating game ${game.id}: ${err.message}`);
            errors++;
          }
        }
        console.log('');
        
        // Delete metrics for the duplicate series (they will be orphaned)
        if (dup.metrics && dup.metrics.length > 0) {
          console.log(`   Deleting ${dup.metrics.length} metrics records...`);
          for (const metric of dup.metrics) {
            try {
              await deleteSeriesMetrics(metric.id);
              metricsDeleted++;
            } catch (err) {
              console.error(`   ❌ Error deleting metric ${metric.id}: ${err.message}`);
              errors++;
            }
          }
        }
        
        // Delete the duplicate series
        try {
          console.log(`   Deleting series: ${dup.id}`);
          await deleteTournamentSeries(dup.id);
          seriesDeleted++;
        } catch (err) {
          console.error(`   ❌ Error deleting series ${dup.id}: ${err.message}`);
          errors++;
        }
        
        // Delete orphaned title if applicable
        if (dup.tournamentSeriesTitleId && 
            dup.tournamentSeriesTitleId !== canonicalTitleId) {
          // Check if any other series uses this title
          const otherUsers = allSeries.filter(s => 
            s.tournamentSeriesTitleId === dup.tournamentSeriesTitleId && 
            s.id !== dup.id &&
            !op.duplicates.some(d => d.id === s.id)
          );
          
          if (otherUsers.length === 0) {
            try {
              console.log(`   Deleting orphaned title: ${dup.tournamentSeriesTitleId}`);
              await deleteTournamentSeriesTitle(dup.tournamentSeriesTitleId);
              titlesDeleted++;
            } catch (err) {
              console.error(`   ❌ Error deleting title ${dup.tournamentSeriesTitleId}: ${err.message}`);
              errors++;
            }
          }
        }
      }
      
      console.log(`   ✅ Merged ${op.duplicates.length} duplicates into canonical series`);
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTION COMPLETE');
    console.log('='.repeat(70));
    console.log(`Games updated:    ${gamesUpdated}`);
    console.log(`Series deleted:   ${seriesDeleted}`);
    console.log(`Metrics deleted:  ${metricsDeleted}`);
    console.log(`Titles deleted:   ${titlesDeleted}`);
    console.log(`Series renamed:   ${seriesRenamed}`);
    console.log(`Titles renamed:   ${titlesRenamed}`);
    console.log(`Errors:           ${errors}`);
    
  } else {
    console.log('\n💡 Run with --execute to apply these changes');
  }
  
  console.log('\n✅ Done!\n');
}

// ============================================================================
// RUN
// ============================================================================

runCleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
