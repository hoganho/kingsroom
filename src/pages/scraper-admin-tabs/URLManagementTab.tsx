// src/pages/scraper-admin-tabs/URLManagementTab.tsx
// ENHANCED VERSION: Search-first approach with quick filters
// 
// Features:
// 1. Search interface with quick-select buttons for common statuses
// 2. No auto-load on page load - user initiates search
// 3. Checkbox filters for additional client-side refinement
// 4. "Send to Scraper" action to load selected IDs into multi-ID mode
// 5. Full pagination support

import React, { useState, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
    RefreshCw, 
    ExternalLink,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Filter,
    Copy,
    Play,
    XCircle,
    Clock,
    Ban,
    FileQuestion,
    AlertOctagon,
    Search,
    Download
} from 'lucide-react';
import { 
    bulkModifyScrapeURLs 
} from '../../graphql/mutations';
import { ScrapeURL, ScrapeURLStatus, GameStatus } from '../../API';
import { URLStatusBadge, GameStatusBadge } from '../../components/scraper/shared/StatusBadges';
import { SkippedIDsAnalyzer } from '../../components/scraper/admin/SkippedIDsAnalyzer';
import { useEntity } from '../../contexts/EntityContext';

// ===================================================================
// TYPES & CONSTANTS
// ===================================================================

interface SearchPreset {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    hoverColor: string;
    // Client-side filter function (applied after fetch)
    filterFn: (url: ScrapeURL) => boolean;
}

// Quick search presets - these define what users can quickly search for
const SEARCH_PRESETS: SearchPreset[] = [
    {
        id: 'errors',
        label: 'Errors',
        description: 'URLs with scrape errors or failures',
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        hoverColor: 'hover:bg-red-200',
        filterFn: (url) => 
            url.lastScrapeStatus?.toUpperCase() === 'ERROR' ||
            url.status?.toString().toUpperCase() === 'ERROR' ||
            (url.timesFailed ?? 0) > 0
    },
    {
        id: 'not_found',
        label: 'Not Found',
        description: '404s and blank pages',
        icon: <FileQuestion className="h-4 w-4" />,
        color: 'text-orange-700',
        bgColor: 'bg-orange-100',
        hoverColor: 'hover:bg-orange-200',
        filterFn: (url) => 
            url.lastScrapeStatus?.toUpperCase() === 'NOT_FOUND' ||
            url.lastScrapeStatus?.toUpperCase() === 'BLANK' ||
            url.gameStatus?.toString().toUpperCase() === 'NOT_FOUND'
    },
    {
        id: 'not_published',
        label: 'Not Published',
        description: 'Future tournaments',
        icon: <Clock className="h-4 w-4" />,
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-100',
        hoverColor: 'hover:bg-yellow-200',
        filterFn: (url) => 
            url.gameStatus?.toString().toUpperCase() === 'NOT_PUBLISHED' ||
            url.lastScrapeStatus?.toUpperCase() === 'NOT_PUBLISHED'
    },
    {
        id: 'consecutive_failures',
        label: 'Consecutive Failures',
        description: '2+ failures in a row',
        icon: <AlertOctagon className="h-4 w-4" />,
        color: 'text-purple-700',
        bgColor: 'bg-purple-100',
        hoverColor: 'hover:bg-purple-200',
        filterFn: (url) => (url.consecutiveFailures ?? 0) >= 2
    },
    {
        id: 'never_successful',
        label: 'Never Successful',
        description: 'Tried but never worked',
        icon: <AlertTriangle className="h-4 w-4" />,
        color: 'text-pink-700',
        bgColor: 'bg-pink-100',
        hoverColor: 'hover:bg-pink-200',
        filterFn: (url) => 
            (url.timesSuccessful ?? 0) === 0 && 
            (url.timesScraped ?? 0) > 0
    },
    {
        id: 'do_not_scrape',
        label: 'Do Not Scrape',
        description: 'Blocked URLs',
        icon: <Ban className="h-4 w-4" />,
        color: 'text-gray-700',
        bgColor: 'bg-gray-200',
        hoverColor: 'hover:bg-gray-300',
        filterFn: (url) => url.doNotScrape === true
    }
];

// ===================================================================
// GRAPHQL QUERY
// ===================================================================

const searchScrapeURLsWithEntity = /* GraphQL */ `
  query SearchScrapeURLsWithEntity(
    $entityId: ID
    $entityIds: [ID]
    $status: ScrapeURLStatus
    $limit: Int
    $nextToken: String
  ) {
    searchScrapeURLs(
      entityId: $entityId
      entityIds: $entityIds
      status: $status
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        url
        tournamentId
        status
        doNotScrape
        gameStatus
        gameName
        gameId
        venueId
        venueName
        entityId
        timesScraped
        timesSuccessful
        timesFailed
        consecutiveFailures
        lastScrapedAt
        lastSuccessfulScrapeAt
        lastScrapeStatus
        lastScrapeMessage
        placedIntoDatabase
        firstScrapedAt
        latestS3Key
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const URLManagementTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    
    // Entity context
    const { 
        entities, 
        selectedEntities, 
        loading: entitiesLoading 
    } = useEntity();
    
    // Data state
    const [urls, setURLs] = useState<ScrapeURL[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<string>('');
    
    // Search/Filter state
    const [activePreset, setActivePreset] = useState<string | null>(null);
    const [gameStatusFilter, setGameStatusFilter] = useState<GameStatus | 'ALL' | 'UNPARSED'>('ALL');
    
    // Selection state
    const [selectedURLs, setSelectedURLs] = useState<Set<string>>(new Set());
    
    // UI state
    const [showSkippedAnalyzer, setShowSkippedAnalyzer] = useState(false);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    // Entity lookup map
    const entityMap = useMemo(() => {
        return entities.reduce((acc, entity) => {
            acc[entity.id] = entity;
            return acc;
        }, {} as Record<string, typeof entities[0]>);
    }, [entities]);

    // Selected entity IDs for query
    const selectedEntityIds = useMemo(() => {
        return selectedEntities.map(e => e.id);
    }, [selectedEntities]);

    // ===================================================================
    // DATA LOADING (with pagination)
    // ===================================================================

    const loadURLs = useCallback(async (presetId?: string | null) => {
        if (entitiesLoading) return;
        if (selectedEntityIds.length === 0) {
            setURLs([]);
            return;
        }

        try {
            setLoading(true);
            setHasSearched(true);
            setLoadingProgress('Loading...');
            setSelectedURLs(new Set()); // Clear selection on new search
            
            const allItems: ScrapeURL[] = [];
            let nextToken: string | null = null;
            let pageCount = 0;
            const maxPages = 50; // Safety limit: 50 pages * 500 = 25,000 max URLs
            
            do {
                pageCount++;
                setLoadingProgress(`Loading page ${pageCount}... (${allItems.length} URLs so far)`);
                
                const response = await client.graphql({
                    query: searchScrapeURLsWithEntity,
                    variables: { 
                        entityId: selectedEntityIds.length === 1 ? selectedEntityIds[0] : null,
                        entityIds: selectedEntityIds.length > 1 ? selectedEntityIds : null,
                        status: null,  // Get all statuses, filter client-side
                        limit: 500,
                        nextToken
                    }
                }) as any;
                
                if (response.errors && response.errors.length > 0) {
                    console.warn('GraphQL errors detected:', response.errors);
                }
                
                const items = response?.data?.searchScrapeURLs?.items || [];
                allItems.push(...items.filter(Boolean));
                
                nextToken = response?.data?.searchScrapeURLs?.nextToken || null;
                
                // Safety check
                if (pageCount >= maxPages) {
                    console.warn(`[URLManagement] Reached max pages limit (${maxPages}), stopping pagination`);
                    break;
                }
                
            } while (nextToken);
            
            console.log(`[URLManagement] Loaded ${allItems.length} URLs in ${pageCount} pages`);
            
            // Apply preset filter if specified
            if (presetId) {
                const preset = SEARCH_PRESETS.find(p => p.id === presetId);
                if (preset) {
                    const filtered = allItems.filter(preset.filterFn);
                    console.log(`[URLManagement] Applied preset '${presetId}': ${filtered.length} of ${allItems.length} match`);
                    setURLs(filtered);
                    setActivePreset(presetId);
                } else {
                    setURLs(allItems);
                    setActivePreset(null);
                }
            } else {
                setURLs(allItems);
                setActivePreset(null);
            }
            
            setLoadingProgress('');
            
        } catch (err: any) {
            console.error('Error loading URLs:', err);
            setLoadingProgress('');
            
            if (err?.data?.searchScrapeURLs?.items) {
                setURLs(err.data.searchScrapeURLs.items.filter(Boolean));
            }
        } finally {
            setLoading(false);
        }
    }, [client, selectedEntityIds, entitiesLoading]);

    // Handle preset button click
    const handlePresetClick = useCallback((presetId: string) => {
        loadURLs(presetId);
    }, [loadURLs]);

    // Handle "Load All" click
    const handleLoadAll = useCallback(() => {
        loadURLs(null);
    }, [loadURLs]);

    // ===================================================================
    // ADDITIONAL CLIENT-SIDE FILTERING
    // ===================================================================

    const filteredURLs = useMemo(() => {
        let result = urls;
        
        // Apply game status filter
        if (gameStatusFilter !== 'ALL') {
            if (gameStatusFilter === 'UNPARSED') {
                result = result.filter(url => !url.gameStatus);
            } else {
                result = result.filter(url => url.gameStatus === gameStatusFilter);
            }
        }
        
        // Sort by tournament ID descending
        return result.sort((a, b) => (b.tournamentId ?? 0) - (a.tournamentId ?? 0));
    }, [urls, gameStatusFilter]);

    // ===================================================================
    // SELECTION HANDLERS
    // ===================================================================

    const handleToggleURL = useCallback((url: string) => {
        setSelectedURLs(prev => {
            const next = new Set(prev);
            if (next.has(url)) {
                next.delete(url);
            } else {
                next.add(url);
            }
            return next;
        });
    }, []);

    const handleToggleAll = useCallback(() => {
        if (selectedURLs.size === filteredURLs.length) {
            setSelectedURLs(new Set());
        } else {
            setSelectedURLs(new Set(filteredURLs.map(u => u.url)));
        }
    }, [filteredURLs, selectedURLs.size]);

    const handleSelectVisible = useCallback(() => {
        setSelectedURLs(new Set(filteredURLs.map(u => u.url)));
    }, [filteredURLs]);

    const handleClearSelection = useCallback(() => {
        setSelectedURLs(new Set());
    }, []);

    // ===================================================================
    // ACTIONS
    // ===================================================================

    // Get selected tournament IDs
    const getSelectedTournamentIds = useCallback((): number[] => {
        const ids: number[] = [];
        filteredURLs.forEach(url => {
            if (selectedURLs.has(url.url) && url.tournamentId) {
                ids.push(url.tournamentId);
            }
        });
        return ids.sort((a, b) => a - b);
    }, [filteredURLs, selectedURLs]);

    // Copy IDs to clipboard
    const handleCopyToClipboard = useCallback(async () => {
        const ids = getSelectedTournamentIds();
        if (ids.length === 0) {
            alert('No URLs selected');
            return;
        }
        
        const idString = ids.join(', ');
        
        try {
            await navigator.clipboard.writeText(idString);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
            const textarea = document.createElement('textarea');
            textarea.value = idString;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        }
    }, [getSelectedTournamentIds]);

    // Navigate to ScraperTab with IDs
    const handleSendToScraper = useCallback(() => {
        const ids = getSelectedTournamentIds();
        if (ids.length === 0) {
            alert('No URLs selected');
            return;
        }
        
        const idString = ids.join(', ');
        localStorage.setItem('pendingMultiIds', idString);
        localStorage.setItem('pendingMultiIdsTimestamp', Date.now().toString());
        
        const confirmed = window.confirm(
            `${ids.length} tournament IDs have been prepared for reprocessing.\n\n` +
            `IDs: ${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ` ... and ${ids.length - 10} more` : ''}\n\n` +
            `Click OK to go to the Scraper tab, or Cancel to stay here.\n\n` +
            `The IDs will be automatically loaded into Multi-ID mode.`
        );
        
        if (confirmed) {
            window.location.hash = '#scraper';
        }
    }, [getSelectedTournamentIds]);

    // Bulk update handler
    const handleBulkUpdate = async (newStatus: ScrapeURLStatus, doNotScrape?: boolean) => {
        if (selectedURLs.size === 0) return;
        
        try {
            const urlsToUpdate = filteredURLs
                .filter(u => selectedURLs.has(u.url))
                .map(u => u.url);
            
            await client.graphql({
                query: bulkModifyScrapeURLs,
                variables: {
                    urls: urlsToUpdate,
                    status: newStatus,
                    doNotScrape: doNotScrape ?? undefined
                }
            });
            
            alert(`Updated ${urlsToUpdate.length} URLs`);
            setSelectedURLs(new Set());
            // Reload with same preset
            loadURLs(activePreset);
        } catch (err) {
            console.error('Bulk update failed:', err);
            alert('Failed to update URLs');
        }
    };

    // ===================================================================
    // RENDER
    // ===================================================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-semibold">URL Management</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Search and filter URLs • Select to reprocess
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSkippedAnalyzer(!showSkippedAnalyzer)}
                        className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 flex items-center gap-1"
                    >
                        <AlertTriangle className="h-4 w-4" />
                        Gap Analysis
                    </button>
                </div>
            </div>

            {/* Gap Analysis Panel */}
            {showSkippedAnalyzer && (
                <div className="bg-white rounded-lg shadow-lg border">
                    <SkippedIDsAnalyzer />
                </div>
            )}

            {/* Search Section */}
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center gap-2 mb-4">
                    <Search className="h-5 w-5 text-gray-400" />
                    <h3 className="font-medium">Search URLs</h3>
                    {selectedEntityIds.length === 0 && (
                        <span className="text-sm text-amber-600 ml-2">
                            ⚠ Select an entity first
                        </span>
                    )}
                </div>
                
                {/* Quick Search Buttons */}
                <div className="space-y-3">
                    <p className="text-sm text-gray-600">Quick search by status:</p>
                    <div className="flex flex-wrap gap-2">
                        {SEARCH_PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => handlePresetClick(preset.id)}
                                disabled={loading || selectedEntityIds.length === 0}
                                title={preset.description}
                                className={`
                                    flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                                    transition-all disabled:opacity-50 disabled:cursor-not-allowed
                                    ${activePreset === preset.id 
                                        ? `${preset.bgColor} ${preset.color} ring-2 ring-offset-1 ring-current` 
                                        : `${preset.bgColor} ${preset.color} ${preset.hoverColor}`
                                    }
                                `}
                            >
                                {preset.icon}
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    
                    {/* Load All Button */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={handleLoadAll}
                            disabled={loading || selectedEntityIds.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="h-4 w-4" />
                            Load All URLs
                        </button>
                        
                        {loading && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                {loadingProgress}
                            </div>
                        )}
                        
                        {hasSearched && !loading && (
                            <span className="text-sm text-gray-500">
                                {urls.length} URLs loaded
                                {activePreset && (
                                    <span className="ml-1">
                                        (filtered by: <span className="font-medium">{SEARCH_PRESETS.find(p => p.id === activePreset)?.label}</span>)
                                    </span>
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Additional Filters (only show when data loaded) */}
            {hasSearched && urls.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                    <button
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700"
                    >
                        <Filter className="h-4 w-4" />
                        Additional Filters
                        {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    
                    {showAdvancedFilters && (
                        <div className="mt-3 pt-3 border-t flex flex-wrap gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Game Status</label>
                                <select
                                    value={gameStatusFilter}
                                    onChange={(e) => setGameStatusFilter(e.target.value as any)}
                                    className="px-3 py-1.5 border rounded text-sm"
                                >
                                    <option value="ALL">All Game Statuses</option>
                                    <option value="UNPARSED">Unparsed</option>
                                    {Object.values(GameStatus).map(status => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {gameStatusFilter !== 'ALL' && (
                                <div className="flex items-end">
                                    <button
                                        onClick={() => setGameStatusFilter('ALL')}
                                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                                    >
                                        Clear filter
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Results Summary & Actions */}
            {urls.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-600">
                                {gameStatusFilter !== 'ALL' ? (
                                    <>
                                        <span className="font-medium">{filteredURLs.length}</span>
                                        <span className="text-gray-400"> of </span>
                                        <span>{urls.length}</span> URLs shown
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium">{urls.length}</span> URLs
                                    </>
                                )}
                                {selectedURLs.size > 0 && (
                                    <span className="ml-2 text-blue-600">
                                        • <span className="font-medium">{selectedURLs.size}</span> selected
                                    </span>
                                )}
                            </span>
                            
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSelectVisible}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                    Select All ({filteredURLs.length})
                                </button>
                                {selectedURLs.size > 0 && (
                                    <>
                                        <span className="text-gray-300">|</span>
                                        <button
                                            onClick={handleClearSelection}
                                            className="text-xs text-gray-600 hover:text-gray-800"
                                        >
                                            Clear Selection
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        
                        {/* Action Buttons */}
                        {selectedURLs.size > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyToClipboard}
                                    className={`
                                        px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors
                                        ${copySuccess 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }
                                    `}
                                >
                                    <Copy className="h-4 w-4" />
                                    {copySuccess ? 'Copied!' : 'Copy IDs'}
                                </button>
                                <button
                                    onClick={handleSendToScraper}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1"
                                >
                                    <Play className="h-4 w-4" />
                                    Send to Scraper ({selectedURLs.size})
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Main Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {!hasSearched ? (
                    <div className="p-12 text-center text-gray-500">
                        <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="font-medium text-gray-600">Search for URLs</p>
                        <p className="text-sm mt-1">
                            Use the quick search buttons above to find URLs by status,<br />
                            or click "Load All URLs" to see everything.
                        </p>
                    </div>
                ) : loading ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
                        <p className="mt-2 text-gray-500">{loadingProgress || 'Loading URLs...'}</p>
                    </div>
                ) : filteredURLs.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                        <p className="font-medium">No URLs found</p>
                        {activePreset && (
                            <p className="text-sm mt-1">
                                No URLs match the "{SEARCH_PRESETS.find(p => p.id === activePreset)?.label}" filter
                            </p>
                        )}
                        <button
                            onClick={handleLoadAll}
                            className="mt-3 text-blue-600 hover:text-blue-800 text-sm underline"
                        >
                            Load all URLs instead
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                                    {selectedEntities.length > 1 && (
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                                    )}
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Scraped</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredURLs.map((url) => (
                                    <tr 
                                        key={url.id} 
                                        className={`hover:bg-gray-50 ${selectedURLs.has(url.url) ? 'bg-blue-50' : ''}`}
                                    >
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedURLs.has(url.url)}
                                                onChange={() => handleToggleURL(url.url)}
                                                className="h-4 w-4"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm font-medium">
                                            {url.tournamentId}
                                        </td>
                                        {selectedEntities.length > 1 && (
                                            <td className="px-4 py-3 text-sm">
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                                                    {entityMap[url.entityId || '']?.entityName || 'Unknown'}
                                                </span>
                                            </td>
                                        )}
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
                                            <span className={`
                                                px-2 py-1 rounded text-xs
                                                ${url.lastScrapeStatus?.toUpperCase() === 'ERROR' ? 'bg-red-100 text-red-700' :
                                                  url.lastScrapeStatus?.toUpperCase() === 'NOT_FOUND' ? 'bg-orange-100 text-orange-700' :
                                                  url.lastScrapeStatus?.toUpperCase() === 'NOT_PUBLISHED' ? 'bg-yellow-100 text-yellow-700' :
                                                  url.lastScrapeStatus?.toUpperCase() === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                                  'bg-gray-100 text-gray-700'
                                                }
                                            `}>
                                                {url.lastScrapeStatus || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {url.lastScrapeMessage ? (
                                                <div 
                                                    className="max-w-xs truncate text-xs text-gray-600"
                                                    title={url.lastScrapeMessage}
                                                >
                                                    {url.lastScrapeMessage}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="text-xs space-y-1">
                                                <div>
                                                    <span className="text-green-600 font-medium">{url.timesSuccessful ?? 0}</span>
                                                    <span className="text-gray-400"> / </span>
                                                    <span className="text-red-600 font-medium">{url.timesFailed ?? 0}</span>
                                                    <span className="text-gray-400"> / </span>
                                                    <span className="text-gray-500">{url.timesScraped ?? 0}</span>
                                                </div>
                                                {(url.consecutiveFailures ?? 0) > 0 && (
                                                    <div className="text-red-600 font-medium">
                                                        ⚠ {url.consecutiveFailures} consecutive
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
                                                title="Open URL"
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bulk Actions (when selected) */}
            {selectedURLs.size > 0 && (
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl flex items-center gap-4 z-50">
                    <span className="text-sm">
                        <span className="font-medium">{selectedURLs.size}</span> URLs selected
                    </span>
                    <div className="h-4 w-px bg-gray-600" />
                    <button
                        onClick={handleCopyToClipboard}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1"
                    >
                        <Copy className="h-4 w-4" />
                        Copy IDs
                    </button>
                    <button
                        onClick={handleSendToScraper}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1"
                    >
                        <Play className="h-4 w-4" />
                        Reprocess
                    </button>
                    <button
                        onClick={() => handleBulkUpdate(ScrapeURLStatus.ACTIVE)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                    >
                        Mark Active
                    </button>
                    <button
                        onClick={() => handleBulkUpdate(ScrapeURLStatus.DO_NOT_SCRAPE, true)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                    >
                        Do Not Scrape
                    </button>
                </div>
            )}
        </div>
    );
};