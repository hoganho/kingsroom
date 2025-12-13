// src/pages/scraper-admin-tabs/ScraperTab.tsx
// FINAL: All phases integrated (1-5)
// - Phase 3: useScrapeOrchestrator with unified save + doNotScrape handling
// - Phase 4: State machine helpers available
// - Phase 5: Status normalization + structured logging

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
import { useScrapeOrchestrator, ScrapeOptionsResult } from '../../hooks/scraper/useScrapeOrchestrator';

// --- Utils ---
// Phase 5: Structured logging
import { scraperLogger } from '../../utils/scraperLogger';

// --- Components ---
import { CollapsibleSection } from '../../components/scraper/admin/CollapsibleSection';
import { ScraperConfig } from '../../components/scraper/admin/ScraperConfig';
import { ProgressSummary } from '../../components/scraper/admin/ProgressSummary';
import { ScraperResults } from '../../components/scraper/admin/ScraperResults';
import { ErrorHandlingModal } from '../../components/scraper/admin/ErrorHandlingModal';
import { GameDetailsModal } from '../../components/scraper/admin/ScraperModals';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';
import { VenueModal } from '../../components/venues/VenueModal';

// --- Services ---
import { saveGameDataToBackend } from '../../services/gameService';
import { 
  prefetchScrapeURLStatuses, 
  checkCachedNotPublished, 
  checkCachedNotFoundGap, 
  ScrapeURLStatusCache 
} from '../../services/scrapeURLService';

// --- Contexts & Hooks ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';

// --- API Types ---
import { Venue, ScrapedGameData } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';

const getClient = () => generateClient();

// ===================================================================
// SCRAPE OPTIONS MODAL STATE
// ===================================================================

interface ScrapeOptionsState {
  tournamentId: number;
  url: string;
  doNotScrape: boolean;
  gameStatus: string | null;
  hasS3Cache: boolean;
  resolve: (result: ScrapeOptionsResult) => void;
}

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

  // --- Skip Summary State ---
  const [skipSummary, setSkipSummary] = useState<{
    notFound: number[];
    notPublished: number[];
  } | null>(null);

  // --- ScrapeOptionsModal State ---
  const [scrapeOptionsState, setScrapeOptionsState] = useState<ScrapeOptionsState | null>(null);

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

  // --- Orchestrator Callbacks ---
  const handleNeedsSaveConfirmation = useCallback(async (
    _tournamentId: number,
    parsedData: ScrapedGameData,
    autoVenueId: string | undefined
  ): Promise<{ action: 'save' | 'cancel'; venueId?: string; editedData?: ScrapedGameData }> => {
    const result = await modals.saveConfirmation.openModal(
      parsedData,
      autoVenueId || defaultVenueId,
      currentEntity?.id || ''
    );
    return {
      action: result.action === 'cancel' ? 'cancel' : 'save',
      venueId: result.venueId,
      editedData: result.editedData,
    };
  }, [modals.saveConfirmation, defaultVenueId, currentEntity?.id]);

  const handleNeedsErrorDecision = useCallback(async (
    tournamentId: number,
    url: string,
    errorType: any,
    errorMsg: string,
    isRetryable: boolean
  ): Promise<{ action: 'continue' | 'stop' | 'retry' }> => {
    const decision = await modals.error.openModal(tournamentId, url, errorType, errorMsg, isRetryable);
    return { action: decision.action as 'continue' | 'stop' | 'retry' };
  }, [modals.error]);

  // Handle doNotScrape URLs via ScrapeOptionsModal
  const handleNeedsScrapeOptions = useCallback(async (
    tournamentId: number,
    url: string,
    doNotScrape: boolean,
    gameStatus: string | null,
    hasS3Cache: boolean
  ): Promise<ScrapeOptionsResult> => {
    return new Promise<ScrapeOptionsResult>((resolve) => {
      setScrapeOptionsState({
        tournamentId,
        url,
        doNotScrape,
        gameStatus,
        hasS3Cache,
        resolve,
      });
    });
  }, []);

  const handleScrapeOptionsSelect = useCallback((option: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER', s3Key?: string) => {
    if (scrapeOptionsState) {
      scrapeOptionsState.resolve({ action: option, s3Key });
      setScrapeOptionsState(null);
    }
  }, [scrapeOptionsState]);

  const handleScrapeOptionsClose = useCallback(() => {
    if (scrapeOptionsState) {
      scrapeOptionsState.resolve({ action: 'SKIP' });
      setScrapeOptionsState(null);
    }
  }, [scrapeOptionsState]);

  const handleApiKeyError = useCallback((message: string) => {
    setApiKeyError(message);
    scraperLogger.error('AUTH_ERROR', message);
  }, []);

  const handleProcessingComplete = useCallback(async () => {
    await getScrapingStatus({ forceRefresh: true }).catch(() => {});
  }, [getScrapingStatus]);

  const handleUpdateNextId = useCallback((newNextId: string) => {
    scraperLogger.debug('PROCESSING_COMPLETE', `Next ID updated to ${newNextId}`);
    setIdSelectionParams(prev => ({ ...prev, nextId: newNextId }));
  }, []);

  // --- Orchestrator Hook ---
  const orchestrator = useScrapeOrchestrator(
    {
      entityId: currentEntity?.id || '',
      baseUrl: currentEntity?.gameUrlDomain || '',
      urlPath: currentEntity?.gameUrlPath || '',
      scraperApiKey,
      options,
      scrapeFlow,
      autoConfig,
      defaultVenueId,
      idSelectionMode,
      maxId: idSelectionParams.maxId || null,
    },
    {
      onNeedsSaveConfirmation: handleNeedsSaveConfirmation,
      onNeedsErrorDecision: handleNeedsErrorDecision,
      onNeedsScrapeOptions: handleNeedsScrapeOptions,
      onApiKeyError: handleApiKeyError,
      onProcessingComplete: handleProcessingComplete,
      onUpdateNextId: handleUpdateNextId,
    },
    processingState,
    errorTracking
  );

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

  // --- Processing ---
  const handleStartProcessing = useCallback(async () => {
    if (!currentEntity) return;
    
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
    
    if (queue.length === 0) {
      alert("No IDs to process with the current selection.");
      setConfigSectionOpen(true);
      return;
    }
    
    setApiKeyError(null);
    errorTracking.resetAll();
    
    // Pre-fetch ScrapeURL statuses (includes doNotScrape flag)
    let filteredQueue = queue;
    let cache: ScrapeURLStatusCache = {};
    const skippedNotFound: number[] = [];
    const skippedNotPublished: number[] = [];
    
    scraperLogger.info('PREFETCH_START', `Prefetching statuses for ${queue.length} IDs`);
    
    if ((options.skipNotPublished || options.skipNotFoundGaps) && currentEntity.id) {
      try {
        cache = await prefetchScrapeURLStatuses(currentEntity.id, queue);
        
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
        
        const totalSkipped = skippedNotFound.length + skippedNotPublished.length;
        scraperLogger.logPrefetchComplete(Object.keys(cache).length, totalSkipped);
        
        if (skippedNotFound.length > 0 || skippedNotPublished.length > 0) {
          setSkipSummary({ notFound: skippedNotFound, notPublished: skippedNotPublished });
        }
      } catch (error) {
        scraperLogger.warn('PREFETCH_ERROR', 'Failed to prefetch ScrapeURL statuses');
      }
    } else if (currentEntity.id) {
      // Even without skip options, prefetch for doNotScrape detection
      try {
        cache = await prefetchScrapeURLStatuses(currentEntity.id, queue);
        scraperLogger.logPrefetchComplete(Object.keys(cache).length, 0);
      } catch (error) {
        scraperLogger.warn('PREFETCH_ERROR', 'Failed to prefetch ScrapeURL statuses');
      }
    }
    
    if (filteredQueue.length === 0) {
      if (idSelectionMode === 'auto' && idSelectionParams.maxId) {
        const startFromId = (highestTournamentId || 0) + 1;
        const maxId = parseInt(idSelectionParams.maxId);
        
        let firstNewId = startFromId;
        while (firstNewId <= maxId) {
          const shouldSkipNF = options.skipNotFoundGaps && checkCachedNotFoundGap(cache, firstNewId);
          const shouldSkipNP = options.skipNotPublished && checkCachedNotPublished(cache, firstNewId);
          if (!shouldSkipNF && !shouldSkipNP) break;
          firstNewId++;
        }
        
        if (firstNewId <= maxId) {
          filteredQueue = [firstNewId];
        } else {
          alert(`All IDs up to ${maxId} were skipped based on your skip options.`);
          setConfigSectionOpen(true);
          return;
        }
      } else {
        if (idSelectionMode === 'next' && queue.length > 0) {
          setIdSelectionParams(prev => ({ ...prev, nextId: String(Math.max(...queue) + 1) }));
        }
        alert(`All ${queue.length} IDs were skipped based on your skip options.`);
        setConfigSectionOpen(true);
        return;
      }
    }
    
    scraperLogger.info('QUEUE_FILTERED', `Starting with ${filteredQueue.length} IDs after filtering`);
    
    const controller = processingState.startProcessing(filteredQueue);
    orchestrator.processQueue(filteredQueue, controller, cache);
  }, [currentEntity, idSelectionMode, idSelectionParams, highestTournamentId, scrapingStatus, options, orchestrator, processingState, errorTracking]);

  const handleStopProcessing = useCallback(() => {
    processingState.stopProcessing();
    scraperLogger.info('PROCESSING_STOP', 'Processing stopped by user');
    getScrapingStatus({ forceRefresh: true }).catch(() => {});
  }, [processingState, getScrapingStatus]);

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
    scraperLogger.info('ITEM_SAVING', 'Manual save initiated', { tournamentId: result.id });
    
    try {
      const saveResult = await saveGameDataToBackend(result.url, venueId, result.parsedData, null, currentEntity.id);
      processingState.setResultSuccess(result.id, `Saved (${saveResult.action})`, result.parsedData, saveResult.gameId || undefined);
      scraperLogger.logSaveSuccess(result.id, saveResult.gameId || 'unknown', saveResult.action as 'CREATE' | 'UPDATE');
    } catch (error: any) {
      processingState.setResultError(result.id, `Save failed: ${error.message}`, 'SAVE');
      scraperLogger.error('ITEM_SAVE_ERROR', `Manual save failed: ${error.message}`, { tournamentId: result.id });
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

      {/* Skip Summary */}
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
            Total: {skipSummary.notFound.length + skipSummary.notPublished.length} IDs skipped
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

      {/* ScrapeOptionsModal for doNotScrape URLs */}
      {scrapeOptionsState && (
        <ScrapeOptionsModal
          isOpen={true}
          onClose={handleScrapeOptionsClose}
          onSelectOption={handleScrapeOptionsSelect}
          url={scrapeOptionsState.url}
          entityId={currentEntity.id}
          doNotScrape={scrapeOptionsState.doNotScrape}
          gameStatus={scrapeOptionsState.gameStatus || undefined}
          warningMessage={scrapeOptionsState.doNotScrape ? 'This tournament is marked as "Do Not Scrape"' : undefined}
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
