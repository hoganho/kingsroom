// src/types/scraper.ts
// Centralized types for the scraper system
// UPDATED v2.1: Added game streaming types for real-time batch job display
//
// Architecture:
// - 'single': Frontend handles (interactive with modals) using useSingleScrape
// - All other modes: Backend Lambda handles via useScraperJobs.startJob()

import { ScrapedGameData } from '../API';

// ===================================================================
// ID SELECTION TYPES
// ===================================================================

/**
 * Processing modes
 * - 'single': Frontend handles with interactive control (modals, venue selection)
 * - 'multiId': Backend processes a custom list of IDs (comma-separated ranges/IDs)
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
  maxTotalErrors: 15,
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
  maxTotalErrors: 15,
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
    forceRefresh: !options.useS3,
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
      // No additional params needed
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