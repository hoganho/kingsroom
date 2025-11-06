// hooks/useGameTracker.ts
// FINAL MERGED: Combines Entity ID support  with the
// comprehensive missingFields logic from the original file.

import { useEffect } from 'react';
import { useGameContext } from '../contexts/GameContext';
import { fetchGameDataFromBackend, saveGameDataToBackend, shouldAutoRefreshTournament, getCurrentEntityId } from '../services/gameService';
import type { GameState, GameData, MissingField, ScrapedVenueMatch } from '../types/game';
import type { DataSource } from '../API';

export const POLLING_INTERVAL = 5 * 60 * 1000; 

export const useGameTracker = () => {
    const { state, dispatch } = useGameContext();
    const { games } = state;

    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log(`[useGameTracker] Polling check initiated at ${new Date().toLocaleTimeString()}`);
            Object.values(games).forEach(game => {
                if (game.autoRefresh && game.data?.gameStatus === 'RUNNING' && !game.data.doNotScrape) {
                    console.log(`[useGameTracker] Re-fetching updates for RUNNING tournament: ${game.id}`);
                    fetchAndLoadData(game.id, game.source);
                } else if (game.autoRefresh && game.data?.doNotScrape) {
                    console.log(`[useGameTracker] Auto-refresh skipped for ${game.id} (Do Not Scrape)`);
                }
            });
        }, POLLING_INTERVAL);

        return () => clearInterval(intervalId);
    }, [games]);

    const updateJobStatus = (payload: Partial<GameState> & { id: string }) => {
        dispatch({ type: 'UPDATE_GAME_STATE', payload });
    };

    const fetchAndLoadData = async (id: string, source: DataSource) => {
        if (source !== 'SCRAPE') {
            console.log("Only SCRAPE source is configured for backend fetching.");
            updateJobStatus({ id, jobStatus: 'ERROR', errorMessage: 'Only scraping from a URL is supported.' });
            return;
        }

        const game = state.games[id];
        
        if (!game?.autoRefresh) {
            updateJobStatus({ id, jobStatus: 'FETCHING', errorMessage: undefined, missingFields: [] });
        }
        
        try {
            const dataFromBackend = await fetchGameDataFromBackend(id);
            console.log('[useGameTracker] Raw data from backend:', dataFromBackend);

            // --- MERGE ---: Kept all data extraction from enhanced file 
            const entityId = (dataFromBackend as any).entityId || getCurrentEntityId();
            const venueMatch = (dataFromBackend as any).venueMatch as ScrapedVenueMatch || null;
            const isNewStructure = dataFromBackend.isNewStructure ?? undefined;
            const structureLabel = (dataFromBackend as any).structureLabel || undefined;
            const foundKeys = (dataFromBackend as any).foundKeys || [];
            const existingGameId = (dataFromBackend as any).existingGameId || null;
            const doNotScrape = (dataFromBackend as any).doNotScrape || false;

            console.log('[useGameTracker] Extracted entityId:', entityId);

            const data: GameData = {
                name: dataFromBackend.name,
                tournamentId: dataFromBackend.tournamentId,
                entityId: entityId,
                gameStartDateTime: dataFromBackend.gameStartDateTime || undefined,
                gameEndDateTime: dataFromBackend.gameEndDateTime || undefined,
                gameStatus: (dataFromBackend as any).gameStatus || undefined,
                gameType: dataFromBackend.gameType || undefined,
                gameFrequency: dataFromBackend.gameFrequency || undefined,
                registrationStatus: (dataFromBackend as any).registrationStatus || undefined,
                gameVariant: dataFromBackend.gameVariant || undefined,
                prizepool: dataFromBackend.prizepool || undefined,
                totalEntries: dataFromBackend.totalEntries || undefined,
                revenueByBuyIns: (dataFromBackend as any).revenueByBuyIns || undefined,
                profitLoss: dataFromBackend.profitLoss || undefined,
                playersRemaining: (dataFromBackend as any).playersRemaining || undefined,
                totalChipsInPlay: (dataFromBackend as any).totalChipsInPlay || undefined,
                averagePlayerStack: (dataFromBackend as any).averagePlayerStack || undefined,
                totalRebuys: dataFromBackend.totalRebuys || undefined,
                totalAddons: dataFromBackend.totalAddons || undefined,
                totalDuration: dataFromBackend.totalDuration || undefined,
                gameTags: dataFromBackend.gameTags || [],
                seriesName: (dataFromBackend as any).seriesName || undefined,
                tournamentType: dataFromBackend.tournamentType || undefined,
                isSeries: dataFromBackend.isSeries || undefined,
                isRegular: dataFromBackend.isRegular || undefined,
                isSatellite: dataFromBackend.isSatellite || undefined,
                buyIn: dataFromBackend.buyIn || undefined,
                rake: dataFromBackend.rake || undefined,
                totalRake: dataFromBackend.totalRake || undefined,
                startingStack: dataFromBackend.startingStack || undefined,
                hasGuarantee: dataFromBackend.hasGuarantee ?? false,
                guaranteeAmount: dataFromBackend.guaranteeAmount || undefined,
                guaranteeOverlay: dataFromBackend.guaranteeOverlay || undefined,
                guaranteeSurplus: dataFromBackend.guaranteeSurplus || undefined,
                levels: dataFromBackend.levels?.map((l: any) => ({
                    levelNumber: l.levelNumber,
                    durationMinutes: l.durationMinutes || 20,
                    smallBlind: l.smallBlind || 0,
                    bigBlind: l.bigBlind || 0,
                    ante: l.ante,
                    breakMinutes: undefined
                })) ?? [],
                breaks: (dataFromBackend as any).breaks?.map((b: any) => ({
                    levelNumberBeforeBreak: b.levelNumberBeforeBreak,
                    durationMinutes: b.durationMinutes,
                })) ?? [],
                tables: (dataFromBackend as any).tables?.map((t: any) => ({
                    tableName: t.tableName,
                    seats: t.seats?.map((s: any) => ({
                        seat: s.seat,
                        isOccupied: s.isOccupied,
                        playerName: s.playerName,
                        playerStack: s.playerStack,
                    })) ?? [],
                })) ?? [],
                seating: (dataFromBackend as any).seating?.map((s: { name: string; table: number; seat: number; playerStack: number }) => ({ 
                        name: s.name, 
                        table: s.table, 
                        seat: s.seat,
                        playerStack: s.playerStack,
                })) ?? [],
                entries: (dataFromBackend as any).entries?.map((e: { name: string }) => ({ name: e.name })) ?? [],
                results: dataFromBackend.results?.map((r: any) => ({
                    name: r.name, 
                    rank: r.rank, 
                    winnings: r.winnings ?? 0,
                    points: r.points ?? 0, // ✅ Kept fix from enhanced file 
                    isQualification: r.isQualification ?? false // ✅ Kept fix from enhanced file 
                })) ?? [],
                otherDetails: {},
                rawHtml: dataFromBackend.rawHtml || undefined,
                structureLabel: structureLabel,
                foundKeys: foundKeys,
                doNotScrape: doNotScrape,
                venueMatch: venueMatch,
            };

            // Process breaks and merge with levels
            if (data.breaks && data.breaks.length > 0 && data.levels && data.levels.length > 0) {
                data.breaks.forEach(breakInfo => {
                    const levelBeforeBreak = data.levels.find(
                        level => level.levelNumber === breakInfo.levelNumberBeforeBreak
                    );
                    if (levelBeforeBreak) {
                        levelBeforeBreak.breakMinutes = breakInfo.durationMinutes;
                    }
                });
            }

            // --- MERGE ---: This entire section is rebuilt to combine the best of both files.
            const missingFields: MissingField[] = [];

            // Use the cleaner checkField helper from the enhanced file,
            // but add the array check from the old file.
            const checkField = (value: any, model: string, field: string, reason: string) => {
                if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
                    missingFields.push({ model, field, reason });
                }
            };

            // Use the comprehensive field list from the old file 
            const gameFields: Record<string, string> = {
                'gameStartDateTime': 'Game start date/time not found',
                'gameVariant': 'Game variant (e.g., NLHE) not found', // Renamed from 'variant'
                'seriesName': 'Series name not found on page',
                'prizepool': 'Prize pool not found on page',
                'revenueByBuyIns': 'Revenue calculated on save',
                'totalEntries': 'Total entries not found on page',
                'totalRebuys': 'Total rebuys not found on page',
                'totalAddons': 'Total addons not found on page',
                'totalDuration': 'Total duration not found on page',
                'gameTags': 'Game tags not found on page',
                'tournamentType': 'Tournament type needs manual specification',
                'buyIn': 'Buy-in amount not found on page',
                'rake': 'Rake amount not available on page',
                'startingStack': 'Starting stack not found on page',
                'guaranteeAmount': 'Guarantee amount not found on page',
            };

            // Use the loop logic from the old file 
            Object.entries(gameFields).forEach(([field, reason]) => {
                const value = (data as any)[field];
                
                // Keep the special guarantee check from the old file 
                if (field === 'guaranteeAmount' && data.hasGuarantee) {
                     if (value === undefined || value === null) {
                         missingFields.push({ model: 'Game', field, reason });
                     }
                } else if (field !== 'guaranteeAmount') {
                    // Use the merged helper function
                     checkField(value, 'Game', field, reason);
                }
            });

            // Keep the levels check from the old file 
            if (!data.levels || data.levels.length === 0) {
                missingFields.push({ 
                    model: 'TournamentStructure', 
                    field: 'levels', 
                    reason: 'Blind structure not found on page' 
                });
            }

            // Add the entityId check from the enhanced file 
            checkField(data.entityId, 'Entity', 'entityId', 'Entity could not be determined from URL');

            // Keep the venue check from the old file 
            if (!data.venueMatch?.autoAssignedVenue) {
                missingFields.push(
                    { model: 'Venue', field: 'all fields', reason: 'Venue must be selected manually' }
                );
            }

            // Keep the standard list (present in both files [cite: 1, 2])
            missingFields.push(
                { model: 'Player', field: 'all fields', reason: 'Player data cannot be scraped from this page' },
                { model: 'PlayerResult', field: 'player linking', reason: 'Results cannot be automatically linked to player accounts' },
                { model: 'PlayerTransaction', field: 'all fields', reason: 'Transaction data not available on page' },
                { model: 'PlayerTicket', field: 'all fields', reason: 'Ticket data not available on page' },
                { model: 'CashStructure', field: 'all fields', reason: 'Not applicable for tournaments' },
                { model: 'RakeStructure', field: 'all fields', reason: 'Not applicable for tournaments' },
            );
            // --- END OF MERGE ---

            const shouldAutoRefresh = shouldAutoRefreshTournament(data);
            const newFetchCount = (game?.fetchCount || 0) + 1;

            updateJobStatus({
                id,
                data,
                jobStatus: 'READY_TO_SAVE',
                lastFetched: new Date().toISOString(),
                missingFields,
                isNewStructure,
                autoRefresh: shouldAutoRefresh,
                fetchCount: newFetchCount,
                existingGameId: existingGameId,
                entityId: entityId, // ✅ Kept from enhanced file 
            });

            if (shouldAutoRefresh) {
                console.log(`[useGameTracker] Auto-refresh enabled for RUNNING tournament: ${id}`);
            }

        } catch (error: any) {
            console.error('[useGameTracker] Error fetching data:', error);
            const isDoNotScrapeError = error.message.includes('Scraping is disabled');
            updateJobStatus({
                id,
                jobStatus: 'ERROR',
                errorMessage: error.message || 'Failed to fetch data from backend.',
                ...(isDoNotScrapeError && {
                    data: {
                        ...(game?.data as GameData),
                        doNotScrape: true,
                    },
                    autoRefresh: false,
                })
            });
        }
    };
    
    // --- MERGE ---: Kept enhanced trackGame function 
    const trackGame = (id: string, source: DataSource, entityId?: string) => {
        if (games[id] && games[id].jobStatus !== 'ERROR') {
            if (games[id].errorMessage?.includes('Scraping is disabled')) {
                 console.log(`[useGameTracker] Re-tracking ${id}, which is flagged as 'Do Not Scrape'.`);
            } else {
                console.log(`[useGameTracker] Game ${id} is already being tracked.`);
                return; 
            }
        }
        
        // ✅ Add game with entity ID
        dispatch({ 
            type: 'ADD_GAME', 
            payload: { 
                id, 
                source,
                entityId: entityId || getCurrentEntityId() 
            } as any
        });
        
        setTimeout(() => fetchAndLoadData(id, source), 0);
    };

    // --- MERGE ---: Kept enhanced saveGame function 
    const saveGame = async (id: string, venueId?: string, entityId?: string) => {
        const game = games[id];
        if (!game || !game.data) {
            updateJobStatus({ id, jobStatus: 'ERROR', errorMessage: "No data available to save." });
            return;
        }
        
        // Handle auto-assignment (present in both files [cite: 1, 2])
        let finalVenueId = venueId;
        if (!finalVenueId && game.data.venueMatch?.autoAssignedVenue?.id) {
            console.log(`[useGameTracker] No venue selected, using auto-assigned venue: ${game.data.venueMatch.autoAssignedVenue.name}`);
            finalVenueId = game.data.venueMatch.autoAssignedVenue.id;
        }
        
        // ✅ Use entity ID from game state or parameter 
        const finalEntityId = entityId || game.entityId || game.data.entityId || getCurrentEntityId();
        
        console.log(`[useGameTracker] Saving ${game.data.gameStatus} tournament: ${id} with entity: ${finalEntityId}`);
        updateJobStatus({ id, jobStatus: 'SAVING' });
        
        try {
            const result = await saveGameDataToBackend(
                id, 
                finalVenueId, 
                game.data, 
                game.existingGameId,
                finalEntityId // ✅ Pass entity ID to save 
            );
            
            updateJobStatus({ 
                id, 
                jobStatus: 'DONE', 
                saveResult: result,
                existingGameId: result.id,
                entityId: result.entityId // ✅ Store saved entity ID 
            });
            
            console.log(`[useGameTracker] Successfully saved ${game.data.gameStatus} tournament: ${id}`);
        } catch (error: any) {
            updateJobStatus({ id, jobStatus: 'ERROR', errorMessage: `Failed to save: ${error.message}` });
        }
    };

    const removeGame = (id: string) => {
        dispatch({ type: 'REMOVE_GAME', payload: { id } });
    };

    const refreshGame = (id: string) => {
        const game = games[id];
        if (game) {
            console.log(`[useGameTracker] Manual refresh requested for: ${id}`);
            fetchAndLoadData(id, game.source);
        }
    };

    // --- MERGE ---: Kept new functions from enhanced file 
    const getGamesByEntity = (entityId?: string): GameState[] => {
        const targetEntityId = entityId || getCurrentEntityId();
        return Object.values(games).filter(game => 
            game.entityId === targetEntityId || 
            game.data?.entityId === targetEntityId
        );
    };

    const validateEntityConsistency = (): string[] => {
        const errors: string[] = [];
        const currentEntityId = getCurrentEntityId();
        
        Object.values(games).forEach(game => {
            if (game.data && game.data.entityId !== currentEntityId) {
                errors.push(`Game ${game.id} has mismatched entity ID: ${game.data.entityId} vs ${currentEntityId}`);
            }
        });
        
        return errors;
    };

    // --- MERGE ---: Kept enhanced return object 
    return { 
        games, 
        trackGame, 
        saveGame, 
        removeGame, 
        refreshGame,
        getGamesByEntity,
        validateEntityConsistency
    };
};