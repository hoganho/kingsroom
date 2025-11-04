// src/pages/games/GameDetails.tsx

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { 
  TrophyIcon, 
  UserGroupIcon, 
  CurrencyPoundIcon, 
  ClockIcon,
  MapPinIcon,
  ChartBarIcon,
  LinkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';


interface GameData {
  game: any;
  structure?: any;
  entries: any[];
  results: any[];
}

export const GameDetails = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'structure' | 'players' | 'payouts'>('overview');

  useEffect(() => {
    if (gameId) {
      fetchGameData(gameId);
    }
  }, [gameId]);

  const fetchGameData = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch game details
      const client = getClient();
      const gameResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetGame($id: ID!) {
            getGame(id: $id) {
              id
              tournamentId
              name
              gameType
              gameVariant
              gameStatus
              registrationStatus
              gameStartDateTime
              gameEndDateTime
              buyIn
              rake
              totalRake
              startingStack
              hasGuarantee
              guaranteeAmount
              guaranteeOverlay
              guaranteeSurplus
              totalEntries
              totalRebuys
              totalAddons
              playersRemaining
              totalChipsInPlay
              averagePlayerStack
              prizepool
              revenueByBuyIns
              profitLoss
              seriesName
              isSeries
              isSatellite
              sourceUrl
              venue {
                id
                name
                address
                city
                country
              }
            }
          }
        `,
        variables: { id }
      });

      // Fetch tournament structure if available
      const structureResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetTournamentStructure($gameId: ID!) {
            listTournamentStructures(
              filter: { gameId: { eq: $gameId } }
              limit: 1
            ) {
              items {
                id
                levels {
                  levelNumber
                  duration
                  smallBlind
                  bigBlind
                  ante
                  bigBlindAnte
                }
                breaks {
                  levelNumberBeforeBreak
                  duration
                }
              }
            }
          }
        `,
        variables: { gameId: id }
      });

      // Fetch player entries
      const entriesResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetGameEntries($gameId: ID!) {
            listPlayerEntries(
              filter: { gameId: { eq: $gameId } }
              limit: 100
            ) {
              items {
                id
                status
                registrationTime
                lastKnownStackSize
                tableNumber
                seatNumber
                player {
                  id
                  firstName
                  lastName
                }
              }
            }
          }
        `,
        variables: { gameId: id }
      });

      // Fetch results/payouts
      const resultsResponse = await client.graphql({
        query: /* GraphQL */ `
          query GetGameResults($gameId: ID!) {
            listPlayerResults(
              filter: { gameId: { eq: $gameId } }
              limit: 50
            ) {
              items {
                id
                finishingPlace
                prizeWon
                amountWon
                pointsEarned
                player {
                  id
                  firstName
                  lastName
                }
              }
            }
          }
        `,
        variables: { gameId: id }
      });

    if ('data' in gameResponse && gameResponse.data) {
        setGameData({
          game: gameResponse.data.getGame,
          structure: ('data' in structureResponse && structureResponse.data?.listTournamentStructures?.items?.[0]) || null,
          entries: ('data' in entriesResponse && entriesResponse.data?.listPlayerEntries?.items) || [],
          results: ('data' in resultsResponse && resultsResponse.data?.listPlayerResults?.items) || []
        });
      }
    } catch (err) {
      console.error('Error fetching game data:', err);
      setError('Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), "dd MMM yyyy '@' HH:mm");
    } catch {
      return '-';
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

  if (loading) {
    return (
      <PageWrapper title="Game Details" maxWidth="7xl">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading game details...</div>
        </div>
      </PageWrapper>
    );
  }

  if (error || !gameData) {
    return (
      <PageWrapper title="Game Details" maxWidth="7xl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error || 'Game not found'}</p>
          <button
            onClick={() => navigate('/games/search')}
            className="mt-4 text-indigo-600 hover:text-indigo-900"
          >
            ← Back to Game Search
          </button>
        </div>
      </PageWrapper>
    );
  }

  const { game, structure, entries, results } = gameData;

  return (
    <PageWrapper
      title={game.name}
      maxWidth="7xl"
      actions={
        <div className="flex items-center space-x-3">
          {game.sourceUrl && (
            <a
              href={game.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              View Source
            </a>
          )}
          <button
            onClick={() => navigate('/games/search')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Search
          </button>
        </div>
      }
    >
      {/* Game Header */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {game.name}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Tournament ID: {game.tournamentId}
              </p>
            </div>
            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadgeClass(game.gameStatus)}`}>
              {game.gameStatus}
            </span>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center">
              <MapPinIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Venue</p>
                <p className="text-sm font-medium">{game.venue?.name || '-'}</p>
              </div>
            </div>
            <div className="flex items-center">
              <ClockIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Start Time</p>
                <p className="text-sm font-medium">{formatDateTime(game.gameStartDateTime)}</p>
              </div>
            </div>
            <div className="flex items-center">
              <CurrencyPoundIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Buy-in</p>
                <p className="text-sm font-medium">
                  {formatCurrency(game.buyIn)} {game.rake && `+ ${formatCurrency(game.rake)}`}
                </p>
              </div>
            </div>
            <div className="flex items-center">
              <UserGroupIcon className="h-5 w-5 text-gray-400 mr-2" />
              <div>
                <p className="text-sm text-gray-500">Entries</p>
                <p className="text-sm font-medium">{game.totalEntries || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrophyIcon className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Prizepool</p>
              <p className="text-xl font-bold">{formatCurrency(game.prizepool)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <UserGroupIcon className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Players Remaining</p>
              <p className="text-xl font-bold">{game.playersRemaining || '-'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <ChartBarIcon className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Avg Stack</p>
              <p className="text-xl font-bold">{game.averagePlayerStack?.toLocaleString() || '-'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="h-8 w-8 text-purple-500" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Type</p>
              <p className="text-sm font-bold">{game.gameType}</p>
              <p className="text-xs text-gray-500">{game.gameVariant}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'structure', label: 'Structure' },
              { id: 'players', label: 'Players' },
              { id: 'payouts', label: 'Payouts' }
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Starting Stack</p>
                  <p className="font-medium">{game.startingStack?.toLocaleString() || '-'}</p>
                </div>
                {game.hasGuarantee && (
                  <div>
                    <p className="text-sm text-gray-500">Guarantee</p>
                    <p className="font-medium">{formatCurrency(game.guaranteeAmount)}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Total Rebuys</p>
                  <p className="font-medium">{game.totalRebuys || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Add-ons</p>
                  <p className="font-medium">{game.totalAddons || '-'}</p>
                </div>
                {game.isSeries && (
                  <div>
                    <p className="text-sm text-gray-500">Series</p>
                    <p className="font-medium">{game.seriesName || 'Yes'}</p>
                  </div>
                )}
                {game.isSatellite && (
                  <div>
                    <p className="text-sm text-gray-500">Type</p>
                    <p className="font-medium">Satellite</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'structure' && (
            <div>
              {structure && structure.levels && structure.levels.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Small Blind</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Big Blind</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ante</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {structure.levels.map((level: any) => (
                        <tr key={level.levelNumber}>
                          <td className="px-4 py-3 text-sm">{level.levelNumber}</td>
                          <td className="px-4 py-3 text-sm">{level.duration} min</td>
                          <td className="px-4 py-3 text-sm">{level.smallBlind?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">{level.bigBlind?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm">{level.ante || level.bigBlindAnte || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No structure information available</p>
              )}
            </div>
          )}

          {activeTab === 'players' && (
            <div>
              {entries.length === 0 ? (
                <p className="text-gray-500">No player entries found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seat</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stack</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-sm">
                            {entry.player?.firstName} {entry.player?.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm">{entry.status}</td>
                          <td className="px-4 py-3 text-sm">{entry.tableNumber || '-'}</td>
                          <td className="px-4 py-3 text-sm">{entry.seatNumber || '-'}</td>
                          <td className="px-4 py-3 text-sm">{entry.lastKnownStackSize?.toLocaleString() || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'payouts' && (
            <div>
              {results.length === 0 ? (
                <p className="text-gray-500">No payout information available yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Place</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prize</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.map((result) => (
                        <tr key={result.id}>
                          <td className="px-4 py-3 text-sm font-medium">{result.finishingPlace}</td>
                          <td className="px-4 py-3 text-sm">
                            {result.player?.firstName} {result.player?.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">{formatCurrency(result.amountWon)}</td>
                          <td className="px-4 py-3 text-sm">{result.pointsEarned || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
