/**
 * financials.js
 * Financial metric calculations for games
 * 
 * SIMPLIFIED MODEL:
 *   Revenue: rakeRevenue = rake × entriesForRake
 *   Cost: guaranteeOverlayCost = max(0, guarantee - playerContributions)
 *   Profit: gameProfit = rakeRevenue - guaranteeOverlayCost
 */

// ===================================================================
// MAIN CALCULATION FUNCTION
// ===================================================================

/**
 * Calculate all financial metrics for a game
 * 
 * @param {Object} gameData - Game data object with financial inputs
 * @returns {Object} Calculated financial fields
 */
const calculateFinancials = (gameData) => {
  const {
    buyIn = 0,
    rake = 0,
    totalInitialEntries = 0,
    totalRebuys = 0,
    totalAddons = 0,
    totalEntries: inputTotalEntries,
    guaranteeAmount = 0,
    hasGuarantee
  } = gameData;
  
  const result = {};
  
  // ===================================================================
  // ENTRIES
  // ===================================================================
  
  // Derive totalEntries if not set
  const calculatedTotalEntries = totalInitialEntries + totalRebuys + totalAddons;
  const totalEntries = inputTotalEntries || calculatedTotalEntries;
  result.totalEntries = totalEntries;
  
  // Entries that pay rake (initial entries + rebuys, NOT addons)
  // Addons go 100% to prizepool - no rake on addons
  const entriesForRake = totalInitialEntries + totalRebuys;
  
  // ===================================================================
  // REVENUE - What we collect
  // ===================================================================
  
  // Rake revenue from entries and rebuys
  const rakeRevenue = rake * entriesForRake;
  result.rakeRevenue = rakeRevenue;
  
  // Total buy-ins collected (all money from players)
  const totalBuyInsCollected = buyIn * totalEntries;
  result.totalBuyInsCollected = totalBuyInsCollected;
  
  // ===================================================================
  // PRIZEPOOL - What players receive
  // ===================================================================
  
  // Prizepool from entries and rebuys (buy-in minus rake)
  const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
  
  // Prizepool from addons (full buy-in, no rake)
  const prizepoolFromAddons = buyIn * totalAddons;
  
  // Total player contributions to prizepool
  const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
  result.prizepoolPlayerContributions = prizepoolPlayerContributions;
  
  // ===================================================================
  // GUARANTEE IMPACT
  // ===================================================================
  
  let guaranteeOverlayCost = 0;
  let prizepoolSurplus = null;
  let prizepoolAddedValue = 0;
  
  const isGuaranteed = hasGuarantee && guaranteeAmount > 0;
  
  if (isGuaranteed) {
    const shortfall = guaranteeAmount - prizepoolPlayerContributions;
    
    if (shortfall > 0) {
      // Guarantee not met - house pays overlay
      guaranteeOverlayCost = shortfall;
      prizepoolAddedValue = shortfall;
      prizepoolSurplus = null;
    } else {
      // Guarantee exceeded - surplus goes to players
      prizepoolSurplus = -shortfall;
      prizepoolAddedValue = 0;
      guaranteeOverlayCost = 0;
    }
  }
  
  result.guaranteeOverlayCost = guaranteeOverlayCost;
  result.prizepoolAddedValue = prizepoolAddedValue;
  result.prizepoolSurplus = prizepoolSurplus;
  
  // ===================================================================
  // PROFIT
  // ===================================================================
  
  // Simple profit calculation: revenue - cost
  const gameProfit = rakeRevenue - guaranteeOverlayCost;
  result.gameProfit = gameProfit;
  
  // ===================================================================
  // CALCULATED PRIZEPOOL
  // ===================================================================
  
  // Calculate prizepool if not set
  if (!gameData.prizepoolCalculated && prizepoolPlayerContributions > 0) {
    result.prizepoolCalculated = prizepoolPlayerContributions + prizepoolAddedValue;
  }
  
  return result;
};

// ===================================================================
// INDIVIDUAL CALCULATIONS (for partial recalculation)
// ===================================================================

/**
 * Calculate rake revenue
 */
const calculateRakeRevenue = (rake, totalInitialEntries, totalRebuys) => {
  const entriesForRake = (totalInitialEntries || 0) + (totalRebuys || 0);
  return (rake || 0) * entriesForRake;
};

/**
 * Calculate player contributions to prizepool
 */
const calculatePrizepoolPlayerContributions = (buyIn, rake, totalInitialEntries, totalRebuys, totalAddons) => {
  const entriesForRake = (totalInitialEntries || 0) + (totalRebuys || 0);
  const prizepoolFromEntriesAndRebuys = ((buyIn || 0) - (rake || 0)) * entriesForRake;
  const prizepoolFromAddons = (buyIn || 0) * (totalAddons || 0);
  return prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
};

/**
 * Calculate guarantee overlay cost
 */
const calculateGuaranteeOverlayCost = (guaranteeAmount, prizepoolPlayerContributions) => {
  if (!guaranteeAmount || guaranteeAmount <= 0) return 0;
  const shortfall = guaranteeAmount - (prizepoolPlayerContributions || 0);
  return Math.max(0, shortfall);
};

/**
 * Calculate game profit
 */
const calculateGameProfit = (rakeRevenue, guaranteeOverlayCost) => {
  return (rakeRevenue || 0) - (guaranteeOverlayCost || 0);
};

// ===================================================================
// VALIDATION HELPERS
// ===================================================================

/**
 * Check if financial calculations would produce valid results
 */
const canCalculateFinancials = (gameData) => {
  // Need at least buy-in to calculate anything meaningful
  return gameData.buyIn !== undefined && gameData.buyIn !== null && gameData.buyIn > 0;
};

/**
 * Get a summary of financial health
 */
const getFinancialSummary = (gameData) => {
  const financials = calculateFinancials(gameData);
  
  return {
    ...financials,
    profitMargin: financials.rakeRevenue > 0 
      ? (financials.gameProfit / financials.rakeRevenue * 100).toFixed(1) + '%'
      : 'N/A',
    guaranteeMet: gameData.hasGuarantee && gameData.guaranteeAmount > 0
      ? financials.guaranteeOverlayCost === 0
      : null,
    isUnderwater: financials.gameProfit < 0
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  calculateFinancials,
  calculateRakeRevenue,
  calculatePrizepoolPlayerContributions,
  calculateGuaranteeOverlayCost,
  calculateGameProfit,
  canCalculateFinancials,
  getFinancialSummary
};
