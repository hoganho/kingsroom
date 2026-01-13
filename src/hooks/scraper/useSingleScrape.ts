// src/hooks/scraper/useSingleScrape.ts
// Hook for processing a single tournament ID with full interactive control
// This replaces useScrapeOrchestrator for single-ID mode only
//
// For batch processing, use useScraperJobs.startJob() from useScraperManagement.ts
//
// v2.0.0 - Major refactor:
// - FIXED: NOT_FOUND responses now logged correctly (not as errors)
// - FIXED: NOT_PUBLISHED handled separately from NOT_FOUND
// - ADDED: State transition validation (from useResultStateMachine)
// - ADDED: Error classification improvements (from useErrorTracking)
// - ADDED: Retry support for transient errors
// - scrape() returns { parsedData, enrichedData } to avoid stale state issues

import { useState, useCallback, useRef } from 'react';
import { ScrapedGameData } from '../../API';
import { 
  ProcessingResult, 
  ProcessingStatus,
  ScrapeOptions,
  DataSourceType,
  ErrorType,
} from '../../types/scraper';
import { fetchGameDataFromBackend } from '../../services/gameService';
import { 
  enrichForPipeline,
  saveGameDataToBackend,
  type EnrichedGameDataWithContext,
} from '../../services/enrichmentService';
import { normalizeGameStatus } from '../../utils/statusNormalization';
import { scraperLogger } from '../../utils/scraperLogger';
import { 
  classifyError, 
  isTransientError,
  isNotFoundResponse,
  isNotPublishedResponse,
} from '../../utils/scraperErrorUtils';

// ===================================================================
// TYPES
// ===================================================================

export interface UseSingleScrapeConfig {
  entityId: string;
  baseUrl: string;
  urlPath: string;
  scraperApiKey: string;
  options: ScrapeOptions;
  defaultVenueId: string;
}

/**
 * Result returned from scrape() function
 * Contains both parsed data and enriched data to avoid stale state issues
 */
export interface ScrapeResult {
  parsedData: ScrapedGameData | null;
  enrichedData: EnrichedGameDataWithContext | null;
  /** Outcome type for caller to handle appropriately */
  outcome: 'success' | 'not_found' | 'not_published' | 'skipped' | 'error';
  /** Error type if outcome is 'error' */
  errorType?: ErrorType;
}

export interface UseSingleScrapeResult {
  // State
  result: ProcessingResult | null;
  isProcessing: boolean;
  lastErrorType: ErrorType | null;
  
  // Actions
  scrape: (tournamentId: number) => Promise<ScrapeResult>;
  save: (venueId: string, editedData?: ScrapedGameData, overrideUrl?: string, overrideTournamentId?: number) => Promise<{ success: boolean; gameId?: string }>;
  retry: () => Promise<ScrapeResult>;
  reset: () => void;
  skip: (reason?: string) => void;
  
  // Enriched data (available after scrape - kept for backwards compatibility)
  // NOTE: Prefer using the enrichedData returned directly from scrape() to avoid stale state
  enrichedData: EnrichedGameDataWithContext | null;
  
  // Queries (from useResultStateMachine concepts)
  canRetry: boolean;
  canSave: boolean;
  isTerminal: boolean;
}

// ===================================================================
// CONSTANTS - State Machine (from useResultStateMachine)
// ===================================================================

/**
 * Valid state transitions for ProcessingResult status
 */
const VALID_TRANSITIONS: Record<ProcessingStatus, ProcessingStatus[]> = {
  'pending': ['scraping', 'skipped'],
  'scraping': ['saving', 'success', 'warning', 'error', 'skipped', 'review'],
  'saving': ['success', 'warning', 'error'],
  'review': ['saving', 'skipped', 'error', 'success'],
  'success': [],
  'warning': [],
  'error': ['scraping', 'review', 'skipped'], // can retry or skip
  'skipped': [],
};

const TERMINAL_STATES: ProcessingStatus[] = ['success', 'warning', 'skipped'];
const RETRYABLE_STATES: ProcessingStatus[] = ['error'];
const SAVEABLE_STATES: ProcessingStatus[] = ['review'];

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getDataSource = (parsedData: ScrapedGameData): DataSourceType => {
  const dataAsRecord = parsedData as Record<string, unknown>;
  const source = dataAsRecord.source as string | undefined;
  
  if (source === 'S3_CACHE' || source === 'HTTP_304_CACHE') return 's3';
  if (source === 'LIVE') return 'web';
  if (parsedData.s3Key) return 's3';
  return 'web';
};

/**
 * Check if gameStatus indicates an empty tournament slot
 */
const isNotFoundGameStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === 'NOT_FOUND' || normalized === 'NOT_IN_USE' || normalized === 'BLANK';
};

/**
 * Check if gameStatus indicates a hidden/unpublished tournament
 */
const isNotPublishedGameStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return status.toUpperCase() === 'NOT_PUBLISHED';
};

/**
 * Validate state transition
 */
const canTransition = (from: ProcessingStatus, to: ProcessingStatus): boolean => {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
};

/**
 * Safe state transition - logs warning if invalid
 */
const safeTransition = (
  current: ProcessingStatus,
  next: ProcessingStatus,
  tournamentId?: number
): ProcessingStatus => {
  if (canTransition(current, next)) {
    return next;
  }
  
  console.warn(
    `[useSingleScrape] Invalid state transition: ${current} → ${next}` +
    (tournamentId ? ` for tournament #${tournamentId}` : '') +
    `. Valid: ${VALID_TRANSITIONS[current]?.join(', ') || 'none'}`
  );
  
  // Return current state if transition is invalid
  return current;
};

// ===================================================================
// HOOK
// ===================================================================

export const useSingleScrape = (config: UseSingleScrapeConfig): UseSingleScrapeResult => {
  const {
    entityId,
    baseUrl,
    urlPath,
    scraperApiKey,
    options,
    defaultVenueId,
  } = config;

  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [enrichedData, setEnrichedData] = useState<EnrichedGameDataWithContext | null>(null);
  const [lastErrorType, setLastErrorType] = useState<ErrorType | null>(null);
  
  // Track last tournament ID for retry
  const lastTournamentIdRef = useRef<number | null>(null);

  // =========================================================================
  // COMPUTED STATE (from useResultStateMachine)
  // =========================================================================
  
  const canRetry = result?.status ? RETRYABLE_STATES.includes(result.status) : false;
  const canSave = result?.status ? SAVEABLE_STATES.includes(result.status) : false;
  const isTerminal = result?.status ? TERMINAL_STATES.includes(result.status) : false;

  // =========================================================================
  // STATE UPDATE HELPER
  // =========================================================================
  
  const updateResult = useCallback((
    updates: Partial<ProcessingResult> & { status?: ProcessingStatus }
  ) => {
    setResult(prev => {
      if (!prev) return null;
      
      // Validate state transition if status is changing
      const newStatus = updates.status 
        ? safeTransition(prev.status, updates.status, prev.id)
        : prev.status;
      
      return {
        ...prev,
        ...updates,
        status: newStatus,
      };
    });
  }, []);

  // =========================================================================
  // SCRAPE - Fetch and optionally enrich data
  // v2.0.0: Proper NOT_FOUND vs error handling
  // =========================================================================
  
  const scrape = useCallback(async (tournamentId: number): Promise<ScrapeResult> => {
    const url = `${baseUrl}${urlPath}${tournamentId}`;
    
    // Store for retry
    lastTournamentIdRef.current = tournamentId;
    
    // Clear previous state
    setIsProcessing(true);
    setEnrichedData(null);
    setLastErrorType(null);
    setResult({
      id: tournamentId,
      url,
      status: 'scraping',
      message: 'Fetching tournament data...',
    });

    scraperLogger.logItemStart(tournamentId, url);

    // Track enriched data locally to return directly
    let localEnrichedData: EnrichedGameDataWithContext | null = null;

    try {
      // Fetch from backend
      const parsedData = await fetchGameDataFromBackend(
        url, 
        !options.useS3, // forceRefresh
        scraperApiKey, 
        entityId
      );

      if (!parsedData) {
        const errorType: ErrorType = 'UNKNOWN';
        setLastErrorType(errorType);
        setResult({
          id: tournamentId,
          url,
          status: 'error',
          message: 'No data returned from scraper',
          errorType,
        });
        scraperLogger.logFetchError(tournamentId, 'No data returned', errorType);
        setIsProcessing(false);
        return { parsedData: null, enrichedData: null, outcome: 'error', errorType };
      }

      const dataAsRecord = parsedData as Record<string, unknown>;
      const normalizedStatus = normalizeGameStatus(parsedData.gameStatus);
      const dataSource = getDataSource(parsedData);

      // =====================================================================
      // v2.0.0 FIX: Check for NOT_FOUND/NOT_PUBLISHED BEFORE checking errors
      // These are successful retrievals of empty/hidden slots, NOT errors
      // =====================================================================
      
      // Check for NOT_FOUND (empty tournament slot)
      if (isNotFoundGameStatus(normalizedStatus) || isNotFoundResponse(parsedData)) {
        // Log with the NEW logNotFound method (not logFetchError!)
        scraperLogger.logNotFound(tournamentId, normalizedStatus || 'NOT_FOUND');
        
        setResult({
          id: tournamentId,
          url,
          status: 'skipped',
          message: `Tournament not found (${normalizedStatus || 'NOT_FOUND'})`,
          parsedData,
          dataSource,
        });
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'not_found' };
      }

      // Check for NOT_PUBLISHED (hidden tournament)
      if (isNotPublishedGameStatus(normalizedStatus) || isNotPublishedResponse(parsedData)) {
        scraperLogger.logNotPublished(tournamentId);
        
        setResult({
          id: tournamentId,
          url,
          status: 'skipped',
          message: 'Tournament not published (hidden)',
          parsedData,
          dataSource,
        });
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'not_published' };
      }

      // =====================================================================
      // Now check for actual errors (after ruling out NOT_FOUND/NOT_PUBLISHED)
      // =====================================================================
      
      const errorMsg = (dataAsRecord.error || dataAsRecord.errorMessage) as string | undefined;
      
      // Only treat as error if there's an error message AND it's not a name placeholder
      // v2.0.0: "Error processing tournament" name is now only an error if NOT a NOT_FOUND status
      if (errorMsg) {
        const errorType = classifyError(errorMsg, parsedData);
        setLastErrorType(errorType);
        
        setResult({
          id: tournamentId,
          url,
          status: 'error',
          message: errorMsg,
          errorType,
          parsedData,
          dataSource,
        });
        scraperLogger.logFetchError(tournamentId, errorMsg, errorType);
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'error', errorType };
      }
      
      // Log successful fetch
      scraperLogger.logFetchSuccess(
        tournamentId, 
        dataSource === 's3' ? 'S3_CACHE' : 'LIVE', 
        parsedData.name || undefined
      );

      // Check for doNotScrape flag
      const isDoNotScrape = dataAsRecord.skipped && dataAsRecord.skipReason === 'DO_NOT_SCRAPE';
      if (isDoNotScrape && !options.ignoreDoNotScrape) {
        scraperLogger.logSkipped(tournamentId, 'DO_NOT_SCRAPE');
        
        setResult({
          id: tournamentId,
          url,
          status: 'skipped',
          message: 'Marked as Do Not Scrape',
          parsedData,
          dataSource,
        });
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'skipped' };
      }

      // =====================================================================
      // Success path - Enrich data for review modal
      // =====================================================================
      
      const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
      
      try {
        const enrichResult = await enrichForPipeline(
          parsedData,
          entityId,
          autoVenueId || defaultVenueId || null,
          url
        );
        
        localEnrichedData = enrichResult.enrichedGame;
        setEnrichedData(localEnrichedData);
      } catch (enrichError) {
        console.warn('[useSingleScrape] Enrichment failed, using raw data:', enrichError);
      }
      
      setResult({
        id: tournamentId,
        url,
        status: 'review',
        message: 'Ready for review',
        parsedData,
        autoVenueId: autoVenueId || undefined,
        dataSource,
      });

      setIsProcessing(false);
      return { parsedData, enrichedData: localEnrichedData, outcome: 'success' };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Unknown error occurred';
      const errorType = classifyError(errorMessage);
      setLastErrorType(errorType);
      
      setResult({
        id: tournamentId,
        url,
        status: 'error',
        message: errorMessage,
        errorType,
      });
      
      scraperLogger.logFetchError(tournamentId, errorMessage, errorType);
      setIsProcessing(false);
      return { parsedData: null, enrichedData: null, outcome: 'error', errorType };
    }
  }, [entityId, baseUrl, urlPath, scraperApiKey, options, defaultVenueId]);

  // =========================================================================
  // RETRY - Re-attempt the last scrape (from useErrorTracking concepts)
  // =========================================================================
  
  const retry = useCallback(async (): Promise<ScrapeResult> => {
    if (!canRetry || lastTournamentIdRef.current === null) {
      console.warn('[useSingleScrape] retry() called but cannot retry (state:', result?.status, ')');
      return { parsedData: null, enrichedData: null, outcome: 'error', errorType: 'UNKNOWN' };
    }
    
    // Check if last error was transient (worth retrying)
    if (lastErrorType && !isTransientError(lastErrorType)) {
      console.warn('[useSingleScrape] retry() called but error type', lastErrorType, 'is not transient');
    }
    
    return scrape(lastTournamentIdRef.current);
  }, [canRetry, result?.status, lastErrorType, scrape]);

  // =========================================================================
  // SKIP - Mark current item as skipped
  // =========================================================================
  
  const skip = useCallback((reason?: string) => {
    if (!result) return;
    
    const newStatus = safeTransition(result.status, 'skipped', result.id);
    if (newStatus === 'skipped') {
      scraperLogger.logSkipped(result.id, reason || 'User skipped');
      setResult({
        ...result,
        status: 'skipped',
        message: reason || 'Skipped by user',
      });
    }
  }, [result]);

  // =========================================================================
  // SAVE - Save the scraped data to database
  // =========================================================================
  
  const save = useCallback(async (
    venueId: string, 
    editedData?: ScrapedGameData,
    overrideUrl?: string,
    overrideTournamentId?: number
  ): Promise<{ success: boolean; gameId?: string }> => {
    const urlToUse = overrideUrl || result?.url;
    const idToUse = overrideTournamentId ?? result?.id;
    
    if (!urlToUse || idToUse === undefined) {
      console.warn('[useSingleScrape] save() called but missing url or id');
      return { success: false };
    }

    const dataToSave = editedData || result?.parsedData;
    if (!dataToSave) {
      console.warn('[useSingleScrape] save() called but no data to save');
      return { success: false };
    }
    
    // Validate state transition
    if (result && !canTransition(result.status, 'saving')) {
      console.warn('[useSingleScrape] Cannot transition from', result.status, 'to saving');
      return { success: false };
    }
    
    updateResult({
      status: 'saving',
      message: 'Saving to database...',
      selectedVenueId: venueId,
    });
    
    setIsProcessing(true);
    scraperLogger.info('ITEM_SAVING', 'Saving tournament', { tournamentId: idToUse });

    try {
      // UPDATED: Pass autoCreateSeries and autoCreateRecurring from options
      const saveResult = await saveGameDataToBackend(
        urlToUse,
        venueId,
        dataToSave,
        null,
        entityId,
        {
          autoCreateSeries: options.autoCreateSeries ?? true,
          autoCreateRecurring: options.autoCreateRecurring ?? true,
        }
      );

      const gameId = saveResult.gameId || undefined;
      const action = saveResult.action || 'CREATED';

      setResult(prev => prev ? {
        ...prev,
        status: 'success',
        message: `${action === 'UPDATED' ? 'Updated' : 'Created'} game ${gameId}`,
        savedGameId: gameId,
        selectedVenueId: venueId,
      } : null);

      scraperLogger.logSaveSuccess(idToUse, gameId || 'unknown', action === 'UPDATED' ? 'UPDATE' : 'CREATE');
      setIsProcessing(false);
      
      return { success: true, gameId };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Save failed';
      setLastErrorType('SAVE');
      
      setResult(prev => prev ? {
        ...prev,
        status: 'error',
        message: `Save failed: ${errorMessage}`,
        errorType: 'SAVE',
      } : null);

      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId: idToUse });
      setIsProcessing(false);
      
      return { success: false };
    }
  }, [result, entityId, options, updateResult]); 

  // =========================================================================
  // RESET - Clear state for new processing
  // =========================================================================
  
  const reset = useCallback(() => {
    setResult(null);
    setEnrichedData(null);
    setIsProcessing(false);
    setLastErrorType(null);
    lastTournamentIdRef.current = null;
  }, []);

  return {
    // State
    result,
    isProcessing,
    lastErrorType,
    
    // Actions
    scrape,
    save,
    retry,
    reset,
    skip,
    
    // Enriched data
    enrichedData,
    
    // Queries
    canRetry,
    canSave,
    isTerminal,
  };
};

// ===================================================================
// UTILITY EXPORTS (from useResultStateMachine)
// ===================================================================

/**
 * Check if a result can be retried
 */
export const canResultRetry = (result: ProcessingResult | null): boolean => {
  return result?.status === 'error';
};

/**
 * Check if a result is in a terminal state
 */
export const isResultTerminal = (result: ProcessingResult | null): boolean => {
  return result?.status ? TERMINAL_STATES.includes(result.status) : false;
};

/**
 * Get human-readable description of a status
 */
export const getStatusDescription = (status: ProcessingStatus): string => {
  const descriptions: Record<ProcessingStatus, string> = {
    'pending': 'Waiting to be processed',
    'scraping': 'Fetching data from source',
    'saving': 'Saving to database',
    'review': 'Awaiting user review',
    'success': 'Successfully completed',
    'warning': 'Completed with warnings',
    'error': 'Failed with error',
    'skipped': 'Skipped',
  };
  return descriptions[status] || 'Unknown status';
};

export default useSingleScrape;