// src/components/monitoring/DatabaseChangeMonitor.tsx
// IMPROVED VERSION - Shows only the most recent batch of database operations

import React, { useState, useEffect, useCallback, useMemo, ReactElement } from 'react';
import { generateClient } from 'aws-amplify/api';
import { getMonitoring } from '../../utils/enhanced-monitoring';
import type { DatabaseOperation } from '../../utils/enhanced-monitoring';
import { 
    Activity, 
    Database, 
    CheckCircle,
    XCircle,
    RefreshCw,
    Download,
    Eye,
    EyeOff,
    BarChart2,
    Server,
    Monitor,
    Clock,
    ChevronLeft,
    ChevronRight,
    Layers
} from 'lucide-react';

interface FilterOptions {
    tables: string[];
    operations: string[];
    showQueries: boolean;
    source: 'ALL' | 'CLIENT' | 'LAMBDA';
}

interface LambdaMetric {
    functionName: string;
    operation: string;
    table: string;
    timestamp: string;
    success: boolean;
    duration?: number;
    count?: number;
}

interface OperationBatch {
    operations: any[];
    startTime: Date;
    endTime: Date;
    count: number;
}

export const DatabaseChangeMonitor: React.FC = () => {
    const [clientOperations, setClientOperations] = useState<DatabaseOperation[]>([]);
    const [lambdaMetrics, setLambdaMetrics] = useState<LambdaMetric[]>([]);
    const [isVisible, setIsVisible] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({
        tables: [],
        operations: [],
        showQueries: false,
        source: 'ALL'
    });
    const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
    const [showStats, setShowStats] = useState(false);
    const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
    const [lastFetch, setLastFetch] = useState<Date | null>(null);
    
    // Batch-related state
    const [batchTimeWindow, setBatchTimeWindow] = useState(5000); // 5 seconds default
    const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
    const [showAllBatches, setShowAllBatches] = useState(false);
    
    const monitoring = getMonitoring({
        logToConsole: true,
        sendToCloudWatch: true,
        showUIMonitor: true
    });

    const client = generateClient();

    // Fetch Lambda metrics from CloudWatch
    const fetchLambdaMetrics = async () => {
        setIsLoadingMetrics(true);
        try {
            const query = /* GraphQL */ `
                query GetDatabaseMetrics($timeRange: String) {
                    getDatabaseMetrics(timeRange: $timeRange) {
                        metrics {
                            timestamp
                            functionName
                            operation
                            table
                            success
                            duration
                            count
                        }
                    }
                }
            `;
            
            const result = await client.graphql({
                query: query,
                variables: { timeRange: 'LAST_24_HOURS' }
            }) as any;
            
            if (result.data?.getDatabaseMetrics?.metrics) {
                const metrics = result.data.getDatabaseMetrics.metrics;
                setLambdaMetrics(metrics);
                setLastFetch(new Date());
            }
            
        } catch (error) {
            console.error('[Monitor] Failed to fetch Lambda metrics:', error);
        } finally {
            setIsLoadingMetrics(false);
        }
    };

    useEffect(() => {
        // Subscribe to client-side database operations
        const unsubscribe = monitoring.subscribe((operation) => {
            setClientOperations(prev => {
                const updated = [operation, ...prev].slice(0, 500); // Keep last 500
                return updated;
            });
            // Reset to show most recent batch when new operations arrive
            setCurrentBatchIndex(0);
        });

        // Load existing client operations
        const existing = monitoring.getOperations();
        setClientOperations(existing);

        // Initial fetch of Lambda metrics
        fetchLambdaMetrics();

        // Refresh Lambda metrics every 30 seconds
        const metricsInterval = setInterval(fetchLambdaMetrics, 30000);

        // Update stats every second
        const statsInterval = setInterval(() => {
            setStats(monitoring.getStats());
        }, 1000);

        return () => {
            unsubscribe();
            clearInterval(metricsInterval);
            clearInterval(statsInterval);
        };
    }, []);

    // Combine client operations and Lambda metrics
    const getCombinedOperations = useCallback(() => {
        const combined: any[] = [];
        
        // Add client operations
        if (filters.source === 'ALL' || filters.source === 'CLIENT') {
            combined.push(...clientOperations.map(op => ({
                ...op,
                source: 'CLIENT',
                displayOperation: op.operation
            })));
        }
        
        // Add Lambda metrics
        if (filters.source === 'ALL' || filters.source === 'LAMBDA') {
            combined.push(...lambdaMetrics.map(metric => ({
                operation: metric.operation,
                table: metric.table,
                timestamp: metric.timestamp,
                success: metric.success,
                duration: metric.duration,
                count: metric.count,
                functionName: metric.functionName,
                source: 'LAMBDA',
                displayOperation: metric.operation
            })));
        }
        
        // Sort by timestamp (newest first)
        return combined.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }, [clientOperations, lambdaMetrics, filters.source]);

    // Group operations into batches based on time proximity
    const getOperationBatches = useCallback((operations: any[]): OperationBatch[] => {
        if (operations.length === 0) return [];
        
        const batches: OperationBatch[] = [];
        let currentBatch: any[] = [operations[0]];
        
        for (let i = 1; i < operations.length; i++) {
            const prevTime = new Date(operations[i - 1].timestamp).getTime();
            const currTime = new Date(operations[i].timestamp).getTime();
            const timeDiff = prevTime - currTime; // Note: operations are sorted newest first
            
            // If the time gap is larger than the batch window, start a new batch
            if (timeDiff > batchTimeWindow) {
                // Save the current batch
                batches.push({
                    operations: currentBatch,
                    startTime: new Date(currentBatch[currentBatch.length - 1].timestamp),
                    endTime: new Date(currentBatch[0].timestamp),
                    count: currentBatch.length
                });
                // Start a new batch
                currentBatch = [operations[i]];
            } else {
                currentBatch.push(operations[i]);
            }
        }
        
        // Don't forget the last batch
        if (currentBatch.length > 0) {
            batches.push({
                operations: currentBatch,
                startTime: new Date(currentBatch[currentBatch.length - 1].timestamp),
                endTime: new Date(currentBatch[0].timestamp),
                count: currentBatch.length
            });
        }
        
        return batches;
    }, [batchTimeWindow]);

    // Apply filters and batch logic
    const { filteredOperations, batches, currentBatch } = useMemo(() => {
        let filtered = getCombinedOperations();
        
        // Filter by operation type
        if (!filters.showQueries) {
            filtered = filtered.filter(op => op.operation !== 'QUERY');
        }
        
        if (filters.operations.length > 0) {
            filtered = filtered.filter(op => 
                filters.operations.includes(op.operation)
            );
        }
        
        // Filter by table
        if (filters.tables.length > 0) {
            filtered = filtered.filter(op => 
                filters.tables.includes(op.table)
            );
        }
        
        // Group into batches
        const operationBatches = getOperationBatches(filtered);
        
        // Get current batch or all operations
        const currentBatchOps = showAllBatches 
            ? filtered 
            : operationBatches[currentBatchIndex]?.operations || [];
        
        const currentBatchInfo = operationBatches[currentBatchIndex] || null;
        
        return {
            filteredOperations: currentBatchOps,
            batches: operationBatches,
            currentBatch: currentBatchInfo
        };
    }, [getCombinedOperations, filters, getOperationBatches, currentBatchIndex, showAllBatches]);

    // Get available tables and operations for filters
    const availableTables = useMemo(() => {
        const combined = getCombinedOperations();
        return Array.from(new Set(combined.map(op => op.table).filter(Boolean)));
    }, [getCombinedOperations]);

    const handleExportData = () => {
        const dataStr = JSON.stringify({
            operations: filteredOperations,
            stats: stats,
            timestamp: new Date().toISOString()
        }, null, 2);
        
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-operations-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getOperationColor = (operation: string) => {
        const colors: Record<string, string> = {
            'INSERT': 'bg-green-50 border-green-200',
            'UPDATE': 'bg-yellow-50 border-yellow-200',
            'DELETE': 'bg-red-50 border-red-200',
            'QUERY': 'bg-blue-50 border-blue-200'
        };
        return colors[operation] || 'bg-gray-50 border-gray-200';
    };

    const getOperationIcon = (operation: string) => {
        const icons: Record<string, ReactElement> = {
            'INSERT': <Database className="w-4 h-4 text-green-600" />,
            'UPDATE': <RefreshCw className="w-4 h-4 text-yellow-600" />,
            'DELETE': <XCircle className="w-4 h-4 text-red-600" />,
            'QUERY': <Activity className="w-4 h-4 text-blue-600" />
        };
        return icons[operation] || <Activity className="w-4 h-4 text-gray-600" />;
    };

    const getSourceIcon = (source: string) => {
        return source === 'LAMBDA' 
            ? <Server className="w-4 h-4 text-purple-500" />
            : <Monitor className="w-4 h-4 text-blue-500" />;
    };

    const formatBatchTimeRange = (batch: OperationBatch | null) => {
        if (!batch) return '';
        const duration = batch.endTime.getTime() - batch.startTime.getTime();
        return `${batch.startTime.toLocaleTimeString()} - ${batch.endTime.toLocaleTimeString()} (${(duration / 1000).toFixed(1)}s)`;
    };

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 right-4 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors z-50"
                title="Show Database Monitor"
            >
                <Eye className="w-5 h-5" />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border border-gray-300 z-50 transition-all ${
            isMinimized ? 'w-80' : 'w-96 max-h-[600px]'
        } flex flex-col`}>
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-3 rounded-t-lg">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Activity className="w-5 h-5" />
                        <h3 className="font-semibold">Database Monitor</h3>
                        {isLoadingMetrics && (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Toggle Stats"
                        >
                            <BarChart2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleExportData}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Export Data"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => fetchLambdaMetrics()}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Minimize"
                        >
                            {isMinimized ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setIsVisible(false)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Hide"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                {/* Batch Navigation Controls */}
                {!isMinimized && batches.length > 0 && (
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <button
                                onClick={() => setShowAllBatches(!showAllBatches)}
                                className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                                    showAllBatches
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                <Layers className="w-3 h-3" />
                                {showAllBatches ? 'All Operations' : 'Latest Batch Only'}
                            </button>
                            
                            {!showAllBatches && batches.length > 1 && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentBatchIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentBatchIndex === 0}
                                        className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Previous Batch"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="text-xs">
                                        {currentBatchIndex + 1} / {batches.length}
                                    </span>
                                    <button
                                        onClick={() => setCurrentBatchIndex(prev => Math.min(batches.length - 1, prev + 1))}
                                        disabled={currentBatchIndex === batches.length - 1}
                                        className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Next Batch"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        {/* Current Batch Info */}
                        {!showAllBatches && currentBatch && (
                            <div className="text-xs text-gray-300 bg-gray-800/50 rounded px-2 py-1">
                                <div className="flex items-center gap-1 mb-1">
                                    <Clock className="w-3 h-3" />
                                    {formatBatchTimeRange(currentBatch)}
                                </div>
                                <div>{currentBatch.count} operations in this batch</div>
                            </div>
                        )}
                        
                        {/* Batch Time Window Selector */}
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-300">Batch window:</span>
                            <select
                                value={batchTimeWindow}
                                onChange={(e) => {
                                    setBatchTimeWindow(Number(e.target.value));
                                    setCurrentBatchIndex(0);
                                }}
                                className="bg-gray-700 rounded px-2 py-1 text-white text-xs"
                            >
                                <option value="2000">2 seconds</option>
                                <option value="3000">3 seconds</option>
                                <option value="5000">5 seconds</option>
                                <option value="10000">10 seconds</option>
                                <option value="30000">30 seconds</option>
                            </select>
                        </div>
                    </div>
                )}
                
                {/* Source Filter */}
                {!isMinimized && (
                    <div className="flex gap-2 mt-2">
                        {(['ALL', 'CLIENT', 'LAMBDA'] as const).map(source => (
                            <button
                                key={source}
                                onClick={() => setFilters(prev => ({ ...prev, source }))}
                                className={`px-2 py-1 text-xs rounded transition-colors ${
                                    filters.source === source
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                {source}
                            </button>
                        ))}
                    </div>
                )}
                
                {/* Filter Bar */}
                {!isMinimized && (
                    <div className="flex gap-2 text-xs mt-2">
                        <select
                            className="bg-gray-700 rounded px-2 py-1 text-white flex-1"
                            onChange={(e) => {
                                const value = e.target.value;
                                setFilters(prev => ({
                                    ...prev,
                                    tables: value ? [value] : []
                                }));
                            }}
                        >
                            <option value="">All Tables</option>
                            {availableTables.map(table => (
                                <option key={table} value={table}>{table}</option>
                            ))}
                        </select>
                        
                        <select
                            className="bg-gray-700 rounded px-2 py-1 text-white flex-1"
                            onChange={(e) => {
                                const value = e.target.value;
                                setFilters(prev => ({
                                    ...prev,
                                    operations: value ? [value] : []
                                }));
                            }}
                        >
                            <option value="">All Operations</option>
                            <option value="INSERT">INSERT</option>
                            <option value="UPDATE">UPDATE</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                        
                        <label className="flex items-center gap-1 text-white">
                            <input
                                type="checkbox"
                                checked={filters.showQueries}
                                onChange={(e) => setFilters(prev => ({
                                    ...prev,
                                    showQueries: e.target.checked
                                }))}
                                className="rounded"
                            />
                            Queries
                        </label>
                    </div>
                )}
                
                {lastFetch && !isMinimized && (
                    <div className="mt-2 text-xs text-gray-400">
                        Last fetch: {lastFetch.toLocaleTimeString()}
                    </div>
                )}
            </div>

            {/* Stats Panel */}
            {!isMinimized && showStats && (
                <div className="border-b border-gray-200 p-3 bg-gray-50 max-h-32 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(stats).map(([table, counts]) => (
                            <div key={table} className="bg-white p-2 rounded border">
                                <div className="font-semibold text-gray-700 mb-1">
                                    {table}
                                </div>
                                <div className="flex gap-3">
                                    {Object.entries(counts).map(([op, count]) => (
                                        count > 0 && (
                                            <span key={op} className="flex items-center gap-1">
                                                {getOperationIcon(op)}
                                                <span className="text-gray-600">{count}</span>
                                            </span>
                                        )
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Operations List */}
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {filteredOperations.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            <Database className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No database operations in this batch</p>
                            <p className="text-xs mt-1">
                                {showAllBatches 
                                    ? 'Operations will appear here as they happen'
                                    : batches.length > 0 
                                        ? 'Try navigating to a different batch'
                                        : 'Operations will appear here as they happen'
                                }
                            </p>
                        </div>
                    ) : (
                        filteredOperations.map((op, index) => (
                            <div
                                key={`${op.timestamp}-${index}`}
                                className={`border rounded-lg p-2 transition-all hover:shadow-md ${getOperationColor(op.operation)}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        {getSourceIcon(op.source)}
                                        {getOperationIcon(op.operation)}
                                        <span className="font-semibold text-sm">
                                            {op.operation}
                                        </span>
                                        <span className="text-xs font-medium">
                                            {op.table}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {new Date(op.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                
                                {op.source === 'LAMBDA' && (
                                    <div className="text-xs text-gray-600 mt-1 flex items-center gap-2">
                                        <span>λ {op.functionName || 'Lambda'}</span>
                                        {op.duration && <span>• {op.duration}ms</span>}
                                        {op.count && <span>• Count: {op.count}</span>}
                                    </div>
                                )}
                                
                                {op.recordId && (
                                    <div className="text-xs text-gray-600 mt-1">
                                        ID: {op.recordId}
                                    </div>
                                )}
                                
                                {op.success !== undefined && (
                                    <div className="flex items-center gap-1 mt-1">
                                        {op.success ? (
                                            <CheckCircle className="w-3 h-3 text-green-500" />
                                        ) : (
                                            <XCircle className="w-3 h-3 text-red-500" />
                                        )}
                                        <span className={`text-xs ${op.success ? 'text-green-600' : 'text-red-600'}`}>
                                            {op.success ? 'Success' : 'Failed'}
                                        </span>
                                    </div>
                                )}
                                
                                {op.data && (
                                    <details className="mt-1">
                                        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                            View Data
                                        </summary>
                                        <pre className="text-xs mt-1 p-2 bg-gray-50 rounded overflow-x-auto max-h-32">
                                            {JSON.stringify(op.data, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Footer */}
            {!isMinimized && (
                <div className="border-t border-gray-200 p-2 bg-gray-50 text-xs text-gray-600">
                    <div className="flex justify-between">
                        <span>
                            Showing {filteredOperations.length} operations
                            {!showAllBatches && batches.length > 0 && ` in batch ${currentBatchIndex + 1}`}
                        </span>
                        <span>
                            Client: {clientOperations.length} | Lambda: {lambdaMetrics.length}
                        </span>
                    </div>
                    {batches.length > 1 && (
                        <div className="mt-1 text-center text-gray-500">
                            {batches.length} batches total
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};