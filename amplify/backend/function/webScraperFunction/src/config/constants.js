/**
 * ===================================================================
 * Configuration Constants
 * ===================================================================
 * 
 * Centralized constants for the webScraperFunction.
 * All magic numbers and configuration values live here.
 * 
 * ===================================================================
 */

// ─────────────────────────────────────────────────────────────────────
// HTTP & NETWORK
// ─────────────────────────────────────────────────────────────────────

/** Maximum retry attempts for HTTP requests */
const MAX_RETRIES = 3;

/** Delay between retry attempts (ms) */
const RETRY_DELAY = 1000;

/** Timeout for main HTTP requests (ms) */
const REQUEST_TIMEOUT = 30000;

/** Timeout for HEAD requests (ms) */
const HEAD_TIMEOUT = 5000;

/** ScraperAPI key from environment */
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || '';

/** ScraperAPI base URL */
const SCRAPERAPI_URL = 'http://api.scraperapi.com';

// ─────────────────────────────────────────────────────────────────────
// S3 STORAGE
// ─────────────────────────────────────────────────────────────────────

/** S3 bucket for HTML storage */
const S3_BUCKET = process.env.S3_BUCKET || process.env.SCRAPER_S3_BUCKET || 'pokerpro-scraper-storage';

/** AWS region */
const AWS_REGION = process.env.REGION || 'ap-southeast-2';

// ─────────────────────────────────────────────────────────────────────
// LAMBDA
// ─────────────────────────────────────────────────────────────────────

/** Save game function name */
const SAVE_GAME_FUNCTION_NAME = process.env.SAVE_GAME_FUNCTION_NAME || 
    `saveGameFunction-${process.env.ENV || 'dev'}`;

const GAME_DATA_ENRICHER_FUNCTION_NAME = process.env.FUNCTION_GAMEDATAENRICHER_NAME || 
    `gameDataEnricher-${process.env.ENV || 'dev'}`;

// ─────────────────────────────────────────────────────────────────────
// VENUE & SERIES MATCHING
// ─────────────────────────────────────────────────────────────────────

/** Threshold for auto-assigning venue (0.0-1.0) */
const AUTO_ASSIGN_THRESHOLD = 0.90;

/** Threshold for suggesting venue (0.0-1.0) */
const SUGGEST_THRESHOLD = 0.60;

/** Threshold for series matching (0.0-1.0) */
const SERIES_MATCH_THRESHOLD = 0.80;

// ─────────────────────────────────────────────────────────────────────
// SPECIAL IDS
// ─────────────────────────────────────────────────────────────────────

/** UUID for unassigned venue */
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';

/** Name for unassigned venue */
const UNASSIGNED_VENUE_NAME = 'Unassigned';

// ─────────────────────────────────────────────────────────────────────
// GAME STATUSES
// ─────────────────────────────────────────────────────────────────────

/** 
 * Valid game status values
 * UPDATED: Must match GraphQL GameStatus enum exactly:
 * INITIATING, SCHEDULED, REGISTERING, RUNNING, CANCELLED, FINISHED,
 * NOT_IN_USE, NOT_PUBLISHED, CLOCK_STOPPED, UNKNOWN
 * 
 * NOTE: 'NOT_FOUND', 'ERROR', 'LATE_REG', 'BREAK' are NOT valid GameStatus values!
 * Use NOT_IN_USE for not found tournaments and UNKNOWN for errors.
 */
const GAME_STATUSES = {
    INITIATING: 'INITIATING',
    SCHEDULED: 'SCHEDULED',
    REGISTERING: 'REGISTERING',
    RUNNING: 'RUNNING',
    CANCELLED: 'CANCELLED',
    FINISHED: 'FINISHED',
    NOT_PUBLISHED: 'NOT_PUBLISHED',
    CLOCK_STOPPED: 'CLOCK_STOPPED',
    UNKNOWN: 'UNKNOWN'
};

/** Statuses that indicate tournament should not be scraped */
const DO_NOT_SCRAPE_STATUSES = [
    GAME_STATUSES.NOT_PUBLISHED,
    GAME_STATUSES.UNKNOWN          // Error states
];

/** Statuses that indicate tournament is completed */
const COMPLETED_STATUSES = [
    GAME_STATUSES.FINISHED,
    GAME_STATUSES.CANCELLED
];

/** Statuses that indicate tournament is active */
const ACTIVE_STATUSES = [
    GAME_STATUSES.INITIATING,
    GAME_STATUSES.REGISTERING,
    GAME_STATUSES.RUNNING,
    GAME_STATUSES.CLOCK_STOPPED
];

// ─────────────────────────────────────────────────────────────────────
// REGISTRATION STATUSES
// ─────────────────────────────────────────────────────────────────────

/** Valid registration status values */
const REGISTRATION_STATUSES = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    LATE_REG: 'LATE_REG',
    NOT_YET_OPEN: 'NOT_YET_OPEN',
    N_A: 'N_A'
};

// ─────────────────────────────────────────────────────────────────────
// SCRAPE INTERACTION TYPES
// ─────────────────────────────────────────────────────────────────────

/** Types of scrape interactions */
const INTERACTION_TYPES = {
    SCRAPED_WITH_HTML: 'SCRAPED_WITH_HTML',
    SCRAPED_NOT_PUBLISHED: 'SCRAPED_NOT_PUBLISHED',
    SCRAPED_NOT_IN_USE: 'SCRAPED_NOT_IN_USE',
    SCRAPED_ERROR: 'SCRAPED_ERROR',
    MANUAL_UPLOAD: 'MANUAL_UPLOAD',
    NEVER_CHECKED: 'NEVER_CHECKED',
    S3_CACHE_HIT: 'S3_CACHE_HIT',
    HTTP_304_CACHE: 'HTTP_304_CACHE'
};

/** Map interaction type to legacy scrape status */
const INTERACTION_TO_SCRAPE_STATUS = {
    SCRAPED_WITH_HTML: 'SUCCESS',
    SCRAPED_NOT_PUBLISHED: 'SKIPPED_DONOTSCRAPE',
    SCRAPED_NOT_IN_USE: 'BLANK',
    SCRAPED_ERROR: 'FAILED',
    MANUAL_UPLOAD: 'SUCCESS',
    NEVER_CHECKED: null,
    S3_CACHE_HIT: 'CACHE_HIT',
    HTTP_304_CACHE: 'CACHE_HIT'
};

// ─────────────────────────────────────────────────────────────────────
// DATA SOURCE TYPES
// ─────────────────────────────────────────────────────────────────────

/** Source of HTML content */
const DATA_SOURCES = {
    LIVE: 'LIVE',
    S3_CACHE: 'S3_CACHE',
    HTTP_304_CACHE: 'HTTP_304_CACHE',
    SCRAPER_API: 'SCRAPER_API'
};

// ─────────────────────────────────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────────────────────────────────

/** Enable verbose logging */
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';

// ─────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────

module.exports = {
    // HTTP & Network
    MAX_RETRIES,
    RETRY_DELAY,
    REQUEST_TIMEOUT,
    HEAD_TIMEOUT,
    SCRAPERAPI_KEY,
    SCRAPERAPI_URL,
    
    // S3 Storage
    S3_BUCKET,
    AWS_REGION,
    
    // Lambda
    SAVE_GAME_FUNCTION_NAME,
    
    // Matching Thresholds
    AUTO_ASSIGN_THRESHOLD,
    SUGGEST_THRESHOLD,
    SERIES_MATCH_THRESHOLD,
    
    // Special IDs
    UNASSIGNED_VENUE_ID,
    UNASSIGNED_VENUE_NAME,
    
    // Statuses
    GAME_STATUSES,
    DO_NOT_SCRAPE_STATUSES,
    COMPLETED_STATUSES,
    ACTIVE_STATUSES,
    REGISTRATION_STATUSES,
    
    // Interaction Types
    INTERACTION_TYPES,
    INTERACTION_TO_SCRAPE_STATUS,
    
    // Data Sources
    DATA_SOURCES,
    
    // Logging
    VERBOSE_LOGGING
};