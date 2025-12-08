// src/pages/players/PlayersDashboard.tsx
// Players Dashboard - Shows ALL activity across ALL entities (no filtering)
// FIXED VERSION - Corrected imports and enum values

import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
// Remove unused import to fix TS error
// import { PlayerCard } from '../../components/players/PlayerCard';
import { 
  UserGroupIcon,
  TrophyIcon,
  CurrencyDollarIcon,
  BuildingOffice2Icon 
} from '@heroicons/react/24/outline';

// Import enums as VALUES (not types) and types separately
import { 
  PlayerAccountStatus,
  PlayerAccountCategory 
} from '../../API'; // Regular import for enums

import type { 
  PlayerSummary, 
  ModelPlayerFilterInput,
  ModelPlayerVenueConnection,
  ModelPlayerEntryConnection
} from '../../API'; // Type imports

// Define a type-safe interface that matches API structure
interface PlayerWithRelationships {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status: PlayerAccountStatus;
  category: PlayerAccountCategory;
  targetingClassification?: string | null;
  registrationDate: string;
  firstGamePlayed?: string | null;
  lastPlayedDate?: string | null;
  creditBalance?: number | null;
  pointsBalance?: number | null;
  primaryEntityId?: string | null;
  playerSummary?: PlayerSummary | null;
  playerVenues?: ModelPlayerVenueConnection | null;
  playerEntries?: ModelPlayerEntryConnection | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// Custom query for fetching players with all necessary relationships
const LIST_PLAYERS_WITH_DETAILS = /* GraphQL */ `
  query ListPlayersWithDetails(
    $filter: ModelPlayerFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
        targetingClassification
        registrationDate
        firstGamePlayed
        lastPlayedDate
        creditBalance
        pointsBalance
        primaryEntityId
        playerSummary {
          id
          gamesPlayedLast30Days
          gamesPlayedLast90Days
          gamesPlayedAllTime
          averageFinishPosition
          netBalance
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          venuesVisited
          tournamentWinnings
          tournamentBuyIns
          totalWinnings
          totalBuyIns
          lastPlayed
        }
        playerVenues(limit: 5) {
          items {
            id
            totalGamesPlayed
            averageBuyIn
            lastPlayedDate
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
          __typename
        }
        playerEntries(limit: 10, sortDirection: DESC) {
          items {
            id
            gameStartDateTime
            status
            game {
              id
              name
              entityId
              entity {
                id
                entityName
              }
              venue {
                id
                name
              }
            }
          }
          __typename
        }
      }
      nextToken
    }
  }
`;

// Query for top performers
const LIST_TOP_PLAYERS = /* GraphQL */ `
  query ListTopPlayers($filter: ModelPlayerFilterInput) {
    listPlayers(filter: $filter, limit: 10) {
      items {
        id
        firstName
        lastName
        email
        status
        playerSummary {
          totalWinnings
          totalBuyIns
          netBalance
          gamesPlayedAllTime
          tournamentsPlayed
          averageFinishPosition
        }
        playerVenues(limit: 3) {
          items {
            venue {
              name
              entity {
                entityName
              }
            }
          }
          __typename
        }
      }
    }
  }
`;

export const PlayersDashboard: React.FC = () => {
  const client = generateClient();
  
  const [players, setPlayers] = useState<PlayerWithRelationships[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<PlayerAccountStatus | 'ALL'>('ALL');
  
  // Statistics across ALL entities
  const [stats, setStats] = useState({
    totalEntries: 0,
    totalInitialEntries: 0,
    totalUniquePlayers: 0,
    activePlayers: 0,
    totalGamesPlayed: 0,
    totalNetBalance: 0,
    uniqueEntities: new Set<string>(),
    uniqueVenues: new Set<string>()
  });

  // Top players with entity breakdown
  const [topPlayers, setTopPlayers] = useState<PlayerWithRelationships[]>([]);

  useEffect(() => {
    fetchPlayers();
    fetchTopPlayers();
  }, [selectedStatus]);

  const fetchPlayers = async (token: string | null = null) => {
    try {
      setLoading(true);
      setError(null);

      // Build filter based on status selection
      const filter: ModelPlayerFilterInput = {};
      if (selectedStatus !== 'ALL') {
        filter.status = { eq: selectedStatus };
      }

      const response = await client.graphql({
        query: LIST_PLAYERS_WITH_DETAILS,
        variables: {
          filter,
          limit: 50,
          nextToken: token
        }
      }) as GraphQLResult<{ listPlayers: { items: PlayerWithRelationships[], nextToken: string | null } }>;

      if (response.data) {
        const playerItems = response.data.listPlayers.items;
        
        if (token) {
          setPlayers(prev => [...prev, ...playerItems]);
        } else {
          setPlayers(playerItems);
        }
        
        setNextToken(response.data.listPlayers.nextToken);
        
        // Calculate statistics across ALL entities
        calculateCrossEntityStats(playerItems);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load players';
      console.error('Error fetching players:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopPlayers = async () => {
    try {
      // Fetch active players only for top performers
      const filter: ModelPlayerFilterInput = {
        status: { eq: PlayerAccountStatus.ACTIVE }
      };

      const response = await client.graphql({
        query: LIST_TOP_PLAYERS,
        variables: { filter }
      }) as GraphQLResult<{ listPlayers: { items: PlayerWithRelationships[] } }>;

      if (response.data) {
        const players = response.data.listPlayers.items;
        
        // Sort by net balance (winnings - buyins)
        const sortedPlayers = players
          .filter(p => p.playerSummary)
          .sort((a, b) => {
            const aNet = (a.playerSummary?.netBalance || 0);
            const bNet = (b.playerSummary?.netBalance || 0);
            return bNet - aNet;
          })
          .slice(0, 5);
        
        setTopPlayers(sortedPlayers);
      }
    } catch (err) {
      console.error('Error fetching top players:', err);
    }
  };

  const calculateCrossEntityStats = (playersList: PlayerWithRelationships[]) => {
    const uniqueEntities = new Set<string>();
    const uniqueVenues = new Set<string>();
    let totalGames = 0;
    let totalNet = 0;
    let activePlayers = 0;
    
    playersList.forEach(player => {
      // Count active players
      if (player.status === PlayerAccountStatus.ACTIVE) {
        activePlayers++;
      }

      // Sum up games and earnings from player summary
      if (player.playerSummary) {
        totalGames += player.playerSummary.gamesPlayedAllTime || 0;
        totalNet += player.playerSummary.netBalance || 0;
      }

      // Collect unique entities and venues from player venues
      player.playerVenues?.items?.forEach(pv => {
        if (pv?.venue) {
          uniqueVenues.add(pv.venue.id);
          if (pv.venue.entityId) {
            uniqueEntities.add(pv.venue.entityId);
          }
        }
      });
    });

    setStats({
      totalEntries: 0,
      totalInitialEntries: 0,
      totalUniquePlayers: playersList.length,
      activePlayers,
      totalGamesPlayed: totalGames,
      totalNetBalance: totalNet,
      uniqueEntities,
      uniqueVenues
    });
  };

  const loadMore = () => {
    if (nextToken) {
      fetchPlayers(nextToken);
    }
  };

  // Helper function to format player name
  const formatPlayerName = (player: PlayerWithRelationships): string => {
    return `${player.firstName} ${player.lastName}`;
  };

  // Helper function to get player's primary venue
  const getPrimaryVenue = (player: PlayerWithRelationships): string => {
    const venues = player.playerVenues?.items || [];
    if (venues.length === 0) return 'No venue';
    
    // Find the venue with most games played
    const primaryVenue = venues.reduce((prev, current) => {
      if (!current || !prev) return prev || current;
      return (current.totalGamesPlayed || 0) > (prev.totalGamesPlayed || 0) ? current : prev;
    });
    
    return primaryVenue?.venue?.name || 'Unknown venue';
  };

  // Helper function to format status - using actual enum values
  const formatStatus = (status: PlayerAccountStatus): { label: string; color: string } => {
    switch (status) {
      case PlayerAccountStatus.ACTIVE:
        return { label: 'Active', color: 'green' };
      case PlayerAccountStatus.SUSPENDED:
        return { label: 'Suspended', color: 'yellow' };
      case PlayerAccountStatus.PENDING_VERIFICATION:
        return { label: 'Pending', color: 'gray' };
      default:
        return { label: status, color: 'gray' };
    }
  };

  // Helper function to format category - using actual enum values
  const formatCategory = (category: PlayerAccountCategory): { label: string; color: string } => {
    switch (category) {
      case PlayerAccountCategory.NEW:
        return { label: 'New', color: 'green' };
      case PlayerAccountCategory.RECREATIONAL:
        return { label: 'Recreational', color: 'blue' };
      case PlayerAccountCategory.REGULAR:
        return { label: 'Regular', color: 'indigo' };
      case PlayerAccountCategory.VIP:
        return { label: 'VIP', color: 'purple' };
      case PlayerAccountCategory.LAPSED:
        return { label: 'Lapsed', color: 'gray' };
      default:
        return { label: category, color: 'gray' };
    }
  };

  return (
    <PageWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-4 sm:px-6 lg:max-w-7xl lg:mx-auto lg:px-8">
            <div className="py-6">
              <div className="md:flex md:items-center md:justify-between">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                    All Players Dashboard
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Activity across all entities and venues
                  </p>
                </div>
                <div className="mt-4 md:mt-0">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value as PlayerAccountStatus | 'ALL')}
                    className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value={PlayerAccountStatus.ACTIVE}>Active</option>
                    <option value={PlayerAccountStatus.SUSPENDED}>Suspended</option>
                    <option value={PlayerAccountStatus.PENDING_VERIFICATION}>Pending Verification</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UserGroupIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Players
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.totalUniquePlayers}
                      </div>
                      <div className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                        {stats.activePlayers} active
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrophyIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Games
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.totalGamesPlayed.toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CurrencyDollarIcon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Net Balance
                    </dt>
                    <dd className={`text-2xl font-semibold ${stats.totalNetBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.abs(stats.totalNetBalance).toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <BuildingOffice2Icon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Entities & Venues
                    </dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {stats.uniqueEntities.size} entities, {stats.uniqueVenues.size} venues
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Player List - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  All Players
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Showing {selectedStatus === 'ALL' ? 'all' : selectedStatus.toLowerCase()} players across all entities
                </p>
              </div>

              {loading && players.length === 0 ? (
                <div className="px-4 py-5 sm:p-6">
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-20 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-gray-200">
                    {players.map(player => {
                      const status = formatStatus(player.status);
                      const category = formatCategory(player.category);
                      return (
                        <li key={player.id} className="px-4 py-4 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className="flex-shrink-0">
                                <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                                  <span className="text-sm font-medium text-gray-600">
                                    {player.firstName[0]}{player.lastName[0]}
                                  </span>
                                </div>
                              </div>
                              <div className="ml-4">
                                <p className="text-sm font-medium text-gray-900">
                                  {formatPlayerName(player)}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {player.email || 'No email'}
                                </p>
                                <div className="mt-1 flex items-center space-x-4">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${status.color}-100 text-${status.color}-800`}>
                                    {status.label}
                                  </span>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${category.color}-100 text-${category.color}-800`}>
                                    {category.label}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {getPrimaryVenue(player)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-900">
                                {player.playerSummary?.gamesPlayedAllTime || 0} games
                              </p>
                              <p className={`text-sm ${(player.playerSummary?.netBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${Math.abs(player.playerSummary?.netBalance || 0).toLocaleString()}
                              </p>
                              {player.playerSummary?.lastPlayed && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Last: {new Date(player.playerSummary.lastPlayed).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {nextToken && (
                    <div className="px-4 py-3 bg-gray-50 sm:px-6">
                      <button
                        onClick={loadMore}
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {loading ? 'Loading...' : 'Load More Players'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Top Players - 1/3 width */}
          <div>
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Top Performers
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  By net balance (winnings - buy-ins)
                </p>
              </div>

              <div className="bg-white">
                <ul className="divide-y divide-gray-200">
                  {topPlayers.map((player, index) => {
                    const category = formatCategory(player.category);
                    return (
                      <li key={player.id} className="px-4 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                              index === 0 ? 'bg-yellow-400' : 
                              index === 1 ? 'bg-gray-300' : 
                              index === 2 ? 'bg-orange-400' : 'bg-gray-200'
                            }`}>
                              <span className="text-sm font-bold text-white">
                                {index + 1}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {formatPlayerName(player)}
                            </p>
                            <div className="mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${category.color}-100 text-${category.color}-800`}>
                                {category.label}
                              </span>
                            </div>
                            <div className="mt-1">
                              <p className="text-sm text-gray-500">
                                {player.playerSummary?.gamesPlayedAllTime || 0} games
                              </p>
                              <p className={`text-sm font-semibold ${
                                (player.playerSummary?.netBalance || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                Net: ${Math.abs(player.playerSummary?.netBalance || 0).toLocaleString()}
                              </p>
                            </div>
                            {player.playerVenues?.items && player.playerVenues.items.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-gray-500">
                                  Venues:
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {player.playerVenues.items.slice(0, 3).map(pv => (
                                    pv?.venue && (
                                      <span key={pv.venue.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                        {pv.venue.name}
                                      </span>
                                    )
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};