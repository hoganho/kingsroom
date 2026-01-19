/**
 * Competitor Analyzer
 * ====================
 * Enhanced competitor analysis for the MetricsPack.
 * 
 * Uses SocialPostGameData for pre-extracted event signals:
 * - effectiveGameDate, extractedBuyIn, extractedGuarantee
 * - extractedVenueName, contentType
 * 
 * Analyzes:
 * - Scheduled events (dates, buy-ins, guarantees)
 * - Schedule clashes with our games
 * - Competitive pressure signals
 * - Market activity trends
 * 
 * Competitor Identification:
 * - Accounts where entityId is null (external competitor)
 * - Accounts where entityId differs from our entity
 * - Accounts in same businessLocation but different entity
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

const SOCIAL_ACCOUNT_TABLE = getTableName('SocialAccount');
const SOCIAL_POST_TABLE = getTableName('SocialPost');
const SOCIAL_POST_GAME_DATA_TABLE = getTableName('SocialPostGameData');

/**
 * Fetch competitor social accounts.
 * Competitors are accounts in same location but different entity.
 */
async function fetchCompetitorAccounts(entityId, businessLocation = null) {
  const competitors = [];
  
  try {
    // If we have a businessLocation, fetch accounts from same location
    if (businessLocation) {
      const locationResult = await docClient.send(new QueryCommand({
        TableName: SOCIAL_ACCOUNT_TABLE,
        IndexName: 'byAccountLocation',
        KeyConditionExpression: 'businessLocation = :location',
        ExpressionAttributeValues: {
          ':location': businessLocation
        }
      }));
      
      // Filter out our own accounts (different entity or null entity)
      const locationAccounts = (locationResult.Items || [])
        .filter(a => a.entityId !== entityId);
      
      competitors.push(...locationAccounts);
    }
    
    console.log(`Found ${competitors.length} competitor accounts in ${businessLocation || 'no location'}`);
  } catch (error) {
    console.warn('Competitor accounts fetch failed:', error.message);
  }
  
  return competitors;
}

/**
 * Fetch posts from competitor accounts with their extracted game data.
 */
async function fetchCompetitorPosts(competitorAccountIds, periodStart, periodEnd) {
  const posts = [];
  
  for (const accountId of competitorAccountIds) {
    try {
      let lastKey = undefined;
      
      do {
        const result = await docClient.send(new QueryCommand({
          TableName: SOCIAL_POST_TABLE,
          IndexName: 'bySocialAccount',
          KeyConditionExpression: 'socialAccountId = :accountId AND postedAt BETWEEN :start AND :end',
          ExpressionAttributeValues: {
            ':accountId': accountId,
            ':start': periodStart.toISOString(),
            ':end': periodEnd.toISOString()
          },
          ExclusiveStartKey: lastKey
        }));
        
        if (result.Items) {
          posts.push(...result.Items);
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);
    } catch (error) {
      console.warn(`Competitor posts fetch failed for ${accountId}:`, error.message);
    }
  }
  
  return posts;
}

/**
 * Fetch SocialPostGameData for posts that have extractedGameDataId.
 * This gives us pre-extracted event signals!
 */
async function fetchExtractedGameData(posts) {
  const extractedDataMap = new Map();
  
  // Get posts that have extracted data
  const postsWithData = posts.filter(p => p.extractedGameDataId);
  if (postsWithData.length === 0) return extractedDataMap;
  
  const CHUNK_SIZE = 100;
  const uniqueIds = [...new Set(postsWithData.map(p => p.extractedGameDataId))];
  
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const keys = chunk.map(id => ({ id }));
    
    try {
      const response = await docClient.send(new BatchGetCommand({
        RequestItems: {
          [SOCIAL_POST_GAME_DATA_TABLE]: { Keys: keys }
        }
      }));
      
      const items = response.Responses?.[SOCIAL_POST_GAME_DATA_TABLE] || [];
      for (const item of items) {
        extractedDataMap.set(item.id, item);
      }
    } catch (error) {
      console.warn('SocialPostGameData batch fetch failed:', error.message);
    }
  }
  
  console.log(`Fetched ${extractedDataMap.size} extracted game data records`);
  return extractedDataMap;
}

/**
 * Build competitor events from posts + extracted data.
 * Uses SocialPostGameData for reliable event signals.
 */
function buildCompetitorEvents(posts, extractedDataMap) {
  const events = [];
  
  for (const post of posts) {
    const extracted = post.extractedGameDataId 
      ? extractedDataMap.get(post.extractedGameDataId)
      : null;
    
    // Use extracted data if available, fall back to post fields
    const event = {
      postId: post.id,
      accountId: post.socialAccountId,
      accountName: post.accountName,
      postedAt: post.postedAt,
      contentPreview: post.contentPreview || post.content?.substring(0, 200),
      
      // Event signals from SocialPostGameData (preferred) or post
      eventDate: extracted?.effectiveGameDate || post.effectiveGameDate,
      dayOfWeek: extracted?.extractedDayOfWeek,
      startTime: extracted?.extractedStartTime,
      buyIn: extracted?.extractedBuyIn,
      guarantee: extracted?.extractedGuarantee,
      venueName: extracted?.extractedVenueName,
      venueId: extracted?.extractedVenueId,
      
      // Event type
      contentType: extracted?.contentType || post.contentType,
      gameType: extracted?.extractedGameType,
      tournamentType: extracted?.extractedTournamentType,
      
      // Series info
      seriesName: extracted?.extractedSeriesName,
      isSeriesEvent: extracted?.isSeriesEvent,
      
      // Flags
      hasEventDate: !!(extracted?.effectiveGameDate || post.effectiveGameDate),
      hasBuyIn: !!extracted?.extractedBuyIn,
      hasGuarantee: !!extracted?.extractedGuarantee,
      isPromotional: post.isPromotional || extracted?.contentType === 'PROMOTIONAL'
    };
    
    // Only include events with actionable signals
    if (event.hasEventDate || event.hasBuyIn || event.hasGuarantee) {
      events.push(event);
    }
  }
  
  return events;
}

/**
 * Detect schedule clashes between competitor events and our games.
 */
function detectScheduleClashes(competitorEvents, ourGames) {
  const clashes = [];
  
  for (const compEvent of competitorEvents) {
    if (!compEvent.eventDate) continue;
    
    const compDate = new Date(compEvent.eventDate);
    const compDateStr = compDate.toISOString().split('T')[0];
    
    for (const ourGame of ourGames) {
      if (!ourGame.gameStartDateTime) continue;
      
      const ourDate = new Date(ourGame.gameStartDateTime);
      const ourDateStr = ourDate.toISOString().split('T')[0];
      
      // Same day clash
      if (compDateStr === ourDateStr) {
        // Check buy-in similarity (within 50%)
        const buyInSimilar = compEvent.buyIn && ourGame.buyInAmount &&
          Math.abs(compEvent.buyIn - ourGame.buyInAmount) / ourGame.buyInAmount < 0.5;
        
        clashes.push({
          ourGameId: ourGame.gameId || ourGame.id,
          ourGameName: ourGame.gameName,
          ourGameVenue: ourGame.venueName,
          ourBuyIn: ourGame.buyInAmount,
          ourEntries: ourGame.totalEntries,
          competitorAccount: compEvent.accountName,
          competitorVenue: compEvent.venueName,
          competitorEventDate: compEvent.eventDate,
          competitorBuyIn: compEvent.buyIn,
          competitorGuarantee: compEvent.guarantee,
          competitorGameType: compEvent.gameType,
          competitorSeriesName: compEvent.seriesName,
          clashType: buyInSimilar ? 'DIRECT_COMPETITION' : 'SAME_DAY',
          severity: buyInSimilar ? 'HIGH' : 'MEDIUM'
        });
      }
    }
  }
  
  return clashes;
}

/**
 * Calculate competitive pressure score.
 */
function calculateCompetitivePressure(competitorPosts, competitorEvents, clashes) {
  let score = 0;
  
  // Base score from competitor activity volume
  if (competitorPosts.length > 20) score += 3;
  else if (competitorPosts.length > 10) score += 2;
  else if (competitorPosts.length > 5) score += 1;
  
  // Events with high guarantees
  const highGuaranteeEvents = competitorEvents.filter(e => e.guarantee && e.guarantee >= 10000);
  if (highGuaranteeEvents.length > 3) score += 2;
  else if (highGuaranteeEvents.length > 0) score += 1;
  
  // Direct clashes
  const directClashes = clashes.filter(c => c.clashType === 'DIRECT_COMPETITION');
  if (directClashes.length > 3) score += 3;
  else if (directClashes.length > 0) score += 2;
  
  // Same-day clashes
  const sameDayClashes = clashes.filter(c => c.clashType === 'SAME_DAY');
  if (sameDayClashes.length > 5) score += 1;
  
  // Convert to level
  if (score >= 7) return { level: 'HIGH', score, description: 'Significant competitive activity detected' };
  if (score >= 4) return { level: 'MEDIUM', score, description: 'Moderate competitive activity' };
  if (score >= 1) return { level: 'LOW', score, description: 'Low competitive pressure' };
  return { level: 'MINIMAL', score, description: 'Minimal competitor activity detected' };
}

/**
 * Analyze competitor activity trends.
 */
function analyzeCompetitorTrends(competitorPosts, periodDays) {
  if (competitorPosts.length === 0) {
    return {
      trend: 'UNKNOWN',
      postsPerWeek: 0,
      promotionalPercent: 0
    };
  }
  
  const postsPerWeek = (competitorPosts.length / periodDays) * 7;
  const promotionalPosts = competitorPosts.filter(p => p.isPromotional);
  const promotionalPercent = (promotionalPosts.length / competitorPosts.length) * 100;
  
  // Analyze recency - are posts increasing?
  const now = new Date();
  const midpoint = new Date(now.getTime() - (periodDays / 2) * 24 * 60 * 60 * 1000);
  
  const firstHalf = competitorPosts.filter(p => new Date(p.postedAt) < midpoint).length;
  const secondHalf = competitorPosts.length - firstHalf;
  
  let trend = 'STABLE';
  if (secondHalf > firstHalf * 1.3) trend = 'INCREASING';
  else if (secondHalf < firstHalf * 0.7) trend = 'DECREASING';
  
  return {
    trend,
    postsPerWeek: Math.round(postsPerWeek * 10) / 10,
    promotionalPercent: Math.round(promotionalPercent),
    firstHalfPosts: firstHalf,
    secondHalfPosts: secondHalf
  };
}

/**
 * Build competitor analysis data for MetricsPack.
 * Uses SocialPostGameData for pre-extracted event signals.
 */
async function buildCompetitorAnalysisData(entityId, ourGames, periodStart, periodEnd, businessLocation = null) {
  // Fetch competitor accounts
  const competitorAccounts = await fetchCompetitorAccounts(entityId, businessLocation);
  
  if (competitorAccounts.length === 0) {
    return {
      hasCompetitorData: false,
      message: 'No competitor accounts found in this location'
    };
  }
  
  // Fetch competitor posts
  const competitorAccountIds = competitorAccounts.map(a => a.id);
  const competitorPosts = await fetchCompetitorPosts(competitorAccountIds, periodStart, periodEnd);
  
  console.log(`Found ${competitorPosts.length} competitor posts in period`);
  
  if (competitorPosts.length === 0) {
    return {
      hasCompetitorData: true,
      summary: {
        competitorAccounts: competitorAccounts.length,
        competitorPosts: 0,
        eventsDetected: 0,
        totalClashes: 0
      },
      pressure: { level: 'MINIMAL', score: 0, description: 'No competitor activity detected' },
      trends: { trend: 'UNKNOWN', postsPerWeek: 0 },
      topCompetitors: [],
      clashes: { high: [], medium: [] },
      recentCompetitorEvents: []
    };
  }
  
  // Fetch pre-extracted game data for posts
  const extractedDataMap = await fetchExtractedGameData(competitorPosts);
  
  // Build competitor events using extracted data
  const competitorEvents = buildCompetitorEvents(competitorPosts, extractedDataMap);
  
  console.log(`Built ${competitorEvents.length} competitor events with extracted signals`);
  
  // Detect schedule clashes
  const clashes = detectScheduleClashes(competitorEvents, ourGames);
  
  // Calculate competitive pressure
  const pressure = calculateCompetitivePressure(competitorPosts, competitorEvents, clashes);
  
  // Analyze trends
  const periodDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
  const trends = analyzeCompetitorTrends(competitorPosts, periodDays);
  
  // Group clashes by severity
  const highSeverityClashes = clashes.filter(c => c.severity === 'HIGH');
  const mediumSeverityClashes = clashes.filter(c => c.severity === 'MEDIUM');
  
  // Top competitor accounts by activity
  const accountActivity = {};
  for (const post of competitorPosts) {
    const name = post.accountName || 'Unknown';
    accountActivity[name] = (accountActivity[name] || 0) + 1;
  }
  
  const topCompetitors = Object.entries(accountActivity)
    .map(([name, postCount]) => ({ name, postCount }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 5);
  
  // Events with high guarantees (competitive threat)
  const highGuaranteeEvents = competitorEvents
    .filter(e => e.guarantee && e.guarantee >= 10000)
    .sort((a, b) => (b.guarantee || 0) - (a.guarantee || 0))
    .slice(0, 5);
  
  return {
    hasCompetitorData: true,
    summary: {
      competitorAccounts: competitorAccounts.length,
      competitorPosts: competitorPosts.length,
      postsWithExtractedData: extractedDataMap.size,
      eventsDetected: competitorEvents.length,
      totalClashes: clashes.length,
      directCompetitionClashes: highSeverityClashes.length,
      sameDayClashes: mediumSeverityClashes.length
    },
    pressure,
    trends,
    topCompetitors,
    highGuaranteeEvents,
    clashes: {
      high: highSeverityClashes.slice(0, 10),
      medium: mediumSeverityClashes.slice(0, 10)
    },
    recentCompetitorEvents: competitorEvents
      .filter(e => e.eventDate)
      .sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate))
      .slice(0, 10)
  };
}

module.exports = {
  fetchCompetitorAccounts,
  fetchCompetitorPosts,
  fetchExtractedGameData,
  buildCompetitorEvents,
  detectScheduleClashes,
  calculateCompetitivePressure,
  buildCompetitorAnalysisData
};
