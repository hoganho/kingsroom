import React, { createContext, useReducer, Dispatch, useContext } from 'react';
import type { GameState, DataSource } from '../types/game';

// Define the shape of our global state
type GlobalState = {
    games: Record<string, GameState>; // A dictionary of games, keyed by ID
};

// Define the actions that can be dispatched to update the state
type GameAction =
    | { type: 'ADD_GAME'; payload: { id: string; source: DataSource } }
    | { type: 'UPDATE_GAME_STATE'; payload: Partial<GameState> & { id: string } }
    | { type: 'REMOVE_GAME'; payload: { id: string } }
    | { type: 'TOGGLE_AUTO_REFRESH'; payload: { id: string; enabled: boolean } };

// The reducer function handles state transitions based on dispatched actions
const gameReducer = (state: GlobalState, action: GameAction): GlobalState => {
    switch (action.type) {
        case 'ADD_GAME':
            const newGame: GameState = {
                id: action.payload.id,
                source: action.payload.source,
                status: 'IDLE',
                autoRefresh: false, // Default to false
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
            
        default:
            return state;
    }
};

const initialState: GlobalState = {
    games: {},
};

// Create the context
export const GameContext = createContext<{
    state: GlobalState;
    dispatch: Dispatch<GameAction>;
}>({
    state: initialState,
    dispatch: () => null,
});

// Create the provider component
export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(gameReducer, initialState);

    return (
        <GameContext.Provider value={{ state, dispatch }}>
            {children}
        </GameContext.Provider>
    );
};

// Custom hook to easily access the context
export const useGameContext = () => useContext(GameContext);