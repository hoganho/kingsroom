/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_SCRAPERSTATETABLE_ARN
	API_KINGSROOM_SCRAPERSTATETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * gameIdTracker Lambda Function
 * 
 * Efficiently tracks tournament IDs, detects gaps, and manages scraping status
 * Uses composite index for optimal DynamoDB queries
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');
// --- End Lambda Monitoring ---

const client = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(client); // Renamed original client

// --- Lambda Monitoring Initialization ---
// Initialize monitoring for this function
const monitoring = new LambdaMonitoring('gameIdTracker', null);
// Wrap the DynamoDB client to automatically track operations
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(originalDdbDocClient);
// --- End Lambda Monitoring ---

const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const SCRAPER_STATE_TABLE = process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME;
const ENTITY_TABLE = process.env.API_KINGSROOM_ENTITYTABLE_NAME;

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 300;

// Unfinished game statuses
const UNFINISHED_STATUSES = [
  'INITIATING',
  'SCHEDULED', 
  'REGISTERING',
  'RUNNING',
  'CLOCK_STOPPED'
];

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const fieldName = event.fieldName;
  const args = event.arguments || {};
  
  // ✅ Track business logic: Handler start
  monitoring.trackOperation('HANDLER_START', 'Handler', fieldName || 'unknown', { operation: fieldName });
  
  try {
    switch (fieldName) {
      case 'getTournamentIdBounds':
        // ✅ Track business logic: Getting bounds
        monitoring.trackOperation('GET_BOUNDS_START', 'Game', args.entityId, { entityId: args.entityId });
        return await getTournamentIdBounds(args.entityId);
      
      case 'getEntityScrapingStatus':
        // ✅ Track business logic: Getting scraping status
        monitoring.trackOperation('GET_STATUS_START', 'Game', args.entityId, { 
          entityId: args.entityId, 
          forceRefresh: args.forceRefresh 
        });
        return await getEntityScrapingStatus(
          args.entityId,
          args.forceRefresh,
          args.startId,
          args.endId
        );
      
      case 'findTournamentIdGaps':
        // ✅ Track business logic: Finding gaps
        monitoring.trackOperation('FIND_GAPS_START', 'Game', args.entityId, { 
          entityId: args.entityId,
          startId: args.startId,
          endId: args.endId
        });
        return await findTournamentIdGaps(
          args.entityId,
          args.startId,
          args.endId,
          args.maxGapsToReturn
        );
      
      case 'getUnfinishedGamesByEntity':
        // ✅ Track business logic: Getting unfinished games
        monitoring.trackOperation('GET_UNFINISHED_START', 'Game', args.entityId, { 
          entityId: args.entityId,
          limit: args.limit
        });
        return await getUnfinishedGamesByEntity(
          args.entityId,
          args.limit,
          args.nextToken
        );
      
      case 'listExistingTournamentIds':
        // ✅ Track business logic: Listing IDs
        monitoring.trackOperation('LIST_IDS_START', 'Game', args.entityId, { 
          entityId: args.entityId,
          startId: args.startId,
          endId: args.endId
        });
        return await listExistingTournamentIds(
          args.entityId,
          args.startId,
          args.endId,
          args.limit
        );
      
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    // ✅ Track business logic: Handler error
    monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', { 
      error: error.message, 
      operation: fieldName 
    });
    console.error('Error:', error);
    throw error;
  } finally {
    // Always flush metrics before the Lambda exits
    if (monitoring) {
      console.log('[gameIdTracker] Flushing monitoring metrics...');
      await monitoring.flush();
      console.log('[gameIdTracker] Monitoring flush complete.');
    }
  }
};

/**
 * Get highest and lowest tournament IDs for an entity
 */
async function getTournamentIdBounds(entityId) {
  console.log(`[getTournamentIdBounds] Getting bounds for entity: ${entityId}`);
  
  // Query for lowest ID
  const lowestQuery = await monitoredDdbDocClient.send(new QueryCommand({
    TableName: GAME_TABLE,
    IndexName: 'byEntityAndTournamentId',
    KeyConditionExpression: 'entityId = :entityId',
    ExpressionAttributeValues: {
      ':entityId': entityId
    },
    ProjectionExpression: 'tournamentId',
    Limit: 1,
    ScanIndexForward: true  // Ascending
  }));
  
  // Query for highest ID
  const highestQuery = await monitoredDdbDocClient.send(new QueryCommand({
    TableName: GAME_TABLE,
    IndexName: 'byEntityAndTournamentId',
    KeyConditionExpression: 'entityId = :entityId',
    ExpressionAttributeValues: {
      ':entityId': entityId
    },
    ProjectionExpression: 'tournamentId',
    Limit: 1,
    ScanIndexForward: false  // Descending
  }));
  
  // Count total games
  const countQuery = await monitoredDdbDocClient.send(new QueryCommand({
    TableName: GAME_TABLE,
    IndexName: 'byEntityAndTournamentId',
    KeyConditionExpression: 'entityId = :entityId',
    ExpressionAttributeValues: {
      ':entityId': entityId
    },
    Select: 'COUNT'
  }));
  
  const lowestId = lowestQuery.Items?.[0]?.tournamentId;
  const highestId = highestQuery.Items?.[0]?.tournamentId;
  const totalCount = countQuery.Count || 0;
  
  console.log(`[getTournamentIdBounds] Bounds: ${lowestId} - ${highestId}, Total: ${totalCount}`);
  
  // ✅ Track business logic: Bounds retrieved
  monitoring.trackOperation('GET_BOUNDS_COMPLETE', 'Game', entityId, { 
    lowestId, 
    highestId, 
    totalCount 
  });
  
  return {
    entityId,
    lowestId,
    highestId,
    totalCount,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get all tournament IDs for an entity (paginated)
 * Uses the byEntityAndTournamentId GSI which has entityId as partition key
 * and tournamentId as sort key for efficient sorted retrieval
 */
async function getAllTournamentIds(entityId) {
  console.log(`[getAllTournamentIds] Fetching all IDs for entity: ${entityId}`);
  
  // ✅ Track business logic: Starting ID collection
  monitoring.trackOperation('GET_ALL_IDS_START', 'Game', entityId, { entityId });
  
  const ids = new Set();
  let lastEvaluatedKey = undefined;
  let iterations = 0;
  
  do {
    const result = await monitoredDdbDocClient.send(new QueryCommand({
      TableName: GAME_TABLE,
      IndexName: 'byEntityAndTournamentId',
      KeyConditionExpression: 'entityId = :entityId',
      ExpressionAttributeValues: {
        ':entityId': entityId
      },
      ProjectionExpression: 'tournamentId',
      Limit: 1000,  // Max items per query
      ExclusiveStartKey: lastEvaluatedKey
    }));
    
    if (result.Items) {
      result.Items.forEach(item => {
        if (item.tournamentId) {
          ids.add(item.tournamentId);
        }
      });
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    iterations++;
    
    console.log(`[getAllTournamentIds] Iteration ${iterations}: Found ${result.Items?.length || 0} items, Total: ${ids.size}`);
    
  } while (lastEvaluatedKey);
  
  console.log(`[getAllTournamentIds] Complete: ${ids.size} unique tournament IDs`);
  
  // ✅ Track business logic: ID collection complete
  monitoring.trackOperation('GET_ALL_IDS_COMPLETE', 'Game', entityId, { 
    totalIds: ids.size,
    iterations 
  });
  
  return ids;
}

/**
 * Calculate gaps in tournament ID sequence
 */
function calculateGaps(foundIds, startId, endId, maxGapsToReturn = 1000) {
  console.log(`[calculateGaps] Finding gaps between ${startId} and ${endId}`);
  
  const gaps = [];
  let currentGapStart = null;
  
  for (let id = startId; id <= endId; id++) {
    if (!foundIds.has(id)) {
      if (currentGapStart === null) {
        currentGapStart = id;
      }
    } else {
      if (currentGapStart !== null) {
        // End of gap
        const gapEnd = id - 1;
        gaps.push({
          start: currentGapStart,
          end: gapEnd,
          count: gapEnd - currentGapStart + 1
        });
        currentGapStart = null;
        
        if (gaps.length >= maxGapsToReturn) {
          console.log(`[calculateGaps] Reached max gaps limit: ${maxGapsToReturn}`);
          break;
        }
      }
    }
  }
  
  // Handle gap that extends to end
  if (currentGapStart !== null && gaps.length < maxGapsToReturn) {
    gaps.push({
      start: currentGapStart,
      end: endId,
      count: endId - currentGapStart + 1
    });
  }
  
  console.log(`[calculateGaps] Found ${gaps.length} gaps`);
  return gaps;
}

/**
 * Get gap summary statistics
 */
function getGapSummary(gaps, totalRange) {
  const totalMissingIds = gaps.reduce((sum, gap) => sum + gap.count, 0);
  const largestGap = gaps.reduce((max, gap) => 
    gap.count > (max?.count || 0) ? gap : max,
    gaps[0]
  );
  
  const coveragePercentage = totalRange > 0 
    ? ((totalRange - totalMissingIds) / totalRange) * 100 
    : 0;
  
  return {
    totalGaps: gaps.length,
    totalMissingIds,
    largestGapStart: largestGap?.start,
    largestGapEnd: largestGap?.end,
    largestGapCount: largestGap?.count,
    coveragePercentage: parseFloat(coveragePercentage.toFixed(2))
  };
}

/**
 * Get cached scraping status from ScraperState
 */
async function getCachedStatus(entityId) {
  try {
    // ✅ Track business logic: Checking cache
    monitoring.trackOperation('CACHE_CHECK', 'ScraperState', entityId, { entityId });
    
    // Find ScraperState by entityId
    const result = await monitoredDdbDocClient.send(new QueryCommand({
      TableName: SCRAPER_STATE_TABLE,
      IndexName: 'byEntityScraperState',
      KeyConditionExpression: 'entityId = :entityId',
      ExpressionAttributeValues: {
        ':entityId': entityId
      },
      Limit: 1
    }));
    
    const scraperState = result.Items?.[0];
    
    if (!scraperState?.lastGapScanAt) {
      // ✅ Track business logic: Cache miss
      monitoring.trackOperation('CACHE_MISS', 'ScraperState', entityId, { reason: 'no_scan_time' });
      return null;
    }
    
    // Check cache age
    const cacheAge = Math.floor(
      (Date.now() - new Date(scraperState.lastGapScanAt).getTime()) / 1000
    );
    
    if (cacheAge > CACHE_TTL) {
      console.log(`[getCachedStatus] Cache expired (${cacheAge}s old)`);
      // ✅ Track business logic: Cache expired
      monitoring.trackOperation('CACHE_EXPIRED', 'ScraperState', entityId, { cacheAge });
      return null;
    }
    
    console.log(`[getCachedStatus] Using cached data (${cacheAge}s old)`);
    // ✅ Track business logic: Cache hit
    monitoring.trackOperation('CACHE_HIT', 'ScraperState', entityId, { cacheAge });
    
    return {
      highestStoredId: scraperState.highestStoredId,
      lowestStoredId: scraperState.lowestStoredId,
      knownGapRanges: scraperState.knownGapRanges 
        ? JSON.parse(scraperState.knownGapRanges) 
        : [],
      totalGamesInDatabase: scraperState.totalGamesInDatabase,
      lastGapScanAt: scraperState.lastGapScanAt,
      cacheAge,
      scraperStateId: scraperState.id
    };
  } catch (error) {
    console.error('[getCachedStatus] Error:', error);
    // ✅ Track business logic: Cache error
    monitoring.trackOperation('CACHE_ERROR', 'ScraperState', entityId, { error: error.message });
    return null;
  }
}

/**
 * Update ScraperState with gap analysis cache
 */
async function updateScraperStateCache(scraperStateId, data) {
  try {
    // ✅ Track business logic: Updating cache
    monitoring.trackOperation('CACHE_UPDATE_START', 'ScraperState', scraperStateId, { 
      highestStoredId: data.highestStoredId,
      lowestStoredId: data.lowestStoredId,
      gapCount: data.knownGapRanges.length
    });
    
    await monitoredDdbDocClient.send(new UpdateCommand({
      TableName: SCRAPER_STATE_TABLE,
      Key: { id: scraperStateId },
      UpdateExpression: `
        SET highestStoredId = :high,
            lowestStoredId = :low,
            knownGapRanges = :gaps,
            lastGapScanAt = :scanTime,
            totalGamesInDatabase = :total
      `,
      ExpressionAttributeValues: {
        ':high': data.highestStoredId,
        ':low': data.lowestStoredId,
        ':gaps': JSON.stringify(data.knownGapRanges),
        ':scanTime': new Date().toISOString(),
        ':total': data.totalGamesInDatabase
      }
    }));
    
    console.log('[updateScraperStateCache] Cache updated successfully');
    // ✅ Track business logic: Cache updated
    monitoring.trackOperation('CACHE_UPDATE_COMPLETE', 'ScraperState', scraperStateId);
  } catch (error) {
    console.error('[updateScraperStateCache] Error:', error);
    // ✅ Track business logic: Cache update failed
    monitoring.trackOperation('CACHE_UPDATE_ERROR', 'ScraperState', scraperStateId, { error: error.message });
  }
}

/**
 * Get entity name from Entity table
 */
async function getEntityName(entityId) {
  try {
    const result = await monitoredDdbDocClient.send(new GetCommand({
      TableName: ENTITY_TABLE,
      Key: { id: entityId },
      ProjectionExpression: 'entityName'
    }));
    
    return result.Item?.entityName;
  } catch (error) {
    console.error('[getEntityName] Error:', error);
    return undefined;
  }
}

/**
 * Get comprehensive entity scraping status
 */
async function getEntityScrapingStatus(entityId, forceRefresh = false, startId, endId) {
  console.log(`[getEntityScrapingStatus] Entity: ${entityId}, Force: ${forceRefresh}`);
  const entityName = await getEntityName(entityId);

  // Try to use cache unless forced refresh
  if (!forceRefresh) {
    const cached = await getCachedStatus(entityId);
    if (cached) {
      // Get unfinished games count
      const unfinishedCount = await getUnfinishedGamesCount(entityId);
      
      const totalRange = (cached.highestStoredId || 0) - (cached.lowestStoredId || 0) + 1;
      const gapSummary = getGapSummary(cached.knownGapRanges, totalRange);
      
      // ✅ Track business logic: Returning cached status
      monitoring.trackOperation('STATUS_FROM_CACHE', 'Game', entityId, { 
        totalGames: cached.totalGamesInDatabase,
        gapCount: cached.knownGapRanges.length
      });
      
      return {
        entityId,
        entityName,
        lowestTournamentId: cached.lowestStoredId,
        highestTournamentId: cached.highestStoredId,
        totalGamesStored: cached.totalGamesInDatabase,
        unfinishedGameCount: unfinishedCount,
        gaps: cached.knownGapRanges,
        gapSummary,
        lastUpdated: cached.lastGapScanAt,
        cacheAge: cached.cacheAge
      };
    }
  }
  
  // Fresh calculation
  console.log('[getEntityScrapingStatus] Performing fresh calculation...');
  // ✅ Track business logic: Starting fresh calculation
  monitoring.trackOperation('STATUS_FRESH_CALC_START', 'Game', entityId, { forceRefresh });
  
  // Get bounds
  const bounds = await getTournamentIdBounds(entityId);
  
  if (!bounds.lowestId || !bounds.highestId) {
    // ✅ Track business logic: No games found
    monitoring.trackOperation('STATUS_NO_GAMES', 'Game', entityId);
    return {
      entityId,
      totalGamesStored: 0,
      unfinishedGameCount: 0,
      gaps: [],
      gapSummary: {
        totalGaps: 0,
        totalMissingIds: 0,
        coveragePercentage: 0
      },
      lastUpdated: new Date().toISOString(),
      cacheAge: 0
    };
  }
  
  // Get all IDs
  const foundIds = await getAllTournamentIds(entityId);
  
  // Calculate gaps
  const rangeStart = startId || bounds.lowestId;
  const rangeEnd = endId || bounds.highestId;
  const gaps = calculateGaps(foundIds, rangeStart, rangeEnd);
  
  // Get unfinished games count
  const unfinishedCount = await getUnfinishedGamesCount(entityId);
  
  // Calculate summary
  const totalRange = rangeEnd - rangeStart + 1;
  const gapSummary = getGapSummary(gaps, totalRange);
  
  // ✅ Track business logic: Fresh calculation complete
  monitoring.trackOperation('STATUS_FRESH_CALC_COMPLETE', 'Game', entityId, { 
    totalGames: bounds.totalCount,
    gapCount: gaps.length,
    coverage: gapSummary.coveragePercentage
  });
  
  // Update cache
  const cached = await getCachedStatus(entityId);
  if (cached?.scraperStateId) {
    await updateScraperStateCache(cached.scraperStateId, {
      highestStoredId: bounds.highestId,
      lowestStoredId: bounds.lowestId,
      knownGapRanges: gaps,
      totalGamesInDatabase: bounds.totalCount
    });
  }
  
  return {
    entityId,
    lowestTournamentId: bounds.lowestId,
    highestTournamentId: bounds.highestId,
    totalGamesStored: bounds.totalCount,
    unfinishedGameCount: unfinishedCount,
    gaps,
    gapSummary,
    lastUpdated: new Date().toISOString(),
    cacheAge: 0
  };
}

/**
 * Find tournament ID gaps
 */
async function findTournamentIdGaps(entityId, startId, endId, maxGapsToReturn = 1000) {
  console.log(`[findTournamentIdGaps] Entity: ${entityId}`);
  
  // Get bounds if not provided
  const bounds = await getTournamentIdBounds(entityId);
  const rangeStart = startId || bounds.lowestId || 1;
  const rangeEnd = endId || bounds.highestId || rangeStart;
  
  // Get all IDs
  const foundIds = await getAllTournamentIds(entityId);
  
  // Calculate gaps
  const gaps = calculateGaps(foundIds, rangeStart, rangeEnd, maxGapsToReturn);
  
  // ✅ Track business logic: Gaps found
  monitoring.trackOperation('GAPS_FOUND', 'Game', entityId, { 
    gapCount: gaps.length,
    rangeStart,
    rangeEnd
  });
  
  return gaps;
}

/**
 * Get count of unfinished games
 */
async function getUnfinishedGamesCount(entityId) {
  // ✅ Track business logic: Counting unfinished games
  monitoring.trackOperation('COUNT_UNFINISHED_START', 'Game', entityId);
  
  let count = 0;
  
  for (const status of UNFINISHED_STATUSES) {
    try {
      const result = await monitoredDdbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byStatus',
        KeyConditionExpression: 'gameStatus = :status',
        FilterExpression: 'entityId = :entityId',
        ExpressionAttributeValues: {
          ':status': status,
          ':entityId': entityId
        },
        Select: 'COUNT'
      }));
      
      count += result.Count || 0;
    } catch (error) {
      console.error(`[getUnfinishedGamesCount] Error for status ${status}:`, error);
    }
  }
  
  // ✅ Track business logic: Unfinished count complete
  monitoring.trackOperation('COUNT_UNFINISHED_COMPLETE', 'Game', entityId, { count });
  
  return count;
}

/**
 * Get unfinished games with pagination
 */
async function getUnfinishedGamesByEntity(entityId, limit = 50, nextToken) {
  console.log(`[getUnfinishedGamesByEntity] Entity: ${entityId}, Limit: ${limit}`);
  
  const items = [];
  let currentToken = nextToken;
  
  // Query each unfinished status
  for (const status of UNFINISHED_STATUSES) {
    if (items.length >= limit) break;
    
    try {
      const result = await monitoredDdbDocClient.send(new QueryCommand({
        TableName: GAME_TABLE,
        IndexName: 'byStatus',
        KeyConditionExpression: 'gameStatus = :status',
        FilterExpression: 'entityId = :entityId',
        ExpressionAttributeValues: {
          ':status': status,
          ':entityId': entityId
        },
        Limit: limit - items.length,
        ExclusiveStartKey: currentToken ? JSON.parse(Buffer.from(currentToken, 'base64').toString()) : undefined
      }));
      
      if (result.Items) {
        items.push(...result.Items);
      }
      
      currentToken = result.LastEvaluatedKey 
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;
      
    } catch (error) {
      console.error(`[getUnfinishedGamesByEntity] Error for status ${status}:`, error);
    }
  }
  
  // Get total count
  const totalCount = await getUnfinishedGamesCount(entityId);
  
  // ✅ Track business logic: Unfinished games retrieved
  monitoring.trackOperation('GET_UNFINISHED_COMPLETE', 'Game', entityId, { 
    itemsReturned: items.length,
    totalCount 
  });
  
  return {
    items,
    nextToken: currentToken,
    totalCount
  };
}

/**
 * List existing tournament IDs in a range
 */
async function listExistingTournamentIds(entityId, startId, endId, limit = 1000) {
  console.log(`[listExistingTournamentIds] Entity: ${entityId}, Range: ${startId}-${endId}`);
  
  const ids = await getAllTournamentIds(entityId);
  const idsArray = Array.from(ids).sort((a, b) => a - b);
  
  // Filter by range if provided
  const filtered = idsArray.filter(id => {
    if (startId && id < startId) return false;
    if (endId && id > endId) return false;
    return true;
  });
  
  const result = filtered.slice(0, limit);
  
  // ✅ Track business logic: IDs listed
  monitoring.trackOperation('LIST_IDS_COMPLETE', 'Game', entityId, { 
    totalIds: ids.size,
    filteredCount: filtered.length,
    returnedCount: result.length
  });
  
  return result;
}