import { useState } from 'react';
import type { BulkGameSummary } from '../types/game';
import { fetchGameDataRangeFromBackend } from '../services/gameService';

export const useBulkGameFetcher = () => {
    const [games, setGames] = useState<BulkGameSummary[]>([]);
    const [status, setStatus] = useState<'IDLE' | 'FETCHING' | 'DONE' | 'ERROR'>('IDLE');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const fetchRange = async (startId: number, endId: number) => {
        setStatus('FETCHING');
        setErrorMessage(null);
        setGames([]); // Clear previous results
        try {
            const results = await fetchGameDataRangeFromBackend(startId, endId);
            // ✅ FIX: Provide a fallback empty array to prevent setting state to null/undefined
            setGames(results || []);
            setStatus('DONE');
        } catch (error: any) {
            setErrorMessage(error.message || 'An unknown error occurred.');
            setStatus('ERROR');
        }
    };

    return { games, status, errorMessage, fetchRange };
};