// src/pages/scraper-admin-tabs/AnalyticsTab.tsx
// Analytics and Monitoring Tab for CloudWatch metrics and performance analysis

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import {
    Activity, AlertTriangle,
    Clock, CheckCircle, XCircle, BarChart,
    Eye, RefreshCw, Download
} from 'lucide-react';
import { useCloudWatchMetrics } from '../../infrastructure/client-cloudwatch.ts';
import {
    analyzeScraperPerformance,
    ErrorAnalyzer,
    ScraperAnalytics
} from '../../utils/scraperAnalytics.ts';
import { scraperManagementQueries } from '../../graphql/scraperManagement.ts';
import type { ScraperJob, ScrapeURL } from '../../API';

// ===================================================================
// Analytics Tab Component
// ===================================================================

export const AnalyticsTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const { cloudWatch, isInitialized, userMetrics: hookUserMetrics } = useCloudWatchMetrics();
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
    
    // Metrics Data
    const [systemMetrics, setSystemMetrics] = useState<any>(null);
    const [userMetrics, setUserMetrics] = useState<any>(null);
    const [performanceData, setPerformanceData] = useState<any[]>([]);
    const [issuesList, setIssuesList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    
    // ===================================================================
    // Load Analytics Data
    // ===================================================================
    
    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        cloudWatch.trackPageView('AnalyticsTab');
        
        try {
            // Load recent jobs for analysis
            const jobsResponse = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReport,
                variables: {
                    limit: 100,
                    sortDirection: 'DESC'
                }
            });
            
            const jobs = (jobsResponse as GraphQLResult<any>).data.getScraperJobsReport.items;
            
            // Load problematic URLs
            const urlsResponse = await client.graphql({
                query: scraperManagementQueries.searchScrapeURLs,
                variables: {
                    filter: {
                        status: { eq: 'ERROR' }
                    },
                    limit: 50
                }
            });
            
            const problematicUrls = (urlsResponse as GraphQLResult<any>).data.searchScrapeURLs?.items || [];
            
            // This replaces the 'new ScraperAnalytics()' and subsequent broken method calls
            const analysis = analyzeScraperPerformance(jobs, problematicUrls);
            
            // --- Populate state from the analysis object ---
            
            // Calculate simple metrics
            const metrics = {
                totalJobs: jobs.length,
                // Use ErrorAnalyzer directly for failure rate
                failureRate: ErrorAnalyzer.generateErrorReport(jobs).errorRate,
                // Use URLHealthChecker for active URL count (from problematic ones)
                activeURLs: problematicUrls.filter((u: ScrapeURL) => u.status === 'ACTIVE').length,
                // Get metrics from the trend analysis
                successRate: analysis.trends.successRateTrend, // Note: This is a trend, not a snapshot
                averageProcessingTime: jobs.length > 0 ? jobs.reduce((acc: number, j: ScraperJob) => acc + (j.averageScrapingTime || 0), 0) / jobs.length : 0,
                peakHour: ScraperAnalytics.identifyPeakTimes(jobs).peakHour,
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
                description: recs.join(', '),
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
            
            // Load user metrics if available
            if (hookUserMetrics) {
                setUserMetrics(hookUserMetrics);
            }
            
            // Track analytics view
            cloudWatch.trackFeatureUsage('analytics_dashboard', 'view', {
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Failed to load analytics:', error);
            cloudWatch.trackError(error as Error, 'API');
        } finally {
            setLoading(false);
        }
    }, [client, cloudWatch, hookUserMetrics]);
    
    // ===================================================================
    // Refresh Analytics
    // ===================================================================
    
    const handleRefresh = async () => {
        setRefreshing(true);
        cloudWatch.trackUserAction('refresh_analytics', 'analytics');
        await loadAnalytics();
        setRefreshing(false);
    };
    
    // ===================================================================
    // Export Analytics Report
    // ===================================================================
    
    const exportReport = () => {
        cloudWatch.trackUserAction('export_analytics', 'analytics');
        
        const report = {
            generatedAt: new Date().toISOString(),
            timeRange,
            metrics: systemMetrics,
            performance: performanceData,
            issues: issuesList,
            recommendations,
            userActivity: userMetrics
        };
        
        // Create downloadable JSON
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    
    // ===================================================================
    // Effects
    // ===================================================================
    
    useEffect(() => {
        // Wait for the cloudWatch service to be initialized before loading
        if (isInitialized) {
            loadAnalytics();
        }
    }, [loadAnalytics, timeRange, isInitialized]);

    // ===================================================================
    // Render
    // ===================================================================
    
    if (loading && !systemMetrics) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading analytics...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            {/* Header with Controls */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">System Analytics</h2>
                
                <div className="flex gap-3">
                    {/* Time Range Selector */}
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as any)}
                        className="px-3 py-2 border rounded-lg"
                    >
                        <option value="1h">Last Hour</option>
                        <option value="24h">Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                    </select>
                    
                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    
                    {/* Export Button */}
                    <button
                        onClick={exportReport}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                        <Download className="h-4 w-4" />
                        Export
                    </button>
                </div>
            </div>
            
            {/* System Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Total Jobs */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Total Jobs</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.totalJobs || 0}
                            </p>
                        </div>
                        <Activity className="h-8 w-8 text-blue-500" />
                    </div>
                </div>
                
                {/* Success Rate */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Success Rate Trend</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.successRate || 'N/A'}
                            </p>
                        </div>
                        <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                </div>
                
                {/* Average Processing Time */}
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-600">Avg Processing Time</p>
                            <p className="text-2xl font-bold">
                                {systemMetrics?.averageProcessingTime?.toFixed(2) || 0}s
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
                                {systemMetrics?.failureRate?.toFixed(1) || 0}%
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
                                {systemMetrics?.activeURLs || 0}
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
            
            {/* User Activity (if available) */}
            {userMetrics && (
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-lg font-semibold mb-4">Your Activity</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {userMetrics.topActions?.map((action: any, idx: number) => (
                            <div key={idx} className="text-center">
                                <p className="text-2xl font-bold">{action.count}</p>
                                <p className="text-xs text-gray-600">{action.action}</p>
                            </div>
                        ))}
                    </div>
                    {userMetrics.sessionCount && (
                        <div className="mt-4 pt-4 border-t text-center text-sm text-gray-600">
                            {userMetrics.sessionCount} sessions • 
                            Avg duration: {Math.round(userMetrics.averageSessionDuration / 60000)} min
                        </div>
                    )}
                </div>
            )}
            
            {/* CloudWatch Integration Status */}
            <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-900">
                        CloudWatch metrics are being collected. View detailed metrics in AWS CloudWatch console.
                    </span>
                </div>
                {cloudWatch.getSessionSummary && (
                    <div className="mt-2 text-xs text-blue-700">
                        Session: {cloudWatch.getSessionSummary().sessionId} • 
                        Buffered metrics: {cloudWatch.getSessionSummary().metricsBuffered}
                    </div>
                )}
            </div>
        </div>
    );
};