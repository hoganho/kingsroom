// src/components/scraper/SaveConfirmation/ConsolidationPreview.tsx

import React, { useMemo } from 'react';
import type { GameData } from '../../../types/game';
import { 
    useConsolidationPreview,
    formatConsolidationKey,
    getKeyStrategyDescription,
    type ConsolidationPreviewResult,
    type ConsolidationSibling
} from '../../../hooks/useConsolidationPreview';

// ===================================================================
// TYPES
// ===================================================================

interface ConsolidationPreviewProps {
    /** The game data to preview */
    gameData: Partial<GameData>;
    /** Whether to show detailed sibling information */
    showSiblingDetails?: boolean;
    /** Callback when consolidation status changes */
    onConsolidationChange?: (willConsolidate: boolean, parentName: string | null) => void;
    /** Whether the component is in compact mode */
    compact?: boolean;
}

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

/**
 * Shows detected multi-day pattern info
 */
const DetectedPatternInfo: React.FC<{
    pattern: ConsolidationPreviewResult['detectedPattern'];
}> = ({ pattern }) => {
    if (!pattern.isMultiDay) return null;
    
    const detectionLabels: Record<string, string> = {
        dayNumber: 'Day Number field',
        flightLetter: 'Flight Letter field',
        finalDay: 'Final Day flag',
        namePattern: 'Name pattern detection'
    };
    
    return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                📅 Multi-Day Tournament
            </span>
            {pattern.detectionSource && (
                <span className="text-gray-500">
                    Detected via: {detectionLabels[pattern.detectionSource] || pattern.detectionSource}
                </span>
            )}
            {pattern.parsedDayNumber && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                    Day {pattern.parsedDayNumber}
                </span>
            )}
            {pattern.parsedFlightLetter && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                    Flight {pattern.parsedFlightLetter}
                </span>
            )}
            {pattern.isFinalDay && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                    🏆 Final Day
                </span>
            )}
        </div>
    );
};

/**
 * Shows sibling games in the consolidation group
 */
const SiblingList: React.FC<{
    siblings: ConsolidationSibling[];
    currentGameName: string;
}> = ({ siblings, currentGameName }) => {
    if (siblings.length === 0) {
        return (
            <div className="text-sm text-gray-500 italic">
                No other flights in this group yet. This will be the first.
            </div>
        );
    }
    
    const sortedSiblings = useMemo(() => {
        return [...siblings].sort((a, b) => {
            // Sort by day number, then flight letter
            const dayA = a.dayNumber || 0;
            const dayB = b.dayNumber || 0;
            if (dayA !== dayB) return dayA - dayB;
            
            const flightA = a.flightLetter || '';
            const flightB = b.flightLetter || '';
            return flightA.localeCompare(flightB);
        });
    }, [siblings]);
    
    return (
        <div className="space-y-1">
            {sortedSiblings.map(sibling => (
                <div 
                    key={sibling.id}
                    className={`flex items-center justify-between p-2 rounded text-xs ${
                        sibling.finalDay 
                            ? 'bg-green-50 border border-green-200' 
                            : 'bg-gray-50 border border-gray-200'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span className="font-medium">
                            {sibling.dayNumber && `Day ${sibling.dayNumber}`}
                            {sibling.flightLetter && sibling.flightLetter}
                            {!sibling.dayNumber && !sibling.flightLetter && sibling.name}
                        </span>
                        {sibling.finalDay && (
                            <span className="text-green-600">🏆</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3 text-gray-500">
                        {sibling.totalUniquePlayers !== null && (
                            <span>{sibling.totalUniquePlayers} unique Players</span>
                        )}
                        {sibling.totalEntries !== null && (
                            <span>{sibling.totalEntries} entries</span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                            sibling.gameStatus === 'FINISHED' ? 'bg-green-100 text-green-700' :
                            sibling.gameStatus === 'RUNNING' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                            {sibling.gameStatus}
                        </span>
                    </div>
                </div>
            ))}
            {/* Show where current game will be added */}
            <div className="flex items-center p-2 rounded bg-blue-50 border border-blue-300 border-dashed text-xs">
                <span className="text-blue-700 font-medium">
                    ➕ {currentGameName} (this game)
                </span>
            </div>
        </div>
    );
};

/**
 * Shows projected totals after consolidation
 */
const ProjectedTotals: React.FC<{
    totals: NonNullable<ConsolidationPreviewResult['consolidation']>['projectedTotals'];
}> = ({ totals }) => {
    return (
        <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">Total Unique Players</div>
                <div className="text-lg font-bold text-gray-900">
                    {totals.totalUniquePlayers?.toLocaleString() || '—'}
                </div>
            </div>            <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">Total Entries</div>
                <div className="text-lg font-bold text-gray-900">
                    {totals.totalEntries?.toLocaleString() || '—'}
                </div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">Prizepool Paid</div>
                <div className="text-lg font-bold text-gray-900">
                    {totals.prizepoolPaid ? `$${totals.prizepoolPaid.toLocaleString()}` : '—'}
                </div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">Prizepool Calculated</div>
                <div className="text-lg font-bold text-gray-900">
                    {totals.prizepoolCalculated ? `$${totals.prizepoolCalculated.toLocaleString()}` : '—'}
                </div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-500">Status</div>
                <div className={`text-lg font-bold ${
                    totals.projectedStatus === 'FINISHED' ? 'text-green-600' :
                    totals.projectedStatus === 'RUNNING' ? 'text-blue-600' :
                    'text-gray-600'
                }`}>
                    {totals.projectedStatus}
                </div>
            </div>
            {totals.isPartialData && (
                <div className="col-span-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="text-yellow-700 flex items-center gap-1">
                        <span>⚠</span>
                        <span>
                            Partial data detected 
                            {totals.missingFlightCount > 0 && ` (${totals.missingFlightCount} flight(s) may be missing)`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Warning messages display
 */
const WarningsList: React.FC<{ warnings: string[] }> = ({ warnings }) => {
    if (warnings.length === 0) return null;
    
    return (
        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
            <div className="text-xs font-medium text-yellow-800 mb-1">Suggestions:</div>
            <ul className="text-xs text-yellow-700 list-disc list-inside space-y-0.5">
                {warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                ))}
            </ul>
        </div>
    );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ConsolidationPreview: React.FC<ConsolidationPreviewProps> = ({
    gameData,
    showSiblingDetails = true,
    onConsolidationChange,
    compact = false
}) => {
    const { preview, isLoading, error, willConsolidate } = useConsolidationPreview(
        gameData,
        {
            debounceMs: 500,
            includeSiblingDetails: showSiblingDetails,
            onPreviewComplete: (result) => {
                onConsolidationChange?.(
                    result.willConsolidate,
                    result.consolidation?.parentName || null
                );
            }
        }
    );
    
    // Loading state
    if (isLoading) {
        return (
            <div className={`border rounded-lg ${compact ? 'p-2' : 'p-4'}`}>
                <div className="flex items-center gap-2 text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-500" />
                    <span className="text-sm">Analyzing consolidation...</span>
                </div>
            </div>
        );
    }
    
    // Error state
    if (error) {
        return (
            <div className={`border border-red-200 bg-red-50 rounded-lg ${compact ? 'p-2' : 'p-4'}`}>
                <div className="text-sm text-red-700">
                    ⚠ Error analyzing consolidation: {error.message}
                </div>
            </div>
        );
    }
    
    // No preview yet
    if (!preview) {
        return null;
    }
    
    // Not consolidating
    if (!willConsolidate) {
        return (
            <div className={`border border-gray-200 rounded-lg ${compact ? 'p-2' : 'p-4'}`}>
                <div className="flex items-center gap-2">
                    <span className="text-gray-400">○</span>
                    <span className="text-sm text-gray-600">
                        {preview.reason}
                    </span>
                </div>
                {preview.warnings.length > 0 && !compact && (
                    <div className="mt-2">
                        <WarningsList warnings={preview.warnings} />
                    </div>
                )}
            </div>
        );
    }
    
    // Will consolidate - show full preview
    const { consolidation, detectedPattern, warnings } = preview;
    
    if (compact) {
        return (
            <div className="border border-blue-300 bg-blue-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-blue-600">🔗</span>
                        <span className="text-sm font-medium text-blue-900">
                            Will group under: "{consolidation?.parentName}"
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {consolidation?.parentExists ? (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                Existing group ({consolidation.siblingCount} siblings)
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                New group
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    }
    
    return (
        <div className="border border-blue-300 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                        <span>🔗</span>
                        Tournament Consolidation Preview
                    </h3>
                    {consolidation?.parentExists ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                            ✓ Joining Existing Group
                        </span>
                    ) : (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            + Creating New Group
                        </span>
                    )}
                </div>
                <DetectedPatternInfo pattern={detectedPattern} />
            </div>
            
            {/* Body */}
            <div className="p-4 space-y-4 bg-white">
                {/* Parent Info */}
                <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">
                        Parent Tournament Name
                    </div>
                    <div className="text-lg font-semibold text-gray-900">
                        {consolidation?.parentName}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {consolidation?.keyStrategy && getKeyStrategyDescription(consolidation.keyStrategy)}
                    </div>
                </div>
                
                {/* Consolidation Key */}
                {consolidation?.consolidationKey && (
                    <div className="p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 overflow-x-auto">
                        Key: {formatConsolidationKey(consolidation.consolidationKey)}
                    </div>
                )}
                
                {/* Siblings */}
                {showSiblingDetails && consolidation?.siblings && (
                    <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">
                            Flights in this Group ({consolidation.siblingCount + 1} total after save)
                        </div>
                        <SiblingList 
                            siblings={consolidation.siblings} 
                            currentGameName={gameData.name || 'This game'} 
                        />
                    </div>
                )}
                
                {/* Projected Totals */}
                {consolidation?.projectedTotals && (
                    <div>
                        <div className="text-xs font-medium text-gray-500 mb-2">
                            Projected Totals (after save)
                        </div>
                        <ProjectedTotals totals={consolidation.projectedTotals} />
                    </div>
                )}
                
                {/* Warnings */}
                <WarningsList warnings={warnings} />
            </div>
        </div>
    );
};

// ===================================================================
// EXPORTS
// ===================================================================

export default ConsolidationPreview;

/**
 * Simplified badge component for showing consolidation status inline
 */
export const ConsolidationBadge: React.FC<{
    gameData: Partial<GameData>;
}> = ({ gameData }) => {
    const { preview, isLoading, willConsolidate } = useConsolidationPreview(gameData, {
        debounceMs: 300,
        includeSiblingDetails: false
    });
    
    if (isLoading) {
        return (
            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                <span className="animate-pulse">Checking...</span>
            </span>
        );
    }
    
    if (!willConsolidate) {
        return null;
    }
    
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
            <span>🔗</span>
            <span>
                {preview?.consolidation?.parentExists 
                    ? `Joins: ${preview.consolidation.siblingCount} siblings`
                    : 'New Group'
                }
            </span>
        </span>
    );
};