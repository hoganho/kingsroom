/**
 * Social Pulse Digest
 * ===================
 * Generates social media activity summaries with extracted game data.
 * 
 * VERSION: 2.0.0 - Updated to use SocialPostGameData
 * 
 * IMPORTANT: This module now leverages the AI-extracted data from SocialPostGameData
 * instead of doing basic text pattern matching. This provides much richer insights
 * about competitor events, guarantees, buy-ins, etc.
 * 
 * For competitive intelligence (clashes, market pressure), use competitorAnalyzer.js
 * which provides more sophisticated analysis. This module focuses on:
 * - Our own account activity metrics
 * - Share of voice calculations
 * - Engagement rankings
 * - Market signal summaries (derived from extracted data)
 */

/**
 * Generate social pulse digest with extracted game data support
 * @param {string} entityId - Entity ID
 * @param {object} socialData - Social data with posts and extracted data
 * @param {object} period - Period info
 * @param {object} extractedGameData - Optional: Pre-fetched SocialPostGameData records
 * @returns {object} Social pulse digest
 */
function generateSocialPulseDigest(entityId, socialData, period, extractedGameData = null) {
  // Handle undefined or null socialData
  if (!socialData) {
    return createEmptyDigest();
  }
  
  const { 
    ourAccounts = [], 
    ourPosts = [], 
    competitorAccounts = [], 
    competitorPosts = [],
    // NEW: Extracted data from SocialPostGameData (if provided)
    ourExtractedData = [],
    competitorExtractedData = extractedGameData || []
  } = socialData;
  
  // ============================================================
  // OUR ACTIVITY SUMMARY
  // ============================================================
  const ourActivity = buildOurActivitySummary(ourPosts, ourExtractedData);
  
  // ============================================================
  // COMPETITOR DIGEST (using extracted data when available)
  // ============================================================
  const competitorDigest = buildCompetitorDigest(
    competitorAccounts, 
    competitorPosts, 
    competitorExtractedData
  );
  
  // ============================================================
  // MARKET SIGNALS (from extracted data, not text matching)
  // ============================================================
  const marketSignals = extractMarketSignalsFromData(competitorExtractedData, competitorPosts);
  
  // ============================================================
  // SUMMARY METRICS
  // ============================================================
  const totalMarketPosts = ourPosts.length + competitorPosts.length;
  const shareOfVoice = totalMarketPosts > 0 ? (ourPosts.length / totalMarketPosts) * 100 : 0;
  
  // Engagement rank
  const allEngagements = [
    { type: 'our', engagement: ourActivity.totalEngagement, name: 'Our Accounts' },
    ...Object.values(competitorDigest).map(c => ({ 
      type: 'competitor', 
      engagement: c.totalEngagement,
      name: c.accountName 
    }))
  ].sort((a, b) => b.engagement - a.engagement);
  
  const engagementRank = allEngagements.findIndex(e => e.type === 'our') + 1;
  
  return {
    ourActivity,
    competitorDigest,
    marketSignals,
    summary: {
      shareOfVoice: Math.round(shareOfVoice * 10) / 10,
      engagementRank: engagementRank || allEngagements.length + 1,
      totalEngagementRanking: allEngagements.slice(0, 5),
      marketPostVolume: totalMarketPosts,
      ourPostCount: ourPosts.length,
      competitorPostCount: competitorPosts.length,
      competitorAccountCount: competitorAccounts.length,
      extractedDataAvailable: competitorExtractedData.length > 0,
      eventsExtracted: competitorExtractedData.filter(e => e.contentType === 'PROMOTIONAL' || e.contentType === 'RESULT').length,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      periodStart: period?.start,
      periodEnd: period?.end,
      version: '2.0.0',
    },
  };
}

/**
 * Build our activity summary
 */
function buildOurActivitySummary(ourPosts, ourExtractedData) {
  const postCount = ourPosts.length;
  const totalEngagement = ourPosts.reduce((sum, p) => {
    return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
  }, 0);
  
  const avgEngagement = postCount > 0 ? Math.round(totalEngagement / postCount) : 0;
  
  // Find top post by engagement
  const topPost = ourPosts.length > 0 
    ? [...ourPosts].sort((a, b) => {
        const aEng = (a.likes || 0) + (a.comments || 0) + (a.shares || 0);
        const bEng = (b.likes || 0) + (b.comments || 0) + (b.shares || 0);
        return bEng - aEng;
      })[0]
    : null;
  
  // Group by venue
  const venueBreakdown = {};
  for (const post of ourPosts) {
    const venueId = post.venueId || 'general';
    if (!venueBreakdown[venueId]) {
      venueBreakdown[venueId] = { posts: 0, engagement: 0, venueName: post.venueName || venueId };
    }
    venueBreakdown[venueId].posts++;
    venueBreakdown[venueId].engagement += (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
  }
  
  // Content type breakdown (using extracted data if available)
  const contentTypeBreakdown = {
    promotional: 0,
    result: 0,
    general: 0,
  };
  
  for (const extracted of ourExtractedData) {
    if (extracted.contentType === 'PROMOTIONAL') contentTypeBreakdown.promotional++;
    else if (extracted.contentType === 'RESULT') contentTypeBreakdown.result++;
    else contentTypeBreakdown.general++;
  }
  
  return {
    postCount,
    totalEngagement,
    avgEngagement,
    topPost: topPost ? {
      id: topPost.id,
      content: topPost.content?.substring(0, 150),
      engagement: (topPost.likes || 0) + (topPost.comments || 0) + (topPost.shares || 0),
      likes: topPost.likes || 0,
      comments: topPost.comments || 0,
      shares: topPost.shares || 0,
      postedAt: topPost.postedAt,
    } : null,
    venueBreakdown,
    contentTypeBreakdown,
    postsWithExtractedData: ourExtractedData.length,
  };
}

/**
 * Build competitor digest with extracted game data
 */
function buildCompetitorDigest(competitorAccounts, competitorPosts, extractedData) {
  const digest = {};
  
  // Index extracted data by socialPostId for quick lookup
  const extractedByPostId = {};
  for (const extracted of extractedData) {
    extractedByPostId[extracted.socialPostId] = extracted;
  }
  
  for (const account of competitorAccounts) {
    const accountPosts = competitorPosts.filter(p => p.accountId === account.id);
    const totalEngagement = accountPosts.reduce((sum, p) => {
      return sum + (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
    }, 0);
    
    // Find extracted data for this account's posts
    const accountExtracted = accountPosts
      .map(p => extractedByPostId[p.id])
      .filter(Boolean);
    
    // Analyze event posts (using extracted data)
    const eventPosts = accountExtracted.filter(e => 
      e.contentType === 'PROMOTIONAL' || e.contentType === 'RESULT'
    );
    
    // Calculate event metrics from extracted data
    const extractedMetrics = {
      eventsPosted: eventPosts.length,
      totalGuaranteeAnnounced: eventPosts.reduce((sum, e) => sum + (e.extractedGuarantee || 0), 0),
      avgBuyIn: eventPosts.length > 0 
        ? eventPosts.reduce((sum, e) => sum + (e.extractedBuyIn || 0), 0) / eventPosts.filter(e => e.extractedBuyIn).length 
        : 0,
      upcomingEvents: eventPosts.filter(e => {
        const eventDate = e.effectiveGameDate || e.extractedDate;
        return eventDate && new Date(eventDate) > new Date();
      }).length,
      resultsPosts: accountExtracted.filter(e => e.contentType === 'RESULT').length,
      promoPosts: accountExtracted.filter(e => e.contentType === 'PROMOTIONAL').length,
    };
    
    digest[account.id] = {
      accountId: account.id,
      accountName: account.accountName || account.handle,
      platform: account.platform,
      isCompetitor: account.isCompetitor || true,
      postCount: accountPosts.length,
      totalEngagement,
      avgEngagement: accountPosts.length > 0 ? Math.round(totalEngagement / accountPosts.length) : 0,
      extractedMetrics,
      // Top posts with extracted event data
      highlights: accountPosts.slice(0, 5).map(p => {
        const extracted = extractedByPostId[p.id];
        return {
          postId: p.id,
          content: p.content?.substring(0, 150),
          engagement: (p.likes || 0) + (p.comments || 0) + (p.shares || 0),
          postedAt: p.postedAt,
          // Include extracted data if available
          extractedData: extracted ? {
            contentType: extracted.contentType,
            eventName: extracted.extractedName,
            venueName: extracted.extractedVenueName,
            buyIn: extracted.extractedBuyIn,
            guarantee: extracted.extractedGuarantee,
            eventDate: extracted.effectiveGameDate || extracted.extractedDate,
            prizePool: extracted.extractedPrizePool,
            entries: extracted.extractedTotalEntries,
          } : null,
        };
      }),
    };
  }
  
  return digest;
}

/**
 * Extract market signals from SocialPostGameData (not text matching)
 * This provides much more accurate data than regex pattern matching
 */
function extractMarketSignalsFromData(extractedData, fallbackPosts = []) {
  const signals = {
    // Events with extracted data
    upcomingEvents: [],
    recentResults: [],
    highGuaranteeEvents: [],
    // Aggregated trends
    guaranteeTrend: null,
    buyInDistribution: { micro: 0, low: 0, mid: 0, high: 0, premium: 0 },
    // Legacy (for backwards compatibility when no extracted data)
    promotions: [],
  };
  
  const now = new Date();
  
  for (const extracted of extractedData) {
    const eventDate = extracted.effectiveGameDate || extracted.extractedDate;
    const eventDateObj = eventDate ? new Date(eventDate) : null;
    
    // Promotional posts (upcoming events)
    if (extracted.contentType === 'PROMOTIONAL' && eventDateObj && eventDateObj > now) {
      signals.upcomingEvents.push({
        accountId: extracted.accountId,
        socialPostId: extracted.socialPostId,
        eventName: extracted.extractedName,
        venueName: extracted.extractedVenueName,
        eventDate: eventDate,
        buyIn: extracted.extractedBuyIn,
        guarantee: extracted.extractedGuarantee,
        seriesName: extracted.extractedSeriesName,
        isSeriesEvent: extracted.isSeriesEvent,
      });
      
      // Track high guarantee events
      if (extracted.extractedGuarantee >= 10000) {
        signals.highGuaranteeEvents.push({
          accountId: extracted.accountId,
          eventName: extracted.extractedName,
          venueName: extracted.extractedVenueName,
          eventDate: eventDate,
          buyIn: extracted.extractedBuyIn,
          guarantee: extracted.extractedGuarantee,
        });
      }
    }
    
    // Result posts
    if (extracted.contentType === 'RESULT') {
      signals.recentResults.push({
        accountId: extracted.accountId,
        socialPostId: extracted.socialPostId,
        eventName: extracted.extractedName,
        venueName: extracted.extractedVenueName,
        eventDate: eventDate,
        buyIn: extracted.extractedBuyIn,
        prizePool: extracted.extractedPrizePool,
        entries: extracted.extractedTotalEntries,
        winner: extracted.extractedWinnerName,
        winnerPrize: extracted.extractedWinnerPrize,
      });
    }
    
    // Buy-in distribution
    const buyIn = extracted.extractedBuyIn;
    if (buyIn) {
      if (buyIn < 50) signals.buyInDistribution.micro++;
      else if (buyIn < 150) signals.buyInDistribution.low++;
      else if (buyIn < 500) signals.buyInDistribution.mid++;
      else if (buyIn < 1000) signals.buyInDistribution.high++;
      else signals.buyInDistribution.premium++;
    }
  }
  
  // Sort by date
  signals.upcomingEvents.sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
  signals.recentResults.sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  signals.highGuaranteeEvents.sort((a, b) => (b.guarantee || 0) - (a.guarantee || 0));
  
  // Calculate guarantee trend if we have enough data
  const guarantees = extractedData
    .filter(e => e.extractedGuarantee > 0)
    .map(e => e.extractedGuarantee);
  
  if (guarantees.length >= 5) {
    const avgGuarantee = guarantees.reduce((a, b) => a + b, 0) / guarantees.length;
    const maxGuarantee = Math.max(...guarantees);
    const minGuarantee = Math.min(...guarantees);
    
    signals.guaranteeTrend = {
      average: Math.round(avgGuarantee),
      max: maxGuarantee,
      min: minGuarantee,
      count: guarantees.length,
    };
  }
  
  // Fallback: If no extracted data, use basic text matching (legacy behavior)
  if (extractedData.length === 0 && fallbackPosts.length > 0) {
    signals.promotions = extractPromotionsFromText(fallbackPosts);
  }
  
  return signals;
}

/**
 * Legacy fallback: Extract promotions from post text
 * Only used when SocialPostGameData is not available
 */
function extractPromotionsFromText(posts) {
  const promotions = [];
  
  for (const post of posts) {
    const content = (post.content || '').toLowerCase();
    
    // Only capture obvious promotions
    if (content.includes('promo') || content.includes('bonus') || 
        content.includes('discount') || content.includes('free entry') ||
        content.includes('special offer')) {
      promotions.push({
        accountId: post.accountId,
        content: post.content?.substring(0, 150),
        postedAt: post.postedAt,
        source: 'text_match', // Flag this as less reliable
      });
    }
  }
  
  return promotions;
}

/**
 * Create empty digest structure
 */
function createEmptyDigest() {
  return {
    ourActivity: { 
      postCount: 0, 
      totalEngagement: 0, 
      avgEngagement: 0,
      topPost: null, 
      venueBreakdown: {},
      contentTypeBreakdown: { promotional: 0, result: 0, general: 0 },
      postsWithExtractedData: 0,
    },
    competitorDigest: {},
    marketSignals: { 
      upcomingEvents: [], 
      recentResults: [],
      highGuaranteeEvents: [],
      guaranteeTrend: null,
      buyInDistribution: { micro: 0, low: 0, mid: 0, high: 0, premium: 0 },
      promotions: [],
    },
    summary: { 
      shareOfVoice: 0, 
      engagementRank: 0, 
      totalEngagementRanking: [],
      marketPostVolume: 0,
      ourPostCount: 0,
      competitorPostCount: 0,
      competitorAccountCount: 0,
      extractedDataAvailable: false,
      eventsExtracted: 0,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      version: '2.0.0',
    },
  };
}

/**
 * Merge competitor analysis with social pulse for complete picture
 * Use this when you have both sources of data
 * 
 * @param {object} socialPulse - Output from generateSocialPulseDigest
 * @param {object} competitorAnalysis - Output from competitorAnalyzer
 * @returns {object} Merged competitive intelligence
 */
function mergeWithCompetitorAnalysis(socialPulse, competitorAnalysis) {
  if (!competitorAnalysis || !competitorAnalysis.hasCompetitorData) {
    return socialPulse;
  }
  
  return {
    ...socialPulse,
    // Enrich with competitor analysis data
    competitiveIntelligence: {
      pressureLevel: competitorAnalysis.pressure?.level,
      pressureScore: competitorAnalysis.pressure?.score,
      pressureDescription: competitorAnalysis.pressure?.description,
      activityTrend: competitorAnalysis.trends?.trend,
      directClashes: competitorAnalysis.clashes?.high || [],
      sameDayClashes: competitorAnalysis.clashes?.medium || [],
      highGuaranteeThreats: competitorAnalysis.highGuaranteeEvents || [],
      topCompetitorsByActivity: competitorAnalysis.topCompetitors || [],
    },
    // Flag that we have rich analysis
    hasCompetitorAnalysis: true,
  };
}

module.exports = {
  generateSocialPulseDigest,
  extractMarketSignalsFromData,
  mergeWithCompetitorAnalysis,
  createEmptyDigest,
};
