import { useEffect } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { fetchGameDataFromBackend, saveGameDataToBackend } from '../services/gameService';
import type { GameState, DataSource, GameData, MissingField } from '../types/game';

const POLLING_INTERVAL = 5 * 60 * 1000;

export const useGameTracker = () => {
    const { state, dispatch } = useGameContext();
    const { games } = state;

    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log(`[useGameTracker] Polling check initiated at ${new Date().toLocaleTimeString()}`);
            Object.values(games).forEach(game => {
                if (game.status === 'LIVE') {
                    console.log(`[useGameTracker] Re-fetching updates for LIVE game: ${game.id}`);
                    fetchAndLoadData(game.id, game.source);
                }
            });
        }, POLLING_INTERVAL);

        return () => clearInterval(intervalId);
    }, [games]);

    const updateGameState = (payload: Partial<GameState> & { id: string }) => {
        dispatch({ type: 'UPDATE_GAME_STATE', payload });
    };

    const fetchAndLoadData = async (id: string, source: DataSource) => {
        if (source !== 'SCRAPE') {
            console.log("Only SCRAPE source is configured for backend fetching.");
            updateGameState({ id, status: 'ERROR', errorMessage: 'Only scraping from a URL is supported.' });
            return;
        }

        const game = state.games[id];
        if (game?.status !== 'LIVE') {
            updateGameState({ id, status: 'FETCHING', errorMessage: undefined, missingFields: [] });
        }
        
        try {
            const dataFromBackend = await fetchGameDataFromBackend(id);
            
            const data: GameData = {
                name: dataFromBackend.name,
                gameDateTime: dataFromBackend.gameDateTime || new Date().toISOString(),
                status: dataFromBackend.status || 'SCHEDULED',
                type: 'TOURNAMENT', // Default to tournament for scraped games
                registrationStatus: dataFromBackend.registrationStatus || undefined,
                gameVariant: dataFromBackend.gameVariant || undefined,
                prizepool: dataFromBackend.prizepool || undefined,
                totalEntries: dataFromBackend.totalEntries || undefined,
                totalRebuys: dataFromBackend.totalRebuys || undefined,
                totalAddons: dataFromBackend.totalAddons || undefined,
                totalDuration: dataFromBackend.totalDuration || undefined,
                gameTags: dataFromBackend.gameTags || [],
                
                // Tournament-specific fields (now directly on Game)
                tournamentType: 'FREEZEOUT', // Default, could be determined from tags
                buyIn: dataFromBackend.buyIn || undefined,
                rake: undefined, // Rake typically not scraped, needs manual input
                startingStack: dataFromBackend.startingStack || undefined,
                hasGuarantee: dataFromBackend.hasGuarantee ?? false,
                guaranteeAmount: dataFromBackend.guaranteeAmount || undefined,
                
                // Blind levels
                levels: dataFromBackend.levels?.map(l => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes || 20,
                    smallBlind: l.smallBlind || 0,
                    bigBlind: l.bigBlind || 0,
                    ante: l.ante,
                    breakMinutes: undefined
                })) ?? [],
                
                // Player results
                results: dataFromBackend.results?.map(r => ({ 
                    name: r.name, 
                    rank: r.rank, 
                    winnings: r.winnings ?? 0 
                })) ?? [],
                
                otherDetails: {},
                rawHtml: dataFromBackend.rawHtml || undefined
            };

            // Updated missing fields check for refactored schema
            const missingFields: MissingField[] = [];
            
            // Game model fields (including tournament-specific ones)
            const gameFields: Record<string, string> = {
                'prizepool': 'Prize pool not found on page',
                'totalEntries': 'Total entries not found on page',
                'totalRebuys': 'Total rebuys not found on page',
                'totalAddons': 'Total addons not found on page',
                'tournamentType': 'Tournament type needs manual specification',
                'rake': 'Rake amount not available on page',
            };

            Object.entries(gameFields).forEach(([field, reason]) => {
                if ((data as any)[field] === undefined || (data as any)[field] === null) {
                    missingFields.push({ model: 'Game', field, reason });
                }
            });

            // TournamentStructure is now simplified - just check if we have levels
            if (!data.levels || data.levels.length === 0) {
                missingFields.push({ 
                    model: 'TournamentStructure', 
                    field: 'levels', 
                    reason: 'Blind structure not found on page' 
                });
            }

            // Add fields that always require manual input
            missingFields.push(
                { model: 'Venue', field: 'all fields', reason: 'Venue must be selected manually' },
                { model: 'Player', field: 'all fields', reason: 'Player data cannot be scraped from this page' },
                { model: 'PlayerResult', field: 'player linking', reason: 'Results cannot be automatically linked to player accounts' },
                { model: 'PlayerTransaction', field: 'all fields', reason: 'Transaction data not available on page' },
                { model: 'PlayerTicket', field: 'all fields', reason: 'Ticket data not available on page' },
                { model: 'CashStructure', field: 'all fields', reason: 'Not applicable for tournaments' },
                { model: 'RakeStructure', field: 'all fields', reason: 'Not applicable for tournaments' },
            );

            const isLive = data.status.toUpperCase() === 'LIVE';

            updateGameState({
                id,
                data,
                status: isLive ? 'LIVE' : 'READY_TO_SAVE', 
                lastFetched: new Date().toISOString(),
                missingFields,
            });

        } catch (error: any) {
            console.error('[useGameTracker] Error fetching data:', error);
            updateGameState({
                id,
                status: 'ERROR',
                errorMessage: error.message || 'Failed to fetch data from backend.',
            });
        }
    };
    
    const trackGame = (id: string, source: DataSource) => {
        if (games[id] && games[id].status !== 'ERROR') {
            console.log(`[useGameTracker] Game ${id} is already being tracked.`);
            return; 
        }
        
        dispatch({ type: 'ADD_GAME', payload: { id, source } });
        setTimeout(() => fetchAndLoadData(id, source), 0);
    };

    const saveGame = async (id: string, venueId: string) => {
        const game = games[id];
        if (!game || !game.data) {
            updateGameState({ id, status: 'ERROR', errorMessage: "No data available to save." });
            return;
        }
        
        updateGameState({ id, status: 'SAVING' });
        try {
            const result = await saveGameDataToBackend(id, venueId, game.data);
            updateGameState({ id, status: 'DONE', saveResult: result });
        } catch (error: any) {
            updateGameState({ id, status: 'ERROR', errorMessage: `Failed to save: ${error.message}` });
        }
    };

    const removeGame = (id: string) => {
        dispatch({ type: 'REMOVE_GAME', payload: { id } });
    };

    return { games, trackGame, saveGame, removeGame };
};