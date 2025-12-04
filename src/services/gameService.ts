// services/gameService.ts
// UPDATED: Added scraperApiKey parameter support
// UPDATED: Added venueFee support in saveGameInput

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData } from '../graphql/mutations';
import { fetchTournamentDataRange, listEntities } from '../graphql/queries';
import type { GameData } from '../types/game';
import type { Entity } from '../API';
import { 
    prepareGameDataForSave,
    validateEditedGameData,
    calculateDerivedFields,
    createAuditTrail
} from '../utils/gameDataValidation';
import { 
    ScrapedGameData, 
    DataSource,
    GameType,
    GameVariant,
    GameStatus,
    RegistrationStatus,
    GameFrequency,
    TournamentType,
    SaveGameResult
} from '../API';

// Default entity ID - should be fetched from Entity table or configured
const DEFAULT_ENTITY_ID = '42101695-1332-48e3-963b-3c6ad4e909a0';

// GraphQL mutation for saving game data via saveGameFunction
const saveGameMutation = /* GraphQL */ `
    mutation SaveGame($input: SaveGameInput!) {
        saveGame(input: $input) {
            success
            gameId
            action
            message
            warnings
            playerProcessingQueued
            playerProcessingReason
            venueAssignment {
                venueId
                venueName
                status
                confidence
            }
            fieldsUpdated
        }
    }
`;

/**
 * Get the current active entity from local storage or use default
 */
export const getCurrentEntityId = (): string => {
    const storedEntityId = localStorage.getItem('currentEntityId');
    if (storedEntityId) {
        return storedEntityId;
    }
    return DEFAULT_ENTITY_ID;
};

/**
 * Set the current active entity ID
 */
export const setCurrentEntityId = (entityId: string): void => {
    localStorage.setItem('currentEntityId', entityId);
};

/**
 * Fetch all entities from the backend
 */
export const fetchEntities = async (): Promise<Entity[]> => {
    const client = generateClient();
    try {
        const response = await client.graphql({
            query: listEntities,
            variables: {
                limit: 100
            }
        }) as any;
        
        return response.data.listEntities.items.filter((item: any) => item !== null);
    } catch (error) {
        console.error('Error fetching entities:', error);
        throw error;
    }
};

// Helper function to map string values to enum types
const mapToGameType = (value: any): GameType | null => {
    if (!value) return null;
    const map: Record<string, GameType> = {
        'TOURNAMENT': GameType.TOURNAMENT,
        'CASH_GAME': GameType.CASH_GAME,
    };
    return map[value] || null;
};

const mapToGameVariant = (value: any): GameVariant | null => {
    if (!value) return null;
    const map: Record<string, GameVariant> = {
        'NLH': GameVariant.NLHE,
        'NLHE': GameVariant.NLHE,
        'PLO': GameVariant.PLOM,
        'PLOM': GameVariant.PLOM,
        'PLO5': GameVariant.PLO5,
        'PLO6': GameVariant.PLO6,
    };
    return map[value] || null;
};

const mapToGameStatus = (value: any): GameStatus | null => {
    if (!value) return null;
    return value as GameStatus;
};

const mapToRegistrationStatus = (value: any): RegistrationStatus | null => {
    if (!value) return null;
    return value as RegistrationStatus;
};

const mapToGameFrequency = (value: any): GameFrequency | null => {
    if (!value) return null;
    return value as GameFrequency;
};

const mapToTournamentType = (value: any): TournamentType | null => {
    if (!value) return null;
    return value as TournamentType;
};

/**
 * Create placeholder data for NOT_PUBLISHED games
 * These games need to be saved to track the tournament ID but have minimal actual data
 */
const createNotPublishedPlaceholder = (
    data: GameData | ScrapedGameData,
    sourceUrl: string,
    entityId: string
): GameData | ScrapedGameData => {
    // Build the placeholder object - we use 'any' cast because some fields
    // will be mapped to Game model fields by saveGameDataToBackend
    const placeholder: any = {
        ...data,
        // Required fields with placeholders
        name: data.name || `Tournament ${data.tournamentId} - Not Published`,
        gameType: data.gameType || 'TOURNAMENT',
        gameVariant: data.gameVariant || 'NLHE',
        gameStatus: 'NOT_PUBLISHED',
        gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
        registrationStatus: data.registrationStatus || 'N_A',
        
        // Tracking fields
        tournamentId: data.tournamentId,
        sourceUrl: sourceUrl,
        entityId: entityId,
        
        // Set defaults for numeric fields
        buyIn: data.buyIn || 0,
        rake: data.rake || 0,
        startingStack: data.startingStack || 0,
        prizepool: data.prizepool || 0,
        totalEntries: data.totalEntries || 0,
        totalRebuys: data.totalRebuys || 0,
        totalAddons: data.totalAddons || 0,
        guaranteeAmount: data.guaranteeAmount || 0,
        hasGuarantee: data.hasGuarantee || false,
        
        // Series not applicable
        isSeries: false,
    };
    
    return placeholder as GameData | ScrapedGameData;
};

// Extract player data for save input
const extractPlayersForSaveInput = (data: GameData | ScrapedGameData) => {
    const allPlayers: any[] = [];
    let totalPrizesPaid = 0;
    
    // Add results (players with rankings/winnings)
    if (data.results && data.results.length > 0) {
        data.results.forEach(r => {
            allPlayers.push({
                name: r.name,
                rank: r.rank || null,
                winnings: r.winnings || 0,
                points: r.points || null,
                isQualification: null,
                rebuys: null,
                addons: null
            });
            if (r.winnings) {
                totalPrizesPaid += r.winnings;
            }
        });
    }
    
    // Add entries (players without results yet) - avoid duplicates
    if (data.entries && data.entries.length > 0) {
        const existingNames = new Set(allPlayers.map(p => p.name.toLowerCase()));
        data.entries.forEach(e => {
            if (!existingNames.has(e.name.toLowerCase())) {
                allPlayers.push({
                    name: e.name,
                    rank: null,
                    winnings: null,
                    points: null,
                    isQualification: null,
                    rebuys: null,
                    addons: null
                });
            }
        });
    }
    
    // Add seating data - merge with existing or add new
    if (data.seating && data.seating.length > 0) {
        const existingNames = new Set(allPlayers.map(p => p.name.toLowerCase()));
        data.seating.forEach(s => {
            if (!existingNames.has(s.name.toLowerCase())) {
                allPlayers.push({
                    name: s.name,
                    rank: null,
                    winnings: null,
                    points: null,
                    isQualification: null,
                    rebuys: null,
                    addons: null
                });
            }
        });
    }
    
    // Determine hasCompleteResults - must be a boolean
    const hasResults = data.results && data.results.length > 0;
    const isFinished = data.gameStatus === 'FINISHED';
    
    return {
        allPlayers: allPlayers,  // Will be empty array [] for NOT_PUBLISHED games
        totalPlayers: data.totalEntries || allPlayers.length || 0,
        hasCompleteResults: Boolean(hasResults && isFinished),  // Required boolean
        totalPrizesPaid: totalPrizesPaid > 0 ? totalPrizesPaid : null,
        hasEntryList: Boolean(data.entries && data.entries.length > 0),  // Ensure boolean
        hasSeatingData: Boolean(data.seating && data.seating.length > 0)  // Ensure boolean
    };
};

// Get entity ID from URL (placeholder implementation)
const getEntityIdFromUrl = async (_url: string): Promise<string | null> => {
    // This should match your entity URL patterns
    // For now, return null and let it be set explicitly
    return null;
};

/**
 * Fetch game data from backend (single game)
 * ✅ UPDATED: Added scraperApiKey parameter
 */
export const fetchGameDataFromBackend = async (
    url: string,
    forceRefresh: boolean = false,
    scraperApiKey?: string
): Promise<ScrapedGameData> => {
    const client = generateClient();
    console.log(`[GameService] Fetching tournament data for ${url}...`, {
        forceRefresh,
        hasApiKey: !!scraperApiKey
    });
    
    try {
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: { 
                url, 
                forceRefresh,
                scraperApiKey: scraperApiKey || ''
            }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to fetch tournament data');
        }
        
        const data = response.data.fetchTournamentData;

        // 👇👇👇 ADD THIS DEBUG BLOCK 👇👇👇
        console.group(`[DEBUG] Fetch Result for ID: ${data?.tournamentId}`);
        console.log('1. Raw "source" field:', data?.source);
        console.log('2. Raw "s3Key" field:', data?.s3Key);
        console.log('3. All received keys:', Object.keys(data || {}));
        
        // Check if the fields are totally missing (undefined) or just empty strings
        if (data?.source === undefined) {
            console.error('❌ CRITICAL: "source" field is MISSING from GraphQL response. Check your query definition!');
        } else {
            console.log('✅ "source" field exists:', data.source);
        }
        console.groupEnd();
        // 👆👆👆 END DEBUG BLOCK 👆👆👆
        
        return data;
    } catch (error) {
        console.error('[GameService] Error fetching tournament data:', error);
        throw error;
    }
};

/**
 * Fetch multiple games in a range
 */
export const fetchGameDataRangeFromBackend = async (
    baseUrl: string,
    startId: number,
    endId: number
): Promise<any> => {
    const client = generateClient();
    console.log(`[GameService] Fetching range ${startId}-${endId} from ${baseUrl}`);
    
    try {
        const response = await client.graphql({
            query: fetchTournamentDataRange,
            variables: {
                startId,
                endId
            }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to fetch tournament data range');
        }
        
        return response.data.fetchTournamentDataRange;
    } catch (error) {
        console.error('[GameService] Error fetching tournament data range:', error);
        throw error;
    }
};

/**
 * Determine if a tournament should auto-refresh based on its status
 */
export const shouldAutoRefreshTournament = (gameStatus: string | null | undefined): boolean => {
    if (!gameStatus) return false;
    
    const autoRefreshStatuses = [
        'SCHEDULED',
        'REGISTERING', 
        'RUNNING',
        'INITIATING'
    ];
    
    return autoRefreshStatuses.includes(gameStatus);
};

/**
 * Enhanced save function that properly handles edited data from Enhanced SaveConfirmationModal
 */
export const saveGameDataToBackend = async (
    sourceUrl: string, 
    venueId: string | null | undefined, 
    data: GameData | ScrapedGameData,
    existingGameId: string | null | undefined,
    entityId?: string | null,
    options?: {
        wasEdited?: boolean;
        originalData?: GameData | ScrapedGameData;
        userId?: string;
        skipValidation?: boolean;
    }
): Promise<SaveGameResult> => {
    const client = generateClient();
    
    console.log(`[GameService] Saving ${data.gameStatus} tournament data for ${sourceUrl}...`, {
        wasEdited: options?.wasEdited,
        existingGameId
    });
    
    // Validate and prepare data if it was edited
    let finalData = data;
    let auditTrail = null;
    let validationWarnings: string[] = [];
    
    // Determine entity ID early for NOT_PUBLISHED placeholder
    const finalEntityId = entityId || (data as any).entityId || await getEntityIdFromUrl(sourceUrl) || getCurrentEntityId();
    
    // Handle NOT_PUBLISHED games - populate with placeholder values
    if (data.gameStatus === 'NOT_PUBLISHED') {
        console.log('[GameService] NOT_PUBLISHED game detected, applying placeholder values');
        finalData = createNotPublishedPlaceholder(data, sourceUrl, finalEntityId);
        
        // Skip validation for placeholder data
        options = { ...options, skipValidation: true };
    }
    
    if (options?.wasEdited && !options.skipValidation) {
        const preparation = prepareGameDataForSave(
            data as GameData,
            options.originalData as GameData,
            options.userId
        );
        
        // Check for validation errors
        if (!preparation.validation.isValid) {
            console.error('[GameService] Validation errors:', preparation.validation.errors);
            throw new Error(`Validation failed: ${preparation.validation.errors.join(', ')}`);
        }
        
        // Use validated and corrected data
        finalData = preparation.validatedData;
        auditTrail = preparation.auditTrail;
        validationWarnings = preparation.validation.warnings;
        
        console.log('[GameService] Data validated and corrected', {
            warnings: validationWarnings,
            changedFields: auditTrail?.changedFields
        });
    } else if (!options?.wasEdited && data.gameStatus !== 'NOT_PUBLISHED') {
        // For non-edited data (ScrapedGameData), don't calculate derived fields
        // to avoid type incompatibility issues
        finalData = data;
    }
    
    if (!finalEntityId) {
        console.warn('[GameService] No entity ID provided or detected, using default');
    }
    
    // Extract player data
    const playerData = extractPlayersForSaveInput(finalData);
    
    // Build SaveGameInput
    const saveGameInput = {
        source: {
            type: DataSource.SCRAPE,
            sourceId: sourceUrl,
            entityId: finalEntityId || getCurrentEntityId(),
            fetchedAt: new Date().toISOString(),
            contentHash: (finalData as any).contentHash || null,
            wasEdited: options?.wasEdited || false
        },
        game: {
            tournamentId: finalData.tournamentId || null,
            existingGameId: existingGameId || null,
            name: finalData.name || `Tournament ${finalData.tournamentId}`,
            gameType: mapToGameType(finalData.gameType) || GameType.TOURNAMENT,
            gameVariant: mapToGameVariant(finalData.gameVariant),
            gameStatus: mapToGameStatus(finalData.gameStatus),
            gameStartDateTime: finalData.gameStartDateTime || new Date().toISOString(),
            gameEndDateTime: finalData.gameEndDateTime || null,
            registrationStatus: mapToRegistrationStatus(finalData.registrationStatus),
            gameFrequency: mapToGameFrequency((finalData as any).gameFrequency),
            
            // Financial fields
            buyIn: finalData.buyIn || 0,
            rake: finalData.rake || 0,
            totalRake: (finalData as any).totalRake || 0,
            guaranteeAmount: finalData.guaranteeAmount || 0,
            hasGuarantee: finalData.hasGuarantee || false,
            guaranteeOverlay: (finalData as any).guaranteeOverlay || null,
            guaranteeSurplus: (finalData as any).guaranteeSurplus || null,
            
            // ✅ Venue fee (from Venue.fee, editable in SaveConfirmationModal)
            venueFee: (finalData as any).venueFee ?? null,
            
            // Game details
            startingStack: finalData.startingStack || 0,
            prizepool: finalData.prizepool || 0,
            totalEntries: finalData.totalEntries || 0,
            totalRebuys: finalData.totalRebuys || 0,
            totalAddons: finalData.totalAddons || 0,
            playersRemaining: (finalData as any).playersRemaining || null,
            totalChipsInPlay: (finalData as any).totalChipsInPlay || null,
            averagePlayerStack: (finalData as any).averagePlayerStack || null,
            
            // Tournament specifics
            tournamentType: mapToTournamentType(finalData.tournamentType),
            isSeries: (finalData as any).isSeries || false,
            seriesName: (finalData as any).seriesName || null,
            isSatellite: (finalData as any).isSatellite || false,
            isRegular: (finalData as any).isRegular || false,
            
            // Series reference fields
            tournamentSeriesId: (finalData as any).tournamentSeriesId || null,
            isMainEvent: (finalData as any).isMainEvent || false,
            eventNumber: (finalData as any).eventNumber || null,
            dayNumber: (finalData as any).dayNumber || null,
            flightLetter: (finalData as any).flightLetter || null,
            finalDay: (finalData as any).finalDay || false,
            
            // Other
            gameTags: finalData.gameTags?.filter((tag): tag is string => tag !== null) || [],
            totalDuration: (finalData as any).totalDuration || null,
            revenueByBuyIns: (finalData as any).revenueByBuyIns || null,
            profitLoss: (finalData as any).profitLoss || null
        },
        players: playerData,
        venue: {
            venueId: venueId || null,
            venueName: (finalData as any).venueName || null,
            suggestedVenueId: (finalData as any).venueMatch?.autoAssignedVenue?.id || null,
            confidence: (finalData as any).venueMatch?.autoAssignedVenue?.score || 0
        },
        series: (finalData as any).isSeries && (finalData as any).seriesName ? {
            seriesId: null,
            suggestedSeriesId: (finalData as any).seriesMatch?.seriesTitleId ||
                        (finalData as any).seriesTitleId || null,
            seriesName: (finalData as any).seriesName,
            year: (finalData as any).seriesYear || 
                new Date(finalData.gameStartDateTime || new Date()).getFullYear(),
            isMainEvent: (finalData as any).isMainEvent || false,
            eventNumber: (finalData as any).eventNumber || null,
            dayNumber: (finalData as any).dayNumber || null,
            flightLetter: (finalData as any).flightLetter || null,
            finalDay: (finalData as any).finalDay || false,
            confidence: (finalData as any).seriesMatch?.score || 0.8
        } : null,
        options: {
            skipPlayerProcessing: data.gameStatus === 'NOT_PUBLISHED' ? true : false,
            forceUpdate: !!existingGameId || options?.wasEdited,
            validateOnly: false,
            doNotScrape: (finalData as any).doNotScrape || false
        },
    };
    
    // Add levels if present
    if (finalData.levels && Array.isArray(finalData.levels) && finalData.levels.length > 0) {
        const validLevels = finalData.levels
            .filter((level: any) => level && level.levelNumber != null)
            .map((level: any) => ({
                levelNumber: parseInt(level.levelNumber) || 0,
                durationMinutes: parseInt(level.durationMinutes) || 0,
                smallBlind: parseInt(level.smallBlind) || 0,
                bigBlind: parseInt(level.bigBlind) || 0,
                ante: level.ante != null ? parseInt(level.ante) : null
            }));
        
        // Only add to input if we have valid levels
        if (validLevels.length > 0) {
            (saveGameInput.game as any).levels = JSON.stringify(validLevels);  // <-- STRINGIFY IT
        }
    }
    
    console.log('[GameService] Calling saveGame mutation with input:', {
        sourceUrl,
        venueId,
        gameStatus: saveGameInput.game.gameStatus,
        venueFee: saveGameInput.game.venueFee,  // ✅ Log venueFee
        playerCount: saveGameInput.players?.totalPlayers || 0,
        existingGameId,
        wasEdited: options?.wasEdited,
        changedFields: auditTrail?.changedFields,
        isNotPublished: data.gameStatus === 'NOT_PUBLISHED'
    });
    
    try {
        const response = await client.graphql({
            query: saveGameMutation,
            variables: { input: saveGameInput }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            console.error('[GameService] GraphQL errors:', response.errors);
            throw new Error(response.errors[0]?.message || 'Failed to save game data');
        }
        
        const result = response.data.saveGame as SaveGameResult;
        
        // Add validation warnings to result if any
        if (validationWarnings.length > 0) {
            result.warnings = [...(result.warnings || []), ...validationWarnings];
        }
        
        console.log('[GameService] Save result:', {
            success: result.success,
            action: result.action,
            gameId: result.gameId,
            playerProcessingQueued: result.playerProcessingQueued,
            warnings: result.warnings,
            fieldsUpdated: result.fieldsUpdated
        });
        
        if (!result.success) {
            throw new Error(result.message || 'Save operation failed');
        }
        
        return result;
    } catch (error) {
        console.error('[GameService] Error saving game data:', error);
        throw error;
    }
};

/**
 * Validate game data without saving (for preview)
 */
export const validateGameData = (data: GameData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    correctedData: GameData;
    derivedFields: Partial<GameData>;
} => {
    const validation = validateEditedGameData(data);
    const derivedFields = calculateDerivedFields(validation.correctedData);
    
    return {
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings,
        correctedData: {
            ...validation.correctedData,
            ...derivedFields
        },
        derivedFields
    };
};

/**
 * Get change summary between original and edited data
 */
export const getChangeSummary = (
    original: GameData,
    edited: GameData
): {
    changedFields: string[];
    changes: Record<string, { from: any; to: any }>;
    summary: string;
} => {
    const auditTrail = createAuditTrail(original, edited);
    
    const summary = `${auditTrail.changedFields.length} field(s) changed: ${
        auditTrail.changedFields.slice(0, 3).join(', ')
    }${auditTrail.changedFields.length > 3 ? '...' : ''}`;
    
    return {
        changedFields: auditTrail.changedFields,
        changes: auditTrail.changes,
        summary
    };
};