/**
 * db-client.js
 * DynamoDB client and table name resolution for the enricher
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// CLIENT INITIALIZATION
// ===================================================================

let ddbDocClient = null;

/**
 * Get or create the DynamoDB Document Client
 * Singleton pattern for Lambda warm starts
 */
const getDocClient = () => {
  if (!ddbDocClient) {
    const ddbClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'ap-southeast-2'
    });
    
    ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        convertEmptyValues: true,
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
      },
      unmarshallOptions: {
        wrapNumbers: false
      }
    });
  }
  
  return ddbDocClient;
};

// ===================================================================
// TABLE NAME RESOLUTION
// ===================================================================

/**
 * Get the full table name for a model
 * Handles Amplify's table naming convention: ModelName-apiId-env
 * 
 * @param {string} modelName - The model name (e.g., 'Game', 'TournamentSeries')
 * @returns {string} Full table name
 */
const getTableName = (modelName) => {
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || process.env.API_ID;
  const env = process.env.ENV || 'dev';
  
  if (!apiId) {
    console.warn(`[DB] No API ID found, using fallback table name for ${modelName}`);
    return `${modelName}-${env}`;
  }
  
  return `${modelName}-${apiId}-${env}`;
};

// ===================================================================
// GENERIC DB OPERATIONS
// ===================================================================

/**
 * Get a single item by ID
 */
const getItemById = async (modelName, id) => {
  const client = getDocClient();
  const tableName = getTableName(modelName);
  
  try {
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id }
    }));
    return result.Item || null;
  } catch (error) {
    console.error(`[DB] Error getting ${modelName} by ID:`, error);
    throw error;
  }
};

/**
 * Query items using a GSI
 */
const queryByIndex = async (modelName, indexName, keyCondition, keyValues, filterExpression = null, filterValues = null) => {
  const client = getDocClient();
  const tableName = getTableName(modelName);
  
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: keyValues
  };
  
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = { ...keyValues, ...filterValues };
  }
  
  try {
    const result = await client.send(new QueryCommand(params));
    return result.Items || [];
  } catch (error) {
    console.error(`[DB] Error querying ${modelName} by index ${indexName}:`, error);
    throw error;
  }
};

/**
 * Create a new item
 */
const createItem = async (modelName, item) => {
  const client = getDocClient();
  const tableName = getTableName(modelName);
  
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  const fullItem = {
    ...item,
    createdAt: item.createdAt || now,
    updatedAt: now,
    _version: 1,
    _lastChangedAt: timestamp,
    __typename: modelName
  };
  
  try {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: fullItem
    }));
    return fullItem;
  } catch (error) {
    console.error(`[DB] Error creating ${modelName}:`, error);
    throw error;
  }
};

/**
 * Update an existing item
 */
const updateItem = async (modelName, id, updates) => {
  const client = getDocClient();
  const tableName = getTableName(modelName);
  
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  // Add standard update fields
  updates.updatedAt = now;
  updates._lastChangedAt = timestamp;
  
  // Build update expression
  const updateKeys = Object.keys(updates);
  const updateExpression = 'SET ' + updateKeys.map(k => `#${k} = :${k}`).join(', ');
  const expressionAttributeNames = Object.fromEntries(updateKeys.map(k => [`#${k}`, k]));
  const expressionAttributeValues = Object.fromEntries(updateKeys.map(k => [`:${k}`, updates[k]]));
  
  try {
    const result = await client.send(new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }));
    return result.Attributes;
  } catch (error) {
    console.error(`[DB] Error updating ${modelName}:`, error);
    throw error;
  }
};

/**
 * Scan table (use sparingly - for small tables only)
 */
const scanTable = async (modelName, filterExpression = null, filterValues = null, filterNames = null) => {
  const client = getDocClient();
  const tableName = getTableName(modelName);
  
  const params = { TableName: tableName };
  
  if (filterExpression) {
    params.FilterExpression = filterExpression;
    params.ExpressionAttributeValues = filterValues;
    if (filterNames) {
      params.ExpressionAttributeNames = filterNames;
    }
  }
  
  try {
    const result = await client.send(new ScanCommand(params));
    return result.Items || [];
  } catch (error) {
    console.error(`[DB] Error scanning ${modelName}:`, error);
    throw error;
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  getDocClient,
  getTableName,
  getItemById,
  queryByIndex,
  createItem,
  updateItem,
  scanTable,
  
  // Re-export commands for direct use if needed
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand
};
