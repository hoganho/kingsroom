// backfill-latestS3Key.js
// Backfills the latestS3Key field on ScrapeURL records from their S3Storage records
//
// This script fixes records that were created before latestS3Key was being set.
// It queries S3Storage by URL and updates the corresponding ScrapeURL record.
//
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// --- CONFIGURATION ---
const DRY_RUN = false; // Set to false to actually update records
const SCRAPE_URL_TABLE = 'ScrapeURL-sjyzke3u45golhnttlco6bpcua-dev';
const S3_STORAGE_TABLE = 'S3Storage-sjyzke3u45golhnttlco6bpcua-dev';
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

async function main() {
  logger.warn('========================================');
  logger.warn('  Backfill latestS3Key on ScrapeURL    ');
  logger.warn('========================================');
  
  if (DRY_RUN) {
    logger.warn('*** DRY_RUN IS ENABLED. NO DATA WILL BE WRITTEN. ***');
  } else {
    logger.warn('*** DRY_RUN IS DISABLED. SCRIPT WILL UPDATE DYNAMODB. ***');
  }

  console.log('\n📋 Configuration:');
  console.log(`   ScrapeURL Table:   ${SCRAPE_URL_TABLE}`);
  console.log(`   S3Storage Table:   ${S3_STORAGE_TABLE}`);
  console.log(`   Region:            ${REGION}\n`);

  // Step 1: Scan all ScrapeURL records that are missing latestS3Key
  logger.info('🔍 Step 1: Finding ScrapeURL records missing latestS3Key...\n');

  let scrapeURLs = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: SCRAPE_URL_TABLE,
      FilterExpression: 'attribute_not_exists(latestS3Key) OR latestS3Key = :null',
      ExpressionAttributeValues: { ':null': null },
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    scrapeURLs = scrapeURLs.concat(scanResult.Items || []);
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  logger.success(`Found ${scrapeURLs.length} ScrapeURL records missing latestS3Key\n`);

  if (scrapeURLs.length === 0) {
    logger.success('All ScrapeURL records already have latestS3Key populated!');
    return;
  }

  // Step 2: For each ScrapeURL, find the corresponding S3Storage record
  logger.info('🔍 Step 2: Finding S3Storage records and updating ScrapeURL...\n');

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const scrapeURL of scrapeURLs) {
    const url = scrapeURL.url || scrapeURL.id;
    
    try {
      // Query S3Storage by URL using the byURL index
      const queryResult = await ddbDocClient.send(new QueryCommand({
        TableName: S3_STORAGE_TABLE,
        IndexName: 'byURL',
        KeyConditionExpression: '#url = :url',
        ExpressionAttributeNames: { '#url': 'url' },
        ExpressionAttributeValues: { ':url': url },
        ScanIndexForward: false, // Most recent first
        Limit: 1,
      }));

      if (!queryResult.Items || queryResult.Items.length === 0) {
        logger.warn(`No S3Storage found for: ${url}`);
        notFound++;
        continue;
      }

      const s3Storage = queryResult.Items[0];
      const s3Key = s3Storage.s3Key;

      if (!s3Key) {
        logger.warn(`S3Storage record has no s3Key: ${url}`);
        notFound++;
        continue;
      }

      if (DRY_RUN) {
        logger.info(`[DRY_RUN] Would update ${url}`);
        logger.info(`          latestS3Key → ${s3Key}`);
        updated++;
      } else {
        // Update ScrapeURL with latestS3Key
        await ddbDocClient.send(new UpdateCommand({
          TableName: SCRAPE_URL_TABLE,
          Key: { id: scrapeURL.id },
          UpdateExpression: `
            SET latestS3Key = :s3Key,
                updatedAt = :now,
                #lca = :timestamp,
                #v = if_not_exists(#v, :zero) + :one
          `,
          ExpressionAttributeNames: {
            '#lca': '_lastChangedAt',
            '#v': '_version',
          },
          ExpressionAttributeValues: {
            ':s3Key': s3Key,
            ':now': new Date().toISOString(),
            ':timestamp': Date.now(),
            ':zero': 0,
            ':one': 1,
          },
        }));
        
        logger.success(`Updated ${url} → ${s3Key}`);
        updated++;
      }

    } catch (error) {
      logger.error(`Error processing ${url}: ${error.message}`);
      errors++;
    }
  }

  // Summary
  logger.success('\n========================================');
  logger.success('           COMPLETED                    ');
  logger.success('========================================');
  logger.success(`Total ScrapeURL records processed: ${scrapeURLs.length}`);
  logger.success(`Successfully updated:              ${updated}`);
  logger.warn(`No S3Storage found:                ${notFound}`);
  if (errors > 0) {
    logger.error(`Errors:                            ${errors}`);
  }

  if (DRY_RUN) {
    logger.warn('\n*** DRY_RUN WAS ENABLED. NO DATA WAS WRITTEN. ***');
    logger.info('Review the output above, then set DRY_RUN = false to update data.');
  } else {
    logger.success('\n✅ All records have been updated in DynamoDB.');
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});