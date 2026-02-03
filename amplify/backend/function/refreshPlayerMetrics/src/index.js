/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYPLAYERMETRICSTABLE_ARN
	API_KINGSROOM_ENTITYPLAYERMETRICSTABLE_NAME
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GLOBALPLAYERMETRICSTABLE_ARN
	API_KINGSROOM_GLOBALPLAYERMETRICSTABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_PLAYERSUMMARYTABLE_ARN
	API_KINGSROOM_PLAYERSUMMARYTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_PLAYERVENUETABLE_ARN
	API_KINGSROOM_PLAYERVENUETABLE_NAME
	API_KINGSROOM_VENUEPLAYERMETRICSTABLE_ARN
	API_KINGSROOM_VENUEPLAYERMETRICSTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * Lambda: refreshPlayerMetrics
 * Region: ap-southeast-2
 * 
 * VERSION: 1.3.0 - Fixed avgGamesPerPlayer calculation (use PlayerVenue data instead of Player.summary)
 *                - Added topPlayersByBuyIns to EntityPlayerMetrics for entity-level Top Spenders
 * 
 * CHANGELOG:
 * - v1.2.0: Fixed double-stringify on AWSJSON fields (now stores raw objects)
 *           Added SES email notification on scheduled runs
 * - v1.1.0: Added cross-venue/entity distribution metrics
 * 
 * PURPOSE:
 * Pre-calculates and stores player statistics at multiple levels:
 * - GlobalPlayerMetrics: Aggregate across all entities
 * - EntityPlayerMetrics: Per-entity player stats
 * - VenuePlayerMetrics: Per-venue player stats
 * 
 * INVOCATION SOURCES:
 * 1. GraphQL Mutation: event.arguments.input
 * 2. EventBridge Scheduled Rule: event.source === 'aws.events'
 * 3. Direct Lambda Invoke: event.input
 * 
 * TIME RANGES: ALL, 12M, 6M, 3M, 1M
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  DynamoDBDocumentClient, 
  QueryCommand, 
  ScanCommand,
  PutCommand,
  BatchGetCommand
} = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { sendNotification } = require('./ses-notification');

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({ region: "ap-southeast-2" });

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

const TIME_RANGES = ['ALL', '12M', '6M', '3M', '1M'];

// Status enum values (must match GraphQL schema)
const PLAYER_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION'
};

// Category enum values (v2: matches updated GraphQL schema)
const PLAYER_CATEGORY = {
  // New enum values
  TRIALIST: 'TRIALIST',       // Early-stage explorer (was NEW)
  CASUAL: 'CASUAL',           // Plays occasionally (was RECREATIONAL)
  COMMITTED: 'COMMITTED',     // Regular intent, not weekly (new)
  REGULAR: 'REGULAR',         // Weekly participation sustained
  VIP: 'VIP',                 // Top 5% by value
  // Legacy values (for backward compatibility during transition)
  NEW: 'NEW',                 // @deprecated - maps to TRIALIST
  RECREATIONAL: 'RECREATIONAL', // @deprecated - maps to CASUAL
  LAPSED: 'LAPSED'            // @deprecated - removed from enum
};

// Targeting classification enum values
const TARGETING = {
  NOT_PLAYED: 'NotPlayed',
  ACTIVE_EL: 'Active_EL',
  ACTIVE: 'Active',
  RETAIN_31_60: 'Retain_Inactive31_60d',
  RETAIN_61_90: 'Retain_Inactive61_90d',
  CHURNED_91_120: 'Churned_91_120d',
  CHURNED_121_180: 'Churned_121_180d',
  CHURNED_181_360: 'Churned_181_360d',
  CHURNED_361: 'Churned_361d'
};

// Index names
const INDEX_NAMES = {
  PLAYER_BY_ENTITY: 'byPrimaryEntity',
  PLAYER_BY_REGISTRATION_VENUE: 'byRegistrationVenue',
  PLAYER_VENUE_BY_PLAYER: 'byPlayer',
  PLAYER_VENUE_BY_VENUE: 'byVenue',
  PLAYER_SUMMARY_BY_PLAYER: 'byPlayer',
  VENUE_BY_ENTITY: 'byEntityVenue'
};

// ============================================
// TABLE NAME RESOLUTION
// ============================================

const getTableName = (modelName) => {
  const apiVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
  if (process.env[apiVarName]) {
    return process.env[apiVarName];
  }

  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;

  if (apiId && env) {
    return `${modelName}-${apiId}-${env}`;
  }

  console.warn(`[PLAYER-METRICS] Could not resolve table name for ${modelName}.`);
  return null;
};

// Tables
const PLAYER_TABLE = getTableName('Player');
const PLAYER_SUMMARY_TABLE = getTableName('PlayerSummary');
const PLAYER_VENUE_TABLE = getTableName('PlayerVenue');
const ENTITY_TABLE = getTableName('Entity');
const VENUE_TABLE = getTableName('Venue');

// Metrics Tables
const GLOBAL_PLAYER_METRICS_TABLE = getTableName('GlobalPlayerMetrics');
const ENTITY_PLAYER_METRICS_TABLE = getTableName('EntityPlayerMetrics');
const VENUE_PLAYER_METRICS_TABLE = getTableName('VenuePlayerMetrics');

// ============================================
// MAIN HANDLER
// ============================================

exports.handler = async (event) => {
  console.log('[PLAYER-METRICS] Starting player metrics refresh v1.3.1', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();
  
  // Detect invocation source
  const isEventBridgeTrigger = 
    event.source === 'aws.events' || 
    event['detail-type'] === 'Scheduled Event' ||
    event.triggerType === 'SCHEDULED';
  
  const isGraphQLTrigger = !!event.arguments?.input;
  const isDirectInvoke = !!event.input && !isEventBridgeTrigger;
  const isAsyncBackground = event._asyncBackground === true;
  
  // ============================================================
  // ASYNC SELF-INVOCATION for GraphQL triggers
  // AppSync @function resolver has a 30s timeout that can't be
  // changed via Amplify config. To avoid timeouts, we detect
  // GraphQL invocations and re-invoke ourselves asynchronously
  // (InvocationType: 'Event'), then return immediately.
  // The background invocation sets _asyncBackground: true so
  // it won't loop.
  // ============================================================
  if (isGraphQLTrigger && !isAsyncBackground) {
    console.log('[PLAYER-METRICS] GraphQL trigger detected — launching async background invocation');
    
    const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
    const backgroundPayload = {
      ...event.arguments.input,
      _asyncBackground: true,
      _triggeredBy: 'GRAPHQL_ASYNC',
    };
    
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'Event',  // Fire-and-forget (async)
        Payload: JSON.stringify({ input: backgroundPayload }),
      }));
      
      console.log('[PLAYER-METRICS] Background invocation launched successfully');
      
      return {
        success: true,
        message: `Refresh started asynchronously. The Lambda is running in the background (function: ${functionName}). Check CloudWatch logs for progress.`,
        triggeredBy: 'GRAPHQL_ASYNC',
        executionTimeMs: Date.now() - startTime,
        refreshedAt: new Date().toISOString(),
        globalMetricsUpdated: 0,
        entityMetricsUpdated: 0,
        venueMetricsUpdated: 0,
        totalPlayersScanned: 0,
        errors: [],
      };
    } catch (invokeErr) {
      console.error('[PLAYER-METRICS] Failed to launch async invocation:', invokeErr);
      return {
        success: false,
        message: `Failed to launch async invocation: ${invokeErr.message}. Check that the Lambda has lambda:InvokeFunction permission on itself.`,
        triggeredBy: 'GRAPHQL_ASYNC',
        executionTimeMs: Date.now() - startTime,
        errors: [invokeErr.message],
      };
    }
  }
  
  // Handle getPlayerMetricsDashboard query
  if (event.field === 'getPlayerMetricsDashboard' || event.fieldName === 'getPlayerMetricsDashboard') {
    return handleDashboardQuery(event.arguments || {});
  }
  
  // Default configuration
  const DEFAULTS = {
    entityId: null,
    venueId: null,
    timeRanges: TIME_RANGES,
    includeGlobalMetrics: true,
    includeEntityMetrics: true,
    includeVenueMetrics: true,
    dryRun: false,
    verbose: false
  };
  
  // Parse input based on source
  let input = {};
  if (isEventBridgeTrigger) {
    input = { ...DEFAULTS, ...(event.input || {}), _triggeredBy: 'EVENTBRIDGE_SCHEDULE' };
  } else if (isGraphQLTrigger) {
    input = { ...DEFAULTS, ...(event.arguments.input || {}), _triggeredBy: 'GRAPHQL_MUTATION' };
  } else if (isDirectInvoke) {
    input = { ...DEFAULTS, ...(event.input || {}), _triggeredBy: 'DIRECT_INVOKE' };
  } else {
    input = { ...DEFAULTS, _triggeredBy: 'UNKNOWN' };
  }
  
  const {
    entityId,
    venueId,
    timeRanges,
    includeGlobalMetrics,
    includeEntityMetrics,
    includeVenueMetrics,
    dryRun,
    verbose,
    _triggeredBy
  } = input;
  
  console.log('[PLAYER-METRICS] Configuration:', {
    triggeredBy: _triggeredBy,
    entityId,
    venueId,
    timeRanges,
    includeGlobalMetrics,
    includeEntityMetrics,
    includeVenueMetrics,
    dryRun
  });
  
  const result = {
    success: true,
    message: '',
    triggeredBy: _triggeredBy,
    globalMetricsUpdated: 0,
    entityMetricsUpdated: 0,
    venueMetricsUpdated: 0,
    totalPlayersScanned: 0,
    totalPlayerVenuesScanned: 0,
    entitiesProcessed: 0,
    venuesProcessed: 0,
    executionTimeMs: 0,
    errors: [],
    warnings: [],
    globalResults: [],
    entityResults: [],
    venueResults: [],
    refreshedAt: new Date().toISOString()
  };
  
  try {
    // Validate tables exist
    if (!PLAYER_TABLE || !ENTITY_TABLE) {
      throw new Error('Configuration Error: Missing required table name environment variables.');
    }
    
    // 1. Fetch all entities
    let entities = await getAllEntities();
    if (entityId) {
      entities = entities.filter(e => e.id === entityId);
    }
    
    console.log(`[PLAYER-METRICS] Processing ${entities.length} entities`);
    
    // 2. Fetch all players with summaries (do this once for global metrics)
    const allPlayers = await getAllPlayersWithSummaries();
    result.totalPlayersScanned = allPlayers.length;
    
    console.log(`[PLAYER-METRICS] Loaded ${allPlayers.length} players`);
    
    // 3. Fetch all PlayerVenue records for activity data
    const allPlayerVenues = await getAllPlayerVenues();
    result.totalPlayerVenuesScanned = allPlayerVenues.length;
    
    console.log(`[PLAYER-METRICS] Loaded ${allPlayerVenues.length} player-venue records`);
    
    // 4. Fetch all venues
    let allVenues = await getAllVenues();
    if (venueId) {
      allVenues = allVenues.filter(v => v.id === venueId);
    }
    
    // 5. Build cross-venue/entity lookup maps (used across all calculations)
    const crossVenueMaps = buildCrossVenueMaps(allPlayerVenues);
    
    // 6. Calculate metrics for each time range
    for (const timeRange of timeRanges) {
      const timeFilteredPlayers = filterPlayersByTimeRange(allPlayers, timeRange);
      const timeFilteredPlayerVenues = filterPlayerVenuesByTimeRange(allPlayerVenues, timeRange);
      
      // Rebuild cross-venue maps for this time range
      const timeFilteredCrossVenueMaps = buildCrossVenueMaps(timeFilteredPlayerVenues);
      
      if (verbose) {
        console.log(`[PLAYER-METRICS] ${timeRange}: ${timeFilteredPlayers.length} players, ${timeFilteredPlayerVenues.length} player-venues`);
      }
      
      // 6a. Global Metrics
      if (includeGlobalMetrics && !entityId && !venueId) {
        try {
          const globalMetrics = calculateGlobalMetrics(
            timeFilteredPlayers,
            timeFilteredPlayerVenues,
            entities,
            allVenues,
            timeRange,
            timeFilteredCrossVenueMaps
          );
          
          if (!dryRun) {
            await saveGlobalPlayerMetrics(globalMetrics);
            result.globalMetricsUpdated++;
          }
          
          result.globalResults.push({
            id: globalMetrics.id,
            name: 'Global',
            type: 'global',
            timeRange,
            success: true,
            playerCount: globalMetrics.totalPlayers
          });
        } catch (error) {
          console.error(`[PLAYER-METRICS] Error calculating global metrics for ${timeRange}:`, error);
          result.errors.push(`Global/${timeRange}: ${error.message}`);
        }
      }
      
      // 6b. Entity Metrics
      if (includeEntityMetrics && !venueId) {
        for (const entity of entities) {
          try {
            result.entitiesProcessed++;
            
            // Filter players by entity
            const entityPlayers = timeFilteredPlayers.filter(p => p.primaryEntityId === entity.id);
            const entityVenues = allVenues.filter(v => v.entityId === entity.id);
            const entityPlayerVenues = timeFilteredPlayerVenues.filter(pv => pv.entityId === entity.id);
            
            // Also count players registered at this entity's venues
            const registrationVenueIds = new Set(entityVenues.map(v => v.id));
            const playersRegisteredHere = timeFilteredPlayers.filter(p => 
              registrationVenueIds.has(p.registrationVenueId)
            );
            
            const entityMetrics = calculateEntityMetrics(
              entity,
              entityPlayers,
              entityPlayerVenues,
              entityVenues,
              playersRegisteredHere,
              timeRange,
              timeFilteredCrossVenueMaps
            );
            
            if (!dryRun) {
              await saveEntityPlayerMetrics(entityMetrics);
              result.entityMetricsUpdated++;
            }
            
            result.entityResults.push({
              id: entityMetrics.id,
              name: entity.entityName,
              type: 'entity',
              timeRange,
              success: true,
              playerCount: entityMetrics.totalPlayers
            });
            
          } catch (error) {
            console.error(`[PLAYER-METRICS] Error calculating entity metrics for ${entity.entityName}/${timeRange}:`, error);
            result.errors.push(`Entity ${entity.entityName}/${timeRange}: ${error.message}`);
          }
        }
      }
      
      // 6c. Venue Metrics
      if (includeVenueMetrics) {
        const venuesToProcess = venueId 
          ? allVenues.filter(v => v.id === venueId)
          : allVenues;
          
        for (const venue of venuesToProcess) {
          try {
            result.venuesProcessed++;
            
            // Get PlayerVenue records for this venue
            const venuePlayerVenues = timeFilteredPlayerVenues.filter(pv => pv.venueId === venue.id);
            
            // Get players who registered at this venue
            const playersRegisteredHere = timeFilteredPlayers.filter(p => p.registrationVenueId === venue.id);
            
            // Get unique player IDs who have played at this venue
            const playerIds = new Set(venuePlayerVenues.map(pv => pv.playerId));
            const venuePlayers = timeFilteredPlayers.filter(p => playerIds.has(p.id));
            
            const venueMetrics = calculateVenueMetrics(
              venue,
              venuePlayers,
              venuePlayerVenues,
              playersRegisteredHere,
              timeRange,
              timeFilteredCrossVenueMaps
            );
            
            if (!dryRun) {
              await saveVenuePlayerMetrics(venueMetrics);
              result.venueMetricsUpdated++;
            }
            
            result.venueResults.push({
              id: venueMetrics.id,
              name: venue.name,
              type: 'venue',
              timeRange,
              success: true,
              playerCount: venueMetrics.totalPlayers
            });
            
          } catch (error) {
            console.error(`[PLAYER-METRICS] Error calculating venue metrics for ${venue.name}/${timeRange}:`, error);
            result.errors.push(`Venue ${venue.name}/${timeRange}: ${error.message}`);
          }
        }
      }
    }
    
    result.executionTimeMs = Date.now() - startTime;
    result.message = dryRun 
      ? `Dry run complete. Would update ${result.globalMetricsUpdated} global, ${result.entityMetricsUpdated} entity, ${result.venueMetricsUpdated} venue metrics.`
      : `Player metrics refresh complete. Updated ${result.globalMetricsUpdated} global, ${result.entityMetricsUpdated} entity, ${result.venueMetricsUpdated} venue metrics.`;
    
    console.log('[PLAYER-METRICS] Refresh complete:', result);

    // === NOTIFICATION CODE START ===
    // Send notification for EventBridge-triggered runs
    if (isEventBridgeTrigger && !dryRun) {
      await sendNotification({
        lambdaName: 'refreshPlayerMetrics',
        status: result.success ? 'success' : 'failure',
        triggerSource: 'EVENTBRIDGE',
        durationMs: result.executionTimeMs,
        summary: {
          totalPlayersScanned: result.totalPlayersScanned,
          totalPlayerVenuesScanned: result.totalPlayerVenuesScanned,
          globalMetricsUpdated: result.globalMetricsUpdated,
          entityMetricsUpdated: result.entityMetricsUpdated,
          venueMetricsUpdated: result.venueMetricsUpdated,
          entitiesProcessed: result.entitiesProcessed,
          venuesProcessed: result.venuesProcessed,
          executionTime: `${Math.round(result.executionTimeMs / 1000)}s`,
        },
        error: result.errors.length > 0 ? result.errors.join(', ') : null,
      });
    }
    // === NOTIFICATION CODE END ===

    return result;
    
  } catch (error) {
    console.error('[PLAYER-METRICS] Fatal error:', error);
    result.success = false;
    result.message = error.message;
    result.errors.push(error.message);
    result.executionTimeMs = Date.now() - startTime;

    // === NOTIFICATION CODE START ===
    // Send failure notification for EventBridge-triggered runs
    if (isEventBridgeTrigger) {
      await sendNotification({
        lambdaName: 'refreshPlayerMetrics',
        status: 'failure',
        triggerSource: 'EVENTBRIDGE',
        durationMs: result.executionTimeMs,
        summary: {
          totalPlayersScanned: result.totalPlayersScanned,
          executionTime: `${Math.round(result.executionTimeMs / 1000)}s`,
        },
        error: error.message,
      });
    }
    // === NOTIFICATION CODE END ===

    return result;
  }
};

// ============================================
// CROSS-VENUE/ENTITY MAP BUILDER
// ============================================

/**
 * Builds lookup maps for cross-venue and cross-entity analysis
 * Returns:
 * - playerVenueMap: Map<playerId, Set<venueId>> - which venues each player has played at
 * - playerEntityMap: Map<playerId, Set<entityId>> - which entities each player has played at
 * - venuePlayerMap: Map<venueId, Set<playerId>> - which players have played at each venue
 */
function buildCrossVenueMaps(playerVenues) {
  const playerVenueMap = new Map();  // playerId -> Set of venueIds
  const playerEntityMap = new Map(); // playerId -> Set of entityIds
  const venuePlayerMap = new Map();  // venueId -> Set of playerIds
  
  for (const pv of playerVenues) {
    const { playerId, venueId, entityId } = pv;
    
    // Track venues per player
    if (!playerVenueMap.has(playerId)) {
      playerVenueMap.set(playerId, new Set());
    }
    if (venueId) {
      playerVenueMap.get(playerId).add(venueId);
    }
    
    // Track entities per player
    if (!playerEntityMap.has(playerId)) {
      playerEntityMap.set(playerId, new Set());
    }
    if (entityId) {
      playerEntityMap.get(playerId).add(entityId);
    }
    
    // Track players per venue
    if (venueId) {
      if (!venuePlayerMap.has(venueId)) {
        venuePlayerMap.set(venueId, new Set());
      }
      venuePlayerMap.get(venueId).add(playerId);
    }
  }
  
  return { playerVenueMap, playerEntityMap, venuePlayerMap };
}

// ============================================
// DASHBOARD QUERY HANDLER
// ============================================

async function handleDashboardQuery({ entityId, timeRange = 'ALL' }) {
  try {
    let globalMetrics = null;
    let entityMetrics = null;
    let venueMetrics = [];
    
    if (!entityId) {
      // Fetch global metrics
      globalMetrics = await getGlobalMetrics(timeRange);
    }
    
    if (entityId) {
      // Fetch entity-specific metrics
      entityMetrics = await getEntityMetrics(entityId, timeRange);
      
      // Fetch venue metrics for this entity
      venueMetrics = await getVenueMetricsForEntity(entityId, timeRange);
    }
    
    const metrics = entityMetrics || globalMetrics;
    
    return {
      globalMetrics,
      entityMetrics,
      venueMetrics,
      totalPlayers: metrics?.totalPlayers || 0,
      activePlayers: metrics?.activePlayerCount || 0,
      newPlayersThisMonth: metrics?.playersRegisteredLast30Days || 0,
      churnedPlayersThisMonth: (metrics?.churned91to120Count || 0),
      playersMultiVenue: metrics?.playersMultiVenue || 0,
      playersMultiEntity: metrics?.playersMultiEntity || 0,
      playerGrowthTrend: metrics?.playerGrowthTrend || 'stable',
      churnRate: calculateChurnRate(metrics)
    };
  } catch (error) {
    console.error('[PLAYER-METRICS] Dashboard query error:', error);
    throw error;
  }
}

// ============================================
// DATA FETCHING HELPERS
// ============================================

async function getAllEntities() {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: ENTITY_TABLE,
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getAllVenues() {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: VENUE_TABLE,
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getAllPlayersWithSummaries() {
  // Fetch all players
  const players = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: PLAYER_TABLE,
      ExclusiveStartKey: lastKey
    }));
    players.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  // Fetch all summaries
  const summaries = [];
  lastKey = undefined;
  
  if (PLAYER_SUMMARY_TABLE) {
    do {
      const response = await docClient.send(new ScanCommand({
        TableName: PLAYER_SUMMARY_TABLE,
        ExclusiveStartKey: lastKey
      }));
      summaries.push(...(response.Items || []));
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
  }
  
  // Create summary lookup map
  const summaryMap = new Map();
  for (const summary of summaries) {
    summaryMap.set(summary.playerId, summary);
  }
  
  // Attach summaries to players
  return players.map(player => ({
    ...player,
    summary: summaryMap.get(player.id) || null
  }));
}

async function getAllPlayerVenues() {
  const items = [];
  let lastKey = undefined;
  
  if (!PLAYER_VENUE_TABLE) {
    console.warn('[PLAYER-METRICS] PlayerVenue table not configured');
    return items;
  }
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: PLAYER_VENUE_TABLE,
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getGlobalMetrics(timeRange) {
  const id = `global_${timeRange}`;
  const response = await docClient.send(new QueryCommand({
    TableName: GLOBAL_PLAYER_METRICS_TABLE,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id },
    Limit: 1
  }));
  return response.Items?.[0] || null;
}

async function getEntityMetrics(entityId, timeRange) {
  const id = `${entityId}_${timeRange}`;
  const response = await docClient.send(new QueryCommand({
    TableName: ENTITY_PLAYER_METRICS_TABLE,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': id },
    Limit: 1
  }));
  return response.Items?.[0] || null;
}

async function getVenueMetricsForEntity(entityId, timeRange) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      TableName: VENUE_PLAYER_METRICS_TABLE,
      IndexName: 'byEntityVenuePlayerMetrics',
      KeyConditionExpression: 'entityId = :entityId',
      FilterExpression: 'timeRange = :timeRange',
      ExpressionAttributeValues: {
        ':entityId': entityId,
        ':timeRange': timeRange
      },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

// ============================================
// TIME RANGE FILTERS
// ============================================

function filterPlayersByTimeRange(players, timeRange) {
  if (timeRange === 'ALL') return players;
  
  const now = new Date();
  const months = parseInt(timeRange.replace('M', ''));
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  
  return players.filter(player => {
    // Include if registered within time range OR active within time range
    const regDate = player.registrationDate ? new Date(player.registrationDate) : null;
    const lastPlayed = player.lastPlayedDate ? new Date(player.lastPlayedDate) : null;
    
    return (regDate && regDate >= cutoff) || (lastPlayed && lastPlayed >= cutoff);
  });
}

function filterPlayerVenuesByTimeRange(playerVenues, timeRange) {
  if (timeRange === 'ALL') return playerVenues;
  
  const now = new Date();
  const months = parseInt(timeRange.replace('M', ''));
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  
  return playerVenues.filter(pv => {
    const lastPlayed = pv.lastPlayedDate ? new Date(pv.lastPlayedDate) : null;
    return lastPlayed && lastPlayed >= cutoff;
  });
}

// ============================================
// METRIC CALCULATORS
// ============================================

function calculateGlobalMetrics(players, playerVenues, entities, venues, timeRange, crossVenueMaps) {
  const now = new Date();
  const nowIso = now.toISOString();
  
  const { playerVenueMap, playerEntityMap } = crossVenueMaps;
  
  // Basic counts
  const totalPlayers = players.length;
  const totalEntities = entities.length;
  const totalVenues = venues.length;
  
  // Status counts
  const statusCounts = countByField(players, 'status');
  
  // Category counts
  const categoryCounts = countByField(players, 'category');
  
  // Targeting classification counts
  const targetingCounts = countByField(players, 'targetingClassification');
  
  // =============================================
  // CROSS-VENUE/ENTITY DISTRIBUTION CALCULATIONS
  // =============================================
  
  // Venue distribution: { "1": count, "2": count, "3": count, "4": count, "5+": count }
  const venuePlayDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5+": 0 };
  let playersMultiVenue = 0;
  let playersSingleVenue = 0;
  let totalVenuesPlayed = 0;
  let maxVenuesPlayed = 0;
  
  for (const [playerId, venueSet] of playerVenueMap) {
    const count = venueSet.size;
    totalVenuesPlayed += count;
    
    if (count > maxVenuesPlayed) maxVenuesPlayed = count;
    
    if (count === 1) {
      venuePlayDistribution["1"]++;
      playersSingleVenue++;
    } else if (count === 2) {
      venuePlayDistribution["2"]++;
      playersMultiVenue++;
    } else if (count === 3) {
      venuePlayDistribution["3"]++;
      playersMultiVenue++;
    } else if (count === 4) {
      venuePlayDistribution["4"]++;
      playersMultiVenue++;
    } else if (count >= 5) {
      venuePlayDistribution["5+"]++;
      playersMultiVenue++;
    }
  }
  
  // Entity distribution: { "1": count, "2": count, "3+": count }
  const entityPlayDistribution = { "1": 0, "2": 0, "3+": 0 };
  let playersMultiEntity = 0;
  let playersSingleEntity = 0;
  let totalEntitiesPlayed = 0;
  let maxEntitiesPlayed = 0;
  
  for (const [playerId, entitySet] of playerEntityMap) {
    const count = entitySet.size;
    totalEntitiesPlayed += count;
    
    if (count > maxEntitiesPlayed) maxEntitiesPlayed = count;
    
    if (count === 1) {
      entityPlayDistribution["1"]++;
      playersSingleEntity++;
    } else if (count === 2) {
      entityPlayDistribution["2"]++;
      playersMultiEntity++;
    } else if (count >= 3) {
      entityPlayDistribution["3+"]++;
      playersMultiEntity++;
    }
  }
  
  const playersWithVenueData = playerVenueMap.size;
  const avgVenuesPerPlayer = playersWithVenueData > 0 ? totalVenuesPlayed / playersWithVenueData : 0;
  const avgEntitiesPerPlayer = playersWithVenueData > 0 ? totalEntitiesPlayed / playersWithVenueData : 0;
  
  // Top players by venue count
  // Also build a map of total games per player from PlayerVenue records
  const playerGamesMap = new Map();
  for (const pv of playerVenues) {
    const current = playerGamesMap.get(pv.playerId) || 0;
    playerGamesMap.set(pv.playerId, current + (pv.totalGamesPlayed || 0));
  }
  
  const playerVenueCounts = [];
  for (const [playerId, venueSet] of playerVenueMap) {
    const entitySet = playerEntityMap.get(playerId) || new Set();
    const player = players.find(p => p.id === playerId);
    if (player) {
      // Use games from PlayerVenue records, fallback to summary
      const gamesFromPV = playerGamesMap.get(playerId) || 0;
      const gamesFromSummary = player.summary?.gamesPlayedAllTime || 0;
      
      playerVenueCounts.push({
        playerId,
        name: `${player.firstName} ${player.lastName}`,
        venueCount: venueSet.size,
        entityCount: entitySet.size,
        gamesPlayed: gamesFromPV > 0 ? gamesFromPV : gamesFromSummary
      });
    }
  }
  
  const topPlayersByVenueCount = playerVenueCounts
    .sort((a, b) => b.venueCount - a.venueCount || b.gamesPlayed - a.gamesPlayed)
    .slice(0, 10);
  
  // =============================================
  // END CROSS-VENUE/ENTITY CALCULATIONS
  // =============================================
  
  // Registration trends
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  
  const playersRegisteredLast30Days = players.filter(p => 
    p.registrationDate && new Date(p.registrationDate) >= thirtyDaysAgo
  ).length;
  
  const playersRegisteredLast90Days = players.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= ninetyDaysAgo
  ).length;
  
  const playersRegisteredLast365Days = players.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= yearAgo
  ).length;
  
  // Activity metrics
  const playersActiveLast30Days = players.filter(p =>
    p.lastPlayedDate && new Date(p.lastPlayedDate) >= thirtyDaysAgo
  ).length;
  
  const playersActiveLast90Days = players.filter(p =>
    p.lastPlayedDate && new Date(p.lastPlayedDate) >= ninetyDaysAgo
  ).length;
  
  // Financial aggregates from summaries
  let totalNetBalance = 0;
  let totalWinnings = 0;
  let totalBuyIns = 0;
  let totalCredits = 0;
  let totalPoints = 0;
  
  for (const player of players) {
    if (player.summary) {
      totalNetBalance += player.summary.netBalance || 0;
      totalWinnings += player.summary.totalWinnings || 0;
      totalBuyIns += player.summary.totalBuyIns || 0;
    }
    totalCredits += player.creditBalance || 0;
    totalPoints += player.pointsBalance || 0;
  }
  
  // Calculate total games from PlayerVenue records (more accurate than player.summary)
  let totalGames = 0;
  for (const gamesCount of playerGamesMap.values()) {
    totalGames += gamesCount;
  }
  
  const avgGamesPerPlayer = totalPlayers > 0 ? totalGames / totalPlayers : 0;
  const avgNetBalancePerPlayer = totalPlayers > 0 ? totalNetBalance / totalPlayers : 0;
  
  // Top entities by player count
  const entityPlayerCounts = {};
  for (const player of players) {
    if (player.primaryEntityId) {
      entityPlayerCounts[player.primaryEntityId] = (entityPlayerCounts[player.primaryEntityId] || 0) + 1;
    }
  }
  
  const topEntitiesByPlayers = Object.entries(entityPlayerCounts)
    .map(([entityId, count]) => {
      const entity = entities.find(e => e.id === entityId);
      return { entityId, entityName: entity?.entityName || 'Unknown', playerCount: count };
    })
    .sort((a, b) => b.playerCount - a.playerCount)
    .slice(0, 10);
  
  // Top venues by registrations
  const venueRegCounts = {};
  for (const player of players) {
    if (player.registrationVenueId) {
      venueRegCounts[player.registrationVenueId] = (venueRegCounts[player.registrationVenueId] || 0) + 1;
    }
  }
  
  const topVenuesByRegistrations = Object.entries(venueRegCounts)
    .map(([venueId, count]) => {
      const venue = venues.find(v => v.id === venueId);
      return { venueId, venueName: venue?.name || 'Unknown', entityId: venue?.entityId, registrationCount: count };
    })
    .sort((a, b) => b.registrationCount - a.registrationCount)
    .slice(0, 10);
  
  // Top players by net balance
  const topPlayersByNetBalance = players
    .filter(p => p.summary?.netBalance != null)
    .sort((a, b) => (b.summary?.netBalance || 0) - (a.summary?.netBalance || 0))
    .slice(0, 10)
    .map(p => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      netBalance: p.summary?.netBalance || 0,
      gamesPlayed: p.summary?.gamesPlayedAllTime || 0
    }));
  
  // Top players by total buy-ins (Top Spenders)
  const topPlayersByBuyIns = players
    .filter(p => p.summary?.totalBuyIns != null && p.summary.totalBuyIns > 0)
    .sort((a, b) => (b.summary?.totalBuyIns || 0) - (a.summary?.totalBuyIns || 0))
    .slice(0, 10)
    .map(p => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      totalBuyIns: p.summary?.totalBuyIns || 0,
      gamesPlayed: p.summary?.gamesPlayedAllTime || 0
    }));
  
  return {
    id: `global_${timeRange}`,
    timeRange,
    
    totalPlayers,
    totalEntities,
    totalVenues,
    
    activePlayerCount: statusCounts[PLAYER_STATUS.ACTIVE] || 0,
    suspendedPlayerCount: statusCounts[PLAYER_STATUS.SUSPENDED] || 0,
    pendingVerificationPlayerCount: statusCounts[PLAYER_STATUS.PENDING_VERIFICATION] || 0,
    
    // New category counts (v2 enum)
    trialistPlayerCount: (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0) + (categoryCounts[PLAYER_CATEGORY.NEW] || 0),
    casualPlayerCount: (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0) + (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0),
    committedPlayerCount: categoryCounts[PLAYER_CATEGORY.COMMITTED] || 0,
    regularPlayerCount: categoryCounts[PLAYER_CATEGORY.REGULAR] || 0,
    vipPlayerCount: categoryCounts[PLAYER_CATEGORY.VIP] || 0,
    // Legacy category counts (deprecated - for backward compatibility)
    newPlayerCount: (categoryCounts[PLAYER_CATEGORY.NEW] || 0) + (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0),
    recreationalPlayerCount: (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0) + (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0),
    lapsedPlayerCount: categoryCounts[PLAYER_CATEGORY.LAPSED] || 0,
    
    notPlayedCount: targetingCounts[TARGETING.NOT_PLAYED] || 0,
    activeELCount: targetingCounts[TARGETING.ACTIVE_EL] || 0,
    activeCount: targetingCounts[TARGETING.ACTIVE] || 0,
    retain31to60Count: targetingCounts[TARGETING.RETAIN_31_60] || 0,
    retain61to90Count: targetingCounts[TARGETING.RETAIN_61_90] || 0,
    churned91to120Count: targetingCounts[TARGETING.CHURNED_91_120] || 0,
    churned121to180Count: targetingCounts[TARGETING.CHURNED_121_180] || 0,
    churned181to360Count: targetingCounts[TARGETING.CHURNED_181_360] || 0,
    churned361PlusCount: targetingCounts[TARGETING.CHURNED_361] || 0,
    
    // Cross-venue/entity distribution - raw objects for AWSJSON
    venuePlayDistribution,
    entityPlayDistribution,
    playersMultiVenue,
    playersMultiEntity,
    playersSingleVenue,
    playersSingleEntity,
    avgVenuesPerPlayer: round(avgVenuesPerPlayer),
    avgEntitiesPerPlayer: round(avgEntitiesPerPlayer),
    maxVenuesPlayed,
    maxEntitiesPlayed,
    
    playersRegisteredLast30Days,
    playersRegisteredLast90Days,
    playersRegisteredLast365Days,
    
    playersActiveLast30Days,
    playersActiveLast90Days,
    avgGamesPerPlayer: round(avgGamesPerPlayer),
    avgNetBalancePerPlayer: round(avgNetBalancePerPlayer),
    
    totalPlayerNetBalance: round(totalNetBalance),
    totalPlayerWinnings: round(totalWinnings),
    totalPlayerBuyIns: round(totalBuyIns),
    totalCreditBalance: round(totalCredits),
    totalPointsBalance: round(totalPoints),
    
    // Top lists - raw arrays for AWSJSON
    topEntitiesByPlayers,
    topVenuesByRegistrations,
    topPlayersByNetBalance,
    topPlayersByVenueCount,
    topPlayersByBuyIns,
    
    calculatedAt: nowIso,
    calculatedBy: 'SCHEDULED_LAMBDA',
    playersScanned: totalPlayers,
    playerVenuesScanned: playerVenues.length,
    entitiesIncluded: totalEntities,
    venuesIncluded: totalVenues,
    
    createdAt: nowIso,
    updatedAt: nowIso,
    _version: 1,
    _lastChangedAt: Date.now()
  };
}

function calculateEntityMetrics(entity, players, playerVenues, venues, playersRegisteredHere, timeRange, crossVenueMaps) {
  const now = new Date();
  const nowIso = now.toISOString();
  
  const { playerVenueMap, playerEntityMap } = crossVenueMaps;
  
  // Basic counts
  const totalPlayers = players.length;
  const totalVenues = venues.length;
  
  // Status counts
  const statusCounts = countByField(players, 'status');
  
  // Category counts  
  const categoryCounts = countByField(players, 'category');
  
  // Targeting classification counts
  const targetingCounts = countByField(players, 'targetingClassification');
  
  // =============================================
  // CROSS-VENUE DISTRIBUTION (within this entity)
  // =============================================
  
  const entityVenueIds = new Set(venues.map(v => v.id));
  const entityPlayerVenueMap = new Map(); // playerId -> Set of venueIds within this entity
  
  for (const pv of playerVenues) {
    if (entityVenueIds.has(pv.venueId)) {
      if (!entityPlayerVenueMap.has(pv.playerId)) {
        entityPlayerVenueMap.set(pv.playerId, new Set());
      }
      entityPlayerVenueMap.get(pv.playerId).add(pv.venueId);
    }
  }
  
  const venuePlayDistribution = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  let playersMultiVenue = 0;
  let playersSingleVenue = 0;
  let totalVenuesPlayed = 0;
  
  for (const [playerId, venueSet] of entityPlayerVenueMap) {
    const count = venueSet.size;
    totalVenuesPlayed += count;
    
    if (count === 1) {
      venuePlayDistribution["1"]++;
      playersSingleVenue++;
    } else if (count === 2) {
      venuePlayDistribution["2"]++;
      playersMultiVenue++;
    } else if (count === 3) {
      venuePlayDistribution["3"]++;
      playersMultiVenue++;
    } else if (count >= 4) {
      venuePlayDistribution["4+"]++;
      playersMultiVenue++;
    }
  }
  
  const playersWithVenueData = entityPlayerVenueMap.size;
  const avgVenuesPerPlayer = playersWithVenueData > 0 ? totalVenuesPlayed / playersWithVenueData : 0;
  
  // How many of this entity's players also play at other entities
  let playersSharedWithOtherEntities = 0;
  let playersExclusiveToEntity = 0;
  
  const entityPlayerIds = new Set(players.map(p => p.id));
  for (const playerId of entityPlayerIds) {
    const entitySet = playerEntityMap.get(playerId);
    if (entitySet && entitySet.size > 1) {
      playersSharedWithOtherEntities++;
    } else {
      playersExclusiveToEntity++;
    }
  }
  
  // Top players by venue count within this entity
  // Build a map of total games per player from this entity's PlayerVenue records
  const entityPlayerGamesMap = new Map();
  for (const pv of playerVenues) {
    const current = entityPlayerGamesMap.get(pv.playerId) || 0;
    entityPlayerGamesMap.set(pv.playerId, current + (pv.totalGamesPlayed || 0));
  }
  
  const playerVenueCounts = [];
  for (const [playerId, venueSet] of entityPlayerVenueMap) {
    const player = players.find(p => p.id === playerId);
    if (player) {
      // Use games from PlayerVenue records, fallback to summary
      const gamesFromPV = entityPlayerGamesMap.get(playerId) || 0;
      const gamesFromSummary = player.summary?.gamesPlayedAllTime || 0;
      
      playerVenueCounts.push({
        playerId,
        name: `${player.firstName} ${player.lastName}`,
        venueCount: venueSet.size,
        gamesPlayed: gamesFromPV > 0 ? gamesFromPV : gamesFromSummary
      });
    }
  }
  
  const topPlayersByVenueCount = playerVenueCounts
    .sort((a, b) => b.venueCount - a.venueCount || b.gamesPlayed - a.gamesPlayed)
    .slice(0, 10);
  
  // =============================================
  // END CROSS-VENUE CALCULATIONS
  // =============================================
  
  // Registration metrics
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const playersRegisteredLast30Days = playersRegisteredHere.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= thirtyDaysAgo
  ).length;
  
  const playersRegisteredLast90Days = playersRegisteredHere.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= ninetyDaysAgo
  ).length;
  
  // Activity metrics
  const playersActiveLast30Days = players.filter(p =>
    p.lastPlayedDate && new Date(p.lastPlayedDate) >= thirtyDaysAgo
  ).length;
  
  const playersActiveLast90Days = players.filter(p =>
    p.lastPlayedDate && new Date(p.lastPlayedDate) >= ninetyDaysAgo
  ).length;
  
  // Financial aggregates
  let totalNetBalance = 0;
  let totalWinnings = 0;
  let totalBuyIns = 0;
  let totalCredits = 0;
  let totalPoints = 0;
  
  for (const player of players) {
    if (player.summary) {
      totalNetBalance += player.summary.netBalance || 0;
      totalWinnings += player.summary.totalWinnings || 0;
      totalBuyIns += player.summary.totalBuyIns || 0;
    }
    totalCredits += player.creditBalance || 0;
    totalPoints += player.pointsBalance || 0;
  }
  
  // Calculate total games from PlayerVenue records (more accurate than player.summary)
  let totalGames = 0;
  for (const gamesCount of entityPlayerGamesMap.values()) {
    totalGames += gamesCount;
  }
  
  const avgGamesPerPlayer = totalPlayers > 0 ? totalGames / totalPlayers : 0;
  const avgNetBalancePerPlayer = totalPlayers > 0 ? totalNetBalance / totalPlayers : 0;
  
  // Venue breakdown
  const venueBreakdown = venues.map(venue => {
    const venuePlayerVenues = playerVenues.filter(pv => pv.venueId === venue.id);
    const uniquePlayerIds = new Set(venuePlayerVenues.map(pv => pv.playerId));
    const venuePlayers = players.filter(p => uniquePlayerIds.has(p.id));
    const registrations = playersRegisteredHere.filter(p => p.registrationVenueId === venue.id).length;
    const activeCount = venuePlayers.filter(p => p.status === PLAYER_STATUS.ACTIVE).length;
    
    return {
      venueId: venue.id,
      venueName: venue.name,
      playerCount: venuePlayers.length,
      activeCount,
      registrationCount: registrations
    };
  }).sort((a, b) => b.playerCount - a.playerCount);
  
  // Top players
  const topPlayersByNetBalance = players
    .filter(p => p.summary?.netBalance != null)
    .sort((a, b) => (b.summary?.netBalance || 0) - (a.summary?.netBalance || 0))
    .slice(0, 10)
    .map(p => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      netBalance: p.summary?.netBalance || 0,
      gamesPlayed: p.summary?.gamesPlayedAllTime || 0
    }));
  
  const topPlayersByGamesPlayed = players
    .filter(p => p.summary?.gamesPlayedAllTime != null)
    .sort((a, b) => (b.summary?.gamesPlayedAllTime || 0) - (a.summary?.gamesPlayedAllTime || 0))
    .slice(0, 10)
    .map(p => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      gamesPlayed: p.summary?.gamesPlayedAllTime || 0,
      netBalance: p.summary?.netBalance || 0
    }));
  
  // Top Spenders - players with highest total buy-ins in this entity
  const topPlayersByBuyIns = players
    .filter(p => p.summary?.totalBuyIns != null && p.summary.totalBuyIns > 0)
    .sort((a, b) => (b.summary?.totalBuyIns || 0) - (a.summary?.totalBuyIns || 0))
    .slice(0, 10)
    .map(p => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      totalBuyIns: p.summary?.totalBuyIns || 0,
      gamesPlayed: p.summary?.gamesPlayedAllTime || 0
    }));
  
  return {
    id: `${entity.id}_${timeRange}`,
    entityId: entity.id,
    entityName: entity.entityName,
    timeRange,
    
    totalPlayers,
    totalVenues,
    
    activePlayerCount: statusCounts[PLAYER_STATUS.ACTIVE] || 0,
    suspendedPlayerCount: statusCounts[PLAYER_STATUS.SUSPENDED] || 0,
    pendingVerificationPlayerCount: statusCounts[PLAYER_STATUS.PENDING_VERIFICATION] || 0,
    
    // New category counts (v2 enum)
    trialistPlayerCount: (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0) + (categoryCounts[PLAYER_CATEGORY.NEW] || 0),
    casualPlayerCount: (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0) + (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0),
    committedPlayerCount: categoryCounts[PLAYER_CATEGORY.COMMITTED] || 0,
    regularPlayerCount: categoryCounts[PLAYER_CATEGORY.REGULAR] || 0,
    vipPlayerCount: categoryCounts[PLAYER_CATEGORY.VIP] || 0,
    // Legacy category counts (deprecated)
    newPlayerCount: (categoryCounts[PLAYER_CATEGORY.NEW] || 0) + (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0),
    recreationalPlayerCount: (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0) + (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0),
    lapsedPlayerCount: categoryCounts[PLAYER_CATEGORY.LAPSED] || 0,
    
    notPlayedCount: targetingCounts[TARGETING.NOT_PLAYED] || 0,
    activeELCount: targetingCounts[TARGETING.ACTIVE_EL] || 0,
    activeCount: targetingCounts[TARGETING.ACTIVE] || 0,
    retain31to60Count: targetingCounts[TARGETING.RETAIN_31_60] || 0,
    retain61to90Count: targetingCounts[TARGETING.RETAIN_61_90] || 0,
    churned91to120Count: targetingCounts[TARGETING.CHURNED_91_120] || 0,
    churned121to180Count: targetingCounts[TARGETING.CHURNED_121_180] || 0,
    churned181to360Count: targetingCounts[TARGETING.CHURNED_181_360] || 0,
    churned361PlusCount: targetingCounts[TARGETING.CHURNED_361] || 0,
    
    // Cross-venue distribution - raw object for AWSJSON
    venuePlayDistribution,
    playersMultiVenue,
    playersSingleVenue,
    avgVenuesPerPlayer: round(avgVenuesPerPlayer),
    playersSharedWithOtherEntities,
    playersExclusiveToEntity,
    
    playersRegisteredAllTime: playersRegisteredHere.length,
    playersRegisteredLast30Days,
    playersRegisteredLast90Days,
    
    playersActiveLast30Days,
    playersActiveLast90Days,
    totalGamesPlayed: totalGames,
    avgGamesPerPlayer: round(avgGamesPerPlayer),
    avgNetBalancePerPlayer: round(avgNetBalancePerPlayer),
    
    totalPlayerNetBalance: round(totalNetBalance),
    totalPlayerWinnings: round(totalWinnings),
    totalPlayerBuyIns: round(totalBuyIns),
    totalCreditBalance: round(totalCredits),
    totalPointsBalance: round(totalPoints),
    
    // Top lists - raw arrays for AWSJSON
    venueBreakdown,
    topVenuesByPlayers: venueBreakdown.slice(0, 5),
    topVenuesByRegistrations: venueBreakdown
      .sort((a, b) => b.registrationCount - a.registrationCount)
      .slice(0, 5),
    topPlayersByNetBalance,
    topPlayersByGamesPlayed,
    topPlayersByVenueCount,
    topPlayersByBuyIns,
    
    calculatedAt: nowIso,
    calculatedBy: 'SCHEDULED_LAMBDA',
    playersScanned: totalPlayers,
    venuesIncluded: totalVenues,
    playerVenuesScanned: playerVenues.length,
    
    createdAt: nowIso,
    updatedAt: nowIso,
    _version: 1,
    _lastChangedAt: Date.now()
  };
}

function calculateVenueMetrics(venue, players, playerVenues, playersRegisteredHere, timeRange, crossVenueMaps) {
  const now = new Date();
  const nowIso = now.toISOString();
  
  const { playerVenueMap } = crossVenueMaps;
  
  // Basic counts
  const totalPlayers = players.length;
  const registeredPlayers = playersRegisteredHere.length;
  
  // Status counts
  const statusCounts = countByField(players, 'status');
  
  // Category counts
  const categoryCounts = countByField(players, 'category');
  
  // Targeting classification counts (venue-specific from PlayerVenue)
  const targetingCounts = countByField(playerVenues, 'targetingClassification');
  
  // =============================================
  // CROSS-VENUE METRICS (for players at THIS venue)
  // =============================================
  
  let playersExclusiveToVenue = 0;
  let playersSharedWithOtherVenues = 0;
  let totalOtherVenues = 0;
  
  const venuePlayerIds = new Set(playerVenues.map(pv => pv.playerId));
  
  for (const playerId of venuePlayerIds) {
    const playerVenueSet = playerVenueMap.get(playerId);
    if (playerVenueSet) {
      const otherVenueCount = playerVenueSet.size - 1; // Subtract this venue
      if (otherVenueCount === 0) {
        playersExclusiveToVenue++;
      } else {
        playersSharedWithOtherVenues++;
        totalOtherVenues += otherVenueCount;
      }
    } else {
      playersExclusiveToVenue++;
    }
  }
  
  const avgOtherVenuesPerPlayer = playersSharedWithOtherVenues > 0 
    ? totalOtherVenues / playersSharedWithOtherVenues 
    : 0;
  
  // =============================================
  // END CROSS-VENUE CALCULATIONS
  // =============================================
  
  // Registration metrics
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const registrationsLast30Days = playersRegisteredHere.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= thirtyDaysAgo
  ).length;
  
  const registrationsLast90Days = playersRegisteredHere.filter(p =>
    p.registrationDate && new Date(p.registrationDate) >= ninetyDaysAgo
  ).length;
  
  // Activity metrics from PlayerVenue
  const playersActiveLast30Days = playerVenues.filter(pv =>
    pv.lastPlayedDate && new Date(pv.lastPlayedDate) >= thirtyDaysAgo
  ).length;
  
  const playersActiveLast90Days = playerVenues.filter(pv =>
    pv.lastPlayedDate && new Date(pv.lastPlayedDate) >= ninetyDaysAgo
  ).length;
  
  // Financial aggregates from PlayerVenue
  let totalNetBalance = 0;
  let totalWinnings = 0;
  let totalBuyIns = 0;
  let totalGames = 0;
  
  for (const pv of playerVenues) {
    totalNetBalance += pv.netProfit || 0;
    totalWinnings += pv.totalWinnings || 0;
    totalBuyIns += pv.totalBuyIns || 0;
    totalGames += pv.totalGamesPlayed || 0;
  }
  
  const avgGamesPerPlayer = totalPlayers > 0 ? totalGames / totalPlayers : 0;
  const avgNetBalancePerPlayer = totalPlayers > 0 ? totalNetBalance / totalPlayers : 0;
  
  // Top players at this venue
  const topPlayersByGamesPlayed = playerVenues
    .sort((a, b) => (b.totalGamesPlayed || 0) - (a.totalGamesPlayed || 0))
    .slice(0, 10)
    .map(pv => {
      const player = players.find(p => p.id === pv.playerId);
      return {
        playerId: pv.playerId,
        name: player ? `${player.firstName} ${player.lastName}` : 'Unknown',
        gamesPlayed: pv.totalGamesPlayed || 0,
        netBalance: pv.netProfit || 0
      };
    });
  
  const topPlayersByNetBalance = playerVenues
    .sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0))
    .slice(0, 10)
    .map(pv => {
      const player = players.find(p => p.id === pv.playerId);
      return {
        playerId: pv.playerId,
        name: player ? `${player.firstName} ${player.lastName}` : 'Unknown',
        netBalance: pv.netProfit || 0,
        gamesPlayed: pv.totalGamesPlayed || 0
      };
    });
  
  // Regular players (played 5+ times)
  const regularPlayers = playerVenues
    .filter(pv => (pv.totalGamesPlayed || 0) >= 5)
    .sort((a, b) => new Date(b.lastPlayedDate || 0) - new Date(a.lastPlayedDate || 0))
    .slice(0, 20)
    .map(pv => {
      const player = players.find(p => p.id === pv.playerId);
      return {
        playerId: pv.playerId,
        name: player ? `${player.firstName} ${player.lastName}` : 'Unknown',
        lastPlayed: pv.lastPlayedDate,
        totalGames: pv.totalGamesPlayed || 0
      };
    });
  
  return {
    id: `${venue.id}_${timeRange}`,
    entityId: venue.entityId,
    venueId: venue.id,
    venueName: venue.name,
    timeRange,
    
    totalPlayers,
    registeredPlayers,
    
    activePlayerCount: statusCounts[PLAYER_STATUS.ACTIVE] || 0,
    suspendedPlayerCount: statusCounts[PLAYER_STATUS.SUSPENDED] || 0,
    pendingVerificationPlayerCount: statusCounts[PLAYER_STATUS.PENDING_VERIFICATION] || 0,
    
    // New category counts (v2 enum)
    trialistPlayerCount: (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0) + (categoryCounts[PLAYER_CATEGORY.NEW] || 0),
    casualPlayerCount: (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0) + (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0),
    committedPlayerCount: categoryCounts[PLAYER_CATEGORY.COMMITTED] || 0,
    regularPlayerCount: categoryCounts[PLAYER_CATEGORY.REGULAR] || 0,
    vipPlayerCount: categoryCounts[PLAYER_CATEGORY.VIP] || 0,
    // Legacy category counts (deprecated)
    newPlayerCount: (categoryCounts[PLAYER_CATEGORY.NEW] || 0) + (categoryCounts[PLAYER_CATEGORY.TRIALIST] || 0),
    recreationalPlayerCount: (categoryCounts[PLAYER_CATEGORY.RECREATIONAL] || 0) + (categoryCounts[PLAYER_CATEGORY.CASUAL] || 0),
    lapsedPlayerCount: categoryCounts[PLAYER_CATEGORY.LAPSED] || 0,
    
    activeELCount: targetingCounts[TARGETING.ACTIVE_EL] || targetingCounts['Active_EL'] || 0,
    activeCount: targetingCounts[TARGETING.ACTIVE] || targetingCounts['Active'] || 0,
    retain31to60Count: targetingCounts[TARGETING.RETAIN_31_60] || targetingCounts['Retain_Inactive31_60d'] || 0,
    retain61to90Count: targetingCounts[TARGETING.RETAIN_61_90] || targetingCounts['Retain_Inactive61_90d'] || 0,
    churned91to120Count: targetingCounts[TARGETING.CHURNED_91_120] || targetingCounts['Churned_91_120d'] || 0,
    churned121to180Count: targetingCounts[TARGETING.CHURNED_121_180] || targetingCounts['Churned_121_180d'] || 0,
    churned181to360Count: targetingCounts[TARGETING.CHURNED_181_360] || targetingCounts['Churned_181_360d'] || 0,
    churned361PlusCount: targetingCounts[TARGETING.CHURNED_361] || targetingCounts['Churned_361d'] || 0,
    
    // Cross-venue metrics
    playersExclusiveToVenue,
    playersSharedWithOtherVenues,
    avgOtherVenuesPerPlayer: round(avgOtherVenuesPerPlayer),
    
    registrationsAllTime: registeredPlayers,
    registrationsLast30Days,
    registrationsLast90Days,
    
    playersActiveLast30Days,
    playersActiveLast90Days,
    totalGamesAtVenue: totalGames,
    avgGamesPerPlayer: round(avgGamesPerPlayer),
    avgNetBalancePerPlayer: round(avgNetBalancePerPlayer),
    
    totalPlayerNetBalance: round(totalNetBalance),
    totalPlayerWinnings: round(totalWinnings),
    totalPlayerBuyIns: round(totalBuyIns),
    
    // Top lists - raw arrays for AWSJSON
    topPlayersByGamesPlayed,
    topPlayersByNetBalance,
    regularPlayers,
    
    calculatedAt: nowIso,
    calculatedBy: 'SCHEDULED_LAMBDA',
    playersScanned: totalPlayers,
    playerVenuesScanned: playerVenues.length,
    
    createdAt: nowIso,
    updatedAt: nowIso,
    _version: 1,
    _lastChangedAt: Date.now()
  };
}

// ============================================
// SAVE HELPERS
// ============================================

async function saveGlobalPlayerMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: GLOBAL_PLAYER_METRICS_TABLE,
    Item: metrics
  }));
}

async function saveEntityPlayerMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: ENTITY_PLAYER_METRICS_TABLE,
    Item: metrics
  }));
}

async function saveVenuePlayerMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: VENUE_PLAYER_METRICS_TABLE,
    Item: metrics
  }));
}

// ============================================
// UTILITY HELPERS
// ============================================

function countByField(items, field) {
  const counts = {};
  for (const item of items) {
    const value = item[field];
    if (value) {
      counts[value] = (counts[value] || 0) + 1;
    }
  }
  return counts;
}

function round(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function calculateChurnRate(metrics) {
  if (!metrics || !metrics.totalPlayers) return 0;
  const churned = (metrics.churned91to120Count || 0) + 
                  (metrics.churned121to180Count || 0) +
                  (metrics.churned181to360Count || 0) +
                  (metrics.churned361PlusCount || 0);
  return round((churned / metrics.totalPlayers) * 100);
}