// src/components/monitoring/DatabaseChangeMonitor.tsx
// Real-time database monitor - Fixed TypeScript errors (removed unused imports)

import React, { useState, useEffect, useCallback } from 'react';
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
    BarChart2
} from 'lucide-react';

interface FilterOptions {
    tables: string[];
    operations: string[];
    showQueries: boolean;
}

export const DatabaseChangeMonitor: React.FC = () => {
    const [operations, setOperations] = useState<DatabaseOperation[]>([]);
    const [isVisible, setIsVisible] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);
    const [filters, setFilters] = useState<FilterOptions>({
        tables: [],
        operations: [],
        showQueries: false
    });
    const [stats, setStats] = useState<Record<string, Record<string, number>>>({});
    const [showStats, setShowStats] = useState(false);
    
    const monitoring = getMonitoring({
        logToConsole: true,
        sendToCloudWatch: true,
        showUIMonitor: true
    });

    useEffect(() => {
        // Subscribe to database operations
        const unsubscribe = monitoring.subscribe((operation) => {
            setOperations(prev => {
                const updated = [operation, ...prev].slice(0, 500); // Keep last 500
                return updated;
            });
        });

        // Load existing operations
        const existing = monitoring.getOperations();
        setOperations(existing);

        // Update stats every second
        const statsInterval = setInterval(() => {
            setStats(monitoring.getStats());
        }, 1000);

        return () => {
            unsubscribe();
            clearInterval(statsInterval);
        };
    }, []);

    const getFilteredOperations = useCallback(() => {
        let filtered = operations;
        
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
    }, [operations, filters]);

    const clearOperations = () => {
        monitoring.clear();
        setOperations([]);
    };

    const exportToJSON = () => {
        const data = {
            timestamp: new Date().toISOString(),
            operations: getFilteredOperations(),
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

    // Get unique tables from operations
    const availableTables = Array.from(
        new Set(operations.map(op => op.table))
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
                            onClick={exportToJSON}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Export"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={clearOperations}
                            className="p-1.5 hover:bg-gray-700 rounded transition-colors"
                            title="Clear"
                        >
                            <RefreshCw className="w-4 h-4" />
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
                
                {/* Filter Bar */}
                <div className="flex gap-2 text-xs">
                    <select
                        className="bg-gray-700 rounded px-2 py-1 text-white"
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
                        className="bg-gray-700 rounded px-2 py-1 text-white"
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
                        Show Queries
                    </label>
                </div>
            </div>

            {/* Stats Panel */}
            {showStats && (
                <div className="border-b border-gray-200 p-3 bg-gray-50">
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
                            
                            {op.recordId && (
                                <div className="text-xs text-gray-600 mt-1">
                                    ID: {op.recordId}
                                </div>
                            )}
                            
                            {op.data && (
                                <details className="mt-1">
                                    <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                        View Data
                                    </summary>
                                    <pre className="text-xs mt-1 p-2 bg-gray-50 rounded overflow-x-auto">
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
                        Showing {filteredOperations.length} of {operations.length} operations
                    </span>
                    <span>
                        CloudWatch: {monitoring ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </div>
        </div>
    );
};