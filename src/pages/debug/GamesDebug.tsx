// src/pages/debug/GamesDebug.tsx
// Updated with getAllCounts and specific formatting requirements

import { useState, useEffect, useCallback } from 'react';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { listGamesForDebug, listTournamentStructuresForDebug } from '../../graphql/customQueries';
import { getAllCounts } from '../../graphql/queries';
import { formatCurrency } from '../../utils/generalHelpers';
import { useAuthenticator } from '@aws-amplify/ui-react';

type TabType = 'games' | 'structures';

interface TabData {
  label: string;
  query: any;
  listKey: string;
  countKey: string;
}

interface S3StorageInfo {
  s3Key: string;
}

const tabs: Record<TabType, TabData> = {
  games: { 
    label: 'Games', 
    query: listGamesForDebug, 
    listKey: 'listGames',
    countKey: 'gameCount'
  },
  structures: { 
    label: 'Tournament Structures', 
    query: listTournamentStructuresForDebug, 
    listKey: 'listTournamentStructures',
    countKey: 'tournamentStructureCount'
  },
};

// Refresh icon component
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

// GraphQL query to fetch ScrapeURL by sourceSystem and tournamentId
const getScrapeURLForS3 = /* GraphQL */ `
  query GetScrapeURLForS3($sourceSystem: String!, $tournamentId: ModelIntKeyConditionInput) {
    scrapeURLsBySourceSystem(sourceSystem: $sourceSystem, tournamentId: $tournamentId, limit: 1) {
      items {
        id
        tournamentId
        entityId
        latestS3Key
        s3StoragePrefix
      }
    }
  }
`;

// S3 bucket configuration
const S3_BUCKET_NAME = 'pokerpro-scraper-storage';
const S3_REGION = 'ap-southeast-2';
const SOURCE_SYSTEM = 'KINGSROOM_WEB';

// Helper to generate a pre-signed URL for S3 object
const getPresignedS3Url = async (s3Key: string): Promise<string> => {
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error('Unable to get AWS credentials. Please sign in again.');
  }

  const s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  });

  // Generate pre-signed URL valid for 1 hour
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return signedUrl;
};

export const GamesDebug = () => {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  
  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchAllCounts();
      fetchData('games');
    }
  }, [authStatus]);

  if (authStatus !== 'authenticated') {
    return <div>Please sign in...</div>;
  }
  
  const [activeTab, setActiveTab] = useState<TabType>('games');
  const [data, setData] = useState<Record<TabType, any[]>>({
    games: [],
    structures: [],
  });
  const [loading, setLoading] = useState<Record<TabType, boolean>>({
    games: false,
    structures: false,
  });
  const [nextTokens, setNextTokens] = useState<Record<TabType, string | null>>({
    games: null,
    structures: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [totalCounts, setTotalCounts] = useState<Record<TabType, number>>({
    games: 0,
    structures: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countsLoading, setCountsLoading] = useState(true);
  
  // S3 storage lookup map: "entityId-tournamentId" -> S3StorageInfo
  const [s3StorageMap, setS3StorageMap] = useState<Record<string, S3StorageInfo>>({});
  const [s3LoadingKeys, setS3LoadingKeys] = useState<Set<string>>(new Set());
  const [s3OpeningKey, setS3OpeningKey] = useState<string | null>(null);

  // Handle clicking an S3 link - generate pre-signed URL and open
  const handleS3LinkClick = useCallback(async (s3Key: string, e: React.MouseEvent) => {
    e.preventDefault();
    setS3OpeningKey(s3Key);
    
    try {
      console.log(`[S3 Open] Generating pre-signed URL for: ${s3Key}`);
      const signedUrl = await getPresignedS3Url(s3Key);
      console.log(`[S3 Open] Opening pre-signed URL`);
      window.open(signedUrl, '_blank');
    } catch (err) {
      console.error(`[S3 Open] Error generating pre-signed URL:`, err);
      alert('Failed to open S3 file. Please try again.');
    } finally {
      setS3OpeningKey(null);
    }
  }, []);

  // Build a lookup key from entityId and tournamentId
  const getS3LookupKey = (entityId: string | null, tournamentId: number | null): string | null => {
    if (!entityId || !tournamentId) return null;
    return `${entityId}-${tournamentId}`;
  };

  // Fetch S3 storage info for a game by tournamentId (using ScrapeURL table)
  const fetchS3StorageForGame = async (entityId: string, tournamentId: number) => {
    const lookupKey = `${entityId}-${tournamentId}`;
    if (s3StorageMap[lookupKey] || s3LoadingKeys.has(lookupKey)) return;
    
    console.log(`[S3 Fetch] Starting fetch for entityId=${entityId}, tournamentId=${tournamentId}`);
    
    const client = getClient();
    setS3LoadingKeys(prev => new Set(prev).add(lookupKey));
    
    try {
      const response = await client.graphql({
        query: getScrapeURLForS3,
        variables: { 
          sourceSystem: SOURCE_SYSTEM,
          tournamentId: { eq: tournamentId }
        }
      });
      
      console.log(`[S3 Fetch] Response for ${lookupKey}:`, response);
      
      if ('data' in response && response.data?.scrapeURLsBySourceSystem?.items?.length > 0) {
        const scrapeUrl = response.data.scrapeURLsBySourceSystem.items[0];
        console.log(`[S3 Fetch] Found ScrapeURL for ${lookupKey}:`, scrapeUrl);
        
        // Verify entityId matches (in case there are multiple entities with same tournamentId)
        if (scrapeUrl.entityId === entityId && scrapeUrl.latestS3Key) {
          setS3StorageMap(prev => ({
            ...prev,
            [lookupKey]: { s3Key: scrapeUrl.latestS3Key }
          }));
          console.log(`[S3 Fetch] Stored s3Key for ${lookupKey}: ${scrapeUrl.latestS3Key}`);
        } else if (scrapeUrl.entityId !== entityId) {
          console.log(`[S3 Fetch] EntityId mismatch for ${lookupKey}: expected ${entityId}, got ${scrapeUrl.entityId}`);
        } else {
          console.log(`[S3 Fetch] No latestS3Key for ${lookupKey}`);
        }
      } else {
        console.log(`[S3 Fetch] No ScrapeURL found for ${lookupKey}`);
      }
    } catch (err) {
      console.error(`[S3 Fetch] Error fetching ScrapeURL for tournament ${tournamentId}:`, err);
    } finally {
      setS3LoadingKeys(prev => {
        const next = new Set(prev);
        next.delete(lookupKey);
        return next;
      });
    }
  };

  // Fetch S3 storage for multiple games in parallel
  const fetchS3StorageForGames = async (games: any[]) => {
    console.log(`[S3 Batch] Processing ${games.length} games`);
    console.log(`[S3 Batch] Sample game data:`, games.slice(0, 3).map(g => ({
      id: g.id,
      tournamentId: g.tournamentId,
      entityId: g.entityId,
      name: g.name
    })));
    
    const gamesToFetch = games.filter(g => {
      if (!g.entityId || !g.tournamentId) {
        console.log(`[S3 Batch] Skipping game ${g.id} - missing entityId=${g.entityId} or tournamentId=${g.tournamentId}`);
        return false;
      }
      const key = getS3LookupKey(g.entityId, g.tournamentId);
      return key && !s3StorageMap[key];
    });
    
    console.log(`[S3 Batch] Fetching S3 storage for ${gamesToFetch.length} games`);
    await Promise.all(gamesToFetch.map(g => fetchS3StorageForGame(g.entityId, g.tournamentId)));
  };

  // Debug: Log when s3StorageMap changes
  useEffect(() => {
    console.log(`[S3 Map] Updated - now has ${Object.keys(s3StorageMap).length} entries:`, s3StorageMap);
  }, [s3StorageMap]);

  // Format date helper
  const formatGameDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate().toString().padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}-${month}-${year} @ ${hours}:${minutes}`;
  };

  // Fetch all counts using getAllCounts query
  const fetchAllCounts = async () => {
    const client = getClient();
    setCountsLoading(true);
    
    try {
      const response = await client.graphql({
        query: getAllCounts
      });
      
      if ('data' in response && response.data && response.data.getAllCounts) {
        const counts = response.data.getAllCounts;
        
        // Map the returned counts to our state structure
        const newTotalCounts: Record<TabType, number> = {
          games: counts.gameCount || 0,
          structures: counts.tournamentStructureCount || 0,
        };
        
        setTotalCounts(newTotalCounts);
      }
    } catch (err) {
      console.error('Error fetching counts:', err);
      setError('Failed to fetch record counts');
    } finally {
      setCountsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch all counts on initial load
    fetchAllCounts();
    // Fetch data for the default 'games' tab
    fetchData('games');
  }, []);

  const fetchData = async (tab: TabType, nextToken?: string | null, isLoadMore: boolean = false) => {
    const client = getClient();
    if (!isLoadMore) {
      setLoading(prev => ({ ...prev, [tab]: true }));
    }
    setError(null);
    
    try {
      const tabConfig = tabs[tab];
      const variables: any = { limit: 50 };
      if (nextToken) {
        variables.nextToken = nextToken;
      }

      const response = await client.graphql({
        query: tabConfig.query,
        variables
      });

      if ('data' in response && response.data) {
        let items = response.data[tabConfig.listKey].items.filter(Boolean);
        
        // Debug log raw items
        if (tab === 'games') {
          console.log(`[Games Fetch] Loaded ${items.length} games`);
          console.log(`[Games Fetch] First 3 games raw:`, items.slice(0, 3));
        }
        
        // Sort games by gameStartDateTime (most recent first)
        if (tab === 'games') {
          items = items.sort((a: any, b: any) => {
            const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
            const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
            return dateB - dateA; // Most recent first
          });
        }
        
        const newNextToken = response.data[tabConfig.listKey].nextToken || null;
        
        if (nextToken && isLoadMore) {
          // Load more: Append items and re-sort if games
          setData(prev => { // <-- 'prev' is defined here
            let allItems = [...prev[tab], ...items]; // <-- Now this works
            
            if (tab === 'games') {
              allItems = allItems.sort((a: any, b: any) => {
                const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
                const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
                return dateB - dateA; // Most recent first
              });
            }
            
            return { // <-- Return the new state object
              ...prev,
              [tab]: allItems
            };
          });
          
          // Fetch S3 storage info for new games
          if (tab === 'games') {
            fetchS3StorageForGames(items);
          }
        } else {
          // First fetch: Set items
          setData(prev => ({
            ...prev,
            [tab]: items
          }));
          
          // Fetch S3 storage info for games
          if (tab === 'games') {
            fetchS3StorageForGames(items);
          }
        }
        
        setNextTokens(prev => ({
          ...prev,
          [tab]: newNextToken
        }));
      }
    } catch (err) {
      console.error(`Error fetching ${tab}:`, err);
      setError(`Failed to fetch ${tabs[tab].label}`);
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
      setIsRefreshing(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (data[tab].length === 0 && !loading[tab]) {
      fetchData(tab);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Clear current tab's data
    setData(prev => ({
      ...prev,
      [activeTab]: []
    }));
    setNextTokens(prev => ({
      ...prev,
      [activeTab]: null
    }));
    
    // Clear S3 storage map when refreshing games
    if (activeTab === 'games') {
      setS3StorageMap({});
    }
    
    // Refetch all counts
    await fetchAllCounts();
    
    // Refetch current tab's data
    fetchData(activeTab);
  };

  // Render games table with specific columns
  const renderGamesTable = () => {
    const gamesData = data.games;

    if (gamesData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No games found
        </div>
      );
    }

    return (
      <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rego
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Start
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Game
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Buy In
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {gamesData.map((game, index) => {
                // Look up S3 storage info from the map using entityId-tournamentId
                const lookupKey = getS3LookupKey(game.entityId, game.tournamentId);
                const s3Info = lookupKey ? s3StorageMap[lookupKey] : null;
                const hasS3Key = !!s3Info?.s3Key;
                const isLoadingS3 = lookupKey ? s3LoadingKeys.has(lookupKey) : false;
                const isOpening = s3Info?.s3Key === s3OpeningKey;
                
                // Debug log for first 5 games
                if (index < 5) {
                  console.log(`[Render] Game ${index}:`, {
                    id: game.id,
                    tournamentId: game.tournamentId,
                    entityId: game.entityId,
                    lookupKey,
                    s3Info,
                    hasS3Key,
                    isLoadingS3,
                    s3StorageMapKeys: Object.keys(s3StorageMap)
                  });
                }
                
                return (
                  <tr key={game.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {isLoadingS3 ? (
                        <span className="text-gray-400">{game.tournamentId || '-'}...</span>
                      ) : hasS3Key ? (
                        <button 
                          onClick={(e) => handleS3LinkClick(s3Info.s3Key, e)}
                          disabled={isOpening}
                          className="text-indigo-600 hover:text-indigo-900 underline disabled:opacity-50 disabled:cursor-wait"
                          title={`View S3 HTML: ${s3Info.s3Key}`}
                        >
                          {isOpening ? `${game.tournamentId}...` : game.tournamentId || '-'}
                        </button>
                      ) : (
                        <span className="text-gray-900">{game.tournamentId || '-'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex px-2 text-xs leading-5 font-semibold rounded-full ${
                        game.gameStatus === 'RUNNING' ? 'bg-green-100 text-green-800' :
                        game.gameStatus === 'FINISHED' ? 'bg-gray-100 text-gray-800' :
                        game.gameStatus === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                        game.gameStatus === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {game.gameStatus || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.registrationStatus || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatGameDateTime(game.gameStartDateTime)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-xs truncate" title={game.name || '-'}>
                        {game.name || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {game.gameVariant || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(game.buyIn)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {nextTokens.games && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData('games', nextTokens.games, true)}
              disabled={loading.games}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading.games ? 'Loading...' : 'Load more games'}
            </button>
          </div>
        )}
      </>
    );
  };

  // Render tournament structures like BlindStructure component
  const renderStructuresTable = () => {
    const structuresData = data.structures;

    if (structuresData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No tournament structures found
        </div>
      );
    }

    return (
      <div className="space-y-6 p-4">
        {structuresData.map((structure) => (
          <div key={structure.id} className="bg-white border rounded-lg shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h4 className="text-sm font-medium text-gray-900">
                {structure.game?.name || 'Unknown Game'} - Structure ID: {structure.id?.slice(0, 8)}...
              </h4>
            </div>
            
            {structure.levels && structure.levels.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Level</th>
                      <th className="px-3 py-2 text-left">Duration</th>
                      <th className="px-3 py-2 text-left">Blinds</th>
                      <th className="px-3 py-2 text-left">Ante</th>
                      {structure.levels.some((l: any) => l.breakMinutes) && (
                        <th className="px-3 py-2 text-left">Break</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {structure.levels.map((level: any, idx: number) => (
                      <tr key={idx} className={`border-b last:border-b-0 ${level.breakMinutes ? 'bg-blue-50' : ''}`}>
                        <td className="px-3 py-2">{level.levelNumber}</td>
                        <td className="px-3 py-2">{level.durationMinutes || '-'} min</td>
                        <td className="px-3 py-2">
                          {level.smallBlind !== null && level.bigBlind !== null 
                            ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` 
                            : '-'}
                        </td>
                        <td className="px-3 py-2">{level.ante ? level.ante.toLocaleString() : '-'}</td>
                        {structure.levels.some((l: any) => l.breakMinutes) && (
                          <td className="px-3 py-2 font-medium text-blue-700">
                            {level.breakMinutes ? `${level.breakMinutes} min` : '-'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-sm text-gray-500">
                No level data available for this structure.
              </div>
            )}

            {structure.breaks && structure.breaks.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50">
                <p className="text-xs text-gray-600">
                  Breaks after levels: {structure.breaks.map((b: any) => b.levelNumberBeforeBreak).join(', ')}
                </p>
              </div>
            )}
          </div>
        ))}
        
        {nextTokens.structures && (
          <div className="px-4 py-3 bg-gray-50 rounded-lg">
            <button
              onClick={() => fetchData('structures', nextTokens.structures, true)}
              disabled={loading.structures}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading.structures ? 'Loading...' : 'Load more tournament structures'}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderTableContent = () => {
    const currentData = data[activeTab];
    const isLoading = loading[activeTab];

    if ((isLoading || isRefreshing) && currentData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          {isRefreshing ? `Refreshing ${tabs[activeTab].label.toLowerCase()}...` : `Loading ${tabs[activeTab].label.toLowerCase()}...`}
        </div>
      );
    }

    // Use specific rendering based on active tab
    if (activeTab === 'games') {
      return renderGamesTable();
    } else if (activeTab === 'structures') {
      return renderStructuresTable();
    }

    return null;
  };

  return (
    <PageWrapper title="Games (Debug)" maxWidth="7xl">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-yellow-800">
              <strong>Debug Mode:</strong> This page displays raw game data tables for debugging purposes.
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Games sorted by start date (most recent first) | Using getAllCounts for efficient retrieval
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading[activeTab] || countsLoading}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh data and counts"
            >
              <RefreshIcon />
              <span className="ml-2">Refresh All</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, config]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key as TabType)}
            className={`px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
              activeTab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {config.label} ({countsLoading ? '...' : totalCounts[key as TabType].toLocaleString()})
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Table content */}
      <div className="bg-white shadow rounded-lg">
        {activeTab === 'games' && (
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Games Table
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Showing {data.games.length.toLocaleString()} of {countsLoading ? '...' : totalCounts.games.toLocaleString()} total games
            </p>
          </div>
        )}
        {activeTab === 'structures' && (
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Tournament Structures
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Showing {data.structures.length.toLocaleString()} of {countsLoading ? '...' : totalCounts.structures.toLocaleString()} total structures
            </p>
          </div>
        )}
        {renderTableContent()}
      </div>
    </PageWrapper>
  );
};