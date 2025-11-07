// src/pages/debug/PlayersDebug.tsx
// Updated version that uses getAllCounts and improved formatting

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  listPlayersForDebug,
  listPlayerSummariesForDebug,
  listPlayerEntriesForDebug,
  listPlayerResultsForDebug,
  listPlayerVenuesForDebug,
  listPlayerTransactionsForDebug,
  listPlayerCreditsForDebug,
  listPlayerPointsForDebug,
  listPlayerTicketsForDebug,
  listPlayerMarketingPreferencesForDebug,
  listPlayerMarketingMessagesForDebug,
} from '../../graphql/customQueries';
import { getAllCounts } from '../../graphql/queries';

type TabType = 
  | 'players' 
  | 'summaries' 
  | 'entries' 
  | 'results' 
  | 'venues' 
  | 'transactions' 
  | 'credits' 
  | 'points' 
  | 'tickets' 
  | 'marketing' 
  | 'marketingMessages';

interface TabData {
  label: string;
  query: any;
  listKey: string;
  countKey: string;
}

const tabs: Record<TabType, TabData> = {
  players: { 
    label: 'Players', 
    query: listPlayersForDebug, 
    listKey: 'listPlayers',
    countKey: 'playerCount'
  },
  summaries: { 
    label: 'Player Summaries', 
    query: listPlayerSummariesForDebug, 
    listKey: 'listPlayerSummaries',
    countKey: 'playerSummaryCount'
  },
  entries: { 
    label: 'Player Entries', 
    query: listPlayerEntriesForDebug, 
    listKey: 'listPlayerEntries',
    countKey: 'playerEntryCount'
  },
  results: { 
    label: 'Player Results', 
    query: listPlayerResultsForDebug, 
    listKey: 'listPlayerResults',
    countKey: 'playerResultCount'
  },
  venues: { 
    label: 'Player Venues', 
    query: listPlayerVenuesForDebug, 
    listKey: 'listPlayerVenues',
    countKey: 'playerVenueCount'
  },
  transactions: { 
    label: 'Player Transactions', 
    query: listPlayerTransactionsForDebug, 
    listKey: 'listPlayerTransactions',
    countKey: 'playerTransactionCount'
  },
  credits: { 
    label: 'Player Credits', 
    query: listPlayerCreditsForDebug, 
    listKey: 'listPlayerCredits',
    countKey: 'playerCreditsCount'
  },
  points: { 
    label: 'Player Points', 
    query: listPlayerPointsForDebug, 
    listKey: 'listPlayerPoints',
    countKey: 'playerPointsCount'
  },
  tickets: { 
    label: 'Player Tickets', 
    query: listPlayerTicketsForDebug, 
    listKey: 'listPlayerTickets',
    countKey: 'playerTicketCount'
  },
  marketing: { 
    label: 'Marketing Preferences', 
    query: listPlayerMarketingPreferencesForDebug, 
    listKey: 'listPlayerMarketingPreferences',
    countKey: 'playerMarketingPreferencesCount'
  },
  marketingMessages: { 
    label: 'Marketing Messages', 
    query: listPlayerMarketingMessagesForDebug, 
    listKey: 'listPlayerMarketingMessages',
    countKey: 'playerMarketingMessageCount'
  },
};

// Refresh icon component
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export const PlayersDebug = () => {
  const [activeTab, setActiveTab] = useState<TabType>('players');
  const [data, setData] = useState<Record<TabType, any[]>>({
    players: [],
    summaries: [],
    entries: [],
    results: [],
    venues: [],
    transactions: [],
    credits: [],
    points: [],
    tickets: [],
    marketing: [],
    marketingMessages: [],
  });
  const [loading, setLoading] = useState<Record<TabType, boolean>>({
    players: false,
    summaries: false,
    entries: false,
    results: false,
    venues: false,
    transactions: false,
    credits: false,
    points: false,
    tickets: false,
    marketing: false,
    marketingMessages: false,
  });
  const [nextTokens, setNextTokens] = useState<Record<TabType, string | null>>({
    players: null,
    summaries: null,
    entries: null,
    results: null,
    venues: null,
    transactions: null,
    credits: null,
    points: null,
    tickets: null,
    marketing: null,
    marketingMessages: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [totalCounts, setTotalCounts] = useState<Record<TabType, number>>({
    players: 0,
    summaries: 0,
    entries: 0,
    results: 0,
    venues: 0,
    transactions: 0,
    credits: 0,
    points: 0,
    tickets: 0,
    marketing: 0,
    marketingMessages: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);

  // Helper functions for formatting
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const calculateDaysFromNow = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays.toLocaleString()} days`;
  };

  const getTableHeaders = (tab: TabType) => {
    switch (tab) {
      case 'players':
        return ['First Name', 'Last Name', 'First Played', 'Last Played', 'Classification'];
      case 'summaries':
        return ['Player', 'Last 30 days', 'Last 90 days', 'All Time', 'Net Balance'];
      case 'entries':
        return ['Player', 'Game', 'Status', 'Stack Size'];
      case 'results':
        return ['Player', 'Game', 'Place', 'Prize Won'];
      case 'venues':
        return ['Player', 'Venue', 'Games Played', 'Avg Buy-In', 'Classification'];
      case 'transactions':
        return ['Firstname', 'Lastname', 'Game ID', 'BuyIn', 'Rake'];
      case 'credits':
        return ['Type', 'Change Amount', 'Balance After', 'Transaction Date', 'Reason'];
      case 'points':
        return ['Firstname', 'Lastname', 'Game ID', 'Date', 'Type', 'Amount', 'Balance'];
      case 'tickets':
        return ['Assigned At', 'Expiry Date', 'Status', 'Used In Game ID'];
      case 'marketing':
        return ['Player ID', 'Opt Out SMS', 'Opt Out Email'];
      case 'marketingMessages':
        return ['Status', 'Sent At', 'Player ID', 'Marketing Message ID'];
      default:
        return [];
    }
  };

  const getRowData = (tab: TabType, item: any) => {
    switch (tab) {
      case 'players':
        return [
          item.firstName || '-',
          item.lastName || '-',
          calculateDaysFromNow(item.firstGamePlayed),
          calculateDaysFromNow(item.lastPlayedDate),
          item.targetingClassification || '-',
        ];
      case 'summaries':
        return [
          `${item.player?.firstName || '-'} ${item.player?.lastName || '-'}`,
          (item.gamesPlayedLast30Days || 0).toLocaleString(),
          (item.gamesPlayedLast90Days || 0).toLocaleString(),
          (item.gamesPlayedAllTime || 0).toLocaleString(),
          formatCurrency(item.netBalance),
        ];
      case 'entries':
        return [
          `${item.player?.firstName || '-'} ${item.player?.lastName || '-'}`,
          item.game?.name || '-',
          item.status || '-',
          item.lastKnownStackSize ? item.lastKnownStackSize.toLocaleString() : '-',
        ];
      case 'results':
        return [
          `${item.player?.firstName || '-'} ${item.player?.lastName || '-'}`,
          item.game?.name || '-',
          item.finishingPlace ? item.finishingPlace.toLocaleString() : '-',
          formatCurrency(item.amountWon),
        ];
      case 'venues':
        return [
          `${item.player?.firstName || '-'} ${item.player?.lastName || '-'}`,
          item.venue?.name || '-',
          (item.totalGamesPlayed || 0).toLocaleString(),
          formatCurrency(item.averageBuyIn),
          item.targetingClassification || '-',
        ];
      case 'transactions':
        return [
          item.player?.firstName || '-',
          item.player?.lastName || '-',
          item.gameId ? item.gameId.slice(0, 8) + '...' : '-',
          formatCurrency(item.amount),
          formatCurrency(item.rake),
        ];
      case 'credits':
        return [
          item.type || '-',
          formatCurrency(item.changeAmount),
          formatCurrency(item.balanceAfter),
          formatDate(item.transactionDate),
          item.reason || '-',
        ];
      case 'points':
        return [
          item.player?.firstName || '-',
          item.player?.lastName || '-',
          item.relatedGameId ? item.relatedGameId.slice(0, 8) + '...' : '-',
          formatDate(item.transactionDate),
          item.type || '-',
          item.changeAmount ? item.changeAmount.toLocaleString() : '0',
          item.balanceAfter ? item.balanceAfter.toLocaleString() : '0',
        ];
      case 'tickets':
        return [
          formatDate(item.assignedAt),
          formatDate(item.expiryDate),
          item.status || '-',
          item.usedInGameId || '-',
        ];
      case 'marketing':
        return [
          item.playerId?.slice(0, 8) + '...' || '-',
          item.optOutSms ? 'Yes' : 'No',
          item.optOutEmail ? 'Yes' : 'No',
        ];
      case 'marketingMessages':
        return [
          item.status || '-',
          formatDate(item.sentAt),
          item.playerId?.slice(0, 8) + '...' || '-',
          item.marketingMessageId?.slice(0, 8) + '...' || '-',
        ];
      default:
        return [];
    }
  };

  // Fetch data for a specific tab
  const fetchData = async (tab: TabType, nextToken?: string | null, isLoadMore: boolean = false) => {
    const client = getClient();
    if (!isLoadMore) {
      setLoading(prev => ({ ...prev, [tab]: true }));
    }
    
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
        const items = response.data[tabConfig.listKey].items.filter(Boolean);
        const newNextToken = response.data[tabConfig.listKey].nextToken || null;
        
        if (nextToken && isLoadMore) {
          // Load more: Append items
          setData(prev => ({
            ...prev,
            [tab]: [...prev[tab], ...items]
          }));
        } else {
          // First fetch: Set items
          setData(prev => ({
            ...prev,
            [tab]: items
          }));
        }
        
        setNextTokens(prev => ({
          ...prev,
          [tab]: newNextToken
        }));
      }
    } catch (err) {
      console.error(`Error fetching ${tab}:`, err);
      if (!isLoadMore) {
        setError(`Failed to fetch ${tabs[tab].label}`);
      }
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
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
          players: counts.playerCount || 0,
          summaries: counts.playerSummaryCount || 0,
          entries: counts.playerEntryCount || 0,
          results: counts.playerResultCount || 0,
          venues: counts.playerVenueCount || 0,
          transactions: counts.playerTransactionCount || 0,
          credits: counts.playerCreditsCount || 0,
          points: counts.playerPointsCount || 0,
          tickets: counts.playerTicketCount || 0,
          marketing: counts.playerMarketingPreferencesCount || 0,
          marketingMessages: counts.playerMarketingMessageCount || 0,
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

  // Fetch all data and counts on initial load
  const fetchAllDataAndCounts = async () => {
    setIsInitialLoading(true);
    setError(null);

    const allTabs = Object.keys(tabs) as TabType[];

    // Fetch all data in parallel
    const dataPromises = allTabs.map(tab => fetchData(tab));
    
    try {
      // Fetch counts first
      await fetchAllCounts();
      
      // Wait for all data fetches
      await Promise.all(dataPromises);
      
    } catch (err) {
      console.error('Error fetching initial data:', err);
      setError('Failed to load initial data. Please refresh to try again.');
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Fetch all data and counts on initial load
    fetchAllDataAndCounts();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Clear all data
    const emptyData: Record<TabType, any[]> = {} as Record<TabType, any[]>;
    const emptyTokens: Record<TabType, null> = {} as Record<TabType, null>;
    
    Object.keys(tabs).forEach((tab) => {
      emptyData[tab as TabType] = [];
      emptyTokens[tab as TabType] = null;
    });
    
    setData(emptyData);
    setNextTokens(emptyTokens);
    
    // Refetch everything including counts
    await fetchAllDataAndCounts();
  };

  const renderTableContent = () => {
    const currentData = data[activeTab];

    if (isInitialLoading) {
      return (
        <div className="p-8 text-center text-gray-500">
          Loading all player data...
        </div>
      );
    }

    if (isRefreshing && currentData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          Refreshing all data and counts...
        </div>
      );
    }

    if (currentData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No {tabs[activeTab].label.toLowerCase()} found
        </div>
      );
    }

    const headers = getTableHeaders(activeTab);

    return (
      <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {headers.map(header => (
                  <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentData.map((item, index) => {
                const rowData = getRowData(activeTab, item);
                return (
                  <tr key={item.id || index}>
                    {rowData.map((value, idx) => (
                      <td key={idx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {value}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {nextTokens[activeTab] && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData(activeTab, nextTokens[activeTab], true)}
              disabled={loading[activeTab]}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading[activeTab] ? 'Loading...' : `Load more ${tabs[activeTab].label.toLowerCase()}`}
            </button>
          </div>
        )}
      </>
    );
  };

  // Calculate total data loaded
  const totalDataLoaded = Object.values(data).reduce((acc, items) => acc + items.length, 0);

  return (
    <PageWrapper title="Players (Debug)" maxWidth="7xl">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-yellow-800">
              <strong>Debug Mode:</strong> This page displays raw player data tables for debugging purposes.
            </p>
            {!isInitialLoading && (
              <p className="text-xs text-yellow-700 mt-1">
                Total records loaded: {totalDataLoaded.toLocaleString()} | 
                Tab switches are instant - all data preloaded | 
                Using getAllCounts for efficient count retrieval
              </p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isInitialLoading}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh all data and counts"
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
            onClick={() => setActiveTab(key as TabType)}
            disabled={isInitialLoading}
            className={`px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
              activeTab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            } ${isInitialLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {tabs[activeTab].label} Table
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Showing {data[activeTab].length.toLocaleString()} of {countsLoading ? '...' : totalCounts[activeTab].toLocaleString()} total records
          </p>
        </div>
        {renderTableContent()}
      </div>
    </PageWrapper>
  );
};