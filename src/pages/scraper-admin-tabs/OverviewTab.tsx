// src/pages/scraper-admin-tabs/OverviewTab.tsx
// OPTIMIZED: Removed 30-second auto-polling to reduce Lambda costs
// Now only refreshes on manual click or when component mounts

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
    RefreshCw, 
    AlertCircle, 
    Activity,
    CheckCircle,
    Database,
    TrendingUp,
    AlertTriangle,
} from 'lucide-react';
// Import from auto-generated queries (except getScraperJobsReport which causes issues)
import { 
    getScraperMetrics,
} from '../../graphql/queries';
// Import minimal query from custom queries
import { scraperManagementQueries } from '../../graphql/scraperManagement';
// Import TimeRange enum from API types
import { TimeRange, type ScraperJob } from '../../API';
import { MetricCard, JobStatusBadge } from '../../components/scraper/shared/StatusBadges';
import { useEntity } from '../../contexts/EntityContext';
import { useGameIdTracking } from '../../hooks/useGameIdTracking';


// ScraperMetrics matches GraphQL ScraperMetrics type
interface ScraperMetrics {
    timeRange: string;
    entityId: string | null;
    totalJobs: number;
    successfulJobs: number;     // GraphQL field name
    failedJobs: number;
    runningJobs: number;
    totalURLsScraped: number;   // GraphQL field name
    totalNewGames: number;
    totalUpdatedGames: number;
    totalErrors: number;
    totalS3Hits: number;
    averageJobDuration: number;
    successRate: number;
    s3CacheRate: number;
}

// ===================================================================
// Coverage Info Component
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
    }, [currentEntity?.id]);
  
    const loadGapAnalysis = useCallback(async () => {
      if (!currentEntity?.id) return;
      try {
        await getScrapingStatus({ entityId: currentEntity.id });
      } catch (error) {
        // Silently handle error - gap analysis is non-critical
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
            💡 Go to the <strong>Scrape</strong> tab to fill {scrapingStatus.gapSummary.totalGaps} detected gap(s).
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
    const [metricsUnavailable, setMetricsUnavailable] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const loadMetrics = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Load metrics - handle errors gracefully
            try {
                const metricsResponse = await client.graphql({
                    query: getScraperMetrics,
                    variables: { timeRange: TimeRange.LAST_24_HOURS }
                }) as any;
                
                if (metricsResponse.data?.getScraperMetrics) {
                    setMetrics(metricsResponse.data.getScraperMetrics);
                    setMetricsUnavailable(false);
                } else if (metricsResponse.errors?.length) {
                    setMetricsUnavailable(true);
                }
            } catch (metricsError: any) {
                setMetricsUnavailable(true);
            }

            // Load recent jobs
            try {
                const jobsResponse = await client.graphql({
                    query: scraperManagementQueries.getScraperJobsReportMinimal,
                    variables: { limit: 5 }
                }) as any;
                
                if (jobsResponse.data?.getScraperJobsReport) {
                    setRecentJobs(jobsResponse.data.getScraperJobsReport.items || []);
                }
            } catch (jobsError) {
                // Jobs query failed - non-critical
            }
            
            setLastRefresh(new Date());
            
        } catch (error: any) {
            setError(error.message || 'An unknown error occurred while loading data.');
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Load once on mount - NO AUTO-POLLING
    useEffect(() => {
        loadMetrics();
        // REMOVED: 30-second polling interval
        // Users can manually refresh with the refresh button
    }, [loadMetrics]);

    if (loading && !metrics && recentJobs.length === 0 && !error) {
        return (
            <div className="flex justify-center items-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* --- 1. COVERAGE INFO --- */}
            <CoverageInfo />
            
            {/* Backend Unavailable Warning */}
            {metricsUnavailable && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-yellow-800 font-medium">Metrics Backend Unavailable</p>
                        <p className="text-xs text-yellow-700 mt-1">
                            The scraperManagement Lambda may not be deployed yet. Deploy the updated Lambda to see metrics.
                        </p>
                    </div>
                </div>
            )}

            {/* --- 2. Metrics Cards --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Jobs (24h)"
                    value={metrics?.totalJobs ?? '-'}
                    icon={<Activity className="h-5 w-5" />}
                    color="blue"
                />
                <MetricCard
                    title="Success Rate"
                    value={metrics ? `${Math.round(metrics.successRate || 0)}%` : '-'}
                    icon={<CheckCircle className="h-5 w-5" />}
                    color="green"
                />
                <MetricCard
                    title="URLs Processed"
                    value={metrics?.totalURLsScraped ?? '-'}
                    icon={<Database className="h-5 w-5" />}
                    color="purple"
                />
                <MetricCard
                    title="Failed Jobs"
                    value={metrics?.failedJobs ?? '-'}
                    icon={<AlertCircle className="h-5 w-5" />}
                    color="red"
                />
            </div>
            
            {/* --- 2b. Additional Metrics Row --- */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 uppercase">New Games</p>
                        <p className="text-2xl font-bold text-green-600">{metrics.totalNewGames}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 uppercase">Updated Games</p>
                        <p className="text-2xl font-bold text-blue-600">{metrics.totalUpdatedGames}</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 uppercase">S3 Cache Rate</p>
                        <p className="text-2xl font-bold text-purple-600">{metrics.s3CacheRate}%</p>
                    </div>
                    <div className="bg-white rounded-lg shadow p-4">
                        <p className="text-xs text-gray-500 uppercase">Avg Duration</p>
                        <p className="text-2xl font-bold text-gray-700">{metrics.averageJobDuration}s</p>
                    </div>
                </div>
            )}

            {/* --- 3. Recent Jobs Table --- */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">Recent Jobs</h3>
                        {lastRefresh && (
                            <span className="text-xs text-gray-400">
                                Updated {lastRefresh.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={loadMetrics}
                        disabled={loading}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 flex items-center gap-2"
                        title="Refresh metrics"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        <span className="text-sm">Refresh</span>
                    </button>
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
                                        {(job.jobId || job.id)?.slice(0, 8)}...
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <JobStatusBadge status={job.status} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {job.triggerSource || 'MANUAL'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {job.totalURLsProcessed || 0}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {Math.round(job.successRate || 0)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {job.startTime ? new Date(job.startTime).toLocaleTimeString() : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {recentJobs.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            {metricsUnavailable 
                                ? 'Deploy the scraperManagement Lambda to see job history.'
                                : 'No recent jobs found. Start a scrape job from the Scrape tab.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OverviewTab;