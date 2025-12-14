// services/financialsService.ts
// ===================================================================
// FINANCIALS SERVICE
// ===================================================================
//
// Service for game financial calculations (GameCost, GameFinancialSnapshot).
// Wraps gameFinancialsProcessor Lambda calls.
//
// FEATURES:
// - Preview financial calculations before save
// - Calculate and persist GameCost and GameFinancialSnapshot
// - Format financial data for display
//
// ===================================================================

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import {
  calculateGameFinancialsMutation,
  previewGameFinancialsQuery,
  financialsSummaryLite,
} from '../graphql/enrichmentOperations';
import type {
  CalculateGameFinancialsInput,
  CalculateGameFinancialsOutput,
  GameFinancialsGameInput,
  FinancialsSummary,
  EnrichedGameData,
} from '../types/enrichment';

// ===================================================================
// CORE FINANCIAL FUNCTIONS
// ===================================================================

/**
 * Calculate game financials with preview or save mode
 * 
 * @param input - Financial calculation input
 * @returns Financial calculation result
 * 
 * @example
 * // Preview from enriched game data
 * const preview = await calculateGameFinancials({
 *   game: { id: 'xxx', entityId: 'yyy', ... },
 *   options: { saveToDatabase: false }
 * });
 * 
 * @example
 * // Calculate and save (by gameId)
 * const result = await calculateGameFinancials({
 *   gameId: 'xxx',
 *   options: { saveToDatabase: true }
 * });
 */
export const calculateGameFinancials = async (
  input: CalculateGameFinancialsInput
): Promise<CalculateGameFinancialsOutput> => {
  const client = generateClient();
  
  console.log('[FinancialsService] Calculating financials:', {
    gameId: input.gameId,
    hasGameData: !!input.game,
    saveToDatabase: input.options?.saveToDatabase ?? false,
  });
  
  try {
    const response = await client.graphql({
      query: calculateGameFinancialsMutation,
      variables: { input }
    }) as GraphQLResult<{ calculateGameFinancials: CalculateGameFinancialsOutput }>;
    
    if (response.errors?.length) {
      console.error('[FinancialsService] GraphQL errors:', response.errors);
      throw new Error(response.errors[0]?.message || 'Financial calculation failed');
    }
    
    const result = response.data?.calculateGameFinancials;
    
    if (!result) {
      throw new Error('No response from calculateGameFinancials');
    }
    
    console.log('[FinancialsService] Calculation result:', {
      success: result.success,
      mode: result.mode,
      gameId: result.gameId,
      netProfit: result.summary?.netProfit,
      profitMargin: result.summary?.profitMargin,
      costAction: result.costSaveResult?.action,
      snapshotAction: result.snapshotSaveResult?.action,
      processingTimeMs: result.processingTimeMs,
    });
    
    return result;
    
  } catch (error: any) {
    console.error('[FinancialsService] Error:', error);
    throw new Error(error?.message || 'Financial calculation failed');
  }
};

/**
 * Preview financials without saving
 * Uses query for semantic clarity
 */
export const previewGameFinancials = async (
  input: CalculateGameFinancialsInput
): Promise<CalculateGameFinancialsOutput> => {
  const client = generateClient();
  
  const previewInput: CalculateGameFinancialsInput = {
    ...input,
    options: { saveToDatabase: false }
  };
  
  console.log('[FinancialsService] Previewing financials:', {
    gameId: input.gameId,
    hasGameData: !!input.game,
  });
  
  try {
    const response = await client.graphql({
      query: previewGameFinancialsQuery,
      variables: { input: previewInput }
    }) as GraphQLResult<{ previewGameFinancials: CalculateGameFinancialsOutput }>;
    
    if (response.errors?.length) {
      throw new Error(response.errors[0]?.message || 'Preview failed');
    }
    
    return response.data?.previewGameFinancials!;
    
  } catch (error: any) {
    console.error('[FinancialsService] Preview error:', error);
    throw new Error(error?.message || 'Financial preview failed');
  }
};

/**
 * Quick financial summary (minimal fields)
 * Use for real-time display updates
 */
export const quickFinancialSummary = async (
  input: CalculateGameFinancialsInput
): Promise<FinancialsSummary | null> => {
  const client = generateClient();
  
  const previewInput: CalculateGameFinancialsInput = {
    ...input,
    options: { saveToDatabase: false }
  };
  
  try {
    const response = await client.graphql({
      query: financialsSummaryLite,
      variables: { input: previewInput }
    }) as GraphQLResult<{ calculateGameFinancials: CalculateGameFinancialsOutput }>;
    
    return response.data?.calculateGameFinancials?.summary || null;
    
  } catch (error: any) {
    console.error('[FinancialsService] Quick summary error:', error);
    return null;
  }
};

/**
 * Calculate and save financials for a saved game
 * Use after enrichAndSaveGame() completes
 */
export const saveGameFinancials = async (
  gameId: string
): Promise<CalculateGameFinancialsOutput> => {
  return calculateGameFinancials({
    gameId,
    options: { saveToDatabase: true }
  });
};

// ===================================================================
// CONVERSION HELPERS
// ===================================================================

/**
 * Convert EnrichedGameData to GameFinancialsGameInput
 * Use when you have enriched data and need financial calculations
 */
export const enrichedGameToFinancialsInput = (
  enrichedGame: EnrichedGameData,
  gameId: string,
  entityId: string
): GameFinancialsGameInput => ({
  id: gameId,
  entityId,
  venueId: enrichedGame.venueId,
  
  // Entry data
  totalEntries: enrichedGame.totalEntries,
  totalUniquePlayers: enrichedGame.totalUniquePlayers,
  totalInitialEntries: enrichedGame.totalInitialEntries,
  totalRebuys: enrichedGame.totalRebuys,
  totalAddons: enrichedGame.totalAddons,
  
  // Financial inputs
  buyIn: enrichedGame.buyIn,
  rake: enrichedGame.rake,
  venueFee: enrichedGame.venueFee,
  guaranteeAmount: enrichedGame.guaranteeAmount,
  hasGuarantee: enrichedGame.hasGuarantee,
  
  // Pre-calculated (from enricher)
  rakeRevenue: enrichedGame.rakeRevenue,
  totalBuyInsCollected: enrichedGame.totalBuyInsCollected,
  prizepoolPlayerContributions: enrichedGame.prizepoolPlayerContributions,
  prizepoolAddedValue: enrichedGame.prizepoolAddedValue,
  prizepoolSurplus: enrichedGame.prizepoolSurplus,
  guaranteeOverlayCost: enrichedGame.guaranteeOverlayCost,
  gameProfit: enrichedGame.gameProfit,
  
  // Results
  prizepoolPaid: enrichedGame.prizepoolPaid,
  prizepoolCalculated: enrichedGame.prizepoolCalculated ?? undefined,
  
  // Timing
  gameStartDateTime: enrichedGame.gameStartDateTime,
  gameEndDateTime: enrichedGame.gameEndDateTime,
  
  // Classification
  gameType: enrichedGame.gameType,
  tournamentType: enrichedGame.tournamentType,
  gameStatus: enrichedGame.gameStatus,
});

/**
 * Preview financials from enriched game data
 * Convenience wrapper for common use case
 */
export const previewFinancialsFromEnrichedGame = async (
  enrichedGame: EnrichedGameData,
  gameId: string,
  entityId: string
): Promise<CalculateGameFinancialsOutput> => {
  const input: CalculateGameFinancialsInput = {
    game: enrichedGameToFinancialsInput(enrichedGame, gameId, entityId),
    options: { saveToDatabase: false }
  };
  
  return calculateGameFinancials(input);
};

// ===================================================================
// FORMATTING HELPERS
// ===================================================================

/**
 * Format currency value for display
 */
export const formatCurrency = (value?: number | null): string => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Format percentage for display
 */
export const formatPercentage = (value?: number | null): string => {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
};

/**
 * Format per-player metric
 */
export const formatPerPlayer = (value?: number | null): string => {
  if (value === null || value === undefined) return '-';
  return formatCurrency(value) + '/player';
};

/**
 * Get profit status color class
 */
export const getProfitColorClass = (netProfit?: number | null): string => {
  if (netProfit === null || netProfit === undefined) return 'text-gray-500';
  if (netProfit > 0) return 'text-green-600';
  if (netProfit < 0) return 'text-red-600';
  return 'text-gray-600';
};

/**
 * Get guarantee status
 */
export const getGuaranteeStatus = (
  summary?: FinancialsSummary | null
): { label: string; colorClass: string; icon: string } => {
  if (!summary) {
    return { label: 'Unknown', colorClass: 'text-gray-500', icon: '❓' };
  }
  
  if (summary.guaranteeMet) {
    return { label: 'Met', colorClass: 'text-green-600', icon: '✅' };
  }
  
  const overlay = summary.guaranteeOverlayCost || 0;
  if (overlay > 0) {
    return { 
      label: `Overlay: ${formatCurrency(overlay)}`, 
      colorClass: 'text-red-600', 
      icon: '⚠️' 
    };
  }
  
  return { label: 'No Guarantee', colorClass: 'text-gray-500', icon: '—' };
};

/**
 * Build display-ready financial summary
 */
export const buildFinancialDisplay = (
  result?: CalculateGameFinancialsOutput | null
): {
  revenue: { label: string; value: string; subValue?: string };
  costs: { label: string; value: string; subValue?: string };
  profit: { label: string; value: string; colorClass: string };
  margin: { label: string; value: string };
  guarantee: { label: string; value: string; colorClass: string };
  perPlayer: { label: string; value: string };
} => {
  const s = result?.summary;
  
  return {
    revenue: {
      label: 'Total Revenue',
      value: formatCurrency(s?.totalRevenue),
      subValue: s?.rakeRevenue ? `Rake: ${formatCurrency(s.rakeRevenue)}` : undefined,
    },
    costs: {
      label: 'Total Costs',
      value: formatCurrency(s?.totalCost),
      subValue: s?.totalDealerCost ? `Dealers: ${formatCurrency(s.totalDealerCost)}` : undefined,
    },
    profit: {
      label: 'Net Profit',
      value: formatCurrency(s?.netProfit),
      colorClass: getProfitColorClass(s?.netProfit),
    },
    margin: {
      label: 'Profit Margin',
      value: formatPercentage(s?.profitMargin),
    },
    guarantee: {
      ...getGuaranteeStatus(s),
      value: getGuaranteeStatus(s).label,
    },
    perPlayer: {
      label: 'Profit/Player',
      value: formatPerPlayer(s?.profitPerPlayer),
    },
  };
};

// ===================================================================
// RESULT HELPERS
// ===================================================================

/**
 * Check if financial calculation was successful
 */
export const isFinancialsSuccessful = (
  result: CalculateGameFinancialsOutput
): boolean => {
  return result.success && !result.error;
};

/**
 * Check if financial save was successful
 */
export const isFinancialsSaveSuccessful = (
  result: CalculateGameFinancialsOutput
): boolean => {
  return result.success && 
         result.mode === 'SAVE' &&
         (result.costSaveResult?.action === 'CREATED' || 
          result.costSaveResult?.action === 'UPDATED') &&
         (result.snapshotSaveResult?.action === 'CREATED' || 
          result.snapshotSaveResult?.action === 'UPDATED');
};

/**
 * Get error message from financial result
 */
export const getFinancialsErrorMessage = (
  result: CalculateGameFinancialsOutput
): string | null => {
  if (result.success && !result.error) return null;
  
  if (result.error) return result.error;
  
  if (result.costSaveResult?.error) {
    return `Cost save failed: ${result.costSaveResult.error}`;
  }
  
  if (result.snapshotSaveResult?.error) {
    return `Snapshot save failed: ${result.snapshotSaveResult.error}`;
  }
  
  return 'Financial calculation failed';
};

// ===================================================================
// BATCH OPERATIONS
// ===================================================================

/**
 * Calculate financials for multiple games
 * Processes sequentially to avoid rate limits
 */
export const batchCalculateFinancials = async (
  gameIds: string[],
  options?: { saveToDatabase?: boolean; onProgress?: (current: number, total: number) => void }
): Promise<{
  results: Map<string, CalculateGameFinancialsOutput>;
  succeeded: string[];
  failed: string[];
}> => {
  const results = new Map<string, CalculateGameFinancialsOutput>();
  const succeeded: string[] = [];
  const failed: string[] = [];
  
  for (let i = 0; i < gameIds.length; i++) {
    const gameId = gameIds[i];
    
    options?.onProgress?.(i + 1, gameIds.length);
    
    try {
      const result = await calculateGameFinancials({
        gameId,
        options: { saveToDatabase: options?.saveToDatabase ?? false }
      });
      
      results.set(gameId, result);
      
      if (result.success) {
        succeeded.push(gameId);
      } else {
        failed.push(gameId);
      }
    } catch (error) {
      failed.push(gameId);
      console.error(`[FinancialsService] Failed for ${gameId}:`, error);
    }
    
    // Small delay between requests
    if (i < gameIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return { results, succeeded, failed };
};
