// src/hooks/useBulkGameFetcher.ts

import { useCallback } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { fetchGameDataRangeFromBackend } from '../services/gameService';
import type { BulkGameSummary } from '../types/game';
import { GameStatus, RegistrationStatus } from '../API';
import { useEntity } from '../contexts/EntityContext';

// Type guards remain the same
const isValidGameStatus = (value: any): value is GameStatus => {
    return Object.values(GameStatus).includes(value);
};

const isValidRegistrationStatus = (value: any): value is RegistrationStatus => {
    return Object.values(RegistrationStatus).includes(value);
};

export const useBulkGameFetcher = () => {
    const { state, dispatch } = useGameContext();
    const { currentEntity } = useEntity();

    const fetchGames = useCallback(async (startId: number, endId: number) => {
        dispatch({ type: 'FETCH_SUMMARIES_START' });
        
        try {
            // Build the base URL from current entity
            const baseUrl = currentEntity 
                ? `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}`
                : '';
            
            if (!baseUrl) {
                throw new Error('No entity selected or invalid entity URL');
            }
            
            // Now pass all required arguments
            const results = await fetchGameDataRangeFromBackend(
                baseUrl,
                startId, 
                endId,
            );
            
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

            dispatch({ type: 'FETCH_SUMMARIES_SUCCESS', payload: typedSummaries });

        } catch (err: any) {
            console.error("Failed to fetch game range:", err);
            dispatch({ type: 'FETCH_SUMMARIES_ERROR', payload: err.message || 'An unknown error occurred.' });
        }
    }, [dispatch, currentEntity]);

    return { 
        summaries: state.summaries, 
        loading: state.bulkLoading, 
        error: state.bulkError, 
        fetchGames 
    };
};