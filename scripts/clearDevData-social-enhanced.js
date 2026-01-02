// clearDevData-social-enhanced.js
// ============================================================================
// Enhanced script for clearing social data with CASCADE cleanup
// ============================================================================
// This script:
// 1. Clears all social-related tables (SocialPost, SocialPostGameLink, etc.)
// 2. Resets Game records that were updated by socialDataAggregator
// 3. Deletes PlayerTickets that were created from social post aggregation
// 4. Optionally deletes auto-created TicketTemplates (set DELETE_TEMPLATES=1)
// 5. Resets SocialAccount.postCount to 0 for all accounts
// 6. Optionally deletes associated media files from S3 (set DELETE_S3_MEDIA=1)
//
// ⚠️ WARNING: THIS IS A DESTRUCTIVE AND IRREVERSIBLE OPERATION. ⚠️
// ⚠️ DO NOT RUN THIS ON A PRODUCTION DATABASE. ⚠️
// ============================================================================

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================
// Uses same pattern as backupThenClearCloudwatchLogs_perStream.js
//
// Override via environment variables if needed:
//   API_ID=xxx ENV_SUFFIX=staging node clearDevData-social-enhanced.js
//
// Optional flags (default: false):
//   DELETE_TEMPLATES=1  - Also delete auto-created TicketTemplates
//   DELETE_S3_MEDIA=1   - Also delete associated S3 media files
// ============================================================================

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const API_ID = process.env.API_ID || 'ht3nugt6lvddpeeuwj3x6mkite';
const ENV = process.env.ENV_SUFFIX || 'dev';

// Optional cleanup flags (default to false for safety)
const DELETE_TEMPLATES = process.env.DELETE_TEMPLATES || '1';
const DELETE_S3_MEDIA = process.env.DELETE_S3_MEDIA || '1';

// S3 Configuration for social media attachments
const S3_CONFIG = {
  bucket: process.env.S3_BUCKET || 'pokerpro-scraper-storage',
  region: REGION,
  // Common prefixes where social media might be stored
  prefixes: [
    'social-media/',
    'social-posts/',
    'post-attachments/',
    `social/${ENV}/`,
  ],
};

// Helper to get table name
const getTableName = (modelName) => `${modelName}-${API_ID}-${ENV}`;

// Tables to completely clear
const TABLES_TO_CLEAR = [
  getTableName('SocialPost'),
  getTableName('SocialScheduledPost'),
  getTableName('SocialScrapeAttempt'),
  getTableName('SocialPostGameData'),
  getTableName('SocialPostGameLink'),
  getTableName('SocialPostPlacement'),
];

// Tables for cascade operations (not fully cleared, just affected records)
const GAME_TABLE = getTableName('Game');
const PLAYER_TICKET_TABLE = getTableName('PlayerTicket');
const TICKET_TEMPLATE_TABLE = getTableName('TicketTemplate');
const SOCIAL_ACCOUNT_TABLE = getTableName('SocialAccount');

// Display configuration on startup
console.log(`\n📋 Configuration:`);
console.log(`   API_ID: ${API_ID}`);
console.log(`   ENV_SUFFIX: ${ENV}`);
console.log(`   Region: ${REGION}`);
console.log(`   S3 Bucket: ${S3_CONFIG.bucket}`);
console.log(`   DELETE_TEMPLATES: ${DELETE_TEMPLATES}`);
console.log(`   DELETE_S3_MEDIA: ${DELETE_S3_MEDIA}`);
console.log(`   Example table: ${GAME_TABLE}\n`);

// Fields to reset on Game records
const GAME_RESET_FIELDS = {
  linkedSocialPostCount: 0,
  hasLinkedSocialPosts: false,
  primaryResultPostId: null,
  socialDataAggregation: null,
  socialDataAggregatedAt: null,
  ticketsAwardedCount: 0,
  ticketProgramName: null,
  // Note: We don't reset hasAccumulatorTickets, accumulatorTicketValue, 
  // numberOfAccumulatorTicketsPaid as these may come from RecurringGame config
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
};

// ============================================================================
// DYNAMODB CLIENTS
// ============================================================================

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ============================================================================
// S3 CLIENT
// ============================================================================

const s3Client = new S3Client({ region: S3_CONFIG.region });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
  const partitionKey = keySchema.find((k) => k.KeyType === 'HASH').AttributeName;
  const sortKeyDef = keySchema.find((k) => k.KeyType === 'RANGE');
  const sortKey = sortKeyDef ? sortKeyDef.AttributeName : undefined;

  return { partitionKey, sortKey };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract S3 key from a full S3 URL
 * Handles multiple URL formats:
 * - https://bucket.s3.region.amazonaws.com/key/path/file.jpg
 * - https://s3.region.amazonaws.com/bucket/key/path/file.jpg
 * - s3://bucket/key/path/file.jpg
 */
function extractS3KeyFromUrl(url) {
  if (!url) return null;
  try {
    // Handle s3:// protocol
    if (url.startsWith('s3://')) {
      const parts = url.replace('s3://', '').split('/');
      parts.shift(); // Remove bucket name
      return parts.join('/');
    }
    
    const urlObj = new URL(url);
    // Remove leading slash from pathname
    let key = urlObj.pathname.substring(1);
    
    // If bucket is in path (s3.region.amazonaws.com/bucket/key format)
    if (urlObj.hostname.startsWith('s3.')) {
      const parts = key.split('/');
      parts.shift(); // Remove bucket name from path
      key = parts.join('/');
    }
    
    return key || null;
  } catch {
    return null;
  }
}

// ============================================================================
// S3 CLEANUP FUNCTIONS
// ============================================================================

/**
 * Collect all media URLs from SocialPosts before deletion
 * Returns array of S3 keys to delete
 */
async function collectMediaUrlsFromPosts() {
  logger.info('Collecting media URLs from SocialPosts...');
  
  const s3Keys = new Set(); // Use Set to avoid duplicates
  let lastEvaluatedKey = undefined;
  let postsScanned = 0;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: getTableName('SocialPost'),
      ProjectionExpression: 'id, mediaUrls, thumbnailUrl, videoUrl, videoThumbnailUrl',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      postsScanned++;
      
      // Collect from mediaUrls array
      if (item.mediaUrls && Array.isArray(item.mediaUrls)) {
        for (const url of item.mediaUrls) {
          const key = extractS3KeyFromUrl(url);
          if (key) s3Keys.add(key);
        }
      }
      
      // Collect thumbnailUrl
      if (item.thumbnailUrl) {
        const key = extractS3KeyFromUrl(item.thumbnailUrl);
        if (key) s3Keys.add(key);
      }
      
      // Collect videoUrl
      if (item.videoUrl) {
        const key = extractS3KeyFromUrl(item.videoUrl);
        if (key) s3Keys.add(key);
      }
      
      // Collect videoThumbnailUrl
      if (item.videoThumbnailUrl) {
        const key = extractS3KeyFromUrl(item.videoThumbnailUrl);
        if (key) s3Keys.add(key);
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.info(`Scanned ${postsScanned} posts, found ${s3Keys.size} unique media files`);
  return Array.from(s3Keys);
}

/**
 * Delete specific S3 objects by keys
 */
async function deleteS3ObjectsByKeys(keys) {
  if (keys.length === 0) {
    logger.info('No S3 objects to delete');
    return 0;
  }
  
  logger.info(`Deleting ${keys.length} S3 objects from ${S3_CONFIG.bucket}...`);
  
  let totalDeleted = 0;
  let errors = 0;
  
  // Delete in batches of 1000 (S3 limit)
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    
    try {
      const result = await s3Client.send(new DeleteObjectsCommand({
        Bucket: S3_CONFIG.bucket,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: false,
        },
      }));
      
      totalDeleted += (result.Deleted || []).length;
      errors += (result.Errors || []).length;
      
      if (result.Errors && result.Errors.length > 0) {
        logger.warn(`  ${result.Errors.length} objects failed to delete`);
        result.Errors.slice(0, 3).forEach(err => {
          logger.debug(`    - ${err.Key}: ${err.Message}`);
        });
      }
    } catch (err) {
      logger.error(`Error deleting S3 batch: ${err.message}`);
      errors += batch.length;
    }
    
    // Progress update
    if ((i + 1000) % 5000 === 0 || i + 1000 >= keys.length) {
      logger.info(`  Progress: ${Math.min(i + 1000, keys.length)}/${keys.length} processed`);
    }
  }
  
  if (errors > 0) {
    logger.warn(`Completed with ${errors} errors`);
  }
  
  return totalDeleted;
}

// ============================================================================
// SOCIAL ACCOUNT POST COUNT RESET
// ============================================================================

async function resetSocialAccountPostCounts() {
  logger.info('Resetting postCount for all SocialAccounts...');
  
  let lastEvaluatedKey = undefined;
  let totalReset = 0;
  let totalAccounts = 0;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: SOCIAL_ACCOUNT_TABLE,
      ProjectionExpression: 'id, accountName, postCount',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      totalAccounts++;
      
      // Only update if postCount > 0
      if (item.postCount && item.postCount > 0) {
        try {
          await ddbDocClient.send(new UpdateCommand({
            TableName: SOCIAL_ACCOUNT_TABLE,
            Key: { id: item.id },
            UpdateExpression: 'SET postCount = :zero, updatedAt = :now',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':now': new Date().toISOString(),
            },
          }));
          totalReset++;
          logger.debug(`  Reset ${item.accountName}: ${item.postCount} → 0`);
        } catch (err) {
          logger.error(`Error resetting account ${item.id}: ${err.message}`);
        }
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.success(`Reset postCount for ${totalReset}/${totalAccounts} SocialAccounts`);
  return totalReset;
}

// ============================================================================
// STEP 1: COLLECT AFFECTED GAME IDs
// ============================================================================

async function collectAffectedGameIds() {
  logger.info('Collecting affected Game IDs from SocialPostGameLink...');
  
  const gameIds = new Set();
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: getTableName('SocialPostGameLink'),
      ProjectionExpression: 'gameId',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      if (item.gameId) {
        gameIds.add(item.gameId);
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.info(`Found ${gameIds.size} affected Game records`);
  return Array.from(gameIds);
}

// ============================================================================
// STEP 2: COLLECT PLAYER TICKETS TO DELETE
// ============================================================================

async function collectPlayerTicketsToDelete(gameIds) {
  logger.info('Collecting PlayerTickets created from social aggregation...');
  
  const ticketIds = [];
  
  for (const gameId of gameIds) {
    try {
      // Query PlayerTickets by wonFromGameId
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: PLAYER_TICKET_TABLE,
        IndexName: 'byWonFromGame',
        KeyConditionExpression: 'wonFromGameId = :gameId',
        ExpressionAttributeValues: {
          ':gameId': gameId,
        },
        ProjectionExpression: 'id',
      }));
      
      for (const item of result.Items || []) {
        ticketIds.push(item.id);
      }
    } catch (err) {
      // Index might not exist or other error - log and continue
      logger.debug(`Could not query tickets for game ${gameId}: ${err.message}`);
    }
  }
  
  logger.info(`Found ${ticketIds.length} PlayerTickets to delete`);
  return ticketIds;
}

// ============================================================================
// STEP 3: CLEAR TABLE DATA
// ============================================================================

async function clearTableData(tableName) {
  logger.info(`Clearing all data from table: ${tableName}`);
  
  const { partitionKey, sortKey } = await getTableKeys(tableName);
  let lastEvaluatedKey = undefined;
  let totalDeleted = 0;
  
  do {
    const projectionExpr = sortKey ? `${partitionKey}, ${sortKey}` : partitionKey;
    
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      ProjectionExpression: projectionExpr,
    }));
    
    const items = scanResult.Items || [];
    
    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        const deleteRequests = batch.map((item) => ({
          DeleteRequest: {
            Key: {
              [partitionKey]: item[partitionKey],
              ...(sortKey && { [sortKey]: item[sortKey] }),
            },
          },
        }));
        
        let unprocessedItems = { [tableName]: deleteRequests };
        
        while (Object.keys(unprocessedItems).length > 0 && unprocessedItems[tableName]?.length > 0) {
          const result = await ddbDocClient.send(
            new BatchWriteCommand({ RequestItems: unprocessedItems })
          );
          unprocessedItems = result.UnprocessedItems || {};
          
          if (unprocessedItems[tableName]?.length > 0) {
            await sleep(100); // Back off on throttling
          }
        }
        
        totalDeleted += batch.length;
      }
    }
    
    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  
  logger.success(`Deleted ${totalDeleted} items from ${tableName.split('-')[0]}`);
  return totalDeleted;
}

// ============================================================================
// STEP 4: DELETE PLAYER TICKETS
// ============================================================================

async function deletePlayerTickets(ticketIds) {
  if (ticketIds.length === 0) {
    logger.info('No PlayerTickets to delete');
    return 0;
  }
  
  logger.info(`Deleting ${ticketIds.length} PlayerTickets...`);
  
  let totalDeleted = 0;
  
  for (let i = 0; i < ticketIds.length; i += 25) {
    const batch = ticketIds.slice(i, i + 25);
    const deleteRequests = batch.map((id) => ({
      DeleteRequest: {
        Key: { id },
      },
    }));
    
    try {
      let unprocessedItems = { [PLAYER_TICKET_TABLE]: deleteRequests };
      
      while (Object.keys(unprocessedItems).length > 0 && unprocessedItems[PLAYER_TICKET_TABLE]?.length > 0) {
        const result = await ddbDocClient.send(
          new BatchWriteCommand({ RequestItems: unprocessedItems })
        );
        unprocessedItems = result.UnprocessedItems || {};
        
        if (unprocessedItems[PLAYER_TICKET_TABLE]?.length > 0) {
          await sleep(100);
        }
      }
      
      totalDeleted += batch.length;
    } catch (err) {
      logger.error(`Error deleting tickets batch: ${err.message}`);
    }
  }
  
  logger.success(`Deleted ${totalDeleted} PlayerTickets`);
  return totalDeleted;
}

// ============================================================================
// STEP 5: RESET GAME RECORDS
// ============================================================================

async function resetGameRecords(gameIds) {
  if (gameIds.length === 0) {
    logger.info('No Game records to reset');
    return 0;
  }
  
  logger.info(`Resetting ${gameIds.length} Game records...`);
  
  let totalReset = 0;
  
  for (const gameId of gameIds) {
    try {
      // Build update expression to reset social aggregation fields
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};
      
      // SET fields that have values
      const setFields = [];
      const removeFields = [];
      
      for (const [field, value] of Object.entries(GAME_RESET_FIELDS)) {
        if (value === null) {
          removeFields.push(field);
        } else {
          setFields.push(field);
          expressionAttributeNames[`#${field}`] = field;
          expressionAttributeValues[`:${field}`] = value;
        }
      }
      
      // Add updatedAt
      setFields.push('updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();
      
      // Build SET clause
      const setClauses = setFields.map((f) => `#${f} = :${f}`).join(', ');
      
      // Build REMOVE clause for null fields
      let updateExpression = `SET ${setClauses}`;
      if (removeFields.length > 0) {
        for (const field of removeFields) {
          expressionAttributeNames[`#${field}`] = field;
        }
        const removeClauses = removeFields.map((f) => `#${f}`).join(', ');
        updateExpression += ` REMOVE ${removeClauses}`;
      }
      
      await ddbDocClient.send(new UpdateCommand({
        TableName: GAME_TABLE,
        Key: { id: gameId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      }));
      
      totalReset++;
      
      if (totalReset % 10 === 0) {
        logger.info(`Reset ${totalReset}/${gameIds.length} Game records...`);
      }
    } catch (err) {
      logger.error(`Error resetting game ${gameId}: ${err.message}`);
    }
  }
  
  logger.success(`Reset ${totalReset} Game records`);
  return totalReset;
}

// ============================================================================
// STEP 6: DELETE AUTO-CREATED TICKET TEMPLATES (OPTIONAL)
// ============================================================================

async function deleteAutoCreatedTicketTemplates() {
  logger.info('Scanning for auto-created TicketTemplates (TICKET_* pattern)...');
  
  const templateIds = [];
  let lastEvaluatedKey = undefined;
  
  do {
    const scanResult = await ddbDocClient.send(new ScanCommand({
      TableName: TICKET_TEMPLATE_TABLE,
      ProjectionExpression: 'id',
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    
    for (const item of scanResult.Items || []) {
      // Auto-created templates have IDs like "TICKET_SYDNEY_MILLIONS_250"
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
  
  logger.info(`Found ${templateIds.length} auto-created TicketTemplates to delete`);
  
  let totalDeleted = 0;
  
  for (let i = 0; i < templateIds.length; i += 25) {
    const batch = templateIds.slice(i, i + 25);
    const deleteRequests = batch.map((id) => ({
      DeleteRequest: {
        Key: { id },
      },
    }));
    
    try {
      await ddbDocClient.send(
        new BatchWriteCommand({ RequestItems: { [TICKET_TEMPLATE_TABLE]: deleteRequests } })
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
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  logger.warn('KINGSROOM SOCIAL DATA CLEANER (Enhanced with Cascade + S3)');
  console.log('='.repeat(70));
  
  logger.warn('This script will:');
  console.log('  1. Clear all social-related tables (SocialPost, SocialPostGameLink, etc.)');
  console.log('  2. Reset Game records that were updated by socialDataAggregator');
  console.log('  3. Delete PlayerTickets created from social post aggregation');
  console.log('  4. Reset SocialAccount.postCount to 0 for all accounts');
  if (DELETE_TEMPLATES) {
    console.log('  5. Delete auto-created TicketTemplates (DELETE_TEMPLATES=1)');
  }
  if (DELETE_S3_MEDIA) {
    console.log('  6. Delete associated media files from S3 (DELETE_S3_MEDIA=1)');
  }
  console.log('');
  logger.warn('This action is IRREVERSIBLE. Please be absolutely sure.');
  
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables. Aborting.');
    return;
  }
  
  console.log('\nTables to clear:');
  TABLES_TO_CLEAR.forEach((table) => console.log(`  - ${table}`));
  console.log('\nCascade operations:');
  console.log(`  - Reset affected Game records in: ${GAME_TABLE}`);
  console.log(`  - Delete related PlayerTickets in: ${PLAYER_TICKET_TABLE}`);
  console.log(`  - Reset postCount in: ${SOCIAL_ACCOUNT_TABLE}`);
  if (DELETE_S3_MEDIA) {
    console.log(`  - Delete media from S3: ${S3_CONFIG.bucket}`);
  }
  
  const confirmation = await askQuestion('\nType "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }
  
  console.log('\n' + '-'.repeat(70));
  
  // Stats tracking
  const stats = {
    affectedGameIds: [],
    ticketIdsToDelete: [],
    tablesCleared: {},
    gamesReset: 0,
    ticketsDeleted: 0,
    templatesDeleted: 0,
    accountsReset: 0,
    s3ObjectsDeleted: 0,
    mediaUrls: [],
  };
  
  try {
    // Step 0: Collect media URLs BEFORE deleting posts (if S3 cleanup requested)
    if (DELETE_S3_MEDIA) {
      stats.mediaUrls = await collectMediaUrlsFromPosts();
    }
    
    // Step 1: Collect affected game IDs BEFORE clearing tables
    stats.affectedGameIds = await collectAffectedGameIds();
    
    // Step 2: Collect player tickets to delete
    stats.ticketIdsToDelete = await collectPlayerTicketsToDelete(stats.affectedGameIds);
    
    console.log('\n' + '-'.repeat(70));
    
    // Step 3: Clear social tables
    for (const tableName of TABLES_TO_CLEAR) {
      try {
        const deleted = await clearTableData(tableName);
        stats.tablesCleared[tableName] = deleted;
      } catch (err) {
        logger.error(`Error clearing ${tableName}: ${err.message}`);
        stats.tablesCleared[tableName] = 'ERROR';
      }
    }
    
    console.log('\n' + '-'.repeat(70));
    
    // Step 4: Delete player tickets
    stats.ticketsDeleted = await deletePlayerTickets(stats.ticketIdsToDelete);
    
    // Step 5: Reset game records
    stats.gamesReset = await resetGameRecords(stats.affectedGameIds);
    
    // Step 6: Delete ticket templates (if enabled)
    if (DELETE_TEMPLATES) {
      stats.templatesDeleted = await deleteAutoCreatedTicketTemplates();
    }
    
    // Step 7: Reset SocialAccount postCounts
    stats.accountsReset = await resetSocialAccountPostCounts();
    
    // Step 8: Delete S3 objects (if enabled)
    if (DELETE_S3_MEDIA && stats.mediaUrls.length > 0) {
      console.log('\n' + '-'.repeat(70));
      stats.s3ObjectsDeleted = await deleteS3ObjectsByKeys(stats.mediaUrls);
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    logger.success('CLEANUP COMPLETE');
    console.log('='.repeat(70));
    console.log('\nSummary:');
    console.log(`  Tables cleared:`);
    for (const [table, count] of Object.entries(stats.tablesCleared)) {
      const shortName = table.split('-')[0];
      console.log(`    - ${shortName}: ${count} items`);
    }
    console.log(`  Game records reset: ${stats.gamesReset}`);
    console.log(`  PlayerTickets deleted: ${stats.ticketsDeleted}`);
    console.log(`  SocialAccounts reset: ${stats.accountsReset}`);
    if (DELETE_TEMPLATES) {
      console.log(`  TicketTemplates deleted: ${stats.templatesDeleted}`);
    }
    if (DELETE_S3_MEDIA) {
      console.log(`  S3 objects deleted: ${stats.s3ObjectsDeleted}`);
    }
    console.log('');
    
  } catch (err) {
    logger.error(`Script failed: ${err.message}`);
    console.error(err);
  }
}

// ============================================================================
// EXECUTE
// ============================================================================

main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  process.exit(1);
});