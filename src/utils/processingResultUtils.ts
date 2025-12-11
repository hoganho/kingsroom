// src/utils/processingResultUtils.ts
// Centralized utilities for managing ProcessingResult state
// Eliminates ~30 duplicated setProcessingResults patterns in ScraperTab

import { ProcessingResult, ProcessingStatus, ErrorType } from '../types/scraper';
import { ScrapedGameData } from '../API';

// ===================================================================
// RESULT UPDATE FUNCTIONS
// ===================================================================

/**
 * Update a single result by ID
 * Returns a new array (immutable update)
 */
export const updateResult = (
  results: ProcessingResult[],
  id: number,
  updates: Partial<ProcessingResult>
): ProcessingResult[] => {
  return results.map(r => r.id === id ? { ...r, ...updates } : r);
};

/**
 * Update result status with message (most common operation)
 */
export const updateResultStatus = (
  results: ProcessingResult[],
  id: number,
  status: ProcessingStatus,
  message: string,
  extras?: Partial<ProcessingResult>
): ProcessingResult[] => {
  return results.map(r => 
    r.id === id 
      ? { ...r, status, message, ...extras } 
      : r
  );
};

/**
 * Update multiple results matching a predicate
 */
export const updateResultsWhere = (
  results: ProcessingResult[],
  predicate: (r: ProcessingResult) => boolean,
  updates: Partial<ProcessingResult>
): ProcessingResult[] => {
  return results.map(r => predicate(r) ? { ...r, ...updates } : r);
};

/**
 * Batch update multiple results by IDs
 */
export const batchUpdateResults = (
  results: ProcessingResult[],
  ids: number[],
  updates: Partial<ProcessingResult>
): ProcessingResult[] => {
  const idSet = new Set(ids);
  return results.map(r => idSet.has(r.id) ? { ...r, ...updates } : r);
};

// ===================================================================
// RESULT CREATION
// ===================================================================

/**
 * Create a new pending result
 */
export const createPendingResult = (
  id: number,
  baseUrl: string,
  urlPath: string
): ProcessingResult => ({
  id,
  url: `${baseUrl}${urlPath}${id}`,
  status: 'pending',
  message: 'Waiting...'
});

/**
 * Create multiple pending results for a queue
 */
export const createPendingResults = (
  ids: number[],
  baseUrl: string,
  urlPath: string
): ProcessingResult[] => {
  return ids.map(id => createPendingResult(id, baseUrl, urlPath));
};

/**
 * Add a new result to the array (for auto-mode frontier extension)
 */
export const addResult = (
  results: ProcessingResult[],
  newResult: ProcessingResult
): ProcessingResult[] => {
  // Check for duplicates
  if (results.some(r => r.id === newResult.id)) {
    return results;
  }
  return [...results, newResult];
};

// ===================================================================
// STATUS TRANSITIONS
// ===================================================================

/**
 * Mark result as scraping
 */
export const markScraping = (
  results: ProcessingResult[],
  id: number
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'scraping', 'Scraping...');
};

/**
 * Mark result as saving
 */
export const markSaving = (
  results: ProcessingResult[],
  id: number,
  parsedData?: ScrapedGameData
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'saving', 'Saving to database...', { parsedData });
};

/**
 * Mark result as successful
 */
export const markSuccess = (
  results: ProcessingResult[],
  id: number,
  message: string,
  parsedData?: ScrapedGameData,
  savedGameId?: string
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'success', message, { 
    parsedData, 
    savedGameId 
  });
};

/**
 * Mark result as warning (success with caveats)
 */
export const markWarning = (
  results: ProcessingResult[],
  id: number,
  message: string,
  parsedData?: ScrapedGameData,
  extras?: Partial<ProcessingResult>
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'warning', message, { 
    parsedData,
    ...extras 
  });
};

/**
 * Mark result as error
 */
export const markError = (
  results: ProcessingResult[],
  id: number,
  message: string,
  errorType?: ErrorType,
  extras?: Partial<ProcessingResult>
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'error', message, { 
    errorType,
    ...extras 
  });
};

/**
 * Mark result as skipped
 */
export const markSkipped = (
  results: ProcessingResult[],
  id: number,
  reason: string,
  parsedData?: ScrapedGameData
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'skipped', `Skipped (${reason})`, { parsedData });
};

/**
 * Mark result as needing review
 */
export const markReview = (
  results: ProcessingResult[],
  id: number,
  message: string,
  parsedData?: ScrapedGameData
): ProcessingResult[] => {
  return updateResultStatus(results, id, 'review', message, { parsedData });
};

// ===================================================================
// STATISTICS
// ===================================================================

export interface ResultStats {
  total: number;
  pending: number;
  scraping: number;
  saving: number;
  review: number;
  success: number;
  warning: number;
  error: number;
  skipped: number;
  completed: number;
  inProgress: ProcessingResult | undefined;
}

/**
 * Calculate comprehensive statistics from results
 */
export const getResultStats = (results: ProcessingResult[]): ResultStats => {
  const statusCounts = {
    pending: 0,
    scraping: 0,
    saving: 0,
    review: 0,
    success: 0,
    warning: 0,
    error: 0,
    skipped: 0,
  };
  
  for (const result of results) {
    if (result.status in statusCounts) {
      statusCounts[result.status as keyof typeof statusCounts]++;
    }
  }
  
  return {
    total: results.length,
    ...statusCounts,
    completed: statusCounts.success + statusCounts.warning + statusCounts.error + statusCounts.skipped,
    inProgress: results.find(r => ['scraping', 'saving', 'review'].includes(r.status)),
  };
};

/**
 * Get pending count (for queue size display)
 */
export const getPendingCount = (results: ProcessingResult[]): number => {
  return results.filter(r => r.status === 'pending').length;
};

/**
 * Get success rate percentage
 */
export const getSuccessRate = (results: ProcessingResult[]): number => {
  const completed = results.filter(r => 
    ['success', 'warning', 'error', 'skipped'].includes(r.status)
  ).length;
  
  if (completed === 0) return 0;
  
  const successful = results.filter(r => 
    r.status === 'success' || r.status === 'warning'
  ).length;
  
  return Math.round((successful / completed) * 100);
};

// ===================================================================
// QUERIES
// ===================================================================

/**
 * Find result by ID
 */
export const findResult = (
  results: ProcessingResult[],
  id: number
): ProcessingResult | undefined => {
  return results.find(r => r.id === id);
};

/**
 * Check if a result exists
 */
export const hasResult = (
  results: ProcessingResult[],
  id: number
): boolean => {
  return results.some(r => r.id === id);
};

/**
 * Get all results with a specific status
 */
export const getResultsByStatus = (
  results: ProcessingResult[],
  status: ProcessingStatus
): ProcessingResult[] => {
  return results.filter(r => r.status === status);
};

/**
 * Get failed results (for retry logic)
 */
export const getFailedResults = (
  results: ProcessingResult[]
): ProcessingResult[] => {
  return results.filter(r => r.status === 'error');
};

// ===================================================================
// DATA SANITIZATION (moved from ScraperTab)
// ===================================================================

/**
 * Sanitize game data for NOT_PUBLISHED placeholder saves
 * Creates minimal valid data structure
 */
export const sanitizeGameDataForPlaceholder = (data: ScrapedGameData): ScrapedGameData => {
  return {
    ...data,
    // Default gameVariant to NOT_PUBLISHED for placeholders (cast to bypass type check until codegen runs)
    gameVariant: (data.gameVariant || 'NOT_PUBLISHED') as any,
    hasGuarantee: data.hasGuarantee ?? false,
    isSeries: data.isSeries ?? false,
    isSatellite: data.isSatellite ?? false,
    isRegular: data.isRegular ?? false,
    isMainEvent: data.isMainEvent ?? false,
    finalDay: data.finalDay ?? false,
    buyIn: data.buyIn ?? 0,
    rake: data.rake ?? 0,
    guaranteeAmount: data.guaranteeAmount ?? 0,
    totalUniquePlayers: 0,
    totalInitialEntries: 0,
    totalEntries: 0,
    totalRebuys: 0,
    totalAddons: 0,
    entries: [],
    results: [],
    seating: [],
    levels: [],
    name: data.name || `Tournament ${data.tournamentId} (Not Published)`,
    gameStatus: 'NOT_PUBLISHED' as any
  };
};

// ===================================================================
// DATA SOURCE DETECTION
// ===================================================================

export type DataSourceType = 's3' | 'web' | 'none' | 'pending';

/**
 * Determine the data source from a result
 * IMPORTANT: Only uses explicit source field - does NOT fallback to s3Key
 */
export const getDataSource = (result: ProcessingResult): DataSourceType => {
  if (result.status === 'pending' || result.status === 'scraping') {
    return 'pending';
  }
  
  const skipped = (result.parsedData as any)?.skipped;
  if (skipped || result.status === 'skipped') {
    return 'none';
  }
  
  const source = (result.parsedData as any)?.source;
  
  switch (source) {
    case 'S3_CACHE':
    case 'HTTP_304_CACHE':
      return 's3';
    case 'LIVE':
      return 'web';
    default:
      return result.parsedData ? 'web' : 'pending';
  }
};