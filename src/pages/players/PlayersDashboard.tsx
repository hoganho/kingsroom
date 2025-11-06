// src/pages/players/PlayersDashboard.tsx
// Players Dashboard - Shows ALL activity across ALL entities (no filtering)

import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { PlayerCard } from '../../components/players/PlayerCard';
import { 
  UserGroupIcon,
  TrophyIcon,
  CurrencyDollarIcon,
  BuildingOffice2Icon 
} from '@heroicons/react/24/outline';

// Player type that matches the GraphQL query response
// Not extending APITypes.Player to avoid __typename conflicts
interface PlayerWithSummary {
  id: string;
  name?: string | null;
  email?: string | null;
  isActive?: boolean | null;
  registrationVenue?: {
    id?: string;
    name?: string;
    entityId?: string;
    entity?: {
      entityName?: string;
    };
  } | null;
  summary?: {
    totalGamesPlayed?: number | null;
    totalEarnings?: number | null;
    roi?: number | null;
    lastGameDate?: string | null;
  } | null;
  playerEntries?: {
    items?: Array<{
      id?: string;
      winnings?: number;
      game?: {
        id?: string;
        entityId?: string;
        entity?: {
          entityName?: string;
        } | null;
        venue?: {
          name?: string;
        } | null;
      } | null;
    } | null> | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  // Allow additional fields from the API
  [key: string]: any;
}

export const PlayersDashboard: React.FC = () => {
  const client = generateClient();
  
  // NO entity filtering for players - they play across all entities
  const [players, setPlayers] = useState<PlayerWithSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  
  // Statistics across ALL entities
  const [stats, setStats] = useState({
    totalPlayers: 0,
    activePlayers: 0,
    totalGamesPlayed: 0,
    totalPrizeWon: 0,
    uniqueEntities: new Set<string>(),
    uniqueVenues: new Set<string>()
  });

  // Top players with entity breakdown
  const [topPlayers, setTopPlayers] = useState<any[]>([]);

  useEffect(() => {
    fetchPlayers();
    fetchTopPlayers();
  }, []);

  const fetchPlayers = async (token: string | null = null) => {
    try {
      setLoading(true);
      setError(null);

      // NO entity filter - fetch ALL players
      const response = await client.graphql({
        query: /* GraphQL */ `
          query ListAllPlayers($limit: Int, $nextToken: String) {
            listPlayers(
              limit: $limit, 
              nextToken: $nextToken,
              filter: { isActive: { eq: true } }
            ) {
              items {
                id
                name
                email
                isActive
                registrationVenue {
                  id
                  name
                  entityId
                  entity {
                    entityName
                  }
                }
                summary {
                  totalGamesPlayed
                  totalEarnings
                  roi
                  lastGameDate
                }
                playerEntries {
                  items {
                    id
                    game {
                      id
                      entityId
                      entity {
                        entityName
                      }
                      venue {
                        name
                      }
                    }
                  }
                }
                createdAt
                updatedAt
              }
              nextToken
            }
          }
        `,
        variables: {
          limit: 50,
          nextToken: token
        }
      });

      const responseData = (response as GraphQLResult<any>).data;
      if (responseData) {
        const playerItems = responseData.listPlayers.items as PlayerWithSummary[];
        
        if (token) {
          setPlayers(prev => [...prev, ...playerItems]);
        } else {
          setPlayers(playerItems);
        }
        
        setNextToken(responseData.listPlayers.nextToken);
        
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
      const response = await client.graphql({
        query: /* GraphQL */ `
          query ListTopPlayers {
            listPlayers(
              limit: 10,
              filter: { isActive: { eq: true } }
            ) {
              items {
                id
                name
                email
                summary {
                  totalGamesPlayed
                  totalEarnings
                  roi
                  lastGameDate
                }
                playerEntries {
                  items {
                    id
                    winnings
                    game {
                      id
                      entity {
                        entityName
                      }
                    }
                  }
                }
              }
            }
          }
        `
      });

      const responseData = (response as GraphQLResult<any>).data;
      if (responseData) {
        const players = responseData.listPlayers.items;
        
        // Calculate entity breakdown for each player
        const topPlayersWithBreakdown = players.map((player: any) => {
          const entityBreakdown: Record<string, any> = {};
          
          player.playerEntries?.items?.forEach((entry: any) => {
            const entityName = entry.game?.entity?.entityName || 'Unknown';
            if (!entityBreakdown[entityName]) {
              entityBreakdown[entityName] = {
                games: 0,
                winnings: 0
              };
            }
            entityBreakdown[entityName].games++;
            entityBreakdown[entityName].winnings += entry.winnings || 0;
          });
          
          return {
            ...player,
            entityBreakdown
          };
        }).sort((a: any, b: any) => 
          (b.summary?.totalEarnings || 0) - (a.summary?.totalEarnings || 0)
        );
        
        setTopPlayers(topPlayersWithBreakdown.slice(0, 5));
      }
    } catch (err) {
      console.error('Error fetching top players:', err);
    }
  };

  const calculateCrossEntityStats = (playersList: PlayerWithSummary[]) => {
    const uniqueEntities = new Set<string>();
    const uniqueVenues = new Set<string>();
    let totalGames = 0;
    let totalPrize = 0;
    let activePlayers = 0;
    
    playersList.forEach(player => {
      // Count games and earnings
      if (player.summary) {
        totalGames += player.summary.totalGamesPlayed || 0;
        totalPrize += player.summary.totalEarnings || 0;
        
        // Check if active (played in last 30 days)
        if (player.summary.lastGameDate) {
          const lastGame = new Date(player.summary.lastGameDate);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          if (lastGame > thirtyDaysAgo) {
            activePlayers++;
          }
        }
      }
      
      // Collect unique entities and venues from player entries
      player.playerEntries?.items?.forEach(entry => {
        if (entry?.game?.entity?.entityName) {
          uniqueEntities.add(entry.game.entity.entityName);
        }
        if (entry?.game?.venue?.name) {
          uniqueVenues.add(entry.game.venue.name);
        }
      });
      
      // Also track registration venue
      if (player.registrationVenue?.entity?.entityName) {
        uniqueEntities.add(player.registrationVenue.entity.entityName);
      }
    });
    
    setStats({
      totalPlayers: playersList.length,
      activePlayers,
      totalGamesPlayed: totalGames,
      totalPrizeWon: totalPrize,
      uniqueEntities,
      uniqueVenues
    });
  };

  const loadMore = () => {
    if (nextToken && !loading) {
      fetchPlayers(nextToken);
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
                        {stats.totalPlayers}
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
                      Total Prize Won
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      ${stats.totalPrizeWon.toLocaleString()}
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
                  Showing players across all entities
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
                    {players.map(player => (
                      <li key={player.id}>
                        <PlayerCard 
                          player={player} 
                          showEntityInfo={true}
                        />
                      </li>
                    ))}
                  </ul>

                  {nextToken && (
                    <div className="px-4 py-3 bg-gray-50 text-center">
                      <button
                        onClick={loadMore}
                        disabled={loading}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {loading ? 'Loading...' : 'Load More'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Top Players Sidebar - 1/3 width */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Top Players
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  By total earnings across all entities
                </p>
              </div>

              <div className="px-4 py-5 sm:p-6">
                <div className="space-y-4">
                  {topPlayers.map((player, index) => (
                    <div key={player.id} className="flex items-start space-x-3">
                      <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-800 text-sm font-medium">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {player.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          ${(player.summary?.totalEarnings || 0).toLocaleString()}
                        </p>
                        {/* Entity breakdown */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(player.entityBreakdown || {}).map(([entity, data]: [string, any]) => (
                            <span
                              key={entity}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                              title={`${data.games} games, $${data.winnings}`}
                            >
                              {entity}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {topPlayers.length === 0 && !loading && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No players found
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};