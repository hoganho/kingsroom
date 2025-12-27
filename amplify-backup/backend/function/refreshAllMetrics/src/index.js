/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_ENTITYMETRICSTABLE_ARN
    API_KINGSROOM_ENTITYMETRICSTABLE_NAME
    API_KINGSROOM_ENTITYTABLE_ARN
    API_KINGSROOM_ENTITYTABLE_NAME
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_ARN
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_NAME
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
    API_KINGSROOM_RECURRINGGAMEMETRICSTABLE_ARN
    API_KINGSROOM_RECURRINGGAMEMETRICSTABLE_NAME
    API_KINGSROOM_RECURRINGGAMETABLE_ARN
    API_KINGSROOM_RECURRINGGAMETABLE_NAME
    API_KINGSROOM_TOURNAMENTSERIESMETRICSTABLE_ARN
    API_KINGSROOM_TOURNAMENTSERIESMETRICSTABLE_NAME
    API_KINGSROOM_TOURNAMENTSERIESSTABLE_ARN
    API_KINGSROOM_TOURNAMENTSERIESSTABLE_NAME
    API_KINGSROOM_VENUEMETRICSTABLE_ARN
    API_KINGSROOM_VENUEMETRICSTABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/*
  Lambda: refreshAllMetrics
  Region: ap-southeast-2
  
  VERSION: 2.0.0 (Series/Regular/All partitioning) - touch
  
  CHANGELOG:
  - v2.0.0: Added seriesType dimension (SERIES, REGULAR, ALL) for all metrics
            Added TournamentSeriesMetrics calculation
            Metrics now have IDs like: {entityId}_{timeRange}_{seriesType}
  - v1.0.8: Fixed DynamoDB KeyConditionExpression
  
  SERIES TYPE DEFINITIONS:
  - SERIES: Only games where isSeries=true (tournament series events)
  - REGULAR: Only games where isSeries=false/null (regular recurring games)
  - ALL: Combined metrics across all games
  
  This enables queries like:
  - "Show me just my series performance" (seriesType=SERIES)
  - "Show me just my regular games" (seriesType=REGULAR)
  - "Show me everything combined" (seriesType=ALL)
*/

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  DynamoDBDocumentClient, 
  QueryCommand, 
  ScanCommand,
  PutCommand
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-southeast-2" });
const docClient = DynamoDBDocumentClient.from(client);

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

// DYNAMODB INDEX NAMES
const INDEX_NAMES = {
  VENUE_BY_ENTITY: 'byEntityVenue',
  SNAPSHOT_BY_ENTITY: 'byEntityGameFinancialSnapshot',
  RECURRING_GAME_BY_ENTITY: 'byEntityRecurringGame',
  TOURNAMENT_SERIES_BY_ENTITY: 'byEntityTournamentSeries'
};

// Time ranges to calculate
const TIME_RANGES = ['ALL', '12M', '6M', '3M', '1M'];

// Series types to calculate
// SERIES = only isSeries=true games
// REGULAR = only isSeries=false/null games
// ALL = combined
const SERIES_TYPES = [
  { key: 'ALL', filter: () => true, description: 'All games combined' },
  { key: 'SERIES', filter: s => s.isSeries === true, description: 'Tournament series games only' },
  { key: 'REGULAR', filter: s => s.isSeries !== true, description: 'Regular recurring games only' }
];

// ============================================
// ROBUST TABLE NAME RESOLUTION
// ============================================

const getTableName = (modelName) => {
  const apiVarName = `API_KINGSROOM_${modelName.toUpperCase()}TABLE_NAME`;
  if (process.env[apiVarName]) {
    return process.env[apiVarName];
  }

  const storageVarName = `STORAGE_${modelName.toUpperCase()}_NAME`;
  if (process.env[storageVarName]) {
    return process.env[storageVarName];
  }

  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;

  if (apiId && env) {
    return `${modelName}-${apiId}-${env}`;
  }

  console.warn(`[METRICS] Could not resolve table name for ${modelName}.`);
  return null;
};

// Source Data Tables
const ENTITY_TABLE = getTableName('Entity');
const VENUE_TABLE = getTableName('Venue');
const RECURRING_GAME_TABLE = getTableName('RecurringGame');
const TOURNAMENT_SERIES_TABLE = getTableName('TournamentSeries');
const GAME_FINANCIAL_SNAPSHOT_TABLE = getTableName('GameFinancialSnapshot');

// Metrics Tables
const ENTITY_METRICS_TABLE = getTableName('EntityMetrics');
const VENUE_METRICS_TABLE = getTableName('VenueMetrics');
const RECURRING_GAME_METRICS_TABLE = getTableName('RecurringGameMetrics');
const TOURNAMENT_SERIES_METRICS_TABLE = getTableName('TournamentSeriesMetrics');

// ============================================
// MAIN HANDLER
// ============================================

exports.handler = async (event) => {
  console.log('[METRICS] Starting metrics refresh v2.0.0', JSON.stringify(event, null, 2));
  
  // LOGGING: Debug Configuration
  console.log('[METRICS] Configuration:', {
    Tables: {
      ENTITY: ENTITY_TABLE,
      VENUE: VENUE_TABLE,
      SNAPSHOTS: GAME_FINANCIAL_SNAPSHOT_TABLE,
      TOURNAMENT_SERIES: TOURNAMENT_SERIES_TABLE
    },
    Indexes: INDEX_NAMES,
    SeriesTypes: SERIES_TYPES.map(st => st.key)
  });

  const startTime = Date.now();

  // Validate critical tables exist
  if (!ENTITY_TABLE || !ENTITY_METRICS_TABLE) {
    return {
      success: false,
      message: 'Configuration Error: Missing required table name environment variables.',
      errors: ['Missing table names. Check CloudWatch logs.'],
      executionTimeMs: 0
    };
  }

  // Parse input
  const input = event.arguments?.input || event.input || {};
  const {
    entityId = null,
    venueId = null,
    recurringGameId = null,
    tournamentSeriesId = null,
    timeRanges = TIME_RANGES,
    seriesTypes = SERIES_TYPES.map(st => st.key), // Allow filtering which series types to calculate
    includeEntityMetrics = true,
    includeVenueMetrics = true,
    includeRecurringGameMetrics = true,
    includeTournamentSeriesMetrics = true,
    dryRun = false,
    verbose = false
  } = input;

  const result = {
    success: true,
    message: '',
    entityMetricsUpdated: 0,
    venueMetricsUpdated: 0,
    recurringGameMetricsUpdated: 0,
    tournamentSeriesMetricsUpdated: 0,
    entitiesProcessed: 0,
    venuesProcessed: 0,
    recurringGamesProcessed: 0,
    tournamentSeriesProcessed: 0,
    snapshotsAnalyzed: 0,
    executionTimeMs: 0,
    errors: [],
    warnings: [],
    refreshedAt: new Date().toISOString(),
    // New: breakdown by series type
    bySeriesType: {
      ALL: { entity: 0, venue: 0, recurringGame: 0 },
      SERIES: { entity: 0, venue: 0, tournamentSeries: 0 },
      REGULAR: { entity: 0, venue: 0, recurringGame: 0 }
    }
  };

  // Filter to requested series types
  const activeSeriesTypes = SERIES_TYPES.filter(st => seriesTypes.includes(st.key));

  try {
    // 1. Determine scope
    let entitiesToProcess = [];
    
    if (entityId) {
      const entity = await getEntity(entityId);
      if (entity) {
        entitiesToProcess = [entity];
      } else {
        throw new Error(`Entity not found: ${entityId}`);
      }
    } else if (venueId) {
      const venue = await getVenue(venueId);
      if (venue && venue.entityId) {
        const entity = await getEntity(venue.entityId);
        entitiesToProcess = entity ? [entity] : [];
      }
    } else {
      entitiesToProcess = await getAllEntities();
    }

    console.log(`[METRICS] Processing ${entitiesToProcess.length} entities across ${activeSeriesTypes.length} series types`);

    // 2. Process each entity
    for (const entity of entitiesToProcess) {
      try {
        console.log(`[METRICS] Processing entity: ${entity.entityName || entity.id}`);
        result.entitiesProcessed++;

        // Get all venues for this entity
        let venues = await getVenuesForEntity(entity.id);
        
        if (venueId) {
          venues = venues.filter(v => v.id === venueId);
        }

        // Get all snapshots for this entity (one big query)
        const allSnapshots = await getSnapshotsForEntity(entity.id, timeRanges);
        result.snapshotsAnalyzed += allSnapshots.length;
        
        // Log series breakdown
        const seriesCount = allSnapshots.filter(s => s.isSeries === true).length;
        const regularCount = allSnapshots.filter(s => s.isSeries !== true).length;
        console.log(`[METRICS] Fetched ${allSnapshots.length} snapshots for ${entity.entityName || entity.id} (${seriesCount} series, ${regularCount} regular)`);

        // Get all recurring games for this entity
        let recurringGames = await getRecurringGamesForEntity(entity.id);
        if (recurringGameId) {
          recurringGames = recurringGames.filter(rg => rg.id === recurringGameId);
        }

        // Get all tournament series for this entity
        let tournamentSeriesList = [];
        if (includeTournamentSeriesMetrics) {
          tournamentSeriesList = await getTournamentSeriesForEntity(entity.id);
          if (tournamentSeriesId) {
            tournamentSeriesList = tournamentSeriesList.filter(ts => ts.id === tournamentSeriesId);
          }
        }

        // 3. Calculate metrics for each time range AND series type
        for (const timeRange of timeRanges) {
          const rangeSnapshots = filterByTimeRange(allSnapshots, timeRange);
          
          if (verbose) {
            console.log(`[METRICS] ${timeRange}: ${rangeSnapshots.length} snapshots for ${entity.entityName}`);
          }

          // 3a. Loop over series types for Entity and Venue metrics
          for (const { key: seriesType, filter: seriesFilter } of activeSeriesTypes) {
            const filteredSnapshots = rangeSnapshots.filter(seriesFilter);
            
            if (verbose) {
              console.log(`[METRICS] ${timeRange}/${seriesType}: ${filteredSnapshots.length} snapshots`);
            }

            // 3a-i. Calculate EntityMetrics
            if (includeEntityMetrics && !venueId && !recurringGameId && !tournamentSeriesId) {
              const entityMetrics = calculateEntityMetrics(
                entity, venues, filteredSnapshots, recurringGames, timeRange, seriesType
              );
              
              if (!dryRun) {
                await saveEntityMetrics(entityMetrics);
                result.entityMetricsUpdated++;
                result.bySeriesType[seriesType].entity++;
              }
              
              if (verbose) {
                console.log(`[METRICS] EntityMetrics ${entity.entityName}/${timeRange}/${seriesType}:`, 
                  JSON.stringify({ totalGames: entityMetrics.totalGames, totalProfit: entityMetrics.totalProfit }, null, 2));
              }
            }

            // 3a-ii. Calculate VenueMetrics
            if (includeVenueMetrics && !recurringGameId && !tournamentSeriesId) {
              for (const venue of venues) {
                const venueSnapshots = filteredSnapshots.filter(s => s.venueId === venue.id);
                const venueRecurringGames = recurringGames.filter(rg => rg.venueId === venue.id);
                
                // Only save if there's data or it's the ALL seriesType
                if (venueSnapshots.length > 0 || seriesType === 'ALL') {
                  const venueMetrics = calculateVenueMetrics(
                    entity, venue, venueSnapshots, venueRecurringGames, timeRange, seriesType
                  );
                  
                  if (!dryRun) {
                    await saveVenueMetrics(venueMetrics);
                    result.venueMetricsUpdated++;
                    result.bySeriesType[seriesType].venue++;
                  }
                }
                
                result.venuesProcessed++;
              }
            }
          }

          // 3b. Calculate RecurringGameMetrics (only for REGULAR type, since recurring games are regular games)
          if (includeRecurringGameMetrics && !tournamentSeriesId) {
            // Filter to non-series snapshots for recurring games
            const regularSnapshots = rangeSnapshots.filter(s => s.isSeries !== true);
            
            for (const rg of recurringGames) {
              const rgSnapshots = regularSnapshots.filter(s => s.recurringGameId === rg.id);
              
              if (rgSnapshots.length > 0 || timeRange === 'ALL') {
                const rgMetrics = calculateRecurringGameMetrics(entity, rg, rgSnapshots, timeRange);
                
                if (!dryRun) {
                  await saveRecurringGameMetrics(rgMetrics);
                  result.recurringGameMetricsUpdated++;
                  result.bySeriesType.REGULAR.recurringGame++;
                }
                
                result.recurringGamesProcessed++;
              }
            }
          }

          // 3c. Calculate TournamentSeriesMetrics (only for SERIES type)
          if (includeTournamentSeriesMetrics) {
            // Filter to series snapshots
            const seriesSnapshots = rangeSnapshots.filter(s => s.isSeries === true);
            
            for (const ts of tournamentSeriesList) {
              const tsSnapshots = seriesSnapshots.filter(s => s.tournamentSeriesId === ts.id);
              
              if (tsSnapshots.length > 0 || timeRange === 'ALL') {
                const tsMetrics = calculateTournamentSeriesMetrics(entity, ts, tsSnapshots, timeRange);
                
                if (!dryRun) {
                  await saveTournamentSeriesMetrics(tsMetrics);
                  result.tournamentSeriesMetricsUpdated++;
                  result.bySeriesType.SERIES.tournamentSeries++;
                }
                
                result.tournamentSeriesProcessed++;
              }
            }
          }
        }

      } catch (entityError) {
        console.error(`[METRICS] Error processing entity ${entity.id}:`, entityError);
        result.errors.push(`Entity ${entity.entityName || entity.id}: ${entityError.message}`);
      }
    }

    result.executionTimeMs = Date.now() - startTime;
    result.message = dryRun 
      ? `Dry run complete. Would update ${result.entityMetricsUpdated} entity, ${result.venueMetricsUpdated} venue, ${result.recurringGameMetricsUpdated} recurring game, ${result.tournamentSeriesMetricsUpdated} tournament series metrics.`
      : `Metrics refresh complete. Updated ${result.entityMetricsUpdated} entity, ${result.venueMetricsUpdated} venue, ${result.recurringGameMetricsUpdated} recurring game, ${result.tournamentSeriesMetricsUpdated} tournament series metrics.`;

    console.log('[METRICS] Refresh complete:', result);
    return result;

  } catch (error) {
    console.error('[METRICS] Fatal error:', error);
    result.success = false;
    result.message = error.message;
    result.errors.push(error.message);
    result.executionTimeMs = Date.now() - startTime;
    return result;
  }
};

// ============================================
// DATA FETCHING HELPERS
// ============================================

async function getEntity(entityId) {
  const response = await docClient.send(new QueryCommand({
    TableName: ENTITY_TABLE,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': entityId },
    Limit: 1
  }));
  return response.Items?.[0] || null;
}

async function getVenue(venueId) {
  const response = await docClient.send(new QueryCommand({
    TableName: VENUE_TABLE,
    KeyConditionExpression: 'id = :id',
    ExpressionAttributeValues: { ':id': venueId },
    Limit: 1
  }));
  return response.Items?.[0] || null;
}

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

async function getVenuesForEntity(entityId) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      TableName: VENUE_TABLE,
      IndexName: INDEX_NAMES.VENUE_BY_ENTITY, 
      KeyConditionExpression: 'entityId = :entityId',
      ExpressionAttributeValues: { ':entityId': entityId },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getSnapshotsForEntity(entityId, timeRanges) {
  const maxMonths = timeRanges.includes('ALL') ? 120 :
    timeRanges.includes('12M') ? 12 :
    timeRanges.includes('6M') ? 6 :
    timeRanges.includes('3M') ? 3 : 1;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - maxMonths);
  const cutoffIso = cutoffDate.toISOString();

  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      TableName: GAME_FINANCIAL_SNAPSHOT_TABLE,
      IndexName: INDEX_NAMES.SNAPSHOT_BY_ENTITY,
      
      // FIXED: gameStartDateTime is a Sort Key, so it must be in KeyConditionExpression
      // NOT in FilterExpression
      KeyConditionExpression: 'entityId = :entityId AND gameStartDateTime >= :cutoff',
      
      ExpressionAttributeValues: { 
        ':entityId': entityId,
        ':cutoff': cutoffIso
      },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getRecurringGamesForEntity(entityId) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      TableName: RECURRING_GAME_TABLE,
      IndexName: INDEX_NAMES.RECURRING_GAME_BY_ENTITY, 
      KeyConditionExpression: 'entityId = :entityId',
      ExpressionAttributeValues: { ':entityId': entityId },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

async function getTournamentSeriesForEntity(entityId) {
  if (!TOURNAMENT_SERIES_TABLE) {
    console.warn('[METRICS] TournamentSeries table not configured, skipping');
    return [];
  }
  
  const items = [];
  let lastKey = undefined;
  
  try {
    do {
      const response = await docClient.send(new QueryCommand({
        TableName: TOURNAMENT_SERIES_TABLE,
        IndexName: INDEX_NAMES.TOURNAMENT_SERIES_BY_ENTITY, 
        KeyConditionExpression: 'entityId = :entityId',
        ExpressionAttributeValues: { ':entityId': entityId },
        ExclusiveStartKey: lastKey
      }));
      items.push(...(response.Items || []));
      lastKey = response.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn('[METRICS] Error fetching tournament series:', error.message);
  }
  
  return items;
}

// ============================================
// TIME RANGE FILTERING
// ============================================

function filterByTimeRange(snapshots, timeRange) {
  if (timeRange === 'ALL') return snapshots;

  const months = {
    '12M': 12, '6M': 6, '3M': 3, '1M': 1
  }[timeRange] || 12;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffIso = cutoffDate.toISOString();

  return snapshots.filter(s => 
    s.gameStartDateTime && s.gameStartDateTime >= cutoffIso
  );
}

// ============================================
// ENTITY METRICS CALCULATION
// ============================================

function calculateEntityMetrics(entity, venues, snapshots, recurringGames, timeRange, seriesType) {
  const now = new Date();
  
  // Filter to valid snapshots
  const validSnapshots = snapshots.filter(s => 
    s.totalEntries > 0 || s.prizepoolTotal > 0
  );

  // Basic counts
  const totalVenues = venues.length;
  const activeVenues = new Set(validSnapshots.map(s => s.venueId)).size;
  const totalGames = validSnapshots.length;
  
  // Series vs Regular breakdown
  const totalSeriesGames = validSnapshots.filter(s => s.isSeries === true).length;
  const totalRegularGames = validSnapshots.filter(s => s.isSeries !== true).length;
  
  // Recurring game counts (only relevant for regular games)
  const recurringGameIds = new Set(validSnapshots.filter(s => s.recurringGameId).map(s => s.recurringGameId));
  const totalRecurringGames = validSnapshots.filter(s => s.recurringGameId).length;
  const totalOneOffGames = validSnapshots.filter(s => !s.recurringGameId && s.isSeries !== true).length;
  const totalActiveRecurringGameTypes = recurringGameIds.size;

  // Tournament series counts (only relevant for series games)
  const tournamentSeriesIds = new Set(validSnapshots.filter(s => s.tournamentSeriesId).map(s => s.tournamentSeriesId));
  const totalActiveTournamentSeries = tournamentSeriesIds.size;

  // Player aggregates
  const totalEntries = validSnapshots.reduce((sum, s) => sum + (s.totalEntries || 0), 0);
  const totalUniquePlayers = validSnapshots.reduce((sum, s) => sum + (s.totalUniquePlayers || 0), 0);
  const totalReentries = validSnapshots.reduce((sum, s) => sum + (s.reentryCount || 0), 0);
  const totalAddons = validSnapshots.reduce((sum, s) => sum + (s.addonCount || 0), 0);

  // Financial aggregates
  const totalPrizepool = validSnapshots.reduce((sum, s) => sum + (s.prizepoolTotal || 0), 0);
  const totalRevenue = validSnapshots.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
  const totalCost = validSnapshots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = validSnapshots.reduce((sum, s) => sum + (s.netProfit || 0), 0);

  // Cost breakdown
  const totalStaffCost = validSnapshots.reduce((sum, s) => sum + (s.staffCost || s.totalStaffCost || 0), 0);
  const totalVenueRentalCost = validSnapshots.reduce((sum, s) => sum + (s.venueRentalCost || s.totalVenueRentalCost || 0), 0);
  const totalMarketingCost = validSnapshots.reduce((sum, s) => sum + (s.marketingCost || s.totalMarketingCost || 0), 0);
  const totalOperationsCost = validSnapshots.reduce((sum, s) => sum + (s.operationsCost || s.totalOperationsCost || 0), 0);

  // Rake breakdown
  const totalRakeRevenue = validSnapshots.reduce((sum, s) => sum + (s.rakeRevenue || s.houseRevenue || 0), 0);
  const totalVenueFees = validSnapshots.reduce((sum, s) => sum + (s.venueFee || s.venueFees || 0), 0);

  // Averages
  const avgEntriesPerGame = totalGames > 0 ? totalEntries / totalGames : 0;
  const avgPrizepoolPerGame = totalGames > 0 ? totalPrizepool / totalGames : 0;
  const avgProfitPerGame = totalGames > 0 ? totalProfit / totalGames : 0;
  const avgRevenuePerGame = totalGames > 0 ? totalRevenue / totalGames : 0;
  const avgGamesPerVenue = activeVenues > 0 ? totalGames / activeVenues : 0;
  const avgPlayersPerVenue = activeVenues > 0 ? totalUniquePlayers / activeVenues : 0;

  // Margins
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Date tracking
  const dates = validSnapshots
    .map(s => s.gameStartDateTime)
    .filter(Boolean)
    .sort();
  
  const firstGameDate = dates[0] || null;
  const latestGameDate = dates[dates.length - 1] || null;
  
  const firstGameDaysAgo = firstGameDate 
    ? Math.floor((now.getTime() - new Date(firstGameDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const latestGameDaysAgo = latestGameDate
    ? Math.floor((now.getTime() - new Date(latestGameDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Top venues by revenue
  const venueRevenue = {};
  validSnapshots.forEach(s => {
    if (s.venueId) {
      venueRevenue[s.venueId] = (venueRevenue[s.venueId] || 0) + (s.totalRevenue || 0);
    }
  });
  const topVenuesByRevenue = Object.entries(venueRevenue)
    .map(([venueId, revenue]) => {
      const venue = venues.find(v => v.id === venueId);
      return { 
        venueId, 
        venueName: venue?.name || 'Unknown',
        totalRevenue: revenue,
        totalProfit: validSnapshots.filter(s => s.venueId === venueId).reduce((sum, s) => sum + (s.netProfit || 0), 0)
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 10);

  return {
    // NEW: ID now includes seriesType
    id: `${entity.id}_${timeRange}_${seriesType}`,
    entityId: entity.id,
    timeRange,
    seriesType, // NEW: indicates which partition this is
    
    // Venue aggregates
    totalVenues,
    activeVenues,
    inactiveVenues: totalVenues - activeVenues,
    
    // Game aggregates
    totalGames,
    totalSeriesGames,      // NEW: breakdown
    totalRegularGames,     // NEW: breakdown
    totalRecurringGames,
    totalOneOffGames,
    totalActiveRecurringGameTypes,
    totalActiveTournamentSeries, // NEW: count of unique series
    
    // Player aggregates
    totalEntries,
    totalUniquePlayers,
    totalReentries,
    totalAddons,
    
    // Financial aggregates
    totalPrizepool,
    totalRevenue,
    totalCost,
    totalProfit,
    totalRakeRevenue,
    totalVenueFees,
    totalStaffCost,
    totalVenueRentalCost,
    totalMarketingCost,
    totalOperationsCost,
    
    // Averages
    avgEntriesPerGame: round(avgEntriesPerGame),
    avgPrizepoolPerGame: round(avgPrizepoolPerGame),
    avgProfitPerGame: round(avgProfitPerGame),
    avgRevenuePerGame: round(avgRevenuePerGame),
    avgGamesPerVenue: round(avgGamesPerVenue),
    avgPlayersPerVenue: round(avgPlayersPerVenue),
    
    // Margins
    profitMargin: round(profitMargin),
    
    // Date tracking
    firstGameDate,
    firstGameDaysAgo,
    latestGameDate,
    latestGameDaysAgo,
    
    // Top performers
    topVenuesByRevenue: JSON.stringify(topVenuesByRevenue),
    
    // Metadata
    calculatedAt: new Date().toISOString(),
    calculatedBy: 'SCHEDULED_LAMBDA',
    snapshotsIncluded: validSnapshots.length,
    venuesIncluded: venues.length,
    recurringGamesIncluded: recurringGames.length,
    dateRangeStart: firstGameDate,
    dateRangeEnd: latestGameDate,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ============================================
// VENUE METRICS CALCULATION
// ============================================

function calculateVenueMetrics(entity, venue, snapshots, recurringGames, timeRange, seriesType) {
  const now = new Date();
  
  const validSnapshots = snapshots.filter(s => 
    s.totalEntries > 0 || s.prizepoolTotal > 0
  );

  // Game breakdown
  const totalGames = validSnapshots.length;
  const totalSeriesGames = validSnapshots.filter(s => s.isSeries === true).length;
  const totalRegularGames = validSnapshots.filter(s => s.isSeries !== true).length;
  const totalRecurringGames = validSnapshots.filter(s => s.recurringGameId).length;
  const totalOneOffGames = validSnapshots.filter(s => !s.recurringGameId && s.isSeries !== true).length;
  const activeRecurringGameIds = new Set(validSnapshots.filter(s => s.recurringGameId).map(s => s.recurringGameId));
  const totalActiveRecurringGameTypes = activeRecurringGameIds.size;

  // Tournament series in this venue
  const tournamentSeriesIds = new Set(validSnapshots.filter(s => s.tournamentSeriesId).map(s => s.tournamentSeriesId));
  const totalActiveTournamentSeries = tournamentSeriesIds.size;

  // By game type
  const totalTournaments = validSnapshots.filter(s => s.gameType === 'TOURNAMENT').length;
  const totalCashGames = validSnapshots.filter(s => s.gameType === 'CASH').length;

  // By variant
  const totalNLHE = validSnapshots.filter(s => s.gameVariant === 'NLHE').length;
  const totalPLO = validSnapshots.filter(s => s.gameVariant === 'PLO' || s.gameVariant === 'PLO5').length;
  const totalOther = totalGames - totalNLHE - totalPLO;

  // Player metrics
  const totalEntries = validSnapshots.reduce((sum, s) => sum + (s.totalEntries || 0), 0);
  const totalUniquePlayers = validSnapshots.reduce((sum, s) => sum + (s.totalUniquePlayers || 0), 0);
  const totalReentries = validSnapshots.reduce((sum, s) => sum + (s.reentryCount || 0), 0);
  const totalAddons = validSnapshots.reduce((sum, s) => sum + (s.addonCount || 0), 0);

  // Financial metrics
  const totalPrizepool = validSnapshots.reduce((sum, s) => sum + (s.prizepoolTotal || 0), 0);
  const totalRevenue = validSnapshots.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
  const totalCost = validSnapshots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = validSnapshots.reduce((sum, s) => sum + (s.netProfit || 0), 0);

  // Rake breakdown
  const totalRakeRevenue = validSnapshots.reduce((sum, s) => sum + (s.rakeRevenue || s.houseRevenue || 0), 0);
  const totalVenueFees = validSnapshots.reduce((sum, s) => sum + (s.venueFee || s.venueFees || 0), 0);

  // Cost breakdown
  const totalStaffCost = validSnapshots.reduce((sum, s) => sum + (s.staffCost || s.totalStaffCost || 0), 0);
  const totalVenueRentalCost = validSnapshots.reduce((sum, s) => sum + (s.venueRentalCost || s.totalVenueRentalCost || 0), 0);
  const totalMarketingCost = validSnapshots.reduce((sum, s) => sum + (s.marketingCost || s.totalMarketingCost || 0), 0);

  // Averages
  const avgEntriesPerGame = totalGames > 0 ? totalEntries / totalGames : 0;
  const avgUniquePlayersPerGame = totalGames > 0 ? totalUniquePlayers / totalGames : 0;
  const avgPrizepoolPerGame = totalGames > 0 ? totalPrizepool / totalGames : 0;
  const avgRevenuePerGame = totalGames > 0 ? totalRevenue / totalGames : 0;
  const avgProfitPerGame = totalGames > 0 ? totalProfit / totalGames : 0;

  // Margins
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Date tracking
  const dates = validSnapshots
    .map(s => s.gameStartDateTime)
    .filter(Boolean)
    .sort();
  
  const firstGameDate = dates[0] || null;
  const latestGameDate = dates[dates.length - 1] || null;
  
  const firstGameDaysAgo = firstGameDate 
    ? Math.floor((now.getTime() - new Date(firstGameDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const latestGameDaysAgo = latestGameDate
    ? Math.floor((now.getTime() - new Date(latestGameDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const daysSinceLastGame = latestGameDaysAgo;

  // Games by day of week
  const gamesByDayOfWeek = {};
  validSnapshots.forEach(s => {
    if (s.gameStartDateTime) {
      const dayOfWeek = new Date(s.gameStartDateTime).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
      gamesByDayOfWeek[dayOfWeek] = (gamesByDayOfWeek[dayOfWeek] || 0) + 1;
    }
  });
  const peakAttendanceDay = Object.entries(gamesByDayOfWeek)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Top recurring games (only for regular games)
  const rgStats = {};
  validSnapshots.filter(s => s.recurringGameId).forEach(s => {
    if (!rgStats[s.recurringGameId]) {
      rgStats[s.recurringGameId] = { totalEntries: 0, totalProfit: 0, count: 0 };
    }
    rgStats[s.recurringGameId].totalEntries += s.totalEntries || 0;
    rgStats[s.recurringGameId].totalProfit += s.netProfit || 0;
    rgStats[s.recurringGameId].count++;
  });
  
  const topRecurringGames = Object.entries(rgStats)
    .map(([rgId, stats]) => {
      const rg = recurringGames.find(r => r.id === rgId);
      return {
        recurringGameId: rgId,
        name: rg?.name || 'Unknown',
        avgEntries: round(stats.totalEntries / stats.count),
        avgProfit: round(stats.totalProfit / stats.count),
        instanceCount: stats.count
      };
    })
    .sort((a, b) => b.avgEntries - a.avgEntries)
    .slice(0, 5);

  // Health indicators
  const overallHealth = determineHealth(avgEntriesPerGame, avgProfitPerGame, daysSinceLastGame);
  const profitability = determineProfitability(avgProfitPerGame);
  const consistency = determineConsistency(validSnapshots);

  return {
    // NEW: ID now includes seriesType
    id: `${venue.id}_${timeRange}_${seriesType}`,
    entityId: entity.id,
    venueId: venue.id,
    venueName: venue.name || 'Unknown',
    timeRange,
    seriesType, // NEW: indicates which partition this is
    
    // Game breakdown
    totalGames,
    totalSeriesGames,      // NEW: breakdown
    totalRegularGames,     // NEW: breakdown
    totalRecurringGames,
    totalOneOffGames,
    totalActiveRecurringGameTypes,
    totalActiveTournamentSeries, // NEW
    totalTournaments,
    totalCashGames,
    totalNLHE,
    totalPLO,
    totalOther,
    
    // Player metrics
    totalEntries,
    totalUniquePlayers,
    totalReentries,
    totalAddons,
    
    // Financial metrics
    totalPrizepool,
    totalRevenue,
    totalCost,
    totalProfit,
    totalRakeRevenue,
    totalVenueFees,
    totalStaffCost,
    totalVenueRentalCost,
    totalMarketingCost,
    
    // Averages
    avgEntriesPerGame: round(avgEntriesPerGame),
    avgUniquePlayersPerGame: round(avgUniquePlayersPerGame),
    avgPrizepoolPerGame: round(avgPrizepoolPerGame),
    avgRevenuePerGame: round(avgRevenuePerGame),
    avgProfitPerGame: round(avgProfitPerGame),
    
    // Margins
    profitMargin: round(profitMargin),
    
    // Date tracking
    firstGameDate,
    firstGameDaysAgo,
    latestGameDate,
    latestGameDaysAgo,
    daysSinceLastGame,
    
    // Schedule analysis
    gamesByDayOfWeek: JSON.stringify(gamesByDayOfWeek),
    peakAttendanceDay,
    
    // Top performers
    topRecurringGames: JSON.stringify(topRecurringGames),
    
    // Health indicators
    overallHealth,
    profitability,
    consistency,
    
    // Metadata
    calculatedAt: new Date().toISOString(),
    calculatedBy: 'SCHEDULED_LAMBDA',
    snapshotsIncluded: validSnapshots.length,
    recurringGamesIncluded: recurringGames.length,
    dateRangeStart: firstGameDate,
    dateRangeEnd: latestGameDate,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ============================================
// RECURRING GAME METRICS CALCULATION
// ============================================

function calculateRecurringGameMetrics(entity, recurringGame, snapshots, timeRange) {
  const now = new Date();
  
  const validSnapshots = snapshots.filter(s => 
    s.totalEntries > 0 || s.prizepoolTotal > 0
  );

  // Instance counts
  const totalInstances = validSnapshots.length;
  const actualInstances = totalInstances;
  // TODO: Calculate scheduled vs missed instances based on expected frequency

  // Player metrics
  const totalEntries = validSnapshots.reduce((sum, s) => sum + (s.totalEntries || 0), 0);
  const totalUniquePlayers = validSnapshots.reduce((sum, s) => sum + (s.totalUniquePlayers || 0), 0);
  const totalReentries = validSnapshots.reduce((sum, s) => sum + (s.reentryCount || 0), 0);
  const totalAddons = validSnapshots.reduce((sum, s) => sum + (s.addonCount || 0), 0);

  // Financial metrics
  const totalPrizepool = validSnapshots.reduce((sum, s) => sum + (s.prizepoolTotal || 0), 0);
  const totalRevenue = validSnapshots.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
  const totalCost = validSnapshots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = validSnapshots.reduce((sum, s) => sum + (s.netProfit || 0), 0);

  // Averages per instance
  const avgEntries = totalInstances > 0 ? totalEntries / totalInstances : 0;
  const avgUniquePlayers = totalInstances > 0 ? totalUniquePlayers / totalInstances : 0;
  const avgPrizepool = totalInstances > 0 ? totalPrizepool / totalInstances : 0;
  const avgRevenue = totalInstances > 0 ? totalRevenue / totalInstances : 0;
  const avgProfit = totalInstances > 0 ? totalProfit / totalInstances : 0;

  // Consistency metrics
  const entriesArray = validSnapshots.map(s => s.totalEntries || 0);
  const stdDevEntries = calculateStdDev(entriesArray);
  const minEntries = entriesArray.length > 0 ? Math.min(...entriesArray) : 0;
  const maxEntries = entriesArray.length > 0 ? Math.max(...entriesArray) : 0;
  const medianEntries = calculateMedian(entriesArray);
  const entriesCV = avgEntries > 0 ? (stdDevEntries / avgEntries) * 100 : 0;

  // Date tracking
  const dates = validSnapshots
    .map(s => s.gameStartDateTime)
    .filter(Boolean)
    .sort();
  
  const firstInstanceDate = dates[0] || null;
  const latestInstanceDate = dates[dates.length - 1] || null;
  
  const firstInstanceDaysAgo = firstInstanceDate 
    ? Math.floor((now.getTime() - new Date(firstInstanceDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const latestInstanceDaysAgo = latestInstanceDate
    ? Math.floor((now.getTime() - new Date(latestInstanceDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const daysSinceLastInstance = latestInstanceDaysAgo;

  // Recent trend (last 4 vs earlier)
  const sortedByDate = [...validSnapshots].sort((a, b) => 
    new Date(b.gameStartDateTime).getTime() - new Date(a.gameStartDateTime).getTime()
  );
  const recent4 = sortedByDate.slice(0, 4);
  const earlier = sortedByDate.slice(4);
  
  const recentAvgEntries = recent4.length > 0 
    ? recent4.reduce((sum, s) => sum + (s.totalEntries || 0), 0) / recent4.length 
    : 0;
  const longtermAvgEntries = avgEntries;
  
  const entriesTrendDirection = recentAvgEntries > longtermAvgEntries * 1.1 
    ? 'above-average' 
    : recentAvgEntries < longtermAvgEntries * 0.9 
      ? 'below-average' 
      : 'average';

  // Health indicators
  const attendanceHealth = determineAttendanceHealth(recentAvgEntries, longtermAvgEntries);
  const profitability = determineProfitability(avgProfit);
  const consistency = entriesCV < 20 ? 'very-reliable' : entriesCV < 35 ? 'reliable' : entriesCV < 50 ? 'variable' : 'erratic';
  const overallHealth = determineOverallHealth(attendanceHealth, profitability, consistency);

  // Trends
  const attendanceTrend = entriesTrendDirection === 'above-average' ? 'up' : entriesTrendDirection === 'below-average' ? 'down' : 'stable';
  const attendanceTrendPercent = longtermAvgEntries > 0 
    ? ((recentAvgEntries - longtermAvgEntries) / longtermAvgEntries) * 100 
    : 0;

  return {
    id: `${recurringGame.id}_${timeRange}`,
    entityId: entity.id,
    venueId: recurringGame.venueId,
    recurringGameId: recurringGame.id,
    recurringGameName: recurringGame.name || 'Unknown',
    timeRange,
    seriesType: 'REGULAR', // RecurringGameMetrics are always for regular games
    
    // Instance counts
    totalInstances,
    scheduledInstances: totalInstances, // TODO: Calculate expected
    actualInstances,
    missedInstances: 0, // TODO: Calculate missed
    
    // Player metrics
    totalEntries,
    totalUniquePlayers,
    totalReentries,
    totalAddons,
    
    // Financial metrics
    totalPrizepool,
    totalRevenue,
    totalCost,
    totalProfit,
    
    // Averages
    avgEntries: round(avgEntries),
    avgUniquePlayers: round(avgUniquePlayers),
    avgPrizepool: round(avgPrizepool),
    avgRevenue: round(avgRevenue),
    avgProfit: round(avgProfit),
    
    // Consistency
    stdDevEntries: round(stdDevEntries),
    minEntries: totalInstances > 0 ? minEntries : 0,
    maxEntries: totalInstances > 0 ? maxEntries : 0,
    medianEntries: round(medianEntries),
    entriesCV: round(entriesCV),
    
    // Date tracking
    firstInstanceDate,
    firstInstanceDaysAgo,
    latestInstanceDate,
    latestInstanceDaysAgo,
    daysSinceLastInstance,
    
    // Trends
    recentAvgEntries: round(recentAvgEntries),
    longtermAvgEntries: round(longtermAvgEntries),
    entriesTrendDirection,
    attendanceTrend,
    attendanceTrendPercent: round(attendanceTrendPercent),
    
    // Health indicators
    attendanceHealth,
    profitability,
    consistency,
    overallHealth,
    
    // Metadata
    calculatedAt: new Date().toISOString(),
    calculatedBy: 'SCHEDULED_LAMBDA',
    snapshotsIncluded: validSnapshots.length,
    dateRangeStart: firstInstanceDate,
    dateRangeEnd: latestInstanceDate,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ============================================
// TOURNAMENT SERIES METRICS CALCULATION (NEW)
// ============================================

function calculateTournamentSeriesMetrics(entity, tournamentSeries, snapshots, timeRange) {
  const now = new Date();
  
  const validSnapshots = snapshots.filter(s => 
    s.totalEntries > 0 || s.prizepoolTotal > 0
  );

  // Only count parent/consolidated games to avoid double-counting flights
  const parentSnapshots = validSnapshots.filter(s => s.isSeriesParent === true || !s.parentGameId);
  
  // Event counts
  const totalEvents = parentSnapshots.length;
  const totalFlights = validSnapshots.filter(s => s.parentGameId).length;
  
  // Unique venues used
  const uniqueVenues = new Set(validSnapshots.map(s => s.venueId)).size;

  // Player metrics (use parent snapshots to avoid double-counting)
  const totalEntries = parentSnapshots.reduce((sum, s) => sum + (s.totalEntries || 0), 0);
  const totalUniquePlayers = parentSnapshots.reduce((sum, s) => sum + (s.totalUniquePlayers || 0), 0);
  const totalReentries = parentSnapshots.reduce((sum, s) => sum + (s.reentryCount || 0), 0);
  const totalAddons = parentSnapshots.reduce((sum, s) => sum + (s.addonCount || 0), 0);

  // Financial metrics
  const totalPrizepool = parentSnapshots.reduce((sum, s) => sum + (s.prizepoolTotal || 0), 0);
  const totalRevenue = parentSnapshots.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
  const totalCost = parentSnapshots.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalProfit = parentSnapshots.reduce((sum, s) => sum + (s.netProfit || 0), 0);

  // Averages per event
  const avgEntriesPerEvent = totalEvents > 0 ? totalEntries / totalEvents : 0;
  const avgUniquePlayersPerEvent = totalEvents > 0 ? totalUniquePlayers / totalEvents : 0;
  const avgPrizepoolPerEvent = totalEvents > 0 ? totalPrizepool / totalEvents : 0;
  const avgRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0;
  const avgProfitPerEvent = totalEvents > 0 ? totalProfit / totalEvents : 0;

  // Consistency metrics
  const entriesArray = parentSnapshots.map(s => s.totalEntries || 0);
  const stdDevEntries = calculateStdDev(entriesArray);
  const minEntries = entriesArray.length > 0 ? Math.min(...entriesArray) : 0;
  const maxEntries = entriesArray.length > 0 ? Math.max(...entriesArray) : 0;
  const medianEntries = calculateMedian(entriesArray);
  const entriesCV = avgEntriesPerEvent > 0 ? (stdDevEntries / avgEntriesPerEvent) * 100 : 0;

  // Main event tracking
  const mainEvents = parentSnapshots.filter(s => s.isMainEvent === true);
  const mainEventCount = mainEvents.length;
  const mainEventTotalEntries = mainEvents.reduce((sum, s) => sum + (s.totalEntries || 0), 0);
  const mainEventAvgEntries = mainEventCount > 0 ? mainEventTotalEntries / mainEventCount : 0;

  // Margins
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Date tracking
  const dates = validSnapshots
    .map(s => s.gameStartDateTime)
    .filter(Boolean)
    .sort();
  
  const firstEventDate = dates[0] || null;
  const latestEventDate = dates[dates.length - 1] || null;
  
  const firstEventDaysAgo = firstEventDate 
    ? Math.floor((now.getTime() - new Date(firstEventDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const latestEventDaysAgo = latestEventDate
    ? Math.floor((now.getTime() - new Date(latestEventDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Calculate series duration (first to last event)
  let seriesDurationDays = null;
  if (firstEventDate && latestEventDate) {
    seriesDurationDays = Math.floor(
      (new Date(latestEventDate).getTime() - new Date(firstEventDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Health indicators
  const profitability = determineProfitability(avgProfitPerEvent);
  const consistency = entriesCV < 20 ? 'very-reliable' : entriesCV < 35 ? 'reliable' : entriesCV < 50 ? 'variable' : 'erratic';

  return {
    id: `${tournamentSeries.id}_${timeRange}`,
    entityId: entity.id,
    tournamentSeriesId: tournamentSeries.id,
    seriesName: tournamentSeries.name || tournamentSeries.seriesName || 'Unknown',
    timeRange,
    seriesType: 'SERIES', // TournamentSeriesMetrics are always for series games
    
    // Event counts
    totalEvents,
    totalFlights,
    uniqueVenues,
    mainEventCount,
    
    // Player metrics
    totalEntries,
    totalUniquePlayers,
    totalReentries,
    totalAddons,
    mainEventTotalEntries,
    
    // Financial metrics
    totalPrizepool,
    totalRevenue,
    totalCost,
    totalProfit,
    
    // Averages
    avgEntriesPerEvent: round(avgEntriesPerEvent),
    avgUniquePlayersPerEvent: round(avgUniquePlayersPerEvent),
    avgPrizepoolPerEvent: round(avgPrizepoolPerEvent),
    avgRevenuePerEvent: round(avgRevenuePerEvent),
    avgProfitPerEvent: round(avgProfitPerEvent),
    mainEventAvgEntries: round(mainEventAvgEntries),
    
    // Consistency
    stdDevEntries: round(stdDevEntries),
    minEntries: totalEvents > 0 ? minEntries : 0,
    maxEntries: totalEvents > 0 ? maxEntries : 0,
    medianEntries: round(medianEntries),
    entriesCV: round(entriesCV),
    
    // Margins
    profitMargin: round(profitMargin),
    
    // Date tracking
    firstEventDate,
    firstEventDaysAgo,
    latestEventDate,
    latestEventDaysAgo,
    seriesDurationDays,
    
    // Health indicators
    profitability,
    consistency,
    
    // Metadata
    calculatedAt: new Date().toISOString(),
    calculatedBy: 'SCHEDULED_LAMBDA',
    snapshotsIncluded: validSnapshots.length,
    parentSnapshotsIncluded: parentSnapshots.length,
    dateRangeStart: firstEventDate,
    dateRangeEnd: latestEventDate,
    
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ============================================
// SAVE HELPERS
// ============================================

async function saveEntityMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: ENTITY_METRICS_TABLE,
    Item: metrics
  }));
}

async function saveVenueMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: VENUE_METRICS_TABLE,
    Item: metrics
  }));
}

async function saveRecurringGameMetrics(metrics) {
  await docClient.send(new PutCommand({
    TableName: RECURRING_GAME_METRICS_TABLE,
    Item: metrics
  }));
}

async function saveTournamentSeriesMetrics(metrics) {
  if (!TOURNAMENT_SERIES_METRICS_TABLE) {
    console.warn('[METRICS] TournamentSeriesMetrics table not configured, skipping save');
    return;
  }
  
  await docClient.send(new PutCommand({
    TableName: TOURNAMENT_SERIES_METRICS_TABLE,
    Item: metrics
  }));
}

// ============================================
// UTILITY HELPERS
// ============================================

function round(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function calculateStdDev(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(avgSquareDiff);
}

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function determineHealth(avgEntries, avgProfit, daysSinceLastGame) {
  if (daysSinceLastGame > 30) return 'critical';
  if (avgEntries < 10 || avgProfit < 0) return 'needs-attention';
  if (avgEntries > 40 && avgProfit > 100) return 'excellent';
  return 'good';
}

function determineProfitability(avgProfit) {
  if (avgProfit > 200) return 'highly-profitable';
  if (avgProfit > 50) return 'profitable';
  if (avgProfit > 0) return 'break-even';
  return 'loss';
}

function determineConsistency(snapshots) {
  if (snapshots.length < 3) return 'insufficient-data';
  const entries = snapshots.map(s => s.totalEntries || 0);
  const mean = entries.reduce((a, b) => a + b, 0) / entries.length;
  if (mean === 0) return 'insufficient-data';
  const cv = calculateStdDev(entries) / mean;
  if (cv < 0.15) return 'very-consistent';
  if (cv < 0.30) return 'consistent';
  if (cv < 0.50) return 'variable';
  return 'erratic';
}

function determineAttendanceHealth(recentAvg, longtermAvg) {
  if (longtermAvg === 0) return 'insufficient-data';
  const ratio = recentAvg / longtermAvg;
  if (ratio > 1.1) return 'growing';
  if (ratio < 0.8) return 'declining';
  if (ratio < 0.6) return 'critical';
  return 'stable';
}

function determineOverallHealth(attendance, profit, consistency) {
  const scores = {
    'growing': 3, 'stable': 2, 'declining': 1, 'critical': 0,
    'highly-profitable': 3, 'profitable': 2, 'break-even': 1, 'loss': 0,
    'very-reliable': 3, 'reliable': 2, 'variable': 1, 'erratic': 0, 'very-consistent': 3, 'consistent': 2
  };
  
  const total = (scores[attendance] || 1) + (scores[profit] || 1) + (scores[consistency] || 1);
  if (total >= 8) return 'excellent';
  if (total >= 5) return 'good';
  if (total >= 3) return 'needs-attention';
  return 'critical';
}