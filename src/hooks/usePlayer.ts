// src/hooks/usePlayer.ts
// Custom hooks for player data fetching and management
// VERSION: 2.1.0 - Updated usePlayerProfile to fetch full PlayerVenue data with targetingClassification

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';

import type {
  Player,
  PlayerFull,
  PlayerListItem,
  PlayerResult,
  PlayerEntry,
  PlayerVenue,
  PlayerTransaction,
  PlayerCredits,
  PlayerPoints,
  PlayerTicket,
  PlayerFilters,
  PlayerProfileData,
  PlayerDashboardStats,
} from '../types/player';
import { PlayerAccountStatus } from '../types/player';

import {
  GET_PLAYER_FULL_PROFILE,
  GET_PLAYER_WITH_SUMMARY,
  LIST_PLAYERS_WITH_SUMMARY,
  LIST_PLAYERS_FOR_DASHBOARD,
  LIST_TOP_PLAYERS,
  GET_PLAYER_RESULTS,
  GET_PLAYER_ENTRIES,
  GET_PLAYER_TRANSACTIONS,
  GET_PLAYER_CREDITS,
  GET_PLAYER_POINTS,
  GET_PLAYER_TICKETS,
  SEARCH_PLAYERS,
} from '../graphql/playerQueries';

import { sortPlayersByLastPlayed, sortPlayersByNetBalance } from '../utils/playerHelpers';

// ============================================================================
// Types for Hook Returns
// ============================================================================

interface UsePlayerResult {
  player: Player | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UsePlayerProfileResult {
  data: PlayerProfileData | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UsePlayersListResult {
  players: PlayerListItem[];
  loading: boolean;
  error: string | null;
  nextToken: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

interface UsePlayerSearchResult {
  players: PlayerListItem[];
  loading: boolean;
  error: string | null;
  search: (term: string) => Promise<void>;
  clear: () => void;
}

interface UseTopPlayersResult {
  players: PlayerListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UsePlayersDashboardResult {
  players: PlayerListItem[];
  topPlayers: PlayerListItem[];
  stats: PlayerDashboardStats;
  loading: boolean;
  error: string | null;
  nextToken: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

interface UsePlayerVenuesResult {
  venues: PlayerVenue[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Get GraphQL Client
// ============================================================================

const getClient = () => generateClient();

// ============================================================================
// GraphQL Query for Full PlayerVenue Data (used by usePlayerProfile)
// This query fetches playerVenues with ALL fields including targetingClassification
// ============================================================================

const GET_PLAYER_VENUES_FULL = /* GraphQL */ `
  query GetPlayerVenuesFullCustom(
    $playerId: ID!
    $limit: Int
    $nextToken: String
  ) {
    listPlayerVenues(
      filter: { playerId: { eq: $playerId } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        venueId
        entityId
        totalGamesPlayed
        averageBuyIn
        totalBuyIns
        totalWinnings
        netProfit
        firstPlayedDate
        lastPlayedDate
        targetingClassification
        venue {
          id
          name
          entityId
          entity {
            id
            entityName
          }
        }
      }
      nextToken
    }
  }
`;

// ============================================================================
// usePlayer - Fetch single player basic info
// ============================================================================

export const usePlayer = (playerId: string | undefined): UsePlayerResult => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlayer = useCallback(async () => {
    if (!playerId) {
      setPlayer(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();
      const response = await client.graphql({
        query: GET_PLAYER_WITH_SUMMARY,
        variables: { id: playerId },
      }) as GraphQLResult<{ getPlayer: Player }>;

      if (response.data?.getPlayer) {
        setPlayer(response.data.getPlayer);
      } else {
        setError('Player not found');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch player';
      console.error('Error fetching player:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchPlayer();
  }, [fetchPlayer]);

  return { player, loading, error, refetch: fetchPlayer };
};

// ============================================================================
// usePlayerProfile - Fetch complete player profile with all relationships
// UPDATED: Now fetches full PlayerVenue data with targetingClassification
// ============================================================================

export const usePlayerProfile = (playerId: string | undefined): UsePlayerProfileResult => {
  const [data, setData] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!playerId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();

      // Fetch all data in parallel
      const [
        playerResponse,
        resultsResponse,
        entriesResponse,
        venuesResponse,
        transactionsResponse,
        creditsResponse,
        pointsResponse,
        ticketsResponse,
      ] = await Promise.all([
        client.graphql({
          query: GET_PLAYER_FULL_PROFILE,
          variables: { id: playerId },
        }) as Promise<GraphQLResult<{ getPlayer: PlayerFull }>>,
        
        client.graphql({
          query: GET_PLAYER_RESULTS,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerResultsByPlayerIdAndGameStartDateTime: { items: PlayerResult[] };
        }>>,
        
        client.graphql({
          query: GET_PLAYER_ENTRIES,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerEntriesByPlayerIdAndGameStartDateTime: { items: PlayerEntry[] };
        }>>,
        
        // UPDATED: Use GET_PLAYER_VENUES_FULL to get all venue fields including targetingClassification
        client.graphql({
          query: GET_PLAYER_VENUES_FULL,
          variables: { playerId, limit: 100 },
        }) as Promise<GraphQLResult<{
          listPlayerVenues: { items: PlayerVenue[]; nextToken: string | null };
        }>>,
        
        client.graphql({
          query: GET_PLAYER_TRANSACTIONS,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerTransactionsByPlayerIdAndTransactionDate: { items: PlayerTransaction[] };
        }>>,
        
        client.graphql({
          query: GET_PLAYER_CREDITS,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerCreditsByPlayerIdAndTransactionDate: { items: PlayerCredits[] };
        }>>,
        
        client.graphql({
          query: GET_PLAYER_POINTS,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerPointsByPlayerIdAndTransactionDate: { items: PlayerPoints[] };
        }>>,
        
        client.graphql({
          query: GET_PLAYER_TICKETS,
          variables: { playerId, sortDirection: 'DESC', limit: 20 },
        }) as Promise<GraphQLResult<{
          playerTicketsByPlayerIdAndAssignedAt: { items: PlayerTicket[] };
        }>>,
      ]);

      const player = playerResponse.data?.getPlayer;
      if (!player) {
        setError('Player not found');
        return;
      }

      // Get initial venues from the response
      let venues: PlayerVenue[] = venuesResponse.data?.listPlayerVenues?.items?.filter(
        (v): v is PlayerVenue => v !== null
      ) || [];
      
      // Fetch additional venues if there are more (pagination)
      let nextToken = venuesResponse.data?.listPlayerVenues?.nextToken;
      while (nextToken) {
        const moreVenuesResponse = await client.graphql({
          query: GET_PLAYER_VENUES_FULL,
          variables: { playerId, limit: 100, nextToken },
        }) as GraphQLResult<{
          listPlayerVenues: { items: PlayerVenue[]; nextToken: string | null };
        }>;
        
        const moreVenues = moreVenuesResponse.data?.listPlayerVenues?.items?.filter(
          (v): v is PlayerVenue => v !== null
        ) || [];
        venues = [...venues, ...moreVenues];
        nextToken = moreVenuesResponse.data?.listPlayerVenues?.nextToken;
      }

      setData({
        player,
        summary: player.playerSummary || null,
        recentResults:
          resultsResponse.data?.playerResultsByPlayerIdAndGameStartDateTime?.items?.filter(Boolean) ||
          [],
        recentEntries:
          entriesResponse.data?.playerEntriesByPlayerIdAndGameStartDateTime?.items?.filter(Boolean) ||
          [],
        venues, // Now contains full venue data with targetingClassification
        transactions:
          transactionsResponse.data?.playerTransactionsByPlayerIdAndTransactionDate?.items?.filter(
            Boolean
          ) || [],
        credits:
          creditsResponse.data?.playerCreditsByPlayerIdAndTransactionDate?.items?.filter(Boolean) ||
          [],
        points:
          pointsResponse.data?.playerPointsByPlayerIdAndTransactionDate?.items?.filter(Boolean) || [],
        tickets:
          ticketsResponse.data?.playerTicketsByPlayerIdAndAssignedAt?.items?.filter(Boolean) || [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch player profile';
      console.error('Error fetching player profile:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { data, loading, error, refetch: fetchProfile };
};

// ============================================================================
// usePlayerVenues - Standalone hook for fetching player venues (NEW)
// ============================================================================

export const usePlayerVenues = (playerId: string | undefined): UsePlayerVenuesResult => {
  const [venues, setVenues] = useState<PlayerVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVenues = useCallback(async () => {
    if (!playerId) {
      setVenues([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();
      let allVenues: PlayerVenue[] = [];
      let nextToken: string | null = null;

      do {
        const response = await client.graphql({
          query: GET_PLAYER_VENUES_FULL,
          variables: { playerId, limit: 100, nextToken },
        }) as GraphQLResult<{
          listPlayerVenues: { items: PlayerVenue[]; nextToken: string | null };
        }>;

        const fetchedVenues = response.data?.listPlayerVenues?.items?.filter(
          (v): v is PlayerVenue => v !== null
        ) || [];
        allVenues = [...allVenues, ...fetchedVenues];
        nextToken = response.data?.listPlayerVenues?.nextToken || null;
      } while (nextToken);

      setVenues(allVenues);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch venues';
      console.error('Error fetching player venues:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    fetchVenues();
  }, [fetchVenues]);

  return { venues, loading, error, refetch: fetchVenues };
};

// ============================================================================
// usePlayersList - Paginated player list with filters
// ============================================================================

export const usePlayersList = (
  filters: PlayerFilters = {},
  initialLimit = 50
): UsePlayersListResult => {
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const buildFilter = useCallback(() => {
    const filter: Record<string, unknown> = {};
    const currentFilters = filtersRef.current;

    if (currentFilters.status && currentFilters.status !== 'ALL') {
      filter.status = { eq: currentFilters.status };
    }
    if (currentFilters.category && currentFilters.category !== 'ALL') {
      filter.category = { eq: currentFilters.category };
    }
    if (currentFilters.targetingClassification && currentFilters.targetingClassification !== 'ALL') {
      filter.targetingClassification = { eq: currentFilters.targetingClassification };
    }
    if (currentFilters.entityId) {
      filter.primaryEntityId = { eq: currentFilters.entityId };
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }, []);

  const fetchPlayers = useCallback(
    async (token: string | null = null, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.graphql({
          query: LIST_PLAYERS_WITH_SUMMARY,
          variables: {
            filter: buildFilter(),
            limit: initialLimit,
            nextToken: token,
          },
        }) as GraphQLResult<{
          listPlayers: { items: PlayerListItem[]; nextToken: string | null };
        }>;

        if (response.data?.listPlayers) {
          const newPlayers = response.data.listPlayers.items.filter(Boolean);
          const sortedPlayers = sortPlayersByLastPlayed(newPlayers);

          if (append) {
            setPlayers((prev) => [...prev, ...sortedPlayers]);
          } else {
            setPlayers(sortedPlayers);
          }
          setNextToken(response.data.listPlayers.nextToken);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch players';
        console.error('Error fetching players:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [buildFilter, initialLimit]
  );

  const loadMore = useCallback(async () => {
    if (nextToken && !loading) {
      await fetchPlayers(nextToken, true);
    }
  }, [nextToken, loading, fetchPlayers]);

  const refetch = useCallback(async () => {
    setPlayers([]);
    setNextToken(null);
    await fetchPlayers(null, false);
  }, [fetchPlayers]);

  useEffect(() => {
    fetchPlayers(null, false);
  }, [filters.status, filters.category, filters.entityId]); // Re-fetch when filters change

  return {
    players,
    loading,
    error,
    nextToken,
    hasMore: !!nextToken,
    loadMore,
    refetch,
  };
};

// ============================================================================
// usePlayerSearch - Search players with debounce
// ============================================================================

export const usePlayerSearch = (debounceMs = 300): UsePlayerSearchResult => {
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    async (term: string) => {
      // Clear previous debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!term || term.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      // Debounce the search
      debounceRef.current = setTimeout(async () => {
        try {
          const client = getClient();
          const response = await client.graphql({
            query: SEARCH_PLAYERS,
            variables: {
              searchTerm: term.toLowerCase(),
              limit: 100,
            },
          }) as GraphQLResult<{
            listPlayers: { items: PlayerListItem[] };
          }>;

          if (response.data?.listPlayers) {
            const results = response.data.listPlayers.items.filter(Boolean);
            const sortedResults = sortPlayersByLastPlayed(results);
            setPlayers(sortedResults);
          }
          setError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Search failed';
          console.error('Error searching players:', err);
          setError(message);
        } finally {
          setLoading(false);
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  const clear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setPlayers([]);
    setError(null);
    setLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return { players, loading, error, search, clear };
};

// ============================================================================
// useTopPlayers - Fetch top performing players
// ============================================================================

export const useTopPlayers = (limit = 10): UseTopPlayersResult => {
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTopPlayers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const client = getClient();
      const response = await client.graphql({
        query: LIST_TOP_PLAYERS,
        variables: {
          filter: { status: { eq: PlayerAccountStatus.ACTIVE } },
          limit: limit * 2, // Fetch more to sort and slice
        },
      }) as GraphQLResult<{
        listPlayers: { items: PlayerListItem[] };
      }>;

      if (response.data?.listPlayers) {
        const allPlayers = response.data.listPlayers.items.filter(
          (p): p is PlayerListItem => p !== null && p.playerSummary !== null
        );
        const sortedPlayers = sortPlayersByNetBalance(allPlayers).slice(0, limit);
        setPlayers(sortedPlayers);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch top players';
      console.error('Error fetching top players:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchTopPlayers();
  }, [fetchTopPlayers]);

  return { players, loading, error, refetch: fetchTopPlayers };
};

// ============================================================================
// usePlayersDashboard - Combined data for dashboard view
// ============================================================================

export const usePlayersDashboard = (
  selectedStatus: PlayerAccountStatus | 'ALL' = 'ALL',
  limit = 50
): UsePlayersDashboardResult => {
  const [players, setPlayers] = useState<PlayerListItem[]>([]);
  const [topPlayers, setTopPlayers] = useState<PlayerListItem[]>([]);
  const [stats, setStats] = useState<PlayerDashboardStats>({
    totalPlayers: 0,
    activePlayers: 0,
    totalGamesPlayed: 0,
    totalNetBalance: 0,
    uniqueEntities: new Set(),
    uniqueVenues: new Set(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const calculateStats = useCallback((playersList: PlayerListItem[]) => {
    const uniqueEntities = new Set<string>();
    const uniqueVenues = new Set<string>();
    let totalGames = 0;
    let totalNet = 0;
    let activePlayers = 0;

    playersList.forEach((player) => {
      if (player.status === PlayerAccountStatus.ACTIVE) {
        activePlayers++;
      }

      if (player.playerSummary) {
        totalGames += player.playerSummary.gamesPlayedAllTime || 0;
        totalNet += player.playerSummary.netBalance || 0;
      }

      player.playerVenues?.items?.forEach((pv) => {
        if (pv?.venue) {
          uniqueVenues.add(pv.venue.id);
          if (pv.venue.entityId) {
            uniqueEntities.add(pv.venue.entityId);
          }
        }
      });
    });

    setStats({
      totalPlayers: playersList.length,
      activePlayers,
      totalGamesPlayed: totalGames,
      totalNetBalance: totalNet,
      uniqueEntities,
      uniqueVenues,
    });
  }, []);

  const fetchDashboardData = useCallback(
    async (token: string | null = null, append = false) => {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();

        const filter = selectedStatus !== 'ALL' ? { status: { eq: selectedStatus } } : undefined;

        // Fetch main players list
        const playersResponse = await client.graphql({
          query: LIST_PLAYERS_FOR_DASHBOARD,
          variables: {
            filter,
            limit,
            nextToken: token,
          },
        }) as GraphQLResult<{
          listPlayers: { items: PlayerListItem[]; nextToken: string | null };
        }>;

        if (playersResponse.data?.listPlayers) {
          const newPlayers = playersResponse.data.listPlayers.items.filter(Boolean);

          if (append) {
            setPlayers((prev) => {
              const combined = [...prev, ...newPlayers];
              calculateStats(combined);
              return combined;
            });
          } else {
            setPlayers(newPlayers);
            calculateStats(newPlayers);
          }
          setNextToken(playersResponse.data.listPlayers.nextToken);
        }

        // Only fetch top players on initial load
        if (!append) {
          const topResponse = await client.graphql({
            query: LIST_TOP_PLAYERS,
            variables: {
              filter: { status: { eq: PlayerAccountStatus.ACTIVE } },
              limit: 20,
            },
          }) as GraphQLResult<{
            listPlayers: { items: PlayerListItem[] };
          }>;

          if (topResponse.data?.listPlayers) {
            const allPlayers = topResponse.data.listPlayers.items.filter(
              (p): p is PlayerListItem => p !== null && p.playerSummary !== null
            );
            const sortedTop = sortPlayersByNetBalance(allPlayers).slice(0, 5);
            setTopPlayers(sortedTop);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard';
        console.error('Error fetching dashboard data:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [selectedStatus, limit, calculateStats]
  );

  const loadMore = useCallback(async () => {
    if (nextToken && !loading) {
      await fetchDashboardData(nextToken, true);
    }
  }, [nextToken, loading, fetchDashboardData]);

  const refetch = useCallback(async () => {
    setPlayers([]);
    setTopPlayers([]);
    setNextToken(null);
    await fetchDashboardData(null, false);
  }, [fetchDashboardData]);

  useEffect(() => {
    fetchDashboardData(null, false);
  }, [selectedStatus]); // Re-fetch when status filter changes

  return {
    players,
    topPlayers,
    stats,
    loading,
    error,
    nextToken,
    hasMore: !!nextToken,
    loadMore,
    refetch,
  };
};

// ============================================================================
// usePlayerResults - Paginated player results
// ============================================================================

export const usePlayerResults = (playerId: string | undefined, limit = 20) => {
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const fetchResults = useCallback(
    async (token: string | null = null, append = false) => {
      if (!playerId) return;

      setLoading(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.graphql({
          query: GET_PLAYER_RESULTS,
          variables: {
            playerId,
            sortDirection: 'DESC',
            limit,
            nextToken: token,
          },
        }) as GraphQLResult<{
          playerResultsByPlayerIdAndGameStartDateTime: {
            items: PlayerResult[];
            nextToken: string | null;
          };
        }>;

        if (response.data?.playerResultsByPlayerIdAndGameStartDateTime) {
          const newResults =
            response.data.playerResultsByPlayerIdAndGameStartDateTime.items.filter(Boolean);

          if (append) {
            setResults((prev) => [...prev, ...newResults]);
          } else {
            setResults(newResults);
          }
          setNextToken(response.data.playerResultsByPlayerIdAndGameStartDateTime.nextToken);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch results';
        console.error('Error fetching player results:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [playerId, limit]
  );

  const loadMore = useCallback(async () => {
    if (nextToken && !loading) {
      await fetchResults(nextToken, true);
    }
  }, [nextToken, loading, fetchResults]);

  useEffect(() => {
    if (playerId) {
      fetchResults(null, false);
    }
  }, [playerId, fetchResults]);

  return {
    results,
    loading,
    error,
    nextToken,
    hasMore: !!nextToken,
    loadMore,
    refetch: () => fetchResults(null, false),
  };
};

// ============================================================================
// usePlayerTickets - Paginated player tickets
// ============================================================================

export const usePlayerTickets = (playerId: string | undefined, limit = 20) => {
  const [tickets, setTickets] = useState<PlayerTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const fetchTickets = useCallback(
    async (token: string | null = null, append = false) => {
      if (!playerId) return;

      setLoading(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.graphql({
          query: GET_PLAYER_TICKETS,
          variables: {
            playerId,
            sortDirection: 'DESC',
            limit,
            nextToken: token,
          },
        }) as GraphQLResult<{
          playerTicketsByPlayerIdAndAssignedAt: {
            items: PlayerTicket[];
            nextToken: string | null;
          };
        }>;

        if (response.data?.playerTicketsByPlayerIdAndAssignedAt) {
          const newTickets =
            response.data.playerTicketsByPlayerIdAndAssignedAt.items.filter(Boolean);

          if (append) {
            setTickets((prev) => [...prev, ...newTickets]);
          } else {
            setTickets(newTickets);
          }
          setNextToken(response.data.playerTicketsByPlayerIdAndAssignedAt.nextToken);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch tickets';
        console.error('Error fetching player tickets:', err);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [playerId, limit]
  );

  const loadMore = useCallback(async () => {
    if (nextToken && !loading) {
      await fetchTickets(nextToken, true);
    }
  }, [nextToken, loading, fetchTickets]);

  useEffect(() => {
    if (playerId) {
      fetchTickets(null, false);
    }
  }, [playerId, fetchTickets]);

  return {
    tickets,
    loading,
    error,
    nextToken,
    hasMore: !!nextToken,
    loadMore,
    refetch: () => fetchTickets(null, false),
  };
};