// src/hooks/useScraperManagement.ts
// React hooks for enhanced scraper management
// Updated with proper type checking and null/undefined handling

import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { scraperManagementQueries } from '../graphql/scraperManagement';
import { 
    getScraperJobsReport,
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
// This handles cases where nested relationships might have incomplete data
function castToType<T>(data: any): T | null {
    if (!data) return null;
    // Force cast - we know the shape is close enough for our usage
    return data as unknown as T;
}

// ===================================================================
// useScraperJobs - Manage scraper jobs
// ===================================================================
export const useScraperJobs = (initialStatus?: ScraperJobStatus) => {
    const client = useMemo(() => generateClient(), []);
    const [jobs, setJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScraperJobStatus | undefined>(initialStatus);
    const [nextToken, setNextToken] = useState<string | null>(null);

    // Fetch jobs using renamed Lambda query
    const fetchJobs = useCallback(async (reset = false) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: getScraperJobsReport,
                variables: {
                    status: statusFilter,
                    limit: 20,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            // Add null checking for nested properties
            const jobsReport = response.data?.getScraperJobsReport;
            if (!jobsReport) {
                console.warn('No jobs report data received');
                return;
            }

            const newJobs = jobsReport.items || [];
            
            if (reset) {
                setJobs(newJobs.map(job => castToType<ScraperJob>(job)!).filter(Boolean));
            } else {
                setJobs(prev => [...prev, ...newJobs.map(job => castToType<ScraperJob>(job)!).filter(Boolean)]);
            }
            
            setNextToken(jobsReport.nextToken || null);
        } catch (err) {
            console.error('Error fetching jobs:', err);
            setError('Failed to fetch scraper jobs');
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter, nextToken]);

    // Start a new job
    const startJob = useCallback(async (input: StartScraperJobInput) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: startScraperJob,
                variables: { input }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const newJob = response.data.startScraperJob;
            // Update jobs list with castToType helper
            const typedJob = castToType<ScraperJob>(newJob);
            if (typedJob) {
                setJobs(prev => [typedJob, ...prev]);
            }
            
            return typedJob;
        } catch (err) {
            console.error('Error starting job:', err);
            setError('Failed to start scraper job');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Cancel a job
    const cancelJob = useCallback(async (jobId: string) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: cancelScraperJob,
                variables: { jobId }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const cancelledJob = response.data.cancelScraperJob;
            
            // Update job in list with castToType helper
            const typedJob = castToType<ScraperJob>(cancelledJob);
            if (typedJob) {
                setJobs(prev => prev.map(job =>
                    job.jobId === jobId ? { ...job, ...typedJob } : job
                ));
            }
            
            return typedJob;
        } catch (err) {
            console.error('Error cancelling job:', err);
            setError('Failed to cancel scraper job');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Subscribe to job updates
    useEffect(() => {
        const subscription = client.graphql({
            query: onScraperJobUpdate
        });

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

    // Initial fetch
    useEffect(() => {
        fetchJobs(true);
    }, [statusFilter]); // Note: removed fetchJobs from deps to prevent infinite loop

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
// useScrapeURLs - Manage scrape URLs
// ===================================================================
export const useScrapeURLs = (initialStatus?: ScrapeURLStatus) => {
    const client = useMemo(() => generateClient(), []);
    const [urls, setUrls] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScrapeURLStatus | undefined>(initialStatus);
    const [nextToken, setNextToken] = useState<string | null>(null);

    // Fetch URLs
    const fetchURLs = useCallback(async (reset = false) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: searchScrapeURLs,
                variables: {
                    status: statusFilter,
                    limit: 20,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            // Add null checking for nested properties
            const urlsData = response.data?.searchScrapeURLs;
            if (!urlsData) {
                console.warn('No URLs data received');
                return;
            }

            const newURLs = urlsData.items || [];
            
            if (reset) {
                setUrls(newURLs.map(url => castToType<ScrapeURL>(url)!).filter(Boolean));
            } else {
                setUrls(prev => [...prev, ...newURLs.map(url => castToType<ScrapeURL>(url)!).filter(Boolean)]);
            }
            
            setNextToken(urlsData.nextToken || null);
        } catch (err) {
            console.error('Error fetching URLs:', err);
            setError('Failed to fetch scrape URLs');
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter, nextToken]);

    // Modify URL status
    const modifyURLStatus = useCallback(async (
        url: string, 
        status?: ScrapeURLStatus, 
        doNotScrape?: boolean
    ) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: modifyScrapeURLStatus,
                variables: { url, status, doNotScrape }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const updatedURL = response.data.modifyScrapeURLStatus;
            
            // Update URL in list with castToType helper
            const typedURL = castToType<ScrapeURL>(updatedURL);
            if (typedURL) {
                setUrls(prev => prev.map(u =>
                    u.url === url ? { ...u, ...typedURL } : u
                ));
            }
            
            return typedURL;
        } catch (err) {
            console.error('Error modifying URL status:', err);
            setError('Failed to modify URL status');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Bulk modify URLs
    const bulkModifyURLStatuses = useCallback(async (
        urlList: string[], 
        status?: ScrapeURLStatus, 
        doNotScrape?: boolean
    ) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: bulkModifyScrapeURLs,
                variables: { urls: urlList, status, doNotScrape }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const updatedURLs = response.data.bulkModifyScrapeURLs || [];
            
            // Create map for efficient updates with castToType helper
            const typedURLs = updatedURLs.map(u => castToType<ScrapeURL>(u)!).filter(Boolean);
            const urlMap = new Map(typedURLs.map(u => [u.url, u]));
            
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

    // Fetch update candidates
    const fetchUpdateCandidates = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: getUpdateCandidateURLs,
                variables: { limit: 50 }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const candidates = response.data.getUpdateCandidateURLs || [];
            return candidates;
        } catch (err) {
            console.error('Error fetching update candidates:', err);
            setError('Failed to fetch update candidates');
            return [];
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Initial fetch
    useEffect(() => {
        fetchURLs(true);
    }, [statusFilter]); // Note: removed fetchURLs from deps to prevent infinite loop

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
// useScraperMetrics - Get scraper metrics
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
                variables: { 
                    timeRange: range || timeRange 
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const metricsData = response.data?.getScraperMetrics;
            setMetrics(castToType<ScraperMetrics>(metricsData));
            
            return metricsData;
        } catch (err) {
            console.error('Error fetching metrics:', err);
            setError('Failed to fetch scraper metrics');
            return null;
        } finally {
            setLoading(false);
        }
    }, [client, timeRange]);

    useEffect(() => {
        fetchMetrics();
    }, [timeRange]); // Note: removed fetchMetrics from deps to prevent infinite loop

    return {
        metrics,
        loading,
        error,
        fetchMetrics,
        refresh: () => fetchMetrics()
    };
};

// ===================================================================
// useJobDetails - Get details for a specific job
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

            // Get job using renamed query
            const jobResponse = await client.graphql({
                query: getScraperJobsReport,
                variables: { limit: 1 }
            });

            if (!hasGraphQLData<any>(jobResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const jobsReport = jobResponse.data?.getScraperJobsReport;
            if (!jobsReport || !jobsReport.items) {
                console.warn('No jobs found');
                return;
            }

            const foundJob = jobsReport.items.find((j: any) => j.jobId === jobId);
            
            if (foundJob) {
                setJob(castToType<ScraperJob>(foundJob));
            }

            // Get attempts for this job using corrected query name
            const attemptsResponse = await client.graphql({
                query: scraperManagementQueries.listScrapeAttemptsByJob,
                variables: { 
                    scraperJobId: jobId,
                    limit: 50 
                }
            });

            if (!hasGraphQLData<any>(attemptsResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const attemptsData = attemptsResponse.data?.scrapeAttemptsByScraperJobIdAndAttemptTime;
            setAttempts(attemptsData?.items || []);
        } catch (err) {
            console.error('Error fetching job details:', err);
            setError('Failed to fetch job details');
        } finally {
            setLoading(false);
        }
    }, [client, jobId]);

    // Subscribe to updates
    useEffect(() => {
        if (!jobId) return;

        fetchJobDetails();

        const subscription = client.graphql({
            query: onScraperJobUpdate,
            variables: { jobId }
        });

        // Handle the subscription as an observable
        const sub = (subscription as any).subscribe({
            next: ({ data }: any) => {
                if (data?.onScraperJobUpdate) {
                    const updatedJob = castToType<ScraperJob>(data.onScraperJobUpdate);
                    if (updatedJob) {
                        setJob(prev => prev ? { ...prev, ...updatedJob } : updatedJob);
                    }
                }
            },
            error: (err: any) => console.error('Subscription error:', err)
        });

        return () => sub.unsubscribe();
    }, [client, jobId, fetchJobDetails]);

    return {
        job,
        attempts,
        loading,
        error,
        refresh: fetchJobDetails
    };
};

// ===================================================================
// useURLHistory - Get history for a specific URL
// ===================================================================
export const useURLHistory = (url: string) => {
    const client = useMemo(() => generateClient(), []);
    const [urlData, setUrlData] = useState<ScrapeURL | null>(null);
    const [attempts, setAttempts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchURLHistory = useCallback(async () => {
        if (!url) return;

        try {
            setLoading(true);
            setError(null);

            // Get URL data - note the id parameter is the URL
            const urlResponse = await client.graphql({
                query: getScrapeURL,
                variables: { id: url }  // Use 'id' not 'url'
            });

            if (!hasGraphQLData<any>(urlResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const scrapeURLData = urlResponse.data?.getScrapeURL;
            // Use castToType helper to handle incomplete nested types from GraphQL
            setUrlData(castToType<ScrapeURL>(scrapeURLData));

            // Get attempts for this URL using corrected query name
            const attemptsResponse = await client.graphql({
                query: scraperManagementQueries.listScrapeAttemptsByURL,
                variables: { 
                    scrapeURLId: url,  // The ID is the URL
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
    }, [client, url]);

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