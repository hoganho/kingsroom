/**
 * Data Fetcher
 * ============
 * Fetches data from DynamoDB tables.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name: {TableName}-{apiId}-{env}
const getTableName = (baseName) => {
  // Check for explicit env var first (set by CloudFormation import)
  const envVarName = `API_KINGSROOM_${baseName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  // Otherwise construct dynamically
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

/**
 * Fetch GameFinancialSnapshots for a period
 */
async function fetchSnapshotsForPeriod(entityId, periodStart, periodEnd) {
  const tableName = getTableName('GameFinancialSnapshot');
  const snapshots = [];
  let lastEvaluatedKey = undefined;
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'byEntityGameFinancialSnapshot',
        KeyConditionExpression: 'entityId = :entityId',
        FilterExpression: 'gameStartDateTime BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':entityId': entityId,
          ':start': periodStart.toISOString(),
          ':end': periodEnd.toISOString()
        },
        ExclusiveStartKey: lastEvaluatedKey
      }));
      
      if (result.Items) {
        snapshots.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    console.warn('GameFinancialSnapshot fetch failed:', error.message);
  }
  
  return snapshots;
}

/**
 * Fetch VenueMetrics for an entity
 */
async function fetchVenueMetrics(entityId) {
  const tableName = getTableName('VenueMetrics');
  const metrics = [];
  
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byEntityVenueMetrics',
      KeyConditionExpression: 'entityId = :entityId',
      FilterExpression: 'timeRange = :timeRange',
      ExpressionAttributeValues: {
        ':entityId': entityId,
        ':timeRange': '1M'
      }
    }));
    
    if (result.Items) {
      metrics.push(...result.Items);
    }
  } catch (error) {
    console.warn('VenueMetrics fetch failed:', error.message);
  }
  
  return metrics;
}

/**
 * Fetch player data (entries and results) for a period
 */
async function fetchPlayerData(entityId, periodStart, periodEnd) {
  const entries = [];
  const results = [];
  
  // Fetch PlayerEntry
  try {
    const entryTableName = getTableName('PlayerEntry');
    let lastKey = undefined;
    
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: entryTableName,
        IndexName: 'byEntityPlayerEntry',
        KeyConditionExpression: 'entityId = :entityId',
        FilterExpression: 'createdAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':entityId': entityId,
          ':start': periodStart.toISOString(),
          ':end': periodEnd.toISOString()
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        entries.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn('PlayerEntry fetch failed:', error.message);
  }
  
  // Fetch PlayerResult
  try {
    const resultTableName = getTableName('PlayerResult');
    let lastKey = undefined;
    
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: resultTableName,
        IndexName: 'byEntityPlayerResult',
        KeyConditionExpression: 'entityId = :entityId',
        FilterExpression: 'createdAt BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':entityId': entityId,
          ':start': periodStart.toISOString(),
          ':end': periodEnd.toISOString()
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        results.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn('PlayerResult fetch failed:', error.message);
  }
  
  return { entries, results };
}

/**
 * Fetch social media data for a period
 */
async function fetchSocialData(entityId, periodStart, periodEnd) {
  const ourAccounts = [];
  const ourPosts = [];
  const competitorAccounts = [];
  const competitorPosts = [];
  
  try {
    // Fetch our social accounts
    const accountTableName = getTableName('SocialAccount');
    const accountResult = await docClient.send(new QueryCommand({
      TableName: accountTableName,
      IndexName: 'byEntitySocialAccount',
      KeyConditionExpression: 'entityId = :entityId',
      ExpressionAttributeValues: {
        ':entityId': entityId
      }
    }));
    
    if (accountResult.Items) {
      for (const account of accountResult.Items) {
        if (account.isCompetitor) {
          competitorAccounts.push(account);
        } else {
          ourAccounts.push(account);
        }
      }
    }
    
    // Fetch posts for all accounts
    const postTableName = getTableName('SocialPost');
    const allAccountIds = [...ourAccounts, ...competitorAccounts].map(a => a.id);
    
    for (const accountId of allAccountIds) {
      let lastKey = undefined;
      
      do {
        const postResult = await docClient.send(new QueryCommand({
          TableName: postTableName,
          IndexName: 'byAccountSocialPost',
          KeyConditionExpression: 'accountId = :accountId',
          FilterExpression: 'postedAt BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':accountId': accountId,
            ':start': periodStart.toISOString(),
            ':end': periodEnd.toISOString()
          },
          ExclusiveStartKey: lastKey
        }));
        
        if (postResult.Items) {
          const isOurAccount = ourAccounts.some(a => a.id === accountId);
          if (isOurAccount) {
            ourPosts.push(...postResult.Items);
          } else {
            competitorPosts.push(...postResult.Items);
          }
        }
        lastKey = postResult.LastEvaluatedKey;
      } while (lastKey);
    }
  } catch (error) {
    console.warn('Social data fetch failed:', error.message);
  }
  
  return { ourAccounts, ourPosts, competitorAccounts, competitorPosts };
}

module.exports = {
  fetchSnapshotsForPeriod,
  fetchVenueMetrics,
  fetchPlayerData,
  fetchSocialData
};
