// src/hooks/useGameTracker.ts
// REFACTORED: Uses unified ScrapeURL knowledge base before fetching.

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { DataSource, ScrapedGameData, GameStatus, RegistrationStatus, ScrapeAttemptStatus } from '../API';
import type { GameData, GameState, JobStatus } from '../types/game';
import { saveGameDataToBackend, shouldAutoRefreshTournament } from '../services/gameService';

export const POLLING_INTERVAL = 120000; // 2 minutes

interface TrackedGame extends GameState {
    updateAvailable?: boolean;
    s3Key?: string;
    fromS3?: boolean;
    lastCheckedForUpdates?: Date;
    knowledgeBaseId?: string; // ID from ScrapeURL
    lastScrapeStatus?: ScrapeAttemptStatus; // metadata from ScrapeURL
    lastScrapedAt?: string; // metadata from ScrapeURL
}

interface TrackOptions {
    forceSource?: 'S3' | 'LIVE' | 'AUTO';
    s3Key?: string;
    forceRefresh?: boolean;
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

// Helper to convert ScrapedGameData to GameData (same as before)
const convertScrapedToGameData = (scraped: ScrapedGameData): GameData => {
    const gameStatus = scraped.gameStatus || 'SCHEDULED' as GameStatus;
    return {
        name: scraped.name || '',
        tournamentId: scraped.tournamentId || 0,
        gameStartDateTime: scraped.gameStartDateTime || undefined,
        gameEndDateTime: scraped.gameEndDateTime || undefined,
        gameStatus: gameStatus,
        gameType: scraped.gameType || undefined,
        venueId: undefined,
        entityId: scraped.entityId || undefined,
        gameVariant: scraped.gameVariant || undefined,
        gameFrequency: scraped.gameFrequency || undefined,
        isSeries: scraped.isSeries || undefined,
        isRegular: scraped.isRegular || undefined,
        isSatellite: scraped.isSatellite || undefined,
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
        tournamentType: scraped.tournamentType || undefined,
        buyIn: scraped.buyIn || undefined,
        rake: scraped.rake || undefined,
        totalRake: scraped.totalRake || undefined,
        startingStack: scraped.startingStack || undefined,
        hasGuarantee: scraped.hasGuarantee || false,
        guaranteeAmount: scraped.guaranteeAmount || undefined,
        guaranteeOverlay: scraped.guaranteeOverlay || undefined,
        guaranteeSurplus: scraped.guaranteeSurplus || undefined,
        levels: scraped.levels?.map(level => ({
            levelNumber: level.levelNumber || 0,
            durationMinutes: level.durationMinutes || 0,
            smallBlind: level.smallBlind || 0,
            bigBlind: level.bigBlind || 0,
            ante: level.ante || undefined,
            breakMinutes: undefined
        })) || [],
        results: scraped.results?.map(result => ({
            rank: result.rank || 0,
            name: result.name || '',
            winnings: result.winnings || 0,
            points: result.points || undefined,
            isQualification: result.isQualification || undefined
        })) || undefined,
        entries: scraped.entries || undefined,
        seating: scraped.seating?.map(seat => ({
            name: seat.name || '',
            table: seat.table || 0,
            seat: seat.seat || 0,
            playerStack: seat.playerStack || undefined
        })) || undefined,
        breaks: scraped.breaks?.map(breakData => ({
            levelNumberBeforeBreak: breakData.levelNumberBeforeBreak || 0,
            durationMinutes: breakData.durationMinutes || 0
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
        rawHtml: scraped.rawHtml || undefined,
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
    const activeRequests = useRef<Set<string>>(new Set());
    const clientRef = useRef<any>(null);
    
    useEffect(() => {
        try {
            if (!clientRef.current) {
                clientRef.current = generateClient();
            }
        } catch (error) {
            console.error('[useGameTracker] Amplify not configured:', error);
        }
    }, []);
    
    useEffect(() => {
        return () => {
            Object.values(autoRefreshTimers.current).forEach(timer => clearInterval(timer));
        };
    }, []);

    /**
     * Checks the ScrapeURL knowledge base first
     */
    const checkKnowledgeBase = async (url: string) => {
        try {
            const response = await clientRef.current.graphql({
                query: /* GraphQL */ `
                    query CheckKnowledgeBase($url: AWSURL!) {
                        scrapeURLByURL(url: $url) {
                            items {
                                id
                                latestS3Key
                                lastScrapeStatus
                                lastScrapedAt
                            }
                        }
                    }
                `,
                variables: { url }
            });
            const items = response.data?.scrapeURLByURL?.items;
            return items && items.length > 0 ? items[0] : null;
        } catch (e) {
            console.warn('[useGameTracker] Knowledge base check failed, ignoring', e);
            return null;
        }
    };

    const fetchFromS3 = async (url: string, s3Key?: string): Promise<ScrapedGameData> => {
        console.log(`[useGameTracker] Fetching from S3 for ${url}`);
        if (!s3Key) throw new Error('No S3 key provided');

        const response = await clientRef.current.graphql({
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
                            autoAssignedVenue { id name score }
                            suggestions { id name score }
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
                input: { s3Key: s3Key, saveToDatabase: false }
            }
        });
        
        if ('data' in response && response.data?.reScrapeFromCache) {
            return response.data.reScrapeFromCache as ScrapedGameData;
        }
        throw new Error('Fetch from S3 failed');
    };

    const trackGameCore = useCallback(async (
        url: string, 
        source: DataSource, 
        entityId: string,
        options?: TrackOptions
    ) => {
        // ============================================
        // ✅ ADD ONLY THESE 5 LINES:
        // ============================================
        const reqKey = `${url}-${options?.forceSource || 'auto'}`;
        if (activeRequests.current.has(reqKey)) return;
        activeRequests.current.add(reqKey);
        const cleanup = () => activeRequests.current.delete(reqKey);
        
        try {
            // ============================================
            // ✅ KEEP ALL YOUR EXISTING CODE BELOW:
            // ============================================
            console.log(`[useGameTracker] Tracking: ${url}, source: ${options?.forceSource || 'AUTO'}`);
            
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

            let scrapedData: ScrapedGameData;
            let knowledgeInfo: { id: string; lastScrapeStatus: ScrapeAttemptStatus; lastScrapedAt: string; [key: string]: any; } | null = null;

            if (!options?.s3Key && options?.forceSource !== 'LIVE') {
                knowledgeInfo = await checkKnowledgeBase(url);
                if (knowledgeInfo) {
                    console.log('[useGameTracker] Found in knowledge base:', knowledgeInfo);
                    setGames(prev => ({
                        ...prev,
                        [url]: {
                            ...prev[url],
                            knowledgeBaseId: knowledgeInfo?.id,
                            lastScrapeStatus: knowledgeInfo?.lastScrapeStatus,
                            lastScrapedAt: knowledgeInfo?.lastScrapedAt
                        }
                    }));
                }
            }

            if (options?.forceSource === 'S3' && options.s3Key) {
                scrapedData = await fetchFromS3(url, options.s3Key);
            } else {
                const response = await clientRef.current.graphql({
                    query: /* GraphQL */ `
                        mutation FetchTournamentData($url: AWSURL!, $forceRefresh: Boolean) {
                            fetchTournamentData(url: $url, forceRefresh: $forceRefresh) {
                                name
                                tournamentId
                                gameStatus
                                registrationStatus
                                gameStartDateTime
                                gameEndDateTime
                                gameType
                                gameVariant
                                tournamentType
                                prizepool
                                revenueByBuyIns
                                profitLoss
                                buyIn
                                rake
                                totalRake
                                startingStack
                                hasGuarantee
                                guaranteeAmount
                                guaranteeOverlay
                                guaranteeSurplus
                                totalEntries
                                totalRebuys
                                totalAddons
                                totalDuration
                                playersRemaining
                                totalChipsInPlay
                                averagePlayerStack
                                seriesName
                                isRegular
                                isSeries
                                isSatellite
                                gameFrequency
                                gameTags
                                levels {
                                    levelNumber
                                    durationMinutes
                                    smallBlind
                                    bigBlind
                                    ante
                                }
                                breaks {
                                    levelNumberBeforeBreak
                                    durationMinutes
                                }
                                entries {
                                    name
                                }
                                seating {
                                    name
                                    table
                                    seat
                                    playerStack
                                }
                                results {
                                    rank
                                    name
                                    winnings
                                    points
                                    isQualification
                                }
                                tables {
                                    tableName
                                    seats {
                                        seat
                                        isOccupied
                                        playerName
                                        playerStack
                                    }
                                }
                                rawHtml
                                isNewStructure
                                structureLabel
                                foundKeys
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
                                tournamentId
                                entityId
                            }
                        }
                    `,
                    variables: { 
                        url: url,
                        forceRefresh: options?.forceRefresh || options?.forceSource === 'LIVE' || false
                    }
                });
                
                scrapedData = response.data?.fetchTournamentData;
            }

            const data = convertScrapedToGameData(scrapedData);
            const existingGameId = scrapedData.existingGameId || null;
            const s3Key = (scrapedData as any).s3Key || options?.s3Key || undefined;
            const fromS3 = (scrapedData as any).source === 'S3_CACHE' || !!options?.s3Key;

            setGames(prev => ({
                ...prev,
                [url]: {
                    ...prev[url],
                    jobStatus: 'READY_TO_SAVE',
                    data,
                    existingGameId,
                    s3Key,
                    fromS3,
                    lastFetched: new Date().toISOString()
                }
            }));

            if (options?.forceSource !== 'S3' && shouldAutoRefreshTournament(data)) {
                setGames(prev => ({ ...prev, [url]: { ...prev[url], autoRefresh: true } }));
                if (autoRefreshTimers.current[url]) clearInterval(autoRefreshTimers.current[url]);
                autoRefreshTimers.current[url] = setInterval(() => {
                    refreshGame(url, { forceSource: 'LIVE' });
                }, POLLING_INTERVAL);
            }
            
            // ============================================
            // ✅ ADD CLEANUP at the end of try block:
            // ============================================
            cleanup();
            
        } catch (error) {
            console.error('[useGameTracker] Error:', error);
            setGames(prev => ({
                ...prev,
                [url]: {
                    ...prev[url],
                    jobStatus: 'ERROR',
                    errorMessage: error instanceof Error ? error.message : 'Failed to fetch game data'
                }
            }));
            
            // ============================================
            // ✅ ADD CLEANUP in catch block too:
            // ============================================
            cleanup();
        }
    }, []); // Keep your existing dependency array

    const trackGameWithModal = useCallback((url: string, source: DataSource, entityId: string) => {
        setModalGameInfo({ url, source, entityId });
        setIsModalOpen(true);
    }, []);

    const trackGame = useCallback((url: string, source: DataSource, entityId: string, options?: TrackOptions) => {
        trackGameCore(url, source, entityId, options);
    }, [trackGameCore]);

    const saveGame = useCallback(async (gameId: string, venueId: string, entityId: string) => {
        const game = games[gameId];
        if (!game || !game.data) return;

        setGames(prev => ({ ...prev, [gameId]: { ...prev[gameId], jobStatus: 'SAVING' } }));

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
                [gameId]: { ...prev[gameId], jobStatus: 'DONE', saveResult: result }
            }));

            if (autoRefreshTimers.current[gameId]) {
                clearInterval(autoRefreshTimers.current[gameId]);
                delete autoRefreshTimers.current[gameId];
                setGames(prev => ({ ...prev, [gameId]: { ...prev[gameId], autoRefresh: false } }));
            }
        } catch (error) {
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

    const refreshGame = useCallback((gameId: string, options?: TrackOptions) => {
        const game = games[gameId];
        if (!game) return;
        trackGameCore(gameId, game.source, game.entityId || '', options);
    }, [games, trackGameCore]);

    const removeGame = useCallback((gameId: string) => {
        if (autoRefreshTimers.current[gameId]) {
            clearInterval(autoRefreshTimers.current[gameId]);
            delete autoRefreshTimers.current[gameId];
        }
        setGames(prev => {
            const { [gameId]: _, ...rest } = prev;
            return rest;
        });
    }, []);

    const updateGameStatus = useCallback((gameId: string, status: JobStatus) => {
        setGames(prev => ({ ...prev, [gameId]: { ...prev[gameId], jobStatus: status } }));
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