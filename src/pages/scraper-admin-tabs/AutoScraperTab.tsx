// src/pages/scraper-admin-tabs/AutoScraperTab.tsx

import React, { useState, useEffect, useCallback } from 'react'; // 🚀 Added useCallback
// import { generateClient } from 'aws-amplify/api'; // FIX: This client is unused
import { useNavigate } from 'react-router-dom';
import {
    Play, 
    Pause, 
    RefreshCw, 
    Eye,
    Clock,
    Activity,
    CheckCircle,
    XCircle,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Zap
} from 'lucide-react';
import { useScraperJobs } from '../../hooks/useScraperManagement.ts';
import { ScraperJobTriggerSource, GameStatus, RegistrationStatus } from '../../API.ts';
import type { ScraperJob } from '../../API.ts';
import { DataSource } from '../../API.ts';
import { JobStatusBadge } from '../../components/scraper/admin/ScraperAdminShared.tsx';
import { JobDetailsModal } from '../../components/scraper/admin/JobDetailsModal.tsx';
import { GameListItem } from '../../components/scraper/GameListItem.tsx';
import type { GameState } from '../../types/game.ts';

interface RecentGame {
    id: string;
    name: string;
    gameStatus?: string;
    registrationStatus?: string;
    gameStartDateTime?: string;
    venueId?: string;
    scrapedAt: string;
    jobId: string;
    error?: string;
}

export const AutoScraperTab: React.FC = () => {
    const navigate = useNavigate();
    const { 
        jobs,
        loading,
        error,
        startJob,
        cancelJob,
        fetchJobs
    } = useScraperJobs();
    
    const [maxGames, setMaxGames] = useState('10');
    const [selectedJob, setSelectedJob] = useState<ScraperJob | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showRecentGames, setShowRecentGames] = useState(true);
    const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
    const [isAutoMode, setIsAutoMode] = useState(false);
    const [autoInterval, setAutoInterval] = useState('3600'); // Default 1 hour in seconds
    
    // 🚀 NEW: State for countdown timer
    const [nextRunTime, setNextRunTime] = useState<number | null>(null);
    const [countdown, setCountdown] = useState<string>('');

    // Find current running job from jobs list
    const currentJob = jobs.find(job => job.status === 'RUNNING');
    const isJobRunning = !!currentJob;

    // Auto-refresh for job status
    useEffect(() => {
        if (isJobRunning) {
            const interval = setInterval(() => {
                fetchJobs(true);
            }, 5000); // Refresh every 5 seconds when job is running
            
            return () => clearInterval(interval);
        }
    }, [isJobRunning, fetchJobs]);

    // Extract recent games from jobs
    useEffect(() => {
        const games: RecentGame[] = [];
        
        jobs.slice(0, 5).forEach(job => {
            // FIX: Property is urlResults, not scrapedURLs
            if (job.urlResults && Array.isArray(job.urlResults)) {
                // FIX: Property is urlResults, not scrapedURLs
                job.urlResults.slice(0, 5).forEach((urlData: any) => {
                    if (urlData.gameData) {
                        games.push({
                            id: urlData.gameId || urlData.url?.split('id=')[1] || '',
                            name: urlData.gameData.name || 'Unknown',
                            gameStatus: urlData.gameData.gameStatus,
                            registrationStatus: urlData.gameData.registrationStatus,
                            gameStartDateTime: urlData.gameData.gameStartDateTime,
                            venueId: urlData.venueId,
                            scrapedAt: job.startTime,
                            jobId: job.id,
                            error: urlData.error
                        });
                    }
                });
            }
        });
        
        setRecentGames(games.slice(0, 10)); // Show last 10 games
    }, [jobs]);

    // 🚀 MODIFIED: Wrapped handleStartJob in useCallback
    const handleStartJob = useCallback(async () => {
        try {
            const job = await startJob({
                triggerSource: ScraperJobTriggerSource.MANUAL,
                maxGames: parseInt(maxGames),
                triggeredBy: isAutoMode ? 'auto-scheduler' : 'admin-user'
            });
            if (job) {
                setSuccess(`Scraper job started successfully${isAutoMode ? ' (Auto Mode)' : ''}`);
                fetchJobs(true);
            }
        } catch (err) {
            console.error('Error starting job:', err);
            setIsAutoMode(false); // Stop auto mode on error
        }
    }, [startJob, maxGames, isAutoMode, setSuccess, fetchJobs, setIsAutoMode]);

    // 🚀 MODIFIED: Auto-scraping interval logic
    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        
        if (isAutoMode && !isJobRunning) {
            const intervalMs = parseInt(autoInterval) * 1000;
            timer = setTimeout(() => {
                handleStartJob();
                setNextRunTime(null); // Job is starting, clear the timer
            }, intervalMs);
            
            // Set the target time for the countdown
            setNextRunTime(Date.now() + intervalMs);
            
            return () => {
                if (timer) clearTimeout(timer);
                setNextRunTime(null);
            };
        } else {
            // Not in auto mode or job is running, clear any pending timer
            setNextRunTime(null);
        }
    }, [isAutoMode, isJobRunning, autoInterval, handleStartJob]);

    // 🚀 NEW: Countdown timer effect
    useEffect(() => {
        if (!nextRunTime || !isAutoMode || isJobRunning) {
            setCountdown(''); // Clear countdown if not applicable
            return;
        }

        const intervalId = setInterval(() => {
            const remainingMs = Math.max(0, nextRunTime - Date.now());
            
            if (remainingMs === 0) {
                setCountdown('00:00');
                clearInterval(intervalId); // Stop timer when it hits 0
                return;
            }
            
            const totalSeconds = Math.floor(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            // Set the mm:ss format
            setCountdown(
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        }, 1000); // Update every second

        return () => clearInterval(intervalId); // Cleanup interval on unmount or re-run
    }, [nextRunTime, isAutoMode, isJobRunning]);

    // Clear success message after 5 seconds
    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    const handleCancelJob = async () => {
        if (currentJob?.jobId) {
            try {
                await cancelJob(currentJob.jobId);
                setSuccess('Scraper job cancelled');
                fetchJobs(true);
            } catch (err) {
                console.error('Error cancelling job:', err);
            }
        }
    };

    const toggleAutoMode = () => {
        setIsAutoMode(!isAutoMode);
        if (!isAutoMode) {
            setSuccess(`Auto mode enabled - will run every ${parseInt(autoInterval) / 60} minutes`);
        } else {
            setSuccess('Auto mode disabled');
        }
    };

    const handleGameClick = (gameId: string) => {
        const trackUrl = `https://kingsroom.com.au/tournament/?id=${gameId}`;
        navigate(`/scraper-dashboard?trackUrl=${encodeURIComponent(trackUrl)}`);
    };

    const convertRecentGameToGameState = (game: RecentGame): GameState => {
        return {
            id: `https://kingsroom.com.au/tournament/?id=${game.id}`,
            source: DataSource.SCRAPE,
            jobStatus: game.error ? 'ERROR' : 'READY_TO_SAVE',
            lastFetched: game.scrapedAt,
            fetchCount: 1,
            autoRefresh: false,
            data: {
                name: game.name,
                gameStatus: (game.gameStatus as GameStatus) || GameStatus.UNKNOWN,
                registrationStatus: game.registrationStatus as RegistrationStatus | undefined,
                gameStartDateTime: game.gameStartDateTime,
                foundKeys: [],
                hasGuarantee: false,
                levels: [],
                otherDetails: {},
                // --------------------------------------------------------
            },
            errorMessage: game.error
        };
    };

    const getJobSummaryStats = (job: ScraperJob) => {
        // FIX: Add nullish coalescing to prevent errors on null/undefined
        const totalProcessed = job.totalURLsProcessed ?? 0;
        return {
            duration: job.endTime 
                ? Math.round((new Date(job.endTime).getTime() - new Date(job.startTime).getTime()) / 1000 / 60) 
                : null,
            // FIX: Use the null-safe totalProcessed variable
            successRate: totalProcessed > 0 
                ? Math.round(((totalProcessed - (job.errors || 0)) / totalProcessed) * 100)
                : 0
        };
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'RUNNING': return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
            case 'COMPLETED': return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'FAILED': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'CANCELLED': return <AlertCircle className="h-4 w-4 text-yellow-600" />;
            default: return <Clock className="h-4 w-4 text-gray-600" />;
        }
    };
    
    // 🚀 DELETED: The getNextRunTime function is no longer needed

    return (
        <div className="space-y-6">
            {/* Control Panel */}
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Auto Scraper Control</h3>
                    <div className="flex items-center space-x-2">
                        <Zap className={`h-5 w-5 ${isAutoMode ? 'text-yellow-500' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">
                            {isAutoMode ? 'Auto Mode ON' : 'Auto Mode OFF'}
                        </span>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* Max Games Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Games per Run
                        </label>
                        <input
                            type="number"
                            value={maxGames}
                            onChange={(e) => setMaxGames(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            min="1"
                            max="100"
                            disabled={isJobRunning}
                        />
                    </div>
                    
                    {/* Auto Interval */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Auto Run Interval
                        </label>
                        <select
                            value={autoInterval}
                            onChange={(e) => setAutoInterval(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            disabled={isJobRunning}
                        >
                            <option value="300">5 minutes</option>
                            <option value="900">15 minutes</option>
                            <option value="1800">30 minutes</option>
                            <option value="3600">1 hour</option>
                            <option value="7200">2 hours</option>
                            <option value="14400">4 hours</option>
                        </select>
                    </div>
                    
                    {/* Status Display */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Status
                        </label>
                        <div className="px-3 py-2 bg-gray-50 rounded-md">
                            {isJobRunning ? (
                                <span className="text-blue-600 font-medium flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Job Running
                                </span>
                            ) : isAutoMode ? (
                                // 🚀 MODIFIED: Use the countdown state
                                <span className="text-green-600 font-medium">
                                    Next run in: {countdown || '...'}
                                </span>
                            ) : (
                                <span className="text-gray-500">Idle</span>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        {!isJobRunning ? (
                            <>
                                <button
                                    onClick={handleStartJob}
                                    disabled={loading}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Play className="h-4 w-4" />
                                    Start Manual Run
                                </button>
                                <button
                                    onClick={toggleAutoMode}
                                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                                        isAutoMode 
                                            ? 'bg-yellow-600 text-white hover:bg-yellow-700' 
                                            : 'bg-gray-600 text-white hover:bg-gray-700'
                                    }`}
                                >
                                    {isAutoMode ? (
                                        <>
                                            <Pause className="h-4 w-4" />
                                            Stop Auto Mode
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="h-4 w-4" />
                                            Enable Auto Mode
                                        </>
                                    )}
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleCancelJob}
                                disabled={loading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Pause className="h-4 w-4" />
                                Cancel Current Job
                            </button>
                        )}
                    </div>
                    
                    {/* Live Stats */}
                    {currentJob && (
                        <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">Processed:</span>
                                <span className="font-medium">{currentJob.totalURLsProcessed || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">New:</span>
                                <span className="font-medium text-green-600">{currentJob.newGamesScraped || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">Updated:</span>
                                <span className="font-medium text-blue-600">{currentJob.gamesUpdated || 0}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-gray-500">Errors:</span>
                                <span className="font-medium text-red-600">{currentJob.errors || 0}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Status Messages */}
                {error && (
                    <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        {success}
                    </div>
                )}
            </div>

            {/* Recent Games Scraped */}
            {recentGames.length > 0 && (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Recently Scraped Games</h3>
                            <button
                                onClick={() => setShowRecentGames(!showRecentGames)}
                                className="p-2 hover:bg-gray-100 rounded"
                            >
                                {showRecentGames ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    {showRecentGames && (
                        <div className="p-4 space-y-2">
                            {recentGames.map((game, index) => (
                                <GameListItem
                                    key={`${game.id}-${index}`}
                                    game={convertRecentGameToGameState(game)}
                                    mode="auto"
                                    showVenueSelector={false}
                                    showActions={false}
                                    onClick={() => handleGameClick(game.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Recent Jobs */}
            <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold">Recent Scraper Jobs</h3>
                </div>
                <div className="divide-y divide-gray-200">
                    {jobs.length > 0 ? (
                        jobs.slice(0, 10).map((job) => {
                            const stats = getJobSummaryStats(job);
                            return (
                                <div key={job.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                {getStatusIcon(job.status)}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm">
                                                            Job {job.jobId?.slice(0, 8)}...
                                                        </span>
                                                        <JobStatusBadge status={job.status} />
                                                        {job.triggerSource === 'SCHEDULED' && (
                                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                                                Scheduled
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {new Date(job.startTime).toLocaleString()}
                                                        {stats.duration && ` • ${stats.duration} min`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center space-x-4">
                                            <div className="text-right">
                                                <p className="text-sm font-medium">
                                                    {job.totalURLsProcessed || 0} URLs
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {stats.successRate}% success
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-1 text-xs">
                                                <div className="text-center">
                                                    <p className="font-medium text-green-600">{job.newGamesScraped || 0}</p>
                                                    <p className="text-gray-500">New</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="font-medium text-blue-600">{job.gamesUpdated || 0}</p>
                                                    <p className="text-gray-500">Updated</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="font-medium text-gray-600">{job.gamesSkipped || 0}</p>
                                                    <p className="text-gray-500">Skipped</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setSelectedJob(job)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                                title="View Details"
                                            >
                                                <Eye className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-8 text-center text-gray-500">
                            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                            <p>No scraper jobs have run yet</p>
                            <p className="text-xs mt-1">Start a manual run or enable auto mode to begin</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Job Details Modal */}
            {selectedJob && (
                <JobDetailsModal 
                    job={selectedJob} 
                    onClose={() => setSelectedJob(null)} 
                />
            )}
        </div>
    );
};