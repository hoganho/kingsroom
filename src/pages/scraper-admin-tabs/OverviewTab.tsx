// src/pages/scraper-admin-tabs/OverviewTab.tsx

// ✅ FIX 1: Import useMemo and useCallback
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
    RefreshCw, 
    AlertCircle, 
    Activity,
    CheckCircle,
    Database
} from 'lucide-react';
import { scraperManagementQueries } from '../../graphql/scraperManagement'; // Removed .ts
import type { ScraperJob } from '../../API.ts';
import { MetricCard, JobStatusBadge } from '../../components/scraper/admin/ScraperAdminShared'; // Removed .tsx

// Define ScraperMetrics if not in API types
interface ScraperMetrics {
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    averageJobDuration: number;
    totalURLsScraped: number;
    successRate: number;
    topErrors?: Array<{
        errorType: string;
        count: number;
        urls: string[];
    }>;
    hourlyActivity?: Array<{
        hour: string;
        jobCount: number;
        urlsScraped: number;
        successRate: number;
    }>;
}

// ❌ FIX 2: Remove the top-level client
// const client = generateClient();

export const OverviewTab: React.FC = () => {
    // ✅ FIX 3: Generate the client *inside* the component and memoize it.
    const client = useMemo(() => generateClient(), []);

    const [metrics, setMetrics] = useState<ScraperMetrics | null>(null);
    const [recentJobs, setRecentJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ✅ FIX 4: Wrap in useCallback and add 'client' as a dependency
    const loadMetrics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            
            const metricsResponse = await client.graphql({
                query: scraperManagementQueries.getScraperMetrics,
                variables: { timeRange: 'LAST_24_HOURS' }
            }) as any;
            
            if (metricsResponse.errors) {
                console.error('GraphQL error loading metrics:', metricsResponse.errors);
                throw new Error(metricsResponse.errors[0].message);
            }
            
            if (metricsResponse.data) {
                setMetrics(metricsResponse.data.getScraperMetrics);
            }

            const jobsResponse = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReport,
                variables: { limit: 5 }
            }) as any;
            
            if (jobsResponse.errors) {
                 console.error('GraphQL error loading jobs:', jobsResponse.errors);
                 throw new Error(jobsResponse.errors[0].message);
            }
            
            if (jobsResponse.data) {
                setRecentJobs(jobsResponse.data.getScraperJobsReport.items);
            }
        } catch (error: any) {
            console.error('Error loading metrics:', error);
            setError(error.message || 'An unknown error occurred while loading metrics.');
        } finally {
            setLoading(false);
        }
    }, [client]); // <-- Dependency added

    useEffect(() => {
        loadMetrics();
        const interval = setInterval(loadMetrics, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [loadMetrics]); // ✅ FIX 5: Add loadMetrics dependency

    if (loading && !metrics && !error) {
        return (
            <div className="flex justify-center items-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center">
                 <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-800">Failed to Load Overview</h3>
                <p className="text-sm text-red-700 mt-2 mb-4">
                    The backend function may be missing or misconfigured.
                </p>
                <p className="text-xs text-red-600 bg-red-100 p-2 rounded font-mono">
                    {error}
                </p>
                <button
                    onClick={loadMetrics}
                    className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Jobs (24h)"
                    value={metrics?.totalJobs || 0}
                    icon={<Activity className="h-5 w-5" />}
                    color="blue"
                />
                <MetricCard
                    title="Success Rate"
                    value={`${Math.round(metrics?.successRate || 0)}%`}
                    icon={<CheckCircle className="h-5 w-5" />}
                    color="green"
                />
                <MetricCard
                    title="URLs Scraped"
                    value={metrics?.totalURLsScraped || 0}
                    icon={<Database className="h-5 w-5" />}
                    color="purple"
                />
                <MetricCard
                    title="Failed Jobs"
                    value={metrics?.failedJobs || 0}
                    icon={<AlertCircle className="h-5 w-5" />}
                    color="red"
                />
            </div>

            {/* Recent Jobs Table */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold">Recent Jobs</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Job ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Trigger
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    URLs
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Success Rate
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Time
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {recentJobs.map((job) => (
                                <tr key={job.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {job.jobId?.slice(0, 8)}...
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <JobStatusBadge status={job.status} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {job.triggerSource}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {job.totalURLsProcessed || 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(job.successRate || 0)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(job.startTime).toLocaleTimeString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};