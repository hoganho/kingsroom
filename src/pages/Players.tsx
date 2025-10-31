import { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient, type GraphQLResult } from '@aws-amplify/api';
import { ArrowPathIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import * as queries from '../graphql/customQueries';
import * as APITypes from '../API';
import { PageWrapper } from '../components/layout/PageWrapper';

const client = generateClient();

// ===================================================================
// TYPES
// ===================================================================

type PlayerMap = Map<string, Pick<APITypes.Player, 'firstName' | 'lastName'>>;

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc';
};

// Defines how a table column should be rendered and sorted
type ColumnDefinition<T> = {
  key: string; // Corresponds to the object key
  header: string; // Text for the <th>
  render: (item: T) => React.ReactNode; // How to render the cell
  sortable?: boolean; // Whether the column is sortable
};

// ===================================================================
// HELPER HOOK: Client-Side Sorting
// ===================================================================

/**
 * A custom hook to sort data on the client.
 */
const useClientSideSorting = <T,>(data: T[], initialConfig: SortConfig) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(initialConfig);

  const sortedData = useMemo(() => {
    if (!data) return [];
    const sortableData = [...data];
    
    sortableData.sort((a, b) => {
      // Helper to get nested values (e.g., 'player.firstName')
      const getDeepValue = (obj: any, path: string) => path.split('.').reduce((p, c) => (p && p[c] !== null && p[c] !== undefined) ? p[c] : null, obj);

      let aValue = getDeepValue(a, sortConfig.key);
      let bValue = getDeepValue(b, sortConfig.key);
      
      // Special case for player name sorting
      if (sortConfig.key === 'player.name') {
          aValue = (a as any).player ? `${(a as any).player.firstName} ${(a as any).player.lastName}` : '';
          bValue = (b as any).player ? `${(b as any).player.firstName} ${(b as any).player.lastName}` : '';
      }

      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      // Type-safe comparison
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * (sortConfig.direction === 'asc' ? 1 : -1);
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return aValue.localeCompare(bValue) * (sortConfig.direction === 'asc' ? 1 : -1);
      }
      
      // Fallback for dates or other types
      return String(aValue).localeCompare(String(bValue)) * (sortConfig.direction === 'asc' ? 1 : -1);
    });

    return sortableData;
  }, [data, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return { sortedData, sortConfig, requestSort };
};


// ===================================================================
// HELPER HOOK: Fetch All Records
// ===================================================================

/**
 * A custom hook to fetch ALL records from the API, handling pagination internally.
 */
const useAllData = <T,>(query: string, queryName: string) => {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        setData([]);

        let allItems: T[] = [];
        let nextToken: string | null = null;
        const limit = 1000; // Fetch in large chunks for efficiency

        try {
            do {
                const response = await client.graphql({
                    query: query,
                    variables: { limit, nextToken },
                }) as GraphQLResult<any>;

                const operation = response.data?.[queryName];
                if (operation?.items) {
                    const validItems = operation.items.filter((item: any) => item !== null);
                    allItems = allItems.concat(validItems);
                }
                nextToken = operation?.nextToken || null;

                if (response.errors) {
                    throw new Error(response.errors[0].message);
                }
            } while (nextToken);

            setData(allItems);
        } catch (err: any) {
            console.error(`Error fetching all data for ${queryName}:`, err);
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [query, queryName]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, count: data.length };
};


// ===================================================================
// Reusable UI Components
// ===================================================================

interface SortableTableHeaderProps<T> {
  columns: ColumnDefinition<T>[];
  sortConfig: SortConfig;
  onRequestSort: (key: string) => void;
}

/**
 * Renders the <thead> section with clickable sort headers.
 */
const SortableTableHeader = <T,>({ columns, sortConfig, onRequestSort }: SortableTableHeaderProps<T>) => (
  <thead className="bg-gray-50">
    <tr>
      {columns.map((col) => (
        <th
          key={col.key}
          className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
        >
          {col.sortable ? (
            <button
              onClick={() => onRequestSort(col.key)}
              className="flex items-center space-x-1 group"
            >
              <span>{col.header}</span>
              {sortConfig.key === col.key ? (
                sortConfig.direction === 'asc' ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />
              ) : (
                <ChevronUpIcon className="h-4 w-4 text-gray-300 group-hover:text-gray-500" />
              )}
            </button>
          ) : (
            col.header
          )}
        </th>
      ))}
    </tr>
  </thead>
);

// ===================================================================
// Generic Table Component (No Pagination)
// ===================================================================
interface SortableTableProps<T> {
  query: string;
  queryName: string;
  columns: ColumnDefinition<T>[];
  initialSort: SortConfig;
  playerMap?: PlayerMap; // Optional: for tables that need the playerMap
}

/**
 * A generic component that fetches all data and provides sorting.
 */
const SortableTable = <T,>({ query, queryName, columns, initialSort, playerMap }: SortableTableProps<T>) => {
  
  // 1. Get ALL data from the server
  const { data, loading, error, count } = useAllData<T>(query, queryName);

  // 2. Sort the data on the client
  const { sortedData, sortConfig, requestSort } = useClientSideSorting(data, initialSort);

  if (error) {
    return <div className="text-red-600">Error: {error}</div>;
  }

  // Inject playerMap if provided (for tables like Summaries, Credits, etc.)
  const dataToRender = useMemo(() => sortedData.map(item => ({
    ...item,
    player: (item as any).player || playerMap?.get((item as any).playerId)
  })), [sortedData, playerMap]);

  return (
    <div>
      <div className="px-4 py-2 text-sm text-gray-600 bg-gray-50 border-t border-l border-r border-gray-200 rounded-t-lg">
          Total Records: <strong>{loading ? 'Loading...' : count}</strong>
      </div>
      <div className="overflow-hidden shadow-sm border border-gray-200 rounded-b-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <SortableTableHeader columns={columns} sortConfig={sortConfig} onRequestSort={requestSort} />
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && (
                <tr>
                  <td colSpan={columns.length} className="text-center p-8 text-gray-500">
                    <ArrowPathIcon className="h-6 w-6 animate-spin inline-block" />
                  </td>
                </tr>
              )}
              {!loading && dataToRender.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="text-center p-8 text-gray-500">
                    No data found.
                  </td>
                </tr>
              )}
              {!loading && dataToRender.map((item: any) => (
                <tr key={item.id}>
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 whitespace-nowrap text-xs">
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// Player Data Fetching (for PlayerMap)
// ===================================================================

/**
 * Fetches ALL players using pagination to build the name map.
 */
const fetchAllPlayers = async () => {
  let allItems: APITypes.Player[] = [];
  let nextToken: string | null = null;
  const limit = 1000; // Fetch in chunks of 1000

  do {
    try {
      const response = await client.graphql({
        query: queries.listPlayersForDebug,
        variables: { limit, nextToken },
      }) as GraphQLResult<any>;

      const operation = response.data?.listPlayers;
      if (operation?.items) {
        allItems = allItems.concat(operation.items.filter((item: any) => item !== null));
      }
      nextToken = operation?.nextToken || null;

    } catch (err: any) {
      console.error(`Error fetching paginated players:`, err);
      nextToken = null; // Stop looping on error
      throw new Error(`Failed to fetch players: ${err.message || 'Unknown error'}`);
    }
  } while (nextToken);

  return allItems;
};


// ===================================================================
// Main Page Component
// ===================================================================

export const PlayersPage = () => {
  const [playerMap, setPlayerMap] = useState<PlayerMap>(new Map());
  const [playerMapLoading, setPlayerMapLoading] = useState(true);
  const [loading, setLoading] = useState(true); // Main page loading (for playerMap)
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Players');

  // --- Fetch ALL players on mount to build the PlayerMap ---
  const loadPlayerMap = useCallback(async () => {
    setPlayerMapLoading(true);
    setLoading(true);
    setError(null);
    try {
      const players = await fetchAllPlayers();
      setPlayerMap(new Map(players.map(p => [p.id, { firstName: p.firstName, lastName: p.lastName }])));
    } catch (err: any) {
      console.error('Error fetching player map:', err);
      setError(err.message || 'Failed to fetch critical player data.');
    } finally {
      setPlayerMapLoading(false);
      setLoading(false); // Main page loading is complete
    }
  }, []);
  
  useEffect(() => {
    loadPlayerMap();
  }, [loadPlayerMap]);

  
  const tabs = [
    'Players', 'Summaries', 'Entries', 'Venues', 'Results', 'Transactions', 
    'Credits', 'Points', 'Tickets', 'Preferences', 'Messages'
  ];

  // This function now just renders the correct "smart" component for the tab
  const renderContent = () => {
    if (playerMapLoading) {
      return (
        <div className="text-center py-12">
          <ArrowPathIcon className="h-6 w-6 animate-spin inline-block text-gray-500" />
          <p className="text-lg text-gray-600 mt-2">Loading player lookup table...</p>
        </div>
      );
    }
    
    // Pass the playerMap to components that need it
    switch (activeTab) {
        case 'Players': return <PlayersSection />;
        case 'Summaries': return <PlayerSummariesSection playerMap={playerMap} />;
        case 'Entries': return <PlayerEntriesSection />;
        case 'Venues': return <PlayerVenuesSection />;
        case 'Results': return <PlayerResultsSection />;
        case 'Transactions': return <PlayerTransactionsSection playerMap={playerMap} />;
        case 'Credits': return <PlayerCreditsSection playerMap={playerMap} />;
        case 'Points': return <PlayerPointsSection playerMap={playerMap} />;
        case 'Tickets': return <PlayerTicketsSection playerMap={playerMap} />;
        case 'Preferences': return <PlayerPrefsSection playerMap={playerMap} />;
        case 'Messages': return <PlayerMessagesSection playerMap={playerMap} />;
        default: return <p className="text-gray-500">No specialized view for this data yet.</p>;
    }
  };

  return (
    <PageWrapper
      title="Player Data (Debug)"
      maxWidth="7xl"
      actions={
        <button
          onClick={() => {
            // Re-fetch the player map on manual refresh
            loadPlayerMap().then(() => {
              // Force the active tab to re-render by briefly switching away and back
              // This causes the SortableTable component to unmount and remount, triggering a fresh data fetch.
              const currentTab = activeTab;
              setActiveTab('');
              setTimeout(() => setActiveTab(currentTab), 0);
            });
          }}
          disabled={loading}
          className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 w-full md:w-auto"
        >
          <ArrowPathIcon
            className={`h-5 w-5 mr-2 ${loading ? 'animate-spin' : ''}`}
          />
          {loading ? 'Refreshing...' : 'Refresh All Data'}
        </button>
      }
    >
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6">
          <p><span className="font-bold">Error:</span> {error}</p>
        </div>
      )}

      {loading && (
        <div className="text-center py-12">
          <p className="text-lg text-gray-600">Loading all player data...</p>
        </div>
      )}

      {!loading && (
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

// ===================================================================
// TAB-SPECIFIC SMART COMPONENTS
// Each component now fetches its own data and handles sorting.
// ===================================================================

const PlayersSection = () => {
  const columns: ColumnDefinition<APITypes.Player>[] = [
    { key: 'firstName', header: 'Name', sortable: true, render: item => <strong>{item.firstName} {item.lastName}</strong> },
    { key: 'registrationVenue.name', header: 'Reg. Venue', sortable: true, render: item => <span className="text-indigo-600">{item.registrationVenue?.name ?? 'N/A'}</span> },
    { key: 'lastPlayedDate', header: 'Last Played', sortable: true, render: item => item.lastPlayedDate },
    { key: 'pointsBalance', header: 'Points', sortable: true, render: item => item.pointsBalance },
    { key: 'creditBalance', header: 'Credits', sortable: true, render: item => item.creditBalance },
    { key: 'id', header: 'Player ID', sortable: false, render: item => <span className="font-mono text-gray-500 text-xs">{item.id}</span> },
  ];
  return <SortableTable query={queries.listPlayersForDebug} queryName="listPlayers" columns={columns} initialSort={{ key: 'firstName', direction: 'asc' }} />;
};

const PlayerSummariesSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerSummary>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'sessionsPlayed', header: 'Sessions', sortable: true, render: item => item.sessionsPlayed },
    { key: 'tournamentsPlayed', header: 'Tourneys', sortable: true, render: item => item.tournamentsPlayed },
    { key: 'tournamentWinnings', header: 'Winnings', sortable: true, render: item => `$${item.tournamentWinnings?.toFixed(2)}` },
    { key: 'netBalance', header: 'Net', sortable: true, render: item => <span className={item.netBalance && item.netBalance < 0 ? 'text-red-600' : 'text-green-600'}>${item.netBalance?.toFixed(2)}</span> },
  ];
  return <SortableTable query={queries.listPlayerSummariesForDebug} queryName="listPlayerSummaries" columns={columns} initialSort={{ key: 'player.name', direction: 'asc' }} playerMap={playerMap} />;
};

const PlayerEntriesSection = () => {
  const columns: ColumnDefinition<APITypes.PlayerEntry>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{item.player?.firstName} {item.player?.lastName}</strong> },
    { key: 'game.name', header: 'Game', sortable: true, render: item => item.game?.name },
    { key: 'status', header: 'Status', sortable: true, render: item => item.status },
    { key: 'registrationTime', header: 'Reg. Time', sortable: true, render: item => new Date(item.registrationTime).toLocaleString() },
  ];
  return <SortableTable query={queries.listPlayerEntriesForDebug} queryName="listPlayerEntries" columns={columns} initialSort={{ key: 'registrationTime', direction: 'desc' }} />;
};

const PlayerVenuesSection = () => {
  const columns: ColumnDefinition<APITypes.PlayerVenue>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{item.player?.firstName} {item.player?.lastName}</strong> },
    { key: 'venue.name', header: 'Venue', sortable: true, render: item => <span className="text-indigo-600">{item.venue?.name}</span> },
    { key: 'totalGamesPlayed', header: 'Games Played', sortable: true, render: item => item.totalGamesPlayed },
    { key: 'lastPlayedDate', header: 'Last Played', sortable: true, render: item => item.lastPlayedDate },
  ];
  return <SortableTable query={queries.listPlayerVenuesForDebug} queryName="listPlayerVenues" columns={columns} initialSort={{ key: 'player.name', direction: 'asc' }} />;
};

const PlayerResultsSection = () => {
  const columns: ColumnDefinition<APITypes.PlayerResult>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{item.player?.firstName} {item.player?.lastName}</strong> },
    { key: 'game.name', header: 'Game', sortable: true, render: item => item.game?.name ?? item.gameId },
    { key: 'finishingPlace', header: 'Rank', sortable: true, render: item => <strong>{item.finishingPlace}</strong> },
    { key: 'amountWon', header: 'Winnings', sortable: true, render: item => `$${item.amountWon?.toFixed(2)}` },
    { key: 'pointsEarned', header: 'Points', sortable: true, render: item => item.pointsEarned },
  ];
  return <SortableTable query={queries.listPlayerResultsForDebug} queryName="listPlayerResults" columns={columns} initialSort={{ key: 'game.name', direction: 'desc' }} />;
};

const PlayerTransactionsSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerTransaction>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'type', header: 'Type', sortable: true, render: item => item.type },
    { key: 'amount', header: 'Amount', sortable: true, render: item => `$${item.amount?.toFixed(2)}` },
    { key: 'transactionDate', header: 'Date', sortable: true, render: item => new Date(item.transactionDate).toLocaleString() },
  ];
  return <SortableTable query={queries.listPlayerTransactionsForDebug} queryName="listPlayerTransactions" columns={columns} initialSort={{ key: 'transactionDate', direction: 'desc' }} playerMap={playerMap} />;
};

const PlayerCreditsSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerCredits>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'type', header: 'Type', sortable: true, render: item => item.type },
    { key: 'changeAmount', header: 'Change', sortable: true, render: item => item.changeAmount },
    { key: 'balanceAfter', header: 'Balance', sortable: true, render: item => item.balanceAfter },
    { key: 'transactionDate', header: 'Date', sortable: true, render: item => new Date(item.transactionDate).toLocaleDateString() },
    { key: 'reason', header: 'Reason', sortable: true, render: item => item.reason },
  ];
  return <SortableTable query={queries.listPlayerCreditsForDebug} queryName="listPlayerCredits" columns={columns} initialSort={{ key: 'transactionDate', direction: 'desc' }} playerMap={playerMap} />;
};

const PlayerPointsSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerPoints>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'type', header: 'Type', sortable: true, render: item => item.type },
    { key: 'changeAmount', header: 'Change', sortable: true, render: item => item.changeAmount },
    { key: 'balanceAfter', header: 'Balance', sortable: true, render: item => item.balanceAfter },
    { key: 'transactionDate', header: 'Date', sortable: true, render: item => new Date(item.transactionDate).toLocaleDateString() },
    { key: 'reason', header: 'Reason', sortable: true, render: item => item.reason },
  ];
  return <SortableTable query={queries.listPlayerPointsForDebug} queryName="listPlayerPoints" columns={columns} initialSort={{ key: 'transactionDate', direction: 'desc' }} playerMap={playerMap} />;
};

const PlayerTicketsSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerTicket>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'status', header: 'Status', sortable: true, render: item => item.status },
    { key: 'assignedAt', header: 'Assigned', sortable: true, render: item => new Date(item.assignedAt).toLocaleDateString() },
    { key: 'expiryDate', header: 'Expires', sortable: true, render: item => item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A' },
  ];
  return <SortableTable query={queries.listPlayerTicketsForDebug} queryName="listPlayerTickets" columns={columns} initialSort={{ key: 'assignedAt', direction: 'desc' }} playerMap={playerMap} />;
};

const PlayerPrefsSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerMarketingPreferences>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'optOutSms', header: 'SMS Opt-Out', sortable: true, render: item => item.optOutSms ? 'Yes' : 'No' },
    { key: 'optOutEmail', header: 'Email Opt-Out', sortable: true, render: item => item.optOutEmail ? 'Yes' : 'No' },
  ];
  return <SortableTable query={queries.listPlayerMarketingPreferencesForDebug} queryName="listPlayerMarketingPreferences" columns={columns} initialSort={{ key: 'player.name', direction: 'asc' }} playerMap={playerMap} />;
};

const PlayerMessagesSection = ({ playerMap }: { playerMap: PlayerMap }) => {
  const columns: ColumnDefinition<APITypes.PlayerMarketingMessage>[] = [
    { key: 'player.name', header: 'Player', sortable: true, render: item => <strong>{(item as any).player ? `${(item as any).player.firstName} ${(item as any).player.lastName}` : item.playerId}</strong> },
    { key: 'status', header: 'Status', sortable: true, render: item => item.status },
    { key: 'sentAt', header: 'Sent At', sortable: true, render: item => item.sentAt ? new Date(item.sentAt).toLocaleString() : 'N/A' },
  ];
  return <SortableTable query={queries.listPlayerMarketingMessagesForDebug} queryName="listPlayerMarketingMessages" columns={columns} initialSort={{ key: 'sentAt', direction: 'desc' }} playerMap={playerMap} />;
};

export default PlayersPage;