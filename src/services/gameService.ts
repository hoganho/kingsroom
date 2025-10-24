// Updated service to handle refactored schema with RUNNING status

import { generateClient } from 'aws-amplify/api';
import { fetchTournamentData, saveTournamentData } from '../graphql/mutations';
import * as APITypes from '../API';
import type { GameData, GameStatus } from '../types/game';

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
 * Converts our internal GameStatus to the API GameStatus enum
 * Handles the LIVE -> RUNNING conversion
 */
const mapToAPIGameStatus = (status: GameStatus): APITypes.GameStatus => {
    // Map our internal status to the API enum
    switch (status) {
        case 'RUNNING':
            // If the API still expects 'LIVE', use that, otherwise use 'RUNNING'
            // Assuming the API has been updated to use 'RUNNING'
            return 'RUNNING' as APITypes.GameStatus;
        case 'SCHEDULED':
            return 'SCHEDULED' as APITypes.GameStatus;
        case 'COMPLETED':
            return 'COMPLETED' as APITypes.GameStatus;
        case 'CANCELLED':
            return 'CANCELLED' as APITypes.GameStatus;
        default:
            return 'SCHEDULED' as APITypes.GameStatus;
    }
};

/**
 * Calls the backend Lambda to save or update tournament data.
 * Allows saving tournaments regardless of their status (SCHEDULED, RUNNING, or COMPLETED).
 * @param sourceUrl The original URL of the tournament.
 * @param venueId The ID of the venue to associate with this game.
 * @param data The structured GameData to save.
 * @returns The saved or updated Game object from the database.
 */
export const saveGameDataToBackend = async (
    sourceUrl: string, 
    venueId: string, 
    data: GameData
): Promise<APITypes.Game> => {
    const client = generateClient();
    console.log(`[GameService] Saving ${data.status} tournament data for ${sourceUrl} to database...`);
    
    try {
        // Prepare the input matching the refactored schema
        const input: APITypes.SaveTournamentInput = {
            sourceUrl,
            venueId,
            data: {
                name: data.name,
                gameStartDateTime: data.gameStartDateTime,
                gameEndDateTime: data.gameEndDateTime ?? undefined,
                // Map the status properly
                status: mapToAPIGameStatus(data.status),
                registrationStatus: data.registrationStatus ?? undefined,
                gameVariant: data.gameVariant ?? undefined,
                prizepool: data.prizepool ?? undefined,
                totalEntries: data.totalEntries ?? undefined,
                totalRebuys: data.totalRebuys ?? undefined,
                totalAddons: data.totalAddons ?? undefined,
                totalDuration: data.totalDuration ?? undefined,
                gameTags: data.gameTags?.filter((tag): tag is string => tag !== null) ?? [],
                
                // Tournament-specific fields (now part of Game)
                tournamentType: (data.tournamentType ?? 'FREEZEOUT') as APITypes.TournamentType,
                buyIn: data.buyIn ?? undefined,
                rake: data.rake ?? undefined,
                startingStack: data.startingStack ?? undefined,
                hasGuarantee: data.hasGuarantee,
                guaranteeAmount: data.guaranteeAmount ?? undefined,
                
                // Blind levels (will be embedded in TournamentStructure)
                levels: data.levels?.map(l => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes,
                    smallBlind: l.smallBlind,
                    bigBlind: l.bigBlind,
                    ante: l.ante ?? undefined,
                    breakMinutes: l.breakMinutes ?? undefined,
                })) || [],
                
                // Note: Player results are not included in the save input
                // They need to be handled separately through PlayerResult mutations
                // after players are linked to their accounts
            },
        };

        const response = await client.graphql({
            query: saveTournamentData,
            variables: { input }
        });
        
        if (response.errors) {
            throw new Error(response.errors[0].message);
        }

        console.log(`[GameService] Successfully saved ${data.status} tournament to DB:`, response.data.saveTournamentData);
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
    return data.status === 'RUNNING';
};