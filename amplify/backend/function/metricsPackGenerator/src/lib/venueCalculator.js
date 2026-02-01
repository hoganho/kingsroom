/**
 * Venue Calculator (Improved v2)
 * ==============================
 * Calculates venue-level metrics and breakdowns.
 * 
 * IMPORTANT: This expects snapshots to already have venueName and gameName
 * populated by the nameResolver. If names are missing, they were not resolved.
 * 
 * v2.0.0 Changes:
 * - Added full games list per venue (not just top/bottom 3)
 * - Added unique players trending
 * - Added entries per unique player metrics
 * - Supports scheduled-only venues (hadScheduledGamesOnly flag)
 * 
 * @version 2.0.0
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
    const priorPeriodUniquePlayers = sumField(compVenueSnapshots, 'totalUniquePlayers');
    const priorPeriodGames = compVenueSnapshots.length;
    
    // Trends (only if we have comparison data)
    let profitTrendPercent = null;
    let revenueTrendPercent = null;
    let entriesTrendPercent = null;
    let uniquePlayersTrendPercent = null;
    let gamesTrendPercent = null;
    
    if (compVenueSnapshots.length > 0) {
      profitTrendPercent = calculateGrowthPercent(totalProfit, priorPeriodProfit);
      revenueTrendPercent = calculateGrowthPercent(totalRevenue, priorPeriodRevenue);
      entriesTrendPercent = calculateGrowthPercent(totalEntries, priorPeriodEntries);
      uniquePlayersTrendPercent = calculateGrowthPercent(totalUniquePlayers, priorPeriodUniquePlayers);
      gamesTrendPercent = calculateGrowthPercent(totalGames, priorPeriodGames);
    }
    
    // Calculate entries per unique player (engagement metric)
    const entriesPerPlayer = totalUniquePlayers > 0 ? totalEntries / totalUniquePlayers : 0;
    const priorEntriesPerPlayer = priorPeriodUniquePlayers > 0 ? priorPeriodEntries / priorPeriodUniquePlayers : 0;
    const entriesPerPlayerChange = priorEntriesPerPlayer > 0 
      ? ((entriesPerPlayer - priorEntriesPerPlayer) / priorEntriesPerPlayer) * 100 
      : null;
    
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
    
    // Full games list (all games with essential details for UI display)
    const gamesList = sortedByProfit.map(g => ({
      gameId: g.gameId || g.id,
      gameName: g.gameName || g.gameTitle || 'Game',
      recurringGameId: g.recurringGameId,
      recurringGameName: g.recurringGameName || null,
      date: g.gameStartDateTime,
      dayOfWeek: g.gameStartDateTime ? new Date(g.gameStartDateTime).toLocaleDateString('en-AU', { weekday: 'short' }) : null,
      // Financial
      profit: round(g.netProfit || 0),
      revenue: round(g.totalRevenue || 0),
      // Volume
      entries: g.totalEntries || 0,
      uniquePlayers: g.totalUniquePlayers || 0,
      rebuys: g.totalRebuys || 0,
      // Guarantee
      guarantee: g.guaranteeAmount || 0,
      overlay: round(g.totalGuaranteeOverlayCost || 0),
      coverageRate: g.guaranteeCoverageRate || null,
      // Status
      gameStatus: g.gameStatus || null,
      gameType: g.gameType || null
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
      gamesRun: totalGames, // Alias for consistency with gamesNotRun
      totalEntries,
      totalUniquePlayers,
      entriesPerPlayer: round(entriesPerPlayer, 2),
      
      // Financial
      totalRevenue: round(totalRevenue),
      totalCost: round(totalCost),
      totalProfit: round(totalProfit),
      profitMargin: round(profitMargin, 1),
      
      // Averages
      avgRevenuePerGame: round(avgRevenuePerGame),
      avgProfitPerGame: round(avgProfitPerGame),
      avgEntriesPerGame: round(avgEntriesPerGame, 1),
      avgPlayersPerGame: totalGames > 0 ? round(totalUniquePlayers / totalGames, 1) : 0,
      
      // Guarantee
      gamesWithGuarantee,
      gamesWithOverlay,
      totalOverlayCost: round(totalOverlayCost),
      avgCoverageRate: avgCoverageRate !== null ? round(avgCoverageRate, 1) : null,
      
      // Trends - Profit/Revenue
      profitTrendPercent: profitTrendPercent !== null ? round(profitTrendPercent, 1) : null,
      revenueTrendPercent: revenueTrendPercent !== null ? round(revenueTrendPercent, 1) : null,
      trendCategory,
      
      // Trends - Volume/Players (NEW)
      entriesTrendPercent: entriesTrendPercent !== null ? round(entriesTrendPercent, 1) : null,
      uniquePlayersTrendPercent: uniquePlayersTrendPercent !== null ? round(uniquePlayersTrendPercent, 1) : null,
      gamesTrendPercent: gamesTrendPercent !== null ? round(gamesTrendPercent, 1) : null,
      entriesPerPlayerChange: entriesPerPlayerChange !== null ? round(entriesPerPlayerChange, 1) : null,
      
      // Comparison period data
      priorPeriodProfit: compVenueSnapshots.length > 0 ? round(priorPeriodProfit) : null,
      priorPeriodRevenue: compVenueSnapshots.length > 0 ? round(priorPeriodRevenue) : null,
      priorPeriodEntries: compVenueSnapshots.length > 0 ? priorPeriodEntries : null,
      priorPeriodUniquePlayers: compVenueSnapshots.length > 0 ? priorPeriodUniquePlayers : null,
      priorPeriodGames: compVenueSnapshots.length > 0 ? priorPeriodGames : null,
      
      // Health
      overallHealth,
      profitability,
      
      // Breakdowns
      gameTypeBreakdown,
      dayBreakdown,
      
      // Top/Bottom games (summary view)
      topGames,
      bottomGames,
      
      // Full games list (for detailed UI display)
      gamesList
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