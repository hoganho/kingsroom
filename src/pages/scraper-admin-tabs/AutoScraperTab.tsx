// src/pages/scraper-admin-tabs/AutoScraperTabEnhanced.tsx
// Enhanced version that checks for updates before scraping and respects DO NOT SCRAPE/FINISHED states

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PlayCircle, StopCircle, RefreshCw, Building2 } from 'lucide-react';
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
            errors: 0
        }
    });
    
    const [startId, setStartId] = useState('1');
    const [endId, setEndId] = useState('100');
    const [checkInterval, setCheckInterval] = useState('2'); // seconds between checks
    const [logs, setLogs] = useState<string[]>([]);
    
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

    // Check if a URL should be scraped
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
                        }
                    }
                `,
                variables: { id: url }
            });
            
            if ('data' in scrapeUrlResponse && scrapeUrlResponse.data?.getScrapeURL) {
                const scrapeUrl = scrapeUrlResponse.data.getScrapeURL;
                
                // Check DO NOT SCRAPE flag
                if (scrapeUrl.doNotScrape) {
                    return {
                        url,
                        tournamentId,
                        shouldScrape: false,
                        reason: 'DO_NOT_SCRAPE',
                        doNotScrape: true
                    };
                }
                
                // Check if game is FINISHED
                if (scrapeUrl.gameStatus === 'FINISHED' || scrapeUrl.gameStatus === 'COMPLETED') {
                    return {
                        url,
                        tournamentId,
                        shouldScrape: false,
                        reason: 'FINISHED',
                        status: scrapeUrl.gameStatus as GameStatus
                    };
                }
                
                // If game exists and is not finished, check for updates
                if (scrapeUrl.lastScrapedAt) {
                    const updateCheckResponse = await client.graphql({
                        query: /* GraphQL */ `
                            mutation CheckPageUpdates($url: AWSURL!) {
                                checkPageUpdates(url: $url) {
                                    updateAvailable
                                    message
                                }
                            }
                        `,
                        variables: { url }
                    });
                    
                    if ('data' in updateCheckResponse && updateCheckResponse.data?.checkPageUpdates) {
                        const updateStatus = updateCheckResponse.data.checkPageUpdates;
                        
                        if (!updateStatus.updateAvailable) {
                            return {
                                url,
                                tournamentId,
                                shouldScrape: false,
                                reason: 'NO_UPDATES',
                                hasUpdates: false
                            };
                        }
                    }
                }
            }
            
            // Should scrape: either new URL or has updates
            return {
                url,
                tournamentId,
                shouldScrape: true,
                hasUpdates: true
            };
            
        } catch (error) {
            console.error(`Error checking URL ${url}:`, error);
            return {
                url,
                tournamentId,
                shouldScrape: true, // Scrape on error to be safe
                reason: 'CHECK_ERROR'
            };
        }
    };

    // Scrape a single tournament
    const scrapeTournament = async (url: string, tournamentId: number): Promise<boolean> => {
        try {
            const response = await client.graphql({
                query: /* GraphQL */ `
                    mutation FetchTournamentDataEnhanced($url: AWSURL!, $entityId: ID!) {
                        fetchTournamentDataEnhanced(url: $url, entityId: $entityId) {
                            name
                            gameStatus
                            s3Key
                            fromS3
                        }
                    }
                `,
                variables: { 
                    url, 
                    entityId: currentEntity!.id
                }
            });
            
            if ('data' in response && response.data?.fetchTournamentDataEnhanced) {
                const data = response.data.fetchTournamentDataEnhanced;
                addLog(
                    `Scraped #${tournamentId}: ${data.name || 'Unknown'} (${data.gameStatus})`,
                    'success'
                );
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
        
        addLog(`Starting auto-scraper from ID ${start} to ${end}`, 'info');
        
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
                errors: 0
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
                        addLog(`Scraping #${currentId} (updates detected)`, 'info');
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
                                addLog(`Skipped #${currentId} (no updates)`, 'info');
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
                addLog('Auto-scraper completed', 'success');
            }
        };
        
        // Start the process
        processNext();
    };

    // Stop auto-scraper
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
        
        addLog('Auto-scraper stopped', 'warning');
    };

    // Clean up on unmount
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

    if (!currentEntity) {
        return (
            <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-center">
                        <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No Entity Selected</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            Please select an entity to start auto-scraping.
                        </p>
                        <div className="mt-6 flex justify-center">
                            <EntitySelector />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Entity Info Bar */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Building2 className="h-5 w-5 text-blue-500" />
                        <div>
                            <p className="text-sm font-medium text-blue-900">
                                Auto-Scraping for: {currentEntity.entityName}
                            </p>
                            <p className="text-xs text-blue-700 font-mono">
                                {currentEntity.gameUrlDomain}{currentEntity.gameUrlPath}[ID]
                            </p>
                        </div>
                    </div>
                    <EntitySelector />
                </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Auto-Scraper Configuration</h3>
                
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Start ID
                        </label>
                        <input
                            type="number"
                            value={startId}
                            onChange={(e) => setStartId(e.target.value)}
                            disabled={state.isRunning}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Check Interval (seconds)
                        </label>
                        <input
                            type="number"
                            value={checkInterval}
                            onChange={(e) => setCheckInterval(e.target.value)}
                            disabled={state.isRunning}
                            min="1"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                        />
                    </div>
                </div>

                <div className="flex space-x-3">
                    {!state.isRunning ? (
                        <button
                            onClick={runAutoScraper}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
                        >
                            <PlayCircle className="h-4 w-4" />
                            <span>Start Auto-Scraping</span>
                        </button>
                    ) : (
                        <button
                            onClick={stopAutoScraper}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
                        >
                            <StopCircle className="h-4 w-4" />
                            <span>Stop Auto-Scraping</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Status and Statistics */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Status</h3>
                
                {state.isRunning && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center space-x-2">
                            <RefreshCw className="h-4 w-4 text-green-600 animate-spin" />
                            <span className="text-sm text-green-900">
                                {state.currentStatus || `Processing tournament #${state.currentId}`}
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Total Checked</p>
                        <p className="text-xl font-semibold">{state.stats.totalChecked}</p>
                    </div>
                    
                    <div className="bg-green-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Scraped</p>
                        <p className="text-xl font-semibold text-green-600">{state.stats.scraped}</p>
                    </div>
                    
                    <div className="bg-yellow-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Skipped (No Updates)</p>
                        <p className="text-xl font-semibold text-yellow-600">{state.stats.skippedNoUpdates}</p>
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Skipped (Finished)</p>
                        <p className="text-xl font-semibold text-blue-600">{state.stats.skippedFinished}</p>
                    </div>
                    
                    <div className="bg-orange-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Skipped (Do Not Scrape)</p>
                        <p className="text-xl font-semibold text-orange-600">{state.stats.skippedDoNotScrape}</p>
                    </div>
                    
                    <div className="bg-red-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">Errors</p>
                        <p className="text-xl font-semibold text-red-600">{state.stats.errors}</p>
                    </div>
                </div>
            </div>

            {/* Activity Log */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Activity Log</h3>
                <div className="max-h-60 overflow-y-auto">
                    {logs.length === 0 ? (
                        <p className="text-gray-500 text-sm">No activity yet</p>
                    ) : (
                        <div className="space-y-1">
                            {logs.map((log, index) => (
                                <p key={index} className="text-xs font-mono text-gray-700">
                                    {log}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
