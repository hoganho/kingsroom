// Updated service to handle refactored schema

import { generateClient } from 'aws-amplify/api';
import { fetchTournamentData, saveTournamentData } from '../graphql/mutations';
import * as APITypes from '../API';
import type { GameData } from '../types/game';

/**
 * Calls the backend Lambda to fetch and parse tournament data without saving.
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
        return response.data.fetchTournamentData as APITypes.ScrapedGameData;
    } catch (error) {
        console.error('[GameService] Error fetching data from backend:', error);
        throw error;
    }
};

/**
 * Calls the backend Lambda to save or update tournament data.
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
    console.log(`[GameService] Saving data for ${sourceUrl} to database...`);
    
    try {
        // Prepare the input matching the refactored schema
        const input: APITypes.SaveTournamentInput = { // ✅ Use the generated type for safety
            sourceUrl,
            venueId,
            data: {
                name: data.name,
                gameDateTime: data.gameDateTime,
                // ✅ FIX: Cast the status string to the GameStatus enum type
                status: data.status as APITypes.GameStatus, 
                // ✅ FIX: Use nullish coalescing (??) to convert null to undefined
                registrationStatus: data.registrationStatus ?? undefined,
                gameVariant: data.gameVariant ?? undefined,
                prizepool: data.prizepool ?? undefined,
                totalEntries: data.totalEntries ?? undefined,
                totalRebuys: data.totalRebuys ?? undefined,
                totalAddons: data.totalAddons ?? undefined,
                totalDuration: data.totalDuration ?? undefined,
                gameTags: data.gameTags?.filter((tag): tag is string => tag !== null) ?? [], // Remove nulls from the array
                
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
                    ante: l.ante ?? undefined, // ✅ FIX: Convert null to undefined
                    breakMinutes: l.breakMinutes ?? undefined,
                })) || [],
            },
        };

        const response = await client.graphql({
            query: saveTournamentData,
            variables: { input }
        });
        
        if (response.errors) {
            throw new Error(response.errors[0].message);
        }

        console.log('[GameService] Successfully saved to DB:', response.data.saveTournamentData);
        return response.data.saveTournamentData as APITypes.Game;
    } catch (error) {
        console.error('[GameService] Error saving to DB:', error);
        throw error;
    }
};