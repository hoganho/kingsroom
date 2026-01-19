/**
 * Series Lifecycle Fetcher
 * =========================
 * Fetches TournamentSeries data and determines lifecycle phase.
 * Provides series-level insights for pre/mid/post series reports.
 * 
 * Series Phases:
 * - PRE: startDate in future or within 2 weeks
 * - ACTIVE: Between startDate and endDate
 * - POST: After endDate
 * 
 * GSIs Used:
 * - TournamentSeries: byEntityTournamentSeries (entityId)
 * - TournamentSeriesMetrics: byEntityTournamentSeriesMetrics (entityId, tournamentSeriesId)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const getTableName = (baseName) => {
  const envVarName = `API_KINGSROOM_${baseName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

const TOURNAMENT_SERIES_TABLE = getTableName('TournamentSeries');
const TOURNAMENT_SERIES_METRICS_TABLE = getTableName('TournamentSeriesMetrics');
const GAME_FINANCIAL_SNAPSHOT_TABLE = getTableName('GameFinancialSnapshot');

/**
 * Determine series phase based on dates.
 */
function determineSeriesPhase(series, referenceDate = new Date()) {
  if (!series.startDate) return 'UNKNOWN';
  
  const start = new Date(series.startDate);
  const end = series.endDate ? new Date(series.endDate) : null;
  const twoWeeksFromNow = new Date(referenceDate);
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
  
  // PRE: Starts in future or within 2 weeks
  if (start > referenceDate) {
    return 'PRE';
  }
  
  // POST: End date has passed
  if (end && referenceDate > end) {
    return 'POST';
  }
  
  // ACTIVE: Currently running
  return 'ACTIVE';
}

/**
 * Fetch all TournamentSeries for an entity.
 * Uses byEntityTournamentSeries GSI.
 */
async function fetchAllSeriesForEntity(entityId) {
  const series = [];
  let lastKey = undefined;
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: TOURNAMENT_SERIES_TABLE,
        IndexName: 'byEntityTournamentSeries',
        KeyConditionExpression: 'entityId = :entityId',
        ExpressionAttributeValues: {
          ':entityId': entityId
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        series.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`Found ${series.length} tournament series for entity`);
  } catch (error) {
    console.warn('TournamentSeries fetch failed:', error.message);
  }
  
  return series;
}

/**
 * Fetch TournamentSeriesMetrics for multiple series.
 * Uses BatchGetCommand for efficiency.
 */
async function fetchSeriesMetrics(seriesIds, timeRange = '1M') {
  const metrics = new Map();
  if (!seriesIds || seriesIds.length === 0) return metrics;
  
  const uniqueIds = [...new Set(seriesIds)];
  const CHUNK_SIZE = 100;
  
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const keys = chunk.map(id => ({ id: `${id}_${timeRange}` }));
    
    try {
      const response = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [TOURNAMENT_SERIES_METRICS_TABLE]: {
            Keys: keys
          }
        }
      }));
      
      const items = response.Responses?.[TOURNAMENT_SERIES_METRICS_TABLE] || [];
      for (const item of items) {
        metrics.set(item.tournamentSeriesId, item);
      }
    } catch (error) {
      console.warn('TournamentSeriesMetrics batch fetch failed:', error.message);
    }
  }
  
  return metrics;
}

/**
 * Fetch games for a series to calculate progress.
 * Uses byTournamentSeriesSnapshot GSI on GameFinancialSnapshot.
 */
async function fetchSeriesGames(seriesId) {
  const games = [];
  let lastKey = undefined;
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: GAME_FINANCIAL_SNAPSHOT_TABLE,
        IndexName: 'byTournamentSeriesSnapshot',
        KeyConditionExpression: 'tournamentSeriesId = :seriesId',
        ExpressionAttributeValues: {
          ':seriesId': seriesId
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        games.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn(`Series games fetch failed for ${seriesId}:`, error.message);
  }
  
  return games;
}

/**
 * Calculate series progress for active series.
 */
function calculateSeriesProgress(series, games, metrics) {
  const eventsCompleted = games.length;
  const eventsPlanned = series.numberOfEvents || 0;
  const eventsRemaining = Math.max(0, eventsPlanned - eventsCompleted);
  
  // Calculate prizepool progress
  const actualPrizepool = games.reduce((sum, g) => sum + (g.totalPrizepool || 0), 0);
  const guaranteedPrizepool = series.guaranteedPrizepool || 0;
  const estimatedPrizepool = series.estimatedPrizepool || guaranteedPrizepool;
  
  // Progress percentages
  const eventProgress = eventsPlanned > 0 ? (eventsCompleted / eventsPlanned) * 100 : 0;
  const prizepoolProgress = estimatedPrizepool > 0 ? (actualPrizepool / estimatedPrizepool) * 100 : 0;
  
  // On track assessment
  let progressStatus = 'ON_TRACK';
  if (eventProgress > 0) {
    const expectedPrizepoolByNow = estimatedPrizepool * (eventProgress / 100);
    if (actualPrizepool < expectedPrizepoolByNow * 0.8) {
      progressStatus = 'BEHIND';
    } else if (actualPrizepool > expectedPrizepoolByNow * 1.2) {
      progressStatus = 'AHEAD';
    }
  }
  
  // Total entries so far
  const totalEntries = games.reduce((sum, g) => sum + (g.totalEntries || 0), 0);
  const avgEntriesPerEvent = eventsCompleted > 0 ? totalEntries / eventsCompleted : 0;
  
  return {
    eventsCompleted,
    eventsPlanned,
    eventsRemaining,
    eventProgress: Math.round(eventProgress),
    actualPrizepool: Math.round(actualPrizepool),
    guaranteedPrizepool: Math.round(guaranteedPrizepool),
    estimatedPrizepool: Math.round(estimatedPrizepool),
    prizepoolProgress: Math.round(prizepoolProgress),
    progressStatus,
    totalEntries,
    avgEntriesPerEvent: Math.round(avgEntriesPerEvent * 10) / 10
  };
}

/**
 * Build series lifecycle data for MetricsPack.
 */
async function buildSeriesLifecycleData(entityId, periodStart, periodEnd) {
  const now = new Date();
  
  // Fetch all series for entity
  const allSeries = await fetchAllSeriesForEntity(entityId);
  
  if (allSeries.length === 0) {
    return {
      hasSeriesData: false,
      message: 'No tournament series found for this entity'
    };
  }
  
  // Categorize by phase
  const activeSeries = [];
  const upcomingSeries = [];
  const recentlyCompletedSeries = [];
  
  // Determine phases and filter
  for (const series of allSeries) {
    const phase = determineSeriesPhase(series, now);
    series._phase = phase;
    
    if (phase === 'ACTIVE') {
      activeSeries.push(series);
    } else if (phase === 'PRE') {
      // Only include if starting within 60 days
      const start = new Date(series.startDate);
      const daysUntilStart = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
      if (daysUntilStart <= 60) {
        series._daysUntilStart = daysUntilStart;
        upcomingSeries.push(series);
      }
    } else if (phase === 'POST') {
      // Only include if completed within last 90 days
      const end = new Date(series.endDate);
      const daysSinceEnd = Math.ceil((now - end) / (1000 * 60 * 60 * 24));
      if (daysSinceEnd <= 90) {
        series._daysSinceEnd = daysSinceEnd;
        recentlyCompletedSeries.push(series);
      }
    }
  }
  
  // Fetch metrics for relevant series
  const relevantSeriesIds = [
    ...activeSeries.map(s => s.id),
    ...upcomingSeries.map(s => s.id),
    ...recentlyCompletedSeries.map(s => s.id)
  ];
  const metricsMap = await fetchSeriesMetrics(relevantSeriesIds);
  
  // Build active series with progress
  const activeSeriesData = [];
  for (const series of activeSeries) {
    const games = await fetchSeriesGames(series.id);
    const metrics = metricsMap.get(series.id);
    const progress = calculateSeriesProgress(series, games, metrics);
    
    activeSeriesData.push({
      seriesId: series.id,
      seriesName: series.name,
      venueId: series.venueId,
      startDate: series.startDate,
      endDate: series.endDate,
      phase: 'ACTIVE',
      ...progress,
      metrics: metrics ? {
        totalProfit: metrics.totalProfit,
        profitMargin: metrics.profitMargin,
        avgEntriesPerEvent: metrics.avgEntriesPerEvent,
        overallHealth: metrics.overallHealth
      } : null
    });
  }
  
  // Build upcoming series (simplified - no progress yet)
  const upcomingSeriesData = upcomingSeries
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 5)
    .map(series => ({
      seriesId: series.id,
      seriesName: series.name,
      venueId: series.venueId,
      startDate: series.startDate,
      endDate: series.endDate,
      daysUntilStart: series._daysUntilStart,
      phase: 'PRE',
      numberOfEvents: series.numberOfEvents,
      guaranteedPrizepool: series.guaranteedPrizepool
    }));
  
  // Build recently completed series with final metrics
  const completedSeriesData = recentlyCompletedSeries
    .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
    .slice(0, 5)
    .map(series => {
      const metrics = metricsMap.get(series.id);
      return {
        seriesId: series.id,
        seriesName: series.name,
        venueId: series.venueId,
        startDate: series.startDate,
        endDate: series.endDate,
        daysSinceEnd: series._daysSinceEnd,
        phase: 'POST',
        numberOfEvents: series.numberOfEvents,
        actualPrizepool: series.actualPrizepool,
        guaranteedPrizepool: series.guaranteedPrizepool,
        metrics: metrics ? {
          totalEvents: metrics.totalEvents,
          totalEntries: metrics.totalEntries,
          totalProfit: metrics.totalProfit,
          profitMargin: metrics.profitMargin,
          avgEntriesPerEvent: metrics.avgEntriesPerEvent,
          overallHealth: metrics.overallHealth,
          profitability: metrics.profitability
        } : null
      };
    });
  
  return {
    hasSeriesData: true,
    summary: {
      totalSeries: allSeries.length,
      activeSeries: activeSeries.length,
      upcomingSeries: upcomingSeries.length,
      recentlyCompleted: recentlyCompletedSeries.length
    },
    active: activeSeriesData,
    upcoming: upcomingSeriesData,
    recentlyCompleted: completedSeriesData
  };
}

module.exports = {
  fetchAllSeriesForEntity,
  fetchSeriesMetrics,
  fetchSeriesGames,
  determineSeriesPhase,
  calculateSeriesProgress,
  buildSeriesLifecycleData
};
