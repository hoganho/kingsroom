import { useState, useEffect } from 'react';
import { generateClient } from '@aws-amplify/api';
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
  credits: APITypes.PlayerCredits[];
  points: APITypes.PlayerPoints[];
  tickets: APITypes.PlayerTicket[];
  prefs: APITypes.PlayerMarketingPreferences[];
  messages: APITypes.PlayerMarketingMessage[];
};

// ... DataSection component remains the same ...
const DataSection = ({ title, data }: { title: string; data: any[] }) => {
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
                  <th key={key} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((item, index) => (
                <tr key={item.id || index}>
                  {displayKeys.map((key) => (
                    <td key={key} className="px-4 py-3 whitespace-nowrap text-xs text-gray-700 align-top">
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

// Main page component
export const PlayersPage = () => {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = generateClient();

  // REFACTORED FUNCTION
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use Promise.all to run all queries in parallel.
      // The `client.graphql` call with a query returns a Promise, which is what `await` expects.
      // We've removed the `as GraphQLResult<any>` cast as it's often not needed.
      const [
        playersResult,
        summariesResult,
        resultsResult,
        venuesResult,
        transactionsResult,
        creditsResult,
        pointsResult,
        ticketsResult,
        prefsResult,
        messagesResult,
      ] = await Promise.all([
        client.graphql({ query: queries.listPlayersForDebug }),
        client.graphql({ query: queries.listPlayerSummariesForDebug }),
        client.graphql({ query: queries.listPlayerResultsForDebug }),
        client.graphql({ query: queries.listPlayerVenuesForDebug }),
        client.graphql({ query: queries.listPlayerTransactionsForDebug }),
        client.graphql({ query: queries.listPlayerCreditsForDebug }),
        client.graphql({ query: queries.listPlayerPointsForDebug }),
        client.graphql({ query: queries.listPlayerTicketsForDebug }),
        client.graphql({ query: queries.listPlayerMarketingPreferencesForDebug }),
        client.graphql({ query: queries.listPlayerMarketingMessagesForDebug }),
      ]);

      // Safely access the 'data' property from each result.
      setData({
        players: playersResult.data?.listPlayers?.items || [],
        summaries: summariesResult.data?.listPlayerSummaries?.items || [],
        results: resultsResult.data?.listPlayerResults?.items || [],
        venues: venuesResult.data?.listPlayerVenues?.items || [],
        transactions: transactionsResult.data?.listPlayerTransactions?.items || [],
        credits: creditsResult.data?.listPlayerCredits?.items || [],
        points: pointsResult.data?.listPlayerPoints?.items || [],
        tickets: ticketsResult.data?.listPlayerTickets?.items || [],
        prefs: prefsResult.data?.listPlayerMarketingPreferences?.items || [],
        messages: messagesResult.data?.listPlayerMarketingMessages?.items || [],
      });
    } catch (err: any) {
      console.error('Error fetching player data:', err);
      setError(err.message || 'Failed to fetch data. Check console.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on initial component mount
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
          <p>
            <span className="font-bold">Error:</span> {error}
          </p>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12">
          <p className="text-lg text-gray-600">Loading all player data...</p>
        </div>
      )}

      {!loading && data && (
        <div>
          <DataSection title="Players" data={data.players} />
          <DataSection title="Player Summaries" data={data.summaries} />
          <DataSection title="Player Results" data={data.results} />
          <DataSection title="Player Venues" data={data.venues} />
          <DataSection title="Player Transactions" data={data.transactions} />
          <DataSection title="Player Credits" data={data.credits} />
          <DataSection title="Player Points" data={data.points} />
          <DataSection title="Player Tickets" data={data.tickets} />
          <DataSection title="Player Marketing Preferences" data={data.prefs} />
          <DataSection title="Player Marketing Messages" data={data.messages} />
        </div>
      )}
    </PageWrapper>
  );
};

export default PlayersPage;