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
    
    if (data.totalEntries && data.totalEntries > 0 && (!data.prizepoolPaid || data.prizepoolPaid === 0)) {
        warnings.push('Total entries specified but prizepoolPaid is missing or zero');
    }
    
    if (data.totalEntries && data.totalEntries > 0 && (!data.prizepoolCalculated || data.prizepoolCalculated === 0)) {
        warnings.push('Total entries specified but prizepoolCalculated is missing or zero');
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
    
    // ✅ Added venueFee validation
    if (correctedData.venueFee && correctedData.venueFee < 0) {
        correctedData.venueFee = 0;
        warnings.push('Venue fee was negative, set to 0');
    }

    if (correctedData.totalUniquePlayers && correctedData.totalUniquePlayers < 0) {
        correctedData.totalUniquePlayers = 0;
        warnings.push('Total unique players was negative, set to 0');
    }

    if (correctedData.totalEntries && correctedData.totalEntries < 0) {
        correctedData.totalEntries = 0;
        warnings.push('Total entries was negative, set to 0');
    }
    
    if (correctedData.prizepoolPaid && correctedData.prizepoolPaid < 0) {
        correctedData.prizepoolPaid = 0;
        warnings.push('prizepoolPaid was negative, set to 0');
    }
    
    if (correctedData.prizepoolCalculated && correctedData.prizepoolCalculated < 0) {
        correctedData.prizepoolCalculated = 0;
        warnings.push('prizepoolCalculated was negative, set to 0');
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
 * 
 * POKER TOURNAMENT ECONOMICS:
 * - Buy-in = Rake + Prizepool Contribution (per entry)
 * - Prizepool Contributions = (buyIn - rake) × totalEntries
 * - If guarantee exists, prizepool must be at least the guarantee amount
 * - Shortfall = guarantee - prizepool contributions (if positive)
 * - We cover shortfall first from intended rake, then from pocket (overlay)
 * 
 * Examples ($200 buy-in, $24 rake, $5000 guarantee):
 * - 20 entries: $3520 contributions, $1480 shortfall, -$1000 profit (loss)
 * - 25 entries: $4400 contributions, $600 shortfall, $0 profit (broke even)
 * - 27 entries: $4752 contributions, $248 shortfall, $400 profit (partial rake)
 * - 30 entries: $5280 contributions, no shortfall, $720 profit (full rake)
 */
export const calculateDerivedFields = (data: GameData): Partial<GameData> => {
    const derived: Partial<GameData> = {};
    
    const buyIn = data.buyIn || 0;
    const rake = data.rake || 0;
    const totalEntries = data.totalEntries || 0;
    const totalAddons = data.totalAddons || 0;
    const totalRebuys = data.totalRebuys || 0;
    const guaranteeAmount = data.guaranteeAmount || 0;
    const hasGuarantee = data.hasGuarantee && guaranteeAmount > 0;
    
    // Entries that pay rake (initial entries + rebuys, NOT addons)
    // Addons typically go straight to prizepool without rake
    const entriesForRake = totalEntries + totalRebuys;
    
    // Calculate intended total rake
    const intendedTotalRake = rake * entriesForRake;
    derived.totalRake = intendedTotalRake;
    
    // Calculate total buy-ins collected (all entries including addons)
    const totalBuyIns = buyIn * (totalEntries + totalRebuys + totalAddons);
    derived.buyInsByTotalEntries = totalBuyIns;
    
    // Calculate prizepool contributions
    // Entries/rebuys contribute (buyIn - rake), addons contribute full buyIn
    const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
    const prizepoolFromAddons = buyIn * totalAddons;
    const totalPrizepoolContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
    
    // Initialize profit/loss and rake realization flag
    let gameProfitLoss = intendedTotalRake;
    let totalRakePerPlayerRealised = true;
    
    if (hasGuarantee) {
        // Calculate shortfall: how much we need to dip into rake to cover guarantee
        const shortfall = Math.max(0, guaranteeAmount - totalPrizepoolContributions);
        
        if (shortfall > 0) {
            // We need to use some/all rake (and possibly pocket money) to cover guarantee
            // Profit = intendedRake - shortfall (can be negative if shortfall > rake)
            gameProfitLoss = intendedTotalRake - shortfall;
            totalRakePerPlayerRealised = false;
        }
        // else: No shortfall, we keep full rake, totalRakePerPlayerRealised stays true
        
        // Calculate overlay (out-of-pocket cost) and surplus
        if (totalBuyIns < guaranteeAmount) {
            // Total buy-ins don't cover guarantee - we have out-of-pocket overlay
            derived.guaranteeOverlay = guaranteeAmount - totalBuyIns;
            derived.guaranteeSurplus = null;
        } else if (totalPrizepoolContributions > guaranteeAmount) {
            // Prizepool contributions exceeded guarantee - surplus goes to players
            derived.guaranteeOverlay = null;
            derived.guaranteeSurplus = totalPrizepoolContributions - guaranteeAmount;
        } else {
            // Met guarantee using some/all rake, no out-of-pocket cost
            derived.guaranteeOverlay = 0;
            derived.guaranteeSurplus = 0;
        }
    } else {
        // No guarantee - we always get full rake
        derived.guaranteeOverlay = null;
        derived.guaranteeSurplus = null;
        // gameProfitLoss stays as intendedTotalRake
        // totalRakePerPlayerRealised stays true
    }
    
    derived.gameProfitLoss = gameProfitLoss;
    derived.totalRakePerPlayerRealised = totalRakePerPlayerRealised;
    
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