import { useEffect } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { fetchGameDataFromBackend, saveGameDataToBackend, shouldAutoRefreshTournament } from '../services/gameService';
import type { GameState, DataSource, GameData, MissingField, GameStatus } from '../types/game';

// 5 minute polling interval
export const POLLING_INTERVAL = 5 * 60 * 1000; 

export const useGameTracker = () => {
    const { state, dispatch } = useGameContext();
    const { games } = state;

    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log(`[useGameTracker] Polling check initiated at ${new Date().toLocaleTimeString()}`);
            Object.values(games).forEach(game => {
                // Auto-refresh RUNNING tournaments that are not flagged as "doNotScrape"
                if (game.autoRefresh && game.data?.status === 'RUNNING' && !game.data.doNotScrape) {
                    console.log(`[useGameTracker] Re-fetching updates for RUNNING tournament: ${game.id}`);
                    fetchAndLoadData(game.id, game.source);
                } else if (game.autoRefresh && game.data?.doNotScrape) {
                    console.log(`[useGameTracker] Auto-refresh skipped for ${game.id} (Do Not Scrape)`);
                }
            });
        }, POLLING_INTERVAL);

        return () => clearInterval(intervalId);
    }, [games]); // Dependency on games ensures the loop always has the latest state

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
        
        // Set initial fetching status only if not auto-refreshing
        if (!game?.autoRefresh) {
            updateGameState({ id, status: 'FETCHING', errorMessage: undefined, missingFields: [] });
        }
        
        try {
            // Note: The backend will handle SCRAPING and PARSING status internally
            // We just get the final result here
            const dataFromBackend = await fetchGameDataFromBackend(id);
            
            // Console log for debugging
            console.log('[useGameTracker] Raw data from backend:', dataFromBackend);

            // Extract all fields including new structure metadata
            const isNewStructure = dataFromBackend.isNewStructure ?? undefined;
            const structureLabel = (dataFromBackend as any).structureLabel || undefined;
            const foundKeys = (dataFromBackend as any).foundKeys || [];
            
            // ✅ NEW: Extract existingGameId and doNotScrape flag
            const existingGameId = (dataFromBackend as any).existingGameId || null;
            const doNotScrape = (dataFromBackend as any).doNotScrape || false;

            console.log('[useGameTracker] Extracted isNewStructure:', isNewStructure);
            console.log('[useGameTracker] Extracted structureLabel:', structureLabel); 
            console.log('[useGameTracker] Extracted foundKeys:', foundKeys);
            console.log('[useGameTracker] Extracted existingGameId:', existingGameId);
            console.log('[useGameTracker] Extracted doNotScrape:', doNotScrape);

            // Map backend status values - convert LIVE to RUNNING
            let mappedStatus: GameStatus = 'SCHEDULED';
            const backendStatus = (dataFromBackend.status || 'SCHEDULED').toUpperCase();
            
            switch (backendStatus) {
                case 'LIVE':
                case 'RUNNING':
                    mappedStatus = 'RUNNING';
                    break;
                case 'COMPLETED':
                    mappedStatus = 'COMPLETED';
                    break;
                case 'CANCELLED':
                    mappedStatus = 'CANCELLED';
                    break;
                default:
                    mappedStatus = 'SCHEDULED';
            }

            const data: GameData = {
                name: dataFromBackend.name,
                gameStartDateTime: dataFromBackend.gameStartDateTime || undefined, // ✅ REMOVED default value
                gameEndDateTime: dataFromBackend.gameEndDateTime || undefined,
                status: mappedStatus, // Use mapped status
                type: 'TOURNAMENT', // Default to tournament for scraped games
                registrationStatus: dataFromBackend.registrationStatus || undefined,
                gameVariant: dataFromBackend.gameVariant || undefined,
                prizepool: dataFromBackend.prizepool || undefined,
                totalEntries: dataFromBackend.totalEntries || undefined,
                totalRebuys: dataFromBackend.totalRebuys || undefined,
                totalAddons: dataFromBackend.totalAddons || undefined,
                totalDuration: dataFromBackend.totalDuration || undefined,
                gameTags: dataFromBackend.gameTags || [],
                seriesName: (dataFromBackend as any).seriesName || undefined, 
                
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
                rawHtml: dataFromBackend.rawHtml || undefined,

                // Scraper metadata
                structureLabel: structureLabel,
                foundKeys: foundKeys,
                
                // ✅ NEW: Set the doNotScrape flag in the data
                doNotScrape: doNotScrape,
            };

            // Check for missing fields (same logic as before)
            const missingFields: MissingField[] = [];
            
            const gameFields: Record<string, string> = {
                // Core Game Fields
                // ✅ NEW: Add gameStartDateTime as a potential missing field
                'gameStartDateTime': 'Game start date/time not found',
                'variant': 'Game variant (e.g., NLHE) not found', 
                'seriesName': 'Series name not found on page',
                'prizepool': 'Prize pool not found on page',
                'revenueByEntries': 'Revenue calculated on save',
                'totalEntries': 'Total entries not found on page',
                'totalRebuys': 'Total rebuys not found on page',
                'totalAddons': 'Total addons not found on page',
                'totalDuration': 'Total duration not found on page',
                'gameTags': 'Game tags not found on page',
                // Tournament Specific Fields
                'tournamentType': 'Tournament type needs manual specification',
                'buyIn': 'Buy-in amount not found on page',
                'rake': 'Rake amount not available on page',
                'startingStack': 'Starting stack not found on page',
                'guaranteeAmount': 'Guarantee amount not found on page',
            };

            Object.entries(gameFields).forEach(([field, reason]) => {
                const value = (data as any)[field];
                // Check for undefined, null, or empty array
                if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
                    // Special case: hasGuarantee is bool, so check guaranteeAmount
                    if (field === 'guaranteeAmount' && data.hasGuarantee) {
                         missingFields.push({ model: 'Game', field, reason });
                    } else if (field !== 'guaranteeAmount') {
                         missingFields.push({ model: 'Game', field, reason });
                    }
                }
            });

            // TournamentStructure check
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

            // Determine if we should enable auto-refresh
            const shouldAutoRefresh = shouldAutoRefreshTournament(data);
            
            // ✅ NEW: Increment fetch count
            const newFetchCount = (game?.fetchCount || 0) + 1;

            // Always set status to READY_TO_SAVE regardless of tournament status
            // This allows users to save any tournament at any time
            updateGameState({
                id,
                data,
                status: 'READY_TO_SAVE', // Always ready to save
                lastFetched: new Date().toISOString(),
                missingFields,
                isNewStructure,
                autoRefresh: shouldAutoRefresh,
                fetchCount: newFetchCount, // ✅ Set new fetch count
                existingGameId: existingGameId, // ✅ Set existing game ID
            });

            // Log if auto-refresh is enabled
            if (shouldAutoRefresh) {
                console.log(`[useGameTracker] Auto-refresh enabled for RUNNING tournament: ${id}`);
            }

        } catch (error: any) {
            console.error('[useGameTracker] Error fetching data:', error);
            
            // ✅ NEW: Handle the "Do Not Scrape" error specifically
            const isDoNotScrapeError = error.message.includes('Scraping is disabled');
            
            updateGameState({
                id,
                status: 'ERROR',
                errorMessage: error.message || 'Failed to fetch data from backend.',
                // If this error was thrown, update the game state to reflect it
                ...(isDoNotScrapeError && {
                    data: {
                        ...(game?.data as GameData),
                        doNotScrape: true,
                    },
                    autoRefresh: false, // Turn off auto-refresh
                })
            });
        }
    };
    
    const trackGame = (id: string, source: DataSource) => {
        if (games[id] && games[id].status !== 'ERROR') {
            // If it's an error, allow re-tracking.
            // But if it's an error *because* of doNotScrape, fetchAndLoadData will handle it.
            if (games[id].errorMessage?.includes('Scraping is disabled')) {
                 // Allow re-fetch, it will just fail again and show the message
                 console.log(`[useGameTracker] Re-tracking ${id}, which is flagged as 'Do Not Scrape'.`);
            } else {
                console.log(`[useGameTracker] Game ${id} is already being tracked.`);
                return; 
            }
        }
        
        dispatch({ type: 'ADD_GAME', payload: { id, source } });
        // Use setTimeout to allow the ADD_GAME dispatch to update state
        // before fetchAndLoadData is called
        setTimeout(() => fetchAndLoadData(id, source), 0);
    };

    const saveGame = async (id: string, venueId: string) => {
        const game = games[id];
        if (!game || !game.data) {
            updateGameState({ id, status: 'ERROR', errorMessage: "No data available to save." });
            return;
        }
        
        // All tournaments can be saved regardless of their status
        console.log(`[useGameTracker] Saving ${game.data.status} tournament: ${id}`);
        
        updateGameState({ id, status: 'SAVING' });
        try {
            // ✅ NEW: Pass the existingGameId to the save function
            const result = await saveGameDataToBackend(id, venueId, game.data, game.existingGameId);
            
            updateGameState({ 
                id, 
                status: 'DONE', 
                saveResult: result,
                // ✅ NEW: After a successful save, update the existingGameId
                existingGameId: result.id,
            });
            console.log(`[useGameTracker] Successfully saved ${game.data.status} tournament: ${id}`);
        } catch (error: any) {
            updateGameState({ id, status: 'ERROR', errorMessage: `Failed to save: ${error.message}` });
        }
    };

    const removeGame = (id: string) => {
        dispatch({ type: 'REMOVE_GAME', payload: { id } });
    };

    // New function to manually refresh a specific game
    const refreshGame = (id: string) => {
        const game = games[id];
        if (game) {
            console.log(`[useGameTracker] Manual refresh requested for: ${id}`);
            fetchAndLoadData(id, game.source);
        }
    };

    return { games, trackGame, saveGame, removeGame, refreshGame };
};