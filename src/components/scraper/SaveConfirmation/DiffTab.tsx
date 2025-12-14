// src/components/scraper/SaveConfirmation/DiffTab.tsx
// Changes tab showing field differences from original data

import React from 'react';
import type { GameData } from '../../../types/game';

// ===================================================================
// TYPES
// ===================================================================

interface DiffTabProps {
  originalData: GameData;
  editedData: GameData;
  getChangedFields: () => (keyof GameData)[];
  resetAllChanges: () => void;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const DiffTab: React.FC<DiffTabProps> = ({
  originalData,
  editedData,
  getChangedFields,
  resetAllChanges,
}) => {
  const changedFields = getChangedFields();

  return (
    <div className="p-4">
      {changedFields.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No changes made yet
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">
              {changedFields.length} Field{changedFields.length > 1 ? 's' : ''} Changed
            </h3>
            <button
              onClick={resetAllChanges}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Reset All Changes
            </button>
          </div>
          
          {changedFields.map((field: keyof GameData) => {
            const fieldKey = String(field);
            const oldValue = originalData[field];
            const newValue = editedData[field];
            
            return (
              <div key={fieldKey} className="border rounded p-3 bg-white">
                <div className="font-medium text-sm mb-2">{fieldKey}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-500 mb-1">Original</div>
                    <div className="p-2 bg-red-50 rounded font-mono break-all">
                      {formatDisplayValue(oldValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 mb-1">New</div>
                    <div className="p-2 bg-green-50 rounded font-mono break-all">
                      {formatDisplayValue(newValue)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// HELPERS
// ===================================================================

const formatDisplayValue = (value: unknown): string => {
  if (value === null) return '(null)';
  if (value === undefined) return '(empty)';
  if (typeof value === 'string' && value === '') return '(empty string)';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) return `[${value.length} items]`;
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

export default DiffTab;
