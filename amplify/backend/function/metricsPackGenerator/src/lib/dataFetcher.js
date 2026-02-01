/**
 * Data Fetcher (Improved v3)
 * ==========================
 * Fetches data from DynamoDB tables with automatic name resolution.
 * 
 * Key improvements:
 * - v3: Filters out INITIATING games from financial calculations
 *       but tracks them as "games not run" for reporting
 * - v2: Snapshots enriched with venue/game names automatically
 * - Schedule compliance data (cancelled games)
 * - Recurring game trend metrics (pre-calculated)
 * - Series lifecycle data (active/upcoming/completed)
 * - Competitor analysis (schedule clashes, market pressure)
 * 
 * @version 3.0.0
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
 * Game statuses that indicate the game actually ran and has valid financial data.
 * Games with these statuses should be included in financial calculations.
 */
const VALID_GAME_STATUSES = [
  'FINISHED',      // Game completed normally
  'RUNNING',       // Game in progress (has partial data)
  'CLOCK_STOPPED', // Game paused but valid
  'REGISTERING',   // Registration open, may have early data
];

/**
 * Game statuses that indicate the game did NOT run.
 * These should be excluded from financial calculations but tracked for reporting.
 */
const NON_RUN_GAME_STATUSES = [
  'INITIATING',    // Created but never started - NO FINANCIAL IMPACT
  'SCHEDULED',     // Scheduled but not yet started
  'CANCELLED',     // Explicitly cancelled
  'NOT_FOUND',     // Game couldn't be found/scraped
  'NOT_PUBLISHED', // Not published to players
];

/**
 * Filter snapshots to only include games that actually ran.
 * Returns both valid snapshots and filtered-out games for reporting.
 * 
 * @param {Object[]} snapshots - Raw snapshots from DynamoDB
 * @param {Date} periodEnd - End of the period (to determine if INITIATING is stale)
 * @returns {{ validSnapshots: Object[], gamesNotRun: Object[] }}
 */
function filterSnapshotsByGameStatus(snapshots, periodEnd = new Date()) {
  const validSnapshots = [];
  const gamesNotRun = [];
  
  for (const snapshot of snapshots) {
    const gameStatus = snapshot.gameStatus;
    const gameDate = snapshot.gameStartDateTime ? new Date(snapshot.gameStartDateTime) : null;
    
    // If no status, assume valid (legacy data)
    if (!gameStatus) {
      validSnapshots.push(snapshot);
      continue;
    }
    
    // Check if game status indicates it ran
    if (VALID_GAME_STATUSES.includes(gameStatus)) {
      validSnapshots.push(snapshot);
      continue;
    }
    
    // INITIATING games in the past definitely didn't run
    if (gameStatus === 'INITIATING') {
      // If game date is in the past, it didn't run
      if (gameDate && gameDate < periodEnd) {
        gamesNotRun.push({
          ...snapshot,
          notRunReason: 'INITIATING_STALE',
          notRunDescription: 'Game was created but never started'
        });
        continue;
      }
      // Future INITIATING games might still run - but shouldn't have financial data anyway
      // Exclude from calculations but don't flag as "not run"
      continue;
    }
    
    // Other non-run statuses
    if (NON_RUN_GAME_STATUSES.includes(gameStatus)) {
      gamesNotRun.push({
        ...snapshot,
        notRunReason: gameStatus,
        notRunDescription: getNotRunDescription(gameStatus)
      });
      continue;
    }
    
    // Unknown status - include but log warning
    console.warn(`Unknown game status: ${gameStatus} for game ${snapshot.gameId}`);
    validSnapshots.push(snapshot);
  }
  
  console.log(`Filtered snapshots: ${validSnapshots.length} valid, ${gamesNotRun.length} not run`);
  
  return { validSnapshots, gamesNotRun };
}

/**
 * Get human-readable description for why a game didn't run.
 */
function getNotRunDescription(status) {
  switch (status) {
    case 'INITIATING':
      return 'Game was created but never started';
    case 'SCHEDULED':
      return 'Game was scheduled but did not start';
    case 'CANCELLED':
      return 'Game was explicitly cancelled';
    case 'NOT_FOUND':
      return 'Game could not be found or scraped';
    case 'NOT_PUBLISHED':
      return 'Game was not published to players';
    default:
      return `Game status: ${status}`;
  }
}

/**
 * Summarize games that didn't run for reporting.
 */
function summarizeGamesNotRun(gamesNotRun) {
  if (gamesNotRun.length === 0) {
    return {
      total: 0,
      byReason: {},
      byVenue: {},
      byRecurringGame: {},
      potentialLostRevenue: 0,
      details: []
    };
  }
  
  const byReason = {};
  const byVenue = {};
  const byRecurringGame = {};
  let potentialLostRevenue = 0;
  
  for (const game of gamesNotRun) {
    // Count by reason
    const reason = game.notRunReason || 'UNKNOWN';
    byReason[reason] = (byReason[reason] || 0) + 1;
    
    // Count by venue
    const venueId = game.venueId || 'unknown';
    if (!byVenue[venueId]) {
      byVenue[venueId] = {
        venueId,
        venueName: game.venueName || 'Unknown Venue',
        count: 0,
        games: []
      };
    }
    byVenue[venueId].count++;
    byVenue[venueId].games.push({
      gameId: game.gameId,
      gameName: game.gameName,
      gameDate: game.gameStartDateTime,
      reason: game.notRunReason
    });
    
    // Count by recurring game
    if (game.recurringGameId) {
      const rgId = game.recurringGameId;
      if (!byRecurringGame[rgId]) {
        byRecurringGame[rgId] = {
          recurringGameId: rgId,
          recurringGameName: game.recurringGameName || game.gameName || 'Unknown',
          venueId: game.venueId,
          venueName: game.venueName,
          count: 0,
          instances: []
        };
      }
      byRecurringGame[rgId].count++;
      byRecurringGame[rgId].instances.push({
        gameId: game.gameId,
        gameDate: game.gameStartDateTime,
        reason: game.notRunReason
      });
    }
    
    // Estimate potential lost revenue (if we have historical average)
    // Note: This is a rough estimate based on guarantee amount
    if (game.guaranteeAmount && game.guaranteeAmount > 0) {
      // Assume typical rake coverage would have generated ~15% of guarantee in revenue
      potentialLostRevenue += game.guaranteeAmount * 0.15;
    }
  }
  
  // Convert byVenue and byRecurringGame to arrays sorted by count
  const venueList = Object.values(byVenue)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const recurringGameList = Object.values(byRecurringGame)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  return {
    total: gamesNotRun.length,
    byReason,
    byVenue: venueList,
    byRecurringGame: recurringGameList,
    potentialLostRevenue: Math.round(potentialLostRevenue),
    details: gamesNotRun.slice(0, 20).map(g => ({
      gameId: g.gameId,
      gameName: g.gameName,
      venueName: g.venueName,
      gameDate: g.gameStartDateTime,
      reason: g.notRunReason,
      description: g.notRunDescription,
      // These would have been incorrect costs if included
      wouldHaveReportedOverlay: g.totalGuaranteeOverlayCost || 0,
      wouldHaveReportedLoss: g.netProfit < 0 ? g.netProfit : 0
    }))
  };
}

/**
 * Fetch GameFinancialSnapshots for a period WITH NAME RESOLUTION.
 * Automatically filters out games that didn't actually run (INITIATING, etc.)
 * 
 * GSI: byEntityGameFinancialSnapshot (entityId, gameStartDateTime)
 * 
 * @param {string} entityId 
 * @param {Date} periodStart 
 * @param {Date} periodEnd 
 * @param {boolean} enrichNames - Whether to resolve venue/game names (default: true)
 * @returns {Object} { snapshots, gamesNotRun, gamesNotRunSummary }
 */
async function fetchSnapshotsForPeriod(entityId, periodStart, periodEnd, enrichNames = true) {
  const tableName = getTableName('GameFinancialSnapshot');
  const rawSnapshots = [];
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
        rawSnapshots.push(...result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    console.log(`Found ${rawSnapshots.length} raw snapshots`);
  } catch (error) {
    console.error('GameFinancialSnapshot fetch failed:', error.message);
    throw error; // Re-throw - snapshots are critical
  }
  
  // Filter out games that didn't run
  const { validSnapshots, gamesNotRun } = filterSnapshotsByGameStatus(rawSnapshots, periodEnd);
  
  // Enrich with names if requested
  let enrichedSnapshots = validSnapshots;
  let enrichedGamesNotRun = gamesNotRun;
  
  if (enrichNames && (validSnapshots.length > 0 || gamesNotRun.length > 0)) {
    // Enrich both valid and not-run games with names for reporting
    const allToEnrich = [...validSnapshots, ...gamesNotRun];
    const enrichedAll = await enrichSnapshotsWithNames(allToEnrich);
    
    // Split back into valid and not-run
    enrichedSnapshots = enrichedAll.slice(0, validSnapshots.length);
    enrichedGamesNotRun = enrichedAll.slice(validSnapshots.length).map((g, i) => ({
      ...g,
      notRunReason: gamesNotRun[i].notRunReason,
      notRunDescription: gamesNotRun[i].notRunDescription
    }));
  }
  
  // Generate summary for not-run games
  const gamesNotRunSummary = summarizeGamesNotRun(enrichedGamesNotRun);
  
  if (gamesNotRun.length > 0) {
    console.log(`Games not run: ${gamesNotRun.length} (${Object.entries(gamesNotRunSummary.byReason).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  }
  
  return {
    snapshots: enrichedSnapshots,
    gamesNotRun: enrichedGamesNotRun,
    gamesNotRunSummary
  };
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
 * IMPORTANT: This now automatically filters out INITIATING games from financial
 * calculations but tracks them separately for operational reporting.
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
  
  console.log('=== Fetching all pack data (v3 - with INITIATING filter) ===');
  const startTime = Date.now();
  
  // Fetch current period snapshots with name resolution AND filtering
  const currentPeriodData = await fetchSnapshotsForPeriod(entityId, periodStart, periodEnd, true);
  const { snapshots, gamesNotRun, gamesNotRunSummary } = currentPeriodData;
  
  // Build venue lookup from enriched snapshots (for reuse)
  const venueLookup = buildVenueLookupFromSnapshots(snapshots);
  
  // Also add venue names from games not run (they have valid venue info)
  for (const g of gamesNotRun) {
    if (g.venueId && g.venueName) {
      venueLookup.set(g.venueId, g.venueName);
    }
  }
  
  // Fetch comparison period snapshots (also with filtering)
  let compSnapshots = [];
  let compGamesNotRun = [];
  if (compPeriodStart && compPeriodEnd) {
    const compData = await fetchSnapshotsForPeriod(entityId, compPeriodStart, compPeriodEnd, true);
    compSnapshots = compData.snapshots;
    compGamesNotRun = compData.gamesNotRun;
    
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
  console.log(`Snapshots: ${snapshots.length} valid, ${gamesNotRun.length} not run`);
  console.log(`Comparison: ${compSnapshots.length} valid, ${compGamesNotRun.length} not run`);
  console.log(`Player data: ${playerData.entries.length} entries, ${playerData.results.length} results`);
  console.log(`Venues in lookup: ${venueLookup.size}`);
  console.log(`Enhanced modules: ${Object.keys(enhancedData).join(', ')}`);
  
  return {
    // Valid snapshots only - these go into financial calculations
    snapshots,
    compSnapshots,
    
    // Games that didn't run - for operational reporting
    gamesNotRun,
    gamesNotRunSummary,
    compGamesNotRun,
    
    // Other data
    venueMetrics,
    playerData,
    socialData,
    venueLookup,
    
    // Enhanced data modules
    scheduleCompliance: enhancedData.scheduleCompliance || null,
    recurringGameTrends: enhancedData.recurringGameTrends || null,
    seriesLifecycle: enhancedData.seriesLifecycle || null,
    competitorAnalysis: enhancedData.competitorAnalysis || null,
    
    meta: {
      fetchDurationMs: Date.now() - startTime,
      snapshotCount: snapshots.length,
      gamesNotRunCount: gamesNotRun.length,
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
  fetchAllPackData,
  filterSnapshotsByGameStatus,
  summarizeGamesNotRun,
  VALID_GAME_STATUSES,
  NON_RUN_GAME_STATUSES
};