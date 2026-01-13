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
//
// v2.1.0 - BUGFIX:
// - FIXED: Stale closure issue in save() when called immediately after scrape()
// - ADDED: resultRef to track current status for save() validation
// - CHANGED: save() now validates against resultRef instead of stale closure

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

/**
 * States that are allowed to transition TO saving when save() is called immediately after scrape()
 * This handles the stale closure issue where React hasn't re-rendered yet
 */
const SAVEABLE_FROM_STATES: ProcessingStatus[] = ['review', 'scraping'];

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
  
  // v2.1.0 FIX: Use a ref to track the CURRENT result status
  // This avoids stale closure issues when save() is called immediately after scrape()
  const resultRef = useRef<ProcessingResult | null>(null);

  // =========================================================================
  // COMPUTED STATE (from useResultStateMachine)
  // =========================================================================
  
  const canRetry = result?.status ? RETRYABLE_STATES.includes(result.status) : false;
  const canSave = result?.status ? SAVEABLE_STATES.includes(result.status) : false;
  const isTerminal = result?.status ? TERMINAL_STATES.includes(result.status) : false;

  // =========================================================================
  // STATE UPDATE HELPER - v2.1.0: Helper to set result AND keep ref in sync
  // =========================================================================
  
  // v2.1.0: Helper to set result AND keep ref in sync
  const setResultWithRef = useCallback((newResult: ProcessingResult | null) => {
    resultRef.current = newResult;
    setResult(newResult);
  }, []);

  // =========================================================================
  // SCRAPE - Fetch and optionally enrich data
  // v2.0.0: Proper NOT_FOUND vs error handling
  // v2.1.0: Uses setResultWithRef to keep ref in sync
  // =========================================================================
  
  const scrape = useCallback(async (tournamentId: number): Promise<ScrapeResult> => {
    const url = `${baseUrl}${urlPath}${tournamentId}`;
    
    // Store for retry
    lastTournamentIdRef.current = tournamentId;
    
    // Clear previous state - v2.1.0: Use setResultWithRef
    setIsProcessing(true);
    setEnrichedData(null);
    setLastErrorType(null);
    
    const initialResult: ProcessingResult = {
      id: tournamentId,
      url,
      status: 'scraping',
      message: 'Fetching tournament data...',
    };
    setResultWithRef(initialResult);

    try {
      // =====================================================================
      // STEP 1: Fetch tournament data
      // =====================================================================
      
      const parsedData = await fetchGameDataFromBackend(
        url,
        !options.useS3, // forceRefresh
        scraperApiKey,
        entityId
      );
      
      if (!parsedData) {
        const errorType: ErrorType = 'UNKNOWN';
        setLastErrorType(errorType);
        const errorResult: ProcessingResult = {
          id: tournamentId,
          url,
          status: 'error',
          message: 'No data returned from scraper',
          errorType,
        };
        setResultWithRef(errorResult);
        scraperLogger.logFetchError(tournamentId, 'No data returned', errorType);
        setIsProcessing(false);
        return { parsedData: null, enrichedData: null, outcome: 'error', errorType };
      }
      
      // Get data source and normalize status
      const normalizedStatus = normalizeGameStatus(parsedData.gameStatus);
      const dataSource = getDataSource(parsedData);

      // =====================================================================
      // STEP 2: Handle NOT_FOUND / NOT_PUBLISHED responses (NOT errors!)
      // v2.0.0: These are normal operational responses, not errors
      // =====================================================================
      
      // Check for NOT_FOUND (empty tournament slot) - either from response or gameStatus
      if (isNotFoundGameStatus(normalizedStatus) || isNotFoundResponse(parsedData)) {
        const notFoundResult: ProcessingResult = {
          id: tournamentId,
          url,
          status: 'success',
          message: `Tournament status: ${normalizedStatus || parsedData.gameStatus}`,
          parsedData,
          dataSource,
        };
        setResultWithRef(notFoundResult);
        
        scraperLogger.logNotFound(tournamentId, normalizedStatus || 'NOT_FOUND');
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'not_found' };
      }

      // Check for NOT_PUBLISHED status
      if (isNotPublishedResponse(parsedData) || isNotPublishedGameStatus(normalizedStatus)) {
        const notPublishedResult: ProcessingResult = {
          id: tournamentId,
          url,
          status: 'success',
          message: 'Tournament not yet published',
          parsedData,
          dataSource,
        };
        setResultWithRef(notPublishedResult);
        
        scraperLogger.logNotPublished(tournamentId);
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'not_published' };
      }

      // Check for DO_NOT_SCRAPE
      const dataAsRecord = parsedData as Record<string, unknown>;
      if (dataAsRecord.skipped && dataAsRecord.skipReason === 'DO_NOT_SCRAPE') {
        const skippedResult: ProcessingResult = {
          id: tournamentId,
          url,
          status: 'skipped',
          message: 'Tournament marked as do-not-scrape',
          parsedData,
          dataSource,
        };
        setResultWithRef(skippedResult);
        
        scraperLogger.logSkipped(tournamentId, 'DO_NOT_SCRAPE');
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'skipped' };
      }

      // Check for error in parsed response
      const errorMsg = (dataAsRecord.error || dataAsRecord.errorMessage) as string | undefined;
      if (errorMsg || parsedData.name === 'Error processing tournament') {
        const errorType = classifyError(errorMsg || 'Unknown parse error');
        setLastErrorType(errorType);
        
        const errorResult: ProcessingResult = {
          id: tournamentId,
          url,
          status: 'error',
          message: errorMsg || 'Error processing tournament',
          parsedData,
          errorType,
          dataSource,
        };
        setResultWithRef(errorResult);
        
        scraperLogger.logFetchError(tournamentId, errorMsg || 'Parse error', errorType);
        setIsProcessing(false);
        return { parsedData, enrichedData: null, outcome: 'error', errorType };
      }

      // =====================================================================
      // STEP 3: Successful fetch - enrich data and set to review
      // =====================================================================
      
      let localEnrichedData: EnrichedGameDataWithContext | null = null;
      
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
      
      // v2.1.0: Use setResultWithRef to keep ref in sync
      const reviewResult: ProcessingResult = {
        id: tournamentId,
        url,
        status: 'review',
        message: 'Ready for review',
        parsedData,
        autoVenueId: autoVenueId || undefined,
        dataSource,
      };
      setResultWithRef(reviewResult);

      setIsProcessing(false);
      return { parsedData, enrichedData: localEnrichedData, outcome: 'success' };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Unknown error occurred';
      const errorType = classifyError(errorMessage);
      setLastErrorType(errorType);
      
      const errorResult: ProcessingResult = {
        id: tournamentId,
        url,
        status: 'error',
        message: errorMessage,
        errorType,
      };
      setResultWithRef(errorResult);
      
      scraperLogger.logFetchError(tournamentId, errorMessage, errorType);
      setIsProcessing(false);
      return { parsedData: null, enrichedData: null, outcome: 'error', errorType };
    }
  }, [entityId, baseUrl, urlPath, scraperApiKey, options, defaultVenueId, setResultWithRef]);

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
      const skippedResult: ProcessingResult = {
        ...result,
        status: 'skipped',
        message: reason || 'Skipped by user',
      };
      setResultWithRef(skippedResult);
    }
  }, [result, setResultWithRef]);

  // =========================================================================
  // SAVE - Save the scraped data to database
  // v2.1.0 FIX: Use resultRef instead of stale closure result
  // =========================================================================
  
  const save = useCallback(async (
    venueId: string, 
    editedData?: ScrapedGameData,
    overrideUrl?: string,
    overrideTournamentId?: number
  ): Promise<{ success: boolean; gameId?: string }> => {
    // v2.1.0 FIX: Use resultRef.current for up-to-date state
    const currentResult = resultRef.current;
    
    const urlToUse = overrideUrl || currentResult?.url;
    const idToUse = overrideTournamentId ?? currentResult?.id;
    
    if (!urlToUse || idToUse === undefined) {
      console.warn('[useSingleScrape] save() called but missing url or id');
      return { success: false };
    }

    const dataToSave = editedData || currentResult?.parsedData;
    if (!dataToSave) {
      console.warn('[useSingleScrape] save() called but no data to save');
      return { success: false };
    }
    
    // v2.1.0 FIX: Validate state transition using resultRef (not stale closure)
    // Also allow saving from states that might be current due to React batching
    if (currentResult) {
      const currentStatus = currentResult.status;
      const canSaveFromCurrentState = 
        canTransition(currentStatus, 'saving') || 
        SAVEABLE_FROM_STATES.includes(currentStatus);
      
      if (!canSaveFromCurrentState) {
        console.warn(
          '[useSingleScrape] Cannot save from state:', currentStatus,
          '(allowed:', [...SAVEABLE_FROM_STATES, ...VALID_TRANSITIONS[currentStatus] || []].join(', '), ')'
        );
        return { success: false };
      }
    }
    
    // Update state to saving
    const savingResult: ProcessingResult = {
      ...(currentResult || { id: idToUse, url: urlToUse }),
      status: 'saving',
      message: 'Saving to database...',
      selectedVenueId: venueId,
    };
    setResultWithRef(savingResult);
    
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

      const successResult: ProcessingResult = {
        ...(resultRef.current || { id: idToUse, url: urlToUse }),
        status: 'success',
        message: `${action === 'UPDATED' ? 'Updated' : 'Created'} game ${gameId}`,
        savedGameId: gameId,
        selectedVenueId: venueId,
      };
      setResultWithRef(successResult);

      scraperLogger.logSaveSuccess(idToUse, gameId || 'unknown', action === 'UPDATED' ? 'UPDATE' : 'CREATE');
      setIsProcessing(false);
      
      return { success: true, gameId };

    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Save failed';
      setLastErrorType('SAVE');
      
      const errorResult: ProcessingResult = {
        ...(resultRef.current || { id: idToUse, url: urlToUse }),
        status: 'error',
        message: `Save failed: ${errorMessage}`,
        errorType: 'SAVE',
      };
      setResultWithRef(errorResult);

      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId: idToUse });
      setIsProcessing(false);
      
      return { success: false };
    }
  }, [entityId, options, setResultWithRef]); // v2.1.0: Removed result from deps - using ref instead

  // =========================================================================
  // RESET - Clear state for new processing
  // v2.1.0: Also clears resultRef
  // =========================================================================
  
  const reset = useCallback(() => {
    setResultWithRef(null);
    setEnrichedData(null);
    setIsProcessing(false);
    setLastErrorType(null);
    lastTournamentIdRef.current = null;
  }, [setResultWithRef]);

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