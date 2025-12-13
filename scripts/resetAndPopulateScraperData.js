// resetAndPopulateScraperData.js
// ================================================================
// CONSOLIDATED SCRIPT: Clear scraper tables + Populate S3Storage
// ================================================================
//
// This script combines three operations into one:
// 1. Clears all scraper-related DynamoDB tables (optional)
// 2. Scans S3 bucket and populates S3Storage table
// 3. Creates/updates ScrapeURL records with latestS3Key (no separate backfill needed)
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
import { v4 as uuidv4 } from 'uuid';

// ================================================================
// CONFIGURATION
// ================================================================
const CONFIG = {
  // Set to false to actually write/delete data
  DRY_RUN: false,
  
  // Set to true to clear tables before populating
  // If false, will only populate (useful for incremental updates)
  CLEAR_TABLES_FIRST: true,
  
  // S3 Configuration
  S3_BUCKET: 'pokerpro-scraper-storage',
  S3_PREFIX: 'entities/',
  
  // DynamoDB Tables
  TABLES: {
    S3_STORAGE: 'S3Storage-sjyzke3u45golhnttlco6bpcua-dev',
    SCRAPE_URL: 'ScrapeURL-sjyzke3u45golhnttlco6bpcua-dev',
    SCRAPE_ATTEMPT: 'ScrapeAttempt-sjyzke3u45golhnttlco6bpcua-dev',
    SCRAPER_JOB: 'ScraperJob-sjyzke3u45golhnttlco6bpcua-dev',
    SCRAPER_STATE: 'ScraperState-sjyzke3u45golhnttlco6bpcua-dev',
    SCRAPE_STRUCTURE: 'ScrapeStructure-sjyzke3u45golhnttlco6bpcua-dev',
  },
  
  // Tables to clear (order matters for foreign key considerations)
  TABLES_TO_CLEAR: [
    'ScrapeAttempt-sjyzke3u45golhnttlco6bpcua-dev',  // Clear first (references others)
    'S3Storage-sjyzke3u45golhnttlco6bpcua-dev',
    'ScraperJob-sjyzke3u45golhnttlco6bpcua-dev',
    'ScraperState-sjyzke3u45golhnttlco6bpcua-dev',
    'ScrapeStructure-sjyzke3u45golhnttlco6bpcua-dev',
    'ScrapeURL-sjyzke3u45golhnttlco6bpcua-dev',      // Clear last (referenced by others)
  ],
  
  // Entity URL mappings
  ENTITY_DOMAINS: {
    '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
    'f6785dbb-ab2e-4e83-8ad8-3034e7f1947b': 'https://kingslive.com.au/76-2/?id=',
    '2e782b28-06b9-42e6-a66e-bfc17d68704f': 'https://kingspoker.au/tournament/?id=',
  },
  
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
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
};

// ================================================================
// SETUP CLIENTS
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
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
      const deleted = await clearTableData(tableName);
      totalDeleted += deleted;
    } catch (err) {
      logger.error(`Error clearing ${tableName}: ${err.message}`);
    }
  }
  
  logger.success(`Total items deleted across all tables: ${totalDeleted}`);
}

// ================================================================
// PHASE 2: SCAN S3 AND GROUP BY TOURNAMENT
// ================================================================

async function getS3Metadata(s3Key) {
  try {
    const headResult = await s3Client.send(new HeadObjectCommand({
      Bucket: CONFIG.S3_BUCKET,
      Key: s3Key
    }));

    return {
      etag: headResult.ETag ? headResult.ETag.replace(/"/g, '') : null,
      lastModified: headResult.LastModified ? headResult.LastModified.toISOString() : null,
      contentType: headResult.ContentType || 'text/html',
      contentLength: headResult.ContentLength || 0,
      metadata: headResult.Metadata || {},
    };
  } catch (error) {
    return {
      etag: null,
      lastModified: null,
      contentType: 'text/html',
      contentLength: 0,
      metadata: {},
    };
  }
}

async function scanS3AndGroupByTournament() {
  logger.step(2, 'SCANNING S3 BUCKET');
  
  const paginator = paginateListObjectsV2(
    { client: s3Client }, 
    { Bucket: CONFIG.S3_BUCKET, Prefix: CONFIG.S3_PREFIX }
  );
  
  const tournamentVersions = new Map();
  let totalScanned = 0;
  let totalSkipped = 0;

  for await (const page of paginator) {
    const objects = page.Contents || [];

    for (const obj of objects) {
      if (obj.Key.endsWith('/') || obj.Size === 0) {
        totalSkipped++;
        continue;
      }
      
      const metadata = parseS3Key(obj.Key);
      if (!metadata) {
        totalSkipped++;
        continue;
      }

      const { entityId, tournamentId, filename } = metadata;
      const url = buildUrl(entityId, tournamentId);
      
      totalScanned++;

      // Get S3 metadata
      const s3Metadata = await getS3Metadata(obj.Key);

      const versionObj = {
        s3Key: obj.Key,
        url,
        entityId,
        tournamentId,
        filename,
        scrapedAt: obj.LastModified.toISOString(),
        lastModified: s3Metadata.lastModified,
        contentSize: obj.Size,
        etag: s3Metadata.etag,
        contentHash: s3Metadata.metadata?.contenthash || null,
      };

      if (!tournamentVersions.has(url)) {
        tournamentVersions.set(url, []);
      }
      tournamentVersions.get(url).push(versionObj);
    }
  }

  // Sort each tournament's versions by scrapedAt (oldest first)
  for (const [url, versions] of tournamentVersions) {
    versions.sort((a, b) => new Date(a.scrapedAt) - new Date(b.scrapedAt));
  }

  logger.success(`Found ${tournamentVersions.size} unique tournaments`);
  logger.success(`Total HTML versions: ${totalScanned}`);
  logger.info(`Skipped: ${totalSkipped} (empty or unparseable)`);
  
  return tournamentVersions;
}

// ================================================================
// PHASE 3: CREATE SCRAPEURL AND S3STORAGE RECORDS
// ================================================================

function buildVersionHistory(versions, currentIndex) {
  const previousVersions = [];
  
  for (let i = 0; i < currentIndex; i++) {
    const version = versions[i];
    
    // Match GraphQL S3VersionHistory type exactly
    previousVersions.push({
      s3Key: version.s3Key,
      scrapedAt: version.scrapedAt,
      contentHash: version.contentHash || null,
      contentSize: version.contentSize || null,
      uploadedBy: 'resetAndPopulate',
    });
  }
  
  return previousVersions;
}

async function findExistingScrapeURL(url) {
  try {
    const queryResult = await ddbDocClient.send(new QueryCommand({
      TableName: CONFIG.TABLES.SCRAPE_URL,
      IndexName: 'byURL',
      KeyConditionExpression: '#url = :url',
      ExpressionAttributeNames: { '#url': 'url' },
      ExpressionAttributeValues: { ':url': url },
      Limit: 1
    }));

    return queryResult.Items?.[0] || null;
  } catch (error) {
    return null;
  }
}

async function createScrapeURL(url, tournamentId, entityId, latestVersion) {
  const now = new Date().toISOString();
  
  // FIX: Use URL as ID instead of UUID to match runtime expectations
  const id = url;
  
  const scrapeURLItem = {
    id,
    url,
    tournamentId,
    entityId,
    
    // Status fields
    status: 'ACTIVE',
    placedIntoDatabase: false,
    doNotScrape: false,
    sourceDataIssue: false,
    gameDataVerified: false,
    
    // Scraping stats
    firstScrapedAt: latestVersion?.scrapedAt || now,
    lastScrapedAt: latestVersion?.scrapedAt || now,
    lastSuccessfulScrapeAt: latestVersion?.scrapedAt || now,
    timesScraped: 1,
    timesSuccessful: 1,
    timesFailed: 0,
    consecutiveFailures: 0,
    lastScrapeStatus: 'SUCCESS',
    
    // Source identification
    sourceSystem: 'KINGSROOM',
    
    // S3 caching fields
    s3StorageEnabled: true,
    latestS3Key: latestVersion?.s3Key || null,  // ✅ Set immediately!
    etag: latestVersion?.etag || null,
    lastModifiedHeader: latestVersion?.lastModified || null,
    contentHash: latestVersion?.contentHash || null,
    contentSize: latestVersion?.contentSize || null,
    
    // DataStore fields
    createdAt: now,
    updatedAt: now,
    __typename: 'ScrapeURL',
    _version: 1,
    _lastChangedAt: Date.now(),
  };

  if (!CONFIG.DRY_RUN) {
    await ddbDocClient.send(new PutCommand({
      TableName: CONFIG.TABLES.SCRAPE_URL,
      Item: scrapeURLItem
    }));
  }

  return id;
}

async function createS3StorageRecord(scrapeURLId, url, entityId, tournamentId, latestVersion, previousVersions) {
  const now = new Date();
  const s3StorageId = uuidv4();
  
  const s3StorageItem = {
    // Core identity
    id: s3StorageId,
    scrapeURLId,
    url,
    tournamentId,
    entityId,
    
    // S3 storage (latest version)
    s3Key: latestVersion.s3Key,
    s3Bucket: CONFIG.S3_BUCKET,
    scrapedAt: latestVersion.scrapedAt,
    contentSize: latestVersion.contentSize,
    contentHash: latestVersion.contentHash,
    contentType: 'text/html',
    etag: latestVersion.etag,
    lastModified: latestVersion.lastModified,
    headers: null,
    
    // Source tracking
    source: 'S3_IMPORT',
    isManualUpload: false,
    uploadedBy: 'resetAndPopulate',
    notes: `Imported from S3 on ${now.toISOString()}`,
    
    // Parsing status (schema fields)
    isParsed: false,
    parsedDataHash: null,
    extractedFields: null,
    lastParsedAt: null,
    parseCount: 0,
    rescrapeCount: 0,
    lastRescrapeAt: null,
    dataChangedAt: null,
    dataChangeCount: 0,
    dataExtracted: false,
    
    // Version tracking
    versionNumber: previousVersions.length + 1,
    totalVersions: previousVersions.length + 1,
    previousVersions,
    
    // Game tracking
    wasGameCreated: false,
    wasGameUpdated: false,
    storedAt: latestVersion.scrapedAt,
    
    // DataStore fields
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    _version: 1,
    _lastChangedAt: now.getTime(),
    __typename: 'S3Storage',
  };

  return { id: s3StorageId, item: s3StorageItem };
}

async function updateScrapeURLWithS3Storage(scrapeURLId, s3StorageId, s3Key, scrapedAt) {
  if (CONFIG.DRY_RUN) return;

  await ddbDocClient.send(new UpdateCommand({
    TableName: CONFIG.TABLES.SCRAPE_URL,
    Key: { id: scrapeURLId },
    UpdateExpression: `
      SET latestS3StorageId = :s3StorageId,
          latestS3Key = :s3Key,
          lastSuccessfulScrapeAt = :scrapedAt,
          updatedAt = :now,
          #lca = :timestamp,
          #v = if_not_exists(#v, :zero) + :one
    `,
    ExpressionAttributeNames: {
      '#lca': '_lastChangedAt',
      '#v': '_version'
    },
    ExpressionAttributeValues: {
      ':s3StorageId': s3StorageId,
      ':s3Key': s3Key,
      ':scrapedAt': scrapedAt,
      ':now': new Date().toISOString(),
      ':timestamp': Date.now(),
      ':zero': 0,
      ':one': 1
    }
  }));
}

async function populateRecords(tournamentVersions) {
  logger.step(3, 'CREATING SCRAPEURL AND S3STORAGE RECORDS');
  
  let totalScrapeURLs = 0;
  let totalS3Storage = 0;
  const s3StorageBatch = [];

  for (const [url, versions] of tournamentVersions) {
    const { entityId, tournamentId } = versions[0];
    const latestVersion = versions[versions.length - 1];
    const previousVersions = buildVersionHistory(versions, versions.length - 1);

    // Check for existing ScrapeURL (in case CLEAR_TABLES_FIRST = false)
    let scrapeURLId;
    const existingScrapeURL = await findExistingScrapeURL(url);
    
    if (existingScrapeURL) {
      scrapeURLId = existingScrapeURL.id;
      logger.info(`  Found existing ScrapeURL for tournament ${tournamentId}`);
    } else {
      scrapeURLId = await createScrapeURL(url, tournamentId, entityId, latestVersion);
      totalScrapeURLs++;
      
      if (CONFIG.DRY_RUN) {
        logger.info(`  [DRY_RUN] Would create ScrapeURL for tournament ${tournamentId}`);
      }
    }

    // Create S3Storage record
    const { id: s3StorageId, item: s3StorageItem } = await createS3StorageRecord(
      scrapeURLId, url, entityId, tournamentId, latestVersion, previousVersions
    );

    s3StorageBatch.push({ PutRequest: { Item: s3StorageItem } });
    totalS3Storage++;

    // Send batch when full
    if (s3StorageBatch.length === 25) {
      await sendBatch(s3StorageBatch, CONFIG.TABLES.S3_STORAGE);
      s3StorageBatch.length = 0;
    }

    // Update ScrapeURL with S3Storage link
    await updateScrapeURLWithS3Storage(scrapeURLId, s3StorageId, latestVersion.s3Key, latestVersion.scrapedAt);

    if (CONFIG.DRY_RUN && versions.length > 1) {
      logger.info(`  [DRY_RUN] Tournament ${tournamentId}: ${versions.length} versions (${previousVersions.length} in history)`);
    }
  }

  // Send remaining batch
  if (s3StorageBatch.length > 0) {
    await sendBatch(s3StorageBatch, CONFIG.TABLES.S3_STORAGE);
  }

  logger.success(`Created ${totalScrapeURLs} ScrapeURL records`);
  logger.success(`Created ${totalS3Storage} S3Storage records`);
  
  return { totalScrapeURLs, totalS3Storage };
}

async function sendBatch(requests, tableName) {
  if (CONFIG.DRY_RUN) {
    logger.info(`[DRY_RUN] Would write ${requests.length} items to ${tableName}`);
    return;
  }
  
  let unprocessedItems = { [tableName]: requests };
  let attempt = 0;
  
  while (Object.keys(unprocessedItems).length > 0 && attempt < 5) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    
    const result = await ddbDocClient.send(new BatchWriteCommand({ 
      RequestItems: unprocessedItems 
    }));
    
    unprocessedItems = result.UnprocessedItems || {};
    attempt++;
  }

  if (Object.keys(unprocessedItems).length > 0) {
    logger.error(`Failed to process ${unprocessedItems[tableName]?.length || 0} items`);
  }
}

// ================================================================
// MAIN EXECUTION
// ================================================================

async function main() {
  console.log('\n');
  logger.warn('╔══════════════════════════════════════════════════════════╗');
  logger.warn('║     RESET AND POPULATE SCRAPER DATA                      ║');
  logger.warn('║     Combined: Clear Tables + Populate from S3            ║');
  logger.warn('╚══════════════════════════════════════════════════════════╝');
  
  if (CONFIG.DRY_RUN) {
    logger.warn('\n*** DRY_RUN IS ENABLED. NO DATA WILL BE WRITTEN OR DELETED. ***\n');
  } else {
    logger.warn('\n*** DRY_RUN IS DISABLED. THIS WILL MODIFY YOUR DATABASE. ***\n');
  }

  console.log('📋 Configuration:');
  console.log(`   S3 Bucket:           ${CONFIG.S3_BUCKET}`);
  console.log(`   S3 Prefix:           ${CONFIG.S3_PREFIX}`);
  console.log(`   Region:              ${CONFIG.REGION}`);
  console.log(`   Clear Tables First:  ${CONFIG.CLEAR_TABLES_FIRST ? 'YES' : 'NO'}`);
  console.log(`   Dry Run:             ${CONFIG.DRY_RUN ? 'YES' : 'NO'}`);
  
  if (CONFIG.CLEAR_TABLES_FIRST) {
    console.log('\n📋 Tables to clear:');
    CONFIG.TABLES_TO_CLEAR.forEach(t => console.log(`   - ${t}`));
  }

  const confirmation = await askQuestion('\n⚠️  Type "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  const startTime = Date.now();

  // Phase 1: Clear tables
  if (CONFIG.CLEAR_TABLES_FIRST) {
    await clearAllTables();
  }

  // Phase 2: Scan S3
  const tournamentVersions = await scanS3AndGroupByTournament();

  // Phase 3: Populate records
  const { totalScrapeURLs, totalS3Storage } = await populateRecords(tournamentVersions);

  // Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n');
  logger.success('╔══════════════════════════════════════════════════════════╗');
  logger.success('║                    COMPLETED                             ║');
  logger.success('╚══════════════════════════════════════════════════════════╝');
  console.log(`
   📊 Summary:
   ─────────────────────────────────────
   Tournaments processed:     ${tournamentVersions.size}
   ScrapeURL records:         ${totalScrapeURLs}
   S3Storage records:         ${totalS3Storage}
   Duration:                  ${duration}s
   ─────────────────────────────────────
`);

  // Version statistics
  const versionStats = Array.from(tournamentVersions.values())
    .map(v => v.length)
    .reduce((acc, count) => {
      acc[count] = (acc[count] || 0) + 1;
      return acc;
    }, {});
  
  console.log('   📊 Version Distribution:');
  Object.entries(versionStats)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([count, tournaments]) => {
      console.log(`      ${count} version(s): ${tournaments} tournament(s)`);
    });

  if (CONFIG.DRY_RUN) {
    logger.warn('\n*** DRY_RUN WAS ENABLED. NO DATA WAS WRITTEN OR DELETED. ***');
    logger.info('Review the output above, then set DRY_RUN = false to execute.');
  } else {
    logger.success('\n✅ All operations completed successfully!');
    logger.success('✅ ScrapeURL.latestS3Key is set (no backfill needed)');
    logger.success('✅ S3Storage records include full version history');
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});