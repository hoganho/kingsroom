/**
 * BulkProcessingResultsTable.tsx
 * 
 * Component to display bulk processing results with filtering and details.
 * Includes preview of potential new templates from dry run clustering.
 * 
 * Location: src/components/games/recurring-games/BulkProcessingResultsTable.tsx
 * 
 * VERSION 3.2.0 - Fixed AEST date display
 */

import React, { useState, useMemo } from 'react';
import {
    type ProcessUnassignedGamesResult,
    type ProcessedGameDetail,
    getBulkProcessingStatusStyle,
} from '../../../services/recurringGameService';
import { formatAEST } from '../../../utils/dateUtils';

// ===================================================================
// TYPES
// ===================================================================

interface PotentialTemplate {
    suggestedName: string;
    name?: string;
    dayOfWeek: string;
    gameType: string;
    sessionMode: string;
    variant?: string | null;
    gameCount: number;
    avgBuyIn?: number;
    buyInRange?: string;
    timeSlot?: string;
    confidence?: string;
    sampleGames?: Array<{
        id: string;
        name?: string;  // Made optional to match PatternSampleGame from service
        date?: string;
        buyIn?: number;
        time?: string;
    }>;
    status?: string;
}

interface BulkProcessingResultsTableProps {
    result: ProcessUnassignedGamesResult & {
        potentialTemplates?: PotentialTemplate[];
        summary?: {
            totalGames: number;
            wouldAssign: number;
            wouldMatchExisting: number;
            wouldCreateNew: number;
            newTemplatesCount: number;
            wouldDefer: number;
            wouldSkip: number;
        };
    };
    onExecute?: () => void;
    isExecuting?: boolean;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Format a date for display in AEST
 * Uses the dateUtils formatAEST function for consistent timezone handling
 */
const formatDateAEST = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
        return formatAEST(dateString, { includeDay: true, shortDay: true });
    } catch {
        // Fallback if date parsing fails
        return dateString;
    }
};

// ===================================================================
// HELPER COMPONENTS
// ===================================================================

const DayBadge: React.FC<{ day: string }> = ({ day }) => {
    const dayColors: Record<string, string> = {
        SUNDAY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        MONDAY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        TUESDAY: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
        WEDNESDAY: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        THURSDAY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        FRIDAY: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
        SATURDAY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    };
    
    const color = dayColors[day?.toUpperCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    const shortDay = day ? day.charAt(0) + day.slice(1, 3).toLowerCase() : '?';
    
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
            {shortDay}
        </span>
    );
};

const VariantBadge: React.FC<{ variant?: string | null; sessionMode?: string }> = ({ variant, sessionMode }) => {
    const label = variant || sessionMode || 'Tournament';
    const isNLHE = label.toUpperCase().includes('NLHE') || label.toUpperCase().includes('NLH');
    const isPLO = label.toUpperCase().includes('PLO');
    const isCash = label.toUpperCase() === 'CASH';
    
    let color = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    if (isNLHE) color = 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300';
    if (isPLO) color = 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300';
    if (isCash) color = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300';
    
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${color}`}>
            {label}
        </span>
    );
};

const SampleGamesList: React.FC<{ games?: PotentialTemplate['sampleGames'] }> = ({ games }) => {
    if (!games || games.length === 0) return null;
    
    const displayGames = games.slice(0, 3);
    const remaining = games.length - 3;
    
    return (
        <div className="mt-2 space-y-1">
            {displayGames.map((game, idx) => (
                <div key={game.id || idx} className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    <span className="text-gray-400 dark:text-gray-500 mr-1">•</span>
                    {game.name || 'Unnamed Game'}
                    {game.date && (
                        <span className="text-gray-400 dark:text-gray-500 ml-1">
                            ({formatDateAEST(game.date)})
                        </span>
                    )}
                </div>
            ))}
            {remaining > 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                    +{remaining} more games...
                </div>
            )}
        </div>
    );
};

// ===================================================================
// POTENTIAL TEMPLATES TABLE (for dry run preview)
// ===================================================================

const PotentialTemplatesTable: React.FC<{ 
    templates: PotentialTemplate[];
    showSampleGames?: boolean;
}> = ({ templates, showSampleGames = true }) => {
    const dayOrder = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    
    // Group templates by day for better visualization
    const templatesByDay = templates.reduce((acc, template) => {
        const day = template.dayOfWeek || 'UNKNOWN';
        if (!acc[day]) acc[day] = [];
        acc[day].push(template);
        return acc;
    }, {} as Record<string, PotentialTemplate[]>);
    
    const sortedDays = Object.keys(templatesByDay).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    
    // Calculate totals
    const totalGames = templates.reduce((sum, t) => sum + t.gameCount, 0);
    
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Day
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Template Name
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Type
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Buy-In
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Time
                        </th>
                        <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Games
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedDays.map(day => (
                        templatesByDay[day].map((template, idx) => (
                            <tr 
                                key={`${day}-${idx}`}
                                className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <DayBadge day={day} />
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {template.suggestedName || template.name}
                                    </div>
                                    {showSampleGames && template.sampleGames && (
                                        <SampleGamesList games={template.sampleGames} />
                                    )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex flex-col gap-1">
                                        <VariantBadge variant={template.variant} sessionMode={template.sessionMode} />
                                        {template.sessionMode && template.variant && template.sessionMode !== template.variant && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {template.sessionMode}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">
                                        {template.buyInRange || (template.avgBuyIn ? `$${template.avgBuyIn}` : '—')}
                                    </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">
                                        {template.timeSlot || '—'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                        {template.gameCount}
                                    </span>
                                </td>
                            </tr>
                        ))
                    ))}
                </tbody>
            </table>
            
            {/* Summary Footer */}
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-green-600 dark:text-green-400">{templates.length}</span> new template{templates.length !== 1 ? 's' : ''} would be created
                    </span>
                    <span className="text-gray-500 dark:text-gray-500">
                        <span className="font-semibold">{totalGames}</span> games would be assigned
                    </span>
                </div>
            </div>
        </div>
    );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const BulkProcessingResultsTable: React.FC<BulkProcessingResultsTableProps> = ({
    result,
    onExecute,
    isExecuting = false,
}) => {
    const [showAll, setShowAll] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string | 'all'>('all');
    const [showTemplates, setShowTemplates] = useState(true);
    const [showDetails, setShowDetails] = useState(false);
    
    // Group details by status
    const groupedDetails = useMemo(() => {
        const groups: Record<string, ProcessedGameDetail[]> = {};
        for (const detail of result.details || []) {
            const status = detail.status || 'UNKNOWN';
            if (!groups[status]) groups[status] = [];
            groups[status].push(detail);
        }
        return groups;
    }, [result.details]);
    
    // Filter details
    const filteredDetails = useMemo(() => {
        if (filterStatus === 'all') return result.details || [];
        return (result.details || []).filter(d => d.status === filterStatus);
    }, [result.details, filterStatus]);
    
    const displayDetails = showAll ? filteredDetails : filteredDetails.slice(0, 20);
    
    // Group by recurring game for created templates (after actual processing)
    const createdTemplates = useMemo(() => {
        const templates: Record<string, { name: string; games: ProcessedGameDetail[] }> = {};
        for (const detail of result.details || []) {
            if (detail.wasCreated && detail.recurringGameId && detail.recurringGameName) {
                if (!templates[detail.recurringGameId]) {
                    templates[detail.recurringGameId] = { name: detail.recurringGameName, games: [] };
                }
                templates[detail.recurringGameId].games.push(detail);
            }
        }
        return Object.entries(templates);
    }, [result.details]);
    
    const hasPotentialTemplates = result.dryRun && result.potentialTemplates && result.potentialTemplates.length > 0;
    
    return (
        <div className="space-y-4">
            {/* Summary Stats */}
            <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xl ${result.success ? 'text-green-600' : 'text-red-600'}`}>
                        {result.success ? '✓' : '✕'}
                    </span>
                    <h4 className={`font-medium ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                        {result.dryRun ? 'Dry Run Complete' : 'Processing Complete'}
                    </h4>
                    {result.dryRun && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                            Preview Only
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-gray-900 dark:text-white">{result.processed}</div>
                        <div className="text-xs text-gray-500">Processed</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-green-600">{result.assigned}</div>
                        <div className="text-xs text-gray-500">{result.dryRun ? 'Would Assign' : 'Assigned'}</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-blue-600">
                            {hasPotentialTemplates ? result.potentialTemplates!.length : result.created}
                        </div>
                        <div className="text-xs text-gray-500">{result.dryRun ? 'New Templates' : 'Created'}</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-amber-600">{result.deferred}</div>
                        <div className="text-xs text-gray-500">{result.dryRun ? 'Would Defer' : 'Deferred'}</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-gray-500">{result.noMatch}</div>
                        <div className="text-xs text-gray-500">No Match</div>
                    </div>
                    <div className="text-center p-2 bg-white dark:bg-gray-800 rounded">
                        <div className="text-lg font-bold text-red-600">{result.errors}</div>
                        <div className="text-xs text-gray-500">Errors</div>
                    </div>
                </div>
            </div>

            {/* Execute Button for Dry Run */}
            {result.dryRun && onExecute && result.processed > 0 && (
                <div className="flex justify-end">
                    <button
                        onClick={onExecute}
                        disabled={isExecuting}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
                            isExecuting ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                    >
                        {isExecuting ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Processing...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Execute Processing ({result.processed} games)
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Potential Templates Preview (Dry Run Only) */}
            {hasPotentialTemplates && (
                <div className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-blue-600 dark:text-blue-400">📋</span>
                            <h4 className="font-medium text-blue-900 dark:text-blue-100">
                                New Templates to Create ({result.potentialTemplates!.length})
                            </h4>
                        </div>
                        <svg
                            className={`w-5 h-5 text-blue-600 dark:text-blue-400 transform transition-transform ${showTemplates ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {showTemplates && (
                        <PotentialTemplatesTable templates={result.potentialTemplates!} showSampleGames={true} />
                    )}
                </div>
            )}

            {/* Created Templates (after actual processing) */}
            {!result.dryRun && createdTemplates.length > 0 && (
                <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
                        <h4 className="font-medium text-green-900 dark:text-green-100">
                            ✨ Created Templates ({createdTemplates.length})
                        </h4>
                    </div>
                    <div className="divide-y divide-green-100 dark:divide-green-800">
                        {createdTemplates.map(([id, template]) => (
                            <div key={id} className="px-4 py-3 flex items-center justify-between">
                                <span className="font-medium text-gray-900 dark:text-gray-100">{template.name}</span>
                                <span className="text-sm text-gray-500">
                                    {template.games.length} game{template.games.length !== 1 ? 's' : ''} assigned
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Game Details Section */}
            {(result.details?.length || 0) > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-gray-600 dark:text-gray-400">📄</span>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                Game Details ({result.details?.length || 0})
                            </h4>
                        </div>
                        <svg
                            className={`w-5 h-5 text-gray-600 dark:text-gray-400 transform transition-transform ${showDetails ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    
                    {showDetails && (
                        <>
                            {/* Filter Tabs */}
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Filter:</span>
                                <button
                                    onClick={() => setFilterStatus('all')}
                                    className={`px-3 py-1 text-sm rounded-full transition-colors ${
                                        filterStatus === 'all'
                                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    All ({result.details?.length || 0})
                                </button>
                                {Object.entries(groupedDetails).map(([status, details]) => {
                                    const style = getBulkProcessingStatusStyle(status);
                                    return (
                                        <button
                                            key={status}
                                            onClick={() => setFilterStatus(status)}
                                            className={`px-3 py-1 text-sm rounded-full transition-colors ${
                                                filterStatus === status
                                                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                                                    : `${style.color} hover:opacity-80`
                                            }`}
                                        >
                                            {style.icon} {style.label} ({details.length})
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Details Table */}
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Game
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-28">
                                            Status
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Template
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">
                                            Confidence
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {displayDetails.map((detail, idx) => {
                                        const statusStyle = getBulkProcessingStatusStyle(detail.status);
                                        return (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[250px]" title={detail.gameName}>
                                                        {detail.gameName || detail.gameId}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                                        {detail.gameId?.slice(0, 8)}...
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusStyle.color}`}>
                                                        <span>{statusStyle.icon}</span>
                                                        {statusStyle.label}
                                                    </span>
                                                    {detail.wasCreated && (
                                                        <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(new)</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {detail.recurringGameName ? (
                                                        <div className="text-sm text-gray-900 dark:text-white truncate max-w-[200px]" title={detail.recurringGameName}>
                                                            {detail.recurringGameName}
                                                        </div>
                                                    ) : (detail as any).suggestedTemplateName ? (
                                                        <div className="text-sm text-blue-600 dark:text-blue-400 truncate max-w-[200px]" title={(detail as any).suggestedTemplateName}>
                                                            → {(detail as any).suggestedTemplateName}
                                                        </div>
                                                    ) : detail.error ? (
                                                        <div className="text-sm text-red-600 dark:text-red-400 truncate max-w-[200px]" title={detail.error}>
                                                            {detail.error}
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {detail.confidence !== undefined ? (
                                                        <span className={`text-sm font-medium ${
                                                            detail.confidence >= 0.8 ? 'text-green-600 dark:text-green-400' :
                                                            detail.confidence >= 0.5 ? 'text-amber-600 dark:text-amber-400' :
                                                            'text-gray-500'
                                                        }`}>
                                                            {Math.round(detail.confidence * 100)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            
                            {filteredDetails.length > 20 && !showAll && (
                                <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
                                    <button
                                        onClick={() => setShowAll(true)}
                                        className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                                    >
                                        Show all {filteredDetails.length} results
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Error Message */}
            {result.error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h4 className="font-medium text-red-800 dark:text-red-200 mb-1">Error</h4>
                    <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>
                </div>
            )}
        </div>
    );
};

export default BulkProcessingResultsTable;