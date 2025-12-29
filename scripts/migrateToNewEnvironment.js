// migrateToNewEnvironment.js
// ================================================================
// MIGRATION SCRIPT: Populate new environment from S3 + CSV seed data
// ================================================================
//
// This script:
// 1. Clears all scraper-related DynamoDB tables (optional)
// 2. Scans S3 bucket and populates S3Storage table
// 3. Creates/updates ScrapeURL records with latestS3Key
// 4. Seeds core tables from CSV files (Entity, Venue, RecurringGame, etc.)
//
// ⚠️ WARNING: THIS SCRIPT CAN DELETE DATA AND IS IRREVERSIBLE.
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { S3Client, paginateListObjectsV2, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';

// ================================================================
// CONFIGURATION
// ================================================================
const ENV_SUFFIX = '-ht3nugt6lvddpeeuwj3x6mkite-dev';

const CONFIG = {
  // Set to false to actually write/delete data
  DRY_RUN: true,
  
  // Set to true to clear tables before populating
  CLEAR_TABLES_FIRST: false,
  
  // Set to true to seed from CSV files
  SEED_FROM_CSV: true,
  
  // Set to true to populate scraper data from S3
  POPULATE_SCRAPER_DATA: true,
  
  // S3 Configuration
  S3_BUCKET: 'pokerpro-scraper-storage',
  S3_PREFIX: 'entities/',
  
  // CSV seed data directory (relative to script location)
  SEED_DATA_DIR: './seed-data',
  
  // DynamoDB Tables - Scraper
  TABLES: {
    S3_STORAGE: `S3Storage${ENV_SUFFIX}`,
    SCRAPE_URL: `ScrapeURL${ENV_SUFFIX}`,
    SCRAPE_ATTEMPT: `ScrapeAttempt${ENV_SUFFIX}`,
    SCRAPER_JOB: `ScraperJob${ENV_SUFFIX}`,
    SCRAPER_STATE: `ScraperState${ENV_SUFFIX}`,
    SCRAPE_STRUCTURE: `ScrapeStructure${ENV_SUFFIX}`,
  },
  
  // DynamoDB Tables - Core (for CSV seeding)
  SEED_TABLES: {
    ENTITY: `Entity${ENV_SUFFIX}`,
    VENUE: `Venue${ENV_SUFFIX}`,
    RECURRING_GAME: `RecurringGame${ENV_SUFFIX}`,
    SOCIAL_ACCOUNT: `SocialAccount${ENV_SUFFIX}`,
    TOURNAMENT_SERIES: `TournamentSeries${ENV_SUFFIX}`,
    TOURNAMENT_SERIES_TITLE: `TournamentSeriesTitle${ENV_SUFFIX}`,
  },
  
  // Tables to clear (order matters for foreign key considerations)
  TABLES_TO_CLEAR: [
    `ScrapeAttempt${ENV_SUFFIX}`,
    `S3Storage${ENV_SUFFIX}`,
    `ScraperJob${ENV_SUFFIX}`,
    `ScraperState${ENV_SUFFIX}`,
    `ScrapeStructure${ENV_SUFFIX}`,
    `ScrapeURL${ENV_SUFFIX}`,
  ],
  
  // Entity URL mappings
  ENTITY_DOMAINS: {
    '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
    'f6785dbb-ab2e-4e83-8ad8-3034e7f1947b': 'https://kingslive.com.au/76-2/?id=',
    '2e782b28-06b9-42e6-a66e-bfc17d68704f': 'https://kingspoker.au/tournament/?id=',
  },
  
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
};

// CSV file mappings (filename -> table config)
const CSV_MAPPINGS = {
  'Entity-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.ENTITY,
    keyField: 'id',
  },
  'Venue-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.VENUE,
    keyField: 'id',
  },
  'RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.RECURRING_GAME,
    keyField: 'id',
  },
  'SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.SOCIAL_ACCOUNT,
    keyField: 'id',
  },
  'TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.TOURNAMENT_SERIES,
    keyField: 'id',
  },
  'TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv': {
    tableName: CONFIG.SEED_TABLES.TOURNAMENT_SERIES_TITLE,
    keyField: 'id',
  },
};

// ================================================================
// SCHEMA DEFINITIONS - Field types for proper conversion
// ================================================================
const FIELD_TYPES = {
  // Entity fields
  Entity: {
    booleans: ['isActive'],
    integers: ['gameCount', 'venueCount', 'seriesGameCount'],
    floats: [],
    arrays: [],
    dates: ['createdAt', 'updatedAt', 'lastGameAddedAt', 'lastDataRefreshedAt', 'lastSeriesGameAddedAt'],
  },
  
  // Venue fields
  Venue: {
    booleans: ['isSpecial'],
    integers: ['venueNumber', 'gameCount', 'seriesGameCount'],
    floats: ['fee'],
    arrays: ['aliases'],
    dates: ['createdAt', 'updatedAt', 'lastGameAddedAt', 'lastDataRefreshedAt', 'lastSeriesGameAddedAt'],
  },
  
  // RecurringGame fields
  RecurringGame: {
    booleans: ['isActive', 'isPaused', 'isSignature', 'isBeginnerFriendly', 'isBounty', 'wasManuallyCreated', 'requiresReview', 'hasJackpotContributions', 'hasAccumulatorTickets'],
    integers: ['typicalStartingStack', 'expectedInstanceCount', 'totalInstancesRun'],
    floats: ['typicalBuyIn', 'typicalRake', 'typicalGuarantee', 'autoDetectionConfidence', 'avgAttendance', 'lastMonthAttendance', 'jackpotContributionAmount', 'accumulatorTicketValue'],
    arrays: ['aliases', 'tags', 'socialMediaHashtags'],
    dates: ['createdAt', 'updatedAt', 'lastGameDate', 'nextScheduledDate', 'lastEditedAt'],
  },
  
  // SocialAccount fields
  SocialAccount: {
    booleans: ['hasFullHistory', 'isScrapingEnabled', 'hasPostAccess'],
    integers: ['followerCount', 'followingCount', 'postCount', 'scrapeFrequencyMinutes', 'consecutiveFailures'],
    floats: [],
    arrays: ['permissionsGranted', 'tags'],
    dates: ['createdAt', 'updatedAt', 'lastScrapedAt', 'lastSuccessfulScrapeAt', 'nextScheduledScrapeAt', 'accessTokenExpiry'],
  },
  
  // TournamentSeries fields
  TournamentSeries: {
    booleans: [],
    integers: ['year', 'quarter', 'month', 'numberOfEvents'],
    floats: ['guaranteedPrizepool', 'estimatedPrizepool', 'actualPrizepool'],
    arrays: [],
    dates: ['createdAt', 'updatedAt', 'startDate', 'endDate'],
  },
  
  // TournamentSeriesTitle fields
  TournamentSeriesTitle: {
    booleans: [],
    integers: [],
    floats: [],
    arrays: ['aliases'],
    dates: ['createdAt', 'updatedAt'],
  },
};

// ================================================================
// LOGGER
// ================================================================
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  step: (step, msg) => console.log(`\n${'='.repeat(60)}\n[STEP ${step}] ${msg}\n${'='.repeat(60)}`),
  detail: (msg) => console.log(`  → ${msg}`),
};

// ================================================================
// SETUP CLIENTS
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
const s3Client = new S3Client({ region: CONFIG.REGION });

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

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

function parseS3Key(s3Key) {
  const regex = new RegExp(`^${CONFIG.S3_PREFIX}([^/]+)/html/(\\d+)/(.+\\.html)$`);
  const match = s3Key.match(regex);

  if (!match) return null;

  const entityId = match[1];
  const tournamentId = parseInt(match[2], 10);
  const filename = match[3];

  if (isNaN(tournamentId)) return null;

  return { entityId, tournamentId, filename };
}

function buildUrl(entityId, tournamentId) {
  const urlBase = CONFIG.ENTITY_DOMAINS[entityId];
  return `${urlBase}${tournamentId}`;
}

/**
 * Parse a CSV array string like ["value1","value2"] or ["value1"] to actual array
 */
function parseArrayField(value) {
  if (!value || value === '') return null;
  
  // Handle the CSV escaped format: "[""value1"",""value2""]"
  try {
    // Remove outer quotes if present
    let cleaned = value.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // Replace escaped quotes
    cleaned = cleaned.replace(/""/g, '"');
    
    // Parse as JSON
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    // If parsing fails, return null
    return null;
  }
}

/**
 * Convert a CSV row to a DynamoDB item with proper type conversions
 */
function convertRowToItem(row, typeName) {
  const types = FIELD_TYPES[typeName] || { booleans: [], integers: [], floats: [], arrays: [], dates: [] };
  const item = {};
  
  for (const [key, value] of Object.entries(row)) {
    // Skip __typename as DynamoDB handles this
    if (key === '__typename') {
      item.__typename = value;
      continue;
    }
    
    // Handle empty values
    if (value === '' || value === undefined || value === null) {
      // Don't include empty values (removeUndefinedValues handles this)
      continue;
    }
    
    // Convert based on field type
    if (types.booleans.includes(key)) {
      item[key] = value === 'true' || value === true;
    } else if (types.integers.includes(key)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        item[key] = num;
      }
    } else if (types.floats.includes(key)) {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        item[key] = num;
      }
    } else if (types.arrays.includes(key)) {
      const arr = parseArrayField(value);
      if (arr && arr.length > 0) {
        item[key] = arr;
      }
    } else if (key === '_lastChangedAt') {
      // _lastChangedAt is stored as number (timestamp)
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        item[key] = num;
      }
    } else if (key === '_version') {
      // _version is stored as number
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        item[key] = num;
      }
    } else {
      // String field - keep as is
      item[key] = value;
    }
  }
  
  return item;
}

// ================================================================
// PHASE 1: CLEAR TABLES
// ================================================================

async function getTableKeys(tableName) {
  const command = new DescribeTableCommand({ TableName: tableName });
  const { Table } = await ddbClient.send(command);
  const keySchema = Table.KeySchema;
  const partitionKey = keySchema.find(k => k.KeyType === 'HASH').AttributeName;
  const sortKeyDef = keySchema.find(k => k.KeyType === 'RANGE');
  const sortKey = sortKeyDef ? sortKeyDef.AttributeName : undefined;
  
  return { partitionKey, sortKey };
}

async function clearTableData(tableName) {
  logger.info(`Clearing all data from table: ${tableName}`);
  
  if (CONFIG.DRY_RUN) {
    logger.info(`[DRY_RUN] Would clear table: ${tableName}`);
    return 0;
  }
  
  const { partitionKey, sortKey } = await getTableKeys(tableName);

  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: sortKey ? `${partitionKey}, ${sortKey}` : partitionKey,
    };

    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: {
              [partitionKey]: item[partitionKey],
              ...(sortKey && { [sortKey]: item[sortKey] }),
            },
          },
        }));

        let unprocessedItems = { [tableName]: deleteRequests };
        let retries = 0;
        
        while (Object.keys(unprocessedItems).length > 0 && retries < 5) {
          const batchWriteResult = await ddbDocClient.send(
            new BatchWriteCommand({ RequestItems: unprocessedItems })
          );
          unprocessedItems = batchWriteResult.UnprocessedItems || {};
          
          if (Object.keys(unprocessedItems).length > 0) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
        
        totalDeleted += batch.length;
      }
      
      logger.info(`  Deleted ${totalDeleted} items...`);
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.success(`Cleared ${totalDeleted} items from ${tableName}`);
  return totalDeleted;
}

async function clearAllTables() {
  logger.step(1, 'CLEARING SCRAPER TABLES');
  
  if (!CONFIG.CLEAR_TABLES_FIRST) {
    logger.info('Skipping table clearing (CLEAR_TABLES_FIRST = false)');
    return;
  }
  
  let totalDeleted = 0;
  
  for (const tableName of CONFIG.TABLES_TO_CLEAR) {
    try {
      const count = await clearTableData(tableName);
      totalDeleted += count;
    } catch (error) {
      logger.error(`Failed to clear table ${tableName}: ${error.message}`);
    }
  }
  
  logger.success(`Total items deleted: ${totalDeleted}`);
}

// ================================================================
// PHASE 2: SCAN S3 AND POPULATE S3Storage + ScrapeURL
// ================================================================

async function scanS3AndPopulate() {
  logger.step(2, 'SCANNING S3 AND POPULATING TABLES');
  
  if (!CONFIG.POPULATE_SCRAPER_DATA) {
    logger.info('Skipping S3 population (POPULATE_SCRAPER_DATA = false)');
    return;
  }
  
  const urlLatestS3Keys = new Map(); // url -> { s3Key, lastModified }
  const s3Records = [];
  
  logger.info(`Scanning S3 bucket: ${CONFIG.S3_BUCKET}/${CONFIG.S3_PREFIX}`);
  
  const paginator = paginateListObjectsV2(
    { client: s3Client },
    { Bucket: CONFIG.S3_BUCKET, Prefix: CONFIG.S3_PREFIX }
  );
  
  let scannedCount = 0;
  
  for await (const page of paginator) {
    for (const obj of page.Contents || []) {
      scannedCount++;
      
      const parsed = parseS3Key(obj.Key);
      if (!parsed) continue;
      
      const { entityId, tournamentId, filename } = parsed;
      const url = buildUrl(entityId, tournamentId);
      
      // Create S3Storage record
      // FIXED: Added scrapedAt (required for GSI sort keys), url (for byURL GSI),
      // and corrected field names (s3Bucket, contentSize)
      const s3Record = {
        id: uuidv4(),
        s3Key: obj.Key,
        s3Bucket: CONFIG.S3_BUCKET,  // Fixed: was 'bucket'
        url: url,  // Added: required for byURL GSI
        entityId,
        tournamentId,
        filename,
        contentType: 'text/html',
        contentSize: obj.Size,  // Fixed: was 'sizeBytes'
        lastModified: obj.LastModified.toISOString(),
        scrapedAt: obj.LastModified.toISOString(),  // CRITICAL: Required for GSI sort keys
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __typename: 'S3Storage',
        _version: 1,
        _lastChangedAt: Date.now(),
      };
      
      s3Records.push(s3Record);
      
      // Track latest S3 key per URL
      const existing = urlLatestS3Keys.get(url);
      if (!existing || obj.LastModified > existing.lastModified) {
        urlLatestS3Keys.set(url, {
          s3Key: obj.Key,
          lastModified: obj.LastModified,
          entityId,
          tournamentId,
        });
      }
      
      if (scannedCount % 500 === 0) {
        logger.info(`  Scanned ${scannedCount} objects...`);
      }
    }
  }
  
  logger.info(`Scanned ${scannedCount} total objects, ${s3Records.length} valid HTML files`);
  logger.info(`Found ${urlLatestS3Keys.size} unique URLs`);
  
  // Write S3Storage records
  if (!CONFIG.DRY_RUN) {
    logger.info('Writing S3Storage records...');
    let written = 0;
    
    for (let i = 0; i < s3Records.length; i += 25) {
      const batch = s3Records.slice(i, i + 25);
      const putRequests = batch.map(item => ({
        PutRequest: { Item: item },
      }));
      
      let unprocessedItems = { [CONFIG.TABLES.S3_STORAGE]: putRequests };
      let retries = 0;
      
      while (Object.keys(unprocessedItems).length > 0 && retries < 5) {
        const result = await ddbDocClient.send(
          new BatchWriteCommand({ RequestItems: unprocessedItems })
        );
        unprocessedItems = result.UnprocessedItems || {};
        
        if (Object.keys(unprocessedItems).length > 0) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
      
      written += batch.length;
      if (written % 500 === 0) {
        logger.info(`  Written ${written} S3Storage records...`);
      }
    }
    
    logger.success(`Written ${written} S3Storage records`);
  } else {
    logger.info(`[DRY_RUN] Would write ${s3Records.length} S3Storage records`);
  }
  
  // Create/update ScrapeURL records
  logger.info('Creating ScrapeURL records...');
  let urlCount = 0;
  
  for (const [url, data] of urlLatestS3Keys) {
    const scrapeUrlRecord = {
      id: uuidv4(),
      url,
      entityId: data.entityId,
      tournamentId: data.tournamentId,
      status: 'ACTIVE',
      latestS3Key: data.s3Key,
      lastScrapedAt: data.lastModified.toISOString(),
      // Required fields that were missing:
      doNotScrape: false,
      placedIntoDatabase: true,
      firstScrapedAt: data.lastModified.toISOString(),
      timesScraped: 1,
      timesSuccessful: 1,
      timesFailed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      __typename: 'ScrapeURL',
      _version: 1,
      _lastChangedAt: Date.now(),
    };
    
    if (!CONFIG.DRY_RUN) {
      await ddbDocClient.send(new PutCommand({
        TableName: CONFIG.TABLES.SCRAPE_URL,
        Item: scrapeUrlRecord,
      }));
    }
    
    urlCount++;
    if (urlCount % 100 === 0) {
      logger.info(`  Created ${urlCount} ScrapeURL records...`);
    }
  }
  
  if (CONFIG.DRY_RUN) {
    logger.info(`[DRY_RUN] Would create ${urlCount} ScrapeURL records`);
  } else {
    logger.success(`Created ${urlCount} ScrapeURL records`);
  }
}

// ================================================================
// PHASE 3: SEED CORE TABLES FROM CSV
// ================================================================

async function seedFromCSV() {
  logger.step(3, 'SEEDING CORE TABLES FROM CSV FILES');
  
  if (!CONFIG.SEED_FROM_CSV) {
    logger.info('Skipping CSV seeding (SEED_FROM_CSV = false)');
    return;
  }
  
  const seedDir = path.resolve(CONFIG.SEED_DATA_DIR);
  
  if (!fs.existsSync(seedDir)) {
    logger.error(`Seed data directory not found: ${seedDir}`);
    logger.info('Please create the directory and add CSV files.');
    return;
  }
  
  const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.csv'));
  logger.info(`Found ${files.length} CSV files in ${seedDir}`);
  
  // Process in dependency order
  const orderedFiles = [
    'TournamentSeriesTitle-fosb7ek5argnhctz4odpt52eia-staging.csv',
    'Entity-fosb7ek5argnhctz4odpt52eia-staging.csv',
    'Venue-fosb7ek5argnhctz4odpt52eia-staging.csv',
    'TournamentSeries-fosb7ek5argnhctz4odpt52eia-staging.csv',
    'RecurringGame-fosb7ek5argnhctz4odpt52eia-staging.csv',
    'SocialAccount-fosb7ek5argnhctz4odpt52eia-staging.csv',
  ];
  
  for (const filename of orderedFiles) {
    if (!files.includes(filename)) {
      logger.warn(`CSV file not found: ${filename}`);
      continue;
    }
    
    const mapping = CSV_MAPPINGS[filename];
    if (!mapping) {
      logger.warn(`No mapping defined for: ${filename}`);
      continue;
    }
    
    await seedTableFromCSV(
      path.join(seedDir, filename),
      mapping.tableName,
      mapping.keyField
    );
  }
}

async function seedTableFromCSV(csvPath, tableName, keyField) {
  const filename = path.basename(csvPath);
  
  // Extract type name from filename (e.g., "Entity" from "Entity-xxx.csv")
  const typeName = filename.split('-')[0];
  
  logger.info(`\nProcessing: ${filename}`);
  logger.detail(`Target table: ${tableName}`);
  
  try {
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    });
    
    logger.detail(`Parsed ${records.length} records`);
    
    if (records.length === 0) {
      logger.warn('No records to insert');
      return;
    }
    
    // Convert and filter records
    const items = records.map(row => convertRowToItem(row, typeName));
    
    // Log sample item for verification
    if (items.length > 0) {
      logger.detail(`Sample item keys: ${Object.keys(items[0]).join(', ')}`);
    }
    
    if (CONFIG.DRY_RUN) {
      logger.info(`[DRY_RUN] Would insert ${items.length} items into ${tableName}`);
      
      // Show first item for verification
      if (items.length > 0) {
        console.log('\n  Sample item:');
        console.log(JSON.stringify(items[0], null, 2).split('\n').map(l => '    ' + l).join('\n'));
      }
      return;
    }
    
    // Write items in batches
    let written = 0;
    let failed = 0;
    
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      const putRequests = batch.map(item => ({
        PutRequest: { Item: item },
      }));
      
      try {
        let unprocessedItems = { [tableName]: putRequests };
        let retries = 0;
        
        while (Object.keys(unprocessedItems).length > 0 && retries < 5) {
          const result = await ddbDocClient.send(
            new BatchWriteCommand({ RequestItems: unprocessedItems })
          );
          
          const remaining = result.UnprocessedItems?.[tableName]?.length || 0;
          written += (batch.length - remaining);
          
          unprocessedItems = result.UnprocessedItems || {};
          
          if (Object.keys(unprocessedItems).length > 0) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
        
        if (Object.keys(unprocessedItems).length > 0) {
          failed += unprocessedItems[tableName]?.length || 0;
        }
      } catch (error) {
        logger.error(`Batch write failed: ${error.message}`);
        failed += batch.length;
      }
    }
    
    logger.success(`Inserted ${written} items into ${tableName}`);
    if (failed > 0) {
      logger.warn(`Failed to insert ${failed} items`);
    }
    
  } catch (error) {
    logger.error(`Failed to process ${filename}: ${error.message}`);
    console.error(error);
  }
}

// ================================================================
// MAIN EXECUTION
// ================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('   MIGRATION SCRIPT - Populate New Environment');
  console.log('='.repeat(60));
  console.log(`\nTarget Environment Suffix: ${ENV_SUFFIX}`);
  console.log(`Region: ${CONFIG.REGION}`);
  console.log(`DRY_RUN: ${CONFIG.DRY_RUN}`);
  console.log(`CLEAR_TABLES_FIRST: ${CONFIG.CLEAR_TABLES_FIRST}`);
  console.log(`SEED_FROM_CSV: ${CONFIG.SEED_FROM_CSV}`);
  console.log(`POPULATE_SCRAPER_DATA: ${CONFIG.POPULATE_SCRAPER_DATA}`);
  console.log('');
  
  // List target tables
  console.log('Target Scraper Tables:');
  Object.entries(CONFIG.TABLES).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  console.log('\nTarget Seed Tables:');
  Object.entries(CONFIG.SEED_TABLES).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('');
  
  if (!CONFIG.DRY_RUN) {
    const answer = await askQuestion(
      '\n⚠️  DRY_RUN is FALSE. This will modify data. Continue? (yes/no): '
    );
    
    if (answer.toLowerCase() !== 'yes') {
      logger.info('Aborted by user.');
      process.exit(0);
    }
  } else {
    logger.info('Running in DRY_RUN mode - no changes will be made.\n');
  }
  
  try {
    // Phase 1: Clear tables (if enabled)
    await clearAllTables();
    
    // Phase 2: Populate scraper data from S3 (if enabled)
    await scanS3AndPopulate();
    
    // Phase 3: Seed core tables from CSV
    await seedFromCSV();
    
    console.log('\n' + '='.repeat(60));
    console.log('   ✅ MIGRATION COMPLETE');
    console.log('='.repeat(60) + '\n');
    
    if (CONFIG.DRY_RUN) {
      logger.info('This was a DRY RUN. Set DRY_RUN = false to execute changes.');
    }
    
  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();
