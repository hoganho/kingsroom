// src/types/scraper.ts
// Centralized types for the scraper system
// UPDATED v2.0: Added batch job support, renamed 'next' → 'single'
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
 * - Others: Backend Lambda handles (batch processing)
 * 
 * MIGRATION: 'next' is deprecated, use 'single' instead
 */
export type IdSelectionMode = 'single' | 'bulk' | 'range' | 'gaps' | 'auto' | 'refresh' | 'next';

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