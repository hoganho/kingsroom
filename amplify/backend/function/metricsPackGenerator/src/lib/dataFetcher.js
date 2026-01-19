/**
 * Data Fetcher (Improved v2)
 * ==========================
 * Fetches data from DynamoDB tables with automatic name resolution.
 * 
 * Key improvements:
 * - Snapshots enriched with venue/game names automatically
 * - Schedule compliance data (cancelled games)
 * - Recurring game trend metrics (pre-calculated)
 * - Series lifecycle data (active/upcoming/completed)
 * - Competitor analysis (schedule clashes, market pressure)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { enrichSnapshotsWithNames, buildVenueLookupFromSnapshots } = require('./nameResolver');
const { buildScheduleComplianceData } = require('./scheduleComplianceFetcher');
const { buildRecurringGameTrendsData } = require('./recurringGameTrendsFetcher');
const { buildSeriesLifecycleData } = require('./seriesLifecycleFetcher');
const { buildCompetitorAnalysisData } = require('./competitorAnalyzer');

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
 * Fetch GameFinancialSnapshots for a period WITH NAME RESOLUTION.
 * This is the primary method - use this instead of raw fetches.
 * 
 * GSI: byEntityGameFinancialSnapshot (entityId, gameStartDateTime)
 * 
 * @param {string} entityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @param {boolean} enrichNames - Whether to resolve venue/game names (default: true)
 * @returns {Object[]} Array of enriched snapshots
 */
async function fetchSnapshotsForPeriod(entityId, periodStart, periodEnd, enrichNames = true) {
  const tableName = getTableName('GameFinancialSnapshot');
  const snapshots = [];
  let lastEvaluatedKey = undefined;
  
  console.log(`Fetching snapshots for entity ${entityId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: tableName,
        IndexName: 'byEntityGameFinancialSnapshot',
        KeyConditionExpression: 'entityId = :entityId AND gameStartDateTime BETWEEN :start AND :end',
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
    
    console.log(`Found ${snapshots.length} raw snapshots`);
  } catch (error) {
    console.error('GameFinancialSnapshot fetch failed:', error.message);
    throw error; // Re-throw - snapshots are critical
  }
  
  // Enrich with names if requested
  if (enrichNames && snapshots.length > 0) {
    return await enrichSnapshotsWithNames(snapshots);
  }
  
  return snapshots;
}

/**
 * Fetch VenueMetrics for an entity.
 * GSI: byEntityVenueMetrics (entityId)
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
    // Continue without venue metrics - they're supplementary
  }
  
  return metrics;
}

/**
 * Fetch player data (entries and results) for a period.
 * 
 * PlayerEntry GSI: byEntityEntry (entityId, gameStartDateTime)
 * PlayerResult GSI: byEntityResult (entityId, gameStartDateTime)
 * 
 * @param {string} entityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @returns {{ entries: Object[], results: Object[] }}
 */
async function fetchPlayerData(entityId, periodStart, periodEnd) {
  const entries = [];
  const results = [];
  
  // Fetch PlayerEntry using GSI
  try {
    const entryTableName = getTableName('PlayerEntry');
    let lastKey = undefined;
    
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: entryTableName,
        IndexName: 'byEntityEntry',
        KeyConditionExpression: 'entityId = :entityId AND gameStartDateTime BETWEEN :start AND :end',
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
    
    console.log(`Found ${entries.length} player entries`);
  } catch (error) {
    console.warn('PlayerEntry fetch failed:', error.message);
    // Continue - player data is supplementary
  }
  
  // Fetch PlayerResult using GSI
  try {
    const resultTableName = getTableName('PlayerResult');
    let lastKey = undefined;
    
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: resultTableName,
        IndexName: 'byEntityResult',
        KeyConditionExpression: 'entityId = :entityId AND gameStartDateTime BETWEEN :start AND :end',
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
    
    console.log(`Found ${results.length} player results`);
  } catch (error) {
    console.warn('PlayerResult fetch failed:', error.message);
  }
  
  return { entries, results };
}

/**
 * Fetch social media data for a period.
 * 
 * SocialAccount GSI: bySocialAccountEntity (entityId)
 * SocialPost GSI: bySocialAccount (socialAccountId, postedAt)
 */
async function fetchSocialData(entityId, periodStart, periodEnd) {
  const ourAccounts = [];
  const ourPosts = [];
  const competitorAccounts = [];
  const competitorPosts = [];
  
  try {
    // Fetch social accounts
    const accountTableName = getTableName('SocialAccount');
    const accountResult = await docClient.send(new QueryCommand({
      TableName: accountTableName,
      IndexName: 'bySocialAccountEntity',
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
          IndexName: 'bySocialAccount',
          KeyConditionExpression: 'socialAccountId = :accountId AND postedAt BETWEEN :start AND :end',
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
    
    console.log(`Found ${ourPosts.length} our posts and ${competitorPosts.length} competitor posts`);
  } catch (error) {
    console.warn('Social data fetch failed:', error.message);
  }
  
  return { ourAccounts, ourPosts, competitorAccounts, competitorPosts };
}

/**
 * Fetch all data needed for a MetricsPack in one call.
 * This orchestrates all the individual fetchers and handles name resolution.
 * 
 * @param {string} entityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @param {Date} compPeriodStart - Comparison period start (optional)
 * @param {Date} compPeriodEnd - Comparison period end (optional)
 * @param {Object} options - Additional options
 * @returns {Object} All data needed for pack generation
 */
async function fetchAllPackData(entityId, periodStart, periodEnd, compPeriodStart = null, compPeriodEnd = null, options = {}) {
  const {
    includeScheduleCompliance = true,
    includeRecurringGameTrends = true,
    includeSeriesLifecycle = true,
    includeCompetitorAnalysis = true,
    businessLocation = null // For competitor analysis scope
  } = options;
  
  console.log('=== Fetching all pack data (v2) ===');
  const startTime = Date.now();
  
  // Fetch current period snapshots with name resolution
  const snapshots = await fetchSnapshotsForPeriod(entityId, periodStart, periodEnd, true);
  
  // Build venue lookup from enriched snapshots (for reuse)
  const venueLookup = buildVenueLookupFromSnapshots(snapshots);
  
  // Fetch comparison period snapshots (also with names)
  let compSnapshots = [];
  if (compPeriodStart && compPeriodEnd) {
    compSnapshots = await fetchSnapshotsForPeriod(entityId, compPeriodStart, compPeriodEnd, true);
    // Merge venue names into lookup
    for (const s of compSnapshots) {
      if (s.venueId && s.venueName) {
        venueLookup.set(s.venueId, s.venueName);
      }
    }
  }
  
  // Fetch supplementary data in parallel
  const [venueMetrics, playerData, socialData] = await Promise.all([
    fetchVenueMetrics(entityId),
    fetchPlayerData(entityId, periodStart, periodEnd),
    fetchSocialData(entityId, periodStart, periodEnd)
  ]);
  
  // Fetch enhanced data modules (conditionally, in parallel)
  const enhancedDataPromises = [];
  
  if (includeScheduleCompliance) {
    enhancedDataPromises.push(
      buildScheduleComplianceData(entityId, periodStart, periodEnd, venueLookup)
        .then(data => ({ key: 'scheduleCompliance', data }))
        .catch(err => {
          console.warn('Schedule compliance fetch failed:', err.message);
          return { key: 'scheduleCompliance', data: { hasScheduleData: false, error: err.message } };
        })
    );
  }
  
  if (includeRecurringGameTrends) {
    enhancedDataPromises.push(
      buildRecurringGameTrendsData(entityId, venueLookup)
        .then(data => ({ key: 'recurringGameTrends', data }))
        .catch(err => {
          console.warn('Recurring game trends fetch failed:', err.message);
          return { key: 'recurringGameTrends', data: { hasRecurringGameData: false, error: err.message } };
        })
    );
  }
  
  if (includeSeriesLifecycle) {
    enhancedDataPromises.push(
      buildSeriesLifecycleData(entityId, periodStart, periodEnd)
        .then(data => ({ key: 'seriesLifecycle', data }))
        .catch(err => {
          console.warn('Series lifecycle fetch failed:', err.message);
          return { key: 'seriesLifecycle', data: { hasSeriesData: false, error: err.message } };
        })
    );
  }
  
  if (includeCompetitorAnalysis) {
    enhancedDataPromises.push(
      buildCompetitorAnalysisData(entityId, snapshots, periodStart, periodEnd, businessLocation)
        .then(data => ({ key: 'competitorAnalysis', data }))
        .catch(err => {
          console.warn('Competitor analysis fetch failed:', err.message);
          return { key: 'competitorAnalysis', data: { hasCompetitorData: false, error: err.message } };
        })
    );
  }
  
  // Wait for all enhanced data
  const enhancedResults = await Promise.all(enhancedDataPromises);
  const enhancedData = {};
  for (const result of enhancedResults) {
    enhancedData[result.key] = result.data;
  }
  
  console.log(`=== All data fetched in ${Date.now() - startTime}ms ===`);
  console.log(`Snapshots: ${snapshots.length} current, ${compSnapshots.length} comparison`);
  console.log(`Player data: ${playerData.entries.length} entries, ${playerData.results.length} results`);
  console.log(`Venues in lookup: ${venueLookup.size}`);
  console.log(`Enhanced modules: ${Object.keys(enhancedData).join(', ')}`);
  
  return {
    snapshots,
    compSnapshots,
    venueMetrics,
    playerData,
    socialData,
    venueLookup,
    // New enhanced data
    scheduleCompliance: enhancedData.scheduleCompliance || null,
    recurringGameTrends: enhancedData.recurringGameTrends || null,
    seriesLifecycle: enhancedData.seriesLifecycle || null,
    competitorAnalysis: enhancedData.competitorAnalysis || null,
    meta: {
      fetchDurationMs: Date.now() - startTime,
      snapshotCount: snapshots.length,
      compSnapshotCount: compSnapshots.length,
      playerEntryCount: playerData.entries.length,
      playerResultCount: playerData.results.length,
      enhancedModules: Object.keys(enhancedData)
    }
  };
}

module.exports = {
  fetchSnapshotsForPeriod,
  fetchVenueMetrics,
  fetchPlayerData,
  fetchSocialData,
  fetchAllPackData
};
