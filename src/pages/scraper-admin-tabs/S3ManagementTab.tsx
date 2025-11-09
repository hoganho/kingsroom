// src/pages/scraper-admin-tabs/S3ManagementTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    HardDrive,
    Download,
    Eye,
    Trash2,
    Database,
    TrendingUp,
    Clock,
    Activity
} from 'lucide-react';
// Import S3 queries from auto-generated queries
import { 
    listS3Storages,
    getS3StorageHistory,
    viewS3Content,
    getCachingStats
} from '../../graphql/queries';
// Import mutations from auto-generated files
import {
    deleteS3Storage
} from '../../graphql/mutations';
// Import TimeRange enum
import { TimeRange, type S3Storage } from '../../API';

interface CachingStats {
    totalURLs: number;
    urlsWithETags: number;
    urlsWithLastModified: number;
    totalCacheHits: number;
    totalCacheMisses: number;
    averageCacheHitRate: number;
    storageUsedMB: number;
    recentCacheActivity: Array<{
        url: string;
        timestamp: string;
        action: string;
        reason: string;
    }>;
    uniqueURLsStored?: number;
    totalStorageRecords?: number;
    averageContentSizeKB?: number;
    oldestRecord?: string;
    newestRecord?: string;
}

interface S3ContentView {
    s3Key: string;
    html: string;
    metadata: any;
    size: number;
    lastModified: string;
}

export const S3ManagementTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [storageItems, setStorageItems] = useState<S3Storage[]>([]);
    const [loading, setLoading] = useState(true);
    const [cachingStats, setCachingStats] = useState<CachingStats | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
    const [viewingContent, setViewingContent] = useState<S3ContentView | null>(null);
    const entityId = 'default'; // You may want to get this from context

    // Load S3 storage items and caching stats
    const loadS3Storage = useCallback(async () => {
        try {
            setLoading(true);
            
            // Load S3 storage items using standard query
            const response = await client.graphql({
                query: listS3Storages,
                variables: { limit: 100 }
            }) as any;
            
            if (response.data?.listS3Storages) {
                setStorageItems(response.data.listS3Storages.items || []);
            }

            // Load caching statistics using the auto-generated query
            try {
                const statsResponse = await client.graphql({
                    query: getCachingStats,
                    variables: { 
                        entityId: entityId, 
                        timeRange: TimeRange.LAST_24_HOURS // Use enum value
                    }
                }) as any;
                
                if (statsResponse.data?.getCachingStats) {
                    setCachingStats(statsResponse.data.getCachingStats);
                }
            } catch (statsError) {
                console.warn('Could not load caching stats:', statsError);
                // Set default stats if query fails
                setCachingStats({
                    totalURLs: storageItems.length,
                    urlsWithETags: 0,
                    urlsWithLastModified: 0,
                    totalCacheHits: 0,
                    totalCacheMisses: 0,
                    averageCacheHitRate: 0,
                    storageUsedMB: 0,
                    recentCacheActivity: []
                });
            }

        } catch (error: any) {
            console.error('Error loading S3 storage:', error);
            // Could show error in UI if needed
        } finally {
            setLoading(false);
        }
    }, [client, entityId]);

    useEffect(() => {
        loadS3Storage();
    }, [loadS3Storage]);

    // View HTML content from S3
    const handleViewContent = useCallback(async (s3Key: string) => {
        try {
            setLoading(true);
            
            const response = await client.graphql({
                query: viewS3Content,
                variables: { s3Key }
            }) as any;
            
            if (response.data?.viewS3Content) {
                setViewingContent(response.data.viewS3Content);
            }
        } catch (error) {
            console.error('Error viewing content:', error);
            alert('Failed to view S3 content: ' + (error as any).message);
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Load tournament history
    const handleViewTournamentHistory = useCallback(async (tournamentId: number) => {
        try {
            setLoading(true);
            setSelectedTournamentId(tournamentId);
            
            const response = await client.graphql({
                query: getS3StorageHistory,
                variables: { 
                    tournamentId, 
                    entityId: entityId,
                    limit: 50 
                }
            }) as any;
            
            if (response.data?.getS3StorageHistory) {
                setStorageItems(response.data.getS3StorageHistory.items || []);
            }
        } catch (error) {
            console.error('Error loading tournament history:', error);
            alert('Failed to load tournament history');
        } finally {
            setLoading(false);
        }
    }, [client, entityId]);

    // Delete cached item
    const handleDeleteItem = useCallback(async (id: string) => {
        if (!confirm('Are you sure you want to delete this cached item?')) {
            return;
        }

        try {
            await client.graphql({
                query: deleteS3Storage,
                variables: { input: { id } }
            });
            
            // Refresh the list
            loadS3Storage();
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Failed to delete item');
        }
    }, [client, loadS3Storage]);

    // Download HTML content
    const handleDownloadContent = useCallback(async (s3Key: string, tournamentId: number) => {
        try {
            const response = await client.graphql({
                query: viewS3Content,
                variables: { s3Key }
            }) as any;
            
            if (response.data?.viewS3Content) {
                const content = response.data.viewS3Content;
                const blob = new Blob([content.html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tournament-${tournamentId}-${new Date().getTime()}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading content:', error);
            alert('Failed to download content');
        }
    }, [client]);

    if (loading && !cachingStats) {
        return (
            <div className="flex justify-center items-center h-64">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Overview */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <HardDrive className="h-5 w-5 mr-2" />
                    S3 Cache Statistics (Last 24 Hours)
                </h3>
                {cachingStats && (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <Database className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-blue-600">
                                {cachingStats.totalStorageRecords || cachingStats.totalURLs}
                            </p>
                            <p className="text-sm text-gray-500">Total Cached</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-green-600">
                                {cachingStats.averageCacheHitRate.toFixed(1)}%
                            </p>
                            <p className="text-sm text-gray-500">Hit Rate</p>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <HardDrive className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-purple-600">
                                {cachingStats.storageUsedMB.toFixed(2)} MB
                            </p>
                            <p className="text-sm text-gray-500">Storage Used</p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                            <Activity className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-orange-600">
                                {cachingStats.totalCacheHits}
                            </p>
                            <p className="text-sm text-gray-500">Cache Hits</p>
                        </div>
                        <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <Clock className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                            <p className="text-2xl font-bold text-gray-600">
                                {cachingStats.averageContentSizeKB || 0} KB
                            </p>
                            <p className="text-sm text-gray-500">Avg Size</p>
                        </div>
                    </div>
                )}
                {!cachingStats && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                        <p className="text-sm text-yellow-700">
                            Caching statistics are not available. Ensure the Lambda function is properly configured.
                        </p>
                    </div>
                )}
            </div>

            {/* Recent Cache Activity */}
            {cachingStats?.recentCacheActivity && cachingStats.recentCacheActivity.length > 0 && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold">Recent Cache Activity</h3>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {cachingStats.recentCacheActivity.slice(0, 5).map((activity, index) => (
                            <div key={index} className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                        {activity.url.substring(activity.url.lastIndexOf('/') + 1)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(activity.timestamp).toLocaleString()}
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                        activity.action === 'HIT' 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {activity.action}
                                    </span>
                                    <span className="text-xs text-gray-500">{activity.reason}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Storage Items Table */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                        {selectedTournamentId 
                            ? `Tournament ${selectedTournamentId} History` 
                            : 'Cached HTML Storage'}
                    </h3>
                    <div className="flex items-center space-x-2">
                        {selectedTournamentId && (
                            <button
                                onClick={() => {
                                    setSelectedTournamentId(null);
                                    loadS3Storage();
                                }}
                                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                            >
                                View All
                            </button>
                        )}
                        <button
                            onClick={loadS3Storage}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Tournament ID
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    URL
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Scraped At
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Size
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Cache Headers
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {storageItems.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button
                                            onClick={() => handleViewTournamentHistory(item.tournamentId)}
                                            className="text-blue-600 hover:text-blue-800 hover:underline"
                                        >
                                            {item.tournamentId}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <a 
                                            href={item.url || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800"
                                            title={item.url || ''}
                                        >
                                            {item.url ? item.url.substring(item.url.lastIndexOf('/') + 1).substring(0, 20) + '...' : '-'}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(item.scrapedAt || item.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.contentSize ? `${(item.contentSize / 1024).toFixed(2)} KB` : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center space-x-1">
                                            {item.etag && (
                                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                                    ETag
                                                </span>
                                            )}
                                            {item.lastModified && (
                                                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                                                    Modified
                                                </span>
                                            )}
                                            {!item.etag && !item.lastModified && (
                                                <span className="text-gray-400">None</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            item.dataExtracted 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {item.dataExtracted ? 'PROCESSED' : 'STORED'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleViewContent(item.s3Key)}
                                                className="text-blue-600 hover:text-blue-800"
                                                title="View HTML"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDownloadContent(item.s3Key, item.tournamentId)}
                                                className="text-green-600 hover:text-green-800"
                                                title="Download HTML"
                                            >
                                                <Download className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="text-red-600 hover:text-red-800"
                                                title="Delete"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {storageItems.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No cached HTML documents found.
                        </div>
                    )}
                </div>
            </div>

            {/* HTML Content Viewer Modal */}
            {viewingContent && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-6xl max-h-[90vh] w-full overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">
                                HTML Content Viewer - {viewingContent.s3Key}
                            </h3>
                            <button
                                onClick={() => setViewingContent(null)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-auto max-h-[calc(90vh-120px)]">
                            <div className="mb-4 text-sm text-gray-600">
                                <p><strong>Size:</strong> {(viewingContent.size / 1024).toFixed(2)} KB</p>
                                <p><strong>Last Modified:</strong> {new Date(viewingContent.lastModified).toLocaleString()}</p>
                            </div>
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                                    {viewingContent.html.substring(0, 10000)}
                                    {viewingContent.html.length > 10000 && '\n\n... (content truncated for display)'}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};