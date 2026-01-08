// src/types/scraper.ts
// Centralized types for the scraper system
//
// UPDATED v4.0: Error threshold changes
// - DEFAULT_BATCH_THRESHOLDS.maxTotalErrors now defaults to 1 (was 15)
// - DEFAULT_AUTO_CONFIG.maxTotalErrors now defaults to 1 (was 15)
// - Jobs will stop on first REAL error (not parse failures)
// - Note: blanks counter is deprecated, use notFoundCount instead
//
// UPDATED v3.1: Added forceRefreshFromWeb option for refresh mode
//               - Refresh mode: Re-fetch unfinished games (RUNNING, REGISTERING, SCHEDULED)
//               - Auto mode: Backend handles per-game forceRefresh based on game status
//
// Architecture:
// - 'single': Frontend handles (interactive with modals) using useSingleScrape
// - All other modes: Backend Lambda handles via useScraperJobs.startJob()
//
// Subscriptions:
// - onGameProcessed: Per-tournament events (game details)
// - onJobProgress: Per-job events (aggregate stats) - NEW in v3.0

import { ScrapedGameData } from '../API';

// ===================================================================
// ID SELECTION TYPES
// ===================================================================

/**
 * Processing modes
 * - 'single': Frontend handles with interactive control (modals, venue selection)
 * - 'multiId': Backend processes a custom list of IDs (comma-separated ranges/IDs)
 * - 'refresh': Re-fetch unfinished games (RUNNING, REGISTERING, SCHEDULED) - NEW in v3.1
 * - Others: Backend Lambda handles (batch processing)
 * 
 * MIGRATION: 'next' is deprecated, use 'single' instead
 */
export type IdSelectionMode = 'single' | 'bulk' | 'range' | 'gaps' | 'auto' | 'refresh' | 'multiId' | 'next';

export type ScrapeFlow = 'scrape' | 'scrape_save';
export type ProcessingStatus = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'warning' | 'skipped' | 'error';

// ===================================================================
// DATA SOURCE TYPES
// ===================================================================

export type DataSourceType = 's3' | 'web' | 'none' | 'pending';
export type LambdaSourceValue = 'S3_CACHE' | 'HTTP_304_CACHE' | 'LIVE' | 'ERROR';

// ===================================================================
// OPTIONS
// ===================================================================

export interface ScrapeOptions {
  useS3: boolean;
  skipManualReviews?: boolean;  // Deprecated - only relevant for old orchestrator
  ignoreDoNotScrape: boolean;
  skipInProgress: boolean;
  overrideExisting: boolean;
  skipNotPublished: boolean;
  skipNotFoundGaps: boolean;
  /** 
   * NEW v3.1: Force live web fetch for refresh mode (bypass S3 cache)
   * When enabled with refresh mode, all unfinished games will be re-fetched from live web
   * instead of using S3 cache, ensuring the most up-to-date standings and player counts.
   */
  forceRefreshFromWeb: boolean;
}

export interface IdSelectionParams {
  singleId: string;       // For single-ID mode (was nextId)
  bulkCount: string;      // For bulk mode
  rangeStart: string;     // For range mode (parsed from rangeString)
  rangeEnd: string;       // For range mode (parsed from rangeString)
  maxId: string;          // For auto mode (stop at this ID)
  multiIdString: string;  // For multiId mode: comma-separated IDs and ranges like "100-110, 115, 120-125"
  // Legacy fields for backward compatibility
  rangeString?: string;
  nextId?: string;
}

export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  useS3: true,
  skipManualReviews: false,
  ignoreDoNotScrape: false,
  skipInProgress: false,
  overrideExisting: false,
  skipNotPublished: true,
  skipNotFoundGaps: true,
  forceRefreshFromWeb: false,  // NEW v3.1: Default to using S3 cache
};

export const DEFAULT_ID_SELECTION_PARAMS: IdSelectionParams = {
  singleId: '',
  bulkCount: '10',
  rangeStart: '',
  rangeEnd: '',
  maxId: '',
  multiIdString: '',
  // Legacy
  rangeString: '',
  nextId: '',
};

// ===================================================================
// ERROR HANDLING TYPES
// ===================================================================

export type ErrorType = 
  | 'AUTH'
  | 'NETWORK'
  | 'RATE_LIMIT'
  | 'PARSE'
  | 'VALIDATION'
  | 'ENUM_VALIDATION'
  | 'SAVE'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface ErrorDecision {
  action: 'skip' | 'retry' | 'stop';
}

export interface ErrorModalState {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  errorType: ErrorType;
  errorMessage: string;
  canRetry: boolean;
}

// ===================================================================
// BATCH JOB THRESHOLDS (NEW - passed to backend)
// ===================================================================

export interface BatchThresholds {
  maxConsecutiveNotFound: number;
  maxConsecutiveErrors: number;
  maxConsecutiveBlanks: number;
  maxTotalErrors: number;
}

export const DEFAULT_BATCH_THRESHOLDS: BatchThresholds = {
  maxConsecutiveNotFound: 10,
  maxConsecutiveErrors: 3,
  maxConsecutiveBlanks: 5,
  maxTotalErrors: 1,  // v4.0: Stop on first real error (was 15)
};

// ===================================================================
// BATCH JOB INPUT (NEW - for startScraperJob mutation)
// Maps to StartScraperJobInput in GraphQL schema
// ===================================================================

export interface BatchJobInput {
  entityId: string;
  mode: Exclude<IdSelectionMode, 'single' | 'next'>;
  triggerSource?: 'MANUAL' | 'SCHEDULED';
  triggeredBy?: string;
  
  // Scrape options
  useS3?: boolean;
  forceRefresh?: boolean;
  skipNotPublished?: boolean;
  skipNotFoundGaps?: boolean;
  skipInProgress?: boolean;
  ignoreDoNotScrape?: boolean;
  
  // Save options
  saveToDatabase?: boolean;
  defaultVenueId?: string;
  
  // Mode-specific parameters
  bulkCount?: number;
  startId?: number;
  endId?: number;
  maxId?: number;
  gapIds?: number[];
  
  // Thresholds
  maxConsecutiveNotFound?: number;
  maxConsecutiveErrors?: number;
  maxConsecutiveBlanks?: number;
  maxTotalErrors?: number;
}

// ===================================================================
// PROCESSING RESULTS
// ===================================================================

export interface EnumError {
  field: string;
  enumType: string;
  path?: string;
}

export interface ProcessingResult {
  id: number;
  url: string;
  status: ProcessingStatus;
  message: string;
  parsedData?: ScrapedGameData;
  autoVenueId?: string;
  selectedVenueId?: string;
  savedGameId?: string;
  errorType?: ErrorType;
  enumErrors?: EnumError[];
  dataSource?: DataSourceType;
}

// ===================================================================
// AUTO PROCESSING CONFIG (kept for backward compat, use BatchThresholds for new code)
// ===================================================================

export interface AutoProcessingConfig {
  maxConsecutiveErrors: number;
  maxTotalErrors: number;
  pauseOnUnknownError: boolean;
  autoRetryTransientErrors: boolean;
  retryDelayMs: number;
  maxConsecutiveBlanks: number;
  maxConsecutiveNotFound: number;
}

export const DEFAULT_AUTO_CONFIG: AutoProcessingConfig = {
  maxConsecutiveErrors: 3,
  maxTotalErrors: 1,  // v4.0: Stop on first real error (was 15)
  pauseOnUnknownError: true,
  autoRetryTransientErrors: true,
  retryDelayMs: 2000,
  maxConsecutiveBlanks: 5,
  maxConsecutiveNotFound: 10,
};

// ===================================================================
// ERROR COUNTER STATE
// ===================================================================

export interface ErrorCounters {
  consecutiveErrors: number;
  totalErrors: number;
  consecutiveBlanks: number;
  consecutiveNotFound: number;
}

export const DEFAULT_ERROR_COUNTERS: ErrorCounters = {
  consecutiveErrors: 0,
  totalErrors: 0,
  consecutiveBlanks: 0,
  consecutiveNotFound: 0,
};

// ===================================================================
// GAME REVIEW
// ===================================================================

export interface GameForReview {
  game: ScrapedGameData;
  venueId: string;
  entityId: string;
}

export interface ModalResolverValue {
  action: 'save' | 'cancel';
  gameData?: ScrapedGameData;
  venueId?: string;
}

// ===================================================================
// SCRAPE OPTIONS MODAL
// ===================================================================

export interface ScrapeOptionsModalState {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  gameStatus?: string;
  isDoNotScrape?: boolean;
}

// ===================================================================
// COMPONENT PROPS
// ===================================================================

export interface ScraperTabProps {
  urlToReparse?: string | null;
  onReparseComplete?: () => void;
}

// ===================================================================
// JOB STATUS CONSTANTS
// ===================================================================

/**
 * Statuses that indicate a job is actively running
 */
export const JOB_RUNNING_STATUSES = [
  'QUEUED',
  'RUNNING', 
  'IN_PROGRESS',
  'PROCESSING',
  'PENDING',
] as const;

/**
 * Statuses that indicate a job has completed (successfully or not)
 */
export const JOB_COMPLETE_STATUSES = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMEOUT',
  'STOPPED_NOT_FOUND',
  'STOPPED_BLANKS',
  'STOPPED_MAX_ID',
  'STOPPED_ERROR',
  'STOPPED_MANUAL',
] as const;

export type JobRunningStatus = typeof JOB_RUNNING_STATUSES[number];
export type JobCompleteStatus = typeof JOB_COMPLETE_STATUSES[number];
export type JobStatus = JobRunningStatus | JobCompleteStatus;

// ===================================================================
// JOB PROGRESS SUBSCRIPTION TYPES (NEW in v3.0)
// For real-time batch job monitoring via onJobProgress subscription
// ===================================================================

/**
 * Job progress event received from onJobProgress subscription
 * Published by Lambda via publishJobProgress mutation
 * 
 * This subscription REPLACES polling-based monitoring and provides:
 * - Real-time status updates (RUNNING → COMPLETED, etc.)
 * - Live counters (processed, created, updated, errors)
 * - Duration tracking
 * - Error and stop reason information
 */
export interface JobProgressEvent {
  /** Job identifier */
  jobId: string;
  /** Entity this job belongs to */
  entityId: string;
  /** Current job status (QUEUED, RUNNING, COMPLETED, etc.) */
  status: string;
  /** Reason job stopped (if applicable) */
  stopReason?: string | null;
  /** Total URLs/tournaments processed */
  totalURLsProcessed: number;
  /** New games created in database */
  newGamesScraped: number;
  /** Existing games updated */
  gamesUpdated: number;
  /** Games skipped (already up-to-date, etc.) */
  gamesSkipped: number;
  /** Processing errors encountered */
  errors: number;
  /** Blank/empty responses */
  blanks: number;
  /** Current tournament ID being processed */
  currentId?: number | null;
  /** Start of ID range (for range/bulk jobs) */
  startId?: number | null;
  /** End of ID range */
  endId?: number | null;
  /** Job start time ISO string */
  startTime?: string | null;
  /** Elapsed time in seconds */
  durationSeconds: number;
  /** Calculated success rate percentage */
  successRate?: number | null;
  /** Average time per game in ms */
  averageScrapingTime?: number | null;
  /** Number of S3 cache hits */
  s3CacheHits?: number | null;
  /** Consecutive not-found count (for stop threshold) */
  consecutiveNotFound?: number | null;
  /** Consecutive error count */
  consecutiveErrors?: number | null;
  /** Consecutive blank count */
  consecutiveBlanks?: number | null;
  /** Most recent error message */
  lastErrorMessage?: string | null;
  /** Timestamp when this event was published */
  publishedAt: string;
  notFoundCount?: number;
  notPublishedCount?: number;
}

/**
 * Stats extracted from job progress events
 * Matches the BatchJobStats interface in useBatchJobMonitor
 */
export interface JobProgressStats {
  processed: number;
  newGames: number;
  updated: number;
  errors: number;
  skipped: number;
  blanks: number;
  successRate: number | null;
}

/**
 * Options for useJobProgressSubscription hook
 */
export interface JobProgressSubscriptionOptions {
  /** Called when job status changes */
  onStatusChange?: (status: string, prevStatus: string | null) => void;
  /** Called when job reaches a completion status */
  onJobComplete?: (event: JobProgressEvent) => void;
  /** Called on subscription error */
  onError?: (error: Error) => void;
  /** Called when subscription is established */
  onSubscribed?: () => void;
}

/**
 * Result from useJobProgressSubscription hook
 */
export interface JobProgressSubscriptionResult {
  /** Latest progress event received */
  event: JobProgressEvent | null;
  /** Computed stats from latest event */
  stats: JobProgressStats;
  /** Current job status string */
  status: string | null;
  /** Whether job is in an active (running) state */
  isActive: boolean;
  /** Whether job is in a complete state */
  isComplete: boolean;
  /** Duration in seconds from latest event */
  durationSeconds: number;
  /** Job start time ISO string */
  startTime: string | null;
  /** Current tournament ID being processed */
  currentId: number | null;
  /** Start of ID range */
  startId: number | null;
  /** End of ID range */
  endId: number | null;
  /** Whether subscription is active */
  isSubscribed: boolean;
  /** Subscription error if any */
  subscriptionError: Error | null;
  /** Timestamp of last received event */
  lastUpdated: Date | null;
}

// ===================================================================
// GAME STREAMING TYPES (for real-time batch job display)
// ===================================================================

/**
 * Action type for game processing events
 * Matches GraphQL GameProcessedAction enum
 */
export type GameProcessedActionType = 
  | 'CREATED' 
  | 'UPDATED' 
  | 'SKIPPED' 
  | 'ERROR' 
  | 'NOT_FOUND' 
  | 'NOT_PUBLISHED';

/**
 * Event received from the onGameProcessed subscription
 * Published by autoScraper Lambda after processing each game
 */
export interface GameProcessedEvent {
  jobId: string;
  entityId: string;
  tournamentId: number;
  url?: string;
  action: GameProcessedActionType;
  message?: string;
  errorMessage?: string;
  processedAt: string;
  durationMs?: number;
  dataSource?: 's3' | 'web' | 'none' | string;
  s3Key?: string;
  gameData?: GameProcessedData;
  saveResult?: GameProcessedSaveResult;
}

/**
 * Game data included in a processing event
 * Contains the subset of fields needed for GameListItem display
 */
export interface GameProcessedData {
  name?: string;
  gameStatus?: string;
  registrationStatus?: string;
  gameStartDateTime?: string;
  gameEndDateTime?: string;
  buyIn?: number;
  rake?: number;
  guaranteeAmount?: number;
  prizepoolPaid?: number;
  totalEntries?: number;
  totalUniquePlayers?: number;
  totalRebuys?: number;
  totalAddons?: number;
  gameType?: string;
  gameVariant?: string;
  tournamentType?: string;
  gameTags?: string[];
  venueId?: string;
  venueName?: string;
  doNotScrape?: boolean;
  existingGameId?: string;
}

/**
 * Save result included in a processing event
 */
export interface GameProcessedSaveResult {
  success: boolean;
  gameId?: string;
  action?: 'CREATED' | 'UPDATED' | 'SKIPPED' | string;
  message?: string;
}

/**
 * Options for the useBatchGameStream hook
 */
export interface BatchGameStreamOptions {
  /** Maximum number of games to keep in state (older ones are dropped) */
  maxGames?: number;
  /** Callback when a new game event is received */
  onGameReceived?: (event: GameProcessedEvent) => void;
  /** Callback when a subscription error occurs */
  onError?: (error: Error) => void;
  /** Callback when subscription is established */
  onSubscribed?: () => void;
}

/**
 * Stats accumulated from streamed game events
 */
export interface BatchGameStreamStats {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  total: number;
}

/**
 * Return type for useBatchGameStream hook
 */
export interface BatchGameStreamResult {
  games: import('../types/game').GameState[];
  events: GameProcessedEvent[];
  isSubscribed: boolean;
  error: Error | null;
  clear: () => void;
  stats: BatchGameStreamStats;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Check if mode is batch (backend Lambda handles)
 */
export const isBatchMode = (mode: IdSelectionMode): boolean => {
  return mode !== 'single' && mode !== 'next';
};

/**
 * Check if mode is single-ID (frontend handles interactively)
 */
export const isSingleMode = (mode: IdSelectionMode): boolean => {
  return mode === 'single' || mode === 'next';
};

/**
 * Normalize mode name ('next' → 'single')
 */
export const normalizeMode = (mode: IdSelectionMode): IdSelectionMode => {
  return mode === 'next' ? 'single' : mode;
};

/**
 * Check if a job status indicates the job is still running
 */
export const isJobRunningStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return JOB_RUNNING_STATUSES.includes(status.toUpperCase() as JobRunningStatus);
};

/**
 * Check if a job status indicates completion (success or failure)
 */
export const isJobCompleteStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return JOB_COMPLETE_STATUSES.includes(status.toUpperCase() as JobCompleteStatus);
};

// ===================================================================
// MULTI-ID PARSING UTILITIES
// ===================================================================

/**
 * Parse a multi-ID string into an array of tournament IDs
 * Supports formats like: "100-110, 115, 120-125, 200"
 * 
 * @param multiIdString - Comma-separated string of IDs and ranges
 * @returns Sorted, deduplicated array of tournament IDs
 * 
 * @example
 * parseMultiIdString("100-103, 115, 120-122")
 * // Returns: [100, 101, 102, 103, 115, 120, 121, 122]
 */
export const parseMultiIdString = (multiIdString: string): number[] => {
  if (!multiIdString) return [];
  
  const queue: number[] = [];
  const parts = multiIdString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (!part) continue;
    
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          queue.push(i);
        }
      }
    } else {
      const num = parseInt(part);
      if (!isNaN(num)) {
        queue.push(num);
      }
    }
  }
  
  // Remove duplicates and sort
  return [...new Set(queue)].sort((a, b) => a - b);
};

/**
 * Get the count of IDs in a multi-ID string (for UI preview)
 * 
 * @param multiIdString - Comma-separated string of IDs and ranges
 * @returns Number of IDs that would be processed
 */
export const getMultiIdCount = (multiIdString: string): number => {
  return parseMultiIdString(multiIdString).length;
};

/**
 * Validate a multi-ID string and return an error message if invalid
 * 
 * @param multiIdString - Comma-separated string of IDs and ranges
 * @returns Error message string, or null if valid
 */
export const validateMultiIdString = (multiIdString: string): string | null => {
  if (!multiIdString.trim()) {
    return 'Please enter at least one ID or range';
  }
  
  const parts = multiIdString.split(',').map(s => s.trim()).filter(Boolean);
  
  for (const part of parts) {
    if (part.includes('-')) {
      const segments = part.split('-');
      if (segments.length !== 2) {
        return `Invalid range format: "${part}". Use format like "100-110"`;
      }
      const [start, end] = segments.map(Number);
      if (isNaN(start) || isNaN(end)) {
        return `Invalid numbers in range: "${part}"`;
      }
      if (start > end) {
        return `Start ID must be less than end ID in range: "${part}"`;
      }
      if (start < 1) {
        return `IDs must be positive numbers: "${part}"`;
      }
    } else {
      const num = parseInt(part);
      if (isNaN(num)) {
        return `Invalid ID: "${part}"`;
      }
      if (num < 1) {
        return `IDs must be positive numbers: "${part}"`;
      }
    }
  }
  
  return null; // Valid
};

/**
 * Convert frontend options to batch job input for startScraperJob mutation
 * 
 * v3.1 UPDATE: forceRefresh logic
 * - If useS3 is disabled globally → forceRefresh = true (all games fetched live)
 * - If refresh mode with forceRefreshFromWeb → forceRefresh = true (refresh games fetched live)
 * - For auto mode, backend handles per-game forceRefresh based on game status
 */
export const buildBatchJobInput = (
  entityId: string,
  mode: Exclude<IdSelectionMode, 'single' | 'next'>,
  params: IdSelectionParams,
  options: ScrapeOptions,
  defaultVenueId: string,
  saveToDatabase: boolean,
  thresholds: BatchThresholds = DEFAULT_BATCH_THRESHOLDS,
  gapIds?: number[]
): BatchJobInput => {
  const input: BatchJobInput = {
    entityId,
    mode,
    triggerSource: 'MANUAL',
    useS3: options.useS3,
    // v3.1: forceRefresh is true if:
    // 1. useS3 is disabled globally, OR
    // 2. Refresh mode with forceRefreshFromWeb enabled
    // Note: For auto mode, backend handles per-game forceRefresh based on game status
    forceRefresh: !options.useS3 || (mode === 'refresh' && options.forceRefreshFromWeb),
    skipNotPublished: options.skipNotPublished,
    skipNotFoundGaps: options.skipNotFoundGaps,
    skipInProgress: options.skipInProgress,
    ignoreDoNotScrape: options.ignoreDoNotScrape,
    saveToDatabase,
    defaultVenueId: defaultVenueId || undefined,
    ...thresholds,
  };

  // Add mode-specific parameters
  switch (mode) {
    case 'bulk':
      input.bulkCount = parseInt(params.bulkCount) || 10;
      break;
    case 'range':
      input.startId = parseInt(params.rangeStart) || undefined;
      input.endId = parseInt(params.rangeEnd) || undefined;
      break;
    case 'auto':
      input.maxId = parseInt(params.maxId) || undefined;
      // Note: Auto mode handles per-game forceRefresh in backend based on game status
      // (in-progress games get forceRefresh=true, finished games use S3 cache)
      break;
    case 'gaps':
      input.gapIds = gapIds;
      break;
    case 'multiId':
      // Parse the multiIdString into an array of IDs
      // Uses gapIds field since backend already handles it
      input.gapIds = parseMultiIdString(params.multiIdString);
      break;
    case 'refresh':
      // Refresh mode: Re-fetch unfinished games
      // gapIds will be populated by frontend (from getUnfinishedGames) or backend query
      // forceRefresh already set above based on forceRefreshFromWeb option
      if (gapIds?.length) {
        input.gapIds = gapIds;
      }
      break;
  }

  return input;
};

/**
 * Parse legacy rangeString into start/end IDs
 */
export const parseRangeString = (rangeString: string): { start: number | null; end: number | null } => {
  if (!rangeString) return { start: null, end: null };
  
  const parts = rangeString.split('-').map(s => parseInt(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { start: parts[0], end: parts[1] };
  }
  
  // Single number = just start
  if (parts.length === 1 && !isNaN(parts[0])) {
    return { start: parts[0], end: null };
  }
  
  return { start: null, end: null };
};

/**
 * Map GameProcessedEvent action to ProcessingStatus
 */
export const actionToProcessingStatus = (action: GameProcessedActionType): ProcessingStatus => {
  const map: Record<GameProcessedActionType, ProcessingStatus> = {
    'CREATED': 'success',
    'UPDATED': 'success',
    'SKIPPED': 'skipped',
    'ERROR': 'error',
    'NOT_FOUND': 'skipped',
    'NOT_PUBLISHED': 'skipped',
  };
  return map[action] || 'pending';
};

/**
 * Map GameProcessedEvent dataSource to DataSourceType
 */
export const eventDataSourceToType = (dataSource?: string): DataSourceType => {
  if (!dataSource) return 'none';
  const lower = dataSource.toLowerCase();
  if (lower === 's3' || lower === 's3_cache' || lower === 'http_304_cache') return 's3';
  if (lower === 'web' || lower === 'live') return 'web';
  return 'none';
};

/**
 * Extract JobProgressStats from a JobProgressEvent
 */
export const extractJobProgressStats = (event: JobProgressEvent | null): JobProgressStats => {
  if (!event) {
    return {
      processed: 0,
      newGames: 0,
      updated: 0,
      errors: 0,
      skipped: 0,
      blanks: 0,
      successRate: null,
    };
  }
  
  return {
    processed: event.totalURLsProcessed,
    newGames: event.newGamesScraped,
    updated: event.gamesUpdated,
    errors: event.errors,
    skipped: event.gamesSkipped,
    blanks: event.blanks,
    successRate: event.successRate ?? null,
  };
};

/**
 * Calculate success rate from job stats
 */
export const calculateSuccessRate = (stats: JobProgressStats): number | null => {
  const total = stats.newGames + stats.updated + stats.errors + stats.skipped;
  if (total === 0) return null;
  return ((stats.newGames + stats.updated) / total) * 100;
};

/**
 * Format duration in seconds to human-readable string
 */
export const formatJobDuration = (seconds: number): string => {
  if (seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins < 60) {
    return `${mins}m ${secs}s`;
  }
  
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
};

/**
 * Get human-readable label for job status
 */
export const getJobStatusLabel = (status: string | null | undefined): string => {
  if (!status) return 'Unknown';
  
  const labels: Record<string, string> = {
    'PENDING': 'Starting...',
    'QUEUED': 'Queued',
    'RUNNING': 'Running',
    'IN_PROGRESS': 'Running',
    'PROCESSING': 'Processing',
    'COMPLETED': 'Completed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
    'TIMEOUT': 'Timed Out',
    'STOPPED_NOT_FOUND': 'Stopped (Not Found)',
    'STOPPED_BLANKS': 'Stopped (Blanks)',
    'STOPPED_MAX_ID': 'Stopped (Max ID)',
    'STOPPED_ERROR': 'Stopped (Error)',
    'STOPPED_MANUAL': 'Stopped (Manual)',
  };

  return labels[status.toUpperCase()] || status;
};

/**
 * Get Tailwind CSS classes for job status badge
 */
export const getJobStatusColor = (status: string | null | undefined): string => {
  if (!status) return 'bg-gray-100 text-gray-700';
  
  const s = status.toUpperCase();
  
  if (isJobRunningStatus(s)) {
    return 'bg-blue-100 text-blue-700';
  }
  
  if (s === 'COMPLETED') {
    return 'bg-green-100 text-green-700';
  }
  
  if (['STOPPED_NOT_FOUND', 'STOPPED_BLANKS', 'STOPPED_MAX_ID'].includes(s)) {
    return 'bg-yellow-100 text-yellow-700';
  }
  
  if (['FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED_ERROR', 'STOPPED_MANUAL'].includes(s)) {
    return 'bg-red-100 text-red-700';
  }
  
  return 'bg-gray-100 text-gray-700';
};

// ===================================================================
// IN-PROGRESS GAME STATUS HELPERS (NEW v3.1)
// ===================================================================

/**
 * Game statuses that indicate a game is still in progress
 * These games benefit from fresh data fetches (not S3 cache)
 */
export const IN_PROGRESS_GAME_STATUSES = [
  'RUNNING',
  'REGISTERING',
  'SCHEDULED',
  'LATE_REGISTRATION',
] as const;

export type InProgressGameStatus = typeof IN_PROGRESS_GAME_STATUSES[number];

/**
 * Check if a game status indicates the game is still in progress
 * Used by auto mode to determine per-game forceRefresh
 */
export const isInProgressGameStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return IN_PROGRESS_GAME_STATUSES.includes(status.toUpperCase() as InProgressGameStatus);
};

/**
 * Game statuses that indicate a game is finished
 * These games can safely use S3 cache since data won't change
 */
export const FINISHED_GAME_STATUSES = [
  'COMPLETED',
  'CANCELLED',
  'SUSPENDED',
] as const;

export type FinishedGameStatus = typeof FINISHED_GAME_STATUSES[number];

/**
 * Check if a game status indicates the game is finished
 */
export const isFinishedGameStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return FINISHED_GAME_STATUSES.includes(status.toUpperCase() as FinishedGameStatus);
};