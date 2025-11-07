// services/gameService.ts
// Enhanced service with Entity ID support - Fixed TypeScript errors

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { fetchTournamentData, saveTournamentData } from '../graphql/mutations';
import { fetchTournamentDataRange } from '../graphql/queries'; 
import * as APITypes from '../API';
import type { GameData, EntityConfig } from '../types/game';
import { VenueAssignmentStatus, ScrapedGameData } from '../API';

// Default entity ID - should be fetched from Entity table or configured
const DEFAULT_ENTITY_ID = '42101695-1332-48e3-963b-3c6ad4e909a0';

/**
 * Get the current active entity from local storage or use default
 */
export const getCurrentEntityId = (): string => {
    // Check if we have a selected entity in local storage
    const storedEntityId = localStorage.getItem('currentEntityId');
    if (storedEntityId) {
        return storedEntityId;
    }
    
    // Otherwise use default
    return DEFAULT_ENTITY_ID;
};

/**
 * Set the current active entity
 */
export const setCurrentEntityId = (entityId: string): void => {
    localStorage.setItem('currentEntityId', entityId);
};

/**
 * Fetch all available entities using auto-generated listEntities query
 */
export const fetchEntities = async (): Promise<EntityConfig[]> => {
    const client = generateClient();
    try {
        // Using auto-generated listEntities query
        const response = await client.graphql({
            query: /* GraphQL */ `
                query ListEntities {
                    listEntities(filter: { isActive: { eq: true } }) {
                        items {
                            id
                            entityName
                            gameUrlDomain
                            gameUrlPath
                            entityLogo
                            isActive
                        }
                    }
                }
            `
        });
        
        // Fix: Cast to GraphQLResult to access data property
        const responseData = (response as GraphQLResult<any>).data;
        if (responseData?.listEntities?.items) {
            return responseData.listEntities.items as EntityConfig[];
        }
        return [];
    } catch (error) {
        console.error('[GameService] Error fetching entities:', error);
        return [];
    }
};

/**
 * Get entity ID from URL domain
 */
export const getEntityIdFromUrl = async (url: string): Promise<string> => {
    try {
        const urlObj = new URL(url);
        // Fix: Use hostname to match domain (e.g., kingsroom.com.au)
        const domain = urlObj.hostname;
        
        const entities = await fetchEntities();
        // FIX: Compare just the hostnames, ignoring protocol and 'www'
        const matchingEntity = entities.find(e => {
            try {
                const entityDomain = new URL(e.gameUrlDomain).hostname;
                // Compare domain.com === domain.com OR www.domain.com === domain.com
                return entityDomain === domain || entityDomain === `www.${domain}`;
            } catch {
                // Fallback for non-URL domains (e.g., just 'kingsroom.com.au')
                return e.gameUrlDomain === domain || `www.${e.gameUrlDomain}` === domain;
            }
        });
        
        if (matchingEntity) {
            console.log(`[GameService] Found entity for domain ${domain}: ${matchingEntity.id}`);
            return matchingEntity.id;
        }
        
        console.log(`[GameService] No entity found for domain ${domain}, using current entity from storage`);
        return getCurrentEntityId(); // Fallback to localStorage
    } catch (error) {
        console.error('[GameService] Error determining entity from URL:', error);
        return getCurrentEntityId(); // Fallback to localStorage
    }
};

/**
 * Calls the backend Lambda to fetch and parse tournament data without saving.
 * The backend will handle the SCRAPING and PARSING status updates internally.
 * @param url The URL of the tournament.
 * @param entityId (FIX) Optional: The entity ID. If provided, skips URL lookup.
 * @returns A promise that resolves to the structured GameData.
 */
export const fetchGameDataFromBackend = async (
    url: string,
    entityId?: string // <-- *** FIX: Added optional entityId parameter ***
): Promise<ScrapedGameData> => {
    const client = generateClient();
    console.log(`[GameService] Fetching data for ${url} from backend...`);
    
    try {
        // *** FIX: Determine entity ID ***
        // 1. Use the entityId if it was passed directly (from SingleScraperTab)
        // 2. If not, fall back to guessing from the URL (for other parts of the app)
        const finalEntityId = entityId || (await getEntityIdFromUrl(url));
        
        console.log(`[GameService] Using entity ID: ${finalEntityId}`);
        
        // Note: The fetchTournamentData mutation itself doesn't take entityId,
        // but the lambda it calls may use it. We're passing the URL.
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: { 
                url
            }
        });

        if (response.errors) {
            // Handle the custom error from the backend for "Do Not Scrape"
            if (response.errors[0].message.includes('Scraping is disabled')) {
                console.warn(`[GameService] Scraping disabled for ${url}`);
            }
            throw new Error(response.errors[0].message);
        }
        
        const data = response.data.fetchTournamentData as ScrapedGameData;
        
        // Manually add the determined entity ID to response if not included
        // This is crucial for the UI to know which entity this data belongs to.
        if (!data.entityId) {
            data.entityId = finalEntityId;
        }
        
        console.log('[GameService] Successfully fetched data:', data);
        return data;
    } catch (error) {
        console.error('[GameService] Error fetching data from backend:', error);
        throw error;
    }
};

/**
 * Calls the backend Lambda to save or update tournament data.
 * Allows saving tournaments regardless of their status (SCHEDULED, RUNNING, or COMPLETED).
 * @param sourceUrl The original URL of the tournament.
 * @param venueId The ID of the venue to associate with this game.
 * @param data The structured GameData to save.
 * @param existingGameId The ID of the game if it already exists in the DB (for updates).
 * @param entityId Optional entity ID to override the default
 * @returns The saved or updated Game object from the database.
 */
export const saveGameDataToBackend = async (
    sourceUrl: string, 
    venueId: string | null | undefined, 
    data: GameData,
    existingGameId: string | null | undefined,
    entityId?: string | null
): Promise<APITypes.Game> => {
    const client = generateClient();
    console.log(`[GameService] Saving ${data.gameStatus} tournament data for ${sourceUrl} to database...`);
    
    // Determine entity ID
    const finalEntityId = entityId || data.entityId || await getEntityIdFromUrl(sourceUrl);
    console.log(`[GameService] Using entity ID: ${finalEntityId}`);
    
    let assignmentStatus: VenueAssignmentStatus;
    if (venueId) {
        // User manually selected a venue
        assignmentStatus = VenueAssignmentStatus.MANUALLY_ASSIGNED;
    } else if (data.venueMatch?.autoAssignedVenue?.id) {
        // Backend auto-assigned a venue
        assignmentStatus = VenueAssignmentStatus.AUTO_ASSIGNED;
    } else {
        // No venue provided, no auto-match
        assignmentStatus = VenueAssignmentStatus.PENDING_ASSIGNMENT;
    }

    try {
        // Prepare the input matching the refactored schema with entity ID
        const input: APITypes.SaveTournamentInput = {
            sourceUrl,
            venueId: venueId,
            entityId: finalEntityId, // Include entity ID at the top level
            existingGameId: existingGameId,
            doNotScrape: data.doNotScrape ?? false,
            
            // Stringify the complete data object before sending
            originalScrapedData: JSON.stringify(data),
            
            venueAssignmentStatus: assignmentStatus,
            requiresVenueAssignment: !venueId, // If no venue is set, it requires assignment
            suggestedVenueName: data.venueMatch?.suggestions?.[0]?.name ?? undefined,
            venueAssignmentConfidence: data.venueMatch?.suggestions?.[0]?.score ?? undefined,

            // This is the 'clean' object, containing only fields for the Game table
            // Note: Remove entityId from data if ScrapedGameDataInput doesn't support it
            data: {
                name: data.name,
                // Only include entityId if your ScrapedGameDataInput type supports it
                // entityId: finalEntityId, // Removed as it doesn't exist in type
                gameStartDateTime: data.gameStartDateTime ?? undefined,
                gameEndDateTime: data.gameEndDateTime ?? undefined,
                gameStatus: data.gameStatus,
                registrationStatus: data.registrationStatus,
                gameVariant: data.gameVariant ?? APITypes.GameVariant.NLHE,
                gameType: data.gameType,
                prizepool: data.prizepool,
                totalEntries: data.totalEntries,
                totalRebuys: data.totalRebuys,
                totalAddons: data.totalAddons,
                totalDuration: data.totalDuration,
                gameTags: data.gameTags?.filter((tag): tag is string => tag !== null),
                tournamentType: data.tournamentType,
                buyIn: data.buyIn,
                rake: data.rake,
                startingStack: data.startingStack,
                hasGuarantee: data.hasGuarantee,
                guaranteeAmount: data.guaranteeAmount,
                levels: data.levels?.map(l => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes,
                    smallBlind: l.smallBlind,
                    bigBlind: l.bigBlind,
                    ante: l.ante ?? undefined,
                    breakMinutes: l.breakMinutes ?? undefined,
                })) || [],
            },
        };

        const response = await client.graphql({
            query: saveTournamentData,
            variables: { input }
        });
        
        if (response.errors) {
            throw new Error(JSON.stringify(response.errors));
        }

        console.log(`[GameService] Successfully saved ${data.gameStatus} tournament to DB:`, response.data.saveTournamentData);
        return response.data.saveTournamentData as APITypes.Game;
    } catch (error) {
        console.error('[GameService] Error saving to DB:', error);
        throw error;
    }
};

/**
 * Helper function to determine if a tournament should be auto-refreshed
 * based on its status and other criteria
 */
export const shouldAutoRefreshTournament = (data: GameData): boolean => {
    // Do not refresh if doNotScrape is true
    if (data.doNotScrape) {
        return false;
    }
    return data.gameStatus === 'RUNNING';
};

/**
 * Fetch game data range from backend
 * Note: If the query doesn't support entityId, you may need to filter results client-side
 */
export const fetchGameDataRangeFromBackend = async (
    startId: number, 
    endId: number,
    entityId?: string
) => {
    const client = generateClient();
    const finalEntityId = entityId || getCurrentEntityId();
    
    console.log(`[GameService] Fetching game range ${startId}-${endId} for entity ${finalEntityId} from backend...`);
    
    try {
        // Check if your fetchTournamentDataRange query accepts entityId
        // If not, you'll need to filter the results after fetching
        const response = await client.graphql({
            query: fetchTournamentDataRange,
            variables: { 
                startId, 
                endId
                // Removed entityId - add it back if your query supports it
            }
        });

        if (response.errors) {
            throw new Error(response.errors[0].message);
        }
        
        const data = response.data.fetchTournamentDataRange;
        
        // If the query doesn't support entityId filtering,
        // you can filter the results client-side:
        // return data.filter(item => item.entityId === finalEntityId);
        
        return data;
    } catch (error) {
        console.error('Error fetching game data range from backend:', error);
        throw error;
    }
};

/**
 * Helper to validate that all required entity fields are present
 */
export const validateEntityData = (data: GameData, entityId?: string): string[] => {
    const errors: string[] = [];
    
    if (!entityId && !data.entityId) {
        errors.push('Entity ID is required but not provided');
    }
    
    // Add any additional entity-related validation here
    
    return errors;
};

/**
 * Batch save games with entity validation
 */
export const batchSaveGamesWithEntity = async (
    games: Array<{
        sourceUrl: string;
        venueId?: string;
        data: GameData;
        existingGameId?: string;
    }>,
    entityId?: string
): Promise<Array<APITypes.Game | { error: string }>> => {
    const results = [];
    const finalEntityId = entityId || getCurrentEntityId();
    
    for (const game of games) {
        try {
            // Validate entity data
            const validationErrors = validateEntityData(game.data, finalEntityId);
            if (validationErrors.length > 0) {
                results.push({ error: validationErrors.join(', ') });
                continue;
            }
            
            // Save with entity ID
            const saved = await saveGameDataToBackend(
                game.sourceUrl,
                game.venueId,
                game.data,
                game.existingGameId,
                finalEntityId
            );
            
            results.push(saved);
        } catch (error) {
            // Fix: Properly handle unknown error type
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.push({ error: errorMessage });
        }
    }
    
    return results;
};