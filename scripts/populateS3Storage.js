// populateS3Storage.js
// Populates S3Storage table from existing S3 files with version history
//
// Logic:
// - Scans S3 bucket and groups files by tournament ID
// - Creates ONE S3Storage record per tournament
// - Main record fields point to LATEST version (most recent LastModified)
// - All older versions are stored in previousVersions array
// - Links ScrapeURL.latestS3StorageId to the S3Storage record
//
// ⚠️ WARNING: THIS SCRIPT WRITES DATA TO YOUR DATABASE.
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { S3Client, paginateListObjectsV2, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// --- CONFIGURATION ---
const DRY_RUN = false; 
const S3_BUCKET = 'pokerpro-scraper-storage';
const S3_PREFIX = 'entities/';
const S3_STORAGE_TABLE = 'S3Storage-sjyzke3u45golhnttlco6bpcua-dev';
const SCRAPE_URL_TABLE = 'ScrapeURL-sjyzke3u45golhnttlco6bpcua-dev';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

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
const s3Client = new S3Client({ region: REGION });

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

/**
 * Parse S3 key to extract metadata
 */
function parseS3Key(s3Key) {
  const regex = new RegExp(`^${S3_PREFIX}([^/]+)/html/(\\d+)/(.+\\.html)$`);
  const match = s3Key.match(regex);

  if (!match) {
    logger.warn(`Could not parse S3 key: ${s3Key}`);
    return null;
  }

  const entityId = match[1];
  const tournamentId = parseInt(match[2], 10);
  const filename = match[3];

  // Try to extract timestamp from filename
  // Format: 2025-11-14T09-45-48-4582_tid1_03514ee2.html
  const timestampMatch = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{4})/);
  const filenameTimestamp = timestampMatch ? timestampMatch[1] : null;

  if (isNaN(tournamentId)) {
    logger.warn(`Parsed non-numeric tournamentId from key: ${s3Key}`);
    return null;
  }

  return { entityId, tournamentId, filename, filenameTimestamp };
}

/**
 * Build URL from entity and tournament ID
 */
function buildUrl(entityId, tournamentId) {
  const entityDomains = {
    '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
  };
  
  const urlBase = entityDomains[entityId] || 'https://kingsroom.com.au/tournament/?id=';
  return `${urlBase}${tournamentId}`;
}

/**
 * Get S3 object metadata
 */
async function getS3Metadata(s3Key) {
  try {
    const headResult = await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
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
    logger.warn(`Could not get metadata for ${s3Key}: ${error.message}`);
    return {
      etag: null,
      lastModified: null,
      contentType: 'text/html',
      contentLength: 0,
      metadata: {},
    };
  }
}

/**
 * Get or create ScrapeURL record
 */
async function ensureScrapeURL(url, tournamentId, entityId) {
  if (DRY_RUN) {
    return url;
  }

  try {
    const getResult = await ddbDocClient.send(new GetCommand({
      TableName: SCRAPE_URL_TABLE,
      Key: { id: url }
    }));

    if (getResult.Item) {
      return getResult.Item.id;
    }

    const now = new Date().toISOString();
    const scrapeURLItem = {
      id: url,
      url: url,
      tournamentId: tournamentId,
      entityId: entityId,
      status: 'ACTIVE',
      placedIntoDatabase: false,
      firstScrapedAt: now,
      lastScrapedAt: now,
      timesScraped: 0,
      timesSuccessful: 0,
      timesFailed: 0,
      lastScrapeStatus: 'SUCCESS',
      doNotScrape: false,
      createdAt: now,
      updatedAt: now,
      __typename: 'ScrapeURL',
      _version: 1,
      _lastChangedAt: new Date().getTime(),
    };

    await ddbDocClient.send(new PutCommand({
      TableName: SCRAPE_URL_TABLE,
      Item: scrapeURLItem
    }));

    logger.success(`Created ScrapeURL: ${url}`);
    return url;
  } catch (error) {
    logger.error(`Error ensuring ScrapeURL for ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Build version history from array of S3 objects for the same tournament
 * @param {Array} versions - Array of version objects sorted by lastModified (oldest first)
 * @param {number} currentIndex - Index of current version in the array
 * @returns {Array} previousVersions array for the current version
 */
function buildVersionHistory(versions, currentIndex) {
  // For the current version, all earlier versions are "previous"
  const previousVersions = [];
  
  for (let i = 0; i < currentIndex; i++) {
    const version = versions[i];
    const prevVersion = {
      versionNumber: i + 1,
      s3Key: version.s3Key,
      scrapedAt: version.scrapedAt,
      contentSize: version.contentSize,
      contentHash: version.contentHash,
      etag: version.etag,
    };
    
    // Only include fields if they have values (to avoid GSI issues)
    if (version.gameId !== null && version.gameId !== undefined) {
      prevVersion.gameId = version.gameId;
    }
    if (version.gameStatus !== null && version.gameStatus !== undefined) {
      prevVersion.gameStatus = version.gameStatus;
    }
    if (version.registrationStatus !== null && version.registrationStatus !== undefined) {
      prevVersion.registrationStatus = version.registrationStatus;
    }
    
    previousVersions.push(prevVersion);
  }
  
  return previousVersions;
}

/**
 * Main execution function
 */
async function main() {
  logger.warn('========================================');
  logger.warn('  S3Storage Populator (One Per Game)   ');
  logger.warn('========================================');
  
  if (DRY_RUN) {
    logger.warn('*** DRY_RUN IS ENABLED. NO DATA WILL BE WRITTEN. ***');
  } else {
    logger.warn('*** DRY_RUN IS DISABLED. SCRIPT WILL WRITE TO DYNAMODB. ***');
  }
  
  logger.warn('This script will:');
  logger.warn('1. Scan S3 bucket and group files by tournament');
  logger.warn('2. Sort versions by timestamp (oldest to newest)');
  logger.warn('3. Create ONE S3Storage record per tournament');
  logger.warn('4. Use latest version for main fields');
  logger.warn('5. Store older versions in previousVersions array');
  logger.warn('6. Create/update ScrapeURL records');
  logger.warn('7. Link latest version to ScrapeURL.latestS3StorageId');

  console.log('\n📋 Configuration:');
  console.log(`   S3 Bucket:         ${S3_BUCKET}`);
  console.log(`   S3 Prefix:         ${S3_PREFIX}`);
  console.log(`   S3Storage Table:   ${S3_STORAGE_TABLE}`);
  console.log(`   ScrapeURL Table:   ${SCRAPE_URL_TABLE}`);
  console.log(`   Region:            ${REGION}`);
  console.log(`   Dry Run:           ${DRY_RUN ? 'YES' : 'NO'}`);
  
  const confirmation = await askQuestion('\n⚠️  Type "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  logger.info('\n🔍 Step 1: Scanning S3 bucket and grouping by tournament...');
  
  const paginator = paginateListObjectsV2(
    { client: s3Client }, 
    { Bucket: S3_BUCKET, Prefix: S3_PREFIX }
  );
  
  // Group files by URL (entityId + tournamentId)
  const tournamentVersions = new Map(); // url -> array of version objects
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

      const { entityId, tournamentId, filename, filenameTimestamp } = metadata;
      const url = buildUrl(entityId, tournamentId);
      
      totalScanned++;

      // Get S3 metadata
      const s3Metadata = await getS3Metadata(obj.Key);

      // Create version object
      const versionObj = {
        s3Key: obj.Key,
        url: url,
        entityId: entityId,
        tournamentId: tournamentId,
        filename: filename,
        filenameTimestamp: filenameTimestamp,
        scrapedAt: obj.LastModified.toISOString(),
        lastModified: s3Metadata.lastModified,
        contentSize: obj.Size,
        etag: s3Metadata.etag,
        contentHash: null, // Would need to download to calculate
        gameId: null,
        gameStatus: null,
        registrationStatus: null,
      };

      // Group by URL
      if (!tournamentVersions.has(url)) {
        tournamentVersions.set(url, []);
      }
      tournamentVersions.get(url).push(versionObj);
    }
  }

  logger.success(`Found ${tournamentVersions.size} unique tournaments`);
  logger.success(`Total versions: ${totalScanned}`);

  // Sort each tournament's versions by scrapedAt (oldest first)
  for (const [url, versions] of tournamentVersions) {
    versions.sort((a, b) => new Date(a.scrapedAt) - new Date(b.scrapedAt));
  }

  logger.info('\n🔍 Step 2: Creating S3Storage records with version history...');

  let totalCreated = 0;
  const s3StorageBatch = [];

  for (const [url, versions] of tournamentVersions) {
    const { entityId, tournamentId } = versions[0];
    
    logger.info(`\n📦 Processing tournament: ${tournamentId} (${versions.length} versions)`);

    // Ensure ScrapeURL exists
    const scrapeURLId = await ensureScrapeURL(url, tournamentId, entityId);

    // Get the latest version (last in sorted array)
    const latestVersion = versions[versions.length - 1];
    const latestIndex = versions.length - 1;
    
    // Build previousVersions array (all versions except the latest)
    const previousVersions = buildVersionHistory(versions, latestIndex);

    const now = new Date();
    const s3StorageId = uuidv4();
    
    // Create ONE S3Storage record per tournament with latest version as main data
    const s3StorageItem = {
      id: s3StorageId,
      scrapeURLId: scrapeURLId,
      url: url,
      tournamentId: tournamentId,
      entityId: entityId,
      s3Key: latestVersion.s3Key,
      s3Bucket: S3_BUCKET,
      scrapedAt: latestVersion.scrapedAt,
      contentSize: latestVersion.contentSize,
      contentHash: latestVersion.contentHash,
      etag: latestVersion.etag,
      lastModified: latestVersion.lastModified,
      headers: null,
      dataExtracted: false,
      isManualUpload: false,
      uploadedBy: null,
      notes: null,
      previousVersions: previousVersions, // ✅ All older versions
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      _version: 1,
      _lastChangedAt: now.getTime(),
      __typename: 'S3Storage',
    };

    // Only include GSI fields if they have non-null values to avoid DynamoDB validation errors
    // GSI byGameId requires gameId to be a String, not NULL
    // GSI byS3GameStatus requires gameStatus to be a String, not NULL
    if (latestVersion.gameId !== null && latestVersion.gameId !== undefined) {
      s3StorageItem.gameId = latestVersion.gameId;
    }
    if (latestVersion.gameStatus !== null && latestVersion.gameStatus !== undefined) {
      s3StorageItem.gameStatus = latestVersion.gameStatus;
    }
    if (latestVersion.registrationStatus !== null && latestVersion.registrationStatus !== undefined) {
      s3StorageItem.registrationStatus = latestVersion.registrationStatus;
    }

    if (DRY_RUN) {
      logger.info(`   [DRY_RUN] Latest version: ${latestVersion.filename}`);
      logger.info(`             Previous versions: ${previousVersions.length}`);
      logger.info(`             S3Storage ID: ${s3StorageId}`);
      
      if (versions.length > 1) {
        console.log('\n📄 S3Storage item (latest + version history):');
        console.log(JSON.stringify({
          ...s3StorageItem,
          previousVersions: s3StorageItem.previousVersions.map((v, idx) => ({
            versionNumber: v.versionNumber,
            s3Key: v.s3Key,
            scrapedAt: v.scrapedAt,
            contentSize: v.contentSize,
          }))
        }, null, 2));
      }
    }

    s3StorageBatch.push({ PutRequest: { Item: s3StorageItem } });
    totalCreated++;

    // Send batch when full
    if (s3StorageBatch.length === 25) {
      await sendBatch(s3StorageBatch, S3_STORAGE_TABLE);
      s3StorageBatch.length = 0;
    }

    // Update ScrapeURL.latestS3StorageId and latestS3Key
    if (!DRY_RUN) {
      try {
        await ddbDocClient.send(new PutCommand({
          TableName: SCRAPE_URL_TABLE,
          Item: {
            ...(await ddbDocClient.send(new GetCommand({
              TableName: SCRAPE_URL_TABLE,
              Key: { id: scrapeURLId }
            }))).Item,
            latestS3StorageId: s3StorageId,
            latestS3Key: latestVersion.s3Key,
            updatedAt: new Date().toISOString(),
          }
        }));
        logger.success(`   Updated ScrapeURL.latestS3StorageId → ${s3StorageId}`);
        logger.success(`   Updated ScrapeURL.latestS3Key → ${latestVersion.s3Key}`);
      } catch (error) {
        logger.warn(`   Could not update ScrapeURL: ${error.message}`);
      }
    }
  }

  // Send remaining batch
  if (s3StorageBatch.length > 0) {
    await sendBatch(s3StorageBatch, S3_STORAGE_TABLE);
  }

  logger.success('\n========================================');
  logger.success('           COMPLETED                    ');
  logger.success('========================================');
  logger.success(`Tournaments processed:    ${tournamentVersions.size}`);
  logger.success(`Total versions found:     ${totalScanned}`);
  logger.success(`S3Storage records created: ${totalCreated} (one per tournament)`);
  
  // Show version statistics
  const versionStats = Array.from(tournamentVersions.values())
    .map(v => v.length)
    .reduce((acc, count) => {
      acc[count] = (acc[count] || 0) + 1;
      return acc;
    }, {});
  
  console.log('\n📊 Version Statistics:');
  Object.entries(versionStats)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([count, tournaments]) => {
      const oldVersions = count > 1 ? `(${count - 1} in previousVersions)` : '(no previous versions)';
      console.log(`   ${count} version${count > 1 ? 's' : ''}: ${tournaments} tournament${tournaments > 1 ? 's' : ''} ${oldVersions}`);
    });
  
  if (DRY_RUN) {
    logger.warn('\n*** DRY_RUN WAS ENABLED. NO DATA WAS WRITTEN. ***');
    logger.info('Review the output above, then set DRY_RUN = false to write data.');
  } else {
    logger.success('\n✅ All items have been written to DynamoDB.');
    logger.success('✅ Each tournament has ONE S3Storage record');
    logger.success('✅ Latest version is in main fields, older versions in previousVersions array');
    logger.success('✅ ScrapeURL.latestS3StorageId updated for all tournaments');
  }
}

async function sendBatch(requests, tableName) {
  if (DRY_RUN) {
    logger.info(`[DRY_RUN] Would write ${requests.length} items to ${tableName}`);
    return;
  }
  
  const batchWriteParams = {
    RequestItems: {
      [tableName]: requests,
    },
  };

  let unprocessedItems = batchWriteParams.RequestItems;
  let attempt = 0;
  
  while (Object.keys(unprocessedItems).length > 0 && attempt < 5) {
    if (attempt > 0) {
      const itemCount = unprocessedItems[tableName]?.length || 0;
      logger.warn(`Retrying ${itemCount} unprocessed items (attempt ${attempt + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
    
    const batchWriteResult = await ddbDocClient.send(new BatchWriteCommand({ 
      RequestItems: unprocessedItems 
    }));
    
    unprocessedItems = batchWriteResult.UnprocessedItems || {};
    attempt++;
  }

  if (Object.keys(unprocessedItems).length > 0) {
    const itemCount = unprocessedItems[tableName]?.length || 0;
    logger.error(`Failed to process ${itemCount} items after ${attempt} attempts.`);
  } else {
    logger.success(`Wrote batch of ${requests.length} items to ${tableName}`);
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});