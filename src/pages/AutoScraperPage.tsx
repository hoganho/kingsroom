// src/pages/AutoScraperPage.tsx
// Complete, unabridged version with comprehensive debug logging

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateClient, GraphQLResult } from 'aws-amplify/api';

import { getScraperControlState } from '../graphql/queries';
import { controlScraperOperation, triggerAutoScraping } from '../graphql/mutations';
import type { 
    GetScraperControlStateQuery,
    ControlScraperOperationMutation,
    TriggerAutoScrapingMutation,
    ScraperOperation,
    ScraperLogData,
    ScrapedGameStatus 
} from '../API';

import { 
    Play, Pause, RefreshCw, Power, AlertCircle, CheckCircle,
    Database, TrendingUp, AlertTriangle, List, FileText
} from 'lucide-react';

// ====================================================================
// TYPE FIXES
// ====================================================================
type NonSubscriptionGraphQLResult<T> = Omit<GraphQLResult<T>, 'data'> & { data: T };
type GetStateDataType = NonNullable<NonNullable<GetScraperControlStateQuery['getScraperControlState']>['state']>;
interface ScraperStateExtended extends GetStateDataType {
    currentLog?: (ScraperLogData | null)[]; 
    lastGamesProcessed?: (ScrapedGameStatus | null)[];
}
// ====================================================================

const client = generateClient();

// --- Sub-components (LogViewer, ScrapingGameList) remain the same ---
const ScrapingGameList: React.FC<{ games?: (ScrapedGameStatus | null)[] }> = ({ games }) => {
    if (!games || games.length === 0) return <p className="text-sm text-gray-500">No recent games processed this run.</p>;
    return (
        <div className="space-y-2 max-h-48 overflow-y-auto">
            {games.map((game, index) => game && (
                <div key={index} className="flex justify-between p-2 text-xs border-b border-gray-100 last:border-b-0">
                    <span className="font-mono text-gray-600 w-12 flex-shrink-0">ID: {game.id}</span>
                    <span className="truncate text-gray-800 flex-grow mx-2">{game.name}</span>
                    <span className={`font-semibold text-right ${ game.status === 'SAVED' ? 'text-green-600' : game.status === 'UPDATED' ? 'text-blue-600' : game.status?.includes('SKIPPED') || game.status === 'BLANK' ? 'text-orange-600' : game.status === 'FAILED' || game.status === 'ERROR' ? 'text-red-600' : 'text-indigo-600'}`}>{game.status}</span>
                </div>
            ))}
        </div>
    );
};
const LogViewer: React.FC<{ logs?: (ScraperLogData | null)[] }> = ({ logs }) => {
    const logContainerRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => { if (logContainerRef.current) { logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight; }}, [logs]);
    if (!logs || logs.length === 0) return <p className="text-sm text-gray-500 p-4">No log entries yet.</p>;
    const displayLogs = [...logs].reverse().filter(log => log !== null) as ScraperLogData[]; 
    const getColorClass = (level: string) => { switch (level) { case 'ERROR': return 'text-red-500'; case 'WARN': return 'text-yellow-600'; default: return 'text-gray-400'; }};
    return (
        <div ref={logContainerRef} className="bg-gray-800 text-white font-mono text-xs p-3 h-64 overflow-y-scroll rounded-lg">
            {displayLogs.map((log, index) => (
                <div key={index} className="flex space-x-2 border-b border-gray-700 last:border-b-0 py-0.5">
                    <span className="text-gray-500 flex-shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`flex-shrink-0 w-12 text-center font-bold ${getColorClass(log.level)}`}>{log.level}</span>
                    <span className="flex-grow">{log.message}</span>
                </div>
            ))}
        </div>
    );
};

export const AutoScraperPage: React.FC = () => {
    const [scraperState, setScraperState] = useState<ScraperStateExtended | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [lastResults, setLastResults] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [maxGamesInput, setMaxGamesInput] = useState('2');
    const MAX_ALLOWED_GAMES = 1000;

    const fetchScraperState = useCallback(async () => {
        // --- TIMED LOGGING START ---
        console.time('GraphQL_getScraperControlState_Duration');
        console.log('[DEBUG-FRONTEND] Initiating fetchScraperState...');

        try {
            const response = (await client.graphql<GetScraperControlStateQuery>({
                query: getScraperControlState
            })) as NonSubscriptionGraphQLResult<GetScraperControlStateQuery>;
            
            // --- RAW RESPONSE LOGGING ---
            console.log('[DEBUG-FRONTEND] Raw GraphQL response received:', JSON.stringify(response, null, 2));

            if (response.errors) {
                console.error('[DEBUG-FRONTEND] GraphQL query returned errors:', response.errors);
                setError(`GraphQL Error: ${response.errors[0].message}`);
            } else if (response.data?.getScraperControlState?.state) {
                console.log('[DEBUG-FRONTEND] Successfully received and set state.');
                setScraperState(response.data.getScraperControlState.state as ScraperStateExtended);
            } else {
                console.warn('[DEBUG-FRONTEND] GraphQL response was successful but contained no state data.');
                setError('Received empty state from backend.');
            }

        } catch (err) {
            console.error('[DEBUG-FRONTEND] CRITICAL: client.graphql call FAILED.', err);
            setError('Failed to fetch scraper state. Check the developer console for network errors.');
        } finally {
            setLoading(false);
            console.timeEnd('GraphQL_getScraperControlState_Duration');
            console.log('[DEBUG-FRONTEND] fetchScraperState finished.');
        }
    }, []);

    // Effect 1: Fetch initial state ONCE on component mount.
    useEffect(() => {
        console.log('[DEBUG-FRONTEND] Initial fetch effect is running.');
        fetchScraperState();
    }, [fetchScraperState]);

    // Effect 2: Handle polling ONLY when the scraper is running.
    useEffect(() => {
        const SAFE_POLLING_INTERVAL = 5000;
        
        if (scraperState?.isRunning) {
            console.log('[DEBUG-FRONTEND] Polling effect: Scraper is RUNNING. Starting interval.');
            const intervalId = setInterval(() => {
                console.log('[DEBUG-FRONTEND] Polling... fetching state.');
                fetchScraperState();
            }, SAFE_POLLING_INTERVAL);

            return () => {
                console.log('[DEBUG-FRONTEND] Polling effect cleanup: Scraper stopped or component unmounted. Clearing interval.');
                clearInterval(intervalId);
            };
        } else {
             console.log('[DEBUG-FRONTEND] Polling effect: Scraper is STOPPED. No interval created.');
        }
    }, [scraperState?.isRunning, fetchScraperState]);

    const controlScraper = async (operation: string) => {
        setActionLoading(operation);
        setError(null);
        setSuccess(null);
        try {
            const response = (await client.graphql<ControlScraperOperationMutation>({ query: controlScraperOperation, variables: { operation: operation as ScraperOperation }})) as NonSubscriptionGraphQLResult<ControlScraperOperationMutation>;
            if (response.data?.controlScraperOperation) {
                const result = response.data.controlScraperOperation;
                if (result.success) {
                    setScraperState(result.state as ScraperStateExtended);
                    setSuccess(result.message || `Operation ${operation} successful`);
                    if (result.results) setLastResults(result.results);
                } else { setError(result.message || 'Operation failed'); }
            }
        } catch (err: any) {
            console.error(`Error performing ${operation}:`, err);
            setError(`Failed to ${operation.toLowerCase()} scraper. Check console for details.`);
        } finally { setActionLoading(null); }
    };

    const manualTrigger = async () => {
        setActionLoading('MANUAL');
        setError(null);
        setSuccess(null);
        const max = parseInt(maxGamesInput, 10);
        try {
            const response = (await client.graphql<TriggerAutoScrapingMutation>({ query: triggerAutoScraping, variables: { maxGames: !isNaN(max) && max > 0 && max <= MAX_ALLOWED_GAMES ? max : null }})) as NonSubscriptionGraphQLResult<TriggerAutoScrapingMutation>;
            if (response.data?.triggerAutoScraping) {
                const result = response.data.triggerAutoScraping;
                if (result.success) {
                    setSuccess(`Manual run initiated. Max games: ${max}. Status will update via polling.`);
                    if (result.state) setScraperState(result.state as ScraperStateExtended);
                    if (result.results) setLastResults(result.results);
                } else { setError(result.message || 'Manual scraping failed'); }
            }
        } catch (err: any) {
            console.error('Error triggering manual scraping:', err);
            setError('Failed to trigger manual scraping. Check console for details.');
        } finally { setActionLoading(null); }
    };

    const formatDateTime = (dateString: string | null) => { if (!dateString) return 'Never'; return new Date(dateString).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); };
    const calculateDuration = (start: string | null, end: string | null) => { if (!start || !end) return 'N/A'; const duration = new Date(end).getTime() - new Date(start).getTime(); if (duration < 0) return 'Error'; const minutes = Math.floor(duration / 60000); const seconds = Math.floor((duration % 60000) / 1000); return `${minutes}m ${seconds}s`; };
    const runTimes = useMemo(() => ({ start: (scraperState?.lastRunStartTime ?? null) as string | null, end: (scraperState?.lastRunEndTime ?? null) as string | null }), [scraperState]);

    if (loading) { return ( <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div> ); }

    // --- JSX RENDER (Unchanged) ---
    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-8"><h1 className="text-3xl font-bold text-gray-900">Automated Tournament Scraper</h1><p className="mt-2 text-gray-600">Monitor and control the automated tournament scraping process</p></div>
            {error && (<div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start"><AlertCircle className="h-5 w-5 text-red-600 mt-0.5 mr-3" /><div className="flex-1"><p className="text-red-800">{error}</p></div></div>)}
            {success && (<div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start"><CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-3" /><div className="flex-1"><p className="text-green-800">{success}</p></div></div>)}
            <div className="bg-white shadow-lg rounded-lg overflow-hidden mb-8">
                <div className="px-6 py-4 bg-gradient-to-r from-gray-700 to-gray-800"><h2 className="text-xl font-semibold text-white">System Control</h2></div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        <div className="flex items-center space-x-4"><div className={`p-3 rounded-full ${scraperState?.isRunning ? 'bg-green-100' : 'bg-gray-100'}`}>{scraperState?.isRunning ? <RefreshCw className="h-6 w-6 text-green-600 animate-spin" /> : <Pause className="h-6 w-6 text-gray-600" />}</div><div><p className="text-sm text-gray-600">Status</p><p className="text-lg font-semibold">{scraperState?.isRunning ? <span className="text-green-600">Running</span> : <span className="text-gray-600">Stopped</span>}</p></div></div>
                        <div className="flex items-center space-x-4"><div className="p-3 rounded-full bg-purple-100"><Database className="h-6 w-6 text-purple-600" /></div><div><p className="text-sm text-gray-600">Last Scanned ID</p><p className="text-lg font-semibold text-purple-600">#{scraperState?.lastScannedId || 0}</p></div></div>
                        <div className="flex items-center space-x-4"><div className={`p-3 rounded-full ${scraperState?.enabled ? 'bg-blue-100' : 'bg-gray-100'}`}><Power className={`h-6 w-6 ${scraperState?.enabled ? 'text-blue-600' : 'text-gray-600'}`} /></div><div><p className="text-sm text-gray-600">Auto-Scraping</p><p className="text-lg font-semibold">{scraperState?.enabled ? <span className="text-blue-600">Enabled</span> : <span className="text-gray-600">Disabled</span>}</p></div></div>
                        <div className="flex items-center space-x-4"><div className="p-3 rounded-full bg-indigo-100"><AlertTriangle className="h-6 w-6 text-indigo-600" /></div><div><p className="text-sm text-gray-600">Next Scheduled Run</p><p className="text-lg font-semibold text-indigo-600">6:00 AM AEST</p></div></div>
                    </div>
                    <div className="mt-6 border-t pt-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {scraperState?.isRunning ? (<button onClick={() => controlScraper('STOP')} disabled={actionLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">{actionLoading === 'STOP' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Pause className="h-5 w-5" />}<span>Stop</span></button>) : (<button onClick={() => controlScraper('START')} disabled={actionLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">{actionLoading === 'START' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}<span>Start</span></button>)}
                            {scraperState?.enabled ? (<button onClick={() => controlScraper('DISABLE')} disabled={actionLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors">{actionLoading === 'DISABLE' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Power className="h-5 w-5" />}<span>Disable Auto</span></button>) : (<button onClick={() => controlScraper('ENABLE')} disabled={actionLoading !== null} className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">{actionLoading === 'ENABLE' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Power className="h-5 w-5" />}<span>Enable Auto</span></button>)}
                            <button onClick={() => { if (window.confirm('Are you sure you want to reset the scraper state?')) { controlScraper('RESET'); } }} disabled={actionLoading !== null || scraperState?.isRunning} className="flex items-center justify-center space-x-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">{actionLoading === 'RESET' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}<span>Reset</span></button>
                        </div>
                        <div className="mt-6 col-span-2 md:col-span-4 border-t pt-4 flex items-end space-x-3">
                            <div className="flex-grow"><label htmlFor="maxGames" className="block text-sm font-medium text-gray-700 mb-1">Max New Games (Manual)</label><input id="maxGames" type="number" min="1" max={MAX_ALLOWED_GAMES} value={maxGamesInput} onChange={(e) => setMaxGamesInput(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500" placeholder={`Default: 10`} disabled={actionLoading !== null || scraperState?.isRunning} /></div>
                            <button onClick={manualTrigger} disabled={actionLoading !== null || scraperState?.isRunning} className="flex-shrink-0 flex items-center justify-center space-x-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">{actionLoading === 'MANUAL' ? <RefreshCw className="h-5 w-5 animate-spin" /> : <TrendingUp className="h-5 w-5" />}<span>Run Now</span></button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white shadow-lg rounded-lg overflow-hidden"><div className="px-6 py-4 flex items-center space-x-2 bg-indigo-600"><List className="h-5 w-5 text-white" /><h2 className="text-xl font-semibold text-white">Games Processed</h2></div><div className="p-4"><ScrapingGameList games={scraperState?.lastGamesProcessed} /></div></div>
                <div className="bg-white shadow-lg rounded-lg overflow-hidden"><div className="px-6 py-4 flex items-center space-x-2 bg-gray-800"><FileText className="h-5 w-5 text-white" /><h2 className="text-xl font-semibold text-white">Live Log</h2></div><div className="p-1"><LogViewer logs={scraperState?.currentLog} /></div></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white shadow-lg rounded-lg overflow-hidden"><div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700"><h2 className="text-xl font-semibold text-white">Run History</h2></div><div className="p-6 space-y-4"><div className="flex justify-between items-center py-2 border-b"><span className="text-gray-600">Last Start</span><span className="font-medium">{formatDateTime(scraperState?.lastRunStartTime ?? null)}</span></div><div className="flex justify-between items-center py-2 border-b"><span className="text-gray-600">Last End</span><span className="font-medium">{formatDateTime(scraperState?.lastRunEndTime ?? null)}</span></div><div className="flex justify-between items-center py-2 border-b"><span className="text-gray-600">Duration</span><span className="font-medium">{calculateDuration(runTimes.start, runTimes.end)}</span></div></div></div>
                <div className="bg-white shadow-lg rounded-lg overflow-hidden"><div className="px-6 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700"><h2 className="text-xl font-semibold text-white">Statistics</h2></div><div className="p-6 space-y-4"><div className="flex justify-between items-center py-2 border-b"><span className="text-gray-600">Total Scraped</span><span className="font-medium text-green-600">{scraperState?.totalScraped || 0}</span></div><div className="flex justify-between items-center py-2 border-b"><span className="text-gray-600">Total Errors</span><span className="font-medium text-red-600">{scraperState?.totalErrors || 0}</span></div></div></div>
            </div>
        </div>
    );
};

export default AutoScraperPage;