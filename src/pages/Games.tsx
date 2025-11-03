// src/pages/Games.tsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient, type GraphQLResult } from '@aws-amplify/api';
import { ArrowPathIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import * as queries from '../graphql/customQueries';
import * as APITypes from '../API';
import { PageWrapper } from '../components/layout/PageWrapper';

// ===================================================================
// TYPES
// ===================================================================

type GameMap = Map<string, Pick<APITypes.Game, 'name'>>;

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
      // Helper to get nested values (e.g., 'venue.name')
      const getDeepValue = (obj: any, path: string) => path.split('.').reduce((p, c) => (p && p[c] !== null && p[c] !== undefined) ? p[c] : null, obj);

      let aValue = getDeepValue(a, sortConfig.key);
      let bValue = getDeepValue(b, sortConfig.key);
      
      // Special case for game name sorting
      if (sortConfig.key === 'game.name') {
          aValue = (a as any).game ? (a as any).game.name : '';
          bValue = (b as any).game ? (b as any).game.name : '';
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
    const client = useMemo(() => generateClient(), []);

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
    }, [query, queryName, client]);

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
  gameMap?: GameMap; // Optional: for tables that need the gameMap
}

/**
 * A generic component that fetches all data and provides sorting.
 */
const SortableTable = <T,>({ query, queryName, columns, initialSort, gameMap }: SortableTableProps<T>) => {
  
  // 1. Get ALL data from the server
  const { data, loading, error, count } = useAllData<T>(query, queryName);

  // 2. Sort the data on the client
  const { sortedData, sortConfig, requestSort } = useClientSideSorting(data, initialSort);

  if (error) {
    return <div className="text-red-600">Error: {error}</div>;
  }

  // Inject gameMap if provided (for tables like Structures, Credits, etc.)
  const dataToRender = useMemo(() => sortedData.map(item => ({
    ...item,
    game: (item as any).game || gameMap?.get((item as any).gameId || (item as any).relatedGameId || (item as any).usedInGameId)
  })), [sortedData, gameMap]);

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
// Game Data Fetching (for GameMap)
// ===================================================================

/**
 * Fetches ALL games using pagination to build the name map.
 */
const fetchAllGames = async () => {
  const client = generateClient();
  let allItems: APITypes.Game[] = [];
  let nextToken: string | null = null;
  const limit = 1000; // Fetch in chunks of 1000

  do {
    try {
      const response = await client.graphql({
        query: queries.listGamesForDebug,
        variables: { limit, nextToken },
      }) as GraphQLResult<any>;

      const operation = response.data?.listGames;
      if (operation?.items) {
        allItems = allItems.concat(operation.items.filter((item: any) => item !== null));
      }
      nextToken = operation?.nextToken || null;

    } catch (err: any) {
      console.error(`Error fetching paginated games:`, err);
      nextToken = null; // Stop looping on error
      throw new Error(`Failed to fetch games: ${err.message || 'Unknown error'}`);
    }
  } while (nextToken);

  return allItems;
};


// ===================================================================
// Main Page Component
// ===================================================================

export const GamesPage = () => {
  const [gameMap, setGameMap] = useState<GameMap>(new Map());
  const [gameMapLoading, setGameMapLoading] = useState(true);
  const [loading, setLoading] = useState(true); // Main page loading (for gameMap)
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('Games');

  // --- Fetch ALL games on mount to build the GameMap ---
  const loadGameMap = useCallback(async () => {
    setGameMapLoading(true);
    setLoading(true);
    setError(null);
    try {
      const games = await fetchAllGames();
      setGameMap(new Map(games.map(g => [g.id, { name: g.name }])));
    } catch (err: any) {
      console.error('Error fetching game map:', err);
      setError(err.message || 'Failed to fetch critical game data.');
    } finally {
      setGameMapLoading(false);
      setLoading(false); // Main page loading is complete
    }
  }, []);
  
  useEffect(() => {
    loadGameMap();
  }, [loadGameMap]);

  
  const tabs = [
    'Games', 'Structures'
  ];

  // This function now just renders the correct "smart" component for the tab
  const renderContent = () => {
    if (gameMapLoading) {
      return (
        <div className="text-center py-12">
          <ArrowPathIcon className="h-6 w-6 animate-spin inline-block text-gray-500" />
          <p className="text-lg text-gray-600 mt-2">Loading game lookup table...</p>
        </div>
      );
    }
    
    // Pass the gameMap to components that need it
    switch (activeTab) {
        case 'Games': return <GamesSection />;
        case 'Structures': return <GameStructuresSection gameMap={gameMap} />;
        default: return <p className="text-gray-500">Select a tab to view data.</p>;
    }
  };

  return (
    <PageWrapper
      title="Game Data (Debug)"
      maxWidth="7xl"
      actions={
        <button
          onClick={() => {
            // Re-fetch the game map on manual refresh
            loadGameMap().then(() => {
              // Force the active tab to re-render by briefly switching away and back
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
          <p className="text-lg text-gray-600">Loading all game data...</p>
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
// ===================================================================

const GamesSection = () => {
  const columns: ColumnDefinition<APITypes.Game>[] = [
    { key: 'name', header: 'Name', sortable: true, render: item => <strong>{item.name}</strong> },
    { key: 'venue.name', header: 'Venue', sortable: true, render: item => <span className="text-indigo-600">{item.venue?.name ?? 'N/A'}</span> },
    { key: 'gameStartDateTime', header: 'Start Time', sortable: true, render: item => new Date(item.gameStartDateTime).toLocaleString() },
    { key: 'gameStatus', header: 'Status', sortable: true, render: item => item.gameStatus },
    { key: 'gameType', header: 'Type', sortable: true, render: item => item.gameType },
    { key: 'id', header: 'Game ID', sortable: false, render: item => <span className="font-mono text-gray-500 text-xs">{item.id}</span> },
  ];
  return <SortableTable query={queries.listGamesForDebug} queryName="listGames" columns={columns} initialSort={{ key: 'gameStartDateTime', direction: 'desc' }} />;
};

const GameStructuresSection = ({ gameMap }: { gameMap: GameMap }) => {
  const columns: ColumnDefinition<APITypes.TournamentStructure>[] = [
    { key: 'game.name', header: 'Game', sortable: true, render: item => <strong>{(item as any).game?.name ?? item.gameId}</strong> },
    { key: 'levels', header: 'Levels', sortable: false, render: item => (item.levels as any)?.length ?? 0 },
    { key: 'breaks', header: 'Breaks', sortable: false, render: item => (item.breaks as any)?.length ?? 0 },
    { key: 'id', header: 'Structure ID', sortable: false, render: item => <span className="font-mono text-gray-500 text-xs">{item.id}</span> },
  ];
  return <SortableTable query={queries.listTournamentStructuresForDebug} queryName="listTournamentStructures" columns={columns} initialSort={{ key: 'game.name', direction: 'asc' }} gameMap={gameMap} />;
};

export default GamesPage;