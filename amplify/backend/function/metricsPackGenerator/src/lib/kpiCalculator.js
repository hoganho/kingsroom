/**
 * KPI Calculator
 * ==============
 * Calculates strategic KPIs from GameFinancialSnapshot data.
 */

function sumField(items, field) {
  return items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
}

function calculateGrowthPercent(current, previous) {
  if (previous === 0) {
    return current > 0 ? 100 : (current < 0 ? -100 : 0);
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

function getTrend(growthPercent, threshold = 5) {
  if (growthPercent > threshold) return 'up';
  if (growthPercent < -threshold) return 'down';
  return 'flat';
}

function round(value, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function calculateStrategicKPIs({ snapshots, comparisonSnapshots = [], playerEntries = [], playerResults = [] }) {
  // === ABSOLUTE METRICS ===
  const totalRevenue = sumField(snapshots, 'totalRevenue');
  const totalCost = sumField(snapshots, 'totalCost');
  const netProfit = sumField(snapshots, 'netProfit');
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  
  // === VOLUME METRICS ===
  const totalGamesRun = snapshots.length;
  const totalEntries = sumField(snapshots, 'totalEntries');
  const rebuys = sumField(snapshots, 'totalRebuys');
  const addons = sumField(snapshots, 'totalAddOns');
  
  // Unique players - get from snapshots or count distinct from entries
  let totalUniquePlayers = sumField(snapshots, 'totalUniquePlayers');
  if (totalUniquePlayers === 0 && playerEntries.length > 0) {
    const uniquePlayerIds = new Set(playerEntries.map(e => e.playerId).filter(Boolean));
    totalUniquePlayers = uniquePlayerIds.size;
  }
  
  // === PER-PLAYER METRICS ===
  const revenuePerPlayer = totalUniquePlayers > 0 ? totalRevenue / totalUniquePlayers : 0;
  const profitPerPlayer = totalUniquePlayers > 0 ? netProfit / totalUniquePlayers : 0;
  const entriesPerPlayer = totalUniquePlayers > 0 ? totalEntries / totalUniquePlayers : 0;
  const rakePerEntry = totalEntries > 0 ? sumField(snapshots, 'rakeRevenue') / totalEntries : 0;
  
  // === REVENUE BREAKDOWN ===
  const rakeRevenue = sumField(snapshots, 'rakeRevenue');
  const venueFeeRevenue = sumField(snapshots, 'venueFee');
  const otherRevenue = totalRevenue - rakeRevenue - venueFeeRevenue;
  
  // === COST BREAKDOWN ===
  const staffCost = sumField(snapshots, 'totalStaffCost');
  const dealerCost = sumField(snapshots, 'dealerCost');
  const venueRentalCost = sumField(snapshots, 'venueRentalCost');
  const marketingCost = sumField(snapshots, 'marketingCost');
  const overlayCost = sumField(snapshots, 'totalGuaranteeOverlayCost');
  const otherCost = totalCost - staffCost - dealerCost - venueRentalCost - marketingCost - overlayCost;
  
  // === GUARANTEE METRICS ===
  const gamesWithGuarantee = snapshots.filter(s => (s.guaranteeAmount || 0) > 0).length;
  const gamesWithOverlay = snapshots.filter(s => (s.totalGuaranteeOverlayCost || 0) > 0).length;
  const totalGuaranteeExposure = sumField(snapshots.filter(s => s.guaranteeAmount > 0), 'guaranteeAmount');
  const guaranteeExposureRate = gamesWithGuarantee > 0 ? (gamesWithOverlay / gamesWithGuarantee) * 100 : 0;
  const totalOverlayCost = sumField(snapshots, 'totalGuaranteeOverlayCost');
  
  const coverageRates = snapshots
    .filter(s => s.guaranteeAmount > 0 && s.guaranteeCoverageRate != null)
    .map(s => s.guaranteeCoverageRate);
  const avgGuaranteeCoverageRate = coverageRates.length > 0
    ? coverageRates.reduce((a, b) => a + b, 0) / coverageRates.length
    : 100;
  
  // === PRIZEPOOL METRICS ===
  const totalPrizepool = sumField(snapshots, 'totalPrizepool');
  const avgPrizepool = totalGamesRun > 0 ? totalPrizepool / totalGamesRun : 0;
  const prizepoolSurplus = sumField(snapshots, 'prizepoolSurplus');
  
  // === COMPARISON PERIOD ===
  const compRevenue = sumField(comparisonSnapshots, 'totalRevenue');
  const compProfit = sumField(comparisonSnapshots, 'netProfit');
  const compPlayers = sumField(comparisonSnapshots, 'totalUniquePlayers');
  const compMargin = compRevenue > 0 ? (sumField(comparisonSnapshots, 'netProfit') / compRevenue) * 100 : 0;
  const compGames = comparisonSnapshots.length;
  const compEntries = sumField(comparisonSnapshots, 'totalEntries');
  
  // === GROWTH METRICS ===
  const revenueGrowth = totalRevenue - compRevenue;
  const revenueGrowthPercent = calculateGrowthPercent(totalRevenue, compRevenue);
  const profitGrowth = netProfit - compProfit;
  const profitGrowthPercent = calculateGrowthPercent(netProfit, compProfit);
  const playerGrowth = totalUniquePlayers - compPlayers;
  const playerGrowthPercent = calculateGrowthPercent(totalUniquePlayers, compPlayers);
  const marginChange = profitMargin - compMargin;
  const gamesGrowth = totalGamesRun - compGames;
  const gamesGrowthPercent = calculateGrowthPercent(totalGamesRun, compGames);
  const entriesGrowth = totalEntries - compEntries;
  const entriesGrowthPercent = calculateGrowthPercent(totalEntries, compEntries);
  
  // === EFFICIENCY METRICS ===
  const avgRevenuePerGame = totalGamesRun > 0 ? totalRevenue / totalGamesRun : 0;
  const avgProfitPerGame = totalGamesRun > 0 ? netProfit / totalGamesRun : 0;
  const avgEntriesPerGame = totalGamesRun > 0 ? totalEntries / totalGamesRun : 0;
  const costPerEntry = totalEntries > 0 ? totalCost / totalEntries : 0;
  const profitPerEntry = totalEntries > 0 ? netProfit / totalEntries : 0;
  
  // === TREND INDICATORS ===
  const revenueTrend = getTrend(revenueGrowthPercent);
  const profitTrend = getTrend(profitGrowthPercent);
  const playerTrend = getTrend(playerGrowthPercent);
  const marginTrend = getTrend(marginChange, 2);
  
  return {
    // Absolute
    totalRevenue: round(totalRevenue),
    totalCost: round(totalCost),
    netProfit: round(netProfit),
    profitMargin: round(profitMargin, 1),
    
    // Volume
    totalGamesRun,
    totalEntries,
    totalUniquePlayers,
    rebuys,
    addons,
    
    // Per-player
    revenuePerPlayer: round(revenuePerPlayer),
    profitPerPlayer: round(profitPerPlayer),
    entriesPerPlayer: round(entriesPerPlayer, 2),
    rakePerEntry: round(rakePerEntry),
    
    // Revenue breakdown
    rakeRevenue: round(rakeRevenue),
    venueFeeRevenue: round(venueFeeRevenue),
    otherRevenue: round(otherRevenue),
    
    // Cost breakdown
    staffCost: round(staffCost),
    dealerCost: round(dealerCost),
    venueRentalCost: round(venueRentalCost),
    marketingCost: round(marketingCost),
    overlayCost: round(overlayCost),
    otherCost: round(otherCost),
    
    // Guarantee
    gamesWithGuarantee,
    gamesWithOverlay,
    totalGuaranteeExposure: round(totalGuaranteeExposure),
    guaranteeExposureRate: round(guaranteeExposureRate, 1),
    totalOverlayCost: round(totalOverlayCost),
    avgGuaranteeCoverageRate: round(avgGuaranteeCoverageRate, 1),
    
    // Prizepool
    totalPrizepool: round(totalPrizepool),
    avgPrizepool: round(avgPrizepool),
    prizepoolSurplus: round(prizepoolSurplus),
    
    // Growth
    revenueGrowth: round(revenueGrowth),
    revenueGrowthPercent: round(revenueGrowthPercent, 1),
    profitGrowth: round(profitGrowth),
    profitGrowthPercent: round(profitGrowthPercent, 1),
    playerGrowth,
    playerGrowthPercent: round(playerGrowthPercent, 1),
    marginChange: round(marginChange, 1),
    gamesGrowth,
    gamesGrowthPercent: round(gamesGrowthPercent, 1),
    entriesGrowth,
    entriesGrowthPercent: round(entriesGrowthPercent, 1),
    
    // Efficiency
    avgRevenuePerGame: round(avgRevenuePerGame),
    avgProfitPerGame: round(avgProfitPerGame),
    avgEntriesPerGame: round(avgEntriesPerGame, 1),
    costPerEntry: round(costPerEntry),
    profitPerEntry: round(profitPerEntry),
    
    // Trends
    revenueTrend,
    profitTrend,
    playerTrend,
    marginTrend
  };
}

module.exports = {
  calculateStrategicKPIs,
  sumField,
  calculateGrowthPercent,
  getTrend,
  round
};
