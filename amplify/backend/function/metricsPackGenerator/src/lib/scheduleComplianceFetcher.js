/**
 * Schedule Compliance Fetcher
 * ============================
 * Fetches RecurringGameInstance data to analyze schedule compliance.
 * This data shows cancelled games, no-shows, and schedule adherence.
 * 
 * Instance Status Types:
 * - CONFIRMED: Game happened as scheduled
 * - CANCELLED: Explicitly cancelled
 * - SKIPPED: Venue closed/holiday
 * - REPLACED: Different game ran in its slot
 * - UNKNOWN: No data - needs investigation
 * - NO_SHOW: Expected but never appeared
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name
const getTableName = (baseName) => {
  const envVarName = `API_KINGSROOM_${baseName.toUpperCase()}TABLE_NAME`;
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

const RECURRING_GAME_INSTANCE_TABLE = getTableName('RecurringGameInstance');

/**
 * Fetch all RecurringGameInstances for an entity within a date range.
 * Uses the byEntityInstance GSI (entityId, expectedDate).
 * 
 * @param {string} entityId 
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @returns {Object[]} Array of RecurringGameInstance records
 */
async function fetchScheduleInstances(entityId, startDate, endDate) {
  const instances = [];
  let lastEvaluatedKey = undefined;
  
  // Format dates as YYYY-MM-DD for the expectedDate sort key
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  console.log(`Fetching schedule instances for entity ${entityId} from ${startDateStr} to ${endDateStr}`);
  
  try {
    do {
      const result = await docClient.send(new QueryCommand({
        TableName: RECURRING_GAME_INSTANCE_TABLE,
        IndexName: 'byEntityInstance',
        KeyConditionExpression: 'entityId = :entityId AND expectedDate BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':entityId': entityId,
          ':start': startDateStr,
          ':end': endDateStr
        },
        ExclusiveStartKey: lastEvaluatedKey
      }));
      
      if (result.Items) {
        instances.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    console.log(`Found ${instances.length} schedule instances`);
  } catch (error) {
    console.warn('RecurringGameInstance fetch failed:', error.message);
    // Return empty array rather than failing - this data is supplementary
  }
  
  return instances;
}

/**
 * Calculate schedule compliance metrics from instances.
 * 
 * @param {Object[]} instances - RecurringGameInstance records
 * @returns {Object} Compliance summary
 */
function calculateScheduleCompliance(instances) {
  if (!instances || instances.length === 0) {
    return {
      totalExpected: 0,
      confirmed: 0,
      cancelled: 0,
      skipped: 0,
      noShow: 0,
      unknown: 0,
      replaced: 0,
      complianceRate: null,
      cancellationRate: null,
      byDayOfWeek: {},
      byVenue: {},
      byRecurringGame: {},
      recentCancellations: [],
      needsReview: []
    };
  }
  
  // Count by status
  const statusCounts = {
    CONFIRMED: 0,
    CANCELLED: 0,
    SKIPPED: 0,
    NO_SHOW: 0,
    UNKNOWN: 0,
    REPLACED: 0
  };
  
  // Group by day of week
  const byDayOfWeek = {};
  
  // Group by venue
  const byVenue = {};
  
  // Group by recurring game
  const byRecurringGame = {};
  
  // Recent cancellations (for alerts)
  const recentCancellations = [];
  
  // Needs review
  const needsReview = [];
  
  for (const instance of instances) {
    const status = instance.status || 'UNKNOWN';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    
    // By day of week
    const day = instance.dayOfWeek || 'UNKNOWN';
    if (!byDayOfWeek[day]) {
      byDayOfWeek[day] = { total: 0, confirmed: 0, cancelled: 0 };
    }
    byDayOfWeek[day].total++;
    if (status === 'CONFIRMED') byDayOfWeek[day].confirmed++;
    if (status === 'CANCELLED' || status === 'SKIPPED') byDayOfWeek[day].cancelled++;
    
    // By venue
    const venueId = instance.venueId || 'unknown';
    if (!byVenue[venueId]) {
      byVenue[venueId] = { total: 0, confirmed: 0, cancelled: 0 };
    }
    byVenue[venueId].total++;
    if (status === 'CONFIRMED') byVenue[venueId].confirmed++;
    if (status === 'CANCELLED' || status === 'SKIPPED') byVenue[venueId].cancelled++;
    
    // By recurring game
    const rgId = instance.recurringGameId;
    if (rgId) {
      if (!byRecurringGame[rgId]) {
        byRecurringGame[rgId] = { 
          name: instance.recurringGameName || 'Unknown',
          total: 0, 
          confirmed: 0, 
          cancelled: 0,
          cancellationReasons: []
        };
      }
      byRecurringGame[rgId].total++;
      if (status === 'CONFIRMED') byRecurringGame[rgId].confirmed++;
      if (status === 'CANCELLED' || status === 'SKIPPED') {
        byRecurringGame[rgId].cancelled++;
        if (instance.cancellationReason) {
          byRecurringGame[rgId].cancellationReasons.push(instance.cancellationReason);
        }
      }
    }
    
    // Track recent cancellations (limit to 10)
    if ((status === 'CANCELLED' || status === 'SKIPPED') && recentCancellations.length < 10) {
      recentCancellations.push({
        recurringGameId: instance.recurringGameId,
        recurringGameName: instance.recurringGameName,
        expectedDate: instance.expectedDate,
        dayOfWeek: instance.dayOfWeek,
        status,
        reason: instance.cancellationReason,
        venueId: instance.venueId
      });
    }
    
    // Track items needing review
    if (instance.needsReview || status === 'UNKNOWN' || status === 'NO_SHOW') {
      needsReview.push({
        instanceId: instance.id,
        recurringGameId: instance.recurringGameId,
        recurringGameName: instance.recurringGameName,
        expectedDate: instance.expectedDate,
        status,
        reviewReason: instance.reviewReason || (status === 'NO_SHOW' ? 'Game did not appear' : 'Unknown status')
      });
    }
  }
  
  const total = instances.length;
  const confirmed = statusCounts.CONFIRMED;
  const cancelled = statusCounts.CANCELLED + statusCounts.SKIPPED;
  
  return {
    totalExpected: total,
    confirmed,
    cancelled,
    skipped: statusCounts.SKIPPED,
    noShow: statusCounts.NO_SHOW,
    unknown: statusCounts.UNKNOWN,
    replaced: statusCounts.REPLACED,
    complianceRate: total > 0 ? Math.round((confirmed / total) * 100 * 10) / 10 : null,
    cancellationRate: total > 0 ? Math.round((cancelled / total) * 100 * 10) / 10 : null,
    byDayOfWeek,
    byVenue,
    byRecurringGame,
    recentCancellations,
    needsReview: needsReview.slice(0, 20) // Limit to 20
  };
}

/**
 * Identify recurring games with high cancellation rates.
 * These are candidates for review - maybe they should be removed from schedule.
 * 
 * @param {Object} byRecurringGame - Recurring game breakdown from calculateScheduleCompliance
 * @param {number} threshold - Cancellation rate threshold (default 30%)
 * @returns {Object[]} Games with high cancellation rates
 */
function identifyAtRiskRecurringGames(byRecurringGame, threshold = 30) {
  const atRisk = [];
  
  for (const [rgId, data] of Object.entries(byRecurringGame)) {
    if (data.total >= 2) { // Need at least 2 instances to calculate rate
      const cancellationRate = (data.cancelled / data.total) * 100;
      if (cancellationRate >= threshold) {
        atRisk.push({
          recurringGameId: rgId,
          name: data.name,
          totalInstances: data.total,
          confirmed: data.confirmed,
          cancelled: data.cancelled,
          cancellationRate: Math.round(cancellationRate * 10) / 10,
          topReasons: getMostCommonReasons(data.cancellationReasons)
        });
      }
    }
  }
  
  // Sort by cancellation rate descending
  return atRisk.sort((a, b) => b.cancellationRate - a.cancellationRate);
}

/**
 * Get most common cancellation reasons.
 */
function getMostCommonReasons(reasons) {
  if (!reasons || reasons.length === 0) return [];
  
  const counts = {};
  for (const reason of reasons) {
    counts[reason] = (counts[reason] || 0) + 1;
  }
  
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({ reason, count }));
}

/**
 * Build schedule compliance section for MetricsPack.
 * 
 * @param {string} entityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @param {Map} venueNameMap - Optional venue ID to name map for enrichment
 * @returns {Object} Schedule compliance data for pack
 */
async function buildScheduleComplianceData(entityId, periodStart, periodEnd, venueNameMap = null) {
  const instances = await fetchScheduleInstances(entityId, periodStart, periodEnd);
  
  if (instances.length === 0) {
    return {
      hasScheduleData: false,
      message: 'No recurring game schedule data available for this period'
    };
  }
  
  const compliance = calculateScheduleCompliance(instances);
  const atRiskGames = identifyAtRiskRecurringGames(compliance.byRecurringGame);
  
  // Enrich venue names if map provided
  if (venueNameMap) {
    for (const cancellation of compliance.recentCancellations) {
      if (cancellation.venueId && venueNameMap.has(cancellation.venueId)) {
        cancellation.venueName = venueNameMap.get(cancellation.venueId);
      }
    }
    
    // Convert byVenue to include names
    const byVenueWithNames = {};
    for (const [venueId, data] of Object.entries(compliance.byVenue)) {
      const name = venueNameMap?.get(venueId) || 'Unknown Venue';
      byVenueWithNames[venueId] = {
        ...data,
        venueName: name
      };
    }
    compliance.byVenue = byVenueWithNames;
  }
  
  return {
    hasScheduleData: true,
    summary: {
      totalExpected: compliance.totalExpected,
      confirmed: compliance.confirmed,
      cancelled: compliance.cancelled,
      complianceRate: compliance.complianceRate,
      cancellationRate: compliance.cancellationRate,
      needsReviewCount: compliance.needsReview.length
    },
    byDayOfWeek: compliance.byDayOfWeek,
    byVenue: compliance.byVenue,
    atRiskRecurringGames: atRiskGames,
    recentCancellations: compliance.recentCancellations,
    needsReview: compliance.needsReview.slice(0, 10) // Top 10 for pack
  };
}

module.exports = {
  fetchScheduleInstances,
  calculateScheduleCompliance,
  identifyAtRiskRecurringGames,
  buildScheduleComplianceData
};
