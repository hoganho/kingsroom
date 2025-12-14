// src/hooks/useFinancialsPreview.ts
// ===================================================================
// FINANCIALS PREVIEW HOOK
// ===================================================================
//
// Preview hook for gameFinancialsProcessor - follows same pattern as
// useConsolidationPreview and useEnrichmentPreview.
//
// Shows users calculated costs and profit metrics BEFORE saving.
//
// USAGE:
// const { summary, isLoading, netProfit, guaranteeMet } = useFinancialsPreview(gameData, {
//   entityId: 'xxx',
//   venueId: 'yyy',
//   debounceMs: 500,
// });
//
// ===================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData } from '../../types/game';
import type {
  CalculateGameFinancialsOutput,
  FinancialsSummary,
  GameCostCalculation,
  GameFinancialSnapshotCalculation,
} from '../../types/enrichment';

// ===================================================================
// GRAPHQL QUERY (Preview mode only)
// ===================================================================

const financialsPreviewQuery = /* GraphQL */ `
  mutation CalculateGameFinancialsPreview($input: CalculateGameFinancialsInput!) {
    calculateGameFinancials(input: $input) {
      success
      gameId
      mode
      
      summary {
        totalRevenue
        rakeRevenue
        totalBuyInsCollected
        totalCost
        totalDealerCost
        prizepoolTotal
        prizepoolPlayerContributions
        prizepoolAddedValue
        guaranteeMet
        guaranteeOverlayCost
        guaranteeCoverageRate
        gameProfit
        netProfit
        profitMargin
        revenuePerPlayer
        costPerPlayer
        profitPerPlayer
        rakePerEntry
      }
      
      calculatedCost {
        totalDealerCost
        totalTournamentDirectorCost
        totalFloorStaffCost
        totalCost
        dealerRatePerEntry
        entriesUsedForCalculation
      }
      
      calculatedSnapshot {
        totalRevenue
        rakeRevenue
        venueFee
        prizepoolTotal
        prizepoolSurplus
        guaranteeOverlayCost
        guaranteeCoverageRate
        guaranteeMet
        totalCost
        totalDealerCost
        totalStaffCost
        gameProfit
        netProfit
        profitMargin
        revenuePerPlayer
        costPerPlayer
        profitPerPlayer
        rakePerEntry
        gameDurationMinutes
      }
      
      processingTimeMs
      error
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

export interface UseFinancialsPreviewOptions {
  /** Required: Entity ID */
  entityId: string;
  
  /** Optional: Venue ID (for cost lookups) */
  venueId?: string | null;
  
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs?: number;
  
  /** Pre-calculated financials from enrichment (if available) */
  enrichedFinancials?: {
    rakeRevenue?: number | null;
    totalBuyInsCollected?: number | null;
    prizepoolPlayerContributions?: number | null;
    prizepoolAddedValue?: number | null;
    prizepoolSurplus?: number | null;
    guaranteeOverlayCost?: number | null;
    gameProfit?: number | null;
  };
  
  /** Callback when preview completes */
  onPreviewComplete?: (result: CalculateGameFinancialsOutput) => void;
  
  /** Callback when preview errors */
  onPreviewError?: (error: Error) => void;
}

export interface UseFinancialsPreviewReturn {
  /** Full preview result */
  preview: CalculateGameFinancialsOutput | null;
  
  /** Financial summary (convenience accessor) */
  summary: FinancialsSummary | null;
  
  /** Calculated costs (convenience accessor) */
  costs: GameCostCalculation | null;
  
  /** Calculated snapshot (convenience accessor) */
  snapshot: GameFinancialSnapshotCalculation | null;
  
  /** Whether the preview is currently loading */
  isLoading: boolean;
  
  /** Error if the preview failed */
  error: Error | null;
  
  /** Manually trigger a preview refresh */
  refresh: () => void;
  
  /** Clear the current preview */
  clear: () => void;
  
  // Convenience accessors for common metrics
  /** Net profit after all costs */
  netProfit: number | null;
  
  /** Profit margin percentage (0-1) */
  profitMargin: number | null;
  
  /** Whether guarantee was met */
  guaranteeMet: boolean | null;
  
  /** Guarantee overlay cost (if any) */
  guaranteeOverlayCost: number | null;
  
  /** Total dealer cost */
  dealerCost: number | null;
  
  /** Profit per player */
  profitPerPlayer: number | null;
  
  /** Whether calculation was successful */
  isValid: boolean;
}

// Re-export types
export type {
  CalculateGameFinancialsOutput,
  FinancialsSummary,
  GameCostCalculation,
  GameFinancialSnapshotCalculation,
};

// ===================================================================
// LAZY CLIENT INITIALIZATION
// ===================================================================

let clientInstance: any = null;

const getClient = () => {
  if (!clientInstance) {
    clientInstance = generateClient();
  }
  return clientInstance;
};

// ===================================================================
// ERROR PARSING HELPER
// ===================================================================

const parseGraphQLError = (err: unknown): Error => {
  if (err instanceof Error) return err;
  
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    
    if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
      const firstError = errObj.errors[0] as Record<string, unknown>;
      return new Error(String(firstError.message || 'Unknown GraphQL error'));
    }
    
    if (typeof errObj.message === 'string') {
      return new Error(errObj.message);
    }
  }
  
  return new Error(String(err));
};

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

/**
 * Hook to preview game financial calculations before saving.
 * 
 * This hook calls gameFinancialsProcessor with saveToDatabase: false
 * to show users the calculated costs and profit metrics.
 * 
 * @example
 * ```tsx
 * const { summary, isLoading, netProfit, guaranteeMet } = useFinancialsPreview(editedData, {
 *   entityId: currentEntity.id,
 *   venueId: selectedVenueId,
 * });
 * 
 * if (summary) {
 *   console.log(`Net Profit: $${netProfit}, Margin: ${(summary.profitMargin * 100).toFixed(1)}%`);
 * }
 * ```
 */
export const useFinancialsPreview = (
  gameData: Partial<GameData> | null,
  options: UseFinancialsPreviewOptions
): UseFinancialsPreviewReturn => {
  const {
    entityId,
    venueId,
    debounceMs = 500,
    enrichedFinancials,
    onPreviewComplete,
    onPreviewError,
  } = options;

  // State
  const [preview, setPreview] = useState<CalculateGameFinancialsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const onPreviewCompleteRef = useRef(onPreviewComplete);
  const onPreviewErrorRef = useRef(onPreviewError);
  onPreviewCompleteRef.current = onPreviewComplete;
  onPreviewErrorRef.current = onPreviewError;

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedInputRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  /**
   * Extract fields needed for financial calculation
   */
  const extractFinancialsInput = useCallback((data: Partial<GameData>) => {
    return {
      game: {
        id: (data as any).id || `preview-${Date.now()}`,
        entityId,
        venueId: venueId || (data as any).venueId || null,
        
        // Entry data
        totalEntries: data.totalEntries ?? 0,
        totalUniquePlayers: data.totalUniquePlayers ?? 0,
        totalInitialEntries: data.totalInitialEntries ?? 0,
        totalRebuys: data.totalRebuys ?? 0,
        totalAddons: data.totalAddons ?? 0,
        
        // Financial inputs
        buyIn: data.buyIn ?? 0,
        rake: data.rake ?? 0,
        venueFee: (data as any).venueFee ?? null,
        guaranteeAmount: data.guaranteeAmount ?? 0,
        hasGuarantee: data.hasGuarantee ?? false,
        
        // Pre-calculated from enricher (if available)
        rakeRevenue: enrichedFinancials?.rakeRevenue ?? null,
        totalBuyInsCollected: enrichedFinancials?.totalBuyInsCollected ?? null,
        prizepoolPlayerContributions: enrichedFinancials?.prizepoolPlayerContributions ?? null,
        prizepoolAddedValue: enrichedFinancials?.prizepoolAddedValue ?? null,
        prizepoolSurplus: enrichedFinancials?.prizepoolSurplus ?? null,
        guaranteeOverlayCost: enrichedFinancials?.guaranteeOverlayCost ?? null,
        gameProfit: enrichedFinancials?.gameProfit ?? null,
        
        // Results
        prizepoolPaid: data.prizepoolPaid ?? 0,
        prizepoolCalculated: data.prizepoolCalculated ?? 0,
        
        // Timing
        gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
        gameEndDateTime: data.gameEndDateTime || null,
        
        // Classification
        gameType: data.gameType || 'TOURNAMENT',
        tournamentType: (data as any).tournamentType || null,
        gameStatus: data.gameStatus || 'SCHEDULED',
      },
      options: {
        saveToDatabase: false, // PREVIEW ONLY
      },
    };
  }, [entityId, venueId, enrichedFinancials]);

  /**
   * Generate stable hash for deduplication
   */
  const getInputHash = useCallback((data: Partial<GameData>): string => {
    return JSON.stringify({
      entityId,
      venueId,
      buyIn: data.buyIn,
      rake: data.rake,
      totalEntries: data.totalEntries,
      totalUniquePlayers: data.totalUniquePlayers,
      hasGuarantee: data.hasGuarantee,
      guaranteeAmount: data.guaranteeAmount,
      prizepoolPaid: data.prizepoolPaid,
      venueFee: (data as any).venueFee,
      // Include enriched financials in hash
      enrichedRakeRevenue: enrichedFinancials?.rakeRevenue,
      enrichedGameProfit: enrichedFinancials?.gameProfit,
    });
  }, [entityId, venueId, enrichedFinancials]);

  /**
   * Fetch financials preview
   */
  const fetchPreview = useCallback(async (data: Partial<GameData>, forceRefresh = false) => {
    const currentRequestId = ++requestIdRef.current;

    // Need at least entries and buy-in for meaningful calculation
    if (!entityId || (!data.totalEntries && !data.totalUniquePlayers)) {
      setPreview(null);
      lastFetchedInputRef.current = null;
      return;
    }

    // Check for duplicate
    const inputHash = getInputHash(data);
    if (!forceRefresh && inputHash === lastFetchedInputRef.current) {
      console.log('[FinancialsPreview] Skipping duplicate request');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const input = extractFinancialsInput(data);
      console.log('[FinancialsPreview] Fetching preview:', {
        entries: data.totalEntries,
        buyIn: data.buyIn,
        rake: data.rake,
      });

      const result = await getClient().graphql({
        query: financialsPreviewQuery,
        variables: { input },
      }) as { data: { calculateGameFinancials: CalculateGameFinancialsOutput } };

      if (currentRequestId === requestIdRef.current) {
        const previewResult = result.data.calculateGameFinancials;
        setPreview(previewResult);
        lastFetchedInputRef.current = inputHash;
        onPreviewCompleteRef.current?.(previewResult);

        console.log('[FinancialsPreview] Result:', {
          success: previewResult.success,
          netProfit: previewResult.summary?.netProfit,
          profitMargin: previewResult.summary?.profitMargin,
          guaranteeMet: previewResult.summary?.guaranteeMet,
          processingTimeMs: previewResult.processingTimeMs,
        });
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        const error = parseGraphQLError(err);
        setError(error);
        onPreviewErrorRef.current?.(error);
        console.error('[FinancialsPreview] Error:', error.message);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [entityId, extractFinancialsInput, getInputHash]);

  /**
   * Stable input hash for effect
   */
  const currentInputHash = gameData ? getInputHash(gameData) : null;

  /**
   * Effect: Fetch preview when data changes
   */
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!gameData || !entityId) {
      setPreview(null);
      lastFetchedInputRef.current = null;
      return;
    }

    if (currentInputHash === lastFetchedInputRef.current) {
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchPreview(gameData);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [currentInputHash, debounceMs, fetchPreview, gameData, entityId]);

  /**
   * Manual refresh
   */
  const refresh = useCallback(() => {
    if (gameData && entityId) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      fetchPreview(gameData, true);
    }
  }, [gameData, entityId, fetchPreview]);

  /**
   * Clear preview
   */
  const clear = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setPreview(null);
    setError(null);
    lastFetchedInputRef.current = null;
  }, []);

  // Convenience accessors
  const summary = preview?.summary ?? null;
  const costs = preview?.calculatedCost ?? null;
  const snapshot = preview?.calculatedSnapshot ?? null;

  return {
    preview,
    summary,
    costs,
    snapshot,
    isLoading,
    error,
    refresh,
    clear,
    
    // Convenience metrics
    netProfit: summary?.netProfit ?? null,
    profitMargin: summary?.profitMargin ?? null,
    guaranteeMet: summary?.guaranteeMet ?? null,
    guaranteeOverlayCost: summary?.guaranteeOverlayCost ?? null,
    dealerCost: summary?.totalDealerCost ?? null,
    profitPerPlayer: summary?.profitPerPlayer ?? null,
    
    isValid: preview?.success === true && !preview?.error,
  };
};

// ===================================================================
// FORMATTING UTILITIES
// ===================================================================

/**
 * Format currency for display
 */
export const formatCurrency = (value: number | null | undefined): string => {
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
export const formatPercentage = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
};

/**
 * Get profit status styling
 */
export const getProfitStatus = (netProfit: number | null | undefined): {
  colorClass: string;
  icon: string;
  label: string;
} => {
  if (netProfit === null || netProfit === undefined) {
    return { colorClass: 'text-gray-500', icon: '—', label: 'Unknown' };
  }
  if (netProfit > 0) {
    return { colorClass: 'text-green-600', icon: '↑', label: 'Profit' };
  }
  if (netProfit < 0) {
    return { colorClass: 'text-red-600', icon: '↓', label: 'Loss' };
  }
  return { colorClass: 'text-gray-600', icon: '—', label: 'Break-even' };
};

/**
 * Get guarantee status styling
 */
export const getGuaranteeStatus = (
  guaranteeMet: boolean | null | undefined,
  overlayAmount: number | null | undefined
): {
  colorClass: string;
  icon: string;
  label: string;
} => {
  if (guaranteeMet === null || guaranteeMet === undefined) {
    return { colorClass: 'text-gray-500', icon: '—', label: 'No guarantee' };
  }
  if (guaranteeMet) {
    return { colorClass: 'text-green-600', icon: '✓', label: 'Guarantee met' };
  }
  return {
    colorClass: 'text-red-600',
    icon: '⚠',
    label: `Overlay: ${formatCurrency(overlayAmount)}`,
  };
};

export default useFinancialsPreview;
