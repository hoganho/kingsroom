// src/pages/debug/DatabaseMonitor.tsx
// OPTIMIZED: Removed activity monitoring, kept useful table scanner
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
    Database, RefreshCw, Play, Users, DollarSign, Globe, 
    Share2, Shield, BarChart3, FileText, Activity
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
    // Scanner State (persisted to sessionStorage)
    const [tableStats, setTableStats] = useState<Record<string, TableScanStats>>(() => {
        try {
            const saved = sessionStorage.getItem('db_monitor_stats');
            if (saved) {
                const parsed = JSON.parse(saved);
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

    const client = useMemo(() => generateClient(), []);

    // Scan a single table with full pagination
    const scanTable = useCallback(async (tableName: string, pluralName: string) => {
        setTableStats(prev => ({
            ...prev,
            [tableName]: { ...prev[tableName], status: 'SCANNING', count: 0, scannedCount: 0 }
        }));

        try {
            let totalCount = 0;
            let nextToken: string | null = null;
            
            // Paginate through ALL records
            do {
                const query = `query List${pluralName}($limit: Int, $nextToken: String) { 
                    list${pluralName}(limit: $limit, nextToken: $nextToken) { 
                        items { id } 
                        nextToken 
                    } 
                }`;
                
                const response: any = await client.graphql({ 
                    query,
                    variables: { 
                        limit: 10000,
                        nextToken 
                    }
                });
                
                if ('data' in response && response.data) {
                    const result: any = (response.data as any)[`list${pluralName}`];
                    const items = result?.items || [];
                    totalCount += items.length;
                    nextToken = result?.nextToken || null;
                    
                    // Update count as we scan (shows progress)
                    setTableStats(prev => ({
                        ...prev,
                        [tableName]: {
                            ...prev[tableName],
                            count: totalCount,
                            scannedCount: totalCount,
                            status: 'SCANNING'
                        }
                    }));
                } else {
                    break;
                }
            } while (nextToken);
            
            // Final update with COMPLETE status
            setTableStats(prev => ({
                ...prev,
                [tableName]: {
                    count: totalCount,
                    scannedCount: totalCount,
                    status: 'COMPLETE',
                    lastScan: new Date()
                }
            }));
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

    // Total record counts
    const totalRecords = useMemo(() => {
        return Object.values(tableStats)
            .filter(s => s.status === 'COMPLETE')
            .reduce((sum, s) => sum + s.count, 0);
    }, [tableStats]);

    const tablesScanned = useMemo(() => {
        return Object.values(tableStats).filter(s => s.status === 'COMPLETE').length;
    }, [tableStats]);

    // Last scan time
    const lastScanTime = useMemo(() => {
        const times = Object.values(tableStats)
            .filter(s => s.lastScan)
            .map(s => s.lastScan!.getTime());
        return times.length > 0 ? new Date(Math.max(...times)) : null;
    }, [tableStats]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* ================= HEADER ================= */}
            <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-600" />
                        Database Scanner
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {tablesScanned}/{ALL_TABLES.length} tables scanned • {totalRecords.toLocaleString()} total records
                        {lastScanTime && (
                            <span className="ml-2">
                                • Last scan: {lastScanTime.toLocaleTimeString()}
                            </span>
                        )}
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
                        
                        {/* Group Footer with count */}
                        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
                            {(() => {
                                const groupStats = group.tables
                                    .map(t => tableStats[t.name])
                                    .filter(s => s?.status === 'COMPLETE');
                                const groupTotal = groupStats.reduce((sum, s) => sum + s.count, 0);
                                return groupStats.length > 0 
                                    ? `${groupStats.length}/${group.tables.length} scanned • ${groupTotal.toLocaleString()} records`
                                    : `${group.tables.length} tables`;
                            })()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};