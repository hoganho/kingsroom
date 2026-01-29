#!/usr/bin/env node
/**
 * ===================================================================
 * Cleanup Script: Merge Duplicate Tournament Series
 * ===================================================================
 * 
 * VERSION: 1.1.0 (with interactive environment selection)
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
 *   node cleanup-duplicate-series.mjs                     # Interactive env selection + preview
 *   node cleanup-duplicate-series.mjs --execute           # Interactive env selection + execute
 *   node cleanup-duplicate-series.mjs --entity-id <id>    # Filter by entity
 *   node cleanup-duplicate-series.mjs --verbose           # Detailed output
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

const REGION = 'ap-southeast-2';

// ============================================================================
// RUNTIME STATE
// ============================================================================

let SELECTED_ENV = null;
let CONFIG = null;

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

// ============================================================================
// ALIAS EXPANSION MAP - Expands abbreviations to full names
// ============================================================================

const ALIAS_EXPANSIONS = {
  // Abbreviations → Full names
  'kc': 'Kings Cup',
  'cny': 'Chinese New Year',
  'apt': 'Asia Pacific Tour',
  'wsop': 'World Series of Poker',
  'wpt': 'World Poker Tour',
  'me': 'Main Event',
  'hr': 'High Roller',
  'plo': 'Pot Limit Omaha',
  'nlhe': 'No Limit Hold\'em',
  'ss': 'Super Series',
  'sig': 'Signature',
};

// Venue-specific series aliases - maps alias to canonical series name
const VENUE_SERIES_ALIASES = {
  'kc @ churchills': 'Kings Cup @ Churchills',
  'kc@churchills': 'Kings Cup @ Churchills',
  'dragon lunar': 'Chinese New Year Lunar Series',
  'cny lunar': 'Chinese New Year Lunar Series',
  'cny lunar series': 'Chinese New Year Lunar Series',
};

/**
 * Expand known abbreviations in a name
 */
function expandAliases(name) {
  if (!name) return name;
  
  let expanded = name;
  
  // Check venue-specific aliases first (case-insensitive)
  const lowerName = name.toLowerCase().trim();
  for (const [alias, canonical] of Object.entries(VENUE_SERIES_ALIASES)) {
    if (lowerName.startsWith(alias)) {
      expanded = canonical + name.slice(alias.length);
      break;
    }
  }
  
  // Then expand individual abbreviations (word boundaries)
  for (const [abbrev, full] of Object.entries(ALIAS_EXPANSIONS)) {
    const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
    expanded = expanded.replace(regex, full);
  }
  
  return expanded;
}

// ============================================================================
// KNOWN SERIES PATTERNS - Used for base name extraction
// ============================================================================

const KNOWN_SERIES_PATTERNS = [
  // Specific named series (after alias expansion)
  /\b(Chinese\s+New\s+Year\s+Lunar\s+Series)\b/i,
  /\b(Kings?\s+Cup\s+@\s+Churchills)\b/i,
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
  renameCanonical: false,
  renameAll: false,  // NEW: Rename ALL series with messy names
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
    case '--rename-all':
      options.renameAll = true;
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
  --rename-all               Rename ALL series with messy names (expands aliases like KC → Kings Cup)
  --help, -h                 Show this help message

Examples:
  node cleanup-duplicate-series.mjs --preview
  node cleanup-duplicate-series.mjs --preview --year 2026 --verbose
  node cleanup-duplicate-series.mjs --execute --entity-id abc123
  node cleanup-duplicate-series.mjs --preview --rename-all
      `);
      process.exit(0);
  }
}

// ============================================================================
// AWS CLIENT SETUP
// ============================================================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
  
  // FIRST: Expand aliases (KC → Kings Cup, etc.)
  const expandedName = expandAliases(originalName);
  
  // Try known patterns on expanded name first
  for (const pattern of KNOWN_SERIES_PATTERNS) {
    const match = expandedName.match(pattern);
    if (match) {
      const baseName = match[1].trim();
      return {
        baseName,
        normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
        method: 'KNOWN_PATTERN',
        wasExpanded: expandedName !== originalName
      };
    }
  }
  
  // Try event pattern extraction on expanded name
  const eventPatterns = [
    /^(.+?)\s+Event\s*#?\s*\d+\s*[:\-]\s*.+$/i,
    /^(.+?)\s+Event\s*#?\s*\d+$/i,
    /^(.+?)\s+#\d+\s*[:\-]\s*.+$/i,
  ];
  
  for (const pattern of eventPatterns) {
    const match = expandedName.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      if (baseName.length >= 5) {
        return {
          baseName,
          normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
          method: 'EVENT_PATTERN',
          wasExpanded: expandedName !== originalName
        };
      }
    }
  }
  
  // Try keyword extraction on expanded name
  const keywordPatterns = [
    /^(.+?\s+Series)\b/i,
    /^(.+?\s+Championship)\b/i,
    /^(.+?\s+Festival)\b/i,
    /^(.+?\s+Classic)\b/i,
    /^(.+?\s+Cup)\b/i,
  ];
  
  for (const pattern of keywordPatterns) {
    const match = expandedName.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      if (baseName.length >= 5) {
        return {
          baseName,
          normalized: baseName.toLowerCase().replace(/\s+/g, ' ').trim(),
          method: 'KEYWORD_PATTERN',
          wasExpanded: expandedName !== originalName
        };
      }
    }
  }
  
  // Fallback: strip common suffixes from expanded name
  let baseName = expandedName
    .replace(/\s+Event\s*#?\s*\d+\s*[:\-]?\s*.*/i, '')
    .replace(/\s+Flight\s*\d*[A-Z]?\b.*/i, '')
    .replace(/\s+Day\s*\d+.*/i, '')
    .replace(/\s+[-–]\s+.+$/, '')
    .replace(/\s+\$[\d,]+[kK]?\s*(GTD|Guaranteed).*/i, '')
    .replace(/\s+20[2-3]\d$/, '')
    .trim();
  
  return {
    baseName: baseName || expandedName,
    normalized: (baseName || expandedName).toLowerCase().replace(/\s+/g, ' ').trim(),
    method: 'FALLBACK',
    wasExpanded: expandedName !== originalName
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
    
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    
    if (filterExpression && expressionValues) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionValues;
    }
    
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
 * Update TournamentSeriesMetrics.seriesName for a given series
 */
async function updateMetricsSeriesName(seriesId, newSeriesName) {
  // First get all metrics for this series
  const metrics = await getMetricsBySeriesId(seriesId);
  
  if (metrics.length === 0) {
    return 0;
  }
  
  let updated = 0;
  for (const metric of metrics) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: getTableName('TournamentSeriesMetrics'),
        Key: { id: metric.id },
        UpdateExpression: 'SET seriesName = :name',
        ExpressionAttributeValues: {
          ':name': newSeriesName,
        },
      }));
      updated++;
    } catch (err) {
      console.error(`   ⚠️  Failed to update metric ${metric.id}: ${err.message}`);
    }
  }
  
  return updated;
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
  const cleanBase = smartCapitalize(baseName);
  return `${cleanBase} ${year}`;
}

/**
 * Generate a clean title name (without year)
 */
function generateCleanTitleName(baseName) {
  return smartCapitalize(baseName);
}

/**
 * Smart capitalization that preserves certain words/patterns
 */
function smartCapitalize(text) {
  // Words that should stay uppercase
  const preserveUppercase = ['CNY', 'NYC', 'APT', 'WPT', 'WSOP', 'EPT', 'PLO', 'NLHE', 'GTD', 'HR'];
  // Words that should stay lowercase
  const preserveLowercase = ['@', 'at', 'the', 'of', 'and', 'in', 'for'];
  
  return text
    .split(' ')
    .map((word, index) => {
      const upperWord = word.toUpperCase();
      
      // Preserve known uppercase words
      if (preserveUppercase.includes(upperWord)) {
        return upperWord;
      }
      
      // Handle @ symbol
      if (word === '@') {
        return '@';
      }
      
      // Keep lowercase words lowercase (except first word)
      if (index > 0 && preserveLowercase.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      
      // Standard title case
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
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
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        TOURNAMENT SERIES DUPLICATE CLEANUP                        ║');
  console.log('║        Merges duplicate TournamentSeries records                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

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
    console.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ============================================================================
// MAIN CLEANUP LOGIC
// ============================================================================

async function runCleanup() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  CONFIG = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  console.log(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  console.log(`API ID: ${CONFIG.API_ID}`);
  console.log(`Mode: ${options.execute ? '🔴 EXECUTE' : '🟢 PREVIEW'}`);
  if (options.entityId) console.log(`Entity filter: ${options.entityId}`);
  if (options.venueId) console.log(`Venue filter: ${options.venueId}`);
  if (options.year) console.log(`Year filter: ${options.year}`);
  console.log('─'.repeat(70) + '\n');

  // Production safety check
  if (SELECTED_ENV === 'prod' && options.execute) {
    console.log('⚠️  You are about to MODIFY PRODUCTION data!');
    const confirm = await askQuestion('Type "fix prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'fix prod') {
      console.log('Aborted by user.');
      return;
    }
    console.log('');
  }
  
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
  const seriesGroups = new Map();
  
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
      
      // Penalties for messy names
      const hasEventInName = /event\s*#?\s*\d+/i.test(s.name);
      const hasSatellite = /sat(?:ty|ellite)/i.test(s.name);
      const hasFlightDay = /(?:flight|day)\s*\d/i.test(s.name);
      const hasDescription = /-\s*\w/.test(s.name);
      const hasGuarantee = /gtd|guaranteed|\$\d+/i.test(s.name);
      
      const isCleanName = !hasEventInName && !hasSatellite && !hasFlightDay && !hasDescription && !hasGuarantee;
      
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
    
    scoredSeries.sort((a, b) => b.score - a.score);
    
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
    
    const totalGamesToMove = duplicates.reduce((sum, d) => sum + d.gameCount, 0);
    
    const cleanCanonicalName = generateCleanSeriesName(group.baseName, group.year);
    const cleanTitleName = generateCleanTitleName(group.baseName);
    const needsRename = canonical.name !== cleanCanonicalName;
    
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
    
    if (options.renameCanonical && op.needsRename) {
      totalSeriesToRename++;
    }
    if (options.renameCanonical && op.needsTitleRename) {
      totalTitlesToRename++;
    }
    
    for (const dup of op.duplicates) {
      totalMetricsToDelete += dup.metricsCount || 0;
    }
    
    const canonicalTitleId = op.canonical.tournamentSeriesTitleId;
    for (const dup of op.duplicates) {
      if (dup.tournamentSeriesTitleId && 
          dup.tournamentSeriesTitleId !== canonicalTitleId) {
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
  
  // ========================================
  // STEP 5b: Analyze ALL series for renaming (--rename-all)
  // ========================================
  
  const renameAllOperations = [];
  
  if (options.renameAll) {
    console.log('\n' + '─'.repeat(60));
    console.log('🔄 Analyzing ALL series for alias expansion/renaming...\n');
    
    for (const series of allSeries) {
      const { baseName, normalized, wasExpanded } = extractBaseSeriesName(series.name);
      const year = series.year || new Date().getFullYear();
      const cleanName = generateCleanSeriesName(baseName, year);
      
      // Check if name needs updating
      const needsRename = series.name !== cleanName;
      
      // Check if the associated title needs updating
      let needsTitleRename = false;
      let currentTitle = null;
      if (series.tournamentSeriesTitleId) {
        currentTitle = titleById.get(series.tournamentSeriesTitleId);
        if (currentTitle && currentTitle.title !== baseName) {
          needsTitleRename = true;
        }
      }
      
      if (needsRename || needsTitleRename) {
        // Check if this series is already being handled by duplicate merge
        const isInDuplicateGroup = mergeOperations.some(op => 
          op.canonical.id === series.id || op.duplicates.some(d => d.id === series.id)
        );
        
        if (!isInDuplicateGroup) {
          renameAllOperations.push({
            series,
            currentName: series.name,
            newName: cleanName,
            baseName,
            needsRename,
            currentTitle,
            newTitleName: baseName,
            needsTitleRename,
            wasExpanded,
          });
        }
      }
    }
    
    if (renameAllOperations.length > 0) {
      console.log(`   Found ${renameAllOperations.length} series to rename:\n`);
      
      for (const op of renameAllOperations) {
        console.log(`   📝 "${op.currentName}"`);
        if (op.wasExpanded) {
          console.log(`      🔧 Alias expanded to base: "${op.baseName}"`);
        }
        if (op.needsRename) {
          console.log(`      → Series rename: "${op.newName}"`);
        }
        if (op.needsTitleRename && op.currentTitle) {
          console.log(`      → Title rename: "${op.currentTitle.title}" → "${op.newTitleName}"`);
        }
        console.log('');
      }
    } else {
      console.log('   No additional series need renaming.\n');
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('MERGE SUMMARY');
  console.log('='.repeat(70));

  console.log(`\nDuplicate groups:           ${mergeOperations.length}`);
  console.log(`Series to delete:           ${totalDuplicateSeries}`);
  console.log(`Games to update:            ${totalGamesToUpdate}`);
  console.log(`Metrics to delete:          ${totalMetricsToDelete}`);
  console.log(`Orphaned titles to delete:  ${totalTitlesToDelete}`);
  if (options.renameCanonical) {
    console.log(`Series to rename:           ${totalSeriesToRename}`);
    console.log(`Titles to rename:           ${totalTitlesToRename}`);
  }
  if (options.renameAll) {
    const additionalSeriesToRename = renameAllOperations.filter(op => op.needsRename).length;
    const additionalTitlesToRename = renameAllOperations.filter(op => op.needsTitleRename).length;
    console.log(`\n[--rename-all] Additional renames:`);
    console.log(`  Series to rename:         ${additionalSeriesToRename}`);
    console.log(`  Titles to rename:         ${additionalTitlesToRename}`);
  }
  
  // ========================================
  // STEP 6: Execute (if not preview)
  // ========================================
  if (options.execute) {
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTING MERGE OPERATIONS');
    console.log('='.repeat(70));
    
    const answer = await askQuestion('\n⚠️  This will modify the database. Continue? (yes/no): ');
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
      
      // Rename canonical series if requested
      if (options.renameCanonical && op.needsRename) {
        try {
          console.log(`   Renaming series: "${canonicalName}" → "${op.cleanCanonicalName}"`);
          await renameTournamentSeries(canonicalId, op.cleanCanonicalName);
          canonicalName = op.cleanCanonicalName;
          seriesRenamed++;
          
          // Update metrics with new series name
          const metricsCount = await updateMetricsSeriesName(canonicalId, canonicalName);
          if (metricsCount > 0) {
            console.log(`   Updated ${metricsCount} metrics records with new name`);
          }
          
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
        
        try {
          console.log(`   Deleting series: ${dup.id}`);
          await deleteTournamentSeries(dup.id);
          seriesDeleted++;
        } catch (err) {
          console.error(`   ❌ Error deleting series ${dup.id}: ${err.message}`);
          errors++;
        }
        
        if (dup.tournamentSeriesTitleId && 
            dup.tournamentSeriesTitleId !== canonicalTitleId) {
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
    
    // Execute rename-all operations
    if (options.renameAll && renameAllOperations.length > 0) {
      console.log('\n' + '─'.repeat(60));
      console.log('EXECUTING RENAME-ALL OPERATIONS');
      console.log('─'.repeat(60));
      
      let metricsUpdated = 0;
      
      for (const op of renameAllOperations) {
        console.log(`\n   Processing: "${op.currentName}"`);
        
        // Rename the title first (if needed)
        if (op.needsTitleRename && op.currentTitle) {
          try {
            console.log(`   Renaming title: "${op.currentTitle.title}" → "${op.newTitleName}"`);
            await renameTournamentSeriesTitle(op.currentTitle.id, op.newTitleName);
            titlesRenamed++;
          } catch (err) {
            console.error(`   ❌ Error renaming title: ${err.message}`);
            errors++;
          }
        }
        
        // Rename the series
        if (op.needsRename) {
          try {
            console.log(`   Renaming series: "${op.currentName}" → "${op.newName}"`);
            await renameTournamentSeries(op.series.id, op.newName);
            seriesRenamed++;
            
            // Update metrics with new series name
            const metricsCount = await updateMetricsSeriesName(op.series.id, op.newName);
            if (metricsCount > 0) {
              console.log(`   Updated ${metricsCount} metrics records with new name`);
              metricsUpdated += metricsCount;
            }
            
            // Also update all games pointing to this series with the new name
            const games = await getGamesBySeriesId(op.series.id);
            if (games.length > 0) {
              console.log(`   Updating ${games.length} games with new series name...`);
              for (const game of games) {
                try {
                  await updateGameSeriesId(
                    game.id,
                    op.series.id,
                    op.newName,
                    op.series.tournamentSeriesTitleId
                  );
                  gamesUpdated++;
                  process.stdout.write('.');
                } catch (err) {
                  console.error(`\n   ❌ Error updating game ${game.id}: ${err.message}`);
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
        
        console.log(`   ✅ Renamed successfully`);
      }
      
      if (metricsUpdated > 0) {
        console.log(`\n   📊 Total metrics updated: ${metricsUpdated}`);
      }
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
