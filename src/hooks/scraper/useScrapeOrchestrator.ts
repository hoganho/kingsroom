// src/hooks/scraper/useScrapeOrchestrator.ts
// FINAL: All phases integrated (1-5)
// - Phase 3: Unified save logic + doNotScrape pre-fetch handling
// - Phase 4: State machine validation (via logging, not blocking)
// - Phase 5: Status normalization + structured logging

import { useCallback, useRef } from 'react';
import { 
  IdSelectionMode, 
  ScrapeFlow, 
  ScrapeOptions, 
  AutoProcessingConfig,
  ErrorType,
} from '../../types/scraper';
import { ScrapedGameData } from '../../API';
import { UseProcessingStateResult } from './useProcessingState';
import { UseErrorTrackingResult } from './useErrorTracking';
import { fetchGameDataFromBackend, saveGameDataToBackend } from '../../services/gameService';
import { 
  checkCachedNotFoundGap, 
  checkCachedNotPublished,
  checkCachedDoNotScrape,
  ScrapeURLStatusCache 
} from '../../services/scrapeURLService';
import {
  classifyError,
  isTransientError,
  shouldStopImmediately,
  isNotFoundResponse,
  shouldPauseForDecision,
} from '../../utils/scraperErrorUtils';
import { sanitizeGameDataForPlaceholder } from '../../utils/processingResultUtils';

// Phase 5: Structured logging
import { scraperLogger } from '../../utils/scraperLogger';
// Phase 5: Status normalization
import { normalizeGameStatus, isGameSkippable } from '../../utils/statusNormalization';

// ===================================================================
// TYPES
// ===================================================================

export interface OrchestratorConfig {
  entityId: string;
  baseUrl: string;
  urlPath: string;
  scraperApiKey: string;
  options: ScrapeOptions;
  scrapeFlow: ScrapeFlow;
  autoConfig: AutoProcessingConfig;
  defaultVenueId: string;
  idSelectionMode: IdSelectionMode;
  maxId: string | null;
}

/** Result from save confirmation modal */
export interface SaveConfirmationResult {
  action: 'save' | 'cancel';
  venueId?: string;
  editedData?: ScrapedGameData;
}

/** Result from scrape options modal (for doNotScrape URLs) */
export interface ScrapeOptionsResult {
  action: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER';
  s3Key?: string;
}

export interface OrchestratorCallbacks {
  /** Called when save modal needs to open - returns result of modal */
  onNeedsSaveConfirmation: (
    tournamentId: number, 
    parsedData: ScrapedGameData,
    autoVenueId: string | undefined
  ) => Promise<SaveConfirmationResult>;
  
  /** Called when error modal needs to open - returns user decision */
  onNeedsErrorDecision: (
    tournamentId: number,
    url: string,
    errorType: ErrorType,
    errorMsg: string,
    isRetryable: boolean
  ) => Promise<{ action: 'continue' | 'stop' | 'retry' }>;
  
  /** Called when doNotScrape URL is encountered - returns user decision */
  onNeedsScrapeOptions: (
    tournamentId: number,
    url: string,
    doNotScrape: boolean,
    gameStatus: string | null,
    hasS3Cache: boolean
  ) => Promise<ScrapeOptionsResult>;
  
  /** Called when API key error occurs */
  onApiKeyError: (message: string) => void;
  
  /** Called when processing completes to refresh status */
  onProcessingComplete: () => Promise<void>;
  
  /** Called to update next ID after processing */
  onUpdateNextId: (newNextId: string) => void;
}

export interface OrchestratorResult {
  processQueue: (
    queue: number[], 
    controller: AbortController, 
    cache: ScrapeURLStatusCache
  ) => Promise<void>;
}

// ===================================================================
// CONSTANTS
// ===================================================================

const THROTTLE_DELAY_MS = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useScrapeOrchestrator = (
  config: OrchestratorConfig,
  callbacks: OrchestratorCallbacks,
  processingState: UseProcessingStateResult,
  errorTracking: UseErrorTrackingResult
): OrchestratorResult => {
  
  const {
    entityId,
    baseUrl,
    urlPath,
    scraperApiKey,
    options,
    scrapeFlow,
    autoConfig,
    defaultVenueId,
    idSelectionMode,
    maxId: maxIdStr,
  } = config;
  
  const {
    onNeedsSaveConfirmation,
    onNeedsErrorDecision,
    onNeedsScrapeOptions,
    onApiKeyError,
    onProcessingComplete,
    onUpdateNextId,
  } = callbacks;

  const shouldContinueRef = useRef(true);

  // =========================================================================
  // FETCH WITH RETRY
  // =========================================================================
  
  const fetchWithRetry = useCallback(async (
    tournamentId: number,
    url: string,
    forceRefresh: boolean,
    retries = MAX_RETRIES
  ): Promise<any> => {
    let lastError: any;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (attempt > 0) {
          scraperLogger.info('RETRY_ATTEMPT', `Retry attempt ${attempt + 1}/${retries}`, { tournamentId });
        }
        return await fetchGameDataFromBackend(url, forceRefresh, scraperApiKey, entityId);
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || error?.toString() || '';
        
        const isRateLimited = 
          errorMessage.includes('429') || 
          errorMessage.includes('Rate Exceeded') ||
          errorMessage.includes('TooManyRequests');
        
        if (isRateLimited && attempt < retries - 1) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          scraperLogger.warn('RATE_LIMIT_HIT', `Rate limited, waiting ${backoffMs}ms`, { 
            tournamentId, 
            payload: { attempt, backoffMs } 
          });
          await delay(backoffMs);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError;
  }, [scraperApiKey, entityId]);

  // =========================================================================
  // UNIFIED CONFIRM AND SAVE (Phase 3)
  // =========================================================================
  
  const confirmAndSave = useCallback(async (
    tournamentId: number,
    url: string,
    parsedData: ScrapedGameData,
    options_: {
      skipManualReviews: boolean;
      isNotPublished: boolean;
      isDoNotScrape?: boolean;
      forcePlaceholder?: boolean;
    }
  ): Promise<{ success: boolean; action: 'saved' | 'cancelled' | 'error'; message: string }> => {
    
    const { skipManualReviews, isNotPublished, isDoNotScrape, forcePlaceholder } = options_;
    
    // Validation - allow null gameVariant only for NOT_PUBLISHED or placeholder saves
    const allowNullVariant = isNotPublished || forcePlaceholder;
    if ((parsedData as any)._enumErrors?.length > 0 || (parsedData.gameVariant === null && !allowNullVariant)) {
      processingState.setResultError(tournamentId, 'Cannot save - invalid enum value', 'ENUM_VALIDATION');
      scraperLogger.error('ITEM_SAVE_ERROR', 'Invalid enum value', { tournamentId });
      return { success: false, action: 'error', message: 'Invalid enum value' };
    }

    const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
    let venueIdToUse = '';
    let dataToSave = parsedData;

    // Sanitize data for NOT_PUBLISHED or placeholder saves
    if (isNotPublished || forcePlaceholder) {
      dataToSave = sanitizeGameDataForPlaceholder(parsedData);
    }

    if (skipManualReviews) {
      // Auto-save using best guess
      venueIdToUse = autoVenueId || defaultVenueId;
    } else {
      // Set review status before modal
      const reviewMessage = isNotPublished || forcePlaceholder
        ? 'Review placeholder save...' 
        : isDoNotScrape 
        ? 'Review restricted tournament...'
        : 'Awaiting venue confirmation...';
      processingState.setResultReview(tournamentId, reviewMessage, dataToSave);
      scraperLogger.info('MODAL_OPEN', 'Opening save confirmation modal', { tournamentId });
      
      // Open modal via callback
      const result = await onNeedsSaveConfirmation(
        tournamentId,
        dataToSave,
        autoVenueId
      );
      
      scraperLogger.info('MODAL_DECISION', `User chose: ${result.action}`, { 
        tournamentId, 
        payload: { action: result.action } 
      });
      
      if (result.action === 'cancel') {
        processingState.setResultSkipped(tournamentId, 'Cancelled by user', parsedData);
        scraperLogger.logSkipped(tournamentId, 'Cancelled by user');
        return { success: false, action: 'cancelled', message: 'Cancelled by user' };
      }
      
      venueIdToUse = result.venueId || defaultVenueId;
      if (result.editedData) {
        dataToSave = result.editedData;
      }
    }

    // Perform save
    processingState.setResultSaving(tournamentId, dataToSave);
    scraperLogger.info('ITEM_SAVING', 'Saving to database', { tournamentId });
    
    try {
      const saveResult = await saveGameDataToBackend(url, venueIdToUse, dataToSave, null, entityId);
      const isUpdate = saveResult.action === 'UPDATE';
      const message = isUpdate 
        ? `Updated game ${saveResult.gameId}` 
        : `Created game ${saveResult.gameId}`;
      
      processingState.setResultSuccess(tournamentId, message, dataToSave, saveResult.gameId || undefined);
      scraperLogger.logSaveSuccess(tournamentId, saveResult.gameId || 'unknown', isUpdate ? 'UPDATE' : 'CREATE');
      return { success: true, action: 'saved', message };
    } catch (error: any) {
      const errorMessage = `Save failed: ${error.message}`;
      processingState.setResultError(tournamentId, errorMessage, 'SAVE');
      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId });
      return { success: false, action: 'error', message: errorMessage };
    }
  }, [processingState, defaultVenueId, entityId, onNeedsSaveConfirmation]);

  // =========================================================================
  // HANDLE DO NOT SCRAPE (Phase 3)
  // =========================================================================
  
  const handleDoNotScrape = useCallback(async (
    tournamentId: number,
    url: string,
    cachedStatus: { doNotScrape: boolean; gameStatus: string | null; hasS3Cache: boolean }
  ): Promise<'continue' | 'stop'> => {
    
    // Phase 5: Use normalized status
    const normalizedStatus = normalizeGameStatus(cachedStatus.gameStatus);
    
    scraperLogger.logDoNotScrapeDetected(tournamentId, cachedStatus.gameStatus);
    
    // If skipManualReviews is on, auto-handle based on gameStatus
    if (options.skipManualReviews) {
      if (isGameSkippable(cachedStatus.gameStatus)) {
        // Auto-save as placeholder with complete data
        const placeholderData: ScrapedGameData = {
          __typename: "ScrapedGameData",
          name: `Tournament ${tournamentId} (Restricted)`,
          tournamentId,
          sourceUrl: url,
          gameStatus: normalizedStatus as any,
          doNotScrape: true,
          skipped: false,
          // Required fields with sensible defaults
          gameVariant: 'NOT_PUBLISHED' as any,
          hasGuarantee: false,
          isSeries: false,
          isSatellite: false,
          isRegular: false,
          isMainEvent: false,
          finalDay: false,
          buyIn: 0,
          rake: 0,
          guaranteeAmount: 0,
          totalUniquePlayers: 0,
          totalInitialEntries: 0,
          totalEntries: 0,
          totalRebuys: 0,
          totalAddons: 0,
          entries: [],
          results: [],
          seating: [],
          levels: [],
        } as ScrapedGameData;
        
        scraperLogger.info('DO_NOT_SCRAPE_DECISION', 'Auto-saving as placeholder', { 
          tournamentId, 
          payload: { decision: 'AUTO_PLACEHOLDER', normalizedStatus } 
        });
        
        await confirmAndSave(tournamentId, url, placeholderData, {
          skipManualReviews: true,
          isNotPublished: true,
          isDoNotScrape: true,
          forcePlaceholder: true,
        });
        return 'continue';
      } else {
        // Skip entirely if doNotScrape but not skippable status
        processingState.setResultSkipped(tournamentId, 'Do Not Scrape (auto-skip)', undefined);
        scraperLogger.logSkipped(tournamentId, 'Do Not Scrape (auto-skip)');
        return 'continue';
      }
    }
    
    // Manual mode - open ScrapeOptionsModal
    processingState.setResultReview(tournamentId, 'Restricted URL - choose action...', undefined);
    scraperLogger.info('MODAL_OPEN', 'Opening scrape options modal', { tournamentId });
    
    const decision = await onNeedsScrapeOptions(
      tournamentId,
      url,
      cachedStatus.doNotScrape,
      cachedStatus.gameStatus,
      cachedStatus.hasS3Cache
    );
    
    scraperLogger.info('DO_NOT_SCRAPE_DECISION', `User chose: ${decision.action}`, { 
      tournamentId, 
      payload: { decision: decision.action } 
    });
    
    switch (decision.action) {
      case 'SKIP':
        processingState.setResultSkipped(tournamentId, 'Do Not Scrape (user skipped)', undefined);
        scraperLogger.logSkipped(tournamentId, 'Do Not Scrape (user skipped)');
        return 'continue';
        
      case 'SAVE_PLACEHOLDER': {
        // Create complete placeholder data with all required fields
        const placeholderData: ScrapedGameData = {
          __typename: "ScrapedGameData",
          name: `Tournament ${tournamentId} (Placeholder)`,
          tournamentId,
          sourceUrl: url,
          gameStatus: normalizedStatus as any,
          doNotScrape: true,
          skipped: false,
          // Required fields with sensible defaults
          gameVariant: 'NOT_PUBLISHED' as any,
          hasGuarantee: false,
          isSeries: false,
          isSatellite: false,
          isRegular: false,
          isMainEvent: false,
          finalDay: false,
          buyIn: 0,
          rake: 0,
          guaranteeAmount: 0,
          totalUniquePlayers: 0,
          totalInitialEntries: 0,
          totalEntries: 0,
          totalRebuys: 0,
          totalAddons: 0,
          entries: [],
          results: [],
          seating: [],
          levels: [],
        } as ScrapedGameData;
        
        // User already confirmed intent - skip the save confirmation modal
        await confirmAndSave(tournamentId, url, placeholderData, {
          skipManualReviews: true,
          isNotPublished: true,
          isDoNotScrape: true,
          forcePlaceholder: true,
        });
        return 'continue';
      }
        
      case 'S3':
        // Fetch from S3 cache - will be handled in main loop with forceRefresh=false
        return 'continue';
        
      case 'LIVE':
        // User wants to force scrape despite doNotScrape - proceed with fetch
        return 'continue';
        
      default:
        return 'continue';
    }
  }, [options.skipManualReviews, processingState, onNeedsScrapeOptions, confirmAndSave]);

  // =========================================================================
  // HANDLE FETCH SUCCESS
  // =========================================================================
  
  const handleFetchSuccess = useCallback(async (
    tournamentId: number,
    url: string,
    parsedData: ScrapedGameData
  ): Promise<void> => {
    // Phase 5: Use normalized status
    const normalizedGameStatus = normalizeGameStatus(parsedData.gameStatus);
    const isNotPublished = normalizedGameStatus === 'NOT_PUBLISHED';
    const isDoNotScrape = (parsedData as any).skipped && (parsedData as any).skipReason === 'DO_NOT_SCRAPE';

    scraperLogger.logFetchSuccess(tournamentId, parsedData.s3Key ? 'S3_CACHE' : 'LIVE', parsedData.name);

    // 1. Handle DO_NOT_SCRAPE response from Lambda
    if (isDoNotScrape && !options.ignoreDoNotScrape) {
      processingState.setResultSkipped(tournamentId, 'Do Not Scrape', parsedData);
      scraperLogger.logSkipped(tournamentId, 'Do Not Scrape (from Lambda)');
      return;
    }

    // 2. Handle NOT_PUBLISHED
    if (isNotPublished) {
      if (scrapeFlow === 'scrape') {
        processingState.setResultSkipped(tournamentId, 'NOT_PUBLISHED', parsedData);
        scraperLogger.logSkipped(tournamentId, 'NOT_PUBLISHED');
        return;
      }
      // Save as placeholder
      await confirmAndSave(tournamentId, url, parsedData, {
        skipManualReviews: options.skipManualReviews,
        isNotPublished: true,
      });
      return;
    }

    // 3. Handle In-Progress games (using normalized status)
    if (options.skipInProgress && (normalizedGameStatus === 'RUNNING' || normalizedGameStatus === 'SCHEDULED' || normalizedGameStatus === 'CLOCK_STOPPED')) {
      processingState.setResultSkipped(tournamentId, normalizedGameStatus, parsedData);
      scraperLogger.logSkipped(tournamentId, `In-progress: ${normalizedGameStatus}`);
      return;
    }

    // 4. Scrape Only Mode - don't save
    if (scrapeFlow === 'scrape') {
      const enumWarning = (parsedData as any)._enumErrorMessage;
      if (enumWarning) {
        processingState.setResultWarning(tournamentId, `Scraped with warnings: ${enumWarning}`, parsedData);
      } else {
        processingState.setResultSuccess(tournamentId, 'Scraped (not saved)', parsedData);
      }
      return;
    }

    // 5. Normal Save
    await confirmAndSave(tournamentId, url, parsedData, {
      skipManualReviews: options.skipManualReviews,
      isNotPublished: false,
    });
  }, [options, scrapeFlow, processingState, confirmAndSave]);

  // =========================================================================
  // HANDLE FETCH ERROR
  // =========================================================================
  
  const handleFetchError = useCallback(async (
    tournamentId: number,
    url: string,
    errorMsg: string,
    parsedData: any
  ): Promise<void> => {
    const errorType = classifyError(errorMsg, parsedData);
    
    scraperLogger.logFetchError(tournamentId, errorMsg, errorType);
    
    if (isNotFoundResponse(parsedData, errorMsg)) {
      errorTracking.incrementNotFoundError();
    } else {
      errorTracking.incrementGenericError();
    }

    // Stop immediately on auth errors
    if (shouldStopImmediately(errorType)) {
      processingState.setResultError(tournamentId, `AUTH ERROR: ${errorMsg}`, errorType);
      scraperLogger.error('AUTH_ERROR', 'Authentication error - stopping', { tournamentId });
      onApiKeyError("ScraperAPI Key is invalid or unauthorized. Processing stopped.");
      processingState.stopProcessing();
      shouldContinueRef.current = false;
      return;
    }

    // Auto-retry transient errors once
    if (isTransientError(errorType) && autoConfig.autoRetryTransientErrors && errorTracking.counters.consecutiveErrors === 1) {
      await delay(autoConfig.retryDelayMs);
    }

    // Check if should pause for user decision
    if (shouldPauseForDecision(errorTracking.counters, autoConfig, errorType, idSelectionMode === 'auto') && !options.skipManualReviews) {
      processingState.pauseProcessing();
      scraperLogger.info('MODAL_OPEN', 'Opening error handling modal', { tournamentId });
      
      const decision = await onNeedsErrorDecision(
        tournamentId,
        url,
        errorType,
        errorMsg,
        isTransientError(errorType)
      );
      
      scraperLogger.info('MODAL_DECISION', `User chose: ${decision.action}`, { 
        tournamentId, 
        payload: { action: decision.action } 
      });
      
      processingState.resumeProcessing();
      
      if (decision.action === 'stop') {
        processingState.stopProcessing();
        shouldContinueRef.current = false;
        return;
      }
    }

    processingState.setResultError(tournamentId, errorMsg, errorType);
  }, [errorTracking, processingState, autoConfig, idSelectionMode, options, onApiKeyError, onNeedsErrorDecision]);

  // =========================================================================
  // MAIN PROCESS QUEUE
  // =========================================================================
  
  const processQueue = useCallback(async (
    initialQueue: number[],
    controller: AbortController,
    cache: ScrapeURLStatusCache
  ): Promise<void> => {
    const signal = controller.signal;
    shouldContinueRef.current = true;

    scraperLogger.logQueueBuilt(initialQueue, idSelectionMode);
    scraperLogger.info('PROCESSING_START', `Starting processing of ${initialQueue.length} IDs`, {
      payload: { 
        mode: idSelectionMode, 
        baseUrl, 
        urlPath,
        cacheSize: Object.keys(cache).length 
      }
    });

    // Stats for final logging
    const stats = { total: 0, success: 0, errors: 0, skipped: 0 };

    try {
      const maxId = maxIdStr ? parseInt(maxIdStr) : null;
      let autoFrontier = idSelectionMode === 'auto' ? Math.max(...initialQueue) : -1;
      const queue = [...initialQueue].sort((a, b) => a - b);
      const processedIds = new Set<number>();
      const queuedIds = new Set<number>(initialQueue);

      // Helper to extend frontier in auto mode
      const maybeExtendFrontier = (processedId: number) => {
        if (idSelectionMode !== 'auto' || signal.aborted || processedId !== autoFrontier) return;
        
        let nextId = autoFrontier + 1;
        
        while (nextId <= (maxId || Infinity)) {
          const shouldSkipNotFound = options.skipNotFoundGaps && checkCachedNotFoundGap(cache, nextId);
          const shouldSkipNotPublished = options.skipNotPublished && checkCachedNotPublished(cache, nextId);
          
          if (!shouldSkipNotFound && !shouldSkipNotPublished) break;
          nextId++;
        }
        
        if (maxId && nextId > maxId) {
          scraperLogger.info('AUTO_MAX_REACHED', `Max ID ${maxId} reached`, { payload: { maxId } });
          return;
        }
        if (queuedIds.has(nextId) || processedIds.has(nextId)) return;
        
        queue.push(nextId);
        queuedIds.add(nextId);
        autoFrontier = nextId;
        processingState.addToQueue(nextId);
        scraperLogger.info('AUTO_FRONTIER_EXTEND', `Extended frontier to ${nextId}`, { 
          tournamentId: nextId 
        });
      };

      // Main processing loop
      for (let i = 0; i < queue.length && !signal.aborted && shouldContinueRef.current; i++) {
        const tournamentId = queue[i];
        
        if (processedIds.has(tournamentId)) continue;
        processedIds.add(tournamentId);
        stats.total++;

        if (idSelectionMode === 'auto' && maxId && tournamentId > maxId) break;

        const url = `${baseUrl}${urlPath}${tournamentId}`;

        // Ensure result exists for simplified view
        if (!processingState.results.some(r => r.id === tournamentId)) {
          processingState.addToQueue(tournamentId);
        }

        // Check doNotScrape BEFORE FETCHING
        const cachedStatus = checkCachedDoNotScrape(cache, tournamentId);
        
        if (cachedStatus?.doNotScrape && !options.ignoreDoNotScrape) {
          const decision = await handleDoNotScrape(tournamentId, url, cachedStatus);
          
          if (decision === 'stop') {
            break;
          }
          
          // Check if result was already set (skipped or saved)
          const currentResult = processingState.results.find(r => r.id === tournamentId);
          if (currentResult && ['skipped', 'success', 'error'].includes(currentResult.status)) {
            if (currentResult.status === 'skipped') stats.skipped++;
            else if (currentResult.status === 'success') stats.success++;
            else stats.errors++;
            
            maybeExtendFrontier(tournamentId);
            await delay(THROTTLE_DELAY_MS);
            continue;
          }
        }

        // Start fetching
        scraperLogger.logItemStart(tournamentId, url);
        processingState.setResultScraping(tournamentId);

        try {
          const parsedData = await fetchWithRetry(tournamentId, url, !options.useS3);
          
          if (!parsedData) {
            await handleFetchError(tournamentId, url, 'No data returned from scraper', null);
            stats.errors++;
            await delay(THROTTLE_DELAY_MS);
            continue;
          }
          
          const errorMsg = (parsedData as any).error || (parsedData as any).errorMessage;
          if (errorMsg || parsedData.name === 'Error processing tournament') {
            await handleFetchError(tournamentId, url, errorMsg || 'Scraper Error', parsedData);
            stats.errors++;
            await delay(THROTTLE_DELAY_MS);
            continue;
          }

          errorTracking.resetOnSuccess();
          await handleFetchSuccess(tournamentId, url, parsedData);
          
          // Update stats based on final status
          const finalResult = processingState.results.find(r => r.id === tournamentId);
          if (finalResult?.status === 'success' || finalResult?.status === 'warning') stats.success++;
          else if (finalResult?.status === 'skipped') stats.skipped++;
          else if (finalResult?.status === 'error') stats.errors++;
          
          maybeExtendFrontier(tournamentId);

        } catch (error: any) {
          const errorMessage = error?.message || error?.toString?.() || 'Unknown error occurred';
          scraperLogger.error('PROCESSING_ERROR', `Error processing: ${errorMessage}`, { tournamentId });
          await handleFetchError(tournamentId, url, errorMessage, null);
          stats.errors++;
        }
        
        // Throttle between requests
        if (i < queue.length - 1 && !signal.aborted && shouldContinueRef.current) {
          await delay(THROTTLE_DELAY_MS);
        }
      }

      // Processing complete
      scraperLogger.logProcessingComplete(stats);
      await onProcessingComplete();
      
      if (!signal.aborted && shouldContinueRef.current) {
        processingState.stopProcessing();
        
        // Update next ID for "Next ID" mode
        if (idSelectionMode === 'next' && processedIds.size > 0) {
          const maxProcessedId = Math.max(...processedIds);
          const newNextId = String(maxProcessedId + 1);
          onUpdateNextId(newNextId);
        }
      }

    } catch (fatalError: any) {
      scraperLogger.error('PROCESSING_ERROR', `FATAL: ${fatalError.message}`, { 
        payload: { error: fatalError.message } 
      });
      processingState.stopProcessing();
      throw fatalError;
    }
  }, [
    baseUrl, urlPath, idSelectionMode, maxIdStr, options,
    fetchWithRetry, handleFetchSuccess, handleFetchError, handleDoNotScrape,
    processingState, errorTracking, onProcessingComplete, onUpdateNextId
  ]);

  return {
    processQueue,
  };
};

export default useScrapeOrchestrator;
