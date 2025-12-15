// src/components/scraper/SaveConfirmation/RecurringGameEditor.tsx

import React, { useMemo, useCallback } from 'react';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';

// Define locally or import from API types if available
export interface RecurringGame {
    id: string;
    name: string;
    venueId: string;
    entityId?: string | null;
    dayOfWeek?: string | null;
    frequency?: string | null;
    gameType?: string | null;
    gameVariant?: string | null;
    typicalBuyIn?: number | null;
    typicalGuarantee?: number | null;  // ✅ ADDED: Was missing!
    startTime?: string | null;
    isActive?: boolean | null;
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
            // Unassign - clear recurring game fields but DON'T clear guarantee
            // (user may have manually set it)
            updateMultipleFields({
                recurringGameId: null,
                recurringGameAssignmentStatus: 'NOT_RECURRING' as any,
                recurringGameAssignmentConfidence: 0,
                wasScheduledInstance: false,
                deviationNotes: null
            });
            return;
        }

        const game = availableRecurringGames.find(g => g.id === id);
        if (game) {
            // Build update payload
            const updates: Record<string, any> = {
                recurringGameId: game.id,
                recurringGameAssignmentStatus: 'MANUALLY_ASSIGNED' as any,
                recurringGameAssignmentConfidence: 1.0,
                wasScheduledInstance: true,
            };

            // ✅ ADDED: Inherit typicalGuarantee if game doesn't have one set
            if (game.typicalGuarantee && game.typicalGuarantee > 0) {
                const currentGuarantee = editedData.guaranteeAmount || 0;
                if (currentGuarantee === 0) {
                    updates.guaranteeAmount = game.typicalGuarantee;
                    updates.hasGuarantee = true;
                    console.log(`[RecurringGameEditor] Inheriting guarantee $${game.typicalGuarantee} from "${game.name}"`);
                }
            }

            // Auto-populate deviation notes if buy-ins differ
            if (game.typicalBuyIn && editedData.buyIn && game.typicalBuyIn !== editedData.buyIn) {
                updates.deviationNotes = `Manual: Buy-in $${editedData.buyIn} vs Typical $${game.typicalBuyIn}`;
            }

            updateMultipleFields(updates);
            
            // ✅ ADDED: Trigger financial recalculation after inheritance
            // The updateMultipleFields will update state, and useGameDataEditor
            // should auto-calculate derived fields. If not, we can call recalculateDerived
            // but that requires a slight delay due to React batching.
            setTimeout(() => {
                editor.recalculateDerived();
            }, 0);
        }
    }, [availableRecurringGames, editedData.buyIn, editedData.guaranteeAmount, updateMultipleFields, editor]);

    // Helper to format currency
    const fmt = (val?: number | null) => val ? `$${val.toLocaleString()}` : '-';

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
                                editedData.recurringGameAssignmentStatus === 'PENDING_ASSIGNMENT' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {String(editedData.recurringGameAssignmentStatus).replace(/_/g, ' ')}
                            </span>
                        )}
                    </h3>
                </div>

                {/* Info Banner if Auto-Assigned or Pending */}
                {(editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' || 
                  editedData.recurringGameAssignmentStatus === 'PENDING_ASSIGNMENT') && selectedRecurringGame && (
                    <div className={`mb-3 p-3 rounded-lg text-sm ${
                        editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' 
                            ? 'bg-blue-50 border border-blue-200 text-blue-800'
                            : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                    }`}>
                        <div className="font-medium">
                            💡 {editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' ? 'Auto-Matched' : 'Pending Review'}: {selectedRecurringGame.name}
                        </div>
                        <div className="text-xs opacity-75 mt-1 flex flex-wrap gap-3">
                            <span>Confidence: {Math.round((editedData.recurringGameAssignmentConfidence || 0) * 100)}%</span>
                            {selectedRecurringGame.typicalBuyIn && (
                                <span>Typical Buy-in: {fmt(selectedRecurringGame.typicalBuyIn)}</span>
                            )}
                            {selectedRecurringGame.typicalGuarantee && (
                                <span>Typical Guarantee: {fmt(selectedRecurringGame.typicalGuarantee)}</span>
                            )}
                        </div>
                        {/* Show inheritance info */}
                        {selectedRecurringGame.typicalGuarantee && editedData.guaranteeAmount === selectedRecurringGame.typicalGuarantee && (
                            <div className="text-xs mt-2 text-green-700 bg-green-50 px-2 py-1 rounded inline-block">
                                ✓ Guarantee inherited from template
                            </div>
                        )}
                    </div>
                )}

                {/* Warning if recurringGameId is set but no matching game found */}
                {editedData.recurringGameId && !selectedRecurringGame && (
                    <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                        <div className="font-medium">⚠️ Recurring Game Not Found</div>
                        <div className="text-xs opacity-75 mt-1">
                            ID: {editedData.recurringGameId}
                            <br />
                            The linked recurring game may not be loaded or may have been deleted.
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
                                    {rg.typicalGuarantee ? ` / ${fmt(rg.typicalGuarantee)} GTD` : ''}
                                </option>
                            ))}
                        </select>
                        {/* Show count of available options */}
                        <div className="text-xs text-gray-400 mt-1">
                            {filteredRecurringGames.length} recurring games available
                            {venueId && filteredRecurringGames.length < availableRecurringGames.length && (
                                <span> (filtered by venue)</span>
                            )}
                        </div>
                    </div>

                    {/* Metadata Fields (Only show if assigned) */}
                    {editedData.recurringGameId && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Deviation Notes
                                </label>
                                <input
                                    type="text"
                                    value={editedData.deviationNotes || ''}
                                    onChange={(e) => editor.updateField('deviationNotes', e.target.value || null)}
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
