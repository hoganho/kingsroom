// src/types/scraper.ts
// Centralized types for the scraper system
// UPDATED: Added explicit source tracking, improved discriminated unions

import { ScrapedGameData } from '../API';

// ===================================================================
// ID SELECTION TYPES
// ===================================================================

export type IdSelectionMode = 'next' | 'bulk' | 'range' | 'gaps' | 'refresh' | 'auto';
export type ScrapeFlow = 'scrape' | 'scrape_save';
export type ProcessingStatus = 'pending' | 'scraping' | 'saving' | 'review' | 'success' | 'warning' | 'skipped' | 'error';

// ===================================================================
// DATA SOURCE TYPES
// ===================================================================

/**
 * Source of the scraped data
 * - 's3': Retrieved from S3 cache (Lambda source: S3_CACHE, HTTP_304_CACHE)
 * - 'web': Fresh fetch from web (Lambda source: LIVE)
 * - 'none': Not retrieved (skipped or do not scrape)
 */
export type DataSourceType = 's3' | 'web' | 'none' | 'pending';

/**
 * Lambda response source values (for reference)
 * These come from enhanced-handleFetch.js
 */
export type LambdaSourceValue = 'S3_CACHE' | 'HTTP_304_CACHE' | 'LIVE' | 'ERROR';

// ===================================================================
// OPTIONS
// ===================================================================

export interface ScrapeOptions {
  useS3: boolean;
  skipManualReviews: boolean;
  ignoreDoNotScrape: boolean;
  skipInProgress: boolean;
  overrideExisting: boolean;
  skipNotPublished: boolean;
  skipNotFoundGaps: boolean;
}

export interface IdSelectionParams {
  bulkCount: string;
  rangeString: string;
  maxId: string;
  nextId: string;
}

export const DEFAULT_SCRAPE_OPTIONS: ScrapeOptions = {
  useS3: true,
  skipManualReviews: false,
  ignoreDoNotScrape: false,
  skipInProgress: false,
  overrideExisting: false,
  skipNotPublished: false,
  skipNotFoundGaps: false,
};

export const DEFAULT_ID_SELECTION_PARAMS: IdSelectionParams = {
  bulkCount: '10',
  rangeString: '',
  maxId: '',
  nextId: '',
};

// ===================================================================
// ERROR HANDLING TYPES
// ===================================================================

export type ErrorType = 
  | 'AUTH'           // API key invalid, 401/403
  | 'NETWORK'        // Timeout, connection failed
  | 'RATE_LIMIT'     // Too many requests (429)
  | 'PARSE'          // Failed to parse response
  | 'VALIDATION'     // Data validation failed
  | 'ENUM_VALIDATION' // Invalid enum value in response
  | 'SAVE'           // Failed to save to DB
  | 'NOT_FOUND'      // Tournament doesn't exist (blank/404)
  | 'UNKNOWN';       // Unclassified error

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
// AUTO PROCESSING CONFIG
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
  maxConsecutiveErrors: 1,
  maxTotalErrors: 15,
  pauseOnUnknownError: true,
  autoRetryTransientErrors: true,
  retryDelayMs: 2000,
  maxConsecutiveBlanks: 2,
  maxConsecutiveNotFound: 25,
};

// ===================================================================
// PROCESSING RESULTS
// ===================================================================

/**
 * Enum error information
 */
export interface EnumError {
  field: string;
  enumType: string;
  path?: string;
}

/**
 * Processing result for a single tournament
 * Tracks the full lifecycle from pending → scraping → saving → success/error
 */
export interface ProcessingResult {
  /** Tournament ID */
  id: number;
  
  /** Full URL for the tournament */
  url: string;
  
  /** Current processing status */
  status: ProcessingStatus;
  
  /** Human-readable status message */
  message: string;
  
  /** Parsed game data (available after successful scrape) */
  parsedData?: ScrapedGameData;
  
  /** Auto-assigned venue ID from venue matching */
  autoVenueId?: string;
  
  /** User-selected venue ID (may override auto) */
  selectedVenueId?: string;
  
  /** Game ID after successful save */
  savedGameId?: string;
  
  /** Error type classification */
  errorType?: ErrorType;
  
  /** Enum validation errors */
  enumErrors?: EnumError[];
  
  /**
   * Data source for this result
   * IMPORTANT: Set explicitly from Lambda source field, not inferred from s3Key
   */
  dataSource?: DataSourceType;
}

// ===================================================================
// DISCRIMINATED UNION FOR RESULT STATES (Optional, for stricter typing)
// ===================================================================

/**
 * Discriminated union for processing result states
 * Provides type-safe access to state-specific fields
 * 
 * Usage:
 *   if (result.status === 'success') {
 *     // TypeScript knows parsedData exists
 *     console.log(result.parsedData.name);
 *   }
 */
export type ProcessingResultState = 
  | { status: 'pending'; message: string }
  | { status: 'scraping'; message: string }
  | { status: 'saving'; message: string; parsedData: ScrapedGameData }
  | { status: 'review'; message: string; parsedData: ScrapedGameData }
  | { status: 'success'; message: string; parsedData: ScrapedGameData; savedGameId?: string; dataSource: DataSourceType }
  | { status: 'warning'; message: string; parsedData: ScrapedGameData; enumErrors?: EnumError[]; dataSource: DataSourceType }
  | { status: 'error'; message: string; errorType: ErrorType }
  | { status: 'skipped'; message: string; reason: string; parsedData?: ScrapedGameData };

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
// SCRAPE URL STATUS CACHE (for skip options)
// ===================================================================

// Note: ScrapeURLStatusCache is defined in services/scrapeURLService.ts

// ===================================================================
// PROPS FOR CHILD COMPONENTS
// ===================================================================

export interface ScraperTabProps {
  urlToReparse?: string | null;
  onReparseComplete?: () => void;
}

// ===================================================================
// SCRAPER CONFIG (for simplified prop passing)
// ===================================================================

export interface ScraperConfigState {
  idSelectionMode: IdSelectionMode;
  idSelectionParams: IdSelectionParams;
  scrapeFlow: ScrapeFlow;
  options: ScrapeOptions;
  scraperApiKey: string;
  defaultVenueId: string;
}

export const DEFAULT_SCRAPER_CONFIG: ScraperConfigState = {
  idSelectionMode: 'next',
  idSelectionParams: DEFAULT_ID_SELECTION_PARAMS,
  scrapeFlow: 'scrape',
  options: DEFAULT_SCRAPE_OPTIONS,
  scraperApiKey: '',
  defaultVenueId: '',
};
