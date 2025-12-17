// src/pages/scraper-admin-tabs/ScraperTab.tsx
// REFACTORED: Single-ID on frontend (useSingleScrape), batch on backend (useScraperJobs)
//
// Architecture:
// - 'single' mode: Frontend handles with full interactive control (modals, venue selection)
// - All other modes: Backend Lambda handles via useScraperJobs.startJob()
//
// This integrates with existing hooks:
// - useScraperJobs from useScraperManagement.ts for batch job management
// - useSingleScrape for single-ID interactive processing

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Settings, Play, Square, RefreshCw, Zap, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

// --- Types ---
import {
  ScraperTabProps,
  IdSelectionMode,
  IdSelectionParams,
  ScrapeFlow,
  ScrapeOptions,
  BatchThresholds,
  DEFAULT_SCRAPE_OPTIONS,
  DEFAULT_ID_SELECTION_PARAMS,
  DEFAULT_BATCH_THRESHOLDS,
  isBatchMode,
  isSingleMode,
  buildBatchJobInput,
} from '../../types/scraper';

// --- Hooks ---
import { useSingleScrape } from '../../hooks/scraper/useSingleScrape';
import { useScraperJobs } from '../../hooks/useScraperManagement';
import { useScraperModals } from '../../hooks/scraper/useModalResolver';
// Alternative: import { useScraperModals } from '../../hooks/scraper' if you have a barrel file

// --- Components ---
import { CollapsibleSection } from '../../components/scraper/admin/CollapsibleSection';
import { GameDetailsModal } from '../../components/scraper/admin/ScraperModals';
import { SaveConfirmationModal } from '../../components/scraper/SaveConfirmationModal';

// --- Contexts & Hooks ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';

// --- API Types ---
import { Venue, ScrapedGameData, StartScraperJobInput } from '../../API';
import { listVenuesForDropdown } from '../../graphql/customQueries';

// --- Utils ---
import { scraperLogger } from '../../utils/scraperLogger';

const getClient = () => generateClient();

// ===================================================================
// HELPER: Format duration
// ===================================================================
const formatDuration = (seconds: number | null | undefined): string => {
  if (!seconds) return '-';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

// ===================================================================
// HELPER: Get status badge color
// ===================================================================
const getStatusColor = (status: string | null | undefined): string => {
  switch (status) {
    case 'RUNNING':
    case 'QUEUED':
      return 'bg-blue-100 text-blue-700';
    case 'COMPLETED':
      return 'bg-green-100 text-green-700';
    case 'STOPPED_NOT_FOUND':
    case 'STOPPED_BLANKS':
    case 'STOPPED_MAX_ID':
      return 'bg-yellow-100 text-yellow-700';
    case 'STOPPED_ERROR':
    case 'STOPPED_MANUAL':
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

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
  const [batchThresholds, setBatchThresholds] = useState<BatchThresholds>(DEFAULT_BATCH_THRESHOLDS);

  // --- View State ---
  const [selectedGameDetails, setSelectedGameDetails] = useState<ScrapedGameData | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // --- Modals ---
  const modals = useScraperModals();

  // --- Gap Tracker ---
  const { scrapingStatus, loading: gapLoading, getScrapingStatus, getBounds, bounds } = useGameIdTracking(currentEntity?.id);
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
    loading: jobsLoading, 
    startJob, 
    cancelJob,
    fetchJobs 
  } = useScraperJobs();

  // Find the active job from jobs list
  const activeJob = useMemo(() => {
    if (!activeJobId) return null;
    return jobs.find(j => j.id === activeJobId || j.jobId === activeJobId) || null;
  }, [jobs, activeJobId]);

  // Check if any batch job is running (QUEUED is the "in progress" status)
  const isBatchRunning = useMemo(() => {
    // ScraperJobStatus enum values: QUEUED, COMPLETED, FAILED, CANCELLED, TIMEOUT
    // QUEUED means the job is active/running
    return activeJob?.status === 'QUEUED';
  }, [activeJob]);

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
        setIdSelectionMode('single');
        setIdSelectionParams(p => ({ ...p, singleId: match[1] }));
      }
    }
  }, [urlToReparse]);

  // Update singleId when highestTournamentId changes
  useEffect(() => {
    if (isSingleMode(idSelectionMode) && !idSelectionParams.singleId && highestTournamentId) {
      setIdSelectionParams(p => ({ ...p, singleId: String(highestTournamentId + 1) }));
    }
  }, [highestTournamentId, idSelectionMode, idSelectionParams.singleId]);

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
  // PROCESSING HANDLERS
  // =========================================================================

  const handleStartProcessing = useCallback(async () => {
    if (!currentEntity) return;
    
    setConfigSectionOpen(false);

    if (isSingleMode(idSelectionMode)) {
      // =====================================================================
      // SINGLE ID: Frontend handles with interactive control
      // =====================================================================
      const tournamentId = parseInt(idSelectionParams.singleId);
      if (!tournamentId || isNaN(tournamentId)) {
        alert('Please enter a valid tournament ID');
        setConfigSectionOpen(true);
        return;
      }

      scraperLogger.info('PROCESSING_START', `Processing single ID: ${tournamentId}`);
      
      const parsedData = await singleScrape.scrape(tournamentId);
      
      if (parsedData && singleScrape.result?.status === 'review') {
        // Open save confirmation modal
        const autoVenueId = singleScrape.result.autoVenueId;
        
        if (scrapeFlow === 'scrape_save') {
          const modalResult = await modals.saveConfirmation.openModal(
            parsedData,
            autoVenueId || defaultVenueId,
            currentEntity.id
          );
          
          if (modalResult.action === 'save') {
            await singleScrape.save(
              modalResult.venueId || defaultVenueId,
              modalResult.editedData as ScrapedGameData | undefined
            );
          }
        }
        
        // Update next ID
        setIdSelectionParams(p => ({ ...p, singleId: String(tournamentId + 1) }));
        
        // Callback for re-parse completion
        if (urlToReparse && onReparseComplete) {
          onReparseComplete();
        }
      }

    } else {
      // =====================================================================
      // BATCH: Delegate to backend Lambda via useScraperJobs
      // =====================================================================
      scraperLogger.info('PROCESSING_START', `Starting batch job: ${idSelectionMode}`);

      // Get gap IDs if needed
      let gapIds: number[] | undefined;
      if (idSelectionMode === 'gaps' && scrapingStatus?.gaps && scrapingStatus.gaps.length > 0) {
        // Convert GapRange[] to number[] - flatten all gap ranges into individual IDs
        // GapRange has { start: number; end: number } structure
        const gaps = scrapingStatus.gaps as Array<{ start: number; end: number }>;
        gapIds = gaps.flatMap((gap) => {
          // For ranges, generate all IDs between start and end
          const ids: number[] = [];
          for (let i = gap.start; i <= gap.end; i++) {
            ids.push(i);
          }
          return ids;
        });
      }

      // Build the input for startScraperJob
      const jobInput = buildBatchJobInput(
        currentEntity.id,
        idSelectionMode as Exclude<IdSelectionMode, 'single' | 'next'>,
        idSelectionParams,
        options,
        defaultVenueId,
        scrapeFlow === 'scrape_save',
        batchThresholds,
        gapIds
      );

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
    currentEntity, idSelectionMode, idSelectionParams, options, scrapeFlow, batchThresholds,
    singleScrape, modals.saveConfirmation, defaultVenueId, scrapingStatus, startJob, urlToReparse, onReparseComplete
  ]);

  const handleStopProcessing = useCallback(async () => {
    if (isBatchRunning && activeJobId) {
      await cancelJob(activeJobId);
    }
    singleScrape.reset();
    scraperLogger.info('PROCESSING_STOP', 'Processing stopped by user');
    getScrapingStatus({ forceRefresh: true }).catch(() => {});
  }, [isBatchRunning, activeJobId, cancelJob, singleScrape, getScrapingStatus]);

  const handleClearJob = useCallback(() => {
    setActiveJobId(null);
  }, []);

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Tournament ID</label>
                <input
                  type="number"
                  value={idSelectionParams.singleId}
                  onChange={(e) => setIdSelectionParams(p => ({ ...p, singleId: e.target.value }))}
                  disabled={isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  placeholder={highestTournamentId ? String(highestTournamentId + 1) : 'Enter ID'}
                />
              </div>
            )}

            {idSelectionMode === 'bulk' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of IDs</label>
                <input
                  type="number"
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
              </div>
            )}

            {idSelectionMode === 'gaps' && (
              <div className="col-span-full">
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
              </div>
            )}
          </div>

          {/* Batch Thresholds (only for batch modes) */}
          {isBatchMode(idSelectionMode) && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-3">Stopping Thresholds</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Max NOT_FOUND</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={batchThresholds.maxConsecutiveNotFound}
                    onChange={(e) => setBatchThresholds(t => ({ ...t, maxConsecutiveNotFound: Math.max(1, parseInt(e.target.value) || 10) }))}
                    disabled={isProcessing}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Max Errors</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={batchThresholds.maxConsecutiveErrors}
                    onChange={(e) => setBatchThresholds(t => ({ ...t, maxConsecutiveErrors: Math.max(1, parseInt(e.target.value) || 3) }))}
                    disabled={isProcessing}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Max Blanks</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={batchThresholds.maxConsecutiveBlanks}
                    onChange={(e) => setBatchThresholds(t => ({ ...t, maxConsecutiveBlanks: Math.max(1, parseInt(e.target.value) || 5) }))}
                    disabled={isProcessing}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Max Total Errors</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={batchThresholds.maxTotalErrors}
                    onChange={(e) => setBatchThresholds(t => ({ ...t, maxTotalErrors: Math.max(1, parseInt(e.target.value) || 15) }))}
                    disabled={isProcessing}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.useS3} onChange={(e) => setOptions(o => ({ ...o, useS3: e.target.checked }))} disabled={isProcessing} className="rounded border-gray-300 text-blue-600" />
              Use S3 Cache
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.skipNotPublished} onChange={(e) => setOptions(o => ({ ...o, skipNotPublished: e.target.checked }))} disabled={isProcessing} className="rounded border-gray-300 text-blue-600" />
              Skip NOT_PUBLISHED
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.skipNotFoundGaps} onChange={(e) => setOptions(o => ({ ...o, skipNotFoundGaps: e.target.checked }))} disabled={isProcessing} className="rounded border-gray-300 text-blue-600" />
              Skip NOT_FOUND Gaps
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={scrapeFlow === 'scrape_save'} onChange={(e) => setScrapeFlow(e.target.checked ? 'scrape_save' : 'scrape')} disabled={isProcessing} className="rounded border-gray-300 text-blue-600" />
              Save to Database
            </label>
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

          {/* API Key (only for single mode) */}
          {isSingleMode(idSelectionMode) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scraper API Key (optional)</label>
              <div className="flex gap-2">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={scraperApiKey}
                  onChange={(e) => setScraperApiKey(e.target.value)}
                  disabled={isProcessing}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter API key..."
                />
                <button onClick={() => setShowApiKey(!showApiKey)} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors">
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Start/Stop Buttons */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleStartProcessing}
              disabled={isProcessing || !defaultVenueId}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="h-4 w-4" />
              {isProcessing ? 'Processing...' : `Start ${isSingleMode(idSelectionMode) ? 'Scrape' : 'Batch Job'}`}
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

      {/* Single ID Result */}
      {singleScrape.result && (
        <div className={`p-4 rounded-lg border ${
          singleScrape.result.status === 'success' ? 'bg-green-50 border-green-200' :
          singleScrape.result.status === 'error' ? 'bg-red-50 border-red-200' :
          singleScrape.result.status === 'skipped' ? 'bg-yellow-50 border-yellow-200' :
          'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {singleScrape.result.status === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {singleScrape.result.status === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
              {singleScrape.result.status === 'skipped' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
              {(singleScrape.result.status === 'scraping' || singleScrape.result.status === 'saving') && <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />}
              
              <span className="font-medium">Tournament {singleScrape.result.id}</span>
              <span className={`px-2 py-0.5 text-xs rounded ${
                singleScrape.result.status === 'success' ? 'bg-green-200 text-green-800' :
                singleScrape.result.status === 'error' ? 'bg-red-200 text-red-800' :
                singleScrape.result.status === 'skipped' ? 'bg-yellow-200 text-yellow-800' :
                'bg-blue-200 text-blue-800'
              }`}>
                {singleScrape.result.status}
              </span>
              {singleScrape.result.dataSource && (
                <span className={`px-2 py-0.5 text-xs rounded ${
                  singleScrape.result.dataSource === 's3' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {singleScrape.result.dataSource === 's3' ? 'S3 Cache' : 'Live'}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600">{singleScrape.result.message}</div>
          </div>
          {singleScrape.result.parsedData && (
            <button 
              onClick={() => setSelectedGameDetails(singleScrape.result!.parsedData!)} 
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              View Details →
            </button>
          )}
        </div>
      )}

      {/* Batch Job Progress */}
      {activeJob && (
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Batch Job: {(activeJob.jobId || activeJob.id || '').slice(0, 8)}...
            </h3>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded ${getStatusColor(activeJob.status)} ${
                activeJob.status === 'QUEUED' ? 'animate-pulse' : ''
              }`}>
                {activeJob.status}
              </span>
              <button 
                onClick={() => fetchJobs(true)} 
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors" 
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${jobsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Progress Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500 text-xs">Processed</div>
              <div className="font-semibold text-lg">{activeJob.totalURLsProcessed || 0}</div>
            </div>
            <div className="bg-green-50 rounded p-2">
              <div className="text-gray-500 text-xs">New Games</div>
              <div className="font-semibold text-lg text-green-600">{activeJob.newGamesScraped || 0}</div>
            </div>
            <div className="bg-blue-50 rounded p-2">
              <div className="text-gray-500 text-xs">Updated</div>
              <div className="font-semibold text-lg text-blue-600">{activeJob.gamesUpdated || 0}</div>
            </div>
            <div className="bg-red-50 rounded p-2">
              <div className="text-gray-500 text-xs">Errors</div>
              <div className="font-semibold text-lg text-red-600">{activeJob.errors || 0}</div>
            </div>
            <div className="bg-yellow-50 rounded p-2">
              <div className="text-gray-500 text-xs">Skipped</div>
              <div className="font-semibold text-lg text-yellow-600">{activeJob.gamesSkipped || 0}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500 text-xs">Blanks</div>
              <div className="font-semibold text-lg">{activeJob.blanks || 0}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500 text-xs">Duration</div>
              <div className="font-semibold text-lg">{formatDuration(activeJob.durationSeconds)}</div>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <div className="text-gray-500 text-xs">Success Rate</div>
              <div className="font-semibold text-lg">{activeJob.successRate ? `${activeJob.successRate.toFixed(1)}%` : '-'}</div>
            </div>
          </div>

          {/* Clear button when done */}
          {!isBatchRunning && (
            <button 
              onClick={handleClearJob} 
              className="mt-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear job status
            </button>
          )}
        </div>
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