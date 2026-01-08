// src/hooks/scraper/useJobProgressSubscription.ts
// Real-time job progress monitoring via GraphQL subscription
//
// UPDATED v1.3: FIXED - Removed 'as any' casts for notFoundCount/notPublishedCount
//               since these fields are now properly typed in customSubscriptions.ts
//
// v1.2: Fixed subscription churning - callbacks now use refs to prevent reconnection loops
//
// This hook subscribes to the onJobProgress subscription to receive real-time
// updates about job progress without polling. Events are published by the
// autoScraper Lambda during job execution.
//
// Usage:
// const { event, stats, status, isActive, isComplete, durationSeconds, isSubscribed } = 
//   useJobProgressSubscription(jobId, {
//     onStatusChange: (status, prevStatus) => console.log(`Status: ${prevStatus} -> ${status}`),
//     onJobComplete: (event) => console.log('Job completed:', event),
//   });

import { useState, useEffect, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
  onJobProgress, 
  JobProgressEvent,
  OnJobProgressSubscription 
} from '../../lib/customSubscriptions';

const client = generateClient();

// ===================================================================
// TYPES
// ===================================================================

export interface JobProgressStats {
  processed: number;
  newGames: number;
  updated: number;
  errors: number;
  skipped: number;
  blanks: number;           // Kept for backwards compat - same as notFound
  notFound: number;         // Clearer name: empty tournament slots
  notPublished: number;     // Real tournaments that are hidden
  successRate: number | null;
  s3CacheHits: number;
}

export interface UseJobProgressSubscriptionOptions {
  /** Called when job status changes */
  onStatusChange?: (status: string, previousStatus: string | null) => void;
  /** Called when job completes (any terminal status) */
  onJobComplete?: (event: JobProgressEvent) => void;
  /** Called on subscription error */
  onError?: (error: Error) => void;
  /** Called when subscription is established */
  onSubscribed?: () => void;
  /** Enable/disable the subscription (default: true) */
  enabled?: boolean;
}

export interface UseJobProgressSubscriptionResult {
  /** Latest progress event from subscription */
  event: JobProgressEvent | null;
  /** Computed stats from the latest event */
  stats: JobProgressStats;
  /** Current job status */
  status: string | null;
  /** Whether job is actively running */
  isActive: boolean;
  /** Whether job has completed */
  isComplete: boolean;
  /** Duration in seconds from the event */
  durationSeconds: number;
  /** Whether subscription is connected */
  isSubscribed: boolean;
  /** Any subscription error */
  error: Error | null;
  /** Start/end ID range from event */
  startId: number | null;
  endId: number | null;
  currentId: number | null;
  /** Last error message from job */
  lastErrorMessage: string | null;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const RUNNING_STATUSES = ['QUEUED', 'RUNNING', 'IN_PROGRESS', 'PROCESSING', 'PENDING'];
const COMPLETE_STATUSES = [
  'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT',
  'STOPPED_NOT_FOUND', 'STOPPED_BLANKS', 'STOPPED_MAX_ID',
  'STOPPED_ERROR', 'STOPPED_MANUAL'
];

const isRunningStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return RUNNING_STATUSES.includes(status.toUpperCase());
};

const isCompleteStatus = (status: string | null | undefined): boolean => {
  if (!status) return false;
  return COMPLETE_STATUSES.includes(status.toUpperCase());
};

/**
 * Extract stats from a job progress event
 * FIXED v1.3: Now uses properly typed notFoundCount and notPublishedCount fields
 */
const extractStats = (event: JobProgressEvent | null): JobProgressStats => ({
  processed: event?.totalURLsProcessed ?? 0,
  newGames: event?.newGamesScraped ?? 0,
  updated: event?.gamesUpdated ?? 0,
  errors: event?.errors ?? 0,
  skipped: event?.gamesSkipped ?? 0,
  blanks: event?.blanks ?? 0,
  // FIXED v1.3: No more 'as any' cast - fields are now properly typed
  notFound: event?.notFoundCount ?? event?.blanks ?? 0,
  notPublished: event?.notPublishedCount ?? 0,
  successRate: event?.successRate ?? null,
  s3CacheHits: event?.s3CacheHits ?? 0,
});

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useJobProgressSubscription = (
  jobId: string | null,
  options: UseJobProgressSubscriptionOptions = {}
): UseJobProgressSubscriptionResult => {
  const {
    onStatusChange,
    onJobComplete,
    onError,
    onSubscribed,
    enabled = true,
  } = options;

  // State
  const [event, setEvent] = useState<JobProgressEvent | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // === CRITICAL FIX: Use refs for callbacks to prevent subscription churning ===
  // These refs allow us to call the latest callback without including them
  // in the useEffect dependency array, which would cause constant reconnections.
  const onStatusChangeRef = useRef(onStatusChange);
  const onJobCompleteRef = useRef(onJobComplete);
  const onErrorRef = useRef(onError);
  const onSubscribedRef = useRef(onSubscribed);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onJobCompleteRef.current = onJobComplete;
    onErrorRef.current = onError;
    onSubscribedRef.current = onSubscribed;
  }, [onStatusChange, onJobComplete, onError, onSubscribed]);

  // Refs for tracking state across renders
  const previousStatusRef = useRef<string | null>(null);
  const completionNotifiedRef = useRef<boolean>(false);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Reset completion tracking when jobId changes
  useEffect(() => {
    completionNotifiedRef.current = false;
    previousStatusRef.current = null;
    setEvent(null); // Clear previous job's event
  }, [jobId]);

  // Main subscription effect
  // NOTE: Only jobId and enabled are dependencies - callbacks use refs
  useEffect(() => {
    if (!jobId || !enabled) {
      setIsSubscribed(false);
      return;
    }

    console.log(`[useJobProgressSubscription] Subscribing to job: ${jobId}`);

    let isActive = true;

    const setupSubscription = async () => {
      try {
        const subscription = client.graphql({
          query: onJobProgress,
          variables: { jobId }
        });

        // Type assertion for the observable
        const observable = subscription as unknown as {
          subscribe: (handlers: {
            next: (value: { data: OnJobProgressSubscription }) => void;
            error: (error: Error) => void;
          }) => { unsubscribe: () => void };
        };

        subscriptionRef.current = observable.subscribe({
          next: ({ data }) => {
            if (!isActive) return;

            const progressEvent = data?.onJobProgress;
            if (!progressEvent) {
              console.log('[useJobProgressSubscription] Received empty event');
              return;
            }

            console.log(`[useJobProgressSubscription] Event received:`, {
              status: progressEvent.status,
              processed: progressEvent.totalURLsProcessed,
              newGames: progressEvent.newGamesScraped,
              updated: progressEvent.gamesUpdated,
              errors: progressEvent.errors,
              duration: progressEvent.durationSeconds,
            });

            setEvent(progressEvent as JobProgressEvent);
            setError(null);

            // Handle status changes - use ref to get latest callback
            const currentStatus = progressEvent.status;
            const prevStatus = previousStatusRef.current;

            if (currentStatus && currentStatus !== prevStatus) {
              console.log(`[useJobProgressSubscription] Status changed: ${prevStatus} -> ${currentStatus}`);
              onStatusChangeRef.current?.(currentStatus, prevStatus);
              previousStatusRef.current = currentStatus;
            }

            // Handle completion - use ref to get latest callback
            if (isCompleteStatus(currentStatus) && !completionNotifiedRef.current) {
              console.log(`[useJobProgressSubscription] Job completed with status: ${currentStatus}`);
              completionNotifiedRef.current = true;
              onJobCompleteRef.current?.(progressEvent as JobProgressEvent);
            }
          },
          error: (err: Error) => {
            if (!isActive) return;
            console.error('[useJobProgressSubscription] Subscription error:', err);
            setError(err);
            setIsSubscribed(false);
            onErrorRef.current?.(err);
          },
        });

        if (isActive) {
          setIsSubscribed(true);
          setError(null);
          onSubscribedRef.current?.();
          console.log(`[useJobProgressSubscription] Subscription established for job: ${jobId}`);
        }
      } catch (err) {
        if (!isActive) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('[useJobProgressSubscription] Failed to setup subscription:', error);
        setError(error);
        setIsSubscribed(false);
        onErrorRef.current?.(error);
      }
    };

    setupSubscription();

    return () => {
      isActive = false;
      if (subscriptionRef.current) {
        console.log(`[useJobProgressSubscription] Unsubscribing from job: ${jobId}`);
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [jobId, enabled]); // <-- FIXED: Only jobId and enabled, callbacks use refs

  // Computed values
  const stats = extractStats(event);
  const status = event?.status ?? null;
  const isActive = isRunningStatus(status);
  const isComplete = isCompleteStatus(status);
  const durationSeconds = event?.durationSeconds ?? 0;

  return {
    event,
    stats,
    status,
    isActive,
    isComplete,
    durationSeconds,
    isSubscribed,
    error,
    startId: event?.startId ?? null,
    endId: event?.endId ?? null,
    currentId: event?.currentId ?? null,
    lastErrorMessage: event?.lastErrorMessage ?? null,
  };
};

export default useJobProgressSubscription;