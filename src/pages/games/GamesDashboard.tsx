// src/pages/games/GamesDashboard.tsx
// Games Dashboard with multi-entity viewing support

import React, { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { useEntity } from '../../contexts/EntityContext';
import { MultiEntitySelector, EntityQuickFilters } from '../../components/entities/MultiEntitySelector';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GameCard } from '../../components/games/GameCard';
import { 
  TrophyIcon, 
  UserGroupIcon,
  CurrencyDollarIcon,
  BuildingOffice2Icon 
} from '@heroicons/react/24/outline';
import * as APITypes from '../../API';

type Game = APITypes.Game;

export const GamesDashboard: React.FC = () => {
  const client = generateClient();
  const { selectedEntities, loading: entitiesLoading } = useEntity();
  
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  
  // Statistics by entity
  const [statsByEntity, setStatsByEntity] = useState<Record<string, any>>({});
  const [totalStats, setTotalStats] = useState({
    totalGames: 0,
    activeGames: 0,
    totalPrizePool: 0,
    totalInitialEntries: 0,
    totalEntries: 0,
    totalUniquePlayers: 0,
    todaysGames: 0,
    upcomingGames: 0
  });

  // Fetch games when selected entities change
  useEffect(() => {
    if (!entitiesLoading && selectedEntities.length > 0) {
      fetchGames();
    } else if (selectedEntities.length === 0) {
      setGames([]);
      setTotalStats({
        totalGames: 0,
        activeGames: 0,
        totalPrizePool: 0,
        totalInitialEntries: 0,
        totalEntries: 0,
        totalUniquePlayers: 0,
        todaysGames: 0,
        upcomingGames: 0
      });
    }
  }, [selectedEntities, entitiesLoading]);

  const fetchGames = async (token: string | null = null) => {
    if (selectedEntities.length === 0) {
      setGames([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build filter for selected entities
      const entityFilter = selectedEntities.length === 1
        ? { entityId: { eq: selectedEntities[0].id } }
        : { or: selectedEntities.map(e => ({ entityId: { eq: e.id } })) };

      const response = await client.graphql<GraphQLResult<any>>({
        query: /* GraphQL */ `
          query ListGamesForEntities($filter: ModelGameFilterInput, $limit: Int, $nextToken: String) {
            listGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
              items {
                id
                name
                gameType
                gameVariant
                gameStatus
                gameStartDateTime
                buyIn
                totalUniquePlayers
                totalInitialEntries
                totalEntries
                prizepoolPaid
                prizepoolCalculated
                entityId
                entity {
                  id
                  entityName
                }
                venue {
                  id
                  name
                }
                createdAt
                updatedAt
              }
              nextToken
            }
          }
        `,
        variables: {
          filter: {
            and: [
              entityFilter,
              { gameStatus: { ne: 'CANCELLED' } }
            ]
          },
          limit: 50,
          nextToken: token
        }
      });

      if ('data' in response && response.data) {
        const gameItems = response.data.listGames.items as Game[];
        
        if (token) {
          setGames(prev => [...prev, ...gameItems]);
        } else {
          setGames(gameItems);
        }
        
        setNextToken(response.data.listGames.nextToken);
        
        // Calculate statistics
        calculateStats(gameItems);
      }
    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to load games. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (gamesList: Game[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Calculate stats by entity
    const entityStats: Record<string, any> = {};
    
    gamesList.forEach(game => {
      const entityId = game.entityId || 'unknown';
      
      if (!entityStats[entityId]) {
        entityStats[entityId] = {
          entityName: game.entity?.entityName || 'Unknown',
          totalGames: 0,
          activeGames: 0,
          totalPrizePool: 0,
          totalInitialEntries: 0,
          totalEntries: 0,
          totalUniquePlayers: 0,
          todaysGames: 0,
          upcomingGames: 0
        };
      }
      
      entityStats[entityId].totalGames++;
      
      if (game.gameStatus === 'RUNNING' || game.gameStatus === 'REGISTERING') {
        entityStats[entityId].activeGames++;
      }
      
      if (game.prizepoolPaid) {
        entityStats[entityId].totalPrizePool += game.prizepoolPaid;
      }
      
      if (game.prizepoolCalculated) {
        entityStats[entityId].totalPrizePoolCalculated += game.prizepoolCalculated;
      }

      if (game.totalUniquePlayers) {
        entityStats[entityId].totalUniquePlayers += game.totalUniquePlayers;
      }

      if (game.totalEntries) {
        entityStats[entityId].totalEntries += game.totalEntries;
      }
      
      if (game.totalInitialEntries) {
        entityStats[entityId].totalInitialEntries += game.totalInitialEntries;
      }

      const gameDate = new Date(game.gameStartDateTime);
      if (gameDate.toDateString() === today.toDateString()) {
        entityStats[entityId].todaysGames++;
      }
      
      if (gameDate > now) {
        entityStats[entityId].upcomingGames++;
      }
    });
    
    setStatsByEntity(entityStats);
    
    // Calculate total stats
    const totals = Object.values(entityStats).reduce((acc: any, stats: any) => ({
      totalGames: acc.totalGames + stats.totalGames,
      activeGames: acc.activeGames + stats.activeGames,
      totalPrizePool: acc.totalPrizePool + stats.totalPrizePool,
      totalUniquePlayers: acc.totalUniquePlayers + stats.totalUniquePlayers,
      totalInitialEntries: acc.totalInitialEntries + stats.totalInitialEntries,
      totalEntries: acc.totalEntries + stats.totalEntries,
      todaysGames: acc.todaysGames + stats.todaysGames,
      upcomingGames: acc.upcomingGames + stats.upcomingGames
    }), {
      totalGames: 0,
      activeGames: 0,
      totalPrizePool: 0,
      totalInitialEntries: 0,
      totalEntries: 0,
      totalUniquePlayers: 0,
      todaysGames: 0,
      upcomingGames: 0
    });
    
    setTotalStats(totals);
  };

  const handleLoadMore = () => {
    if (nextToken) {
      fetchGames(nextToken);
    }
  };

  const handleRefresh = () => {
    setGames([]);
    setNextToken(null);
    fetchGames();
  };

  // Group games by entity for display
  const gamesByEntity = games.reduce((acc, game) => {
    const entityName = game.entity?.entityName || 'Unknown';
    if (!acc[entityName]) {
      acc[entityName] = [];
    }
    acc[entityName].push(game);
    return acc;
  }, {} as Record<string, Game[]>);

  return (
    <PageWrapper
      title="Games Dashboard"
      actions={
        <div className="flex items-center space-x-4">
          <MultiEntitySelector showLabel={false} />
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      {/* Entity Quick Filters */}
      <div className="mb-6">
        <EntityQuickFilters />
      </div>

      {/* Selected Entities Info */}
      {selectedEntities.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <BuildingOffice2Icon className="h-5 w-5 text-blue-500 mr-2" />
            <span className="text-sm font-medium text-blue-900">
              Viewing games from: {selectedEntities.map(e => e.entityName).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
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
                  <dd className="text-lg font-medium text-gray-900">
                    {totalStats.totalGames}
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
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Initial Entries
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalStats.totalInitialEntries.toLocaleString()}
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
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Entries
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalStats.totalEntries.toLocaleString()}
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
                <UserGroupIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Unique Players
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {totalStats.totalUniquePlayers.toLocaleString()}
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
                    Total Prize Pool
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    ${totalStats.totalPrizePool.toLocaleString()}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats by Entity */}
      {selectedEntities.length > 1 && Object.keys(statsByEntity).length > 0 && (
        <div className="mb-8 bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Statistics by Entity
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {Object.entries(statsByEntity).map(([entityId, stats]: [string, any]) => (
              <div key={entityId} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{stats.entityName}</p>
                    <p className="text-sm text-gray-500">
                      {stats.totalGames} games • {stats.totalUniquePlayers} players • {stats.totalInitialEntries} initial entries • {stats.totalEntries} entries • ${stats.totalPrizePool.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-green-600">{stats.activeGames} active</span>
                    <span className="text-blue-600">{stats.todaysGames} today</span>
                    <span className="text-gray-600">{stats.upcomingGames} upcoming</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Games List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Recent Games
          </h3>
        </div>

        {loading && games.length === 0 ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-12">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No games found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {selectedEntities.length === 0 
                ? 'Please select at least one entity to view games.'
                : 'No games have been created for the selected entities.'}
            </p>
          </div>
        ) : (
          <>
            {/* Group by entity if multiple selected */}
            {selectedEntities.length > 1 ? (
              <div className="divide-y divide-gray-200">
                {Object.entries(gamesByEntity).map(([entityName, entityGames]) => (
                  <div key={entityName}>
                    <div className="px-4 py-3 bg-gray-50">
                      <h4 className="text-sm font-medium text-gray-700">
                        {entityName} ({entityGames.length})
                      </h4>
                    </div>
                    <ul className="divide-y divide-gray-200">
                      {entityGames.map((game) => (
                        <GameCard key={game.id} game={game} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {games.map((game) => (
                  <GameCard key={game.id} game={game} />
                ))}
              </ul>
            )}

            {/* Load More Button */}
            {nextToken && (
              <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PageWrapper>
  );
};