// src/hooks/scraper/useScrapeOrchestrator.ts
// ===================================================================
// REFACTORED: Enrichment happens BEFORE modal/save decision
// ===================================================================

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
import { fetchGameDataFromBackend } from '../../services/gameService';
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
import { scraperLogger } from '../../utils/scraperLogger';
import { normalizeGameStatus, isGameSkippable } from '../../utils/statusNormalization';
import { 
  enrichGameData,
  scrapedDataToEnrichInput,
  isEnrichmentSuccessful,
  getEnrichmentErrorMessage,
  enrichForPipeline,
  type EnrichedGameDataWithContext,
  type PipelineEnrichmentResult,
} from '../../services/enrichmentService';

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

export interface SaveConfirmationResult {
  action: 'save' | 'cancel';
  venueId?: string;
  editedData?: ScrapedGameData;  // Keep as ScrapedGameData for modal compatibility
}

export interface ScrapeOptionsResult {
  action: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER';
  s3Key?: string;
}

export interface OrchestratorCallbacks {
  onNeedsSaveConfirmation: (
    tournamentId: number, 
    parsedData: ScrapedGameData,  // Pass as ScrapedGameData for backwards compat
    autoVenueId: string | undefined
  ) => Promise<SaveConfirmationResult>;
  
  onNeedsErrorDecision: (
    tournamentId: number,
    url: string,
    errorType: ErrorType,
    errorMsg: string,
    isRetryable: boolean
  ) => Promise<{ action: 'continue' | 'stop' | 'retry' }>;
  
  onNeedsScrapeOptions: (
    tournamentId: number,
    url: string,
    doNotScrape: boolean,
    gameStatus: string | null,
    hasS3Cache: boolean
  ) => Promise<ScrapeOptionsResult>;
  
  onApiKeyError: (message: string) => void;
  onProcessingComplete: () => Promise<void>;
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ===================================================================
// HOOK
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
  ): Promise<ScrapedGameData> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        if (attempt > 0) {
          scraperLogger.info('RETRY_ATTEMPT', `Retry attempt ${attempt + 1}/${retries}`, { tournamentId });
        }
        return await fetchGameDataFromBackend(url, forceRefresh, scraperApiKey, entityId);
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error)?.message || String(error);
        
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
  // ENRICH PARSED DATA
  // =========================================================================
  
  const enrichParsedData = useCallback(async (
    tournamentId: number,
    url: string,
    parsedData: ScrapedGameData,
    venueId: string | null
  ): Promise<EnrichedGameDataWithContext> => {
    console.log(`[Orchestrator] Enriching tournament ${tournamentId}`);
    
    try {
      const result: PipelineEnrichmentResult = await enrichForPipeline(
        parsedData,
        entityId,
        venueId,
        url
      );
      
      if (result.success) {
        console.log(`[Orchestrator] Tournament ${tournamentId} enriched:`, {
          recurringGameId: result.enrichedGame.recurringGameId || 'none',
          recurringStatus: result.metadata.recurringResolution.status,
          seriesId: result.enrichedGame.tournamentSeriesId || 'none',
          seriesStatus: result.metadata.seriesResolution.status,
          processingTimeMs: result.metadata.processingTimeMs
        });
      } else {
        console.warn(`[Orchestrator] Enrichment incomplete for ${tournamentId}:`, {
          errors: result.validation.errors
        });
      }
      
      return result.enrichedGame;
      
    } catch (error) {
      console.warn(`[Orchestrator] Enrichment error for ${tournamentId}, using raw data:`, (error as Error).message);
      
      // Return original data with context fields
      // Use nullish coalescing to handle null values
      return {
        // Required EnrichedGameData fields
        name: parsedData.name || `Tournament ${tournamentId}`,
        gameType: (parsedData.gameType as any) || 'TOURNAMENT',
        gameStatus: (parsedData.gameStatus as any) || 'SCHEDULED',
        gameStartDateTime: parsedData.gameStartDateTime || new Date().toISOString(),
        
        // Optional fields from parsedData - convert null to undefined where needed
        tournamentId: parsedData.tournamentId,
        gameVariant: parsedData.gameVariant as any,
        buyIn: parsedData.buyIn ?? undefined,
        rake: parsedData.rake ?? undefined,
        hasGuarantee: parsedData.hasGuarantee,  // EnrichedGameDataWithContext allows null
        guaranteeAmount: parsedData.guaranteeAmount ?? undefined,
        totalUniquePlayers: parsedData.totalUniquePlayers ?? undefined,
        totalEntries: parsedData.totalEntries ?? undefined,
        prizepoolPaid: parsedData.prizepoolPaid ?? undefined,
        levels: parsedData.levels,
        
        // Context fields - EnrichedGameDataWithContext allows null for these
        sourceUrl: url,
        entityId,
        venueId: venueId ?? undefined,
        venueMatch: parsedData.venueMatch,
        s3Key: parsedData.s3Key,  // Allow null
        entries: parsedData.entries,  // Allow null
        results: parsedData.results,  // Allow null
        seating: parsedData.seating,  // Allow null
      };
    }
  }, [entityId]);

  // =========================================================================
  // SAVE VIA ENRICHMENT SERVICE
  // =========================================================================

  const saveViaEnrichment = useCallback(async (
    tournamentId: number,
    url: string,
    gameData: ScrapedGameData | EnrichedGameDataWithContext,
    venueId: string,
    saveOptions: {
      isPlaceholder?: boolean;
      isNotPublished?: boolean;
      autoCreateSeries?: boolean;
      autoCreateRecurring?: boolean;
    } = {}
  ): Promise<{ success: boolean; gameId?: string; action?: string; error?: string }> => {
    
    const { 
      isPlaceholder = false, 
      isNotPublished = false,
      autoCreateSeries = false,
      autoCreateRecurring = false,
    } = saveOptions;

    try {
      const enrichInput = scrapedDataToEnrichInput(gameData as ScrapedGameData, entityId, url);
      
      if (venueId) {
        enrichInput.venue = {
          venueId,
          venueName: gameData.venueMatch?.autoAssignedVenue?.name || null,
        };
      }

      enrichInput.options = {
        saveToDatabase: true,
        autoCreateSeries,
        autoCreateRecurring,
        skipSeriesResolution: isPlaceholder || isNotPublished,
        skipRecurringResolution: isPlaceholder || isNotPublished,
        skipFinancials: isPlaceholder || isNotPublished,
        skipQueryKeys: false,
      };

      scraperLogger.info('ITEM_SAVING', 'Saving via enrichment service', { 
        tournamentId,
        payload: { hasVenue: !!venueId, isPlaceholder, isNotPublished }
      });

      const result = await enrichGameData(enrichInput);

      if (isEnrichmentSuccessful(result)) {
        const gameId = result.saveResult?.gameId || 'unknown';
        const action = result.saveResult?.action || 'CREATE';
        
        scraperLogger.logSaveSuccess(
          tournamentId, 
          gameId, 
          action === 'UPDATED' ? 'UPDATE' : 'CREATE'
        );

        return { success: true, gameId, action };
      } else {
        const errorMessage = getEnrichmentErrorMessage(result) || 'Enrichment validation failed';
        
        scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { 
          tournamentId,
          payload: { 
            validationErrors: result.validation?.errors,
            validationWarnings: result.validation?.warnings,
          }
        });

        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = (error as Error)?.message || 'Unknown enrichment error';
      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId });
      return { success: false, error: errorMessage };
    }
  }, [entityId]);

  // =========================================================================
  // CONFIRM AND SAVE
  // =========================================================================
  
  const confirmAndSave = useCallback(async (
    tournamentId: number,
    url: string,
    enrichedData: EnrichedGameDataWithContext,
    saveOptions: {
      skipManualReviews: boolean;
      isNotPublished: boolean;
      isDoNotScrape?: boolean;
      forcePlaceholder?: boolean;
    }
  ): Promise<{ success: boolean; action: 'saved' | 'cancelled' | 'error'; message: string }> => {
    
    const { skipManualReviews, isNotPublished, isDoNotScrape, forcePlaceholder } = saveOptions;
    
    const allowNullVariant = isNotPublished || forcePlaceholder;
    const dataAsRecord = enrichedData as unknown as Record<string, unknown>;
    const enumErrors = dataAsRecord._enumErrors as unknown[] | undefined;
    if ((enumErrors && enumErrors.length > 0) || (enrichedData.gameVariant === null && !allowNullVariant)) {
      processingState.setResultError(tournamentId, 'Cannot save - invalid enum value', 'ENUM_VALIDATION');
      scraperLogger.error('ITEM_SAVE_ERROR', 'Invalid enum value', { tournamentId });
      return { success: false, action: 'error', message: 'Invalid enum value' };
    }

    const autoVenueId = enrichedData.venueMatch?.autoAssignedVenue?.id;
    let venueIdToUse = '';
    let dataToSave: ScrapedGameData | EnrichedGameDataWithContext = enrichedData;

    if (isNotPublished || forcePlaceholder) {
      dataToSave = sanitizeGameDataForPlaceholder(enrichedData as unknown as ScrapedGameData);
    }

    if (skipManualReviews) {
      venueIdToUse = autoVenueId || defaultVenueId;
    } else {
      const reviewMessage = isNotPublished || forcePlaceholder
        ? 'Review placeholder save...' 
        : isDoNotScrape 
        ? 'Review restricted tournament...'
        : 'Awaiting venue confirmation...';
      
      // Pass as ScrapedGameData for modal compatibility (the enriched data has all the fields)
      processingState.setResultReview(tournamentId, reviewMessage, enrichedData as unknown as ScrapedGameData);
      scraperLogger.info('MODAL_OPEN', 'Opening save confirmation modal', { tournamentId });
      
      // Modal receives data with enrichment fields included
      const result = await onNeedsSaveConfirmation(
        tournamentId, 
        enrichedData as unknown as ScrapedGameData, 
        autoVenueId
      );
      
      scraperLogger.info('MODAL_DECISION', `User chose: ${result.action}`, { 
        tournamentId, 
        payload: { action: result.action } 
      });
      
      if (result.action === 'cancel') {
        processingState.setResultSkipped(tournamentId, 'Cancelled by user', enrichedData as unknown as ScrapedGameData);
        scraperLogger.logSkipped(tournamentId, 'Cancelled by user');
        return { success: false, action: 'cancelled', message: 'Cancelled by user' };
      }
      
      venueIdToUse = result.venueId || defaultVenueId;
      if (result.editedData) {
        dataToSave = result.editedData;
      }
    }

    processingState.setResultSaving(tournamentId, dataToSave as ScrapedGameData);
    scraperLogger.info('ITEM_SAVING', 'Saving via enrichment service', { tournamentId });
    
    const saveResult = await saveViaEnrichment(
      tournamentId,
      url,
      dataToSave,
      venueIdToUse,
      {
        isPlaceholder: forcePlaceholder,
        isNotPublished,
        autoCreateSeries: false,
        autoCreateRecurring: false,
      }
    );

    if (saveResult.success) {
      const isUpdate = saveResult.action === 'UPDATE';
      const message = isUpdate 
        ? `Updated game ${saveResult.gameId}` 
        : `Created game ${saveResult.gameId}`;
      
      processingState.setResultSuccess(tournamentId, message, dataToSave as ScrapedGameData, saveResult.gameId || undefined);
      scraperLogger.logSaveSuccess(tournamentId, saveResult.gameId || 'unknown', isUpdate ? 'UPDATE' : 'CREATE');
      return { success: true, action: 'saved', message };
    } else {
      const errorMessage = `Save failed: ${saveResult.error || 'Unknown error'}`;
      processingState.setResultError(tournamentId, errorMessage, 'SAVE');
      scraperLogger.error('ITEM_SAVE_ERROR', errorMessage, { tournamentId });
      return { success: false, action: 'error', message: errorMessage };
    }
  }, [processingState, defaultVenueId, onNeedsSaveConfirmation, saveViaEnrichment]);

  // =========================================================================
  // HANDLE DO NOT SCRAPE
  // =========================================================================
  
  const handleDoNotScrape = useCallback(async (
    tournamentId: number,
    url: string,
    cachedStatus: { doNotScrape: boolean; gameStatus: string | null; hasS3Cache: boolean }
  ): Promise<'continue' | 'stop'> => {
    
    const normalizedStatus = normalizeGameStatus(cachedStatus.gameStatus);
    
    scraperLogger.logDoNotScrapeDetected(tournamentId, cachedStatus.gameStatus);
    
    if (options.skipManualReviews) {
      if (isGameSkippable(cachedStatus.gameStatus)) {
        const placeholderData: EnrichedGameDataWithContext = {
          name: `Tournament ${tournamentId} (Restricted)`,
          tournamentId,
          sourceUrl: url,
          entityId,
          gameType: 'TOURNAMENT' as any,
          gameStatus: normalizedStatus as any,
          gameStartDateTime: new Date().toISOString(),
          doNotScrape: true,
          gameVariant: 'NOT_PUBLISHED' as any,
          hasGuarantee: false,
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
        };
        
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
        processingState.setResultSkipped(tournamentId, 'Do Not Scrape (auto-skip)', undefined);
        scraperLogger.logSkipped(tournamentId, 'Do Not Scrape (auto-skip)');
        return 'continue';
      }
    }
    
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
        const placeholderData: EnrichedGameDataWithContext = {
          name: `Tournament ${tournamentId} (Placeholder)`,
          tournamentId,
          sourceUrl: url,
          entityId,
          gameType: 'TOURNAMENT' as any,
          gameStatus: normalizedStatus as any,
          gameStartDateTime: new Date().toISOString(),
          doNotScrape: true,
          gameVariant: 'NOT_PUBLISHED' as any,
          hasGuarantee: false,
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
        };
        
        await confirmAndSave(tournamentId, url, placeholderData, {
          skipManualReviews: true,
          isNotPublished: true,
          isDoNotScrape: true,
          forcePlaceholder: true,
        });
        return 'continue';
      }
        
      case 'S3':
      case 'LIVE':
      default:
        return 'continue';
    }
  }, [entityId, options.skipManualReviews, processingState, onNeedsScrapeOptions, confirmAndSave]);

  // =========================================================================
  // HANDLE FETCH SUCCESS
  // =========================================================================
  
  const handleFetchSuccess = useCallback(async (
    tournamentId: number,
    url: string,
    parsedData: ScrapedGameData
  ): Promise<void> => {
    const normalizedGameStatus = normalizeGameStatus(parsedData.gameStatus);
    const isNotPublished = normalizedGameStatus === 'NOT_PUBLISHED';
    const dataAsRecord = parsedData as Record<string, unknown>;
    const isDoNotScrape = dataAsRecord.skipped && dataAsRecord.skipReason === 'DO_NOT_SCRAPE';

    scraperLogger.logFetchSuccess(tournamentId, parsedData.s3Key ? 'S3_CACHE' : 'LIVE', parsedData.name);

    if (isDoNotScrape && !options.ignoreDoNotScrape) {
      processingState.setResultSkipped(tournamentId, 'Do Not Scrape', parsedData);
      scraperLogger.logSkipped(tournamentId, 'Do Not Scrape (from Lambda)');
      return;
    }

    if (isNotPublished) {
      if (scrapeFlow === 'scrape') {
        processingState.setResultSkipped(tournamentId, 'NOT_PUBLISHED', parsedData);
        scraperLogger.logSkipped(tournamentId, 'NOT_PUBLISHED');
        return;
      }
      const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
      const enrichedData = await enrichParsedData(tournamentId, url, parsedData, autoVenueId || defaultVenueId);
      await confirmAndSave(tournamentId, url, enrichedData, {
        skipManualReviews: options.skipManualReviews,
        isNotPublished: true,
      });
      return;
    }

    if (options.skipInProgress && (normalizedGameStatus === 'RUNNING' || normalizedGameStatus === 'SCHEDULED' || normalizedGameStatus === 'CLOCK_STOPPED')) {
      processingState.setResultSkipped(tournamentId, normalizedGameStatus, parsedData);
      scraperLogger.logSkipped(tournamentId, `In-progress: ${normalizedGameStatus}`);
      return;
    }

    if (scrapeFlow === 'scrape') {
      const enumWarning = dataAsRecord._enumErrorMessage as string | undefined;
      if (enumWarning) {
        processingState.setResultWarning(tournamentId, `Scraped with warnings: ${enumWarning}`, parsedData);
      } else {
        processingState.setResultSuccess(tournamentId, 'Scraped (not saved)', parsedData);
      }
      return;
    }

    // MAIN SAVE FLOW: ENRICH BEFORE SAVE
    const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
    const venueIdForEnrichment = autoVenueId || defaultVenueId || null;
    
    const enrichedData = await enrichParsedData(tournamentId, url, parsedData, venueIdForEnrichment);
    
    await confirmAndSave(tournamentId, url, enrichedData, {
      skipManualReviews: options.skipManualReviews,
      isNotPublished: false,
    });
  }, [options, scrapeFlow, defaultVenueId, processingState, enrichParsedData, confirmAndSave]);

  // =========================================================================
  // HANDLE FETCH ERROR
  // =========================================================================
  
  const handleFetchError = useCallback(async (
    tournamentId: number,
    url: string,
    errorMsg: string,
    parsedData: ScrapedGameData | null
  ): Promise<void> => {
    const errorType = classifyError(errorMsg, parsedData);
    
    scraperLogger.logFetchError(tournamentId, errorMsg, errorType);
    
    if (isNotFoundResponse(parsedData, errorMsg)) {
      errorTracking.incrementNotFoundError();
    } else {
      errorTracking.incrementGenericError();
    }

    if (shouldStopImmediately(errorType)) {
      processingState.setResultError(tournamentId, `AUTH ERROR: ${errorMsg}`, errorType);
      scraperLogger.error('AUTH_ERROR', 'Authentication error - stopping', { tournamentId });
      onApiKeyError("ScraperAPI Key is invalid or unauthorized. Processing stopped.");
      processingState.stopProcessing();
      shouldContinueRef.current = false;
      return;
    }

    if (isTransientError(errorType) && autoConfig.autoRetryTransientErrors && errorTracking.counters.consecutiveErrors === 1) {
      await delay(autoConfig.retryDelayMs);
    }

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

    const stats = { total: 0, success: 0, errors: 0, skipped: 0 };

    try {
      const maxId = maxIdStr ? parseInt(maxIdStr) : null;
      let autoFrontier = idSelectionMode === 'auto' ? Math.max(...initialQueue) : -1;
      const queue = [...initialQueue].sort((a, b) => a - b);
      const processedIds = new Set<number>();
      const queuedIds = new Set<number>(initialQueue);

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

      for (let i = 0; i < queue.length && !signal.aborted && shouldContinueRef.current; i++) {
        const tournamentId = queue[i];
        
        if (processedIds.has(tournamentId)) continue;
        processedIds.add(tournamentId);
        stats.total++;

        if (idSelectionMode === 'auto' && maxId && tournamentId > maxId) break;

        const url = `${baseUrl}${urlPath}${tournamentId}`;

        if (!processingState.results.some(r => r.id === tournamentId)) {
          processingState.addToQueue(tournamentId);
        }

        const cachedStatus = checkCachedDoNotScrape(cache, tournamentId);
        
        if (cachedStatus?.doNotScrape && !options.ignoreDoNotScrape) {
          const decision = await handleDoNotScrape(tournamentId, url, cachedStatus);
          
          if (decision === 'stop') break;
          
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
          
          const dataAsRecord = parsedData as Record<string, unknown>;
          const errorMsg = (dataAsRecord.error || dataAsRecord.errorMessage) as string | undefined;
          if (errorMsg || parsedData.name === 'Error processing tournament') {
            await handleFetchError(tournamentId, url, errorMsg || 'Scraper Error', parsedData);
            stats.errors++;
            await delay(THROTTLE_DELAY_MS);
            continue;
          }

          errorTracking.resetOnSuccess();
          await handleFetchSuccess(tournamentId, url, parsedData);
          
          const finalResult = processingState.results.find(r => r.id === tournamentId);
          if (finalResult?.status === 'success' || finalResult?.status === 'warning') stats.success++;
          else if (finalResult?.status === 'skipped') stats.skipped++;
          else if (finalResult?.status === 'error') stats.errors++;
          
          maybeExtendFrontier(tournamentId);

        } catch (error) {
          const errorMessage = (error as Error)?.message || String(error) || 'Unknown error occurred';
          scraperLogger.error('PROCESSING_ERROR', `Error processing: ${errorMessage}`, { tournamentId });
          await handleFetchError(tournamentId, url, errorMessage, null);
          stats.errors++;
        }
        
        if (i < queue.length - 1 && !signal.aborted && shouldContinueRef.current) {
          await delay(THROTTLE_DELAY_MS);
        }
      }

      scraperLogger.logProcessingComplete(stats);
      await onProcessingComplete();
      
      if (!signal.aborted && shouldContinueRef.current) {
        processingState.stopProcessing();
        
        if (idSelectionMode === 'next' && processedIds.size > 0) {
          const maxProcessedId = Math.max(...processedIds);
          const newNextId = String(maxProcessedId + 1);
          onUpdateNextId(newNextId);
        }
      }

    } catch (fatalError) {
      scraperLogger.error('PROCESSING_ERROR', `FATAL: ${(fatalError as Error).message}`, { 
        payload: { error: (fatalError as Error).message } 
      });
      processingState.stopProcessing();
      throw fatalError;
    }
  }, [
    baseUrl, urlPath, idSelectionMode, maxIdStr, options,
    fetchWithRetry, handleFetchSuccess, handleFetchError, handleDoNotScrape,
    processingState, errorTracking, onProcessingComplete, onUpdateNextId
  ]);

  return { processQueue };
};

export default useScrapeOrchestrator;