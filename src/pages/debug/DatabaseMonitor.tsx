// src/pages/debug/DatabaseMonitor.tsx
// IMPROVED VERSION - Shows only the most recent batch of database operations

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { getMonitoring } from '../../utils/enhanced-monitoring';
import { 
    Database, 
    Server,
    Monitor,
    Activity,
    RefreshCw,
    Download,
    Filter,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Layers
} from 'lucide-react';

interface LambdaOperation {
    functionName: string;
    operation: string;
    table: string;
    timestamp: string;
    success: boolean;
    duration?: number;
    entityId?: string;
}

interface OperationBatch {
    operations: any[];
    startTime: Date;
    endTime: Date;
    count: number;
}

export const DatabaseMonitorPage: React.FC = () => {
    const [clientOperations, setClientOperations] = useState<any[]>([]);
    const [lambdaOperations, setLambdaOperations] = useState<LambdaOperation[]>([]);
    const [filter, setFilter] = useState<'ALL' | 'CLIENT' | 'LAMBDA'>('ALL');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({
        client: { total: 0, inserts: 0, updates: 0, deletes: 0, queries: 0 },
        lambda: { total: 0, inserts: 0, updates: 0, deletes: 0, queries: 0 }
    });
    
    // Batch-related state
    const [batchTimeWindow, setBatchTimeWindow] = useState(5000); // 5 seconds default
    const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
    const [showAllBatches, setShowAllBatches] = useState(false);
    
    const client = generateClient();
    const monitoring = getMonitoring();

    // Fetch CloudWatch metrics (last 24 hours)
    const fetchCloudWatchMetrics = async () => {
        setIsLoading(true);
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
                            entityId
                        }
                    }
                }
            `;
            
            const result = await client.graphql({
                query: query,
                variables: { timeRange: 'LAST_24_HOURS' }
            }) as any;
            
            if (result.data?.getDatabaseMetrics?.metrics) {
                setLambdaOperations(result.data.getDatabaseMetrics.metrics);
            }
            
        } catch (error) {
            console.error('Failed to fetch CloudWatch metrics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Subscribe to client operations
        const unsubscribe = monitoring.subscribe((operation) => {
            setClientOperations(prev => [operation, ...prev].slice(0, 100));
            updateStats('client', operation);
            // Reset to show most recent batch when new operations arrive
            setCurrentBatchIndex(0);
        });

        // Initial load of local client operations
        const ops = monitoring.getOperations();
        setClientOperations(ops);
        
        // Initial fetch of remote Lambda operations
        fetchCloudWatchMetrics();

        // Poll for new Lambda operations every 30 seconds
        const interval = setInterval(fetchCloudWatchMetrics, 30000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, []);

    // Update Lambda statistics when operations change
    useEffect(() => {
        if (lambdaOperations.length === 0) return;

        const statsUpdate = { total: 0, inserts: 0, updates: 0, deletes: 0, queries: 0 };
        lambdaOperations.forEach(op => {
            statsUpdate.total++;
            const opType = op.operation?.toLowerCase();
            if (opType?.includes('insert') || opType === 'insert') statsUpdate.inserts++;
            else if (opType?.includes('update') || opType === 'update') statsUpdate.updates++;
            else if (opType?.includes('delete') || opType === 'delete') statsUpdate.deletes++;
            else if (opType?.includes('query') || opType === 'query') statsUpdate.queries++;
        });

        setStats(prev => ({
            ...prev,
            lambda: statsUpdate
        }));
    }, [lambdaOperations]);

    const updateStats = (source: 'client' | 'lambda', operation: any) => {
        setStats(prev => {
            const newStats = { ...prev };
            if (source === 'client') {
                newStats[source].total++;
                
                const opType = operation.operation?.toLowerCase();
                if (opType?.includes('insert') || opType === 'insert') newStats[source].inserts++;
                else if (opType?.includes('update') || opType === 'update') newStats[source].updates++;
                else if (opType?.includes('delete') || opType === 'delete') newStats[source].deletes++;
                else if (opType?.includes('query') || opType === 'query') newStats[source].queries++;
            }
            return newStats;
        });
    };

    // Get all unique tables from both sources
    const allTables = Array.from(new Set([
        ...clientOperations.map(op => op.table),
        ...lambdaOperations.map(op => op.table)
    ])).filter(Boolean);

    // Combine all operations
    const getAllOperations = useCallback(() => {
        let allOps = [];
        
        if (filter === 'ALL' || filter === 'CLIENT') {
            allOps.push(...clientOperations.map(op => ({ ...op, source: 'CLIENT' })));
        }
        
        if (filter === 'ALL' || filter === 'LAMBDA') {
            allOps.push(...lambdaOperations.map(op => ({ ...op, source: 'LAMBDA' })));
        }
        
        if (selectedTable) {
            allOps = allOps.filter(op => op.table === selectedTable);
        }
        
        // Sort by timestamp (newest first)
        return allOps.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }, [filter, selectedTable, clientOperations, lambdaOperations]);

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

    // Get filtered operations with batch logic
    const { filteredOperations, batches, currentBatch } = useMemo(() => {
        const all = getAllOperations();
        const operationBatches = getOperationBatches(all);
        
        const currentBatchOps = showAllBatches 
            ? all 
            : operationBatches[currentBatchIndex]?.operations || [];
        
        const currentBatchInfo = operationBatches[currentBatchIndex] || null;
        
        return {
            filteredOperations: currentBatchOps,
            batches: operationBatches,
            currentBatch: currentBatchInfo
        };
    }, [getAllOperations, getOperationBatches, currentBatchIndex, showAllBatches]);

    const exportData = () => {
        const dataStr = JSON.stringify({
            clientOperations,
            lambdaOperations,
            stats,
            timestamp: new Date().toISOString()
        }, null, 2);
        
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-monitor-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getOperationColor = (operation: string) => {
        const opLower = operation?.toLowerCase() || '';
        if (opLower.includes('insert') || opLower === 'insert') return 'bg-green-100 text-green-800';
        if (opLower.includes('update') || opLower === 'update') return 'bg-yellow-100 text-yellow-800';
        if (opLower.includes('delete') || opLower === 'delete') return 'bg-red-100 text-red-800';
        if (opLower.includes('query') || opLower === 'query') return 'bg-blue-100 text-blue-800';
        return 'bg-gray-100 text-gray-800';
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

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Database Monitor</h1>
                    <p className="text-gray-600 mt-1">Real-time database operations from client and Lambda functions</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchCloudWatchMetrics}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={exportData}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Client Operations */}
                <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Monitor className="w-5 h-5 text-blue-600" />
                        <span className="text-xs font-medium text-blue-600">CLIENT</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{stats.client.total}</div>
                    <div className="text-xs text-gray-600 mt-2 space-y-1">
                        <div>Inserts: {stats.client.inserts}</div>
                        <div>Updates: {stats.client.updates}</div>
                        <div>Deletes: {stats.client.deletes}</div>
                    </div>
                </div>

                {/* Lambda Operations */}
                <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Server className="w-5 h-5 text-purple-600" />
                        <span className="text-xs font-medium text-purple-600">LAMBDA</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{stats.lambda.total}</div>
                    <div className="text-xs text-gray-600 mt-2 space-y-1">
                        <div>Inserts: {stats.lambda.inserts}</div>
                        <div>Updates: {stats.lambda.updates}</div>
                        <div>Deletes: {stats.lambda.deletes}</div>
                    </div>
                </div>

                {/* Total Operations */}
                <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Activity className="w-5 h-5 text-gray-600" />
                        <span className="text-xs font-medium text-gray-600">TOTAL</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        {stats.client.total + stats.lambda.total}
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                        Last 24 hours
                    </div>
                </div>

                {/* Tables Affected */}
                <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <Database className="w-5 h-5 text-green-600" />
                        <span className="text-xs font-medium text-green-600">TABLES</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{allTables.length}</div>
                    <div className="text-xs text-gray-600 mt-2">
                        Tables accessed
                    </div>
                </div>
            </div>

            {/* Batch Controls */}
            {batches.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">Batch View</span>
                        </div>
                        <button
                            onClick={() => setShowAllBatches(!showAllBatches)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                showAllBatches
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            {showAllBatches ? 'Show All Operations' : 'Show Latest Batch Only'}
                        </button>
                    </div>
                    
                    {!showAllBatches && (
                        <div className="space-y-3">
                            {/* Batch Navigation */}
                            {batches.length > 1 && (
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => setCurrentBatchIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentBatchIndex === 0}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Previous Batch
                                    </button>
                                    <span className="text-sm text-gray-600">
                                        Batch {currentBatchIndex + 1} of {batches.length}
                                    </span>
                                    <button
                                        onClick={() => setCurrentBatchIndex(prev => Math.min(batches.length - 1, prev + 1))}
                                        disabled={currentBatchIndex === batches.length - 1}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        Next Batch
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            
                            {/* Current Batch Info */}
                            {currentBatch && (
                                <div className="bg-blue-50 rounded-lg p-3">
                                    <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                                        <Clock className="w-4 h-4" />
                                        <span className="font-medium">{formatBatchTimeRange(currentBatch)}</span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        {currentBatch.count} operations in this batch
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Batch Time Window Selector */}
                    <div className="flex items-center gap-2 mt-3">
                        <span className="text-sm text-gray-600">Batch time window:</span>
                        <select
                            value={batchTimeWindow}
                            onChange={(e) => {
                                setBatchTimeWindow(Number(e.target.value));
                                setCurrentBatchIndex(0);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                        >
                            <option value="2000">2 seconds</option>
                            <option value="3000">3 seconds</option>
                            <option value="5000">5 seconds</option>
                            <option value="10000">10 seconds</option>
                            <option value="30000">30 seconds</option>
                        </select>
                        <span className="text-xs text-gray-500 ml-2">
                            Operations within this window are grouped together
                        </span>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">Filters:</span>
                    </div>
                    
                    {/* Source Filter */}
                    <div className="flex gap-2">
                        {(['ALL', 'CLIENT', 'LAMBDA'] as const).map(source => (
                            <button
                                key={source}
                                onClick={() => setFilter(source)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                    filter === source
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                {source}
                            </button>
                        ))}
                    </div>

                    {/* Table Filter */}
                    <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm"
                    >
                        <option value="">All Tables</option>
                        {allTables.map(table => (
                            <option key={table} value={table}>{table}</option>
                        ))}
                    </select>

                    <div className="ml-auto text-sm text-gray-500">
                        Showing {filteredOperations.length} operations
                        {!showAllBatches && batches.length > 0 && ` in batch ${currentBatchIndex + 1}`}
                    </div>
                </div>
            </div>

            {/* Operations List */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="border-b border-gray-200 px-6 py-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {showAllBatches ? 'All Operations' : `Batch ${currentBatchIndex + 1} Operations`}
                    </h2>
                    {batches.length > 1 && (
                        <p className="text-sm text-gray-600 mt-1">
                            {batches.length} total batches identified
                        </p>
                    )}
                </div>
                
                <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                    {filteredOperations.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <Database className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No operations in this batch</p>
                            <p className="text-sm mt-1">
                                {showAllBatches 
                                    ? 'Database operations will appear here in real-time'
                                    : batches.length > 0
                                        ? 'Try navigating to a different batch'
                                        : 'Database operations will appear here in real-time'
                                }
                            </p>
                        </div>
                    ) : (
                        filteredOperations.map((op, index) => (
                            <div key={`${op.timestamp}-${index}`} className="p-4 hover:bg-gray-50">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            {getSourceIcon(op.source)}
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getOperationColor(op.operation)}`}>
                                                {op.operation}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900">
                                                {op.table}
                                            </span>
                                            {op.recordId && (
                                                <span className="text-xs text-gray-500">
                                                    ID: {op.recordId}
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Lambda-specific info */}
                                        {op.source === 'LAMBDA' && op.functionName && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                Function: {op.functionName}
                                                {op.duration && ` • Duration: ${op.duration}ms`}
                                                {op.entityId && ` • Entity: ${op.entityId}`}
                                            </div>
                                        )}
                                        
                                        {/* Success/Error indicator */}
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
                                    </div>
                                    
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(op.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                                
                                {/* Expandable data */}
                                {op.data && (
                                    <details className="mt-2">
                                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                            View Data
                                        </summary>
                                        <pre className="text-xs mt-2 p-2 bg-gray-50 rounded overflow-x-auto">
                                            {JSON.stringify(op.data, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* CloudWatch Integration Status */}
            <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-gray-700">
                            CloudWatch Integration
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm text-gray-600">Connected</span>
                    </div>
                </div>
                
                <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <span className="text-gray-500">Client Namespace:</span>
                        <span className="ml-2 font-mono text-gray-700">ScraperSystem/Client</span>
                    </div>
                    <div>
                        <span className="text-gray-500">Lambda Namespace:</span>
                        <span className="ml-2 font-mono text-gray-700">ScraperSystem/Lambda</span>
                    </div>
                </div>
            </div>
        </div>
    );
};