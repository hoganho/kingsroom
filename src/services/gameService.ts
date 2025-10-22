// This service handles all communication with the backend (Amplify/AppSync).

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
export const saveGameDataToBackend = async (sourceUrl: string, venueId: string, data: GameData): Promise<APITypes.Game> => {
    // ✅ Generate the client inside this function as well.
    const client = generateClient();
    console.log(`[GameService] Saving data for ${sourceUrl} to database...`);
    try {
        // Prepare the input, ensuring it matches the GraphQL input type
        const input: APITypes.SaveTournamentInput = {
            sourceUrl,
            venueId,
            data: {
                name: data.name,
                gameDateTime: data.gameDateTime,
                status: data.status as APITypes.GameStatus,
                registrationStatus: data.registrationStatus,
                gameVariant: data.gameVariant,
                prizepool: data.prizepool,
                totalEntries: data.totalEntries,
                totalRebuys: data.totalRebuys,
                totalAddons: data.totalAddons,
                totalDuration: data.totalDuration,
                gameTags: data.gameTags,
                buyIn: data.buyIn,
                startingStack: data.startingStack,
                hasGuarantee: data.hasGuarantee,
                guaranteeAmount: data.guaranteeAmount,
                levels: data.levels.map(l => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes,
                    smallBlind: l.smallBlind,
                    bigBlind: l.bigBlind,
                    ante: l.ante,
                })),
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