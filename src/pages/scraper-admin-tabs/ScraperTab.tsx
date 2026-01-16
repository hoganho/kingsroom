// src/pages/scraper-admin-tabs/ScraperTab.tsx
// REFACTORED: Single-ID on frontend (useSingleScrape), batch on backend (useScraperJobs)
// UPDATED: Integrated BatchJobProgress for real-time batch job monitoring with polling
// UPDATED v3.1: Added refresh mode support with forceRefreshFromWeb option
// UPDATED v3.2: Removed error threshold configuration - now managed by backend defaults
//               Backend defaults: maxTotalErrors=1, maxConsecutiveNotFound=10
// UPDATED v3.3: Pass skipNotPublished to getScrapingStatus for gap analysis
// UPDATED v3.4: Show Force Refresh checkbox for gaps mode too (fixes NOT_FOUND re-scrape bug)
// UPDATED v3.5: Added Range selection for Gaps mode - allows processing only gaps within a specified range
//
// Architecture:
// - 'single' mode: Frontend handles with full interactive control (modals, venue selection)
// - 'refresh' mode: Re-fetch unfinished games (RUNNING, REGISTERING, SCHEDULED)
// - All other modes: Backend Lambda handles via useScraperJobs.startJob()
//
// This integrates with existing hooks:
// - useScraperJobs from useScraperManagement.ts for batch job management
// - useSingleScrape for single-ID interactive processing
// - useBatchJobMonitor for real-time job status polling
//
// FIX: Now uses enrichedData returned directly from scrape() to avoid stale state issues

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Settings, Play, Square, RefreshCw, Zap, AlertCircle, CheckCircle } from 'lucide-react';

// --- Types ---
import {
  ScraperTabProps,
  IdSelectionMode,
  IdSelectionParams,
  ScrapeFlow,
  ScrapeOptions,
  DEFAULT_SCRAPE_OPTIONS,
  DEFAULT_ID_SELECTION_PARAMS,
  isSingleMode,
  parseMultiIdString,
  getMultiIdCount,
  validateMultiIdString,
} from '../../types/scraper';

// --- Hooks ---
import { useSingleScrape } from '../../hooks/scraper/useSingleScrape';
import { useScraperJobs } from '../../hooks/useScraperManagement';
import { useScraperModals } from '../../hooks/scraper/useModalResolver';
// NEW: Import batch job monitor utilities for status checking
import { isJobRunning } from '../../hooks/scraper/useBatchJobMonitor';

// --- Components ---
import { CollapsibleSection } from '../../components/scraper/admin/CollapsibleSection';
import { GameDetailsModal } from '../../components/scraper/admin/ScraperModals';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import GameListItem from '../../components/scraper/GameListItem';
// NEW: Import BatchJobProgress component for real-time monitoring
import { BatchJobProgress } from '../../components/scraper/admin/BatchJobProgress';

// --- Contexts & Hooks ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';

// --- API Types ---
import { Venue, ScrapedGameData, StartScraperJobInput, ScraperJob } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';

// --- Utils ---
import { scraperLogger } from '../../utils/scraperLogger';

const getClient = () => generateClient();

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScrapeTab: React.FC<ScraperTabProps> = ({ urlToReparse, onReparseComplete }) => {
  const { currentEntity } = useEntity();
  
  // --- Venue State ---
  const [venues, setVenues] = useState<Venue[]>([]);
  const [defaultVenueId, setDefaultVenueId] = useState<string>('');
  const [entityDefaultVenueId, setEntityDefaultVenueId] = useState<string>('');
  const [isSavingDefaultVenue, setIsSavingDefaultVenue] = useState(false);

  // --- Section State ---
  const [configSectionOpen, setConfigSectionOpen] = useState(true);

  // --- Config State ---
  const [idSelectionMode, setIdSelectionMode] = useState<IdSelectionMode>('single');
  const [idSelectionParams, setIdSelectionParams] = useState<IdSelectionParams>(DEFAULT_ID_SELECTION_PARAMS);
  const [scrapeFlow, setScrapeFlow] = useState<ScrapeFlow>('scrape_save');
  const [options, setOptions] = useState<ScrapeOptions>(DEFAULT_SCRAPE_OPTIONS);
  const [scraperApiKey, setScraperApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  // v3.2: Removed batchThresholds state - now managed by backend defaults

  // --- View State ---
  const [selectedGameDetails, setSelectedGameDetails] = useState<ScrapedGameData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // --- Modals ---
  const modals = useScraperModals();

  // --- Gap Tracker ---
  // v3.1: Added getUnfinishedGames for refresh mode
  const { scrapingStatus, loading: gapLoading, getScrapingStatus, getBounds, bounds, getUnfinishedGames } = useGameIdTracking(currentEntity?.id);
  const highestTournamentId = scrapingStatus?.highestTournamentId ?? bounds?.highestId;

  // --- Single Scrape Hook (frontend processing) ---
  const singleScrape = useSingleScrape({
    entityId: currentEntity?.id || '',
    baseUrl: currentEntity?.gameUrlDomain || '',
    urlPath: currentEntity?.gameUrlPath || '',
    scraperApiKey,
    options,
    defaultVenueId,
  });

  // --- Scraper Jobs Hook (backend batch processing) ---
  const { 
    jobs, 
    startJob, 
    cancelJob,
    fetchJobs 
  } = useScraperJobs();

  // Find the active job from jobs list (used for checking if we can start a new job)
  const activeJob = useMemo(() => {
    if (!activeJobId) return null;
    return jobs.find(j => j.id === activeJobId || j.jobId === activeJobId) || null;
  }, [jobs, activeJobId]);

  // UPDATED: Use the utility function from useBatchJobMonitor for consistent status checking
  const isBatchRunning = useMemo(() => {
    return isJobRunning(activeJob?.status);
  }, [activeJob?.status]);

  // --- Effects ---
  useEffect(() => {
    if (currentEntity?.id) {
      fetchVenues();
      // v3.3: Pass skipNotPublished to initial load
      getScrapingStatus({ forceRefresh: false, skipNotPublished: options.skipNotPublished })
        .catch(() => {
          console.log('[ScraperTab] Scraping status failed, trying bounds...');
          return getBounds();
        })
        .catch((err) => {
          console.log('[ScraperTab] Both scraping status and bounds failed:', err);
          // For new entities with no data, this is expected
        });
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
        setIdSelectionMode('single');
        setIdSelectionParams(p => ({ ...p, singleId: match[1] }));
      }
    }
  }, [urlToReparse]);

  // Check for pending multi-IDs from URL Management page
  useEffect(() => {
    const pendingIds = localStorage.getItem('pendingMultiIds');
    const timestamp = localStorage.getItem('pendingMultiIdsTimestamp');
    
    if (pendingIds && timestamp) {
      // Only use if less than 5 minutes old
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < 5 * 60 * 1000) {
        console.log('[ScraperTab] Found pending multi-IDs from URL Management:', pendingIds);
        setIdSelectionMode('multiId');
        setIdSelectionParams(p => ({ ...p, multiIdString: pendingIds }));
        
        // Clear the pending data
        localStorage.removeItem('pendingMultiIds');
        localStorage.removeItem('pendingMultiIdsTimestamp');
      } else {
        // Expired, clean up
        localStorage.removeItem('pendingMultiIds');
        localStorage.removeItem('pendingMultiIdsTimestamp');
      }
    }
  }, []); // Only run once on mount

  // Calculate the "suggested next ID" - this is what would be auto-used if input is empty
  const suggestedNextId = useMemo(() => {
    // If we have a highest ID, suggest the next one
    if (highestTournamentId) {
      return highestTournamentId + 1;
    }
    
    // If we're still loading, don't suggest anything yet
    if (gapLoading) {
      return null;
    }
    
    // If we've finished loading and there's no data, default to 1
    // This handles new entities with no games yet
    if (scrapingStatus !== null) {
      // scrapingStatus exists but no highestTournamentId means no games
      return 1;
    }
    
    // If bounds loaded but empty, also default to 1
    if (bounds !== null && !bounds.highestId) {
      return 1;
    }
    
    // Fallback: if we have an entity selected and not loading, default to 1
    // This handles cases where both API calls might have failed
    if (currentEntity?.id) {
      return 1;
    }
    
    return null;
  }, [highestTournamentId, gapLoading, scrapingStatus, bounds, currentEntity?.id]);

  // Pre-populate singleId when entity changes or on initial load
  useEffect(() => {
    // Only auto-populate for single mode when:
    // 1. We have a suggestedNextId
    // 2. singleId is empty OR entity just changed
    if (isSingleMode(idSelectionMode) && suggestedNextId && !idSelectionParams.singleId) {
      setIdSelectionParams(p => ({ ...p, singleId: String(suggestedNextId) }));
    }
  }, [suggestedNextId, idSelectionMode]); // Note: removed idSelectionParams.singleId to allow re-population on entity change

  // Reset singleId when entity changes (so it can be re-populated with new entity's next ID)
  useEffect(() => {
    if (currentEntity?.id) {
      // Clear singleId so the above effect can re-populate it
      setIdSelectionParams(p => ({ ...p, singleId: '' }));
    }
  }, [currentEntity?.id]);

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

  // =========================================================================
  // v3.5: HELPER - Filter gaps by range
  // =========================================================================
  
  /**
   * Filters gap ranges to only include IDs within the specified range.
   * If rangeStart or rangeEnd are not provided, no filtering is applied for that bound.
   */
  const filterGapsByRange = useCallback((
    gaps: Array<{ start: number; end: number }>,
    rangeStart?: number,
    rangeEnd?: number
  ): number[] => {
    const filteredIds: number[] = [];
    
    for (const gap of gaps) {
      // Determine effective start and end for this gap
      const effectiveStart = rangeStart !== undefined ? Math.max(gap.start, rangeStart) : gap.start;
      const effectiveEnd = rangeEnd !== undefined ? Math.min(gap.end, rangeEnd) : gap.end;
      
      // Only process if there's a valid range
      if (effectiveStart <= effectiveEnd) {
        for (let i = effectiveStart; i <= effectiveEnd; i++) {
          filteredIds.push(i);
        }
      }
    }
    
    return filteredIds;
  }, []);

  // =========================================================================
  // v3.5: Calculate filtered gap count for display
  // =========================================================================
  
  const filteredGapInfo = useMemo(() => {
    if (!scrapingStatus?.gaps?.length) {
      return { totalGaps: 0, filteredCount: 0, isFiltered: false };
    }
    
    const gaps = scrapingStatus.gaps as Array<{ start: number; end: number }>;
    const totalIds = gaps.reduce((sum, gap) => sum + (gap.end - gap.start + 1), 0);
    
    const rangeStart = idSelectionParams.gapsRangeStart 
      ? parseInt(idSelectionParams.gapsRangeStart) 
      : undefined;
    const rangeEnd = idSelectionParams.gapsRangeEnd 
      ? parseInt(idSelectionParams.gapsRangeEnd) 
      : undefined;
    
    // If no range specified, return all gaps
    if (rangeStart === undefined && rangeEnd === undefined) {
      return { totalGaps: totalIds, filteredCount: totalIds, isFiltered: false };
    }
    
    // Filter and count
    const filteredIds = filterGapsByRange(gaps, rangeStart, rangeEnd);
    
    return { 
      totalGaps: totalIds, 
      filteredCount: filteredIds.length, 
      isFiltered: true 
    };
  }, [scrapingStatus?.gaps, idSelectionParams.gapsRangeStart, idSelectionParams.gapsRangeEnd, filterGapsByRange]);

  // =========================================================================
  // BATCH JOB CALLBACKS (NEW)
  // =========================================================================

  /**
   * Called when a batch job completes (success, failure, or stopped)
   * Refreshes scraping status to update gaps and highest ID
   */
  const handleJobComplete = useCallback((job: ScraperJob) => {
    console.log('[ScraperTab] Job completed:', job.status, {
      processed: job.totalURLsProcessed,
      newGames: job.newGamesScraped,
      updated: job.gamesUpdated,
      errors: job.errors,
    });
    
    // v3.3: Refresh scraping status with skipNotPublished option
    getScrapingStatus({ forceRefresh: true, skipNotPublished: options.skipNotPublished }).catch(() => {
      getBounds().catch(() => {});
    });
    
    // Refresh jobs list
    fetchJobs(true);
  }, [getScrapingStatus, getBounds, fetchJobs, options.skipNotPublished]);

  /**
   * Clear the active job from display
   */
  const handleClearJob = useCallback(() => {
    setActiveJobId(null);
  }, []);

  // =========================================================================
  // PROCESSING HANDLERS
  // =========================================================================

  const handleStartProcessing = useCallback(async () => {
    if (!currentEntity) return;
    
    setConfigSectionOpen(false);

    if (isSingleMode(idSelectionMode)) {
      // =====================================================================
      // SINGLE ID: Frontend handles with interactive control
      // =====================================================================
      
      // Use the entered ID, or fall back to suggestedNextId, or finally default to 1
      const enteredId = idSelectionParams.singleId ? parseInt(idSelectionParams.singleId) : null;
      const tournamentId = enteredId || suggestedNextId || 1;
      
      if (isNaN(tournamentId)) {
        alert('Please enter a valid tournament ID');
        setConfigSectionOpen(true);
        return;
      }
      
      // Update the input to show what we're processing
      setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId) }));

      scraperLogger.info('PROCESSING_START', `Processing single ID: ${tournamentId} (flow: ${scrapeFlow}, skipManualReviews: ${options.skipManualReviews})`);
      
      // FIX: scrape() now returns { parsedData, enrichedData } directly
      // This avoids stale state issues when reading enrichedData immediately after scrape
      const { parsedData, enrichedData } = await singleScrape.scrape(tournamentId);
      
      console.log('[ScraperTab DEBUG] After scrape:', {
        hasParsedData: !!parsedData,
        hasEnrichedData: !!enrichedData,
        parsedDataName: parsedData?.name,
        enrichedDataName: enrichedData?.name,
        parsedDataGameStatus: parsedData?.gameStatus,
        scrapeFlow,
        skipManualReviews: options.skipManualReviews,
      });
      
      // Determine if data is reviewable (can't rely on singleScrape.result state - it's async)
      // Mirror the logic from useSingleScrape to determine if this is a 'review' case
      const isReviewable = (() => {
        if (!parsedData) {
          console.log('[ScraperTab DEBUG] isReviewable: false (no parsedData)');
          return false;
        }
        
        // Check for error in response
        const dataAsRecord = parsedData as Record<string, unknown>;
        const errorMsg = (dataAsRecord.error || dataAsRecord.errorMessage) as string | undefined;
        if (errorMsg || parsedData.name === 'Error processing tournament') {
          console.log('[ScraperTab DEBUG] isReviewable: false (error in response)', { errorMsg, name: parsedData.name });
          return false;
        }
        
        // Check for NOT_FOUND status
        const gameStatus = parsedData.gameStatus?.toUpperCase();
        if (gameStatus === 'NOT_FOUND' || gameStatus === 'BLANK') {
          console.log('[ScraperTab DEBUG] isReviewable: false (NOT_FOUND/BLANK status)', { gameStatus });
          return false;
        }
        
        // Check for doNotScrape
        const isDoNotScrape = dataAsRecord.skipped && dataAsRecord.skipReason === 'DO_NOT_SCRAPE';
        if (isDoNotScrape && !options.ignoreDoNotScrape) {
          console.log('[ScraperTab DEBUG] isReviewable: false (doNotScrape)', { isDoNotScrape });
          return false;
        }
        
        console.log('[ScraperTab DEBUG] isReviewable: true');
        return true;
      })();
      
      // Get autoVenueId from parsedData directly (can't rely on state)
      const autoVenueId = parsedData?.venueMatch?.autoAssignedVenue?.id;
      
      console.log('[ScraperTab DEBUG] Decision point:', {
        isReviewable,
        scrapeFlow,
        skipManualReviews: options.skipManualReviews,
        autoVenueId,
        defaultVenueId,
        willOpenModal: isReviewable && scrapeFlow === 'scrape_save' && !options.skipManualReviews,
      });
      
      if (parsedData && isReviewable) {
        
        if (scrapeFlow === 'scrape_save') {
          if (options.skipManualReviews) {
            // =====================================================================
            // AUTO-SAVE MODE: Skip modal, save immediately with auto-venue or default
            // =====================================================================
            scraperLogger.info('ITEM_SAVING', `Auto-saving tournament ${tournamentId} (skipManualReviews=true)`);
            
            const venueToUse = autoVenueId || defaultVenueId;
            
            if (!venueToUse) {
              scraperLogger.warn('ITEM_SAVING', `No venue available for auto-save, falling back to review modal`);
              // Fall through to manual review if no venue available
            } else {
              const sourceUrl = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${tournamentId}`;
              await singleScrape.save(venueToUse, parsedData, sourceUrl, tournamentId);
              // v3.3: Pass skipNotPublished when refreshing
              getScrapingStatus({ forceRefresh: true, skipNotPublished: options.skipNotPublished }).catch(() => {});
              
              // Update next ID (increment from current)
              setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId + 1) }));
              
              // Callback for re-parse completion
              if (urlToReparse && onReparseComplete) {
                onReparseComplete();
              }
              return; // Exit early - auto-save complete
            }
          }
          
          // =====================================================================
          // MANUAL REVIEW MODE: Show modal for venue confirmation/editing
          // =====================================================================
          
          // FIX: Use enrichedData returned directly from scrape() - not from stale state!
          // Merge: parsedData as base, enrichedData overlay (has series info)
          const gameDataForModal = enrichedData 
            ? { ...parsedData, ...enrichedData } as ScrapedGameData
            : parsedData;
          
          console.log('[ScraperTab DEBUG] About to open SaveConfirmationModal', {
            dataSource: enrichedData ? 'ENRICHED' : 'RAW_PARSED',
            parsedDataName: parsedData.name,
            isSeries: enrichedData?.isSeries,
            tournamentSeriesId: enrichedData?.tournamentSeriesId,
            seriesName: enrichedData?.seriesName,
            suggestedVenueId: autoVenueId || defaultVenueId,
            entityId: currentEntity.id,
          });
          
          const modalResult = await modals.saveConfirmation.openModal(
            gameDataForModal,
            autoVenueId || defaultVenueId,
            currentEntity.id
          );
          
          console.log('[ScraperTab DEBUG] Modal closed with result:', modalResult);
          
          if (modalResult.action === 'save') {
            const sourceUrl = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${tournamentId}`;
            await singleScrape.save(
              modalResult.venueId || defaultVenueId,
              modalResult.editedData as ScrapedGameData | undefined,
              sourceUrl,
              tournamentId
            );
            
            // v3.3: Refresh scraping status with skipNotPublished option
            getScrapingStatus({ forceRefresh: true, skipNotPublished: options.skipNotPublished }).catch(() => {});
          }
        }
        // If scrapeFlow === 'scrape', just display the result (no auto-modal, no save)
        // User can still manually trigger save via the Save button in GameListItem
        
        // Update next ID (increment from current)
        setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId + 1) }));
        
        // Callback for re-parse completion
        if (urlToReparse && onReparseComplete) {
          onReparseComplete();
        }
      } else if (parsedData && !isReviewable) {
        // Data returned but not reviewable (skipped/error case)
        // Still increment ID so user can easily continue to next ID
        setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId + 1) }));
        
        // Callback for re-parse completion (even on skip/error)
        if (urlToReparse && onReparseComplete) {
          onReparseComplete();
        }
      } else if (!parsedData) {
        // No data returned (error case)
        setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId + 1) }));
        
        if (urlToReparse && onReparseComplete) {
          onReparseComplete();
        }
      }

    } else {
      // =====================================================================
      // BATCH: Delegate to backend Lambda via useScraperJobs
      // =====================================================================
      scraperLogger.info('PROCESSING_START', `Starting batch job: ${idSelectionMode}`);

      // v3.5: Get gap IDs with optional range filtering
      let gapIds: number[] | undefined;
      if (idSelectionMode === 'gaps' && scrapingStatus?.gaps && scrapingStatus.gaps.length > 0) {
        const gaps = scrapingStatus.gaps as Array<{ start: number; end: number }>;
        
        // Parse range parameters
        const rangeStart = idSelectionParams.gapsRangeStart 
          ? parseInt(idSelectionParams.gapsRangeStart) 
          : undefined;
        const rangeEnd = idSelectionParams.gapsRangeEnd 
          ? parseInt(idSelectionParams.gapsRangeEnd) 
          : undefined;
        
        // Use the helper to filter gaps by range
        gapIds = filterGapsByRange(gaps, rangeStart, rangeEnd);
        
        console.log('[ScraperTab] Gaps mode with range:', {
          rangeStart,
          rangeEnd,
          totalGapRanges: gaps.length,
          filteredGapIds: gapIds.length,
        });
        
        // If range filtering resulted in no gaps, show warning
        if (gapIds.length === 0) {
          alert('No gaps found within the specified range. Please adjust your range or leave it blank to process all gaps.');
          setConfigSectionOpen(true);
          return;
        }
      }

      // Parse multi-ID string if needed
      let multiIds: number[] | undefined;
      if (idSelectionMode === 'multiId') {
        const validationError = validateMultiIdString(idSelectionParams.multiIdString);
        if (validationError) {
          alert(validationError);
          setConfigSectionOpen(true);
          return;
        }
        multiIds = parseMultiIdString(idSelectionParams.multiIdString);
        if (multiIds.length === 0) {
          alert('Please enter at least one valid tournament ID');
          setConfigSectionOpen(true);
          return;
        }
        console.log(`[ScraperTab] Multi-ID mode: parsed ${multiIds.length} IDs from "${idSelectionParams.multiIdString}"`);
      }

      // v3.1: For refresh mode, get unfinished game IDs
      let refreshGameIds: number[] | undefined;
      if (idSelectionMode === 'refresh') {
        try {
          const unfinishedResult = await getUnfinishedGames({ limit: 500 });
          if (unfinishedResult?.items?.length > 0) {
            refreshGameIds = unfinishedResult.items
              .map((g: any) => g.tournamentId)
              .filter((id: number | undefined): id is number => typeof id === 'number' && id > 0);
            console.log(`[ScraperTab] Refresh mode: ${refreshGameIds.length} unfinished games to process`);
          } else {
            console.log('[ScraperTab] Refresh mode: No unfinished games found');
          }
        } catch (err) {
          console.warn('[ScraperTab] Failed to fetch unfinished games:', err);
        }
      }

      console.log('[ScraperTab DEBUG] Raw params:', {
        idSelectionMode,
        'bulkCount raw': idSelectionParams.bulkCount,
        'typeof': typeof idSelectionParams.bulkCount,
        'parseInt': parseInt(idSelectionParams.bulkCount),
        'params object': JSON.stringify(idSelectionParams)
      });

      // For auto mode, calculate startId from highestTournamentId
      const autoStartId = idSelectionMode === 'auto' 
        ? (highestTournamentId ? highestTournamentId + 1 : 1)
        : undefined;
      
      // For auto mode, flatten gaps into an array of IDs to process
      const autoGapIds = idSelectionMode === 'auto' && scrapingStatus?.gaps?.length
        ? scrapingStatus.gaps.flatMap((gap: { start: number; end: number }) => {
            const ids: number[] = [];
            for (let i = gap.start; i <= gap.end; i++) {
              ids.push(i);
            }
            return ids;
          })
        : undefined;

      // Build the input for startScraperJob - must match Lambda expectations
      // See sm-index.js startScraperJob() for expected fields
      // v3.2: Removed threshold fields - backend uses sensible defaults
      const jobInput = {
        // Required
        entityId: currentEntity.id,
        
        // Job metadata
        mode: idSelectionMode as string,
        triggerSource: 'MANUAL' as const,
        triggeredBy: 'scraper-admin-ui',
        
        // Scrape options
        useS3: options.useS3,
        // v3.4: forceRefresh is true if:
        // 1. useS3 is disabled globally, OR
        // 2. Refresh mode with forceRefreshFromWeb enabled, OR
        // 3. Gaps mode with forceRefreshFromWeb enabled
        forceRefresh: !options.useS3 || 
                      (idSelectionMode === 'refresh' && options.forceRefreshFromWeb) ||
                      (idSelectionMode === 'gaps' && options.forceRefreshFromWeb),
        skipNotPublished: options.skipNotPublished,
        skipNotFoundGaps: options.skipNotFoundGaps,
        skipInProgress: options.skipInProgress,
        ignoreDoNotScrape: options.ignoreDoNotScrape,
        
        // API Key for scraping (passed to fetch handler)
        scraperApiKey: scraperApiKey || undefined,
        
        // Save options
        saveToDatabase: scrapeFlow === 'scrape_save',
        defaultVenueId: defaultVenueId || undefined,
        autoCreateSeries: options.autoCreateSeries,
        autoCreateRecurring: options.autoCreateRecurring,
        
        // Mode-specific parameters
        bulkCount: idSelectionMode === 'bulk' 
            ? Math.max(1, parseInt(idSelectionParams.bulkCount) || 10) 
            : undefined,
        // AUTO MODE: startId is highestTournamentId + 1
        startId: idSelectionMode === 'range' 
            ? (parseInt(idSelectionParams.rangeStart) || undefined) 
            : idSelectionMode === 'auto'
            ? autoStartId
            : undefined,
        endId: idSelectionMode === 'range' 
            ? (parseInt(idSelectionParams.rangeEnd) || undefined) 
            : idSelectionMode === 'auto' 
            ? (parseInt(idSelectionParams.maxId) || undefined) 
            : undefined,
        maxId: idSelectionMode === 'auto' 
            ? (parseInt(idSelectionParams.maxId) || undefined) 
            : undefined,
        // v3.1: Use gapIds for 'gaps', 'multiId', 'auto', OR 'refresh' mode
        gapIds: idSelectionMode === 'gaps' && gapIds 
              ? gapIds 
              : idSelectionMode === 'multiId' && multiIds 
              ? multiIds 
              : idSelectionMode === 'auto' && autoGapIds?.length 
              ? autoGapIds
              : idSelectionMode === 'refresh' && refreshGameIds?.length
              ? refreshGameIds
              : undefined,
        
        // v3.2: Removed stopping threshold fields
        // Backend now uses defaults: maxTotalErrors=1, maxConsecutiveNotFound=10
      };

      // Log helpful info about auto mode
      if (idSelectionMode === 'auto') {
        console.log('[ScraperTab] Auto mode configuration:', {
          startId: autoStartId,
          maxId: parseInt(idSelectionParams.maxId) || 'unlimited',
          gapsToProcess: autoGapIds?.length || 0,
          highestKnownId: highestTournamentId,
        });
      }

      // v3.1: Log helpful info about refresh mode
      if (idSelectionMode === 'refresh') {
        console.log('[ScraperTab] Refresh mode configuration:', {
          unfinishedGames: refreshGameIds?.length || 0,
          forceRefreshFromWeb: options.forceRefreshFromWeb,
          forceRefresh: jobInput.forceRefresh,
        });
      }

      console.log('[ScraperTab DEBUG] Batch job input:', JSON.stringify(jobInput, null, 2));

      try {
        // Use the existing startJob from useScraperJobs
        const newJob = await startJob(jobInput as unknown as StartScraperJobInput);
        
        if (newJob) {
          setActiveJobId(newJob.id || newJob.jobId || null);
          scraperLogger.info('PROCESSING_START', `Batch job started: ${newJob.id || newJob.jobId}`);
        }
      } catch (error) {
        console.error('Failed to start batch job:', error);
        alert(`Failed to start batch job: ${(error as Error).message}`);
        setConfigSectionOpen(true);
      }
    }
  }, [
    currentEntity, idSelectionMode, idSelectionParams, options, scrapeFlow,
    singleScrape, modals.saveConfirmation, defaultVenueId, scrapingStatus, startJob, urlToReparse, 
    onReparseComplete, suggestedNextId, getScrapingStatus, getUnfinishedGames, scraperApiKey, filterGapsByRange
  ]);

  const handleStopProcessing = useCallback(async () => {
    if (isBatchRunning && activeJobId) {
      await cancelJob(activeJobId);
    }
    singleScrape.reset();
    scraperLogger.info('PROCESSING_STOP', 'Processing stopped by user');
    // v3.3: Pass skipNotPublished when refreshing
    getScrapingStatus({ forceRefresh: true, skipNotPublished: options.skipNotPublished }).catch(() => {});
  }, [isBatchRunning, activeJobId, cancelJob, singleScrape, getScrapingStatus, options.skipNotPublished]);

  // --- Render ---
  if (!currentEntity) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 text-center">
        <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
        <p className="text-yellow-800 font-medium mb-2">No Entity Selected</p>
        <p className="text-sm text-yellow-700">Please select an entity from the sidebar to use the scraper.</p>
      </div>
    );
  }

  const isProcessing = singleScrape.isProcessing || isBatchRunning;

  return (
    <div className="space-y-4">
      {/* Config Section */}
      <CollapsibleSection
        title={
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Scraper Configuration: {currentEntity.entityName}</span>
          </div>
        }
        isOpen={configSectionOpen}
        onToggle={() => setConfigSectionOpen(!configSectionOpen)}
      >
        <div className="space-y-4">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Processing Mode</label>
            <div className="flex flex-wrap gap-2">
              {[
                { mode: 'single' as const, label: 'Single ID', desc: 'Interactive', icon: <Zap className="h-3 w-3" /> },
                { mode: 'bulk' as const, label: 'Bulk', desc: 'Next N IDs', icon: null },
                { mode: 'range' as const, label: 'Range', desc: 'ID range', icon: null },
                { mode: 'multiId' as const, label: 'Multi ID', desc: 'Custom IDs', icon: null },
                { mode: 'gaps' as const, label: 'Gaps', desc: 'Fill missing', icon: null },
                { mode: 'auto' as const, label: 'Auto', desc: 'Until threshold', icon: null },
                { mode: 'refresh' as const, label: 'Refresh', desc: 'Update existing', icon: <RefreshCw className="h-3 w-3" /> },
              ].map(({ mode, label, desc, icon }) => (
                <button
                  key={mode}
                  onClick={() => setIdSelectionMode(mode)}
                  disabled={isProcessing}
                  className={`px-3 py-2 text-sm rounded-lg border transition-all
                    ${idSelectionMode === mode 
                      ? 'bg-blue-600 text-white border-blue-600' 
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-1 font-medium">
                    {icon}
                    {label}
                  </div>
                  <div className={`text-xs ${idSelectionMode === mode ? 'text-blue-200' : 'text-gray-500'}`}>
                    {desc}
                  </div>
                </button>
              ))}
            </div>
            
            {/* Mode indicator */}
            <div className={`mt-2 text-xs px-2 py-1 rounded inline-block ${
              isSingleMode(idSelectionMode)
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-700'
            }`}>
              {isSingleMode(idSelectionMode)
                ? '✓ Frontend processing with interactive review' 
                : '→ Backend Lambda batch processing'}
            </div>
          </div>

          {/* Mode-specific inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isSingleMode(idSelectionMode) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tournament ID
                  {suggestedNextId && !gapLoading && (
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      (Next: {suggestedNextId})
                    </span>
                  )}
                  {gapLoading && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      (loading...)
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={idSelectionParams.singleId}
                    onChange={(e) => setIdSelectionParams(p => ({ ...p, singleId: e.target.value }))}
                    disabled={isProcessing}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder={gapLoading ? 'Loading...' : (suggestedNextId ? String(suggestedNextId) : '1')}
                  />
                  {suggestedNextId && idSelectionParams.singleId !== String(suggestedNextId) && (
                    <button
                      onClick={() => setIdSelectionParams(p => ({ ...p, singleId: String(suggestedNextId) }))}
                      disabled={isProcessing}
                      className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                      title="Reset to next ID"
                    >
                      Use Next
                    </button>
                  )}
                </div>
                {highestTournamentId && (
                  <p className="mt-1 text-xs text-gray-500">
                    Highest stored ID: {highestTournamentId}
                  </p>
                )}
                {!highestTournamentId && !gapLoading && currentEntity && (
                  <p className="mt-1 text-xs text-gray-500">
                    No games stored yet for {currentEntity.entityName}. Starting from ID 1.
                  </p>
                )}
              </div>
            )}

            {idSelectionMode === 'bulk' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of IDs</label>
                <input
                  type="number"
                  min="1"
                  value={idSelectionParams.bulkCount}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, bulkCount: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="10"
                />
              </div>
            )}

            {idSelectionMode === 'range' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start ID</label>
                  <input
                    type="number"
                    value={idSelectionParams.rangeStart}
                    onChange={(e) => setIdSelectionParams(p => ({ ...p, rangeStart: e.target.value }))}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End ID</label>
                  <input
                    type="number"
                    value={idSelectionParams.rangeEnd}
                    onChange={(e) => setIdSelectionParams(p => ({ ...p, rangeEnd: e.target.value }))}
                    disabled={isProcessing}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </>
            )}

            {idSelectionMode === 'multiId' && (
              <div className="col-span-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tournament IDs
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    (comma-separated IDs and ranges)
                  </span>
                </label>
                <input
                  type="text"
                  value={idSelectionParams.multiIdString}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, multiIdString: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., 100-110, 115, 120-125, 200"
                />
                {idSelectionParams.multiIdString && (
                  <div className="mt-1 text-xs">
                    {(() => {
                      const validationError = validateMultiIdString(idSelectionParams.multiIdString);
                      if (validationError) {
                        return (
                          <span className="text-red-600">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            {validationError}
                          </span>
                        );
                      }
                      const count = getMultiIdCount(idSelectionParams.multiIdString);
                      return (
                        <span className="text-green-600">
                          <CheckCircle className="h-3 w-3 inline mr-1" />
                          {count} tournament ID{count !== 1 ? 's' : ''} selected
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {idSelectionMode === 'auto' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max ID (optional)</label>
                <input
                  type="number"
                  value={idSelectionParams.maxId}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, maxId: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="No limit"
                />
                {/* Auto mode status info */}
                {!gapLoading && (
                  <div className="mt-2 text-xs text-gray-600 bg-blue-50 border border-blue-200 p-2 rounded">
                    <div className="font-medium text-blue-700 mb-1">Auto mode will:</div>
                    <ul className="list-disc list-inside space-y-0.5 text-blue-600">
                      <li>Start from ID <span className="font-mono font-medium">{highestTournamentId ? highestTournamentId + 1 : 1}</span></li>
                      {scrapingStatus?.gapSummary?.totalMissingIds ? (
                        <li>
                          Fill <span className="font-medium">{scrapingStatus.gapSummary.totalMissingIds}</span> gap IDs 
                          ({scrapingStatus.gapSummary.totalGaps} range{scrapingStatus.gapSummary.totalGaps !== 1 ? 's' : ''})
                        </li>
                      ) : (
                        <li className="text-green-600">✓ No gaps detected</li>
                      )}
                      <li>Stop on error or after 10 consecutive NOT_FOUND{idSelectionParams.maxId ? ` or ID ${idSelectionParams.maxId}` : ''}</li>
                    </ul>
                  </div>
                )}
                {gapLoading && (
                  <div className="mt-2 text-xs text-gray-500">
                    Loading gap data...
                  </div>
                )}
              </div>
            )}

            {/* v3.5: Updated Gaps mode with range selection */}
            {idSelectionMode === 'gaps' && (
              <div className="col-span-full space-y-3">
                {/* Gap status display */}
                <div className="text-sm text-gray-600">
                  {gapLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading gaps...
                    </span>
                  ) : scrapingStatus?.gaps?.length ? (
                    <span className="text-green-600">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      {scrapingStatus.gaps.length} gap range(s) found: {
                        scrapingStatus.gaps.slice(0, 5).map((gap: { start: number; end: number } | number) => 
                          typeof gap === 'number' ? String(gap) : `${gap.start}-${gap.end}`
                        ).join(', ')
                      }
                      {scrapingStatus.gaps.length > 5 ? '...' : ''}
                    </span>
                  ) : (
                    <span className="text-yellow-600">
                      <AlertCircle className="h-4 w-4 inline mr-1" />
                      No gaps detected
                    </span>
                  )}
                </div>

                {/* v3.5: Range selection for gaps */}
                {scrapingStatus?.gaps?.length ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Range Filter
                      <span className="ml-2 text-xs text-gray-500 font-normal">
                        (optional - leave blank to process all gaps)
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Start ID</label>
                        <input
                          type="number"
                          value={idSelectionParams.gapsRangeStart || ''}
                          onChange={(e) => setIdSelectionParams(p => ({ ...p, gapsRangeStart: e.target.value }))}
                          disabled={isProcessing}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Min: ${scrapingStatus.lowestTournamentId || 'N/A'}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">End ID</label>
                        <input
                          type="number"
                          value={idSelectionParams.gapsRangeEnd || ''}
                          onChange={(e) => setIdSelectionParams(p => ({ ...p, gapsRangeEnd: e.target.value }))}
                          disabled={isProcessing}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`Max: ${scrapingStatus.highestTournamentId || 'N/A'}`}
                        />
                      </div>
                    </div>
                    
                    {/* Show filtered count */}
                    <div className="mt-2 text-xs">
                      {filteredGapInfo.isFiltered ? (
                        <span className={filteredGapInfo.filteredCount > 0 ? 'text-blue-600' : 'text-yellow-600'}>
                          {filteredGapInfo.filteredCount > 0 ? (
                            <>
                              <CheckCircle className="h-3 w-3 inline mr-1" />
                              {filteredGapInfo.filteredCount} of {filteredGapInfo.totalGaps} gap IDs within range
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3 w-3 inline mr-1" />
                              No gaps found within specified range
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          Processing all {filteredGapInfo.totalGaps} gap IDs
                        </span>
                      )}
                    </div>
                    
                    {/* Quick clear button */}
                    {(idSelectionParams.gapsRangeStart || idSelectionParams.gapsRangeEnd) && (
                      <button
                        onClick={() => setIdSelectionParams(p => ({ ...p, gapsRangeStart: '', gapsRangeEnd: '' }))}
                        disabled={isProcessing}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                      >
                        Clear range filter
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* v3.1: Refresh mode info panel */}
            {idSelectionMode === 'refresh' && (
              <div className="col-span-full">
                <div className="text-sm text-gray-600 bg-amber-50 border border-amber-200 p-3 rounded">
                  {gapLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Loading unfinished games...
                    </span>
                  ) : scrapingStatus?.unfinishedGameCount ? (
                    <>
                      <div className="font-medium text-amber-800 mb-2">
                        <RefreshCw className="h-4 w-4 inline mr-1" />
                        {scrapingStatus.unfinishedGameCount} non-finished game(s) to refresh
                      </div>
                      <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                        <li>Games with status: RUNNING, REGISTERING, SCHEDULED</li>
                        <li>Will re-fetch tournament data to update standings</li>
                        {options.forceRefreshFromWeb && (
                          <li className="font-medium text-amber-900">
                            ⚡ Will fetch from LIVE web (ignoring S3 cache)
                          </li>
                        )}
                        {!options.forceRefreshFromWeb && options.useS3 && (
                          <li>Will use S3 cache if available (check "Force Refresh from Web" for live data)</li>
                        )}
                      </ul>
                    </>
                  ) : (
                    <span className="text-green-600">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      No unfinished games to refresh
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* v3.2: Removed Batch Thresholds section - now managed by backend defaults */}

          {/* Scrape Flow Toggle - Restored from pre-refactor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scrape Flow</label>
            <div className="flex rounded-md shadow-sm max-w-md">
              <button
                type="button"
                onClick={() => setScrapeFlow('scrape')}
                disabled={isProcessing}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-l-md border transition-colors ${
                  scrapeFlow === 'scrape'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Scrape Only
              </button>
              <button
                type="button"
                onClick={() => setScrapeFlow('scrape_save')}
                disabled={isProcessing}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b transition-colors ${
                  scrapeFlow === 'scrape_save'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Scrape + Save
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {scrapeFlow === 'scrape' 
                ? 'Preview scraped data without saving to database' 
                : 'Scrape and save to database'}
            </p>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={options.useS3} 
                onChange={(e) => setOptions(o => ({ ...o, useS3: e.target.checked }))} 
                disabled={isProcessing} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
              />
              <span>Use S3 Cache</span>
            </label>
            
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${scrapeFlow === 'scrape' ? 'opacity-50' : ''}`}>
              <input 
                type="checkbox" 
                checked={options.skipManualReviews} 
                onChange={(e) => setOptions(o => ({ ...o, skipManualReviews: e.target.checked }))} 
                disabled={isProcessing || scrapeFlow === 'scrape'} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" 
              />
              <span>Skip Manual Reviews</span>
              <span className="text-xs text-gray-500">(auto-save)</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={options.skipNotPublished} 
                onChange={(e) => setOptions(o => ({ ...o, skipNotPublished: e.target.checked }))} 
                disabled={isProcessing} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
              />
              <span>Skip NOT_PUBLISHED</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={options.skipNotFoundGaps} 
                onChange={(e) => setOptions(o => ({ ...o, skipNotFoundGaps: e.target.checked }))} 
                disabled={isProcessing} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
              />
              <span>Skip NOT_FOUND Gaps</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={options.ignoreDoNotScrape} 
                onChange={(e) => setOptions(o => ({ ...o, ignoreDoNotScrape: e.target.checked }))} 
                disabled={isProcessing} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
              />
              <span>Ignore Do Not Scrape</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input 
                type="checkbox" 
                checked={options.skipInProgress} 
                onChange={(e) => setOptions(o => ({ ...o, skipInProgress: e.target.checked }))} 
                disabled={isProcessing} 
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
              />
              <span>Skip In-Progress</span>
            </label>

            {/* v3.4: Force Refresh option - shown for refresh and gaps modes */}
            {(idSelectionMode === 'refresh' || idSelectionMode === 'gaps') && (
              <label className="flex items-center gap-2 text-sm cursor-pointer bg-amber-50 px-3 py-1.5 rounded border border-amber-200">
                <input 
                  type="checkbox" 
                  checked={options.forceRefreshFromWeb} 
                  onChange={(e) => setOptions(o => ({ ...o, forceRefreshFromWeb: e.target.checked }))} 
                  disabled={isProcessing} 
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500" 
                />
                <span className="font-medium text-amber-800">Force Refresh from Web</span>
                <span className="text-xs text-amber-600">(bypass S3 cache)</span>
              </label>
            )}

            {/* Auto-Creation Options - Only show when Scrape + Save is selected */}
            {scrapeFlow === 'scrape_save' && (
              <>
                <div className="w-full border-t border-gray-200 my-2" /> {/* Separator */}
                
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={options.autoCreateSeries ?? true} 
                    onChange={(e) => setOptions(o => ({ ...o, autoCreateSeries: e.target.checked }))} 
                    disabled={isProcessing} 
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" 
                  />
                  <span>Auto-Create Series</span>
                  <span className="text-xs text-gray-500">(when pattern detected)</span>
                </label>
                
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={options.autoCreateRecurring ?? true} 
                    onChange={(e) => setOptions(o => ({ ...o, autoCreateRecurring: e.target.checked }))} 
                    disabled={isProcessing} 
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500" 
                  />
                  <span>Auto-Create Recurring</span>
                  <span className="text-xs text-gray-500">(when pattern detected)</span>
                </label>
              </>
            )}

          </div>

          {/* Venue Selection */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Venue</label>
              <select
                value={defaultVenueId}
                onChange={(e) => setDefaultVenueId(e.target.value)}
                disabled={isProcessing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select venue...</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            {defaultVenueId && defaultVenueId !== entityDefaultVenueId && (
              <button
                onClick={() => handleSaveDefaultVenue(defaultVenueId)}
                disabled={isSavingDefaultVenue || isProcessing}
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
              >
                {isSavingDefaultVenue ? 'Saving...' : 'Set as Default'}
              </button>
            )}
          </div>

          {/* API Key - available for all modes */}
          <div className="pt-2">
            <form onSubmit={(e) => e.preventDefault()}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scraper API Key (optional)
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  Used when fetching from live site
                </span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={scraperApiKey}
                  onChange={(e) => setScraperApiKey(e.target.value)}
                  disabled={isProcessing}
                  autoComplete="off"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter API key..."
                />
                <button 
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)} 
                  className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </form>
          </div>

          {/* Start/Stop Buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleStartProcessing}
              disabled={isProcessing || !defaultVenueId}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed
                ${scrapeFlow === 'scrape_save' 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              <Play className="h-4 w-4" />
              {isProcessing 
                ? 'Processing...' 
                : isSingleMode(idSelectionMode) 
                  ? (scrapeFlow === 'scrape_save' ? 'Scrape + Save' : 'Scrape Only')
                  : `Start Batch Job`}
            </button>
            
            {isProcessing && (
              <button onClick={handleStopProcessing} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                <Square className="h-4 w-4" />
                Stop
              </button>
            )}
            
            {!defaultVenueId && (
              <span className="text-sm text-yellow-600 self-center">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Please select a default venue
              </span>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Single ID Result - Using GameListItem for rich formatting */}
      {singleScrape.result && (
        <div className="space-y-3">
          <GameListItem
            game={{
              id: singleScrape.result.url || String(singleScrape.result.id),
              // Cast to any to handle ScrapedGameData vs GameData type differences (null vs undefined)
              data: singleScrape.result.parsedData as any,
              errorMessage: singleScrape.result.status === 'error' ? singleScrape.result.message : undefined,
              saveResult: singleScrape.result.savedGameId ? { 
                success: true, 
                gameId: singleScrape.result.savedGameId 
              } : undefined,
              existingGameId: singleScrape.result.savedGameId,
              // Required GameState fields - using correct types from game.ts
              source: 'SCRAPE' as any, // DataSource enum from API
              jobStatus: singleScrape.result.status === 'scraping' ? 'SCRAPING' 
                : singleScrape.result.status === 'saving' ? 'SAVING'
                : singleScrape.result.status === 'success' ? 'DONE'
                : singleScrape.result.status === 'error' ? 'ERROR'
                : singleScrape.result.status === 'review' ? 'READY_TO_SAVE'
                : 'IDLE',
              fetchCount: 1,
            }}
            processingStatus={singleScrape.result.status}
            processingMessage={singleScrape.result.message}
            dataSource={singleScrape.result.dataSource || 'none'}
            tournamentId={singleScrape.result.id}
            sourceUrl={singleScrape.result.url}
            compact={false}
            showActions={true}
            onViewDetails={singleScrape.result.parsedData ? () => setSelectedGameDetails(singleScrape.result!.parsedData!) : undefined}
            onSave={
              singleScrape.result.status === 'review' && singleScrape.result.parsedData
                ? async () => {
                    // Capture values before opening modal to avoid stale closure issues
                    const capturedUrl = singleScrape.result!.url;
                    const capturedId = singleScrape.result!.id;
                    const capturedParsedData = singleScrape.result!.parsedData!;
                    // NOTE: For the GameListItem Save button, we use singleScrape.enrichedData from state
                    // This is safe here because this callback is triggered by user action AFTER
                    // scrape() has completed and React has had time to update state
                    const capturedEnrichedData = singleScrape.enrichedData;
                    const capturedAutoVenueId = singleScrape.result!.autoVenueId;
                    
                    // Merge: parsedData as base, enrichedData overlay (has series info)
                    const gameDataForModal = capturedEnrichedData 
                      ? { ...capturedParsedData, ...capturedEnrichedData } as ScrapedGameData
                      : capturedParsedData;
                    
                    const modalResult = await modals.saveConfirmation.openModal(
                      gameDataForModal,
                      capturedAutoVenueId || defaultVenueId,
                      currentEntity!.id
                    );
                    if (modalResult.action === 'save') {
                      await singleScrape.save(
                        modalResult.venueId || defaultVenueId,
                        modalResult.editedData as ScrapedGameData | undefined,
                        capturedUrl,
                        capturedId
                      );
                      // v3.3: Pass skipNotPublished when refreshing
                      getScrapingStatus({ forceRefresh: true, skipNotPublished: options.skipNotPublished }).catch(() => {});
                    }
                  }
                : undefined
            }
            selectedVenueId={singleScrape.result.selectedVenueId || defaultVenueId}
            venues={venues}
          />
          
          {/* Process Next Button */}
          {['success', 'error', 'skipped', 'review'].includes(singleScrape.result.status) && !singleScrape.isProcessing && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  singleScrape.reset();
                  handleStartProcessing();
                }}
                disabled={!defaultVenueId}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="h-4 w-4" />
                Process Next ({idSelectionParams.singleId})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* BATCH JOB PROGRESS - NEW: Real-time monitoring with polling       */}
      {/* Replaces the old static display with live updates                 */}
      {/* ================================================================= */}
       {activeJobId && (
         <BatchJobProgress
           jobId={activeJobId}
           onClear={handleClearJob}
           onComplete={handleJobComplete}
           onStop={handleStopProcessing}  // NEW: Stop button now visible in BatchJobProgress header
           showDetailedStats={true}
           showStreamingGames={true}    // NEW: Enable real-time GameListItem display
           maxStreamedGames={50}        // NEW: Optional - limit number of games shown (default: 50)
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
          onConfirm={(editedData: any) => modals.saveConfirmation.confirm(editedData?.venueId || defaultVenueId, editedData)}
          gameData={modals.saveConfirmation.state.gameData as any}
          venueId={modals.saveConfirmation.state.suggestedVenueId || defaultVenueId}
          sourceUrl={singleScrape.result?.url || ''}
          entityId={currentEntity.id}
          autoMode={false}
          skipConfirmation={false}
        />
      )}
      
    </div>
  );
};

export default ScrapeTab;