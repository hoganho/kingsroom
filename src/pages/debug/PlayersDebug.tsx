// src/pages/debug/PlayersDebug.tsx
// This is the existing Players page renamed to PlayersDebug for the Debug section

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
} from '../../graphql/customQueries';


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
  | 'marketing';

interface TabData {
  label: string;
  query: any;
  listKey: string;
}

const tabs: Record<TabType, TabData> = {
  players: { label: 'Players', query: listPlayersForDebug, listKey: 'listPlayers' },
  summaries: { label: 'Summaries', query: listPlayerSummariesForDebug, listKey: 'listPlayerSummaries' },
  entries: { label: 'Entries', query: listPlayerEntriesForDebug, listKey: 'listPlayerEntries' },
  results: { label: 'Results', query: listPlayerResultsForDebug, listKey: 'listPlayerResults' },
  venues: { label: 'Player Venues', query: listPlayerVenuesForDebug, listKey: 'listPlayerVenues' },
  transactions: { label: 'Transactions', query: listPlayerTransactionsForDebug, listKey: 'listPlayerTransactions' },
  credits: { label: 'Credits', query: listPlayerCreditsForDebug, listKey: 'listPlayerCredits' },
  points: { label: 'Points', query: listPlayerPointsForDebug, listKey: 'listPlayerPoints' },
  tickets: { label: 'Tickets', query: listPlayerTicketsForDebug, listKey: 'listPlayerTickets' },
  marketing: { label: 'Marketing', query: listPlayerMarketingPreferencesForDebug, listKey: 'listPlayerMarketingPreferences' },
};

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
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData('players');
  }, []);

  const fetchData = async (tab: TabType, nextToken?: string | null) => {
    const client = getClient();
    setLoading(prev => ({ ...prev, [tab]: true }));
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
        const items = response.data[tabConfig.listKey].items.filter(Boolean);
        
        if (nextToken) {
          setData(prev => ({
            ...prev,
            [tab]: [...prev[tab], ...items]
          }));
        } else {
          setData(prev => ({
            ...prev,
            [tab]: items
          }));
        }
        
        setNextTokens(prev => ({
          ...prev,
          [tab]: response.data[tabConfig.listKey].nextToken || null
        }));
      }
    } catch (err) {
      console.error(`Error fetching ${tab}:`, err);
      setError(`Failed to fetch ${tabs[tab].label}`);
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (data[tab].length === 0 && !loading[tab]) {
      fetchData(tab);
    }
  };

  const renderTableContent = () => {
    const currentData = data[activeTab];
    const isLoading = loading[activeTab];

    if (isLoading && currentData.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          Loading {tabs[activeTab].label.toLowerCase()}...
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

    // Get all unique keys from data items
    const allKeys = new Set<string>();
    currentData.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });
    const keys = Array.from(allKeys).sort();

    return (
      <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {keys.slice(0, 6).map(key => (
                  <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {key.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentData.map((item, index) => (
                <tr key={item.id || index}>
                  {keys.slice(0, 6).map(key => (
                    <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatValue(item[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextTokens[activeTab] && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData(activeTab, nextTokens[activeTab])}
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

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      if (value.id) return value.id.slice(0, 8) + '...';
      if (value.name) return value.name;
      if (value.firstName && value.lastName) return `${value.firstName} ${value.lastName}`;
      return JSON.stringify(value).slice(0, 50);
    }
    if (typeof value === 'string' && value.length > 50) {
      return value.slice(0, 50) + '...';
    }
    return String(value);
  };

  return (
    <PageWrapper title="Players (Debug)" maxWidth="7xl">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Debug Mode:</strong> This page displays raw player data tables for debugging purposes.
        </p>
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
            {config.label} ({data[key as TabType].length})
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
        </div>
        {renderTableContent()}
      </div>
    </PageWrapper>
  );
};
