// src/pages/venues/VenueDetails.tsx

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { 
  BuildingOffice2Icon,
  MapPinIcon,
  TrophyIcon,
  UserGroupIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { GameData } from '../../types/game';
import { formatCurrency } from '../../utils/generalHelpers';


interface VenueData {
  venue: any;
  recentGames: any[];
  upcomingGames: any[];
  topPlayers: any[];
  stats: {
    totalGames: number;
    totalUniquePlayers: number;
    totalInitialEntries: number;
    totalEntries: number;
    totalPrizepoolPaid: number;
    totalPrizepoolCalculated: number;
    avgBuyIn: number;
    avgUniquePlayers: number;
    avgEntries: number;
    largestPrizepoolPaid: number;
    mostPopularGameType: string;
  };
}

export const VenueDetails = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const venueId = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [venueData, setVenueData] = useState<VenueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'players' | 'analytics'>('overview');

  // Default to St George venue if no ID provided (as per requirements)
  const defaultVenueId = 'st-george-venue-id'; // Replace with actual St George venue ID

  useEffect(() => {
    const targetVenueId = venueId || defaultVenueId;
    fetchVenueData(targetVenueId);
  }, [venueId]);

  const fetchVenueData = async (id: string) => {
    setLoading(true);
    setError(null);
    const client = getClient();

    try {
      // First try to find St George venue if no ID provided
      let targetId = id;
      if (!venueId) {
        const client = getClient();
        const stGeorgeResponse = await client.graphql({
          query: /* GraphQL */ `
            query FindStGeorgeVenue {
              listVenues(
                filter: { name: { contains: "St George" } }
                limit: 1
              ) {
                items {
                  id
                  name
                  address
                  city
                  country
                  venueNumber
                }
              }
            }
          `
        });

        if ('data' in stGeorgeResponse && stGeorgeResponse.data) {
          const stGeorgeVenue = stGeorgeResponse.data.listVenues.items[0];
          if (stGeorgeVenue) {
            targetId = stGeorgeVenue.id;
          }
        }
      }

      // Fetch venue details
      const venueResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetVenue($id: ID!) {
            getVenue(id: $id) {
              id
              name
              address
              city
              country
              venueNumber
              aliases
            }
          }
        `,
        variables: { id: targetId }
      });

      // Fetch all games for this venue
      const gamesResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetVenueGames($venueId: ID!) {
            listGames(
              filter: { venueId: { eq: $venueId } }
              limit: 1000
            ) {
              items {
                id
                tournamentId
                name
                gameType
                gameVariant
                gameStatus
                gameStartDateTime
                gameEndDateTime
                buyIn
                totalUniquePlayers
                totalInitialEntries
                totalEntries
                prizepoolPaid
                prizepoolCalculated
                playersRemaining
                sourceUrl
              }
            }
          }
        `,
        variables: { venueId: targetId }
      });

      // Fetch top players at this venue
      const playersResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetVenueTopPlayers($venueId: ID!) {
            listPlayerVenues(
              filter: { venueId: { eq: $venueId } }
              limit: 20
            ) {
              items {
                totalGamesPlayed
                averageBuyIn
                firstPlayedDate
                lastPlayedDate
                player {
                  id
                  firstName
                  lastName
                }
              }
            }
          }
        `,
        variables: { venueId: targetId }
      });

      if ('data' in venueResponse && venueResponse.data) {
        if (!venueResponse.data.getVenue) {
          setError('Venue not found');
          setLoading(false);
          return;
        }
        
        const games: GameData[] = ('data' in gamesResponse && gamesResponse.data?.listGames?.items)
            ? gamesResponse.data.listGames.items.filter(Boolean) as GameData[]
            : [];
        
        // Sort games by date
        const sortedGames = games.sort((a, b) => {
            // Get timestamp for 'b', default to 0 if date is missing
            const timeB = b.gameStartDateTime 
            ? new Date(b.gameStartDateTime).getTime() 
            : 0;
            
            // Get timestamp for 'a', default to 0 if date is missing
            const timeA = a.gameStartDateTime 
            ? new Date(a.gameStartDateTime).getTime() 
            : 0;

            // This sorts in descending order (newest first)
            // Games with no date (0) will be at the end
            return timeB - timeA;
        });

        // Split into recent and upcoming
        const now = new Date();
        const recentGames = sortedGames.filter(g => g.gameStartDateTime && new Date(g.gameStartDateTime) < now).slice(0, 20);
        const upcomingGames = sortedGames.filter(g => g.gameStartDateTime && new Date(g.gameStartDateTime) >= now);

        // Calculate stats
        const stats = {
          totalGames: games.length,
          totalUniquePlayers: games.reduce((sum, g) => sum + (g.totalUniquePlayers || 0), 0),
          totalInitialEntries: games.reduce((sum, g) => sum + (g.totalInitialEntries || 0), 0),
          totalEntries: games.reduce((sum, g) => sum + (g.totalEntries || 0), 0),
          totalPrizepoolPaid: games.reduce((sum, g) => sum + (g.prizepoolPaid || 0), 0),
          totalPrizepoolCalculated: games.reduce((sum, g) => sum + (g.prizepoolCalculated || 0), 0),
          avgBuyIn: games.reduce((sum, g) => sum + (g.buyIn || 0), 0) / (games.length || 1),
          avgUniquePlayers: games.reduce((sum, g) => sum + (g.totalUniquePlayers || 0), 0) / (games.length || 1),
          avgEntries: games.reduce((sum, g) => sum + (g.totalEntries || 0), 0) / (games.length || 1),
          largestPrizepoolPaid: Math.max(...games.map(g => g.prizepoolPaid || 0)),
          largestPrizepoolCalculated: Math.max(...games.map(g => g.prizepoolCalculated || 0)),
          mostPopularGameType: getMostPopularGameType(games)
        };

        setVenueData({
          venue: venueResponse.data.getVenue,
          recentGames,
          upcomingGames,
          topPlayers: ('data' in playersResponse && playersResponse.data?.listPlayerVenues?.items) || [],
          stats
        });
      }
    } catch (err) {
      console.error('Error fetching venue data:', err);
      setError('Failed to load venue details');
    } finally {
      setLoading(false);
    }
  };

  const getMostPopularGameType = (games: any[]) => {
    const typeCounts: Record<string, number> = {};
    games.forEach(game => {
      const type = game.gameType || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    const sorted = Object.entries(typeCounts).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || 'N/A';
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), "dd MMM yyyy '@' HH:mm");
    } catch {
      return '-';
    }
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
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (loading) {
    return (
      <PageWrapper title="Venue Details" maxWidth="7xl">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading venue details...</div>
        </div>
      </PageWrapper>
    );
  }

  if (error || !venueData) {
    return (
      <PageWrapper title="Venue Details" maxWidth="7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error || 'Venue not found'}</p>
          <button
            onClick={() => navigate('/venues/dashboard')}
            className="mt-4 text-indigo-600 hover:text-indigo-900"
          >
            ← Back to Venues Dashboard
          </button>
        </div>
      </PageWrapper>
    );
  }

  const { venue, recentGames, upcomingGames, topPlayers, stats } = venueData;

  return (
    <PageWrapper
      title={venue.name}
      maxWidth="7xl"
      actions={
        <button
          onClick={() => navigate('/venues/dashboard')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Back to Dashboard
        </button>
      }
    >
      {/* Venue Header */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-16 w-16 rounded-lg bg-indigo-100 flex items-center justify-center">
                <BuildingOffice2Icon className="h-10 w-10 text-indigo-600" />
              </div>
            </div>
            <div className="ml-6 flex-1">
              <h2 className="text-2xl font-bold text-gray-900">
                {venue.name}
                {venue.venueNumber && (
                  <span className="ml-2 text-lg text-gray-500">
                    (Venue #{venue.venueNumber})
                  </span>
                )}
              </h2>
              <div className="mt-2 flex items-center text-sm text-gray-600">
                <MapPinIcon className="h-5 w-5 mr-1" />
                {venue.address && <span>{venue.address}, </span>}
                {venue.city && <span>{venue.city}, </span>}
                {venue.country && <span>{venue.country}</span>}
                {!venue.address && !venue.city && !venue.country && <span>No address information</span>}
              </div>
              {venue.aliases && venue.aliases.length > 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Also known as: {venue.aliases.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

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
            <UserGroupIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Total Unique Players</p>
              <p className="text-lg font-bold">{stats.totalUniquePlayers.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <UserGroupIcon className="h-6 w-6 text-blue-600 mr-2" />
            <div>
              <p className="text-xs text-gray-500">Total Initial Entries</p>
              <p className="text-lg font-bold">{stats.totalInitialEntries.toLocaleString()}</p>
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
            <p className="text-xs text-gray-500">Total Prizepool Paid</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalPrizepoolPaid)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Total Prizepool Calculated</p>
            <p className="text-lg font-bold">{formatCurrency(stats.totalPrizepoolCalculated)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Avg Buy-in</p>
            <p className="text-lg font-bold">{formatCurrency(stats.avgBuyIn)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Avg Unique Players</p>
            <p className="text-lg font-bold">{Math.round(stats.avgUniquePlayers)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Avg Entries</p>
            <p className="text-lg font-bold">{Math.round(stats.avgEntries)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div>
            <p className="text-xs text-gray-500">Popular Game</p>
            <p className="text-sm font-bold">{stats.mostPopularGameType}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'games', label: 'Game History' },
              { id: 'players', label: 'Top Players' },
              { id: 'analytics', label: 'Analytics' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Upcoming Games */}
              <div>
                <h3 className="text-lg font-medium mb-3">Upcoming Games ({upcomingGames.length})</h3>
                {upcomingGames.length === 0 ? (
                  <p className="text-gray-500">No upcoming games scheduled</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingGames.slice(0, 6).map((game) => (
                      <div key={game.id} className="border rounded-lg p-4">
                        <h4 className="font-medium text-indigo-600">{game.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          <ClockIcon className="inline h-4 w-4 mr-1" />
                          {formatDateTime(game.gameStartDateTime)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Buy-in: {formatCurrency(game.buyIn)} • {game.gameType}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Games Summary */}
              <div>
                <h3 className="text-lg font-medium mb-3">Recent Games</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentGames.slice(0, 6).map((game) => (
                    <div key={game.id} className="border rounded-lg p-3">
                      <p className="font-medium text-sm">{game.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(game.gameStartDateTime)}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          {game.totalUniquePlayers} unique players
                        </span>
                        <span className="text-xs text-gray-600">
                          {game.totalInitialEntries} entries
                        </span>
                        <span className="text-xs text-gray-600">
                          {game.totalEntries} entries
                        </span>
                        <span className="text-xs font-medium">
                          {formatCurrency(game.prizepoolPaid)}
                        </span>
                        <span className="text-xs font-medium">
                          {formatCurrency(game.prizepoolCalculated)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              <h3 className="text-lg font-medium mb-3">All Games at {venue.name}</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournament</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buy-in</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unique Players</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">InitialEntries</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entries</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prizepool Paid</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prizepool Calculated</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentGames.map((game) => (
                      <tr key={game.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {format(new Date(game.gameStartDateTime), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{game.name}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getStatusBadgeClass(game.gameStatus)}`}>
                            {game.gameStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{formatCurrency(game.buyIn)}</td>
                        <td className="px-4 py-3 text-sm">{game.totalUniquePlayers || '-'}</td>
                        <td className="px-4 py-3 text-sm">{game.totalInitialEntries || '-'}</td>
                        <td className="px-4 py-3 text-sm">{game.totalEntries || '-'}</td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCurrency(game.prizepoolPaid)}</td>
                        <td className="px-4 py-3 text-sm font-medium">{formatCurrency(game.prizepoolCalculated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'players' && (
            <div>
              <h3 className="text-lg font-medium mb-3">Top Players at {venue.name}</h3>
              {topPlayers.length === 0 ? (
                <p className="text-gray-500">No player data available</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Games Played</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Buy-in</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Visit</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Visit</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {topPlayers.map((pv, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm font-medium">
                            {pv.player?.firstName} {pv.player?.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm">{pv.totalGamesPlayed}</td>
                          <td className="px-4 py-3 text-sm">{formatCurrency(pv.averageBuyIn)}</td>
                          <td className="px-4 py-3 text-sm">
                            {pv.firstPlayedDate ? format(new Date(pv.firstPlayedDate), 'dd MMM yyyy') : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {pv.lastPlayedDate ? format(new Date(pv.lastPlayedDate), 'dd MMM yyyy') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Game Type Distribution</h4>
                  <p className="text-sm text-gray-600">
                    Most popular: <span className="font-medium">{stats.mostPopularGameType}</span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Prize Statistics</h4>
                  <p className="text-sm text-gray-600">
                    Largest Prizepool Paid: <span className="font-medium">{formatCurrency(stats.largestPrizepoolPaid)}</span>
                  </p>
                </div>
              </div>
              <p className="text-gray-500 text-sm">More analytics coming soon...</p>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
