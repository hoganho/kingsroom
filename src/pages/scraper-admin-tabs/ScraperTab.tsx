// src/pages/scraper-admin-tabs/ScraperTab.tsx
// REFACTORED: Uses extracted hooks and utilities
// Reduced from ~1400 lines to ~450 lines

import React, { useState, useEffect, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Settings } from 'lucide-react';

// --- Types ---
import {
  ScraperTabProps,
  IdSelectionMode,
  IdSelectionParams,
  ScrapeFlow,
  ScrapeOptions,
  ProcessingResult,
  AutoProcessingConfig,
  DEFAULT_SCRAPE_OPTIONS,
  DEFAULT_ID_SELECTION_PARAMS,
  DEFAULT_AUTO_CONFIG,
} from '../../types/scraper';

// --- Hooks ---
import {
  useProcessingState,
  buildProcessingQueue,
  useErrorTracking,
  useScraperModals,
} from '../../hooks/scraper';

// --- Utils ---
import { 
  classifyError, 
  isTransientError, 
  shouldStopImmediately, 
  isNotFoundResponse, 
  shouldPauseForDecision 
} from '../../utils/scraperErrorUtils';
import { sanitizeGameDataForPlaceholder } from '../../utils/processingResultUtils';

// --- Components ---
import { CollapsibleSection } from '../../components/scraper/admin/CollapsibleSection';
import { ScraperConfig } from '../../components/scraper/admin/ScraperConfig';
import { ProgressSummary } from '../../components/scraper/admin/ProgressSummary';
import { ScraperResults } from '../../components/scraper/admin/ScraperResults';
import { ErrorHandlingModal } from '../../components/scraper/admin/ErrorHandlingModal';
import { GameDetailsModal } from '../../components/scraper/admin/ScraperModals';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { VenueModal } from '../../components/venues/VenueModal';

// --- Services ---
import { fetchGameDataFromBackend, saveGameDataToBackend } from '../../services/gameService';
import { prefetchScrapeURLStatuses, checkCachedNotPublished, checkCachedNotFoundGap, ScrapeURLStatusCache } from '../../services/scrapeURLService';

// --- Contexts & Hooks ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';

// --- API Types ---
import { Venue, ScrapedGameData } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';

const getClient = () => generateClient();

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScrapeTab: React.FC<ScraperTabProps> = ({ urlToReparse }) => {
  const { currentEntity } = useEntity();
  
  // --- Venue State ---
  const [venues, setVenues] = useState<Venue[]>([]);
  const [defaultVenueId, setDefaultVenueId] = useState<string>('');
  const [entityDefaultVenueId, setEntityDefaultVenueId] = useState<string>('');
  const [isSavingDefaultVenue, setIsSavingDefaultVenue] = useState(false);

  // --- Section State ---
  const [configSectionOpen, setConfigSectionOpen] = useState(true);

  // --- Config State ---
  const [idSelectionMode, setIdSelectionMode] = useState<IdSelectionMode>('next');
  const [idSelectionParams, setIdSelectionParams] = useState<IdSelectionParams>(DEFAULT_ID_SELECTION_PARAMS);
  const [scrapeFlow, setScrapeFlow] = useState<ScrapeFlow>('scrape');
  const [options, setOptions] = useState<ScrapeOptions>(DEFAULT_SCRAPE_OPTIONS);
  const [scraperApiKey, setScraperApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [autoConfig] = useState<AutoProcessingConfig>(DEFAULT_AUTO_CONFIG);

  // --- View State ---
  const [selectedGameDetails, setSelectedGameDetails] = useState<ScrapedGameData | null>(null);
  const [venueModalOpen, setVenueModalOpen] = useState(false);

  // --- Custom Hooks ---
  const processingState = useProcessingState({
    baseUrl: currentEntity?.gameUrlDomain || '',
    urlPath: currentEntity?.gameUrlPath || '',
    mode: idSelectionMode,
    useSimplifiedView: idSelectionMode === 'bulk' || idSelectionMode === 'range',
  });

  const errorTracking = useErrorTracking(autoConfig);
  const modals = useScraperModals();

  // --- Gap Tracker ---
  const { scrapingStatus, loading: gapLoading, getScrapingStatus, getBounds, bounds } = useGameIdTracking(currentEntity?.id);
  const highestTournamentId = scrapingStatus?.highestTournamentId ?? bounds?.highestId;

  // --- Mount tracking ---
  useEffect(() => {
    console.log('[ScraperTab] Component MOUNTED', { 
      entityId: currentEntity?.id,
      scraperApiKeyLength: scraperApiKey?.length || 0,
      nextId: idSelectionParams.nextId,
    });
    return () => {
      console.log('[ScraperTab] Component UNMOUNTING');
    };
  }, []);

  // Track nextId changes
  useEffect(() => {
    console.log('[ScraperTab] idSelectionParams.nextId CHANGED to:', idSelectionParams.nextId);
  }, [idSelectionParams.nextId]);

  // --- Effects ---
  useEffect(() => {
    if (currentEntity?.id) {
      fetchVenues();
      getScrapingStatus({ forceRefresh: false }).catch(() => getBounds().catch(() => {}));
    }
  }, [currentEntity?.id]);

  useEffect(() => {
    if (currentEntity?.defaultVenueId) {
      setDefaultVenueId(currentEntity.defaultVenueId);
      setEntityDefaultVenueId(currentEntity.defaultVenueId);
    } else {
      setDefaultVenueId('');
      setEntityDefaultVenueId('');
    }
  }, [currentEntity?.defaultVenueId]);

  useEffect(() => {
    if (urlToReparse) {
      const match = urlToReparse.match(/[?&]id=(\d+)/);
      if (match) {
        setIdSelectionMode('range');
        setIdSelectionParams(p => ({ ...p, rangeString: match[1] }));
      }
    }
  }, [urlToReparse]);

  // --- Data Fetching ---
  const fetchVenues = async () => {
    if (!currentEntity) return;
    try {
      const client = getClient();
      const response = await client.graphql({
        query: listVenuesForDropdown,
        variables: { filter: { entityId: { eq: currentEntity.id } }, limit: 100 }
      }) as any;
      setVenues((response.data?.listVenues?.items as Venue[]).filter(Boolean));
    } catch (error) {
      console.error('Error fetching venues:', error);
    }
  };

  const handleSaveDefaultVenue = async (venueId: string) => {
    if (!currentEntity || !venueId) return;
    setIsSavingDefaultVenue(true);
    try {
      const client = getClient();
      await client.graphql({
        query: `mutation UpdateEntity($input: UpdateEntityInput!) {
          updateEntity(input: $input) { id defaultVenueId }
        }`,
        variables: { input: { id: currentEntity.id, defaultVenueId: venueId, _version: (currentEntity as any)._version } }
      });
      setEntityDefaultVenueId(venueId);
    } catch (error) {
      console.error('Error updating entity default venue:', error);
    } finally {
      setIsSavingDefaultVenue(false);
    }
  };

  // --- Skip Summary State ---
  const [skipSummary, setSkipSummary] = useState<{
    notFound: number[];
    notPublished: number[];
  } | null>(null);

  // --- Processing ---
  const handleStartProcessing = useCallback(async () => {
    if (!currentEntity) return;
    
    // Collapse config section immediately
    setConfigSectionOpen(false);
    setSkipSummary(null);
    
    const queue = buildProcessingQueue({
      mode: idSelectionMode,
      highestTournamentId: highestTournamentId ?? null,
      bulkCount: idSelectionParams.bulkCount,
      rangeString: idSelectionParams.rangeString,
      nextId: idSelectionParams.nextId,
      gaps: scrapingStatus?.gaps,
    });
    
    console.log('[ScraperTab] Queue built:', {
      mode: idSelectionMode,
      nextIdParam: idSelectionParams.nextId,
      highestTournamentId,
      queueContents: JSON.stringify(queue),
    });
    
    if (queue.length === 0) {
      alert("No IDs to process with the current selection.");
      setConfigSectionOpen(true); // Re-open if nothing to process
      return;
    }
    
    setApiKeyError(null);
    errorTracking.resetAll();
    
    // Pre-fetch ScrapeURL statuses and filter out skip IDs BEFORE processing
    let filteredQueue = queue;
    let cache: ScrapeURLStatusCache = {};
    const skippedNotFound: number[] = [];
    const skippedNotPublished: number[] = [];
    
    if ((options.skipNotPublished || options.skipNotFoundGaps) && currentEntity.id) {
      try {
        cache = await prefetchScrapeURLStatuses(currentEntity.id, queue);
        
        // Filter out IDs that should be skipped
        filteredQueue = queue.filter(id => {
          if (options.skipNotFoundGaps && checkCachedNotFoundGap(cache, id)) {
            skippedNotFound.push(id);
            return false;
          }
          if (options.skipNotPublished && checkCachedNotPublished(cache, id)) {
            skippedNotPublished.push(id);
            return false;
          }
          return true;
        });
        
        // Set skip summary for UI
        if (skippedNotFound.length > 0 || skippedNotPublished.length > 0) {
          setSkipSummary({
            notFound: skippedNotFound,
            notPublished: skippedNotPublished,
          });
          console.log('[ScraperTab] Pre-filtered skip IDs:', {
            notFound: skippedNotFound,
            notPublished: skippedNotPublished,
            originalCount: queue.length,
            filteredCount: filteredQueue.length,
          });
        }
      } catch (error) {
        console.warn('[ScrapeTab] Failed to prefetch ScrapeURL statuses:', error);
      }
    }
    
    if (filteredQueue.length === 0) {
      // For 'auto' mode with maxId set, we should still start scanning new IDs
      // even if all gaps were filtered out
      if (idSelectionMode === 'auto' && idSelectionParams.maxId) {
        const startFromId = (highestTournamentId || 0) + 1;
        const maxId = parseInt(idSelectionParams.maxId);
        
        // Find first ID that's not in the skip cache
        let firstNewId = startFromId;
        while (firstNewId <= maxId) {
          const shouldSkipNotFound = options.skipNotFoundGaps && checkCachedNotFoundGap(cache, firstNewId);
          const shouldSkipNotPublished = options.skipNotPublished && checkCachedNotPublished(cache, firstNewId);
          
          if (!shouldSkipNotFound && !shouldSkipNotPublished) {
            break;
          }
          firstNewId++;
        }
        
        if (firstNewId <= maxId) {
          console.log('[ScraperTab] Auto mode: All gaps filtered, starting from new ID:', firstNewId);
          filteredQueue = [firstNewId];
        } else {
          alert(`All IDs up to ${maxId} were skipped based on your skip options.`);
          setConfigSectionOpen(true);
          return;
        }
      } else {
        // For other modes, show alert and return
        if (idSelectionMode === 'next' && queue.length > 0) {
          const maxSkippedId = Math.max(...queue);
          setIdSelectionParams(prev => ({
            ...prev,
            nextId: String(maxSkippedId + 1)
          }));
        }
        alert(`All ${queue.length} IDs were skipped based on your skip options.`);
        setConfigSectionOpen(true);
        return;
      }
    }
    
    // startProcessing now returns the abort controller directly
    console.log('[ScraperTab] Calling processQueue with filteredQueue:', JSON.stringify(filteredQueue));
    const controller = processingState.startProcessing(filteredQueue);
    processQueue(filteredQueue, controller, cache);
  }, [currentEntity, idSelectionMode, idSelectionParams, highestTournamentId, scrapingStatus, options]);

  const handleStopProcessing = useCallback(() => {
    processingState.stopProcessing();
    getScrapingStatus({ forceRefresh: true }).catch(() => {});
  }, [processingState, getScrapingStatus]);

  // --- Core Processing Logic ---
  // --- Rate Limiting Config ---
  const THROTTLE_DELAY_MS = 500; // Delay between requests (500ms = 2 requests/second)
  const MAX_RETRIES = 3;
  const INITIAL_BACKOFF_MS = 1000; // Start with 1 second backoff
  
  // Helper: delay function
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Helper: fetch with retry and exponential backoff
  const fetchWithRetry = async (
    url: string, 
    forceRefresh: boolean, 
    apiKey: string | null, 
    entityId: string | undefined,
    retries = MAX_RETRIES
  ): Promise<any> => {
    let lastError: any;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetchGameDataFromBackend(url, forceRefresh, apiKey, entityId);
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || error?.toString() || '';
        
        // Check for rate limit errors (429 or "Rate Exceeded")
        const isRateLimited = errorMessage.includes('429') || 
                             errorMessage.includes('Rate Exceeded') ||
                             errorMessage.includes('TooManyRequests');
        
        if (isRateLimited && attempt < retries - 1) {
          // Exponential backoff: 1s, 2s, 4s...
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`[ScraperTab] Rate limited, waiting ${backoffMs}ms before retry ${attempt + 1}/${retries - 1}`);
          await delay(backoffMs);
          continue;
        }
        
        // Non-retryable error or max retries reached
        throw error;
      }
    }
    
    throw lastError;
  };

  const processQueue = async (initialQueue: number[], controller: AbortController, cache: ScrapeURLStatusCache) => {
    const signal = controller.signal;

    console.log('[ScraperTab] processQueue started:', {
      initialQueue: JSON.stringify(initialQueue),
      entityDomain: currentEntity?.gameUrlDomain,
      entityPath: currentEntity?.gameUrlPath,
    });

    try {
      const maxId = idSelectionParams.maxId ? parseInt(idSelectionParams.maxId) : null;
      let autoFrontier = idSelectionMode === 'auto' ? Math.max(...initialQueue) : -1;
      const queue = [...initialQueue].sort((a, b) => a - b);
      const processedIds = new Set<number>();
      const queuedIds = new Set<number>(initialQueue);

      console.log('[ScraperTab] Sorted queue:', JSON.stringify(queue));

      for (let i = 0; i < queue.length && !signal.aborted; i++) {
        const tournamentId = queue[i];
        console.log('[ScraperTab] Processing tournamentId:', tournamentId);
        
        if (processedIds.has(tournamentId)) continue;
        processedIds.add(tournamentId);

        if (idSelectionMode === 'auto' && maxId && tournamentId > maxId) break;

        const url = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
        console.log('[ScraperTab] Built URL:', url);

        // Ensure result exists for simplified view
        if (!processingState.results.some(r => r.id === tournamentId)) {
          processingState.addToQueue(tournamentId);
        }

        // Skip conditions are now checked BEFORE processing starts (pre-filtered)
        // This loop only contains IDs that passed the skip filter

        processingState.setResultScraping(tournamentId);

        try {
          // Use fetch with retry for rate limit handling
          const parsedData = await fetchWithRetry(url, !options.useS3, scraperApiKey, currentEntity?.id);
          
          // Defensive check for null/undefined response
          if (!parsedData) {
            await handleFetchError(tournamentId, url, 'No data returned from scraper', null);
            // Throttle before next request
            await delay(THROTTLE_DELAY_MS);
            continue;
          }
          
          const errorMsg = (parsedData as any).error || (parsedData as any).errorMessage;
          if (errorMsg || parsedData.name === 'Error processing tournament') {
            await handleFetchError(tournamentId, url, errorMsg || 'Scraper Error', parsedData);
            // Throttle before next request
            await delay(THROTTLE_DELAY_MS);
            continue;
          }

          errorTracking.resetOnSuccess();
          await handleFetchSuccess(tournamentId, url, parsedData);
          maybeExtendFrontier(tournamentId);

        } catch (error: any) {
          // Defensive error message extraction
          const errorMessage = error?.message || error?.toString?.() || 'Unknown error occurred';
          console.error(`[ScraperTab] Error processing ${tournamentId}:`, error);
          await handleFetchError(tournamentId, url, errorMessage, null);
        }
        
        // Throttle between requests to avoid rate limiting
        if (i < queue.length - 1 && !signal.aborted) {
          await delay(THROTTLE_DELAY_MS);
        }
      }

      // Processing complete - only call stopProcessing if we weren't aborted
      // (if aborted, handleStopProcessing already called stopProcessing)
      await getScrapingStatus({ forceRefresh: true }).catch(() => {});
      if (!signal.aborted) {
        processingState.stopProcessing();
        
        // For "Next ID" mode, increment the Next ID past what we just processed
        // This prevents re-processing the same ID if it was skipped/not saved
        console.log('[ScraperTab] Processing complete:', {
          idSelectionMode,
          processedIdsSize: processedIds.size,
          processedIds: [...processedIds],
        });
        
        if (idSelectionMode === 'next' && processedIds.size > 0) {
          const maxProcessedId = Math.max(...processedIds);
          const newNextId = String(maxProcessedId + 1);
          console.log('[ScraperTab] Updating Next ID from', idSelectionParams.nextId, 'to', newNextId);
          setIdSelectionParams(prev => ({
            ...prev,
            nextId: newNextId
          }));
        }
      }

      // --- Helper Function (closure over queue state) ---
      function maybeExtendFrontier(processedId: number) {
        if (idSelectionMode !== 'auto' || signal?.aborted || processedId !== autoFrontier) return;
        
        let nextId = autoFrontier + 1;
        
        // Skip IDs that are in the skip cache
        while (nextId <= (maxId || Infinity)) {
          const shouldSkipNotFound = options.skipNotFoundGaps && checkCachedNotFoundGap(cache, nextId);
          const shouldSkipNotPublished = options.skipNotPublished && checkCachedNotPublished(cache, nextId);
          
          if (!shouldSkipNotFound && !shouldSkipNotPublished) {
            break;
          }
          
          console.log(`[ScraperTab] Auto mode: Skipping ${nextId} (cached skip)`);
          nextId++;
        }
        
        if (maxId && nextId > maxId) return;
        if (queuedIds.has(nextId) || processedIds.has(nextId)) return;
        
        queue.push(nextId);
        queuedIds.add(nextId);
        autoFrontier = nextId;
        processingState.addToQueue(nextId);
      }

    } catch (fatalError: any) {
      // Catch any unhandled errors in the processing loop
      console.error('[ScraperTab] FATAL ERROR in processQueue:', fatalError);
      processingState.stopProcessing();
      alert(`Processing failed unexpectedly: ${fatalError?.message || 'Unknown error'}`);
    }
  };

  // NOTE: Skip conditions are now checked in handleStartProcessing BEFORE processing starts
  // IDs matching skip conditions are filtered out and shown in skipSummary

  const handleFetchSuccess = async (tournamentId: number, url: string, parsedData: ScrapedGameData) => {
    // Handle special statuses
    const isNotPublished = parsedData.gameStatus === 'NOT_PUBLISHED';
    const isDoNotScrape = (parsedData as any).skipped && (parsedData as any).skipReason === 'DO_NOT_SCRAPE';

    if (isNotPublished || (isDoNotScrape && !options.ignoreDoNotScrape)) {
      if (isNotPublished && options.skipManualReviews && scrapeFlow === 'scrape_save') {
        await autoSaveNotPublished(tournamentId, url, parsedData);
        return;
      }
      processingState.setResultSkipped(tournamentId, parsedData.gameStatus || 'Do Not Scrape', parsedData);
      return;
    }

    if (options.skipInProgress && (parsedData.gameStatus === 'RUNNING' || parsedData.gameStatus === 'SCHEDULED')) {
      processingState.setResultSkipped(tournamentId, parsedData.gameStatus, parsedData);
      return;
    }

    // Scrape-only flow
    if (scrapeFlow === 'scrape') {
      const enumWarning = (parsedData as any)._enumErrorMessage;
      if (enumWarning) {
        processingState.setResultWarning(tournamentId, `Scraped with warnings: ${enumWarning}`, parsedData);
      } else {
        processingState.setResultSuccess(tournamentId, 'Scraped (not saved)', parsedData);
      }
      return;
    }

    // Scrape + Save flow
    await saveGame(tournamentId, url, parsedData);
  };

  const handleFetchError = async (tournamentId: number, url: string, errorMsg: string, parsedData: any) => {
    const errorType = classifyError(errorMsg, parsedData);
    
    if (isNotFoundResponse(parsedData, errorMsg)) {
      errorTracking.incrementNotFoundError();
    } else {
      errorTracking.incrementGenericError();
    }

    if (shouldStopImmediately(errorType)) {
      processingState.setResultError(tournamentId, `AUTH ERROR: ${errorMsg}`, errorType);
      setApiKeyError("ScraperAPI Key is invalid or unauthorized. Processing stopped.");
      // Don't auto-expand - the "Auth Error" badge is visible in the collapsed header
      processingState.stopProcessing();
      return;
    }

    // Auto-retry transient errors
    if (isTransientError(errorType) && autoConfig.autoRetryTransientErrors && errorTracking.counters.consecutiveErrors === 1) {
      await new Promise(resolve => setTimeout(resolve, autoConfig.retryDelayMs));
      // Retry will happen on next iteration
    }

    // Check if should pause for decision
    if (shouldPauseForDecision(errorTracking.counters, autoConfig, errorType, idSelectionMode === 'auto') && !options.skipManualReviews) {
      processingState.pauseProcessing();
      const decision = await modals.error.openModal(tournamentId, url, errorType, errorMsg, isTransientError(errorType));
      processingState.resumeProcessing();
      
      if (decision.action === 'stop') {
        processingState.stopProcessing();
        return;
      }
    }

    processingState.setResultError(tournamentId, errorMsg, errorType);
  };

  const autoSaveNotPublished = async (tournamentId: number, url: string, parsedData: ScrapedGameData) => {
    processingState.setResultSaving(tournamentId, parsedData);
    try {
      const sanitizedData = sanitizeGameDataForPlaceholder(parsedData);
      const saveResult = await saveGameDataToBackend(url, defaultVenueId, sanitizedData, null, currentEntity?.id || '');
      processingState.setResultSuccess(tournamentId, 'Saved (NOT_PUBLISHED - auto)', sanitizedData, saveResult.gameId || undefined);
    } catch (error: any) {
      processingState.setResultError(tournamentId, `Failed to save: ${error.message}`, 'SAVE');
    }
  };

  const saveGame = async (tournamentId: number, url: string, parsedData: ScrapedGameData) => {
    // Check for enum errors
    if ((parsedData as any)._enumErrors?.length > 0 || parsedData.gameVariant === null) {
      processingState.setResultError(tournamentId, 'Cannot save - invalid enum value', 'ENUM_VALIDATION');
      return;
    }

    // Determine venue
    const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;
    let venueIdToUse = options.skipManualReviews ? (autoVenueId || defaultVenueId) : '';

    if (!options.skipManualReviews) {
      const venueConfidence = parsedData.venueMatch?.autoAssignedVenue?.score ?? 0;
      if (venueConfidence >= 0.6) {
        venueIdToUse = autoVenueId || '';
      } else {
        const result = await modals.saveConfirmation.openModal(parsedData, autoVenueId || defaultVenueId, currentEntity?.id || '');
        if (result.action === 'cancel') {
          processingState.setResultError(tournamentId, 'No venue selected', 'VALIDATION');
          return;
        }
        venueIdToUse = result.venueId || defaultVenueId;
      }
    }

    processingState.setResultSaving(tournamentId, parsedData);
    
    try {
      const saveResult = await saveGameDataToBackend(url, venueIdToUse, parsedData, null, currentEntity?.id || '');
      const isUpdate = saveResult.action === 'UPDATE';
      processingState.setResultSuccess(
        tournamentId, 
        isUpdate ? `Updated game ${saveResult.gameId}` : `Created game ${saveResult.gameId}`,
        parsedData,
        saveResult.gameId || undefined
      );
    } catch (error: any) {
      processingState.setResultError(tournamentId, `Save failed: ${error.message}`, 'SAVE');
    }
  };

  // --- Result Handlers ---
  const handleResultVenueChange = (resultId: number, venueId: string) => {
    processingState.updateResultVenue(resultId, venueId);
  };

  const handleManualSave = async (result: ProcessingResult) => {
    if (!result.parsedData || !currentEntity) return;
    const venueId = result.selectedVenueId || defaultVenueId;
    if (!venueId) {
      alert('Please select a venue before saving.');
      return;
    }

    processingState.setResultSaving(result.id, result.parsedData);
    try {
      const saveResult = await saveGameDataToBackend(result.url, venueId, result.parsedData, null, currentEntity.id);
      processingState.setResultSuccess(result.id, `Saved (${saveResult.action})`, result.parsedData, saveResult.gameId || undefined);
    } catch (error: any) {
      processingState.setResultError(result.id, `Save failed: ${error.message}`, 'SAVE');
    }
  };

  // --- Render ---
  if (!currentEntity) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium mb-2">No Entity Selected</p>
        <p className="text-sm text-yellow-700">Please select an entity from the sidebar to use the scraper.</p>
      </div>
    );
  }

  const useSimplifiedView = idSelectionMode === 'bulk' || idSelectionMode === 'range';

  return (
    <div className="space-y-4">
      {/* Config Section */}
      <CollapsibleSection
        title={
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Scraper Configuration: {currentEntity.entityName}</span>
            {apiKeyError && <span className="ml-2 text-xs text-white bg-red-600 px-2 py-0.5 rounded-full">Auth Error</span>}
          </div>
        }
        isOpen={configSectionOpen}
        onToggle={() => setConfigSectionOpen(!configSectionOpen)}
      >
        <ScraperConfig
          idSelectionMode={idSelectionMode}
          setIdSelectionMode={setIdSelectionMode}
          idSelectionParams={idSelectionParams}
          setIdSelectionParams={setIdSelectionParams}
          scrapeFlow={scrapeFlow}
          setScrapeFlow={setScrapeFlow}
          options={options}
          setOptions={setOptions}
          venues={venues}
          defaultVenueId={defaultVenueId}
          setDefaultVenueId={setDefaultVenueId}
          entityDefaultVenueId={entityDefaultVenueId}
          onSaveDefaultVenue={handleSaveDefaultVenue}
          isSavingDefaultVenue={isSavingDefaultVenue}
          scraperApiKey={scraperApiKey}
          setScraperApiKey={setScraperApiKey}
          showApiKey={showApiKey}
          setShowApiKey={setShowApiKey}
          apiKeyError={apiKeyError}
          setApiKeyError={setApiKeyError}
          isProcessing={processingState.isProcessing}
          gapLoading={gapLoading}
          onStartProcessing={handleStartProcessing}
          scrapingStatus={scrapingStatus}
          bounds={bounds}
          autoConfig={autoConfig}
        />
      </CollapsibleSection>

      {/* Skip Summary - shows IDs that were pre-filtered before processing */}
      {skipSummary && (skipSummary.notFound.length > 0 || skipSummary.notPublished.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-amber-800 mb-2">Skipped IDs (Pre-filtered)</h4>
          <div className="space-y-2 text-sm">
            {skipSummary.notFound.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-700 font-medium whitespace-nowrap">NOT_FOUND Gaps:</span>
                <span className="text-amber-600">
                  {skipSummary.notFound.length <= 20 
                    ? skipSummary.notFound.join(', ')
                    : `${skipSummary.notFound.slice(0, 20).join(', ')}... (+${skipSummary.notFound.length - 20} more)`
                  }
                </span>
              </div>
            )}
            {skipSummary.notPublished.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-amber-700 font-medium whitespace-nowrap">NOT_PUBLISHED:</span>
                <span className="text-amber-600">
                  {skipSummary.notPublished.length <= 20 
                    ? skipSummary.notPublished.join(', ')
                    : `${skipSummary.notPublished.slice(0, 20).join(', ')}... (+${skipSummary.notPublished.length - 20} more)`
                  }
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-amber-500 mt-2">
            Total: {skipSummary.notFound.length + skipSummary.notPublished.length} IDs skipped based on cached ScrapeURL status
          </p>
        </div>
      )}

      {/* Progress Summary */}
      {processingState.results.length > 0 && (
        <ProgressSummary
          results={processingState.results}
          isProcessing={processingState.isProcessing}
          isPaused={processingState.isPaused}
          mode={idSelectionMode}
          flow={scrapeFlow}
          consecutiveErrors={errorTracking.counters.consecutiveErrors}
          consecutiveBlanks={errorTracking.counters.consecutiveBlanks}
          consecutiveNotFound={errorTracking.counters.consecutiveNotFound}
          onStop={handleStopProcessing}
          startTime={processingState.startTime}
          totalQueueSize={processingState.totalQueueSize}
          simplifiedView={useSimplifiedView}
        />
      )}

      {/* Results List */}
      {processingState.results.length > 0 && (
        <ScraperResults
          results={processingState.results}
          mode={idSelectionMode}
          venues={venues}
          onVenueChange={handleResultVenueChange}
          onManualSave={handleManualSave}
          onViewDetails={setSelectedGameDetails}
          simplifiedView={useSimplifiedView}
        />
      )}

      {/* Modals */}
      {selectedGameDetails && (
        <GameDetailsModal game={{ data: selectedGameDetails }} onClose={() => setSelectedGameDetails(null)} />
      )}

      {modals.saveConfirmation.state && (
        <SaveConfirmationModal
          isOpen={true}
          onClose={() => modals.saveConfirmation.cancel()}
          onConfirm={(editedData: any) => modals.saveConfirmation.confirm(editedData.venueId || defaultVenueId, editedData)}
          gameData={modals.saveConfirmation.state.gameData!}
          venueId={modals.saveConfirmation.state.suggestedVenueId}
          sourceUrl={`${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${modals.saveConfirmation.state.gameData?.tournamentId}`}
          entityId={currentEntity.id}
          autoMode={idSelectionMode === 'auto'}
          skipConfirmation={options.skipManualReviews}
        />
      )}

      {modals.error.state && (
        <ErrorHandlingModal
          {...modals.error.state}
          consecutiveErrors={errorTracking.counters.consecutiveErrors}
          totalErrors={errorTracking.counters.totalErrors}
          consecutiveBlanks={errorTracking.counters.consecutiveBlanks}
          consecutiveNotFound={errorTracking.counters.consecutiveNotFound}
          remainingInQueue={processingState.stats.pending}
          onDecision={modals.error.resolve}
        />
      )}

      {venueModalOpen && (
        <VenueModal
          isOpen={venueModalOpen}
          onClose={() => setVenueModalOpen(false)}
          onSave={async () => {}}
          venue={null}
          entities={currentEntity ? [currentEntity] : []}
        />
      )}
    </div>
  );
};

export default ScrapeTab;