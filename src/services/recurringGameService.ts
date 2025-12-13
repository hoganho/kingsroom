// src/services/recurringGameService.ts
import { generateClient } from 'aws-amplify/api';
import { listRecurringGames } from '../graphql/queries';
import { 
    createRecurringGame, 
    updateRecurringGame, 
} from '../graphql/mutations';
import type { RecurringGame, CreateRecurringGameInput, UpdateRecurringGameInput } from '../API';

// ✅ FIX: Lazy client initialization to avoid "Amplify not configured" warning
let _client: any = null;
const getClient = () => {
    if (!_client) {
        _client = generateClient();
    }
    return _client;
};

export const fetchRecurringGames = async (entityId: string): Promise<RecurringGame[]> => {
    try {
        const response = await getClient().graphql({
            query: listRecurringGames,
            variables: {
                filter: {
                    entityId: { eq: entityId }
                },
                limit: 1000
            }
        }) as any;
        return response.data.listRecurringGames.items;
    } catch (error) {
        console.error('Error fetching recurring games:', error);
        throw error;
    }
};

export const createNewRecurringGame = async (input: CreateRecurringGameInput): Promise<RecurringGame> => {
    try {
        const response = await getClient().graphql({
            query: createRecurringGame,
            variables: { input }
        }) as any;
        return response.data.createRecurringGame;
    } catch (error) {
        console.error('Error creating recurring game:', error);
        throw error;
    }
};

export const updateExistingRecurringGame = async (input: UpdateRecurringGameInput): Promise<RecurringGame> => {
    try {
        const response = await getClient().graphql({
            query: updateRecurringGame,
            variables: { input }
        }) as any;
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error updating recurring game:', error);
        throw error;
    }
};

export const deactivateGame = async (id: string, reason?: string): Promise<RecurringGame> => {
    try {
        // Fallback to updateRecurringGame if deactivate isn't generated yet
        const response = await getClient().graphql({
            query: updateRecurringGame,
            variables: { 
                input: { 
                    id, 
                    isActive: false,
                    notes: reason ? `Deactivated: ${reason}` : undefined
                } 
            }
        }) as any;
        return response.data.updateRecurringGame;
    } catch (error) {
        console.error('Error deactivating recurring game:', error);
        throw error;
    }
};