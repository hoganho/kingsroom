// src/components/scraper/admin/SkippedIDsAnalyzer.tsx
// Modernized version using useGameIdTracking hook with server-side gap detection
// UPDATED: Added URL Status Grid button for visual ID visualization

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
    Clock,
    Grid3X3
} from 'lucide-react';
import { 
    useGameIdTracking,
    generateURLsForGaps,
    getGapsSummary,
    type GapRange 
} from '../../../hooks/useGameIdTracking';
import { useEntity } from '../../../contexts/EntityContext';
import { URLStatusGrid } from './URLStatusGrid';

export const SkippedIDsAnalyzer: React.FC = () => {
    const { currentEntity } = useEntity();
    const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());
    const [selectedRanges, setSelectedRanges] = useState<Set<string>>(new Set());
    const [customRange, setCustomRange] = useState({ start: '', end: '' });
    const [forceRefresh, setForceRefresh] = useState(false);
    const [skipNotPublished, setSkipNotPublished] = useState(true); // Default to skip NOT_PUBLISHED
    const [showStatusGrid, setShowStatusGrid] = useState(false);
    
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                        <Database className="h-5 w-5 mr-2 text-blue-600" />
                        Tournament ID Gap Analysis
                        <span className="ml-2 text-xs font-normal text-gray-500">
                            (Powered by server-side processing)
                        </span>
                    </h3>
                    
                    {/* URL Status Grid Button */}
                    <button
                        onClick={() => setShowStatusGrid(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Grid3X3 className="h-4 w-4" />
                        Visual Grid
                    </button>
                </div>
                
                {/* Custom Range Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Start ID (optional)</label>
                        <input
                            type="number"
                            value={customRange.start}
                            onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                            placeholder="e.g., 1000"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">End ID (optional)</label>
                        <input
                            type="number"
                            value={customRange.end}
                            onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                            placeholder="e.g., 2000"
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={skipNotPublished}
                                onChange={(e) => setSkipNotPublished(e.target.checked)}
                                className="h-4 w-4 text-blue-600 rounded"
                            />
                            <span className="text-sm text-gray-700">Skip NOT_PUBLISHED</span>
                        </label>
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            onClick={handleAnalyze}
                            disabled={loading || !currentEntity}
                            className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Search className="h-4 w-4 mr-2" />
                            )}
                            Analyze Gaps
                        </button>
                    </div>
                </div>
                
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">
                        <AlertTriangle className="h-4 w-4 inline mr-2" />
                        {error.message}
                    </div>
                )}
            </div>
            
            {/* Results */}
            {scrapingStatus && (
                <div className="bg-white rounded-lg shadow p-4">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                                {scrapingStatus.totalGamesStored.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-600">Total Games Stored</div>
                        </div>
                        <div className="p-3 bg-orange-50 rounded-lg">
                            <div className="text-2xl font-bold text-orange-600">
                                {scrapingStatus.gapSummary.totalMissingIds.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-600">Missing IDs</div>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                                {scrapingStatus.gapSummary.totalGaps.toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-600">Gap Ranges</div>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                            <div className="text-2xl font-bold text-green-600 flex items-center">
                                <TrendingUp className="h-5 w-5 mr-1" />
                                {scrapingStatus.gapSummary.coveragePercentage.toFixed(1)}%
                            </div>
                            <div className="text-xs text-gray-600">Coverage</div>
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
            
            {/* URL Status Grid Modal */}
            <URLStatusGrid 
                isOpen={showStatusGrid} 
                onClose={() => setShowStatusGrid(false)} 
            />
        </div>
    );
};