/**
 * Recurring Game Trends Fetcher
 * ==============================
 * Fetches pre-calculated RecurringGameMetrics for trending analysis.
 * The metrics are already calculated nightly by refreshAllMetrics Lambda.
 * 
 * This provides per-game trending data like:
 * - recentAvgEntries vs longtermAvgEntries
 * - attendanceTrend, profitTrend
 * - attendanceHealth, brandStrength indicators
 * - runRate (schedule compliance)
 * 
 * GSIs Used:
 * - RecurringGameMetrics: byEntityRecurringGameMetrics (entityId, recurringGameId)
 * - RecurringGameMetrics: byVenueRecurringGameMetrics (venueId, recurringGameId)
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

const RECURRING_GAME_METRICS_TABLE = getTableName('RecurringGameMetrics');

/**
 * Fetch RecurringGameMetrics for an entity.
 * Uses byEntityRecurringGameMetrics GSI.
 * 
 * @param {string} entityId 
 * @param {string} timeRange - '1M', '3M', '6M', '12M', 'ALL'
 * @returns {Object[]} Array of RecurringGameMetrics
 */
async function fetchRecurringGameMetricsForEntity(entityId, timeRange = '1M') {
  const metrics = [];
  let lastKey = undefined;
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: RECURRING_GAME_METRICS_TABLE,
        IndexName: 'byEntityRecurringGameMetrics',
        KeyConditionExpression: 'entityId = :entityId',
        FilterExpression: 'timeRange = :timeRange',
        ExpressionAttributeValues: {
          ':entityId': entityId,
          ':timeRange': timeRange
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        metrics.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
    
    console.log(`Found ${metrics.length} recurring game metrics for entity (${timeRange})`);
  } catch (error) {
    console.warn('RecurringGameMetrics fetch failed:', error.message);
  }
  
  return metrics;
}

/**
 * Fetch RecurringGameMetrics for a specific venue.
 * Uses byVenueRecurringGameMetrics GSI.
 */
async function fetchRecurringGameMetricsForVenue(venueId, timeRange = '1M') {
  const metrics = [];
  let lastKey = undefined;
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: RECURRING_GAME_METRICS_TABLE,
        IndexName: 'byVenueRecurringGameMetrics',
        KeyConditionExpression: 'venueId = :venueId',
        FilterExpression: 'timeRange = :timeRange',
        ExpressionAttributeValues: {
          ':venueId': venueId,
          ':timeRange': timeRange
        },
        ExclusiveStartKey: lastKey
      }));
      
      if (result.Items) {
        metrics.push(...result.Items);
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);
  } catch (error) {
    console.warn(`RecurringGameMetrics fetch for venue ${venueId} failed:`, error.message);
  }
  
  return metrics;
}

/**
 * Derive brand strength from metrics.
 * Brand strength = consistent attendance + positive trend + good profitability
 */
function deriveBrandStrength(metrics) {
  let score = 0;
  
  // Consistency contributes up to 3 points
  if (metrics.consistency === 'very-reliable') score += 3;
  else if (metrics.consistency === 'reliable') score += 2;
  else if (metrics.consistency === 'variable') score += 1;
  
  // Attendance trend contributes up to 2 points
  if (metrics.attendanceTrend === 'up') score += 2;
  else if (metrics.attendanceTrend === 'stable') score += 1;
  
  // Profitability contributes up to 2 points
  if (metrics.profitability === 'highly-profitable') score += 2;
  else if (metrics.profitability === 'profitable') score += 1;
  
  // Total instances (longevity) contributes up to 2 points
  if (metrics.totalInstances >= 20) score += 2;
  else if (metrics.totalInstances >= 10) score += 1;
  
  // Convert to label
  if (score >= 7) return 'STRONG';
  if (score >= 5) return 'GROWING';
  if (score >= 3) return 'STABLE';
  if (score >= 1) return 'WEAK';
  return 'AT_RISK';
}

/**
 * Get recommendation based on metrics.
 */
function getRecommendation(metrics) {
  const recommendations = [];
  
  // Attendance issues
  if (metrics.attendanceHealth === 'critical') {
    recommendations.push('URGENT: Review game viability - attendance critically low');
  } else if (metrics.attendanceHealth === 'declining') {
    recommendations.push('Attendance declining - consider marketing boost or format refresh');
  }
  
  // Consistency issues
  if (metrics.consistency === 'erratic') {
    recommendations.push('High variance in attendance - investigate external factors');
  }
  
  // Profitability issues
  if (metrics.profitability === 'loss') {
    recommendations.push('Game running at a loss - review cost structure and guarantees');
  } else if (metrics.profitability === 'break-even') {
    recommendations.push('Marginal profitability - consider cost reduction or entry growth');
  }
  
  // Positive signals
  if (metrics.attendanceTrend === 'up' && metrics.profitability === 'highly-profitable') {
    recommendations.push('Strong performer - consider increasing guarantee or adding similar game');
  }
  
  // Run rate issues
  if (metrics.runRate && metrics.runRate < 80) {
    recommendations.push('High cancellation rate - evaluate if game should remain on schedule');
  }
  
  return recommendations.length > 0 ? recommendations[0] : null;
}

/**
 * Transform RecurringGameMetrics to pack format.
 */
function transformMetricsForPack(metrics) {
  return {
    recurringGameId: metrics.recurringGameId,
    name: metrics.recurringGameName,
    venueId: metrics.venueId,
    entityId: metrics.entityId,
    
    // Instance counts
    totalInstances: metrics.totalInstances || 0,
    scheduledInstances: metrics.scheduledInstances || 0,
    missedInstances: metrics.missedInstances || 0,
    runRate: metrics.runRate,
    
    // Current performance
    recentAvgEntries: metrics.recentAvgEntries,
    longtermAvgEntries: metrics.longtermAvgEntries,
    avgEntries: metrics.avgEntries,
    avgProfit: metrics.avgProfit,
    totalProfit: metrics.totalProfit,
    
    // Trends (pre-calculated!)
    attendanceTrend: metrics.attendanceTrend,
    attendanceTrendPercent: metrics.attendanceTrendPercent,
    profitTrend: metrics.profitTrend,
    profitTrendPercent: metrics.profitTrendPercent,
    entriesTrendDirection: metrics.entriesTrendDirection,
    
    // Health indicators
    attendanceHealth: metrics.attendanceHealth,
    profitability: metrics.profitability,
    consistency: metrics.consistency,
    overallHealth: metrics.overallHealth,
    
    // Derived fields
    brandStrength: deriveBrandStrength(metrics),
    recommendation: getRecommendation(metrics),
    
    // Dates
    latestInstanceDate: metrics.latestInstanceDate,
    daysSinceLastInstance: metrics.daysSinceLastInstance,
    
    // Rankings
    rankAtVenue: metrics.rankAtVenue,
    performanceVsEntityAvg: metrics.performanceVsEntityAvg
  };
}

/**
 * Categorize recurring games by health status.
 */
function categorizeByHealth(metrics) {
  const categories = {
    excellent: [],
    good: [],
    needsAttention: [],
    critical: []
  };
  
  for (const m of metrics) {
    const health = m.overallHealth || 'good';
    if (health === 'excellent') categories.excellent.push(m);
    else if (health === 'good') categories.good.push(m);
    else if (health === 'needs-attention') categories.needsAttention.push(m);
    else if (health === 'critical') categories.critical.push(m);
    else categories.good.push(m); // Default
  }
  
  return categories;
}

/**
 * Build recurring game trends data for MetricsPack.
 */
async function buildRecurringGameTrendsData(entityId, venueLookup = null) {
  // Fetch 1M metrics (most relevant for weekly/monthly reports)
  const metrics = await fetchRecurringGameMetricsForEntity(entityId, '1M');
  
  if (metrics.length === 0) {
    return {
      hasRecurringGameData: false,
      message: 'No recurring game metrics found for this entity'
    };
  }
  
  // Transform all metrics
  const transformed = metrics.map(m => {
    const result = transformMetricsForPack(m);
    // Add venue name if lookup provided
    if (venueLookup && m.venueId) {
      result.venueName = venueLookup.get(m.venueId) || 'Unknown Venue';
    }
    return result;
  });
  
  // Categorize by health
  const byHealth = categorizeByHealth(transformed);
  
  // Top performers (by profit)
  const topPerformers = [...transformed]
    .filter(m => m.totalInstances >= 2) // At least 2 instances
    .sort((a, b) => (b.avgProfit || 0) - (a.avgProfit || 0))
    .slice(0, 10);
  
  // Growing games (positive attendance trend)
  const growingGames = [...transformed]
    .filter(m => m.attendanceTrend === 'up' && m.attendanceTrendPercent > 5)
    .sort((a, b) => (b.attendanceTrendPercent || 0) - (a.attendanceTrendPercent || 0))
    .slice(0, 5);
  
  // Declining games (negative attendance trend)
  const decliningGames = [...transformed]
    .filter(m => m.attendanceTrend === 'down' || m.attendanceHealth === 'declining' || m.attendanceHealth === 'critical')
    .sort((a, b) => (a.attendanceTrendPercent || 0) - (b.attendanceTrendPercent || 0))
    .slice(0, 5);
  
  // Games needing attention
  const needsAttention = [...transformed]
    .filter(m => m.overallHealth === 'needs-attention' || m.overallHealth === 'critical')
    .sort((a, b) => {
      // Critical first, then by worst metrics
      if (a.overallHealth === 'critical' && b.overallHealth !== 'critical') return -1;
      if (b.overallHealth === 'critical' && a.overallHealth !== 'critical') return 1;
      return (a.avgProfit || 0) - (b.avgProfit || 0);
    })
    .slice(0, 10);
  
  // Strong brands
  const strongBrands = [...transformed]
    .filter(m => m.brandStrength === 'STRONG' || m.brandStrength === 'GROWING')
    .sort((a, b) => {
      if (a.brandStrength === 'STRONG' && b.brandStrength !== 'STRONG') return -1;
      if (b.brandStrength === 'STRONG' && a.brandStrength !== 'STRONG') return 1;
      return (b.totalInstances || 0) - (a.totalInstances || 0);
    })
    .slice(0, 10);
  
  // High cancellation rate games
  const highCancellation = [...transformed]
    .filter(m => m.runRate && m.runRate < 80)
    .sort((a, b) => (a.runRate || 100) - (b.runRate || 100))
    .slice(0, 5);
  
  return {
    hasRecurringGameData: true,
    summary: {
      totalRecurringGames: transformed.length,
      excellent: byHealth.excellent.length,
      good: byHealth.good.length,
      needsAttention: byHealth.needsAttention.length,
      critical: byHealth.critical.length,
      growingCount: growingGames.length,
      decliningCount: decliningGames.length
    },
    topPerformers,
    growingGames,
    decliningGames,
    needsAttention,
    strongBrands,
    highCancellation,
    // Full list for detailed analysis (limit to 50)
    allGames: transformed.slice(0, 50)
  };
}

module.exports = {
  fetchRecurringGameMetricsForEntity,
  fetchRecurringGameMetricsForVenue,
  buildRecurringGameTrendsData,
  deriveBrandStrength,
  transformMetricsForPack
};
