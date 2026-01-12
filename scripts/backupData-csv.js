// backupData-csv.js
// This script prompts for environment (dev or prod), then enumerates DynamoDB tables,
// scans ALL items from each selected table, and saves the data to local CSV files.
// All CSV files are saved into a single, timestamped directory.
//
// ⚠️ WARNING: This performs full table scans and may incur RCU costs.

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
    BACKUP_PREFIX: 'devbackup',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
    BACKUP_PREFIX: 'prodbackup',
  },
};

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Output directory - saves outside project root to ../Data
const DATA_OUTPUT_DIR = process.env.DATA_OUTPUT_DIR || '../../Data';

// For large tables, you might want to limit scan page size
// (smaller = gentler on RCUs, but slower)
const SCAN_PAGE_LIMIT = Number(process.env.SCAN_PAGE_LIMIT || 0); // 0 = default (SDK chooses)

// If set to 1, we don't scan or write files; we just print which tables would be backed up.
const DRY_RUN = process.env.DRY_RUN === '1';

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

let SELECTED_ENV = null;

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

function makeTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function makeTimestampedDirName(prefix, timestamp) {
  return `${prefix}_${timestamp}`;
}

function tableMatchesFilters(tableName) {
  const config = ENVIRONMENTS[SELECTED_ENV];
  
  // Must end with the environment suffix
  if (!tableName.endsWith(`-${config.ENV_SUFFIX}`)) return false;

  // Must contain the API ID
  if (!tableName.includes(config.API_ID)) return false;

  // Comment out to search all tables
  if (!tableName.includes("Snapshot-")) return false;

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

async function backupTableData(tableName, backupDir, timestamp) {
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

  const fileName = path.join(backupDir, `${tableName}_${timestamp}.csv`);

  const csvData = convertToCsv(allTableItems);
  await fs.writeFile(fileName, csvData);
  logger.success(`Saved ${allTableItems.length} items from ${tableName} → ${fileName}`);
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    DYNAMODB BACKUP SCRIPT                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    logger.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  const config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`Environment suffix: ${config.ENV_SUFFIX}`);
  console.log('─'.repeat(70) + '\n');

  if (SELECTED_ENV === 'prod') {
    logger.warn('⚠️  You are about to backup PRODUCTION data!');
    const confirm = await askQuestion('Type "prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  logger.warn('This performs full table scans and may incur RCU costs.');

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables. Aborting.');
    logger.info('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or use an AWS profile via the SDK default chain.');
    return;
  }

  logger.info(`Region: ${REGION}`);
  logger.info(`Output Directory: ${DATA_OUTPUT_DIR}`);

  const TABLES_TO_BACKUP = await getTablesToBackup();

  if (TABLES_TO_BACKUP.length === 0) {
    logger.warn('No tables matched your filters. Nothing to back up.');
    return;
  }

  console.log(`\nThis script will back up all data from the following ${TABLES_TO_BACKUP.length} tables:`);
  TABLES_TO_BACKUP.forEach((t) => console.log(`  - ${t}`));

  if (DRY_RUN) {
    logger.warn('\nDRY_RUN=1 set, so no scans or files will be created.');
    return;
  }

  const confirmation = await askQuestion('\nType "backup" to continue: ');
  if (confirmation.toLowerCase() !== 'backup') {
    logger.info('Aborted by user.');
    return;
  }

  // Generate timestamp once for consistent naming across directory and files
  const timestamp = makeTimestamp();

  // Create timestamped backup directory inside DATA_OUTPUT_DIR
  const backupDirName = makeTimestampedDirName(config.BACKUP_PREFIX, timestamp);
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
      await backupTableData(tableName, fullBackupPath, timestamp);
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
