/**
 * SocialPost Database Operations
 * 
 * Handles all DynamoDB operations for the SocialPost table.
 */

const { GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { config, getDocClient } = require('../config');

/**
 * Check if a post already exists by ID
 */
async function getExistingPost(id) {
  const result = await getDocClient().send(new GetCommand({
    TableName: config.tables.socialPost,
    Key: { id },
  }));
  return result.Item;
}

/**
 * Save a new post to the database
 */
async function savePost(post) {
  console.log('[DB:Post] Saving post:', post.id);
  await getDocClient().send(new PutCommand({
    TableName: config.tables.socialPost,
    Item: post,
  }));
}

/**
 * Get the date range of existing posts for an account
 * Used for smart sync to determine which posts we already have
 */
async function getPostDateRange(socialAccountId) {
  console.log(`[DB:Post] Getting post date range for account ${socialAccountId}...`);
  
  try {
    // Get oldest post
    const oldestResult = await getDocClient().send(new QueryCommand({
      TableName: config.tables.socialPost,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      ScanIndexForward: true,  // Ascending order (oldest first)
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    // Get newest post
    const newestResult = await getDocClient().send(new QueryCommand({
      TableName: config.tables.socialPost,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      ScanIndexForward: false,  // Descending order (newest first)
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    // Get total count
    const countResult = await getDocClient().send(new QueryCommand({
      TableName: config.tables.socialPost,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      Select: 'COUNT'
    }));
    
    const oldestPost = oldestResult.Items?.[0];
    const newestPost = newestResult.Items?.[0];
    const totalPosts = countResult.Count || 0;
    
    if (!oldestPost || !newestPost) {
      console.log(`[DB:Post] No existing posts found for account`);
      return { 
        oldestPostDate: null, 
        newestPostDate: null, 
        oldestTimestamp: null, 
        newestTimestamp: null, 
        totalPosts: 0 
      };
    }
    
    const oldestDate = oldestPost.postedAt;
    const newestDate = newestPost.postedAt;
    const oldestTimestamp = Math.floor(new Date(oldestDate).getTime() / 1000);
    const newestTimestamp = Math.floor(new Date(newestDate).getTime() / 1000);
    
    console.log(`[DB:Post] Post date range: ${oldestDate} to ${newestDate} (${totalPosts} posts)`);
    
    return {
      oldestPostDate: oldestDate,
      newestPostDate: newestDate,
      oldestTimestamp,
      newestTimestamp,
      totalPosts,
    };
  } catch (error) {
    console.error('[DB:Post] Error getting post date range:', error);
    return { 
      oldestPostDate: null, 
      newestPostDate: null, 
      oldestTimestamp: null, 
      newestTimestamp: null, 
      totalPosts: 0 
    };
  }
}

/**
 * Generate a unique post ID from account ID and platform post ID
 */
function generatePostId(accountId, platformPostId) {
  return `${accountId}_${platformPostId}`;
}

/**
 * Get the year-month partition key from a date string
 * Format: "2025-01"
 */
function getPostYearMonth(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

module.exports = {
  getExistingPost,
  savePost,
  getPostDateRange,
  generatePostId,
  getPostYearMonth,
};
