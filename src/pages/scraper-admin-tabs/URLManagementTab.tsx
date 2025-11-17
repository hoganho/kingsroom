// src/pages/scraper-admin-tabs/URLManagementTab.tsx
// Enhanced version with Skipped IDs Analyzer and Game Status display

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    ExternalLink,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Filter
} from 'lucide-react';
import { searchScrapeURLs } from '../../graphql/queries';
import { 
    bulkModifyScrapeURLs 
} from '../../graphql/mutations';
import { ScrapeURL, ScrapeURLStatus, GameStatus } from '../../API';
import { URLStatusBadge, GameStatusBadge } from '../../components/scraper/admin/ScraperAdminShared';
import { SkippedIDsAnalyzer } from '../../components/scraper/admin/SkippedIDsAnalyzer';

export const URLManagementTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [urls, setURLs] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [graphqlErrors, setGraphqlErrors] = useState<any[]>([]);
    const [statusFilter, setStatusFilter] = useState<ScrapeURLStatus | 'ALL'>('ALL');
    const [gameStatusFilter, setGameStatusFilter] = useState<GameStatus | 'ALL' | 'UNPARSED'>('ALL');
    const [selectedURLs, setSelectedURLs] = useState<Set<string>>(new Set());
    const [showSkippedAnalyzer, setShowSkippedAnalyzer] = useState(false);
    const [showErrorDetails, setShowErrorDetails] = useState(false);

    const loadURLs = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            setGraphqlErrors([]);
            
            const response = await client.graphql({
                query: searchScrapeURLs,
                variables: { 
                    status: statusFilter === 'ALL' ? null : statusFilter,
                    limit: 100 
                }
            }) as any;
            
            // Check for GraphQL errors
            if (response.errors && response.errors.length > 0) {
                console.warn('GraphQL errors detected:', response.errors);
                setGraphqlErrors(response.errors);
                
                // Categorize errors
                const nullFieldErrors = response.errors.filter((e: any) => 
                    e.message?.includes('Cannot return null for non-nullable')
                );
                const enumErrors = response.errors.filter((e: any) => 
                    e.message?.includes('Invalid input for Enum')
                );
                const gameStatusEnumErrors = enumErrors.filter((e: any) =>
                    e.message?.includes('GameStatus')
                );
                
                if (nullFieldErrors.length > 0) {
                    setError(
                        `Warning: ${nullFieldErrors.length} records have missing required fields. ` +
                        `These records will be skipped. Consider updating your schema to make these fields nullable.`
                    );
                }
                
                if (gameStatusEnumErrors.length > 0) {
                    const errorMsg = `${gameStatusEnumErrors.length} records have invalid GameStatus values. ` +
                        `Some games have status values not defined in your schema. ` +
                        `These records will be loaded but their game status will not display. `;
                    setError((prev) => (prev || '') + errorMsg);
                } else if (enumErrors.length > 0) {
                    setError((prev) => 
                        (prev || '') + ` ${enumErrors.length} records have invalid enum values.`
                    );
                }
            }
            
            // Even with errors, we might have partial data
            if (response.data?.searchScrapeURLs?.items) {
                // Filter out any null or malformed items
                const validItems = response.data.searchScrapeURLs.items.filter((item: any) => 
                    item && item.url && item.id
                );
                setURLs(validItems as ScrapeURL[]);
                
                if (validItems.length === 0 && response.errors?.length > 0) {
                    setError('All records failed to load due to data integrity issues. Please check the error details.');
                }
            } else if (response.errors?.length === 0) {
                // No data and no errors - empty result
                setURLs([]);
            }
        } catch (err) {
            console.error('Error loading URLs:', err);
            setError(`Failed to load URLs: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setURLs([]);
        } finally {
            setLoading(false);
        }
    }, [client, statusFilter]);

    useEffect(() => {
        loadURLs();
    }, [loadURLs]);

    const handleToggleURL = (url: string) => {
        const newSelection = new Set(selectedURLs);
        if (newSelection.has(url)) {
            newSelection.delete(url);
        } else {
            newSelection.add(url);
        }
        setSelectedURLs(newSelection);
    };
    
    const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedURLs(new Set(filteredURLs.map(u => u.url)));
        } else {
            setSelectedURLs(new Set());
        }
    };

    const handleBulkUpdate = useCallback(async (status: ScrapeURLStatus, doNotScrape?: boolean) => {
        if (selectedURLs.size === 0) {
            alert('Please select URLs to update');
            return;
        }

        try {
            await client.graphql({
                query: bulkModifyScrapeURLs,
                variables: {
                    urls: Array.from(selectedURLs),
                    status,
                    doNotScrape
                }
            });
            setSelectedURLs(new Set());
            loadURLs(); // Refresh the list
        } catch (error) {
            console.error('Error updating URLs:', error);
            alert('Failed to update URLs. See console for details.');
        }
    }, [client, selectedURLs, loadURLs]);
    
    // Calculate statistics for display
    const stats = useMemo(() => {
        const byStatus = urls.reduce((acc, url) => {
            acc[url.status] = (acc[url.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const byGameStatus = urls.reduce((acc, url) => {
            const status = url.gameStatus || 'UNPARSED';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        
        const totalErrors = urls.filter(u => u.status === 'ERROR').length;
        const totalParsed = urls.filter(u => u.gameStatus).length;
        const totalUnparsed = urls.length - totalParsed;
        const avgSuccessRate = urls.length > 0
            ? urls.reduce((sum, u) => sum + (u.timesSuccessful / Math.max(u.timesScraped, 1)), 0) / urls.length * 100
            : 0;
        
        return {
            total: urls.length,
            byStatus,
            byGameStatus,
            totalErrors,
            totalParsed,
            totalUnparsed,
            avgSuccessRate: avgSuccessRate.toFixed(1)
        };
    }, [urls]);
    
    const filteredURLs = useMemo(() => {
        let filtered = urls;
        
        // Filter by URL status
        if (statusFilter !== 'ALL') {
            filtered = filtered.filter(u => u.status === statusFilter);
        }
        
        // Filter by game status
        if (gameStatusFilter !== 'ALL') {
            if (gameStatusFilter === 'UNPARSED') {
                filtered = filtered.filter(u => !u.gameStatus);
            } else {
                filtered = filtered.filter(u => u.gameStatus === gameStatusFilter);
            }
        }
        
        return filtered;
    }, [urls, statusFilter, gameStatusFilter]);

    return (
        <div className="space-y-6">
            {/* Error Banner */}
            {error && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex items-start">
                        <AlertCircle className="h-5 w-5 text-yellow-400 mr-3 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm text-yellow-800">{error}</p>
                            {graphqlErrors.length > 0 && (
                                <div className="mt-2">
                                    <button
                                        onClick={() => setShowErrorDetails(!showErrorDetails)}
                                        className="text-xs text-yellow-700 hover:text-yellow-900 underline flex items-center"
                                    >
                                        {showErrorDetails ? 'Hide' : 'Show'} error details ({graphqlErrors.length} errors)
                                        {showErrorDetails ? (
                                            <ChevronUp className="ml-1 h-3 w-3" />
                                        ) : (
                                            <ChevronDown className="ml-1 h-3 w-3" />
                                        )}
                                    </button>
                                    {showErrorDetails && (
                                        <div className="mt-2 p-3 bg-yellow-100 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                            <pre>{JSON.stringify(graphqlErrors.slice(0, 10), null, 2)}</pre>
                                            {graphqlErrors.length > 10 && (
                                                <p className="mt-2 text-yellow-700">... and {graphqlErrors.length - 10} more errors</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Dynamic recommendations based on error types */}
                            <div className="mt-2 text-xs text-yellow-700">
                                <strong>Recommended fixes:</strong>
                                {graphqlErrors.some((e: any) => e.message?.includes('GameStatus')) && (
                                    <div className="mt-1">
                                        • <strong>GameStatus errors:</strong> Your database has game status values not defined in the schema. 
                                        You can fix this by:
                                        <div className="ml-4 mt-1">
                                            1. Finding invalid values: Check error details above<br/>
                                            2. Update records in DynamoDB to use valid values, OR<br/>
                                            3. Add missing values to the GameStatus enum in your schema
                                        </div>
                                    </div>
                                )}
                                {graphqlErrors.some((e: any) => e.message?.includes('sourceSystem') || e.message?.includes('consecutiveFailures')) && (
                                    <div className="mt-1">
                                        • <strong>Null field errors:</strong> Update your schema to make <code>sourceSystem</code> and <code>consecutiveFailures</code> nullable.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Statistics Cards */}
            <div className="grid grid-cols-5 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm text-gray-500">Total URLs</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm text-gray-500">Active</p>
                    <p className="text-2xl font-bold text-green-600">{stats.byStatus.ACTIVE || 0}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm text-gray-500">Parsed</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.totalParsed}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {stats.totalUnparsed} unparsed
                    </p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm text-gray-500">Errors</p>
                    <p className="text-2xl font-bold text-red-600">{stats.totalErrors}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm text-gray-500">Success Rate</p>
                    <p className="text-2xl font-bold text-purple-600">{stats.avgSuccessRate}%</p>
                </div>
            </div>

            {/* Skipped IDs Analyzer */}
            <div className="bg-white rounded-lg shadow">
                <button
                    onClick={() => setShowSkippedAnalyzer(!showSkippedAnalyzer)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
                >
                    <span className="font-medium flex items-center">
                        <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                        Gap Analysis & Skipped IDs
                    </span>
                    {showSkippedAnalyzer ? (
                        <ChevronUp className="h-5 w-5" />
                    ) : (
                        <ChevronDown className="h-5 w-5" />
                    )}
                </button>
                
                {showSkippedAnalyzer && (
                    <div className="border-t p-4">
                        <SkippedIDsAnalyzer />
                    </div>
                )}
            </div>

            {/* URL Management */}
            <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">URL Management</h3>
                        <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-2">
                                <Filter className="h-4 w-4 text-gray-500" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                                >
                                    <option value="ALL">All URL Statuses</option>
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                    <option value="ERROR">Error</option>
                                    <option value="DO_NOT_SCRAPE">Do Not Scrape</option>
                                    <option value="ARCHIVED">Archived</option>
                                </select>
                                <select
                                    value={gameStatusFilter}
                                    onChange={(e) => setGameStatusFilter(e.target.value as any)}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                                >
                                    <option value="ALL">All Game Statuses</option>
                                    <option value="UNPARSED">Unparsed</option>
                                    <option value="SCHEDULED">Scheduled</option>
                                    <option value="REGISTERING">Registering</option>
                                    <option value="RUNNING">Running</option>
                                    <option value="FINISHED">Finished</option>
                                    <option value="CANCELLED">Cancelled</option>
                                    <option value="CLOCK_STOPPED">Clock Stopped</option>
                                </select>
                            </div>
                            <button
                                onClick={loadURLs}
                                disabled={loading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                    </div>
                    
                    {/* Filter Summary */}
                    {(statusFilter !== 'ALL' || gameStatusFilter !== 'ALL') && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                            <span className="text-gray-600">Showing:</span>
                            {statusFilter !== 'ALL' && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                    URL: {statusFilter}
                                </span>
                            )}
                            {gameStatusFilter !== 'ALL' && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                                    Game: {gameStatusFilter}
                                </span>
                            )}
                            <button
                                onClick={() => {
                                    setStatusFilter('ALL');
                                    setGameStatusFilter('ALL');
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs underline"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </div>

                {/* Bulk Actions */}
                {selectedURLs.size > 0 && (
                    <div className="p-4 bg-blue-50 border-b flex items-center justify-between">
                        <span className="text-sm text-blue-700">
                            {selectedURLs.size} URL(s) selected
                        </span>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => handleBulkUpdate(ScrapeURLStatus.ACTIVE)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                                Mark Active
                            </button>
                            <button
                                onClick={() => handleBulkUpdate(ScrapeURLStatus.INACTIVE)}
                                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                                Mark Inactive
                            </button>
                            <button
                                onClick={() => handleBulkUpdate(ScrapeURLStatus.DO_NOT_SCRAPE, true)}
                                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                            >
                                Do Not Scrape
                            </button>
                        </div>
                    </div>
                )}

                {/* URL List */}
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-8 text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                            <p className="mt-2 text-gray-500">Loading URLs...</p>
                        </div>
                    ) : filteredURLs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p>No URLs found matching the current filters</p>
                            {(statusFilter !== 'ALL' || gameStatusFilter !== 'ALL') && (
                                <button
                                    onClick={() => {
                                        setStatusFilter('ALL');
                                        setGameStatusFilter('ALL');
                                    }}
                                    className="mt-2 text-blue-600 hover:text-blue-800 text-sm underline"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">
                                        <input
                                            type="checkbox"
                                            checked={selectedURLs.size === filteredURLs.length && filteredURLs.length > 0}
                                            onChange={handleToggleAll}
                                            className="h-4 w-4"
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournament ID</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scrape Stats</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Scraped</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredURLs.map((url) => (
                                    <tr key={url.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedURLs.has(url.url)}
                                                onChange={() => handleToggleURL(url.url)}
                                                className="h-4 w-4"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium">{url.tournamentId}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <URLStatusBadge status={url.status} />
                                                {url.doNotScrape && (
                                                    <span className="text-xs text-red-600 font-medium">(DNS)</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <GameStatusBadge status={url.gameStatus} />
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="max-w-xs truncate" title={url.gameName || undefined}>
                                                {url.gameName || <span className="text-gray-400 italic">No name</span>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="text-xs space-y-1">
                                                <div>
                                                    <span className="text-green-600 font-medium">{url.timesSuccessful}</span>
                                                    <span className="text-gray-400"> / </span>
                                                    <span className="text-red-600 font-medium">{url.timesFailed}</span>
                                                    <span className="text-gray-400"> / </span>
                                                    <span className="text-gray-500">{url.timesScraped} total</span>
                                                </div>
                                                {(url.consecutiveFailures ?? 0) > 0 && (
                                                    <div className="text-red-600 font-medium">
                                                        ⚠ {url.consecutiveFailures} consecutive failures
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {url.lastScrapedAt ? (
                                                <div className="text-xs">
                                                    <div>{new Date(url.lastScrapedAt).toLocaleDateString()}</div>
                                                    <div className="text-gray-400">{new Date(url.lastScrapedAt).toLocaleTimeString()}</div>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">Never</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <a
                                                href={url.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800"
                                                title="Open URL in new tab"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Results Summary */}
                {!loading && filteredURLs.length > 0 && (
                    <div className="p-4 bg-gray-50 border-t text-sm text-gray-600">
                        Showing {filteredURLs.length} of {stats.total} total URLs
                    </div>
                )}
            </div>
        </div>
    );
};