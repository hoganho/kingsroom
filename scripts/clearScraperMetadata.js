// clearScraperMetadata.js
// ================================================================
// Clears scraper metadata tables while PRESERVING S3Storage
// ================================================================
//
// Tables CLEARED:
//   - ScrapeAttempt
//   - ScraperJob
//   - ScraperState  
//   - ScrapeStructure
//   - ScrapeURL
//
// Tables PRESERVED:
//   - S3Storage (so we know what HTML is cached in S3)
//
// ⚠️ WARNING: THIS DELETES DATA AND IS IRREVERSIBLE.
// ⚠️ RUN WITH `DRY_RUN = true` FIRST TO VERIFY.

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';

// ================================================================
// CONFIGURATION
// ================================================================
const CONFIG = {
  // Set to false to actually delete data
  DRY_RUN: false,
  
  // Tables to clear (order: children first, parents last)
  TABLES_TO_CLEAR: [
    'ScrapeAttempt-ht3nugt6lvddpeeuwj3x6mkite-dev',
    'ScraperJob-ht3nugt6lvddpeeuwj3x6mkite-dev',
    'ScraperState-ht3nugt6lvddpeeuwj3x6mkite-dev',
    'ScrapeStructure-ht3nugt6lvddpeeuwj3x6mkite-dev',
    'ScrapeURL-ht3nugt6lvddpeeuwj3x6mkite-dev',
  ],
  
  // NOTE: S3Storage is intentionally NOT in this list
  // 'S3Storage-ht3nugt6lvddpeeuwj3x6mkite-dev' - PRESERVED
  
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
};

// ================================================================
// SETUP CLIENTS
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

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

async function getTableKeys(tableName) {
  const command = new DescribeTableCommand({ TableName: tableName });
  const { Table } = await ddbClient.send(command);
  const keySchema = Table.KeySchema;
  const partitionKey = keySchema.find(k => k.KeyType === 'HASH').AttributeName;
  const sortKeyDef = keySchema.find(k => k.KeyType === 'RANGE');
  const sortKey = sortKeyDef ? sortKeyDef.AttributeName : undefined;
  
  return { partitionKey, sortKey };
}

async function getTableItemCount(tableName) {
  let count = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      Select: 'COUNT',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    count += scanResult.Count || 0;
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  return count;
}

async function clearTableData(tableName) {
  logger.info(`Clearing table: ${tableName}`);
  
  if (CONFIG.DRY_RUN) {
    const count = await getTableItemCount(tableName);
    logger.info(`[DRY_RUN] Would delete ${count} items from ${tableName}`);
    return count;
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
      
      process.stdout.write(`\r  Deleted ${totalDeleted} items...`);
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  console.log(); // New line after progress
  logger.success(`Cleared ${totalDeleted} items from ${tableName}`);
  return totalDeleted;
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  CLEAR SCRAPER METADATA TABLES');
  console.log('  (S3Storage will be PRESERVED)');
  console.log('='.repeat(60) + '\n');
  
  if (CONFIG.DRY_RUN) {
    logger.warn('DRY_RUN MODE - No data will be deleted');
  } else {
    logger.warn('LIVE MODE - Data WILL be permanently deleted!');
  }
  
  console.log('\nTables to CLEAR:');
  for (const table of CONFIG.TABLES_TO_CLEAR) {
    const shortName = table.split('-')[0];
    console.log(`  ❌ ${shortName}`);
  }
  
  console.log('\nTables PRESERVED:');
  console.log('  ✅ S3Storage (HTML cache references)');
  
  // Get counts
  console.log('\n' + '-'.repeat(60));
  console.log('Checking item counts...\n');
  
  const counts = {};
  for (const tableName of CONFIG.TABLES_TO_CLEAR) {
    const count = await getTableItemCount(tableName);
    const shortName = tableName.split('-')[0];
    counts[tableName] = count;
    console.log(`  ${shortName}: ${count.toLocaleString()} items`);
  }
  
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n  TOTAL: ${totalItems.toLocaleString()} items to delete`);
  
  if (totalItems === 0) {
    logger.info('All tables are already empty. Nothing to do.');
    return;
  }
  
  // Confirmation
  console.log('\n' + '-'.repeat(60));
  
  if (!CONFIG.DRY_RUN) {
    const answer = await askQuestion('\nType "DELETE" to confirm deletion: ');
    if (answer !== 'DELETE') {
      logger.info('Aborted by user.');
      process.exit(0);
    }
  }
  
  // Clear tables
  console.log('\n' + '-'.repeat(60));
  console.log('Clearing tables...\n');
  
  let grandTotal = 0;
  for (const tableName of CONFIG.TABLES_TO_CLEAR) {
    const deleted = await clearTableData(tableName);
    grandTotal += deleted;
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  if (CONFIG.DRY_RUN) {
    logger.success(`DRY RUN complete. Would have deleted ${grandTotal.toLocaleString()} items.`);
    logger.info('Set DRY_RUN = false to actually delete.');
  } else {
    logger.success(`Deleted ${grandTotal.toLocaleString()} items total.`);
    logger.success('S3Storage preserved - cached HTML references intact.');
  }
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  logger.error(`Script failed: ${err.message}`);
  console.error(err);
  process.exit(1);
});
