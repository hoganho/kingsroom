// backupAllDynamoTables-csv-timestamped.js
// This script enumerates DynamoDB tables in a region, scans ALL items
// from each selected table, and saves the data to a local CSV file per table.
// All CSV files are saved into a single, timestamped directory.
//
// ⚠️ WARNING: This performs full table scans and may incur RCU costs.

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Output directory - saves outside project root to ../Data
const DATA_OUTPUT_DIR = process.env.DATA_OUTPUT_DIR || '../../Data';

// Optional filters (recommended)
// - ENV_SUFFIX: only tables ending with "-dev" (default "dev")
// - API_ID_FILTER: only tables containing this amplify apiId (e.g. "fosb7ek5argnhctz4odpt52eia")
// - TABLE_PREFIX_FILTER: only tables starting with a string (rarely needed)
const ENV_SUFFIX = process.env.ENV_SUFFIX || 'dev';
const API_ID_FILTER = process.env.API_ID_FILTER || 'ht3nugt6lvddpeeuwj3x6mkite'; // e.g. fosb7ek5argnhctz4odpt52eia
const TABLE_PREFIX_FILTER = process.env.TABLE_PREFIX_FILTER || ''; // e.g. "Game-"

// If set to 1, we don't scan or write files; we just print which tables would be backed up.
const DRY_RUN = process.env.DRY_RUN === '1';

// For large tables, you might want to limit scan page size
// (smaller = gentler on RCUs, but slower)
const SCAN_PAGE_LIMIT = Number(process.env.SCAN_PAGE_LIMIT || 0); // 0 = default (SDK chooses)

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
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

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

function sanitizeCell(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object' || Array.isArray(value)) {
    value = JSON.stringify(value);
  }

  let strValue = String(value);
  strValue = strValue.replace(/"/g, '""');

  if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
    strValue = `"${strValue}"`;
  }

  return strValue;
}

function convertToCsv(items) {
  if (items.length === 0) return '';

  const allKeys = new Set();
  items.forEach((item) => {
    Object.keys(item).forEach((key) => allKeys.add(key));
  });

  const headers = Array.from(allKeys);
  const headerRow = headers.map(sanitizeCell).join(',');

  const dataRows = items.map((item) =>
    headers.map((h) => sanitizeCell(item[h])).join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

function makeTimestampedDirName(prefix = 'dbbackup') {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${timestamp}`;
}

function tableMatchesFilters(tableName) {
  // If user wants only "-dev" etc
  if (ENV_SUFFIX && !tableName.endsWith(`-${ENV_SUFFIX}`)) return false;

  // If user wants only tables for a given amplify apiId
  if (API_ID_FILTER && !tableName.includes(API_ID_FILTER)) return false;

  // Optional prefix filter
  if (TABLE_PREFIX_FILTER && !tableName.startsWith(TABLE_PREFIX_FILTER)) return false;

  return true;
}

// ------------------------------------------------------------------
// DISCOVER TABLES
// ------------------------------------------------------------------

async function listAllTables() {
  const allTables = [];
  let lastEvaluatedTableName = undefined;

  do {
    const resp = await ddbClient.send(
      new ListTablesCommand({
        ExclusiveStartTableName: lastEvaluatedTableName,
      })
    );

    const names = resp.TableNames || [];
    allTables.push(...names);

    lastEvaluatedTableName = resp.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);

  return allTables;
}

async function getTablesToBackup() {
  const tables = await listAllTables();
  return tables.filter(tableMatchesFilters).sort();
}

// ------------------------------------------------------------------
// BACKUP ONE TABLE
// ------------------------------------------------------------------

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

    if (SCAN_PAGE_LIMIT > 0) {
      scanParams.Limit = SCAN_PAGE_LIMIT;
    }

    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    if (items.length > 0) {
      allTableItems.push(...items);
      totalScanned += items.length;
      logger.info(`Scanned ${totalScanned} items from ${tableName}...`);
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (allTableItems.length === 0) {
    logger.info(`Table ${tableName} is empty. No backup file created.`);
    return;
  }

  const fileName = path.join(backupDir, `${tableName}.csv`);

  const csvData = convertToCsv(allTableItems);
  await fs.writeFile(fileName, csvData);
  logger.success(`Saved ${allTableItems.length} items from ${tableName} → ${fileName}`);
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  logger.info('--- DYNAMODB DATABASE BACKUP SCRIPT (CSV) ---');
  logger.info('This script will discover tables dynamically and back them up.');
  logger.warn('This performs full table scans and may incur RCU costs.');

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables. Aborting.');
    logger.info('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use an AWS profile via the SDK default chain.');
    return;
  }

  logger.info(`Region: ${REGION}`);
  logger.info(`Output Directory: ${DATA_OUTPUT_DIR}`);
  logger.info(`Filters: ENV_SUFFIX="${ENV_SUFFIX}", API_ID_FILTER="${API_ID_FILTER || '(none)'}", TABLE_PREFIX_FILTER="${TABLE_PREFIX_FILTER || '(none)'}"`);

  const TABLES_TO_BACKUP = await getTablesToBackup();

  if (TABLES_TO_BACKUP.length === 0) {
    logger.warn('No tables matched your filters. Nothing to back up.');
    logger.info('Tip: try running with ENV_SUFFIX="" to include all tables, or set API_ID_FILTER correctly.');
    return;
  }

  console.log(`\nThis script will back up all data from the following ${TABLES_TO_BACKUP.length} tables:`);
  TABLES_TO_BACKUP.forEach((t) => console.log(`- ${t}`));

  if (DRY_RUN) {
    logger.warn('\nDRY_RUN=1 set, so no scans or files will be created.');
    return;
  }

  const confirmation = await askQuestion('\nType "backup" to continue: ');
  if (confirmation.toLowerCase() !== 'backup') {
    logger.info('Aborted by user.');
    return;
  }

  // Create timestamped backup directory inside DATA_OUTPUT_DIR
  const backupDirName = makeTimestampedDirName('dbbackup');
  const fullBackupPath = path.join(DATA_OUTPUT_DIR, backupDirName);
  
  try {
    // Ensure parent Data directory exists
    await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true });
    // Create the timestamped backup subdirectory
    await fs.mkdir(fullBackupPath, { recursive: true });
    logger.info(`Saving backups to directory: ${fullBackupPath}`);
  } catch (mkdirErr) {
    logger.error(`Failed to create backup directory ${fullBackupPath}: ${mkdirErr.message}`);
    return;
  }

  for (const tableName of TABLES_TO_BACKUP) {
    try {
      logger.info(`\nProcessing table: ${tableName}`);
      await backupTableData(tableName, fullBackupPath);
    } catch (err) {
      logger.error(`Error while processing ${tableName}: ${err.message}`);
      logger.error('Continuing to the next table...');
    }
  }

  logger.success('\nAll matched tables have been processed.');
  logger.success(`Backup data is located in: ${fullBackupPath}`);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});
