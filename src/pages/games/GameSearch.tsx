// src/pages/games/GameSearch.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { debounce } from 'lodash';


interface Game {
  id: string;
  tournamentId?: string;
  name: string;
  gameType: string;
  gameStatus: string;
  gameStartDateTime: string;
  buyIn?: number;
  totalEntries?: number;
  playersRemaining?: number;
  prizepool?: number;
  venue?: {
    name: string;
  };
  sourceUrl?: string;
  updatedAt?: string;
}

export const GameSearch = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [recentGames, setRecentGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Fetch 100 most recent games on mount
  useEffect(() => {
    fetchRecentGames();
  }, []);

  // Debounced search function
  const debouncedSearch = debounce(async (term: string) => {
    if (term.length === 0) {
      setGames(recentGames);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const client = getClient();
      const response = await client.graphql({
        query: /* GraphQL */ `
          query SearchGames($searchTerm: String!) {
            listGames(
              filter: {
                or: [
                  { name: { contains: $searchTerm } },
                  { tournamentId: { contains: $searchTerm } }
                ]
              }
              limit: 100
            ) {
              items {
                id
                tournamentId
                name
                gameType
                gameStatus
                gameStartDateTime
                buyIn
                totalEntries
                playersRemaining
                prizepool
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
        variables: {
          searchTerm: term
        }
      });

      if ('data' in response && response.data) {
        const searchResults = response.data.listGames.items
          .filter(Boolean)
          .sort((a: Game, b: Game) => {
            const dateA = new Date(a.gameStartDateTime);
            const dateB = new Date(b.gameStartDateTime);
            return dateB.getTime() - dateA.getTime();
          }) as Game[];
        
        setGames(searchResults);
      }
    } catch (error) {
      console.error('Error searching games:', error);
    } finally {
      setSearching(false);
    }
  }, 300);

  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => {
      debouncedSearch.cancel();
    };
  }, [searchTerm]);

  const fetchRecentGames = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const response = await client.graphql({
        query: /* GraphQL */ `
          query GetRecentGames {
            listGames(
              limit: 100
            ) {
              items {
                id
                tournamentId
                name
                gameType
                gameStatus
                gameStartDateTime
                buyIn
                totalEntries
                playersRemaining
                prizepool
                sourceUrl
                venue {
                  name
                }
                updatedAt
              }
            }
          }
        `
      });

      if ('data' in response && response.data) {
        const recent = response.data.listGames.items
          .filter(Boolean)
          .sort((a: Game, b: Game) => {
            const dateA = new Date(a.updatedAt || a.gameStartDateTime);
            const dateB = new Date(b.updatedAt || b.gameStartDateTime);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, 100) as Game[];
        
        setRecentGames(recent);
        setGames(recent);
      }
    } catch (error) {
      console.error('Error fetching recent games:', error);
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

  return (
    <PageWrapper title="Game Search" maxWidth="7xl">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-xl">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Search by game name or tournament ID..."
          />
          {searching && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Games List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {searchTerm ? `Search Results (${games.length})` : '100 Most Recent Games'}
          </h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading games...</div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {games.length === 0 ? (
              <li className="px-4 py-12 text-center text-gray-500">
                No games found matching your search
              </li>
            ) : (
              games.map((game) => (
                <li key={game.id}>
                  <button
                    onClick={() => handleGameClick(game.id)}
                    className="w-full px-4 py-4 hover:bg-gray-50 flex items-center justify-between text-left"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            {game.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            ID: {game.tournamentId}
                          </p>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(game.gameStatus)}`}>
                            {game.gameStatus}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <span>{formatDateTime(game.gameStartDateTime)}</span>
                        <span className="mx-2">•</span>
                        <span>{game.venue?.name || 'No Venue'}</span>
                        <span className="mx-2">•</span>
                        <span>Buy-in: {formatCurrency(game.buyIn)}</span>
                        {game.totalEntries && (
                          <>
                            <span className="mx-2">•</span>
                            <span>{game.totalEntries} entries</span>
                          </>
                        )}
                        {game.prizepool && (
                          <>
                            <span className="mx-2">•</span>
                            <span>Prizepool: {formatCurrency(game.prizepool)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="ml-4">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </PageWrapper>
  );
};
