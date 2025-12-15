// src/components/scraper/SaveConfirmation/DataTab.tsx
// Data tab - All editable game fields organized by category
// Replaces QuickEditTab and AdvancedTab

import React, { useState, useMemo } from 'react';
import { useSaveConfirmationContext } from './SaveConfirmationContext';
import { FieldSection, FIELD_SECTIONS, type FieldSectionConfig } from './FieldSection';

// ===================================================================
// TYPES
// ===================================================================

interface DataTabProps {
  showAllSections?: boolean;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const DataTab: React.FC<DataTabProps> = ({ showAllSections = false }) => {
  const { editor, consolidation } = useSaveConfirmationContext();
  const { editedData, validationStatus } = editor;
  
  const [expandAll, setExpandAll] = useState(false);
  
  // Filter sections based on showAllSections flag
  const visibleSections = useMemo((): FieldSectionConfig[] => {
    if (showAllSections) {
      return FIELD_SECTIONS;
    }
    
    // Default view: show commonly used sections
    const prioritySections = [
      'identity',
      'status', 
      'schedule',
      'financials',
      'guarantee',
      'entries',
      'prizepool',
    ];
    
    return FIELD_SECTIONS.filter(section => 
      prioritySections.includes(section.id) ||
      (section.showWhen && section.showWhen(editedData))
    );
  }, [showAllSections, editedData]);
  
  // Count issues per section for summary
  const sectionIssues = useMemo(() => {
    const issues: Record<string, number> = {};
    
    for (const section of FIELD_SECTIONS) {
      let count = 0;
      for (const field of section.fields) {
        if (validationStatus.criticalMissing.includes(field as string)) {
          count++;
        }
      }
      if (count > 0) {
        issues[section.id] = count;
      }
    }
    
    return issues;
  }, [validationStatus.criticalMissing]);
  
  const totalIssues = Object.values(sectionIssues).reduce((a, b) => a + b, 0);
  
  return (
    <div className="p-4 space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${
              validationStatus.required.present === validationStatus.required.total
                ? 'text-green-600' : 'text-amber-600'
            }`}>
              {validationStatus.required.present}/{validationStatus.required.total} Required
            </span>
          </div>
          <div className="text-sm text-gray-500">
            {validationStatus.optional.present}/{validationStatus.optional.total} Optional
          </div>
          {validationStatus.warnings.length > 0 && (
            <div className="text-sm text-yellow-600">
              ⚠ {validationStatus.warnings.length} Warnings
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpandAll(!expandAll)}
            className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
          >
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>
      
      {/* Critical issues alert */}
      {totalIssues > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-red-800">
              ⚠ {totalIssues} Required Field{totalIssues > 1 ? 's' : ''} Missing
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {validationStatus.criticalMissing.slice(0, 5).map(field => (
              <span 
                key={field}
                className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded"
              >
                {field}
              </span>
            ))}
            {validationStatus.criticalMissing.length > 5 && (
              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                +{validationStatus.criticalMissing.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Consolidation notice */}
      {consolidation.willConsolidate && consolidation.parentName && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-purple-800">
            <span>📦</span>
            <span>
              Will be grouped under: <strong>{consolidation.parentName}</strong>
            </span>
          </div>
        </div>
      )}
      
      {/* Guarantee inheritance notice */}
      {editedData.recurringGameId && editedData.hasGuarantee && editedData.guaranteeAmount && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-green-800">
            <span>🔄</span>
            <span>
              Guarantee of <strong>${editedData.guaranteeAmount.toLocaleString()}</strong> inherited from recurring game template
            </span>
          </div>
        </div>
      )}
      
      {/* Field Sections */}
      <div className="space-y-3">
        {visibleSections.map(section => (
          <FieldSection
            key={section.id}
            config={section}
            editor={editor}
            forceExpanded={expandAll ? true : undefined}
          />
        ))}
      </div>
      
      {/* Show more sections toggle */}
      {!showAllSections && (
        <div className="text-center pt-2">
          <p className="text-xs text-gray-500">
            Showing common fields. Check "Show all fields" at the bottom for advanced options.
          </p>
        </div>
      )}
    </div>
  );
};

export default DataTab;
