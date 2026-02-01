/**
 * metricsPackGenerator Lambda Function (Improved v3)
 * ===================================================
 * Generates deterministic MetricsPacks from GameFinancialSnapshot data.
 * 
 * KEY IMPROVEMENTS (v4.3.0):
 * 1. Name Resolution - Venues and games are resolved to human-readable names
 * 2. Schedule Compliance - Includes cancelled/missed game analysis
 * 3. Recurring Game Trends - Per-game trending with brand strength
 * 4. Series Lifecycle - Active/upcoming/completed series with progress
 * 5. Competitor Analysis - Schedule clashes, market pressure
 * 6. Opportunity Detection - Growth opportunities from data patterns
 * 7. FIXED: Date validation - Ensures periodStart/periodEnd are always valid ISO strings
 * 8. Games Not Run - Tracks INITIATING/CANCELLED games separately
 *    - These are excluded from financial calculations
 *    - But tracked for operational reporting
 * 9. NEW (v4.3.0): Venues with only scheduled (non-run) games are now included
 *    - Shows as 0 financials with gamesNotRun count
 *    - Allows AI to report on venues that had planned activity but no results
 * 
 * @version 4.3.0
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Import modules
const { calculateStrategicKPIs } = require('./lib/kpiCalculator');
const { generateAlerts, generateAlertSummary } = require('./lib/alertGenerator');
const { calculateVenueBreakdown } = require('./lib/venueCalculator');
const { calculateRankings } = require('./lib/rankingsCalculator');
const { calculatePlayerInsights } = require('./lib/playerInsightsCalculator');
const { generateSocialPulseDigest } = require('./lib/socialPulseDigest');
const { buildOpportunityData } = require('./lib/opportunityDetector');
const { 
  getWeekBounds, 
  getMonthBounds, 
  getDateFromWeekKey, 
  getDateFromMonthKey,
  resolvePeriodSelection,
  parsePeriodKey,
  getDefaultPeriodForReportType
} = require('./lib/periodUtils');
const { DEFAULT_THRESHOLDS, getAlertThresholds } = require('./lib/thresholds');
const { 
  fetchSnapshotsForPeriod, 
  fetchVenueMetrics, 
  fetchPlayerData, 
  fetchSocialData,
  fetchAllPackData 
} = require('./lib/dataFetcher');
const { buildVenueLookupFromSnapshots } = require('./lib/nameResolver');

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name
const getTableName = (baseName) => {
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

// Table names
const METRICS_PACK_TABLE = process.env.API_KINGSROOM_METRICSPACKTABLE_NAME || getTableName('MetricsPack');
const ENTITY_TABLE = getTableName('Entity');

/**
 * Main Lambda Handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Environment:', {
    ENV: process.env.ENV,
    REGION: process.env.REGION,
    API_ID: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT,
    METRICS_PACK_TABLE
  });
  
  // Handle AppSync GraphQL resolver
  if (event.typeName && event.fieldName) {
    return handleAppSyncResolver(event);
  }
  
  // Handle EventBridge scheduled event
  if (event.source === 'aws.events' || event['detail-type']) {
    return handleScheduledEvent(event);
  }
  
  // Handle direct invocation (for testing)
  if (event.operation) {
    return handleDirectInvocation(event);
  }
  
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'Unknown event type' })
  };
};

/**
 * Handle AppSync GraphQL resolver invocations
 */
async function handleAppSyncResolver(event) {
  const { typeName, fieldName, arguments: args } = event;
  
  try {
    switch (fieldName) {
      case 'generateMetricsPack':
        return await handleGenerateMetricsPack(args.input);
      
      case 'getLatestMetricsPack':
        return await handleGetLatestMetricsPack(args.entityId, args.reportType);
      
      case 'listAvailablePeriods':
        return await handleListAvailablePeriods(args.entityId, args.reportType, args.limit);
      
      case 'resolvePeriod':
        return await handleResolvePeriod(args.periodSelection);
      
      case 'getAlertThresholds':
        return await handleGetAlertThresholds(args.entityId);
      
      case 'previewAlerts':
        return await handlePreviewAlerts(args.entityId, args.reportType);
      
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error(`Error in ${fieldName}:`, error);
    throw error;
  }
}

/**
 * Handle EventBridge scheduled events
 */
async function handleScheduledEvent(event) {
  console.log('Processing scheduled event');
  
  const reportType = event.detail?.reportType || event.reportType || 'WEEKLY_OPS';
  const entityIds = event.detail?.entityIds || event.entityIds;
  
  let entities;
  if (entityIds && entityIds.length > 0) {
    entities = await Promise.all(entityIds.map(id => fetchEntity(id)));
    entities = entities.filter(e => e !== null);
  } else {
    entities = await fetchAllEntities();
  }
  
  console.log(`Generating ${reportType} reports for ${entities.length} entities`);
  
  const results = [];
  for (const entity of entities) {
    try {
      const result = await handleGenerateMetricsPack({
        entityId: entity.id,
        reportType,
        forceRegenerate: false
      });
      results.push({ entityId: entity.id, success: true, packId: result.metricsPackId });
    } catch (error) {
      console.error(`Failed to generate pack for entity ${entity.id}:`, error);
      results.push({ entityId: entity.id, success: false, error: error.message });
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Generated ${results.filter(r => r.success).length}/${entities.length} packs`,
      results
    })
  };
}

/**
 * Handle direct invocation (for testing)
 */
async function handleDirectInvocation(event) {
  const { operation, ...params } = event;
  
  switch (operation) {
    case 'generateMetricsPack':
      return await handleGenerateMetricsPack(params);
    case 'getLatestMetricsPack':
      return await handleGetLatestMetricsPack(params.entityId, params.reportType);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// ===================================================================
// GENERATE METRICS PACK (with name resolution, date validation, gamesNotRun)
// ===================================================================

async function handleGenerateMetricsPack(input) {
  const startTime = Date.now();
  const warnings = [];
  
  const { 
    entityId, 
    reportType, 
    periodKey,
    periodSelection,
    includeComparison = true,
    includeScheduleCompliance = true,
    includeRecurringGameTrends = true,
    includeSeriesLifecycle = true,
    includeCompetitorAnalysis = true,
    includeOpportunities = true,
    forceRegenerate 
  } = input;
  
  console.log(`=== Generating MetricsPack (v4.3.0) ===`);
  console.log(`Entity: ${entityId}, Type: ${reportType}`);
  
  // ===================================================================
  // RESOLVE PERIOD
  // ===================================================================
  let resolved;
  
  if (periodSelection && periodSelection.periodType) {
    try {
      resolved = resolvePeriodSelection(periodSelection);
    } catch (err) {
      throw new Error(`Invalid period selection: ${err.message}`);
    }
  } else if (periodKey) {
    const parsed = parsePeriodKey(periodKey);
    if (parsed) {
      resolved = resolvePeriodSelection(parsed);
    } else {
      resolved = resolveLegacyPeriod(periodKey, reportType);
    }
  } else {
    const defaultPeriod = getDefaultPeriodForReportType(reportType);
    resolved = resolvePeriodSelection(defaultPeriod);
  }
  
  // VALIDATION: Ensure we have valid dates
  if (!resolved) {
    throw new Error('Period resolution returned null');
  }
  
  // Validate startDate and endDate are valid Date objects
  const isValidDate = (d) => d instanceof Date && !isNaN(d.getTime());
  
  if (!isValidDate(resolved.startDate)) {
    console.error('Invalid startDate resolved:', resolved.startDate, 'from input:', JSON.stringify({ periodSelection, periodKey, reportType }));
    // Fallback to current period
    const fallback = reportType === 'MONTHLY_BOARD' ? getMonthBounds(new Date()) : getWeekBounds(new Date());
    resolved.startDate = fallback.start;
    resolved.endDate = fallback.end;
    resolved.periodKey = fallback.key;
    resolved.periodLabel = fallback.label;
    warnings.push('Period dates were invalid - defaulted to current period');
  }
  
  if (!isValidDate(resolved.endDate)) {
    console.error('Invalid endDate resolved:', resolved.endDate);
    // Use startDate + default period length
    const msPerDay = 24 * 60 * 60 * 1000;
    const periodLength = reportType === 'MONTHLY_BOARD' ? 30 : 7;
    resolved.endDate = new Date(resolved.startDate.getTime() + (periodLength - 1) * msPerDay);
    warnings.push('Period end date was invalid - calculated from start date');
  }
  
  const period = {
    start: resolved.startDate,
    end: resolved.endDate,
    key: resolved.periodKey,
    label: resolved.periodLabel
  };
  
  // Log resolved period for debugging
  console.log(`Resolved period: ${period.key} = ${period.start.toISOString()} to ${period.end.toISOString()}`);
  
  const comparisonPeriod = includeComparison && resolved.comparisonStartDate ? {
    start: resolved.comparisonStartDate,
    end: resolved.comparisonEndDate,
    key: resolved.comparisonPeriodKey,
    label: resolved.comparisonPeriodLabel
  } : null;
  
  console.log(`Period: ${period.label} (${period.key})`);
  if (comparisonPeriod) {
    console.log(`Comparison: ${comparisonPeriod.label} (${comparisonPeriod.key})`);
  }
  
  // ===================================================================
  // CHECK FOR EXISTING PACK
  // ===================================================================
  const packId = `${entityId}_${reportType}_${period.key}`;
  
  if (!forceRegenerate) {
    const existingPack = await getExistingPack(packId);
    if (existingPack) {
      console.log(`Pack already exists: ${packId}`);
      return {
        success: true,
        metricsPackId: packId,
        metricsPack: existingPack,
        wasExisting: true,
        generationDurationMs: Date.now() - startTime
      };
    }
  }
  
  // ===================================================================
  // FETCH ENTITY
  // ===================================================================
  const entity = await fetchEntity(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }
  
  // ===================================================================
  // FETCH DATA (with automatic name resolution, filtering, and enhanced modules!)
  // ===================================================================
  console.log('Fetching data with name resolution, INITIATING filter, and enhanced modules...');
  
  const packData = await fetchAllPackData(
    entityId, 
    period.start, 
    period.end,
    comparisonPeriod?.start,
    comparisonPeriod?.end,
    {
      includeScheduleCompliance,
      includeRecurringGameTrends,
      includeSeriesLifecycle,
      includeCompetitorAnalysis,
      businessLocation: entity.businessLocation || null
    }
  );
  
  const { 
    snapshots,           // Valid snapshots only (INITIATING filtered out)
    compSnapshots, 
    venueMetrics, 
    playerData, 
    socialData, 
    venueLookup, 
    meta,
    // Games that didn't run (INITIATING, CANCELLED, etc.)
    gamesNotRun,
    gamesNotRunSummary,
    compGamesNotRun,
    // Enhanced data modules
    scheduleCompliance,
    recurringGameTrends,
    seriesLifecycle,
    competitorAnalysis
  } = packData;
  
  console.log(`Data fetched in ${meta.fetchDurationMs}ms`);
  console.log(`Snapshots: ${meta.snapshotCount} valid, ${meta.gamesNotRunCount || 0} not run`);
  console.log(`Comparison: ${meta.compSnapshotCount} valid`);
  
  if (snapshots.length === 0) {
    warnings.push('No game data found for this period');
  }
  
  if (gamesNotRunSummary && gamesNotRunSummary.total > 0) {
    warnings.push(`${gamesNotRunSummary.total} scheduled games did not run (excluded from financials)`);
  }
  
  // Get alert thresholds
  const thresholds = await getAlertThresholds(entityId);
  
  // ===================================================================
  // CALCULATE METRICS (using only valid snapshots)
  // ===================================================================
  console.log('Calculating KPIs from valid games only...');
  
  const strategic = calculateStrategicKPIs({
    snapshots,
    comparisonSnapshots: compSnapshots,
    playerEntries: playerData.entries,
    playerResults: playerData.results
  });
  
  // Calculate venue breakdown (snapshots already have names)
  const venues = await calculateVenueBreakdown(entityId, snapshots, venueMetrics, compSnapshots);
  
  // ===================================================================
  // ENSURE VENUES WITH ONLY NON-RUN GAMES ARE INCLUDED
  // ===================================================================
  // Venues that had scheduled games which didn't run should still appear
  // in our venue list (with 0 financials) for complete reporting
  if (gamesNotRunSummary && gamesNotRunSummary.byVenue && gamesNotRunSummary.byVenue.length > 0) {
    const existingVenueIds = new Set(venues.map(v => v.venueId));
    
    for (const notRunVenue of gamesNotRunSummary.byVenue) {
      if (!existingVenueIds.has(notRunVenue.venueId)) {
        // This venue had NO games that ran - add it with zero financials
        venues.push({
          venueId: notRunVenue.venueId,
          venueName: notRunVenue.venueName || venueLookup.get(notRunVenue.venueId) || 'Unknown Venue',
          // Zero financials since no games ran
          gamesRun: 0,
          totalRevenue: 0,
          totalProfit: 0,
          avgProfitPerGame: 0,
          totalPlayers: 0,
          avgPlayersPerGame: 0,
          guaranteeOverlayCost: 0,
          // Track the not-run games
          gamesNotRun: notRunVenue.count,
          gamesNotRunDetails: notRunVenue.games,
          // Flag for reporting
          hadScheduledGamesOnly: true,
          // Comparison will be null/zero
          comparison: null
        });
        console.log(`Added venue with only scheduled games: ${notRunVenue.venueName} (${notRunVenue.count} games didn't run)`);
      } else {
        // Venue exists - augment with not-run game data
        const existingVenue = venues.find(v => v.venueId === notRunVenue.venueId);
        if (existingVenue) {
          existingVenue.gamesNotRun = notRunVenue.count;
          existingVenue.gamesNotRunDetails = notRunVenue.games;
        }
      }
    }
  }
  
  // Sort venues: active venues first, then venues with only scheduled games
  venues.sort((a, b) => {
    // Active venues (with games run) first
    if (a.gamesRun > 0 && b.gamesRun === 0) return -1;
    if (b.gamesRun > 0 && a.gamesRun === 0) return 1;
    // Then by profit
    return (b.totalProfit || 0) - (a.totalProfit || 0);
  });
  
  const venuesWithGames = venues.filter(v => v.gamesRun > 0).length;
  const venuesScheduledOnly = venues.filter(v => v.hadScheduledGamesOnly).length;
  console.log(`Venues: ${venues.length} total (${venuesWithGames} with games run, ${venuesScheduledOnly} scheduled-only)`);
  
  // Generate alerts (with real names!)
  const allAlerts = generateAlerts(snapshots, venues, thresholds);
  
  // Limit alerts in pack to avoid bloat (keep top 20)
  const alerts = allAlerts.slice(0, 20);
  const alertSummary = generateAlertSummary(allAlerts);
  
  // Calculate rankings
  const rankings = calculateRankings(snapshots, venues);
  
  // Calculate player insights
  const playerInsights = calculatePlayerInsights(playerData);
  
  // Generate social pulse digest
  const socialPulse = generateSocialPulseDigest(entityId, socialData, period);
  
  // ===================================================================
  // BUILD OPPORTUNITY DATA (uses all available data)
  // ===================================================================
  let opportunities = null;
  if (includeOpportunities) {
    try {
      opportunities = buildOpportunityData({
        snapshots,
        venueData: venues,
        recurringGameData: recurringGameTrends,
        competitorData: competitorAnalysis,
        entityAverages: {
          avgGamesPerVenue: strategic.totalGamesRun / Math.max(venues.length, 1),
          avgProfitPerGame: strategic.avgProfitPerGame
        }
      });
      console.log(`Opportunities: ${opportunities.summary?.totalOpportunities || 0} detected`);
    } catch (error) {
      console.warn('Opportunity detection failed:', error.message);
      opportunities = { hasOpportunities: false, error: error.message };
    }
  }
  
  // Log enhanced data status
  console.log(`Enhanced data: schedule=${scheduleCompliance?.hasScheduleData}, trends=${recurringGameTrends?.hasRecurringGameData}, series=${seriesLifecycle?.hasSeriesData}, competitor=${competitorAnalysis?.hasCompetitorData}`);
  console.log(`Games not run: ${gamesNotRunSummary?.total || 0}`);
  
  // ===================================================================
  // BUILD AND STORE PACK
  // ===================================================================
  
  // Final validation of dates before storing
  const periodStartISO = period.start instanceof Date && !isNaN(period.start.getTime()) 
    ? period.start.toISOString() 
    : new Date().toISOString();
  const periodEndISO = period.end instanceof Date && !isNaN(period.end.getTime()) 
    ? period.end.toISOString() 
    : new Date().toISOString();
  
  if (periodStartISO === periodEndISO) {
    console.warn('WARNING: periodStart equals periodEnd - dates may be invalid');
  }
  
  const pack = {
    id: packId,
    entityId,
    reportType,
    periodKey: period.key,
    periodStart: periodStartISO,
    periodEnd: periodEndISO,
    periodLabel: period.label,
    comparisonPeriodKey: comparisonPeriod?.key || null,
    comparisonPeriodStart: comparisonPeriod?.start instanceof Date && !isNaN(comparisonPeriod.start.getTime()) 
      ? comparisonPeriod.start.toISOString() 
      : null,
    comparisonPeriodEnd: comparisonPeriod?.end instanceof Date && !isNaN(comparisonPeriod.end.getTime()) 
      ? comparisonPeriod.end.toISOString() 
      : null,
    comparisonPeriodLabel: comparisonPeriod?.label || null,
    
    // Main pack data - now with real names, enhanced analytics, and gamesNotRun!
    packData: JSON.stringify({
      strategic,
      venues,
      alerts,
      alertSummary,
      rankings,
      playerInsights,
      // Enhanced data modules
      scheduleCompliance: scheduleCompliance || null,
      recurringGameTrends: recurringGameTrends || null,
      seriesLifecycle: seriesLifecycle || null,
      competitorAnalysis: competitorAnalysis || null,
      opportunities: opportunities || null,
      // NEW: Games that didn't run (for AI reporting)
      gamesNotRun: gamesNotRunSummary || null
    }),
    
    socialPulseData: JSON.stringify(socialPulse),
    
    // Metadata
    generatedAt: new Date().toISOString(),
    generatedBy: 'LAMBDA',
    generationDurationMs: Date.now() - startTime,
    version: 6, // Bumped version for venue tracking improvements
    snapshotsIncluded: snapshots.length,
    gamesIncluded: snapshots.length,
    gamesNotRunCount: gamesNotRunSummary?.total || 0,
    venuesIncluded: venues.length,
    venuesWithGamesRun: venues.filter(v => v.gamesRun > 0).length,
    venuesScheduledOnly: venues.filter(v => v.hadScheduledGamesOnly).length,
    dataCompleteness: calculateDataCompleteness(snapshots, venues),
    enhancedModulesIncluded: meta.enhancedModules || [],
    warnings: warnings.length > 0 ? warnings : null,
    
    // Amplify/AppSync fields
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    __typename: 'MetricsPack',
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null
  };
  
  // Track pack size
  const packJson = JSON.stringify(pack);
  console.log(`Pack size: ${(packJson.length / 1024).toFixed(1)} KB`);
  
  await storePack(pack);
  
  console.log(`=== Pack generated: ${packId} in ${Date.now() - startTime}ms ===`);
  
  return {
    success: true,
    metricsPackId: packId,
    metricsPack: pack,
    wasExisting: false,
    generationDurationMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? warnings : null
  };
}

/**
 * Legacy period resolution for backward compatibility
 */
function resolveLegacyPeriod(periodKey, reportType) {
  const now = new Date();
  
  // Try week key
  if (periodKey.includes('-W')) {
    try {
      const monday = getDateFromWeekKey(periodKey);
      const bounds = getWeekBounds(monday);
      const prevWeek = new Date(monday);
      prevWeek.setDate(prevWeek.getDate() - 7);
      const compBounds = getWeekBounds(prevWeek);
      
      return {
        periodKey: bounds.key,
        periodLabel: bounds.label,
        startDate: bounds.start,
        endDate: bounds.end,
        comparisonPeriodKey: compBounds.key,
        comparisonPeriodLabel: compBounds.label,
        comparisonStartDate: compBounds.start,
        comparisonEndDate: compBounds.end
      };
    } catch (e) {
      console.warn(`Failed to parse week key: ${periodKey}`);
    }
  }
  
  // Try month key
  if (periodKey.match(/^\d{4}-\d{2}$/)) {
    try {
      const date = getDateFromMonthKey(periodKey);
      const bounds = getMonthBounds(date);
      const prevMonth = new Date(date);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const compBounds = getMonthBounds(prevMonth);
      
      return {
        periodKey: bounds.key,
        periodLabel: bounds.label,
        startDate: bounds.start,
        endDate: bounds.end,
        comparisonPeriodKey: compBounds.key,
        comparisonPeriodLabel: compBounds.label,
        comparisonStartDate: compBounds.start,
        comparisonEndDate: compBounds.end
      };
    } catch (e) {
      console.warn(`Failed to parse month key: ${periodKey}`);
    }
  }
  
  // Default to current week/month
  const bounds = reportType === 'WEEKLY_OPS' ? getWeekBounds(now) : getMonthBounds(now);
  return {
    periodKey: bounds.key,
    periodLabel: bounds.label,
    startDate: bounds.start,
    endDate: bounds.end
  };
}

// ===================================================================
// QUERY HANDLERS
// ===================================================================

async function handleGetLatestMetricsPack(entityId, reportType) {
  const result = await docClient.send(new QueryCommand({
    TableName: METRICS_PACK_TABLE,
    IndexName: 'byEntityMetricsPack',
    KeyConditionExpression: 'entityId = :entityId',
    FilterExpression: 'reportType = :reportType',
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':reportType': reportType
    },
    ScanIndexForward: false,
    Limit: 1
  }));
  
  return result.Items?.[0] || null;
}

async function handleListAvailablePeriods(entityId, reportType, limit = 12) {
  const result = await docClient.send(new QueryCommand({
    TableName: METRICS_PACK_TABLE,
    IndexName: 'byEntityMetricsPack',
    KeyConditionExpression: 'entityId = :entityId',
    FilterExpression: 'reportType = :reportType',
    ExpressionAttributeValues: {
      ':entityId': entityId,
      ':reportType': reportType
    },
    ScanIndexForward: false,
    Limit: limit,
    ProjectionExpression: 'periodKey'
  }));
  
  return (result.Items || []).map(item => item.periodKey);
}

async function handleResolvePeriod(periodSelection) {
  return resolvePeriodSelection(periodSelection);
}

async function handleGetAlertThresholds(entityId) {
  return getAlertThresholds(entityId);
}

async function handlePreviewAlerts(entityId, reportType) {
  const now = new Date();
  const period = reportType === 'WEEKLY_OPS' ? getWeekBounds(now) : getMonthBounds(now);
  
  // Fetch with name resolution and filtering
  // Note: fetchSnapshotsForPeriod now returns { snapshots, gamesNotRun, gamesNotRunSummary }
  const result = await fetchSnapshotsForPeriod(entityId, period.start, period.end, true);
  const snapshots = result.snapshots || result; // Handle both old and new return formats
  
  const venues = await calculateVenueBreakdown(entityId, snapshots, [], []);
  const thresholds = await getAlertThresholds(entityId);
  
  return generateAlerts(snapshots, venues, thresholds);
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

async function getExistingPack(packId) {
  const result = await docClient.send(new GetCommand({
    TableName: METRICS_PACK_TABLE,
    Key: { id: packId }
  }));
  return result.Item || null;
}

async function storePack(pack) {
  await docClient.send(new PutCommand({
    TableName: METRICS_PACK_TABLE,
    Item: pack
  }));
}

async function fetchEntity(entityId) {
  const result = await docClient.send(new GetCommand({
    TableName: ENTITY_TABLE,
    Key: { id: entityId }
  }));
  return result.Item || null;
}

async function fetchAllEntities() {
  const result = await docClient.send(new ScanCommand({
    TableName: ENTITY_TABLE,
    Limit: 100
  }));
  return result.Items || [];
}

function calculateDataCompleteness(snapshots, venues) {
  if (snapshots.length === 0) return 0;
  
  let score = 0;
  let total = 0;
  
  for (const snapshot of snapshots) {
    total += 6;
    if (snapshot.totalRevenue != null) score++;
    if (snapshot.totalCost != null) score++;
    if (snapshot.netProfit != null) score++;
    if (snapshot.totalEntries != null) score++;
    if (snapshot.totalUniquePlayers != null) score++;
    if (snapshot.venueName && !snapshot.venueName.includes('Unknown')) score++;
  }
  
  for (const venue of venues) {
    total += 2;
    if (venue.totalProfit != null) score++;
    if (venue.venueName && !venue.venueName.includes('Unknown')) score++;
  }
  
  return total > 0 ? Math.round((score / total) * 100) : 0;
}