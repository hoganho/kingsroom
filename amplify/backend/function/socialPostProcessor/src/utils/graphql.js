/**
 * utils/graphql.js
 * Database operations using DynamoDB DocumentClient
 * 
 * For social post matching, we query games by:
 * - Tournament ID (exact match - highest confidence)
 * - Venue + date range (when venue is matched from content)
 * 
 * Social posts do NOT have entityId - relationships are discovered through matching.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  QueryCommand,
  DeleteCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const getTableName = (baseName) => {
  const envName = process.env[`API_KINGSROOM_${baseName.toUpperCase()}TABLE_NAME`];
  if (envName) return envName;
  const env = process.env.ENV || 'staging';
  return `${baseName}-PLACEHOLDER-${env}`;
};

const TABLES = {
  Game: () => getTableName('Game'),
  SocialPost: () => getTableName('SocialPost'),
  SocialPostGameLink: () => getTableName('SocialPostGameLink'),
  SocialPostGameData: () => getTableName('SocialPostGameData'),
  SocialPostPlacement: () => getTableName('SocialPostPlacement'),
  Venue: () => getTableName('Venue'),
  Entity: () => getTableName('Entity'),
  SocialAccount: () => getTableName('SocialAccount')
};

// ===================================================================
// GENERIC OPERATIONS
// ===================================================================

const getItem = async (tableName, id) => {
  const result = await docClient.send(new GetCommand({
    TableName: tableName,
    Key: { id }
  }));
  return result.Item || null;
};

const putItem = async (tableName, item) => {
  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: item
  }));
  return item;
};

const updateItem = async (tableName, id, updates) => {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });
  
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  
  const result = await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  
  return result.Attributes;
};

const queryByIndex = async (tableName, indexName, keyCondition, keyValues, options = {}) => {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: keyValues,
    ...options
  };
  
  if (options.filterExpression) {
    params.FilterExpression = options.filterExpression;
  }
  
  const result = await docClient.send(new QueryCommand(params));
  return {
    items: result.Items || [],
    nextToken: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
  };
};

const deleteItem = async (tableName, id) => {
  await docClient.send(new DeleteCommand({
    TableName: tableName,
    Key: { id }
  }));
  return true;
};

// ===================================================================
// SOCIAL POST OPERATIONS
// ===================================================================

const getSocialPost = async (id) => {
  return getItem(TABLES.SocialPost(), id);
};

const updateSocialPost = async (id, updates) => {
  return updateItem(TABLES.SocialPost(), id, updates);
};

const querySocialPostsByStatus = async (status, options = {}) => {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.SocialPost(),
    IndexName: 'byProcessingStatus',
    KeyConditionExpression: 'processingStatus = :status',
    ExpressionAttributeValues: { ':status': status },
    Limit: options.limit || 100,
    ...(options.nextToken && { ExclusiveStartKey: JSON.parse(options.nextToken) })
  }));
  
  return {
    items: result.Items || [],
    nextToken: result.LastEvaluatedKey ? JSON.stringify(result.LastEvaluatedKey) : null
  };
};

// ===================================================================
// GAME OPERATIONS
// ===================================================================

const getGame = async (id) => {
  return getItem(TABLES.Game(), id);
};

/**
 * Query games by tournament ID
 * Primary matching method when we have a tournament URL
 * 
 * Requires GSI: byTournamentId (tournamentId as partition key)
 * Falls back to scan if GSI doesn't exist
 */
const queryGameByTournamentId = async (tournamentId) => {
  const tid = typeof tournamentId === 'string' ? parseInt(tournamentId, 10) : tournamentId;
  
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.Game(),
      IndexName: 'byTournamentId',
      KeyConditionExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': tid },
      Limit: 10
    }));
    return result.Items || [];
  } catch (error) {
    console.log('[GRAPHQL] byTournamentId GSI not found, using scan');
    const result = await docClient.send(new ScanCommand({
      TableName: TABLES.Game(),
      FilterExpression: 'tournamentId = :tournamentId',
      ExpressionAttributeValues: { ':tournamentId': tid },
      Limit: 100
    }));
    return result.Items || [];
  }
};

/**
 * Query games by venue and date range
 * Used when we've matched a venue from post content
 * 
 * Uses GSI: byVenue (venueId partition, gameStartDateTime sort)
 */
const queryGamesByVenueAndDate = async (venueId, startDate, endDate, options = {}) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.Game(),
      IndexName: 'byVenue',  // This GSI already exists in your schema
      KeyConditionExpression: 'venueId = :venueId AND gameStartDateTime BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':venueId': venueId,
        ':startDate': startDate,
        ':endDate': endDate
      },
      Limit: options.limit || 100
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[GRAPHQL] Error querying byVenue:', error);
    return [];
  }
};

/**
 * Query games by year-month and date range
 * Used when we don't have venue context but have a date
 * 
 * Uses GSI: byGameMonth (gameYearMonth partition, gameStartDateTime sort)
 * 
 * @param {string} yearMonth - Format "YYYY-MM" e.g., "2025-08"
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
const queryGamesByMonthAndDate = async (yearMonth, startDate, endDate, options = {}) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLES.Game(),
      IndexName: 'byGameMonth',
      KeyConditionExpression: 'gameYearMonth = :yearMonth AND gameStartDateTime BETWEEN :startDate AND :endDate',
      ExpressionAttributeValues: {
        ':yearMonth': yearMonth,
        ':startDate': startDate,
        ':endDate': endDate
      },
      Limit: options.limit || 100
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[GRAPHQL] Error querying byGameMonth:', error);
    return [];
  }
};

/**
 * Query games across multiple months (for date ranges spanning month boundaries)
 * 
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 */
const queryGamesByDateRange = async (startDate, endDate, options = {}) => {
  // Get all year-months in range
  const yearMonths = getYearMonthsInRange(startDate, endDate);
  
  console.log(`[GRAPHQL] Querying ${yearMonths.length} month partition(s): ${yearMonths.join(', ')}`);
  
  // Query each month partition
  const allGames = [];
  for (const yearMonth of yearMonths) {
    const games = await queryGamesByMonthAndDate(yearMonth, startDate, endDate, options);
    allGames.push(...games);
  }
  
  // Sort by date and dedupe (in case of overlaps)
  const uniqueGames = Array.from(
    new Map(allGames.map(g => [g.id, g])).values()
  ).sort((a, b) => a.gameStartDateTime.localeCompare(b.gameStartDateTime));
  
  return uniqueGames;
};

/**
 * Get all year-month strings in a date range
 * e.g., "2025-08-27" to "2025-09-02" returns ["2025-08", "2025-09"]
 */
const getYearMonthsInRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const yearMonths = new Set();
  
  const current = new Date(start);
  while (current <= end) {
    const ym = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    yearMonths.add(ym);
    current.setMonth(current.getMonth() + 1);
    current.setDate(1); // Move to first of next month
  }
  
  // Also add the end month explicitly
  const endYm = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  yearMonths.add(endYm);
  
  return Array.from(yearMonths).sort();
};

// Kept for other use cases (not used in social post matching)
const queryGamesByEntityAndDate = async (entityId, startDate, endDate, options = {}) => {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.Game(),
    IndexName: 'byEntityGame',
    KeyConditionExpression: 'entityId = :entityId AND gameStartDateTime BETWEEN :startDate AND :endDate',
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':startDate': startDate,
      ':endDate': endDate
    },
    Limit: options.limit || 100
  }));
  return result.Items || [];
};

const queryGameByEntityAndTournamentId = async (entityId, tournamentId) => {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.Game(),
    IndexName: 'byEntityAndTournamentId',
    KeyConditionExpression: 'entityId = :entityId AND tournamentId = :tournamentId',
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':tournamentId': tournamentId
    },
    Limit: 1
  }));
  return result.Items?.[0] || null;
};

// ===================================================================
// LINK OPERATIONS
// ===================================================================

const createSocialPostGameLink = async (link) => {
  const now = new Date().toISOString();
  return putItem(TABLES.SocialPostGameLink(), { ...link, createdAt: now, updatedAt: now });
};

const getLinksBySocialPost = async (socialPostId) => {
  const result = await queryByIndex(
    TABLES.SocialPostGameLink(),
    'bySocialPostGameLink',
    'socialPostId = :socialPostId',
    { ':socialPostId': socialPostId }
  );
  return result.items;
};

const getLinksByGame = async (gameId) => {
  const result = await queryByIndex(
    TABLES.SocialPostGameLink(),
    'byGameSocialPostLink',
    'gameId = :gameId',
    { ':gameId': gameId }
  );
  return result.items;
};

const getSocialPostGameLink = async (id) => getItem(TABLES.SocialPostGameLink(), id);
const updateSocialPostGameLink = async (id, updates) => updateItem(TABLES.SocialPostGameLink(), id, updates);
const deleteSocialPostGameLink = async (id) => deleteItem(TABLES.SocialPostGameLink(), id);

// ===================================================================
// EXTRACTION OPERATIONS
// ===================================================================

const createSocialPostGameData = async (data) => {
  const now = new Date().toISOString();
  return putItem(TABLES.SocialPostGameData(), { ...data, createdAt: now, updatedAt: now });
};

const getExtractionBySocialPost = async (socialPostId) => {
  const result = await queryByIndex(
    TABLES.SocialPostGameData(),
    'bySocialPostExtraction',
    'socialPostId = :socialPostId',
    { ':socialPostId': socialPostId }
  );
  return result.items?.[0] || null;
};

// ===================================================================
// PLACEMENT OPERATIONS
// ===================================================================

const createSocialPostPlacement = async (placement) => {
  const now = new Date().toISOString();
  return putItem(TABLES.SocialPostPlacement(), { ...placement, createdAt: now, updatedAt: now });
};

const getPlacementsByExtraction = async (socialPostGameDataId) => {
  const result = await queryByIndex(
    TABLES.SocialPostPlacement(),
    'byGameDataPlacement',
    'socialPostGameDataId = :id',
    { ':id': socialPostGameDataId }
  );
  return result.items;
};

// ===================================================================
// VENUE OPERATIONS
// ===================================================================

const getVenue = async (id) => getItem(TABLES.Venue(), id);
const getEntity = async (id) => getItem(TABLES.Entity(), id);

const queryVenuesByEntity = async (entityId) => {
  const result = await queryByIndex(
    TABLES.Venue(),
    'byEntity',
    'entityId = :entityId',
    { ':entityId': entityId }
  );
  return result.items;
};

/**
 * Get all venues for content-based matching
 */
const getAllVenues = async () => {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: TABLES.Venue(),
      ProjectionExpression: 'id, #name, aliases, entityId, shortName, city, #state',
      ExpressionAttributeNames: { '#name': 'name', '#state': 'state' }
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[GRAPHQL] Error fetching venues:', error);
    return [];
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  getItem, putItem, updateItem, queryByIndex, deleteItem,
  getSocialPost, updateSocialPost, querySocialPostsByStatus,
  getGame,
  queryGameByTournamentId,
  queryGamesByVenueAndDate,
  queryGamesByMonthAndDate,
  queryGamesByDateRange,
  getYearMonthsInRange,
  queryGamesByEntityAndDate,
  queryGameByEntityAndTournamentId,
  createSocialPostGameLink, getSocialPostGameLink, updateSocialPostGameLink,
  deleteSocialPostGameLink, getLinksBySocialPost, getLinksByGame,
  createSocialPostGameData, getExtractionBySocialPost,
  createSocialPostPlacement, getPlacementsByExtraction,
  getVenue, getEntity, queryVenuesByEntity, getAllVenues,
  TABLES
};