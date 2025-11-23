import React, { useState, useEffect, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  Play, StopCircle, Settings, Eye, ChevronDown, ChevronRight,
  RefreshCw, Pause, CheckCircle, Key
} from 'lucide-react';

// --- Real Imports ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';
import { Venue } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { GameDetailsModal } from '../../components/scraper/admin/GameDetailsModal';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';
import { ScrapeOptionsModal } from '../../components/scraper/ScrapeOptionsModal';
import { VenueModal } from '../../components/venues/VenueModal';
import { GameListItem } from '../../components/scraper/GameListItem';
import {
  fetchGameDataFromBackend,
  saveGameDataToBackend
} from '../../services/gameService';
import { ScrapedGameData } from '../../API';
import type { GameState, GameData } from '../../types/game';

// --- Types ---

type IdSelectionMode = 'next' | 'bulk' | 'range' | 'gaps' | 'refresh' | 'auto';
type ScrapeFlow = 'scrape' | 'scrape_save';
type ProcessingStatus = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'skipped' | 'error';

interface ScrapeOptions {
  useS3: boolean;
  skipManualReviews: boolean;
  ignoreDoNotScrape: boolean;
  skipInProgress: boolean;
  overrideExisting: boolean;
}

interface IdSelectionParams {
  bulkCount: string;
  rangeString: string;
}

interface ProcessingResult {
  id: number;
  url: string;
  status: ProcessingStatus;
  message: string;
  parsedData?: ScrapedGameData;
  autoVenueId?: string;
  selectedVenueId?: string;
  savedGameId?: string;
}

interface GameForReview {
  game: ScrapedGameData;
  venueId: string;
  entityId: string;
}

interface ModalResolverValue {
  action: 'save' | 'cancel';
  gameData?: ScrapedGameData | GameData;
  venueId?: string;
}

// Helper to get client lazily (after Amplify is configured)
const getClient = () => generateClient();

// --- Component Props ---

interface ScrapeTabProps {
  urlToReparse?: string | null;
  onReparseComplete?: () => void;
}

// ===================================================================
// PROGRESS SUMMARY BAR
// ===================================================================

interface ProgressSummaryProps {
  results: ProcessingResult[];
  isProcessing: boolean;
  isPaused: boolean;
  mode: IdSelectionMode;
  flow: ScrapeFlow;
  onStop: () => void;
}

const ProgressSummary: React.FC<ProgressSummaryProps> = ({
  results, isProcessing, isPaused, mode, flow, onStop
}) => {
  const total = results.length;
  const completed = results.filter(r => ['success', 'error', 'skipped'].includes(r.status)).length;
  const successful = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const inProgress = results.find(r => ['scraping', 'saving', 'review'].includes(r.status));
  
  const progressPercent = total > 0 ? (completed / total) * 100 : 0;

  const getModeLabel = () => {
    switch (mode) {
      case 'next': return 'Next ID';
      case 'bulk': return 'Bulk';
      case 'range': return 'Range';
      case 'gaps': return 'Fill Gaps';
      case 'refresh': return 'Refresh';
      case 'auto': return 'Auto';
      default: return mode;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {isPaused ? (
            <Pause className="h-5 w-5 text-purple-600" />
          ) : isProcessing ? (
            <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
          ) : (
            <CheckCircle className="h-5 w-5 text-green-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {isPaused ? 'Paused for Review' : isProcessing ? 'Processing...' : 'Complete'}
            </p>
            <p className="text-xs text-gray-500">
              {getModeLabel()} • {flow === 'scrape' ? 'Scrape Only' : 'Scrape + Save'}
            </p>
          </div>
        </div>
        
        {isProcessing && !isPaused && (
          <button
            onClick={onStop}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 border border-red-300 rounded-md hover:bg-red-50"
          >
            Stop
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div 
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stats Row */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">
          {completed} / {total} processed
        </span>
        <div className="flex items-center gap-3">
          {successful > 0 && (
            <span className="text-green-600 font-medium">✓ {successful}</span>
          )}
          {skipped > 0 && (
            <span className="text-yellow-600 font-medium">⊘ {skipped}</span>
          )}
          {errors > 0 && (
            <span className="text-red-600 font-medium">✗ {errors}</span>
          )}
        </div>
      </div>

      {/* Currently Processing */}
      {inProgress && (
        <p className="text-xs text-blue-600 mt-2 truncate">
          {inProgress.status === 'review' ? '👁 Reviewing' : '⏳ Processing'} ID {inProgress.id}: {inProgress.message}
        </p>
      )}
    </div>
  );
};

// ===================================================================
// COLLAPSIBLE SECTION COMPONENT
// ===================================================================

interface CollapsibleSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title, children, isOpen, onToggle, className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-gray-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 p-4">
          {children}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScrapeTab: React.FC<ScrapeTabProps> = ({ urlToReparse, onReparseComplete }) => {
  const { currentEntity } = useEntity();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [defaultVenueId, setDefaultVenueId] = useState<string>('');
  const [entityDefaultVenueId, setEntityDefaultVenueId] = useState<string>(''); // Entity's saved default
  const [isSavingDefaultVenue, setIsSavingDefaultVenue] = useState(false);

  // --- Section Collapse State ---
  const [entitySectionOpen, setEntitySectionOpen] = useState(true);
  const [configSectionOpen, setConfigSectionOpen] = useState(true);

  // --- State for UI ---
  const [idSelectionMode, setIdSelectionMode] = useState<IdSelectionMode>('next');
  const [idSelectionParams, setIdSelectionParams] = useState<IdSelectionParams>({
    bulkCount: '10',
    rangeString: '',
  });
  const [scrapeFlow, setScrapeFlow] = useState<ScrapeFlow>('scrape');
  const [options, setOptions] = useState<ScrapeOptions>({
    useS3: true,
    skipManualReviews: false,
    ignoreDoNotScrape: false,
    skipInProgress: false,
    overrideExisting: false,
  });

  // ✅ NEW: ScraperAPI Key Configuration
  const [scraperApiKey, setScraperApiKey] = useState<string>('62c905a307da2591dc89f94d193caacf');
  const [showApiKey, setShowApiKey] = useState<boolean>(false);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modals & Review
  const [gameForReview, setGameForReview] = useState<GameForReview | null>(null);
  const [selectedGameDetails, setSelectedGameDetails] = useState<ScrapedGameData | null>(null);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  
  // Scrape Options Modal (for doNotScrape handling)
  const [scrapeOptionsModal, setScrapeOptionsModal] = useState<{
    isOpen: boolean;
    tournamentId: number;
    url: string;
    gameStatus?: string;
  } | null>(null);

  // Gap Tracker
  const {
    scrapingStatus,
    getScrapingStatus,
    getUnfinishedGames,
  } = useGameIdTracking(currentEntity?.id);

  // --- Data Loading ---

  useEffect(() => {
    if (currentEntity?.id) {
      getScrapingStatus({ entityId: currentEntity.id });
      fetchVenues();
    }
  }, [currentEntity?.id]);

  // Watch for changes to entity's defaultVenueId
  useEffect(() => {
    if (currentEntity?.defaultVenueId) {
      setDefaultVenueId(currentEntity.defaultVenueId);
      setEntityDefaultVenueId(currentEntity.defaultVenueId);
    }
  }, [currentEntity?.defaultVenueId]);

  useEffect(() => {
    if (urlToReparse && currentEntity?.id) {
      const urlMatch = urlToReparse.match(/[?&]id=(\d+)/);
      if (urlMatch) {
        const tournamentId = parseInt(urlMatch[1]);
        setIdSelectionMode('range');
        setIdSelectionParams(prev => ({ ...prev, rangeString: tournamentId.toString() }));
      }
      if (onReparseComplete) {
        onReparseComplete();
      }
    }
  }, [urlToReparse, currentEntity?.id, onReparseComplete]);

  const fetchVenues = async () => {
    if (!currentEntity?.id) return;
    try {
      const response = await getClient().graphql({
        query: listVenuesForDropdown,
        variables: { filter: { entityId: { eq: currentEntity.id } } }
      }) as any;
      const venueItems = (response.data?.listVenues?.items as Venue[]).filter(Boolean);
      setVenues(venueItems);
      
      // Use Entity's defaultVenueId if set, otherwise use first venue
      if (currentEntity.defaultVenueId) {
        setDefaultVenueId(currentEntity.defaultVenueId);
        setEntityDefaultVenueId(currentEntity.defaultVenueId);
      } else if (venueItems.length > 0) {
        setDefaultVenueId(venueItems[0].id);
        setEntityDefaultVenueId(''); // No entity default set
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
    }
  };

  const updateEntityDefaultVenue = async () => {
    if (!currentEntity?.id || !defaultVenueId) return;
    
    setIsSavingDefaultVenue(true);
    try {
      await getClient().graphql({
        query: /* GraphQL */ `
          mutation UpdateEntityDefaultVenue($input: UpdateEntityInput!) {
            updateEntity(input: $input) {
              id
              defaultVenueId
              entityName
            }
          }
        `,
        variables: {
          input: {
            id: currentEntity.id,
            defaultVenueId: defaultVenueId
          }
        }
      });
      
      setEntityDefaultVenueId(defaultVenueId);
      console.log('Entity default venue updated successfully');
    } catch (error) {
      console.error('Error updating entity default venue:', error);
      alert('Failed to save default venue to entity');
    } finally {
      setIsSavingDefaultVenue(false);
    }
  };

  // --- ID Queue Generation ---

  const parseRangeString = (rangeStr: string): number[] => {
    const ids = new Set<number>();
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (trimmedPart.includes('-')) {
        const [start, end] = trimmedPart.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            ids.add(i);
          }
        }
      } else {
        const num = Number(trimmedPart);
        if (!isNaN(num)) {
          ids.add(num);
        }
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  };

  const generateIdQueue = async (): Promise<number[]> => {
    if (!scrapingStatus) {
      alert("Scraping status not loaded. Please refresh.");
      return [];
    }

    const { gaps, highestTournamentId } = scrapingStatus;

    switch (idSelectionMode) {
      case 'next':
        const nextId = (gaps && gaps.length > 0) ? gaps[0].start : (highestTournamentId || 0) + 1;
        return [nextId];
      
      case 'bulk':
        const count = parseInt(idSelectionParams.bulkCount) || 10;
        const startId = (gaps && gaps.length > 0) ? gaps[0].start : (highestTournamentId || 0) + 1;
        return Array.from({ length: count }, (_, i) => startId + i);

      case 'range':
        return parseRangeString(idSelectionParams.rangeString);

      case 'gaps':
        if (!gaps || gaps.length === 0) return [];
        const gapIds: number[] = [];
        for (const gap of gaps) {
          for (let i = gap.start; i <= gap.end; i++) {
            gapIds.push(i);
          }
        }
        return gapIds;

      case 'refresh':
        const unfinished = await getUnfinishedGames({ entityId: currentEntity?.id || '', limit: 1000 });
        return (unfinished.items || []).map(g => g.tournamentId).filter(Boolean) as number[];

      case 'auto':
        const autoQueue: number[] = [];
        if (gaps && gaps.length > 0) {
          for (const gap of gaps) {
            for (let i = gap.start; i <= gap.end; i++) {
              autoQueue.push(i);
            }
          }
        } else {
          autoQueue.push((highestTournamentId || 0) + 1);
        }
        return autoQueue;

      default:
        return [];
    }
  };

  // --- Processing Logic ---

  const handleStartProcessing = async () => {
    if (!currentEntity) {
      alert("Please select an entity first.");
      return;
    }

    const queue = await generateIdQueue();
    if (queue.length === 0) {
      alert("No IDs to process with the current selection.");
      return;
    }

    // Auto-collapse sections when processing starts
    setEntitySectionOpen(false);
    setConfigSectionOpen(false);

    setIsProcessing(true);
    setIsPaused(false);
    setProcessingResults([]);
    abortControllerRef.current = new AbortController();

    const initialResults: ProcessingResult[] = queue.map(id => ({
      id,
      url: `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${id}`,
      status: 'pending',
      message: 'Waiting...'
    }));
    setProcessingResults(initialResults);

    await processQueue(queue, abortControllerRef.current.signal);

    setIsProcessing(false);
    setIsPaused(false);
  };

  const handleStopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    setIsPaused(false);
  };

const processQueue = async (queue: number[], signal: AbortSignal) => {
  for (let i = 0; i < queue.length; i++) {
    if (signal.aborted) break;

    const tournamentId = queue[i];
    const url = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;

    setProcessingResults(prev => prev.map(r =>
      r.id === tournamentId ? { ...r, status: 'scraping', message: 'Scraping...', parsedData: r.parsedData } : r
    ));

    try {
      // ✅ UPDATED: Pass API key to fetchGameDataFromBackend
      const parsedData = await fetchGameDataFromBackend(
        url,
        !options.useS3,  // forceRefresh = !useS3
        scraperApiKey    // Pass the API key
      );

      // ✅ ENHANCED DEBUG: Log the raw response from backend to verify source field
      console.log('[ScraperTab] Received data for tournament', tournamentId, {
        name: parsedData.name,
        doNotScrape: parsedData.doNotScrape,
        gameStatus: parsedData.gameStatus,
        skipped: (parsedData as any).skipped,
        skipReason: (parsedData as any).skipReason,
        // ✅ NEW: Check for source field from backend
        source: (parsedData as any).source,
        s3Key: parsedData.s3Key,
        // ✅ NEW: Check if source field exists at all
        hasSourceField: 'source' in parsedData,
        allKeys: Object.keys(parsedData).sort()
      });

      // Check for doNotScrape skip - show options modal unless ignoreDoNotScrape is set
      // Multiple ways to detect a skipped tournament:
      // 1. Backend explicitly returns skipped: true and skipReason
      // 2. Backend returns doNotScrape: true with the skip name pattern
      // 3. Name matches the skip pattern
      const isSkippedDoNotScrape = 
        ((parsedData as any).skipped && (parsedData as any).skipReason === 'DO_NOT_SCRAPE') ||
        (parsedData.doNotScrape && parsedData.name?.includes('Skipped')) ||
        (parsedData.name === 'Skipped - Do Not Scrape');
      
      console.log('[ScraperTab] isSkippedDoNotScrape:', isSkippedDoNotScrape, 
        'ignoreDoNotScrape:', options.ignoreDoNotScrape,
        'willShowModal:', isSkippedDoNotScrape && !options.ignoreDoNotScrape);
      
      if (isSkippedDoNotScrape && !options.ignoreDoNotScrape) {
        setIsPaused(true);
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'review',
            message: 'Tournament marked as Do Not Scrape - awaiting decision...',
            parsedData
          } : r
        ));

        // Show ScrapeOptionsModal and wait for user decision
        // UPDATED: Now includes 'SAVE_PLACEHOLDER' option
        const modalResult = await new Promise<{ action: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER', s3Key?: string }>((resolve) => {
          setScrapeOptionsModal({
            isOpen: true,
            tournamentId,
            url,
            gameStatus: parsedData.gameStatus || undefined
          });
          (window as any).__scrapeOptionsResolver = resolve;
        });

        setScrapeOptionsModal(null);
        setIsPaused(false);

        // Handle SAVE_PLACEHOLDER action - save NOT_PUBLISHED game with placeholder data
        if (modalResult.action === 'SAVE_PLACEHOLDER') {
        try {
            setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { ...r, status: 'saving', message: 'Saving NOT_PUBLISHED placeholder...' } : r
            ));
            
            const sourceUrl = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
            
            // Capture the save result
            const saveResult = await saveGameDataToBackend(
            sourceUrl,
            defaultVenueId,
            parsedData,
            null,
            currentEntity?.id || ''
            );
            
            setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
                ...r,
                status: 'success',
                message: 'Saved (NOT_PUBLISHED placeholder)',
                parsedData,
                savedGameId: saveResult.gameId || undefined
            } : r
            ));

            // Refresh scraping status to reflect the new save
            await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });

        } catch (error: any) {
            setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
                ...r,
                status: 'error',
                message: `Failed to save placeholder: ${error.message}`,
                parsedData
            } : r
            ));
        }
        continue;
        }

        if (modalResult.action === 'SKIP' || signal.aborted) {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'skipped',
              message: `Skipped (${parsedData.gameStatus || 'Do Not Scrape'})`,
              parsedData
            } : r
          ));
          continue;
        }

        // User chose to fetch from S3 or Live - refetch with override
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? { ...r, status: 'scraping', message: `Fetching from ${modalResult.action}...` } : r
        ));

        // Refetch with the chosen option
        // ✅ UPDATED: Pass API key to fetchGameDataFromBackend
        const refetchedData = await fetchGameDataFromBackend(
          url,
          modalResult.action === 'LIVE',  // forceRefresh if LIVE selected
          scraperApiKey                    // Pass the API key
        );
        
        // Replace parsedData with refetched data
        Object.assign(parsedData, refetchedData);
      }

      // Skip in-progress games if option is enabled
      if (options.skipInProgress && (parsedData.gameStatus === 'RUNNING' || parsedData.gameStatus === 'SCHEDULED')) {
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'skipped',
            message: `Skipped (${parsedData.gameStatus})`,
            parsedData
          } : r
        ));
        continue;
      }

      // ============================================================
      // Handle NOT_PUBLISHED games in bulk/auto mode (skipManualReviews)
      // This auto-saves without showing the modal
      // ============================================================
      if (parsedData.gameStatus === 'NOT_PUBLISHED' && options.skipManualReviews) {
        if (scrapeFlow === 'scrape_save') {
          try {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? { ...r, status: 'saving', message: 'Saving NOT_PUBLISHED placeholder...' } : r
            ));
            
            const sourceUrl = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}${tournamentId}`;
            
            const saveResult = await saveGameDataToBackend(
                sourceUrl,
                defaultVenueId,
                parsedData,
                null,
                currentEntity?.id || ''
            );
            
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? {
                ...r,
                status: 'success',
                message: 'Saved (NOT_PUBLISHED placeholder)',
                parsedData,
                savedGameId: saveResult.gameId || undefined
              } : r
            ));

            // Refresh scraping status to reflect the new save
            await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });

          } catch (error: any) {
            setProcessingResults(prev => prev.map(r =>
              r.id === tournamentId ? {
                ...r,
                status: 'error',
                message: `Failed to save NOT_PUBLISHED: ${error.message}`,
                parsedData
              } : r
            ));
          }
        } else {
          // Scrape-only mode - mark as skipped
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? {
              ...r,
              status: 'skipped',
              message: 'Skipped (NOT_PUBLISHED)',
              parsedData
            } : r
          ));
        }
        continue;
      }
      // ============================================================

      // Scrape-only mode: mark success and allow manual save
      if (scrapeFlow === 'scrape') {
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'success',
            message: 'Scraped (ready to save)',
            parsedData: r.parsedData,
            selectedVenueId: defaultVenueId
          } : r
        ));
        continue;
      }

      // Save flow
      setProcessingResults(prev => prev.map(r =>
        r.id === tournamentId ? { ...r, status: 'saving', message: 'Determining venue...' } : r
      ));

      let venueIdToUse = '';
      let modalResult: ModalResolverValue | undefined;
      const autoVenueId = parsedData.venueMatch?.autoAssignedVenue?.id;

      if (options.skipManualReviews) {
        venueIdToUse = autoVenueId || defaultVenueId;
        if (autoVenueId) {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { ...r, autoVenueId: venueIdToUse } : r
          ));
        }
      } else {
        setIsPaused(true);
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? { ...r, status: 'review', message: 'Awaiting review...' } : r
        ));

        const suggestedVenueId = autoVenueId || defaultVenueId || '';
        modalResult = await showSaveConfirmationModal(parsedData, suggestedVenueId, currentEntity?.id || '');
        
        setIsPaused(false);

        if (modalResult.action === 'cancel' || signal.aborted) {
          setProcessingResults(prev => prev.map(r =>
            r.id === tournamentId ? { ...r, status: 'skipped', message: 'User cancelled' } : r
          ));
          continue;
        }

        venueIdToUse = modalResult.venueId || '';
      }

      if (!venueIdToUse) {
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? { ...r, status: 'error', message: 'No venue selected' } : r
        ));
        continue;
      }

      if (parsedData.existingGameId && !options.overrideExisting) {
        setProcessingResults(prev => prev.map(r =>
          r.id === tournamentId ? {
            ...r,
            status: 'skipped',
            message: 'Game already exists (override disabled)',
            parsedData
          } : r
        ));
        continue;
      }

      setProcessingResults(prev => prev.map(r =>
        r.id === tournamentId ? { ...r, status: 'saving', message: 'Saving to Game...' } : r
      ));

      // Use edited data from modal if available
      const dataToSave = modalResult?.gameData || parsedData;

      const sourceUrl = (dataToSave as any).sourceUrl || 
        (currentEntity ? `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${dataToSave.tournamentId}` : 
        `Tournament ID: ${dataToSave.tournamentId}`);

      const sanitizedData = {
        ...dataToSave,
        gameStartDateTime: dataToSave.gameStartDateTime ?? undefined
      } as any;

      const saveResult = await saveGameDataToBackend(
        sourceUrl,
        venueIdToUse,
        sanitizedData,
        (dataToSave as any).existingGameId || null,
        currentEntity?.id || ''
      );

      setProcessingResults(prev => prev.map(r =>
        r.id === tournamentId ? {
          ...r,
          status: 'success',
          message: 'Successfully saved',
          parsedData,
          savedGameId: saveResult.gameId || undefined
        } : r
      ));

      // Refresh scraping status to reflect the new save
      await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });

    } catch (error: any) {
      setProcessingResults(prev => prev.map(r =>
        r.id === tournamentId ? {
          ...r,
          status: 'error',
          message: error.message || 'Unknown error'
        } : r
      ));
    }
  }
};


  // --- Manual Save from Results ---

const handleManualSave = async (result: ProcessingResult) => {
    if (!currentEntity || !result.parsedData) return;
    
    // Check if this is a NOT_PUBLISHED game - save directly as placeholder
    if (result.parsedData.gameStatus === 'NOT_PUBLISHED') {
        // Simple confirmation for NOT_PUBLISHED
        const confirmed = window.confirm(
            `Save tournament ${result.id} as NOT_PUBLISHED placeholder?\n\n` +
            `This will create a minimal database record to track this tournament ID.`
        );
        
        if (!confirmed) {
            setProcessingResults(prev => prev.map(r =>
                r.id === result.id ? { ...r, status: 'pending', message: 'Save cancelled' } : r
            ));
            return;
        }
        
        // Save directly without modal
        setProcessingResults(prev => prev.map(r =>
            r.id === result.id ? { ...r, status: 'saving', message: 'Saving NOT_PUBLISHED placeholder...' } : r
        ));
        
        try {
            const sourceUrl = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${result.id}`;
            
            const saveResult = await saveGameDataToBackend(
                sourceUrl,
                result.selectedVenueId || defaultVenueId,
                result.parsedData,
                null,
                currentEntity.id
            );
            
            setProcessingResults(prev => prev.map(r =>
                r.id === result.id ? {
                    ...r,
                    status: 'success',
                    message: 'Saved (NOT_PUBLISHED placeholder)',
                    savedGameId: saveResult.gameId || undefined
                } : r
            ));

            // Refresh scraping status to reflect the new save
            await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });

        } catch (error: any) {
            setProcessingResults(prev => prev.map(r =>
                r.id === result.id ? {
                    ...r,
                    status: 'error',
                    message: `Failed to save: ${error.message}`
                } : r
            ));
        }
        return;
    }

    // Instead of saving directly, show the modal
    setIsPaused(true);
    setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { ...r, status: 'review', message: 'Opening for review...', parsedData: r.parsedData } : r
    ));
    
    const modalResult = await showSaveConfirmationModal(
        result.parsedData, 
        result.selectedVenueId || defaultVenueId || '',
        currentEntity.id
    );
    
    setIsPaused(false);
    
    if (modalResult.action === 'cancel') {
        setProcessingResults(prev => prev.map(r =>
            r.id === result.id ? { ...r, status: 'pending', message: 'Save cancelled' } : r
        ));
        return;
    }
    
    // Now save with the potentially edited data
    setProcessingResults(prev => prev.map(r =>
        r.id === result.id ? { ...r, status: 'saving', message: 'Saving to Game...' } : r
    ));
    
    try {
        const dataToSave = modalResult.gameData || result.parsedData;
        const sourceUrl = (dataToSave as any).sourceUrl || 
            `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${dataToSave.tournamentId}`;
        
        const sanitizedData = {
            ...dataToSave,
            gameStartDateTime: dataToSave.gameStartDateTime ?? undefined
        } as any;
        
        const saveResult = await saveGameDataToBackend(
            sourceUrl,
            modalResult.venueId || result.selectedVenueId || '',
            sanitizedData,
            (dataToSave as any).existingGameId || null,
            currentEntity.id,
            {
                wasEdited: modalResult.gameData ? true : false,
                originalData: modalResult.gameData ? result.parsedData : undefined
            }
        );

        setProcessingResults(prev => prev.map(r =>
            r.id === result.id ? { 
            ...r, 
            status: 'success', 
            message: 'Successfully saved',
            savedGameId: saveResult.gameId || undefined
            } : r
        ));

        // Refresh scraping status to reflect the new save
        await getScrapingStatus({ entityId: currentEntity?.id, forceRefresh: true });
        
    } catch (error: any) {
        setProcessingResults(prev => prev.map(r =>
            r.id === result.id ? { ...r, status: 'error', message: error.message || 'Save failed' } : r
        ));
    }
};

  const handleResultVenueChange = (resultId: number, venueId: string) => {
    setProcessingResults(prev => prev.map(r =>
      r.id === resultId ? { ...r, selectedVenueId: venueId } : r
    ));
  };

  // --- Modal Handling ---

  const showSaveConfirmationModal = (game: ScrapedGameData, venueId: string, entityId: string): Promise<ModalResolverValue> => {
    return new Promise((resolve) => {
      setGameForReview({ game, venueId, entityId });
      (window as any).__modalResolver = (result: ModalResolverValue) => {
        setGameForReview(null);
        resolve(result);
      };
    });
  };

  const handleModalConfirm = (editedGame: GameData, venueId: string) => {
    if ((window as any).__modalResolver) {
        (window as any).__modalResolver({ action: 'save', gameData: editedGame, venueId });
    }
  };

  const handleModalClose = () => {
    if ((window as any).__modalResolver) {
      (window as any).__modalResolver({ action: 'cancel' });
    }
    setGameForReview(null);
  };

    // --- Convert ProcessingResult to GameState ---

    const resultToGameState = (result: ProcessingResult): GameState => {
    // Convert ScrapedGameData to GameData format
    const gameData = result.parsedData ? {
        ...result.parsedData,
        gameStartDateTime: result.parsedData.gameStartDateTime ?? undefined,
    } : undefined;

    // Determine if this is a successful save
    const isSuccessfulSave = result.status === 'success' && 
        (result.savedGameId || 
        result.message.includes('Successfully saved') || 
        result.message.includes('Saved (NOT_PUBLISHED'));

    return {
        id: result.url,
        source: 'SCRAPER' as any,
        data: gameData as any,
        jobStatus: result.status === 'scraping' ? 'SCRAPING' : 
                result.status === 'saving' ? 'SAVING' : 
                result.status === 'success' ? 'DONE' :
                result.status === 'error' ? 'ERROR' : 'IDLE',
        errorMessage: result.status === 'error' ? result.message : undefined,
        existingGameId: result.savedGameId || result.parsedData?.existingGameId,
        saveResult: isSuccessfulSave 
        ? { id: result.savedGameId || result.parsedData?.existingGameId || 'saved' } 
        : undefined,
        fetchCount: 1,
    };
    };

  // --- UI Helpers ---

  const renderIdSelectionInputs = () => {
    switch (idSelectionMode) {
      case 'bulk':
        return (
          <input
            type="number"
            value={idSelectionParams.bulkCount}
            onChange={e => setIdSelectionParams(prev => ({ ...prev, bulkCount: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Number of IDs"
            disabled={isProcessing}
          />
        );
      case 'range':
        return (
          <input
            type="text"
            value={idSelectionParams.rangeString}
            onChange={e => setIdSelectionParams(prev => ({ ...prev, rangeString: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="e.g., 1,3,5-10,15"
            disabled={isProcessing}
          />
        );
      case 'auto':
        return (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700">Auto mode will continuously process gaps, then increment.</p>
          </div>
        );
      default:
        return (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-sm text-gray-600">No additional parameters needed.</p>
          </div>
        );
    }
  };

  const renderOption = (key: keyof ScrapeOptions, label: string, description: string) => (
    <label className="flex items-start space-x-3 cursor-pointer">
      <input
        type="checkbox"
        checked={options[key]}
        onChange={e => setOptions(prev => ({ ...prev, [key]: e.target.checked }))}
        className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded"
        disabled={isProcessing}
      />
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
    </label>
  );

  // ✅ NEW: API Key Configuration UI Component
  const renderApiKeyConfig = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-gray-500" />
        <label className="text-sm font-medium text-gray-700">
          ScraperAPI Key
        </label>
      </div>
      
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={scraperApiKey}
            onChange={(e) => setScraperApiKey(e.target.value)}
            disabled={isProcessing}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="Enter ScraperAPI key"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowApiKey(!showApiKey)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          disabled={isProcessing}
        >
          {showApiKey ? 'Hide' : 'Show'}
        </button>
      </div>
      
      <p className="text-xs text-gray-500">
        This key is used to fetch tournament pages through ScraperAPI.
        {!scraperApiKey && <span className="text-amber-600 ml-1">⚠ No key configured - fetches may fail</span>}
      </p>
    </div>
  );

  // --- Entity Warning ---
  if (!currentEntity) {
    return (
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 text-center">
        <p className="text-yellow-800 font-medium mb-2">No Entity Selected</p>
        <p className="text-sm text-yellow-700">
          Please select an entity from the sidebar to use the scraper.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Summary */}
      {(isProcessing || processingResults.length > 0) && (
        <ProgressSummary
          results={processingResults}
          isProcessing={isProcessing}
          isPaused={isPaused}
          mode={idSelectionMode}
          flow={scrapeFlow}
          onStop={handleStopProcessing}
        />
      )}

      {/* Scraping For - Collapsible */}
      <CollapsibleSection
        title={
          <div className="flex items-center gap-2">
            <span>Scraping For</span>
            <span className="text-sm font-normal text-gray-500">— {currentEntity.entityName}</span>
          </div>
        }
        isOpen={entitySectionOpen}
        onToggle={() => setEntitySectionOpen(!entitySectionOpen)}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">{currentEntity.entityName}</p>
            <p className="text-xs text-gray-600 mt-1">{currentEntity.gameUrlDomain}</p>
          </div>
          {currentEntity.entityLogo && (
            <img 
              src={currentEntity.entityLogo} 
              alt={currentEntity.entityName}
              className="h-12 w-12 object-contain rounded"
            />
          )}
        </div>
      </CollapsibleSection>

      {/* Scraper Configuration - Collapsible */}
      <CollapsibleSection
        title={
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Scraper Configuration</span>
          </div>
        }
        isOpen={configSectionOpen}
        onToggle={() => setConfigSectionOpen(!configSectionOpen)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: ID Selection & Flow */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">ID Selection Mode</label>
              <select
                value={idSelectionMode}
                onChange={e => setIdSelectionMode(e.target.value as IdSelectionMode)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
                disabled={isProcessing}
              >
                <option value="next">Next ID</option>
                <option value="bulk">Bulk</option>
                <option value="range">Range</option>
                <option value="gaps" disabled={!scrapingStatus || scrapingStatus.gapSummary.totalGaps === 0}>
                  Fill Gaps ({scrapingStatus?.gapSummary.totalGaps || 0})
                </option>
                <option value="refresh" disabled={!scrapingStatus || scrapingStatus.unfinishedGameCount === 0}>
                  Refresh Non-Finished ({scrapingStatus?.unfinishedGameCount || 0})
                </option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Mode Parameters</label>
              {renderIdSelectionInputs()}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Scrape Flow</label>
              <div className="flex mt-1 rounded-md shadow-sm">
                <button
                  type="button"
                  onClick={() => setScrapeFlow('scrape')}
                  disabled={isProcessing}
                  className={`relative inline-flex items-center justify-center w-1/2 px-4 py-2 rounded-l-md border text-sm font-medium ${
                    scrapeFlow === 'scrape'
                      ? 'bg-blue-600 text-white border-blue-600 z-10'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Scrape Only
                </button>
                <button
                  type="button"
                  onClick={() => setScrapeFlow('scrape_save')}
                  disabled={isProcessing}
                  className={`relative inline-flex items-center justify-center w-1/2 px-4 py-2 rounded-r-md border text-sm font-medium ${
                    scrapeFlow === 'scrape_save'
                      ? 'bg-blue-600 text-white border-blue-600 z-10'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Scrape + Save
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {scrapeFlow === 'scrape'
                  ? 'Scrapes data for review. You can save individually from results.'
                  : 'Performs the full Scrape and Save-to-Game flow.'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                <span>Default Venue for Auto-Assignment</span>
                {entityDefaultVenueId && (
                  <span className="text-xs text-green-600 font-normal">
                    ✓ Saved to Entity
                  </span>
                )}
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={defaultVenueId}
                  onChange={e => setDefaultVenueId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  disabled={isProcessing}
                >
                  {!defaultVenueId && (
                    <option value="">No default venue set</option>
                  )}
                  {venues.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.id === entityDefaultVenueId ? ' ⭐' : ''}
                      {v.fee ? ` ($${v.fee})` : ''}
                    </option>
                  ))}
                </select>
                {defaultVenueId !== entityDefaultVenueId && (
                  <button
                    type="button"
                    onClick={updateEntityDefaultVenue}
                    disabled={isProcessing || isSavingDefaultVenue || !defaultVenueId}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSavingDefaultVenue ? 'Saving...' : 'Save Default'}
                  </button>
                )}
              </div>
              <div className="mt-1 space-y-1">
                <p className="text-xs text-gray-500">
                  {entityDefaultVenueId 
                    ? 'Games with low venue confidence (<0.6) will auto-assign to this venue.' 
                    : 'Set a default venue to auto-assign games when venue matching fails.'}
                </p>
                {entityDefaultVenueId && defaultVenueId !== entityDefaultVenueId && (
                  <p className="text-xs text-amber-600">
                    ⚠ Changes not saved to entity. Click "Save Default" to update.
                  </p>
                )}
              </div>
            </div>
            
            {/* ✅ NEW: API Key Configuration */}
            <div className="rounded-lg bg-gray-50 p-4 border">
              {renderApiKeyConfig()}
            </div>
          </div>
          
          {/* Column 2: Options */}
          <div className="space-y-4 rounded-lg bg-gray-50 p-4 border">
            <h4 className="text-sm font-medium text-gray-900">Processing Options</h4>
            {renderOption('useS3', 'Use S3 Cache (Default: ON)', 'If unchecked, forces a live fetch.')}
            {renderOption('skipManualReviews', 'Skip Manual Reviews (Default: OFF)', 'Processes all IDs without pausing.')}
            {renderOption('ignoreDoNotScrape', 'Ignore "Do Not Scrape" (Default: OFF)', 'Scrapes flagged games.')}
            {renderOption('skipInProgress', 'Skip In-Progress Games (Default: OFF)', 'Skips RUNNING/SCHEDULED games.')}
            {renderOption('overrideExisting', 'Override Existing Games (Default: OFF)', 'Saves even if game exists.')}

            {!options.skipManualReviews && scrapeFlow === 'scrape_save' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-700">
                  <Eye className="h-4 w-4 inline mr-1" />
                  <strong>Manual Review Mode</strong> active.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 border-t pt-5">
          <button
            type="button"
            onClick={isProcessing ? handleStopProcessing : handleStartProcessing}
            disabled={!currentEntity || (isProcessing && isPaused) || !scraperApiKey}
            className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${
              isProcessing
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {isProcessing ? (
              isPaused ? (
                <><Eye className="h-5 w-5 mr-2" /> Paused for Review...</>
              ) : (
                <><StopCircle className="h-5 w-5 mr-2" /> Stop Processing</>
              )
            ) : (
              <><Play className="h-5 w-5 mr-2" /> Start Processing</>
            )}
          </button>
          {!scraperApiKey && !isProcessing && (
            <p className="text-xs text-red-600 mt-2 text-center">
              ⚠ ScraperAPI key required to start processing
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Processing Results - Using GameListItem */}
      {processingResults.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Processing Results</h3>
            <span className="text-sm text-gray-500">
              {processingResults.length} item{processingResults.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto space-y-2">
            {processingResults.map((result) => (
              <GameListItem
                key={result.id}
                game={resultToGameState(result)}
                venues={venues}
                selectedVenueId={result.selectedVenueId}
                onVenueChange={(venueId) => handleResultVenueChange(result.id, venueId)}
                onSave={() => handleManualSave(result)}
                onViewDetails={result.parsedData ? () => setSelectedGameDetails(result.parsedData!) : undefined}
                showVenueSelector={true}
                showActions={true}
                compact={true}
                processingStatus={result.status}
                processingMessage={result.message}
                tournamentId={result.id}
                sourceUrl={result.url}
                dataSource={(() => {
                  // ✅ ENHANCED: Better logging and source determination
                  const source = (result.parsedData as any)?.source;
                  const s3Key = result.parsedData?.s3Key;
                  const skipped = (result.parsedData as any)?.skipped;
                  
                  // Debug log to help trace the issue
                  console.log(`[ScraperTab] Tournament ${result.id} source info:`, {
                    backendSource: source,
                    hasS3Key: !!s3Key,
                    s3KeyPreview: s3Key ? s3Key.substring(0, 60) + '...' : null,
                    skipped,
                    status: result.status,
                    hasDataField: 'source' in (result.parsedData || {})
                  });
                  
                  // Priority 1: ONLY show 'none' if we actually skipped fetching (early exit from Lambda)
                  if (skipped) {
                    console.log(`[ScraperTab] → Tournament ${result.id}: Using 'none' (skipped)`);
                    return 'none';
                  }
                  
                  // Priority 2: Show actual data source based on 'source' field from Lambda (PRIMARY SOURCE)
                  if (source === 'S3_CACHE' || source === 'HTTP_304_CACHE') {
                    console.log(`[ScraperTab] → Tournament ${result.id}: Using 's3' (source=${source})`);
                    return 's3';
                  }
                  if (source === 'LIVE') {
                    console.log(`[ScraperTab] → Tournament ${result.id}: Using 'web' (source=LIVE)`);
                    return 'web';
                  }
                  
                  // Priority 3: Fallback - Check s3Key if source field not set (backward compatibility)
                  if (s3Key) {
                    console.log(`[ScraperTab] → Tournament ${result.id}: Using 's3' (s3Key fallback, no source field)`);
                    return 's3';
                  }
                  
                  // Default fallback
                  console.log(`[ScraperTab] → Tournament ${result.id}: Using 'web' (default fallback)`);
                  return 'web';
                })() as 's3' | 'web' | 'none'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedGameDetails && (
        <GameDetailsModal
          game={{ data: selectedGameDetails }}
          onClose={() => setSelectedGameDetails(null)}
        />
      )}

        {gameForReview && (
        <SaveConfirmationModal
            isOpen={true}
            onClose={handleModalClose}
            onConfirm={(editedData) => handleModalConfirm(editedData, gameForReview.venueId)}
            gameData={gameForReview.game}
            venueId={gameForReview.venueId}
            sourceUrl={
            gameForReview.game.sourceUrl || 
            (currentEntity ? `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${gameForReview.game.tournamentId}` : 
            `Tournament ID: ${gameForReview.game.tournamentId}`)
            }
            entityId={currentEntity?.id}                    // ADD THIS
            autoMode={idSelectionMode === 'auto'}           // ADD THIS
            skipConfirmation={options.skipManualReviews}    // ADD THIS
        />
        )}

      {venueModalOpen && (
        <VenueModal
          isOpen={venueModalOpen}
          onClose={() => setVenueModalOpen(false)}
          onSave={async () => console.log('Venue save triggered')}
          venue={null}
          entities={currentEntity ? [currentEntity] : []}
        />
      )}

      {/* Scrape Options Modal for doNotScrape handling */}
      {scrapeOptionsModal && (
        <ScrapeOptionsModal
          isOpen={scrapeOptionsModal.isOpen}
          onClose={() => {
            if ((window as any).__scrapeOptionsResolver) {
              (window as any).__scrapeOptionsResolver({ action: 'SKIP' });
            }
            setScrapeOptionsModal(null);
          }}
          onSelectOption={(option, s3Key) => {
            if ((window as any).__scrapeOptionsResolver) {
              (window as any).__scrapeOptionsResolver({ action: option, s3Key });
            }
            setScrapeOptionsModal(null);
          }}
          url={scrapeOptionsModal.url}
          entityId={currentEntity?.id || ''}
          doNotScrape={true}
          gameStatus={scrapeOptionsModal.gameStatus}
          warningMessage="This tournament is marked as 'Do Not Scrape'. You can use cached S3 data or force a live scrape."
        />
      )}
    </div>
  );
};