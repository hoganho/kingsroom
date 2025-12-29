// src/pages/debug/DatabaseMonitor.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { getMonitoring } from '../../utils/enhanced-monitoring';
import { 
    Database, Server, Monitor, Activity, RefreshCw, 
    Play, Users, DollarSign, Globe, Share2, Shield, BarChart3,
    FileText
} from 'lucide-react';

// ==========================================
// CONFIGURATION: Logical Groups & Tables
// ==========================================

const SCHEMA_GROUPS = [
    {
        id: 'core',
        title: 'Core & Venues',
        icon: <Database className="w-4 h-4 text-indigo-600" />,
        tables: [
            { name: 'Entity', plural: 'Entities' },
            { name: 'Venue', plural: 'Venues' },
            { name: 'VenueDetails', plural: 'VenueDetails' },
            { name: 'Asset', plural: 'Assets' },
            { name: 'BackgroundTask', plural: 'BackgroundTasks' },
            { name: 'DataSync', plural: 'DataSyncs' },
            { name: 'S3Storage', plural: 'S3Storages' },
        ]
    },
    {
        id: 'games',
        title: 'Games & Series',
        icon: <Activity className="w-4 h-4 text-blue-600" />,
        tables: [
            { name: 'Game', plural: 'Games' },
            { name: 'RecurringGame', plural: 'RecurringGames' },
            { name: 'TournamentSeries', plural: 'TournamentSeries' },
            { name: 'TournamentSeriesTitle', plural: 'TournamentSeriesTitles' },
            { name: 'TournamentSeriesMetrics', plural: 'TournamentSeriesMetrics' },
            { name: 'TournamentStructure', plural: 'TournamentStructures' },
            { name: 'TournamentLevelData', plural: 'TournamentLevelData' },
            { name: 'CashStructure', plural: 'CashStructures' },
            { name: 'RakeStructure', plural: 'RakeStructures' },
        ]
    },
    {
        id: 'players',
        title: 'Player Domain',
        icon: <Users className="w-4 h-4 text-green-600" />,
        tables: [
            { name: 'Player', plural: 'Players' },
            { name: 'PlayerSummary', plural: 'PlayerSummaries' },
            { name: 'PlayerEntry', plural: 'PlayerEntries' },
            { name: 'PlayerResult', plural: 'PlayerResults' },
            { name: 'PlayerVenue', plural: 'PlayerVenues' },
            { name: 'KnownPlayerIdentity', plural: 'KnownPlayerIdentities' },
        ]
    },
    {
        id: 'marketing',
        title: 'Marketing & Messages',
        icon: <FileText className="w-4 h-4 text-cyan-600" />,
        tables: [
            { name: 'MarketingMessage', plural: 'MarketingMessages' },
            { name: 'PlayerMarketingMessage', plural: 'PlayerMarketingMessages' },
            { name: 'PlayerMarketingPreferences', plural: 'PlayerMarketingPreferences' },
        ]
    },
    {
        id: 'financials',
        title: 'Financials & Points',
        icon: <DollarSign className="w-4 h-4 text-emerald-600" />,
        tables: [
            { name: 'PlayerTransaction', plural: 'PlayerTransactions' },
            { name: 'PlayerCredits', plural: 'PlayerCredits' },
            { name: 'PlayerPoints', plural: 'PlayerPoints' },
            { name: 'PlayerTicket', plural: 'PlayerTickets' },
            { name: 'TicketTemplate', plural: 'TicketTemplates' },
            { name: 'GameCost', plural: 'GameCosts' },
            { name: 'GameCostItem', plural: 'GameCostItems' },
            { name: 'GameCostLineItem', plural: 'GameCostLineItems' },
            { name: 'GameFinancialSnapshot', plural: 'GameFinancialSnapshots' },
        ]
    },
    {
        id: 'metrics',
        title: 'Analytics & Metrics',
        icon: <BarChart3 className="w-4 h-4 text-violet-600" />,
        tables: [
            { name: 'EntityMetrics', plural: 'EntityMetrics' },
            { name: 'VenueMetrics', plural: 'VenueMetrics' },
            { name: 'RecurringGameMetrics', plural: 'RecurringGameMetrics' },
        ]
    },
    {
        id: 'scraper',
        title: 'Scraper Engine',
        icon: <Globe className="w-4 h-4 text-orange-600" />,
        tables: [
            { name: 'ScraperJob', plural: 'ScraperJobs' },
            { name: 'ScraperState', plural: 'ScraperStates' },
            { name: 'ScrapeURL', plural: 'ScrapeURLs' },
            { name: 'ScrapeAttempt', plural: 'ScrapeAttempts' },
            { name: 'ScrapeStructure', plural: 'ScrapeStructures' },
        ]
    },
    {
        id: 'social',
        title: 'Social Pulse',
        icon: <Share2 className="w-4 h-4 text-pink-600" />,
        tables: [
            { name: 'SocialAccount', plural: 'SocialAccounts' },
            { name: 'SocialPost', plural: 'SocialPosts' },
            { name: 'SocialPostGameData', plural: 'SocialPostGameData' },
            { name: 'SocialPostGameLink', plural: 'SocialPostGameLinks' },
            { name: 'SocialPostPlacement', plural: 'SocialPostPlacements' },
            { name: 'SocialScheduledPost', plural: 'SocialScheduledPosts' },
            { name: 'SocialScrapeAttempt', plural: 'SocialScrapeAttempts' },
        ]
    },
    {
        id: 'system',
        title: 'System & Admin',
        icon: <Shield className="w-4 h-4 text-gray-600" />,
        tables: [
            { name: 'User', plural: 'Users' },
            { name: 'UserPreference', plural: 'UserPreferences' },
            { name: 'UserAuditLog', plural: 'UserAuditLogs' },
            { name: 'Staff', plural: 'Staff' },
        ]
    }
];

// Flatten for easy lookup
const ALL_TABLES = SCHEMA_GROUPS.flatMap(g => g.tables);

interface TableScanStats {
    count: number;
    scannedCount: number;
    status: 'IDLE' | 'SCANNING' | 'COMPLETE' | 'ERROR';
    lastScan?: Date;
    error?: string;
}

export const DatabaseMonitorPage: React.FC = () => {
    // --- State ---
    const [clientOperations, setClientOperations] = useState<any[]>([]);
    const [lambdaOperations] = useState<any[]>([]);
    const [isLoadingActivity, setIsLoadingActivity] = useState(false);
    
    // Scanner State
    const [tableStats, setTableStats] = useState<Record<string, TableScanStats>>(() => {
        try {
            const saved = sessionStorage.getItem('db_monitor_stats');
            if (saved) {
                const parsed = JSON.parse(saved);
                // We must convert the date strings back to Date objects
                Object.keys(parsed).forEach(key => {
                    if (parsed[key].lastScan) {
                        parsed[key].lastScan = new Date(parsed[key].lastScan);
                    }
                });
                return parsed;
            }
        } catch (e) {
            console.warn('Failed to load stats from storage', e);
        }
        return {};
    });

    // Save to sessionStorage whenever tableStats changes
    useEffect(() => {
        if (Object.keys(tableStats).length > 0) {
            sessionStorage.setItem('db_monitor_stats', JSON.stringify(tableStats));
        }
    }, [tableStats]);

    // --- Helpers ---
    const client = useMemo(() => generateClient(), []);
    const monitoring = useMemo(() => getMonitoring(), []);

    // Subscribe to client operations
    useEffect(() => {
        const unsubscribe = monitoring.subscribe((op) => {
            setClientOperations(prev => [op, ...prev].slice(0, 100));
        });
        return unsubscribe;
    }, [monitoring]);

    // Fetch CloudWatch metrics for lambda operations
    const fetchCloudWatchMetrics = useCallback(async () => {
        setIsLoadingActivity(true);
        try {
            // This would typically call a Lambda to get CloudWatch logs
            // For now, we'll just simulate with existing data
            console.log('[DatabaseMonitor] Fetching CloudWatch metrics...');
        } catch (error) {
            console.error('Error fetching CloudWatch metrics:', error);
        } finally {
            setIsLoadingActivity(false);
        }
    }, []);

    // Scan a single table
    const scanTable = useCallback(async (tableName: string, pluralName: string) => {
        setTableStats(prev => ({
            ...prev,
            [tableName]: { ...prev[tableName], status: 'SCANNING', count: 0, scannedCount: 0 }
        }));

        try {
            // Build a simple list query
            const query = `query List${pluralName} { list${pluralName}(limit: 10000) { items { id } } }`;
            
            const response = await client.graphql({ query });
            
            if ('data' in response && response.data) {
                const items = (response.data as any)[`list${pluralName}`]?.items || [];
                const count = items.length;
                
                setTableStats(prev => ({
                    ...prev,
                    [tableName]: {
                        count,
                        scannedCount: count,
                        status: 'COMPLETE',
                        lastScan: new Date()
                    }
                }));
            }
        } catch (error: any) {
            console.error(`Error scanning ${tableName}:`, error);
            setTableStats(prev => ({
                ...prev,
                [tableName]: {
                    ...prev[tableName],
                    status: 'ERROR',
                    error: error.message || 'Unknown error'
                }
            }));
        }
    }, [client]);

    // Scan all tables in a group
    const scanGroup = useCallback(async (groupId: string) => {
        const group = SCHEMA_GROUPS.find(g => g.id === groupId);
        if (!group) return;
        
        for (const table of group.tables) {
            await scanTable(table.name, table.plural);
        }
    }, [scanTable]);

    // Global scanning state
    const isGlobalScanning = useMemo(() => {
        return Object.values(tableStats).some(s => s.status === 'SCANNING');
    }, [tableStats]);

    // Scan all tables
    const scanAllTables = useCallback(async () => {
        for (const group of SCHEMA_GROUPS) {
            for (const table of group.tables) {
                await scanTable(table.name, table.plural);
            }
        }
    }, [scanTable]);

    // --- Computed Stats ---
    const stats = useMemo(() => {
        const clientOps = monitoring.getOperations();
        return {
            client: {
                total: clientOps.length,
                inserts: clientOps.filter(o => o.operation === 'INSERT').length,
                updates: clientOps.filter(o => o.operation === 'UPDATE').length,
                deletes: clientOps.filter(o => o.operation === 'DELETE').length,
                queries: clientOps.filter(o => o.operation === 'QUERY').length,
            },
            lambda: {
                total: lambdaOperations.length,
                inserts: lambdaOperations.filter(o => o.operation?.includes('INSERT')).length,
                updates: lambdaOperations.filter(o => o.operation?.includes('UPDATE')).length,
                deletes: lambdaOperations.filter(o => o.operation?.includes('DELETE')).length,
            }
        };
    }, [monitoring, lambdaOperations]);

    // All operations combined
    const filteredOperations = useMemo(() => {
        const all = [
            ...clientOperations.map(op => ({ ...op, source: 'CLIENT' })),
            ...lambdaOperations.map(op => ({ ...op, source: 'LAMBDA' }))
        ];
        return all.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 50);
    }, [clientOperations, lambdaOperations]);

    // Total record counts
    const totalRecords = useMemo(() => {
        return Object.values(tableStats)
            .filter(s => s.status === 'COMPLETE')
            .reduce((sum, s) => sum + s.count, 0);
    }, [tableStats]);

    const tablesScanned = useMemo(() => {
        return Object.values(tableStats).filter(s => s.status === 'COMPLETE').length;
    }, [tableStats]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* ================= HEADER ================= */}
            <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-600" />
                        Database Monitor
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {tablesScanned}/{ALL_TABLES.length} tables scanned • {totalRecords.toLocaleString()} total records
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <button
                        onClick={scanAllTables}
                        disabled={isGlobalScanning}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGlobalScanning ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Play className="w-4 h-4 fill-current" />
                        )}
                        {isGlobalScanning ? 'Scanning All...' : 'Scan All Tables'}
                    </button>

                    {Object.keys(tableStats).length > 0 && (
                        <button
                            onClick={() => {
                                setTableStats({});
                                sessionStorage.removeItem('db_monitor_stats');
                            }}
                            className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-sm font-medium"
                            title="Clear cached counts"
                        >
                            Clear
                        </button>
                    )}

                </div>
            </div>

            {/* ================= TABLE GROUPS GRID ================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                {SCHEMA_GROUPS.map((group) => (
                    <div key={group.id} className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full">
                        {/* Group Header */}
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-2 font-semibold text-gray-800">
                                {group.icon}
                                {group.title}
                            </div>
                            <button 
                                onClick={() => scanGroup(group.id)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium bg-white border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                            >
                                Scan Group
                            </button>
                        </div>
                        
                        {/* Table List */}
                        <div className="p-2 flex-1 overflow-y-auto max-h-[300px]">
                            <table className="w-full text-sm">
                                <tbody>
                                    {group.tables.map((table) => {
                                        const stat = tableStats[table.name] || { status: 'IDLE' };
                                        return (
                                            <tr key={table.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                                                <td className="py-2 px-2 text-gray-600 font-medium">
                                                    {table.name}
                                                </td>
                                                <td className="py-2 px-2 text-right w-24">
                                                    {stat.status === 'SCANNING' ? (
                                                        <span className="text-indigo-600 animate-pulse text-xs">Scanning...</span>
                                                    ) : stat.status === 'ERROR' ? (
                                                        <span className="text-red-500 text-xs" title={stat.error}>Error</span>
                                                    ) : stat.status === 'IDLE' ? (
                                                        <span className="text-gray-300 text-xs">-</span>
                                                    ) : (
                                                        <span className="font-bold text-gray-900">{stat.count.toLocaleString()}</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2 w-8 text-center">
                                                    <button 
                                                        onClick={() => scanTable(table.name, table.plural)}
                                                        disabled={stat.status === 'SCANNING'}
                                                        className="text-gray-400 hover:text-indigo-600 disabled:opacity-30 transition-colors p-1"
                                                        title={`Scan ${table.name}`}
                                                    >
                                                        {stat.status === 'SCANNING' ? (
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Play className="w-3 h-3 fill-current" />
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {/* ================= ACTIVITY FEED ================= */}
            <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-gray-500" />
                            Database Operations Feed
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Client: {stats.client.total} ops • Lambda: {stats.lambda.total} ops
                        </p>
                    </div>
                    <button
                        onClick={fetchCloudWatchMetrics}
                        disabled={isLoadingActivity}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3 h-3 ${isLoadingActivity ? 'animate-spin' : ''}`} />
                        Refresh Feed
                    </button>
                </div>

                <div className="p-0">
                    <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
                        {filteredOperations.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Monitor className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                <p>No recent activity found.</p>
                            </div>
                        ) : (
                            filteredOperations.map((op, index) => (
                                <div key={`${op.timestamp}-${index}`} className="p-3 hover:bg-gray-50 flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-3">
                                        {op.source === 'LAMBDA' 
                                            ? <Server className="w-4 h-4 text-purple-500" /> 
                                            : <Monitor className="w-4 h-4 text-blue-500" />
                                        }
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase w-16 text-center ${
                                            op.operation?.includes('INSERT') ? 'bg-green-100 text-green-800' :
                                            op.operation?.includes('UPDATE') ? 'bg-yellow-100 text-yellow-800' :
                                            op.operation?.includes('DELETE') ? 'bg-red-100 text-red-800' :
                                            'bg-blue-100 text-blue-800'
                                        }`}>
                                            {op.operation}
                                        </span>
                                        <span className="font-medium text-gray-900 w-32 truncate" title={op.table}>
                                            {op.table}
                                        </span>
                                        {op.source === 'LAMBDA' && op.functionName && (
                                            <span className="text-xs text-gray-400 hidden sm:inline-block">
                                                via {op.functionName.split('-').pop()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400 font-mono">
                                        {new Date(op.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};