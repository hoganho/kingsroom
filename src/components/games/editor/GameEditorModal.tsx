// components/games/editor/GameEditorModal.tsx
// Modal orchestrator - uses existing GameData and SaveGameInput types
// UPDATED: Includes source selection step for create mode

import React, { useState, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData } from '../../../types/game';
import type { 
  GameEditorMode,
  GameEditorConfig, 
  EntityOption, 
  VenueOption, 
  RecurringGameOption, 
  SeriesOption,
  SaveGameResult,
} from '../../../types/gameEditor';
import { DEFAULT_GAME_VALUES, getDefaultStartTime } from '../../../types/gameEditor';
import { useGameDataEditor } from '../../../hooks/useGameDataEditor';
import { GameSourceSelector, type GameSourceSelection } from './GameSourceSelector';
import { GameEditorForm } from './GameEditorForm';
import { GameEditorPreview } from './GameEditorPreview';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';

// ===================================================================
// GRAPHQL
// ===================================================================

const saveGameMutation = /* GraphQL */ `
  mutation SaveGame($input: SaveGameInput!) {
    saveGame(input: $input) {
      success
      gameId
      action
      message
      warnings
      playerProcessingQueued
      venueAssignment { venueId status confidence }
      seriesAssignment { tournamentSeriesId seriesName status confidence }
      fieldsUpdated
      wasEdited
    }
  }
`;

// ===================================================================
// PROPS
// ===================================================================

interface GameEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  
  mode: GameEditorMode;
  initialData?: Partial<GameData>;
  existingGameId?: string;
  entityId?: string;
  venueId?: string;
  
  dataSource?: {
    type: 'SCRAPE' | 'API' | 'MANUAL';
    sourceId: string;
    entityId: string;
    fetchedAt?: string;
  };
  
  entities?: EntityOption[];
  venues?: VenueOption[];
  recurringGames?: RecurringGameOption[];
  series?: SeriesOption[];
  
  onSaveSuccess?: (result: SaveGameResult) => void;
  onSaveError?: (error: Error) => void;
  showAdvanced?: boolean;
}

// ===================================================================
// MODAL STEP TYPE (internal)
// ===================================================================

type ModalStep = 'source' | 'form' | 'preview' | 'saving' | 'success' | 'error';

// ===================================================================
// SAVE PROGRESS COMPONENT
// ===================================================================

interface SaveProgressProps {
  status: 'saving' | 'success' | 'error';
  error?: string;
  result?: SaveGameResult;
  onRetry: () => void;
  onClose: () => void;
}

const SaveProgress: React.FC<SaveProgressProps> = ({ status, error, result, onRetry, onClose }) => {
  if (status === 'saving') {
    return (
      <div className="py-12 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Saving Game...</h3>
        <p className="text-sm text-gray-500 mt-1">Please wait.</p>
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <div className="py-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-3xl">❌</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Save Failed</h3>
          <p className="text-sm text-red-600 mt-2">{error}</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onRetry}>Try Again</Button>
        </div>
      </div>
    );
  }
  
  if (status === 'success' && result) {
    return (
      <div className="py-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <span className="text-3xl">✅</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {result.action === 'CREATED' ? 'Game Created!' : 'Game Updated!'}
          </h3>
          {result.message && <p className="text-sm text-gray-600 mt-2">{result.message}</p>}
        </div>
        
        {result.warnings && result.warnings.length > 0 && (
          <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-sm font-medium text-yellow-800 mb-1">⚠️ Warnings</div>
            <ul className="text-xs text-yellow-700 space-y-1">
              {result.warnings.map((w, idx) => <li key={idx}>• {w}</li>)}
            </ul>
          </div>
        )}
        
        <div className="flex justify-center">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }
  
  return null;
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const GameEditorModal: React.FC<GameEditorModalProps> = ({
  isOpen,
  onClose,
  mode,
  initialData,
  existingGameId,
  entityId,
  venueId,
  dataSource,
  entities = [],
  venues = [],
  recurringGames = [],
  series = [],
  onSaveSuccess,
  onSaveError,
  showAdvanced = false,
}) => {
  // ===================================================================
  // STATE
  // ===================================================================
  
  // For create mode, we start at 'source' step; otherwise go straight to 'form'
  const [modalStep, setModalStep] = useState<ModalStep>(mode === 'create' ? 'source' : 'form');
  
  // Source selection (only used in create mode)
  const [sourceSelection, setSourceSelection] = useState<GameSourceSelection | null>(null);
  
  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string>();
  const [saveResult, setSaveResult] = useState<SaveGameResult>();
  
  // ===================================================================
  // COMPUTED INITIAL DATA
  // ===================================================================
  
  // Build the actual initial data based on mode and source selection
  const computedInitialData = useMemo((): Partial<GameData> => {
    if (mode === 'create') {
      // Start with defaults
      const baseData: Partial<GameData> = {
        ...DEFAULT_GAME_VALUES,
        gameStartDateTime: getDefaultStartTime(),
        entityId,
        venueId,
      };
      
      // If source was selected, merge template data
      if (sourceSelection?.templateData) {
        return {
          ...baseData,
          ...sourceSelection.templateData,
        };
      }
      
      return baseData;
    }
    
    // For edit/confirm, use provided initial data
    return initialData || {};
  }, [mode, initialData, entityId, venueId, sourceSelection]);
  
  // ===================================================================
  // EDITOR HOOK
  // ===================================================================
  
  // Build config
  const config: GameEditorConfig = useMemo(() => ({
    mode,
    initialData: computedInitialData,
    existingGameId,
    entityId: computedInitialData.entityId || entityId,
    venueId: computedInitialData.venueId || venueId,
    dataSource: dataSource ? {
      ...dataSource,
      type: dataSource.type as any,
      fetchedAt: dataSource.fetchedAt || new Date().toISOString(),
    } : undefined,
    onSaveSuccess,
    onSaveError,
    onCancel: onClose,
  }), [mode, computedInitialData, existingGameId, entityId, venueId, dataSource, onSaveSuccess, onSaveError, onClose]);
  
  // Only initialize editor after source selection (for create mode) or immediately (for edit/confirm)
  const shouldInitializeEditor = mode !== 'create' || sourceSelection !== null;
  
  const editor = useGameDataEditor(
    shouldInitializeEditor ? computedInitialData : {},
    shouldInitializeEditor ? config : undefined
  );
  
  // ===================================================================
  // HANDLERS
  // ===================================================================
  
  const handleSourceSelect = useCallback((selection: GameSourceSelection) => {
    setSourceSelection(selection);
    setModalStep('form');
  }, []);
  
  const handleSave = useCallback(async () => {
    setModalStep('saving');
    setSaveStatus('saving');
    setSaveError(undefined);
    
    try {
      const { data, source, auditTrail } = editor.prepareSavePayload();
      const client = generateClient();
      
      const saveInput = {
        source: {
          type: source?.type || 'MANUAL',
          sourceId: source?.sourceId || 'manual-entry',
          entityId: source?.entityId || data.entityId || '',
          fetchedAt: source?.fetchedAt || new Date().toISOString(),
          wasEdited: source?.wasEdited || mode !== 'create',
        },
        game: {
          existingGameId: existingGameId,
          tournamentId: data.tournamentId,
          name: data.name,
          gameType: data.gameType || 'TOURNAMENT',
          gameVariant: data.gameVariant,
          gameStatus: data.gameStatus,
          gameStartDateTime: data.gameStartDateTime,
          gameEndDateTime: data.gameEndDateTime,
          registrationStatus: data.registrationStatus,
          gameFrequency: data.gameFrequency,
          buyIn: data.buyIn,
          rake: data.rake,
          guaranteeAmount: data.guaranteeAmount,
          hasGuarantee: data.hasGuarantee,
          startingStack: data.startingStack,
          prizepoolPaid: data.prizepoolPaid,
          prizepoolCalculated: data.prizepoolCalculated,
          totalUniquePlayers: data.totalUniquePlayers,
          totalInitialEntries: data.totalInitialEntries,
          totalEntries: data.totalEntries,
          totalRebuys: data.totalRebuys,
          totalAddons: data.totalAddons,
          playersRemaining: data.playersRemaining,
          totalBuyInsCollected: data.totalBuyInsCollected,
          rakeRevenue: data.rakeRevenue,
          prizepoolPlayerContributions: data.prizepoolPlayerContributions,
          prizepoolAddedValue: data.prizepoolAddedValue,
          prizepoolSurplus: data.prizepoolSurplus,
          guaranteeOverlayCost: data.guaranteeOverlayCost,
          gameProfit: data.gameProfit,
          tournamentType: data.tournamentType,
          isSeries: data.isSeries,
          seriesName: data.seriesName,
          tournamentSeriesId: data.tournamentSeriesId,
          isMainEvent: data.isMainEvent,
          eventNumber: data.eventNumber,
          dayNumber: data.dayNumber,
          flightLetter: data.flightLetter,
          finalDay: data.finalDay,
          isSatellite: data.isSatellite,
          isRegular: data.isRegular,
          gameTags: data.gameTags,
          levels: data.levels ? JSON.stringify(data.levels) : undefined,
          venueFee: data.venueFee,
          venueAssignmentStatus: data.venueAssignmentStatus,
          recurringGameId: data.recurringGameId,
          recurringGameAssignmentStatus: data.recurringGameAssignmentStatus,
          deviationNotes: data.deviationNotes,
        },
        venue: data.venueId ? { venueId: data.venueId, confidence: 1.0 } : undefined,
        auditTrail,
        options: { skipPlayerProcessing: false, forceUpdate: mode === 'edit' },
      };
      
      const response = await client.graphql({
        query: saveGameMutation,
        variables: { input: saveInput },
      });
      
      const result = (response as any).data?.saveGame as SaveGameResult;
      
      if (result?.success) {
        setSaveResult(result);
        setSaveStatus('success');
        setModalStep('success');
        onSaveSuccess?.(result);
      } else {
        throw new Error(result?.message || 'Save failed');
      }
    } catch (error) {
      console.error('Save error:', error);
      const errMsg = error instanceof Error ? error.message : 'Save failed';
      setSaveError(errMsg);
      setSaveStatus('error');
      setModalStep('error');
      onSaveError?.(error as Error);
    }
  }, [editor, mode, existingGameId, onSaveSuccess, onSaveError]);
  
  // ===================================================================
  // TITLE
  // ===================================================================
  
  const getModalTitle = () => {
    if (modalStep === 'saving') return 'Saving...';
    if (modalStep === 'success') return 'Save Complete';
    if (modalStep === 'error') return 'Save Failed';
    if (modalStep === 'preview') return 'Review & Confirm';
    if (modalStep === 'source') return '➕ Create New Game';
    
    // Form step
    if (mode === 'create') {
      if (sourceSelection?.type === 'series') return '➕ Add Series Game';
      if (sourceSelection?.type === 'recurring') return '➕ Add Recurring Instance';
      return '➕ Add Standalone Game';
    }
    if (mode === 'edit') return '✏️ Edit Game';
    if (mode === 'confirm') return '✅ Confirm Scraped Game';
    return 'Game Editor';
  };
  
  // ===================================================================
  // CLOSE HANDLER
  // ===================================================================
  
  const handleClose = useCallback(() => {
    // Only warn about unsaved changes if we're in the form step
    if (modalStep === 'form' && editor.hasChanges && saveStatus === 'idle') {
      if (!window.confirm('You have unsaved changes. Close anyway?')) return;
    }
    
    // Reset state on close
    setModalStep(mode === 'create' ? 'source' : 'form');
    setSourceSelection(null);
    setSaveStatus('idle');
    setSaveError(undefined);
    setSaveResult(undefined);
    
    onClose();
  }, [modalStep, editor.hasChanges, saveStatus, mode, onClose]);
  
  // ===================================================================
  // BACK HANDLER
  // ===================================================================
  
  const handleBack = useCallback(() => {
    if (modalStep === 'form' && mode === 'create') {
      // Go back to source selection
      setSourceSelection(null);
      setModalStep('source');
    } else if (modalStep === 'preview') {
      setModalStep('form');
      editor.goToForm();
    }
  }, [modalStep, mode, editor]);
  
  // ===================================================================
  // RENDER
  // ===================================================================
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getModalTitle()}>
      <div className="max-h-[70vh] overflow-y-auto">
        
        {/* Source Selection Step (create mode only) */}
        {modalStep === 'source' && mode === 'create' && (
          <GameSourceSelector
            entities={entities}
            venues={venues}
            recurringGames={recurringGames}
            series={series}
            onSelect={handleSourceSelect}
            onCancel={handleClose}
          />
        )}
        
        {/* Form Step */}
        {modalStep === 'form' && shouldInitializeEditor && (
          <>
            {/* Source indicator for create mode */}
            {mode === 'create' && sourceSelection && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    {sourceSelection.type === 'series' && <span>📚 Creating series game</span>}
                    {sourceSelection.type === 'recurring' && <span>🔄 Creating recurring game instance</span>}
                    {sourceSelection.type === 'standalone' && <span>🎯 Creating standalone game</span>}
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}
            
            <GameEditorForm
              editor={editor}
              entities={entities}
              venues={venues}
              recurringGames={recurringGames}
              series={series}
              showAdvanced={showAdvanced}
              showRecurringGameSelector={sourceSelection?.type !== 'recurring'}
              showSeriesSelector={sourceSelection?.type === 'series'}
              compact={true}
            />
            
            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200">
              {mode === 'create' && (
                <Button variant="secondary" onClick={handleBack} className="flex-1">
                  ← Back
                </Button>
              )}
              {mode !== 'create' && (
                <Button variant="secondary" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
              )}
              <Button onClick={() => { editor.goToPreview(); setModalStep('preview'); }} className="flex-1">
                Review & Save →
              </Button>
            </div>
          </>
        )}
        
        {/* Preview Step */}
        {modalStep === 'preview' && (
          <GameEditorPreview
            editor={editor}
            onBack={() => { editor.goToForm(); setModalStep('form'); }}
            onConfirm={handleSave}
          />
        )}
        
        {/* Saving / Success / Error */}
        {(modalStep === 'saving' || modalStep === 'success' || modalStep === 'error') && (
          <SaveProgress
            status={saveStatus === 'idle' ? 'saving' : saveStatus}
            error={saveError}
            result={saveResult}
            onRetry={() => {
              setSaveStatus('idle');
              setModalStep('preview');
            }}
            onClose={handleClose}
          />
        )}
      </div>
    </Modal>
  );
};

export default GameEditorModal;