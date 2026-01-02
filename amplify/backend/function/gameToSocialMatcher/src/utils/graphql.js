/**
 * utils/graphql.js
 * GraphQL/DynamoDB utilities for gameToSocialMatcher
 * 
 * Provides data access functions for:
 * - Games
 * - Social Posts
 * - Social Post Game Data (extractions)
 * - Social Post Game Links
 * - Venues
 * 
 * TIMEZONE NOTE:
 * Year-month calculations use AEST to ensure correct GSI partition queries
 * for Australian business context.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { getYearMonthsInRange: getYearMonthsInRangeAEST } = require('./dateUtils');

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// ===================================================================
// TABLE NAME HELPER
// ===================================================================

const getTableName = (modelName) => {
  const envVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) return process.env[envVarName];
  
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${modelName}-${apiId}-${env}`;
};

// ===================================================================
// GAME OPERATIONS
// ===================================================================

/**
 * Get a game by ID
 */
const getGame = async (gameId) => {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName('Game'),
    Key: { id: gameId }
  }));
  return result.Item;
};

// ===================================================================
// VENUE OPERATIONS
// ===================================================================

/**
 * Get a venue by ID
 */
const getVenue = async (venueId) => {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName('Venue'),
    Key: { id: venueId }
  }));
  return result.Item;
};

// ===================================================================
// SOCIAL POST OPERATIONS
// ===================================================================

/**
 * Get a social post by ID
 */
const getSocialPost = async (postId) => {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName('SocialPost'),
    Key: { id: postId }
  }));
  return result.Item;
};

/**
 * Update a social post
 */
const updateSocialPost = async (postId, updates) => {
  const now = new Date().toISOString();
  
  // Build update expression
  const updateKeys = Object.keys(updates);
  const updateExpression = 'SET ' + updateKeys.map(k => `#${k} = :${k}`).join(', ') + ', #updatedAt = :updatedAt';
  const expressionAttributeNames = {
    ...Object.fromEntries(updateKeys.map(k => [`#${k}`, k])),
    '#updatedAt': 'updatedAt'
  };
  const expressionAttributeValues = {
    ...Object.fromEntries(updateKeys.map(k => [`:${k}`, updates[k]])),
    ':updatedAt': now
  };
  
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName('SocialPost'),
    Key: { id: postId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  
  return result.Attributes;
};

/**
 * Query social posts by date range
 * Uses byPostMonth GSI (postYearMonth + postedAt)
 * 
 * NOTE: Uses AEST-aware year-month calculation to query correct partitions
 * 
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @param {Object} options - Query options
 */
const querySocialPostsByDateRange = async (startDate, endDate, options = {}) => {
  const { limit = 100 } = options;
  
  // Extract year-months to query (AEST-aware)
  const yearMonths = getYearMonthsInRangeAEST(startDate, endDate);
  
  console.log(`[GRAPHQL] Querying byPostMonth GSI for AEST months: ${yearMonths.join(', ')}`);
  
  let allPosts = [];
  
  for (const yearMonth of yearMonths) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPost'),
        IndexName: 'byPostMonth',
        KeyConditionExpression: 'postYearMonth = :ym AND postedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':ym': yearMonth,
          ':start': startDate,
          ':end': endDate
        },
        Limit: limit
      }));
      
      allPosts.push(...(result.Items || []));
    } catch (error) {
      // GSI might not exist yet - fall back to scan
      console.log(`[GRAPHQL] byPostMonth GSI query failed for ${yearMonth}, falling back`);
    }
  }
  
  // If GSI failed, do a filtered query on processingStatus
  if (allPosts.length === 0) {
    const statuses = ['EXTRACTED', 'MATCHED', 'LINKED', 'MANUAL_REVIEW'];
    
    for (const status of statuses) {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPost'),
        IndexName: 'byProcessingStatus',
        KeyConditionExpression: 'processingStatus = :status AND postedAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':status': status,
          ':start': startDate,
          ':end': endDate
        },
        Limit: limit
      }));
      
      allPosts.push(...(result.Items || []));
    }
  }
  
  return allPosts;
};

/**
 * Query social posts by venue and date range
 * Uses bySocialAccountPost GSI with socialAccountId
 * We need to get posts from social accounts linked to this venue
 * 
 * @param {string} venueId - Venue ID
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @param {Object} options - Query options
 */
const querySocialPostsByVenueAndDate = async (venueId, startDate, endDate, options = {}) => {
  const { limit = 100 } = options;
  
  // First, find social accounts for this venue
  const accountsResult = await ddbDocClient.send(new QueryCommand({
    TableName: getTableName('SocialAccount'),
    IndexName: 'bySocialAccountVenue',
    KeyConditionExpression: 'venueId = :venueId',
    ExpressionAttributeValues: {
      ':venueId': venueId
    }
  }));
  
  const socialAccountIds = (accountsResult.Items || []).map(a => a.id);
  
  if (socialAccountIds.length === 0) {
    console.log(`[GRAPHQL] No social accounts found for venue ${venueId}`);
    return [];
  }
  
  console.log(`[GRAPHQL] Found ${socialAccountIds.length} social accounts for venue ${venueId}`);
  
  // Query posts for each social account
  let allPosts = [];
  
  for (const socialAccountId of socialAccountIds) {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName('SocialPost'),
      IndexName: 'bySocialAccountPost',
      KeyConditionExpression: 'socialAccountId = :said AND postedAt BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':said': socialAccountId,
        ':start': startDate,
        ':end': endDate
      },
      Limit: limit
    }));
    
    allPosts.push(...(result.Items || []));
  }
  
  return allPosts;
};

/**
 * Query social posts by tournament ID
 * This requires having indexed the extractedTournamentId
 * 
 * @param {string} tournamentId - Tournament ID to search for
 * @returns {Array} Posts with _extraction attached for caching
 */
const querySocialPostsByTournamentId = async (tournamentId) => {
  // First check SocialPostGameData for posts with this tournament ID
  try {
    const result = await ddbDocClient.send(new QueryCommand({
      TableName: getTableName('SocialPostGameData'),
      IndexName: 'byTournamentId',
      KeyConditionExpression: 'extractedTournamentId = :tid',
      ExpressionAttributeValues: {
        ':tid': tournamentId
      }
    }));
    
    const extractions = result.Items || [];
    
    if (extractions.length === 0) {
      return [];
    }
    
    // Get the actual posts and attach extractions for caching
    const posts = [];
    for (const extraction of extractions) {
      if (extraction.socialPostId) {
        const post = await getSocialPost(extraction.socialPostId);
        if (post) {
          // Attach extraction to post for caching (avoids re-lookup)
          post._cachedExtraction = extraction;
          posts.push(post);
        }
      }
    }
    
    return posts;
    
  } catch (error) {
    // GSI might not exist
    console.log(`[GRAPHQL] byTournamentId GSI query failed:`, error.message);
    return [];
  }
};

// ===================================================================
// SOCIAL POST GAME DATA (EXTRACTION) OPERATIONS
// ===================================================================

// Cache GSI availability to avoid repeated failed lookups
let extractionGSIStatus = {
  checked: false,
  availableIndex: null  // Will be set to the working index name, or 'NONE' if none work
};

/**
 * Get extraction data for a social post
 */
const getExtractionBySocialPost = async (socialPostId) => {
  // If we've already determined no GSI is available, return null immediately
  if (extractionGSIStatus.checked && extractionGSIStatus.availableIndex === 'NONE') {
    return null;
  }
  
  // If we found a working index before, use it directly
  if (extractionGSIStatus.checked && extractionGSIStatus.availableIndex) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameData'),
        IndexName: extractionGSIStatus.availableIndex,
        KeyConditionExpression: 'socialPostId = :pid',
        ExpressionAttributeValues: {
          ':pid': socialPostId
        },
        Limit: 1
      }));
      
      return result.Items?.[0] || null;
    } catch (error) {
      // Index might have been deleted, reset and retry
      extractionGSIStatus.checked = false;
      extractionGSIStatus.availableIndex = null;
    }
  }
  
  // Try to find a working GSI
  const indexesToTry = [
    'bySocialPost',
    'bySocialPostGameDataSocialPostId',
    'gsi-SocialPostGameData.socialPostId',
    'socialPostId-index'
  ];
  
  for (const indexName of indexesToTry) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameData'),
        IndexName: indexName,
        KeyConditionExpression: 'socialPostId = :pid',
        ExpressionAttributeValues: {
          ':pid': socialPostId
        },
        Limit: 1
      }));
      
      // This index works! Cache it for future calls
      console.log(`[GRAPHQL] Found working extraction GSI: ${indexName}`);
      extractionGSIStatus.checked = true;
      extractionGSIStatus.availableIndex = indexName;
      
      return result.Items?.[0] || null;
    } catch (error) {
      if (error.name === 'ValidationException' && error.message.includes('specified index')) {
        // This index doesn't exist, try next
        continue;
      }
      // Some other error, throw it
      throw error;
    }
  }
  
  // No GSI available - cache this result
  console.log(`[GRAPHQL] No usable GSI for SocialPostGameData.socialPostId - extraction lookups will be skipped`);
  extractionGSIStatus.checked = true;
  extractionGSIStatus.availableIndex = 'NONE';
  
  return null;
};

// ===================================================================
// SOCIAL POST GAME LINK OPERATIONS
// ===================================================================

// Cache GSI availability for link queries
let linkGSIStatus = {
  bySocialPostLink: { checked: false, availableIndex: null },
  byGameSocialPostLink: { checked: false, availableIndex: null }
};

/**
 * Get all links for a social post
 */
const getLinksBySocialPost = async (socialPostId) => {
  const gsiKey = 'bySocialPostLink';
  
  // If we've determined no GSI is available, return empty array
  if (linkGSIStatus[gsiKey].checked && linkGSIStatus[gsiKey].availableIndex === 'NONE') {
    return [];
  }
  
  // If we found a working index before, use it
  if (linkGSIStatus[gsiKey].checked && linkGSIStatus[gsiKey].availableIndex) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameLink'),
        IndexName: linkGSIStatus[gsiKey].availableIndex,
        KeyConditionExpression: 'socialPostId = :pid',
        ExpressionAttributeValues: {
          ':pid': socialPostId
        }
      }));
      return (result.Items || []).filter(l => l.linkType !== 'REJECTED');
    } catch (error) {
      // Reset and retry
      linkGSIStatus[gsiKey].checked = false;
      linkGSIStatus[gsiKey].availableIndex = null;
    }
  }
  
  // Try to find a working GSI
  const indexesToTry = [
    'bySocialPostLink',
    'bySocialPostGameLinkSocialPostId',
    'gsi-SocialPostGameLink.socialPostId',
    'socialPostId-index'
  ];
  
  for (const indexName of indexesToTry) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameLink'),
        IndexName: indexName,
        KeyConditionExpression: 'socialPostId = :pid',
        ExpressionAttributeValues: {
          ':pid': socialPostId
        }
      }));
      
      console.log(`[GRAPHQL] Found working link GSI (socialPostId): ${indexName}`);
      linkGSIStatus[gsiKey].checked = true;
      linkGSIStatus[gsiKey].availableIndex = indexName;
      
      return (result.Items || []).filter(l => l.linkType !== 'REJECTED');
    } catch (error) {
      if (error.name === 'ValidationException' && error.message.includes('specified index')) {
        continue;
      }
      throw error;
    }
  }
  
  // No GSI available
  console.log(`[GRAPHQL] No usable GSI for SocialPostGameLink.socialPostId - link lookups will return empty`);
  linkGSIStatus[gsiKey].checked = true;
  linkGSIStatus[gsiKey].availableIndex = 'NONE';
  
  return [];
};

/**
 * Get all links for a game
 */
const getLinksByGame = async (gameId) => {
  const gsiKey = 'byGameSocialPostLink';
  
  // If we've determined no GSI is available, return empty array
  if (linkGSIStatus[gsiKey].checked && linkGSIStatus[gsiKey].availableIndex === 'NONE') {
    return [];
  }
  
  // If we found a working index before, use it
  if (linkGSIStatus[gsiKey].checked && linkGSIStatus[gsiKey].availableIndex) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameLink'),
        IndexName: linkGSIStatus[gsiKey].availableIndex,
        KeyConditionExpression: 'gameId = :gid',
        ExpressionAttributeValues: {
          ':gid': gameId
        }
      }));
      return (result.Items || []).filter(l => l.linkType !== 'REJECTED');
    } catch (error) {
      // Reset and retry
      linkGSIStatus[gsiKey].checked = false;
      linkGSIStatus[gsiKey].availableIndex = null;
    }
  }
  
  // Try to find a working GSI
  const indexesToTry = [
    'byGameSocialPostLink',
    'bySocialPostGameLinkGameId',
    'gsi-SocialPostGameLink.gameId',
    'gameId-index'
  ];
  
  for (const indexName of indexesToTry) {
    try {
      const result = await ddbDocClient.send(new QueryCommand({
        TableName: getTableName('SocialPostGameLink'),
        IndexName: indexName,
        KeyConditionExpression: 'gameId = :gid',
        ExpressionAttributeValues: {
          ':gid': gameId
        }
      }));
      
      console.log(`[GRAPHQL] Found working link GSI (gameId): ${indexName}`);
      linkGSIStatus[gsiKey].checked = true;
      linkGSIStatus[gsiKey].availableIndex = indexName;
      
      return (result.Items || []).filter(l => l.linkType !== 'REJECTED');
    } catch (error) {
      if (error.name === 'ValidationException' && error.message.includes('specified index')) {
        continue;
      }
      throw error;
    }
  }
  
  // No GSI available
  console.log(`[GRAPHQL] No usable GSI for SocialPostGameLink.gameId - link lookups will return empty`);
  linkGSIStatus[gsiKey].checked = true;
  linkGSIStatus[gsiKey].availableIndex = 'NONE';
  
  return [];
};

/**
 * Get a specific link by ID
 */
const getSocialPostGameLink = async (linkId) => {
  const result = await ddbDocClient.send(new GetCommand({
    TableName: getTableName('SocialPostGameLink'),
    Key: { id: linkId }
  }));
  return result.Item;
};

/**
 * Create a new social post game link
 */
const createSocialPostGameLink = async (link) => {
  await ddbDocClient.send(new PutCommand({
    TableName: getTableName('SocialPostGameLink'),
    Item: link
  }));
  return link;
};

/**
 * Update a social post game link
 */
const updateSocialPostGameLink = async (linkId, updates) => {
  const now = new Date().toISOString();
  
  const updateKeys = Object.keys(updates);
  const updateExpression = 'SET ' + updateKeys.map(k => `#${k} = :${k}`).join(', ') + ', #updatedAt = :updatedAt';
  const expressionAttributeNames = {
    ...Object.fromEntries(updateKeys.map(k => [`#${k}`, k])),
    '#updatedAt': 'updatedAt'
  };
  const expressionAttributeValues = {
    ...Object.fromEntries(updateKeys.map(k => [`:${k}`, updates[k]])),
    ':updatedAt': now
  };
  
  const result = await ddbDocClient.send(new UpdateCommand({
    TableName: getTableName('SocialPostGameLink'),
    Key: { id: linkId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  
  return result.Attributes;
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Get array of YYYY-MM strings between two dates (AEST-aware)
 * 
 * @deprecated Use getYearMonthsInRangeAEST from dateUtils instead
 * This is kept for backward compatibility and delegates to the AEST version
 */
const getYearMonthsInRange = (startDate, endDate) => {
  return getYearMonthsInRangeAEST(startDate, endDate);
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Games
  getGame,
  
  // Venues
  getVenue,
  
  // Social Posts
  getSocialPost,
  updateSocialPost,
  querySocialPostsByDateRange,
  querySocialPostsByVenueAndDate,
  querySocialPostsByTournamentId,
  
  // Extractions
  getExtractionBySocialPost,
  
  // Links
  getLinksBySocialPost,
  getLinksByGame,
  getSocialPostGameLink,
  createSocialPostGameLink,
  updateSocialPostGameLink,
  
  // Helpers
  getTableName,
  getYearMonthsInRange
};