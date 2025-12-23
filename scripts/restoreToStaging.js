// restoreToStaging.js
// This script reads CSV backup files and restores them to DynamoDB tables
// with a different API ID suffix (for migrating between Amplify environments).
//
// ⚠️ WARNING: This performs batch writes and may incur WCU costs.

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Source: your backup directory (e.g., "backup_2024-01-15_1430")
const BACKUP_DIR = process.env.BACKUP_DIR || '';

// API ID mapping
const OLD_API_ID = process.env.OLD_API_ID || 'fosb7ek5argnhctz4odpt52eia';
const NEW_API_ID = process.env.NEW_API_ID || 'fosb7ek5argnhctz4odpt52eia';

const OLD_ENV = process.env.OLD_ENV || 'dev';
const NEW_ENV = process.env.NEW_ENV || 'staging';

// If set to 1, we don't write anything; we just print what would happen.
const DRY_RUN = process.env.DRY_RUN === '0';

// Batch write size (max 25 for DynamoDB)
const BATCH_SIZE = 25;

// Only restore these tables (model names without suffix)
const TABLES_TO_RESTORE = [
  'SocialAccount',
  'SocialPost',
];

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENTS
// ------------------------------------------------------------------

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

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

function parseCSVValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  
  // Try to parse as JSON (for objects/arrays)
  if ((value.startsWith('{') && value.endsWith('}')) || 
      (value.startsWith('[') && value.endsWith(']'))) {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  
  // Try to parse as number (but not UUIDs or IDs that look like numbers)
  if (/^-?\d+$/.test(value) && value.length < 15) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num <= Number.MAX_SAFE_INTEGER && num >= Number.MIN_SAFE_INTEGER) {
      return num;
    }
  }
  
  if (/^-?\d+\.\d+$/.test(value) && value.length < 15) {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      return num;
    }
  }
  
  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  return value;
}

function parseCSV(csvContent) {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // We'll handle type conversion ourselves
  });
  
  if (result.errors && result.errors.length > 0) {
    logger.warn(`CSV parsing had ${result.errors.length} errors`);
    // Log first few errors
    result.errors.slice(0, 3).forEach(err => {
      logger.warn(`  Row ${err.row}: ${err.message}`);
    });
  }
  
  // Convert values and filter out empty/null keys
  const items = result.data.map(row => {
    const item = {};
    for (const [key, value] of Object.entries(row)) {
      if (key && key.trim()) {
        const parsedValue = parseCSVValue(value);
        if (parsedValue !== null && parsedValue !== '') {
          item[key] = parsedValue;
        }
      }
    }
    return item;
  }).filter(item => Object.keys(item).length > 0);
  
  return items;
}

function getNewTableName(oldTableName) {
  // Game-fosb7ek5argnhctz4odpt52eia-staging -> Game-fosb7ek5argnhctz4odpt52eia-staging
  const modelName = oldTableName.replace(`-${OLD_API_ID}-${OLD_ENV}`, '');
  return `${modelName}-${NEW_API_ID}-${NEW_ENV}`;
}

async function tableExists(tableName) {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      return false;
    }
    throw err;
  }
}

// ------------------------------------------------------------------
// BATCH WRITE WITH RETRY
// ------------------------------------------------------------------

async function batchWriteWithRetry(tableName, items, maxRetries = 5) {
  let unprocessed = items;
  let retries = 0;
  let totalWritten = 0;
  
  while (unprocessed.length > 0 && retries < maxRetries) {
    const batch = unprocessed.slice(0, BATCH_SIZE);
    unprocessed = unprocessed.slice(BATCH_SIZE);
    
    const putRequests = batch.map(item => ({
      PutRequest: { Item: item }
    }));
    
    try {
      const result = await ddbDocClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: putRequests
        }
      }));
      
      totalWritten += batch.length;
      
      // Handle unprocessed items
      if (result.UnprocessedItems && result.UnprocessedItems[tableName]) {
        const unprocessedItems = result.UnprocessedItems[tableName]
          .map(req => req.PutRequest.Item);
        unprocessed = [...unprocessedItems, ...unprocessed];
        retries++;
        
        // Exponential backoff
        const delay = Math.pow(2, retries) * 100;
        logger.warn(`Retrying ${unprocessedItems.length} unprocessed items after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      logger.error(`Batch write error: ${err.message}`);
      retries++;
      unprocessed = [...batch, ...unprocessed];
      
      const delay = Math.pow(2, retries) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  if (unprocessed.length > 0) {
    logger.error(`Failed to write ${unprocessed.length} items after ${maxRetries} retries`);
  }
  
  return totalWritten;
}

// ------------------------------------------------------------------
// RESTORE ONE TABLE
// ------------------------------------------------------------------

async function restoreTable(csvFilePath, backupDir) {
  const fileName = path.basename(csvFilePath, '.csv');
  const oldTableName = fileName;
  const newTableName = getNewTableName(oldTableName);
  
  logger.info(`\nProcessing: ${oldTableName}`);
  logger.info(`  Target: ${newTableName}`);
  
  // Check if target table exists
  const exists = await tableExists(newTableName);
  if (!exists) {
    logger.error(`  Target table does not exist: ${newTableName}`);
    return { table: oldTableName, items: 0, success: false };
  }
  
  // Read and parse CSV
  const csvContent = await fs.readFile(csvFilePath, 'utf-8');
  const items = parseCSV(csvContent);
  
  logger.info(`  Found ${items.length} items in backup`);
  
  if (items.length === 0) {
    logger.info(`  Skipping (no items)`);
    return { table: oldTableName, items: 0, success: true };
  }
  
  if (DRY_RUN) {
    logger.success(`  [DRY RUN] Would restore ${items.length} items`);
    return { table: oldTableName, items: items.length, success: true };
  }
  
  // Write to new table
  logger.info(`  Writing to ${newTableName}...`);
  const written = await batchWriteWithRetry(newTableName, items);
  
  logger.success(`  Restored ${written} items`);
  return { table: oldTableName, items: written, success: true };
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  logger.info('--- DYNAMODB RESTORE/MIGRATE SCRIPT ---');
  logger.info('This script restores CSV backups to new Amplify environment tables.');
  logger.warn('This performs batch writes and may incur WCU costs.');
  
  if (!BACKUP_DIR) {
    logger.error('BACKUP_DIR environment variable not set.');
    logger.info('Usage: BACKUP_DIR=backup_2024-01-15_1430 node restoreToStaging.js');
    return;
  }
  
  // Check backup directory exists
  try {
    await fs.access(BACKUP_DIR);
  } catch (err) {
    logger.error(`Backup directory not found: ${BACKUP_DIR}`);
    return;
  }
  
  logger.info(`\nConfiguration:`);
  logger.info(`  Backup directory: ${BACKUP_DIR}`);
  logger.info(`  Old API ID: ${OLD_API_ID}-${OLD_ENV}`);
  logger.info(`  New API ID: ${NEW_API_ID}-${NEW_ENV}`);
  logger.info(`  Region: ${REGION}`);
  logger.info(`  Dry run: ${DRY_RUN}`);
  logger.info(`  Tables to restore: ${TABLES_TO_RESTORE.join(', ')}`);
  
  // Find all CSV files in backup directory
  const files = await fs.readdir(BACKUP_DIR);
  const csvFiles = files
    .filter(f => f.endsWith('.csv'))
    .filter(f => {
      // Extract model name from filename (e.g., "Entity-fosb7ek5argnhctz4odpt52eia-staging.csv" -> "Entity")
      const tableName = f.replace('.csv', '');
      const modelName = tableName.replace(`-${OLD_API_ID}-${OLD_ENV}`, '');
      return TABLES_TO_RESTORE.includes(modelName);
    })
    .sort();
  
  if (csvFiles.length === 0) {
    logger.warn('No CSV files found in backup directory.');
    return;
  }
  
  logger.info(`\nFound ${csvFiles.length} CSV files to restore:`);
  csvFiles.forEach(f => {
    const oldName = f.replace('.csv', '');
    const newName = getNewTableName(oldName);
    console.log(`  ${oldName} → ${newName}`);
  });
  
  if (!DRY_RUN) {
    const confirmation = await askQuestion('\nType "restore" to continue: ');
    if (confirmation.toLowerCase() !== 'restore') {
      logger.info('Aborted by user.');
      return;
    }
  }
  
  // Process each CSV file
  const results = [];
  for (const csvFile of csvFiles) {
    try {
      const result = await restoreTable(path.join(BACKUP_DIR, csvFile), BACKUP_DIR);
      results.push(result);
    } catch (err) {
      logger.error(`Error processing ${csvFile}: ${err.message}`);
      results.push({ table: csvFile, items: 0, success: false });
    }
  }
  
  // Summary
  logger.info('\n' + '='.repeat(60));
  logger.info('RESTORE SUMMARY');
  logger.info('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalItems = results.reduce((sum, r) => sum + r.items, 0);
  
  logger.info(`Tables processed: ${results.length}`);
  logger.info(`  Successful: ${successful.length}`);
  logger.info(`  Failed: ${failed.length}`);
  logger.info(`Total items restored: ${totalItems}`);
  
  if (failed.length > 0) {
    logger.warn('\nFailed tables:');
    failed.forEach(r => console.log(`  - ${r.table}`));
  }
  
  if (DRY_RUN) {
    logger.info('\nThis was a dry run. Run without DRY_RUN=1 to perform actual restore.');
  } else {
    logger.success('\nRestore complete!');
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err);
  process.exit(1);
});