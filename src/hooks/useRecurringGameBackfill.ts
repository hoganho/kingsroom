// src/hooks/useRecurringGameBackfill.ts
// React hook for managing recurring game instance backfill operations

import { useState, useCallback } from 'react';

import {
  backfillRecurringGameInstancesService,
  getBackfillStatusService,
  type BackfillRecurringGameInstancesInput,
  type BackfillRecurringGameInstancesResult,
  type BackfillStatusResult,
} from '../services/recurringGameBackfillService';

// ============================================================================
// HOOK RETURN TYPE
// ============================================================================

export interface UseRecurringGameBackfillReturn {
  /** Current backfill scheduler status */
  status: BackfillStatusResult | null;
  /** Result of last backfill operation */
  result: BackfillRecurringGameInstancesResult | null;
  /** Whether a backfill operation is in progress */
  isLoading: boolean;
  /** Whether status is being loaded */
  isLoadingStatus: boolean;
  /** Error message if an operation failed */
  error: string | null;
  /** Load the backfill scheduler status */
  loadStatus: () => Promise<BackfillStatusResult>;
  /** Run a backfill operation (preview or execute) */
  runBackfill: (input?: BackfillRecurringGameInstancesInput) => Promise<BackfillRecurringGameInstancesResult>;
  /** Preview what would be created without actually creating */
  previewBackfill: (input?: Omit<BackfillRecurringGameInstancesInput, 'dryRun'>) => Promise<BackfillRecurringGameInstancesResult>;
  /** Execute backfill and create instances */
  executeBackfill: (input?: Omit<BackfillRecurringGameInstancesInput, 'dryRun'>) => Promise<BackfillRecurringGameInstancesResult>;
  /** Clear the result state */
  clearResult: () => void;
  /** Clear the error state */
  clearError: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * React hook for managing backfill operations
 *
 * @example
 * const {
 *   status,
 *   result,
 *   isLoading,
 *   error,
 *   loadStatus,
 *   previewBackfill,
 *   executeBackfill,
 * } = useRecurringGameBackfill();
 *
 * // Load status on mount
 * useEffect(() => {
 *   loadStatus();
 * }, [loadStatus]);
 *
 * // Preview what would be created
 * const handlePreview = async () => {
 *   const preview = await previewBackfill({ venueId });
 *   console.log(`Would create ${preview.gapsFound} instances`);
 * };
 *
 * // Execute actual backfill
 * const handleExecute = async () => {
 *   const result = await executeBackfill({ venueId });
 *   console.log(`Created ${result.instancesCreated} instances`);
 * };
 */
export function useRecurringGameBackfill(): UseRecurringGameBackfillReturn {
  const [status, setStatus] = useState<BackfillStatusResult | null>(null);
  const [result, setResult] = useState<BackfillRecurringGameInstancesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load the backfill scheduler status
   */
  const loadStatus = useCallback(async () => {
    try {
      setIsLoadingStatus(true);
      setError(null);
      const data = await getBackfillStatusService();
      setStatus(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load status';
      setError(message);
      throw err;
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  /**
   * Run a backfill operation
   */
  const runBackfill = useCallback(async (input: BackfillRecurringGameInstancesInput = {}) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await backfillRecurringGameInstancesService(input);
      setResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run backfill';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Preview what would be created without actually creating
   */
  const previewBackfill = useCallback(
    async (input: Omit<BackfillRecurringGameInstancesInput, 'dryRun'> = {}) => {
      return runBackfill({ ...input, dryRun: true });
    },
    [runBackfill]
  );

  /**
   * Execute backfill and create instances
   */
  const executeBackfill = useCallback(
    async (input: Omit<BackfillRecurringGameInstancesInput, 'dryRun'> = {}) => {
      return runBackfill({ ...input, dryRun: false });
    },
    [runBackfill]
  );

  /**
   * Clear result state
   */
  const clearResult = useCallback(() => setResult(null), []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    result,
    isLoading,
    isLoadingStatus,
    error,
    loadStatus,
    runBackfill,
    previewBackfill,
    executeBackfill,
    clearResult,
    clearError,
  };
}

// Default export for convenience
export default useRecurringGameBackfill;
