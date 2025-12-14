// src/components/scraper/SaveConfirmation/GroupingTab.tsx
// Grouping tab for multi-day tournament consolidation

import React from 'react';
import type { GameData } from '../../../types/game';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { ConsolidationPreview } from './ConsolidationPreview';

// ===================================================================
// TYPES
// ===================================================================

interface ConsolidationInfo {
  willConsolidate: boolean;
  parentName: string | null;
}

interface DetectedPattern {
  isMultiDay: boolean;
  detectionSource: string;
  dayNumber?: number | null;
  flightLetter?: string | null;
  eventNumber?: number | null;
  finalDay?: boolean;
}

interface ConsolidationPreviewData {
  detectedPattern?: DetectedPattern;
}

interface GroupingTabProps {
  editor: UseGameDataEditorReturn;
  editedData: GameData;
  willConsolidate: boolean;
  consolidationInfo: ConsolidationInfo;
  setConsolidationInfo: (info: ConsolidationInfo) => void;
  consolidationPreview: ConsolidationPreviewData | null;
  onApplyDetectedPattern: () => void;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const GroupingTab: React.FC<GroupingTabProps> = ({
  editor,
  editedData,
  willConsolidate,
  setConsolidationInfo,
  consolidationPreview,
  onApplyDetectedPattern,
}) => {
  const { updateField } = editor;

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-gray-600 mb-4">
        <p>
          This preview shows how your tournament will be grouped with
          related flights when saved. Multi-day tournaments are
          automatically consolidated under a parent record.
        </p>
      </div>
      
      {/* Main Consolidation Preview Component */}
      <ConsolidationPreview
        gameData={editedData}
        showSiblingDetails={true}
        onConsolidationChange={(willConsolidateVal: boolean, parentName: string | null) => {
          setConsolidationInfo({ 
            willConsolidate: willConsolidateVal, 
            parentName 
          });
        }}
      />
      
      {/* Auto-apply detected patterns button */}
      {consolidationPreview?.detectedPattern?.isMultiDay && 
       consolidationPreview.detectedPattern.detectionSource === 'namePattern' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-900">
                💡 Auto-detected Pattern
              </div>
              <div className="text-xs text-blue-700 mt-1">
                We detected day/flight info from the name. 
                Apply it to the fields for better accuracy?
              </div>
            </div>
            <button
              onClick={onApplyDetectedPattern}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      
      {/* Tips Section */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          💡 Tips for Better Grouping
        </h4>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>
            Set <strong>Tournament Series</strong> and <strong>Event Number</strong> for 
            most reliable grouping
          </li>
          <li>
            Set <strong>Day Number</strong> (1, 2, 3) and <strong>Flight Letter</strong> (A, B, C) 
            to identify specific flights
          </li>
          <li>
            Mark the final day with the <strong>Final Day</strong> checkbox to ensure 
            results are synced correctly
          </li>
          <li>
            Games with the same buy-in at the same venue with similar names will be 
            grouped automatically
          </li>
        </ul>
      </div>
      
      {/* Quick Series Fields Editor */}
      {willConsolidate && (
        <div className="border rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            📋 Quick Series Fields
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Event Number</label>
              <input
                type="number"
                value={editedData.eventNumber || ''}
                onChange={(e) => updateField('eventNumber', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 8"
                className="w-full px-2 py-1 text-sm border rounded mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Day Number</label>
              <input
                type="number"
                value={editedData.dayNumber || ''}
                onChange={(e) => updateField('dayNumber', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="e.g., 1, 2"
                className="w-full px-2 py-1 text-sm border rounded mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Flight Letter</label>
              <select
                value={editedData.flightLetter || ''}
                onChange={(e) => updateField('flightLetter', e.target.value || null)}
                className="w-full px-2 py-1 text-sm border rounded mt-1"
              >
                <option value="">-- None --</option>
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(letter => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="finalDayGrouping"
                checked={editedData.finalDay || false}
                onChange={(e) => updateField('finalDay', e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="finalDayGrouping" className="text-sm">
                🏁 Final Day
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupingTab;
