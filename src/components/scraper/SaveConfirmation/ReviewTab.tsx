// src/components/scraper/SaveConfirmation/ReviewTab.tsx
// Review tab - Validation, Changes, and Debug combined
// Pre-save review with collapsible sections

import React, { useState, useMemo } from 'react';
import { useSaveConfirmationContext } from './SaveConfirmationContext';
import type { GameData } from '../../../types/game';
import { scrapedDataToEnrichInput } from '../../../services/enrichmentService';
import type { ScrapedGameData } from '../../../API';

// ===================================================================
// TYPES
// ===================================================================

type DebugViewMode = 'original' | 'edited' | 'enrichInput' | 'comparison';

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Collapsible Section Wrapper
const CollapsibleSection: React.FC<{
  title: string;
  icon: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  variant?: 'default' | 'error' | 'warning' | 'success';
  children: React.ReactNode;
}> = ({ title, icon, defaultOpen = false, badge, variant = 'default', children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const variantStyles = {
    default: 'border-gray-200 bg-gray-50',
    error: 'border-red-200 bg-red-50',
    warning: 'border-yellow-200 bg-yellow-50',
    success: 'border-green-200 bg-green-50',
  };
  
  return (
    <div className={`border rounded-lg overflow-hidden ${variantStyles[variant]}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-opacity-80 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 transition-transform duration-200"
                style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          <span>{icon}</span>
          <span className="font-medium text-sm">{title}</span>
        </div>
        {badge}
      </button>
      
      {isOpen && (
        <div className="px-4 py-3 bg-white border-t">
          {children}
        </div>
      )}
    </div>
  );
};

// Validation Section
const ValidationSection: React.FC = () => {
  const { editor } = useSaveConfirmationContext();
  const { validationStatus } = editor;
  
  const hasErrors = validationStatus.criticalMissing.length > 0;
  const hasWarnings = validationStatus.warnings.length > 0;
  
  return (
    <CollapsibleSection
      title="Validation"
      icon="⚠️"
      defaultOpen={hasErrors || hasWarnings}
      variant={hasErrors ? 'error' : hasWarnings ? 'warning' : 'success'}
      badge={
        hasErrors ? (
          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
            {validationStatus.criticalMissing.length} Errors
          </span>
        ) : hasWarnings ? (
          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
            {validationStatus.warnings.length} Warnings
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
            ✓ Valid
          </span>
        )
      }
    >
      <div className="space-y-4">
        {/* Critical Errors */}
        {hasErrors && (
          <div>
            <h4 className="text-sm font-medium text-red-800 mb-2">
              Missing Required Fields
            </h4>
            <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
              {validationStatus.criticalMissing.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Warnings */}
        {hasWarnings && (
          <div>
            <h4 className="text-sm font-medium text-yellow-800 mb-2">
              Warnings
            </h4>
            <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
              {validationStatus.warnings.map((warning, idx) => (
                <li key={idx}>
                  <strong>{warning.field}:</strong> {warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* All Clear */}
        {!hasErrors && !hasWarnings && (
          <div className="text-sm text-green-700">
            ✓ All required fields are present and valid.
          </div>
        )}
        
        {/* Progress Bar */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">Required Fields</span>
            <span className={`text-xs font-medium ${
              validationStatus.required.present === validationStatus.required.total
                ? 'text-green-600' : 'text-amber-600'
            }`}>
              {validationStatus.required.present}/{validationStatus.required.total}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
      </div>
    </CollapsibleSection>
  );
};

// Changes Section
const ChangesSection: React.FC = () => {
  const { editor } = useSaveConfirmationContext();
  const { changes, originalData, editedData, resetAllChanges } = editor;
  
  const hasChanges = changes.totalChanges > 0;
  
  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null) return '(null)';
    if (value === undefined) return '(empty)';
    if (typeof value === 'string' && value === '') return '(empty string)';
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };
  
  return (
    <CollapsibleSection
      title="Changes"
      icon="📝"
      defaultOpen={hasChanges}
      badge={
        hasChanges ? (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
            {changes.totalChanges} Changes
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
            No Changes
          </span>
        )
      }
    >
      {hasChanges ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-xs">
              {changes.addedFields.length > 0 && (
                <span className="text-green-600">+{changes.addedFields.length} added</span>
              )}
              {changes.modifiedFields.length > 0 && (
                <span className="text-blue-600">~{changes.modifiedFields.length} modified</span>
              )}
              {changes.removedFields.length > 0 && (
                <span className="text-red-600">-{changes.removedFields.length} cleared</span>
              )}
            </div>
            <button
              type="button"
              onClick={resetAllChanges}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Reset All
            </button>
          </div>
          
          {/* Changed Fields List */}
          <div className="space-y-2 max-h-64 overflow-auto">
            {[...changes.addedFields, ...changes.modifiedFields, ...changes.removedFields].map(field => {
              const oldValue = originalData[field as keyof GameData];
              const newValue = editedData[field as keyof GameData];
              const isAdded = changes.addedFields.includes(field);
              const isRemoved = changes.removedFields.includes(field);
              
              return (
                <div key={field} className="p-2 bg-gray-50 rounded border text-xs">
                  <div className="font-medium text-gray-700 mb-1">{field}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-gray-500">Before:</div>
                      <div className={`font-mono ${isAdded ? 'text-gray-400' : 'text-red-600'}`}>
                        {formatValue(oldValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">After:</div>
                      <div className={`font-mono ${isRemoved ? 'text-gray-400' : 'text-green-600'}`}>
                        {formatValue(newValue)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No changes have been made.
        </div>
      )}
    </CollapsibleSection>
  );
};

// Debug Section
const DebugSection: React.FC = () => {
  const { editor, sourceUrl } = useSaveConfirmationContext();
  const { editedData, originalData } = editor;
  
  const [viewMode, setViewMode] = useState<DebugViewMode>('edited');
  const [copied, setCopied] = useState(false);
  
  // Build enrichment input preview
  const enrichmentInput = useMemo(() => {
    try {
      return scrapedDataToEnrichInput(
        editedData as unknown as ScrapedGameData,
        editedData.entityId || '',
        sourceUrl,
        { venueId: editedData.venueId }
      );
    } catch (e) {
      return { error: String(e) };
    }
  }, [editedData, sourceUrl]);
  
  const getDisplayData = (): unknown => {
    switch (viewMode) {
      case 'original': return originalData;
      case 'edited': return editedData;
      case 'enrichInput': return enrichmentInput;
      default: return editedData;
    }
  };
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getDisplayData(), null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };
  
  return (
    <CollapsibleSection
      title="Debug"
      icon="🔍"
      defaultOpen={false}
      badge={
        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
          {Object.keys(editedData).length} fields
        </span>
      }
    >
      <div className="space-y-3">
        {/* View Mode Selector */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'original', label: 'Original' },
            { id: 'edited', label: 'Edited' },
            { id: 'enrichInput', label: 'Enrich Input' },
          ].map(mode => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id as DebugViewMode)}
              className={`px-3 py-1 text-xs rounded ${
                viewMode === mode.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
          <button
            type="button"
            onClick={copyToClipboard}
            className={`px-3 py-1 text-xs rounded ml-auto ${
              copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
        
        {/* JSON Display */}
        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-64 font-mono">
          {JSON.stringify(getDisplayData(), null, 2)}
        </pre>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-100 rounded p-2">
            <div className="text-gray-500">Original</div>
            <div className="font-bold">{Object.keys(originalData).length} fields</div>
          </div>
          <div className="bg-gray-100 rounded p-2">
            <div className="text-gray-500">Edited</div>
            <div className="font-bold">{Object.keys(editedData).length} fields</div>
          </div>
          <div className="bg-gray-100 rounded p-2">
            <div className="text-gray-500">Changes</div>
            <div className="font-bold">{editor.changes.totalChanges}</div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
};

// Calculated Fields Section
const CalculatedFieldsSection: React.FC = () => {
  const { editor } = useSaveConfirmationContext();
  const { editedData } = editor;
  
  const calculatedFields = [
    { key: 'totalBuyInsCollected', label: 'Total Buy-Ins', value: editedData.totalBuyInsCollected },
    { key: 'rakeRevenue', label: 'Rake Revenue', value: editedData.rakeRevenue },
    { key: 'prizepoolPlayerContributions', label: 'Player Contributions', value: editedData.prizepoolPlayerContributions },
    { key: 'prizepoolAddedValue', label: 'Added Value', value: editedData.prizepoolAddedValue },
    { key: 'guaranteeOverlayCost', label: 'Overlay Cost', value: editedData.guaranteeOverlayCost },
    { key: 'gameProfit', label: 'Game Profit', value: editedData.gameProfit },
  ].filter(f => f.value !== undefined && f.value !== null);
  
  if (calculatedFields.length === 0) return null;
  
  const formatCurrency = (value: number) => `$${value.toLocaleString()}`;
  
  return (
    <CollapsibleSection
      title="Calculated Financials"
      icon="💼"
      defaultOpen={false}
      badge={
        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
          {calculatedFields.length} values
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {calculatedFields.map(field => (
          <div key={field.key} className="flex justify-between p-2 bg-gray-50 rounded text-sm">
            <span className="text-gray-600">{field.label}:</span>
            <span className={`font-mono font-medium ${
              field.key === 'gameProfit' && (field.value as number) < 0 ? 'text-red-600' : 'text-gray-900'
            }`}>
              {formatCurrency(field.value as number)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2 italic">
        These values are automatically calculated and will be saved with the game.
      </p>
    </CollapsibleSection>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ReviewTab: React.FC = () => {
  const { editor, consolidation } = useSaveConfirmationContext();
  const { validationStatus, editedData } = editor;
  
  const canSave = validationStatus.isValid || validationStatus.criticalMissing.length === 0;
  
  return (
    <div className="p-4 space-y-4">
      {/* Summary Header */}
      <div className="p-4 bg-white border rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-lg">{editedData.name || 'Unnamed Game'}</h3>
          <div className={`px-3 py-1 rounded text-sm font-medium ${
            canSave ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {canSave ? '✓ Ready to Save' : '⚠ Has Issues'}
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Buy-In:</span>
            <span className="ml-2 font-medium">{editedData.buyIn ? `$${editedData.buyIn}` : '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Players:</span>
            <span className="ml-2 font-medium">{editedData.totalUniquePlayers ?? editedData.totalInitialEntries ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Status:</span>
            <span className="ml-2 font-medium">{editedData.gameStatus || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Prizepool:</span>
            <span className="ml-2 font-medium">{editedData.prizepoolPaid ? `$${editedData.prizepoolPaid.toLocaleString()}` : '—'}</span>
          </div>
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          {editedData.hasGuarantee && editedData.guaranteeAmount && (
            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
              ${editedData.guaranteeAmount.toLocaleString()} GTD
            </span>
          )}
          {editedData.isSeries && (
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
              🏆 Series
            </span>
          )}
          {editedData.recurringGameId && (
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
              🔄 Recurring
            </span>
          )}
          {consolidation.willConsolidate && (
            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
              📦 Multi-day
            </span>
          )}
        </div>
      </div>
      
      {/* Collapsible Sections */}
      <ValidationSection />
      <ChangesSection />
      <CalculatedFieldsSection />
      <DebugSection />
    </div>
  );
};

export default ReviewTab;
