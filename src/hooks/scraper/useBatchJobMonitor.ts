// src/hooks/scraper/useBatchJobMonitor.ts
// Real-time batch job monitoring with subscription-first approach and polling fallback
// UPDATED v2.4: Added stale job detection and Lambda restart detection.
//               - Detects when no subscription updates received for 60+ seconds
//               - Detects stats regression (sign of Lambda restart)
//               - Auto-refetches job status when stale
// v2.3: CRITICAL FIX - onJobComplete now called when job is already complete on
//               initial fetch. This fixes the UI getting stuck when Lambda crashes 
//               immediately before the subscription is established.
// v2.2: Fixed null _version/_lastChangedAt errors by using minimal query
//       from scraperManagement.ts. See that file for documentation.
//
// This hook now uses the onJobProgress subscription for real-time updates,
// eliminating the need for polling and avoiding API rate limits.
// Falls back to a single initial fetch + manual refresh.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { ScraperJob } from '../../API';
import { getScraperJobsReportMinimal } from '../../graphql/scraperManagement';
import { useJobProgressSubscription } from './useJobProgressSubscription';

const getClient = () => generateClient();

// ===================================================================
// CONSTANTS
// ===================================================================

/** Time without subscription updates before considering job stale (ms) */
const STALE_THRESHOLD_MS = 60000; // 1 minute

/** Interval for checking if job is stale (ms) */
const STALE_CHECK_INTERVAL_MS = 10000; // 10 seconds

// ===================================================================
// TYPES
// ===================================================================

export interface BatchJobStats {
  processed: number;
  newGames: number;
  updated: number;
  errors: number;
  skipped: number;
  blanks: number;
  successRate: number | null;
}

export interface UseBatchJobMonitorConfig {
  /** @deprecated Polling is no longer used - subscription provides real-time updates */
  pollingInterval?: number;
  /** @deprecated Polling is no longer used */
  enablePolling?: boolean;
  onJobComplete?: (job: ScraperJob) => void;
  onStatsChange?: (stats: BatchJobStats, prevStats: BatchJobStats) => void;
  /** Called when job becomes stale (no updates for STALE_THRESHOLD_MS) */
  onJobStale?: () => void;
  /** Called when stats regression is detected (possible Lambda restart) */
  onStatsRegression?: (current: BatchJobStats, previous: BatchJobStats) => void;
  /** @deprecated Polling is no longer used */
  maxBackoffInterval?: number;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const extractStats = (job: ScraperJob | null): BatchJobStats => ({
  processed: job?.totalURLsProcessed ?? 0,
  newGames: job?.newGamesScraped ?? 0,
  updated: job?.gamesUpdated ?? 0,
  errors: job?.errors ?? 0,
  skipped: job?.gamesSkipped ?? 0,
  blanks: job?.blanks ?? 0,
  successRate: job?.successRate ?? null,
});

const statsEqual = (a: BatchJobStats, b: BatchJobStats): boolean => {
  return (
    a.processed === b.processed &&
    a.newGames === b.newGames &&
    a.updated === b.updated &&
    a.errors === b.errors &&
    a.skipped === b.skipped &&
    a.blanks === b.blanks
  );
};

/**
 * Check if a job status indicates the job is still running
 */
export const isJobRunning = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const s = status.toUpperCase();
  const runningStatuses = ['QUEUED', 'RUNNING', 'IN_PROGRESS', 'PROCESSING', 'PENDING'];
  return runningStatuses.includes(s);
};

/**
 * Check if a job status indicates completion (success or failure)
 */
export const isJobComplete = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const s = status.toUpperCase();
  const completeStatuses = [
    'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT',
    'STOPPED_NOT_FOUND', 'STOPPED_BLANKS', 'STOPPED_MAX_ID',
    'STOPPED_ERROR', 'STOPPED_MANUAL'
  ];
  return completeStatuses.includes(s);
};

/**
 * Parse a timestamp that could be ISO string, Unix timestamp, or already a Date
 */
const parseStartTime = (startTime: unknown): number | null => {
  if (!startTime) return null;
  
  if (typeof startTime === 'number') {
    if (startTime < 10000000000) {
      return startTime * 1000;
    }
    return startTime;
  }
  
  if (typeof startTime === 'string') {
    const parsed = new Date(startTime).getTime();
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  return null;
};

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export const useBatchJobMonitor = (
  jobId: string | null,
  config: UseBatchJobMonitorConfig = {}
) => {
  const {
    onJobComplete,
    onStatsChange,
    onJobStale,
    onStatsRegression,
  } = config;

  // State
  const [job, setJob] = useState<ScraperJob | null>(null);
  const [liveDuration, setLiveDuration] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale detection state
  const [lastEventTime, setLastEventTime] = useState<number>(Date.now());
  const [isStale, setIsStale] = useState(false);
  const [statsRegressed, setStatsRegressed] = useState(false);

  // Refs
  const prevStatsRef = useRef<BatchJobStats>(extractStats(null));
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef<boolean>(false);
  const currentJobIdRef = useRef<string | null>(null);
  const prevSubscriptionEventRef = useRef<typeof subscriptionEvent>(null);

  // ===================================================================
  // SUBSCRIPTION FOR REAL-TIME UPDATES
  // ===================================================================

  const {
    event: subscriptionEvent,
    isSubscribed,
    status: subscriptionStatus,
    durationSeconds: subscriptionDuration,
    startId: subscriptionStartId,
    endId: subscriptionEndId,
    currentId: subscriptionCurrentId,
    lastErrorMessage: subscriptionErrorMessage,
  } = useJobProgressSubscription(jobId, {
    onStatusChange: (status, prevStatus) => {
      console.log(`[useBatchJobMonitor] Status via subscription: ${prevStatus} -> ${status}`);
    },
    onJobComplete: (event) => {
      console.log('[useBatchJobMonitor] Job completed via subscription:', event.status);
      // Create a ScraperJob-like object from the subscription event
      const jobFromEvent: ScraperJob = {
        __typename: 'ScraperJob',
        id: event.jobId,
        jobId: event.jobId,
        status: event.status as ScraperJob['status'],
        triggerSource: job?.triggerSource ?? ('MANUAL' as ScraperJob['triggerSource']),
        startTime: event.startTime || new Date().toISOString(),
        endTime: new Date().toISOString(),
        totalURLsProcessed: event.totalURLsProcessed,
        newGamesScraped: event.newGamesScraped,
        gamesUpdated: event.gamesUpdated,
        gamesSkipped: event.gamesSkipped,
        errors: event.errors,
        blanks: event.blanks,
        entityId: event.entityId,
        durationSeconds: event.durationSeconds,
        s3CacheHits: event.s3CacheHits,
        successRate: event.successRate,
        stopReason: event.stopReason,
        lastErrorMessage: event.lastErrorMessage,
        currentId: event.currentId,
        startId: event.startId,
        endId: event.endId,
        createdAt: job?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _version: job?._version ?? 1,
        _lastChangedAt: Date.now(),
      };
      
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onJobComplete?.(jobFromEvent);
      }
    },
    onError: (err) => {
      console.error('[useBatchJobMonitor] Subscription error:', err);
      setError(err.message);
    },
  });

  // ===================================================================
  // STALE DETECTION - Track when we last received an event
  // ===================================================================

  useEffect(() => {
    if (subscriptionEvent) {
      setLastEventTime(Date.now());
      setIsStale(false);
    }
  }, [subscriptionEvent]);

  // ===================================================================
  // STALE DETECTION - Check for stale job (no updates for too long)
  // ===================================================================

  // Computed values (defined early for use in stale detection)
  const isActive = useMemo(() => {
    if (subscriptionStatus) {
      return isJobRunning(subscriptionStatus);
    }
    return isJobRunning(job?.status);
  }, [subscriptionStatus, job?.status]);

  // fetchJob defined early for stale detection
  const fetchJob = useCallback(async (): Promise<ScraperJob | null> => {
    if (!jobId) return null;
    
    setIsPolling(true);

    try {
      const client = getClient();
      
      const response = await client.graphql({
        query: getScraperJobsReportMinimal,
        variables: { limit: 50 }
      }) as { data?: { getScraperJobsReport?: { items?: ScraperJob[] } }; errors?: unknown[] };

      if (response?.errors && response.errors.length > 0) {
        console.error('[useBatchJobMonitor] GraphQL errors:', response.errors);
        setError('Failed to fetch job data');
        return null;
      }

      const jobs = response?.data?.getScraperJobsReport?.items || [];
      const foundJob = jobs.find(j => j.id === jobId || j.jobId === jobId) || null;

      if (foundJob) {
        // Only update if we don't have subscription data yet
        if (!subscriptionEvent) {
          setJob(foundJob);
          setLastUpdated(new Date());
          
          if (foundJob.durationSeconds != null) {
            setLiveDuration(foundJob.durationSeconds);
          }
          
          // CRITICAL FIX: If job is already complete when we first fetch it,
          // trigger onJobComplete callback. This handles the case where the Lambda
          // crashes immediately before our subscription is established.
          if (isJobComplete(foundJob.status) && !completionNotifiedRef.current) {
            console.log('[useBatchJobMonitor] Job already complete on initial fetch:', foundJob.status);
            completionNotifiedRef.current = true;
            onJobComplete?.(foundJob);
          }
        }
        
        // If we were stale and job is now complete, clear stale flag
        if (isJobComplete(foundJob.status)) {
          setIsStale(false);
        }
        
        setError(null);
      }

      return foundJob;

    } catch (err) {
      console.error('[useBatchJobMonitor] Error fetching job:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return null;
    } finally {
      setIsPolling(false);
    }
  }, [jobId, subscriptionEvent, onJobComplete]);

  // Stale check interval
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const timeSinceLastEvent = Date.now() - lastEventTime;
      
      if (timeSinceLastEvent > STALE_THRESHOLD_MS && !isStale) {
        console.warn(`[useBatchJobMonitor] Job appears stale - no updates for ${Math.round(timeSinceLastEvent / 1000)}s`);
        setIsStale(true);
        onJobStale?.();
        
        // Auto-refetch job status to see if it's actually still running or failed
        console.log('[useBatchJobMonitor] Auto-refetching job status due to stale detection');
        fetchJob();
      }
    }, STALE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isActive, lastEventTime, isStale, fetchJob, onJobStale]);

  // ===================================================================
  // STATS REGRESSION DETECTION (sign of Lambda restart)
  // ===================================================================

  useEffect(() => {
    if (!subscriptionEvent || !prevSubscriptionEventRef.current) {
      prevSubscriptionEventRef.current = subscriptionEvent;
      return;
    }

    const prevEvent = prevSubscriptionEventRef.current;
    
    // Check if totalURLsProcessed went backwards
    if (subscriptionEvent.totalURLsProcessed < prevEvent.totalURLsProcessed) {
      console.warn('[useBatchJobMonitor] Stats regressed - possible Lambda restart detected', {
        previous: prevEvent.totalURLsProcessed,
        current: subscriptionEvent.totalURLsProcessed,
      });
      
      setStatsRegressed(true);
      
      const currentStats = extractStats({
        totalURLsProcessed: subscriptionEvent.totalURLsProcessed,
        newGamesScraped: subscriptionEvent.newGamesScraped,
        gamesUpdated: subscriptionEvent.gamesUpdated,
        gamesSkipped: subscriptionEvent.gamesSkipped,
        errors: subscriptionEvent.errors,
        blanks: subscriptionEvent.blanks,
        successRate: subscriptionEvent.successRate,
      } as ScraperJob);
      
      const prevStats = extractStats({
        totalURLsProcessed: prevEvent.totalURLsProcessed,
        newGamesScraped: prevEvent.newGamesScraped,
        gamesUpdated: prevEvent.gamesUpdated,
        gamesSkipped: prevEvent.gamesSkipped,
        errors: prevEvent.errors,
        blanks: prevEvent.blanks,
        successRate: prevEvent.successRate,
      } as ScraperJob);
      
      onStatsRegression?.(currentStats, prevStats);
    } else {
      // Clear regression flag if stats are progressing normally
      if (statsRegressed && subscriptionEvent.totalURLsProcessed > prevEvent.totalURLsProcessed) {
        setStatsRegressed(false);
      }
    }

    prevSubscriptionEventRef.current = subscriptionEvent;
  }, [subscriptionEvent, onStatsRegression, statsRegressed]);

  // Update job state from subscription events
  useEffect(() => {
    if (!subscriptionEvent) return;

    // Build a ScraperJob from the subscription event
    const jobFromEvent: ScraperJob = {
      __typename: 'ScraperJob',
      id: subscriptionEvent.jobId,
      jobId: subscriptionEvent.jobId,
      status: subscriptionEvent.status as ScraperJob['status'],
      triggerSource: job?.triggerSource ?? ('MANUAL' as ScraperJob['triggerSource']),
      startTime: subscriptionEvent.startTime || job?.startTime || new Date().toISOString(),
      endTime: isJobComplete(subscriptionEvent.status) ? new Date().toISOString() : null,
      totalURLsProcessed: subscriptionEvent.totalURLsProcessed,
      newGamesScraped: subscriptionEvent.newGamesScraped,
      gamesUpdated: subscriptionEvent.gamesUpdated,
      gamesSkipped: subscriptionEvent.gamesSkipped,
      errors: subscriptionEvent.errors,
      blanks: subscriptionEvent.blanks,
      entityId: subscriptionEvent.entityId,
      durationSeconds: subscriptionEvent.durationSeconds,
      s3CacheHits: subscriptionEvent.s3CacheHits,
      successRate: subscriptionEvent.successRate,
      stopReason: subscriptionEvent.stopReason,
      lastErrorMessage: subscriptionEvent.lastErrorMessage,
      currentId: subscriptionEvent.currentId,
      startId: subscriptionEvent.startId,
      endId: subscriptionEvent.endId,
      createdAt: job?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _version: job?._version ?? 1,
      _lastChangedAt: Date.now(),
    };

    // Check for stats changes
    const newStats = extractStats(jobFromEvent);
    const changed = !statsEqual(newStats, prevStatsRef.current);
    
    if (changed) {
      console.log('[useBatchJobMonitor] Stats changed via subscription:', {
        prev: prevStatsRef.current,
        new: newStats
      });
      onStatsChange?.(newStats, prevStatsRef.current);
    }

    setHasChanges(changed);
    prevStatsRef.current = newStats;
    setJob(jobFromEvent);
    setLastUpdated(new Date());
    
    // Use subscription duration directly
    if (subscriptionDuration >= 0) {
      setLiveDuration(subscriptionDuration);
    }
  }, [subscriptionEvent, subscriptionDuration, onStatsChange, job?.triggerSource, job?.startTime, job?.createdAt, job?._version]);

  // Computed values from subscription
  const stats = useMemo(() => extractStats(job), [job]);
  
  const isCompleteStatus = useMemo(() => {
    if (subscriptionStatus) {
      return isJobComplete(subscriptionStatus);
    }
    return isJobComplete(job?.status);
  }, [subscriptionStatus, job?.status]);

  const refresh = useCallback(() => {
    fetchJob();
  }, [fetchJob]);

  // ===================================================================
  // RESET STATE WHEN JOB ID CHANGES
  // ===================================================================

  useEffect(() => {
    if (currentJobIdRef.current !== jobId) {
      console.log(`[useBatchJobMonitor] Job ID changed: ${currentJobIdRef.current} -> ${jobId}`);
      
      currentJobIdRef.current = jobId;
      completionNotifiedRef.current = false;
      prevStatsRef.current = extractStats(null);
      prevSubscriptionEventRef.current = null;
      jobStartTimeRef.current = null;
      
      setJob(null);
      setLiveDuration(0);
      setHasChanges(false);
      setError(null);
      
      // Reset stale detection state
      setLastEventTime(Date.now());
      setIsStale(false);
      setStatsRegressed(false);
    }
  }, [jobId]);

  // ===================================================================
  // INITIAL FETCH EFFECT
  // ===================================================================

  useEffect(() => {
    if (!jobId) return;
    
    // Do a single initial fetch to get job data
    refresh();
  }, [jobId, refresh]);

  // ===================================================================
  // LIVE DURATION COUNTER EFFECT
  // ===================================================================

  useEffect(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Don't run counter if no job, job is complete, or subscription is providing duration
    if (!job || !isActive || isSubscribed) {
      return;
    }

    const parsedStartTime = parseStartTime(job.startTime);
    
    if (parsedStartTime) {
      jobStartTimeRef.current = parsedStartTime;
      
      const initialDuration = Math.floor((Date.now() - parsedStartTime) / 1000);
      
      if (initialDuration > 3600 && job.durationSeconds != null && job.durationSeconds < initialDuration) {
        setLiveDuration(job.durationSeconds);
      } else if (initialDuration >= 0) {
        setLiveDuration(initialDuration);
      }
    } else {
      jobStartTimeRef.current = Date.now();
      setLiveDuration(job.durationSeconds ?? 0);
    }

    // Only start counter if subscription isn't active
    if (!isSubscribed) {
      durationIntervalRef.current = setInterval(() => {
        if (jobStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - jobStartTimeRef.current) / 1000);
          if (elapsed < 3600 || (job.durationSeconds && elapsed <= job.durationSeconds + 60)) {
            setLiveDuration(elapsed);
          }
        }
      }, 1000);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [job?.id, job?.jobId, isActive, job?.startTime, job?.durationSeconds, isSubscribed]);

  // ===================================================================
  // FORMAT DURATION HELPER
  // ===================================================================

  const formatDuration = useCallback((seconds: number): string => {
    if (seconds < 0) return '0s';
    if (seconds < 60) return `${seconds}s`;
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins < 60) {
      return `${mins}m ${secs}s`;
    }
    
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }, []);

  // ===================================================================
  // RETURN
  // ===================================================================

  return {
    // State
    job,
    stats,
    liveDuration,
    isActive,
    isComplete: isCompleteStatus,
    isPolling,
    lastUpdated,
    hasChanges,
    error,

    // Subscription state
    isSubscribed,
    
    // Stale/health detection state
    isStale,
    statsRegressed,
    lastEventTime,
    
    // Subscription-provided values (use these for display)
    currentId: subscriptionCurrentId ?? job?.currentId ?? null,
    startId: subscriptionStartId ?? job?.startId ?? null,
    endId: subscriptionEndId ?? job?.endId ?? null,
    lastErrorMessage: subscriptionErrorMessage ?? job?.lastErrorMessage ?? null,

    // @deprecated - Rate limiting no longer applies with subscription approach
    isRateLimited: false,
    // @deprecated - Polling interval no longer used
    currentPollInterval: 0,

    // Actions
    refresh,

    // Utilities
    formatDuration,
  };
};

// ===================================================================
// STATUS UTILITIES
// ===================================================================

export const getJobStatusLabel = (status: string | null | undefined): string => {
  if (!status) return 'Unknown';
  
  const labels: Record<string, string> = {
    'PENDING': 'Starting...',
    'QUEUED': 'Queued',
    'RUNNING': 'Running',
    'IN_PROGRESS': 'Running',
    'PROCESSING': 'Processing',
    'COMPLETED': 'Completed',
    'FAILED': 'Failed',
    'CANCELLED': 'Cancelled',
    'TIMEOUT': 'Timed Out',
    'STOPPED_NOT_FOUND': 'Stopped (Not Found)',
    'STOPPED_BLANKS': 'Stopped (Blanks)',
    'STOPPED_MAX_ID': 'Stopped (Max ID)',
    'STOPPED_ERROR': 'Stopped (Error)',
    'STOPPED_MANUAL': 'Stopped (Manual)',
  };

  return labels[status.toUpperCase()] || status;
};

export const getJobStatusColor = (status: string | null | undefined): string => {
  if (!status) return 'bg-gray-100 text-gray-700';
  
  const s = status.toUpperCase();
  
  if (isJobRunning(s)) {
    return 'bg-blue-100 text-blue-700';
  }
  
  if (s === 'COMPLETED') {
    return 'bg-green-100 text-green-700';
  }
  
  if (['STOPPED_NOT_FOUND', 'STOPPED_BLANKS', 'STOPPED_MAX_ID'].includes(s)) {
    return 'bg-yellow-100 text-yellow-700';
  }
  
  if (['FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED_ERROR', 'STOPPED_MANUAL'].includes(s)) {
    return 'bg-red-100 text-red-700';
  }
  
  return 'bg-gray-100 text-gray-700';
};

export default useBatchJobMonitor;