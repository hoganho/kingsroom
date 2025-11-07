// backupDevData-csv-timestamped.js
// This script iterates through a list of DynamoDB tables, scans ALL items
// from each one, and saves the data to a local CSV file per table.
// All CSV files are saved into a single, timestamped directory.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs'; // Node.js File System module
import * as path from 'path'; // Node.js Path module for joining paths

// --- CONFIGURATION ---
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// --- List of Tables to Backup ---
const TABLES_TO_BACKUP = [
  'Game-oi5oitkajrgtzm7feellfluriy-dev',
  'Player-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerCredits-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerEntry-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerPoints-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerResult-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerSummary-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerTicket-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerTransaction-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerVenue-oi5oitkajrgtzm7feellfluriy-dev',
  'ScraperState-oi5oitkajrgtzm7feellfluriy-dev',
  'ScrapeAttempt-oi5oitkajrgtzm7feellfluriy-dev',
  'ScraperJob-oi5oitkajrgtzm7feellfluriy-dev',
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
const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// --- Helper Functions ---

/**
 * Creates a readline interface to ask the user a question.
 * (Copied from your script)
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
 * Sanitizes a value for CSV export.
 * Handles nulls, objects/arrays, and strings with commas/quotes.
 * @param {*} value The value to sanitize.
 * @returns {string} A CSV-safe string.
 */
function sanitizeCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' || Array.isArray(value)) {
    value = JSON.stringify(value);
  }
  let strValue = String(value);
  strValue = strValue.replace(/"/g, '""');
  if (
    strValue.includes(',') ||
    strValue.includes('\n') ||
    strValue.includes('"')
  ) {
    strValue = `"${strValue}"`;
  }
  return strValue;
}

/**
 * Converts an array of DynamoDB items (JS objects) into a CSV string.
 * @param {Object[]} items Array of items from DynamoDB.
 * @returns {string} A CSV-formatted string.
 */
function convertToCsv(items) {
  if (items.length === 0) {
    return '';
  }
  const allKeys = new Set();
  items.forEach((item) => {
    Object.keys(item).forEach((key) => allKeys.add(key));
  });
  const headers = Array.from(allKeys);
  const headerRow = headers.map(sanitizeCell).join(',');
  const dataRows = items.map((item) => {
    return headers
      .map((header) => {
        return sanitizeCell(item[header]);
      })
      .join(',');
  });
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Scans a table and saves all items to a CSV file inside the backup directory.
 * @param {string} tableName The name of the table to back up.
 * @param {string} backupDir The timestamped directory to save the file in.
 */
async function backupTableData(tableName, backupDir) {
  logger.info(`Starting to back up all data from table: ${tableName}`);

  let lastEvaluatedKey = undefined;
  const allTableItems = [];
  let totalScanned = 0;

  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    if (items.length > 0) {
      allTableItems.push(...items);
      totalScanned += items.length;
      logger.info(`Scanned ${totalScanned} items from ${tableName}...`);
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (allTableItems.length > 0) {
    const baseFileName = `${tableName}.csv`;
    // Join the directory path and the filename
    const fileName = path.join(backupDir, baseFileName);

    try {
      const csvData = convertToCsv(allTableItems);
      await fs.writeFile(fileName, csvData);
      logger.success(
        `Successfully saved ${allTableItems.length} items from ${tableName} to ${fileName}`
      );
    } catch (writeErr) {
      logger.error(
        `Failed to write backup file ${fileName}: ${writeErr.message}`
      );
    }
  } else {
    logger.info(`Table ${tableName} is empty. No backup file created.`);
  }
}

/**
 * Main execution function.
 */
async function main() {
  logger.info('--- KINGSROOM DEV DATABASE BACKUP SCRIPT (CSV) ---');
  logger.info(
    'This script will scan and save ALL items from the specified tables to CSV files.'
  );
  logger.info('All files will be saved in a new, timestamped directory.');
  logger.warn(
    'This will perform a full scan on all tables and may incur RCU costs.'
  );

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error(
      'AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are not found in your environment variables. Aborting.'
    );
    logger.info('Please set them in your terminal before running this script.');
    return;
  }

  console.log('\nThis script will back up all data from the following tables:');
  TABLES_TO_BACKUP.forEach((table) => console.log(`- ${table}`));

  const confirmation = await askQuestion('\nType "backup" to continue: ');
  if (confirmation.toLowerCase() !== 'backup') {
    logger.info('Aborted by user.');
    return;
  }

  // --- Create timestamped backup directory ---
  const now = new Date();
  const pad = (num) => num.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const backupDirName = `backup_${timestamp}`;

  try {
    // recursive: true ensures it doesn't error if the path (or parts) already exists
    await fs.mkdir(backupDirName, { recursive: true });
    logger.info(`Saving backups to directory: ./${backupDirName}`);
  } catch (mkdirErr) {
    logger.error(
      `Failed to create backup directory ${backupDirName}: ${mkdirErr.message}`
    );
    return; // Stop if we can't create the directory
  }
  // -------------------------------------------

  for (const tableName of TABLES_TO_BACKUP) {
    try {
      logger.info(`\nProcessing table: ${tableName}`);
      // Pass the new directory name to the backup function
      await backupTableData(tableName, backupDirName);
    } catch (err) {
      logger.error(
        `An error occurred while processing ${tableName}: ${err.message}`
      );
      logger.error('Continuing to the next table...');
    }
  }

  logger.success('\nAll specified tables have been processed.');
  logger.success(`Backup data is located in: ./${backupDirName}`);
}

// --- Execute ---
main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});