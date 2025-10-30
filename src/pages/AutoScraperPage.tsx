// src/pages/AutoScraperPage.tsx
// Complete, unabridged version using Amplify's auto-generated queries and mutations

import React, { useState, useEffect, useCallback } from 'react';
import { generateClient, GraphQLResult } from 'aws-amplify/api';

// Import from Amplify's auto-generated files
import { getScraperControlState } from '../graphql/queries';
import { controlScraperOperation, triggerAutoScraping } from '../graphql/mutations';
import type { 
    GetScraperControlStateQuery,
    ControlScraperOperationMutation,
    TriggerAutoScrapingMutation,
    ScraperOperation,
    ScraperLogData, // ✅ NEW: Import the required nested type
    ScrapedGameStatus // ✅ NEW: Import the required nested type
} from '../API';

// Import icons from lucide-react
import { 
    Play, 
    Pause, 
    RefreshCw, 
    Power, 
    AlertCircle, 
    CheckCircle,
    Database,
    TrendingUp,
    AlertTriangle,
    List,
    FileText
} from 'lucide-react';

// ====================================================================
// TYPE FIXES FOR TS COMPILER
// ====================================================================

// Helper type to strip the GraphQLResult wrapper and avoid the subscription error
type NonSubscriptionGraphQLResult<T> = Omit<GraphQLResult<T>, 'data'> & { data: T };

// 1. Define a type alias for the base state structure
type GetStateDataType = NonNullable<NonNullable<GetScraperControlStateQuery['getScraperControlState']>['state']>;

// 2. Define the extended interface by using the auto-generated nested types.
// This resolves the Type 'ScraperLog[]' is not assignable to type '({ __typename: "ScraperLogData"; ... })[]' error.
interface ScraperStateExtended extends GetStateDataType {
    // We expect currentLog to be an array of the auto-generated ScraperLogData objects
    currentLog?: (ScraperLogData | null)[]; 
    // We expect lastGamesProcessed to be an array of the auto-generated ScrapedGameStatus objects
    lastGamesProcessed?: (ScrapedGameStatus | null)[];
}

// ====================================================================

const client = generateClient();

// --- NEW COMPONENT: Scraping Game List ---
const ScrapingGameList: React.FC<{ games?: (ScrapedGameStatus | null)[] }> = ({ games }) => {
    if (!games || games.length === 0) {
        return <p className="text-sm text-gray-500">No recent games processed this run.</p>;
    }
    return (
        <div className="space-y-2 max-h-48 overflow-y-auto">
            {games.map((game, index) => game && (
                <div key={index} className="flex justify-between p-2 text-xs border-b border-gray-100 last:border-b-0">
                    {/* Note: In GraphQL, IDs are strings, but we will assume they are parsable as numbers for display if needed */}
                    <span className="font-mono text-gray-600 w-12 flex-shrink-0">ID: {game.id}</span>
                    <span className="truncate text-gray-800 flex-grow mx-2">{game.name}</span>
                    <span className={`font-semibold text-right ${
                        game.status === 'SAVED' ? 'text-green-600' :
                        game.status === 'SKIPPED' || game.status === 'BLANK' ? 'text-orange-600' :
                        game.status === 'FAILED' || game.status === 'ERROR' ? 'text-red-600' :
                        'text-indigo-600'
                    }`}>
                        {game.status}
                    </span>
                </div>
            ))}
        </div>
    );
};

// --- NEW COMPONENT: Fixed-Height Log Viewer ---
const LogViewer: React.FC<{ logs?: (ScraperLogData | null)[] }> = ({ logs }) => {
    const logContainerRef = React.useRef<HTMLDivElement>(null);

    // Scroll to the bottom whenever logs update
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    if (!logs || logs.length === 0) {
        return <p className="text-sm text-gray-500 p-4">No log entries yet. Start the scraper to generate logs.</p>;
    }
    
    // Reverse the logs to show latest entry at the bottom
    const displayLogs = [...logs].reverse().filter(log => log !== null); 

    const getColorClass = (level: string) => {
        switch (level) {
            case 'ERROR': return 'text-red-500';
            case 'WARN': return 'text-yellow-600';
            default: return 'text-gray-400';
        }
    };

    return (
        <div ref={logContainerRef} className="bg-gray-800 text-white font-mono text-xs p-3 h-64 overflow-y-scroll rounded-lg">
            {displayLogs.map((log, index) => (
                <div key={index} className="flex space-x-2 border-b border-gray-700 last:border-b-0 py-0.5">
                    <span className="text-gray-500 flex-shrink-0">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={`flex-shrink-0 w-12 text-center font-bold ${getColorClass(log.level)}`}>
                        {log.level}
                    </span>
                    <span className="flex-grow">{log.message}</span>
                </div>
            ))}
        </div>
    );
};


export const AutoScraperPage: React.FC = () => {
    // State management
    const [scraperState, setScraperState] = useState<ScraperStateExtended | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [lastResults, setLastResults] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Fetch scraper state
    const fetchScraperState = useCallback(async () => {
        try {
            const response = (await client.graphql<GetScraperControlStateQuery>({
                query: getScraperControlState
            })) as NonSubscriptionGraphQLResult<GetScraperControlStateQuery>;
            
            if (response.data?.getScraperControlState?.state) {
                setScraperState(response.data.getScraperControlState.state as ScraperStateExtended);
            }
            setLoading(false);
        } catch (err) {
            console.error('Error fetching scraper state:', err);
            setError('Failed to fetch scraper state');
            setLoading(false);
        }
    }, []);

    // Control scraper
    const controlScraper = async (operation: string) => {
        setActionLoading(operation);
        setError(null);
        setSuccess(null);
        
        try {
            const response = (await client.graphql<ControlScraperOperationMutation>({
                query: controlScraperOperation,
                variables: { operation: operation as ScraperOperation }
            })) as NonSubscriptionGraphQLResult<ControlScraperOperationMutation>;
            
            if (response.data?.controlScraperOperation) {
                const result = response.data.controlScraperOperation;
                
                if (result.success) {
                    setScraperState(result.state as ScraperStateExtended);
                    setSuccess(result.message || `Operation ${operation} successful`);
                    
                    if (result.results) {
                        setLastResults(result.results);
                    }
                } else {
                    setError(result.message || 'Operation failed');
                }
            }
        } catch (err: any) {
            console.error(`Error performing ${operation}:`, err);
            if (err.errors?.[0]?.message?.includes('timed out')) {
                setError('Operation timed out. Consider increasing Lambda timeout or reducing batch size.');
            } else {
                setError(`Failed to ${operation.toLowerCase()} scraper`);
            }
        } finally {
            setActionLoading(null);
        }
    };

    // Manual trigger
    const manualTrigger = async () => {
        setActionLoading('MANUAL');
        setError(null);
        setSuccess(null);
        
        try {
            const response = (await client.graphql<TriggerAutoScrapingMutation>({
                query: triggerAutoScraping
            })) as NonSubscriptionGraphQLResult<TriggerAutoScrapingMutation>;
            
            if (response.data?.triggerAutoScraping) {
                const result = response.data.triggerAutoScraping;
                
                if (result.success) {
                    setSuccess('Manual scraping completed successfully');
                    if (result.results) {
                        setLastResults(result.results);
                    }
                    await fetchScraperState();
                } else {
                    setError(result.message || 'Manual scraping failed');
                }
            }
        } catch (err: any) {
            console.error('Error triggering manual scraping:', err);
            if (err.errors?.[0]?.message?.includes('timed out')) {
                setError('Scraping timed out. The Lambda timeout needs to be increased.');
            } else {
                setError('Failed to trigger manual scraping');
            }
        } finally {
            setActionLoading(null);
        }
    };

    // Auto-refresh hook
    useEffect(() => {
        fetchScraperState();
        
        // Poll every 2 seconds for status and logs when running
        const interval = setInterval(() => {
            if (scraperState?.isRunning || loading) {
                fetchScraperState();
            }
        }, 2000); // ✅ Faster polling for log updates (2 seconds)
        
        return () => clearInterval(interval);
    }, [fetchScraperState, scraperState?.isRunning, loading]);

    // Format datetime
    const formatDateTime = (dateString: string | null) => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleString('en-AU', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    // Calculate duration
    const calculateDuration = (start: string, end: string) => {
        if (!start || !end) return 'N/A';
        const duration = new Date(end).getTime() - new Date(start).getTime();
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Main render
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Automated Tournament Scraper</h1>
                <p className="mt-2 text-gray-600">
                    Monitor and control the automated tournament scraping process
                </p>
            </div>

            {/* Alerts */}
            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-3" />
                    <div className="flex-1">
                        <p className="text-red-800">{error}</p>
                    </div>
                </div>
            )}
            
            {/* Success Alert */}
            {success && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3" />
                    <div className="flex-1">
                        <p className="text-green-800">{success}</p>
                    </div>
                </div>
            )}

            {/* Status Overview and Control Panel */}
            <div className="bg-white shadow-lg rounded-lg overflow-hidden mb-8">
                <div className="px-6 py-4 bg-gradient-to-r from-gray-700 to-gray-800">
                    <h2 className="text-xl font-semibold text-white">System Control</h2>
                </div>
                
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        {/* Running Status */}
                        <div className="flex items-center space-x-4">
                            <div className={`p-3 rounded-full ${scraperState?.isRunning ? 'bg-green-100' : 'bg-gray-100'}`}>
                                {scraperState?.isRunning ? (
                                    <RefreshCw className="h-6 w-6 text-green-600 animate-spin" />
                                ) : (
                                    <Pause className="h-6 w-6 text-gray-600" />
                                )}
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Status</p>
                                <p className="text-lg font-semibold">
                                    {scraperState?.isRunning ? (
                                        <span className="text-green-600">Running</span>
                                    ) : (
                                        <span className="text-gray-600">Stopped</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Last Scanned ID */}
                        <div className="flex items-center space-x-4">
                            <div className="p-3 rounded-full bg-purple-100">
                                <Database className="h-6 w-6 text-purple-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Last Scanned ID</p>
                                <p className="text-lg font-semibold text-purple-600">
                                    #{scraperState?.lastScannedId || 0}
                                </p>
                            </div>
                        </div>

                        {/* Auto-Scraping Status */}
                        <div className="flex items-center space-x-4">
                            <div className={`p-3 rounded-full ${scraperState?.enabled ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                <Power className={`h-6 w-6 ${scraperState?.enabled ? 'text-blue-600' : 'text-gray-600'}`} />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Auto-Scraping</p>
                                <p className="text-lg font-semibold">
                                    {scraperState?.enabled ? (
                                        <span className="text-blue-600">Enabled</span>
                                    ) : (
                                        <span className="text-gray-600">Disabled</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Next Run Info */}
                         <div className="flex items-center space-x-4">
                            <div className="p-3 rounded-full bg-indigo-100">
                                <AlertTriangle className="h-6 w-6 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-600">Next Scheduled Run</p>
                                <p className="text-lg font-semibold text-indigo-600">
                                    6:00 AM AEST
                                </p>
                            </div>
                        </div>

                    </div>
                    
                    <div className="mt-6 border-t pt-4">
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {/* Start/Stop Button */}
                            {scraperState?.isRunning ? (
                                <button
                                    onClick={() => controlScraper('STOP')}
                                    disabled={actionLoading !== null}
                                    className="flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {actionLoading === 'STOP' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<Pause className="h-5 w-5" />)}
                                    <span className="font-medium">Stop</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => controlScraper('START')}
                                    disabled={actionLoading !== null}
                                    className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {actionLoading === 'START' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<Play className="h-5 w-5" />)}
                                    <span className="font-medium">Start</span>
                                </button>
                            )}

                            {/* Enable/Disable Auto-Scraping */}
                            {scraperState?.enabled ? (
                                <button
                                    onClick={() => controlScraper('DISABLE')}
                                    disabled={actionLoading !== null}
                                    className="flex items-center justify-center space-x-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {actionLoading === 'DISABLE' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<Power className="h-5 w-5" />)}
                                    <span className="font-medium">Disable Auto</span>
                                </button>
                            ) : (
                                <button
                                    onClick={() => controlScraper('ENABLE')}
                                    disabled={actionLoading !== null}
                                    className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {actionLoading === 'ENABLE' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<Power className="h-5 w-5" />)}
                                    <span className="font-medium">Enable Auto</span>
                                </button>
                            )}

                            {/* Manual Trigger */}
                            <button
                                onClick={manualTrigger}
                                disabled={actionLoading !== null || scraperState?.isRunning}
                                className="flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {actionLoading === 'MANUAL' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<TrendingUp className="h-5 w-5" />)}
                                <span className="font-medium">Manual Run</span>
                            </button>

                            {/* Reset Button */}
                            <button
                                onClick={() => {
                                    if (window.confirm('Are you sure you want to reset the scraper state? This will clear all statistics.')) {
                                        controlScraper('RESET');
                                    }
                                }}
                                disabled={actionLoading !== null || scraperState?.isRunning}
                                className="flex items-center justify-center space-x-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {actionLoading === 'RESET' ? (<RefreshCw className="h-5 w-5 animate-spin" />) : (<AlertTriangle className="h-5 w-5" />)}
                                <span className="font-medium">Reset</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>


            {/* Dashboard: Games List and Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* 1. Games Being Scraped/Saved */}
                <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                     <div className="px-6 py-4 flex items-center space-x-2 bg-indigo-600">
                        <List className="h-5 w-5 text-white" />
                        <h2 className="text-xl font-semibold text-white">Games Processed This Run</h2>
                    </div>
                    <div className="p-4">
                        <ScrapingGameList games={scraperState?.lastGamesProcessed} />
                    </div>
                </div>

                {/* 2. Detailed Log Window */}
                <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                     <div className="px-6 py-4 flex items-center space-x-2 bg-gray-800">
                        <FileText className="h-5 w-5 text-white" />
                        <h2 className="text-xl font-semibold text-white">Live Worker Log</h2>
                    </div>
                    <div className="p-1">
                        <LogViewer logs={scraperState?.currentLog} />
                    </div>
                </div>
            </div>


            {/* Run History and Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Run History */}
                <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                    <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700">
                        <h2 className="text-xl font-semibold text-white">Run History</h2>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">Last Run Start</span>
                            <span className="font-medium">
                                {formatDateTime(scraperState?.lastRunStartTime)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">Last Run End</span>
                            <span className="font-medium">
                                {formatDateTime(scraperState?.lastRunEndTime)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">Duration</span>
                            <span className="font-medium">
                                {calculateDuration(scraperState?.lastRunStartTime, scraperState?.lastRunEndTime)}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2">
                            <span className="text-gray-600">Total Runs</span>
                            <span className="font-medium text-blue-600">
                                {Math.round(scraperState?.totalScraped / 10) || 0} {/* Approximation */}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Statistics */}
                <div className="bg-white shadow-lg rounded-lg overflow-hidden">
                    <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700">
                        <h2 className="text-xl font-semibold text-white">Statistics</h2>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">Total Scraped</span>
                            <span className="font-medium text-green-600">
                                {scraperState?.totalScraped || 0}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">Total Errors</span>
                            <span className="font-medium text-red-600">
                                {scraperState?.totalErrors || 0}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2 border-b">
                            <span className="text-gray-600">New Games (Last)</span>
                            <span className="font-medium text-purple-600">
                                {lastResults?.newGamesScraped || 0}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-2">
                            <span className="text-gray-600">Games Updated (Last)</span>
                            <span className="font-medium text-blue-600">
                                {lastResults?.gamesUpdated || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Last Results */}
            {lastResults && (
                <div className="mt-8 bg-white shadow-lg rounded-lg overflow-hidden">
                    <div className="px-6 py-4 bg-gradient-to-r from-amber-600 to-amber-700">
                        <h2 className="text-xl font-semibold text-white">Last Run Results</h2>
                    </div>
                    
                    <div className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="text-center">
                                <p className="text-3xl font-bold text-green-600">{lastResults.newGamesScraped}</p>
                                <p className="text-sm text-gray-600 mt-1">New Games</p>
                            </div>
                            
                            <div className="text-center">
                                <p className="text-3xl font-bold text-blue-600">{lastResults.gamesUpdated}</p>
                                <p className="text-sm text-gray-600 mt-1">Games Updated</p>
                            </div>
                            
                            <div className="text-center">
                                <p className="text-3xl font-bold text-orange-600">{lastResults.blanks}</p>
                                <p className="text-sm text-gray-600 mt-1">Blank IDs</p>
                            </div>
                            
                            <div className="text-center">
                                <p className="text-3xl font-bold text-red-600">{lastResults.errors}</p>
                                <p className="text-sm text-gray-600 mt-1">Errors</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AutoScraperPage;