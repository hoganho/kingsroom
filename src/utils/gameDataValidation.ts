// src/utils/gameDataValidation.ts
// Validation utilities for edited game data from Enhanced SaveConfirmationModal

import type { GameData } from '../types/game';
import { GameStatus } from '../API';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    correctedData: GameData;
}

/**
 * Validate edited game data from the Enhanced SaveConfirmationModal
 */
export const validateEditedGameData = (data: GameData): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Required fields validation
    if (!data.name || data.name.trim() === '') {
        errors.push('Game name is required');
    }
    
    if (!data.gameStatus) {
        errors.push('Game status is required');
    }
    
    if (!data.tournamentId || data.tournamentId <= 0) {
        errors.push('Valid tournament ID is required (must be positive)');
    }
    
    if (!data.registrationStatus) {
        errors.push('Registration status is required');
    }
    
    // Logical validations that generate warnings
    if (data.guaranteeAmount && data.guaranteeAmount > 0 && !data.hasGuarantee) {
        warnings.push('Guarantee amount is set but hasGuarantee is false - auto-correcting');
    }
    
    if (data.gameStatus === GameStatus.FINISHED) {
        if (!data.gameEndDateTime) {
            warnings.push('Finished game should have an end date/time');
        }
        if (!data.results || data.results.length === 0) {
            warnings.push('Finished game should have player results');
        }
    }
    
    if (data.gameStatus === GameStatus.RUNNING && (!data.playersRemaining || data.playersRemaining === 0)) {
        warnings.push('Running game should have players remaining count');
    }
    
    if (data.buyIn && data.buyIn > 0 && (!data.rake || data.rake === 0)) {
        warnings.push('Buy-in specified but rake is missing or zero');
    }
    
    if (data.totalEntries && data.totalEntries > 0 && (!data.prizepool || data.prizepool === 0)) {
        warnings.push('Total entries specified but prizepool is missing or zero');
    }
    
    // Date validations
    if (data.gameStartDateTime && data.gameEndDateTime) {
        const startDate = new Date(data.gameStartDateTime);
        const endDate = new Date(data.gameEndDateTime);
        
        if (endDate < startDate) {
            errors.push('End date cannot be before start date');
        }
    }
    
    // Auto-corrections (create a corrected copy)
    const correctedData = { ...data };
    
    // Ensure non-negative numeric values
    if (correctedData.buyIn && correctedData.buyIn < 0) {
        correctedData.buyIn = 0;
        warnings.push('Buy-in was negative, set to 0');
    }
    
    if (correctedData.rake && correctedData.rake < 0) {
        correctedData.rake = 0;
        warnings.push('Rake was negative, set to 0');
    }
    
    if (correctedData.totalEntries && correctedData.totalEntries < 0) {
        correctedData.totalEntries = 0;
        warnings.push('Total entries was negative, set to 0');
    }
    
    if (correctedData.prizepool && correctedData.prizepool < 0) {
        correctedData.prizepool = 0;
        warnings.push('Prizepool was negative, set to 0');
    }
    
    if (correctedData.guaranteeAmount && correctedData.guaranteeAmount < 0) {
        correctedData.guaranteeAmount = 0;
        warnings.push('Guarantee amount was negative, set to 0');
    }
    
    // Auto-fix guarantee flag
    if (correctedData.guaranteeAmount && correctedData.guaranteeAmount > 0) {
        correctedData.hasGuarantee = true;
    }
    
    // Validate and fix levels
    if (correctedData.levels && correctedData.levels.length > 0) {
        correctedData.levels = correctedData.levels.map(level => ({
            ...level,
            levelNumber: Math.max(1, level.levelNumber),
            smallBlind: Math.max(0, level.smallBlind),
            bigBlind: Math.max(0, level.bigBlind),
            ante: level.ante ? Math.max(0, level.ante) : null,
            durationMinutes: Math.max(0, level.durationMinutes)
        }));
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        correctedData
    };
};

/**
 * Calculate derived fields from edited data
 */
export const calculateDerivedFields = (data: GameData): Partial<GameData> => {
    const derived: Partial<GameData> = {};
    
    // Calculate total rake
    if (data.rake && data.totalEntries) {
        derived.totalRake = data.rake * data.totalEntries;
    }
    
    // Calculate revenue by buy-ins
    if (data.buyIn && data.totalEntries) {
        derived.revenueByBuyIns = data.buyIn * data.totalEntries;
        
        // Add rebuys and addons if present
        if (data.totalRebuys) {
            derived.revenueByBuyIns += data.buyIn * data.totalRebuys;
        }
        if (data.totalAddons) {
            derived.revenueByBuyIns += data.buyIn * data.totalAddons;
        }
    }
    
    // Calculate guarantee overlay/surplus
    if (data.hasGuarantee && data.guaranteeAmount) {
        const actualPrizepool = data.prizepool || 0;
        
        if (actualPrizepool < data.guaranteeAmount) {
            derived.guaranteeOverlay = data.guaranteeAmount - actualPrizepool;
            derived.guaranteeSurplus = null;
        } else {
            derived.guaranteeOverlay = null;
            derived.guaranteeSurplus = actualPrizepool - data.guaranteeAmount;
        }
    }
    
    // Calculate profit/loss
    if (derived.revenueByBuyIns && derived.totalRake) {
        const totalRevenue = (derived.totalRake || 0);
        const overlay = derived.guaranteeOverlay || 0;
        derived.profitLoss = totalRevenue - overlay;
    }
    
    // Calculate average stack if not provided
    if (!data.averagePlayerStack && data.totalChipsInPlay && data.playersRemaining) {
        derived.averagePlayerStack = data.totalChipsInPlay / data.playersRemaining;
    }
    
    return derived;
};

/**
 * Detect which fields were changed compared to original
 */
export const detectChangedFields = (original: GameData, edited: GameData): string[] => {
    const changedFields: string[] = [];
    
    for (const key in edited) {
        const field = key as keyof GameData;
        const originalValue = JSON.stringify(original[field]);
        const editedValue = JSON.stringify(edited[field]);
        
        if (originalValue !== editedValue) {
            changedFields.push(field);
        }
    }
    
    return changedFields;
};

/**
 * Create audit trail entry for edited data
 */
export const createAuditTrail = (
    original: GameData,
    edited: GameData,
    userId?: string
): any => {
    const changedFields = detectChangedFields(original, edited);
    const changes: Record<string, { from: any; to: any }> = {};
    
    changedFields.forEach(field => {
        changes[field] = {
            from: original[field as keyof GameData],
            to: edited[field as keyof GameData]
        };
    });
    
    return {
        editedAt: new Date().toISOString(),
        editedBy: userId || 'manual_edit',
        changedFields,
        changes,
        source: 'enhanced_save_modal',
        version: '1.0.0'
    };
};

/**
 * Prepare game data for saving (with validation and corrections)
 */
export const prepareGameDataForSave = (
    data: GameData,
    original?: GameData,
    userId?: string
): {
    validatedData: GameData;
    derivedFields: Partial<GameData>;
    auditTrail?: any;
    validation: ValidationResult;
} => {
    // Validate the data
    const validation = validateEditedGameData(data);
    
    // Calculate derived fields from the corrected data
    const derivedFields = calculateDerivedFields(validation.correctedData);
    
    // Merge derived fields into the corrected data
    const validatedData = {
        ...validation.correctedData,
        ...derivedFields
    };
    
    // Create audit trail if we have original data
    const auditTrail = original ? createAuditTrail(original, validatedData, userId) : undefined;
    
    return {
        validatedData,
        derivedFields,
        auditTrail,
        validation
    };
};