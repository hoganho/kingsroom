// src/pages/scraper-admin-tabs/AutoScraperTabEnhanced.tsx
// Enhanced version that checks for updates before scraping and respects DO NOT SCRAPE/FINISHED states
// Now includes S3 cache statistics tracking and gap analysis using useGameIdTracking

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PlayCircle, StopCircle, RefreshCw, Building2, HardDrive, TrendingUp, AlertTriangle } from 'lucide-react';
import { useEntity } from '../../contexts/EntityContext';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { GameStatus } from '../../API';
import { useGameIdTracking, formatGapRanges } from '../../hooks/useGameIdTracking';

interface AutoScraperState {
    isRunning: boolean;
    currentId: number;
    stats: {
        totalChecked: number;
        skippedFinished: number;
        skippedDoNotScrape: number;
        skippedNoUpdates: number;
        scraped: number;
        errors: number;
        cacheHits: number;
        cacheMisses: number;
        cacheHitRate: number;
    };
    lastError?: string;
    currentStatus?: string;
}

interface URLCheckResult {
    url: string;
    tournamentId: number;
    shouldScrape: boolean;
    reason?: string;
    status?: GameStatus;
    doNotScrape?: boolean;
    hasUpdates?: boolean;
    hasCache?: boolean;
}

export const AutoScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const { currentEntity } = useEntity();
    
    // Initialize the gap tracking hook
    const {
        loading: gapLoading,
        scrapingStatus,
        getScrapingStatus,
        getUnfinishedGames,
    } = useGameIdTracking(currentEntity?.id);
    
    const [state, setState] = useState<AutoScraperState>({
        isRunning: false,
        currentId: 1,
        stats: {
            totalChecked: 0,
            skippedFinished: 0,
            skippedDoNotScrape: 0,
            skippedNoUpdates: 0,
            scraped: 0,
            errors: 0,
            cacheHits: 0,
            cacheMisses: 0,
            cacheHitRate: 0
        }
    });
    
    const [startId, setStartId] = useState('1');
    const [endId, setEndId] = useState('100');
    const [checkInterval, setCheckInterval] = useState('2'); // seconds between checks
    const [logs, setLogs] = useState<string[]>([]);
    const [useCache, setUseCache] = useState(true); // Toggle for using S3 cache
    const [showGapAnalysis, setShowGapAnalysis] = useState(false);
    const [unfinishedCount, setUnfinishedCount] = useState<number>(0);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load gap analysis on entity change
    useEffect(() => {
        if (currentEntity?.id) {
            loadGapAnalysis();
            loadUnfinishedGames();
        }
    }, [currentEntity?.id]);

    const loadGapAnalysis = async () => {
        if (!currentEntity?.id) return;
        
        try {
            addLog('Loading gap analysis...', 'info');
            await getScrapingStatus({ entityId: currentEntity.id });
            addLog('Gap analysis loaded successfully', 'success');
        } catch (error) {
            console.error('Error loading gap analysis:', error);
            addLog('Failed to load gap analysis', 'error');
        }
    };

    const loadUnfinishedGames = async () => {
        if (!currentEntity?.id) return;
        
        try {
            const result = await getUnfinishedGames({ entityId: currentEntity.id, limit: 1 });
            setUnfinishedCount(result.totalCount);
            if (result.totalCount > 0) {
                addLog(`Found ${result.totalCount} unfinished games`, 'warning');
            }
        } catch (error) {
            console.error('Error loading unfinished games:', error);
        }
    };

    // Add log entry
    const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        }[type];
        
        setLogs(prev => [`[${timestamp}] ${prefix} ${message}`, ...prev].slice(0, 100));
    };

    // Check if a URL should be scraped (with S3 cache check)
    const checkURL = async (url: string, tournamentId: number): Promise<URLCheckResult> => {
        try {
            // First check the ScrapeURL record
            const scrapeUrlResponse = await client.graphql({
                query: /* GraphQL */ `
                    query GetScrapeURL($id: ID!) {
                        getScrapeURL(id: $id) {
                            id
                            doNotScrape
                            status
                            gameId
                            gameStatus
                            lastScrapedAt
                            etag
                            contentHash
                            latestS3Key
                            cachedContentUsedCount
                            lastCacheHitAt
                        }
                    }
                `,
                variables: { id: url }
            });
            
            if ('data' in scrapeUrlResponse && scrapeUrlResponse.data?.getScrapeURL) {
                const scrapeUrl = scrapeUrlResponse.data.getScrapeURL;
                
                // Check if we have cached content
                const hasCache = !!scrapeUrl.latestS3Key;
                if (hasCache && useCache) {
                    setState(prev => ({
                        ...prev,
                        stats: {
                            ...prev.stats,
                            cacheHits: prev.stats.cacheHits + 1,
                            cacheHitRate: Math.round(((prev.stats.cacheHits + 1) / (prev.stats.totalChecked + 1)) * 100)
                        }
                    }));
                } else if (!hasCache && useCache) {
                    setState(prev => ({
                        ...prev,
                        stats: {
                            ...prev.stats,
                            cacheMisses: prev.stats.cacheMisses + 1,
                            cacheHitRate: Math.round((prev.stats.cacheHits / (prev.stats.totalChecked + 1)) * 100)
                        }
                    }));
                }
                
                // Check DO NOT SCRAPE flag
                if (scrapeUrl.doNotScrape) {
                    return {
                        url,
                        tournamentId,
                        shouldScrape: false,
                        reason: 'DO_NOT_SCRAPE',
                        doNotScrape: true,
                        hasCache
                    };
                }
                
                // Check if game is FINISHED
                if (scrapeUrl.gameStatus === GameStatus.FINISHED) {
                    return {
                        url,
                        tournamentId,
                        shouldScrape: false,
                        reason: 'FINISHED',
                        status: GameStatus.FINISHED,
                        hasCache
                    };
                }
                
                // If we have a game in database, check if it needs updates
                if (scrapeUrl.gameId) {
                    // Check if content has changed based on etag or content hash
                    const lastScraped = scrapeUrl.lastScrapedAt ? new Date(scrapeUrl.lastScrapedAt) : null;
                    const hoursSinceLastScrape = lastScraped 
                        ? (Date.now() - lastScraped.getTime()) / (1000 * 60 * 60)
                        : Infinity;
                    
                    // Skip if scraped recently (within last hour) and has etag/hash
                    if (hoursSinceLastScrape < 1 && (scrapeUrl.etag || scrapeUrl.contentHash)) {
                        return {
                            url,
                            tournamentId,
                            shouldScrape: false,
                            reason: 'NO_UPDATES_RECENTLY_SCRAPED',
                            hasUpdates: false,
                            hasCache
                        };
                    }
                }
            }
            
            // If no record exists or it should be scraped
            return {
                url,
                tournamentId,
                shouldScrape: true,
                hasCache: false
            };
            
        } catch (error) {
            console.error(`Error checking URL ${url}:`, error);
            return {
                url,
                tournamentId,
                shouldScrape: true, // On error, assume we should scrape
                hasCache: false
            };
        }
    };

    // Trigger a scrape via Lambda
    const triggerScrape = async (url: string): Promise<boolean> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation TriggerWebScrape($url: String!, $forceRefresh: Boolean) {
                        triggerWebScrape(url: $url, forceRefresh: $forceRefresh) {
                            success
                            message
                            gameId
                        }
                    }
                `,
                variables: { 
                    url,
                    forceRefresh: !useCache
                }
            });
            
            if ('data' in response && response.data?.triggerWebScrape?.success) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`Error triggering scrape for ${url}:`, error);
            return false;
        }
    };

    const runAutoScraper = async () => {
        if (!currentEntity) {
            addLog('Please select an entity first', 'error');
            return;
        }
        
        const start = parseInt(startId);
        const end = parseInt(endId);
        const interval = parseInt(checkInterval) * 1000;
        
        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
            addLog('Invalid ID range', 'error');
            return;
        }
        
        setState(prev => ({ ...prev, isRunning: true, currentId: start }));
        abortControllerRef.current = new AbortController();
        
        addLog(`Starting auto-scraper: IDs ${start} to ${end}`, 'info');
        
        const processNext = async (id: number) => {
            if (abortControllerRef.current?.signal.aborted || id > end) {
                setState(prev => ({ ...prev, isRunning: false }));
                addLog(`Auto-scraper ${id > end ? 'completed' : 'stopped'}`, 'info');
                
                // Reload gap analysis after completion
                if (id > end) {
                    await loadGapAnalysis();
                }
                return;
            }
            
            setState(prev => ({ 
                ...prev, 
                currentId: id,
                currentStatus: `Checking tournament #${id}...`
            }));
            
            const url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${id}`;
            
            try {
                // Check if URL should be scraped
                const checkResult = await checkURL(url, id);
                
                setState(prev => ({
                    ...prev,
                    stats: {
                        ...prev.stats,
                        totalChecked: prev.stats.totalChecked + 1
                    }
                }));
                
                if (!checkResult.shouldScrape) {
                    // Log why it was skipped
                    if (checkResult.reason === 'DO_NOT_SCRAPE') {
                        setState(prev => ({
                            ...prev,
                            stats: { ...prev.stats, skippedDoNotScrape: prev.stats.skippedDoNotScrape + 1 }
                        }));
                        addLog(`Skipped #${id}: DO NOT SCRAPE flag`, 'warning');
                    } else if (checkResult.reason === 'FINISHED') {
                        setState(prev => ({
                            ...prev,
                            stats: { ...prev.stats, skippedFinished: prev.stats.skippedFinished + 1 }
                        }));
                        addLog(`Skipped #${id}: Game FINISHED`, 'info');
                    } else if (checkResult.reason === 'NO_UPDATES_RECENTLY_SCRAPED') {
                        setState(prev => ({
                            ...prev,
                            stats: { ...prev.stats, skippedNoUpdates: prev.stats.skippedNoUpdates + 1 }
                        }));
                        addLog(`Skipped #${id}: No updates (recently scraped)`, 'info');
                    }
                } else {
                    // Trigger scrape
                    setState(prev => ({ ...prev, currentStatus: `Scraping tournament #${id}...` }));
                    const success = await triggerScrape(url);
                    
                    if (success) {
                        setState(prev => ({
                            ...prev,
                            stats: { ...prev.stats, scraped: prev.stats.scraped + 1 }
                        }));
                        addLog(`Successfully scraped #${id}`, 'success');
                    } else {
                        setState(prev => ({
                            ...prev,
                            stats: { ...prev.stats, errors: prev.stats.errors + 1 }
                        }));
                        addLog(`Failed to scrape #${id}`, 'error');
                    }
                }
            } catch (error) {
                setState(prev => ({
                    ...prev,
                    stats: { ...prev.stats, errors: prev.stats.errors + 1 },
                    lastError: error instanceof Error ? error.message : 'Unknown error'
                }));
                addLog(`Error processing #${id}: ${error instanceof Error ? error.message : 'Unknown'}`, 'error');
            }
            
            // Schedule next ID
            intervalRef.current = setTimeout(() => processNext(id + 1), interval);
        };
        
        // Start processing
        processNext(start);
    };

    const stopAutoScraper = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        if (intervalRef.current) {
            clearTimeout(intervalRef.current);
        }
        setState(prev => ({ 
            ...prev, 
            isRunning: false,
            currentStatus: undefined
        }));
        addLog('Auto-scraper stopped by user', 'warning');
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (intervalRef.current) {
                clearTimeout(intervalRef.current);
            }
        };
    }, []);

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
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center">
                            <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
                            Coverage Analysis for {currentEntity.entityName}
                        </h3>
                        <button
                            onClick={loadGapAnalysis}
                            disabled={gapLoading}
                            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1 ${gapLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                    
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
                            <p className="text-sm text-purple-600 font-medium">ID Range</p>
                            <p className="text-lg font-bold text-purple-900">
                                {scrapingStatus.lowestTournamentId} - {scrapingStatus.highestTournamentId}
                            </p>
                        </div>
                    </div>

                    {unfinishedCount > 0 && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
                            <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                            <span className="text-sm text-yellow-800">
                                <strong>{unfinishedCount}</strong> unfinished games require attention
                            </span>
                        </div>
                    )}
                    
                    {scrapingStatus.gaps.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowGapAnalysis(!showGapAnalysis)}
                                className="text-sm text-purple-600 hover:text-purple-700 font-medium mb-2"
                            >
                                {showGapAnalysis ? '▼' : '▶'} View Gap Details ({scrapingStatus.gapSummary.totalGaps} gaps)
                            </button>
                            
                            {showGapAnalysis && (
                                <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                                    <p className="font-medium text-gray-700 mb-2">Gap Ranges:</p>
                                    <p className="text-gray-600">{formatGapRanges(scrapingStatus.gaps)}</p>
                                    {scrapingStatus.gapSummary.largestGapStart && (
                                        <p className="mt-2 text-gray-600">
                                            Largest gap: {scrapingStatus.gapSummary.largestGapStart}-{scrapingStatus.gapSummary.largestGapEnd} 
                                            ({scrapingStatus.gapSummary.largestGapCount} IDs)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-2">
                        Last updated: {new Date(scrapingStatus.lastUpdated).toLocaleString()} 
                        (Cache age: {Math.round(scrapingStatus.cacheAge / 60)} minutes)
                    </p>
                </div>
            )}

            {/* Control Panel */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <PlayCircle className="h-5 w-5 mr-2 text-green-600" />
                    Auto-Scraper Controls
                </h3>
                
                {!currentEntity ? (
                    <p className="text-gray-500">Please select an entity to continue</p>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Start ID
                                </label>
                                <input
                                    type="number"
                                    value={startId}
                                    onChange={(e) => setStartId(e.target.value)}
                                    disabled={state.isRunning}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                    placeholder="1"
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
                                    disabled={state.isRunning}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                    placeholder="100"
                                    min="1"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Check Interval (seconds)
                                </label>
                                <input
                                    type="number"
                                    value={checkInterval}
                                    onChange={(e) => setCheckInterval(e.target.value)}
                                    disabled={state.isRunning}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                                    placeholder="2"
                                    min="0.5"
                                    step="0.5"
                                />
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <div className="flex items-center space-x-4">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="useCache"
                                        checked={useCache}
                                        onChange={(e) => setUseCache(e.target.checked)}
                                        disabled={state.isRunning}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded disabled:opacity-50"
                                    />
                                    <label htmlFor="useCache" className="ml-2 text-sm text-gray-700">
                                        Use S3 cache when available
                                    </label>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {useCache ? 'Cache enabled for faster processing' : 'Will fetch fresh data'}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex space-x-3">
                            {!state.isRunning ? (
                                <button
                                    onClick={runAutoScraper}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center justify-center"
                                >
                                    <PlayCircle className="h-5 w-5 mr-2" />
                                    Start Auto-Scraper
                                </button>
                            ) : (
                                <button
                                    onClick={stopAutoScraper}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center"
                                >
                                    <StopCircle className="h-5 w-5 mr-2" />
                                    Stop Auto-Scraper
                                </button>
                            )}
                        </div>
                        
                        {state.currentStatus && (
                            <div className="mt-3 p-2 bg-gray-100 rounded text-sm text-gray-700">
                                Status: {state.currentStatus}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-6">
                {/* Scraping Statistics */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <RefreshCw className="h-5 w-5 mr-2 text-blue-600" />
                        Scraping Statistics
                    </h3>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Total Checked:</span>
                            <span className="text-lg font-semibold">{state.stats.totalChecked}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Scraped:</span>
                            <span className="text-lg font-semibold text-green-600">{state.stats.scraped}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Skipped (Finished):</span>
                            <span className="text-lg font-semibold text-blue-600">{state.stats.skippedFinished}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Skipped (Do Not Scrape):</span>
                            <span className="text-lg font-semibold text-yellow-600">{state.stats.skippedDoNotScrape}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Skipped (No Updates):</span>
                            <span className="text-lg font-semibold text-gray-600">{state.stats.skippedNoUpdates}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Errors:</span>
                            <span className="text-lg font-semibold text-red-600">{state.stats.errors}</span>
                        </div>
                    </div>
                </div>
                
                {/* S3 Cache Performance */}
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                        <HardDrive className="h-5 w-5 mr-2 text-blue-600" />
                        S3 Cache Performance
                    </h3>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Cache Hits:</span>
                            <span className="text-lg font-semibold text-green-600">{state.stats.cacheHits}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Cache Misses:</span>
                            <span className="text-lg font-semibold text-orange-600">{state.stats.cacheMisses}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Hit Rate:</span>
                            <span className="text-lg font-semibold text-blue-600">
                                {state.stats.totalChecked > 0 
                                    ? Math.round((state.stats.cacheHits / state.stats.totalChecked) * 100)
                                    : 0}%
                            </span>
                        </div>
                        
                        {state.stats.totalChecked > 0 && (
                            <div className="pt-3 border-t">
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div 
                                        className="bg-gradient-to-r from-green-400 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${state.stats.cacheHitRate}%` }}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1 text-center">
                                    Cache Efficiency
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            {state.isRunning && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold mb-4">Progress</h3>
                    <div className="mb-2">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>Current ID: {state.currentId}</span>
                            <span>{Math.round(((state.currentId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3">
                            <div 
                                className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                                style={{
                                    width: `${((state.currentId - parseInt(startId)) / (parseInt(endId) - parseInt(startId) + 1)) * 100}%`
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Activity Log */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Activity Log</h3>
                <div className="h-64 overflow-y-auto bg-gray-50 rounded p-3 font-mono text-xs">
                    {logs.length === 0 ? (
                        <p className="text-gray-400">No activity yet...</p>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="mb-1">
                                {log}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};