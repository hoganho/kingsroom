// src/components/scraper/SaveConfirmation/RecurringGameEditor.tsx

import React, { useMemo, useCallback } from 'react';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';

// Define locally or import from API types if available
export interface RecurringGame {
    id: string;
    name: string;
    venueId: string;
    dayOfWeek?: string;
    gameVariant?: string;
    typicalBuyIn?: number;
}

interface RecurringGameEditorProps {
    editor: UseGameDataEditorReturn;
    availableRecurringGames: RecurringGame[];
    venueId?: string;
}

export const RecurringGameEditor: React.FC<RecurringGameEditorProps> = ({
    editor,
    availableRecurringGames,
    venueId
}) => {
    const { editedData, updateMultipleFields } = editor;

    // Filter available games by the currently selected venue
    const filteredRecurringGames = useMemo(() => {
        if (!venueId) return availableRecurringGames;
        return availableRecurringGames.filter(rg => rg.venueId === venueId);
    }, [availableRecurringGames, venueId]);

    // Find the currently assigned object
    const selectedRecurringGame = useMemo(() => {
        return availableRecurringGames.find(rg => rg.id === editedData.recurringGameId);
    }, [availableRecurringGames, editedData.recurringGameId]);

    // Handle selection change
    const handleSelection = useCallback((id: string | null) => {
        if (!id) {
            // Unassign
            updateMultipleFields({
                recurringGameId: null,
                // Cast to any to bypass strict type checking if enum isn't fully propagated yet
                recurringGameAssignmentStatus: 'NOT_RECURRING' as any,
                recurringGameAssignmentConfidence: 0,
                wasScheduledInstance: false,
                deviationNotes: null
            });
            return;
        }

        const game = availableRecurringGames.find(g => g.id === id);
        if (game) {
            // Manual Assignment
            updateMultipleFields({
                recurringGameId: game.id,
                recurringGameAssignmentStatus: 'MANUALLY_ASSIGNED' as any,
                recurringGameAssignmentConfidence: 1.0,
                wasScheduledInstance: true,
                // Auto-populate deviation notes if buy-ins differ
                deviationNotes: (game.typicalBuyIn && editedData.buyIn && game.typicalBuyIn !== editedData.buyIn)
                    ? `Manual: Buy-in ${editedData.buyIn} vs Typical ${game.typicalBuyIn}`
                    : null
            });
        }
    }, [availableRecurringGames, editedData.buyIn, updateMultipleFields]);

    // Helper to format currency
    const fmt = (val?: number) => val ? `$${val}` : '-';

    return (
        <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        🔄 Recurring Game Link
                        {/* Status Badge */}
                        {editedData.recurringGameAssignmentStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                                editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                                editedData.recurringGameAssignmentStatus === 'MANUALLY_ASSIGNED' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {String(editedData.recurringGameAssignmentStatus).replace('_', ' ')}
                            </span>
                        )}
                    </h3>
                </div>

                {/* Info Banner if Auto-Assigned */}
                {editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' && selectedRecurringGame && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                        <div className="font-medium">💡 Auto-Matched: {selectedRecurringGame.name}</div>
                        <div className="text-xs opacity-75 mt-1">
                            Confidence: {Math.round((editedData.recurringGameAssignmentConfidence || 0) * 100)}%
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {/* Dropdown Selector */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Assigned Pattern
                        </label>
                        <select
                            value={editedData.recurringGameId || ''}
                            onChange={(e) => handleSelection(e.target.value || null)}
                            className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">-- Not Recurring / One-off --</option>
                            {filteredRecurringGames.map(rg => (
                                <option key={rg.id} value={rg.id}>
                                    {rg.name} ({rg.dayOfWeek || '?'}) - {fmt(rg.typicalBuyIn)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Metadata Fields (Only show if assigned) */}
                    {editedData.recurringGameId && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Deviation Notes
                                </label>
                                <input
                                    type="text"
                                    value={editedData.deviationNotes || ''}
                                    onChange={(e) => editor.updateField('deviationNotes', e.target.value)}
                                    placeholder="e.g. Special Holiday Edition"
                                    className="w-full px-2 py-1 text-sm border rounded"
                                />
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!editedData.wasScheduledInstance}
                                        onChange={(e) => editor.updateField('wasScheduledInstance', e.target.checked)}
                                        className="h-4 w-4 text-blue-600 rounded"
                                    />
                                    Scheduled Instance
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};