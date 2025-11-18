// src/pages/scraper-admin-tabs/OverviewTab.tsx
// REFACTORED: Added Coverage Info block to the top

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
    RefreshCw, 
    AlertCircle, 
    Activity,
    CheckCircle,
    Database,
    TrendingUp, // <-- NEW: Icon for Coverage Info
} from 'lucide-react';
// Import from auto-generated queries
import { 
    getScraperMetrics,
    getScraperJobsReport 
} from '../../graphql/queries';
// Import TimeRange enum from API types
import { TimeRange, type ScraperJob } from '../../API';
import { MetricCard, JobStatusBadge } from '../../components/scraper/admin/ScraperAdminShared';
// --- NEW: Imports for Coverage Info ---
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';


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

// ===================================================================
// NEW: Coverage Info Component
// ===================================================================
const CoverageInfo: React.FC = () => {
    const { currentEntity } = useEntity();
    const {
      loading: gapLoading,
      scrapingStatus,
      getScrapingStatus,
    } = useGameIdTracking(currentEntity?.id);
  
    useEffect(() => {
      if (currentEntity?.id) {
        loadGapAnalysis();
      }
    }, [currentEntity?.id, getScrapingStatus]); // Added getScrapingStatus to dep array
  
    const loadGapAnalysis = useCallback(async () => {
      if (!currentEntity?.id) return;
      try {
        await getScrapingStatus({ entityId: currentEntity.id });
      } catch (error) {
        console.error('Error loading gap analysis:', error);
      }
    }, [currentEntity?.id, getScrapingStatus]);
  
    if (!currentEntity) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-center">Select an entity to view coverage details.</p>
        </div>
      );
    }

    if (gapLoading && !scrapingStatus) {
        return (
            <div className="bg-white rounded-lg shadow p-6 text-center">
                <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                <p className="text-sm text-gray-500 mt-2">Loading Coverage Info...</p>
            </div>
        );
    }
  
    if (!scrapingStatus) {
      return (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500 text-center">Could not load coverage data for {currentEntity.entityName}.</p>
        </div>
      );
    }
  
    return (
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow p-6 border border-purple-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold flex items-center text-purple-900">
            <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
            {currentEntity.entityName} Coverage
          </h3>
          <button
            onClick={loadGapAnalysis}
            disabled={gapLoading}
            className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50"
          >
            {gapLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white bg-opacity-60 p-3 rounded">
            <p className="text-xs text-gray-600">Total Games</p>
            <p className="text-xl font-bold text-gray-900">{scrapingStatus.totalGamesStored}</p>
          </div>
          <div className="bg-white bg-opacity-60 p-3 rounded">
            <p className="text-xs text-gray-600">Coverage</p>
            <p className="text-xl font-bold text-green-600">{scrapingStatus.gapSummary.coveragePercentage.toFixed(1)}%</p>
          </div>
          <div className="bg-white bg-opacity-60 p-3 rounded">
            <p className="text-xs text-gray-600">Missing</p>
            <p className="text-xl font-bold text-orange-600">{scrapingStatus.gapSummary.totalMissingIds}</p>
          </div>
          <div className="bg-white bg-opacity-60 p-3 rounded">
            <p className="text-xs text-gray-600">Gaps</p>
            <p className="text-xl font-bold text-purple-600">{scrapingStatus.gapSummary.totalGaps}</p>
          </div>
        </div>
        
        {scrapingStatus.gaps && scrapingStatus.gaps.length > 0 && (
          <p className="text-xs text-purple-700 mt-3">
            💡 Go to the **Scrape** tab to fill {scrapingStatus.gapSummary.totalGaps} detected gap(s).
          </p>
        )}
      </div>
    );
};

// ===================================================================
// MAIN OVERVIEW TAB
// ===================================================================

export const OverviewTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [metrics, setMetrics] = useState<ScraperMetrics | null>(null);
    const [recentJobs, setRecentJobs] = useState<ScraperJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMetrics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Load metrics
            const metricsResponse = await client.graphql({
                query: getScraperMetrics,
                variables: { timeRange: TimeRange.LAST_24_HOURS }
            }) as any;
            
            if (metricsResponse.errors) {
                console.error('GraphQL error loading metrics:', metricsResponse.errors);
                throw new Error(metricsResponse.errors[0].message);
            }
            
            if (metricsResponse.data?.getScraperMetrics) {
                setMetrics(metricsResponse.data.getScraperMetrics);
            }

            // Load recent jobs
            const jobsResponse = await client.graphql({
                query: getScraperJobsReport,
                variables: { limit: 5 }
            }) as any;
            
            if (jobsResponse.errors) {
                console.error('GraphQL error loading jobs:', jobsResponse.errors);
                throw new Error(jobsResponse.errors[0].message);
            }
            
            if (jobsResponse.data?.getScraperJobsReport) {
                setRecentJobs(jobsResponse.data.getScraperJobsReport.items || []);
            }
        } catch (error: any) {
            console.error('Error loading metrics:', error);
            setError(error.message || 'An unknown error occurred while loading metrics.');
        } finally {
            setLoading(false);
        }
    }, [client]);

    useEffect(() => {
        loadMetrics();
        const interval = setInterval(loadMetrics, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [loadMetrics]);

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
            {/* --- 1. COVERAGE INFO (Moved from old tabs) --- */}
            <CoverageInfo />

            {/* --- 2. Metrics Cards --- */}
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

            {/* --- 3. Recent Jobs Table --- */}
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
                    {recentJobs.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No recent jobs found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};