// src/pages/debug/DatabaseMonitor.tsx
// Unified Database Monitor - Shows operations from both Frontend and Lambda functions

import React, { useState, useEffect } from 'react';
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
    AlertCircle
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

export const DatabaseMonitorPage: React.FC = () => {
    const [clientOperations, setClientOperations] = useState<any[]>([]);
    const [lambdaOperations, setLambdaOperations] = useState<LambdaOperation[]>([]);
    const [filter, setFilter] = useState<'ALL' | 'CLIENT' | 'LAMBDA'>('ALL');
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [cloudWatchMetrics, setCloudWatchMetrics] = useState<any[]>([]);
    const [stats, setStats] = useState({
        client: { total: 0, inserts: 0, updates: 0, deletes: 0, queries: 0 },
        lambda: { total: 0, inserts: 0, updates: 0, deletes: 0, queries: 0 }
    });
    
    const client = generateClient();
    const monitoring = getMonitoring();

    // Fetch CloudWatch metrics (last 24 hours)
    const fetchCloudWatchMetrics = async () => {
        setIsLoading(true);
        try {
            // This calls your 'getDatabaseMetrics' Lambda function
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
            
            // Execute the GraphQL query
            const result = await client.graphql({
                query: query,
                variables: { timeRange: 'LAST_24_HOURS' }
            }) as any;
            
            // Set the Lambda operations state with the fetched data
            if (result.data?.getDatabaseMetrics?.metrics) {
                setLambdaOperations(result.data.getDatabaseMetrics.metrics);
                setCloudWatchMetrics(result.data.getDatabaseMetrics.metrics);
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
    }, []); // Note: Empty dependency array is correct here

    // This effect runs when lambdaOperations state is updated
    // It updates the statistics block for "LAMBDA"
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
            // Only update client stats in real-time from the subscription
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

    // Filter operations based on selected filters
    const getFilteredOperations = () => {
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
        
        // Sort by timestamp
        return allOps.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    };

    const exportData = () => {
        const data = {
            timestamp: new Date().toISOString(),
            stats,
            operations: {
                client: clientOperations,
                lambda: lambdaOperations
            },
            cloudWatchMetrics
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `database-monitor-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getSourceIcon = (source: string) => {
        return source === 'LAMBDA' 
            ? <Server className="w-4 h-4 text-purple-500" />
            : <Monitor className="w-4 h-4 text-blue-500" />;
    };

    const getOperationColor = (operation: string) => {
        const op = operation?.toLowerCase();
        if (op?.includes('insert')) return 'text-green-600 bg-green-50';
        if (op?.includes('update')) return 'text-blue-600 bg-blue-50';
        if (op?.includes('delete')) return 'text-red-600 bg-red-50';
        if (op?.includes('query')) return 'text-gray-600 bg-gray-50';
        if (op?.includes('error')) return 'text-red-600 bg-red-50';
        return 'text-gray-600 bg-gray-50';
    };

    const filteredOperations = getFilteredOperations();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Database className="w-6 h-6" />
                            Unified Database Monitor
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Real-time monitoring of all database operations from Frontend and Lambda functions
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={fetchCloudWatchMetrics}
                            disabled={isLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={exportData}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Export
                        </button>
                    </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Client Stats */}
                    <div className="bg-blue-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Monitor className="w-5 h-5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-600">CLIENT</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.client.total}</div>
                        <div className="text-xs text-gray-600 space-y-1 mt-2">
                            <div className="flex justify-between">
                                <span>Inserts:</span>
                                <span className="font-medium">{stats.client.inserts}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Updates:</span>
                                <span className="font-medium">{stats.client.updates}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Deletes:</span>
                                <span className="font-medium">{stats.client.deletes}</span>
                            </div>
                        </div>
                    </div>

                    {/* Lambda Stats */}
                    <div className="bg-purple-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Server className="w-5 h-5 text-purple-600" />
                            <span className="text-xs font-medium text-purple-600">LAMBDA</span>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{stats.lambda.total}</div>
                        <div className="text-xs text-gray-600 space-y-1 mt-2">
                            <div className="flex justify-between">
                                <span>Inserts:</span>
                                <span className="font-medium">{stats.lambda.inserts}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Updates:</span>
                                <span className="font-medium">{stats.lambda.updates}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Deletes:</span>
                                <span className="font-medium">{stats.lambda.deletes}</span>
                            </div>
                        </div>
                    </div>

                    {/* Total Operations */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <Activity className="w-5 h-5 text-gray-600" />
                            <span className="text-xs font-medium text-gray-600">TOTAL OPS</span>
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
            </div>

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
                    </div>
                </div>
            </div>

            {/* Operations List */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="border-b border-gray-200 px-6 py-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Real-time Operations
                    </h2>
                </div>
                
                <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                    {filteredOperations.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <Database className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No operations recorded yet</p>
                            <p className="text-sm mt-1">Database operations will appear here in real-time</p>
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