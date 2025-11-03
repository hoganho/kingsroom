
// src/pages/scraper-admin-tabs/URLManagementTab.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    ExternalLink
} from 'lucide-react';
import { scraperManagementQueries, scraperManagementMutations } from '../../graphql/scraperManagement';
import type { ScrapeURL, ScrapeURLStatus } from '../../API';
import { URLStatusBadge } from '../../components/scraper/admin/ScraperAdminShared';

export const URLManagementTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const [urls, setURLs] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<ScrapeURLStatus | 'ALL'>('ALL');
    const [selectedURLs, setSelectedURLs] = useState<Set<string>>(new Set());

    const loadURLs = useCallback(async () => {
        try {
            setLoading(true);
            const response = await client.graphql({
                query: scraperManagementQueries.searchScrapeURLs,
                variables: { 
                    status: statusFilter === 'ALL' ? null : statusFilter,
                    limit: 100 
                }
            }) as any;
            
            if (response.data && response.data.searchScrapeURLs) {
                setURLs(response.data.searchScrapeURLs.items as ScrapeURL[]);
            } else {
                console.error('Error loading URLs:', response.errors);
                setURLs([]);
            }
        } catch (error) {
            console.error('Error loading URLs:', error);
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
            setSelectedURLs(new Set(urls.map(u => u.url)));
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
                query: scraperManagementMutations.bulkModifyScrapeURLs,
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

    return (
        <div className="space-y-6">
            {/* Filters and Actions */}
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">URL Management</h3>
                    <div className="flex items-center space-x-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                            <option value="ERROR">Error</option>
                            <option value="ARCHIVED">Archived</option>
                            <option value="DO_NOT_SCRAPE">Do Not Scrape</option>
                        </select>
                        <button
                            onClick={loadURLs}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Bulk Actions */}
                {selectedURLs.size > 0 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                        <span className="text-sm text-blue-700">
                            {selectedURLs.size} URL(s) selected
                        </span>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => handleBulkUpdate('ACTIVE' as ScrapeURLStatus, false)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                                Activate
                            </button>
                            <button
                                onClick={() => handleBulkUpdate('DO_NOT_SCRAPE' as ScrapeURLStatus, true)}
                                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                            >
                                Do Not Scrape
                            </button>
                            <button
                                onClick={() => handleBulkUpdate('ARCHIVED' as ScrapeURLStatus)}
                                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                            >
                                Archive
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* URLs List */}
            {loading ? (
                <div className="flex justify-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        <input
                                            type="checkbox"
                                            onChange={handleToggleAll}
                                            checked={selectedURLs.size === urls.length && urls.length > 0}
                                        />
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Tournament ID
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Game Name
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Last Scraped
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Times Scraped
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Success Rate
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {urls.map((url) => (
                                    <tr key={url.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={selectedURLs.has(url.url)}
                                                onChange={() => handleToggleURL(url.url)}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {url.tournamentId}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <URLStatusBadge status={url.status} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {url.gameName || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {url.lastScrapedAt ? new Date(url.lastScrapedAt).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {url.timesScraped || 0}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {url.timesScraped ? 
                                                `${Math.round(((url.timesSuccessful || 0) / url.timesScraped) * 100)}%` 
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <a
                                                href={url.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {urls.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No URLs found for the selected filter.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};