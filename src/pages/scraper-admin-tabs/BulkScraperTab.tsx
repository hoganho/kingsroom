// src/pages/scraper-admin-tabs/BulkScraperTab.tsx
// FIXED: Using custom scraperManagement operations instead of auto-generated ones
// All existing functionality preserved

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useNavigate } from 'react-router-dom';
import {
    Database, 
    RefreshCw, 
    AlertCircle,
    Eye,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
// FIX: Import from custom scraperManagement instead of auto-generated mutations/queries
import { scraperManagementMutations, scraperManagementQueries } from '../../graphql/scraperManagement';
import { GameListItem } from '../../components/scraper/GameListItem';
import type { GameState, BulkGameSummary } from '../../types/game';
import type { ScraperJob } from '../../API';
import { ScraperJobTriggerSource, DataSource, GameStatus, RegistrationStatus } from '../../API';

interface BulkJobResult {
    jobId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    games: BulkGameSummary[];
    summary: {
        total: number;
        scraped: number;
        errors: number;
        inDatabase: number;
        running: number;
        finished: number;
        scheduled: number;
    };
    startTime: string;
    endTime?: string;
    error?: string;
}

export const BulkScraperTab: React.FC = () => {
    const client = useMemo(() => generateClient(), []);
    const navigate = useNavigate();
    const [startId, setStartId] = useState('');
    const [endId, setEndId] = useState('');
    const [isStartingJob, setIsStartingJob] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Job monitoring state
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [jobResult, setJobResult] = useState<BulkJobResult | null>(null);
    
    // UI state
    const [showResults, setShowResults] = useState(false);
    const [recentJobs, setRecentJobs] = useState<ScraperJob[]>([]);
    const [showRecentJobs, setShowRecentJobs] = useState(false);

    const fetchRecentJobs = useCallback(async () => {
        try {
            // FIX: Use custom query instead of auto-generated listScraperJobs
            const response = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReport,
                variables: {
                    status: null, // Get all statuses
                    limit: 50
                }
            }) as any;
            
            const jobs = response.data?.getScraperJobsReport?.items || [];
            // Filter for BULK jobs in the frontend
            const bulkJobs = jobs.filter((job: ScraperJob) => 
                job.triggerSource === 'BULK'
            );
            
            setRecentJobs(bulkJobs.slice(0, 10).sort((a: ScraperJob, b: ScraperJob) => 
                new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
            ));
        } catch (err) {
            console.error('Error fetching recent jobs:', err);
        }
    }, [client]);

    // Poll for job status updates
    useEffect(() => {
        if (currentJobId && isPolling) {
            const interval = setInterval(async () => {
                try {
                    // FIX: Use custom query to get jobs and find the current one
                    const response = await client.graphql({
                        query: scraperManagementQueries.getScraperJobsReport,
                        variables: { 
                            limit: 50 
                        }
                    }) as any;
                    
                    const jobs = response.data?.getScraperJobsReport?.items || [];
                    const job = jobs.find((j: ScraperJob) => j.id === currentJobId);
                    
                    if (job) {
                        updateJobResult(job);
                        
                        if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
                            setIsPolling(false);
                            fetchRecentJobs();
                        }
                    }
                } catch (err) {
                    console.error('Error polling job status:', err);
                }
            }, 5000); // Poll every 5 seconds

            return () => clearInterval(interval);
        }
    }, [currentJobId, isPolling, client, fetchRecentJobs]);

    // Load recent jobs on mount
    useEffect(() => {
        fetchRecentJobs();
    }, [fetchRecentJobs]);

    const updateJobResult = (job: ScraperJob) => {
        // Parse the URL results to get game summaries
        const games: BulkGameSummary[] = [];
        
        // Use urlResults instead of scrapedURLs
        if (job.urlResults && Array.isArray(job.urlResults)) {
            job.urlResults.forEach((urlData: any) => {
                // Extract game ID from URL or use tournamentId
                const gameId = urlData.tournamentId || 
                              (urlData.url ? urlData.url.split('id=')[1] : '') || 
                              '';
                
                games.push({
                    id: gameId,
                    name: urlData.gameName || 'Unknown',
                    // FIXED: Cast 'RUNNING' to GameStatus enum
                    gameStatus: urlData.status === 'SUCCESS' ? ('RUNNING' as GameStatus) : null,
                    registrationStatus: null,
                    gameStartDateTime: null,
                    inDatabase: urlData.status === 'SAVED' || urlData.status === 'UPDATED',
                    doNotScrape: urlData.status === 'SKIPPED_DONOTSCRAPE',
                    error: urlData.error || null
                });
            });
        }

        const summary = {
            total: job.totalURLsProcessed || 0,
            scraped: job.newGamesScraped || 0,
            errors: job.errors || 0,
            inDatabase: games.filter(g => g.inDatabase).length,
            running: games.filter(g => g.gameStatus === 'RUNNING').length,
            finished: games.filter(g => g.gameStatus === 'FINISHED').length,
            scheduled: games.filter(g => g.gameStatus === 'SCHEDULED').length
        };

        setJobResult({
            jobId: job.jobId || job.id,
            status: job.status as any,
            games,
            summary,
            startTime: job.startTime,
            endTime: job.endTime || undefined,
            // Changed from errorMessage to errorMessages (it's an array)
            error: job.errorMessages && job.errorMessages.length > 0 
                ? job.errorMessages.join('; ') 
                : undefined
        });
    };

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        
        const start = parseInt(startId, 10);
        const end = parseInt(endId, 10);

        if (!isNaN(start) && !isNaN(end) && start <= end) {
            setIsStartingJob(true);
            try {
                // FIX: Use custom mutation instead of auto-generated startScraperJob
                const response = await client.graphql({
                    query: scraperManagementMutations.startScraperJob,
                    variables: {
                        input: {
                            // Cast to proper type
                            triggerSource: 'BULK' as ScraperJobTriggerSource,
                            startId: start,
                            endId: end,
                            isFullScan: true,
                            maxGames: end - start + 1,
                            triggeredBy: 'admin-user'
                        }
                    }
                }) as any;
                
                const job = response.data?.startScraperJob;
                if (job) {
                    setCurrentJobId(job.id);
                    setIsPolling(true);
                    updateJobResult(job);
                    setSuccess(`Bulk scraper job started successfully. Scraping IDs ${start} to ${end}...`);
                    setStartId('');
                    setEndId('');
                    setShowResults(true);
                }
            } catch (err) {
                console.error('Error starting bulk job:', err);
                setError('Failed to start bulk job. Please try again.');
            } finally {
                setIsStartingJob(false);
            }
        } else {
            setError('Please enter valid start and end IDs where start ≤ end');
        }
    }, [client, startId, endId]);

    const handleGameClick = (gameId: string) => {
        const trackUrl = `https://kingsroom.com.au/tournament/?id=${gameId}`;
        navigate(`/scraper-dashboard?trackUrl=${encodeURIComponent(trackUrl)}`);
    };

    const handleViewHistoricalJob = useCallback(async (jobId: string) => {
        try {
            // FIX: Use custom query to get jobs and find the specific one
            const response = await client.graphql({
                query: scraperManagementQueries.getScraperJobsReport,
                variables: { 
                    limit: 50 
                }
            }) as any;
            
            const jobs = response.data?.getScraperJobsReport?.items || [];
            const job = jobs.find((j: ScraperJob) => j.id === jobId);
            
            if (job) {
                updateJobResult(job);
                setShowResults(true);
            }
        } catch (err) {
            console.error('Error fetching historical job:', err);
        }
    }, [client]);

    const convertBulkGameToGameState = (game: BulkGameSummary): GameState => {
        // Handle special status values and null conversions
        let gameStatus: GameStatus;
        
        // Handle the special 'NOT_IN_USE' case
        if (game.gameStatus === 'NOT_IN_USE' || !game.gameStatus) {
            gameStatus = 'FINISHED' as GameStatus;
        } else if (typeof game.gameStatus === 'string' && game.gameStatus in GameStatus) {
            gameStatus = game.gameStatus as GameStatus;
        } else {
            gameStatus = 'SCHEDULED' as GameStatus; // Default
        }
        
        const registrationStatus = game.registrationStatus === 'N_A' ? undefined : 
                                   game.registrationStatus === null ? undefined : 
                                   game.registrationStatus as RegistrationStatus;
        
        return {
            id: `https://kingsroom.com.au/tournament/?id=${game.id}`,
            source: 'SCRAPE' as DataSource,  // Ensure proper typing
            jobStatus: game.error ? 'ERROR' : 'READY_TO_SAVE',
            lastFetched: new Date().toISOString(),
            fetchCount: 1,
            autoRefresh: false,
            data: {
                name: game.name || '',
                gameStatus: gameStatus,
                registrationStatus: registrationStatus,
                gameStartDateTime: game.gameStartDateTime || undefined,
                doNotScrape: game.doNotScrape || false,
                hasGuarantee: false,  // Required field
                levels: [],  // Required field
                otherDetails: {},  // Required field
                foundKeys: [],
            },
            existingGameId: game.inDatabase ? game.id : undefined,
            errorMessage: game.error || undefined
        };
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'RUNNING': return 'text-blue-600 bg-blue-100';
            case 'COMPLETED': return 'text-green-600 bg-green-100';
            case 'FAILED': return 'text-red-600 bg-red-100';
            case 'CANCELLED': return 'text-yellow-600 bg-yellow-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    return (
        <div className="space-y-6">
            {/* Input Form */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Bulk Tournament Scraper</h3>
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex items-center space-x-2">
                        <input
                            type="number"
                            value={startId}
                            onChange={(e) => setStartId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="Start ID (e.g., 1)"
                            disabled={isStartingJob || isPolling}
                        />
                        <span className="text-gray-500">to</span>
                        <input
                            type="number"
                            value={endId}
                            onChange={(e) => setEndId(e.target.value)}
                            className="flex-grow px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="End ID (e.g., 100)"
                            disabled={isStartingJob || isPolling}
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                            disabled={isStartingJob || isPolling}
                        >
                            {isStartingJob ? (
                                <>
                                    <RefreshCw className="animate-spin h-4 w-4" />
                                    <span>Starting...</span>
                                </>
                            ) : isPolling ? (
                                <>
                                    <RefreshCw className="animate-spin h-4 w-4" />
                                    <span>Running...</span>
                                </>
                            ) : (
                                <>
                                    <Database className="h-4 w-4" />
                                    <span>Start Scraping</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
                
                {error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                        {error}
                    </div>
                )}
                
                {success && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm">
                        {success}
                    </div>
                )}
            </div>

            {/* Current Job Status */}
            {jobResult && showResults && (
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-semibold">Job Results</h3>
                        <button
                            onClick={() => setShowResults(false)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Status</div>
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(jobResult.status)}`}>
                                {jobResult.status}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Total URLs</div>
                            <div className="text-lg font-semibold">{jobResult.summary.total}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Scraped</div>
                            <div className="text-lg font-semibold text-green-600">{jobResult.summary.scraped}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 uppercase">Errors</div>
                            <div className="text-lg font-semibold text-red-600">{jobResult.summary.errors}</div>
                        </div>
                    </div>

                    {jobResult.error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                            <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                                <div className="ml-3">
                                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                                    <div className="mt-1 text-sm text-red-700">{jobResult.error}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Game Results */}
                    {jobResult.games.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-sm font-medium text-gray-700">Games Processed ({jobResult.games.length})</h4>
                                <div className="text-xs text-gray-500">
                                    Running: {jobResult.summary.running} | 
                                    Finished: {jobResult.summary.finished} | 
                                    In DB: {jobResult.summary.inDatabase}
                                </div>
                            </div>
                            
                            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-2">
                                {jobResult.games.map((game) => {
                                    const gameState = convertBulkGameToGameState(game);
                                    return (
                                        <div 
                                            key={game.id}
                                            className="cursor-pointer hover:shadow-md transition-shadow"
                                            onClick={() => handleGameClick(game.id)}
                                        >
                                            <GameListItem
                                                game={gameState}
                                                showActions={false}
                                                showVenueSelector={false}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Recent Jobs History */}
            <div className="bg-white rounded-lg shadow p-6">
                <button
                    onClick={() => setShowRecentJobs(!showRecentJobs)}
                    className="flex items-center justify-between w-full mb-4"
                >
                    <h3 className="text-lg font-semibold">Recent Bulk Jobs</h3>
                    {showRecentJobs ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </button>

                {showRecentJobs && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job ID</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Range</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Processed</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start Time</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {recentJobs.map((job) => (
                                    <tr key={job.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-sm text-gray-900">{job.jobId || job.id}</td>
                                        <td className="px-3 py-2 text-sm">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(job.status)}`}>
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-900">
                                            {job.startId || 0} - {job.endId || 0}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-900">
                                            {job.totalURLsProcessed || 0}
                                        </td>
                                        <td className="px-3 py-2 text-sm text-gray-500">
                                            {new Date(job.startTime).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-sm">
                                            <button
                                                onClick={() => handleViewHistoricalJob(job.id)}
                                                className="text-indigo-600 hover:text-indigo-900"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};