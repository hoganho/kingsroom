/**
 * financials.js
 * Financial metric calculations for games
 * 
 * VERSION 2.0.0 - Separated overlay cost from promotional added value
 * 
 * ENHANCED: Smart guarantee inference from prizepoolPaid
 * 
 * SIMPLIFIED MODEL:
 *   Revenue: rakeRevenue = rake × entriesForRake
 *   Cost: guaranteeOverlayCost = max(0, guarantee - playerContributions)
 *   Profit: gameProfit = rakeRevenue - guaranteeOverlayCost
 * 
 * CRITICAL DISTINCTION:
 *   - guaranteeOverlayCost: Cost to venue from not meeting guarantee (goes to totalCost)
 *   - prizepoolAddedValue: Promotional added value (e.g., "+$5k added prizepool bonus")
 *   
 *   These are SEPARATE concepts:
 *   - Overlay is an UNPLANNED cost when guarantee isn't met
 *   - Added value is a PLANNED promotional expense to attract players
 * 
 * GUARANTEE INFERENCE:
 *   If prizepoolPaid > prizepoolPlayerContributions (even by $1),
 *   the venue clearly paid an overlay to meet a guarantee.
 *   We infer the guarantee from the actual payout.
 * 
 * Example:
 *   - 8 players × ($150 buy-in - $25 rake) = $1,000 player contributions
 *   - prizepoolPaid = $6,000 (scraped from results)
 *   - Discrepancy = $5,000 → obvious overlay → guarantee was $6,000
 */

// ===================================================================
// CONSTANTS
// ===================================================================

// Minimum discrepancy to infer a guarantee (accounts for minor rounding only)
// Any meaningful difference indicates a guarantee
const GUARANTEE_INFERENCE_MIN_DISCREPANCY = 1; // $1 minimum

// ===================================================================
// GUARANTEE INFERENCE
// ===================================================================

/**
 * Infer guarantee from actual payout data
 * 
 * If prizepoolPaid exceeds player contributions at all,
 * the venue clearly paid an overlay to meet a guarantee.
 * 
 * @param {Object} gameData - Game data including prizepoolPaid
 * @param {number} prizepoolPlayerContributions - Calculated player contributions
 * @returns {Object|null} Inferred guarantee data or null
 */
const inferGuaranteeFromPayout = (gameData, prizepoolPlayerContributions) => {
  const { prizepoolPaid, hasGuarantee, guaranteeAmount } = gameData;
  
  // Skip if already has valid guarantee data
  if (hasGuarantee === true && guaranteeAmount > 0) {
    return null;
  }
  
  // Skip if no prizepoolPaid data
  if (!prizepoolPaid || prizepoolPaid <= 0) {
    return null;
  }
  
  // Skip if no player contributions to compare
  if (!prizepoolPlayerContributions || prizepoolPlayerContributions <= 0) {
    return null;
  }
  
  // Calculate discrepancy
  const discrepancy = prizepoolPaid - prizepoolPlayerContributions;
  
  // If payout exceeds contributions by any meaningful amount, there was a guarantee
  if (discrepancy >= GUARANTEE_INFERENCE_MIN_DISCREPANCY) {
    console.log(`[FINANCIALS] 💡 Inferring guarantee from prizepoolPaid:`, {
      prizepoolPaid,
      prizepoolPlayerContributions,
      discrepancy,
      inferredGuarantee: prizepoolPaid,
      reason: 'Payout exceeds player contributions - venue paid overlay'
    });
    
    return {
      hasGuarantee: true,
      guaranteeAmount: prizepoolPaid, // Guarantee was at least the amount paid
      inferredOverlay: discrepancy,
      wasInferred: true
    };
  }
  
  return null;
};

// ===================================================================
// MAIN CALCULATION FUNCTION
// ===================================================================

/**
 * Calculate all financial metrics for a game
 * 
 * ENHANCED v2.0.0:
 * - SEPARATED guaranteeOverlayCost (unplanned cost) from prizepoolAddedValue (promotional)
 * - prizepoolAddedValue only set from explicit input, NOT from overlay calculation
 * - guaranteeOverlayCost flows to totalCost calculations via totalGuaranteeOverlayCost
 * 
 * - Now infers guarantee from prizepoolPaid if not explicitly set
 * - Jackpot contribution calculations (deducted from prizepool)
 * - Accumulator ticket payout calculations
 * - Prizepool delta calculation (rounding adjustments)
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
    guaranteeAmount: inputGuaranteeAmount = 0,
    hasGuarantee: inputHasGuarantee,
    prizepoolPaid,
    
    // Promotional added value (explicit input, NOT derived from overlay)
    prizepoolAddedValue: inputPrizepoolAddedValue = 0,
    
    // Jackpot contributions (inherited from RecurringGame)
    hasJackpotContributions = false,
    jackpotContributionAmount = 0,
    
    // Accumulator tickets (inherited from RecurringGame)
    hasAccumulatorTickets = false,
    accumulatorTicketValue = 100,
    numberOfAccumulatorTicketsPaid: inputNumberOfAccumulatorTicketsPaid,
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
  // JACKPOT CONTRIBUTIONS
  // ===================================================================
  
  const jackpotPerEntry = hasJackpotContributions ? (jackpotContributionAmount || 2) : 0;
  const prizepoolJackpotContributions = jackpotPerEntry * totalEntries;
  result.prizepoolJackpotContributions = prizepoolJackpotContributions;
  result.hasJackpotContributions = hasJackpotContributions;
  result.jackpotContributionAmount = jackpotContributionAmount;
  
  // ===================================================================
  // ACCUMULATOR TICKET PAYOUTS
  // ===================================================================
  
  let numberOfAccumulatorTicketsPaid = 0;
  let prizepoolAccumulatorTicketPayoutEstimate = 0;
  
  if (hasAccumulatorTickets) {
    numberOfAccumulatorTicketsPaid = inputNumberOfAccumulatorTicketsPaid ?? Math.floor(totalEntries * 0.10);
    prizepoolAccumulatorTicketPayoutEstimate = numberOfAccumulatorTicketsPaid * accumulatorTicketValue;
  }
  
  result.hasAccumulatorTickets = hasAccumulatorTickets;
  result.accumulatorTicketValue = accumulatorTicketValue;
  result.numberOfAccumulatorTicketsPaid = numberOfAccumulatorTicketsPaid;
  result.prizepoolAccumulatorTicketPayoutEstimate = prizepoolAccumulatorTicketPayoutEstimate;
  result.prizepoolAccumulatorTicketPayoutActual = null; // Manual entry only
  
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
  // PRIZEPOOL - What players receive (accounts for jackpot deduction)
  // ===================================================================
  
  // Prizepool from entries and rebuys (buy-in minus rake minus jackpot)
  const prizepoolFromEntriesAndRebuys = (buyIn - rake - jackpotPerEntry) * entriesForRake;
  
  // Prizepool from addons (full buy-in minus jackpot, no rake)
  const prizepoolFromAddons = (buyIn - jackpotPerEntry) * totalAddons;
  
  // Total player contributions to prizepool (AFTER jackpot deduction)
  const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
  result.prizepoolPlayerContributions = prizepoolPlayerContributions;
  
  // ===================================================================
  // GUARANTEE - Explicit or Inferred from Payout
  // ===================================================================
  
  let hasGuarantee = inputHasGuarantee;
  let guaranteeAmount = inputGuaranteeAmount;
  let guaranteeWasInferred = false;
  
  // Try to infer guarantee from prizepoolPaid if not explicitly set
  const inferred = inferGuaranteeFromPayout(gameData, prizepoolPlayerContributions);
  
  if (inferred) {
    hasGuarantee = inferred.hasGuarantee;
    guaranteeAmount = inferred.guaranteeAmount;
    guaranteeWasInferred = true;
    
    // Include inference metadata in result
    result.guaranteeWasInferred = true;
    result.inferredGuaranteeAmount = inferred.guaranteeAmount;
    result.hasGuarantee = true;
    result.guaranteeAmount = inferred.guaranteeAmount;
  }
  
  // ===================================================================
  // GUARANTEE IMPACT - OVERLAY COST
  // ===================================================================
  
  let guaranteeOverlayCost = 0;
  let prizepoolSurplus = null;
  
  const isGuaranteed = hasGuarantee && guaranteeAmount > 0;
  
  if (isGuaranteed) {
    const shortfall = guaranteeAmount - prizepoolPlayerContributions;
    
    if (shortfall > 0) {
      // Guarantee not met - house pays overlay
      // This is an UNPLANNED COST, NOT promotional added value
      guaranteeOverlayCost = shortfall;
      prizepoolSurplus = null;
    } else {
      // Guarantee exceeded - surplus goes to players
      prizepoolSurplus = -shortfall;
      guaranteeOverlayCost = 0;
    }
  }
  
  result.guaranteeOverlayCost = guaranteeOverlayCost;
  result.prizepoolSurplus = prizepoolSurplus;
  
  // ===================================================================
  // PRIZEPOOL ADDED VALUE - PROMOTIONAL (SEPARATE FROM OVERLAY)
  // ===================================================================
  
  // prizepoolAddedValue is ONLY set from explicit input
  // It represents PLANNED promotional expenses like "+$5k added prizepool bonus"
  // It is NOT the same as overlay cost (which is unplanned)
  const prizepoolAddedValue = inputPrizepoolAddedValue || 0;
  result.prizepoolAddedValue = prizepoolAddedValue;
  
  // ===================================================================
  // PROFIT
  // ===================================================================
  
  // Simple profit calculation: revenue - cost
  // NOTE: guaranteeOverlayCost is already included as a cost
  const gameProfit = rakeRevenue - guaranteeOverlayCost;
  result.gameProfit = gameProfit;
  
  // ===================================================================
  // CALCULATED PRIZEPOOL & DELTA
  // ===================================================================
  
  // Calculate prizepool = player contributions + overlay + promotional added value
  const prizepoolCalculated = prizepoolPlayerContributions + guaranteeOverlayCost + prizepoolAddedValue;
  result.prizepoolCalculated = prizepoolCalculated;
  
  // Delta = what we actually paid vs what we calculated (rounding adjustments)
  const prizepoolPaidDelta = (prizepoolPaid || 0) - prizepoolCalculated;
  result.prizepoolPaidDelta = prizepoolPaidDelta;
  
  // ===================================================================
  // LOGGING
  // ===================================================================
  
  if (guaranteeWasInferred) {
    console.log(`[FINANCIALS] ⚠️ Guarantee INFERRED from payout data:`, {
      prizepoolPaid,
      prizepoolPlayerContributions,
      inferredGuarantee: guaranteeAmount,
      guaranteeOverlayCost,
      rakeRevenue,
      gameProfit,
      isUnderwater: gameProfit < 0
    });
  }
  
  if (guaranteeOverlayCost > 0) {
    console.log(`[FINANCIALS] 💰 Overlay cost: $${guaranteeOverlayCost} (guarantee: $${guaranteeAmount}, contributions: $${prizepoolPlayerContributions})`);
  }
  
  if (prizepoolAddedValue > 0) {
    console.log(`[FINANCIALS] 🎁 Promotional added value: $${prizepoolAddedValue}`);
  }
  
  if (hasJackpotContributions) {
    console.log(`[FINANCIALS] 🎰 Jackpot contributions: $${prizepoolJackpotContributions} ($${jackpotPerEntry} × ${totalEntries} entries)`);
  }
  
  if (hasAccumulatorTickets) {
    console.log(`[FINANCIALS] 🎫 Accumulator tickets: ${numberOfAccumulatorTicketsPaid} @ $${accumulatorTicketValue} = $${prizepoolAccumulatorTicketPayoutEstimate}`);
  }
  
  if (prizepoolPaidDelta !== 0) {
    console.log(`[FINANCIALS] 📊 Prizepool delta (rounding): $${prizepoolPaidDelta}`);
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
const calculatePrizepoolPlayerContributions = (buyIn, rake, totalInitialEntries, totalRebuys, totalAddons, jackpotPerEntry = 0) => {
  const entriesForRake = (totalInitialEntries || 0) + (totalRebuys || 0);
  const prizepoolFromEntriesAndRebuys = ((buyIn || 0) - (rake || 0) - jackpotPerEntry) * entriesForRake;
  const prizepoolFromAddons = ((buyIn || 0) - jackpotPerEntry) * (totalAddons || 0);
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
  return gameData.buyIn !== undefined && gameData.buyIn !== null && gameData.buyIn > 0;
};

/**
 * Get a summary of financial health
 */
const getFinancialSummary = (gameData) => {
  const financials = calculateFinancials(gameData);
  
  const hasGuarantee = financials.hasGuarantee ?? gameData.hasGuarantee;
  const guaranteeAmount = financials.guaranteeAmount ?? gameData.guaranteeAmount;
  
  return {
    ...financials,
    profitMargin: financials.rakeRevenue > 0 
      ? (financials.gameProfit / financials.rakeRevenue * 100).toFixed(1) + '%'
      : 'N/A',
    guaranteeMet: hasGuarantee && guaranteeAmount > 0
      ? financials.guaranteeOverlayCost === 0
      : null,
    isUnderwater: financials.gameProfit < 0
  };
};

/**
 * Detect if game likely had a guarantee based on payout data
 */
const detectLikelyGuarantee = (gameData) => {
  const prizepoolPlayerContributions = calculatePrizepoolPlayerContributions(
    gameData.buyIn,
    gameData.rake,
    gameData.totalInitialEntries,
    gameData.totalRebuys,
    gameData.totalAddons
  );
  
  const inferred = inferGuaranteeFromPayout(gameData, prizepoolPlayerContributions);
  
  if (inferred) {
    return {
      likelyHadGuarantee: true,
      inferredAmount: inferred.guaranteeAmount,
      inferredOverlay: inferred.inferredOverlay,
      prizepoolPaid: gameData.prizepoolPaid,
      prizepoolPlayerContributions,
      discrepancy: gameData.prizepoolPaid - prizepoolPlayerContributions
    };
  }
  
  return {
    likelyHadGuarantee: false,
    prizepoolPaid: gameData.prizepoolPaid,
    prizepoolPlayerContributions,
    discrepancy: (gameData.prizepoolPaid || 0) - prizepoolPlayerContributions
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
  getFinancialSummary,
  inferGuaranteeFromPayout,
  detectLikelyGuarantee,
  GUARANTEE_INFERENCE_MIN_DISCREPANCY
};