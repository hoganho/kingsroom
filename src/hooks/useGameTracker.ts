// src/hooks/useGameTracker.ts
// REFACTORED: Uses local state management with manual saving.
// Fixed all TypeScript errors while maintaining full functionality

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { DataSource, ScrapedGameData, GameStatus, RegistrationStatus } from '../API';
import type { GameData, GameState, JobStatus } from '../types/game';
import { fetchGameDataFromBackend, saveGameDataToBackend, shouldAutoRefreshTournament } from '../services/gameService';

// Export POLLING_INTERVAL for use in components
export const POLLING_INTERVAL = 120000; // 2 minutes

interface TrackedGame extends GameState {
    updateAvailable?: boolean;
    s3Key?: string;
    fromS3?: boolean;
    lastCheckedForUpdates?: Date;
}

interface TrackOptions {
    forceSource?: 'S3' | 'LIVE';
    s3Key?: string;
}

interface UseGameTrackerReturn {
    games: Record<string, TrackedGame>;
    trackGame: (url: string, source: DataSource, entityId: string, options?: TrackOptions) => void;
    trackGameWithModal: (url: string, source: DataSource, entityId: string) => void;
    saveGame: (gameId: string, venueId: string, entityId: string) => void;
    removeGame: (gameId: string) => void;
    refreshGame: (gameId: string, options?: TrackOptions) => void;
    updateGameStatus: (gameId: string, status: JobStatus) => void;
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    modalGameInfo: { url: string; source: DataSource; entityId: string } | null;
}

const client = generateClient();

/**
 * Helper function to convert ScrapedGameData to GameData
 * This handles the type differences between API response and local types
 */
const convertScrapedToGameData = (scraped: ScrapedGameData): GameData => {
    // Handle all the nullable/undefined types properly
    const gameStatus = scraped.gameStatus || 'SCHEDULED' as GameStatus;
    
    return {
        // Basic game information
        name: scraped.name || '',
        tournamentId: scraped.tournamentId || 0,
        gameStartDateTime: scraped.gameStartDateTime || undefined,
        gameEndDateTime: scraped.gameEndDateTime || undefined,
        gameStatus: gameStatus, // Now guaranteed to be GameStatus
        gameType: scraped.gameType || undefined,
        venueId: undefined, // venueId doesn't exist on ScrapedGameData
        entityId: scraped.entityId || undefined,
        gameVariant: scraped.gameVariant || undefined,
        gameFrequency: scraped.gameFrequency || undefined,
        isSeries: scraped.isSeries || undefined,
        isRegular: scraped.isRegular || undefined,
        isSatellite: scraped.isSatellite || undefined,
        
        // Game state and metadata - handle RegistrationStatus type
        registrationStatus: (scraped.registrationStatus as RegistrationStatus) || undefined,
        prizepool: scraped.prizepool || undefined,
        totalEntries: scraped.totalEntries || undefined,
        playersRemaining: scraped.playersRemaining || undefined,
        totalChipsInPlay: scraped.totalChipsInPlay || undefined,
        averagePlayerStack: scraped.averagePlayerStack || undefined,
        totalRebuys: scraped.totalRebuys || undefined,
        totalAddons: scraped.totalAddons || undefined,
        totalDuration: scraped.totalDuration || undefined,
        gameTags: scraped.gameTags || undefined,
        seriesName: scraped.seriesName || undefined,
        revenueByBuyIns: scraped.revenueByBuyIns || undefined,
        profitLoss: scraped.profitLoss || undefined,

        // Tournament-specific fields
        tournamentType: scraped.tournamentType || undefined,
        buyIn: scraped.buyIn || undefined,
        rake: scraped.rake || undefined,
        totalRake: scraped.totalRake || undefined,
        startingStack: scraped.startingStack || undefined,
        hasGuarantee: scraped.hasGuarantee || false,
        guaranteeAmount: scraped.guaranteeAmount || undefined,
        guaranteeOverlay: scraped.guaranteeOverlay || undefined,
        guaranteeSurplus: scraped.guaranteeSurplus || undefined,

        // Blind structure - handle undefined/null values properly
        levels: scraped.levels?.map(level => ({
            levelNumber: level.levelNumber || 0,
            durationMinutes: level.durationMinutes || 0,
            smallBlind: level.smallBlind || 0,
            bigBlind: level.bigBlind || 0,
            ante: level.ante || undefined,
            breakMinutes: undefined // breakMinutes doesn't exist on ScrapedTournamentLevel
        })) || [],
        
        // Player data - handle nullable types in nested objects
        results: scraped.results?.map(result => ({
            rank: result.rank || 0,
            name: result.name || '',
            winnings: result.winnings || 0, // Convert null/undefined to 0
            points: result.points || undefined,
            isQualification: result.isQualification || undefined
        })) || undefined,
        
        entries: scraped.entries || undefined,
        
        seating: scraped.seating?.map(seat => ({
            name: seat.name || '',
            table: seat.table || 0, // Convert null/undefined to 0
            seat: seat.seat || 0,
            playerStack: seat.playerStack || undefined
        })) || undefined,
        
        breaks: scraped.breaks?.map(breakData => ({
            levelNumberBeforeBreak: breakData.levelNumberBeforeBreak || 0,
            durationMinutes: breakData.durationMinutes || 0 // Convert null/undefined to 0
        })) || undefined,
        
        tables: scraped.tables?.map(table => ({
            tableName: table.tableName || '',
            seats: table.seats?.map(seat => ({
                seat: seat.seat || 0,
                isOccupied: seat.isOccupied || false,
                playerName: seat.playerName || undefined,
                playerStack: seat.playerStack || undefined
            })) || []
        })) || undefined,

        // Additional data - otherDetails doesn't exist on ScrapedGameData
        rawHtml: scraped.rawHtml || undefined,

        // Scraper metadata - handle null values in array
        structureLabel: scraped.structureLabel || undefined,
        foundKeys: scraped.foundKeys?.filter((key): key is string => key !== null) || undefined,
        doNotScrape: scraped.doNotScrape || undefined,
        venueMatch: scraped.venueMatch || undefined,
        s3Key: (scraped as any).s3Key || ''

    };
};

export const useGameTracker = (): UseGameTrackerReturn => {
    const [games, setGames] = useState<Record<string, TrackedGame>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalGameInfo, setModalGameInfo] = useState<{
        url: string;
        source: DataSource;
        entityId: string;
    } | null>(null);
    
    const autoRefreshTimers = useRef<Record<string, NodeJS.Timeout>>({});

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            Object.values(autoRefreshTimers.current).forEach(timer => clearInterval(timer));
        };
    }, []);

    // Helper to fetch tournament data from S3
    const fetchFromS3 = async (url: string, s3Key?: string): Promise<ScrapedGameData> => {
        console.log(`[useGameTracker] Fetching from S3 for ${url}`);
        
        try {
            // If we have a specific S3 key, use reScrapeFromCache
            if (s3Key) {
                const response = await client.graphql({
                    query: /* GraphQL */ `
                        mutation ReScrapeFromCache($input: ReScrapeFromCacheInput!) {
                            reScrapeFromCache(input: $input) {
                                name
                                tournamentId
                                gameStartDateTime
                                gameEndDateTime
                                gameStatus
                                registrationStatus
                                gameType
                                gameVariant
                                tournamentType
                                prizepool
                                buyIn
                                rake
                                startingStack
                                hasGuarantee
                                guaranteeAmount
                                totalEntries
                                totalRebuys
                                totalAddons
                                totalDuration
                                playersRemaining
                                seriesName
                                gameTags
                                venueMatch {
                                    autoAssignedVenue {
                                        id
                                        name
                                        score
                                    }
                                    suggestions {
                                        id
                                        name
                                        score
                                    }
                                }
                                existingGameId
                                doNotScrape
                                sourceUrl
                                s3Key
                                reScrapedAt
                                entityId
                            }
                        }
                    `,
                    variables: { 
                        input: {
                            s3Key: s3Key,
                            saveToDatabase: false
                        }
                    }
                });
                
                if ('data' in response && response.data?.reScrapeFromCache) {
                    return response.data.reScrapeFromCache as ScrapedGameData;
                }
            }
            
            throw new Error('No S3 key provided or fetch failed');
        } catch (error) {
            console.error('[useGameTracker] Error fetching from S3:', error);
            throw error;
        }
    };

    // Core tracking function with source option
    const trackGameCore = useCallback(async (
        url: string, 
        source: DataSource, 
        entityId: string,
        options?: TrackOptions
    ) => {
        console.log(`[useGameTracker] Tracking game: ${url}, source: ${options?.forceSource || 'AUTO'}`);
        
        // Initialize game state
        setGames(prev => ({
            ...prev,
            [url]: {
                id: url,
                source,
                jobStatus: 'FETCHING',
                fetchCount: (prev[url]?.fetchCount || 0) + 1,
                entityId,
                existingGameId: prev[url]?.existingGameId || null,
                autoRefresh: false
            }
        }));

        try {
            let scrapedData: ScrapedGameData;
            
            if (options?.forceSource === 'S3' && options.s3Key) {
                // Fetch from S3
                scrapedData = await fetchFromS3(url, options.s3Key);
                
                // Mark as coming from S3
                setGames(prev => ({
                    ...prev,
                    [url]: {
                        ...prev[url],
                        s3Key: options.s3Key,
                        fromS3: true
                    }
                }));
            } else {
                // Fetch from live page (existing logic)
                scrapedData = await fetchGameDataFromBackend(url, entityId);
                
                setGames(prev => ({
                    ...prev,
                    [url]: {
                        ...prev[url],
                        fromS3: false
                    }
                }));
            }

            // Convert ScrapedGameData to GameData
            const data = convertScrapedToGameData(scrapedData);
            
            // Extract properties that exist on ScrapedGameData but not GameData
            const existingGameId = scrapedData.existingGameId || null;
            const s3Key = (scrapedData as any).s3Key || options?.s3Key || undefined;

            // Update game state with fetched data
            setGames(prev => ({
                ...prev,
                [url]: {
                    ...prev[url],
                    jobStatus: 'READY_TO_SAVE',
                    data,
                    existingGameId,
                    s3Key,
                    lastFetched: new Date().toISOString()
                }
            }));

            // Setup auto-refresh if needed (only for live data)
            if (options?.forceSource !== 'S3' && shouldAutoRefreshTournament(data)) {
                console.log(`[useGameTracker] Setting up auto-refresh for ${url}`);
                setGames(prev => ({
                    ...prev,
                    [url]: { ...prev[url], autoRefresh: true }
                }));
                
                // Clear existing timer
                if (autoRefreshTimers.current[url]) {
                    clearInterval(autoRefreshTimers.current[url]);
                }
                
                // Set new timer using POLLING_INTERVAL
                autoRefreshTimers.current[url] = setInterval(() => {
                    refreshGame(url, { forceSource: 'LIVE' });
                }, POLLING_INTERVAL);
            }
        } catch (error) {
            console.error('[useGameTracker] Error tracking game:', error);
            setGames(prev => ({
                ...prev,
                [url]: {
                    ...prev[url],
                    jobStatus: 'ERROR',
                    errorMessage: error instanceof Error ? error.message : 'Failed to fetch game data'
                }
            }));
        }
    }, []);

    // Public tracking function that shows modal
    const trackGameWithModal = useCallback((
        url: string,
        source: DataSource,
        entityId: string
    ) => {
        setModalGameInfo({ url, source, entityId });
        setIsModalOpen(true);
    }, []);

    // Public tracking function without modal
    const trackGame = useCallback((
        url: string,
        source: DataSource,
        entityId: string,
        options?: TrackOptions
    ) => {
        trackGameCore(url, source, entityId, options);
    }, [trackGameCore]);

    // Save game to database
    const saveGame = useCallback(async (
        gameId: string,
        venueId: string,
        entityId: string
    ) => {
        const game = games[gameId];
        if (!game || !game.data) {
            console.error('[useGameTracker] Cannot save: Game data not found');
            return;
        }

        console.log(`[useGameTracker] Saving game ${gameId} with venue ${venueId}`);
        setGames(prev => ({
            ...prev,
            [gameId]: { ...prev[gameId], jobStatus: 'SAVING' }
        }));

        try {
            const result = await saveGameDataToBackend(
                gameId,
                venueId,
                game.data,
                game.existingGameId,
                entityId
            );

            setGames(prev => ({
                ...prev,
                [gameId]: {
                    ...prev[gameId],
                    jobStatus: 'DONE',
                    saveResult: result
                }
            }));

            console.log('[useGameTracker] Game saved successfully:', result);
            
            // Clear auto-refresh timer after successful save
            if (autoRefreshTimers.current[gameId]) {
                clearInterval(autoRefreshTimers.current[gameId]);
                delete autoRefreshTimers.current[gameId];
                setGames(prev => ({
                    ...prev,
                    [gameId]: { ...prev[gameId], autoRefresh: false }
                }));
            }
        } catch (error) {
            console.error('[useGameTracker] Error saving game:', error);
            setGames(prev => ({
                ...prev,
                [gameId]: {
                    ...prev[gameId],
                    jobStatus: 'ERROR',
                    errorMessage: error instanceof Error ? error.message : 'Failed to save game'
                }
            }));
        }
    }, [games]);

    // Refresh game data
    const refreshGame = useCallback((gameId: string, options?: TrackOptions) => {
        const game = games[gameId];
        if (!game) {
            console.error('[useGameTracker] Cannot refresh: Game not found');
            return;
        }
        
        console.log(`[useGameTracker] Refreshing game: ${gameId}`);
        trackGameCore(gameId, game.source, game.entityId || '', options);
    }, [games, trackGameCore]);

    // Remove game from tracking
    const removeGame = useCallback((gameId: string) => {
        console.log(`[useGameTracker] Removing game: ${gameId}`);
        
        // Clear auto-refresh timer
        if (autoRefreshTimers.current[gameId]) {
            clearInterval(autoRefreshTimers.current[gameId]);
            delete autoRefreshTimers.current[gameId];
        }
        
        setGames(prev => {
            const { [gameId]: _, ...rest } = prev;
            return rest;
        });
    }, []);

    // Update game status
    const updateGameStatus = useCallback((gameId: string, status: JobStatus) => {
        setGames(prev => ({
            ...prev,
            [gameId]: { ...prev[gameId], jobStatus: status }
        }));
    }, []);

    return {
        games,
        trackGame,
        trackGameWithModal,
        saveGame,
        removeGame,
        refreshGame,
        updateGameStatus,
        isModalOpen,
        setIsModalOpen,
        modalGameInfo
    };
};