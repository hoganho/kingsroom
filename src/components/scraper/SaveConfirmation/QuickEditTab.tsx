// src/components/scraper/SaveConfirmation/QuickEditTab.tsx
// Quick edit tab for common tournament fields

import React from 'react';
import type { GameData } from '../../../types/game';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { QuickDataEditor } from './QuickDataEditor';
import { formatCurrency } from '../../../utils/generalHelpers';

// ===================================================================
// TYPES
// ===================================================================

interface QuickEditTabProps {
  editor: UseGameDataEditorReturn;
  editedData: GameData;
  showAdvanced: boolean;
  
  // Venue fee editing
  venueFee: number | null;
  isEditingVenueFee: boolean;
  tempVenueFee: string;
  setTempVenueFee: (value: string) => void;
  setIsEditingVenueFee: (editing: boolean) => void;
  setVenueFee: (fee: number | null) => void;
  
  // Consolidation info
  willConsolidate: boolean;
  consolidationInfo: { willConsolidate: boolean; parentName: string | null };
  onViewGrouping: () => void;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const QuickEditTab: React.FC<QuickEditTabProps> = ({
  editor,
  editedData,
  showAdvanced,
  venueFee,
  isEditingVenueFee,
  tempVenueFee,
  setTempVenueFee,
  setIsEditingVenueFee,
  setVenueFee,
  willConsolidate,
  consolidationInfo,
  onViewGrouping,
}) => {
  const { updateField } = editor;

  const handleVenueFeeSave = () => {
    const newFee = tempVenueFee === '' ? null : parseFloat(tempVenueFee);
    updateField('venueFee', newFee);
    setVenueFee(newFee);
    setIsEditingVenueFee(false);
  };

  const handleVenueFeeCancel = () => {
    setIsEditingVenueFee(false);
  };

  const handleVenueFeeEdit = () => {
    const currentFee = editedData.venueFee ?? venueFee ?? 0;
    setTempVenueFee(currentFee.toString());
    setIsEditingVenueFee(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleVenueFeeSave();
    } else if (e.key === 'Escape') {
      handleVenueFeeCancel();
    }
  };

  return (
    <div className="p-4">
      {/* Venue Fee - editable */}
      <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
        <div className="text-sm flex items-center justify-between">
          <div className="flex items-center">
            <span className="font-medium">Venue Fee:</span>
            {isEditingVenueFee ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <span>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={tempVenueFee}
                  onChange={(e) => setTempVenueFee(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-24 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleVenueFeeSave}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={handleVenueFeeCancel}
                  className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <span className="ml-2 text-green-600 font-medium">
                {formatCurrency(editedData.venueFee ?? venueFee ?? 0)}
              </span>
            )}
          </div>
          {!isEditingVenueFee && (
            <button
              onClick={handleVenueFeeEdit}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Edit
            </button>
          )}
        </div>
      </div>
      
      {/* Show compact consolidation preview in quick tab */}
      {willConsolidate && consolidationInfo.parentName && (
        <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded">
          <div className="text-sm flex items-center gap-2">
            <span>📦</span>
            <span>
              Will group under: <strong>{consolidationInfo.parentName}</strong>
            </span>
            <button
              onClick={onViewGrouping}
              className="text-xs text-purple-600 hover:text-purple-700 underline ml-auto"
            >
              View Details
            </button>
          </div>
        </div>
      )}
      
      <QuickDataEditor 
        editor={editor} 
        showAdvanced={showAdvanced} 
      />
    </div>
  );
};

export default QuickEditTab;
