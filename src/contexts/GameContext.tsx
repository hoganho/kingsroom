// src/contexts/GameContext.tsx

import React, { createContext, useReducer, Dispatch, useContext } from 'react';
// ✅ 1. Import BulkGameSummary type
import type { GameState, BulkGameSummary } from '../types/game';
import type { DataSource } from '../API';

// ✅ 2. Add bulk scraper state to GlobalState
type GlobalState = {
    games: Record<string, GameState>; // For single tracking
    summaries: BulkGameSummary[];      // For bulk results
    bulkLoading: boolean;              // Loading state for bulk fetch
    bulkError: string | null;          // Error state for bulk fetch
};

// ✅ 3. Add new actions for the bulk scraper
type GameAction =
    | { type: 'ADD_GAME'; payload: { id: string; source: DataSource } }
    | { type: 'UPDATE_GAME_STATE'; payload: Partial<GameState> & { id: string } }
    | { type: 'REMOVE_GAME'; payload: { id: string } }
    | { type: 'TOGGLE_AUTO_REFRESH'; payload: { id: string; enabled: boolean } }
    | { type: 'FETCH_SUMMARIES_START' }
    | { type: 'FETCH_SUMMARIES_SUCCESS'; payload: BulkGameSummary[] }
    | { type: 'FETCH_SUMMARIES_ERROR'; payload: string };

// ✅ 4. Update the reducer to handle the new actions
const gameReducer = (state: GlobalState, action: GameAction): GlobalState => {
    switch (action.type) {
        case 'ADD_GAME':
            const newGame: GameState = {
                id: action.payload.id,
                source: action.payload.source,
                jobStatus: 'IDLE',
                autoRefresh: false,
                fetchCount: 0,
                existingGameId: null,
            };
            return {
                ...state,
                games: {
                    ...state.games,
                    [newGame.id]: newGame,
                },
            };
            
        case 'UPDATE_GAME_STATE':
            const { id, ...updates } = action.payload;
            if (!state.games[id]) return state;
            return {
                ...state,
                games: {
                    ...state.games,
                    [id]: {
                        ...state.games[id],
                        ...updates,
                    },
                },
            };
            
        case 'REMOVE_GAME':
            const { [action.payload.id]: _, ...remainingGames } = state.games;
            return {
                ...state,
                games: remainingGames,
            };
            
        case 'TOGGLE_AUTO_REFRESH':
            if (!state.games[action.payload.id]) return state;
            return {
                ...state,
                games: {
                    ...state.games,
                    [action.payload.id]: {
                        ...state.games[action.payload.id],
                        autoRefresh: action.payload.enabled,
                    },
                },
            };

        // ✅ 5. Add cases for bulk fetching logic
        case 'FETCH_SUMMARIES_START':
            return {
                ...state,
                bulkLoading: true,
                bulkError: null,
            };
        case 'FETCH_SUMMARIES_SUCCESS':
            return {
                ...state,
                bulkLoading: false,
                summaries: action.payload,
            };
        case 'FETCH_SUMMARIES_ERROR':
            return {
                ...state,
                bulkLoading: false,
                bulkError: action.payload,
            };
            
        default:
            return state;
    }
};

// ✅ 6. Update the initial state to include the new properties
const initialState: GlobalState = {
    games: {},
    summaries: [],
    bulkLoading: false,
    bulkError: null,
};

// The rest of your file stays the same
export const GameContext = createContext<{
    state: GlobalState;
    dispatch: Dispatch<GameAction>;
}>({
    state: initialState,
    dispatch: () => null,
});

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(gameReducer, initialState);

    return (
        <GameContext.Provider value={{ state, dispatch }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGameContext = () => useContext(GameContext);