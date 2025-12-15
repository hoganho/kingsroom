// components/games/editor/GameEditorModal.tsx
// Modal orchestrator - uses existing GameData and SaveGameInput types
// UPDATED: Uses enrichGameData mutation instead of deprecated saveGame
// UPDATED: Includes source selection step for create mode

import React, { useState, useCallback, useMemo, useEffect } from 'react';
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

// Import enrichment service for saving
import {
  scrapedDataToEnrichInput,
  enrichGameData,
  getEnrichmentErrorMessage,
} from '../../../services/enrichmentService';
import type { ScrapedGameData } from '../../../API';

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
// HELPER: Convert GameData to ScrapedGameData format for enrichment
// ===================================================================

const gameDataToScrapedFormat = (data: GameData): ScrapedGameData => {
  return {
    __typename: 'ScrapedGameData',
    tournamentId: data.tournamentId || null,
    name: data.name || '',
    gameType: data.gameType || 'TOURNAMENT',
    gameVariant: data.gameVariant || null,
    gameStatus: data.gameStatus || 'SCHEDULED',
    registrationStatus: data.registrationStatus || null,
    gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
    gameEndDateTime: data.gameEndDateTime || null,
    buyIn: data.buyIn ?? 0,
    rake: data.rake ?? 0,
    hasGuarantee: data.hasGuarantee ?? false,
    guaranteeAmount: data.guaranteeAmount ?? 0,
    startingStack: data.startingStack ?? 0,
    totalUniquePlayers: data.totalUniquePlayers ?? 0,
    totalInitialEntries: data.totalInitialEntries ?? 0,
    totalEntries: data.totalEntries ?? 0,
    totalRebuys: data.totalRebuys ?? 0,
    totalAddons: data.totalAddons ?? 0,
    prizepoolPaid: data.prizepoolPaid ?? 0,
    prizepoolCalculated: data.prizepoolCalculated ?? 0,
    playersRemaining: (data as any).playersRemaining ?? null,
    // Extended fields
    venueFee: (data as any).venueFee ?? null,
    tournamentType: (data as any).tournamentType || null,
    isSeries: (data as any).isSeries ?? false,
    seriesName: (data as any).seriesName || null,
    isSatellite: (data as any).isSatellite ?? false,
    isRegular: (data as any).isRegular ?? true,
    gameTags: data.gameTags || [],
    levels: data.levels || [],
    entries: [],
    results: [],
    seating: [],
    venueMatch: null,
  } as unknown as ScrapedGameData;
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
  // SYNC TEMPLATE DATA TO EDITOR
  // ===================================================================
  
  // When source selection changes in create mode, apply template data to the editor
  // This is needed because the hook's internal state was initialized before source was selected
  useEffect(() => {
    if (mode === 'create' && sourceSelection?.templateData && Object.keys(sourceSelection.templateData).length > 0) {
      console.log('[GameEditorModal] Applying template data to editor:', sourceSelection.templateData);
      
      // Use the hook's built-in applyTemplate method
      editor.applyTemplate(sourceSelection.templateData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSelection]); // Only re-run when sourceSelection changes
  
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
      
      // Get the effective entity ID
      const effectiveEntityId = source?.entityId || data.entityId || entityId;
      
      if (!effectiveEntityId) {
        throw new Error('Entity ID is required for saving');
      }
      
      // Build source URL for tracking
      const sourceUrl = source?.sourceId || `manual-entry-${Date.now()}`;
      
      console.log('[GameEditorModal] Saving via enrichment pipeline:', {
        name: data.name,
        entityId: effectiveEntityId,
        venueId: data.venueId,
        existingGameId,
        mode,
      });
      
      // Convert GameData to ScrapedGameData format
      const scrapedData = gameDataToScrapedFormat(data);
      
      // Add extra fields that might be on the editor data
      (scrapedData as any).tournamentSeriesId = (data as any).tournamentSeriesId || null;
      (scrapedData as any).recurringGameId = (data as any).recurringGameId || null;
      (scrapedData as any).isMainEvent = (data as any).isMainEvent ?? false;
      (scrapedData as any).eventNumber = (data as any).eventNumber ?? null;
      (scrapedData as any).dayNumber = (data as any).dayNumber ?? null;
      (scrapedData as any).flightLetter = (data as any).flightLetter || null;
      (scrapedData as any).finalDay = (data as any).finalDay ?? false;
      (scrapedData as any).venueAssignmentStatus = (data as any).venueAssignmentStatus || null;
      (scrapedData as any).recurringGameAssignmentStatus = (data as any).recurringGameAssignmentStatus || null;
      (scrapedData as any).deviationNotes = (data as any).deviationNotes || null;
      (scrapedData as any).gameFrequency = (data as any).gameFrequency || null;
      
      // Build enrichment input
      const enrichInput = scrapedDataToEnrichInput(
        scrapedData,
        effectiveEntityId,
        sourceUrl,
        {
          venueId: data.venueId || venueId || null,
          existingGameId: existingGameId || null,
          wasEdited: mode !== 'create' || !!auditTrail,
        }
      );
      
      // Set save options
      enrichInput.options = {
        ...enrichInput.options,
        saveToDatabase: true,
        forceUpdate: mode === 'edit' || !!existingGameId,
        autoCreateSeries: true,
        autoCreateRecurring: false,
      };
      
      // Call enrichment pipeline
      const enrichResult = await enrichGameData(enrichInput);
      
      if (!enrichResult.success) {
        const errorMsg = getEnrichmentErrorMessage(enrichResult) || 'Enrichment failed';
        throw new Error(errorMsg);
      }
      
      if (!enrichResult.saveResult) {
        throw new Error('No save result returned from enrichment');
      }
      
      // Map enrichment save result to expected SaveGameResult format
      const result: SaveGameResult = {
        success: enrichResult.saveResult.success,
        gameId: enrichResult.saveResult.gameId || '',
        action: enrichResult.saveResult.action as 'CREATED' | 'UPDATED' | 'NO_CHANGES',
        message: enrichResult.saveResult.message || undefined,
        warnings: enrichResult.saveResult.warnings || undefined,
        playerProcessingQueued: enrichResult.saveResult.playerProcessingQueued || false,
        venueAssignment: enrichResult.saveResult.venueAssignment ? {
          venueId: enrichResult.saveResult.venueAssignment.venueId || '',
          status: enrichResult.saveResult.venueAssignment.status || 'PENDING_ASSIGNMENT',
          confidence: enrichResult.saveResult.venueAssignment.confidence || 0,
        } : undefined,
        fieldsUpdated: enrichResult.saveResult.fieldsUpdated || undefined,
        wasEdited: mode !== 'create',
      };
      
      setSaveResult(result);
      setSaveStatus('success');
      setModalStep('success');
      onSaveSuccess?.(result);
      
      console.log('[GameEditorModal] Save successful:', {
        gameId: result.gameId,
        action: result.action,
      });
      
    } catch (error) {
      console.error('[GameEditorModal] Save error:', error);
      const errMsg = error instanceof Error ? error.message : 'Save failed';
      setSaveError(errMsg);
      setSaveStatus('error');
      setModalStep('error');
      onSaveError?.(error as Error);
    }
  }, [editor, mode, existingGameId, entityId, venueId, onSaveSuccess, onSaveError]);
  
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