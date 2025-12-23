// src/hooks/scraper/useBatchJobMonitor.ts
// Real-time batch job monitoring with polling fallback and live duration tracking
// FIXED: Proper duration reset when job changes, better start time handling

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { ScraperJob } from '../../API';
import { getScraperJobsReport } from '../../graphql/queries';

const getClient = () => generateClient();

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
  pollingInterval?: number; // Default 3000ms (3 seconds)
  enablePolling?: boolean; // Default true
  onJobComplete?: (job: ScraperJob) => void;
  onStatsChange?: (stats: BatchJobStats, prevStats: BatchJobStats) => void;
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
 * Note: Backend may use values not in GraphQL enum (RUNNING, IN_PROGRESS, etc.)
 */
export const isJobRunning = (status: string | null | undefined): boolean => {
  if (!status) return false;
  const s = status.toUpperCase();
  const runningStatuses = ['QUEUED', 'RUNNING', 'IN_PROGRESS', 'PROCESSING'];
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
  
  // If it's already a number (Unix timestamp in ms or seconds)
  if (typeof startTime === 'number') {
    // If it's in seconds (less than year 2100 in ms), convert to ms
    if (startTime < 10000000000) {
      return startTime * 1000;
    }
    return startTime;
  }
  
  // If it's a string, try to parse it
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
    pollingInterval = 3000,
    enablePolling = true,
    onJobComplete,
    onStatsChange,
  } = config;

  // State
  const [job, setJob] = useState<ScraperJob | null>(null);
  const [liveDuration, setLiveDuration] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs - track the CURRENT job ID to detect changes
  const prevStatsRef = useRef<BatchJobStats>(extractStats(null));
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const jobStartTimeRef = useRef<number | null>(null);
  const completionNotifiedRef = useRef<boolean>(false);
  const currentJobIdRef = useRef<string | null>(null);

  // Computed
  const stats = useMemo(() => extractStats(job), [job]);
  const isActive = useMemo(() => isJobRunning(job?.status), [job?.status]);
  const isCompleteStatus = useMemo(() => isJobComplete(job?.status), [job?.status]);

  // ===================================================================
  // FETCH JOB DATA
  // ===================================================================

  const fetchJob = useCallback(async (): Promise<ScraperJob | null> => {
    if (!jobId) return null;

    try {
      const client = getClient();
      
      const response = await client.graphql({
        query: getScraperJobsReport,
        variables: { 
          limit: 50
        }
      }) as { data?: { getScraperJobsReport?: { items?: ScraperJob[] } }; errors?: unknown[] };

      if (response?.data?.getScraperJobsReport?.items) {
        const foundJob = response.data.getScraperJobsReport.items.find(
          (j: ScraperJob) => j.id === jobId || j.jobId === jobId
        );
        
        if (foundJob) {
          return foundJob;
        }
      }

      console.warn('[useBatchJobMonitor] Job not found in recent jobs:', jobId);
      return null;
    } catch (err) {
      console.error('[useBatchJobMonitor] Error fetching job:', err);
      setError('Failed to fetch job status');
      return null;
    }
  }, [jobId]);

  // ===================================================================
  // MANUAL REFRESH
  // ===================================================================

  const refresh = useCallback(async () => {
    setIsPolling(true);
    const fetchedJob = await fetchJob();
    
    if (fetchedJob) {
      const newStats = extractStats(fetchedJob);
      const changed = !statsEqual(newStats, prevStatsRef.current);
      
      if (changed && onStatsChange) {
        onStatsChange(newStats, prevStatsRef.current);
      }
      
      setHasChanges(changed);
      prevStatsRef.current = newStats;
      setJob(fetchedJob);
      setLastUpdated(new Date());

      // Update duration from server if available and makes sense
      if (fetchedJob.durationSeconds != null && fetchedJob.durationSeconds >= 0) {
        // Only use server duration if it's reasonable (less than 24 hours)
        if (fetchedJob.durationSeconds < 86400) {
          setLiveDuration(fetchedJob.durationSeconds);
        }
      }

      // Handle completion callback
      if (isJobComplete(fetchedJob.status) && !completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onJobComplete?.(fetchedJob);
      }
    }
    
    setIsPolling(false);
    return fetchedJob;
  }, [fetchJob, onStatsChange, onJobComplete]);

  // ===================================================================
  // RESET WHEN JOB ID CHANGES - MUST BE BEFORE POLLING EFFECT
  // ===================================================================

  useEffect(() => {
    // Check if job ID actually changed
    if (currentJobIdRef.current !== jobId) {
      console.log('[useBatchJobMonitor] Job ID changed:', currentJobIdRef.current, '->', jobId);
      currentJobIdRef.current = jobId;
      
      // Clear all state for the new job
      setJob(null);
      setLiveDuration(0);
      setHasChanges(false);
      setError(null);
      prevStatsRef.current = extractStats(null);
      completionNotifiedRef.current = false;
      jobStartTimeRef.current = null;
      
      // Clear intervals
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [jobId]);

  // ===================================================================
  // POLLING EFFECT
  // ===================================================================

  useEffect(() => {
    if (!jobId || !enablePolling) {
      return;
    }

    // Initial fetch
    refresh();

    // Set up polling interval
    const startPolling = () => {
      pollIntervalRef.current = setInterval(async () => {
        const fetchedJob = await fetchJob();
        
        if (fetchedJob) {
          const newStats = extractStats(fetchedJob);
          const changed = !statsEqual(newStats, prevStatsRef.current);
          
          if (changed) {
            console.log('[useBatchJobMonitor] Stats changed:', {
              prev: prevStatsRef.current,
              new: newStats
            });
            onStatsChange?.(newStats, prevStatsRef.current);
          }
          
          setHasChanges(changed);
          prevStatsRef.current = newStats;
          setJob(fetchedJob);
          setLastUpdated(new Date());

          // Update duration from server if reasonable
          if (fetchedJob.durationSeconds != null && 
              fetchedJob.durationSeconds >= 0 && 
              fetchedJob.durationSeconds < 86400) {
            setLiveDuration(fetchedJob.durationSeconds);
          }

          // Stop polling and notify when complete
          if (isJobComplete(fetchedJob.status)) {
            if (!completionNotifiedRef.current) {
              completionNotifiedRef.current = true;
              onJobComplete?.(fetchedJob);
            }
            
            // Stop polling after a short delay to get final stats
            setTimeout(() => {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }, 1000);
          }
        }
      }, pollingInterval);
    };

    startPolling();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobId, enablePolling, pollingInterval, fetchJob, onStatsChange, onJobComplete, refresh]);

  // ===================================================================
  // LIVE DURATION COUNTER EFFECT
  // ===================================================================

  useEffect(() => {
    // Clear existing interval first
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Don't run counter if no job or job is complete
    if (!job || !isActive) {
      return;
    }

    // Parse start time from job
    const parsedStartTime = parseStartTime(job.startTime);
    
    // If we have a valid start time from the job, use it
    if (parsedStartTime) {
      jobStartTimeRef.current = parsedStartTime;
      
      // Calculate initial duration
      const initialDuration = Math.floor((Date.now() - parsedStartTime) / 1000);
      
      // Sanity check: if duration seems unreasonable (> 1 hour for a bulk job), 
      // fall back to server duration or 0
      if (initialDuration > 3600 && job.durationSeconds != null && job.durationSeconds < initialDuration) {
        console.warn('[useBatchJobMonitor] Calculated duration seems too high, using server duration', {
          calculated: initialDuration,
          server: job.durationSeconds
        });
        setLiveDuration(job.durationSeconds);
      } else if (initialDuration >= 0) {
        setLiveDuration(initialDuration);
      }
    } else {
      // No start time - use when we first saw this job
      jobStartTimeRef.current = Date.now();
      setLiveDuration(job.durationSeconds ?? 0);
    }

    // Start live counter
    durationIntervalRef.current = setInterval(() => {
      if (jobStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - jobStartTimeRef.current) / 1000);
        // Sanity check: don't show more than 1 hour unless server confirms
        if (elapsed < 3600 || (job.durationSeconds && elapsed <= job.durationSeconds + 60)) {
          setLiveDuration(elapsed);
        }
      }
    }, 1000);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [job?.id, job?.jobId, isActive, job?.startTime, job?.durationSeconds]);

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