// components/games/editor/GameEditorPreview.tsx
// Preview & Validation step - uses existing GameData type

import React, { useMemo } from 'react';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { fieldManifest } from '../../../lib/fieldManifest';

interface GameEditorPreviewProps {
  editor: UseGameDataEditorReturn;
  onBack: () => void;
  onConfirm: () => void;
}

// ===================================================================
// HELPER
// ===================================================================

const getFieldLabel = (field: string): string => {
  const def = fieldManifest[field];
  return def?.label || field.replace(/([A-Z])/g, ' $1').trim();
};

const formatValue = (field: string, value: any): string => {
  if (value === null || value === undefined) return '—';
  
  const currencyFields = [
    'totalBuyInsCollected', 'rakeRevenue', 'prizepoolPlayerContributions',
    'prizepoolAddedValue', 'prizepoolSurplus', 'guaranteeOverlayCost', 
    'gameProfit', 'buyIn', 'rake', 'guaranteeAmount', 'prizepoolPaid', 'prizepoolCalculated'
  ];
  
  if (currencyFields.includes(field) && typeof value === 'number') {
    return `$${value.toLocaleString()}`;
  }
  
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  
  return String(value);
};

// ===================================================================
// VALIDATION SECTION
// ===================================================================

interface ValidationSectionProps {
  title: string;
  icon: string;
  variant: 'error' | 'warning' | 'success' | 'info';
  items: { field: string; message: string }[];
  emptyMessage?: string;
}

const ValidationSection: React.FC<ValidationSectionProps> = ({
  title, icon, variant, items, emptyMessage,
}) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  
  const itemStyles = {
    error: 'text-red-700',
    warning: 'text-yellow-700',
    success: 'text-green-700',
    info: 'text-blue-700',
  };
  
  if (items.length === 0 && !emptyMessage) return null;
  
  return (
    <div className={`p-3 rounded-lg border ${styles[variant]}`}>
      <div className="font-medium text-sm mb-2 flex items-center gap-2">
        <span>{icon}</span>
        <span>{title}</span>
        {items.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">{items.length}</span>
        )}
      </div>
      {items.length > 0 ? (
        <ul className={`text-xs space-y-1 ${itemStyles[variant]}`}>
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="opacity-60">•</span>
              <span><strong>{getFieldLabel(item.field)}:</strong> {item.message}</span>
            </li>
          ))}
        </ul>
      ) : emptyMessage ? (
        <p className="text-xs opacity-75">{emptyMessage}</p>
      ) : null}
    </div>
  );
};

// ===================================================================
// CHANGES SUMMARY
// ===================================================================

const ChangeSummary: React.FC<{ editor: UseGameDataEditorReturn }> = ({ editor }) => {
  const { changes, mode } = editor;
  
  if (mode === 'create') return null;
  
  if (changes.totalChanges === 0) {
    return (
      <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
        <div className="font-medium text-sm text-gray-600 flex items-center gap-2">
          <span>📋</span>
          <span>No Changes</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">No modifications made.</p>
      </div>
    );
  }
  
  return (
    <div className="p-3 rounded-lg border bg-blue-50 border-blue-200">
      <div className="font-medium text-sm text-blue-800 mb-2 flex items-center gap-2">
        <span>✏️</span>
        <span>Changes Summary</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100">
          {changes.totalChanges} field{changes.totalChanges !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="space-y-2">
        {changes.addedFields.length > 0 && (
          <div>
            <div className="text-xs font-medium text-green-700 mb-1">➕ Added ({changes.addedFields.length})</div>
            <div className="flex flex-wrap gap-1">
              {changes.addedFields.map(field => (
                <span key={field} className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                  {getFieldLabel(field)}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {changes.modifiedFields.length > 0 && (
          <div>
            <div className="text-xs font-medium text-blue-700 mb-1">✎ Modified ({changes.modifiedFields.length})</div>
            <div className="flex flex-wrap gap-1">
              {changes.modifiedFields.map(field => (
                <span key={field} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                  {getFieldLabel(field)}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {changes.removedFields.length > 0 && (
          <div>
            <div className="text-xs font-medium text-red-700 mb-1">➖ Cleared ({changes.removedFields.length})</div>
            <div className="flex flex-wrap gap-1">
              {changes.removedFields.map(field => (
                <span key={field} className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded">
                  {getFieldLabel(field)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================================================================
// CALCULATED FIELDS PREVIEW
// ===================================================================

const CalculatedFieldsPreview: React.FC<{ editor: UseGameDataEditorReturn }> = ({ editor }) => {
  const { validationStatus } = editor;
  
  const displayFields = useMemo(() => {
    return validationStatus.calculatedFields.filter(cf => 
      cf.value !== undefined && cf.value !== null && cf.value !== 0
    );
  }, [validationStatus.calculatedFields]);
  
  if (displayFields.length === 0) return null;
  
  return (
    <div className="p-3 rounded-lg border bg-purple-50 border-purple-200">
      <div className="font-medium text-sm text-purple-800 mb-2 flex items-center gap-2">
        <span>🔢</span>
        <span>Calculated Fields</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {displayFields.map(cf => (
          <div key={cf.field} className="flex justify-between text-xs">
            <span className="text-purple-700">{getFieldLabel(cf.field)}:</span>
            <span className="font-mono text-purple-900">{formatValue(cf.field, cf.value)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-purple-600 mt-2 italic">
        Auto-calculated and will be saved with the game.
      </p>
    </div>
  );
};

// ===================================================================
// GAME SUMMARY CARD
// ===================================================================

const GameSummaryCard: React.FC<{ editor: UseGameDataEditorReturn }> = ({ editor }) => {
  const { editedData, mode } = editor;
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '—';
    try {
      return new Date(dateString).toLocaleString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return dateString; }
  };
  
  return (
    <div className="p-4 rounded-lg border-2 border-gray-300 bg-white">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-lg text-gray-900">{editedData.name || 'Unnamed Game'}</h3>
          <p className="text-sm text-gray-500">{formatDate(editedData.gameStartDateTime)}</p>
        </div>
        <div className="flex gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            editedData.gameStatus === 'FINISHED' ? 'bg-green-100 text-green-800' :
            editedData.gameStatus === 'RUNNING' ? 'bg-blue-100 text-blue-800' :
            editedData.gameStatus === 'CANCELLED' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {editedData.gameStatus || 'SCHEDULED'}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 text-xs">Buy-In</span>
          <p className="font-semibold">{editedData.buyIn ? `$${editedData.buyIn}` : '—'}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Rake</span>
          <p className="font-semibold">{editedData.rake ? `$${editedData.rake}` : '—'}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Players</span>
          <p className="font-semibold">{editedData.totalUniquePlayers ?? editedData.totalInitialEntries ?? '—'}</p>
        </div>
        <div>
          <span className="text-gray-500 text-xs">Prizepool</span>
          <p className="font-semibold">{editedData.prizepoolPaid ? `$${editedData.prizepoolPaid.toLocaleString()}` : '—'}</p>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
        <span className="text-xs px-2 py-1 bg-gray-100 rounded">{editedData.gameVariant || 'NLHE'}</span>
        {editedData.tournamentType && (
          <span className="text-xs px-2 py-1 bg-gray-100 rounded">{editedData.tournamentType}</span>
        )}
        {editedData.hasGuarantee && editedData.guaranteeAmount && (
          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
            ${editedData.guaranteeAmount.toLocaleString()} GTD
          </span>
        )}
        {editedData.isSeries && (
          <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 rounded">
            Series{editedData.seriesName ? `: ${editedData.seriesName}` : ''}
          </span>
        )}
        {editedData.recurringGameId && (
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">🔄 Recurring</span>
        )}
      </div>
      
      <div className="mt-3 text-xs text-gray-400 text-right">
        {mode === 'create' && '📝 New game will be created'}
        {mode === 'edit' && '✏️ Existing game will be updated'}
        {mode === 'confirm' && '✅ Scraped game will be saved'}
      </div>
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const GameEditorPreview: React.FC<GameEditorPreviewProps> = ({
  editor,
  onBack,
  onConfirm,
}) => {
  const { validationStatus, canSave, mode } = editor;
  
  const errorItems = validationStatus.errors;
  const warningItems = validationStatus.warnings;
  const missingRequired = validationStatus.required.missing.map(field => ({
    field,
    message: 'Required field is missing',
  }));
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center pb-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Review Before Saving</h2>
        <p className="text-sm text-gray-500 mt-1">Please review the details and validation status.</p>
      </div>
      
      {/* Game Summary */}
      <GameSummaryCard editor={editor} />
      
      {/* Validation Status */}
      <div className="space-y-3">
        <ValidationSection
          title="Errors"
          icon="❌"
          variant="error"
          items={[...errorItems, ...missingRequired]}
          emptyMessage="No errors found"
        />
        
        <ValidationSection
          title="Warnings"
          icon="⚠️"
          variant="warning"
          items={warningItems}
        />
        
        {canSave && errorItems.length === 0 && missingRequired.length === 0 && (
          <ValidationSection
            title="Validation Passed"
            icon="✅"
            variant="success"
            items={[]}
            emptyMessage="All required fields are valid."
          />
        )}
      </div>
      
      {/* Changes Summary */}
      <ChangeSummary editor={editor} />
      
      {/* Calculated Fields */}
      <CalculatedFieldsPreview editor={editor} />
      
      {/* Progress Bar */}
      <div className="p-3 rounded-lg border bg-gray-50 border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Required Fields</span>
          <span className={`text-sm font-bold ${
            validationStatus.required.present === validationStatus.required.total 
              ? 'text-green-600' : 'text-amber-600'
          }`}>
            {validationStatus.required.present} / {validationStatus.required.total}
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${
              validationStatus.required.present === validationStatus.required.total 
                ? 'bg-green-500' : 'bg-amber-500'
            }`}
            style={{ 
              width: `${(validationStatus.required.present / Math.max(validationStatus.required.total, 1)) * 100}%` 
            }}
          />
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          ← Back to Edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSave}
          className={`flex-1 px-4 py-2 rounded-lg font-medium ${
            canSave
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {mode === 'create' ? '✨ Create Game' : '💾 Save Changes'}
        </button>
      </div>
      
      {!canSave && (
        <p className="text-xs text-red-600 text-center">Please fix all errors before saving.</p>
      )}
    </div>
  );
};

export default GameEditorPreview;
