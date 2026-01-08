// src/components/scraper/admin/SkippedIDsAnalyzer.tsx
// Modernized version using useGameIdTracking hook with server-side gap detection
// UPDATED: Added skipNotPublished checkbox to exclude NOT_PUBLISHED IDs from gaps

import React, { useState, useCallback, useEffect } from 'react';
import { 
    AlertTriangle, 
    Search, 
    Download, 
    ChevronRight, 
    ChevronDown,
    RefreshCw,
    TrendingUp,
    Database,
    Clock
} from 'lucide-react';
import { 
    useGameIdTracking,
    generateURLsForGaps,
    getGapsSummary,
    type GapRange 
} from '../../../hooks/useGameIdTracking';
import { useEntity } from '../../../contexts/EntityContext';

export const SkippedIDsAnalyzer: React.FC = () => {
    const { currentEntity } = useEntity();
    const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());
    const [selectedRanges, setSelectedRanges] = useState<Set<string>>(new Set());
    const [customRange, setCustomRange] = useState({ start: '', end: '' });
    const [forceRefresh, setForceRefresh] = useState(false);
    const [skipNotPublished, setSkipNotPublished] = useState(true); // Default to skip NOT_PUBLISHED
    
    // Use the new hook
    const {
        loading,
        error,
        scrapingStatus,
        getScrapingStatus,
        hasData
    } = useGameIdTracking(currentEntity?.id);
    
    const handleAnalyze = useCallback(async () => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }
        
        try {
            const startId = customRange.start ? parseInt(customRange.start) : undefined;
            const endId = customRange.end ? parseInt(customRange.end) : undefined;
            
            await getScrapingStatus({
                entityId: currentEntity.id,
                forceRefresh,
                startId,
                endId,
                skipNotPublished
            });
            
            // Reset force refresh after use
            setForceRefresh(false);
        } catch (err) {
            console.error('Error analyzing gaps:', err);
            alert('Error analyzing gaps. Check console for details.');
        }
    }, [currentEntity, customRange, forceRefresh, skipNotPublished, getScrapingStatus]);
    
    // Auto-load on mount if entity is selected
    useEffect(() => {
        if (currentEntity && !hasData) {
            handleAnalyze();
        }
    }, [currentEntity, hasData, handleAnalyze]);

    const toggleRangeExpanded = (rangeKey: string) => {
        const newExpanded = new Set(expandedRanges);
        if (newExpanded.has(rangeKey)) {
            newExpanded.delete(rangeKey);
        } else {
            newExpanded.add(rangeKey);
        }
        setExpandedRanges(newExpanded);
    };
    
    const toggleRangeSelected = (rangeKey: string) => {
        const newSelected = new Set(selectedRanges);
        if (newSelected.has(rangeKey)) {
            newSelected.delete(rangeKey);
        } else {
            newSelected.add(rangeKey);
        }
        setSelectedRanges(newSelected);
    };
    
    const exportSelectedToCSV = () => {
        if (!scrapingStatus || selectedRanges.size === 0 || !currentEntity) return;
        
        const selectedGaps = scrapingStatus.gaps.filter(gap => 
            selectedRanges.has(`${gap.start}-${gap.end}`)
        );
        
        let csvContent = "Tournament ID,URL\n";
        selectedGaps.forEach(gap => {
            for (let id = gap.start; id <= gap.end; id++) {
                const url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${id}`;
                csvContent += `${id},"${url}"\n`;
            }
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gap_analysis_${currentEntity.entityName}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };
    
    const queueSelectedForScraping = async () => {
        if (!currentEntity || !scrapingStatus || selectedRanges.size === 0) return;
        
        const selectedGaps = scrapingStatus.gaps.filter(gap => 
            selectedRanges.has(`${gap.start}-${gap.end}`)
        );
        
        const urls = generateURLsForGaps(selectedGaps, currentEntity);
        
        // Here you would call a mutation to add these URLs to the scraping queue
        console.log('URLs to queue for scraping:', urls);
        alert(`Would queue ${urls.length} URLs for scraping (not implemented yet)`);
    };
    
    const getRangeSeverity = (gap: GapRange): 'low' | 'medium' | 'high' => {
        if (gap.count >= 100) return 'high';
        if (gap.count >= 10) return 'medium';
        return 'low';
    };
    
    const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
        switch (severity) {
            case 'high': return 'text-red-600 bg-red-50';
            case 'medium': return 'text-yellow-600 bg-yellow-50';
            case 'low': return 'text-green-600 bg-green-50';
        }
    };
    
    const formatCacheAge = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
    };
    
    return (
        <div className="space-y-4">
            {/* Analysis Controls */}
            <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Database className="h-5 w-5 mr-2 text-blue-600" />
                    Tournament ID Gap Analysis
                    <span className="ml-2 text-xs font-normal text-gray-500">
                        (Powered by server-side processing)
                    </span>
                </h3>
                
                <div className="space-y-4">
                    <div className="flex items-end space-x-3">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                ID Range (optional)
                            </label>
                            <div className="flex space-x-2">
                                <input
                                    type="number"
                                    placeholder="Start ID"
                                    value={customRange.start}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={loading}
                                />
                                <span className="flex items-center px-2">to</span>
                                <input
                                    type="number"
                                    placeholder="End ID"
                                    value={customRange.end}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                    disabled={loading}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to analyze the full range of stored tournaments
                            </p>
                        </div>
                        
                        <div className="flex flex-col space-y-2">
                            <div className="flex space-x-4">
                                <label className="flex items-center text-sm text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={forceRefresh}
                                        onChange={(e) => setForceRefresh(e.target.checked)}
                                        className="mr-2"
                                        disabled={loading}
                                    />
                                    Force Refresh
                                </label>
                                <label className="flex items-center text-sm text-gray-600">
                                    <input
                                        type="checkbox"
                                        checked={skipNotPublished}
                                        onChange={(e) => setSkipNotPublished(e.target.checked)}
                                        className="mr-2"
                                        disabled={loading}
                                    />
                                    Skip NOT_PUBLISHED
                                </label>
                            </div>
                            <button
                                onClick={handleAnalyze}
                                disabled={loading || !currentEntity}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Search className="h-4 w-4 mr-2" />
                                        Analyze
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {/* Skip NOT_PUBLISHED explanation */}
                    {skipNotPublished && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                            <strong>Skip NOT_PUBLISHED:</strong> Tournament IDs that were previously scraped but found to be 
                            NOT_PUBLISHED will not appear as gaps. Uncheck to see all missing IDs regardless of previous scrape results.
                        </div>
                    )}
                    
                    {!currentEntity && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-800">Please select an entity to analyze tournament ID gaps</p>
                        </div>
                    )}
                    
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                            <p className="text-sm text-red-800">{error.message}</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Results */}
            {scrapingStatus && (
                <div className="bg-white rounded-lg shadow p-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-blue-600">Total Games</span>
                                <Database className="h-4 w-4 text-blue-600" />
                            </div>
                            <p className="text-2xl font-bold text-blue-700">{scrapingStatus.totalGamesStored}</p>
                            <p className="text-xs text-blue-600 mt-1">
                                IDs: {scrapingStatus.lowestTournamentId} - {scrapingStatus.highestTournamentId}
                            </p>
                        </div>
                        
                        <div className="p-4 bg-green-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-green-600">Coverage</span>
                                <TrendingUp className="h-4 w-4 text-green-600" />
                            </div>
                            <p className="text-2xl font-bold text-green-700">
                                {scrapingStatus.gapSummary.coveragePercentage.toFixed(1)}%
                            </p>
                            <p className="text-xs text-green-600 mt-1">of ID range</p>
                        </div>
                        
                        <div className="p-4 bg-yellow-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-yellow-600">Missing IDs</span>
                                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            </div>
                            <p className="text-2xl font-bold text-yellow-700">
                                {scrapingStatus.gapSummary.totalMissingIds}
                            </p>
                            <p className="text-xs text-yellow-600 mt-1">
                                in {scrapingStatus.gapSummary.totalGaps} gaps
                            </p>
                        </div>
                        
                        <div className="p-4 bg-purple-50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-purple-600">Unfinished</span>
                                <Clock className="h-4 w-4 text-purple-600" />
                            </div>
                            <p className="text-2xl font-bold text-purple-700">
                                {scrapingStatus.unfinishedGameCount}
                            </p>
                            <p className="text-xs text-purple-600 mt-1">games in progress</p>
                        </div>
                    </div>
                    
                    {/* Summary Text */}
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium mb-2 flex items-center">
                            Analysis Summary
                            {scrapingStatus.cacheAge > 0 && (
                                <span className="ml-2 text-xs text-gray-500 font-normal flex items-center">
                                    <Clock className="h-3 w-3 mr-1" />
                                    Cached ({formatCacheAge(scrapingStatus.cacheAge)} ago)
                                </span>
                            )}
                        </h4>
                        <p className="text-sm text-gray-700">{getGapsSummary(scrapingStatus)}</p>
                        
                        <div className="flex items-center space-x-4 mt-3 text-xs">
                            <span className="flex items-center">
                                <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
                                Low (&lt;10 IDs)
                            </span>
                            <span className="flex items-center">
                                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></div>
                                Medium (10-99 IDs)
                            </span>
                            <span className="flex items-center">
                                <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
                                High (100+ IDs)
                            </span>
                        </div>
                    </div>
                    
                    {/* Action Bar */}
                    {selectedRanges.size > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                            <span className="text-sm text-blue-700">
                                {selectedRanges.size} gap(s) selected ({
                                    scrapingStatus.gaps
                                        .filter(gap => selectedRanges.has(`${gap.start}-${gap.end}`))
                                        .reduce((sum, gap) => sum + gap.count, 0)
                                } missing IDs)
                            </span>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={exportSelectedToCSV}
                                    className="px-3 py-1 bg-white text-blue-600 border border-blue-300 rounded text-sm hover:bg-blue-50 flex items-center"
                                >
                                    <Download className="h-3 w-3 mr-1" />
                                    Export CSV
                                </button>
                                <button
                                    onClick={queueSelectedForScraping}
                                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                >
                                    Queue for Scraping
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Gap Ranges */}
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {scrapingStatus.gaps.length > 0 ? (
                            scrapingStatus.gaps.map((gap) => {
                                const rangeKey = `${gap.start}-${gap.end}`;
                                const isExpanded = expandedRanges.has(rangeKey);
                                const isSelected = selectedRanges.has(rangeKey);
                                const severity = getRangeSeverity(gap);
                                
                                return (
                                    <div key={rangeKey} className="border rounded-lg overflow-hidden">
                                        <div className={`p-3 flex items-center justify-between ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                                            <div className="flex items-center space-x-3">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleRangeSelected(rangeKey)}
                                                    className="h-4 w-4"
                                                />
                                                <button
                                                    onClick={() => toggleRangeExpanded(rangeKey)}
                                                    className="p-1 hover:bg-gray-100 rounded"
                                                >
                                                    {isExpanded ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </button>
                                                <span className="font-medium text-sm">
                                                    {gap.start === gap.end ? (
                                                        `ID ${gap.start}`
                                                    ) : (
                                                        `IDs ${gap.start} - ${gap.end}`
                                                    )}
                                                </span>
                                                <span className={`px-2 py-1 rounded-full text-xs ${getSeverityColor(severity)}`}>
                                                    {gap.count} missing
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {isExpanded && (
                                            <div className="border-t p-3 bg-gray-50">
                                                <div className="grid grid-cols-6 gap-2 text-xs">
                                                    {Array.from({ length: Math.min(gap.count, 50) }, (_, i) => gap.start + i).map(id => (
                                                        <a
                                                            key={id}
                                                            href={`${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}?id=${id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 hover:underline"
                                                        >
                                                            #{id}
                                                        </a>
                                                    ))}
                                                    {gap.count > 50 && (
                                                        <span className="text-gray-500 col-span-6">
                                                            ... and {gap.count - 50} more
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-gray-500">
                                <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                                <p className="font-medium">No gaps found!</p>
                                <p className="text-sm mt-1">
                                    All tournament IDs from {scrapingStatus.lowestTournamentId} to {scrapingStatus.highestTournamentId} have been processed.
                                </p>
                            </div>
                        )}
                    </div>
                    
                    {/* Metadata Footer */}
                    <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                        <div className="flex items-center justify-between">
                            <span>
                                Last updated: {new Date(scrapingStatus.lastUpdated).toLocaleString()}
                            </span>
                            <button
                                onClick={() => {
                                    setForceRefresh(true);
                                    handleAnalyze();
                                }}
                                disabled={loading}
                                className="text-blue-600 hover:text-blue-800 flex items-center"
                            >
                                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                                Force Refresh
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};