// src/pages/players/PlayerProfile.tsx

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { 
  UserIcon, 
  TrophyIcon, 
  CurrencyPoundIcon, 
  MapPinIcon,
  StarIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/generalHelpers';


interface PlayerData {
  player: any;
  summary: any;
  recentResults: any[];
  recentEntries: any[];
  venues: any[];
  transactions: any[];
  credits: any;
  points: any;
  tickets: any[];
}

export const PlayerProfile = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'transactions' | 'rewards'>('overview');

  useEffect(() => {
    if (playerId) {
      fetchPlayerData(playerId);
    }
  }, [playerId]);

  const fetchPlayerData = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch player basic info
      const client = getClient();
      const playerResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetPlayer($id: ID!) {
            getPlayer(id: $id) {
              id
              firstName
              lastName
              email
              phone
              registrationDate
              lastPlayedDate
              targetingClassification
              creditBalance
              pointsBalance
              registrationVenue {
                id
                name
              }
            }
          }
        `,
        variables: { id }
      });

      // Fetch player summary
      const summaryResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetPlayerSummary($playerId: ID!) {
            listPlayerSummaries(
              filter: { playerId: { eq: $playerId } }
              limit: 1
            ) {
              items {
                sessionsPlayed
                tournamentsPlayed
                cashGamesPlayed
                venuesVisited
                tournamentWinnings
                tournamentBuyIns
                tournamentITM
                tournamentsCashed
                cashGameWinnings
                cashGameBuyIns
                totalWinnings
                totalBuyIns
                netBalance
                lastPlayed
              }
            }
          }
        `,
        variables: { playerId: id }
      });

      // Fetch recent results
        const resultsResponse = await client.graphql({
        query: /* GraphQL */ `
            query GetPlayerResults($playerId: ID!) {
            playerResultsByPlayerIdAndGameStartDateTime(
                playerId: $playerId
                sortDirection: DESC
                limit: 20
            ) {
                items {
                id
                finishingPlace
                prizeWon
                amountWon
                totalRunners
                pointsEarned
                game {
                    id
                    name
                    buyIn
                    gameStartDateTime
                    venue {
                    name
                    }
                }
                }
            }
            }
        `,
        variables: { playerId: id }
        });

      // Fetch recent entries
        const entriesResponse = await client.graphql({
        query: /* GraphQL */ `
            query GetPlayerEntries($playerId: ID!) {
            playerEntriesByPlayerIdAndGameStartDateTime(
                playerId: $playerId
                sortDirection: DESC
                limit: 10
            ) {
                items {
                id
                status
                registrationTime
                game {
                    id
                    name
                    gameStartDateTime
                }
                }
            }
            }
        `,
        variables: { playerId: id }
        });


      // Fetch venues visited
      const venuesResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetPlayerVenues($playerId: ID!) {
            listPlayerVenues(
              filter: { playerId: { eq: $playerId } }
              limit: 10
            ) {
              items {
                totalGamesPlayed
                averageBuyIn
                firstPlayedDate
                lastPlayedDate
                venue {
                  id
                  name
                }
              }
            }
          }
        `,
        variables: { playerId: id }
      });

      if ('data' in playerResponse && playerResponse.data) {
        setPlayerData({
          player: playerResponse.data.getPlayer,
          summary: ('data' in summaryResponse && summaryResponse.data?.listPlayerSummaries?.items?.[0]) || null,
          recentResults: ('data' in resultsResponse && resultsResponse.data?.playerResultsByPlayerIdAndGameStartDateTime?.items) || [],
          recentEntries: ('data' in entriesResponse && entriesResponse.data?.playerEntriesByPlayerIdAndGameStartDateTime?.items) || [],
          venues: ('data' in venuesResponse && venuesResponse.data?.listPlayerVenues?.items) || [],
          transactions: [],
          credits: null,
          points: null,
          tickets: []
        });
      }
    } catch (err) {
      console.error('Error fetching player data:', err);
      setError('Failed to load player profile');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  const calculateROI = (winnings: number, buyIns: number) => {
    if (buyIns === 0) return '0%';
    const roi = ((winnings - buyIns) / buyIns) * 100;
    return `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <PageWrapper title="Player Profile" maxWidth="7xl">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading player profile...</div>
        </div>
      </PageWrapper>
    );
  }

  if (error || !playerData) {
    return (
      <PageWrapper title="Player Profile" maxWidth="7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error || 'Player not found'}</p>
          <button
            onClick={() => navigate('/players/search')}
            className="mt-4 text-indigo-600 hover:text-indigo-900"
          >
            ← Back to Player Search
          </button>
        </div>
      </PageWrapper>
    );
  }

  const { player, summary } = playerData;

  return (
    <PageWrapper
      title={`${player.firstName} ${player.lastName}`}
      maxWidth="7xl"
      actions={
        <button
          onClick={() => navigate('/players/search')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Back to Search
        </button>
      }
    >
      {/* Player Header */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-5">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-20 w-20 rounded-full bg-indigo-100 flex items-center justify-center">
                <UserIcon className="h-10 w-10 text-indigo-600" />
              </div>
            </div>
            <div className="ml-6 flex-1">
              <h2 className="text-2xl font-bold text-gray-900">
                {player.firstName} {player.lastName}
              </h2>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Member Since</p>
                  <p className="text-sm font-medium">{formatDate(player.registrationDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Last Played</p>
                  <p className="text-sm font-medium">{formatDate(player.lastPlayedDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Registration Venue</p>
                  <p className="text-sm font-medium">{player.registrationVenue?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Classification</p>
                  <p className="text-sm font-medium">{player.targetingClassification || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <TrophyIcon className="h-8 w-8 text-yellow-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Tournaments</p>
                <p className="text-xl font-bold">{summary.tournamentsPlayed}</p>
                <p className="text-xs text-gray-500">{summary.tournamentsCashed} cashed</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <CurrencyPoundIcon className="h-8 w-8 text-green-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Net Balance</p>
                <p className="text-xl font-bold">{formatCurrency(summary.netBalance)}</p>
                <p className="text-xs text-gray-500">
                  ROI: {calculateROI(summary.tournamentWinnings, summary.tournamentBuyIns)}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <StarIcon className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Points</p>
                <p className="text-xl font-bold">{player.pointsBalance || 0}</p>
                <p className="text-xs text-gray-500">Current balance</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <MapPinIcon className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Venues</p>
                <p className="text-xl font-bold">{summary.venuesVisited}</p>
                <p className="text-xs text-gray-500">Visited</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'games', label: 'Game History' },
              { id: 'transactions', label: 'Transactions' },
              { id: 'rewards', label: 'Rewards' }
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
              {/* Venues */}
              <div>
                <h3 className="text-lg font-medium mb-3">Venues Played</h3>
                {playerData.venues.length === 0 ? (
                  <p className="text-gray-500">No venue data available</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {playerData.venues.map((venue) => (
                      <div key={venue.venue.id} className="border rounded-lg p-4">
                        <h4 className="font-medium">{venue.venue.name}</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          {venue.totalGamesPlayed} games • Avg buy-in: {formatCurrency(venue.averageBuyIn)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          First: {formatDate(venue.firstPlayedDate)} • Last: {formatDate(venue.lastPlayedDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              <h3 className="text-lg font-medium mb-3">Recent Results</h3>
              {playerData.recentResults.length === 0 ? (
                <p className="text-gray-500">No game results found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournament</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Place</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prize</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {playerData.recentResults.map((result) => (
                        <tr key={result.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {formatDate(result.game?.gameStartDateTime)}
                          </td>
                          <td className="px-6 py-4 text-sm">{result.game?.name}</td>
                          <td className="px-6 py-4 text-sm">{result.game?.venue?.name || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {result.finishingPlace}/{result.totalRunners}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            {result.amountWon > 0 ? formatCurrency(result.amountWon) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="text-gray-500">Transaction history coming soon...</div>
          )}

          {activeTab === 'rewards' && (
            <div className="text-gray-500">Rewards and tickets coming soon...</div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
