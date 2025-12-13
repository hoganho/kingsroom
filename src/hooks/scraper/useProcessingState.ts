// src/hooks/scraper/useProcessingState.ts
// Centralized state management for scraper processing
// Manages results array, processing state, and provides update helpers

import { useState, useCallback, useRef, useMemo } from 'react';
import { 
  ProcessingResult, 
  ErrorType,
  IdSelectionMode 
} from '../../types/scraper';
import { ScrapedGameData } from '../../API';
import {
  updateResult,
  updateResultStatus,
  addResult,
  createPendingResult,
  createPendingResults,
  getResultStats,
  ResultStats,
} from '../../utils/processingResultUtils';

// ===================================================================
// TYPES
// ===================================================================

export interface ProcessingStateConfig {
  baseUrl: string;
  urlPath: string;
  mode: IdSelectionMode;
  useSimplifiedView?: boolean;
}

export interface UseProcessingStateResult {
  // State
  results: ProcessingResult[];
  isProcessing: boolean;
  isPaused: boolean;
  startTime: number | null;
  totalQueueSize: number;
  stats: ResultStats;
  
  // Lifecycle
  startProcessing: (queue: number[]) => AbortController;
  stopProcessing: () => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  resetState: () => void;
  
  // Result updates (convenience wrappers)
  setResultScraping: (id: number) => void;
  setResultSaving: (id: number, parsedData?: ScrapedGameData) => void;
  setResultSuccess: (id: number, message: string, parsedData?: ScrapedGameData, savedGameId?: string) => void;
  setResultWarning: (id: number, message: string, parsedData?: ScrapedGameData, extras?: Partial<ProcessingResult>) => void;
  setResultError: (id: number, message: string, errorType?: ErrorType) => void;
  setResultSkipped: (id: number, reason: string, parsedData?: ScrapedGameData) => void;
  setResultReview: (id: number, message: string, parsedData?: ScrapedGameData) => void;
  updateResultVenue: (id: number, venueId: string) => void;
  
  // Queue management (for auto mode)
  addToQueue: (id: number) => void;
  
  // Abort controller
  abortController: AbortController | null;
  
  // Direct setter for advanced use cases
  setResults: React.Dispatch<React.SetStateAction<ProcessingResult[]>>;
}

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useProcessingState = (
  config: ProcessingStateConfig
): UseProcessingStateResult => {
  const { baseUrl, urlPath, mode, useSimplifiedView = false } = config;
  
  // Core state
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [totalQueueSize, setTotalQueueSize] = useState(0);
  
  // Abort controller ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Calculate stats
  const stats = useMemo(() => getResultStats(results), [results]);

  // --- Lifecycle Functions ---

  const startProcessing = useCallback((queue: number[]): AbortController => {
    // Create abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    // Determine initial results based on view mode
    const shouldUseSimplified = useSimplifiedView || mode === 'bulk' || mode === 'range';
    
    const initialResults: ProcessingResult[] = shouldUseSimplified
      ? [createPendingResult(queue[0], baseUrl, urlPath)]
      : createPendingResults(queue, baseUrl, urlPath);
    
    setResults(initialResults);
    setTotalQueueSize(queue.length);
    setIsProcessing(true);
    setIsPaused(false);
    setStartTime(Date.now());
    
    return controller;
  }, [baseUrl, urlPath, mode, useSimplifiedView]);

    const stopProcessing = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        setResults(prev =>
            prev.map(result => {
            if (result.status === 'pending') {
                return {
                ...result,
                status: 'skipped' as const,
                message: 'Stopped by user',
                };
            }
            if (result.status === 'scraping') {
                return {
                ...result,
                status: 'skipped' as const,
                message: 'Cancelled',
                };
            }
            return result;
            })
        );

        setIsProcessing(false);
        setIsPaused(false);
    }, []);

  const pauseProcessing = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeProcessing = useCallback(() => {
    setIsPaused(false);
  }, []);

  const resetState = useCallback(() => {
    setResults([]);
    setIsProcessing(false);
    setIsPaused(false);
    setStartTime(null);
    setTotalQueueSize(0);
    abortControllerRef.current = null;
  }, []);

  // --- Result Update Functions ---

  const setResultScraping = useCallback((id: number) => {
    setResults(prev => updateResultStatus(prev, id, 'scraping', 'Scraping...'));
  }, []);

  const setResultSaving = useCallback((id: number, parsedData?: ScrapedGameData) => {
    setResults(prev => updateResultStatus(prev, id, 'saving', 'Saving to database...', { parsedData }));
  }, []);

  const setResultSuccess = useCallback((
    id: number, 
    message: string, 
    parsedData?: ScrapedGameData, 
    savedGameId?: string
  ) => {
    setResults(prev => updateResultStatus(prev, id, 'success', message, { parsedData, savedGameId }));
  }, []);

  const setResultWarning = useCallback((
    id: number, 
    message: string, 
    parsedData?: ScrapedGameData,
    extras?: Partial<ProcessingResult>
  ) => {
    setResults(prev => updateResultStatus(prev, id, 'warning', message, { parsedData, ...extras }));
  }, []);

  const setResultError = useCallback((id: number, message: string, errorType?: ErrorType) => {
    setResults(prev => updateResultStatus(prev, id, 'error', message, { errorType }));
  }, []);

  const setResultSkipped = useCallback((id: number, reason: string, parsedData?: ScrapedGameData) => {
    setResults(prev => updateResultStatus(prev, id, 'skipped', `Skipped (${reason})`, { parsedData }));
  }, []);

  const setResultReview = useCallback((id: number, message: string, parsedData?: ScrapedGameData) => {
    setResults(prev => updateResultStatus(prev, id, 'review', message, { parsedData }));
  }, []);

  const updateResultVenue = useCallback((id: number, venueId: string) => {
    setResults(prev => updateResult(prev, id, { selectedVenueId: venueId }));
  }, []);

  // --- Queue Management (for auto mode) ---

  const addToQueue = useCallback((id: number) => {
    setResults(prev => {
      // Check if already exists
      if (prev.some(r => r.id === id)) {
        return prev;
      }
      return addResult(prev, createPendingResult(id, baseUrl, urlPath));
    });
  }, [baseUrl, urlPath]);

  return {
    // State
    results,
    isProcessing,
    isPaused,
    startTime,
    totalQueueSize,
    stats,
    
    // Lifecycle
    startProcessing,
    stopProcessing,
    pauseProcessing,
    resumeProcessing,
    resetState,
    
    // Result updates
    setResultScraping,
    setResultSaving,
    setResultSuccess,
    setResultWarning,
    setResultError,
    setResultSkipped,
    setResultReview,
    updateResultVenue,
    
    // Queue management
    addToQueue,
    
    // Abort controller
    abortController: abortControllerRef.current,
    
    // Direct setter
    setResults,
  };
};

// ===================================================================
// QUEUE BUILDING UTILITIES
// (Moved from ScraperTab for reusability)
// ===================================================================

export interface QueueBuildParams {
  mode: IdSelectionMode;
  highestTournamentId: number | null;
  bulkCount: string;
  rangeString: string;
  nextId: string;
  gaps?: Array<{ start: number; end: number }>;
}

/**
 * Build processing queue based on mode and parameters
 */
export const buildProcessingQueue = (params: QueueBuildParams): number[] => {
  const { mode, highestTournamentId, bulkCount, rangeString, nextId, gaps } = params;
  const highestId = highestTournamentId || 0;

  console.log('[buildProcessingQueue] Input:', { mode, highestTournamentId, nextId, highestId });

  switch (mode) {
    case 'next': {
      // Use explicitly set nextId if provided, otherwise calculate from highestId
      const parsedNextId = parseInt(nextId);
      const result = [!isNaN(parsedNextId) ? parsedNextId : highestId + 1];
      console.log('[buildProcessingQueue] next mode:', { nextId, parsedNextId, isNaN: isNaN(parsedNextId), result });
      return result;
    }
      
    case 'bulk': {
      const count = parseInt(bulkCount) || 10;
      const startId = highestId + 1;
      return Array.from({ length: count }, (_, i) => startId + i);
    }
    
    case 'range': {
      if (!rangeString) return [];
      const queue: number[] = [];
      const parts = rangeString.split(',').map(s => s.trim());
      
      for (const part of parts) {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) {
              queue.push(i);
            }
          }
        } else {
          const num = parseInt(part);
          if (!isNaN(num)) queue.push(num);
        }
      }
      return queue;
    }
    
    case 'gaps': {
      if (!gaps) return [];
      const queue: number[] = [];
      for (const gap of gaps) {
        for (let i = gap.start; i <= gap.end; i++) {
          queue.push(i);
        }
      }
      return queue;
    }
    
    case 'auto': {
      const queue: number[] = [];
      
      // First, add all gap IDs
      if (gaps) {
        for (const gap of gaps) {
          for (let i = gap.start; i <= gap.end; i++) {
            queue.push(i);
          }
        }
      }
      
      // Then add the start ID
      const startFromId = nextId ? parseInt(nextId) : highestId + 1;
      if (!queue.includes(startFromId)) {
        queue.push(startFromId);
      }
      
      // If empty, start from 1
      if (queue.length === 0) {
        queue.push(1);
      }
      
      return queue;
    }
    
    default:
      return [];
  }
};

export default useProcessingState;