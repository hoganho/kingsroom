// hooks/useGameDataEditor.ts
// ENHANCED: Now supports create, edit, and confirm modes
// Replaces the original useGameDataEditor with unified functionality

import { useState, useCallback, useMemo } from 'react';
import type { GameData } from '../types/game';
import type { 
  GameEditorMode, 
  GameEditorStep,
  GameEditorConfig,
  FieldGroupConfig,
} from '../types/gameEditor';
import { DEFAULT_GAME_VALUES, getDefaultDataForMode } from '../types/gameEditor';
import { fieldManifest } from '../lib/fieldManifest';
import { 
  calculateDerivedFields, 
  prepareGameDataForSave,
  createAuditTrail 
} from '../utils/gameDataValidation';

// ===================================================================
// FIELD GROUPS CONFIGURATION
// ===================================================================

export const FIELD_GROUPS: FieldGroupConfig[] = [
  {
    id: 'identity',
    title: '🎯 Game Identity',
    fields: ['name', 'gameType', 'gameVariant', 'tournamentType'],
    priority: 'critical',
    defaultExpanded: true,
  },
  {
    id: 'entity-venue',
    title: '🏢 Entity & Venue',
    fields: ['entityId', 'venueId'],
    priority: 'critical',
    defaultExpanded: true,
    showInModes: ['create', 'edit'],
  },
  {
    id: 'status',
    title: '📊 Status',
    fields: ['gameStatus', 'registrationStatus'],
    priority: 'critical',
    defaultExpanded: true,
  },
  {
    id: 'schedule',
    title: '📅 Schedule',
    fields: ['gameStartDateTime', 'gameEndDateTime', 'gameFrequency'],
    priority: 'critical',
    defaultExpanded: true,
  },
  {
    id: 'buyin',
    title: '💰 Buy-In & Costs',
    fields: ['buyIn', 'rake', 'venueFee', 'startingStack'],
    priority: 'important',
    defaultExpanded: true,
  },
  {
    id: 'guarantee',
    title: '🎁 Guarantee',
    fields: ['hasGuarantee', 'guaranteeAmount'],
    priority: 'important',
    defaultExpanded: false,
    showWhen: (data) => data.hasGuarantee === true || (data.guaranteeAmount ?? 0) > 0,
  },
  {
    id: 'entries',
    title: '👥 Entries & Players',
    fields: ['totalUniquePlayers', 'totalInitialEntries', 'totalEntries', 'totalRebuys', 'totalAddons'],
    priority: 'important',
    defaultExpanded: false,
  },
  {
    id: 'prizepool',
    title: '🏆 Prizepool',
    fields: ['prizepoolPaid', 'prizepoolCalculated'],
    priority: 'important',
    defaultExpanded: false,
  },
  {
    id: 'recurring',
    title: '🔄 Recurring Game',
    fields: ['recurringGameId', 'recurringGameAssignmentStatus', 'deviationNotes'],
    priority: 'standard',
    defaultExpanded: false,
    showWhen: (data) => !!data.recurringGameId,
  },
  {
    id: 'series',
    title: '📚 Series Details',
    fields: ['isSeries', 'seriesName', 'tournamentSeriesId', 'isMainEvent', 'eventNumber', 'dayNumber', 'flightLetter', 'finalDay'],
    priority: 'standard',
    defaultExpanded: false,
    showWhen: (data) => data.isSeries === true,
  },
  {
    id: 'classification',
    title: '🏷️ Classification',
    fields: ['isRegular', 'isSatellite', 'gameTags'],
    priority: 'optional',
    defaultExpanded: false,
  },
  {
    id: 'live',
    title: '📺 Live Game Data',
    fields: ['playersRemaining', 'totalChipsInPlay', 'averagePlayerStack'],
    priority: 'optional',
    defaultExpanded: false,
    showWhen: (data) => data.gameStatus === 'RUNNING',
  },
  {
    id: 'financial',
    title: '💼 Calculated Financials',
    fields: [
      'totalBuyInsCollected', 
      'rakeRevenue',
      'prizepoolPlayerContributions',
      'prizepoolAddedValue',
      'prizepoolSurplus',
      'guaranteeOverlayCost', 
      'gameProfit'
    ],
    priority: 'optional',
    defaultExpanded: false,
  },
  {
    id: 'source',
    title: '🔧 Source & System',
    fields: ['tournamentId', 'doNotScrape', 's3Key'],
    priority: 'optional',
    defaultExpanded: false,
    showInModes: ['edit', 'confirm'],
  },
];

// ===================================================================
// VALIDATION TYPES
// ===================================================================

export interface ValidationStatus {
  isValid: boolean;
  canSave: boolean;
  required: {
    total: number;
    present: number;
    missing: string[];
  };
  optional: {
    total: number;
    present: number;
    missing: string[];
  };
  errors: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
  criticalMissing: string[];
  calculatedFields: { field: string; value: any }[];
  profile: string;
}

export interface EditHistory {
  field: keyof GameData;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

export interface ChangesSummary {
  totalChanges: number;
  addedFields: string[];
  removedFields: string[];
  modifiedFields: string[];
}

// ===================================================================
// HOOK RETURN TYPE
// ===================================================================

export interface UseGameDataEditorReturn {
  // Mode & Config
  mode: GameEditorMode;
  step: GameEditorStep;
  
  // Data
  editedData: GameData;
  originalData: GameData;
  hasChanges: boolean;
  changeHistory: EditHistory[];
  changes: ChangesSummary;
  
  // Validation
  validationStatus: ValidationStatus;
  isValid: boolean;
  canSave: boolean;
  
  // Field Operations
  updateField: (field: keyof GameData, value: any) => void;
  updateMultipleFields: (updates: Partial<GameData>) => void;
  resetField: (field: keyof GameData) => void;
  resetAllChanges: () => void;
  applyTemplate: (template: Partial<GameData>) => void;
  
  // Field Status Helpers
  getFieldStatus: (field: keyof GameData) => 'present' | 'missing' | 'changed' | 'invalid';
  getFieldValidation: (field: keyof GameData) => { required: boolean; valid: boolean; message?: string };
  getChangedFields: () => (keyof GameData)[];
  
  // UI State
  expandedGroups: Set<string>;
  toggleGroup: (groupId: string) => void;
  getVisibleFieldGroups: () => FieldGroupConfig[];
  
  // Step Navigation
  setStep: (step: GameEditorStep) => void;
  goToForm: () => void;
  goToPreview: () => void;
  
  // Save Helpers
  prepareSavePayload: () => { 
    data: GameData; 
    source: GameEditorConfig['dataSource'] | {
      type: 'MANUAL';
      sourceId: string;
      entityId: string;
      fetchedAt: string;
      wasEdited: boolean;
    }; 
    auditTrail?: string;
  };
  
  // Save State (managed externally, but helpers provided)
  recalculateDerived: () => void;
}

// ===================================================================
// MAIN HOOK
// ===================================================================

export const useGameDataEditor = (
  initialData: GameData | Partial<GameData>,
  config?: Partial<GameEditorConfig>
): UseGameDataEditorReturn => {
  
  // Determine mode - default to 'edit' for backward compatibility
  const mode: GameEditorMode = config?.mode || 'edit';
  
  // Build full initial data based on mode
  const fullInitialData = useMemo((): GameData => {
    if (mode === 'create') {
      return {
        ...DEFAULT_GAME_VALUES,
        ...getDefaultDataForMode(mode, config as GameEditorConfig),
        ...initialData,
      } as GameData;
    }
    return initialData as GameData;
  }, [initialData, mode, config]);
  
  // Core state
  const [editedData, setEditedData] = useState<GameData>(fullInitialData);
  const [originalData] = useState<GameData>(
    mode === 'create' ? ({} as GameData) : fullInitialData
  );
  const [changeHistory, setChangeHistory] = useState<EditHistory[]>([]);
  const [step, setStep] = useState<GameEditorStep>('form');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    return new Set(FIELD_GROUPS.filter(g => g.defaultExpanded).map(g => g.id));
  });

  // Game profile for conditional validation
  const gameProfile = useMemo(() => {
    return `STATUS: ${editedData.gameStatus || 'UNKNOWN'} | REG: ${editedData.registrationStatus || 'UNKNOWN'}`;
  }, [editedData.gameStatus, editedData.registrationStatus]);

  // ===================================================================
  // VALIDATION
  // ===================================================================
  
  const validationStatus = useMemo((): ValidationStatus => {
    const required = { total: 0, present: 0, missing: [] as string[] };
    const optional = { total: 0, present: 0, missing: [] as string[] };
    const criticalMissing: string[] = [];
    const errors: { field: string; message: string }[] = [];
    const warnings: { field: string; message: string }[] = [];

    const criticalFields = ['name', 'gameStatus', 'registrationStatus', 'tournamentId'];

    // Check field manifest
    for (const [key, definition] of Object.entries(fieldManifest)) {
      const value = editedData[key as keyof GameData];
      const hasValue = value !== undefined && value !== null && value !== '';
      
      const def = definition as any;
      
      const isBaselineRequired = def.isBaselineExpected;
      const isProfileRequired = def.isProfileExpected?.includes(gameProfile);
      const isRequired = isBaselineRequired || isProfileRequired;
      
      const isBaselineOptional = def.isBaselineOptional;
      const isProfileOptional = def.isProfileOptional?.includes(gameProfile);
      const isOptional = isBaselineOptional || isProfileOptional;

      if (isRequired) {
        required.total++;
        if (hasValue) {
          required.present++;
        } else {
          required.missing.push(key);
          if (criticalFields.includes(key)) {
            criticalMissing.push(key);
          }
        }
      } else if (isOptional) {
        optional.total++;
        if (hasValue) {
          optional.present++;
        } else {
          optional.missing.push(key);
        }
      }
    }

    // Business rule validations
    if (editedData.gameStatus === 'FINISHED' && (!editedData.results || editedData.results.length === 0)) {
      warnings.push({ field: 'results', message: 'Finished game should have results' });
    }
    
    if (editedData.buyIn && !editedData.rake) {
      warnings.push({ field: 'rake', message: 'Buy-in specified but rake is missing' });
    }

    if (editedData.guaranteeAmount && editedData.guaranteeAmount > 0 && !editedData.hasGuarantee) {
      warnings.push({ field: 'hasGuarantee', message: 'Guarantee amount specified but hasGuarantee is false' });
    }

    if (editedData.buyIn && editedData.rake && editedData.rake > editedData.buyIn) {
      warnings.push({ field: 'rake', message: 'Rake is greater than buy-in' });
    }

    // Required field errors
    if (!editedData.name || editedData.name.trim() === '') {
      errors.push({ field: 'name', message: 'Game name is required' });
    }
    
    if (!editedData.gameStartDateTime) {
      errors.push({ field: 'gameStartDateTime', message: 'Start date/time is required' });
    }

    // Calculate derived fields for preview
    const derived = calculateDerivedFields(editedData);
    const calculatedFields = Object.entries(derived)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([field, value]) => ({ field, value }));

    const isValid = errors.length === 0 && criticalMissing.length === 0;

    return {
      isValid,
      canSave: isValid,
      required,
      optional,
      errors,
      warnings,
      criticalMissing,
      calculatedFields,
      profile: gameProfile
    };
  }, [editedData, gameProfile]);

  // ===================================================================
  // CHANGES TRACKING
  // ===================================================================
  
  const changes = useMemo((): ChangesSummary => {
    const addedFields: string[] = [];
    const removedFields: string[] = [];
    const modifiedFields: string[] = [];
    
    const allKeys = new Set([
      ...Object.keys(originalData),
      ...Object.keys(editedData),
    ]);
    
    for (const key of allKeys) {
      const originalValue = originalData[key as keyof GameData];
      const editedValue = editedData[key as keyof GameData];
      
      const originalEmpty = originalValue === undefined || originalValue === null || originalValue === '';
      const editedEmpty = editedValue === undefined || editedValue === null || editedValue === '';
      
      if (JSON.stringify(originalValue) !== JSON.stringify(editedValue)) {
        if (originalEmpty && !editedEmpty) {
          addedFields.push(key);
        } else if (!originalEmpty && editedEmpty) {
          removedFields.push(key);
        } else {
          modifiedFields.push(key);
        }
      }
    }
    
    return {
      totalChanges: addedFields.length + removedFields.length + modifiedFields.length,
      addedFields,
      removedFields,
      modifiedFields,
    };
  }, [editedData, originalData]);

  const hasChanges = useMemo(() => changes.totalChanges > 0, [changes]);

  // ===================================================================
  // FIELD OPERATIONS
  // ===================================================================

  const updateField = useCallback((field: keyof GameData, value: any) => {
    setEditedData((prev: GameData) => {
      const oldValue = prev[field];
      
      // Record history
      setChangeHistory(history => [
        ...history,
        { field, oldValue, newValue: value, timestamp: Date.now() }
      ]);

      let updates: Partial<GameData> = { [field]: value };

      // Auto-calculate related fields
      if (['buyIn', 'rake', 'totalInitialEntries', 'totalRebuys', 'totalAddons', 'totalEntries'].includes(field)) {
        const buyIn = field === 'buyIn' ? value : prev.buyIn;
        const rake = field === 'rake' ? value : prev.rake;
        const totalInitialEntries = field === 'totalInitialEntries' ? value : prev.totalInitialEntries;
        const totalRebuys = field === 'totalRebuys' ? value : prev.totalRebuys;
        const totalAddons = field === 'totalAddons' ? value : prev.totalAddons;
        
        const entriesForRake = (totalInitialEntries || 0) + (totalRebuys || 0);
        const totalEntries = (totalInitialEntries || 0) + (totalRebuys || 0) + (totalAddons || 0);
        
        if (buyIn && totalEntries) {
          updates.totalBuyInsCollected = buyIn * totalEntries;
        }
        if (rake && entriesForRake) {
          updates.rakeRevenue = rake * entriesForRake;
        }
        if (field === 'totalInitialEntries' || field === 'totalRebuys' || field === 'totalAddons') {
          updates.totalEntries = totalEntries;
        }
      }

      // Auto-set hasGuarantee
      if (field === 'guaranteeAmount' && value > 0) {
        updates.hasGuarantee = true;
      }

      // Name-based auto-detection
      if (field === 'name' && typeof value === 'string') {
        const nameLower = value.toLowerCase();
        
        if (nameLower.includes('plo') || nameLower.includes('omaha')) {
          updates.gameVariant = 'PLO' as any;
        } else if (nameLower.includes('nlh') || nameLower.includes('holdem') || nameLower.includes("hold'em")) {
          updates.gameVariant = 'NLHE' as any;
        }
        
        if (nameLower.includes('satellite') || nameLower.includes('qualifier')) {
          updates.isSatellite = true;
        }
        
        if (nameLower.includes('series') || nameLower.includes('championship')) {
          updates.isSeries = true;
        }
      }

      return { ...prev, ...updates };
    });
  }, []);

  const updateMultipleFields = useCallback((updates: Partial<GameData>) => {
    Object.entries(updates).forEach(([field, value]) => {
      updateField(field as keyof GameData, value);
    });
  }, [updateField]);

  const resetField = useCallback((field: keyof GameData) => {
    updateField(field, originalData[field]);
  }, [originalData, updateField]);

  const resetAllChanges = useCallback(() => {
    setEditedData(mode === 'create' ? fullInitialData : originalData);
    setChangeHistory([]);
  }, [originalData, fullInitialData, mode]);

  const applyTemplate = useCallback((template: Partial<GameData>) => {
    updateMultipleFields(template);
  }, [updateMultipleFields]);

  const recalculateDerived = useCallback(() => {
    const derived = calculateDerivedFields(editedData);
    setEditedData(prev => ({ ...prev, ...derived }));
  }, [editedData]);

  // ===================================================================
  // FIELD STATUS HELPERS
  // ===================================================================

  const getFieldStatus = useCallback((field: keyof GameData): 'present' | 'missing' | 'changed' | 'invalid' => {
    const value = editedData[field];
    const originalValue = originalData[field];
    const hasValue = value !== undefined && value !== null && value !== '';
    
    const hasError = validationStatus.errors.some(e => e.field === field);
    if (hasError) return 'invalid';
    
    if (!hasValue) return 'missing';
    if (JSON.stringify(value) !== JSON.stringify(originalValue)) return 'changed';
    return 'present';
  }, [editedData, originalData, validationStatus.errors]);

  const getFieldValidation = useCallback((field: keyof GameData) => {
    const definition = fieldManifest[field as string] as any;
    if (!definition) return { required: false, valid: true };

    const value = editedData[field];
    const hasValue = value !== undefined && value !== null && value !== '';
    
    const isRequired = definition.isBaselineExpected || 
                      definition.isProfileExpected?.includes(gameProfile) || 
                      false;

    const error = validationStatus.errors.find(e => e.field === field);

    return {
      required: isRequired,
      valid: hasValue || !isRequired,
      message: error?.message
    };
  }, [editedData, gameProfile, validationStatus.errors]);

  const getChangedFields = useCallback((): (keyof GameData)[] => {
    return [...changes.addedFields, ...changes.modifiedFields, ...changes.removedFields] as (keyof GameData)[];
  }, [changes]);

  // ===================================================================
  // UI STATE
  // ===================================================================

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  }, []);

  const getVisibleFieldGroups = useCallback((): FieldGroupConfig[] => {
    return FIELD_GROUPS.filter(group => {
      if (group.showInModes && !group.showInModes.includes(mode)) {
        return false;
      }
      
      if (group.showWhen && !group.showWhen(editedData)) {
        const hasData = group.fields.some(field => {
          const value = editedData[field];
          return value !== undefined && value !== null && value !== '';
        });
        return group.defaultExpanded || hasData;
      }
      
      return true;
    });
  }, [mode, editedData]);

  // ===================================================================
  // NAVIGATION
  // ===================================================================

  const goToForm = useCallback(() => setStep('form'), []);
  
  const goToPreview = useCallback(() => {
    recalculateDerived();
    setStep('preview');
  }, [recalculateDerived]);

  // ===================================================================
  // SAVE PREPARATION
  // ===================================================================

  const prepareSavePayload = useCallback(() => {
    const { data } = prepareGameDataForSave(editedData);
    
    const source = config?.dataSource || {
      type: 'MANUAL' as const,
      sourceId: 'manual-entry',
      entityId: editedData.entityId || config?.entityId || '',
      fetchedAt: new Date().toISOString(),
      wasEdited: mode !== 'create',
    };
    
    let auditTrail: string | undefined;
    if (mode !== 'create' && changes.totalChanges > 0) {
      const trail = createAuditTrail(originalData, data);
      auditTrail = JSON.stringify(trail);
    }
    
    return { data, source, auditTrail };
  }, [editedData, originalData, changes, config, mode]);

  // ===================================================================
  // RETURN
  // ===================================================================

  return {
    // Mode & Config
    mode,
    step,
    
    // Data
    editedData,
    originalData,
    hasChanges,
    changeHistory,
    changes,
    
    // Validation
    validationStatus,
    isValid: validationStatus.isValid,
    canSave: validationStatus.canSave,
    
    // Field Operations
    updateField,
    updateMultipleFields,
    resetField,
    resetAllChanges,
    applyTemplate,
    
    // Field Status Helpers
    getFieldStatus,
    getFieldValidation,
    getChangedFields,
    
    // UI State
    expandedGroups,
    toggleGroup,
    getVisibleFieldGroups,
    
    // Navigation
    setStep,
    goToForm,
    goToPreview,
    
    // Save Helpers
    prepareSavePayload,
    recalculateDerived,
  };
};

export default useGameDataEditor;