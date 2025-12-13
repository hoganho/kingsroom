// src/hooks/scraper/useResultStateMachine.ts
// Phase 4: Typed state machine for ProcessingResult status transitions
// Prevents invalid state transitions and provides clear transition rules

import { useCallback } from 'react';
import { ProcessingResult, ProcessingStatus } from '../../types/scraper';

// ===================================================================
// STATE TRANSITION RULES
// ===================================================================

/**
 * Valid state transitions for ProcessingResult status
 * 
 * State Diagram:
 * 
 *   pending ──┬──► scraping ──┬──► saving ──┬──► success
 *             │               │             └──► warning
 *             │               │             └──► error
 *             │               │
 *             │               ├──► success (scrape-only mode)
 *             │               ├──► warning
 *             │               ├──► error ────► scraping (retry)
 *             │               ├──► skipped
 *             │               └──► review ──┬──► saving
 *             │                             └──► skipped
 *             │
 *             └──► skipped (pre-filter or stop)
 */
const VALID_TRANSITIONS: Record<ProcessingStatus, ProcessingStatus[]> = {
  'pending': ['scraping', 'skipped', 'review'],
  'scraping': ['saving', 'success', 'warning', 'error', 'skipped', 'review'],
  'saving': ['success', 'warning', 'error'],
  'review': ['saving', 'skipped', 'error', 'success'],
  'success': [], // terminal state
  'warning': [], // terminal state
  'error': ['scraping', 'review'], // can retry or review
  'skipped': [], // terminal state
};

/**
 * Terminal states - no further transitions allowed
 */
const TERMINAL_STATES: ProcessingStatus[] = ['success', 'warning', 'skipped'];

/**
 * States that indicate "in progress"
 */
const IN_PROGRESS_STATES: ProcessingStatus[] = ['pending', 'scraping', 'saving', 'review'];

// ===================================================================
// TYPES
// ===================================================================

export interface TransitionResult {
  success: boolean;
  previousStatus: ProcessingStatus;
  newStatus: ProcessingStatus;
  error?: string;
}

export interface StateMachineHelpers {
  /** Check if a transition is valid */
  canTransition: (currentStatus: ProcessingStatus, newStatus: ProcessingStatus) => boolean;
  
  /** Check if a status is terminal (no more transitions) */
  isTerminal: (status: ProcessingStatus) => boolean;
  
  /** Check if a status indicates in-progress */
  isInProgress: (status: ProcessingStatus) => boolean;
  
  /** Get valid next states from current state */
  getValidTransitions: (currentStatus: ProcessingStatus) => ProcessingStatus[];
  
  /** Perform a validated transition */
  transition: (
    id: number,
    newStatus: ProcessingStatus,
    updates?: Partial<ProcessingResult>
  ) => TransitionResult;
  
  /** Batch transition multiple results */
  batchTransition: (
    ids: number[],
    newStatus: ProcessingStatus,
    updates?: Partial<ProcessingResult>
  ) => TransitionResult[];
}

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useResultStateMachine = (
  results: ProcessingResult[],
  setResults: React.Dispatch<React.SetStateAction<ProcessingResult[]>>
): StateMachineHelpers => {
  
  /**
   * Check if a transition from currentStatus to newStatus is valid
   */
  const canTransition = useCallback((
    currentStatus: ProcessingStatus,
    newStatus: ProcessingStatus
  ): boolean => {
    const validNext = VALID_TRANSITIONS[currentStatus];
    return validNext.includes(newStatus);
  }, []);

  /**
   * Check if a status is terminal
   */
  const isTerminal = useCallback((status: ProcessingStatus): boolean => {
    return TERMINAL_STATES.includes(status);
  }, []);

  /**
   * Check if a status indicates in-progress
   */
  const isInProgress = useCallback((status: ProcessingStatus): boolean => {
    return IN_PROGRESS_STATES.includes(status);
  }, []);

  /**
   * Get valid next states from current state
   */
  const getValidTransitions = useCallback((currentStatus: ProcessingStatus): ProcessingStatus[] => {
    return VALID_TRANSITIONS[currentStatus] || [];
  }, []);

  /**
   * Perform a validated state transition
   */
  const transition = useCallback((
    id: number,
    newStatus: ProcessingStatus,
    updates?: Partial<ProcessingResult>
  ): TransitionResult => {
    const result = results.find(r => r.id === id);
    
    if (!result) {
      return {
        success: false,
        previousStatus: 'pending',
        newStatus,
        error: `Result with ID ${id} not found`
      };
    }

    const currentStatus = result.status;

    // Check if transition is valid
    if (!canTransition(currentStatus, newStatus)) {
      console.warn(
        `[StateMachine] Invalid transition: ${currentStatus} → ${newStatus} for ID ${id}. ` +
        `Valid transitions: ${getValidTransitions(currentStatus).join(', ') || 'none (terminal)'}`
      );
      
      return {
        success: false,
        previousStatus: currentStatus,
        newStatus,
        error: `Invalid transition from ${currentStatus} to ${newStatus}`
      };
    }

    // Perform the transition
    setResults(prev => prev.map(r => {
      if (r.id !== id) return r;
      return { ...r, status: newStatus, ...updates };
    }));

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus
    };
  }, [results, setResults, canTransition, getValidTransitions]);

  /**
   * Batch transition multiple results
   */
  const batchTransition = useCallback((
    ids: number[],
    newStatus: ProcessingStatus,
    updates?: Partial<ProcessingResult>
  ): TransitionResult[] => {
    const transitionResults: TransitionResult[] = [];
    const validIds: number[] = [];

    // First pass: validate all transitions
    for (const id of ids) {
      const result = results.find(r => r.id === id);
      
      if (!result) {
        transitionResults.push({
          success: false,
          previousStatus: 'pending',
          newStatus,
          error: `Result with ID ${id} not found`
        });
        continue;
      }

      if (!canTransition(result.status, newStatus)) {
        transitionResults.push({
          success: false,
          previousStatus: result.status,
          newStatus,
          error: `Invalid transition from ${result.status} to ${newStatus}`
        });
        continue;
      }

      validIds.push(id);
      transitionResults.push({
        success: true,
        previousStatus: result.status,
        newStatus
      });
    }

    // Second pass: apply valid transitions in single state update
    if (validIds.length > 0) {
      const validIdSet = new Set(validIds);
      setResults(prev => prev.map(r => {
        if (!validIdSet.has(r.id)) return r;
        return { ...r, status: newStatus, ...updates };
      }));
    }

    return transitionResults;
  }, [results, setResults, canTransition]);

  return {
    canTransition,
    isTerminal,
    isInProgress,
    getValidTransitions,
    transition,
    batchTransition,
  };
};

// ===================================================================
// UTILITY FUNCTIONS (for use outside React)
// ===================================================================

/**
 * Validate a transition without performing it
 */
export const validateTransition = (
  currentStatus: ProcessingStatus,
  newStatus: ProcessingStatus
): { valid: boolean; error?: string } => {
  const validNext = VALID_TRANSITIONS[currentStatus];
  
  if (!validNext) {
    return { valid: false, error: `Unknown status: ${currentStatus}` };
  }
  
  if (!validNext.includes(newStatus)) {
    return { 
      valid: false, 
      error: `Cannot transition from ${currentStatus} to ${newStatus}. Valid: ${validNext.join(', ') || 'none'}` 
    };
  }
  
  return { valid: true };
};

/**
 * Get a human-readable description of a status
 */
export const getStatusDescription = (status: ProcessingStatus): string => {
  const descriptions: Record<ProcessingStatus, string> = {
    'pending': 'Waiting to be processed',
    'scraping': 'Fetching data from source',
    'saving': 'Saving to database',
    'review': 'Awaiting user review',
    'success': 'Successfully completed',
    'warning': 'Completed with warnings',
    'error': 'Failed with error',
    'skipped': 'Skipped',
  };
  return descriptions[status] || 'Unknown status';
};

/**
 * Check if a result can be retried
 */
export const canRetry = (result: ProcessingResult): boolean => {
  return result.status === 'error' && VALID_TRANSITIONS['error'].includes('scraping');
};

/**
 * Check if a result is complete (terminal or error)
 */
export const isComplete = (result: ProcessingResult): boolean => {
  return TERMINAL_STATES.includes(result.status) || result.status === 'error';
};

export default useResultStateMachine;
