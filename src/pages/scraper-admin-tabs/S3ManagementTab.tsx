// S3ManagementTab.tsx
// Frontend component for managing S3-stored HTML content
// REFACTORED to remove duplicate GraphQL operations

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    Upload,
    History,
    FileText,
    RefreshCw,
    HardDrive,
    BarChart3,
    Check,
    X,
    Building2
} from 'lucide-react';
import { useEntity } from '../../contexts/EntityContext';
import { EntitySelector } from '../../components/entities/EntitySelector';

// Import the operations from your central file
import { scraperManagementQueries, scraperManagementMutations } from '../../graphql/scraperManagement';
// Assuming scraperManagement.ts is two levels up in a 'graphql' folder
// Adjust the import path as needed

// Note: These type definitions are also technically duplicated in scraperManagement.ts
// You could export and import them as well for maximum code re-use.
interface S3StorageRecord {
    id: string;
    s3Key: string;
    url: string;
    tournamentId: number;
    entityId: string;
    scrapedAt: string;
    contentSize: number;
    contentHash: string;
    etag?: string;
    lastModified?: string;
    isManualUpload: boolean;
    uploadedBy?: string;
    notes?: string;
}

interface CachingStats {
    totalURLs: number;
    urlsWithETags: number;
    urlsWithLastModified: number;
    totalCacheHits: number;
    totalCacheMisses: number;
    averageCacheHitRate: number;
    storageUsedMB: number;
}

export const S3ManagementTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const { currentEntity } = useEntity();
    
    // State
    const [activeView, setActiveView] = useState<'history' | 'upload' | 'stats'>('history');
    const [tournamentId, setTournamentId] = useState('');
    const [htmlFiles, setHtmlFiles] = useState<S3StorageRecord[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [htmlContent, setHtmlContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadUrl, setUploadUrl] = useState('');
    const [uploadNotes, setUploadNotes] = useState('');
    const [cachingStats, setCachingStats] = useState<CachingStats | null>(null);
    const [showHtmlViewer, setShowHtmlViewer] = useState(false);
    
    // Load HTML history for a tournament
    const loadHtmlHistory = useCallback(async () => {
        if (!tournamentId || !currentEntity) return;
        
        setLoading(true);
        try {
            const response = await client.graphql({
                // CHANGED: Use imported query
                query: scraperManagementQueries.getS3StorageHistory,
                variables: {
                    tournamentId: parseInt(tournamentId),
                    entityId: currentEntity.id,
                    limit: 50
                }
            });
            
            if ('data' in response) {
                setHtmlFiles(response.data.getS3StorageHistory.items || []);
            }
        } catch (error) {
            console.error('Error loading HTML history:', error);
            alert('Failed to load HTML history');
        } finally {
            setLoading(false);
        }
    }, [client, tournamentId, currentEntity]);
    
    // View HTML content from S3
    const viewHtmlContent = async (s3Key: string) => {
        setLoading(true);
        try {
            const response = await client.graphql({
                // CHANGED: Use imported query
                query: scraperManagementQueries.viewS3Content,
                variables: { s3Key }
            });
            
            if ('data' in response) {
                setHtmlContent(response.data.viewS3Content.html);
                setSelectedFile(s3Key);
                setShowHtmlViewer(true);
            }
        } catch (error) {
            console.error('Error viewing HTML:', error);
            alert('Failed to load HTML content');
        } finally {
            setLoading(false);
        }
    };
    
    // Handle manual upload
    const handleManualUpload = async () => {
        if (!uploadFile || !tournamentId || !currentEntity || !uploadUrl) {
            alert('Please fill all required fields');
            return;
        }
        
        setLoading(true);
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const htmlContent = e.target?.result as string;
            
            try {
                await client.graphql({
                    // CHANGED: Use imported mutation
                    query: scraperManagementMutations.uploadManualHTML,
                    variables: {
                        input: {
                            htmlContent,
                            url: uploadUrl,
                            tournamentId: parseInt(tournamentId),
                            entityId: currentEntity.id,
                            notes: uploadNotes,
                            uploadedBy: 'Admin'
                        }
                    }
                });
                
                alert('HTML uploaded successfully!');
                
                // Clear form and reload history
                setUploadFile(null);
                setUploadUrl('');
                setUploadNotes('');
                loadHtmlHistory();
            } catch (error) {
                console.error('Error uploading HTML:', error);
                alert('Failed to upload HTML');
            } finally {
                setLoading(false);
            }
        };
        
        reader.readAsText(uploadFile);
    };
    
    // Re-scrape from cached HTML
    const reScrapeFromCache = async (s3Key: string) => {
        if (!confirm('Re-scrape data from this cached HTML?')) return;
        
        setLoading(true);
        try {
            const response = await client.graphql({
                // CHANGED: Use imported mutation
                query: scraperManagementMutations.reScrapeFromCache,
                variables: {
                    input: {
                        s3Key,
                        saveToDatabase: false
                    }
                }
            });
            
            if ('data' in response) {
                alert(`Re-scraped: ${response.data.reScrapeFromCache.name}`);
            }
        } catch (error) {
            console.error('Error re-scraping:', error);
            alert('Failed to re-scrape from cache');
        } finally {
            setLoading(false);
        }
    };
    
    // Load caching statistics
    const loadCachingStats = useCallback(async () => {
        if (!currentEntity) return;
        
        setLoading(true);
        try {
            const response = await client.graphql({
                // CHANGED: Use imported query
                query: scraperManagementQueries.getCachingStats,
                variables: {
                    entityId: currentEntity.id,
                    timeRange: 'LAST_7_DAYS' // This string matches the TimeRange enum
                }
            });
            
            if ('data' in response) {
                setCachingStats(response.data.getCachingStats);
            }
        } catch (error) {
            console.error('Error loading caching stats:', error);
        } finally {
            setLoading(false);
        }
    }, [client, currentEntity]);
    
    // Load stats when switching to stats view
    useEffect(() => {
        if (activeView === 'stats' && currentEntity) {
            loadCachingStats();
        }
    }, [activeView, currentEntity, loadCachingStats]);
    
    // Format file size
    const formatSize = (bytes: number) => {
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(2)} MB`;
    };
    
    // Format date
    const formatDate = (date: string) => {
        return new Date(date).toLocaleString();
    };
    
    if (!currentEntity) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="text-center">
                    <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No Entity Selected</h3>
                    <p className="mt-1 text-sm text-gray-500">
                        Please select an entity to manage S3 storage.
                    </p>
                    <div className="mt-6 flex justify-center">
                        <EntitySelector />
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            {/* Entity Info Bar */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <HardDrive className="h-5 w-5 text-blue-500" />
                        <span className="text-sm font-medium text-blue-900">
                            S3 Storage Management - {currentEntity.entityName}
                        </span>
                    </div>
                    <EntitySelector />
                </div>
            </div>
            
            {/* View Tabs */}
            <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200">
                    <nav className="flex space-x-8 px-6" aria-label="Tabs">
                        <button
                            onClick={() => setActiveView('history')}
                            className={`py-3 px-1 border-b-2 font-medium text-sm ${
                                activeView === 'history'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <History className="h-4 w-4 inline mr-2" />
                            HTML History
                        </button>
                        <button
                            onClick={() => setActiveView('upload')}
                            className={`py-3 px-1 border-b-2 font-medium text-sm ${
                                activeView === 'upload'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <Upload className="h-4 w-4 inline mr-2" />
                            Manual Upload
                        </button>
                        <button
                            onClick={() => setActiveView('stats')}
                            className={`py-3 px-1 border-b-2 font-medium text-sm ${
                                activeView === 'stats'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <BarChart3 className="h-4 w-4 inline mr-2" />
                            Caching Stats
                        </button>
                    </nav>
                </div>
                
                <div className="p-6">
                    {/* HTML History View */}
                    {activeView === 'history' && (
                        <div className="space-y-4">
                            <div className="flex space-x-4">
                                <input
                                    type="text"
                                    value={tournamentId}
                                    onChange={(e) => setTournamentId(e.target.value)}
                                    placeholder="Tournament ID"
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                />
                                <button
                                    onClick={loadHtmlHistory}
                                    disabled={loading || !tournamentId}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                                >
                                    {loading ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <History className="h-4 w-4 inline mr-2" />
                                            Load History
                                        </>
                                    )}
                                </button>
                            </div>
                            
                            {htmlFiles.length > 0 && (
                                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-300">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    Scraped At
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    Size
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    Type
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    ETag
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    Hash
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 bg-white">
                                            {htmlFiles.map((file) => (
                                                <tr key={file.id}>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                                                        {formatDate(file.scrapedAt)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                                        {formatSize(file.contentSize)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                                                            file.isManualUpload
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-green-100 text-green-800'
                                                        }`}>
                                                            {file.isManualUpload ? 'Manual' : 'Auto'}
                                                        </span>
                                                    </td>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                                                        {file.etag ? (
                                                            <Check className="h-4 w-4 text-green-500" />
                                                        ) : (
                                                            <X className="h-4 w-4 text-gray-400" />
                                                        )}
                                                    </td>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-gray-500">
                                                        {file.contentHash?.substring(0, 8)}...
                                                    </td>
                                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                                        <div className="flex space-x-2">
                                                            <button
                                                                onClick={() => viewHtmlContent(file.s3Key)}
                                                                className="text-blue-600 hover:text-blue-900"
                                                                title="View HTML"
                                                            >
                                                                <FileText className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => reScrapeFromCache(file.s3Key)}
                                                                className="text-green-600 hover:text-green-900"
                                                                title="Re-scrape"
                                                            >
                                                                <RefreshCw className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Manual Upload View */}
                    {activeView === 'upload' && (
                        <div className="space-y-4 max-w-2xl">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tournament ID *</label>
                                <input
                                    type="text"
                                    value={tournamentId}
                                    onChange={(e) => setTournamentId(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                    placeholder="e.g., 12345"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Tournament URL *</label>
                                <input
                                    type="url"
                                    value={uploadUrl}
                                    onChange={(e) => setUploadUrl(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                    placeholder="https://example.com/tournament?id=12345"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700">HTML File *</label>
                                <input
                                    type="file"
                                    accept=".html,.htm"
                                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                    className="mt-1 block w-full"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Notes</label>
                                <textarea
                                    value={uploadNotes}
                                    onChange={(e) => setUploadNotes(e.target.value)}
                                    rows={3}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                                    placeholder="Any additional notes about this HTML file..."
                                />
                            </div>
                            
                            <button
                                onClick={handleManualUpload}
                                disabled={loading || !uploadFile || !tournamentId || !uploadUrl}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload HTML
                            </button>
                        </div>
                    )}
                    
                    {/* Caching Stats View */}
                    {activeView === 'stats' && cachingStats && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Total URLs</div>
                                <div className="text-2xl font-bold">{cachingStats.totalURLs}</div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Cache Hit Rate</div>
                                <div className="text-2xl font-bold">
                                    {cachingStats.averageCacheHitRate.toFixed(1)}%
                                </div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Storage Used</div>
                                <div className="text-2xl font-bold">
                                    {cachingStats.storageUsedMB.toFixed(1)} MB
                                </div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">URLs with ETags</div>
                                <div className="text-2xl font-bold">{cachingStats.urlsWithETags}</div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Total Cache Hits</div>
                                <div className="text-2xl font-bold">{cachingStats.totalCacheHits}</div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Total Cache Misses</div>
                                <div className="text-2xl font-bold">{cachingStats.totalCacheMisses}</div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">URLs with Last-Modified</div>
                                <div className="text-2xl font-bold">{cachingStats.urlsWithLastModified}</div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-sm text-gray-500">Bandwidth Saved</div>
                                <div className="text-2xl font-bold">
                                    {((cachingStats.totalCacheHits * 50) / 1024).toFixed(1)} MB
                                </div>
                                <div className="text-xs text-gray-500">*Estimated</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* HTML Viewer Modal */}
            {showHtmlViewer && selectedFile && (
                <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="text-lg font-medium">HTML Content: {selectedFile}</h3>
                            <button
                                onClick={() => setShowHtmlViewer(false)}
                                className="text-gray-400 hover:text-gray-500"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-auto max-h-[calc(90vh-120px)]">
                            <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">
                                <code>{htmlContent}</code>
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};