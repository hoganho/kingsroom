// src/hooks/useConsolidationPreview.ts
// *** FIX: Added seriesName and isMainEvent to extractPreviewInput ***

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData } from '../types/game';

// ===================================================================
// GRAPHQL QUERY
// ===================================================================

const previewConsolidationQuery = /* GraphQL */ `
    query PreviewConsolidation($input: ConsolidationPreviewInput!) {
        previewConsolidation(input: $input) {
            willConsolidate
            reason
            warnings
            detectedPattern {
                isMultiDay
                detectionSource
                parsedDayNumber
                parsedFlightLetter
                isFinalDay
                derivedParentName
            }
            consolidation {
                consolidationKey
                keyStrategy
                parentExists
                parentGameId
                parentName
                siblingCount
                siblings {
                    id
                    name
                    dayNumber
                    flightLetter
                    gameStatus
                    gameStartDateTime
                    totalUniquePlayers
                    totalInitialEntries
                    totalEntries
                    finalDay
                }
                projectedTotals {
                    totalUniquePlayers
                    totalInitialEntries
                    totalEntries
                    totalRebuys
                    totalAddons
                    prizepoolPaid
                    prizepoolCalculated
                    earliestStart
                    latestEnd
                    projectedStatus
                    isPartialData
                    missingFlightCount
                }
            }
        }
    }
`;

// ===================================================================
// TYPES
// ===================================================================

export interface DetectedMultiDayPattern {
    isMultiDay: boolean;
    detectionSource: 'dayNumber' | 'flightLetter' | 'finalDay' | 'namePattern' | null;
    parsedDayNumber: number | null;
    parsedFlightLetter: string | null;
    isFinalDay: boolean;
    derivedParentName: string;
}

export interface ConsolidationSibling {
    id: string;
    name: string;
    dayNumber: number | null;
    flightLetter: string | null;
    gameStatus: string;
    gameStartDateTime: string;
    totalUniquePlayers: number | null;
    totalInitialEntries: number | null;
    totalEntries: number | null;
    finalDay: boolean | null;
}

export interface ProjectedConsolidationTotals {
    totalUniquePlayers: number | null;
    totalInitialEntries: number | null;
    totalEntries: number | null;
    totalRebuys: number | null;
    totalAddons: number | null;
    prizepoolPaid: number | null;
    prizepoolCalculated: number | null;
    earliestStart: string | null;
    latestEnd: string | null;
    projectedStatus: string;
    isPartialData: boolean;
    missingFlightCount: number;
}

export interface ConsolidationDetails {
    consolidationKey: string;
    keyStrategy: 'SERIES_EVENT' | 'ENTITY_SERIES_EVENT' | 'VENUE_EVENT_DATE' | 'VENUE_BUYIN_DATE';
    parentExists: boolean;
    parentGameId: string | null;
    parentName: string;
    siblingCount: number;
    siblings: ConsolidationSibling[] | null;
    projectedTotals: ProjectedConsolidationTotals;
}

export interface ConsolidationPreviewResult {
    willConsolidate: boolean;
    reason: string;
    warnings: string[];
    detectedPattern: DetectedMultiDayPattern;
    consolidation: ConsolidationDetails | null;
}

export interface UseConsolidationPreviewOptions {
    /** Debounce delay in milliseconds (default: 500ms) */
    debounceMs?: number;
    /** Whether to include sibling details in the response */
    includeSiblingDetails?: boolean;
    /** Callback when preview completes */
    onPreviewComplete?: (result: ConsolidationPreviewResult) => void;
    /** Callback when preview errors */
    onPreviewError?: (error: Error) => void;
}

export interface UseConsolidationPreviewReturn {
    /** Current preview result (null if not yet loaded) */
    preview: ConsolidationPreviewResult | null;
    /** Whether the preview is currently loading */
    isLoading: boolean;
    /** Error if the preview failed */
    error: Error | null;
    /** Manually trigger a preview refresh */
    refresh: () => void;
    /** Clear the current preview */
    clear: () => void;
    /** Whether consolidation would occur (convenience accessor) */
    willConsolidate: boolean;
}

// ===================================================================
// LAZY CLIENT INITIALIZATION
// ===================================================================

// Lazy initialization pattern to avoid calling generateClient() before Amplify.configure()
// Using 'any' to avoid TypeScript excessive stack depth error with Amplify's complex generics
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

/**
 * Parses GraphQL/Amplify error responses into a proper Error object
 * 
 * GraphQL errors from Amplify come as objects like:
 * { errors: [{ message: "...", errorType: "...", ... }], data: null }
 */
const parseGraphQLError = (err: unknown): Error => {
    // Already an Error instance
    if (err instanceof Error) {
        return err;
    }
    
    // GraphQL error response structure
    if (typeof err === 'object' && err !== null) {
        const errObj = err as Record<string, unknown>;
        
        // Check for errors array (standard GraphQL error format)
        if (Array.isArray(errObj.errors) && errObj.errors.length > 0) {
            const firstError = errObj.errors[0] as Record<string, unknown>;
            const message = firstError.message || 'Unknown GraphQL error';
            const errorType = firstError.errorType || 'GraphQLError';
            return new Error(`${errorType}: ${message}`);
        }
        
        // Check for message property
        if (typeof errObj.message === 'string') {
            return new Error(errObj.message);
        }
        
        // Try to stringify the object meaningfully
        try {
            return new Error(JSON.stringify(err));
        } catch {
            return new Error('Unknown error (could not serialize)');
        }
    }
    
    // Primitive value
    return new Error(String(err));
};

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

/**
 * Hook to preview tournament consolidation before saving.
 * 
 * This hook calls the backend previewConsolidation query with debouncing
 * to show users exactly how their game will be grouped.
 * 
 * @example
 * ```tsx
 * const { preview, isLoading, willConsolidate } = useConsolidationPreview(editedData, {
 *   debounceMs: 500,
 *   includeSiblingDetails: true
 * });
 * 
 * if (willConsolidate && preview) {
 *   console.log(`Will group under: ${preview.consolidation?.parentName}`);
 * }
 * ```
 */
export const useConsolidationPreview = (
    gameData: Partial<GameData> | null,
    options: UseConsolidationPreviewOptions = {}
): UseConsolidationPreviewReturn => {
    const {
        debounceMs = 500,
        includeSiblingDetails = false,
        onPreviewComplete,
        onPreviewError
    } = options;

    const [preview, setPreview] = useState<ConsolidationPreviewResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    // Track the last request to avoid race conditions
    const requestIdRef = useRef(0);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    
    // Store callbacks in refs to avoid dependency chain issues
    const onPreviewCompleteRef = useRef(onPreviewComplete);
    const onPreviewErrorRef = useRef(onPreviewError);
    const lastFetchedInputRef = useRef<string | null>(null);
    
    // Keep refs updated without causing re-renders
    useEffect(() => {
        onPreviewCompleteRef.current = onPreviewComplete;
        onPreviewErrorRef.current = onPreviewError;
    }, [onPreviewComplete, onPreviewError]);

    /**
     * *** FIX: Added seriesName and isMainEvent to extractPreviewInput ***
     * 
     * These fields are critical for:
     * 1. seriesName - Used in ENTITY_SERIES_EVENT strategy (95% confidence)
     * 2. isMainEvent - Used for deriving parent name from structured fields
     */
    const extractPreviewInput = useCallback((data: Partial<GameData>) => {
        return {
            // Consolidation key fields
            name: data.name || '',
            tournamentId: data.tournamentId || null,
            venueId: data.venueId || null,
            entityId: data.entityId || null,
            buyIn: data.buyIn || null,
            gameStatus: data.gameStatus || null,
            gameStartDateTime: data.gameStartDateTime || null,
            tournamentSeriesId: data.tournamentSeriesId || null,
            eventNumber: data.eventNumber || null,
            dayNumber: data.dayNumber || null,
            flightLetter: data.flightLetter || null,
            finalDay: data.finalDay || null,
            isSeries: data.isSeries || null,
            // *** FIX: Added missing fields for consolidation ***
            seriesName: (data as any).seriesName || null,      // Critical for ENTITY_SERIES_EVENT strategy
            isMainEvent: (data as any).isMainEvent || null,    // Used for parent name derivation
            // Numeric fields needed for projected totals calculation
            totalUniquePlayers: data.totalUniquePlayers || null,
            totalInitialEntries: data.totalInitialEntries || null,
            totalEntries: data.totalEntries || null,
            totalRebuys: data.totalRebuys || null,
            totalAddons: data.totalAddons || null,
            prizepoolPaid: data.prizepoolPaid || null,
            prizepoolCalculated: data.prizepoolCalculated || null,
            gameEndDateTime: data.gameEndDateTime || null
        };
    }, []);

    /**
     * Generates a stable hash for input deduplication
     * *** FIX: Added seriesName to the hash ***
     */
    const getInputHash = useCallback((data: Partial<GameData>): string => {
        return JSON.stringify({
            name: data.name,
            venueId: data.venueId,
            buyIn: data.buyIn,
            tournamentSeriesId: data.tournamentSeriesId,
            eventNumber: data.eventNumber,
            dayNumber: data.dayNumber,
            flightLetter: data.flightLetter,
            finalDay: data.finalDay,
            isSeries: data.isSeries,
            seriesName: (data as any).seriesName  // *** FIX: Include in hash ***
        });
    }, []);

    /**
     * Performs the actual preview query
     */
    const fetchPreview = useCallback(async (data: Partial<GameData>, forceRefresh = false) => {
        const currentRequestId = ++requestIdRef.current;
        
        // Don't fetch if we don't have a name
        if (!data.name?.trim()) {
            setPreview(null);
            lastFetchedInputRef.current = null;
            return;
        }

        // Check for duplicate request (unless force refresh)
        const inputHash = getInputHash(data);
        if (!forceRefresh && inputHash === lastFetchedInputRef.current) {
            console.log('[ConsolidationPreview] Skipping duplicate request');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const input = {
                gameData: extractPreviewInput(data),
                includeSiblingDetails
            };

            console.log('[ConsolidationPreview] Fetching preview:', input);

            // Use lazy-initialized client
            const result = await getClient().graphql({
                query: previewConsolidationQuery,
                variables: { input }
            }) as { data: { previewConsolidation: ConsolidationPreviewResult } };

            // Only update state if this is still the latest request
            if (currentRequestId === requestIdRef.current) {
                const previewResult = result.data.previewConsolidation;
                setPreview(previewResult);
                lastFetchedInputRef.current = inputHash;
                onPreviewCompleteRef.current?.(previewResult);
                
                console.log('[ConsolidationPreview] Result:', {
                    willConsolidate: previewResult.willConsolidate,
                    reason: previewResult.reason,
                    parentName: previewResult.consolidation?.parentName
                });
            }
        } catch (err: unknown) {
            // Only update state if this is still the latest request
            if (currentRequestId === requestIdRef.current) {
                // Parse GraphQL/Amplify error structure
                const error = parseGraphQLError(err);
                setError(error);
                onPreviewErrorRef.current?.(error);
                console.error('[ConsolidationPreview] Error:', error.message, err);
            }
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [extractPreviewInput, getInputHash, includeSiblingDetails]);

    /**
     * Create a stable input hash for the current game data
     * This is what we use as the effect dependency instead of individual fields
     */
    const currentInputHash = gameData ? getInputHash(gameData) : null;

    /**
     * Effect: Fetch preview when game data changes
     * Uses a single stable hash as dependency instead of multiple fields
     */
    useEffect(() => {
        // Clear any existing timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (!gameData) {
            setPreview(null);
            lastFetchedInputRef.current = null;
            return;
        }

        // Skip if this is the same input we already fetched
        if (currentInputHash === lastFetchedInputRef.current) {
            return;
        }

        // Set debounced fetch
        debounceTimerRef.current = setTimeout(() => {
            fetchPreview(gameData);
        }, debounceMs);

        // Cleanup timer on unmount or dependency change
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [currentInputHash, debounceMs, fetchPreview, gameData]);

    /**
     * Manual refresh function
     */
    const refresh = useCallback(() => {
        if (gameData) {
            // Clear debounce and fetch immediately with force refresh
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
            fetchPreview(gameData, true); // forceRefresh bypasses deduplication
        }
    }, [gameData, fetchPreview]);

    /**
     * Clear function
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

    return {
        preview,
        isLoading,
        error,
        refresh,
        clear,
        willConsolidate: preview?.willConsolidate ?? false
    };
};

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Helper to format consolidation key for display
 */
export const formatConsolidationKey = (key: string): string => {
    if (key.startsWith('SERIES_')) {
        // SERIES_abc123_EVT_8 → "Series Event 8"
        const match = key.match(/SERIES_(.+)_EVT_(\d+)/);
        if (match) {
            return `Series Event #${match[2]}`;
        }
    }
    
    if (key.startsWith('ENT_')) {
        // ENT_xxx_SER_SIGNATURESERIES_EVT_8_DT_2023-02 → "Signature Series Event #8"
        const match = key.match(/SER_([A-Z]+)_EVT_(\d+)/);
        if (match) {
            // Convert SIGNATURESERIES to "Signature Series"
            const seriesName = match[1].replace(/([A-Z])/g, ' $1').trim();
            return `${seriesName} Event #${match[2]}`;
        }
    }
    
    if (key.startsWith('VEN_')) {
        // VEN_xxx_EVT_8_BI_750_DT_2023-02 → "Event #8 ($750)"
        const match = key.match(/EVT_(\d+)_BI_(\d+)/);
        if (match) {
            return `Event #${match[1]} ($${match[2]})`;
        }
        
        // VEN_xxx_BI_750_DT_2023-02 → "$750 Tournament"
        const biMatch = key.match(/BI_(\d+)/);
        if (biMatch) {
            return `$${biMatch[1]} Tournament`;
        }
    }
    
    return key;
};

/**
 * Helper to get strategy description
 */
export const getKeyStrategyDescription = (strategy: string): string => {
    switch (strategy) {
        case 'SERIES_EVENT':
            return 'Linked by Series ID + Event Number (100% confidence)';
        case 'ENTITY_SERIES_EVENT':
            return 'Linked by Entity + Series Name + Event Number (95% confidence)';
        case 'VENUE_EVENT_DATE':
            return 'Linked by Venue + Event Number + Buy-in (90% confidence)';
        case 'VENUE_BUYIN_DATE':
            return 'Linked by Venue + Buy-in + Date (70% confidence - lower reliability)';
        default:
            return strategy;
    }
};

export default useConsolidationPreview;