// src/hooks/useBulkGameFetcher.ts

import { useCallback } from 'react';
import { useGameContext } from '../contexts/GameContext'; // 👈 Import your context hook
import { fetchGameDataRangeFromBackend } from '../services/gameService';
import type { BulkGameSummary } from '../types/game';
import { GameStatus, RegistrationStatus } from '../API';

// Type guards remain the same
const isValidGameStatus = (value: any): value is GameStatus => {
    return Object.values(GameStatus).includes(value);
};

const isValidRegistrationStatus = (value: any): value is RegistrationStatus => {
    return Object.values(RegistrationStatus).includes(value);
};

export const useBulkGameFetcher = () => {
    // ✅ Get state and dispatch from the global context
    const { state, dispatch } = useGameContext();

    const fetchGames = useCallback(async (startId: number, endId: number) => {
        // ✅ Dispatch action to show loading spinner
        dispatch({ type: 'FETCH_SUMMARIES_START' });
        try {
            const results = await fetchGameDataRangeFromBackend(startId, endId);
            
            const typedSummaries: BulkGameSummary[] = results?.map((res: any) => ({
                id: res.id,
                name: res.name || null,
                gameStatus: isValidGameStatus(res.gameStatus) ? res.gameStatus : undefined,
                registrationStatus: isValidRegistrationStatus(res.registrationStatus) ? res.registrationStatus : undefined,
                gameStartDateTime: res.gameStartDateTime || null,
                inDatabase: res.inDatabase || false,
                doNotScrape: res.doNotScrape || false,
                error: res.error || null,
            })) || [];

            // ✅ Dispatch action with the fetched data on success
            dispatch({ type: 'FETCH_SUMMARIES_SUCCESS', payload: typedSummaries });

        } catch (err: any) {
            console.error("Failed to fetch game range:", err);
            // ✅ Dispatch action with the error message on failure
            dispatch({ type: 'FETCH_SUMMARIES_ERROR', payload: err.message || 'An unknown error occurred.' });
        }
    }, [dispatch]); // Dependency array now only needs dispatch

    // ✅ Return the state from the global context
    return { 
        summaries: state.summaries, 
        loading: state.bulkLoading, 
        error: state.bulkError, 
        fetchGames 
    };
};