// src/components/scraper/SaveConfirmation/GroupingTab.tsx
// Simplified grouping tab for multi-day tournament consolidation
// Event structure fields are now ONLY in SeriesDetailsEditor (no duplicates)

import React from 'react';
import { useSaveConfirmationContext } from './SaveConfirmationContext';
import { ConsolidationPreview } from './ConsolidationPreview';

// ===================================================================
// COMPONENT
// ===================================================================

export const GroupingTab: React.FC = () => {
  const { editor, consolidation, actions } = useSaveConfirmationContext();
  const { editedData } = editor;
  
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="text-sm text-gray-600">
        <p>
          This preview shows how your tournament will be grouped with
          related flights when saved. Multi-day tournaments are
          automatically consolidated under a parent record.
        </p>
      </div>
      
      {/* Main Consolidation Preview */}
      <ConsolidationPreview
        gameData={editedData}
        showSiblingDetails={true}
        onConsolidationChange={() => {}} // Handled by context
      />
      
      {/* Auto-apply detected patterns button */}
      {consolidation.preview?.detectedPattern?.isMultiDay && 
       consolidation.preview.detectedPattern.detectionSource === 'namePattern' && (
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
              {consolidation.preview.detectedPattern.parsedDayNumber && (
                <div className="text-xs text-blue-600 mt-1">
                  Day: {consolidation.preview.detectedPattern.parsedDayNumber}
                  {consolidation.preview.detectedPattern.parsedFlightLetter && 
                    `, Flight: ${consolidation.preview.detectedPattern.parsedFlightLetter}`}
                  {consolidation.preview.detectedPattern.isFinalDay && ' (Final Day)'}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={actions.applyDetectedPattern}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </div>
      )}
      
      {/* Current Structure Summary */}
      {(editedData.eventNumber || editedData.dayNumber || editedData.flightLetter || editedData.finalDay) && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm font-medium text-green-800 mb-1">
            Current Event Structure
          </div>
          <div className="text-sm text-green-700">
            {editedData.eventNumber && <span>Event #{editedData.eventNumber} </span>}
            {editedData.dayNumber && <span>• Day {editedData.dayNumber} </span>}
            {editedData.flightLetter && <span>• Flight {editedData.flightLetter} </span>}
            {editedData.finalDay && <span>• 🏁 Final Day</span>}
          </div>
          <p className="text-xs text-green-600 mt-2">
            Edit these fields in the <strong>Links → Series</strong> section.
          </p>
        </div>
      )}
      
      {/* Tips Section */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          💡 Tips for Better Grouping
        </h4>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>
            Set <strong>Tournament Series</strong> and <strong>Event Number</strong> in the Links tab for 
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
      
      {/* Not consolidating message */}
      {!consolidation.willConsolidate && !consolidation.isLoading && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
          <div className="text-gray-400 text-3xl mb-2">📄</div>
          <div className="text-sm text-gray-600">
            This tournament will be saved as a standalone game.
          </div>
          <div className="text-xs text-gray-500 mt-1">
            No multi-day pattern detected. Add event structure info if this is part of a multi-day tournament.
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupingTab;
