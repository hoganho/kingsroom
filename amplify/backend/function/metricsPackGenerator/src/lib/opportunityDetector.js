/**
 * Opportunity Detector
 * =====================
 * Analyzes data patterns to surface growth opportunities.
 * 
 * Opportunities detected:
 * - Schedule gaps (days without games at profitable venues)
 * - Underserved buy-in tiers
 * - High-performing games that could be expanded
 * - Venues with capacity for more games
 * - Seasonal patterns suggesting timing changes
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_INDICES = { 
  'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 
  'Thursday': 4, 'Friday': 5, 'Saturday': 6 
};

/**
 * Analyze schedule gaps - days without games at profitable venues.
 */
function detectScheduleGaps(venueData) {
  const opportunities = [];
  
  for (const venue of venueData) {
    // Only analyze profitable venues
    if ((venue.totalProfit || 0) <= 0) continue;
    
    // Get days with games
    const daysWithGames = new Set();
    if (venue.gamesByDayOfWeek) {
      for (const day of Object.keys(venue.gamesByDayOfWeek)) {
        if (venue.gamesByDayOfWeek[day] > 0) {
          daysWithGames.add(day.toUpperCase());
        }
      }
    }
    
    // Find gaps
    const allDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const gaps = allDays.filter(day => !daysWithGames.has(day));
    
    // Only flag if venue has at least 2 active days (established venue)
    if (daysWithGames.size >= 2 && gaps.length > 0 && gaps.length <= 4) {
      // Find best performing day for context
      let bestDay = null;
      let bestProfit = 0;
      if (venue.profitByDayOfWeek) {
        for (const [day, profit] of Object.entries(venue.profitByDayOfWeek)) {
          if (profit > bestProfit) {
            bestProfit = profit;
            bestDay = day;
          }
        }
      }
      
      opportunities.push({
        type: 'SCHEDULE_GAP',
        venueId: venue.venueId,
        venueName: venue.venueName,
        title: `Schedule gap at ${venue.venueName}`,
        evidence: `Venue is profitable ($${Math.round(venue.totalProfit)} total) with ${daysWithGames.size} active days but no games on ${gaps.join(', ')}`,
        gaps: gaps,
        activeDays: Array.from(daysWithGames),
        bestDay: bestDay,
        potentialImpact: `Based on ${bestDay || 'current'} performance, adding a game could generate $${Math.round((bestProfit || venue.avgProfitPerGame || 100) * 0.7)}-${Math.round((bestProfit || venue.avgProfitPerGame || 100) * 1.2)} per week`,
        recommendation: `Consider adding a ${gaps[0]} game, starting with a proven format`,
        priority: gaps.length === 1 ? 'MEDIUM' : 'LOW'
      });
    }
  }
  
  return opportunities;
}

/**
 * Detect underserved buy-in tiers at venues.
 */
function detectBuyInGaps(snapshots, venueData) {
  const opportunities = [];
  
  // Group snapshots by venue and buy-in tier
  const venueByInTiers = {};
  
  for (const snapshot of snapshots) {
    const venueId = snapshot.venueId;
    const buyIn = snapshot.buyInAmount || snapshot.totalBuyIn || 0;
    
    if (!venueId || buyIn <= 0) continue;
    
    if (!venueByInTiers[venueId]) {
      venueByInTiers[venueId] = {
        under50: { count: 0, totalEntries: 0, totalProfit: 0 },
        range50to100: { count: 0, totalEntries: 0, totalProfit: 0 },
        range100to200: { count: 0, totalEntries: 0, totalProfit: 0 },
        range200to500: { count: 0, totalEntries: 0, totalProfit: 0 },
        over500: { count: 0, totalEntries: 0, totalProfit: 0 }
      };
    }
    
    const tiers = venueByInTiers[venueId];
    const entries = snapshot.totalEntries || 0;
    const profit = snapshot.netProfit || 0;
    
    if (buyIn < 50) {
      tiers.under50.count++;
      tiers.under50.totalEntries += entries;
      tiers.under50.totalProfit += profit;
    } else if (buyIn < 100) {
      tiers.range50to100.count++;
      tiers.range50to100.totalEntries += entries;
      tiers.range50to100.totalProfit += profit;
    } else if (buyIn < 200) {
      tiers.range100to200.count++;
      tiers.range100to200.totalEntries += entries;
      tiers.range100to200.totalProfit += profit;
    } else if (buyIn < 500) {
      tiers.range200to500.count++;
      tiers.range200to500.totalEntries += entries;
      tiers.range200to500.totalProfit += profit;
    } else {
      tiers.over500.count++;
      tiers.over500.totalEntries += entries;
      tiers.over500.totalProfit += profit;
    }
  }
  
  // Analyze each venue for buy-in gaps
  for (const venue of venueData) {
    const tiers = venueByInTiers[venue.venueId];
    if (!tiers) continue;
    
    // Only analyze venues with decent volume
    const totalGames = Object.values(tiers).reduce((sum, t) => sum + t.count, 0);
    if (totalGames < 5) continue;
    
    // Find most profitable tier
    let bestTier = null;
    let bestAvgProfit = 0;
    for (const [tierName, data] of Object.entries(tiers)) {
      if (data.count >= 2) {
        const avgProfit = data.totalProfit / data.count;
        if (avgProfit > bestAvgProfit) {
          bestAvgProfit = avgProfit;
          bestTier = tierName;
        }
      }
    }
    
    // Find empty tiers that are adjacent to active tiers
    const tierOrder = ['under50', 'range50to100', 'range100to200', 'range200to500', 'over500'];
    const tierLabels = {
      'under50': 'Under $50',
      'range50to100': '$50-$100',
      'range100to200': '$100-$200',
      'range200to500': '$200-$500',
      'over500': 'Over $500'
    };
    
    for (let i = 0; i < tierOrder.length; i++) {
      const tier = tierOrder[i];
      if (tiers[tier].count === 0) {
        // Check if adjacent tiers are active
        const prevTier = i > 0 ? tierOrder[i - 1] : null;
        const nextTier = i < tierOrder.length - 1 ? tierOrder[i + 1] : null;
        
        const prevActive = prevTier && tiers[prevTier].count >= 2;
        const nextActive = nextTier && tiers[nextTier].count >= 2;
        
        if (prevActive || nextActive) {
          // This is a gap worth exploring
          const adjacentTierProfit = prevActive 
            ? tiers[prevTier].totalProfit / tiers[prevTier].count
            : tiers[nextTier].totalProfit / tiers[nextTier].count;
          
          opportunities.push({
            type: 'BUYIN_GAP',
            venueId: venue.venueId,
            venueName: venue.venueName,
            title: `${tierLabels[tier]} buy-in gap at ${venue.venueName}`,
            evidence: `Venue has no ${tierLabels[tier]} games but successful games in adjacent tiers`,
            missingTier: tierLabels[tier],
            adjacentPerformance: `Adjacent tier averaging $${Math.round(adjacentTierProfit)} profit per game`,
            potentialImpact: `Could capture underserved player segment`,
            recommendation: `Test a ${tierLabels[tier]} tournament to diversify offering`,
            priority: 'LOW'
          });
        }
      }
    }
  }
  
  return opportunities;
}

/**
 * Detect high performers that could be expanded.
 */
function detectExpansionOpportunities(recurringGameData) {
  const opportunities = [];
  
  if (!recurringGameData?.topPerformers) return opportunities;
  
  for (const game of recurringGameData.topPerformers) {
    // Look for games that are both profitable and growing
    if (game.profitTrend === 'up' && 
        game.attendanceTrend === 'up' && 
        game.brandStrength === 'STRONG') {
      
      opportunities.push({
        type: 'EXPANSION_OPPORTUNITY',
        recurringGameId: game.recurringGameId,
        gameName: game.name,
        venueId: game.venueId,
        venueName: game.venueName,
        title: `Consider expanding ${game.name}`,
        evidence: `Strong brand with growing attendance (+${game.attendanceTrendPercent || 0}%) and profit (+${game.profitTrendPercent || 0}%)`,
        avgProfit: game.avgProfit,
        avgEntries: game.avgEntries,
        potentialImpact: 'Could add second weekly instance or higher guarantee',
        recommendation: 'Evaluate adding second weekly session or increasing guarantee',
        priority: 'MEDIUM'
      });
    }
  }
  
  return opportunities;
}

/**
 * Detect venues with capacity for growth.
 */
function detectVenueCapacityOpportunities(venueData, entityAverages) {
  const opportunities = [];
  
  const avgGamesPerVenue = entityAverages?.avgGamesPerVenue || 10;
  
  for (const venue of venueData) {
    // Profitable venue with fewer than average games
    if (venue.totalProfit > 0 && 
        venue.totalGames < avgGamesPerVenue * 0.6 &&
        venue.avgProfitPerGame > 50) {
      
      opportunities.push({
        type: 'VENUE_CAPACITY',
        venueId: venue.venueId,
        venueName: venue.venueName,
        title: `${venue.venueName} has growth capacity`,
        evidence: `Only ${venue.totalGames} games vs entity average of ${Math.round(avgGamesPerVenue)}, yet profitable ($${Math.round(venue.totalProfit)})`,
        currentGames: venue.totalGames,
        avgProfitPerGame: venue.avgProfitPerGame,
        potentialImpact: `Adding ${Math.round(avgGamesPerVenue - venue.totalGames)} games could increase profit by $${Math.round((avgGamesPerVenue - venue.totalGames) * venue.avgProfitPerGame * 0.7)}`,
        recommendation: 'Review schedule for expansion opportunities',
        priority: 'MEDIUM'
      });
    }
  }
  
  return opportunities;
}

/**
 * Detect opportunities from competitor weaknesses.
 */
function detectCompetitorOpportunities(competitorData, ourPerformance) {
  const opportunities = [];
  
  if (!competitorData?.hasCompetitorData) return opportunities;
  
  // If competitor activity is decreasing, opportunity to capture market share
  if (competitorData.trends?.trend === 'DECREASING') {
    opportunities.push({
      type: 'MARKET_OPPORTUNITY',
      title: 'Competitor activity declining',
      evidence: `Competitor social activity down from ${competitorData.trends.firstHalfPosts} to ${competitorData.trends.secondHalfPosts} posts`,
      potentialImpact: 'Opportunity to capture market share with increased marketing',
      recommendation: 'Consider increasing social presence and promotional activity',
      priority: 'MEDIUM'
    });
  }
  
  // If we have schedule clashes but are winning on entries, double down
  if (competitorData.clashes?.high?.length > 0) {
    const winningClashes = competitorData.clashes.high.filter(c => 
      c.ourEntries && c.ourEntries > 30 // Decent turnout despite clash
    );
    
    if (winningClashes.length > 0) {
      opportunities.push({
        type: 'COMPETITIVE_STRENGTH',
        title: 'Strong performance despite competition',
        evidence: `${winningClashes.length} games maintain good attendance despite direct competitor clashes`,
        games: winningClashes.map(c => c.ourGameName),
        potentialImpact: 'These games have proven competitive resilience',
        recommendation: 'Consider increasing guarantees on these games to further differentiate',
        priority: 'LOW'
      });
    }
  }
  
  return opportunities;
}

/**
 * Build all opportunities for MetricsPack.
 */
function buildOpportunityData(params) {
  const {
    snapshots = [],
    venueData = [],
    recurringGameData = null,
    competitorData = null,
    entityAverages = null
  } = params;
  
  const allOpportunities = [];
  
  // 1. Schedule gaps
  const scheduleGaps = detectScheduleGaps(venueData);
  allOpportunities.push(...scheduleGaps);
  
  // 2. Buy-in tier gaps
  const buyInGaps = detectBuyInGaps(snapshots, venueData);
  allOpportunities.push(...buyInGaps);
  
  // 3. Expansion opportunities
  const expansionOps = detectExpansionOpportunities(recurringGameData);
  allOpportunities.push(...expansionOps);
  
  // 4. Venue capacity
  const venueCapacity = detectVenueCapacityOpportunities(venueData, entityAverages);
  allOpportunities.push(...venueCapacity);
  
  // 5. Competitor weaknesses
  const competitorOps = detectCompetitorOpportunities(competitorData, null);
  allOpportunities.push(...competitorOps);
  
  // Sort by priority
  const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
  allOpportunities.sort((a, b) => 
    (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
  );
  
  // Categorize
  const byType = {
    scheduleGaps: allOpportunities.filter(o => o.type === 'SCHEDULE_GAP'),
    buyInGaps: allOpportunities.filter(o => o.type === 'BUYIN_GAP'),
    expansionOpportunities: allOpportunities.filter(o => o.type === 'EXPANSION_OPPORTUNITY'),
    venueCapacity: allOpportunities.filter(o => o.type === 'VENUE_CAPACITY'),
    marketOpportunities: allOpportunities.filter(o => o.type === 'MARKET_OPPORTUNITY' || o.type === 'COMPETITIVE_STRENGTH')
  };
  
  return {
    hasOpportunities: allOpportunities.length > 0,
    summary: {
      totalOpportunities: allOpportunities.length,
      highPriority: allOpportunities.filter(o => o.priority === 'HIGH').length,
      mediumPriority: allOpportunities.filter(o => o.priority === 'MEDIUM').length,
      lowPriority: allOpportunities.filter(o => o.priority === 'LOW').length,
      byType: {
        scheduleGaps: byType.scheduleGaps.length,
        buyInGaps: byType.buyInGaps.length,
        expansion: byType.expansionOpportunities.length,
        venueCapacity: byType.venueCapacity.length,
        market: byType.marketOpportunities.length
      }
    },
    topOpportunities: allOpportunities.slice(0, 10),
    byType
  };
}

module.exports = {
  detectScheduleGaps,
  detectBuyInGaps,
  detectExpansionOpportunities,
  detectVenueCapacityOpportunities,
  detectCompetitorOpportunities,
  buildOpportunityData
};
