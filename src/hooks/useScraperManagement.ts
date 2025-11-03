// src/hooks/useScraperManagement.ts
// React hooks for enhanced scraper management
// Updated to match correct field names from deployed schema

import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
    scraperManagementQueries, 
    scraperManagementMutations,
    scraperManagementSubscriptions 
} from '../graphql/scraperManagement';
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
                query: scraperManagementQueries.getScraperJobsReport,
                variables: {
                    status: statusFilter,
                    limit: 20,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const newJobs = response.data.getScraperJobsReport.items;
            
            if (reset) {
                setJobs(newJobs);
            } else {
                setJobs(prev => [...prev, ...newJobs]);
            }
            
            setNextToken(response.data.getScraperJobsReport.nextToken);
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
                query: scraperManagementMutations.startScraperJob,
                variables: { input }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const newJob = response.data.startScraperJob;
            setJobs(prev => [newJob, ...prev]);
            
            return newJob;
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
                query: scraperManagementMutations.cancelScraperJob,
                variables: { jobId }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const cancelledJob = response.data.cancelScraperJob;
            
            // Update local state
            setJobs(prev => prev.map(job => 
                job.jobId === jobId ? { ...job, ...cancelledJob } : job
            ));
            
            return cancelledJob;
        } catch (err) {
            console.error('Error cancelling job:', err);
            setError('Failed to cancel job');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Subscribe to job updates
    const subscribeToJob = useCallback((jobId: string, onUpdate: (job: ScraperJob) => void) => {
        const subscription = client.graphql({
            query: scraperManagementSubscriptions.onScraperJobUpdate,
            variables: { jobId }
        });

        // Handle the subscription as an observable
        const sub = (subscription as any).subscribe({
            next: ({ data }: any) => {
                if (data && data.onScraperJobUpdate) {
                    const updatedJob = data.onScraperJobUpdate;
                    
                    // Update local state
                    setJobs(prev => prev.map(job => 
                        job.jobId === jobId ? { ...job, ...updatedJob } : job
                    ));
                    
                    onUpdate(updatedJob);
                }
            },
            error: (err: any) => console.error('Subscription error:', err)
        });

        return () => sub.unsubscribe();
    }, [client]);

    // Load initial data
    useEffect(() => {
        fetchJobs(true);
    }, [fetchJobs, statusFilter]);

    return {
        jobs,
        loading,
        error,
        statusFilter,
        setStatusFilter,
        fetchJobs,
        startJob,
        cancelJob,
        subscribeToJob,
        hasMore: !!nextToken,
        loadMore: () => fetchJobs(false)
    };
};

// ===================================================================
// useScrapeURLs - Manage scraped URLs
// ===================================================================
export const useScrapeURLs = (initialStatus?: ScrapeURLStatus) => {
    const client = useMemo(() => generateClient(), []);
    const [urls, setUrls] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<ScrapeURLStatus | undefined>(initialStatus);
    const [nextToken, setNextToken] = useState<string | null>(null);

    // Fetch URLs using renamed Lambda query
    const fetchURLs = useCallback(async (reset = false) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: scraperManagementQueries.searchScrapeURLs,
                variables: {
                    status: statusFilter,
                    limit: 50,
                    nextToken: reset ? null : nextToken
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const newURLs = response.data.searchScrapeURLs.items;
            
            if (reset) {
                setUrls(newURLs);
            } else {
                setUrls(prev => [...prev, ...newURLs]);
            }
            
            setNextToken(response.data.searchScrapeURLs.nextToken);
        } catch (err) {
            console.error('Error fetching URLs:', err);
            setError('Failed to fetch URLs');
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter, nextToken]);

    // Get single URL details using auto-generated query
    const getURL = useCallback(async (url: string) => {
        try {
            // Use auto-generated query - note: id is the URL in our schema
            const response = await client.graphql({
                query: scraperManagementQueries.getScrapeURL,
                variables: { id: url }  // id parameter, not url
            });
            
            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            return response.data.getScrapeURL;
        } catch (err) {
            console.error('Error fetching URL:', err);
            throw err;
        }
    }, [client]);

    // Update single URL using custom Lambda mutation
    const updateURL = useCallback(async (
        url: string, 
        status?: ScrapeURLStatus, 
        doNotScrape?: boolean
    ) => {
        try {
            setLoading(true);
            setError(null);

            // Use custom Lambda mutation for business logic
            const response = await client.graphql({
                query: scraperManagementMutations.modifyScrapeURLStatus,
                variables: { url, status, doNotScrape }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const updatedURL = response.data.modifyScrapeURLStatus;
            
            // Update local state
            setUrls(prev => prev.map(u => 
                u.url === url ? { ...u, ...updatedURL } : u
            ));
            
            return updatedURL;
        } catch (err) {
            console.error('Error updating URL:', err);
            setError('Failed to update URL');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Bulk update URLs using custom Lambda mutation
    const bulkUpdateURLs = useCallback(async (
        urls: string[], 
        status?: ScrapeURLStatus, 
        doNotScrape?: boolean
    ) => {
        try {
            setLoading(true);
            setError(null);

            const response = await client.graphql({
                query: scraperManagementMutations.bulkModifyScrapeURLs,
                variables: { urls, status, doNotScrape }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            const updatedURLs = response.data.bulkModifyScrapeURLs;
            
            // Update local state
            const urlMap = new Map(updatedURLs.map((u: ScrapeURL) => [u.url, u]));
            setUrls(prev => prev.map(u => {
                const updated = urlMap.get(u.url);
                return updated ? { ...u, ...updated } : u;
            }));
            
            return updatedURLs;
        } catch (err) {
            console.error('Error bulk updating URLs:', err);
            setError('Failed to bulk update URLs');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Get update candidates
    const getUpdateCandidates = useCallback(async (limit = 10) => {
        try {
            const response = await client.graphql({
                query: scraperManagementQueries.getUpdateCandidateURLs,
                variables: { limit }
            });
            
            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            return response.data.getUpdateCandidateURLs;
        } catch (err) {
            console.error('Error fetching update candidates:', err);
            throw err;
        }
    }, [client]);

    // Load initial data
    useEffect(() => {
        fetchURLs(true);
    }, [fetchURLs, statusFilter]);

    return {
        urls,
        loading,
        error,
        statusFilter,
        setStatusFilter,
        fetchURLs,
        getURL,
        updateURL,
        bulkUpdateURLs,
        getUpdateCandidates,
        hasMore: !!nextToken,
        loadMore: () => fetchURLs(false)
    };
};

// ===================================================================
// useScraperMetrics - Get system metrics
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
                query: scraperManagementQueries.getScraperMetrics,
                variables: { 
                    timeRange: range || timeRange 
                }
            });

            if (!hasGraphQLData<any>(response)) {
                throw new Error('Invalid response from GraphQL');
            }

            setMetrics(response.data.getScraperMetrics);
        } catch (err) {
            console.error('Error fetching metrics:', err);
            setError('Failed to fetch metrics');
        } finally {
            setLoading(false);
        }
    }, [client, timeRange]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    // Auto-refresh metrics every 5 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            fetchMetrics();
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [fetchMetrics]);

    return {
        metrics,
        loading,
        error,
        refresh: () => fetchMetrics()
    };
};

// ===================================================================
// useScraperJobMonitor - Monitor a specific job
// ===================================================================
export const useScraperJobMonitor = (jobId: string) => {
    const client = useMemo(() => generateClient(), []);
    const [job, setJob] = useState<ScraperJob | null>(null);
    const [attempts, setAttempts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch job details
    const fetchJobDetails = useCallback(async () => {
        if (!jobId) return;

        try {
            setLoading(true);
            setError(null);

            // Get job using renamed query
            const jobResponse = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReport,
                variables: { limit: 1 }
            });

            if (!hasGraphQLData<any>(jobResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            const foundJob = jobResponse.data.getScraperJobsReport.items
                .find((j: ScraperJob) => j.jobId === jobId);
            
            if (foundJob) {
                setJob(foundJob);
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

            // Note: The actual query name includes "Id" in the index name
            setAttempts(attemptsResponse.data.scrapeAttemptsByScraperJobIdAndAttemptTime.items);
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
            query: scraperManagementSubscriptions.onScraperJobUpdate,
            variables: { jobId }
        });

        // Handle the subscription as an observable
        const sub = (subscription as any).subscribe({
            next: ({ data }: any) => {
                if (data && data.onScraperJobUpdate) {
                    const updatedJob = data.onScraperJobUpdate;
                    setJob(prev => prev ? { ...prev, ...updatedJob } : updatedJob);
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
                query: scraperManagementQueries.getScrapeURL,
                variables: { id: url }  // Use 'id' not 'url'
            });

            if (!hasGraphQLData<any>(urlResponse)) {
                throw new Error('Invalid response from GraphQL');
            }

            setUrlData(urlResponse.data.getScrapeURL);

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

            // Note: The actual query name includes "Id" in the index name
            setAttempts(attemptsResponse.data.scrapeAttemptsByScrapeURLIdAndAttemptTime.items);
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

// ===================================================================
// Export all hooks
// ===================================================================
export default {
    useScraperJobs,
    useScrapeURLs,
    useScraperMetrics,
    useScraperJobMonitor,
    useURLHistory
};