#!/usr/bin/env node
// ============================================================================
// KINGSROOM PRODUCTION CLEANUP SCRIPT
// ============================================================================
// Consolidated script that combines all cleanup functionality for PRODUCTION.
// Adapted from dev cleanup scripts:
//   - backupDevData-csv-timestamped.js
//   - clearDevData.js
//   - clearDevData-social-enhanced.js
//   - clearScraperMetadata.js
//   - backupThenClearCloudwatchLogs_perStream.js
//   - listAndDeleteCloudwatchLogs.js
//
// ⚠️⚠️⚠️ WARNING: THIS IS FOR PRODUCTION DATA ⚠️⚠️⚠️
// ⚠️⚠️⚠️ ALL OPERATIONS ARE IRREVERSIBLE ⚠️⚠️⚠️
//
// USAGE:
//   node cleanupProdData.js [options]
//
// OPTIONS:
//   --dry-run              Preview changes without executing (RECOMMENDED FIRST)
//   --backup-only          Only backup data (no deletion)
//   --skip-backup          Skip CSV backup step
//   --skip-core            Skip clearing core data tables
//   --skip-social          Skip clearing social data tables
//   --skip-scraper         Skip clearing scraper metadata
//   --skip-logs            Skip CloudWatch log cleanup
//   --delete-s3-media      Also delete S3 media files (social posts)
//   --delete-templates     Also delete auto-created TicketTemplates
//   --auto                 Skip confirmation prompts (DANGEROUS!)
//   --help                 Show this help message
//
// ENVIRONMENT VARIABLES:
//   AWS_REGION             AWS region (default: ap-southeast-2)
//   AWS_ACCESS_KEY_ID      Required for AWS access
//   AWS_SECRET_ACCESS_KEY  Required for AWS access
//   DATA_OUTPUT_DIR        Output directory for backups (default: ../../Data)
//
// ============================================================================

import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ============================================================================
// PRODUCTION CONFIGURATION
// ============================================================================

const CONFIG = {
  // AWS Region
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  
  // PRODUCTION Amplify API ID
  API_ID: 'ynuahifnznb5zddz727oiqnicy',
  
  // Environment suffix
  ENV_SUFFIX: 'prod',
  
  // Output directory for backups
  DATA_OUTPUT_DIR: process.env.DATA_OUTPUT_DIR || '../../Data',
  
  // S3 Configuration
  S3_BUCKET: 'kingsroom-storage-prod',
  
  // Batch settings
  SCAN_PAGE_LIMIT: 0, // 0 = SDK default
  BATCH_SIZE: 25,
  
  // Rate limiting delays (ms)
  RATE_LIMIT_DELAY: 100,
};

// Helper to get full table name
const getTableName = (modelName) => `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;

// ============================================================================
// TABLE DEFINITIONS
// ============================================================================

// Core data tables (Game, Player, etc.)
const CORE_TABLES = [
  'Game',
  'GameCost',
  'GameFinancialSnapshot',
  'Player',
  'PlayerCredits',
  'PlayerEntry',
  'PlayerMarketingMessage',
  'PlayerMarketingPreferences',
  'PlayerPoints',
  'PlayerResult',
  'PlayerSummary',
  'PlayerTicket',
  'PlayerTransaction',
  'PlayerVenue',
  'UserAuditLog',
  'VenueDetails',
  'EntityMetrics',
  'RecurringGameMetrics',
  'VenueMetrics',
  'TournamentSeriesMetrics',
].map(getTableName);

// Social data tables
const SOCIAL_TABLES = [
  'SocialScheduledPost',
  'SocialScrapeAttempt',
  'SocialPostGameData',
  'SocialPostGameLink',
  'SocialPostPlacement',
].map(getTableName);

// Scraper metadata tables (S3Storage intentionally excluded)
const SCRAPER_TABLES = [
  'ScrapeAttempt',
  'ScraperJob',
  'ScraperState',
  'ScrapeStructure',
  'ScrapeURL',
].map(getTableName);

// Reference data tables (from migrate-to-prod.cjs)
const REFERENCE_TABLES = [
  'Entity',
  'TournamentSeriesTitle',
  'SocialAccount',
  'TournamentSeries',
  'Venue',
].map(getTableName);

// Related tables for cascade operations
const CASCADE_TABLES = {
  GAME: getTableName('Game'),
  PLAYER_TICKET: getTableName('PlayerTicket'),
  TICKET_TEMPLATE: getTableName('TicketTemplate'),
  SOCIAL_ACCOUNT: getTableName('SocialAccount'),
};

// Fields to reset on Game records during social cleanup
const GAME_RESET_FIELDS = {
  linkedSocialPostCount: 0,
  hasLinkedSocialPosts: false,
  primaryResultPostId: null,
  socialDataAggregation: null,
  socialDataAggregatedAt: null,
  ticketsAwardedCount: 0,
  ticketProgramName: null,
};

// ============================================================================
// LOGGER
// ============================================================================

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  debug: (msg) => console.log(`[DEBUG] 🔍 ${msg}`),
  step: (n, total, msg) => console.log(`\n[STEP ${n}/${total}] ${msg}`),
};

// ============================================================================
// AWS CLIENTS
// ============================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const cwClient = new CloudWatchLogsClient({ region: CONFIG.REGION });
const s3Client = new S3Client({ region: CONFIG.REGION });

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  items.forEach((item) => Object.keys(item).forEach((key) => allKeys.add(key)));
  const headers = Array.from(allKeys);
  const headerRow = headers.map(sanitizeCell).join(',');
  const dataRows = items.map((item) =>
    headers.map((h) => sanitizeCell(item[h])).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

function makeTimestampedDirName(prefix = 'prodbackup') {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${timestamp}`;
}

function sanitizeFilename(name) {
  return name.replace(/[\/:\$\[\]]/g, '_');
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'NO_TIMESTAMP';
  const d = new Date(timestamp);
  const pad = (num) => num.toString().padStart(2, '0');
  return (
    `${pad(d.getUTCFullYear() % 100)}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}`
  );
}

function extractS3KeyFromUrl(url) {
  if (!url) return null;
  try {
    if (url.startsWith('s3://')) {
      const parts = url.replace('s3://', '').split('/');
      parts.shift();
      return parts.join('/');
    }
    const urlObj = new URL(url);
    let key = urlObj.pathname.substring(1);
    if (urlObj.hostname.startsWith('s3.')) {
      const parts = key.split('/');
      parts.shift();
      key = parts.join('/');
    }
    return key || null;
  } catch {
    return null;
  }
}

// ============================================================================
// DYNAMODB HELPERS
// ============================================================================

async function getTableKeys(tableName) {
  const command = new DescribeTableCommand({ TableName: tableName });
  const { Table } = await ddbClient.send(command);
  const keySchema = Table.KeySchema;
  const partitionKey = keySchema.find((k) => k.KeyType === 'HASH').AttributeName;
  const sortKeyDef = keySchema.find((k) => k.KeyType === 'RANGE');
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

async function tableExists(tableName) {
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function listAllTables() {
  const allTables = [];
  let lastEvaluatedTableName = undefined;
  do {
    const resp = await ddbClient.send(
      new ListTablesCommand({ ExclusiveStartTableName: lastEvaluatedTableName })
    );
    allTables.push(...(resp.TableNames || []));
    lastEvaluatedTableName = resp.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);
  return allTables;
}

// ============================================================================
// SECTION 1: BACKUP FUNCTIONS
// ============================================================================

async function backupTableData(tableName, backupDir, dryRun) {
  logger.info(`Backing up table: ${tableName}`);
  
  if (dryRun) {
    const count = await getTableItemCount(tableName);
    logger.info(`[DRY RUN] Would backup ${count} items from ${tableName}`);
    return count;
  }
  
  let lastEvaluatedKey = undefined;
  const allTableItems = [];
  let totalScanned = 0;
  
  do {
    const scanParams = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    };
    if (CONFIG.SCAN_PAGE_LIMIT > 0) {
      scanParams.Limit = CONFIG.SCAN_PAGE_LIMIT;
    }
    
    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];
    
    if (items.length > 0) {
      allTableItems.push(...items);
      totalScanned += items.length;
      process.stdout.write(`\r  Scanned ${totalScanned} items...`);
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastEvaluatedKey);
  
  console.log(); // New line after progress
  
  if (allTableItems.length === 0) {
    logger.info(`Table ${tableName} is empty. No backup file created.`);
    return 0;
  }
  
  const fileName = path.join(backupDir, `${tableName}.csv`);
  const csvData = convertToCsv(allTableItems);
  await fs.writeFile(fileName, csvData);
  logger.success(`Saved ${allTableItems.length} items → ${fileName}`);
  return allTableItems.length;
}

async function backupAllTables(tables, dryRun) {
  const backupDirName = makeTimestampedDirName('prodbackup_db');
  const fullBackupPath = path.join(CONFIG.DATA_OUTPUT_DIR, backupDirName);
  
  if (!dryRun) {
    await fs.mkdir(CONFIG.DATA_OUTPUT_DIR, { recursive: true });
    await fs.mkdir(fullBackupPath, { recursive: true });
    logger.info(`Backup directory: ${fullBackupPath}`);
  }
  
  const stats = { total: 0, tables: {} };
  
  for (const tableName of tables) {
    try {
      if (await tableExists(tableName)) {
        const count = await backupTableData(tableName, fullBackupPath, dryRun);
        stats.tables[tableName] = count;
        stats.total += count;
      } else {
        logger.warn(`Table not found: ${tableName}`);
        stats.tables[tableName] = 'NOT_FOUND';
      }
    } catch (err) {
      logger.error(`Error backing up ${tableName}: ${err.message}`);
      stats.tables[tableName] = 'ERROR';
    }
  }
  
  return { path: fullBackupPath, stats };
}

// ============================================================================
// SECTION 2: CLEAR TABLE DATA
// ============================================================================

async function clearTableData(tableName, dryRun) {
  logger.info(`Clearing table: ${tableName}`);
  
  if (!(await tableExists(tableName))) {
    logger.warn(`Table not found: ${tableName}`);
    return 0;
  }
  
  if (dryRun) {
    const count = await getTableItemCount(tableName);
    logger.info(`[DRY RUN] Would delete ${count} items from ${tableName}`);
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
      for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
        const batch = items.slice(i, i + CONFIG.BATCH_SIZE);
        const deleteRequests = batch.map((item) => ({
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
          const result = await ddbDocClient.send(
            new BatchWriteCommand({ RequestItems: unprocessedItems })
          );
          unprocessedItems = result.UnprocessedItems || {};
          if (Object.keys(unprocessedItems).length > 0) {
            retries++;
            await sleep(1000 * retries);
          }
        }
        
        totalDeleted += batch.length;
        process.stdout.write(`\r  Deleted ${totalDeleted} items...`);
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastEvaluatedKey);
  
  console.log(); // New line after progress
  logger.success(`Cleared ${totalDeleted} items from ${tableName}`);
  return totalDeleted;
}

// ============================================================================
// SECTION 3: SOCIAL DATA CASCADE CLEANUP
// ============================================================================

async function collectAffectedGameIds() {
  logger.info('Collecting affected Game IDs from SocialPostGameLink...');
  const gameIds = new Set();
  let lastEvaluatedKey = undefined;
  
  const tableName = getTableName('SocialPostGameLink');
  if (!(await tableExists(tableName))) {
    logger.info('SocialPostGameLink table not found');
    return [];
  }
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'gameId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      if (item.gameId) gameIds.add(item.gameId);
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastEvaluatedKey);
  
  logger.info(`Found ${gameIds.size} affected Game IDs`);
  return Array.from(gameIds);
}

async function collectPlayerTicketsToDelete(gameIds) {
  logger.info('Collecting PlayerTickets to delete...');
  const ticketIds = [];
  
  const tableName = CASCADE_TABLES.PLAYER_TICKET;
  if (!(await tableExists(tableName))) {
    logger.info('PlayerTicket table not found');
    return [];
  }
  
  let lastEvaluatedKey = undefined;
  const gameIdSet = new Set(gameIds);
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id, sourceType, linkedGameId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      // Delete tickets created from social aggregation
      if (item.sourceType === 'SOCIAL_AGGREGATION' && gameIdSet.has(item.linkedGameId)) {
        ticketIds.push(item.id);
      }
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastEvaluatedKey);
  
  logger.info(`Found ${ticketIds.length} PlayerTickets to delete`);
  return ticketIds;
}

async function deletePlayerTickets(ticketIds, dryRun) {
  if (ticketIds.length === 0) return 0;
  
  logger.info(`Deleting ${ticketIds.length} PlayerTickets...`);
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would delete ${ticketIds.length} PlayerTickets`);
    return ticketIds.length;
  }
  
  const tableName = CASCADE_TABLES.PLAYER_TICKET;
  let totalDeleted = 0;
  
  for (let i = 0; i < ticketIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = ticketIds.slice(i, i + CONFIG.BATCH_SIZE);
    const deleteRequests = batch.map((id) => ({
      DeleteRequest: { Key: { id } },
    }));
    
    try {
      await ddbDocClient.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: deleteRequests } })
      );
      totalDeleted += batch.length;
    } catch (err) {
      logger.error(`Error deleting tickets: ${err.message}`);
    }
  }
  
  logger.success(`Deleted ${totalDeleted} PlayerTickets`);
  return totalDeleted;
}

async function resetGameRecords(gameIds, dryRun) {
  if (gameIds.length === 0) return 0;
  
  logger.info(`Resetting ${gameIds.length} Game records...`);
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would reset ${gameIds.length} Game records`);
    return gameIds.length;
  }
  
  let totalReset = 0;
  
  for (const gameId of gameIds) {
    try {
      const setClauses = [];
      const removeFields = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      for (const [field, value] of Object.entries(GAME_RESET_FIELDS)) {
        expressionAttributeNames[`#${field}`] = field;
        if (value === null) {
          removeFields.push(field);
        } else {
          setClauses.push(`#${field} = :${field}`);
          expressionAttributeValues[`:${field}`] = value;
        }
      }
      
      let updateExpression = `SET ${setClauses.join(', ')}`;
      if (removeFields.length > 0) {
        const removeClauses = removeFields.map((f) => `#${f}`).join(', ');
        updateExpression += ` REMOVE ${removeClauses}`;
      }
      
      await ddbDocClient.send(new UpdateCommand({
        TableName: CASCADE_TABLES.GAME,
        Key: { id: gameId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));
      
      totalReset++;
      if (totalReset % 50 === 0) {
        process.stdout.write(`\r  Reset ${totalReset}/${gameIds.length} Game records...`);
      }
    } catch (err) {
      logger.error(`Error resetting game ${gameId}: ${err.message}`);
    }
  }
  
  console.log();
  logger.success(`Reset ${totalReset} Game records`);
  return totalReset;
}

async function resetSocialAccountPostCounts(dryRun) {
  logger.info('Resetting SocialAccount postCounts to 0...');
  
  const tableName = CASCADE_TABLES.SOCIAL_ACCOUNT;
  if (!(await tableExists(tableName))) {
    logger.info('SocialAccount table not found');
    return 0;
  }
  
  const accountIds = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      if (item.id) accountIds.push(item.id);
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  if (accountIds.length === 0) {
    logger.info('No SocialAccounts found');
    return 0;
  }
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would reset postCount for ${accountIds.length} SocialAccounts`);
    return accountIds.length;
  }
  
  let totalReset = 0;
  
  for (const accountId of accountIds) {
    try {
      await ddbDocClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: accountId },
        UpdateExpression: 'SET postCount = :zero',
        ExpressionAttributeValues: { ':zero': 0 },
      }));
      totalReset++;
    } catch (err) {
      logger.error(`Error resetting account ${accountId}: ${err.message}`);
    }
  }
  
  logger.success(`Reset postCount for ${totalReset} SocialAccounts`);
  return totalReset;
}

async function deleteAutoCreatedTicketTemplates(dryRun) {
  logger.info('Scanning for auto-created TicketTemplates (TICKET_* pattern)...');
  
  const tableName = CASCADE_TABLES.TICKET_TEMPLATE;
  if (!(await tableExists(tableName))) {
    logger.info('TicketTemplate table not found');
    return 0;
  }
  
  const templateIds = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      if (item.id && item.id.startsWith('TICKET_')) {
        templateIds.push(item.id);
      }
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  if (templateIds.length === 0) {
    logger.info('No auto-created TicketTemplates found');
    return 0;
  }
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would delete ${templateIds.length} auto-created TicketTemplates`);
    return templateIds.length;
  }
  
  let totalDeleted = 0;
  
  for (let i = 0; i < templateIds.length; i += CONFIG.BATCH_SIZE) {
    const batch = templateIds.slice(i, i + CONFIG.BATCH_SIZE);
    const deleteRequests = batch.map((id) => ({
      DeleteRequest: { Key: { id } },
    }));
    
    try {
      await ddbDocClient.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: deleteRequests } })
      );
      totalDeleted += batch.length;
    } catch (err) {
      logger.error(`Error deleting templates: ${err.message}`);
    }
  }
  
  logger.success(`Deleted ${totalDeleted} TicketTemplates`);
  return totalDeleted;
}

// ============================================================================
// SECTION 4: S3 MEDIA CLEANUP
// ============================================================================

async function collectMediaUrlsFromPosts() {
  logger.info('Collecting media URLs from SocialPosts...');
  
  const tableName = getTableName('SocialPost');
  if (!(await tableExists(tableName))) {
    logger.info('SocialPost table not found');
    return [];
  }
  
  const s3Keys = new Set();
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id, mediaUrls, thumbnailUrl, videoUrl, videoThumbnailUrl',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      if (item.mediaUrls && Array.isArray(item.mediaUrls)) {
        for (const url of item.mediaUrls) {
          const key = extractS3KeyFromUrl(url);
          if (key) s3Keys.add(key);
        }
      }
      if (item.thumbnailUrl) {
        const key = extractS3KeyFromUrl(item.thumbnailUrl);
        if (key) s3Keys.add(key);
      }
      if (item.videoUrl) {
        const key = extractS3KeyFromUrl(item.videoUrl);
        if (key) s3Keys.add(key);
      }
      if (item.videoThumbnailUrl) {
        const key = extractS3KeyFromUrl(item.videoThumbnailUrl);
        if (key) s3Keys.add(key);
      }
    }
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
    await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (lastEvaluatedKey);
  
  logger.info(`Found ${s3Keys.size} unique S3 keys to delete`);
  return Array.from(s3Keys);
}

async function deleteS3Objects(keys, dryRun) {
  if (keys.length === 0) return 0;
  
  logger.info(`Deleting ${keys.length} S3 objects from ${CONFIG.S3_BUCKET}...`);
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would delete ${keys.length} S3 objects`);
    return keys.length;
  }
  
  let totalDeleted = 0;
  
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const deleteParams = {
      Bucket: CONFIG.S3_BUCKET,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    };
    
    try {
      await s3Client.send(new DeleteObjectsCommand(deleteParams));
      totalDeleted += batch.length;
      process.stdout.write(`\r  Deleted ${totalDeleted}/${keys.length} S3 objects...`);
    } catch (err) {
      logger.error(`Error deleting S3 batch: ${err.message}`);
    }
  }
  
  console.log();
  logger.success(`Deleted ${totalDeleted} S3 objects`);
  return totalDeleted;
}

// ============================================================================
// SECTION 5: CLOUDWATCH LOG CLEANUP
// ============================================================================

async function getLogGroupsFromAWS() {
  logger.info(`Scanning CloudWatch for groups matching "-${CONFIG.ENV_SUFFIX}"...`);
  
  let nextToken;
  const matchingGroups = [];
  const LOG_PREFIX = '/aws/lambda/';
  
  do {
    const command = new DescribeLogGroupsCommand({
      limit: 50,
      nextToken,
      logGroupNamePrefix: LOG_PREFIX,
    });
    
    const response = await cwClient.send(command);
    
    for (const group of response.logGroups || []) {
      if (group.logGroupName.endsWith(`-${CONFIG.ENV_SUFFIX}`)) {
        matchingGroups.push(group.logGroupName);
      }
    }
    
    nextToken = response.nextToken;
    if (nextToken) await sleep(CONFIG.RATE_LIMIT_DELAY);
  } while (nextToken);
  
  return matchingGroups;
}

async function countStreamsInGroup(logGroupName) {
  let count = 0;
  let nextToken;
  
  try {
    do {
      await sleep(CONFIG.RATE_LIMIT_DELAY);
      const response = await cwClient.send(new DescribeLogStreamsCommand({
        logGroupName,
        nextToken,
        limit: 50,
      }));
      if (response.logStreams) count += response.logStreams.length;
      nextToken = response.nextToken;
    } while (nextToken);
    return count;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return -1;
    throw err;
  }
}

async function backupLogGroup(logGroupName, groupBackupDir) {
  logger.info(`Backing up: ${logGroupName}`);
  
  let streamNextToken;
  let streamsSaved = 0;
  let totalEventsSaved = 0;
  
  do {
    const streamResponse = await cwClient.send(
      new DescribeLogStreamsCommand({ logGroupName, nextToken: streamNextToken })
    );
    
    for (const stream of streamResponse.logStreams || []) {
      const streamEvents = [];
      let eventNextToken;
      
      do {
        await sleep(CONFIG.RATE_LIMIT_DELAY);
        const eventResponse = await cwClient.send(new GetLogEventsCommand({
          logGroupName,
          logStreamName: stream.logStreamName,
          nextToken: eventNextToken,
          startFromHead: true,
        }));
        
        if (eventResponse.events?.length) {
          streamEvents.push(...eventResponse.events);
        }
        
        if (eventResponse.nextForwardToken === eventNextToken) break;
        eventNextToken = eventResponse.nextForwardToken;
      } while (eventNextToken);
      
      if (streamEvents.length > 0) {
        const firstTime = formatTimestamp(stream.firstEventTimestamp);
        const lastTime = formatTimestamp(stream.lastEventTimestamp);
        const saneStreamName = sanitizeFilename(stream.logStreamName);
        
        const fileName = `${firstTime}_${lastTime}__${saneStreamName}.json`;
        const filePath = path.join(groupBackupDir, fileName);
        
        await fs.writeFile(filePath, JSON.stringify(streamEvents, null, 2));
        streamsSaved++;
        totalEventsSaved += streamEvents.length;
      }
    }
    streamNextToken = streamResponse.nextToken;
  } while (streamNextToken);
  
  if (streamsSaved > 0) {
    logger.success(`Saved ${totalEventsSaved} events from ${streamsSaved} streams`);
  }
  return totalEventsSaved;
}

async function deleteLogGroup(logGroupName, dryRun) {
  if (dryRun) {
    logger.info(`[DRY RUN] Would delete log group: ${logGroupName}`);
    return;
  }
  
  try {
    await cwClient.send(new DeleteLogGroupCommand({ logGroupName }));
    logger.success(`Deleted log group: ${logGroupName}`);
  } catch (err) {
    logger.error(`Delete failed for ${logGroupName}: ${err.message}`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function showHelp() {
  console.log(`
KINGSROOM PRODUCTION CLEANUP SCRIPT
====================================

Usage: node cleanupProdData.js [options]

Options:
  --dry-run              Preview changes without executing (RECOMMENDED FIRST)
  --backup-only          Only backup data (no deletion)
  --skip-backup          Skip CSV backup step
  --skip-core            Skip clearing core data tables
  --skip-social          Skip clearing social data tables
  --skip-scraper         Skip clearing scraper metadata
  --skip-logs            Skip CloudWatch log cleanup
  --delete-s3-media      Also delete S3 media files (social posts)
  --delete-templates     Also delete auto-created TicketTemplates
  --auto                 Skip confirmation prompts (DANGEROUS!)
  --help                 Show this help message

Environment Variables:
  AWS_REGION             AWS region (default: ap-southeast-2)
  AWS_ACCESS_KEY_ID      Required for AWS access
  AWS_SECRET_ACCESS_KEY  Required for AWS access
  DATA_OUTPUT_DIR        Output directory for backups (default: ../../Data)

Examples:
  node cleanupProdData.js --dry-run                    # Preview what would happen
  node cleanupProdData.js --backup-only                # Just backup, no delete
  node cleanupProdData.js --skip-core --skip-logs      # Only social + scraper
  node cleanupProdData.js --delete-s3-media            # Include S3 cleanup
  `);
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  const options = {
    dryRun: args.includes('--dry-run'),
    backupOnly: args.includes('--backup-only'),
    skipBackup: args.includes('--skip-backup'),
    skipCore: args.includes('--skip-core'),
    skipSocial: args.includes('--skip-social'),
    skipScraper: args.includes('--skip-scraper'),
    skipLogs: args.includes('--skip-logs'),
    deleteS3Media: args.includes('--delete-s3-media'),
    deleteTemplates: args.includes('--delete-templates'),
    autoMode: args.includes('--auto'),
  };
  
  // Header
  console.log('\n' + '═'.repeat(70));
  console.log('  🚨 KINGSROOM PRODUCTION CLEANUP SCRIPT 🚨');
  console.log('═'.repeat(70));
  
  // Mode display
  if (options.dryRun) {
    console.log('\n  🔍 DRY RUN MODE - No changes will be made');
  } else if (options.backupOnly) {
    console.log('\n  💾 BACKUP ONLY MODE - No deletions will occur');
  } else {
    console.log('\n  ⚠️⚠️⚠️  LIVE MODE - PRODUCTION DATA WILL BE DELETED ⚠️⚠️⚠️');
  }
  
  // Configuration display
  console.log('\n  📋 Configuration:');
  console.log(`     Region:      ${CONFIG.REGION}`);
  console.log(`     API ID:      ${CONFIG.API_ID}`);
  console.log(`     Environment: ${CONFIG.ENV_SUFFIX}`);
  console.log(`     S3 Bucket:   ${CONFIG.S3_BUCKET}`);
  console.log(`     Backup Dir:  ${path.resolve(CONFIG.DATA_OUTPUT_DIR)}`);
  
  // Options display
  console.log('\n  🔧 Options:');
  console.log(`     Skip Backup:      ${options.skipBackup ? 'YES' : 'NO'}`);
  console.log(`     Skip Core:        ${options.skipCore ? 'YES' : 'NO'}`);
  console.log(`     Skip Social:      ${options.skipSocial ? 'YES' : 'NO'}`);
  console.log(`     Skip Scraper:     ${options.skipScraper ? 'YES' : 'NO'}`);
  console.log(`     Skip Logs:        ${options.skipLogs ? 'YES' : 'NO'}`);
  console.log(`     Delete S3 Media:  ${options.deleteS3Media ? 'YES' : 'NO'}`);
  console.log(`     Delete Templates: ${options.deleteTemplates ? 'YES' : 'NO'}`);
  
  // Credentials check
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables.');
    logger.info('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY before running.');
    return;
  }
  
  // Build tables to process
  const tablesToBackup = [];
  const tablesToClear = [];
  
  if (!options.skipCore) {
    tablesToBackup.push(...CORE_TABLES);
    tablesToClear.push(...CORE_TABLES);
  }
  if (!options.skipSocial) {
    tablesToBackup.push(...SOCIAL_TABLES);
    tablesToClear.push(...SOCIAL_TABLES);
  }
  if (!options.skipScraper) {
    tablesToBackup.push(...SCRAPER_TABLES);
    tablesToClear.push(...SCRAPER_TABLES);
  }
  
  // Also backup reference tables but don't clear them
  tablesToBackup.push(...REFERENCE_TABLES);
  
  // Display tables
  console.log('\n  📊 Tables to BACKUP:');
  tablesToBackup.forEach((t) => {
    const shortName = t.split('-')[0];
    console.log(`     - ${shortName}`);
  });
  
  if (!options.backupOnly) {
    console.log('\n  🗑️  Tables to CLEAR:');
    tablesToClear.forEach((t) => {
      const shortName = t.split('-')[0];
      console.log(`     - ${shortName}`);
    });
  }
  
  // Confirmation
  if (!options.autoMode && !options.dryRun) {
    console.log('\n' + '─'.repeat(70));
    
    if (!options.backupOnly) {
      logger.warn('THIS WILL PERMANENTLY DELETE PRODUCTION DATA!');
      logger.warn('Make sure you have a recent backup before proceeding.');
      
      const confirm1 = await askQuestion('\nType "I UNDERSTAND" to confirm you want to proceed: ');
      if (confirm1 !== 'I UNDERSTAND') {
        logger.info('Aborted by user.');
        return;
      }
      
      const confirm2 = await askQuestion('\nType "PRODUCTION" to confirm this is the production environment: ');
      if (confirm2 !== 'PRODUCTION') {
        logger.info('Aborted by user.');
        return;
      }
    } else {
      const confirm = await askQuestion('\nType "backup" to start backup: ');
      if (confirm.toLowerCase() !== 'backup') {
        logger.info('Aborted by user.');
        return;
      }
    }
  }
  
  // Stats tracking
  const stats = {
    backup: { path: null, tables: {}, total: 0 },
    core: { tables: {}, total: 0 },
    social: {
      tables: {},
      total: 0,
      affectedGameIds: [],
      ticketsDeleted: 0,
      gamesReset: 0,
      accountsReset: 0,
      templatesDeleted: 0,
      s3ObjectsDeleted: 0,
    },
    scraper: { tables: {}, total: 0 },
    logs: { groups: 0, events: 0 },
  };
  
  let currentStep = 0;
  let totalSteps = 0;
  
  if (!options.skipBackup) totalSteps++;
  if (!options.backupOnly) {
    if (!options.skipCore) totalSteps++;
    if (!options.skipSocial) totalSteps++;
    if (!options.skipScraper) totalSteps++;
    if (!options.skipLogs) totalSteps++;
  }
  
  console.log('\n' + '═'.repeat(70));
  
  // =========================================================================
  // STEP: BACKUP
  // =========================================================================
  
  if (!options.skipBackup) {
    currentStep++;
    logger.step(currentStep, totalSteps, '💾 BACKUP DYNAMODB TABLES');
    console.log('─'.repeat(70));
    
    const backupResult = await backupAllTables(tablesToBackup, options.dryRun);
    stats.backup = backupResult.stats;
    stats.backup.path = backupResult.path;
  }
  
  if (options.backupOnly) {
    console.log('\n' + '═'.repeat(70));
    logger.success('BACKUP COMPLETE');
    console.log('═'.repeat(70));
    console.log(`\n  Backup saved to: ${stats.backup.path}`);
    return;
  }
  
  // =========================================================================
  // STEP: CLEAR CORE DATA
  // =========================================================================
  
  if (!options.skipCore) {
    currentStep++;
    logger.step(currentStep, totalSteps, '🗑️  CLEAR CORE DATA TABLES');
    console.log('─'.repeat(70));
    
    for (const tableName of CORE_TABLES) {
      try {
        const deleted = await clearTableData(tableName, options.dryRun);
        stats.core.tables[tableName] = deleted;
        stats.core.total += deleted;
      } catch (err) {
        logger.error(`Error clearing ${tableName}: ${err.message}`);
        stats.core.tables[tableName] = 'ERROR';
      }
    }
  }
  
  // =========================================================================
  // STEP: CLEAR SOCIAL DATA (WITH CASCADE)
  // =========================================================================
  
  if (!options.skipSocial) {
    currentStep++;
    logger.step(currentStep, totalSteps, '🗑️  CLEAR SOCIAL DATA (WITH CASCADE)');
    console.log('─'.repeat(70));
    
    // Collect S3 keys before deletion
    let s3Keys = [];
    if (options.deleteS3Media) {
      s3Keys = await collectMediaUrlsFromPosts();
    }
    
    // Collect affected game IDs
    stats.social.affectedGameIds = await collectAffectedGameIds();
    
    // Collect tickets to delete
    const ticketIds = await collectPlayerTicketsToDelete(stats.social.affectedGameIds);
    
    // Clear social tables
    for (const tableName of SOCIAL_TABLES) {
      try {
        const deleted = await clearTableData(tableName, options.dryRun);
        stats.social.tables[tableName] = deleted;
        stats.social.total += deleted;
      } catch (err) {
        logger.error(`Error clearing ${tableName}: ${err.message}`);
        stats.social.tables[tableName] = 'ERROR';
      }
    }
    
    // Delete player tickets
    stats.social.ticketsDeleted = await deletePlayerTickets(ticketIds, options.dryRun);
    
    // Reset game records
    stats.social.gamesReset = await resetGameRecords(stats.social.affectedGameIds, options.dryRun);
    
    // Reset social account post counts
    stats.social.accountsReset = await resetSocialAccountPostCounts(options.dryRun);
    
    // Delete auto-created templates
    if (options.deleteTemplates) {
      stats.social.templatesDeleted = await deleteAutoCreatedTicketTemplates(options.dryRun);
    }
    
    // Delete S3 objects
    if (options.deleteS3Media && s3Keys.length > 0) {
      stats.social.s3ObjectsDeleted = await deleteS3Objects(s3Keys, options.dryRun);
    }
  }
  
  // =========================================================================
  // STEP: CLEAR SCRAPER METADATA
  // =========================================================================
  
  if (!options.skipScraper) {
    currentStep++;
    logger.step(currentStep, totalSteps, '🗑️  CLEAR SCRAPER METADATA');
    console.log('─'.repeat(70));
    
    logger.info('Note: S3Storage table is intentionally preserved');
    
    for (const tableName of SCRAPER_TABLES) {
      try {
        const deleted = await clearTableData(tableName, options.dryRun);
        stats.scraper.tables[tableName] = deleted;
        stats.scraper.total += deleted;
      } catch (err) {
        logger.error(`Error clearing ${tableName}: ${err.message}`);
        stats.scraper.tables[tableName] = 'ERROR';
      }
    }
  }
  
  // =========================================================================
  // STEP: CLOUDWATCH LOGS
  // =========================================================================
  
  if (!options.skipLogs) {
    currentStep++;
    logger.step(currentStep, totalSteps, '📋 BACKUP & CLEAR CLOUDWATCH LOGS');
    console.log('─'.repeat(70));
    
    const logGroups = await getLogGroupsFromAWS();
    
    if (logGroups.length === 0) {
      logger.info('No matching log groups found');
    } else {
      logger.info(`Found ${logGroups.length} log groups`);
      
      // Count streams
      const groupsWithStreams = [];
      for (const groupName of logGroups) {
        const count = await countStreamsInGroup(groupName);
        if (count > 0) {
          groupsWithStreams.push({ name: groupName, streamCount: count });
        }
      }
      
      if (groupsWithStreams.length > 0) {
        // Create backup directory
        const logBackupDir = path.join(
          CONFIG.DATA_OUTPUT_DIR,
          makeTimestampedDirName('prodbackup_logs')
        );
        
        if (!options.dryRun) {
          await fs.mkdir(logBackupDir, { recursive: true });
        }
        
        // Process each group
        for (const group of groupsWithStreams) {
          try {
            if (!options.dryRun) {
              const groupBackupDir = path.join(logBackupDir, sanitizeFilename(group.name));
              await fs.mkdir(groupBackupDir, { recursive: true });
              const events = await backupLogGroup(group.name, groupBackupDir);
              stats.logs.events += events;
            }
            await deleteLogGroup(group.name, options.dryRun);
            stats.logs.groups++;
          } catch (err) {
            logger.error(`Error processing ${group.name}: ${err.message}`);
          }
        }
      }
    }
  }
  
  // =========================================================================
  // SUMMARY
  // =========================================================================
  
  console.log('\n' + '═'.repeat(70));
  logger.success('CLEANUP COMPLETE');
  console.log('═'.repeat(70));
  
  if (options.dryRun) {
    console.log('\n  🔍 This was a DRY RUN - no actual changes were made');
  }
  
  console.log('\n  📊 Summary:');
  
  if (!options.skipBackup && stats.backup.path) {
    console.log(`\n  💾 Backup:`);
    console.log(`     Path: ${stats.backup.path}`);
    console.log(`     Total items: ${stats.backup.total}`);
  }
  
  if (!options.skipCore) {
    console.log(`\n  🗑️  Core Data:`);
    console.log(`     Total deleted: ${stats.core.total}`);
  }
  
  if (!options.skipSocial) {
    console.log(`\n  🗑️  Social Data:`);
    console.log(`     Tables cleared: ${stats.social.total}`);
    console.log(`     Games reset: ${stats.social.gamesReset}`);
    console.log(`     Tickets deleted: ${stats.social.ticketsDeleted}`);
    console.log(`     Accounts reset: ${stats.social.accountsReset}`);
    if (options.deleteTemplates) {
      console.log(`     Templates deleted: ${stats.social.templatesDeleted}`);
    }
    if (options.deleteS3Media) {
      console.log(`     S3 objects deleted: ${stats.social.s3ObjectsDeleted}`);
    }
  }
  
  if (!options.skipScraper) {
    console.log(`\n  🗑️  Scraper Metadata:`);
    console.log(`     Total deleted: ${stats.scraper.total}`);
  }
  
  if (!options.skipLogs) {
    console.log(`\n  📋 CloudWatch Logs:`);
    console.log(`     Groups deleted: ${stats.logs.groups}`);
    console.log(`     Events backed up: ${stats.logs.events}`);
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

// Execute
main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
