// src/hooks/scraper/useErrorTracking.ts
// Centralized error tracking hook for scraper operations
// Replaces scattered error counter logic in ScraperTab

import { useState, useCallback } from 'react';
import { 
  ErrorCounters, 
  AutoProcessingConfig, 
  DEFAULT_ERROR_COUNTERS,
  DEFAULT_AUTO_CONFIG,
  ErrorType 
} from '../../types/scraper';

// ===================================================================
// TYPES
// ===================================================================

export interface ErrorTrackingState extends ErrorCounters {
  lastErrorType: ErrorType | null;
  lastErrorMessage: string | null;
}

export interface UseErrorTrackingResult {
  // State
  counters: ErrorCounters;
  lastError: { type: ErrorType | null; message: string | null };
  
  // Actions
  incrementGenericError: () => void;
  incrementNotFoundError: () => void;
  incrementBlankError: () => void;
  resetOnSuccess: () => void;
  resetAll: () => void;
  recordError: (type: ErrorType, message?: string) => void;
  
  // Queries
  shouldPauseForError: () => boolean;
  shouldStopForNotFound: () => boolean;
  shouldStopForBlanks: () => boolean;
  hasReachedErrorThreshold: () => boolean;
  getBorderColor: () => string;
}

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useErrorTracking = (
  config: AutoProcessingConfig = DEFAULT_AUTO_CONFIG
): UseErrorTrackingResult => {
  const [counters, setCounters] = useState<ErrorCounters>(DEFAULT_ERROR_COUNTERS);
  const [lastError, setLastError] = useState<{ type: ErrorType | null; message: string | null }>({
    type: null,
    message: null
  });

  // --- Increment Functions ---
  
  const incrementGenericError = useCallback(() => {
    setCounters(prev => ({
      ...prev,
      consecutiveErrors: prev.consecutiveErrors + 1,
      totalErrors: prev.totalErrors + 1,
      // Reset NOT_FOUND counter on non-NOT_FOUND error
      consecutiveNotFound: 0,
    }));
  }, []);

  const incrementNotFoundError = useCallback(() => {
    setCounters(prev => ({
      ...prev,
      consecutiveErrors: prev.consecutiveErrors + 1,
      totalErrors: prev.totalErrors + 1,
      consecutiveBlanks: prev.consecutiveBlanks + 1,
      consecutiveNotFound: prev.consecutiveNotFound + 1,
    }));
  }, []);

  const incrementBlankError = useCallback(() => {
    setCounters(prev => ({
      ...prev,
      consecutiveBlanks: prev.consecutiveBlanks + 1,
    }));
  }, []);

  // --- Record Error with Type ---
  
  const recordError = useCallback((type: ErrorType, message?: string) => {
    setLastError({ type, message: message || null });
    
    if (type === 'NOT_FOUND') {
      incrementNotFoundError();
    } else {
      incrementGenericError();
    }
  }, [incrementNotFoundError, incrementGenericError]);

  // --- Reset Functions ---
  
  const resetOnSuccess = useCallback(() => {
    setCounters(prev => ({
      ...prev,
      consecutiveErrors: 0,
      consecutiveBlanks: 0,
      consecutiveNotFound: 0,
      // Note: totalErrors is NOT reset - it accumulates for the session
    }));
    setLastError({ type: null, message: null });
  }, []);

  const resetAll = useCallback(() => {
    setCounters(DEFAULT_ERROR_COUNTERS);
    setLastError({ type: null, message: null });
  }, []);

  // --- Query Functions ---
  
  const shouldPauseForError = useCallback(() => {
    return (
      counters.consecutiveErrors >= config.maxConsecutiveErrors ||
      counters.totalErrors >= config.maxTotalErrors
    );
  }, [counters, config]);

  const shouldStopForNotFound = useCallback(() => {
    return counters.consecutiveNotFound >= config.maxConsecutiveNotFound;
  }, [counters, config]);

  const shouldStopForBlanks = useCallback(() => {
    return counters.consecutiveBlanks >= config.maxConsecutiveBlanks;
  }, [counters, config]);

  const hasReachedErrorThreshold = useCallback(() => {
    return shouldPauseForError() || shouldStopForNotFound() || shouldStopForBlanks();
  }, [shouldPauseForError, shouldStopForNotFound, shouldStopForBlanks]);

  // --- UI Helpers ---
  
  const getBorderColor = useCallback(() => {
    if (counters.consecutiveErrors >= 3) return 'border-red-500';
    if (counters.consecutiveNotFound >= 10) return 'border-amber-500';
    if (counters.consecutiveBlanks >= 3) return 'border-amber-500';
    if (counters.totalErrors > 0) return 'border-yellow-500';
    return 'border-blue-500';
  }, [counters]);

  return {
    counters,
    lastError,
    incrementGenericError,
    incrementNotFoundError,
    incrementBlankError,
    resetOnSuccess,
    resetAll,
    recordError,
    shouldPauseForError,
    shouldStopForNotFound,
    shouldStopForBlanks,
    hasReachedErrorThreshold,
    getBorderColor,
  };
};

// ===================================================================
// NOTE: Standalone error helper functions (isTransientError, 
// shouldStopImmediately, isNotFoundResponse, shouldPauseForDecision)
// are exported from '../../utils/scraperErrorUtils.ts'
// Import them from there when needed outside this hook.
// ===================================================================

export default useErrorTracking;
