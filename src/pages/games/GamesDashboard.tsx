// src/pages/games/GamesDashboard.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useNavigate } from 'react-router-dom';
import { CalendarIcon, UserGroupIcon, TrophyIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { format, subDays } from 'date-fns';


interface Game {
  id: string;
  tournamentId?: string;
  name: string;
  gameType: string;
  gameStatus: string;
  gameStartDateTime: string;
  gameEndDateTime?: string;
  buyIn?: number;
  rake?: number;
  totalEntries?: number;
  playersRemaining?: number;
  prizepool?: number;
  venue?: {
    id: string;
    name: string;
  };
  sourceUrl?: string;
}

export const GamesDashboard = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30 | 60 | 90>(30);

  useEffect(() => {
    fetchGames();
  }, [timeRange]);

  const fetchGames = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const startDate = subDays(new Date(), timeRange).toISOString();
      
      const response = await client.graphql({
        query: /* GraphQL */ `
          query ListRecentGames($startDate: String) {
            listGames(
              filter: { gameStartDateTime: { gt: $startDate } }
              limit: 500
            ) {
              items {
                id
                tournamentId
                name
                gameType
                gameStatus
                gameStartDateTime
                gameEndDateTime
                buyIn
                rake
                totalEntries
                playersRemaining
                prizepool
                sourceUrl
                venue {
                  id
                  name
                }
              }
            }
          }
        `,
        variables: { startDate }
      });

      if ('data' in response && response.data) {
        const gameItems = response.data.listGames.items
          .filter(Boolean)
          .sort((a: Game, b: Game) => {
            const dateA = new Date(a.gameStartDateTime);
            const dateB = new Date(b.gameStartDateTime);
            return dateB.getTime() - dateA.getTime();
          }) as Game[];
        
        setGames(gameItems);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGameClick = (gameId: string) => {
    navigate(`/games/details/${gameId}`);
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd-MMM-yy '@' HH:mm");
    } catch {
      return 'Invalid Date';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Running':
      case 'Late Registration':
        return 'bg-green-100 text-green-800';
      case 'Complete':
        return 'bg-gray-100 text-gray-800';
      case 'Registration Open':
        return 'bg-blue-100 text-blue-800';
      case 'Cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  // Calculate statistics
  const stats = {
    totalGames: games.length,
    runningGames: games.filter(g => g.gameStatus === 'Running' || g.gameStatus === 'Late Registration').length,
    completedGames: games.filter(g => g.gameStatus === 'Complete').length,
    totalPrizepool: games.reduce((sum, g) => sum + (g.prizepool || 0), 0),
    totalEntries: games.reduce((sum, g) => sum + (g.totalEntries || 0), 0),
    uniqueVenues: new Set(games.map(g => g.venue?.id).filter(Boolean)).size,
  };

  const timeRangeOptions = [
    { value: 7, label: '7 Days' },
    { value: 30, label: '30 Days' },
    { value: 60, label: '60 Days' },
    { value: 90, label: '90 Days' },
  ];

  return (
    <PageWrapper
      title="Games Dashboard"
      maxWidth="7xl"
      actions={
        <div className="flex items-center space-x-2">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimeRange(option.value as any)}
              className={`px-3 py-1 text-sm rounded-md ${
                timeRange === option.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrophyIcon className="h-6 w-6 text-indigo-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Total Games</p>
              <p className="text-xl font-bold">{stats.totalGames}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CalendarIcon className="h-6 w-6 text-green-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Running</p>
              <p className="text-xl font-bold">{stats.runningGames}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div>
              <p className="text-xs text-gray-500">Completed</p>
              <p className="text-xl font-bold">{stats.completedGames}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <UserGroupIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Total Entries</p>
              <p className="text-lg font-bold">{stats.totalEntries.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Total Prizepool</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalPrizepool)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <MapPinIcon className="h-6 w-6 text-purple-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Venues</p>
              <p className="text-xl font-bold">{stats.uniqueVenues}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Games Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Games from Past {timeRange} Days ({games.length})
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading games...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tournament ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date/Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Buy-in
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entries
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prizepool
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {games.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                      No games found in this time period
                    </td>
                  </tr>
                ) : (
                  games.map((game) => (
                    <tr
                      key={game.id}
                      onClick={() => handleGameClick(game.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {game.sourceUrl ? (
                          <a
                            href={game.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            {game.tournamentId || game.id.slice(0, 8)}
                          </a>
                        ) : (
                          <span className="text-gray-900">
                            {game.tournamentId || game.id.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDateTime(game.gameStartDateTime)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {game.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {game.venue?.name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getStatusBadgeClass(game.gameStatus)}`}>
                          {game.gameStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(game.buyIn)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {game.totalEntries || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(game.prizepool)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};
