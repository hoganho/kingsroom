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
  credits: APITypes.PlayerCredits[];
  points: APITypes.PlayerPoints[];
  tickets: APITypes.PlayerTicket[];
  prefs: APITypes.PlayerMarketingPreferences[];
  messages: APITypes.PlayerMarketingMessage[];
};

// Helper component to render a data table
// It's generic and will show all fields of any object array
const DataSection = ({ title, data }: { title: string; data: any[] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-500">No data found.</p>
      </div>
    );
  }

  // Get all unique keys from all objects
  const keys = Array.from(new Set(data.flatMap((item) => Object.keys(item))));

  // Filter out internal/meta keys
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
      {/* This container makes the table scrollable horizontally on mobile */}
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
                    {/* Render basic values, stringify objects/arrays for debug */}
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Run all 10 queries in parallel for performance
      const results = await Promise.all([
        client.graphql({ query: queries.listPlayersForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerSummariesForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerResultsForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerVenuesForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerTransactionsForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerCreditsForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerPointsForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerTicketsForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerMarketingPreferencesForDebug }) as GraphQLResult<any>,
        client.graphql({ query: queries.listPlayerMarketingMessagesForDebug }) as GraphQLResult<any>,
      ]);

      setData({
        players: results[0].data?.listPlayers?.items || [],
        summaries: results[1].data?.listPlayerSummaries?.items || [],
        results: results[2].data?.listPlayerResults?.items || [],
        venues: results[3].data?.listPlayerVenues?.items || [],
        transactions: results[4].data?.listPlayerTransactions?.items || [],
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
      {/* ✅ FIX: Removed the outer padding div. PageWrapper now handles layout. */}
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

