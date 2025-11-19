// services/gameService.ts
// Complete service with all original functions plus enhanced save support

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData } from '../graphql/mutations';
import { fetchTournamentDataRange, listEntities } from '../graphql/queries';
import * as APITypes from '../API';
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

// LEGACY: Custom saveTournamentData mutation (deprecated, kept for backward compatibility)
const saveTournamentDataCustom = /* GraphQL */ `
    mutation SaveTournamentData($input: SaveTournamentInput!) {
        saveTournamentData(input: $input) {
            id
            name
            gameStartDateTime
            gameEndDateTime
            gameStatus
            registrationStatus
            gameVariant
            gameType
            prizepool
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            venueId
            entityId
            venueAssignmentStatus
            requiresVenueAssignment
            suggestedVenueName
            venueAssignmentConfidence
            createdAt
            updatedAt
            venue {
                id
                name
            }
            entity {
                id
                entityName
            }
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

// Extract player data for save input
const extractPlayersForSaveInput = (data: GameData | ScrapedGameData) => {
    const players: any = {
        totalPlayers: data.totalEntries || 0,
        results: [],
        entries: [],
        seating: []
    };
    
    if (data.results && data.results.length > 0) {
        players.results = data.results.map(r => ({
            rank: r.rank,
            name: r.name,
            winnings: r.winnings || 0,
            points: r.points || null
        }));
    }
    
    if (data.entries && data.entries.length > 0) {
        players.entries = data.entries.map(e => ({
            name: e.name
        }));
    }
    
    if (data.seating && data.seating.length > 0) {
        players.seating = data.seating.map(s => ({
            name: s.name,
            table: s.table,
            seat: s.seat,
            playerStack: s.playerStack || null
        }));
    }
    
    return players;
};

// Get entity ID from URL (placeholder implementation)
const getEntityIdFromUrl = async (_url: string): Promise<string | null> => {
    // This should match your entity URL patterns
    // For now, return null and let it be set explicitly
    return null;
};

/**
 * Fetch game data from backend (single game)
 */
export const fetchGameDataFromBackend = async (
    url: string,
    forceRefresh: boolean = false
): Promise<ScrapedGameData> => {
    const client = generateClient();
    console.log(`[GameService] Fetching tournament data for ${url}...`);
    
    try {
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: { url, forceRefresh }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to fetch tournament data');
        }
        
        const data = response.data.fetchTournamentData;
        console.log('[GameService] Tournament data fetched:', data?.name || 'Unknown');
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
    } else if (!options?.wasEdited) {
        // For non-edited data (ScrapedGameData), don't calculate derived fields
        // to avoid type incompatibility issues
        finalData = data;
    }
    
    // Determine entity ID
    const finalEntityId = entityId || (data as any).entityId || await getEntityIdFromUrl(sourceUrl);
    
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
            gameType: mapToGameType(finalData.gameType),
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
            seriesId: (finalData as any).seriesId || null,
            seriesName: (finalData as any).seriesName,
            year: (finalData as any).seriesYear || new Date(finalData.gameStartDateTime || new Date()).getFullYear(),
            isMainEvent: (finalData as any).isMainEvent || false,
            dayNumber: (finalData as any).dayNumber || null,
            flightLetter: (finalData as any).flightLetter || null
        } : null,
        options: {
            skipPlayerProcessing: false,
            forceUpdate: !!existingGameId || options?.wasEdited,
            validateOnly: false,
            doNotScrape: (finalData as any).doNotScrape || false
        },
    };
    
    // Add levels if present
    if (finalData.levels && finalData.levels.length > 0) {
        (saveGameInput.game as any).levels = finalData.levels.map((level: any) => ({
            levelNumber: level.levelNumber,
            durationMinutes: level.durationMinutes || 0,
            smallBlind: level.smallBlind || 0,
            bigBlind: level.bigBlind || 0,
            ante: level.ante || null
            // Note: breakMinutes removed as it doesn't exist on ScrapedTournamentLevel
        }));
    }
    
    console.log('[GameService] Calling saveGame mutation with input:', {
        sourceUrl,
        venueId,
        gameStatus: saveGameInput.game.gameStatus,
        playerCount: saveGameInput.players?.totalPlayers || 0,
        existingGameId,
        wasEdited: options?.wasEdited,
        changedFields: auditTrail?.changedFields
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
 * LEGACY: Save using the old saveTournamentData mutation
 * @deprecated Use saveGameDataToBackend instead
 */
export const saveGameDataToBackendLegacy = async (
    sourceUrl: string,
    venueId: string | null | undefined,
    data: GameData | ScrapedGameData,
    existingGameId: string | null | undefined,
    entityId?: string | null
): Promise<any> => {
    const client = generateClient();
    console.log(`[GameService] Saving tournament data (LEGACY) for ${sourceUrl}...`);
    
    const saveTournamentInput: APITypes.SaveTournamentInput = {
        sourceUrl: sourceUrl,
        venueId: venueId || null,
        existingGameId: existingGameId || null,
        doNotScrape: (data as any).doNotScrape || false,
        data: {
            name: data.name || `Tournament ${data.tournamentId}`,
            gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
            gameEndDateTime: data.gameEndDateTime || null,
            gameStatus: data.gameStatus as APITypes.GameStatus || APITypes.GameStatus.UNKNOWN,
            registrationStatus: data.registrationStatus as APITypes.RegistrationStatus || null,
            gameVariant: data.gameVariant as APITypes.GameVariant || null,
            gameType: data.gameType as APITypes.GameType || APITypes.GameType.TOURNAMENT,
            prizepool: data.prizepool || null,
            totalEntries: data.totalEntries || null,
            totalRebuys: data.totalRebuys || null,
            totalAddons: data.totalAddons || null,
            totalDuration: (data as any).totalDuration || null,
            gameTags: data.gameTags?.filter((tag): tag is string => tag !== null) || null,
            tournamentType: data.tournamentType as APITypes.TournamentType || null,
            buyIn: data.buyIn || null,
            rake: data.rake || null,
            startingStack: data.startingStack || null,
            hasGuarantee: data.hasGuarantee || false,
            guaranteeAmount: data.guaranteeAmount || null,
            levels: data.levels?.map((level: any) => ({
                levelNumber: level.levelNumber,
                durationMinutes: level.durationMinutes || null,
                smallBlind: level.smallBlind || null,
                bigBlind: level.bigBlind || null,
                ante: level.ante || null
                // Note: breakMinutes removed as it doesn't exist on ScrapedTournamentLevel
            })) || null
        },
        originalScrapedData: JSON.stringify(data),
        venueAssignmentStatus: (data as any).venueAssignmentStatus || null,
        requiresVenueAssignment: (data as any).requiresVenueAssignment || null,
        suggestedVenueName: (data as any).suggestedVenueName || null,
        venueAssignmentConfidence: (data as any).venueAssignmentConfidence || null,
        entityId: entityId || (data as any).entityId || null
    };
    
    try {
        const response = await client.graphql({
            query: saveTournamentDataCustom,
            variables: { input: saveTournamentInput }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            console.error('[GameService] GraphQL errors:', response.errors);
            throw new Error(response.errors[0]?.message || 'Failed to save tournament data');
        }
        
        const savedGame = response.data.saveTournamentData;
        console.log('[GameService] Tournament data saved (LEGACY):', savedGame.id);
        return savedGame;
    } catch (error) {
        console.error('[GameService] Error saving tournament data (LEGACY):', error);
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