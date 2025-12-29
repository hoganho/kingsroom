// clearGameSocialData.js
// ============================================================================
// Clear social data for a SPECIFIC GAME
// ============================================================================
// Use this for iterative testing - reset just one game's social data
// without clearing everything.
//
// Enhanced features:
// - Optionally delete the associated SocialPost records
// - Decrement SocialAccount.postCount when posts are deleted
// - Delete associated media from S3 when posts are deleted
//
// Usage: 
//   node clearGameSocialData.js <gameId>                    - Clear links only
//   node clearGameSocialData.js <gameId> --delete-posts     - Also delete posts + S3 media
//   node clearGameSocialData.js --post <postId>             - Clear all links from a post
//   node clearGameSocialData.js --post <postId> --delete    - Delete the post entirely
// ============================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  GetCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const API_ID = process.env.API_ID || 'ht3nugt6lvddpeeuwj3x6mkite';
const ENV = process.env.ENV_SUFFIX || 'dev';

// S3 Configuration
const S3_CONFIG = {
  bucket: process.env.S3_BUCKET || 'pokerpro-scraper-storage',
  region: REGION,
};

const getTableName = (modelName) => `${modelName}-${API_ID}-${ENV}`;

// Display configuration
console.log(`📋 Config: API_ID=${API_ID}, ENV=${ENV}, S3=${S3_CONFIG.bucket}`);

// ============================================================================
// DYNAMODB & S3 CLIENTS
// ============================================================================

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({ region: S3_CONFIG.region });

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
// S3 HELPER FUNCTIONS
// ============================================================================

/**
 * Extract S3 key from a full S3 URL
 */
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

/**
 * Collect all S3 keys from a SocialPost record
 */
function collectS3KeysFromPost(post) {
  const keys = [];
  
  if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
    for (const url of post.mediaUrls) {
      const key = extractS3KeyFromUrl(url);
      if (key) keys.push(key);
    }
  }
  
  if (post.thumbnailUrl) {
    const key = extractS3KeyFromUrl(post.thumbnailUrl);
    if (key) keys.push(key);
  }
  
  if (post.videoUrl) {
    const key = extractS3KeyFromUrl(post.videoUrl);
    if (key) keys.push(key);
  }
  
  if (post.videoThumbnailUrl) {
    const key = extractS3KeyFromUrl(post.videoThumbnailUrl);
    if (key) keys.push(key);
  }
  
  return keys;
}

/**
 * Delete S3 objects by keys
 */
async function deleteS3Objects(keys) {
  if (keys.length === 0) return 0;
  
  let totalDeleted = 0;
  
  // Delete in batches of 1000
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    
    try {
      const result = await s3Client.send(new DeleteObjectsCommand({
        Bucket: S3_CONFIG.bucket,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: true,
        },
      }));
      
      totalDeleted += batch.length - (result.Errors?.length || 0);
    } catch (err) {
      logger.error(`S3 delete error: ${err.message}`);
    }
  }
  
  return totalDeleted;
}

// ============================================================================
// SOCIAL ACCOUNT POST COUNT HELPERS
// ============================================================================

/**
 * Decrement postCount for a SocialAccount
 */
async function decrementAccountPostCount(accountId, decrementBy = 1) {
  try {
    // First get current count
    const getResult = await ddbDocClient.send(new GetCommand({
      TableName: getTableName('SocialAccount'),
      Key: { id: accountId },
      ProjectionExpression: 'postCount, accountName',
    }));
    
    if (!getResult.Item) {
      logger.warn(`SocialAccount not found: ${accountId}`);
      return false;
    }
    
    const currentCount = getResult.Item.postCount || 0;
    const newCount = Math.max(0, currentCount - decrementBy);
    
    await ddbDocClient.send(new UpdateCommand({
      TableName: getTableName('SocialAccount'),
      Key: { id: accountId },
      UpdateExpression: 'SET postCount = :count, updatedAt = :now',
      ExpressionAttributeValues: {
        ':count': newCount,
        ':now': new Date().toISOString(),
      },
    }));
    
    logger.debug(`  Decremented ${getResult.Item.accountName} postCount: ${currentCount} → ${newCount}`);
    return true;
  } catch (err) {
    logger.error(`Error updating account ${accountId}: ${err.message}`);
    return false;
  }
}

// ============================================================================
// DELETE SOCIAL POST (with S3 and account count update)
// ============================================================================

/**
 * Delete a single SocialPost and its associated data
 */
async function deleteSocialPost(postId, options = { deleteS3: true, updateAccountCount: true }) {
  const stats = {
    postDeleted: false,
    gameDataDeleted: 0,
    s3Deleted: 0,
    accountUpdated: false,
  };
  
  try {
    // Get the post first
    const postResult = await ddbDocClient.send(new GetCommand({
      TableName: getTableName('SocialPost'),
      Key: { id: postId },
    }));
    
    if (!postResult.Item) {
      logger.warn(`SocialPost not found: ${postId}`);
      return stats;
    }
    
    const post = postResult.Item;
    logger.info(`Deleting post: ${postId}`);
    logger.debug(`  Account: ${post.accountName}, Posted: ${post.postedAt}`);
    
    // Collect S3 keys before deletion
    const s3Keys = options.deleteS3 ? collectS3KeysFromPost(post) : [];
    
    // Delete associated SocialPostGameData
    if (post.extractedGameDataId) {
      try {
        await ddbDocClient.send(new DeleteCommand({
          TableName: getTableName('SocialPostGameData'),
          Key: { id: post.extractedGameDataId },
        }));
        stats.gameDataDeleted++;
      } catch (err) {
        logger.debug(`  Could not delete GameData: ${err.message}`);
      }
    }
    
    // Delete the post
    await ddbDocClient.send(new DeleteCommand({
      TableName: getTableName('SocialPost'),
      Key: { id: postId },
    }));
    stats.postDeleted = true;
    
    // Delete S3 media
    if (s3Keys.length > 0) {
      stats.s3Deleted = await deleteS3Objects(s3Keys);
      logger.debug(`  Deleted ${stats.s3Deleted} S3 objects`);
    }
    
    // Update account post count
    if (options.updateAccountCount && post.socialAccountId) {
      stats.accountUpdated = await decrementAccountPostCount(post.socialAccountId, 1);
    }
    
  } catch (err) {
    logger.error(`Error deleting post ${postId}: ${err.message}`);
  }
  
  return stats;
}

// ============================================================================
// MAIN FUNCTION: Clear Game Social Data
// ============================================================================

async function clearGameSocialData(gameId, options = { deletePosts: false }) {
  console.log('\n' + '='.repeat(60));
  logger.info(`Clearing social data for game: ${gameId}`);
  if (options.deletePosts) {
    logger.warn('Mode: DELETE POSTS + S3 media');
  } else {
    logger.info('Mode: Unlink only (posts preserved)');
  }
  console.log('='.repeat(60) + '\n');

  const stats = {
    linksDeleted: 0,
    ticketsDeleted: 0,
    postsDeleted: 0,
    s3Deleted: 0,
    accountsUpdated: 0,
    gameReset: false,
  };

  try {
    // Step 1: Get the game record first
    const gameResult = await ddbDocClient.send(new GetCommand({
      TableName: getTableName('Game'),
      Key: { id: gameId },
    }));

    if (!gameResult.Item) {
      logger.error(`Game not found: ${gameId}`);
      return;
    }

    const game = gameResult.Item;
    logger.info(`Found game: ${game.name || 'Unnamed'}`);
    logger.info(`  - hasLinkedSocialPosts: ${game.hasLinkedSocialPosts}`);
    logger.info(`  - linkedSocialPostCount: ${game.linkedSocialPostCount}`);
    logger.info(`  - ticketsAwardedCount: ${game.ticketsAwardedCount}`);

    // Step 2: Find SocialPostGameLinks for this game
    logger.info('\nStep 1: Finding SocialPostGameLinks...');
    
    const linksResult = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName('SocialPostGameLink'),
      IndexName: 'byGameSocialPostLink',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId,
      },
    }));

    const links = linksResult.Items || [];
    logger.info(`  Found ${links.length} links`);

    // Collect unique post IDs from links
    const linkedPostIds = [...new Set(links.map(l => l.socialPostId).filter(Boolean))];

    // Step 3: Delete the links
    logger.info('\nStep 2: Deleting SocialPostGameLinks...');
    for (const link of links) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: getTableName('SocialPostGameLink'),
        Key: { id: link.id },
      }));
      stats.linksDeleted++;
    }
    logger.success(`  Deleted ${stats.linksDeleted} links`);

    // Step 4: Optionally delete the posts themselves
    if (options.deletePosts && linkedPostIds.length > 0) {
      logger.info('\nStep 3: Deleting SocialPosts and S3 media...');
      
      for (const postId of linkedPostIds) {
        const result = await deleteSocialPost(postId, {
          deleteS3: true,
          updateAccountCount: true,
        });
        
        if (result.postDeleted) stats.postsDeleted++;
        stats.s3Deleted += result.s3Deleted;
        if (result.accountUpdated) stats.accountsUpdated++;
      }
      
      logger.success(`  Deleted ${stats.postsDeleted} posts, ${stats.s3Deleted} S3 objects`);
      logger.success(`  Updated ${stats.accountsUpdated} account post counts`);
    }

    // Step 5: Delete PlayerTickets won from this game
    logger.info('\nStep 4: Deleting PlayerTickets...');
    
    try {
      const ticketsResult = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('PlayerTicket'),
        IndexName: 'byWonFromGame',
        KeyConditionExpression: 'wonFromGameId = :gameId',
        ExpressionAttributeValues: {
          ':gameId': gameId,
        },
      }));

      const tickets = ticketsResult.Items || [];
      logger.info(`  Found ${tickets.length} tickets`);

      for (const ticket of tickets) {
        await ddbDocClient.send(new DeleteCommand({
          TableName: getTableName('PlayerTicket'),
          Key: { id: ticket.id },
        }));
        stats.ticketsDeleted++;
      }
      logger.success(`  Deleted ${stats.ticketsDeleted} tickets`);
    } catch (err) {
      logger.warn(`  Could not query/delete tickets: ${err.message}`);
    }

    // Step 6: Reset game record
    logger.info('\nStep 5: Resetting Game record...');
    
    await ddbDocClient.send(new UpdateCommand({
      TableName: getTableName('Game'),
      Key: { id: gameId },
      UpdateExpression: `
        SET linkedSocialPostCount = :zero,
            hasLinkedSocialPosts = :false,
            ticketsAwardedCount = :zero,
            updatedAt = :now
        REMOVE primaryResultPostId, 
               socialDataAggregation, 
               socialDataAggregatedAt,
               ticketProgramName
      `,
      ExpressionAttributeValues: {
        ':zero': 0,
        ':false': false,
        ':now': new Date().toISOString(),
      },
    }));
    
    stats.gameReset = true;
    logger.success('  Game record reset');

    // Summary
    console.log('\n' + '='.repeat(60));
    logger.success('CLEANUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nSummary for game ${gameId}:`);
    console.log(`  - SocialPostGameLinks deleted: ${stats.linksDeleted}`);
    if (options.deletePosts) {
      console.log(`  - SocialPosts deleted: ${stats.postsDeleted}`);
      console.log(`  - S3 objects deleted: ${stats.s3Deleted}`);
      console.log(`  - Account postCounts updated: ${stats.accountsUpdated}`);
    }
    console.log(`  - PlayerTickets deleted: ${stats.ticketsDeleted}`);
    console.log(`  - Game record reset: ${stats.gameReset}`);
    
    if (!options.deletePosts) {
      console.log('');
      console.log('Note: SocialPost records were NOT deleted (use --delete-posts to remove them).');
      console.log('      They can be re-linked to this game for testing.');
    }
    console.log('');

  } catch (err) {
    logger.error(`Failed: ${err.message}`);
    console.error(err);
  }
}

// ============================================================================
// ALTERNATIVE: Clear by Social Post ID
// ============================================================================

async function clearSocialPostLinks(socialPostId, options = { deletePost: false }) {
  console.log('\n' + '='.repeat(60));
  logger.info(`Clearing links for social post: ${socialPostId}`);
  if (options.deletePost) {
    logger.warn('Mode: DELETE POST + S3 media');
  }
  console.log('='.repeat(60) + '\n');

  const stats = {
    linksDeleted: 0,
    gamesAffected: 0,
    postDeleted: false,
    s3Deleted: 0,
  };

  try {
    // Find all links for this social post
    const linksResult = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName('SocialPostGameLink'),
      IndexName: 'bySocialPostGameLink',
      KeyConditionExpression: 'socialPostId = :socialPostId',
      ExpressionAttributeValues: {
        ':socialPostId': socialPostId,
      },
    }));

    const links = linksResult.Items || [];
    logger.info(`Found ${links.length} links from this post`);

    // Get unique game IDs
    const gameIds = [...new Set(links.map((l) => l.gameId))];
    stats.gamesAffected = gameIds.length;
    
    // Delete links
    for (const link of links) {
      await ddbDocClient.send(new DeleteCommand({
        TableName: getTableName('SocialPostGameLink'),
        Key: { id: link.id },
      }));
      stats.linksDeleted++;
    }
    logger.success(`Deleted ${stats.linksDeleted} links`);

    // Optionally delete the post itself
    if (options.deletePost) {
      logger.info('\nDeleting the SocialPost and S3 media...');
      const result = await deleteSocialPost(socialPostId, {
        deleteS3: true,
        updateAccountCount: true,
      });
      stats.postDeleted = result.postDeleted;
      stats.s3Deleted = result.s3Deleted;
    }

    // Reset each affected game's counters
    if (gameIds.length > 0) {
      logger.info(`\nUpdating ${gameIds.length} affected games...`);
      for (const gameId of gameIds) {
        // Recount links for this game
        const remainingLinks = await ddbDocClient.send(new QueryCommand({
          TableName: getTableName('SocialPostGameLink'),
          IndexName: 'byGameSocialPostLink',
          KeyConditionExpression: 'gameId = :gameId',
          ExpressionAttributeValues: { ':gameId': gameId },
          Select: 'COUNT',
        }));
        
        const linkCount = remainingLinks.Count || 0;
        
        await ddbDocClient.send(new UpdateCommand({
          TableName: getTableName('Game'),
          Key: { id: gameId },
          UpdateExpression: `
            SET linkedSocialPostCount = :count,
                hasLinkedSocialPosts = :hasLinks,
                updatedAt = :now
          `,
          ExpressionAttributeValues: {
            ':count': linkCount,
            ':hasLinks': linkCount > 0,
            ':now': new Date().toISOString(),
          },
        }));
        
        logger.debug(`  Game ${gameId.substring(0, 8)}... now has ${linkCount} links`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    logger.success('CLEANUP COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nSummary for post ${socialPostId}:`);
    console.log(`  - Links deleted: ${stats.linksDeleted}`);
    console.log(`  - Games affected: ${stats.gamesAffected}`);
    if (options.deletePost) {
      console.log(`  - Post deleted: ${stats.postDeleted}`);
      console.log(`  - S3 objects deleted: ${stats.s3Deleted}`);
    }
    console.log('');

  } catch (err) {
    logger.error(`Failed: ${err.message}`);
    console.error(err);
  }
}

// ============================================================================
// CLI HANDLER
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage:
  node clearGameSocialData.js <gameId>                     - Clear links only (keep posts)
  node clearGameSocialData.js <gameId> --delete-posts      - Delete posts + S3 media
  node clearGameSocialData.js --post <postId>              - Clear all links from a post
  node clearGameSocialData.js --post <postId> --delete     - Delete the post entirely
  
Examples:
  node clearGameSocialData.js dc95bd6f-62e1-45df-99f0-ed3c7d1bd67f
  node clearGameSocialData.js dc95bd6f-62e1-45df-99f0-ed3c7d1bd67f --delete-posts
  node clearGameSocialData.js --post FACEBOOK_746910898136115
  node clearGameSocialData.js --post FACEBOOK_746910898136115 --delete

Options:
  --delete-posts    Also delete the SocialPost records and their S3 media
  --delete          When using --post, delete the post itself (not just links)

Environment variables:
  AWS_REGION        AWS region (default: ap-southeast-2)
  API_ID            AppSync API ID (default: ht3nugt6lvddpeeuwj3x6mkite)
  ENV_SUFFIX        Environment suffix (default: dev)
  S3_BUCKET         S3 bucket for media (default: pokerpro-scraper-storage)
`);
    return;
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables.');
    return;
  }

  // Parse arguments
  const postFlagIndex = args.indexOf('--post');
  const hasDeletePosts = args.includes('--delete-posts');
  const hasDelete = args.includes('--delete');

  if (postFlagIndex !== -1 && args[postFlagIndex + 1]) {
    // Clear by post ID
    const postId = args[postFlagIndex + 1];
    await clearSocialPostLinks(postId, { deletePost: hasDelete });
  } else if (args[0] && !args[0].startsWith('--')) {
    // Clear by game ID
    await clearGameSocialData(args[0], { deletePosts: hasDeletePosts });
  } else {
    logger.error('Invalid arguments. Run without arguments for help.');
  }
}

main().catch((err) => {
  logger.error('Unhandled error: ' + err.message);
  process.exit(1);
});
