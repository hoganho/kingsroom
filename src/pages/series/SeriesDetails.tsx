// src/pages/series/SeriesDetails.tsx
// VERSION: 1.0.0 - Tournament Series Details Page
//
// Shows detailed view of a specific tournament series including:
// - Series summary from TournamentSeriesMetrics
// - Event list (PARENT games only to avoid double-counting flights)
// - Attendance and profit charts
// - Drill-down to individual events

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  TrophyIcon,
  CalendarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  ClockIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { format, parseISO } from 'date-fns';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { TimeRangeToggle, type TimeRangeKey } from '@/components/ui/TimeRangeToggle';
import { getClient } from '@/utils/apiClient';
import { cx, formatCurrency } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';

// ============================================
// GRAPHQL QUERIES
// ============================================

const getTournamentSeriesQuery = /* GraphQL */ `
  query GetTournamentSeries($id: ID!) {
    getTournamentSeries(id: $id) {
      id
      name
      year
      quarter
      month
      entityId
      seriesCategory
      holidayType
      status
      startDate
      endDate
      numberOfEvents
      guaranteedPrizepool
      estimatedPrizepool
      actualPrizepool
      venueId
      venue {
        id
        name
      }
    }
  }
`;

const getTournamentSeriesMetricsQuery = /* GraphQL */ `
  query GetTournamentSeriesMetrics(
    $tournamentSeriesId: ID!
    $timeRange: String!
  ) {
    listTournamentSeriesMetrics(
      filter: {
        tournamentSeriesId: { eq: $tournamentSeriesId }
        timeRange: { eq: $timeRange }
      }
      limit: 1
    ) {
      items {
        id
        entityId
        tournamentSeriesId
        seriesName
        timeRange
        
        totalEvents
        totalFlights
        uniqueVenues
        mainEventCount
        
        totalEntries
        totalUniquePlayers
        totalReentries
        totalAddons
        mainEventTotalEntries
        
        totalPrizepool
        totalRevenue
        totalCost
        totalProfit
        
        avgEntriesPerEvent
        avgUniquePlayersPerEvent
        avgPrizepoolPerEvent
        avgRevenuePerEvent
        avgProfitPerEvent
        mainEventAvgEntries
        
        stdDevEntries
        minEntries
        maxEntries
        medianEntries
        entriesCV
        
        profitMargin
        
        firstEventDate
        firstEventDaysAgo
        latestEventDate
        latestEventDaysAgo
        seriesDurationDays
        
        profitability
        consistency
        
        calculatedAt
      }
    }
  }
`;

const listGameFinancialSnapshotsBySeries = /* GraphQL */ `
  query ListGameFinancialSnapshotsBySeries(
    $tournamentSeriesId: ID!
    $limit: Int
    $nextToken: String
  ) {
    listGameFinancialSnapshots(
      filter: {
        tournamentSeriesId: { eq: $tournamentSeriesId }
      }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        entityId
        venueId
        gameId
        gameStartDateTime
        totalEntries
        totalUniquePlayers
        prizepoolTotal
        totalRevenue
        totalCost
        netProfit
        profitMargin
        gameType
        isSeries
        isSeriesParent
        parentGameId
        tournamentSeriesId
        seriesName
        game {
          id
          name
          gameStatus
          buyIn
          gameType
          gameVariant
          consolidationType
          parentGameId
          dayNumber
          flightLetter
          finalDay
          isMainEvent
        }
      }
      nextToken
    }
  }
`;

const refreshTournamentSeriesMetricsMutation = /* GraphQL */ `
  mutation RefreshTournamentSeriesMetrics(
    $tournamentSeriesId: ID!
    $timeRanges: [String]
  ) {
    refreshTournamentSeriesMetrics(
      tournamentSeriesId: $tournamentSeriesId
      timeRanges: $timeRanges
    ) {
      success
      message
      tournamentSeriesMetricsUpdated
      executionTimeMs
      errors
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface TournamentSeries {
  id: string;
  name: string;
  year: number;
  quarter?: number;
  month?: number;
  entityId: string;
  seriesCategory: string;
  holidayType?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  numberOfEvents?: number;
  guaranteedPrizepool?: number;
  estimatedPrizepool?: number;
  actualPrizepool?: number;
  venueId?: string;
  venue?: {
    id: string;
    name: string;
  };
}

interface TournamentSeriesMetrics {
  id: string;
  entityId: string;
  tournamentSeriesId: string;
  seriesName: string;
  timeRange: string;
  
  totalEvents: number;
  totalFlights: number;
  uniqueVenues: number;
  mainEventCount: number;
  
  totalEntries: number;
  totalUniquePlayers: number;
  totalReentries: number;
  totalAddons: number;
  mainEventTotalEntries: number;
  
  totalPrizepool: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  
  avgEntriesPerEvent: number;
  avgUniquePlayersPerEvent: number;
  avgPrizepoolPerEvent: number;
  avgRevenuePerEvent: number;
  avgProfitPerEvent: number;
  mainEventAvgEntries: number;
  
  stdDevEntries: number;
  minEntries: number;
  maxEntries: number;
  medianEntries: number;
  entriesCV: number;
  
  profitMargin: number;
  
  firstEventDate: string | null;
  firstEventDaysAgo: number | null;
  latestEventDate: string | null;
  latestEventDaysAgo: number | null;
  seriesDurationDays: number | null;
  
  profitability: string;
  consistency: string;
  
  calculatedAt: string;
}

interface GameFinancialSnapshot {
  id: string;
  entityId: string;
  venueId: string;
  gameId: string;
  gameStartDateTime: string;
  totalEntries: number;
  totalUniquePlayers: number;
  prizepoolTotal: number;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  gameType: string;
  isSeries: boolean;
  isSeriesParent: boolean;
  parentGameId: string | null;
  tournamentSeriesId: string;
  seriesName: string;
  game?: {
    id: string;
    name: string;
    gameStatus: string;
    buyIn: number;
    gameType: string;
    gameVariant: string;
    consolidationType: string;
    parentGameId: string | null;
    dayNumber: number | null;
    flightLetter: string | null;
    finalDay: boolean | null;
    isMainEvent: boolean;
  };
}

interface EventRowData {
  id: string;
  gameId: string;
  date: string;
  name: string;
  buyIn: number;
  entries: number;
  uniquePlayers: number;
  prizepool: number;
  profit: number;
  profitMargin: number;
  isMainEvent: boolean;
  consolidationType: string;
  hasChildren: boolean;
}

// ============================================
// HELPERS
// ============================================

function formatProfit(value: number): string {
  const formatted = formatCurrency(Math.abs(value));
  return value < 0 ? `-${formatted}` : formatted;
}

function ProfitabilityBadge({ profitability }: { profitability: string }) {
  const styles: Record<string, string> = {
    'highly-profitable': 'bg-green-100 text-green-800 border-green-200',
    'profitable': 'bg-blue-100 text-blue-800 border-blue-200',
    'break-even': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'loss': 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[profitability] || 'bg-gray-100 text-gray-600'}`}>
      {profitability?.replace('-', ' ') || 'Unknown'}
    </span>
  );
}

function ConsistencyBadge({ consistency }: { consistency: string }) {
  const styles: Record<string, string> = {
    'very-reliable': 'bg-green-100 text-green-800 border-green-200',
    'reliable': 'bg-blue-100 text-blue-800 border-blue-200',
    'variable': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'erratic': 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[consistency] || 'bg-gray-100 text-gray-600'}`}>
      {consistency?.replace('-', ' ') || 'Unknown'}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'COMPLETED': 'bg-green-100 text-green-800 border-green-200',
    'IN_PROGRESS': 'bg-blue-100 text-blue-800 border-blue-200',
    'SCHEDULED': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'CANCELLED': 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ') || 'Unknown'}
    </span>
  );
}

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  icon,
  className 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx("p-4", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-50">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {icon && <div className="text-purple-500">{icon}</div>}
      </div>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SeriesDetails() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const seriesId = searchParams.get('seriesId');

  // State
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [series, setSeries] = useState<TournamentSeries | null>(null);
  const [metrics, setMetrics] = useState<TournamentSeriesMetrics | null>(null);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshot[]>([]);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchData = useCallback(async () => {
    if (!seriesId) {
      setError('No series ID provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const client = getClient();

      // Fetch series info
      const seriesResponse: any = await client.graphql({
        query: getTournamentSeriesQuery,
        variables: { id: seriesId },
      });
      const seriesData = seriesResponse.data?.getTournamentSeries;
      setSeries(seriesData);

      // Fetch metrics for this series and time range
      const metricsResponse: any = await client.graphql({
        query: getTournamentSeriesMetricsQuery,
        variables: { tournamentSeriesId: seriesId, timeRange },
      });
      const metricsData = metricsResponse.data?.listTournamentSeriesMetrics?.items?.[0] || null;
      setMetrics(metricsData);

      // Fetch all game snapshots for this series
      const allSnapshots: GameFinancialSnapshot[] = [];
      let nextToken: string | null = null;

      do {
        const snapshotsResponse: any = await client.graphql({
          query: listGameFinancialSnapshotsBySeries,
          variables: {
            tournamentSeriesId: seriesId,
            limit: 100,
            nextToken,
          },
        });
        const items = snapshotsResponse.data?.listGameFinancialSnapshots?.items || [];
        allSnapshots.push(...items);
        nextToken = snapshotsResponse.data?.listGameFinancialSnapshots?.nextToken;
      } while (nextToken);

      setSnapshots(allSnapshots);

    } catch (err: any) {
      console.error('Error fetching series data:', err);
      setError(err.message || 'Failed to load series data');
    } finally {
      setLoading(false);
    }
  }, [seriesId, timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================
  // REFRESH METRICS
  // ============================================

  const handleRefreshMetrics = async () => {
    if (!seriesId) return;

    setRefreshing(true);
    try {
      const client = getClient();
      const response: any = await client.graphql({
        query: refreshTournamentSeriesMetricsMutation,
        variables: {
          tournamentSeriesId: seriesId,
          timeRanges: ['ALL', '12M', '6M', '3M', '1M'],
        },
      });

      const result = response.data?.refreshTournamentSeriesMetrics;
      if (result?.success) {
        // Refetch data after refresh
        await fetchData();
      } else {
        setError(result?.message || 'Failed to refresh metrics');
      }
    } catch (err: any) {
      console.error('Error refreshing metrics:', err);
      setError(err.message || 'Failed to refresh metrics');
    } finally {
      setRefreshing(false);
    }
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  // Filter to PARENT/standalone events only (avoid double-counting flights)
  const parentSnapshots = useMemo(() => {
    return snapshots.filter(s => {
      // Include if: isSeriesParent is true, OR no parentGameId (standalone event)
      // Exclude if: has parentGameId (it's a CHILD/flight)
      return s.isSeriesParent === true || !s.parentGameId;
    });
  }, [snapshots]);

  // Build event rows for table
  const eventRows: EventRowData[] = useMemo(() => {
    return parentSnapshots
      .filter(s => s.game?.gameStatus === 'FINISHED')
      .map(s => {
        // Check if this parent has children
        const hasChildren = snapshots.some(child => child.parentGameId === s.gameId);

        return {
          id: s.id,
          gameId: s.gameId,
          date: s.gameStartDateTime,
          name: s.game?.name || s.seriesName || 'Unknown Event',
          buyIn: s.game?.buyIn || 0,
          entries: s.totalEntries || 0,
          uniquePlayers: s.totalUniquePlayers || 0,
          prizepool: s.prizepoolTotal || 0,
          profit: s.netProfit || 0,
          profitMargin: s.profitMargin || 0,
          isMainEvent: s.game?.isMainEvent || false,
          consolidationType: s.game?.consolidationType || 'STANDARD',
          hasChildren,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [parentSnapshots, snapshots]);

  // Chart data - entries by event
  const chartData = useMemo(() => {
    return eventRows.map((event, index) => ({
      name: `Event ${index + 1}`,
      date: event.date ? format(parseISO(event.date), 'MMM d') : '',
      entries: event.entries,
      profit: event.profit,
      prizepool: event.prizepool,
    }));
  }, [eventRows]);

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnDef<EventRowData>[] = useMemo(() => [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ getValue }) => {
        const date = getValue() as string;
        if (!date) return '-';
        try {
          return format(parseISO(date), 'MMM d, yyyy');
        } catch {
          return '-';
        }
      },
    },
    {
      accessorKey: 'name',
      header: 'Event',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.isMainEvent && (
            <TrophyIcon className="w-4 h-4 text-yellow-500" title="Main Event" />
          )}
          <span className="font-medium">{row.original.name}</span>
          {row.original.consolidationType === 'PARENT' && (
            <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
              Multi-day
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'buyIn',
      header: 'Buy-in',
      cell: ({ getValue }) => {
        const val = getValue() as number;
        return val > 0 ? formatCurrency(val) : '-';
      },
    },
    {
      accessorKey: 'entries',
      header: 'Entries',
      cell: ({ getValue }) => (getValue() as number).toLocaleString(),
    },
    {
      accessorKey: 'prizepool',
      header: 'Prizepool',
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: 'profit',
      header: 'Profit',
      cell: ({ getValue }) => {
        const val = getValue() as number;
        return (
          <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatProfit(val)}
          </span>
        );
      },
    },
    {
      accessorKey: 'profitMargin',
      header: 'Margin',
      cell: ({ getValue }) => {
        const val = getValue() as number;
        return val ? `${val.toFixed(1)}%` : '-';
      },
    },
  ], []);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleEventClick = (event: EventRowData) => {
    navigate(`/series/game?gameId=${event.gameId}&seriesId=${seriesId}`);
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-500">Loading series details…</p>
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="text-center py-16">
        <TrophyIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Series Not Found</h2>
        <p className="text-gray-500 mb-4">{error || 'Unable to load series details'}</p>
        <Button onClick={() => navigate('/series')}>
          <ArrowLeftIcon className="w-4 h-4 mr-2" />
          Back to Series
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/series')}
            className="mb-2"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Back to Series
          </Button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <TrophyIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                {series.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-500">{series.year}</span>
                <StatusBadge status={series.status} />
                {series.venue && (
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <MapPinIcon className="w-3.5 h-3.5" />
                    {series.venue.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshMetrics}
            disabled={refreshing}
          >
            <ArrowPathIcon className={cx("w-4 h-4 mr-1", refreshing && "animate-spin")} />
            Refresh Metrics
          </Button>
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Metrics Summary */}
      {metrics ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="Events"
              value={metrics.totalEvents}
              subtitle={metrics.totalFlights > 0 ? `${metrics.totalFlights} flights` : undefined}
              icon={<CalendarIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Entries"
              value={metrics.totalEntries.toLocaleString()}
              subtitle={`Avg ${metrics.avgEntriesPerEvent?.toFixed(1) || 0}/event`}
              icon={<UserGroupIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Unique Players"
              value={metrics.totalUniquePlayers.toLocaleString()}
              icon={<UserGroupIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Prizepool"
              value={formatCurrency(metrics.totalPrizepool)}
              subtitle={`Avg ${formatCurrency(metrics.avgPrizepoolPerEvent || 0)}`}
              icon={<TrophyIcon className="w-5 h-5" />}
            />
            <MetricCard
              title="Profit"
              value={formatProfit(metrics.totalProfit)}
              subtitle={`Margin: ${metrics.profitMargin?.toFixed(1) || 0}%`}
              icon={<CurrencyDollarIcon className="w-5 h-5" />}
              className={metrics.totalProfit < 0 ? 'border-red-200' : ''}
            />
            <MetricCard
              title="Duration"
              value={metrics.seriesDurationDays ? `${metrics.seriesDurationDays} days` : '-'}
              subtitle={metrics.uniqueVenues > 1 ? `${metrics.uniqueVenues} venues` : undefined}
              icon={<ClockIcon className="w-5 h-5" />}
            />
          </div>

          {/* Health Badges */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-xs text-gray-500 mr-2">Profitability:</span>
                <ProfitabilityBadge profitability={metrics.profitability} />
              </div>
              <div>
                <span className="text-xs text-gray-500 mr-2">Consistency:</span>
                <ConsistencyBadge consistency={metrics.consistency} />
              </div>
              {metrics.mainEventCount > 0 && (
                <div>
                  <span className="text-xs text-gray-500 mr-2">Main Events:</span>
                  <span className="text-sm font-medium">
                    {metrics.mainEventCount} ({metrics.mainEventAvgEntries?.toFixed(0) || 0} avg entries)
                  </span>
                </div>
              )}
              <div className="ml-auto text-xs text-gray-400">
                Last calculated: {metrics.calculatedAt ? format(parseISO(metrics.calculatedAt), 'MMM d, yyyy h:mm a') : 'Never'}
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-8 text-center">
          <ChartBarIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No metrics available for this time range.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshMetrics}
            disabled={refreshing}
            className="mt-3"
          >
            <ArrowPathIcon className={cx("w-4 h-4 mr-1", refreshing && "animate-spin")} />
            Calculate Metrics
          </Button>
        </Card>
      )}

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entries Chart */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Entries by Event</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number) => [value.toLocaleString(), 'Entries']}
                  />
                  <Bar dataKey="entries" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Profit Chart */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Profit by Event</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(value: number) => [formatCurrency(value), 'Profit']}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    fill="#d1fae5"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Events Table */}
      <Card>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            Events ({eventRows.length})
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Click an event to view details and flight breakdown
          </p>
        </div>
        <div className="-mx-4 sm:-mx-6">
          <DataTable
            data={eventRows}
            columns={columns}
            onRowClick={handleEventClick}
          />
        </div>
      </Card>
    </div>
  );
}
