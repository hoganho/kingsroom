// src/pages/players/PlayerSearch.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { debounce } from 'lodash';


interface Player {
  id: string;
  firstName: string;
  lastName: string;
  registrationDate?: string;
  lastPlayedDate?: string;
  creditBalance?: number;
  pointsBalance?: number;
  registrationVenue?: {
    name: string;
  };
  updatedAt?: string;
}

export const PlayerSearch = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentPlayers, setRecentPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Fetch 100 most recently active players on mount
  useEffect(() => {
    fetchRecentPlayers();
  }, []);

  // Debounced search function
  const debouncedSearch = debounce(async (term: string) => {
    if (term.length === 0) {
      setPlayers(recentPlayers);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const client = getClient();
      const response = await client.graphql({
        query: /* GraphQL */ `
          query SearchPlayers($searchTerm: String!) {
            listPlayers(
              filter: {
                or: [
                  { firstName: { contains: $searchTerm } },
                  { lastName: { contains: $searchTerm } }
                ]
              }
              limit: 100
            ) {
              items {
                id
                firstName
                lastName
                registrationDate
                lastPlayedDate
                creditBalance
                pointsBalance
                registrationVenue {
                  name
                }
              }
            }
          }
        `,
        variables: {
          searchTerm: term.toLowerCase()
        }
      });

      if ('data' in response && response.data) {
        const searchResults = response.data.listPlayers.items
          .filter(Boolean)
          .sort((a: Player, b: Player) => {
            const dateA = new Date(a.lastPlayedDate || a.updatedAt || 0);
            const dateB = new Date(b.lastPlayedDate || b.updatedAt || 0);
            return dateB.getTime() - dateA.getTime();
          }) as Player[];
        
        setPlayers(searchResults);
      }
    } catch (error) {
      console.error('Error searching players:', error);
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

  const fetchRecentPlayers = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const response = await client.graphql({
        query: /* GraphQL */ `
          query GetRecentPlayers {
            listPlayers(
              limit: 100
            ) {
              items {
                id
                firstName
                lastName
                registrationDate
                lastPlayedDate
                creditBalance
                pointsBalance
                registrationVenue {
                  name
                }
                updatedAt
              }
            }
          }
        `
      });

      if ('data' in response && response.data) {
        const recent = response.data.listPlayers.items
          .filter(Boolean)
          .sort((a: Player, b: Player) => {
            const dateA = new Date(a.lastPlayedDate || a.updatedAt || 0);
            const dateB = new Date(b.lastPlayedDate || b.updatedAt || 0);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, 100) as Player[];
        
        setRecentPlayers(recent);
        setPlayers(recent);
      }
    } catch (error) {
      console.error('Error fetching recent players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayerClick = (playerId: string) => {
    navigate(`/players/profile/${playerId}`);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  return (
    <PageWrapper title="Player Search" maxWidth="7xl">
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
            placeholder="Search by first or last name..."
          />
          {searching && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {searchTerm ? `Search Results (${players.length})` : '100 Most Recently Active Players'}
          </h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading players...</div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {players.length === 0 ? (
              <li className="px-4 py-12 text-center text-gray-500">
                No players found matching your search
              </li>
            ) : (
              players.map((player) => (
                <li key={player.id}>
                  <button
                    onClick={() => handlePlayerClick(player.id)}
                    className="w-full px-4 py-4 hover:bg-gray-50 flex items-center justify-between text-left"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-indigo-600 truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        <div className="ml-2 flex-shrink-0 flex">
                          {player.creditBalance && player.creditBalance > 0 && (
                            <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              £{player.creditBalance} credit
                            </p>
                          )}
                          {player.pointsBalance && player.pointsBalance > 0 && (
                            <p className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              {player.pointsBalance} pts
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <span>
                          Registered: {formatDate(player.registrationDate)}
                        </span>
                        <span className="mx-2">•</span>
                        <span>
                          Last played: {formatDate(player.lastPlayedDate)}
                        </span>
                        {player.registrationVenue && (
                          <>
                            <span className="mx-2">•</span>
                            <span>Venue: {player.registrationVenue.name}</span>
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
