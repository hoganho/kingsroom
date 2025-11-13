// clearDevData.js
// This script iterates through a list of DynamoDB tables and deletes ALL items
// within them, leaving the table schemas intact but empty.
//
// ‼️ WARNING: THIS IS A DESTRUCTIVE AND IRREVERSIBLE OPERATION. ‼️
// ‼️ DO NOT RUN THIS ON A PRODUCTION DATABASE. ‼️

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';

// --- CONFIGURATION ---
// Credentials will be read automatically from your environment variables
// (e.g., AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// --- List of Tables to Clear ---
// This list is based on the table names you provided.
const TABLES_TO_CLEAR = [
    'S3Storage-oi5oitkajrgtzm7feellfluriy-dev',
    'ScrapeAttempt-oi5oitkajrgtzm7feellfluriy-dev',
    'ScraperJob-oi5oitkajrgtzm7feellfluriy-dev',
    'ScraperState-oi5oitkajrgtzm7feellfluriy-dev',
    'ScrapeStructure-oi5oitkajrgtzm7feellfluriy-dev',
    'ScrapeURL-oi5oitkajrgtzm7feellfluriy-dev',
];

// --- Logger (copied from your script) ---
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// --- Setup DynamoDB Clients ---
// The SDK automatically detects credentials from environment variables.
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Helper Functions (copied from your script) ---

/**
 * Creates a readline interface to ask the user a question.
 * @param {string} query The question to ask the user.
 * @returns {Promise<string>} The user's answer.
 */
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
 * Fetches the primary key schema for a given DynamoDB table.
 * @param {string} tableName The name of the table.
 * @returns {Promise<{partitionKey: string, sortKey?: string}>} An object with key names.
 */
async function getTableKeys(tableName) {
    const command = new DescribeTableCommand({ TableName: tableName });
    const { Table } = await ddbClient.send(command);
    const keySchema = Table.KeySchema;
    const partitionKey = keySchema.find(k => k.KeyType === 'HASH').AttributeName;
    const sortKeyDef = keySchema.find(k => k.KeyType === 'RANGE');
    const sortKey = sortKeyDef ? sortKeyDef.AttributeName : undefined;
    
    // As per your schema, the primary key is 'id' for all tables.
    // This confirms the logic is sound.
    if (!partitionKey) {
        throw new Error(`Could not find partition key for table ${tableName}`);
    }

    return { partitionKey, sortKey };
}


/**
 * Scans a table and deletes all items in batches.
 * @param {string} tableName The name of the table to clear.
 */
async function clearTableData(tableName) {
  logger.info(`Starting to clear all data from table: ${tableName}`);
  const { partitionKey, sortKey } = await getTableKeys(tableName);

  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      // We only need the key attributes to perform the delete,
      // which is much faster and cheaper (fewer RCUs).
      ProjectionExpression: sortKey ? `${partitionKey}, ${sortKey}` : partitionKey,
    };

    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    if (items.length > 0) {
      // DynamoDB BatchWriteItem can handle up to 25 requests at a time.
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

        const batchWriteParams = {
          RequestItems: {
            [tableName]: deleteRequests,
          },
        };

        // Handle unprocessed items (rare, but good practice)
        let unprocessedItems = batchWriteParams.RequestItems;
        while (Object.keys(unprocessedItems).length > 0) {
            const batchWriteResult = await ddbDocClient.send(new BatchWriteCommand({ RequestItems: unprocessedItems }));
            unprocessedItems = batchWriteResult.UnprocessedItems || {};
            if (Object.keys(unprocessedItems).length > 0) {
                logger.warn(`Retrying ${Object.keys(unprocessedItems[tableName]).length} unprocessed items...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
            }
        }
        
        totalDeleted += batch.length;
        logger.info(`Deleted ${totalDeleted} items from ${tableName}...`);
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

  } while (lastEvaluatedKey);
  
  logger.success(`Successfully deleted all ${totalDeleted} items from ${tableName}.`);
}


/**
 * Main execution function.
 */
async function main() {
  logger.warn('--- KINGSROOM DEV DATABASE CLEARER ---');
  logger.warn('This script will PERMANENTLY DELETE ALL ITEMS from the specified tables.');
  logger.warn('The table structures will remain, but they will be empty.');
  logger.warn('This action is IRREVERSIBLE. Please be absolutely sure.');
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are not found in your environment variables. Aborting.');
    logger.info('Please set them in your terminal before running this script.');
    return;
  }

  console.log('\nThis script will clear all data from the following tables:');
  TABLES_TO_CLEAR.forEach(table => console.log(`- ${table}`));

  const confirmation = await askQuestion('\nType "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  for (const tableName of TABLES_TO_CLEAR) {
    try {
      logger.info(`\nProcessing table: ${tableName}`);
      await clearTableData(tableName);
    } catch (err) {
      logger.error(`An error occurred while processing ${tableName}: ${err.message}`);
      logger.error('Continuing to the next table...');
    }
  }

  logger.success('\nAll specified tables have been processed.');
}

// --- Execute ---
main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});
