// utils/gameDataValidation.ts
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import type { GameData, TournamentLevelData } from '../types/game';

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    correctedData: GameData;
}

/**
 * Validate required fields for a game
 */
export const validateRequiredFields = (data: GameData): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.name || data.name.trim() === '') {
        errors.push('Game name is required');
    }

    if (!data.gameStartDateTime) {
        errors.push('Game start date/time is required');
    }

    if (!data.gameStatus) {
        warnings.push('Game status not set, defaulting to SCHEDULED');
    }

    if (data.buyIn !== undefined && data.buyIn !== null && data.buyIn < 0) {
        errors.push('Buy-in cannot be negative');
    }

    if (data.rake !== undefined && data.rake !== null && data.rake < 0) {
        errors.push('Rake cannot be negative');
    }

    if (data.totalEntries !== undefined && data.totalEntries !== null && data.totalEntries < 0) {
        errors.push('Total entries cannot be negative');
    }

    if (data.buyIn && data.rake && data.rake > data.buyIn) {
        warnings.push('Rake is greater than buy-in - please verify');
    }

    if (data.hasGuarantee && (!data.guaranteeAmount || data.guaranteeAmount <= 0)) {
        warnings.push('Game has guarantee flag but no guarantee amount set');
    }

    return { errors, warnings };
};

/**
 * Validate tournament levels structure
 */
export const validateLevels = (levels: TournamentLevelData[] | undefined): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!levels || levels.length === 0) {
        return { errors, warnings };
    }

    const levelNumbers = levels.map(l => l.levelNumber);
    const uniqueNumbers = new Set(levelNumbers);
    if (uniqueNumbers.size !== levelNumbers.length) {
        warnings.push('Duplicate level numbers detected');
    }

    let prevBigBlind = 0;
    for (const level of levels.sort((a, b) => a.levelNumber - b.levelNumber)) {
        if (level.bigBlind < prevBigBlind) {
            warnings.push(`Level ${level.levelNumber} has lower big blind than previous level`);
        }
        prevBigBlind = level.bigBlind;

        if (level.smallBlind >= level.bigBlind) {
            warnings.push(`Level ${level.levelNumber}: small blind should be less than big blind`);
        }
    }

    return { errors, warnings };
};

/**
 * Auto-correct common data issues
 */
export const autoCorrectData = (data: GameData): { correctedData: GameData; corrections: string[] } => {
    const corrections: string[] = [];
    const correctedData = { ...data };

    if (typeof correctedData.buyIn === 'string') {
        correctedData.buyIn = parseFloat(correctedData.buyIn) || 0;
        corrections.push('Converted buyIn from string to number');
    }

    if (typeof correctedData.rake === 'string') {
        correctedData.rake = parseFloat(correctedData.rake) || 0;
        corrections.push('Converted rake from string to number');
    }

    if (typeof correctedData.totalEntries === 'string') {
        correctedData.totalEntries = parseInt(correctedData.totalEntries) || 0;
        corrections.push('Converted totalEntries from string to number');
    }

    if (!correctedData.gameStatus) {
        correctedData.gameStatus = 'SCHEDULED' as any;
        corrections.push('Set default game status to SCHEDULED');
    }

    if (correctedData.guaranteeAmount && correctedData.guaranteeAmount > 0 && !correctedData.hasGuarantee) {
        correctedData.hasGuarantee = true;
        corrections.push('Set hasGuarantee to true based on guaranteeAmount');
    }

    return { correctedData, corrections };
};

/**
 * Validate edited game data before saving
 */
export const validateEditedGameData = (data: GameData): ValidationResult => {
    const { correctedData, corrections } = autoCorrectData(data);
    const { errors: requiredErrors, warnings: requiredWarnings } = validateRequiredFields(correctedData);
    const { errors: levelErrors, warnings: levelWarnings } = validateLevels(correctedData.levels);
    
    const errors = [...requiredErrors, ...levelErrors];
    const warnings = [...requiredWarnings, ...levelWarnings];
    
    if (corrections.length > 0) {
        warnings.push(`Auto-corrected: ${corrections.join(', ')}`);
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        correctedData
    };
};

/**
 * Calculate derived financial fields based on game data
 * SIMPLIFIED MODEL:
 *   Revenue: rakeRevenue = rake × entriesForRake
 *   Cost: guaranteeOverlayCost = max(0, guarantee - playerContributions)
 *   Profit: gameProfit = rakeRevenue - guaranteeOverlayCost
 */
export const calculateDerivedFields = (data: GameData): Partial<GameData> => {
    const derived: Partial<GameData> = {};
    
    const buyIn = data.buyIn || 0;
    const rake = data.rake || 0;
    const totalInitialEntries = data.totalInitialEntries || 0;
    const totalRebuys = data.totalRebuys || 0;
    const totalAddons = data.totalAddons || 0;
    const guaranteeAmount = data.guaranteeAmount || 0;
    const hasGuarantee = data.hasGuarantee && guaranteeAmount > 0;
    
    // Derive totalEntries if not set
    const totalEntries = data.totalEntries || (totalInitialEntries + totalRebuys + totalAddons);
    derived.totalEntries = totalEntries;
    
    // Entries that pay rake (initial entries + rebuys, NOT addons)
    // Addons go 100% to prizepool - no rake on addons
    const entriesForRake = totalInitialEntries + totalRebuys;
    
    // REVENUE - What we collect
    const rakeRevenue = rake * entriesForRake;
    derived.rakeRevenue = rakeRevenue;
    
    // Total buy-ins collected (all money from players)
    const totalBuyInsCollected = buyIn * totalEntries;
    derived.totalBuyInsCollected = totalBuyInsCollected;
    
    // PRIZEPOOL - What players receive
    const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
    const prizepoolFromAddons = buyIn * totalAddons;
    const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
    derived.prizepoolPlayerContributions = prizepoolPlayerContributions;
    
    // GUARANTEE IMPACT
    let guaranteeOverlayCost = 0;
    let prizepoolSurplus: number | null = null;
    let prizepoolAddedValue = 0;
    
    if (hasGuarantee) {
        const shortfall = guaranteeAmount - prizepoolPlayerContributions;
        
        if (shortfall > 0) {
            guaranteeOverlayCost = shortfall;
            prizepoolAddedValue = shortfall;
            prizepoolSurplus = null;
        } else {
            prizepoolSurplus = -shortfall;
            prizepoolAddedValue = 0;
        }
    }
    
    derived.guaranteeOverlayCost = guaranteeOverlayCost;
    derived.prizepoolAddedValue = prizepoolAddedValue;
    derived.prizepoolSurplus = prizepoolSurplus;
    
    // PROFIT
    const gameProfit = rakeRevenue - guaranteeOverlayCost;
    derived.gameProfit = gameProfit;
    
    // Calculate prizepool if not set
    if (!data.prizepoolCalculated && prizepoolPlayerContributions > 0) {
        derived.prizepoolCalculated = prizepoolPlayerContributions + prizepoolAddedValue;
    }
    
    return derived;
};

/**
 * Prepare game data for saving
 */
export const prepareGameDataForSave = (data: GameData): {
    data: GameData;
    warnings: string[];
    validation: ValidationResult;
} => {
    const validation = validateEditedGameData(data);
    const derivedFields = calculateDerivedFields(validation.correctedData);
    
    const validatedData = {
        ...validation.correctedData,
        ...derivedFields
    };
    
    return {
        data: validatedData,
        warnings: validation.warnings,
        validation
    };
};

/**
 * Create audit trail for changes between original and edited data
 */
export const createAuditTrail = (
    original: GameData,
    edited: GameData
): {
    changedFields: string[];
    changes: Record<string, { from: any; to: any }>;
    reason: string;
} => {
    const changedFields: string[] = [];
    const changes: Record<string, { from: any; to: any }> = {};
    
    const fieldsToCheck: (keyof GameData)[] = [
        'name', 'gameStartDateTime', 'gameEndDateTime', 'gameStatus',
        'buyIn', 'rake', 'startingStack', 'hasGuarantee', 'guaranteeAmount',
        'totalInitialEntries', 'totalEntries', 'totalRebuys', 'totalAddons', 'totalUniquePlayers',
        'prizepoolPaid', 'prizepoolCalculated', 'tournamentType',
        'isSeries', 'seriesName', 'venueFee'
    ];
    
    for (const field of fieldsToCheck) {
        const originalValue = original[field];
        const editedValue = edited[field];
        
        if (JSON.stringify(originalValue) !== JSON.stringify(editedValue)) {
            changedFields.push(field);
            changes[field] = {
                from: originalValue,
                to: editedValue
            };
        }
    }
    
    return {
        changedFields,
        changes,
        reason: 'manual_edit'
    };
};