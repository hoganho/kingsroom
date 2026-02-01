// src/hooks/useDashboardData.ts
// Custom hook for fetching and managing dashboard data
//
// ARCHITECTURE:
// - ActiveGame table: Fast queries for RUNNING, REGISTERING, CLOCK_STOPPED, INITIATING, SCHEDULED games
// - RecentlyFinishedGame table: Games finished in last 7 days (auto-cleaned via TTL)
// - UpcomingGame table: Games scheduled to start soon
// - Subscriptions: Real-time updates via onActiveGameChange

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import { useEntity } from '@/contexts/EntityContext';
import { useScraperSettings } from '@/hooks/scraper/useScraperSettings';
import type {
  ActiveGameData,
  FinishedGameData,
  UpcomingGameData,
  ActiveGamesByEntityData,
  RecentlyFinishedByEntityData,
  UpcomingGamesByEntityData,
  GamesByStatusData,
  OnActiveGameChangeData,
  RefreshRunningGamesData,
  AmplifySubscription,
} from '@/types/dashboard';

// ============================================
// GRAPHQL QUERIES
// ============================================

const listActiveGamesByEntity = /* GraphQL */ `
  query ListActiveGamesByEntity($entityId: ID!, $statusFilter: ModelStringKeyConditionInput, $limit: Int) {
    activeGamesByEntity(
      entityId: $entityId
      gameStatus: $statusFilter
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStatus
        registrationStatus
        gameStartDateTime
        gameEndDateTime
        totalEntries
        totalUniquePlayers
        playersRemaining
        buyIn
        prizepoolPaid
        prizepoolCalculated
        guaranteeAmount
        hasGuarantee
        hasOverlay
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
        lastRefreshedAt
        refreshCount
      }
      nextToken
    }
  }
`;

const listRecentlyFinishedByEntity = /* GraphQL */ `
  query ListRecentlyFinishedByEntity($entityId: ID!, $limit: Int) {
    recentlyFinishedByEntity(
      entityId: $entityId
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStartDateTime
        finishedAt
        totalDuration
        totalEntries
        totalUniquePlayers
        prizepoolPaid
        prizepoolCalculated
        buyIn
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
        gameFinancialSnapshot {
          netProfit
        }
      }
      nextToken
    }
  }
`;

const gamesByStatusFinished = /* GraphQL */ `
  query GamesByStatusFinished($gameStatus: GameStatus!, $since: String!, $limit: Int) {
    gamesByStatus(
      gameStatus: $gameStatus
      gameStartDateTime: { ge: $since }
      limit: $limit
      sortDirection: DESC
    ) {
      items {
        id
        entityId
        tournamentId
        name
        gameStartDateTime
        gameEndDateTime
        gameStatus
        prizepoolPaid
        prizepoolCalculated
        totalUniquePlayers
        totalInitialEntries
        totalEntries
        buyIn
        sourceUrl
        isSeries
        seriesName
        isMainEvent
        isSatellite
        venue {
          name
          logo
        }
      }
      nextToken
    }
  }
`;

const listUpcomingByEntity = /* GraphQL */ `
  query ListUpcomingByEntity($entityId: ID!, $limit: Int) {
    upcomingGamesByEntity(
      entityId: $entityId
      limit: $limit
      sortDirection: ASC
    ) {
      items {
        id
        gameId
        entityId
        venueId
        tournamentId
        name
        venueName
        venueLogoCached
        gameStartDateTime
        buyIn
        guaranteeAmount
        hasGuarantee
        gameType
        isSeries
        seriesName
        isMainEvent
        isSatellite
        isRecurring
        recurringGameName
        sourceUrl
      }
      nextToken
    }
  }
`;

const onActiveGameChangeSubscription = /* GraphQL */ `
  subscription OnActiveGameChange($entityId: ID) {
    onActiveGameChange(entityId: $entityId) {
      id
      gameId
      entityId
      name
      venueName
      venueLogoCached
      gameStatus
      registrationStatus
      gameStartDateTime
      gameEndDateTime
      totalEntries
      totalUniquePlayers
      playersRemaining
      buyIn
      prizepoolPaid
      prizepoolCalculated
      sourceUrl
      lastRefreshedAt
      isSeries
      seriesName
      isMainEvent
      isSatellite
      isRecurring
      recurringGameName
    }
  }
`;

const refreshRunningGamesMutation = /* GraphQL */ `
  mutation RefreshRunningGames($input: RefreshRunningGamesInput) {
    refreshRunningGames(input: $input) {
      success
      gamesRefreshed
      gamesUpdated
      gamesFailed
      errors
      executionTimeMs
    }
  }
`;

// ============================================
// CONSTANTS
// ============================================

const STARTING_SOON_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// HELPER FUNCTIONS
// ============================================

const getMillisecondsUntilNextHalfHour = (): number => {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const minutesUntilNext = minutes < 30 ? (30 - minutes) : (60 - minutes);
  return (minutesUntilNext * 60 * 1000) - (seconds * 1000) - milliseconds;
};

const getMillisecondsUntilNextHour = (): number => {
  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();
  const minutesUntilNext = 60 - minutes;
  return (minutesUntilNext * 60 * 1000) - (seconds * 1000) - milliseconds;
};

export const isWithin24Hours = (dateString: string): boolean => {
  const gameDate = new Date(dateString);
  const now = new Date();
  const diff = gameDate.getTime() - now.getTime();
  return diff > 0 && diff <= STARTING_SOON_THRESHOLD;
};

const isMoreThan24Hours = (dateString: string): boolean => {
  const gameDate = new Date(dateString);
  const now = new Date();
  const diff = gameDate.getTime() - now.getTime();
  return diff > STARTING_SOON_THRESHOLD;
};

const sortRunningGames = (games: ActiveGameData[]): ActiveGameData[] => {
  return games.sort((a, b) => {
    const regOrder = (status: string | null | undefined) => {
      if (status === 'OPEN') return 0;
      if (status === 'FINAL') return 1;
      return 2;
    };
    const regCompare = regOrder(a.registrationStatus) - regOrder(b.registrationStatus);
    if (regCompare !== 0) return regCompare;
    return new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime();
  });
};

// ============================================
// HOOK
// ============================================

export interface UseDashboardDataReturn {
  // Game data
  runningGames: ActiveGameData[];
  clockStoppedGames: ActiveGameData[];
  startingSoonGames: (ActiveGameData | UpcomingGameData)[];
  upcomingGames: (ActiveGameData | UpcomingGameData)[];
  finishedGames: FinishedGameData[];
  
  // UI state
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isSubscribed: boolean;
  
  // Computed values
  totalRunningCount: number;
  
  // Actions
  handleManualRefresh: () => void;
}

export const useDashboardData = (): UseDashboardDataReturn => {
  const { selectedEntities, loading: entityLoading } = useEntity();
  const client = useMemo(() => generateClient(), []);
  
  const { 
    loading: settingsLoading,
    isAutoRefreshEnabled,
    refreshIntervals,
  } = useScraperSettings();
  
  // Game state
  const [runningGames, setRunningGames] = useState<ActiveGameData[]>([]);
  const [clockStoppedGames, setClockStoppedGames] = useState<ActiveGameData[]>([]);
  const [startingSoonGames, setStartingSoonGames] = useState<(ActiveGameData | UpcomingGameData)[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<(ActiveGameData | UpcomingGameData)[]>([]);
  const [finishedGames, setFinishedGames] = useState<FinishedGameData[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const subscriptionRef = useRef<AmplifySubscription | null>(null);
  const runningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startingSoonTimerRef = useRef<NodeJS.Timeout | null>(null);
  const upcomingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const entityIds = useMemo(() => selectedEntities.map(e => e.id), [selectedEntities]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchRunningGames = useCallback(async (): Promise<{
    running: ActiveGameData[];
    clockStopped: ActiveGameData[];
  }> => {
    if (entityIds.length === 0) return { running: [], clockStopped: [] };

    try {
      const fetchPromises = entityIds.flatMap(entityId => [
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'RUNNING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'CLOCK_STOPPED' }, limit: 50 }
        })
      ]);

      const results = await Promise.all(fetchPromises);
      
      const running: ActiveGameData[] = [];
      const clockStopped: ActiveGameData[] = [];

      for (let i = 0; i < results.length; i += 2) {
        const runningResult = results[i] as GraphQLResult<ActiveGamesByEntityData>;
        const clockStoppedResult = results[i + 1] as GraphQLResult<ActiveGamesByEntityData>;

        if (runningResult.data?.activeGamesByEntity?.items) {
          running.push(...runningResult.data.activeGamesByEntity.items.filter(Boolean));
        }
        if (clockStoppedResult.data?.activeGamesByEntity?.items) {
          clockStopped.push(...clockStoppedResult.data.activeGamesByEntity.items.filter(Boolean));
        }
      }

      return {
        running: sortRunningGames(running),
        clockStopped: sortRunningGames(clockStopped)
      };
    } catch (err) {
      console.error('[useDashboardData] Error fetching running games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchStartingSoonAndUpcoming = useCallback(async (): Promise<{
    startingSoon: (ActiveGameData | UpcomingGameData)[];
    upcoming: (ActiveGameData | UpcomingGameData)[];
  }> => {
    if (entityIds.length === 0) return { startingSoon: [], upcoming: [] };

    try {
      const fetchPromises = entityIds.flatMap(entityId => [
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'INITIATING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'REGISTERING' }, limit: 50 }
        }),
        client.graphql({
          query: listActiveGamesByEntity,
          variables: { entityId, statusFilter: { eq: 'SCHEDULED' }, limit: 50 }
        }),
        client.graphql({
          query: listUpcomingByEntity,
          variables: { entityId, limit: 50 }
        })
      ]);

      const results = await Promise.all(fetchPromises);
      
      const allGames: (ActiveGameData | UpcomingGameData)[] = [];
      const seenIds = new Set<string>();

      for (let i = 0; i < results.length; i += 4) {
        const initiatingResult = results[i] as GraphQLResult<ActiveGamesByEntityData>;
        const registeringResult = results[i + 1] as GraphQLResult<ActiveGamesByEntityData>;
        const scheduledResult = results[i + 2] as GraphQLResult<ActiveGamesByEntityData>;
        const upcomingResult = results[i + 3] as GraphQLResult<UpcomingGamesByEntityData>;

        [initiatingResult, registeringResult, scheduledResult].forEach(result => {
          if (result.data?.activeGamesByEntity?.items) {
            result.data.activeGamesByEntity.items.filter(Boolean).forEach(game => {
              if (!seenIds.has(game.id)) {
                seenIds.add(game.id);
                allGames.push(game);
              }
            });
          }
        });

        if (upcomingResult.data?.upcomingGamesByEntity?.items) {
          upcomingResult.data.upcomingGamesByEntity.items.filter(Boolean).forEach(game => {
            if (!seenIds.has(game.id)) {
              seenIds.add(game.id);
              allGames.push(game);
            }
          });
        }
      }

      const now = new Date();
      const futureGames = allGames.filter(game => {
        const startTime = new Date(game.gameStartDateTime);
        return startTime > now;
      });

      const startingSoon = futureGames
        .filter(game => isWithin24Hours(game.gameStartDateTime))
        .sort((a, b) => new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime());
      
      const upcoming = futureGames
        .filter(game => isMoreThan24Hours(game.gameStartDateTime))
        .sort((a, b) => new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime());

      return { startingSoon, upcoming };
    } catch (err) {
      console.error('[useDashboardData] Error fetching starting soon/upcoming games:', err);
      throw err;
    }
  }, [client, entityIds]);

  const fetchFinishedGames = useCallback(async (): Promise<FinishedGameData[]> => {
    if (entityIds.length === 0) return [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 8);

    try {
      const fetchPromises = entityIds.map(entityId =>
        client.graphql({
          query: listRecentlyFinishedByEntity,
          variables: { entityId, limit: 100 }
        })
      );

      const results = await Promise.all(fetchPromises);
      const finished: FinishedGameData[] = [];

      results.forEach(result => {
        const typedResult = result as GraphQLResult<RecentlyFinishedByEntityData>;
        if (typedResult.data?.recentlyFinishedByEntity?.items) {
          // Map gameFinancialSnapshot.netProfit to flat netProfit field
          const mappedItems = typedResult.data.recentlyFinishedByEntity.items
            .filter(Boolean)
            .map((item: FinishedGameData & { gameFinancialSnapshot?: { netProfit?: number | null } | null }) => ({
              ...item,
              netProfit: item.gameFinancialSnapshot?.netProfit ?? null,
            }));
          finished.push(...mappedItems);
        }
      });

      const recentFinished = finished.filter(game => {
        const gameStart = new Date(game.gameStartDateTime);
        return gameStart >= sevenDaysAgo;
      });

      if (recentFinished.length === 0) {
        console.log('[useDashboardData] No recent finished games, falling back to GSI query');

        const fallbackResult = await client.graphql({
          query: gamesByStatusFinished,
          variables: { 
            gameStatus: 'FINISHED', 
            since: sevenDaysAgo.toISOString(),
            limit: 50 
          }
        }) as GraphQLResult<GamesByStatusData>;

        if (fallbackResult.data?.gamesByStatus?.items) {
          const gsiGames = fallbackResult.data.gamesByStatus.items
            .filter(Boolean)
            .filter((g) => !g.entityId || entityIds.includes(g.entityId))
            .map((g): FinishedGameData => ({
              ...g,
              venueName: g.venue?.name ?? null,
              venueLogoCached: g.venue?.logo ?? null
            }));
          return gsiGames;
        }
      }

      return recentFinished.sort((a, b) => {
        const aFinish = a.finishedAt || a.gameEndDateTime || a.gameStartDateTime;
        const bFinish = b.finishedAt || b.gameEndDateTime || b.gameStartDateTime;
        return new Date(bFinish).getTime() - new Date(aFinish).getTime();
      });
    } catch (err) {
      console.error('[useDashboardData] Error fetching finished games:', err);
      throw err;
    }
  }, [client, entityIds]);

  // ============================================
  // REFRESH HANDLERS
  // ============================================

  const refreshRunningGames = useCallback(async () => {
    try {
      const result = await fetchRunningGames();
      setRunningGames(result.running);
      setClockStoppedGames(result.clockStopped);
    } catch (err) {
      console.error('[useDashboardData] Error refreshing running games:', err);
    }
  }, [fetchRunningGames]);

  const refreshStartingSoon = useCallback(async () => {
    try {
      const result = await fetchStartingSoonAndUpcoming();
      setStartingSoonGames(result.startingSoon);
    } catch (err) {
      console.error('[useDashboardData] Error refreshing starting soon games:', err);
    }
  }, [fetchStartingSoonAndUpcoming]);

  const refreshUpcoming = useCallback(async () => {
    try {
      const result = await fetchStartingSoonAndUpcoming();
      setUpcomingGames(result.upcoming);
      setStartingSoonGames(result.startingSoon);
    } catch (err) {
      console.error('[useDashboardData] Error refreshing upcoming games:', err);
    }
  }, [fetchStartingSoonAndUpcoming]);

  const fetchAllData = useCallback(async (triggerScraper: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      if (triggerScraper) {
        console.log('[useDashboardData] Triggering refreshRunningGames Lambda...');
        
        const refreshResult = await client.graphql({
          query: refreshRunningGamesMutation,
          variables: { 
            input: {
              forceRefresh: true,
              entityId: entityIds.length === 1 ? entityIds[0] : null,
              maxGames: 50,
              olderThanMinutes: 0
            } 
          }
        }) as GraphQLResult<RefreshRunningGamesData>;

        if (refreshResult.data?.refreshRunningGames) {
          const result = refreshResult.data.refreshRunningGames;
          console.log('[useDashboardData] Refresh result:', {
            success: result.success,
            refreshed: result.gamesRefreshed,
            updated: result.gamesUpdated,
            failed: result.gamesFailed,
            timeMs: result.executionTimeMs
          });
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const [runningResult, startingUpcomingResult, finished] = await Promise.all([
        fetchRunningGames(),
        fetchStartingSoonAndUpcoming(),
        fetchFinishedGames()
      ]);

      console.log('[useDashboardData] Results received:', {
        running: runningResult.running.length,
        clockStopped: runningResult.clockStopped.length,
        startingSoon: startingUpcomingResult.startingSoon.length,
        upcoming: startingUpcomingResult.upcoming.length,
        finished: finished.length
      });

      setRunningGames(runningResult.running);
      setClockStoppedGames(runningResult.clockStopped);
      setStartingSoonGames(startingUpcomingResult.startingSoon);
      setUpcomingGames(startingUpcomingResult.upcoming);
      setFinishedGames(finished);
      setLastUpdated(new Date());
      
    } catch (err) {
      console.error('[useDashboardData] ERROR:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [client, entityIds, fetchRunningGames, fetchStartingSoonAndUpcoming, fetchFinishedGames]);

  const handleManualRefresh = useCallback(() => {
    fetchAllData(true);
  }, [fetchAllData]);

  // ============================================
  // SUBSCRIPTION SETUP
  // ============================================

  const setupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
    }

    try {
      const subscriptionObservable = client.graphql({
        query: onActiveGameChangeSubscription,
        variables: entityIds.length === 1 ? { entityId: entityIds[0] } : {}
      });

      const observable = subscriptionObservable as unknown as {
        subscribe: (handlers: {
          next: (value: { data?: OnActiveGameChangeData }) => void;
          error: (error: Error) => void;
        }) => AmplifySubscription;
      };

      const subscription = observable.subscribe({
        next: ({ data }) => {
          if (data?.onActiveGameChange) {
            const updatedGame = data.onActiveGameChange;
            console.log('[useDashboardData] Received active game update:', updatedGame.name, updatedGame.gameStatus);
            
            const updateLists = () => {
              switch (updatedGame.gameStatus) {
                case 'RUNNING':
                  setRunningGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    const updated = [updatedGame, ...filtered];
                    return sortRunningGames(updated);
                  });
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setStartingSoonGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'CLOCK_STOPPED':
                  setClockStoppedGames(prev => {
                    const filtered = prev.filter(g => g.id !== updatedGame.id);
                    return [updatedGame, ...filtered];
                  });
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'REGISTERING':
                case 'INITIATING':
                case 'SCHEDULED':
                  if (isWithin24Hours(updatedGame.gameStartDateTime)) {
                    setStartingSoonGames(prev => {
                      const filtered = prev.filter(g => g.id !== updatedGame.id);
                      const updated = [updatedGame, ...filtered];
                      return updated.sort((a, b) => 
                        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
                      );
                    });
                  } else {
                    setUpcomingGames(prev => {
                      const filtered = prev.filter(g => g.id !== updatedGame.id);
                      const updated = [updatedGame, ...filtered];
                      return updated.sort((a, b) => 
                        new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime()
                      );
                    });
                  }
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  break;
                case 'FINISHED':
                case 'CANCELLED':
                  setRunningGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setClockStoppedGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setStartingSoonGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  setUpcomingGames(prev => prev.filter(g => g.id !== updatedGame.id));
                  fetchFinishedGames().then(setFinishedGames).catch(console.error);
                  break;
              }
            };
            
            updateLists();
            setLastUpdated(new Date());
          }
        },
        error: (err: Error) => {
          console.error('[useDashboardData] Subscription error:', err);
          setIsSubscribed(false);
        }
      });

      subscriptionRef.current = subscription;
      setIsSubscribed(true);
    } catch (err) {
      console.error('[useDashboardData] Failed to setup subscription:', err);
      setIsSubscribed(false);
    }
  }, [client, entityIds, fetchFinishedGames]);

  // ============================================
  // EFFECTS
  // ============================================

  // Fetch data when entities change
  useEffect(() => {
    if (!entityLoading && entityIds.length > 0) {
      fetchAllData(false);
    }
  }, [entityLoading, entityIds, fetchAllData]);

  // Setup subscription
  useEffect(() => {
    if (!entityLoading && entityIds.length > 0) {
      setupSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [entityLoading, entityIds, setupSubscription]);

  // Auto-refresh setup
  useEffect(() => {
    const clearAllTimers = () => {
      if (runningTimerRef.current) {
        clearTimeout(runningTimerRef.current);
        clearInterval(runningTimerRef.current);
        runningTimerRef.current = null;
      }
      if (startingSoonTimerRef.current) {
        clearTimeout(startingSoonTimerRef.current);
        clearInterval(startingSoonTimerRef.current);
        startingSoonTimerRef.current = null;
      }
      if (upcomingTimerRef.current) {
        clearInterval(upcomingTimerRef.current);
        upcomingTimerRef.current = null;
      }
    };

    clearAllTimers();

    if (entityLoading || entityIds.length === 0 || settingsLoading) {
      return clearAllTimers;
    }

    if (!isAutoRefreshEnabled) {
      console.log('[useDashboardData] Auto-refresh is DISABLED');
      return clearAllTimers;
    }

    console.log('[useDashboardData] Auto-refresh is ENABLED - setting up timers');

    const runningIntervalMs = refreshIntervals.running * 60 * 1000;
    const startingSoonIntervalMs = refreshIntervals.startingSoon * 60 * 1000;
    const upcomingIntervalMs = refreshIntervals.upcoming * 60 * 1000;

    const setupRunningRefresh = () => {
      const msUntilNextHalfHour = getMillisecondsUntilNextHalfHour();
      runningTimerRef.current = setTimeout(() => {
        refreshRunningGames();
        runningTimerRef.current = setInterval(refreshRunningGames, runningIntervalMs);
      }, msUntilNextHalfHour);
    };

    const setupStartingSoonRefresh = () => {
      const msUntilNextHour = getMillisecondsUntilNextHour();
      startingSoonTimerRef.current = setTimeout(() => {
        refreshStartingSoon();
        startingSoonTimerRef.current = setInterval(refreshStartingSoon, startingSoonIntervalMs);
      }, msUntilNextHour);
    };

    const setupUpcomingRefresh = () => {
      upcomingTimerRef.current = setInterval(refreshUpcoming, upcomingIntervalMs);
    };

    setupRunningRefresh();
    setupStartingSoonRefresh();
    setupUpcomingRefresh();

    return clearAllTimers;
  }, [
    entityLoading, 
    entityIds, 
    settingsLoading,
    isAutoRefreshEnabled, 
    refreshIntervals,
    refreshRunningGames, 
    refreshStartingSoon, 
    refreshUpcoming
  ]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const totalRunningCount = runningGames.length + clockStoppedGames.length;

  return {
    runningGames,
    clockStoppedGames,
    startingSoonGames,
    upcomingGames,
    finishedGames,
    loading,
    error,
    lastUpdated,
    isSubscribed,
    totalRunningCount,
    handleManualRefresh,
  };
};