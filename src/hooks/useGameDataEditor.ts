// src/hooks/useGameDataEditor.ts
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import { useState, useCallback, useMemo } from 'react';
import type { GameData } from '../types/game';
import { fieldManifest } from '../lib/fieldManifest';

export interface ValidationStatus {
    isValid: boolean;
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
    criticalMissing: string[];
    warnings: string[];
    profile: string;
}

export interface EditHistory {
    field: keyof GameData;
    oldValue: any;
    newValue: any;
    timestamp: number;
}

export interface UseGameDataEditorReturn {
    editedData: GameData;
    originalData: GameData;
    hasChanges: boolean;
    changeHistory: EditHistory[];
    validationStatus: ValidationStatus;
    updateField: (field: keyof GameData, value: any) => void;
    updateMultipleFields: (updates: Partial<GameData>) => void;
    resetField: (field: keyof GameData) => void;
    resetAllChanges: () => void;
    applyTemplate: (template: Partial<GameData>) => void;
    getFieldStatus: (field: keyof GameData) => 'present' | 'missing' | 'changed' | 'invalid';
    getFieldValidation: (field: keyof GameData) => { required: boolean; valid: boolean; message?: string };
    getChangedFields: () => (keyof GameData)[];
}

export const useGameDataEditor = (initialData: GameData): UseGameDataEditorReturn => {
    const [editedData, setEditedData] = useState<GameData>(initialData);
    const [originalData] = useState<GameData>(initialData);
    const [changeHistory, setChangeHistory] = useState<EditHistory[]>([]);

    const gameProfile = useMemo(() => {
        return `STATUS: ${editedData.gameStatus || 'UNKNOWN'} | REG: ${editedData.registrationStatus || 'UNKNOWN'}`;
    }, [editedData.gameStatus, editedData.registrationStatus]);

    const validationStatus = useMemo((): ValidationStatus => {
        const required = { total: 0, present: 0, missing: [] as string[] };
        const optional = { total: 0, present: 0, missing: [] as string[] };
        const criticalMissing: string[] = [];
        const warnings: string[] = [];

        const criticalFields = ['name', 'gameStatus', 'registrationStatus', 'tournamentId'];

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

        if (editedData.gameStatus === 'FINISHED' && (!editedData.results || editedData.results.length === 0)) {
            warnings.push('Finished game should have results');
        }
        
        if (editedData.buyIn && !editedData.rake) {
            warnings.push('Buy-in specified but rake is missing');
        }

        if (editedData.guaranteeAmount && editedData.guaranteeAmount > 0 && !editedData.hasGuarantee) {
            warnings.push('Guarantee amount specified but hasGuarantee is false');
        }

        const isValid = criticalMissing.length === 0 && required.missing.length === 0;

        return {
            isValid,
            required,
            optional,
            criticalMissing,
            warnings,
            profile: gameProfile
        };
    }, [editedData, gameProfile]);

    const updateField = useCallback((field: keyof GameData, value: any) => {
        setEditedData((prev: GameData) => {
            const oldValue = prev[field];
            
            setChangeHistory(history => [
                ...history,
                {
                    field,
                    oldValue,
                    newValue: value,
                    timestamp: Date.now()
                }
            ]);

            let updates: Partial<GameData> = { [field]: value };

            // Auto-calculate related fields (simplified model)
            // Note: rakeRevenue = rake × (totalInitialEntries + totalRebuys)
            // Addons don't pay rake - they go 100% to prizepool
            if (field === 'buyIn' || field === 'rake' || field === 'totalInitialEntries' || 
                field === 'totalRebuys' || field === 'totalAddons' || field === 'totalEntries') {
                const buyIn = field === 'buyIn' ? value : prev.buyIn;
                const rake = field === 'rake' ? value : prev.rake;
                const totalInitialEntries = field === 'totalInitialEntries' ? value : prev.totalInitialEntries;
                const totalRebuys = field === 'totalRebuys' ? value : prev.totalRebuys;
                const totalAddons = field === 'totalAddons' ? value : prev.totalAddons;
                
                // Calculate entriesForRake (initial + rebuys, NOT addons)
                const entriesForRake = (totalInitialEntries || 0) + (totalRebuys || 0);
                const totalEntries = (totalInitialEntries || 0) + (totalRebuys || 0) + (totalAddons || 0);
                
                if (buyIn && totalEntries) {
                    updates.totalBuyInsCollected = buyIn * totalEntries;
                }
                if (rake && entriesForRake) {
                    updates.rakeRevenue = rake * entriesForRake;
                }
                // Also update totalEntries if components changed
                if (field === 'totalInitialEntries' || field === 'totalRebuys' || field === 'totalAddons') {
                    updates.totalEntries = totalEntries;
                }
            }

            if (field === 'guaranteeAmount' && value > 0) {
                updates.hasGuarantee = true;
            }

            if (field === 'name') {
                const nameLower = (value as string).toLowerCase();
                if (nameLower.includes('plo') || nameLower.includes('omaha')) {
                    updates.gameVariant = 'PLO' as any;
                } else if (nameLower.includes('nlh') || nameLower.includes('holdem')) {
                    updates.gameVariant = 'NLH' as any;
                }
                
                if (nameLower.includes('series') || nameLower.includes('championship')) {
                    updates.isSeries = true;
                }
                
                if (nameLower.includes('satellite') || nameLower.includes('qualifier')) {
                    updates.isSatellite = true;
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
        setEditedData(originalData);
        setChangeHistory([]);
    }, [originalData]);

    const applyTemplate = useCallback((template: Partial<GameData>) => {
        updateMultipleFields(template);
    }, [updateMultipleFields]);

    const getFieldStatus = useCallback((field: keyof GameData): 'present' | 'missing' | 'changed' | 'invalid' => {
        const value = editedData[field];
        const originalValue = originalData[field];
        const hasValue = value !== undefined && value !== null && value !== '';
        
        if (!hasValue) return 'missing';
        if (JSON.stringify(value) !== JSON.stringify(originalValue)) return 'changed';
        return 'present';
    }, [editedData, originalData]);

    const getFieldValidation = useCallback((field: keyof GameData) => {
        const definition = fieldManifest[field as string] as any;
        if (!definition) return { required: false, valid: true };

        const value = editedData[field];
        const hasValue = value !== undefined && value !== null && value !== '';
        
        const isRequired = definition.isBaselineExpected || 
                          definition.isProfileExpected?.includes(gameProfile) || 
                          false;

        let valid = true;
        let message: string | undefined;

        if (field === 'gameStartDateTime' && hasValue) {
            const date = new Date(value as string);
            if (isNaN(date.getTime())) {
                valid = false;
                message = 'Invalid date format';
            }
        }

        if (field === 'buyIn' && hasValue && (value as number) < 0) {
            valid = false;
            message = 'Buy-in cannot be negative';
        }

        if (field === 'tournamentId' && hasValue && (value as number) <= 0) {
            valid = false;
            message = 'Tournament ID must be positive';
        }

        return {
            required: isRequired,
            valid: hasValue ? valid : !isRequired,
            message
        };
    }, [editedData, gameProfile]);

    const getChangedFields = useCallback((): (keyof GameData)[] => {
        const changed: (keyof GameData)[] = [];
        for (const key in editedData) {
            const field = key as keyof GameData;
            if (JSON.stringify(editedData[field]) !== JSON.stringify(originalData[field])) {
                changed.push(field);
            }
        }
        return changed;
    }, [editedData, originalData]);

    const hasChanges = useMemo(() => {
        return getChangedFields().length > 0;
    }, [getChangedFields]);

    return {
        editedData,
        originalData,
        hasChanges,
        changeHistory,
        validationStatus,
        updateField,
        updateMultipleFields,
        resetField,
        resetAllChanges,
        applyTemplate,
        getFieldStatus,
        getFieldValidation,
        getChangedFields
    };
};