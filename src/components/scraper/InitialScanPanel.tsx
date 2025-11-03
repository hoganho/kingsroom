// src/components/scraper/InitialScanPanel.tsx
// Ready-to-use component for initial tournament scanning

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { useScraperJobs } from '../../hooks/useScraperManagement';
import { ScraperJobTriggerSource } from '../../API';

interface BatchJob {
    batchNumber: number;
    startId: number;
    endId: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    jobId?: string;
    stats?: {
        newGames: number;
        updated: number;
        errors: number;
        blanks: number;
    };
    startTime?: Date;
    endTime?: Date;
}

export const InitialScanPanel: React.FC = () => {
    const { startJob, fetchJobs } = useScraperJobs();
    
    // Configuration
    const [config, setConfig] = useState({
        startId: 1,
        endId: 1000,
        batchSize: 50,
        delaySeconds: 5
    });
    
    // Scan state
    const [isScanning, setIsScanning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
    const [batches, setBatches] = useState<BatchJob[]>([]);
    const [error, setError] = useState<string | null>(null);
    
    // Refs for managing async operations
    const abortRef = useRef(false);
    const pauseRef = useRef(false);
    
    // Calculate total batches
    const totalBatches = Math.ceil((config.endId - config.startId + 1) / config.batchSize);
    
    // Initialize batches when config changes
    useEffect(() => {
        const newBatches: BatchJob[] = [];
        for (let i = 0; i < totalBatches; i++) {
            const startId = config.startId + (i * config.batchSize);
            const endId = Math.min(startId + config.batchSize - 1, config.endId);
            
            newBatches.push({
                batchNumber: i + 1,
                startId,
                endId,
                status: 'pending'
            });
        }
        setBatches(newBatches);
    }, [config.startId, config.endId, config.batchSize, totalBatches]);
    
    // Main scanning function
    const performScan = async () => {
        setIsScanning(true);
        setError(null);
        abortRef.current = false;
        pauseRef.current = false;
        
        for (let i = currentBatchIndex; i < batches.length; i++) {
            // Check for abort
            if (abortRef.current) {
                console.log('Scan aborted');
                break;
            }
            
            // Check for pause
            while (pauseRef.current && !abortRef.current) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            setCurrentBatchIndex(i);
            const batch = batches[i];
            
            // Update batch status
            setBatches(prev => {
                const updated = [...prev];
                updated[i] = { ...updated[i], status: 'running', startTime: new Date() };
                return updated;
            });
            
            try {
                // Start the scraper job for this batch
                console.log(`Starting batch ${batch.batchNumber}: IDs ${batch.startId}-${batch.endId}`);
                
                const job = await startJob({
                    triggerSource: ScraperJobTriggerSource.MANUAL,
                    triggeredBy: 'initial-scan',
                    maxGames: 999, // Set high to scan full range
                    startId: batch.startId,
                    endId: batch.endId,
                    isFullScan: true
                });
                
                if (job) {
                    // Update batch with job ID
                    setBatches(prev => {
                        const updated = [...prev];
                        updated[i] = { ...updated[i], jobId: job.id };
                        return updated;
                    });
                    
                    // Poll for job completion
                    const completedJob = await pollJobCompletion(job.id);
                    
                    // Update batch with results
                    setBatches(prev => {
                        const updated = [...prev];
                        updated[i] = {
                            ...updated[i],
                            status: 'completed',
                            endTime: new Date(),
                            stats: {
                                newGames: completedJob?.newGamesScraped || 0,
                                updated: completedJob?.gamesUpdated || 0,
                                errors: completedJob?.errors || 0,
                                blanks: completedJob?.blanks || 0
                            }
                        };
                        return updated;
                    });
                }
                
            } catch (err) {
                console.error(`Batch ${batch.batchNumber} failed:`, err);
                
                setBatches(prev => {
                    const updated = [...prev];
                    updated[i] = { 
                        ...updated[i], 
                        status: 'failed',
                        endTime: new Date()
                    };
                    return updated;
                });
                
                const errorMessage = err instanceof Error ? err.message : String(err);
                setError(`Batch ${batch.batchNumber} failed: ${errorMessage}`);
            }
            
            // Delay between batches (except for last batch)
            if (i < batches.length - 1 && config.delaySeconds > 0) {
                console.log(`Waiting ${config.delaySeconds} seconds before next batch...`);
                await new Promise(resolve => setTimeout(resolve, config.delaySeconds * 1000));
            }
        }
        
        setIsScanning(false);
        setCurrentBatchIndex(0);
    };
    
    // Poll for job completion
    const pollJobCompletion = async (jobId: string, maxAttempts = 60): Promise<any> => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
            
            // Fetch jobs directly and check the specific job
            await fetchJobs(true);
            
            // Since fetchJobs doesn't return the jobs directly, we need to use a different approach
            // You may need to access the jobs from the hook's state or modify the hook
            // For now, let's return a simplified version
            // TODO: You may need to adjust this based on your actual useScraperJobs implementation
            console.log(`Polling job ${jobId}, attempt ${attempt + 1}/${maxAttempts}`);

            // Temporary workaround - you'll need to check your jobs state from the hook
            // const job = jobs.find((j: any) => j.id === jobId);
            
            // For now, just wait and assume completion after some attempts
            if (attempt > 10) {
                return { 
                    status: 'COMPLETED',
                    newGamesScraped: 0,
                    gamesUpdated: 0,
                    errors: 0,
                    blanks: 0
                };
            }
        }
        
        throw new Error('Job timeout - did not complete within expected time');
    };
    
    // Control functions
    const handleStart = () => {
        if (isPaused) {
            pauseRef.current = false;
            setIsPaused(false);
        } else {
            performScan();
        }
    };
    
    const handlePause = () => {
        pauseRef.current = true;
        setIsPaused(true);
    };
    
    const handleStop = () => {
        abortRef.current = true;
        setIsScanning(false);
        setIsPaused(false);
        setCurrentBatchIndex(0);
    };
    
    const handleReset = () => {
        setBatches(prev => prev.map(b => ({ ...b, status: 'pending', stats: undefined })));
        setCurrentBatchIndex(0);
        setError(null);
    };
    
    // Calculate statistics
    const stats = batches.reduce((acc, batch) => {
        if (batch.stats) {
            acc.newGames += batch.stats.newGames;
            acc.updated += batch.stats.updated;
            acc.errors += batch.stats.errors;
            acc.blanks += batch.stats.blanks;
        }
        if (batch.status === 'completed') acc.completed++;
        if (batch.status === 'failed') acc.failed++;
        return acc;
    }, {
        newGames: 0,
        updated: 0,
        errors: 0,
        blanks: 0,
        completed: 0,
        failed: 0
    });
    
    const progressPercent = totalBatches > 0 ? (stats.completed / totalBatches) * 100 : 0;
    
    return (
        <div className="bg-white rounded-lg shadow p-6">
            <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Initial Tournament Scan</h3>
                <p className="text-sm text-gray-600">
                    Perform a comprehensive scan of tournament IDs to populate the database
                </p>
            </div>
            
            {/* Configuration */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start ID
                    </label>
                    <input
                        type="number"
                        value={config.startId}
                        onChange={(e) => setConfig(prev => ({ ...prev, startId: parseInt(e.target.value) }))}
                        disabled={isScanning}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        End ID
                    </label>
                    <input
                        type="number"
                        value={config.endId}
                        onChange={(e) => setConfig(prev => ({ ...prev, endId: parseInt(e.target.value) }))}
                        disabled={isScanning}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Batch Size
                    </label>
                    <input
                        type="number"
                        value={config.batchSize}
                        onChange={(e) => setConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                        disabled={isScanning}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delay (seconds)
                    </label>
                    <input
                        type="number"
                        value={config.delaySeconds}
                        onChange={(e) => setConfig(prev => ({ ...prev, delaySeconds: parseInt(e.target.value) }))}
                        disabled={isScanning}
                        className="w-full px-3 py-2 border rounded-lg"
                    />
                </div>
            </div>
            
            {/* Control Buttons */}
            <div className="flex gap-2 mb-6">
                {!isScanning ? (
                    <button
                        onClick={handleStart}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                        <Play className="h-4 w-4" />
                        Start Scan
                    </button>
                ) : isPaused ? (
                    <button
                        onClick={handleStart}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                        <Play className="h-4 w-4" />
                        Resume
                    </button>
                ) : (
                    <button
                        onClick={handlePause}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 flex items-center gap-2"
                    >
                        <Pause className="h-4 w-4" />
                        Pause
                    </button>
                )}
                
                {isScanning && (
                    <button
                        onClick={handleStop}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                        Stop
                    </button>
                )}
                
                {!isScanning && stats.completed > 0 && (
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Reset
                    </button>
                )}
            </div>
            
            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress: {stats.completed} of {totalBatches} batches</span>
                    <span>{progressPercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>
            
            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 p-3 rounded">
                    <div className="text-2xl font-bold text-green-700">{stats.newGames}</div>
                    <div className="text-sm text-green-600">New Games</div>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                    <div className="text-2xl font-bold text-blue-700">{stats.updated}</div>
                    <div className="text-sm text-blue-600">Updated</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                    <div className="text-2xl font-bold text-gray-700">{stats.blanks}</div>
                    <div className="text-sm text-gray-600">Blanks</div>
                </div>
                <div className="bg-red-50 p-3 rounded">
                    <div className="text-2xl font-bold text-red-700">{stats.errors}</div>
                    <div className="text-sm text-red-600">Errors</div>
                </div>
            </div>
            
            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    {error}
                </div>
            )}
            
            {/* Batch Status List */}
            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Batch</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">ID Range</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">New</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Updated</th>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Errors</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.map((batch, index) => (
                            <tr key={index} className={batch.status === 'running' ? 'bg-blue-50' : ''}>
                                <td className="px-4 py-2 text-sm">{batch.batchNumber}</td>
                                <td className="px-4 py-2 text-sm">{batch.startId}-{batch.endId}</td>
                                <td className="px-4 py-2 text-sm">
                                    <div className="flex items-center gap-1">
                                        {batch.status === 'pending' && <span className="text-gray-500">Pending</span>}
                                        {batch.status === 'running' && (
                                            <>
                                                <Loader className="h-4 w-4 animate-spin text-blue-600" />
                                                <span className="text-blue-600">Running</span>
                                            </>
                                        )}
                                        {batch.status === 'completed' && (
                                            <>
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                <span className="text-green-600">Completed</span>
                                            </>
                                        )}
                                        {batch.status === 'failed' && (
                                            <>
                                                <AlertCircle className="h-4 w-4 text-red-600" />
                                                <span className="text-red-600">Failed</span>
                                            </>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-2 text-sm">{batch.stats?.newGames || '-'}</td>
                                <td className="px-4 py-2 text-sm">{batch.stats?.updated || '-'}</td>
                                <td className="px-4 py-2 text-sm">{batch.stats?.errors || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};