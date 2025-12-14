// services/gameService.ts
// COMPLETE: Entity-aware game service with venue reassignment operations
// UPDATED: Now uses enrichGameData mutation instead of deprecated saveGame
// REFACTORED: Removed hardcoded DEFAULT_ENTITY_ID - entityId is now required from calling context

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData } from '../graphql/mutations';
import { listEntities } from '../graphql/queries';
import type { GameData } from '../types/game';
import type { Entity } from '../API';
import { 
    validateEditedGameData,
    calculateDerivedFields,
    createAuditTrail
} from '../utils/gameDataValidation';
import { 
    ScrapedGameData, 
    SaveGameResult
} from '../API';

// Import enrichment service for save operations
import {
    scrapedDataToEnrichInput,
    enrichGameData,
    getEnrichmentErrorMessage,
} from './enrichmentService';

// ===================================================================
// CONSTANTS
// ===================================================================

// REMOVED: Hardcoded DEFAULT_ENTITY_ID
// Entity ID must now be provided by the calling context (useEntity().currentEntity.id)

// Unassigned venue placeholder
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';

// ===================================================================
// GRAPHQL MUTATIONS & QUERIES
// ===================================================================

// NOTE: saveGameMutation has been REMOVED - use enrichGameData instead
// The enrichGameData mutation handles:
// 1. Data validation
// 2. Venue/Series/Recurring game resolution
// 3. Financial calculations
// 4. Saving to database

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
 * @deprecated Use useEntity().currentEntity.id from EntityContext instead
 * This function is kept for backward compatibility during migration
 * Will throw an error to help identify callers that need updating
 */
export const getCurrentEntityId = (): string => {
    // Check if there's a stored value (legacy support)
    const storedEntityId = localStorage.getItem('selectedEntityId');
    if (storedEntityId) {
        console.warn(
            '[gameService] getCurrentEntityId() is deprecated. ' +
            'Please use useEntity().currentEntity.id from EntityContext instead. ' +
            'Returning stored value for backward compatibility.'
        );
        return storedEntityId;
    }
    
    // No stored value - throw to help identify callers
    throw new Error(
        '[gameService] entityId is required. ' +
        'Use useEntity().currentEntity.id from EntityContext and pass it explicitly. ' +
        'getCurrentEntityId() is deprecated and will be removed.'
    );
};

/**
 * @deprecated EntityContext manages entity selection now
 */
export const setCurrentEntityId = (entityId: string): void => {
    console.warn(
        '[gameService] setCurrentEntityId() is deprecated. ' +
        'Use useEntity().setCurrentEntity() from EntityContext instead.'
    );
    localStorage.setItem('selectedEntityId', entityId);
};

/**
 * @deprecated No default entity - must be provided from user context
 */
export const getDefaultEntityId = (): string => {
    throw new Error(
        '[gameService] getDefaultEntityId() is deprecated. ' +
        'Entity ID must be provided from user context (useEntity().currentEntity.id or user.defaultEntityId).'
    );
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
// GAME DATA FETCHING
// ===================================================================

/**
 * Fetch game data from backend (S3-first architecture)
 */
export const fetchGameDataFromBackend = async (
    url: string,
    forceRefresh: boolean = false,
    scraperApiKey?: string | null,
    entityId?: string
): Promise<ScrapedGameData> => {
    const client = generateClient();
    
    try {
        console.log(`[GameService] Fetching game data`, { 
            url, 
            forceRefresh, 
            hasApiKey: !!scraperApiKey,
            apiKeyLength: scraperApiKey?.length // Debug: log key length to catch truncation
        });
        
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: {
                url,
                forceRefresh,
                scraperApiKey: scraperApiKey || null,
                entityId: entityId || null
            }
        }) as any;
        
        const result = response.data?.fetchTournamentData;
        
        // Check for GraphQL errors FIRST
        if (response.errors?.length) {
            console.warn('[GameService] GraphQL errors in response:', JSON.stringify(response.errors, null, 2));
            
            // Extract the primary error message
            const primaryError = response.errors[0];
            const errorMessage = primaryError?.message || 'Unknown GraphQL error';
            
            // Check if this is an auth error (Lambda threw 401/403)
            if (errorMessage.includes('401') || 
                errorMessage.includes('403') || 
                errorMessage.includes('Unauthorized') ||
                errorMessage.includes('forbidden') ||
                errorMessage.includes('API key')) {
                console.error('[GameService] Auth error from Lambda:', errorMessage);
                throw new Error(errorMessage);
            }
            
            // Check for enum errors (can still return partial data)
            const enumErrors = parseEnumErrors(response.errors);
            if (enumErrors.length > 0) {
                console.warn('[GameService] Enum validation errors detected:', enumErrors);
                if (result) {
                    result._enumErrors = enumErrors;
                    result._enumErrorMessage = formatEnumErrorMessage(enumErrors);
                }
            }
            
            // If we have errors but no result, throw
            if (!result) {
                console.error('[GameService] GraphQL returned errors with no data:', errorMessage);
                throw new Error(errorMessage);
            }
        }
        
        // If result is null/undefined without errors, something unexpected happened
        if (!result) {
            console.error('[GameService] No data returned from fetchTournamentData');
            throw new Error('No data returned from scraper');
        }
        
        // ADDITIONAL CHECK: Detect when gameVariant is null (may indicate invalid enum)
        if (result.gameVariant === null) {
            console.warn('[GameService] gameVariant is null - may indicate invalid enum value');
        }
        
        return result as ScrapedGameData;
        
    } catch (error: any) {
        // Handle Amplify GraphQL errors which have a specific structure
        console.warn('[GameService] GraphQL threw error:', error?.message);
        
        // Extract error message from various error formats
        let errorMessage = 'Unknown error';
        
        if (error?.message) {
            errorMessage = error.message;
        } else if (error?.errors?.[0]?.message) {
            errorMessage = error.errors[0].message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        // Check for partial data in error response
        if (error?.data?.fetchTournamentData) {
            const result = error.data.fetchTournamentData;
            console.warn('[GameService] Partial data available despite error');
            
            const enumErrors = parseEnumErrors(error.errors || []);
            
            if (enumErrors.length > 0) {
                console.warn('[GameService] Partial success with enum errors:', enumErrors);
                result._enumErrors = enumErrors;
                result._enumErrorMessage = formatEnumErrorMessage(enumErrors);
                return result as ScrapedGameData;
            }
            
            // Return partial data even without detected enum errors
            return result as ScrapedGameData;
        }
        
        // No partial data - create a proper error to throw
        console.error('[GameService] Error fetching game data:', errorMessage);
        
        // Re-throw with clean error message
        const cleanError = new Error(errorMessage);
        (cleanError as any).originalError = error;
        throw cleanError;
    }
};

/**
 * Parse GraphQL errors to extract enum validation failures
 */
const parseEnumErrors = (errors: any[]): Array<{ field: string; enumType: string; path: string }> => {
    const enumErrors: Array<{ field: string; enumType: string; path: string }> = [];
    
    for (const error of errors) {
        const message = error?.message || '';
        // Match: "Can't serialize value (/fetchTournamentData/gameVariant) : Invalid input for Enum 'GameVariant'."
        const match = message.match(/Can't serialize value \(([^)]+)\).*Invalid input for Enum '([^']+)'/);
        if (match) {
            const path = match[1];
            const enumType = match[2];
            const field = path.split('/').pop() || path;
            enumErrors.push({ field, enumType, path });
        }
    }
    
    return enumErrors;
};

/**
 * Format enum errors into a user-friendly message
 */
const formatEnumErrorMessage = (enumErrors: Array<{ field: string; enumType: string }>): string => {
    if (enumErrors.length === 0) return '';
    
    const errorDetails = enumErrors.map(e => `"${e.field}" (${e.enumType} enum)`).join(', ');
    return `⚠️ Unknown value(s) for: ${errorDetails}. The field contains a value not yet defined in the schema. Please add the new value to the ${enumErrors.map(e => e.enumType).join('/')} enum in schema.graphql and run 'amplify push'.`;
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
 * Save game data to backend via enrichGameData mutation
 * 
 * UPDATED: Now uses enrichGameData instead of deprecated saveGame mutation.
 * The enrichment pipeline handles:
 * - Data validation and normalization
 * - Venue, series, and recurring game resolution
 * - Financial calculations
 * - Saving to database
 * 
 * @param sourceUrl - The source URL of the tournament
 * @param venueId - The venue ID (can be null for auto-assignment)
 * @param data - The game data to save
 * @param existingGameId - Optional existing game ID for updates
 * @param entityId - REQUIRED: The entity ID from context
 * @param options - Additional save options
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
        autoCreateSeries?: boolean;
        autoCreateRecurring?: boolean;
    }
): Promise<SaveGameResult> => {
    // UPDATED: entityId is now required
    if (!entityId) {
        throw new Error(
            '[gameService.saveGameDataToBackend] entityId is required. ' +
            'Pass entityId from useEntity().currentEntity.id'
        );
    }
    
    console.log('[GameService] saveGameDataToBackend via enrichment pipeline:', {
        sourceUrl,
        venueId,
        entityId,
        existingGameId,
        name: data.name,
        tournamentId: data.tournamentId,
        wasEdited: options?.wasEdited,
    });
    
    try {
        // Convert ScrapedGameData/GameData to EnrichGameDataInput
        const input = scrapedDataToEnrichInput(
            data as ScrapedGameData,
            entityId,
            sourceUrl,
            {
                venueId,
                existingGameId,
                wasEdited: options?.wasEdited,
            }
        );
        
        // Set save options
        input.options = {
            ...input.options,
            saveToDatabase: true,
            forceUpdate: !!existingGameId || options?.wasEdited,
            autoCreateSeries: options?.autoCreateSeries ?? true,
            autoCreateRecurring: options?.autoCreateRecurring ?? false,
        };
        
        // Call enrichment pipeline
        const result = await enrichGameData(input);
        
        if (!result.success) {
            const errorMsg = getEnrichmentErrorMessage(result) || 'Enrichment failed';
            console.error('[GameService] Enrichment failed:', {
                errors: result.validation?.errors,
                message: errorMsg,
            });
            throw new Error(errorMsg);
        }
        
        if (!result.saveResult) {
            throw new Error('No save result returned from enrichGameData');
        }
        
        console.log('[GameService] Save via enrichment succeeded:', {
            gameId: result.saveResult.gameId,
            action: result.saveResult.action,
            recurringGameId: result.enrichedGame?.recurringGameId,
            tournamentSeriesId: result.enrichedGame?.tournamentSeriesId,
        });
        
        // Map EnrichmentSaveResult to SaveGameResult format (add __typename)
        return {
            __typename: 'SaveGameResult' as const,
            success: result.saveResult.success,
            gameId: result.saveResult.gameId || null,
            action: result.saveResult.action || null,
            message: result.saveResult.message || null,
            warnings: result.saveResult.warnings || null,
            playerProcessingQueued: result.saveResult.playerProcessingQueued || null,
            playerProcessingReason: result.saveResult.playerProcessingReason || null,
            venueAssignment: result.saveResult.venueAssignment ? {
                __typename: 'SaveVenueAssignmentInfo' as const,
                venueId: result.saveResult.venueAssignment.venueId || null,
                venueName: result.saveResult.venueAssignment.venueName || null,
                status: result.saveResult.venueAssignment.status as any,
                confidence: result.saveResult.venueAssignment.confidence || null,
            } : null,
            fieldsUpdated: result.saveResult.fieldsUpdated || null,
        };
        
    } catch (error: any) {
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
        
        return response.data.reassignGameVenue;
    } catch (error) {
        console.error('[GameService] Error reassigning venue:', error);
        throw error;
    }
};

/**
 * Bulk reassign multiple games to a new venue
 * Creates a background task for processing
 * 
 * @param input - Bulk reassignment parameters
 * @returns Task info with taskId for polling progress
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