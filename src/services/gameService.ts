// services/gameService.ts
// COMPLETE: Entity-aware game service with venue reassignment operations
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData } from '../graphql/mutations';
import { listEntities } from '../graphql/queries';
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
    GameType,
    GameVariant,
    GameStatus,
    RegistrationStatus,
    GameFrequency,
    TournamentType,
    SaveGameResult
} from '../API';

// ===================================================================
// CONSTANTS
// ===================================================================

// Default entity ID
const DEFAULT_ENTITY_ID = '42101695-1332-48e3-963b-3c6ad4e909a0';

// Unassigned venue placeholder
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';

// ===================================================================
// GRAPHQL MUTATIONS
// ===================================================================

// GraphQL mutation for saving game data
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

// GraphQL mutation for single game venue reassignment
const reassignGameVenueMutation = /* GraphQL */ `
    mutation ReassignGameVenue($input: ReassignGameVenueInput!) {
        reassignGameVenue(input: $input) {
            success
            status
            message
            taskId
            gameId
            oldVenueId
            newVenueId
            oldEntityId
            newEntityId
            venueCloned
            clonedVenueId
            recordsUpdated
        }
    }
`;

// GraphQL mutation for bulk venue reassignment
const bulkReassignGameVenuesMutation = /* GraphQL */ `
    mutation BulkReassignGameVenues($input: BulkReassignGameVenuesInput!) {
        bulkReassignGameVenues(input: $input) {
            success
            status
            message
            taskId
            gameCount
            newVenueId
            reassignEntity
        }
    }
`;

// GraphQL query for reassignment task status
const getReassignmentStatusQuery = /* GraphQL */ `
    query GetReassignmentStatus($taskId: ID!) {
        getReassignmentStatus(taskId: $taskId) {
            success
            message
            task {
                id
                status
                taskType
                targetCount
                processedCount
                progressPercent
                result
                errorMessage
                createdAt
                startedAt
                completedAt
            }
        }
    }
`;

// GraphQL query for venue clones
const getVenueClonesQuery = /* GraphQL */ `
    query GetVenueClones($canonicalVenueId: ID!) {
        getVenueClones(canonicalVenueId: $canonicalVenueId) {
            id
            name
            entityId
            canonicalVenueId
        }
    }
`;

// GraphQL query to find venue for entity
const findVenueForEntityQuery = /* GraphQL */ `
    query FindVenueForEntity($canonicalVenueId: ID!, $entityId: ID!) {
        findVenueForEntity(canonicalVenueId: $canonicalVenueId, entityId: $entityId) {
            id
            name
            entityId
            canonicalVenueId
        }
    }
`;

// ===================================================================
// TYPES - VENUE REASSIGNMENT
// ===================================================================

export interface ReassignGameVenueInput {
    gameId: string;
    newVenueId: string;
    entityId?: string;
    reassignEntity: boolean;  // true = move game to venue's entity, false = clone venue to game's entity
    initiatedBy?: string;
}

export interface BulkReassignGameVenuesInput {
    gameIds: string[];
    newVenueId: string;
    entityId: string;
    reassignEntity: boolean;
    initiatedBy?: string;
}

export interface ReassignmentResult {
    success: boolean;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NO_CHANGE';
    message: string;
    taskId?: string;
    gameId?: string;
    oldVenueId?: string;
    newVenueId?: string;
    oldEntityId?: string;
    newEntityId?: string;
    venueCloned?: boolean;
    clonedVenueId?: string;
    recordsUpdated?: any;
}

export interface BulkReassignmentResult {
    success: boolean;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    message: string;
    taskId?: string;
    gameCount?: number;
    newVenueId?: string;
    reassignEntity?: boolean;
}

export interface BackgroundTask {
    id: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    taskType: string;
    targetCount?: number;
    processedCount?: number;
    progressPercent?: number;
    result?: any;
    errorMessage?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
}

export interface VenueClone {
    id: string;
    name: string;
    entityId: string;
    canonicalVenueId: string;
}

// ===================================================================
// ENTITY MANAGEMENT
// ===================================================================

/**
 * Get the current active entity from local storage or use default
 */
export const getCurrentEntityId = (): string => {
    const storedEntityId = localStorage.getItem('currentEntityId');
    return storedEntityId || DEFAULT_ENTITY_ID;
};

/**
 * Set the current active entity ID
 */
export const setCurrentEntityId = (entityId: string): void => {
    localStorage.setItem('currentEntityId', entityId);
};

/**
 * Get the default entity ID constant
 */
export const getDefaultEntityId = (): string => {
    return DEFAULT_ENTITY_ID;
};

/**
 * Get the unassigned venue ID constant
 */
export const getUnassignedVenueId = (): string => {
    return UNASSIGNED_VENUE_ID;
};

/**
 * Fetch all entities from the backend
 */
export const fetchEntities = async (): Promise<Entity[]> => {
    const client = generateClient();
    try {
        const response = await client.graphql({
            query: listEntities,
            variables: { limit: 100 }
        }) as any;
        
        return response.data.listEntities.items.filter((item: any) => item !== null);
    } catch (error) {
        console.error('Error fetching entities:', error);
        throw error;
    }
};

// ===================================================================
// ENUM MAPPING HELPERS
// ===================================================================

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
    return value ? value as GameStatus : null;
};

const mapToRegistrationStatus = (value: any): RegistrationStatus | null => {
    return value ? value as RegistrationStatus : null;
};

const mapToGameFrequency = (value: any): GameFrequency | null => {
    return value ? value as GameFrequency : null;
};

const mapToTournamentType = (value: any): TournamentType | null => {
    return value ? value as TournamentType : null;
};

// ===================================================================
// DATA HELPERS
// ===================================================================

/**
 * Create placeholder data for NOT_PUBLISHED games
 */
const createNotPublishedPlaceholder = (
    data: GameData | ScrapedGameData,
    sourceUrl: string,
    entityId: string
): GameData | ScrapedGameData => {
    return {
        ...data,
        name: data.name || `Tournament ${data.tournamentId} - Not Published`,
        gameType: data.gameType || 'TOURNAMENT',
        gameVariant: data.gameVariant || 'NLHE',
        gameStatus: 'NOT_PUBLISHED',
        gameStartDateTime: data.gameStartDateTime || new Date().toISOString(),
        registrationStatus: data.registrationStatus || 'N_A',
        tournamentId: data.tournamentId,
        sourceUrl: sourceUrl,
        entityId: entityId,
        buyIn: data.buyIn || 0,
        rake: data.rake || 0,
        startingStack: data.startingStack || 0,
        prizepoolPaid: data.prizepoolPaid || 0,
        prizepoolCalculated: data.prizepoolCalculated || 0,
        totalUniquePlayers: data.totalUniquePlayers || 0,
        totalInitialEntries: data.totalInitialEntries || 0,
        totalEntries: data.totalEntries || 0,
        totalRebuys: data.totalRebuys || 0,
        totalAddons: data.totalAddons || 0,
        guaranteeAmount: data.guaranteeAmount || 0,
        hasGuarantee: data.hasGuarantee || false,
        isSeries: false,
    } as GameData | ScrapedGameData;
};

/**
 * Extract player data for save input
 */
const extractPlayersForSaveInput = (data: GameData | ScrapedGameData) => {
    const allPlayers: any[] = [];
    let totalPrizesPaid = 0;
    
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
    
    return {
        allPlayers,
        totalInitialEntries: data.totalInitialEntries || allPlayers.length,
        totalEntries: data.totalEntries || allPlayers.length,
        totalUniquePlayers: data.totalUniquePlayers || allPlayers.length,
        hasCompleteResults: data.results && data.results.length > 0 && data.results.some(r => r.winnings && r.winnings > 0)
    };
};

// ===================================================================
// GAME DATA FETCHING
// ===================================================================

/**
 * Fetch game data from backend (S3-first architecture)
 */
export const fetchGameDataFromBackend = async (
    url: string,
    forceRefresh: boolean = false,
    scraperApiKey?: string | null
): Promise<ScrapedGameData> => {
    const client = generateClient();
    
    try {
        console.log(`[GameService] Fetching game data`, { url, forceRefresh, hasApiKey: !!scraperApiKey });
        
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: {
                url,
                forceRefresh,
                scraperApiKey: scraperApiKey || null
            }
        }) as any;
        
        const result = response.data.fetchTournamentData;
        
        console.log(`[GameService] Received data`, {
            hasData: !!result,
            s3Key: result?.s3Key,
            wasForced: result?.wasForced
        });
        
        return result as ScrapedGameData;
    } catch (error: any) {
        console.error('[GameService] Error fetching game data:', error);
        throw error;
    }
};

/**
 * Determine if a tournament should auto-refresh based on its status
 */
export const shouldAutoRefreshTournament = (data: ScrapedGameData | GameData | null): boolean => {
    if (!data) return false;
    
    const status = data.gameStatus;
    
    // Auto-refresh for active/in-progress games
    // GameStatus enum: INITIATING, SCHEDULED, RUNNING, CANCELLED, FINISHED, NOT_IN_USE, NOT_PUBLISHED, CLOCK_STOPPED, UNKNOWN
    if (status === 'RUNNING' || status === 'INITIATING' || status === 'CLOCK_STOPPED') {
        return true;
    }
    
    // Don't auto-refresh completed or cancelled games
    if (status === 'FINISHED' || status === 'CANCELLED' || status === 'NOT_PUBLISHED' || status === 'NOT_IN_USE') {
        return false;
    }
    
    // For scheduled games, check if start time is near
    if (status === 'SCHEDULED' && data.gameStartDateTime) {
        const startTime = new Date(data.gameStartDateTime);
        const now = new Date();
        const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursUntilStart <= 2 && hoursUntilStart >= -1;
    }
    
    return false;
};

// ===================================================================
// GAME DATA SAVING
// ===================================================================

/**
 * Save game data to backend via unified saveGame mutation
 * 
 * @param sourceUrl - The source URL of the game
 * @param venueId - The venue ID to assign
 * @param data - The game data to save
 * @param existingGameId - Optional existing game ID for updates
 * @param entityId - Optional entity ID (defaults to current entity)
 * @param options - Optional { wasEdited, originalData }
 */
export const saveGameDataToBackend = async (
    sourceUrl: string,
    venueId: string | null,
    data: GameData | ScrapedGameData,
    existingGameId?: string | null,
    entityId?: string,
    options?: {
        wasEdited?: boolean;
        originalData?: any;
    }
): Promise<SaveGameResult> => {
    const client = generateClient();
    const effectiveEntityId = entityId || getCurrentEntityId();
    
    // If game is NOT_PUBLISHED, create placeholder
    let finalData: GameData | ScrapedGameData = data;
    if (data.gameStatus === 'NOT_PUBLISHED') {
        console.log('[GameService] Creating NOT_PUBLISHED placeholder for tournament', data.tournamentId);
        finalData = createNotPublishedPlaceholder(data, sourceUrl, effectiveEntityId);
    }
    
    // Validate and prepare data
    let validationWarnings: string[] = [];
    
    if (options?.wasEdited) {
        const prepared = prepareGameDataForSave(finalData as GameData);
        finalData = prepared.data as any;
        validationWarnings = prepared.warnings;
    }
    
    // Extract player data
    const playerData = extractPlayersForSaveInput(finalData);
    
    // Build the save input
    const saveGameInput = {
        source: {
            type: 'SCRAPE' as const,
            sourceId: sourceUrl,
            entityId: effectiveEntityId,
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
            
            // Financial fields (base data)
            buyIn: finalData.buyIn || 0,
            rake: finalData.rake || 0,
            guaranteeAmount: finalData.guaranteeAmount || 0,
            hasGuarantee: finalData.hasGuarantee || false,
            
            // Simplified financial metrics
            totalBuyInsCollected: (finalData as any).totalBuyInsCollected || null,
            rakeRevenue: (finalData as any).rakeRevenue || null,
            prizepoolPlayerContributions: (finalData as any).prizepoolPlayerContributions || null,
            prizepoolAddedValue: (finalData as any).prizepoolAddedValue || null,
            prizepoolSurplus: (finalData as any).prizepoolSurplus || null,
            guaranteeOverlayCost: (finalData as any).guaranteeOverlayCost || null,
            gameProfit: (finalData as any).gameProfit || null,
            
            // Venue fee
            venueFee: (finalData as any).venueFee ?? null,
            
            // Game details
            startingStack: finalData.startingStack || 0,
            prizepoolPaid: finalData.prizepoolPaid || 0,
            prizepoolCalculated: finalData.prizepoolCalculated || 0,
            totalUniquePlayers: finalData.totalUniquePlayers || 0,
            totalInitialEntries: finalData.totalInitialEntries || 0,
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
            totalDuration: (finalData as any).totalDuration || null
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
            suggestedSeriesId: (finalData as any).seriesMatch?.seriesTitleId || (finalData as any).seriesTitleId || null,
            seriesName: (finalData as any).seriesName,
            year: (finalData as any).seriesYear || new Date(finalData.gameStartDateTime || new Date()).getFullYear(),
            isMainEvent: (finalData as any).isMainEvent || false,
            eventNumber: (finalData as any).eventNumber || null,
            dayNumber: (finalData as any).dayNumber || null,
            flightLetter: (finalData as any).flightLetter || null,
            finalDay: (finalData as any).finalDay || false,
            confidence: (finalData as any).seriesMatch?.score || 0.8
        } : null,
        options: {
            skipPlayerProcessing: data.gameStatus === 'NOT_PUBLISHED',
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
        
        if (validLevels.length > 0) {
            (saveGameInput.game as any).levels = JSON.stringify(validLevels);
        }
    }
    
    console.log('[GameService] Calling saveGame mutation:', {
        sourceUrl,
        venueId,
        gameStatus: saveGameInput.game.gameStatus,
        existingGameId,
        wasEdited: options?.wasEdited
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
        
        if (validationWarnings.length > 0) {
            result.warnings = [...(result.warnings || []), ...validationWarnings];
        }
        
        console.log('[GameService] Save result:', {
            success: result.success,
            action: result.action,
            gameId: result.gameId
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

// ===================================================================
// VENUE REASSIGNMENT OPERATIONS
// ===================================================================

/**
 * Reassign a single game to a different venue
 * 
 * @param input - Reassignment parameters
 * @returns Result with new venue/entity IDs and any cloned venue info
 * 
 * @example
 * // Move game to new entity (follow the venue)
 * await reassignGameVenue({ gameId: '123', newVenueId: '456', reassignEntity: true });
 * 
 * // Keep game in current entity (clone venue if needed)
 * await reassignGameVenue({ gameId: '123', newVenueId: '456', reassignEntity: false });
 */
export const reassignGameVenue = async (
    input: ReassignGameVenueInput
): Promise<ReassignmentResult> => {
    const client = generateClient();
    
    try {
        console.log('[GameService] Reassigning game venue:', input);
        
        const response = await client.graphql({
            query: reassignGameVenueMutation,
            variables: { input }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            console.error('[GameService] GraphQL errors:', response.errors);
            throw new Error(response.errors[0]?.message || 'Failed to reassign venue');
        }
        
        const result = response.data.reassignGameVenue;
        
        console.log('[GameService] Reassignment result:', {
            success: result.success,
            status: result.status,
            venueCloned: result.venueCloned,
            clonedVenueId: result.clonedVenueId
        });
        
        return result;
    } catch (error) {
        console.error('[GameService] Error reassigning venue:', error);
        throw error;
    }
};

/**
 * Bulk reassign multiple games to a different venue
 * Always queues as async job for tracking progress
 * 
 * @param input - Bulk reassignment parameters
 * @returns Task ID for tracking progress
 */
export const bulkReassignGameVenues = async (
    input: BulkReassignGameVenuesInput
): Promise<BulkReassignmentResult> => {
    const client = generateClient();
    
    try {
        console.log('[GameService] Bulk reassigning venues:', {
            gameCount: input.gameIds.length,
            newVenueId: input.newVenueId,
            reassignEntity: input.reassignEntity
        });
        
        const response = await client.graphql({
            query: bulkReassignGameVenuesMutation,
            variables: { input }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            console.error('[GameService] GraphQL errors:', response.errors);
            throw new Error(response.errors[0]?.message || 'Failed to bulk reassign venues');
        }
        
        return response.data.bulkReassignGameVenues;
    } catch (error) {
        console.error('[GameService] Error bulk reassigning venues:', error);
        throw error;
    }
};

/**
 * Get the status of a background reassignment task
 * Use for polling progress on bulk operations
 * 
 * @param taskId - Background task ID
 * @returns Task status with progress info
 */
export const getReassignmentStatus = async (
    taskId: string
): Promise<{ success: boolean; message: string; task?: BackgroundTask }> => {
    const client = generateClient();
    
    try {
        const response = await client.graphql({
            query: getReassignmentStatusQuery,
            variables: { taskId }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to get status');
        }
        
        return response.data.getReassignmentStatus;
    } catch (error) {
        console.error('[GameService] Error getting reassignment status:', error);
        throw error;
    }
};

/**
 * Get all clones of a canonical venue across entities
 * Useful for showing which entities have this physical venue
 * 
 * @param canonicalVenueId - The canonical (original) venue ID
 * @returns List of venue clones in different entities
 */
export const getVenueClones = async (
    canonicalVenueId: string
): Promise<VenueClone[]> => {
    const client = generateClient();
    
    try {
        const response = await client.graphql({
            query: getVenueClonesQuery,
            variables: { canonicalVenueId }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to get venue clones');
        }
        
        return response.data.getVenueClones || [];
    } catch (error) {
        console.error('[GameService] Error getting venue clones:', error);
        throw error;
    }
};

/**
 * Find if a specific entity already has a clone of a canonical venue
 * 
 * @param canonicalVenueId - The canonical venue ID
 * @param entityId - The entity to check
 * @returns The existing venue clone or null
 */
export const findVenueForEntity = async (
    canonicalVenueId: string,
    entityId: string
): Promise<VenueClone | null> => {
    const client = generateClient();
    
    try {
        const response = await client.graphql({
            query: findVenueForEntityQuery,
            variables: { canonicalVenueId, entityId }
        }) as GraphQLResult<any>;
        
        if (response.errors) {
            throw new Error(response.errors[0]?.message || 'Failed to find venue');
        }
        
        return response.data.findVenueForEntity;
    } catch (error) {
        console.error('[GameService] Error finding venue for entity:', error);
        throw error;
    }
};

/**
 * Poll for task completion with progress callback
 * 
 * @param taskId - Background task ID
 * @param onProgress - Callback for progress updates
 * @param pollInterval - Interval in ms (default 2000)
 * @param maxAttempts - Max poll attempts (default 150 = 5 min)
 * @returns Final task result
 */
export const pollTaskCompletion = async (
    taskId: string,
    onProgress?: (task: BackgroundTask) => void,
    pollInterval: number = 2000,
    maxAttempts: number = 150
): Promise<BackgroundTask> => {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        const response = await getReassignmentStatus(taskId);
        
        if (!response.success || !response.task) {
            throw new Error(response.message || 'Task not found');
        }
        
        const task = response.task;
        
        if (onProgress) {
            onProgress(task);
        }
        
        if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
            return task;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        attempts++;
    }
    
    throw new Error('Task polling timed out');
};

// ===================================================================
// VALIDATION & UTILITIES
// ===================================================================

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

/**
 * Fetch game data for a range of tournament IDs
 * Used by bulk operations to fetch multiple games at once
 */
export const fetchGameDataRangeFromBackend = async (
    baseUrl: string,
    startId: number,
    endId: number
): Promise<any[]> => {
    const client = generateClient();
    const results: any[] = [];
    
    try {
        console.log(`[GameService] Fetching game range ${startId}-${endId} from ${baseUrl}`);
        
        // Fetch each game in the range
        for (let id = startId; id <= endId; id++) {
            const url = `${baseUrl}${id}`;
            try {
                const response = await client.graphql({
                    query: /* GraphQL */ `
                        mutation FetchTournamentData($url: AWSURL!, $forceRefresh: Boolean) {
                            fetchTournamentData(url: $url, forceRefresh: $forceRefresh) {
                                tournamentId
                                name
                                gameStatus
                                registrationStatus
                                gameStartDateTime
                                doNotScrape
                            }
                        }
                    `,
                    variables: { url, forceRefresh: false }
                }) as any;
                
                const data = response.data?.fetchTournamentData;
                if (data) {
                    results.push({
                        id: String(data.tournamentId || id),
                        name: data.name,
                        gameStatus: data.gameStatus,
                        registrationStatus: data.registrationStatus,
                        gameStartDateTime: data.gameStartDateTime,
                        doNotScrape: data.doNotScrape,
                        inDatabase: true
                    });
                }
            } catch (error) {
                // Individual fetch failed, add error entry
                results.push({
                    id: String(id),
                    error: error instanceof Error ? error.message : 'Failed to fetch',
                    inDatabase: false
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error('[GameService] Error fetching game range:', error);
        throw error;
    }
};

/**
 * Check if a venue is the unassigned placeholder
 */
export const isUnassignedVenue = (venueId: string | null | undefined): boolean => {
    return !venueId || venueId === UNASSIGNED_VENUE_ID;
};

/**
 * Get entity name from entity ID using cached entities
 */
export const getEntityName = (entityId: string, entities: Entity[]): string => {
    const entity = entities.find(e => e.id === entityId);
    return entity?.entityName || 'Unknown';
};