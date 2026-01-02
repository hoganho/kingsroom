// src/hooks/useScraperManagement.ts
// React hooks for enhanced scraper management
// Updated to use new Unified Queries and ScrapeURL schema
// Restored useURLHistory for auditing
// FIXED: Uses minimal query to avoid deeply nested entity null errors

import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { scraperManagementQueries } from '../graphql/scraperManagement';
import { 
    // Don't import getScraperJobsReport from auto-generated - it causes null errors
    searchScrapeURLs,
    getScrapeURL,
    getUpdateCandidateURLs,
    getScraperMetrics,
} from '../graphql/queries';
import { 
    startScraperJob,
    cancelScraperJob,
    modifyScrapeURLStatus,
    bulkModifyScrapeURLs
 } from '../graphql/mutations';
import { onScraperJobUpdate } from '../graphql/subscriptions';
import {
    TimeRange,
    type ScraperJob,
    type ScrapeURL,
    type ScraperJobStatus,
    type ScrapeURLStatus,
    type ScraperMetrics,
    type StartScraperJobInput
} from '../API';

// Define the shape of GraphQL responses we expect
interface GraphQLResponseData<T> {
    data: T;
}

// Type guard to check if response has data
function hasGraphQLData<T>(response: any): response is GraphQLResponseData<T> {
    return response && response.data !== null && response.data !== undefined;
}

// Helper to safely cast GraphQL responses to expected types
function castToType<T>(data: any): T | null {
    if (!data) return null;
    return data as unknown as T;
}

// ===================================================================
// useScraperJobs - Manage scraper jobs (Unified System)
// FIXED: Uses minimal query to avoid nested entity null errors
// ===================================================================
export const useScraperJobs = (initialStatus?: ScraperJobStatus) => {
    const client = useMemo(() => generateClient(), []);
    const [jobs, setJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScraperJobStatus | undefined>(initialStatus);
    const [nextToken, setNextToken] = useState<string | null>(null);

    const fetchJobs = useCallback(async (reset = false) => {
        try {
            setLoading(true);
            setError(null);

            // FIXED: Use minimal query to avoid deeply nested entity null errors
            const response = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReportMinimal,
                variables: {
                    status: statusFilter,
                    limit: 20,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');

            const jobsReport = response.data?.getScraperJobsReport;
            if (!jobsReport) return;

            const newJobs = jobsReport.items || [];
            
            if (reset) {
                setJobs(newJobs.map((job: unknown) => castToType<ScraperJob>(job)!).filter(Boolean));
            } else {
                setJobs(prev => [...prev, ...newJobs.map((job: unknown) => castToType<ScraperJob>(job)!).filter(Boolean)]);
            }
            
            setNextToken(jobsReport.nextToken || null);
        } catch (err) {
            console.error('Error fetching jobs:', err);
            setError('Failed to fetch scraper jobs');
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter, nextToken]);

    const startJob = useCallback(async (input: StartScraperJobInput) => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: startScraperJob,
                variables: { input }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            const newJob = castToType<ScraperJob>(response.data.startScraperJob);
            if (newJob) setJobs(prev => [newJob, ...prev]);
            return newJob;
        } catch (err) {
            console.error('Error starting job:', err);
            setError('Failed to start scraper job');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    const cancelJob = useCallback(async (jobId: string) => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: cancelScraperJob,
                variables: { jobId }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            const cancelledJob = castToType<ScraperJob>(response.data.cancelScraperJob);
            if (cancelledJob) {
                setJobs(prev => prev.map(job =>
                    job.jobId === jobId ? { ...job, ...cancelledJob } : job
                ));
            }
            return cancelledJob;
        } catch (err) {
            console.error('Error cancelling job:', err);
            setError('Failed to cancel scraper job');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    useEffect(() => {
        const subscription = client.graphql({ query: onScraperJobUpdate });
        const sub = (subscription as any).subscribe({
            next: ({ data }: any) => {
                if (data?.onScraperJobUpdate) {
                    const updatedJob = castToType<ScraperJob>(data.onScraperJobUpdate);
                    if (updatedJob) {
                        setJobs(prev => prev.map(job =>
                            job.jobId === updatedJob.jobId ? { ...job, ...updatedJob } : job
                        ));
                    }
                }
            },
            error: (err: any) => console.error('Subscription error:', err)
        });
        return () => sub.unsubscribe();
    }, [client]);

    useEffect(() => { fetchJobs(true); }, [statusFilter]);

    return {
        jobs,
        loading,
        error,
        statusFilter,
        setStatusFilter,
        nextToken,
        fetchJobs,
        startJob,
        cancelJob,
        hasMore: !!nextToken
    };
};

// ===================================================================
// useScrapeURLs - Manage scrape URLs (Unified Schema)
// ===================================================================
export const useScrapeURLs = (initialStatus?: ScrapeURLStatus) => {
    const client = useMemo(() => generateClient(), []);
    const [urls, setUrls] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScrapeURLStatus | undefined>(initialStatus);
    const [nextToken, setNextToken] = useState<string | null>(null);

    const fetchURLs = useCallback(async (reset = false) => {
        try {
            setLoading(true);
            setError(null);

            // NOTE: Updated query to ensure we fetch new unified fields
            // like lastInteractionType, hasStoredContent, etc.
            const response = await client.graphql({
                query: searchScrapeURLs, // This query should fetch all the new fields
                variables: {
                    status: statusFilter,
                    limit: 20,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            
            const urlsData = response.data?.searchScrapeURLs;
            if (!urlsData) return;

            const newURLs = urlsData.items || [];
            if (reset) {
                setUrls(newURLs.map((url: unknown) => castToType<ScrapeURL>(url)!).filter(Boolean));
            } else {
                setUrls(prev => [...prev, ...newURLs.map((url: unknown) => castToType<ScrapeURL>(url)!).filter(Boolean)]);
            }
            setNextToken(urlsData.nextToken || null);
        } catch (err) {
            console.error('Error fetching URLs:', err);
            setError('Failed to fetch scrape URLs');
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter, nextToken]);

    const modifyURLStatus = useCallback(async (urlId: string, newStatus: ScrapeURLStatus) => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: modifyScrapeURLStatus,
                variables: { url: urlId, status: newStatus }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            const updatedURL = castToType<ScrapeURL>(response.data?.modifyScrapeURLStatus);
            if (updatedURL) {
                setUrls(prev => prev.map(url =>
                    url.id === urlId ? { ...url, ...updatedURL } : url
                ));
            }
            return updatedURL;
        } catch (err) {
            console.error('Error modifying URL status:', err);
            setError('Failed to modify URL status');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    const bulkModifyURLStatuses = useCallback(async (urlIds: string[], newStatus: ScrapeURLStatus) => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: bulkModifyScrapeURLs,
                variables: { urls: urlIds, status: newStatus }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            const updatedURLs = response.data?.bulkModifyScrapeURLs || [];
            const typedURLs = updatedURLs.map((u: unknown) => castToType<ScrapeURL>(u)!).filter(Boolean);
            const urlMap = new Map(typedURLs.map((u: ScrapeURL) => [u.url, u]));
            
            setUrls(prev => prev.map(u =>
                urlMap.has(u.url) ? { ...u, ...urlMap.get(u.url)! } : u
            ));
            return typedURLs;
        } catch (err) {
            console.error('Error bulk modifying URLs:', err);
            setError('Failed to bulk modify URLs');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Fetches "RUNNING" games that are stale
    const fetchUpdateCandidates = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: getUpdateCandidateURLs,
                variables: { limit: 50 }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            return response.data.getUpdateCandidateURLs || [];
        } catch (err) {
            console.error('Error fetching update candidates:', err);
            setError('Failed to fetch update candidates');
            return [];
        } finally {
            setLoading(false);
        }
    }, [client]);

    useEffect(() => { fetchURLs(true); }, [statusFilter]);

    return {
        urls,
        loading,
        error,
        statusFilter,
        setStatusFilter,
        nextToken,
        fetchURLs,
        modifyURLStatus,
        bulkModifyURLStatuses,
        fetchUpdateCandidates,
        hasMore: !!nextToken
    };
};

// ===================================================================
// useScraperMetrics
// ===================================================================
export const useScraperMetrics = (timeRange: TimeRange = TimeRange.LAST_24_HOURS) => {
    const client = useMemo(() => generateClient(), []);
    const [metrics, setMetrics] = useState<ScraperMetrics | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMetrics = useCallback(async (range?: TimeRange) => {
        try {
            setLoading(true);
            setError(null);
            const response = await client.graphql({
                query: getScraperMetrics,
                variables: { timeRange: range || timeRange }
            });
            if (!hasGraphQLData<any>(response)) throw new Error('Invalid response');
            const metricsData = castToType<ScraperMetrics>(response.data?.getScraperMetrics);
            setMetrics(metricsData);
            return metricsData;
        } catch (err) {
            console.error('Error fetching metrics:', err);
            setError('Failed to fetch scraper metrics');
            return null;
        } finally {
            setLoading(false);
        }
    }, [client, timeRange]);

    useEffect(() => { fetchMetrics(); }, [timeRange]);

    return { metrics, loading, error, fetchMetrics, refresh: () => fetchMetrics() };
};

// ===================================================================
// useJobDetails
// FIXED: Uses minimal query to avoid nested entity null errors
// ===================================================================
export const useJobDetails = (jobId: string | null) => {
    const client = useMemo(() => generateClient(), []);
    const [job, setJob] = useState<ScraperJob | null>(null);
    const [attempts, setAttempts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchJobDetails = useCallback(async () => {
        if (!jobId) return;
        try {
            setLoading(true);
            setError(null);
            
            // FIXED: Use minimal query
            const jobResponse = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReportMinimal,
                variables: { limit: 1 } // Note: This is inefficient, needs a getScraperJob query
            });
            if (!hasGraphQLData<any>(jobResponse)) throw new Error('Invalid response');
            const foundJob = jobResponse.data?.getScraperJobsReport?.items?.find((j: any) => j.jobId === jobId);
            if (foundJob) setJob(castToType<ScraperJob>(foundJob));

            const attemptsResponse = await client.graphql({
                query: scraperManagementQueries.listScrapeAttemptsByJob,
                variables: { scraperJobId: jobId, limit: 50 }
            });
            if (!hasGraphQLData<any>(attemptsResponse)) throw new Error('Invalid response');
            setAttempts(attemptsResponse.data?.scrapeAttemptsByScraperJobIdAndAttemptTime?.items || []);
        } catch (err) {
            console.error('Error fetching job details:', err);
            setError('Failed to fetch job details');
        } finally {
            setLoading(false);
        }
    }, [client, jobId]);

    useEffect(() => {
        if (!jobId) return;
        fetchJobDetails();
        const subscription = client.graphql({
            query: onScraperJobUpdate,
            variables: { jobId }
        });
        const sub = (subscription as any).subscribe({
            next: ({ data }: any) => {
                const updatedJob = castToType<ScraperJob>(data?.onScraperJobUpdate);
                if (updatedJob) setJob(prev => prev ? { ...prev, ...updatedJob } : updatedJob);
            },
            error: (err: any) => console.error('Subscription error:', err)
        });
        return () => sub.unsubscribe();
    }, [client, jobId, fetchJobDetails]);

    return { job, attempts, loading, error, refresh: fetchJobDetails };
};

// ===================================================================
// useURLHistory - Get history for a specific URL (RESTORED)
// ===================================================================
export const useURLHistory = (url: string | null, scrapeURLId: string | null) => {
    const client = useMemo(() => generateClient(), []);
    const [urlData, setUrlData] = useState<ScrapeURL | null>(null);
    const [attempts, setAttempts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchURLHistory = useCallback(async () => {
        if (!url || !scrapeURLId) {
            setUrlData(null);
            setAttempts([]);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // 1. Get the ScrapeURL item itself
            const urlResponse = await client.graphql({
                query: getScrapeURL,
                variables: { id: scrapeURLId } // Use the UUID (id)
            });

            if (!hasGraphQLData<any>(urlResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const scrapeURLData = urlResponse.data?.getScrapeURL;
            setUrlData(castToType<ScrapeURL>(scrapeURLData));

            // 2. Get attempts for this URL using its UUID (scrapeURLId)
            const attemptsResponse = await client.graphql({
                query: scraperManagementQueries.listScrapeAttemptsByURL,
                variables: { 
                    scrapeURLId: scrapeURLId,
                    limit: 50 
                }
            });

            if (!hasGraphQLData<any>(attemptsResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const attemptsData = attemptsResponse.data?.scrapeAttemptsByScrapeURLIdAndAttemptTime;
            setAttempts(attemptsData?.items || []);
        } catch (err) {
            console.error('Error fetching URL history:', err);
            setError('Failed to fetch URL history');
        } finally {
            setLoading(false);
        }
    }, [client, url, scrapeURLId]);

    useEffect(() => {
        fetchURLHistory();
    }, [fetchURLHistory]);

    return {
        urlData,
        attempts,
        loading,
        error,
        refresh: fetchURLHistory
    };
};