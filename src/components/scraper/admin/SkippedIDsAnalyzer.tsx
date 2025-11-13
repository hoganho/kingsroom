// src/components/scraper/admin/SkippedIDsAnalyzer.tsx

import React, { useState, useCallback } from 'react';
import { AlertTriangle, Search, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { findSkippedTournamentIds, generateURLsForSkippedIds, getSkippedIdsSummary } from '../../../utils/findSkippedIds';
import type { SkippedIDsResult, SkippedIDRange } from '../../../utils/findSkippedIds';
import { useEntity } from '../../../contexts/EntityContext';

export const SkippedIDsAnalyzer: React.FC = () => {
    const { currentEntity } = useEntity();
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<SkippedIDsResult | null>(null);
    const [expandedRanges, setExpandedRanges] = useState<Set<string>>(new Set());
    const [selectedRanges, setSelectedRanges] = useState<Set<string>>(new Set());
    const [customRange, setCustomRange] = useState({ start: '', end: '' });
    
    const analyzeSkippedIds = useCallback(async () => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }
        
        setAnalyzing(true);
        try {
            const startId = customRange.start ? parseInt(customRange.start) : undefined;
            const endId = customRange.end ? parseInt(customRange.end) : undefined;
            
            const analysisResult = await findSkippedTournamentIds(currentEntity.id, {
                startId,
                endId,
                maxGapsToReturn: 50
            });
            
            setResult(analysisResult);
        } catch (error) {
            console.error('Error analyzing skipped IDs:', error);
            alert('Error analyzing skipped IDs. Check console for details.');
        } finally {
            setAnalyzing(false);
        }
    }, [currentEntity, customRange]);
    
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
        if (!result || selectedRanges.size === 0) return;
        
        const selectedData = result.skippedRanges.filter(range => 
            selectedRanges.has(`${range.start}-${range.end}`)
        );
        
        let csvContent = "Tournament ID,URL\n";
        selectedData.forEach(range => {
            for (let id = range.start; id <= range.end; id++) {
                const url = `${currentEntity?.gameUrlDomain}${currentEntity?.gameUrlPath}?id=${id}`;
                csvContent += `${id},"${url}"\n`;
            }
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skipped_ids_${currentEntity?.entityName}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };
    
    const queueSelectedForScraping = async () => {
        if (!currentEntity || !result || selectedRanges.size === 0) return;
        
        const selectedData = result.skippedRanges.filter(range => 
            selectedRanges.has(`${range.start}-${range.end}`)
        );
        
        const urls = generateURLsForSkippedIds(selectedData, currentEntity);
        
        // Here you would call a mutation to add these URLs to the scraping queue
        console.log('URLs to queue for scraping:', urls);
        alert(`Would queue ${urls.length} URLs for scraping (not implemented yet)`);
    };
    
    const getRangeSeverity = (range: SkippedIDRange): 'low' | 'medium' | 'high' => {
        if (range.count >= 100) return 'high';
        if (range.count >= 10) return 'medium';
        return 'low';
    };
    
    const getSeverityColor = (severity: 'low' | 'medium' | 'high') => {
        switch (severity) {
            case 'high': return 'text-red-600 bg-red-50';
            case 'medium': return 'text-yellow-600 bg-yellow-50';
            case 'low': return 'text-green-600 bg-green-50';
        }
    };
    
    return (
        <div className="space-y-4">
            {/* Analysis Controls */}
            <div className="bg-white rounded-lg shadow p-4">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                    Skipped IDs Analyzer
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
                                />
                                <span className="flex items-center px-2">to</span>
                                <input
                                    type="number"
                                    placeholder="End ID"
                                    value={customRange.end}
                                    onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Leave empty to analyze from 1 to the last scanned ID
                            </p>
                        </div>
                        
                        <button
                            onClick={analyzeSkippedIds}
                            disabled={analyzing || !currentEntity}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                            {analyzing ? (
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
                    
                    {!currentEntity && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="text-sm text-yellow-800">Please select an entity to analyze skipped IDs</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Results */}
            {result && (
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="mb-4">
                        <h4 className="font-medium mb-2">Analysis Summary</h4>
                        <p className="text-sm text-gray-600">{getSkippedIdsSummary(result)}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs">
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
                    
                    {selectedRanges.size > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                            <span className="text-sm text-blue-700">
                                {selectedRanges.size} range(s) selected
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
                    
                    {/* Skipped Ranges */}
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {result.skippedRanges.map((range) => {
                            const rangeKey = `${range.start}-${range.end}`;
                            const isExpanded = expandedRanges.has(rangeKey);
                            const isSelected = selectedRanges.has(rangeKey);
                            const severity = getRangeSeverity(range);
                            
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
                                                {range.start === range.end ? (
                                                    `ID ${range.start}`
                                                ) : (
                                                    `IDs ${range.start} - ${range.end}`
                                                )}
                                            </span>
                                            <span className={`px-2 py-1 rounded-full text-xs ${getSeverityColor(severity)}`}>
                                                {range.count} missing
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {isExpanded && (
                                        <div className="border-t p-3 bg-gray-50">
                                            <div className="grid grid-cols-6 gap-2 text-xs">
                                                {Array.from({ length: Math.min(range.count, 50) }, (_, i) => range.start + i).map(id => (
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
                                                {range.count > 50 && (
                                                    <span className="text-gray-500 col-span-6">
                                                        ... and {range.count - 50} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {result.skippedRanges.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                            <p>No skipped IDs found!</p>
                            <p className="text-sm mt-1">All tournament IDs in the range have been processed.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};