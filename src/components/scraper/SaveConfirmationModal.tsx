// src/components/scraper/SaveConfirmationModal.tsx
// REFACTORED: Simplified with Context and 4 tabs
// ~400 lines (down from ~976)

import React, { useState, useMemo, useCallback } from 'react';
import type { GameData } from '../../types/game';
import type { EnrichedGameData } from '../../types/enrichment';
import type { ScrapedGameData } from '../../API';
import { useGameDataEditor } from '../../hooks/useGameDataEditor';

// Context & Tabs
import { SaveConfirmationProvider, useSaveConfirmationContext } from './SaveConfirmation/SaveConfirmationContext';
import { DataTab } from './SaveConfirmation/DataTab';
import { LinksTab } from './SaveConfirmation/LinksTab';
import { GroupingTab } from './SaveConfirmation/GroupingTab';
import { ReviewTab } from './SaveConfirmation/ReviewTab';

// ===================================================================
// TYPES
// ===================================================================

type GameDataInput = EnrichedGameData | ScrapedGameData | GameData;

interface SaveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (editedData: GameData) => void;
  gameData: GameDataInput;
  venueId: string;
  sourceUrl: string;
  entityId?: string;
  autoMode?: boolean;
  skipConfirmation?: boolean;
}

interface ModalTab {
  id: string;
  label: string;
  icon: string;
  showIndicator?: (ctx: ReturnType<typeof useSaveConfirmationContext>) => boolean;
}

// ===================================================================
// TABS CONFIGURATION
// ===================================================================

const TABS: ModalTab[] = [
  { 
    id: 'data', 
    label: 'Data', 
    icon: '📝',
  },
  { 
    id: 'links', 
    label: 'Links', 
    icon: '🔗',
    showIndicator: (ctx) => !!(ctx.editor.editedData.recurringGameId || ctx.editor.editedData.tournamentSeriesId),
  },
  { 
    id: 'grouping', 
    label: 'Grouping', 
    icon: '📦',
    showIndicator: (ctx) => ctx.consolidation.willConsolidate,
  },
  { 
    id: 'review', 
    label: 'Review', 
    icon: '✓',
    showIndicator: (ctx) => ctx.editor.validationStatus.criticalMissing.length > 0,
  },
];

// ===================================================================
// HELPER
// ===================================================================

const getDataProperty = <T,>(data: GameDataInput | null | undefined, key: string, defaultValue: T): T => {
  if (!data) return defaultValue;
  const value = (data as Record<string, unknown>)[key];
  return (value !== undefined && value !== null) ? value as T : defaultValue;
};

// ===================================================================
// MODAL CONTENT (uses context)
// ===================================================================

const ModalContent: React.FC<{
  onClose: () => void;
  onConfirm: (data: GameData) => void;
}> = ({ onClose, onConfirm }) => {
  const ctx = useSaveConfirmationContext();
  const { editor, venueName, consolidation, loadingStates, autoMode } = ctx;
  const { editedData, validationStatus, hasChanges, resetAllChanges, changes } = editor;
  
  const [activeTab, setActiveTab] = useState('data');
  const [showAllFields, setShowAllFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Can save check
  const canSave = validationStatus.isValid || validationStatus.criticalMissing.length === 0;
  
  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Recalculate derived fields before save
      editor.recalculateDerived();
      onConfirm(editedData);
    } catch (error) {
      console.error('[Modal] Save error:', error);
    } finally {
      setIsSaving(false);
    }
  }, [editor, editedData, onConfirm]);
  
  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'data':
        return <DataTab showAllSections={showAllFields} />;
      case 'links':
        return <LinksTab />;
      case 'grouping':
        return <GroupingTab />;
      case 'review':
        return <ReviewTab />;
      default:
        return null;
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* ============================================= */}
        {/* HEADER */}
        {/* ============================================= */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              {autoMode ? '⚡' : '💾'} Save Tournament Data
            </h3>
            <div className="text-xs text-gray-500 mt-0.5">
              {editedData.name || 'Unnamed Tournament'}
              {venueName && <span> • {venueName}</span>}
              <span className="ml-2 text-green-600">✓ Enriched</span>
            </div>
          </div>
          
          {/* Status Badges */}
          <div className="flex items-center gap-2">
            {editedData.recurringGameId && (
              <span 
                className="px-2 py-1 bg-green-50 text-green-600 rounded text-xs font-medium cursor-pointer hover:bg-green-100"
                onClick={() => setActiveTab('links')}
              >
                🔄 Auto-Recurring
              </span>
            )}
            {consolidation.willConsolidate && (
              <span 
                className="px-2 py-1 bg-purple-50 text-purple-600 rounded text-xs font-medium cursor-pointer hover:bg-purple-100"
                onClick={() => setActiveTab('grouping')}
              >
                📦 Multi-day
              </span>
            )}
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              canSave ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {canSave ? '✓ Valid' : `⚠ ${validationStatus.criticalMissing.length} Issues`}
            </span>
            {hasChanges && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                {changes.totalChanges} Changes
              </span>
            )}
          </div>
        </div>
        
        {/* ============================================= */}
        {/* TABS */}
        {/* ============================================= */}
        <div className="border-b flex">
          {TABS.map(tab => {
            const showDot = tab.showIndicator?.(ctx);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {showDot && (
                  <span className={`w-2 h-2 rounded-full ${
                    tab.id === 'review' && validationStatus.criticalMissing.length > 0
                      ? 'bg-red-500'
                      : 'bg-green-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
        
        {/* ============================================= */}
        {/* CONTENT */}
        {/* ============================================= */}
        <div className="flex-1 overflow-auto">
          {loadingStates.initial ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500 animate-pulse">Loading...</div>
            </div>
          ) : (
            renderTabContent()
          )}
        </div>
        
        {/* ============================================= */}
        {/* FOOTER */}
        {/* ============================================= */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllFields}
                onChange={(e) => setShowAllFields(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Show all fields
            </label>
          </div>
          
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                type="button"
                onClick={resetAllChanges}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || (!canSave && !autoMode)}
              className={`px-4 py-2 text-sm text-white rounded font-medium ${
                isSaving || (!canSave && !autoMode)
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSaving ? 'Saving...' : canSave ? 'Save to Database' : 'Save Anyway'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const SaveConfirmationModal: React.FC<SaveConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  gameData,
  venueId,
  sourceUrl,
  entityId,
  autoMode = false,
  skipConfirmation = false,
}) => {
  // Build initial data
  const initialData = useMemo((): GameData => {
    if (!gameData) return {} as GameData;
    return {
      ...gameData,
      entityId: entityId || getDataProperty(gameData, 'entityId', ''),
      venueId: venueId || getDataProperty(gameData, 'venueId', ''),
      levels: getDataProperty(gameData, 'levels', []),
      hasGuarantee: getDataProperty(gameData, 'hasGuarantee', false),
    } as unknown as GameData;
  }, [gameData, entityId, venueId]);
  
  // Initialize editor
  const editor = useGameDataEditor(initialData);
  
  // Don't render if not open
  if (!isOpen || !gameData) return null;
  
  // Skip confirmation - auto save
  if (skipConfirmation) {
    // In real implementation, this would trigger save immediately
    // For now, just render nothing and let parent handle it
    return null;
  }
  
  return (
    <SaveConfirmationProvider
      editor={editor}
      originalGameData={gameData as EnrichedGameData}
      initialVenueId={venueId}
      initialEntityId={entityId}
      sourceUrl={sourceUrl}
      autoMode={autoMode}
    >
      <ModalContent onClose={onClose} onConfirm={onConfirm} />
    </SaveConfirmationProvider>
  );
};

export default SaveConfirmationModal;
