/**
 * Venue Calculator (Improved)
 * ===========================
 * Calculates venue-level metrics and breakdowns.
 * 
 * IMPORTANT: This expects snapshots to already have venueName and gameName
 * populated by the nameResolver. If names are missing, they were not resolved.
 */

const { sumField, round, calculateGrowthPercent } = require('./kpiCalculator');

/**
 * Get trend category based on profit trend percent
 */
function getTrendCategory(profitTrendPercent) {
  if (profitTrendPercent === null || profitTrendPercent === undefined) return 'STEADY';
  if (profitTrendPercent < -25) return 'AT_RISK';
  if (profitTrendPercent < -10) return 'SOFTENING';
  if (profitTrendPercent > 40) return 'BREAKOUT';
  if (profitTrendPercent > 15) return 'UPLIFT';
  return 'STEADY';
}

/**
 * Get health status based on margin and trend
 */
function getOverallHealth(profitMargin, profitTrendPercent, totalProfit) {
  if (totalProfit < 0) return 'critical';
  if (profitMargin < 10) return 'needs-attention';
  if (profitTrendPercent !== null && profitTrendPercent < -15) return 'needs-attention';
  if (profitMargin >= 30 && (profitTrendPercent === null || profitTrendPercent >= 0)) return 'excellent';
  return 'good';
}

/**
 * Get profitability status
 */
function getProfitability(profitMargin, totalProfit) {
  if (totalProfit < 0) return 'loss';
  if (profitMargin >= 30) return 'highly-profitable';
  if (profitMargin >= 15) return 'profitable';
  return 'break-even';
}

/**
 * Calculate venue breakdown from enriched snapshots.
 * 
 * @param {string} entityId 
 * @param {Object[]} snapshots - Enriched snapshots with venueName/gameName
 * @param {Object[]} venueMetrics - Optional VenueMetrics records
 * @param {Object[]} compSnapshots - Comparison period snapshots (also enriched)
 * @returns {Object[]} Array of venue summaries
 */
async function calculateVenueBreakdown(entityId, snapshots, venueMetrics = [], compSnapshots = []) {
  // Group snapshots by venue
  const byVenue = {};
  const compByVenue = {};
  
  for (const s of snapshots) {
    const venueId = s.venueId || 'unknown';
    if (!byVenue[venueId]) byVenue[venueId] = [];
    byVenue[venueId].push(s);
  }
  
  for (const s of compSnapshots) {
    const venueId = s.venueId || 'unknown';
    if (!compByVenue[venueId]) compByVenue[venueId] = [];
    compByVenue[venueId].push(s);
  }
  
  const venues = [];
  
  for (const [venueId, venueSnapshots] of Object.entries(byVenue)) {
    const compVenueSnapshots = compByVenue[venueId] || [];
    
    // Get venue name from first snapshot (already resolved by nameResolver)
    // Note: No more "Unknown Venue" fallback - if name is missing, it wasn't resolved
    const venueName = venueSnapshots[0]?.venueName || `Venue ${venueId.slice(0, 8)}`;
    
    // Volume metrics
    const totalGames = venueSnapshots.length;
    const totalEntries = sumField(venueSnapshots, 'totalEntries');
    const totalUniquePlayers = sumField(venueSnapshots, 'totalUniquePlayers');
    
    // Financial metrics
    const totalRevenue = sumField(venueSnapshots, 'totalRevenue');
    const totalCost = sumField(venueSnapshots, 'totalCost');
    const totalProfit = sumField(venueSnapshots, 'netProfit');
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    // Averages
    const avgRevenuePerGame = totalGames > 0 ? totalRevenue / totalGames : 0;
    const avgProfitPerGame = totalGames > 0 ? totalProfit / totalGames : 0;
    const avgEntriesPerGame = totalGames > 0 ? totalEntries / totalGames : 0;
    
    // Guarantee metrics
    const gamesWithGuarantee = venueSnapshots.filter(s => (s.guaranteeAmount || 0) > 0).length;
    const gamesWithOverlay = venueSnapshots.filter(s => (s.totalGuaranteeOverlayCost || 0) > 0).length;
    const totalOverlayCost = sumField(venueSnapshots, 'totalGuaranteeOverlayCost');
    
    const coverageRates = venueSnapshots
      .filter(s => s.guaranteeAmount > 0 && s.guaranteeCoverageRate != null)
      .map(s => s.guaranteeCoverageRate);
    const avgCoverageRate = coverageRates.length > 0
      ? coverageRates.reduce((a, b) => a + b, 0) / coverageRates.length
      : null;
    
    // Comparison period metrics
    const priorPeriodRevenue = sumField(compVenueSnapshots, 'totalRevenue');
    const priorPeriodProfit = sumField(compVenueSnapshots, 'netProfit');
    const priorPeriodEntries = sumField(compVenueSnapshots, 'totalEntries');
    
    // Trends (only if we have comparison data)
    let profitTrendPercent = null;
    let revenueTrendPercent = null;
    let entriesTrendPercent = null;
    
    if (compVenueSnapshots.length > 0) {
      profitTrendPercent = calculateGrowthPercent(totalProfit, priorPeriodProfit);
      revenueTrendPercent = calculateGrowthPercent(totalRevenue, priorPeriodRevenue);
      entriesTrendPercent = calculateGrowthPercent(totalEntries, priorPeriodEntries);
    }
    
    const trendCategory = getTrendCategory(profitTrendPercent);
    const overallHealth = getOverallHealth(profitMargin, profitTrendPercent, totalProfit);
    const profitability = getProfitability(profitMargin, totalProfit);
    
    // Top games by profit (with names from enriched snapshots)
    const sortedByProfit = [...venueSnapshots].sort((a, b) => 
      (b.netProfit || 0) - (a.netProfit || 0)
    );
    
    const topGames = sortedByProfit.slice(0, 3).map(g => ({
      gameId: g.gameId || g.id,
      gameName: g.gameName || g.gameTitle || 'Game',
      recurringGameId: g.recurringGameId,
      profit: round(g.netProfit || 0),
      revenue: round(g.totalRevenue || 0),
      entries: g.totalEntries || 0,
      date: g.gameStartDateTime
    }));
    
    const bottomGames = sortedByProfit
      .filter(g => (g.netProfit || 0) < 0) // Only loss-making games
      .slice(-3)
      .reverse()
      .map(g => ({
        gameId: g.gameId || g.id,
        gameName: g.gameName || g.gameTitle || 'Game',
        recurringGameId: g.recurringGameId,
        profit: round(g.netProfit || 0),
        revenue: round(g.totalRevenue || 0),
        entries: g.totalEntries || 0,
        overlay: round(g.totalGuaranteeOverlayCost || 0),
        date: g.gameStartDateTime
      }));
    
    // Game type breakdown
    const gameTypeBreakdown = {};
    for (const s of venueSnapshots) {
      const gt = s.gameType || 'UNKNOWN';
      if (!gameTypeBreakdown[gt]) {
        gameTypeBreakdown[gt] = { count: 0, revenue: 0, profit: 0 };
      }
      gameTypeBreakdown[gt].count++;
      gameTypeBreakdown[gt].revenue += (s.totalRevenue || 0);
      gameTypeBreakdown[gt].profit += (s.netProfit || 0);
    }
    
    // Day of week breakdown
    const dayBreakdown = {};
    for (const s of venueSnapshots) {
      const date = new Date(s.gameStartDateTime);
      const dayNum = date.getDay();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[dayNum];
      if (!dayBreakdown[day]) {
        dayBreakdown[day] = { count: 0, profit: 0 };
      }
      dayBreakdown[day].count++;
      dayBreakdown[day].profit += (s.netProfit || 0);
    }
    
    venues.push({
      venueId,
      venueName,
      entityId: venueSnapshots[0]?.entityId || entityId,
      
      // Volume
      totalGames,
      totalEntries,
      totalUniquePlayers,
      
      // Financial
      totalRevenue: round(totalRevenue),
      totalCost: round(totalCost),
      totalProfit: round(totalProfit),
      profitMargin: round(profitMargin, 1),
      
      // Averages
      avgRevenuePerGame: round(avgRevenuePerGame),
      avgProfitPerGame: round(avgProfitPerGame),
      avgEntriesPerGame: round(avgEntriesPerGame, 1),
      
      // Guarantee
      gamesWithGuarantee,
      gamesWithOverlay,
      totalOverlayCost: round(totalOverlayCost),
      avgCoverageRate: avgCoverageRate !== null ? round(avgCoverageRate, 1) : null,
      
      // Trends
      profitTrendPercent: profitTrendPercent !== null ? round(profitTrendPercent, 1) : null,
      revenueTrendPercent: revenueTrendPercent !== null ? round(revenueTrendPercent, 1) : null,
      entriesTrendPercent: entriesTrendPercent !== null ? round(entriesTrendPercent, 1) : null,
      trendCategory,
      
      // Comparison
      priorPeriodProfit: compVenueSnapshots.length > 0 ? round(priorPeriodProfit) : null,
      priorPeriodRevenue: compVenueSnapshots.length > 0 ? round(priorPeriodRevenue) : null,
      
      // Health
      overallHealth,
      profitability,
      
      // Breakdowns
      gameTypeBreakdown,
      dayBreakdown,
      
      // Top/Bottom games (now with real names!)
      topGames,
      bottomGames
    });
  }
  
  // Sort by profit descending
  return venues.sort((a, b) => b.totalProfit - a.totalProfit);
}

module.exports = {
  calculateVenueBreakdown,
  getTrendCategory,
  getOverallHealth,
  getProfitability
};
