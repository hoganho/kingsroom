// src/pages/scraper-admin-tabs/AnalyticsTab.tsx
// Analytics Tab - UPDATED with graceful error handling

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    Activity, AlertTriangle,
    Clock, XCircle, BarChart,
    Eye, RefreshCw, Download, Info
} from 'lucide-react';
import {
    analyzeScraperPerformance,
    ErrorAnalyzer,
    ScraperAnalytics
} from '../../utils/scraperAnalytics';
import { 
    getScraperJobsReport,
    searchScrapeURLs 
} from '../../graphql/queries';
import type { ScraperJob, ScrapeURL } from '../../API';

// ===================================================================
// Analytics Tab Component
// ===================================================================

export const AnalyticsTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
    const [backendUnavailable, setBackendUnavailable] = useState(false);
    
    // Metrics Data
    const [systemMetrics, setSystemMetrics] = useState<any>(null);
    const [performanceData, setPerformanceData] = useState<any[]>([]);
    const [issuesList, setIssuesList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    
    // ===================================================================
    // Load Analytics Data
    // ===================================================================
    
    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        
        try {
            let jobs: ScraperJob[] = [];
            let problematicUrls: ScrapeURL[] = [];
            
            // Load recent jobs for analysis
            try {
                const jobsResponse = await client.graphql({
                    query: getScraperJobsReport,
                    variables: { limit: 100 }
                }) as any;
                
                if (jobsResponse.data?.getScraperJobsReport?.items) {
                    jobs = jobsResponse.data.getScraperJobsReport.items;
                    setBackendUnavailable(false);
                } else if (jobsResponse.errors?.length) {
                    const isLambdaError = jobsResponse.errors.some((e: any) => 
                        e.errorType?.includes('Lambda') || e.message?.includes('Lambda')
                    );
                    if (isLambdaError) {
                        setBackendUnavailable(true);
                    }
                    console.warn('Jobs query errors:', jobsResponse.errors);
                }
            } catch (jobsError: any) {
                console.warn('Could not load jobs:', jobsError);
                if (jobsError?.message?.includes('Lambda')) {
                    setBackendUnavailable(true);
                }
            }
            
            // Load problematic URLs
            try {
                const urlsResponse = await client.graphql({
                    query: searchScrapeURLs,
                    variables: { limit: 100 }
                }) as any;
                
                if (urlsResponse.data?.searchScrapeURLs?.items) {
                    problematicUrls = urlsResponse.data.searchScrapeURLs.items;
                }
            } catch (urlsError) {
                console.warn('Could not load URLs:', urlsError);
            }
            
            // If we have any data, analyze it
            if (jobs.length > 0 || problematicUrls.length > 0) {
                // Analyze the data
                const analysis = analyzeScraperPerformance(jobs, problematicUrls);
                
                // Calculate simple metrics
                const metrics = {
                    totalJobs: jobs.length,
                    failureRate: jobs.length > 0 ? ErrorAnalyzer.generateErrorReport(jobs).errorRate : 0,
                    activeURLs: problematicUrls.filter((u: ScrapeURL) => u.status === 'ACTIVE').length,
                    successRate: analysis.trends.successRateTrend,
                    averageProcessingTime: jobs.length > 0 ? jobs.reduce((acc: number, j: ScraperJob) => acc + (j.averageScrapingTime || 0), 0) / jobs.length : 0,
                    peakHour: jobs.length > 0 ? ScraperAnalytics.identifyPeakTimes(jobs).peakHour : 'N/A',
                };
                
                setSystemMetrics(metrics);
                
                // Get performance trends
                const trends = analysis.trends;
                const performance = [
                    { label: 'Job Volume Trend', value: trends.volumeTrend, trend: 'stable', change: 0 },
                    { label: 'Success Rate Trend', value: trends.successRateTrend, trend: 'stable', change: 0 },
                    { label: 'Performance Trend', value: trends.performanceTrend, trend: 'stable', change: 0 },
                ];
                setPerformanceData(performance);
                
                // Identify issues
                const issues = Object.entries(analysis.urlHealth.recommendations).map(([url, recs]) => ({
                    title: `Issue with ${url.substring(0, 50)}...`,
                    description: (recs as string[]).join(', '),
                    severity: 'medium',
                    affectedURLs: 1,
                }));
                setIssuesList(issues);
                
                // Generate recommendations
                const recs = [
                    ...analysis.jobMetrics.recommendations,
                    ...analysis.errorAnalysis.recommendations,
                ];
                // Get unique recommendations
                setRecommendations([...new Set(recs)]);
            } else {
                // No data available
                setSystemMetrics({
                    totalJobs: 0,
                    failureRate: 0,
                    activeURLs: 0,
                    successRate: 'N/A',
                    averageProcessingTime: 0,
                    peakHour: 'N/A',
                });
                setPerformanceData([]);
                setIssuesList([]);
                setRecommendations([]);
            }
            
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setLoading(false);
        }
    }, [client]);
    
    // ===================================================================
    // Refresh Analytics
    // ===================================================================
    
    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAnalytics();
        setRefreshing(false);
    };
    
    // ===================================================================
    // Export Analytics Report
    // ===================================================================
    
    const exportReport = () => {
        const report = {
            generatedAt: new Date().toISOString(),
            timeRange,
            metrics: systemMetrics,
            performance: performanceData,
            issues: issuesList,
            recommendations
        };
        
        // Create downloadable JSON
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scraper-analytics-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    // ===================================================================
    // Load data on mount
    // ===================================================================
    
    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);
    
    // ===================================================================
    // Render
    // ===================================================================
    
    if (loading && !systemMetrics) {
        return (
            <div className="bg-white rounded-lg shadow p-8">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading analytics...</span>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            {/* Header with Controls */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-semibold">Scraper Analytics</h2>
                        <p className="text-sm text-gray-500">Performance insights and recommendations</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={exportReport}
                            disabled={!systemMetrics}
                            className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            Export
                        </button>
                    </div>
                </div>
                
                {/* Backend Unavailable Warning */}
                {backendUnavailable && (
                    <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-yellow-800 font-medium">Limited Data Available</p>
                            <p className="text-xs text-yellow-700">
                                The scraperManagement Lambda may not be deployed. Analytics are based on available local data.
                            </p>
                        </div>
                    </div>
                )}
                
                {/* Time Range Filter */}
                <div className="flex gap-2">
                    {(['1h', '24h', '7d', '30d'] as const).map((range) => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 rounded ${
                                timeRange === range
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {range === '1h' ? 'Last Hour' :
                             range === '24h' ? 'Last 24 Hours' :
                             range === '7d' ? 'Last 7 Days' :
                             'Last 30 Days'}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Total Jobs */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total Jobs</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.totalJobs ?? '-'}
                            </p>
                        </div>
                        <Activity className="h-8 w-8 text-blue-500" />
                    </div>
                </div>
                
                {/* Average Processing Time */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Avg Processing Time</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.averageProcessingTime?.toFixed(2) ?? '-'}s
                            </p>
                        </div>
                        <Clock className="h-8 w-8 text-indigo-500" />
                    </div>
                </div>
                
                {/* Failure Rate */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Failure Rate</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.failureRate?.toFixed(1) ?? '-'}%
                            </p>
                        </div>
                        <XCircle className="h-8 w-8 text-red-500" />
                    </div>
                </div>
                
                {/* Active URLs */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Problematic Active URLs</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.activeURLs ?? '-'}
                            </p>
                        </div>
                        <Eye className="h-8 w-8 text-purple-500" />
                    </div>
                </div>
                
                {/* Peak Activity Hour */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Peak Hour</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.peakHour ?? 'N/A'}
                            </p>
                        </div>
                        <BarChart className="h-8 w-8 text-orange-500" />
                    </div>
                </div>
            </div>
            
            {/* Performance Trends */}
            {performanceData.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Performance Trends</h3>
                    <div className="space-y-3">
                        {performanceData.slice(0, 5).map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center py-2 border-b">
                                <span className="text-sm text-gray-600">{item.label}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium">{item.value}</span>
                                    {item.trend && (
                                        <span className={`text-xs ${
                                            item.value === 'INCREASING' ? 'text-green-600' :
                                            item.value === 'DECREASING' ? 'text-red-600' :
                                            'text-gray-500'
                                        }`}>
                                            {item.value === 'INCREASING' ? '↑' : 
                                             item.value === 'DECREASING' ? '↓' :
                                             '→'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Issues & Alerts */}
            {issuesList.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-sm border border-yellow-200">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        <h3 className="text-lg font-semibold">Active Issues</h3>
                    </div>
                    <div className="space-y-2">
                        {issuesList.map((issue, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 rounded">
                                <div className="mt-1">
                                    <div className={`h-2 w-2 rounded-full ${
                                        issue.severity === 'high' ? 'bg-red-500' :
                                        issue.severity === 'medium' ? 'bg-yellow-500' :
                                        'bg-blue-500'
                                    }`} />
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-sm">{issue.title}</p>
                                    <p className="text-xs text-gray-600 mt-1">{issue.description}</p>
                                    {issue.affectedURLs && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Affects {issue.affectedURLs} URLs
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Recommendations */}
            {recommendations.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
                    <ul className="space-y-2">
                        {recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                                <span className="text-green-600 mt-1">•</span>
                                <span className="text-sm text-gray-700">{rec}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            {/* No Data State */}
            {systemMetrics?.totalJobs === 0 && !backendUnavailable && (
                <div className="bg-gray-50 p-8 rounded-lg border border-gray-200 text-center">
                    <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700">No Analytics Data Yet</h3>
                    <p className="text-sm text-gray-500 mt-2">
                        Start some scraping jobs to generate analytics data.
                    </p>
                </div>
            )}
            
            {/* AWS CloudWatch Note */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">
                        For detailed performance metrics, you can still access the AWS CloudWatch console directly. 
                        Lambda functions continue to log metrics to CloudWatch.
                    </span>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsTab;