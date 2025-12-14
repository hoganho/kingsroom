// src/hooks/enrichment/useEnrichmentPreview.ts
// ===================================================================
// ENRICHMENT PREVIEW HOOK
// ===================================================================
//
// Preview hook for gameDataEnricher - follows same pattern as useConsolidationPreview.
// Shows users what enrichment will do BEFORE saving.
//
// USAGE:
// const { preview, isLoading, error, willEnrich } = useEnrichmentPreview(editedData, {
//   entityId: 'xxx',
//   venueId: 'yyy',
//   debounceMs: 500,
//   onPreviewComplete: (result) => console.log('Enriched:', result)
// });
//
// ===================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData } from '../../types/game';
import type {
  EnrichGameDataOutput,
  EnrichedGameData,
  EnrichmentMetadata,
  EnrichmentValidationResult,
  SeriesResolutionMetadata,
  RecurringResolutionMetadata,
  VenueResolutionMetadata,
} from '../../types/enrichment';

// ===================================================================
// GRAPHQL QUERY (Preview mode only)
// ===================================================================
//
// IMPORTANT: Operation name is "EnrichGameDataPreviewHook" to avoid 
// conflicts with other EnrichGameData operations in the codebase.
//

const enrichmentPreviewQuery = /* GraphQL */ `
  mutation EnrichGameDataPreviewHook($input: EnrichGameDataInput!) {
    enrichGameData(input: $input) {
      success
      
      validation {
        isValid
        errors { field message code }
        warnings { field message code }
      }
      
      enrichedGame {
        name
        gameType
        gameStatus
        gameStartDateTime
        
        # Financials (calculated)
        buyIn
        rake
        venueFee
        totalBuyInsCollected
        rakeRevenue
        prizepoolPlayerContributions
        prizepoolAddedValue
        prizepoolSurplus
        guaranteeOverlayCost
        gameProfit
        
        # Entries
        totalUniquePlayers
        totalEntries
        
        # Venue assignment
        venueId
        venueAssignmentStatus
        venueAssignmentConfidence
        suggestedVenueName
        
        # Series assignment
        tournamentSeriesId
        seriesTitleId
        seriesAssignmentStatus
        seriesAssignmentConfidence
        suggestedSeriesName
        isMainEvent
        eventNumber
        dayNumber
        flightLetter
        
        # Recurring assignment
        recurringGameId
        recurringGameAssignmentStatus
        recurringGameAssignmentConfidence
        
        # Query keys
        gameDayOfWeek
        buyInBucket
        venueScheduleKey
      }
      
      enrichmentMetadata {
        seriesResolution {
          status
          confidence
          matchedSeriesId
          matchedSeriesName
          matchedSeriesTitleId
          wasCreated
          matchReason
        }
        recurringResolution {
          status
          confidence
          matchedRecurringGameId
          matchedRecurringGameName
          wasCreated
          matchReason
        }
        venueResolution {
          status
          venueId
          venueName
          venueFee
          confidence
          matchReason
        }
        queryKeysGenerated
        financialsCalculated
        fieldsCompleted
        processingTimeMs
      }
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

export interface UseEnrichmentPreviewOptions {
  /** Required: Entity ID for enrichment context */
  entityId: string;
  
  /** Optional: Venue ID if already known */
  venueId?: string | null;
  
  /** Debounce delay in milliseconds (default: 500ms) */
  debounceMs?: number;
  
  /** Skip series resolution in preview */
  skipSeriesResolution?: boolean;
  
  /** Skip recurring resolution in preview */
  skipRecurringResolution?: boolean;
  
  /** Skip financial calculations in preview */
  skipFinancials?: boolean;
  
  /** Callback when preview completes */
  onPreviewComplete?: (result: EnrichGameDataOutput) => void;
  
  /** Callback when preview errors */
  onPreviewError?: (error: Error) => void;
}

export interface UseEnrichmentPreviewReturn {
  /** Current preview result (null if not yet loaded) */
  preview: EnrichGameDataOutput | null;
  
  /** The enriched game data (convenience accessor) */
  enrichedGame: EnrichedGameData | null;
  
  /** Enrichment metadata (convenience accessor) */
  metadata: EnrichmentMetadata | null;
  
  /** Validation result (convenience accessor) */
  validation: EnrichmentValidationResult | null;
  
  /** Whether the preview is currently loading */
  isLoading: boolean;
  
  /** Error if the preview failed */
  error: Error | null;
  
  /** Manually trigger a preview refresh */
  refresh: () => void;
  
  /** Clear the current preview */
  clear: () => void;
  
  /** Whether enrichment will modify the data (convenience accessor) */
  willEnrich: boolean;
  
  /** Whether validation passed */
  isValid: boolean;
  
  /** Series resolution info (convenience accessor) */
  seriesResolution: SeriesResolutionMetadata | null;
  
  /** Recurring resolution info (convenience accessor) */
  recurringResolution: RecurringResolutionMetadata | null;
  
  /** Venue resolution info (convenience accessor) */
  venueResolution: VenueResolutionMetadata | null;
}

// Re-export types for convenience
export type {
  EnrichGameDataOutput,
  EnrichedGameData,
  EnrichmentMetadata,
  EnrichmentValidationResult,
  SeriesResolutionMetadata,
  RecurringResolutionMetadata,
  VenueResolutionMetadata,
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
      const message = firstError.message || 'Unknown GraphQL error';
      return new Error(String(message));
    }
    
    if (typeof errObj.message === 'string') {
      return new Error(errObj.message);
    }
    
    try {
      return new Error(JSON.stringify(err));
    } catch {
      return new Error('Unknown error');
    }
  }
  
  return new Error(String(err));
};

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

/**
 * Hook to preview game enrichment before saving.
 * 
 * This hook calls the gameDataEnricher with saveToDatabase: false
 * to show users exactly how their game will be enriched.
 * 
 * Follows the same pattern as useConsolidationPreview for consistency.
 * 
 * @example
 * ```tsx
 * const { preview, isLoading, isValid, seriesResolution } = useEnrichmentPreview(editedData, {
 *   entityId: currentEntity.id,
 *   venueId: selectedVenueId,
 *   debounceMs: 500,
 * });
 * 
 * if (seriesResolution?.status === 'MATCHED_EXISTING') {
 *   console.log(`Will link to series: ${seriesResolution.matchedSeriesName}`);
 * }
 * ```
 */
export const useEnrichmentPreview = (
  gameData: Partial<GameData> | null,
  options: UseEnrichmentPreviewOptions
): UseEnrichmentPreviewReturn => {
  const {
    entityId,
    venueId,
    debounceMs = 500,
    skipSeriesResolution = false,
    skipRecurringResolution = false,
    skipFinancials = false,
    onPreviewComplete,
    onPreviewError,
  } = options;

  // State
  const [preview, setPreview] = useState<EnrichGameDataOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for callbacks (avoid stale closures)
  const onPreviewCompleteRef = useRef(onPreviewComplete);
  const onPreviewErrorRef = useRef(onPreviewError);
  onPreviewCompleteRef.current = onPreviewComplete;
  onPreviewErrorRef.current = onPreviewError;

  // Refs for deduplication
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedInputRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  /**
   * Extract relevant fields for enrichment input
   */
  const extractEnrichmentInput = useCallback((data: Partial<GameData>) => {
    return {
      entityId,
      game: {
        tournamentId: data.tournamentId || null,
        existingGameId: (data as any).id || (data as any).existingGameId || null,
        name: data.name || '',
        gameType: data.gameType || 'TOURNAMENT',
        gameVariant: data.gameVariant || null,
        gameStatus: data.gameStatus || 'SCHEDULED',
        registrationStatus: data.registrationStatus || null,
        gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
        gameEndDateTime: data.gameEndDateTime || null,
        
        // Financials
        buyIn: data.buyIn ?? 0,
        rake: data.rake ?? 0,
        venueFee: (data as any).venueFee ?? null,
        hasGuarantee: data.hasGuarantee ?? false,
        guaranteeAmount: data.guaranteeAmount ?? 0,
        startingStack: data.startingStack ?? 0,
        
        // Entries
        totalUniquePlayers: data.totalUniquePlayers ?? 0,
        totalInitialEntries: data.totalInitialEntries ?? 0,
        totalEntries: data.totalEntries ?? 0,
        totalRebuys: data.totalRebuys ?? 0,
        totalAddons: data.totalAddons ?? 0,
        
        // Results
        prizepoolPaid: data.prizepoolPaid ?? 0,
        prizepoolCalculated: data.prizepoolCalculated ?? 0,
        
        // Classification
        isSeries: (data as any).isSeries ?? false,
        seriesName: (data as any).seriesName || null,
        isRegular: (data as any).isRegular ?? true,
        isSatellite: (data as any).isSatellite ?? false,
        tournamentType: (data as any).tournamentType || null,
        
        // Series metadata
        isMainEvent: (data as any).isMainEvent ?? false,
        eventNumber: (data as any).eventNumber ?? null,
        dayNumber: (data as any).dayNumber ?? null,
        flightLetter: (data as any).flightLetter || null,
        finalDay: (data as any).finalDay ?? false,
        
        // Recurring
        recurringGameId: (data as any).recurringGameId || null,
      },
      venue: venueId ? {
        venueId,
        venueName: (data as any).venueName || null,
      } : undefined,
      series: (data as any).isSeries ? {
        tournamentSeriesId: (data as any).tournamentSeriesId || null,
        seriesTitleId: (data as any).seriesTitleId || null,
        seriesName: (data as any).seriesName || null,
        year: new Date(data.gameStartDateTime || new Date()).getFullYear(),
      } : undefined,
      options: {
        saveToDatabase: false, // PREVIEW ONLY
        autoCreateSeries: false, // Don't create in preview
        autoCreateRecurring: false,
        skipSeriesResolution,
        skipRecurringResolution,
        skipFinancials,
        skipQueryKeys: false,
      },
    };
  }, [entityId, venueId, skipSeriesResolution, skipRecurringResolution, skipFinancials]);

  /**
   * Generate stable hash for deduplication
   */
  const getInputHash = useCallback((data: Partial<GameData>): string => {
    return JSON.stringify({
      name: data.name,
      entityId,
      venueId,
      buyIn: data.buyIn,
      rake: data.rake,
      totalEntries: data.totalEntries,
      hasGuarantee: data.hasGuarantee,
      guaranteeAmount: data.guaranteeAmount,
      isSeries: (data as any).isSeries,
      seriesName: (data as any).seriesName,
      tournamentSeriesId: (data as any).tournamentSeriesId,
      eventNumber: (data as any).eventNumber,
      dayNumber: (data as any).dayNumber,
      flightLetter: (data as any).flightLetter,
      recurringGameId: (data as any).recurringGameId,
    });
  }, [entityId, venueId]);

  /**
   * Fetch enrichment preview
   */
  const fetchPreview = useCallback(async (data: Partial<GameData>, forceRefresh = false) => {
    const currentRequestId = ++requestIdRef.current;

    // Don't fetch without required data
    if (!data.name?.trim() || !entityId) {
      setPreview(null);
      lastFetchedInputRef.current = null;
      return;
    }

    // Check for duplicate request
    const inputHash = getInputHash(data);
    if (!forceRefresh && inputHash === lastFetchedInputRef.current) {
      console.log('[EnrichmentPreview] Skipping duplicate request');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const input = extractEnrichmentInput(data);
      console.log('[EnrichmentPreview] Fetching preview:', { name: data.name, entityId });

      const result = await getClient().graphql({
        query: enrichmentPreviewQuery,
        variables: { input },
      }) as { data: { enrichGameData: EnrichGameDataOutput } };

      // Only update if still latest request
      if (currentRequestId === requestIdRef.current) {
        const previewResult = result.data.enrichGameData;
        setPreview(previewResult);
        lastFetchedInputRef.current = inputHash;
        onPreviewCompleteRef.current?.(previewResult);

        console.log('[EnrichmentPreview] Result:', {
          isValid: previewResult.validation?.isValid,
          financialsCalculated: previewResult.enrichmentMetadata?.financialsCalculated,
          seriesStatus: previewResult.enrichmentMetadata?.seriesResolution?.status,
          recurringStatus: previewResult.enrichmentMetadata?.recurringResolution?.status,
          processingTimeMs: previewResult.enrichmentMetadata?.processingTimeMs,
        });
      }
    } catch (err: unknown) {
      if (currentRequestId === requestIdRef.current) {
        const error = parseGraphQLError(err);
        setError(error);
        onPreviewErrorRef.current?.(error);
        console.error('[EnrichmentPreview] Error:', error.message);
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [entityId, extractEnrichmentInput, getInputHash]);

  /**
   * Stable input hash for effect dependency
   */
  const currentInputHash = gameData ? getInputHash(gameData) : null;

  /**
   * Effect: Fetch preview when game data changes
   */
  useEffect(() => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!gameData || !entityId) {
      setPreview(null);
      lastFetchedInputRef.current = null;
      return;
    }

    // Skip if same input
    if (currentInputHash === lastFetchedInputRef.current) {
      return;
    }

    // Debounced fetch
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
  const metadata = preview?.enrichmentMetadata ?? null;
  const enrichedGame = preview?.enrichedGame ?? null;
  const validation = preview?.validation ?? null;

  return {
    preview,
    enrichedGame,
    metadata,
    validation,
    isLoading,
    error,
    refresh,
    clear,
    willEnrich: !!(preview?.success && metadata && (
      metadata.financialsCalculated ||
      metadata.queryKeysGenerated ||
      metadata.seriesResolution?.status === 'MATCHED_EXISTING' ||
      metadata.seriesResolution?.status === 'CREATED_NEW' ||
      metadata.recurringResolution?.status === 'MATCHED_EXISTING'
    )),
    isValid: preview?.validation?.isValid ?? false,
    seriesResolution: metadata?.seriesResolution ?? null,
    recurringResolution: metadata?.recurringResolution ?? null,
    venueResolution: metadata?.venueResolution ?? null,
  };
};

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Format series resolution status for display
 */
export const formatSeriesResolutionStatus = (status: string | null | undefined): string => {
  switch (status) {
    case 'MATCHED_EXISTING': return 'Will link to existing series';
    case 'CREATED_NEW': return 'Will create new series';
    case 'SKIPPED': return 'Series resolution skipped';
    case 'NOT_SERIES': return 'Not a series event';
    case 'FAILED': return 'Series resolution failed';
    default: return 'Unknown';
  }
};

/**
 * Format recurring resolution status for display
 */
export const formatRecurringResolutionStatus = (status: string | null | undefined): string => {
  switch (status) {
    case 'MATCHED_EXISTING': return 'Matches recurring template';
    case 'CREATED_NEW': return 'Will create recurring template';
    case 'SKIPPED': return 'Recurring resolution skipped';
    case 'NOT_RECURRING': return 'Not a recurring game';
    case 'FAILED': return 'Recurring resolution failed';
    default: return 'Unknown';
  }
};

/**
 * Get confidence color class
 */
export const getConfidenceColorClass = (confidence: number | null | undefined): string => {
  if (confidence === null || confidence === undefined) return 'text-gray-500';
  if (confidence >= 0.9) return 'text-green-600';
  if (confidence >= 0.7) return 'text-yellow-600';
  return 'text-red-600';
};

export default useEnrichmentPreview;