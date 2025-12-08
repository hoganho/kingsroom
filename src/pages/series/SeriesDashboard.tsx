// src/pages/series/SeriesDashboard.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { TrophyIcon, CalendarIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { formatCurrency } from '../../utils/generalHelpers';


interface Series {
  id: string;
  name: string;
  status: string;
  startDate?: string;
  endDate?: string;
  totalGames?: number;
  completedGames?: number;
  totalPrizepoolPaid?: number;
  totalPrizepoolCalculated?: number;
  totalUniquePlayers?: number;
  totalEntries?: number;
  venues?: Array<{ name: string }>;
}

export const SeriesDashboard = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'completed'>('all');

  useEffect(() => {
    fetchSeries();
  }, []);

  const fetchSeries = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const response = await client.graphql({
        query: /* GraphQL */ `
          query ListTournamentSeries {
            listTournamentSeries(limit: 100) {
              items {
                id
                name
                status
                startDate
                endDate
                games {
                  items {
                    id
                    gameStatus
                  }
                }
              }
            }
          }
        `,
      });

                //totalGames
                //completedGames
                //totalPrizepoolPaid
                //totalEntries

      if ('data' in response && response.data) {
        const seriesItems = response.data.listTournamentSeries.items.filter(Boolean) as Series[];
        
        // Calculate status for each series
        const enrichedSeries = seriesItems.map(s => {
          const now = new Date();
          const startDate = s.startDate ? new Date(s.startDate) : null;
          const endDate = s.endDate ? new Date(s.endDate) : null;
          
          let status = 'Unknown';
          if (startDate && endDate) {
            if (now < startDate) status = 'Upcoming';
            else if (now > endDate) status = 'Completed';
            else status = 'Active';
          }
          
          return { ...s, status };
        });
        
        setSeries(enrichedSeries);
      }
    } catch (error) {
      console.error('Error fetching series:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSeries = series.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'active') return s.status === 'Active';
    if (filter === 'upcoming') return s.status === 'Upcoming';
    if (filter === 'completed') return s.status === 'Completed';
    return true;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Upcoming':
        return 'bg-yellow-100 text-yellow-800';
      case 'Completed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  // Calculate summary stats
  const stats = {
    totalSeries: series.length,
    activeSeries: series.filter(s => s.status === 'Active').length,
    totalPrizepoolPaid: series.reduce((sum, s) => sum + (s.totalPrizepoolPaid || 0), 0),
    totalPrizepoolCalculated: series.reduce((sum, s) => sum + (s.totalPrizepoolCalculated || 0), 0),
    totalUniquePlayers: series.reduce((sum, s) => sum + (s.totalUniquePlayers || 0), 0),
    totalEntries: series.reduce((sum, s) => sum + (s.totalEntries || 0), 0),
  };

  return (
    <PageWrapper
      title="Series Dashboard"
      maxWidth="7xl"
      actions={
        <div className="flex space-x-2">
          {(['all', 'active', 'upcoming', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-sm rounded-md capitalize ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrophyIcon className="h-8 w-8 text-indigo-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Series</p>
              <p className="text-2xl font-bold">{stats.totalSeries}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <ChartBarIcon className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Active Series</p>
              <p className="text-2xl font-bold">{stats.activeSeries}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Unique Players</p>
              <p className="text-2xl font-bold">{stats.totalUniquePlayers.toLocaleString()}</p>
            </div>
          </div>
        </div>        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Entries</p>
              <p className="text-2xl font-bold">{stats.totalEntries.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Prizepool Paid</p>
              <p className="text-xl font-bold">{formatCurrency(stats.totalPrizepoolPaid)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="ml-3">
              <p className="text-sm text-gray-500">Total Prizepool Calculated</p>
              <p className="text-xl font-bold">{formatCurrency(stats.totalPrizepoolCalculated)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Series Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {filter === 'all' ? 'All Series' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Series`} 
            ({filteredSeries.length})
          </h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">Loading series...</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Series Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Games
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Entries
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Prizepool Paid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Prizepool Calculated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSeries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                      No series found
                    </td>
                  </tr>
                ) : (
                  filteredSeries.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {s.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${getStatusBadgeClass(s.status)}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(s.startDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(s.endDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.completedGames || 0} / {s.totalGames || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.totalUniquePlayers?.toLocaleString() || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.totalEntries?.toLocaleString() || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.totalPrizepoolPaid ? formatCurrency(s.totalPrizepoolPaid) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {s.totalPrizepoolCalculated ? formatCurrency(s.totalPrizepoolCalculated) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
};
