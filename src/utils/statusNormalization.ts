// src/utils/statusNormalization.ts
// Phase 5: Centralized status string normalization
// Handles variations in status strings from different sources

// ===================================================================
// GAME STATUS NORMALIZATION
// ===================================================================

/**
 * Canonical game status values
 */
export type NormalizedGameStatus = 
  | 'RUNNING'
  | 'SCHEDULED'
  | 'REGISTERING'
  | 'CLOCK_STOPPED'
  | 'FINISHED'
  | 'CANCELLED'
  | 'NOT_PUBLISHED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

/**
 * Known aliases for game statuses
 * Maps various string representations to canonical values
 */
const GAME_STATUS_ALIASES: Record<string, NormalizedGameStatus> = {
  // RUNNING variations
  'RUNNING': 'RUNNING',
  'IN_PROGRESS': 'RUNNING',
  'INPROGRESS': 'RUNNING',
  'IN PROGRESS': 'RUNNING',
  'ACTIVE': 'RUNNING',
  'LIVE': 'RUNNING',
  
  // SCHEDULED variations
  'SCHEDULED': 'SCHEDULED',
  'UPCOMING': 'SCHEDULED',
  'PENDING': 'SCHEDULED',
  
  // REGISTERING variations
  'REGISTERING': 'REGISTERING',
  'REGISTRATION': 'REGISTERING',
  'REGISTRATION_OPEN': 'REGISTERING',
  'REG_OPEN': 'REGISTERING',
  
  // CLOCK_STOPPED variations (the bug we fixed!)
  'CLOCK_STOPPED': 'CLOCK_STOPPED',
  'CLOCKSTOPPED': 'CLOCK_STOPPED',
  'CLOCK STOPPED': 'CLOCK_STOPPED',
  'PAUSED': 'CLOCK_STOPPED',
  'BREAK': 'CLOCK_STOPPED',
  'ON_BREAK': 'CLOCK_STOPPED',
  
  // FINISHED variations
  'FINISHED': 'FINISHED',
  'COMPLETED': 'FINISHED',
  'COMPLETE': 'FINISHED',
  'ENDED': 'FINISHED',
  'DONE': 'FINISHED',
  
  // CANCELLED variations
  'CANCELLED': 'CANCELLED',
  'CANCELED': 'CANCELLED',
  'CANCEL': 'CANCELLED',
  
  // NOT_PUBLISHED variations
  'NOT_PUBLISHED': 'NOT_PUBLISHED',
  'NOTPUBLISHED': 'NOT_PUBLISHED',
  'NOT PUBLISHED': 'NOT_PUBLISHED',
  'UNPUBLISHED': 'NOT_PUBLISHED',
  'DRAFT': 'NOT_PUBLISHED',
};

/**
 * Normalize a game status string to canonical form
 * @param status - Raw status string from any source
 * @returns Normalized status or 'UNKNOWN' if not recognized
 */
export const normalizeGameStatus = (status: string | null | undefined): NormalizedGameStatus => {
  if (!status) return 'UNKNOWN';
  
  // Normalize: uppercase, replace spaces/hyphens with underscores
  const normalized = status
    .toUpperCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  
  return GAME_STATUS_ALIASES[normalized] || GAME_STATUS_ALIASES[status.toUpperCase()] || 'UNKNOWN';
};

/**
 * Check if a status represents an "in progress" game
 */
export const isGameInProgress = (status: string | null | undefined): boolean => {
  const normalized = normalizeGameStatus(status);
  return ['RUNNING', 'REGISTERING', 'CLOCK_STOPPED'].includes(normalized);
};

/**
 * Check if a status represents a completed game
 */
export const isGameComplete = (status: string | null | undefined): boolean => {
  const normalized = normalizeGameStatus(status);
  return normalized === 'FINISHED';
};

/**
 * Check if a status represents an inactive/skippable game
 */
export const isGameSkippable = (status: string | null | undefined): boolean => {
  const normalized = normalizeGameStatus(status);
  return ['NOT_PUBLISHED', 'NOT_FOUND', 'CANCELLED', 'UNKNOWN'].includes(normalized);
};

// ===================================================================
// SCRAPE STATUS NORMALIZATION
// ===================================================================

/**
 * Canonical scrape attempt status values
 */
export type NormalizedScrapeStatus = 
  | 'SUCCESS'
  | 'ERROR'
  | 'NOT_FOUND'
  | 'BLANK'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH_ERROR'
  | 'SKIPPED'
  | 'UNKNOWN';

/**
 * Known aliases for scrape statuses
 */
const SCRAPE_STATUS_ALIASES: Record<string, NormalizedScrapeStatus> = {
  // SUCCESS variations
  'SUCCESS': 'SUCCESS',
  'OK': 'SUCCESS',
  'COMPLETED': 'SUCCESS',
  'DONE': 'SUCCESS',
  
  // ERROR variations
  'ERROR': 'ERROR',
  'FAILED': 'ERROR',
  'FAILURE': 'ERROR',
  
  // NOT_FOUND variations
  'NOT_FOUND': 'NOT_FOUND',
  'NOTFOUND': 'NOT_FOUND',
  'NOT FOUND': 'NOT_FOUND',
  '404': 'NOT_FOUND',
  'MISSING': 'NOT_FOUND',
  
  // BLANK variations
  'BLANK': 'BLANK',
  'EMPTY': 'BLANK',
  'NO_DATA': 'BLANK',
  'NODATA': 'BLANK',
  
  // TIMEOUT variations
  'TIMEOUT': 'TIMEOUT',
  'TIMED_OUT': 'TIMEOUT',
  'TIMEDOUT': 'TIMEOUT',
  
  // RATE_LIMITED variations
  'RATE_LIMITED': 'RATE_LIMITED',
  'RATELIMITED': 'RATE_LIMITED',
  'RATE LIMITED': 'RATE_LIMITED',
  '429': 'RATE_LIMITED',
  'TOO_MANY_REQUESTS': 'RATE_LIMITED',
  
  // AUTH_ERROR variations
  'AUTH_ERROR': 'AUTH_ERROR',
  'AUTHERROR': 'AUTH_ERROR',
  'UNAUTHORIZED': 'AUTH_ERROR',
  '401': 'AUTH_ERROR',
  '403': 'AUTH_ERROR',
  'FORBIDDEN': 'AUTH_ERROR',
  
  // SKIPPED variations
  'SKIPPED': 'SKIPPED',
  'SKIP': 'SKIPPED',
  'IGNORED': 'SKIPPED',
};

/**
 * Normalize a scrape status string to canonical form
 */
export const normalizeScrapeStatus = (status: string | null | undefined): NormalizedScrapeStatus => {
  if (!status) return 'UNKNOWN';
  
  const normalized = status
    .toUpperCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  
  return SCRAPE_STATUS_ALIASES[normalized] || SCRAPE_STATUS_ALIASES[status.toUpperCase()] || 'UNKNOWN';
};

/**
 * Check if a scrape status indicates a retryable error
 */
export const isRetryableScrapeStatus = (status: string | null | undefined): boolean => {
  const normalized = normalizeScrapeStatus(status);
  return ['ERROR', 'TIMEOUT', 'RATE_LIMITED'].includes(normalized);
};

/**
 * Check if a scrape status indicates a permanent skip condition
 */
export const isPermanentSkipStatus = (status: string | null | undefined): boolean => {
  const normalized = normalizeScrapeStatus(status);
  return ['NOT_FOUND', 'BLANK', 'SKIPPED'].includes(normalized);
};

// ===================================================================
// REGISTRATION STATUS NORMALIZATION
// ===================================================================

/**
 * Canonical registration status values
 */
export type NormalizedRegistrationStatus = 
  | 'OPEN'
  | 'CLOSED'
  | 'LATE'
  | 'UNKNOWN';

const REGISTRATION_STATUS_ALIASES: Record<string, NormalizedRegistrationStatus> = {
  'OPEN': 'OPEN',
  'OPENED': 'OPEN',
  'REGISTRATION_OPEN': 'OPEN',
  
  'CLOSED': 'CLOSED',
  'REGISTRATION_CLOSED': 'CLOSED',
  
  'LATE': 'LATE',
  'LATE_REG': 'LATE',
  'LATE_REGISTRATION': 'LATE',
  'LATEREGISTRATION': 'LATE',
};

/**
 * Normalize a registration status string
 */
export const normalizeRegistrationStatus = (status: string | null | undefined): NormalizedRegistrationStatus => {
  if (!status) return 'UNKNOWN';
  
  const normalized = status
    .toUpperCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  
  return REGISTRATION_STATUS_ALIASES[normalized] || 'UNKNOWN';
};

// ===================================================================
// UTILITY EXPORTS
// ===================================================================

export default {
  normalizeGameStatus,
  isGameInProgress,
  isGameComplete,
  isGameSkippable,
  normalizeScrapeStatus,
  isRetryableScrapeStatus,
  isPermanentSkipStatus,
  normalizeRegistrationStatus,
};
