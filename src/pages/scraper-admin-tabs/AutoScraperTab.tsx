// src/pages/scraper-admin-tabs/AutoScraperTabEnhanced.tsx
// Enhanced version that checks for updates before scraping and respects DO NOT SCRAPE/FINISHED states
// Now includes S3 cache statistics tracking

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PlayCircle, StopCircle, RefreshCw, Building2, HardDrive } from 'lucide-react';
import { useEntity } from '../../contexts/EntityContext';
import { EntitySelector } from '../../components/entities/EntitySelector';
import { GameStatus } from '../../API';

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
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
                            reason: 'NO_UPDATES',
                            hasUpdates: false,
                            hasCache
                        };
                    }
                }
            }
            
            // Default: should scrape
            return {
                url,
                tournamentId,
                shouldScrape: true,
                hasUpdates: true,
                hasCache: false
            };
            
        } catch (error) {
            console.error(`Error checking URL ${url}:`, error);
            // If we can't check, assume we should scrape
            return {
                url,
                tournamentId,
                shouldScrape: true,
                hasCache: false
            };
        }
    };

    // Scrape a single tournament
    const scrapeTournament = async (url: string, tournamentId: number): Promise<boolean> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation FetchTournamentData($url: String!) {
                        fetchTournamentData(url: $url) {
                            id
                            name
                            gameStatus
                            registrationStatus
                            prizepool
                            totalEntries
                            source
                            s3Key
                            usedCache
                        }
                    }
                `,
                variables: { 
                    url,
                    forceRefresh: !useCache // Control cache usage
                }
            });
            
            if ('data' in response && response.data?.fetchTournamentData) {
                const data = response.data.fetchTournamentData;
                
                // Track cache usage from response
                if (data.source === 'S3_CACHE' || data.usedCache) {
                    addLog(`#${tournamentId} scraped using S3 cache`, 'success');
                } else {
                    addLog(`#${tournamentId} scraped from live site`, 'info');
                }
                
                return true;
            }
            
            return false;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Error scraping #${tournamentId}: ${errorMessage}`, 'error');
            return false;
        }
    };

    // Main auto-scraping loop
    const runAutoScraper = async () => {
        if (!currentEntity) {
            addLog('No entity selected', 'error');
            return;
        }
        
        const start = parseInt(startId);
        const end = parseInt(endId);
        const interval = parseInt(checkInterval) * 1000;
        
        addLog(`Starting auto-scraper from ID ${start} to ${end} (Cache: ${useCache ? 'Enabled' : 'Disabled'})`, 'info');
        
        setState(prev => ({
            ...prev,
            isRunning: true,
            currentId: start,
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
        }));
        
        abortControllerRef.current = new AbortController();
        
        let currentId = start;
        
        const processNext = async () => {
            if (!abortControllerRef.current?.signal.aborted && currentId <= end) {
                const url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}${currentId}`;
                
                setState(prev => ({
                    ...prev,
                    currentId,
                    currentStatus: `Checking tournament #${currentId}...`
                }));
                
                // Check if we should scrape this URL
                const checkResult = await checkURL(url, currentId);
                
                setState(prev => {
                    const newStats = { ...prev.stats };
                    newStats.totalChecked++;
                    
                    if (checkResult.shouldScrape) {
                        // Scrape the tournament
                        scrapeTournament(url, currentId).then(success => {
                            setState(p => ({
                                ...p,
                                stats: {
                                    ...p.stats,
                                    scraped: success ? p.stats.scraped + 1 : p.stats.scraped,
                                    errors: success ? p.stats.errors : p.stats.errors + 1
                                }
                            }));
                        });
                        newStats.scraped++;
                        const cacheStatus = checkResult.hasCache ? ' (cache available)' : ' (no cache)';
                        addLog(`Scraping #${currentId} (updates detected)${cacheStatus}`, 'info');
                    } else {
                        // Skip based on reason
                        switch (checkResult.reason) {
                            case 'DO_NOT_SCRAPE':
                                newStats.skippedDoNotScrape++;
                                addLog(`Skipped #${currentId} (DO NOT SCRAPE)`, 'warning');
                                break;
                            case 'FINISHED':
                                newStats.skippedFinished++;
                                addLog(`Skipped #${currentId} (FINISHED)`, 'info');
                                break;
                            case 'NO_UPDATES':
                                newStats.skippedNoUpdates++;
                                const cacheInfo = checkResult.hasCache ? ' [cached]' : '';
                                addLog(`Skipped #${currentId} (no updates)${cacheInfo}`, 'info');
                                break;
                            default:
                                addLog(`Skipped #${currentId}`, 'info');
                        }
                    }
                    
                    return {
                        ...prev,
                        stats: newStats
                    };
                });
                
                currentId++;
                
                // Schedule next check
                intervalRef.current = setTimeout(processNext, interval);
            } else {
                // Finished
                setState(prev => ({
                    ...prev,
                    isRunning: false,
                    currentStatus: 'Completed'
                }));
                
                const finalStats = state.stats;
                addLog(
                    `Auto-scraping completed. Scraped: ${finalStats.scraped}, Skipped: ${finalStats.totalChecked - finalStats.scraped}, Cache Hits: ${finalStats.cacheHits}`,
                    'success'
                );
            }
        };
        
        // Start processing
        processNext();
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
            currentStatus: 'Stopped'
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
            {/* Entity Selection */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="mb-4">
                    <h3 className="text-lg font-semibold flex items-center">
                        <Building2 className="h-5 w-5 mr-2 text-blue-600" />
                        Entity Selection
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                        Select the entity (business) for auto-scraping
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

            {/* Auto Scraper Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                    {state.isRunning ? (
                        <StopCircle className="h-5 w-5 mr-2 text-red-600 animate-pulse" />
                    ) : (
                        <PlayCircle className="h-5 w-5 mr-2 text-green-600" />
                    )}
                    Auto-Scraper Configuration
                </h3>
                
                {!currentEntity ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800">Please select an entity first to enable auto-scraping.</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Start ID
                                </label>
                                <input
                                    type="number"
                                    value={startId}
                                    onChange={(e) => setStartId(e.target.value)}
                                    disabled={state.isRunning}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    End ID
                                </label>
                                <input
                                    type="number"
                                    value={endId}
                                    onChange={(e) => setEndId(e.target.value)}
                                    disabled={state.isRunning}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                                />
                            </div>
                        </div>
                        
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Check Interval (seconds)
                            </label>
                            <select
                                value={checkInterval}
                                onChange={(e) => setCheckInterval(e.target.value)}
                                disabled={state.isRunning}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                            >
                                <option value="1">1 second</option>
                                <option value="2">2 seconds</option>
                                <option value="5">5 seconds</option>
                                <option value="10">10 seconds</option>
                                <option value="30">30 seconds</option>
                            </select>
                        </div>
                        
                        {/* Cache Toggle */}
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                            <div className="flex items-center justify-between">
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