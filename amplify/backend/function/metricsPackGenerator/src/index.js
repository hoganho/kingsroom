/**
 * metricsPackGenerator Lambda Function (Amplify Gen 1)
 * =====================================================
 * Generates deterministic MetricsPacks from GameFinancialSnapshot data.
 * 
 * @version 1.0.0
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const { calculateStrategicKPIs } = require('./lib/kpiCalculator');
const { generateAlerts } = require('./lib/alertGenerator');
const { calculateVenueBreakdown } = require('./lib/venueCalculator');
const { calculateRankings } = require('./lib/rankingsCalculator');
const { calculatePlayerInsights } = require('./lib/playerInsightsCalculator');
const { generateSocialPulseDigest } = require('./lib/socialPulseDigest');
const { getWeekBounds, getMonthBounds, getDateFromWeekKey, getDateFromMonthKey } = require('./lib/periodUtils');
const { DEFAULT_THRESHOLDS, getAlertThresholds } = require('./lib/thresholds');
const { fetchSnapshotsForPeriod, fetchVenueMetrics, fetchPlayerData, fetchSocialData } = require('./lib/dataFetcher');

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name: {TableName}-{apiId}-{env}
const getTableName = (baseName) => {
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

// Table names - use env var if set by CloudFormation, otherwise construct dynamically
const METRICS_PACK_TABLE = process.env.API_KINGSROOM_METRICSPACKTABLE_NAME || getTableName('MetricsPack');
const DIRECTOR_REPORT_TABLE = process.env.API_KINGSROOM_DIRECTORREPORTTABLE_NAME || getTableName('DirectorReport');
const ALERT_THRESHOLD_TABLE = process.env.API_KINGSROOM_ALERTTHRESHOLDCONFIGTABLE_NAME || getTableName('AlertThresholdConfig');
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
    METRICS_PACK_TABLE,
    ENTITY_TABLE
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
      
      case 'getAlertThresholds':
        return await handleGetAlertThresholds(args.entityId);
      
      case 'updateAlertThresholds':
        return await handleUpdateAlertThresholds(args.input);
      
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
  
  // Get all entities if not specified
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
// GENERATE METRICS PACK
// ===================================================================

async function handleGenerateMetricsPack(input) {
  const startTime = Date.now();
  const warnings = [];
  
  const { entityId, reportType, periodKey, forceRegenerate } = input;
  
  console.log(`Generating MetricsPack for entity=${entityId}, type=${reportType}, period=${periodKey || 'current'}`);
  
  // Determine period bounds
  const now = new Date();
  let period, comparisonPeriod;
  
  if (reportType === 'WEEKLY_OPS') {
    period = periodKey ? getWeekBounds(getDateFromWeekKey(periodKey)) : getWeekBounds(now);
    comparisonPeriod = getWeekBounds(new Date(period.start.getTime() - 7 * 24 * 60 * 60 * 1000));
  } else if (reportType === 'MONTHLY_BOARD') {
    period = periodKey ? getMonthBounds(getDateFromMonthKey(periodKey)) : getMonthBounds(now);
    const prevMonth = new Date(period.start);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    comparisonPeriod = getMonthBounds(prevMonth);
  } else {
    throw new Error(`Report type ${reportType} not yet implemented`);
  }
  
  // Check if pack already exists
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
  
  // Fetch entity info
  const entity = await fetchEntity(entityId);
  if (!entity) {
    throw new Error(`Entity not found: ${entityId}`);
  }
  
  // Fetch all required data
  console.log('Fetching snapshots...');
  const snapshots = await fetchSnapshotsForPeriod(entityId, period.start, period.end);
  const compSnapshots = await fetchSnapshotsForPeriod(entityId, comparisonPeriod.start, comparisonPeriod.end);
  
  console.log(`Found ${snapshots.length} snapshots for current period, ${compSnapshots.length} for comparison`);
  
  if (snapshots.length === 0) {
    warnings.push('No game data found for this period');
  }
  
  // Fetch additional data
  const venueMetrics = await fetchVenueMetrics(entityId);
  const playerData = await fetchPlayerData(entityId, period.start, period.end);
  const socialData = await fetchSocialData(entityId, period.start, period.end);
  
  // Get alert thresholds
  const thresholds = await getAlertThresholds(entityId);
  
  // Calculate KPIs
  console.log('Calculating KPIs...');
  const strategic = calculateStrategicKPIs({
    snapshots,
    comparisonSnapshots: compSnapshots,
    playerEntries: playerData.entries,
    playerResults: playerData.results
  });
  
  // Calculate venue breakdown
  const venues = await calculateVenueBreakdown(entityId, snapshots, venueMetrics, compSnapshots);
  
  // Generate alerts
  const alerts = generateAlerts(snapshots, venues, thresholds);
  
  // Calculate rankings
  const rankings = calculateRankings(snapshots, venues);
  
  // Calculate player insights
  const playerInsights = calculatePlayerInsights(playerData.entries, playerData.results);
  
  // Generate social pulse digest
  const socialPulse = generateSocialPulseDigest(socialData);
  
  // Build the pack
  const pack = {
    id: packId,
    entityId,
    reportType,
    periodKey: period.key,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    periodLabel: period.label,
    comparisonPeriodKey: comparisonPeriod.key,
    comparisonPeriodStart: comparisonPeriod.start.toISOString(),
    comparisonPeriodEnd: comparisonPeriod.end.toISOString(),
    comparisonPeriodLabel: comparisonPeriod.label,
    packData: JSON.stringify({
      strategic,
      venues,
      alerts,
      rankings,
      playerInsights
    }),
    socialPulseData: JSON.stringify(socialPulse),
    generatedAt: new Date().toISOString(),
    generatedBy: 'LAMBDA',
    generationDurationMs: Date.now() - startTime,
    version: 1,
    snapshotsIncluded: snapshots.length,
    gamesIncluded: snapshots.length,
    venuesIncluded: venues.length,
    dataCompleteness: calculateDataCompleteness(snapshots, venues),
    warnings: warnings.length > 0 ? warnings : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    __typename: 'MetricsPack'
  };
  
  // Store the pack
  await storePack(pack);
  
  console.log(`Pack generated successfully: ${packId} in ${Date.now() - startTime}ms`);
  
  return {
    success: true,
    metricsPackId: packId,
    metricsPack: pack,
    wasExisting: false,
    generationDurationMs: Date.now() - startTime,
    warnings: warnings.length > 0 ? warnings : null
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

async function handleGetAlertThresholds(entityId) {
  return getAlertThresholds(entityId);
}

async function handleUpdateAlertThresholds(input) {
  const { entityId, ...thresholds } = input;
  const id = entityId || 'GLOBAL';
  const now = new Date().toISOString();
  
  const item = {
    id,
    entityId: entityId || null,
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
    isActive: true,
    lastUpdatedAt: now,
    updatedAt: now,
    __typename: 'AlertThresholdConfig'
  };
  
  await docClient.send(new PutCommand({
    TableName: ALERT_THRESHOLD_TABLE,
    Item: item
  }));
  
  return item;
}

async function handlePreviewAlerts(entityId, reportType) {
  const now = new Date();
  const period = reportType === 'WEEKLY_OPS' ? getWeekBounds(now) : getMonthBounds(now);
  
  const snapshots = await fetchSnapshotsForPeriod(entityId, period.start, period.end);
  const venueMetrics = await fetchVenueMetrics(entityId);
  const venues = await calculateVenueBreakdown(entityId, snapshots, venueMetrics, []);
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
    total += 5;
    if (snapshot.totalRevenue != null) score++;
    if (snapshot.totalCost != null) score++;
    if (snapshot.netProfit != null) score++;
    if (snapshot.totalEntries != null) score++;
    if (snapshot.totalUniquePlayers != null) score++;
  }
  
  for (const venue of venues) {
    total += 2;
    if (venue.totalProfit != null) score++;
    if (venue.totalGames > 0) score++;
  }
  
  return total > 0 ? Math.round((score / total) * 100) : 0;
}
