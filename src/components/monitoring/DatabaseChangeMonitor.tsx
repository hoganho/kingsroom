// src/components/monitoring/DatabaseChangeMonitor.tsx
// FIXED VERSION - Now calls the Lambda and displays both client and Lambda operations

import React, { useState, useEffect, useCallback } from 'react';
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
    Monitor
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
            //console.log('[Monitor] Fetching Lambda metrics...');
            
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
            
            //console.log('[Monitor] Lambda metrics response:', result);
            
            if (result.data?.getDatabaseMetrics?.metrics) {
                const metrics = result.data.getDatabaseMetrics.metrics;
                setLambdaMetrics(metrics);
                setLastFetch(new Date());
                //console.log(`[Monitor] Loaded ${metrics.length} Lambda metrics`);
            } else {
                console.warn('[Monitor] No metrics in response');
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

    // Combine client operations and Lambda metrics for display
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
        
        // Sort by timestamp
        return combined.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }, [clientOperations, lambdaMetrics, filters.source]);

    const getFilteredOperations = useCallback(() => {
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
        
        return filtered;
    }, [getCombinedOperations, filters]);

    const clearOperations = () => {
        monitoring.clear();
        setClientOperations([]);
    };

    const exportToJSON = () => {
        const data = {
            timestamp: new Date().toISOString(),
            clientOperations: clientOperations,
            lambdaMetrics: lambdaMetrics,
            stats
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `db-operations-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getOperationIcon = (operation: string) => {
        switch (operation) {
            case 'INSERT':
                return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'UPDATE':
                return <RefreshCw className="w-4 h-4 text-blue-500" />;
            case 'DELETE':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'QUERY':
                return <Eye className="w-4 h-4 text-gray-500" />;
            default:
                return <Activity className="w-4 h-4 text-gray-400" />;
        }
    };

    const getOperationColor = (operation: string) => {
        switch (operation) {
            case 'INSERT':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'UPDATE':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'DELETE':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'QUERY':
                return 'bg-gray-100 text-gray-800 border-gray-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getSourceIcon = (source: string) => {
        return source === 'LAMBDA' 
            ? <Server className="w-4 h-4 text-purple-500" />
            : <Monitor className="w-4 h-4 text-blue-500" />;
    };

    // Get unique tables from all operations
    const availableTables = Array.from(
        new Set([
            ...clientOperations.map(op => op.table),
            ...lambdaMetrics.map(m => m.table)
        ])
    );

    const filteredOperations = getFilteredOperations();

    if (!isVisible) {
        return (
            <button
                onClick={() => setIsVisible(true)}
                className="fixed bottom-4 right-4 p-3 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-700 transition-all z-50"
                title="Show Database Monitor"
            >
                <Database className="w-6 h-6" />
            </button>
        );
    }

    if (isMinimized) {
        return (
            <div className="fixed bottom-4 right-4 bg-gray-800 text-white rounded-lg shadow-xl p-3 flex items-center gap-3 z-50">
                <Database className="w-5 h-5" />
                <span className="text-sm font-medium">
                    {filteredOperations.length} operations
                </span>
                <button
                    onClick={() => setIsMinimized(false)}
                    className="hover:bg-gray-700 p-1 rounded"
                >
                    <Eye className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-4 right-4 w-[500px] max-h-[600px] bg-white rounded-lg shadow-2xl border border-gray-200 z-50 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white p-4 rounded-t-lg">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        <h3 className="font-semibold">Database Monitor</h3>
                        {isLoadingMetrics && (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        )}
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Toggle Stats"
                        >
                            <BarChart2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={fetchLambdaMetrics}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Refresh Lambda Metrics"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                            onClick={exportToJSON}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Export"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={clearOperations}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Clear Client Operations"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsMinimized(true)}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Minimize"
                        >
                            <EyeOff className="w-4 h-4" />
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
                
                {/* Source Filter */}
                <div className="flex gap-2 mb-2">
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
                
                {/* Filter Bar */}
                <div className="flex gap-2 text-xs">
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
                
                {lastFetch && (
                    <div className="mt-2 text-xs text-gray-400">
                        Last fetch: {lastFetch.toLocaleTimeString()}
                    </div>
                )}
            </div>

            {/* Stats Panel */}
            {showStats && (
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
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredOperations.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                        <Database className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>No database operations yet</p>
                        <p className="text-xs mt-1">Operations will appear here as they happen</p>
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

            {/* Footer */}
            <div className="border-t border-gray-200 p-2 bg-gray-50 text-xs text-gray-600">
                <div className="flex justify-between">
                    <span>
                        Showing {filteredOperations.length} operations
                    </span>
                    <span>
                        Client: {clientOperations.length} | Lambda: {lambdaMetrics.length}
                    </span>
                </div>
            </div>
        </div>
    );
};