// src/components/scraper/SaveConfirmation/ValidationTab.tsx
// Validation status tab showing field completeness and issues

import React from 'react';

// ===================================================================
// TYPES
// ===================================================================

interface ValidationWarning {
  field: string;
  message: string;
}

interface ValidationStatus {
  criticalMissing: string[];
  warnings: ValidationWarning[];
  required: { present: number; total: number };
  optional: { present: number; total: number };
}

interface ValidationTabProps {
  validationStatus: ValidationStatus;
  onQuickFix: () => void;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const ValidationTab: React.FC<ValidationTabProps> = ({
  validationStatus,
  onQuickFix,
}) => {
  return (
    <div className="p-4">
      {/* Critical Issues */}
      {validationStatus.criticalMissing.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-red-800">
              ⚠ Critical Issues ({validationStatus.criticalMissing.length})
            </h4>
            <button
              onClick={onQuickFix}
              className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Auto-Fix
            </button>
          </div>
          <ul className="text-sm text-red-700 list-disc list-inside">
            {validationStatus.criticalMissing.map((field: string) => (
              <li key={field}>{field} is required</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Warnings */}
      {validationStatus.warnings.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">
            ⚠ Warnings ({validationStatus.warnings.length})
          </h4>
          <ul className="text-sm text-yellow-700 list-disc list-inside">
            {validationStatus.warnings.map((warning: ValidationWarning, idx: number) => (
              <li key={idx}><strong>{warning.field}:</strong> {warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* All Clear Message */}
      {validationStatus.criticalMissing.length === 0 && validationStatus.warnings.length === 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-semibold text-green-800">
            ✓ All Required Fields Present
          </h4>
          <p className="text-sm text-green-700 mt-1">
            No critical issues or warnings detected.
          </p>
        </div>
      )}
      
      {/* Validation Status */}
      <div className="p-3 bg-gray-50 rounded-lg">
        <h4 className="font-semibold text-gray-800 mb-3">Field Status</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-gray-600">Required Fields</div>
            <div className={`text-2xl font-bold ${
              validationStatus.required.present === validationStatus.required.total
                ? 'text-green-600'
                : 'text-red-600'
            }`}>
              {validationStatus.required.present}/{validationStatus.required.total}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Optional Fields</div>
            <div className="text-2xl font-bold text-gray-600">
              {validationStatus.optional.present}/{validationStatus.optional.total}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidationTab;
