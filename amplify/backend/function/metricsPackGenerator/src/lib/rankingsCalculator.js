/**
 * Rankings Calculator
 * ===================
 * Calculates rankings and top/bottom performers.
 */

const { round } = require('./kpiCalculator');

function calculateRankings(snapshots, venues) {
  // Top venues by profit
  const topVenuesByProfit = [...venues]
    .sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0))
    .slice(0, 5)
    .map((v, i) => ({
      rank: i + 1,
      venueId: v.venueId,
      venueName: v.venueName,
      totalProfit: v.totalProfit,
      profitMargin: v.profitMargin
    }));
  
  // Top venues by margin
  const topVenuesByMargin = [...venues]
    .filter(v => v.totalGames >= 3) // Minimum games for meaningful margin
    .sort((a, b) => (b.profitMargin || 0) - (a.profitMargin || 0))
    .slice(0, 5)
    .map((v, i) => ({
      rank: i + 1,
      venueId: v.venueId,
      venueName: v.venueName,
      profitMargin: v.profitMargin,
      totalGames: v.totalGames
    }));
  
  // Top venues by growth
  const topVenuesByGrowth = [...venues]
    .filter(v => v.profitTrendPercent !== null)
    .sort((a, b) => (b.profitTrendPercent || 0) - (a.profitTrendPercent || 0))
    .slice(0, 5)
    .map((v, i) => ({
      rank: i + 1,
      venueId: v.venueId,
      venueName: v.venueName,
      profitTrendPercent: v.profitTrendPercent,
      totalProfit: v.totalProfit
    }));
  
  // Bottom venues (at risk)
  const atRiskVenues = [...venues]
    .filter(v => v.trendCategory === 'AT_RISK' || v.totalProfit < 0)
    .sort((a, b) => (a.totalProfit || 0) - (b.totalProfit || 0))
    .slice(0, 5)
    .map(v => ({
      venueId: v.venueId,
      venueName: v.venueName,
      totalProfit: v.totalProfit,
      trendCategory: v.trendCategory,
      profitTrendPercent: v.profitTrendPercent
    }));
  
  // Game type performance
  const byGameType = {};
  for (const s of snapshots) {
    const gameType = s.gameType || 'UNKNOWN';
    if (!byGameType[gameType]) {
      byGameType[gameType] = { games: 0, revenue: 0, profit: 0, entries: 0 };
    }
    byGameType[gameType].games++;
    byGameType[gameType].revenue += (s.totalRevenue || 0);
    byGameType[gameType].profit += (s.netProfit || 0);
    byGameType[gameType].entries += (s.totalEntries || 0);
  }
  
  const gameTypePerformance = Object.entries(byGameType)
    .map(([gameType, data]) => ({
      gameType,
      totalGames: data.games,
      totalRevenue: round(data.revenue),
      totalProfit: round(data.profit),
      totalEntries: data.entries,
      profitMargin: data.revenue > 0 ? round((data.profit / data.revenue) * 100, 1) : 0,
      avgProfitPerGame: data.games > 0 ? round(data.profit / data.games) : 0
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);
  
  // Day of week performance
  const byDayOfWeek = {};
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const s of snapshots) {
    const dayOfWeek = s.dayOfWeek || DAYS[new Date(s.gameStartDateTime).getDay()];
    if (!byDayOfWeek[dayOfWeek]) {
      byDayOfWeek[dayOfWeek] = { games: 0, revenue: 0, profit: 0, entries: 0 };
    }
    byDayOfWeek[dayOfWeek].games++;
    byDayOfWeek[dayOfWeek].revenue += (s.totalRevenue || 0);
    byDayOfWeek[dayOfWeek].profit += (s.netProfit || 0);
    byDayOfWeek[dayOfWeek].entries += (s.totalEntries || 0);
  }
  
  const dayOfWeekPerformance = Object.entries(byDayOfWeek)
    .map(([day, data]) => ({
      dayOfWeek: day,
      totalGames: data.games,
      totalRevenue: round(data.revenue),
      totalProfit: round(data.profit),
      avgProfitPerGame: data.games > 0 ? round(data.profit / data.games) : 0
    }));
  
  // Buy-in tier performance
  const TIERS = {
    MICRO: { min: 0, max: 50 },
    LOW: { min: 51, max: 150 },
    MID: { min: 151, max: 500 },
    HIGH: { min: 501, max: 1500 },
    PREMIUM: { min: 1501, max: Infinity }
  };
  
  const byBuyInTier = {};
  for (const s of snapshots) {
    const buyIn = s.buyInAmount || s.totalBuyIn || 0;
    let tier = 'UNKNOWN';
    for (const [t, range] of Object.entries(TIERS)) {
      if (buyIn >= range.min && buyIn <= range.max) {
        tier = t;
        break;
      }
    }
    if (!byBuyInTier[tier]) {
      byBuyInTier[tier] = { games: 0, revenue: 0, profit: 0, entries: 0 };
    }
    byBuyInTier[tier].games++;
    byBuyInTier[tier].revenue += (s.totalRevenue || 0);
    byBuyInTier[tier].profit += (s.netProfit || 0);
    byBuyInTier[tier].entries += (s.totalEntries || 0);
  }
  
  const buyInTierPerformance = Object.entries(byBuyInTier)
    .map(([tier, data]) => ({
      tier,
      totalGames: data.games,
      totalRevenue: round(data.revenue),
      totalProfit: round(data.profit),
      totalEntries: data.entries,
      avgEntriesPerGame: data.games > 0 ? round(data.entries / data.games, 1) : 0
    }));
  
  // Top games by profit
  const topGamesByProfit = [...snapshots]
    .sort((a, b) => (b.netProfit || 0) - (a.netProfit || 0))
    .slice(0, 10)
    .map((g, i) => ({
      rank: i + 1,
      gameId: g.gameId || g.id,
      gameName: g.gameName || g.gameTitle,
      venueName: g.venueName,
      profit: round(g.netProfit || 0),
      revenue: round(g.totalRevenue || 0),
      entries: g.totalEntries || 0
    }));
  
  // Bottom games (losses)
  const bottomGamesByProfit = [...snapshots]
    .filter(s => (s.netProfit || 0) < 0)
    .sort((a, b) => (a.netProfit || 0) - (b.netProfit || 0))
    .slice(0, 10)
    .map(g => ({
      gameId: g.gameId || g.id,
      gameName: g.gameName || g.gameTitle,
      venueName: g.venueName,
      profit: round(g.netProfit || 0),
      entries: g.totalEntries || 0
    }));
  
  return {
    venues: {
      byProfit: topVenuesByProfit,
      byMargin: topVenuesByMargin,
      byGrowth: topVenuesByGrowth,
      atRisk: atRiskVenues
    },
    gameTypes: gameTypePerformance,
    dayOfWeek: dayOfWeekPerformance,
    buyInTiers: buyInTierPerformance,
    games: {
      topByProfit: topGamesByProfit,
      losses: bottomGamesByProfit
    }
  };
}

module.exports = {
  calculateRankings
};
