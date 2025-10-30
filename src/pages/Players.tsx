import { useState, useEffect } from 'react';
import { generateClient, type GraphQLResult } from '@aws-amplify/api';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
import * as queries from '../graphql/customQueries';
import * as APITypes from '../API';
import { PageWrapper } from '../components/layout/PageWrapper';

// Define a type for our combined data state
type PlayerData = {
  players: APITypes.Player[];
  summaries: APITypes.PlayerSummary[];
  results: APITypes.PlayerResult[];
  venues: APITypes.PlayerVenue[];
  transactions: APITypes.PlayerTransaction[];
  entries: APITypes.PlayerEntry[];
  credits: APITypes.PlayerCredits[];
  points: APITypes.PlayerPoints[];
  tickets: APITypes.PlayerTicket[];
  prefs: APITypes.PlayerMarketingPreferences[];
  messages: APITypes.PlayerMarketingMessage[];
};

// Generic Section for tables that don't need special formatting
const GenericDataSection = ({ title, data }: { title: string; data: any[] }) => {
    if (!data || data.length === 0) {
      return (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">{title}</h2>
          <p className="text-gray-500">No data found.</p>
        </div>
      );
    }
  
    const keys = Array.from(new Set(data.flatMap((item) => Object.keys(item))));
    const displayKeys = keys.filter(
      (key) =>
        ![
          '__typename',
          '_version',
          '_lastChangedAt',
          '_deleted',
          'player',
          'venue',
          'game',
          'registrationVenue' // Hide the nested object from the generic table
        ].includes(key)
    );
  
    return (
      <div className="mb-12 bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">{title}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {displayKeys.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((item, index) => (
                <tr key={item.id || index}>
                  {displayKeys.map((key) => (
                    <td
                      key={key}
                      className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 align-top"
                    >
                      {typeof item[key] === 'object'
                        ? JSON.stringify(item[key])
                        : String(item[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
};


// --- Specialized Components for Readable Tables ---

const PlayersSection = ({ data }: { data: APITypes.Player[] }) => {
    return (
      <div className="mb-12 bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Players</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registration Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Played</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.firstName} {item.lastName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-indigo-600">
                    {/* Access the name directly from the nested object. */}
                    {item.registrationVenue?.name ?? 'Unknown'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.lastPlayedDate}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.pointsBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
};

const PlayerVenuesSection = ({ data }: { data: APITypes.PlayerVenue[] }) => {
    return (
        <div className="mb-12 bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Player Venues</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Games Played</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Played</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.player?.firstName} {item.player?.lastName}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-indigo-600">{item.venue?.name}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.totalGamesPlayed}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.lastPlayedDate}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PlayerEntriesSection = ({ data }: { data: APITypes.PlayerEntry[] }) => {
    return (
        <div className="mb-12 bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Player Entries (Live Games)</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Table/Seat</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stack</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.player?.firstName} {item.player?.lastName}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.game?.name}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">{item.status}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.tableNumber && item.seatNumber ? `T${item.tableNumber} / S${item.seatNumber}` : 'N/A'}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.lastKnownStackSize?.toLocaleString() ?? 'N/A'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PlayerResultsSection = ({ data }: { data: APITypes.PlayerResult[] }) => {
    return (
        <div className="mb-12 bg-white p-4 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Player Results</h2>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Winnings</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map((item) => (
                            <tr key={item.id}>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.player?.firstName} {item.player?.lastName}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.gameId}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.finishingPlace}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">${item.amountWon?.toFixed(2)}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.pointsEarned}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


// Main page component
export const PlayersPage = () => {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = generateClient();
  
  // The `venueMap` state is no longer needed.

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // The separate venue query has been removed.
      const results = await Promise.all([
        client.graphql({ query: queries.listPlayersForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerSummariesForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerResultsForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerVenuesForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerTransactionsForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerEntriesForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerCreditsForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerPointsForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerTicketsForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerMarketingPreferencesForDebug }) as Promise<GraphQLResult<any>>,
        client.graphql({ query: queries.listPlayerMarketingMessagesForDebug }) as Promise<GraphQLResult<any>>,
      ]);

      // No need to build the venueMap anymore.
      setData({
        players: results[0].data?.listPlayers?.items || [],
        summaries: results[1].data?.listPlayerSummaries?.items || [],
        results: results[2].data?.listPlayerResults?.items || [],
        venues: results[3].data?.listPlayerVenues?.items || [],
        transactions: results[4].data?.listPlayerTransactions?.items || [],
        entries: results[5].data?.listPlayerEntries?.items || [],
        credits: results[5].data?.listPlayerCredits?.items || [],
        points: results[6].data?.listPlayerPoints?.items || [],
        tickets: results[7].data?.listPlayerTickets?.items || [],
        prefs: results[8].data?.listPlayerMarketingPreferences?.items || [],
        messages: results[9].data?.listPlayerMarketingMessages?.items || [],
      });
    } catch (err: any) {
      console.error('Error fetching player data:', err);
      setError(err.message || 'Failed to fetch data. Check console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <PageWrapper
      title="Player Data (Debug)"
      maxWidth="7xl"
      actions={
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 w-full md:w-auto"
        >
          <ArrowPathIcon
            className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      }
    >
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6">
          <p><span className="font-bold">Error:</span> {error}</p>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12">
          <p className="text-lg text-gray-600">Loading all player data...</p>
        </div>
      )}

      {!loading && data && (
        <div>
          <PlayersSection data={data.players} />
          <PlayerEntriesSection data={data.entries} />
          <PlayerVenuesSection data={data.venues} />
          <PlayerResultsSection data={data.results} />
          
          <GenericDataSection title="Player Summaries" data={data.summaries} />
          <GenericDataSection title="Player Transactions" data={data.transactions} />
          <GenericDataSection title="Player Credits" data={data.credits} />
          <GenericDataSection title="Player Points" data={data.points} />
          <GenericDataSection title="Player Tickets" data={data.tickets} />
          <GenericDataSection title="Player Marketing Preferences" data={data.prefs} />
          <GenericDataSection title="Player Marketing Messages" data={data.messages} />
        </div>
      )}
    </PageWrapper>
  );
};

export default PlayersPage;