// src/pages/scraper-admin-tabs/BulkScraperTabEnhanced.tsx
// Enhanced version with batch processing support and S3 cache statistics

import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Database, AlertCircle, CheckCircle, XCircle, Building2, HardDrive } from 'lucide-react';
import { listVenuesForDropdown } from '../../graphql/customQueries';
import { GameStatus, Venue } from '../../API';
import { useEntity, buildGameUrl } from '../../contexts/EntityContext';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { fetchGameDataFromBackend, saveGameDataToBackend } from '../../services/gameService';

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
                        hits: prev.hits + 1,
                        rate: Math.round(((prev.hits + 1) / (id - parseInt(startId) + 1)) * 100)
                    }));
                } else if (fetchResult.source === 'LIVE') {
                    setCacheStats(prev => ({
                        ...prev,
                        misses: prev.misses + 1,
                        rate: Math.round((prev.hits / (id - parseInt(startId) + 1)) * 100)
                    }));
                }
            }
            
            // Check for inactive or error states
            if (fetchResult.gameStatus === 'NOT_IN_USE' || ('isInactive' in fetchResult && fetchResult.isInactive)) {
                setResults(prev => {
                    const newResults = [...prev];
                    newResults[resultIndex] = {
                        ...newResults[resultIndex],
                        status: 'skipped',
                        message: 'Tournament not in use',
                        source: fetchResult.source,
                        usedCache: fetchResult.usedCache
                    };
                    return newResults;
                });
                return;
            }
            
            // Update status to saving
            setResults(prev => {
                const newResults = [...prev];
                newResults[resultIndex] = {
                    ...newResults[resultIndex],
                    status: 'saving',
                    gameName: fetchResult.name,
                    gameStatus: fetchResult.gameStatus as GameStatus,
                    source: fetchResult.source,
                    usedCache: fetchResult.usedCache
                };
                return newResults;
            });
            
            // Save to database if we have a venue selected
            if (selectedVenueId) {
                // Convert to the expected GameData format
                const gameData = {
                    ...fetchResult,
                    s3Key: fetchResult.s3Key || '', // Provide default if missing
                } as any;
                
                await saveGameDataToBackend(
                    url,
                    selectedVenueId,
                    gameData,
                    null,
                    currentEntity?.id
                );
                
                setResults(prev => {
                    const newResults = [...prev];
                    newResults[resultIndex] = {
                        ...newResults[resultIndex],
                        status: 'success',
                        message: 'Saved successfully'
                    };
                    return newResults;
                });
            } else {
                setResults(prev => {
                    const newResults = [...prev];
                    newResults[resultIndex] = {
                        ...newResults[resultIndex],
                        status: 'success',
                        message: 'Fetched successfully (not saved - no venue selected)'
                    };
                    return newResults;
                });
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            setResults(prev => {
                const newResults = [...prev];
                newResults[resultIndex] = {
                    ...newResults[resultIndex],
                    status: 'error',
                    message: errorMessage
                };
                return newResults;
            });
        }
    };

    const handleBulkScrape = async () => {
        if (!currentEntity) {
            alert('Please select an entity first');
            return;
        }
        
        const start = parseInt(startId);
        const end = parseInt(endId);
        
        if (isNaN(start) || isNaN(end)) {
            alert('Please enter valid start and end IDs');
            return;
        }
        
        if (start > end) {
            alert('Start ID must be less than or equal to End ID');
            return;
        }
        
        if (end - start > 500) {
            if (!confirm(`This will process ${end - start + 1} games. Are you sure you want to continue?`)) {
                return;
            }
        }
        
        setIsProcessing(true);
        setResults([]);
        setCacheStats({ 
            enabled: !forceRefresh, 
            hits: 0, 
            misses: 0, 
            rate: 0 
        });
        
        // Initialize results array
        const initialResults: BulkScrapeResult[] = [];
        for (let id = start; id <= end; id++) {
            initialResults.push({
                id,
                url: buildGameUrl(currentEntity, id.toString()),
                status: 'pending'
            });
        }
        setResults(initialResults);
        
        // Process in batches
        for (let i = 0; i < initialResults.length; i += batchSize) {
            const batch = initialResults.slice(i, Math.min(i + batchSize, initialResults.length));
            
            // Process batch in parallel
            await Promise.all(
                batch.map(async (item) => {
                    setCurrentProcessingId(item.id);
                    
                    // Check if game exists and should be skipped
                    if (skipExisting) {
                        const exists = await checkExistingGame(item.id);
                        if (exists) {
                            setResults(prev => {
                                const newResults = [...prev];
                                const index = newResults.findIndex(r => r.id === item.id);
                                if (index !== -1) {
                                    newResults[index] = {
                                        ...newResults[index],
                                        status: 'skipped',
                                        message: 'Game already exists in database'
                                    };
                                }
                                return newResults;
                            });
                            return;
                        }
                    }
                    
                    await processGame(item.id, item.url);
                })
            );
            
            // Small delay between batches to avoid rate limiting
            if (i + batchSize < initialResults.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        setIsProcessing(false);
        setCurrentProcessingId(null);
    };

    const getStatusIcon = (status: BulkScrapeResult['status']) => {
        switch (status) {
            case 'success':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'error':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'skipped':
                return <AlertCircle className="h-4 w-4 text-yellow-500" />;
            case 'fetching':
            case 'saving':
                return <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
            default:
                return <div className="h-4 w-4 border-2 border-gray-300 rounded-full" />;
        }
    };

    const getStatusColor = (status: BulkScrapeResult['status']) => {
        switch (status) {
            case 'success':
                return 'bg-green-50 border-green-200';
            case 'error':
                return 'bg-red-50 border-red-200';
            case 'skipped':
                return 'bg-yellow-50 border-yellow-200';
            case 'fetching':
            case 'saving':
                return 'bg-blue-50 border-blue-200 animate-pulse';
            default:
                return 'bg-gray-50 border-gray-200';
        }
    };

    return (
        <div className="space-y-6">
            {/* Entity Selection */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                        <Building2 className="h-5 w-5 mr-2 text-blue-600" />
                        Entity Selection
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                        Select the entity (business) for bulk scraping
                    </p>
                </div>
                <EntitySelector />
                {currentEntity && (
                    <div className="mt-3 p-3 bg-blue-50 rounded">
                        <p className="text-sm text-blue-800">
                            <strong>Active:</strong> {currentEntity.entityName}
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                            Base URL: {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}
                        </p>
                    </div>
                )}
            </div>

            {/* Bulk Scrape Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <Database className="h-5 w-5 mr-2 text-blue-600" />
                    Bulk Tournament Scraper
                </h3>
                
                {!currentEntity ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800">Please select an entity first to enable bulk scraping.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Start Tournament ID
                                </label>
                                <input
                                    type="number"
                                    value={startId}
                                    onChange={(e) => setStartId(e.target.value)}
                                    disabled={isProcessing}
                                    placeholder="e.g., 100"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    End Tournament ID
                                </label>
                                <input
                                    type="number"
                                    value={endId}
                                    onChange={(e) => setEndId(e.target.value)}
                                    disabled={isProcessing}
                                    placeholder="e.g., 200"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                />
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Default Venue
                            </label>
                            <select
                                value={selectedVenueId}
                                onChange={(e) => setSelectedVenueId(e.target.value)}
                                disabled={isProcessing || venues.length === 0}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                            >
                                <option value="">Select a venue (optional)</option>
                                {venues.map((venue) => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.venueNumber !== undefined 
                                            ? `${venue.venueNumber}. ${venue.name}`
                                            : venue.name
                                        }
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                If selected, all games will be saved with this venue
                            </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Batch Size
                                </label>
                                <select
                                    value={batchSize}
                                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                                    disabled={isProcessing}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                >
                                    <option value="1">1 (Sequential)</option>
                                    <option value="5">5 (Moderate)</option>
                                    <option value="10">10 (Fast)</option>
                                    <option value="20">20 (Very Fast)</option>
                                </select>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="skipExisting"
                                        checked={skipExisting}
                                        onChange={(e) => setSkipExisting(e.target.checked)}
                                        disabled={isProcessing}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    />
                                    <label htmlFor="skipExisting" className="ml-2 text-sm text-gray-700">
                                        Skip existing games
                                    </label>
                                </div>
                                
                                {/* Cache toggle */}
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="useCache"
                                        checked={!forceRefresh}
                                        onChange={(e) => setForceRefresh(!e.target.checked)}
                                        disabled={isProcessing}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    />
                                    <label htmlFor="useCache" className="ml-2 text-sm text-gray-700">
                                        Use S3 cache when available
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
                            disabled={isProcessing || !startId || !endId}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            {isProcessing ? 'Processing...' : 'Start Bulk Scrape'}
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
                                    <span>{Math.round(((currentProcessingId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${((currentProcessingId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100}%`
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