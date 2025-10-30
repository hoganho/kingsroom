import { useState, useEffect, useMemo } from 'react';
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

// Define a map type for easy player lookup
type PlayerMap = Map<string, Pick<APITypes.Player, 'firstName' | 'lastName'>>;

// --- Specialized Components for Readable Tables ---

const PlayersSection = ({ data }: { data: APITypes.Player[] }) => (
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
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-indigo-600">{item.registrationVenue?.name ?? 'Unknown'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.lastPlayedDate}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-700">{item.pointsBalance}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PlayerSummariesSection = ({ data, playerMap }: { data: APITypes.PlayerSummary[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sessions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournaments</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tournament Winnings</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Balance</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                    return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.sessionsPlayed}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.tournamentsPlayed}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">${item.tournamentWinnings?.toFixed(2)}</td>
                            <td className={`px-4 py-3 whitespace-nowrap text-xs font-semibold ${item.netBalance && item.netBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                ${item.netBalance?.toFixed(2)}
                            </td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerEntriesSection = ({ data }: { data: APITypes.PlayerEntry[] }) => (
     <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => (
                    <tr key={item.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.player?.firstName} {item.player?.lastName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.game?.name}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">{item.status}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PlayerVenuesSection = ({ data }: { data: APITypes.PlayerVenue[] }) => (
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
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.totalGamesPlayed}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.lastPlayedDate}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PlayerResultsSection = ({ data }: { data: APITypes.PlayerResult[] }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BuyIn</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Winnings</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Points</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => (
                    <tr key={item.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{item.player?.firstName} {item.player?.lastName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.game?.name ?? item.gameId}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.game?.buyIn}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.finishingPlace}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">${item.amountWon?.toFixed(2)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs">{item.pointsEarned}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PlayerTransactionsSection = ({ data, playerMap }: { data: APITypes.PlayerTransaction[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.type}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">${item.amount?.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(item.transactionDate).toLocaleString()}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerCreditsSection = ({ data, playerMap }: { data: APITypes.PlayerCredits[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance After</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.type}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.changeAmount}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.balanceAfter}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(item.transactionDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.reason}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerPointsSection = ({ data, playerMap }: { data: APITypes.PlayerPoints[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance After</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.type}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.changeAmount}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.balanceAfter}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(item.transactionDate).toLocaleDateString()}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.reason}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerTicketsSection = ({ data, playerMap }: { data: APITypes.PlayerTicket[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template ID</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.status}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{new Date(item.assignedAt).toLocaleDateString()}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.ticketTemplateId}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerPrefsSection = ({ data, playerMap }: { data: APITypes.PlayerMarketingPreferences[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SMS Opt-Out</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email Opt-Out</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.optOutSms ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.optOutEmail ? 'Yes' : 'No'}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);

const PlayerMessagesSection = ({ data, playerMap }: { data: APITypes.PlayerMarketingMessage[], playerMap: PlayerMap }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message ID</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {data.map((item) => {
                    const player = playerMap.get(item.playerId);
                     return (
                        <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-xs font-medium">{player ? `${player.firstName} ${player.lastName}` : item.playerId}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.status}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.sentAt ? new Date(item.sentAt).toLocaleString() : 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">{item.marketingMessageId}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    </div>
);


// Main page component
export const PlayersPage = () => {
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Players');
  const client = generateClient();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
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

      setData({
        players: results[0].data?.listPlayers?.items || [],
        summaries: results[1].data?.listPlayerSummaries?.items || [],
        results: results[2].data?.listPlayerResults?.items || [],
        venues: results[3].data?.listPlayerVenues?.items || [],
        transactions: results[4].data?.listPlayerTransactions?.items || [],
        entries: results[5].data?.listPlayerEntries?.items || [],
        credits: results[6].data?.listPlayerCredits?.items || [],
        points: results[7].data?.listPlayerPoints?.items || [],
        tickets: results[8].data?.listPlayerTickets?.items || [],
        prefs: results[9].data?.listPlayerMarketingPreferences?.items || [],
        messages: results[10].data?.listPlayerMarketingMessages?.items || [],
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

  const playerMap = useMemo(() => {
    if (!data?.players) return new Map();
    return new Map(data.players.map(p => [p.id, { firstName: p.firstName, lastName: p.lastName }]));
  }, [data?.players]);

  const sortedData = useMemo(() => {
    if (!data) return null;

    // Helper function for sorting, using the playerMap for lookup
    const sortByName = (a: any, b: any) => {
        const playerA = a.player || playerMap.get(a.playerId);
        const playerB = b.player || playerMap.get(b.playerId);
        const nameA = playerA ? `${playerA.firstName} ${playerA.lastName}` : '';
        const nameB = playerB ? `${playerB.firstName} ${playerB.lastName}` : '';
        return nameA.localeCompare(nameB);
    };

    const sortPlayers = (a: APITypes.Player, b: APITypes.Player) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);

    return {
        ...data,
        players: [...data.players].sort(sortPlayers),
        summaries: [...data.summaries].sort(sortByName),
        results: [...data.results].sort(sortByName),
        venues: [...data.venues].sort(sortByName),
        transactions: [...data.transactions].sort(sortByName),
        entries: [...data.entries].sort(sortByName),
        credits: [...data.credits].sort(sortByName),
        points: [...data.points].sort(sortByName),
        tickets: [...data.tickets].sort(sortByName),
        prefs: [...data.prefs].sort(sortByName),
        messages: [...data.messages].sort(sortByName),
    };
  }, [data, playerMap]);
  
  const tabs = [
    'Players', 'Summaries', 'Entries', 'Venues', 'Results', 'Transactions', 
    'Credits', 'Points', 'Tickets', 'Preferences', 'Messages'
  ];

  const renderContent = () => {
    if (!sortedData) return null;
    switch (activeTab) {
        case 'Players': return <PlayersSection data={sortedData.players} />;
        case 'Summaries': return <PlayerSummariesSection data={sortedData.summaries} playerMap={playerMap} />;
        case 'Entries': return <PlayerEntriesSection data={sortedData.entries} />;
        case 'Venues': return <PlayerVenuesSection data={sortedData.venues} />;
        case 'Results': return <PlayerResultsSection data={sortedData.results} />;
        case 'Transactions': return <PlayerTransactionsSection data={sortedData.transactions} playerMap={playerMap} />;
        case 'Credits': return <PlayerCreditsSection data={sortedData.credits} playerMap={playerMap} />;
        case 'Points': return <PlayerPointsSection data={sortedData.points} playerMap={playerMap} />;
        case 'Tickets': return <PlayerTicketsSection data={sortedData.tickets} playerMap={playerMap} />;
        case 'Preferences': return <PlayerPrefsSection data={sortedData.prefs} playerMap={playerMap} />;
        case 'Messages': return <PlayerMessagesSection data={sortedData.messages} playerMap={playerMap} />;
        default: return <p className="text-gray-500">No specialized view for this data yet.</p>;
    }
  };

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

      {!loading && sortedData && (
        <div className="w-full">
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`${
                                activeTab === tab
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                        >
                        {tab}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="mt-6">
                {renderContent()}
            </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default PlayersPage;