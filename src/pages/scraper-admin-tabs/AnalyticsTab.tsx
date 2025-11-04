// src/pages/scraper-admin-tabs/AnalyticsTab.tsx
// Analytics Tab - Simplified version without CloudWatch integration

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
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
import { scraperManagementQueries } from '../../graphql/scraperManagement';
import type { ScraperJob, ScrapeURL } from '../../API';

// ===================================================================
// Analytics Tab Component (CloudWatch removed)
// ===================================================================

export const AnalyticsTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
    
    // Metrics Data
    const [systemMetrics, setSystemMetrics] = useState<any>(null);
    const [performanceData, setPerformanceData] = useState<any[]>([]);
    const [issuesList, setIssuesList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<string[]>([]);
    
    // ===================================================================
    // Load Analytics Data (without CloudWatch)
    // ===================================================================
    
    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        
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
            
            // Analyze the data
            const analysis = analyzeScraperPerformance(jobs, problematicUrls);
            
            // Calculate simple metrics
            const metrics = {
                totalJobs: jobs.length,
                failureRate: ErrorAnalyzer.generateErrorReport(jobs).errorRate,
                activeURLs: problematicUrls.filter((u: ScrapeURL) => u.status === 'ACTIVE').length,
                successRate: analysis.trends.successRateTrend,
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
                        <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
                        <p className="text-gray-600 mt-1">Performance metrics from database analysis</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={exportReport}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Download className="h-4 w-4" />
                            Export
                        </button>
                    </div>
                </div>
                
                {/* CloudWatch Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-blue-900">Performance Mode Active</p>
                            <p className="text-sm text-blue-700 mt-1">
                                CloudWatch tracking has been temporarily disabled to improve application performance. 
                                Analytics shown here are based on database queries only.
                            </p>
                        </div>
                    </div>
                </div>
                
                {/* Time Range Selector */}
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
                                {systemMetrics?.totalJobs || 0}
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