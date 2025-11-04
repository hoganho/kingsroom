// services/gameService.ts

// Updated service to handle refactored schema with RUNNING status

import { generateClient } from 'aws-amplify/api';
import { fetchTournamentData, saveTournamentData } from '../graphql/mutations';
import { fetchTournamentDataRange } from '../graphql/queries'; // Assuming you have this query defined
import * as APITypes from '../API';
import type { GameData } from '../types/game';
import { VenueAssignmentStatus } from '../API';

/**
 * Calls the backend Lambda to fetch and parse tournament data without saving.
 * The backend will handle the SCRAPING and PARSING status updates internally.
 * @param url The URL of the tournament.
 * @returns A promise that resolves to the structured GameData.
 */
export const fetchGameDataFromBackend = async (url: string): Promise<APITypes.ScrapedGameData> => {
    const client = generateClient();
    console.log(`[GameService] Fetching data for ${url} from backend...`);
    try {
        const response = await client.graphql({
            query: fetchTournamentData,
            variables: { url }
        });

        if (response.errors) {
            // Handle the custom error from the backend for "Do Not Scrape"
            if (response.errors[0].message.includes('Scraping is disabled')) {
                 console.warn(`[GameService] Scraping disabled for ${url}`);
            }
            throw new Error(response.errors[0].message);
        }
        
        console.log('[GameService] Successfully fetched data:', response.data.fetchTournamentData);
        // Cast to ScrapedGameData, which now includes the new fields from the schema
        return response.data.fetchTournamentData as APITypes.ScrapedGameData;
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
 * @returns The saved or updated Game object from the database.
 */
export const saveGameDataToBackend = async (
    sourceUrl: string, 
    venueId: string | null | undefined, 
    data: GameData,
    existingGameId: string | null | undefined
): Promise<APITypes.Game> => {
    const client = generateClient();
    console.log(`[GameService] Saving ${data.gameStatus} tournament data for ${sourceUrl} to database...`);
    
    let assignmentStatus: VenueAssignmentStatus;
    if (venueId) {
        // User manually selected a venue
        assignmentStatus = VenueAssignmentStatus.MANUALLY_ASSIGNED;
    } else if (data.venueMatch?.autoAssignedVenue?.id) {
        // Backend auto-assigned a venue (but user didn't confirm, so it's still auto)
        // NOTE: Your UI logic might change this. If autoAssignedVenue.id is passed as venueId,
        // this logic is fine.
        assignmentStatus = VenueAssignmentStatus.AUTO_ASSIGNED;
    } else {
        // No venue provided, no auto-match
        assignmentStatus = VenueAssignmentStatus.PENDING_ASSIGNMENT;
    }

    try {
        // Prepare the input matching the refactored schema
        const input: APITypes.SaveTournamentInput = {
            sourceUrl,
            venueId : venueId,
            existingGameId: existingGameId,
            doNotScrape: data.doNotScrape ?? false,

            // ✅ FIXED: Stringify the complete data object before sending.
            // This converts the JavaScript object into a JSON string, which is what the AWSJSON type expects.
            originalScrapedData: JSON.stringify(data),
            
            venueAssignmentStatus: assignmentStatus,
            requiresVenueAssignment: !venueId, // If no venue is set, it requires assignment
            suggestedVenueName: data.venueMatch?.suggestions?.[0]?.name ?? undefined,
            venueAssignmentConfidence: data.venueMatch?.suggestions?.[0]?.score ?? undefined,

            // This is the 'clean' object, containing only fields for the Game table.
            data: {
                name: data.name,
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
    // ✅ UPDATED: Do not refresh if doNotScrape is true
    if (data.doNotScrape) {
        return false;
    }
    return data.gameStatus === 'RUNNING';
};

/**
 * ✅ UPDATED: This function is now corrected to use the `generateClient` pattern.
 */
export const fetchGameDataRangeFromBackend = async (startId: number, endId: number) => {
    const client = generateClient(); // ✅ Use the modern client
    console.log(`[GameService] Fetching game range ${startId}-${endId} from backend...`);
    try {
        const response = await client.graphql({ // ✅ Call GraphQL using the client
            query: fetchTournamentDataRange,
            variables: { startId, endId }
        });

        if (response.errors) {
            throw new Error(response.errors[0].message);
        }
        
        return response.data.fetchTournamentDataRange;
    } catch (error) {
        console.error('Error fetching game data range from backend:', error);
        throw error; // Re-throw the error to be handled by the hook
    }
};