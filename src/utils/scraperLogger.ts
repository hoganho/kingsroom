// src/utils/scraperLogger.ts
// Phase 5: Structured logging for scraper operations
// Provides consistent, filterable log output for debugging
//
// v1.1.0:
// - NEW: ITEM_NOT_FOUND event type for empty tournament slots (distinct from errors)
// - NEW: ITEM_NOT_PUBLISHED event type for hidden tournaments
// - NEW: logNotFound() and logNotPublished() helper methods
// - NOT_FOUND is no longer logged as ITEM_FETCH_ERROR (was confusing)

// ===================================================================
// TYPES
// ===================================================================

/**
 * Event types for scraper operations
 */
export type ScraperEventType = 
  // Queue lifecycle
  | 'QUEUE_BUILT'
  | 'QUEUE_FILTERED'
  | 'PROCESSING_START'
  | 'PROCESSING_STOP'
  | 'PROCESSING_COMPLETE'
  | 'PROCESSING_ERROR'
  
  // Pre-fetch operations
  | 'PREFETCH_START'
  | 'PREFETCH_COMPLETE'
  | 'PREFETCH_ERROR'
  | 'SKIP_PREFILTER'
  
  // Individual item processing
  | 'ITEM_START'
  | 'ITEM_SCRAPING'
  | 'ITEM_FETCH_SUCCESS'
  | 'ITEM_FETCH_ERROR'
  | 'ITEM_NOT_FOUND'      // NEW: Distinct from ITEM_FETCH_ERROR - tournament slot doesn't exist
  | 'ITEM_NOT_PUBLISHED'  // NEW: Tournament exists but is hidden
  | 'ITEM_SAVING'
  | 'ITEM_SAVE_SUCCESS'
  | 'ITEM_SAVE_ERROR'
  | 'ITEM_SKIPPED'
  | 'ITEM_REVIEW'
  
  // Modal interactions
  | 'MODAL_OPEN'
  | 'MODAL_CLOSE'
  | 'MODAL_DECISION'
  
  // DoNotScrape handling
  | 'DO_NOT_SCRAPE_DETECTED'
  | 'DO_NOT_SCRAPE_DECISION'
  
  // State transitions
  | 'STATE_TRANSITION'
  | 'STATE_TRANSITION_INVALID'
  
  // Auto mode
  | 'AUTO_FRONTIER_EXTEND'
  | 'AUTO_MAX_REACHED'
  
  // Errors and warnings
  | 'RATE_LIMIT_HIT'
  | 'AUTH_ERROR'
  | 'RETRY_ATTEMPT';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structure of a log entry
 */
export interface ScraperLogEntry {
  timestamp: string;
  level: LogLevel;
  event: ScraperEventType;
  tournamentId?: number;
  message: string;
  payload?: Record<string, any>;
  duration?: number;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Enable/disable logging */
  enabled: boolean;
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Include timestamps in console output */
  includeTimestamp: boolean;
  /** Store logs in memory for later retrieval */
  storeInMemory: boolean;
  /** Maximum logs to store in memory */
  maxStoredLogs: number;
  /** Custom log handler */
  customHandler?: (entry: ScraperLogEntry) => void;
}

// ===================================================================
// CONSTANTS
// ===================================================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  'debug': 0,
  'info': 1,
  'warn': 2,
  'error': 3,
};

const DEFAULT_CONFIG: LoggerConfig = {
  enabled: process.env.NODE_ENV === 'development',
  minLevel: 'info',
  includeTimestamp: true,
  storeInMemory: false,
  maxStoredLogs: 1000,
};

// ===================================================================
// LOGGER CLASS
// ===================================================================

class ScraperLogger {
  private config: LoggerConfig;
  private storedLogs: ScraperLogEntry[] = [];
  private startTimes: Map<string, number> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Format a log entry for console output
   */
  private formatForConsole(entry: ScraperLogEntry): string {
    const parts: string[] = [];
    
    if (this.config.includeTimestamp) {
      parts.push(`[${entry.timestamp.split('T')[1].split('.')[0]}]`);
    }
    
    parts.push(`[Scraper:${entry.event}]`);
    
    if (entry.tournamentId !== undefined) {
      parts.push(`#${entry.tournamentId}`);
    }
    
    parts.push(entry.message);
    
    if (entry.duration !== undefined) {
      parts.push(`(${entry.duration}ms)`);
    }
    
    return parts.join(' ');
  }

  /**
   * Output a log entry
   */
  private output(entry: ScraperLogEntry): void {
    // Store if configured
    if (this.config.storeInMemory) {
      this.storedLogs.push(entry);
      if (this.storedLogs.length > this.config.maxStoredLogs) {
        this.storedLogs.shift();
      }
    }

    // Custom handler
    if (this.config.customHandler) {
      this.config.customHandler(entry);
      return;
    }

    // Console output
    const formatted = this.formatForConsole(entry);
    const payloadStr = entry.payload ? JSON.stringify(entry.payload) : '';
    
    switch (entry.level) {
      case 'debug':
        console.debug(formatted, payloadStr ? entry.payload : '');
        break;
      case 'info':
        console.log(formatted, payloadStr ? entry.payload : '');
        break;
      case 'warn':
        console.warn(formatted, payloadStr ? entry.payload : '');
        break;
      case 'error':
        console.error(formatted, payloadStr ? entry.payload : '');
        break;
    }
  }

  /**
   * Create and output a log entry
   */
  log(
    level: LogLevel,
    event: ScraperEventType,
    message: string,
    options: {
      tournamentId?: number;
      payload?: Record<string, any>;
      duration?: number;
    } = {}
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: ScraperLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      ...options,
    };

    this.output(entry);
  }

  // =========================================================================
  // CONVENIENCE METHODS
  // =========================================================================

  debug(event: ScraperEventType, message: string, options?: { tournamentId?: number; payload?: Record<string, any>; duration?: number }): void {
    this.log('debug', event, message, options);
  }

  info(event: ScraperEventType, message: string, options?: { tournamentId?: number; payload?: Record<string, any>; duration?: number }): void {
    this.log('info', event, message, options);
  }

  warn(event: ScraperEventType, message: string, options?: { tournamentId?: number; payload?: Record<string, any>; duration?: number }): void {
    this.log('warn', event, message, options);
  }

  error(event: ScraperEventType, message: string, options?: { tournamentId?: number; payload?: Record<string, any>; duration?: number }): void {
    this.log('error', event, message, options);
  }

  // =========================================================================
  // TIMING HELPERS
  // =========================================================================

  /**
   * Start a timer for measuring duration
   */
  startTimer(key: string): void {
    this.startTimes.set(key, performance.now());
  }

  /**
   * End a timer and return duration in ms
   */
  endTimer(key: string): number | undefined {
    const startTime = this.startTimes.get(key);
    if (startTime === undefined) return undefined;
    
    this.startTimes.delete(key);
    return Math.round(performance.now() - startTime);
  }

  /**
   * Log with automatic duration from timer
   */
  logWithDuration(
    level: LogLevel,
    event: ScraperEventType,
    message: string,
    timerKey: string,
    options?: { tournamentId?: number; payload?: Record<string, any> }
  ): void {
    const duration = this.endTimer(timerKey);
    this.log(level, event, message, { ...options, duration });
  }

  // =========================================================================
  // SPECIFIC EVENT LOGGERS
  // =========================================================================

  /**
   * Log queue building
   */
  logQueueBuilt(queue: number[], mode: string): void {
    this.info('QUEUE_BUILT', `Built queue with ${queue.length} IDs`, {
      payload: { 
        mode, 
        count: queue.length,
        range: queue.length > 0 ? `${Math.min(...queue)}-${Math.max(...queue)}` : 'empty'
      }
    });
  }

  /**
   * Log prefetch results
   */
  logPrefetchComplete(cacheSize: number, skippedCount: number): void {
    this.info('PREFETCH_COMPLETE', `Prefetched ${cacheSize} statuses, ${skippedCount} will be skipped`, {
      payload: { cacheSize, skippedCount }
    });
  }

  /**
   * Log item processing start
   */
  logItemStart(tournamentId: number, url: string): void {
    this.startTimer(`item_${tournamentId}`);
    this.debug('ITEM_START', `Starting processing`, { 
      tournamentId, 
      payload: { url } 
    });
  }

  /**
   * Log successful fetch
   */
  logFetchSuccess(tournamentId: number, source: string, gameName?: string): void {
    const duration = this.endTimer(`item_${tournamentId}`);
    this.info('ITEM_FETCH_SUCCESS', `Fetched successfully from ${source}`, {
      tournamentId,
      duration,
      payload: { source, gameName }
    });
  }

  /**
   * Log fetch error
   */
  logFetchError(tournamentId: number, error: string, errorType?: string): void {
    const duration = this.endTimer(`item_${tournamentId}`);
    this.error('ITEM_FETCH_ERROR', error, {
      tournamentId,
      duration,
      payload: { errorType }
    });
  }

  /**
   * Log NOT_FOUND response (distinct from actual errors)
   * This is a successful retrieval of an empty tournament slot - NOT an error
   */
  logNotFound(tournamentId: number, gameStatus?: string): void {
    const duration = this.endTimer(`item_${tournamentId}`);
    this.info('ITEM_NOT_FOUND', `Tournament slot empty (${gameStatus || 'NOT_FOUND'})`, {
      tournamentId,
      duration,
      payload: { gameStatus: gameStatus || 'NOT_FOUND' }
    });
  }

  /**
   * Log NOT_PUBLISHED response (tournament exists but is hidden)
   * This is a successful retrieval - NOT an error
   */
  logNotPublished(tournamentId: number): void {
    const duration = this.endTimer(`item_${tournamentId}`);
    this.info('ITEM_NOT_PUBLISHED', `Tournament not published (hidden)`, {
      tournamentId,
      duration,
      payload: { gameStatus: 'NOT_PUBLISHED' }
    });
  }

  /**
   * Log save success
   */
  logSaveSuccess(tournamentId: number, gameId: string, action: 'CREATE' | 'UPDATE'): void {
    this.info('ITEM_SAVE_SUCCESS', `${action === 'CREATE' ? 'Created' : 'Updated'} game ${gameId}`, {
      tournamentId,
      payload: { gameId, action }
    });
  }

  /**
   * Log skip
   */
  logSkipped(tournamentId: number, reason: string): void {
    this.debug('ITEM_SKIPPED', `Skipped: ${reason}`, { tournamentId });
  }

  /**
   * Log doNotScrape detection
   */
  logDoNotScrapeDetected(tournamentId: number, gameStatus: string | null): void {
    this.warn('DO_NOT_SCRAPE_DETECTED', `doNotScrape URL detected before fetch`, {
      tournamentId,
      payload: { gameStatus }
    });
  }

  /**
   * Log state transition
   */
  logStateTransition(tournamentId: number, from: string, to: string, valid: boolean): void {
    if (valid) {
      this.debug('STATE_TRANSITION', `${from} → ${to}`, { tournamentId });
    } else {
      this.warn('STATE_TRANSITION_INVALID', `Invalid transition: ${from} → ${to}`, { tournamentId });
    }
  }

  /**
   * Log processing complete
   */
  logProcessingComplete(stats: { total: number; success: number; errors: number; skipped: number }): void {
    this.info('PROCESSING_COMPLETE', 
      `Completed: ${stats.success} success, ${stats.errors} errors, ${stats.skipped} skipped`, 
      { payload: stats }
    );
  }

  // =========================================================================
  // LOG RETRIEVAL
  // =========================================================================

  /**
   * Get stored logs (if storeInMemory is enabled)
   */
  getLogs(): ScraperLogEntry[] {
    return [...this.storedLogs];
  }

  /**
   * Get logs filtered by event type
   */
  getLogsByEvent(event: ScraperEventType): ScraperLogEntry[] {
    return this.storedLogs.filter(log => log.event === event);
  }

  /**
   * Get logs for a specific tournament ID
   */
  getLogsForTournament(tournamentId: number): ScraperLogEntry[] {
    return this.storedLogs.filter(log => log.tournamentId === tournamentId);
  }

  /**
   * Clear stored logs
   */
  clearLogs(): void {
    this.storedLogs = [];
    this.startTimes.clear();
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.storedLogs, null, 2);
  }
}

// ===================================================================
// SINGLETON INSTANCE
// ===================================================================

export const scraperLogger = new ScraperLogger();

// ===================================================================
// QUICK ACCESS FUNCTIONS
// ===================================================================

export const logScraperEvent = (
  event: ScraperEventType,
  message: string,
  options?: { tournamentId?: number; payload?: Record<string, any> }
): void => {
  scraperLogger.info(event, message, options);
};

export const logScraperError = (
  event: ScraperEventType,
  message: string,
  options?: { tournamentId?: number; payload?: Record<string, any> }
): void => {
  scraperLogger.error(event, message, options);
};

export default scraperLogger;