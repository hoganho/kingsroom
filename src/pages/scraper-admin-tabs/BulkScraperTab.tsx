// src/pages/scraper-admin-tabs/BulkScraperTabEnhanced.tsx
// Enhanced version with batch processing support, S3 cache statistics, and gap-based scraping

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Database, AlertCircle, CheckCircle, XCircle, Building2, HardDrive, TrendingUp, Zap } from 'lucide-react';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { GameStatus, Venue } from '../../API';
import { useEntity } from '../../contexts/EntityContext';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { fetchGameDataFromBackend, saveGameDataToBackend } from '../../services/gameService';
import { useGameIdTracking, formatGapRanges } from '../../hooks/useGameIdTracking';

interface BulkScrapeResult {
    id: number;
    url: string;
    status: 'pending' | 'fetching' | 'saving' | 'success' | 'error' | 'skipped';
    message?: string;
    gameName?: string;
    gameStatus?: GameStatus;
    source?: string;
    usedCache?: boolean;
}

// Extended type to handle S3 cache fields from backend response
interface ScrapedGameDataWithCache {
    id?: string;
    name?: string;
    gameStatus?: string;
    registrationStatus?: string;
    prizepool?: number;
    totalEntries?: number;
    source?: string;
    usedCache?: boolean;
    isInactive?: boolean;
    s3Key?: string;
    [key: string]: any;
}

export const BulkScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const { currentEntity } = useEntity();
    
    // Initialize the gap tracking hook
    const {
        scrapingStatus,
        getScrapingStatus,
    } = useGameIdTracking(currentEntity?.id);
    
    const [startId, setStartId] = useState('');
    const [endId, setEndId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<BulkScrapeResult[]>([]);
    const [currentProcessingId, setCurrentProcessingId] = useState<number | null>(null);
    const [selectedVenueId, setSelectedVenueId] = useState('');
    const [venues, setVenues] = useState<Venue[]>([]);
    const [skipExisting, setSkipExisting] = useState(true);
    const [forceRefresh, setForceRefresh] = useState(false);
    const [batchSize, setBatchSize] = useState(5);
    const [scrapeMode, setScrapeMode] = useState<'range' | 'gaps'>('range');
    const [selectedGapIndex, setSelectedGapIndex] = useState<number>(0);
    
    // S3 Cache statistics
    const [cacheStats, setCacheStats] = useState<{
        enabled: boolean;
        hits: number;
        misses: number;
        rate: number;
    }>({ enabled: false, hits: 0, misses: 0, rate: 0 });
    
    // Summary statistics
    const [summary, setSummary] = useState({
        total: 0,
        success: 0,
        errors: 0,
        skipped: 0,
        pending: 0
    });

    // Load gap analysis on entity change
    useEffect(() => {
        if (currentEntity?.id) {
            loadGapAnalysis();
        }
    }, [currentEntity?.id]);

    const loadGapAnalysis = async () => {
        if (!currentEntity?.id) return;
        
        try {
            await getScrapingStatus({ entityId: currentEntity.id });
        } catch (error) {
            console.error('Error loading gap analysis:', error);
        }
    };

    // Fetch venues filtered by entity
    useEffect(() => {
        if (!currentEntity) return;
        
        const fetchVenues = async () => {
            try {
                const response = await client.graphql({ 
                    query: listVenuesForDropdown,
                    variables: {
                        filter: {
                            entityId: { eq: currentEntity.id },
                            isSpecial: { ne: true }
                        }
                    }
                }) as any;
                
                const venueItems = (response.data?.listVenues?.items as Venue[])
                    .filter(Boolean)
                    .sort((a, b) => {
                        if (a.venueNumber !== undefined && b.venueNumber !== undefined) {
                            return a.venueNumber - b.venueNumber;
                        }
                        return a.name.localeCompare(b.name);
                    });
                
                setVenues(venueItems);
                
                // Auto-select first venue if available
                if (venueItems.length > 0 && !selectedVenueId) {
                    setSelectedVenueId(venueItems[0].id);
                }
            } catch (error) {
                console.error('Error fetching venues:', error);
            }
        };
        
        fetchVenues();
    }, [client, currentEntity]);

    // Update summary whenever results change
    useEffect(() => {
        const newSummary = {
            total: results.length,
            success: results.filter(r => r.status === 'success').length,
            errors: results.filter(r => r.status === 'error').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            pending: results.filter(r => r.status === 'pending' || r.status === 'fetching' || r.status === 'saving').length
        };
        setSummary(newSummary);
    }, [results]);

    const checkExistingGame = async (tournamentId: number): Promise<boolean> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    query CheckGame($tournamentId: Int!) {
                        listGames(filter: { tournamentId: { eq: $tournamentId } }, limit: 1) {
                            items {
                                id
                                gameStatus
                            }
                        }
                    }
                `,
                variables: { tournamentId }
            });
            
            if ('data' in response) {
                const games = response.data?.listGames?.items || [];
                return games.length > 0;
            }
            
            return false;
        } catch (error) {
            console.error(`Error checking game ${tournamentId}:`, error);
            return false;
        }
    };

    const processGame = async (id: number, url: string): Promise<void> => {
        const resultIndex = results.findIndex(r => r.id === id);
        
        try {
            // Update status to fetching
            setResults(prev => {
                const newResults = [...prev];
                newResults[resultIndex].status = 'fetching';
                return newResults;
            });
            
            // Fetch the game data - cast to extended type
            const fetchResult = await fetchGameDataFromBackend(url, currentEntity?.id) as ScrapedGameDataWithCache;
            
            // Track cache usage - check if response has cache info
            if ('source' in fetchResult && fetchResult.source) {
                if (fetchResult.source === 'S3_CACHE' || fetchResult.usedCache) {
                    setCacheStats(prev => ({
                        ...prev,
                        enabled: true,
                        hits: prev.hits + 1,
                        rate: Math.round(((prev.hits + 1) / (prev.hits + prev.misses + 1)) * 100)
                    }));
                } else {
                    setCacheStats(prev => ({
                        ...prev,
                        enabled: true,
                        misses: prev.misses + 1,
                        rate: Math.round((prev.hits / (prev.hits + prev.misses + 1)) * 100)
                    }));
                }
            }
            
            // Check if game is inactive or missing required data
            if (fetchResult.isInactive) {
                setResults(prev => {
                    const newResults = [...prev];
                    newResults[resultIndex].status = 'skipped';
                    newResults[resultIndex].message = 'Game is inactive';
                    return newResults;
                });
                return;
            }
            
            // Update status to saving
            setResults(prev => {
                const newResults = [...prev];
                newResults[resultIndex].status = 'saving';
                newResults[resultIndex].gameName = fetchResult.name;
                newResults[resultIndex].gameStatus = fetchResult.gameStatus as GameStatus;
                newResults[resultIndex].source = fetchResult.source || 'LIVE';
                return newResults;
            });
            
            // Save the game data - convert to expected format
            const gameData = {
                ...fetchResult,
                s3Key: fetchResult.s3Key || '',
            } as any;
            
            try {
                await saveGameDataToBackend(
                    url,
                    selectedVenueId,
                    gameData,
                    null, // options parameter
                    currentEntity?.id || ''
                );
                
                setResults(prev => {
                    const newResults = [...prev];
                    newResults[resultIndex].status = 'success';
                    newResults[resultIndex].message = 'Saved successfully';
                    return newResults;
                });
            } catch (saveError) {
                throw new Error(saveError instanceof Error ? saveError.message : 'Failed to save');
            }
            
        } catch (error) {
            setResults(prev => {
                const newResults = [...prev];
                newResults[resultIndex].status = 'error';
                newResults[resultIndex].message = error instanceof Error ? error.message : 'Unknown error';
                return newResults;
            });
        }
    };

    const handleBulkScrape = async () => {
        if (!currentEntity || !selectedVenueId) {
            alert('Please select both an entity and a venue');
            return;
        }
        
        let idsToProcess: number[] = [];
        
        if (scrapeMode === 'gaps' && scrapingStatus?.gaps && scrapingStatus.gaps.length > 0) {
            // Use selected gap
            const selectedGap = scrapingStatus.gaps[selectedGapIndex];
            if (!selectedGap) {
                alert('No gap selected');
                return;
            }
            
            // Generate IDs from gap range
            for (let id = selectedGap.start; id <= selectedGap.end; id++) {
                idsToProcess.push(id);
            }
            
            console.log(`Processing gap ${selectedGap.start}-${selectedGap.end} (${idsToProcess.length} IDs)`);
        } else {
            // Use manual range
            const start = parseInt(startId);
            const end = parseInt(endId);
            
            if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
                alert('Please enter a valid ID range');
                return;
            }
            
            for (let id = start; id <= end; id++) {
                idsToProcess.push(id);
            }
        }
        
        setIsProcessing(true);
        setResults([]);
        setCacheStats({ enabled: false, hits: 0, misses: 0, rate: 0 });
        
        // Initialize results
        const initialResults: BulkScrapeResult[] = idsToProcess.map(id => ({
            id,
            url: `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${id}`,
            status: 'pending'
        }));
        setResults(initialResults);
        
        // Process in batches
        for (let i = 0; i < idsToProcess.length; i += batchSize) {
            const batch = idsToProcess.slice(i, i + batchSize);
            
            await Promise.all(
                batch.map(async (id) => {
                    setCurrentProcessingId(id);
                    
                    // Check if game already exists
                    if (skipExisting) {
                        const exists = await checkExistingGame(id);
                        if (exists) {
                            setResults(prev => {
                                const newResults = [...prev];
                                const idx = newResults.findIndex(r => r.id === id);
                                if (idx >= 0) {
                                    newResults[idx].status = 'skipped';
                                    newResults[idx].message = 'Already exists';
                                }
                                return newResults;
                            });
                            return;
                        }
                    }
                    
                    const url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${id}`;
                    await processGame(id, url);
                })
            );
            
            // Small delay between batches
            if (i + batchSize < idsToProcess.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        setIsProcessing(false);
        setCurrentProcessingId(null);
        
        // Reload gap analysis after completion
        await loadGapAnalysis();
    };

    const getStatusColor = (status: BulkScrapeResult['status']) => {
        switch (status) {
            case 'success': return 'bg-green-50 border-green-200';
            case 'error': return 'bg-red-50 border-red-200';
            case 'skipped': return 'bg-yellow-50 border-yellow-200';
            case 'pending': return 'bg-gray-50 border-gray-200';
            case 'fetching': return 'bg-blue-50 border-blue-200';
            case 'saving': return 'bg-purple-50 border-purple-200';
            default: return 'bg-white border-gray-200';
        }
    };

    const getStatusIcon = (status: BulkScrapeResult['status']) => {
        switch (status) {
            case 'success':
                return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'error':
                return <XCircle className="h-5 w-5 text-red-600" />;
            case 'skipped':
                return <AlertCircle className="h-5 w-5 text-yellow-600" />;
            case 'fetching':
            case 'saving':
                return (
                    <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                );
            default:
                return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Entity Selector */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center mb-4">
                    <Building2 className="h-5 w-5 mr-2 text-blue-600" />
                    <h3 className="text-lg font-semibold">Entity Selection</h3>
                </div>
                <EntitySelector />
            </div>

            {/* Gap Analysis Section */}
            {currentEntity && scrapingStatus && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
                        Coverage Analysis for {currentEntity.entityName}
                    </h3>
                    
                    <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <p className="text-sm text-blue-600 font-medium">Total Games</p>
                            <p className="text-2xl font-bold text-blue-900">{scrapingStatus.totalGamesStored}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                            <p className="text-sm text-green-600 font-medium">Coverage</p>
                            <p className="text-2xl font-bold text-green-900">{scrapingStatus.gapSummary.coveragePercentage.toFixed(1)}%</p>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg">
                            <p className="text-sm text-orange-600 font-medium">Missing IDs</p>
                            <p className="text-2xl font-bold text-orange-900">{scrapingStatus.gapSummary.totalMissingIds}</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                            <p className="text-sm text-purple-600 font-medium">Total Gaps</p>
                            <p className="text-2xl font-bold text-purple-900">{scrapingStatus.gapSummary.totalGaps}</p>
                        </div>
                    </div>
                    
                    {scrapingStatus.gaps.length > 0 && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800 mb-2">
                                <strong>Gap ranges available:</strong> {formatGapRanges(scrapingStatus.gaps)}
                            </p>
                            {scrapingStatus.gapSummary.largestGapStart && (
                                <p className="text-sm text-blue-700">
                                    Largest gap: {scrapingStatus.gapSummary.largestGapStart}-{scrapingStatus.gapSummary.largestGapEnd} 
                                    ({scrapingStatus.gapSummary.largestGapCount} IDs)
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Control Panel */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Database className="h-5 w-5 mr-2 text-blue-600" />
                    Bulk Scraper Controls
                </h3>
                
                {!currentEntity ? (
                    <p className="text-gray-500">Please select an entity to continue</p>
                ) : (
                    <>
                        {/* Scrape Mode Selection */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Scrape Mode
                            </label>
                            <div className="flex space-x-4">
                                <button
                                    onClick={() => setScrapeMode('range')}
                                    disabled={isProcessing}
                                    className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                        scrapeMode === 'range'
                                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                    } disabled:opacity-50`}
                                >
                                    <div className="flex items-center justify-center">
                                        <Database className="h-4 w-4 mr-2" />
                                        Manual Range
                                    </div>
                                </button>
                                <button
                                    onClick={() => setScrapeMode('gaps')}
                                    disabled={isProcessing || !scrapingStatus?.gaps || scrapingStatus.gaps.length === 0}
                                    className={`flex-1 px-4 py-2 rounded-md border-2 transition-colors ${
                                        scrapeMode === 'gaps'
                                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                                            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                                    } disabled:opacity-50`}
                                >
                                    <div className="flex items-center justify-center">
                                        <Zap className="h-4 w-4 mr-2" />
                                        Fill Gaps ({scrapingStatus?.gaps?.length || 0})
                                    </div>
                                </button>
                            </div>
                        </div>

                        {scrapeMode === 'range' ? (
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Start ID
                                    </label>
                                    <input
                                        type="number"
                                        value={startId}
                                        onChange={(e) => setStartId(e.target.value)}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                        placeholder="e.g., 1"
                                        min="1"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        End ID
                                    </label>
                                    <input
                                        type="number"
                                        value={endId}
                                        onChange={(e) => setEndId(e.target.value)}
                                        disabled={isProcessing}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                        placeholder="e.g., 100"
                                        min="1"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Select Gap to Fill
                                </label>
                                <select
                                    value={selectedGapIndex}
                                    onChange={(e) => setSelectedGapIndex(parseInt(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                >
                                    {scrapingStatus?.gaps?.map((gap, index) => (
                                        <option key={index} value={index}>
                                            Gap {index + 1}: {gap.start}-{gap.end} ({gap.count} IDs)
                                        </option>
                                    ))}
                                </select>
                                {scrapingStatus?.gaps && scrapingStatus.gaps[selectedGapIndex] && (
                                    <p className="text-sm text-gray-600 mt-1">
                                        Will scrape {scrapingStatus.gaps[selectedGapIndex].count} tournament IDs
                                    </p>
                                )}
                            </div>
                        )}
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Default Venue
                                </label>
                                <select
                                    value={selectedVenueId}
                                    onChange={(e) => setSelectedVenueId(e.target.value)}
                                    disabled={isProcessing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                >
                                    <option value="">Select a venue</option>
                                    {venues.map((venue) => (
                                        <option key={venue.id} value={venue.id}>
                                            {venue.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Batch Size
                                </label>
                                <input
                                    type="number"
                                    value={batchSize}
                                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                    min="1"
                                    max="20"
                                />
                            </div>
                        </div>
                        
                        <div className="mb-4 space-y-2">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="skipExisting"
                                    checked={skipExisting}
                                    onChange={(e) => setSkipExisting(e.target.checked)}
                                    disabled={isProcessing}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded disabled:opacity-50"
                                />
                                <label htmlFor="skipExisting" className="ml-2 text-sm text-gray-700">
                                    Skip existing games
                                </label>
                            </div>
                            
                            <div className="flex items-center">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="forceRefresh"
                                        checked={forceRefresh}
                                        onChange={(e) => setForceRefresh(e.target.checked)}
                                        disabled={isProcessing}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded disabled:opacity-50"
                                    />
                                    <label htmlFor="forceRefresh" className="ml-2 text-sm text-gray-700">
                                        Force refresh (bypass S3 cache)
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        {/* Cache info banner */}
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <HardDrive className="h-4 w-4 mr-2 text-blue-600" />
                                    <span className="text-sm text-blue-700">
                                        S3 Cache: {forceRefresh ? 'Disabled' : 'Enabled'}
                                    </span>
                                </div>
                                <span className="text-xs text-blue-600">
                                    {forceRefresh ? 'Will fetch fresh data from live site' : 'Will use cached data to reduce load'}
                                </span>
                            </div>
                        </div>
                        
                        <button
                            onClick={handleBulkScrape}
                            disabled={isProcessing || !selectedVenueId || (scrapeMode === 'range' && (!startId || !endId))}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            {isProcessing ? 'Processing...' : `Start ${scrapeMode === 'gaps' ? 'Gap' : 'Bulk'} Scrape`}
                        </button>
                    </>
                )}
            </div>

            {/* Statistics Summary */}
            {results.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Processing Summary</h3>
                    
                    <div className="grid grid-cols-5 gap-4 mb-4">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-700">{summary.total}</p>
                            <p className="text-sm text-gray-500">Total</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{summary.success}</p>
                            <p className="text-sm text-gray-500">Success</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-yellow-600">{summary.skipped}</p>
                            <p className="text-sm text-gray-500">Skipped</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-red-600">{summary.errors}</p>
                            <p className="text-sm text-gray-500">Errors</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{summary.pending}</p>
                            <p className="text-sm text-gray-500">Pending</p>
                        </div>
                    </div>
                    
                    {/* S3 Cache Statistics */}
                    {cacheStats.enabled && (cacheStats.hits > 0 || cacheStats.misses > 0) && (
                        <div className="mt-4 pt-4 border-t">
                            <h4 className="font-semibold text-gray-700 mb-2 flex items-center">
                                <HardDrive className="h-4 w-4 mr-2" />
                                S3 Cache Performance
                            </h4>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-600">Cache Hits:</span>
                                    <span className="ml-2 font-bold text-green-600">{cacheStats.hits}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600">Live Fetches:</span>
                                    <span className="ml-2 font-bold text-orange-600">{cacheStats.misses}</span>
                                </div>
                                <div>
                                    <span className="text-gray-600">Hit Rate:</span>
                                    <span className="ml-2 font-bold text-blue-600">{cacheStats.rate}%</span>
                                </div>
                            </div>
                            <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${cacheStats.rate}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Progress Bar */}
                    {isProcessing && currentProcessingId && (
                        <div className="mt-4 pt-4 border-t">
                            <div className="mb-2">
                                <div className="flex justify-between text-sm text-gray-600 mb-1">
                                    <span>Processing ID: {currentProcessingId}</span>
                                    <span>
                                        {scrapeMode === 'range' && startId && endId
                                            ? Math.round(((currentProcessingId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100)
                                            : Math.round((summary.success + summary.errors + summary.skipped) / summary.total * 100)
                                        }%
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${
                                                scrapeMode === 'range' && startId && endId
                                                    ? ((currentProcessingId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100
                                                    : (summary.success + summary.errors + summary.skipped) / summary.total * 100
                                            }%`
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Results List */}
            {results.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Results</h3>
                    
                    <div className="max-h-96 overflow-y-auto">
                        <div className="space-y-2">
                            {results.map((result) => (
                                <div
                                    key={result.id}
                                    className={`p-3 border rounded-lg flex items-center justify-between ${getStatusColor(result.status)}`}
                                >
                                    <div className="flex items-center space-x-3">
                                        {getStatusIcon(result.status)}
                                        <div>
                                            <span className="font-medium">Tournament #{result.id}</span>
                                            {result.gameName && (
                                                <span className="ml-2 text-sm text-gray-600">
                                                    - {result.gameName}
                                                </span>
                                            )}
                                            {result.gameStatus && (
                                                <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                                                    {result.gameStatus}
                                                </span>
                                            )}
                                            {result.source && (
                                                <span className={`ml-2 px-2 py-1 text-xs rounded ${
                                                    result.source === 'S3_CACHE' 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {result.source === 'S3_CACHE' ? 'Cached' : 'Live'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {result.message && (
                                        <span className="text-sm text-gray-500">
                                            {result.message}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};