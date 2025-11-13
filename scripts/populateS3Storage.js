// populateS3Storage.js
// This script scans an S3 bucket prefix and populates the S3Storage DynamoDB
// table with records for all found objects.
//
// ‼️ WARNING: THIS SCRIPT WRITES DATA TO YOUR DATABASE.
// ‼️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY THE LOGIC.

import { S3Client, paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { v4 as uuidv4 } from 'uuid';

// --- CONFIGURATION ---
// ‼️ UPDATE THESE VALUES TO MATCH YOUR ENVIRONMENT ‼️

// Set to false to perform actual database writes.
const DRY_RUN = false; 

// The S3 bucket where your HTML files are stored.
const S3_BUCKET = 'pokerpro-scraper-storage'; // <-- Updated

// The S3 prefix to scan (e.g., 'public/scrape-data/').
const S3_PREFIX = 'entities/'; // <-- Updated

// The base URL of your site to reconstruct the 'url' field.
const URL_BASE = 'https://kingsroom.com.au/tournament/?id=';

// Your S3Storage DynamoDB table name.
// Verify this name is correct in your AWS console.
const DYNAMODB_TABLE = 'S3Storage-oi5oitkajrgtzm7feellfluriy-dev';

// --- End Configuration ---

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// --- Logger (copied from your script) ---
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// --- Setup DynamoDB Clients ---
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: REGION });

/**
 * Creates a readline interface to ask the user a question.
 * @param {string} query The question to ask the user.
 * @returns {Promise<string>} The user's answer.
 */
function askQuestion(query) {
  // ... (copied from your script)
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
 * ‼️ CRITICAL ‼️ - This function parses your S3 key.
 * You MUST edit this to match your S3 key structure.
 *
 * @param {string} s3Key The S3 object key (e.g., 'public/scrape-data/default/12345-1678886400000.html')
 * @returns {Promise<{entityId: string, tournamentId: number, url: string}> | null}
 */
function parseS3Key(s3Key) {
  // This regex assumes: <PREFIX><entityId>/html/<tournamentId>/<filename>
  // Example: entities/42101695-1332-48e3-963b-3c6ad4e909a0/html/1/2025...html
  // Group 1: ([^/]+)  -> '42101695-1332-48e3-963b-3c6ad4e909a0' (entityId)
  // Group 2: (\\d+)    -> '1' (tournamentId)
  const regex = new RegExp(`^${S3_PREFIX}([^/]+)/html/(\\d+)/.+\\.html$`);
  const match = s3Key.match(regex);

  if (!match) {
    logger.warn(`Could not parse S3 key: ${s3Key}`);
    return null;
  }

  const entityId = match[1];
  const tournamentId = parseInt(match[2], 10);
  const url = `${URL_BASE}${tournamentId}`;

  if (isNaN(tournamentId)) {
    logger.warn(`Parsed non-numeric tournamentId from key: ${s3Key}`);
    return null;
  }

  return { entityId, tournamentId, url };
}

/**
 * Sends a batch of write requests to DynamoDB.
 * @param {Array} requests The array of PutRequest objects.
 */
async function sendBatch(requests) {
  if (DRY_RUN) {
    logger.info(`[DRY_RUN] Would have written ${requests.length} items.`);
    return;
  }
  
  const batchWriteParams = {
    RequestItems: {
      [DYNAMODB_TABLE]: requests,
    },
  };

  let unprocessedItems = batchWriteParams.RequestItems;
  let attempt = 0;
  while (Object.keys(unprocessedItems).length > 0 && attempt < 5) {
    if (attempt > 0) {
        logger.warn(`Retrying ${Object.keys(unprocessedItems[DYNAMODB_TABLE]).length} unprocessed items...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Wait 1s, 2s, ...
    }
    const batchWriteResult = await ddbDocClient.send(new BatchWriteCommand({ RequestItems: unprocessedItems }));
    unprocessedItems = batchWriteResult.UnprocessedItems || {};
    attempt++;
  }

  if (Object.keys(unprocessedItems).length > 0) {
    logger.error(`Failed to process ${Object.keys(unprocessedItems[DYNAMODB_TABLE]).length} items.`);
  } else {
    logger.success(`Successfully wrote batch of ${requests.length} items.`);
  }
}

/**
 * Main execution function.
 */
async function main() {
  logger.warn('--- S3Storage Table Populator ---');
  if (DRY_RUN) {
    logger.warn('*** DRY_RUN IS ENABLED. NO DATA WILL BE WRITTEN. ***');
  } else {
    logger.warn('*** DRY_RUN IS DISABLED. SCRIPT WILL WRITE TO DYNAMODB. ***');
  }
  logger.warn('This script will scan S3 and create new items in DynamoDB.');
  logger.warn('It will NOT delete or overwrite anything, but duplicates are possible if run twice.');
  
  if (!S3_BUCKET || S3_BUCKET === 'your-bucket-name-here') {
     logger.error('Please configure S3_BUCKET in the script. Aborting.');
     return;
  }

  console.log('\nConfiguration:');
  console.log(`- S3 Bucket:       ${S3_BUCKET}`);
  console.log(`- S3 Prefix:       ${S3_PREFIX}`);
  console.log(`- DynamoDB Table:  ${DYNAMODB_TABLE}`);
  console.log(`- URL Base:        ${URL_BASE}`);
  
  const confirmation = await askQuestion('\nType "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  const paginator = paginateListObjectsV2({ client: s3Client }, { 
    Bucket: S3_BUCKET, 
    Prefix: S3_PREFIX 
  });
  
  let batchWriteRequests = [];
  let totalProcessed = 0;

  for await (const page of paginator) {
    const objects = page.Contents || [];

    for (const obj of objects) {
      // Skip "folders" and zero-byte files
      if (obj.Key.endsWith('/') || obj.Size === 0) {
        continue;
      }
      
      const metadata = parseS3Key(obj.Key);
      if (!metadata) {
        continue; // Warning already logged in parseS3Key
      }

      const now = new Date();
      const item = {
        id: uuidv4(),
        s3Key: obj.Key,
        s3Bucket: S3_BUCKET,
        entityId: metadata.entityId,
        tournamentId: metadata.tournamentId,
        url: metadata.url,
        scrapedAt: obj.LastModified.toISOString(),
        contentSize: obj.Size,
        etag: obj.ETag ? obj.ETag.replace(/"/g, '') : null, // S3 ETags are quoted
        lastModified: obj.LastModified.toISOString(),
        dataExtracted: false,
        isManualUpload: false,
        // Amplify system fields
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        _version: 1,
        _lastChangedAt: now.getTime(),
        __typename: 'S3Storage',
      };

      if (DRY_RUN) {
        logger.info(`[DRY_RUN] Would create item for key: ${item.s3Key}`);
        console.log(JSON.stringify(item, null, 2));
      }

      batchWriteRequests.push({ PutRequest: { Item: item } });
      totalProcessed++;

      // Send batch when it's full
      if (batchWriteRequests.length === 25) {
        await sendBatch(batchWriteRequests);
        batchWriteRequests = []; // Clear the batch
      }
    }
  }

  // Send any remaining items
  if (batchWriteRequests.length > 0) {
    await sendBatch(batchWriteRequests);
  }

  logger.success(`\n--- COMPLETED ---`);
  logger.success(`Total S3 objects processed: ${totalProcessed}`);
  if (DRY_RUN) {
    logger.warn('*** DRY_RUN WAS ENABLED. NO DATA WAS WRITTEN. ***');
  } else {
    logger.success('All items have been written to DynamoDB.');
  }
}

// --- Execute ---
main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});