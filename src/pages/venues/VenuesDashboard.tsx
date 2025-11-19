// src/pages/venues/VenuesDashboard.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useNavigate } from 'react-router-dom';
import { BuildingOffice2Icon, TrophyIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { format, subDays } from 'date-fns';
import { GameData } from '../../types/game';
import { formatCurrency } from '../../utils/generalHelpers';


interface Venue {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  venueNumber?: number;
  aliases?: string[];
  totalGames?: number;
  lastGameDate?: string;
  totalEntries?: number;
  totalPrizepool?: number;
}

export const VenuesDashboard = () => {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'games' | 'lastGame'>('lastGame');

  useEffect(() => {
    fetchVenuesWithStats();
  }, []);

  const fetchVenuesWithStats = async () => {
    const client = getClient();
    setLoading(true);
    try {
      // Fetch all venues
      const venuesResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListVenues {
            listVenues(limit: 1000) {
              items {
                id
                name
                address
                city
                country
                venueNumber
                aliases
              }
            }
          }
        `
      });

      if ('data' in venuesResponse && venuesResponse.data) {
        const venueItems = venuesResponse.data.listVenues.items.filter(Boolean);
        
        // Fetch games for each venue to get statistics
        const venuesWithStats = await Promise.all(
          venueItems.map(async (venue: Venue) => {
            try {
              const gamesResponse = await client.graphql({
                query: /* GraphQL */ `
                  query GetVenueGames($venueId: ID!) {
                    listGames(
                      filter: { venueId: { eq: $venueId } }
                      limit: 1000
                    ) {
                      items {
                        id
                        gameStartDateTime
                        totalEntries
                        prizepool
                      }
                    }
                  }
                `,
                variables: { venueId: venue.id }
              });

              if ('data' in gamesResponse && gamesResponse.data) {
                const games: GameData[] = gamesResponse.data.listGames.items.filter(Boolean) as GameData[];
                
                // Calculate stats
                const totalGames = games.length;
                const totalEntries = games.reduce((sum, g) => sum + (g.totalEntries || 0), 0);
                const totalPrizepool = games.reduce((sum, g) => sum + (g.prizepool || 0), 0);
                
                // Find last game date
                const lastGame = games.sort((a, b) => {
                    const timeA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
                    const timeB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
                    return timeB - timeA;
                })[0];

                return {
                  ...venue,
                  totalGames,
                  totalEntries,
                  totalPrizepool,
                  lastGameDate: lastGame?.gameStartDateTime
                };
              }
              
              return { ...venue, totalGames: 0 };
            } catch {
              return { ...venue, totalGames: 0 };
            }
          })
        );

        // Sort by most recent game by default
        const sorted = venuesWithStats.sort((a, b) => {
          if (!a.lastGameDate && !b.lastGameDate) return 0;
          if (!a.lastGameDate) return 1;
          if (!b.lastGameDate) return -1;
          return new Date(b.lastGameDate).getTime() - new Date(a.lastGameDate).getTime();
        });

        setVenues(sorted as Venue[]);
      }
    } catch (error) {
      console.error('Error fetching venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const sortVenues = (venues: Venue[], sortBy: string) => {
    const sorted = [...venues];
    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'games':
        return sorted.sort((a, b) => (b.totalGames || 0) - (a.totalGames || 0));
      case 'lastGame':
        return sorted.sort((a, b) => {
          if (!a.lastGameDate && !b.lastGameDate) return 0;
          if (!a.lastGameDate) return 1;
          if (!b.lastGameDate) return -1;
          return new Date(b.lastGameDate).getTime() - new Date(a.lastGameDate).getTime();
        });
      default:
        return sorted;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 0) return 'Today';
      if (daysDiff === 1) return 'Yesterday';
      if (daysDiff < 7) return `${daysDiff} days ago`;
      if (daysDiff < 30) return `${Math.floor(daysDiff / 7)} weeks ago`;
      if (daysDiff < 365) return `${Math.floor(daysDiff / 30)} months ago`;
      
      return format(date, 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  const handleVenueClick = (venueId: string) => {
    navigate(`/venues/details?id=${venueId}`);
  };

  const sortedVenues = sortVenues(venues, sortBy);

  // Calculate summary stats
  const stats = {
    totalVenues: venues.length,
    activeVenues: venues.filter(v => v.lastGameDate && new Date(v.lastGameDate) > subDays(new Date(), 30)).length,
    totalGames: venues.reduce((sum, v) => sum + (v.totalGames || 0), 0),
    totalPrizepool: venues.reduce((sum, v) => sum + (v.totalPrizepool || 0), 0),
  };

  return (
    <PageWrapper
      title="Venues Dashboard"
      maxWidth="7xl"
      actions={
        <div className="flex space-x-2">
          {[
            { value: 'lastGame', label: 'Last Game' },
            { value: 'games', label: 'Total Games' },
            { value: 'name', label: 'Name' }
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value as any)}
              className={`px-3 py-1 text-sm rounded-md ${
                sortBy === option.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Sort by {option.label}
            </button>
          ))}
        </div>
      }
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <BuildingOffice2Icon className="h-8 w-8 text-indigo-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Venues</p>
              <p className="text-2xl font-bold">{stats.totalVenues}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Active (30d)</p>
              <p className="text-2xl font-bold">{stats.activeVenues}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrophyIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Games</p>
              <p className="text-2xl font-bold">{stats.totalGames.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Prizepool</p>
              <p className="text-lg font-bold">{formatCurrency(stats.totalPrizepool)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Venues Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">All Venues</h3>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading venues...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venue Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Game
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Entries
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Prizepool
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedVenues.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                      No venues found
                    </td>
                  </tr>
                ) : (
                  sortedVenues.map((venue) => (
                    <tr
                      key={venue.id}
                      onClick={() => handleVenueClick(venue.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-indigo-600">
                        {venue.name}
                        {venue.venueNumber && (
                          <span className="ml-2 text-xs text-gray-500">
                            (#{venue.venueNumber})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {venue.city && venue.country
                          ? `${venue.city}, ${venue.country}`
                          : venue.city || venue.country || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {venue.totalGames || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(venue.lastGameDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {venue.totalEntries?.toLocaleString() || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(venue.totalPrizepool)}
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
