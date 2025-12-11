// src/pages/venues/VenueDetails.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Grid, Text, Metric } from '@tremor/react';
import {
  ArrowLeftIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
  BanknotesIcon,
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
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import { format, parseISO, startOfMonth } from 'date-fns';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';
import { useEntity } from '../../contexts/EntityContext';
import { getClient } from '../../utils/apiClient';
import { MetricCard } from '../../components/ui/MetricCard';
import { TimeRangeToggle } from '../../components/ui/TimeRangeToggle';
import { DataTable } from '../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';

// ---- Time range utilities ----

export type TimeRangeKey = 'ALL' | '12M' | '6M' | '3M' | '1M';

function getTimeRangeBounds(range: TimeRangeKey): { from: string | null; to: string | null } {
  const to = new Date();
  if (range === 'ALL') return { from: null, to: to.toISOString() };

  const months =
    range === '12M' ? 12 :
    range === '6M'  ? 6  :
    range === '3M'  ? 3  : 1;

  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ---- GraphQL Queries ----

const getVenueQuery = /* GraphQL */ `
  query GetVenue($id: ID!) {
    getVenue(id: $id) {
      id
      name
      address
      city
      country
      venueNumber
      aliases
      entityId
    }
  }
`;

const listGameFinancialSnapshotsWithGame = /* GraphQL */ `
  query ListGameFinancialSnapshotsWithGame(
    $filter: ModelGameFinancialSnapshotFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listGameFinancialSnapshots(filter: $filter, limit: $limit, nextToken: $nextToken) {
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
        game {
          id
          name
          gameStatus
          isRegular
          venueScheduleKey
          venueGameTypeKey
          buyIn
          gameType
          gameVariant
        }
      }
      nextToken
    }
  }
`;

// ---- Types ----

interface GameFinancialSnapshotWithGame {
  id: string;
  entityId?: string | null;
  venueId?: string | null;
  gameId?: string | null;
  gameStartDateTime?: string | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolTotal?: number | null;
  totalRevenue?: number | null;
  totalCost?: number | null;
  netProfit?: number | null;
  profitMargin?: number | null;
  gameType?: string | null;
  game?: {
    id: string;
    name?: string | null;
    gameStatus?: string | null;
    isRegular?: boolean | null;
    venueScheduleKey?: string | null;
    venueGameTypeKey?: string | null;
    buyIn?: number | null;
    gameType?: string | null;
    gameVariant?: string | null;
  } | null;
}

interface VenueInfo {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  venueNumber?: string | null;
  aliases?: string[] | null;
  entityId?: string | null;
}

interface ScheduleGroupStats {
  gameTypeKey: string;
  gameName: string;
  displayName: string;
  totalGames: number;
  totalEntries: number;
  totalRegistrations: number;
  totalPrizepool: number;
  totalProfit: number;
  avgProfit: number;
  trendData: { date: string; profit: number; games: number }[];
}

interface GameRowData {
  id: string;
  date: string;
  name: string;
  gameTypeKey: string;
  entries: number;
  registrations: number;
  prizepool: number;
  profit: number;
}

// ---- Helpers ----

function isValidGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  return (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    game.isRegular === true &&
    !!game.venueScheduleKey &&
    !!game.venueGameTypeKey
  );
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const absValue = Math.abs(value);
  const formatted = absValue.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });
  if (value < 0) {
    return `(-${formatted})`;
  }
  return formatted;
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  let formatted: string;
  if (absValue >= 1000) {
    formatted = `$${(absValue / 1000).toFixed(1)}k`;
  } else {
    formatted = `$${absValue.toFixed(0)}`;
  }
  
  return isNegative ? `(-${formatted})` : formatted;
}

function formatKeyToDisplayName(key: string): string {
  // Convert keys like "wednesday-50-turbo" to "Wednesday $50 Turbo"
  return key
    .split('-')
    .map((word) => {
      // Check if it's a number (likely a buy-in amount)
      if (/^\d+$/.test(word)) {
        return `$${word}`;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function getMonthKey(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    return format(startOfMonth(date), 'yyyy-MM');
  } catch {
    return 'unknown';
  }
}

function buildScheduleGroupStats(
  snapshots: GameFinancialSnapshotWithGame[]
): { scheduleStats: ScheduleGroupStats[]; globalStats: ScheduleGroupStats } {
  const statsByGameType = new Map<string, {
    gameName: string;
    latestGameDate: string;
    totalGames: number;
    totalEntries: number;
    totalRegistrations: number;
    totalPrizepool: number;
    totalProfit: number;
    snapshotsByMonth: Map<string, { profit: number; games: number }>;
  }>();

  for (const snap of snapshots) {
    const gameTypeKey = snap.game?.venueGameTypeKey;
    if (!gameTypeKey) continue;

    if (!statsByGameType.has(gameTypeKey)) {
      statsByGameType.set(gameTypeKey, {
        gameName: snap.game?.name ?? gameTypeKey,
        latestGameDate: snap.gameStartDateTime ?? '',
        totalGames: 0,
        totalEntries: 0,
        totalRegistrations: 0,
        totalPrizepool: 0,
        totalProfit: 0,
        snapshotsByMonth: new Map(),
      });
    }

    const s = statsByGameType.get(gameTypeKey)!;
    
    // Track the most recent game name
    if (snap.gameStartDateTime && snap.gameStartDateTime > s.latestGameDate) {
      s.latestGameDate = snap.gameStartDateTime;
      s.gameName = snap.game?.name ?? s.gameName;
    }
    
    s.totalGames += 1;
    s.totalEntries += snap.totalEntries ?? 0;
    s.totalRegistrations += snap.totalUniquePlayers ?? 0;
    s.totalPrizepool += snap.prizepoolTotal ?? 0;
    s.totalProfit += snap.netProfit ?? 0;

    // Build trend data by month
    if (snap.gameStartDateTime) {
      const monthKey = getMonthKey(snap.gameStartDateTime);
      const monthData = s.snapshotsByMonth.get(monthKey) ?? { profit: 0, games: 0 };
      monthData.profit += snap.netProfit ?? 0;
      monthData.games += 1;
      s.snapshotsByMonth.set(monthKey, monthData);
    }
  }

  const scheduleStats: ScheduleGroupStats[] = Array.from(statsByGameType.entries())
    .map(([gameTypeKey, data]) => {
      // Convert month map to sorted trend array
      const trendData = Array.from(data.snapshotsByMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date,
          profit: values.profit,
          games: values.games,
        }));

      return {
        gameTypeKey,
        gameName: data.gameName,
        displayName: data.gameName,
        totalGames: data.totalGames,
        totalEntries: data.totalEntries,
        totalRegistrations: data.totalRegistrations,
        totalPrizepool: data.totalPrizepool,
        totalProfit: data.totalProfit,
        avgProfit: data.totalGames > 0 ? data.totalProfit / data.totalGames : 0,
        trendData,
      };
    })
    .sort((a, b) => b.totalProfit - a.totalProfit); // Sort by profit descending

  // Calculate global stats
  const globalStats: ScheduleGroupStats = scheduleStats.reduce(
    (acc, s) => ({
      ...acc,
      totalGames: acc.totalGames + s.totalGames,
      totalEntries: acc.totalEntries + s.totalEntries,
      totalRegistrations: acc.totalRegistrations + s.totalRegistrations,
      totalPrizepool: acc.totalPrizepool + s.totalPrizepool,
      totalProfit: acc.totalProfit + s.totalProfit,
    }),
    {
      gameTypeKey: 'GLOBAL',
      gameName: 'All Games',
      displayName: 'All Games',
      totalGames: 0,
      totalEntries: 0,
      totalRegistrations: 0,
      totalPrizepool: 0,
      totalProfit: 0,
      avgProfit: 0,
      trendData: [],
    }
  );
  globalStats.avgProfit = globalStats.totalGames > 0 
    ? globalStats.totalProfit / globalStats.totalGames 
    : 0;

  return { scheduleStats, globalStats };
}

function buildOverallTrendData(
  snapshots: GameFinancialSnapshotWithGame[]
): { date: string; profit: number; prizepool: number; entries: number; games: number }[] {
  const byMonth = new Map<string, { profit: number; prizepool: number; entries: number; games: number }>();

  for (const snap of snapshots) {
    if (!snap.gameStartDateTime) continue;
    const monthKey = getMonthKey(snap.gameStartDateTime);
    const existing = byMonth.get(monthKey) ?? { profit: 0, prizepool: 0, entries: 0, games: 0 };
    existing.profit += snap.netProfit ?? 0;
    existing.prizepool += snap.prizepoolTotal ?? 0;
    existing.entries += snap.totalEntries ?? 0;
    existing.games += 1;
    byMonth.set(monthKey, existing);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      ...values,
    }));
}

function buildGameRowData(snapshots: GameFinancialSnapshotWithGame[]): GameRowData[] {
  return snapshots
    .filter((s) => s.gameStartDateTime && s.game)
    .sort((a, b) => {
      const dateA = a.gameStartDateTime ? new Date(a.gameStartDateTime).getTime() : 0;
      const dateB = b.gameStartDateTime ? new Date(b.gameStartDateTime).getTime() : 0;
      return dateB - dateA; // Newest first
    })
    .map((snap) => ({
      id: snap.id,
      date: snap.gameStartDateTime!,
      name: snap.game?.name ?? 'Unknown Game',
      gameTypeKey: snap.game?.venueGameTypeKey ?? '-',
      entries: snap.totalEntries ?? 0,
      registrations: snap.totalUniquePlayers ?? 0,
      prizepool: snap.prizepoolTotal ?? 0,
      profit: snap.netProfit ?? 0,
    }));
}

// ---- Sparkline Component ----

interface SparklineProps {
  data: { date: string; profit: number }[];
  width?: number;
  height?: number;
}

function Sparkline({ data, width = 100, height = 32 }: SparklineProps) {
  if (data.length < 2) {
    return <div className="text-xs text-gray-400 italic">Not enough data</div>;
  }

  const lastValue = data[data.length - 1]?.profit ?? 0;
  const prevValue = data[data.length - 2]?.profit ?? 0;
  const isPositiveTrend = lastValue >= prevValue;

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id="sparklineGradientPositive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="sparklineGradientNegative" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="profit"
          stroke={isPositiveTrend ? '#3b82f6' : '#ef4444'}
          strokeWidth={1.5}
          fill={isPositiveTrend ? 'url(#sparklineGradientPositive)' : 'url(#sparklineGradientNegative)'}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Game Schedule Card Component ----

interface ScheduleCardProps {
  schedule: ScheduleGroupStats;
  onClick: () => void;
}

function ScheduleCard({ schedule, onClick }: ScheduleCardProps) {
  const profitColor = schedule.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600';
  const avgProfitColor = schedule.avgProfit >= 0 ? 'text-blue-600' : 'text-red-600';

  return (
    <Card 
      className="hover:shadow-md transition cursor-pointer"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <Text className="text-xs uppercase tracking-wide text-gray-400">
            Recurring Game
          </Text>
          <Text className="text-sm font-semibold text-gray-900 truncate" title={schedule.gameName}>
            {schedule.gameName}
          </Text>
        </div>
        <div className="ml-2 flex-shrink-0">
          <Sparkline data={schedule.trendData} width={80} height={28} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-xs">
        <span className="text-gray-500">Games</span>
        <span className="text-right font-semibold">
          {schedule.totalGames.toLocaleString()}
        </span>

        <span className="text-gray-500">Registrations</span>
        <span className="text-right font-semibold">
          {schedule.totalRegistrations.toLocaleString()}
        </span>

        <span className="text-gray-500">Entries</span>
        <span className="text-right font-semibold">
          {schedule.totalEntries.toLocaleString()}
        </span>

        <span className="text-gray-500">Prizepool</span>
        <span className="text-right font-semibold">
          {formatCurrency(schedule.totalPrizepool)}
        </span>

        <span className="text-gray-500">Total Profit</span>
        <span className={`text-right font-semibold ${profitColor}`}>
          {formatCurrency(schedule.totalProfit)}
        </span>

        <span className="text-gray-500">Avg Profit/Game</span>
        <span className={`text-right font-semibold ${avgProfitColor}`}>
          {formatCurrency(schedule.avgProfit)}
        </span>
      </div>
    </Card>
  );
}

// ---- Profit Trend Chart Component ----

interface ProfitTrendChartProps {
  data: { date: string; profit: number; prizepool: number; entries: number; games: number }[];
}

function ProfitTrendChart({ data }: ProfitTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        No trend data available
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    try {
      return format(parseISO(dateStr + '-01'), 'MMM yy');
    } catch {
      return dateStr;
    }
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
        />
        <YAxis
          tickFormatter={(value) => formatCompactCurrency(value)}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === 'profit') return [formatCurrency(value), 'Net Profit'];
            if (name === 'prizepool') return [formatCurrency(value), 'Prizepool'];
            if (name === 'entries') return [value, 'Entries'];
            if (name === 'games') return [value, 'Games'];
            return [value, name];
          }}
          labelFormatter={(label) => {
            try {
              return format(parseISO(label + '-01'), 'MMMM yyyy');
            } catch {
              return label;
            }
          }}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Bar
          dataKey="profit"
          fill="#6366f1"
          radius={[4, 4, 0, 0]}
          name="profit"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Main Component ----

const PAGE_LIMIT = 500;

export const VenueDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedEntities, loading: entityLoading } = useEntity();

  // Get venueId from URL params (standardized parameter name)
  const venueId = searchParams.get('venueId');
  const entityId: string | undefined = selectedEntities[0]?.id;

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'analytics'>('overview');

  // Fetch venue info and financial snapshots
  useEffect(() => {
    if (!venueId) {
      setError('No venue ID provided');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();

        // 1) Fetch venue details
        const venueRes = await client.graphql({
          query: getVenueQuery,
          variables: { id: venueId },
        }) as any;

        const venueData = venueRes?.data?.getVenue;
        if (!venueData) {
          setError('Venue not found');
          setLoading(false);
          return;
        }

        setVenue(venueData);

        // 2) Fetch GameFinancialSnapshots for this venue + time range
        const { from, to } = getTimeRangeBounds(timeRange);
        const allSnapshots: GameFinancialSnapshotWithGame[] = [];
        let nextToken: string | null | undefined = null;

        // Build filter for venue + optional entity + date range
        const baseFilter: any = {
          venueId: { eq: venueId },
        };

        // If entity context is active and matches venue's entity, add entity filter
        if (entityId && venueData.entityId === entityId) {
          baseFilter.entityId = { eq: entityId };
        }

        if (from && to) {
          baseFilter.gameStartDateTime = { between: [from, to] };
        }

        do {
          const snapRes = await client.graphql({
            query: listGameFinancialSnapshotsWithGame,
            variables: {
              filter: baseFilter,
              limit: PAGE_LIMIT,
              nextToken,
            },
          }) as any;

          const page = snapRes?.data?.listGameFinancialSnapshots;

          if (snapRes?.errors?.length) {
            console.warn('GraphQL returned partial data with errors:', snapRes.errors.length, 'errors');
          }

          const pageItems =
            page?.items?.filter((s: GameFinancialSnapshotWithGame | null) => s != null) ?? [];

          allSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
          nextToken = page?.nextToken ?? null;
        } while (nextToken);

        // Filter to only valid game snapshots (FINISHED, isRegular, has schedule keys)
        const validSnapshots = allSnapshots.filter(isValidGameSnapshot);

        console.log(
          `[VenueDetails] Loaded ${allSnapshots.length} snapshots, ${validSnapshots.length} valid after filtering`
        );

        setSnapshots(validSnapshots);
      } catch (err: any) {
        console.error('Error loading venue details:', err);
        setError(err?.message ?? 'Failed to load venue details');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [venueId, entityId, timeRange]);

  // Compute aggregated stats
  const { scheduleStats, globalStats } = useMemo(
    () => buildScheduleGroupStats(snapshots),
    [snapshots]
  );

  const trendData = useMemo(() => buildOverallTrendData(snapshots), [snapshots]);

  const gameRows = useMemo(() => buildGameRowData(snapshots), [snapshots]);

  // Table columns
  const columns = useMemo<ColumnDef<GameRowData>[]>(
    () => [
      {
        header: 'Date',
        accessorKey: 'date',
        cell: ({ row }) => {
          try {
            return format(parseISO(row.original.date), 'dd MMM yyyy');
          } catch {
            return '-';
          }
        },
      },
      {
        header: 'Game',
        accessorKey: 'name',
        cell: ({ row }) => (
          <span className="font-medium" title={row.original.name}>
            {row.original.name.length > 35
              ? row.original.name.substring(0, 35) + '...'
              : row.original.name}
          </span>
        ),
      },
      {
        header: 'Game Type',
        accessorKey: 'gameTypeKey',
        cell: ({ row }) => (
          <span className="text-gray-600 text-xs">
            {formatKeyToDisplayName(row.original.gameTypeKey)}
          </span>
        ),
      },
      {
        header: 'Registrations',
        accessorKey: 'registrations',
        cell: ({ row }) => row.original.registrations.toLocaleString(),
      },
      {
        header: 'Entries',
        accessorKey: 'entries',
        cell: ({ row }) => row.original.entries.toLocaleString(),
      },
      {
        header: 'Prizepool',
        accessorKey: 'prizepool',
        cell: ({ row }) => formatCurrency(row.original.prizepool),
      },
      {
        header: 'Profit',
        accessorKey: 'profit',
        cell: ({ row }) => {
          const profit = row.original.profit;
          const color = profit >= 0 ? 'text-blue-600' : 'text-red-600';
          return <span className={`font-semibold ${color}`}>{formatCurrency(profit)}</span>;
        },
      },
    ],
    []
  );

  // Loading state
  if (entityLoading || loading) {
    return (
      <PageWrapper title="Venue Details">
        <div className="py-20 text-center text-gray-400">
          Loading venue details…
        </div>
      </PageWrapper>
    );
  }

  // Error state
  if (error || !venue) {
    return (
      <PageWrapper title="Venue Details">
        <Card className="border-red-200 bg-red-50">
          <Text className="text-sm text-red-700">{error || 'Venue not found'}</Text>
          <button
            onClick={() => navigate('/venues/dashboard')}
            className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Venues Dashboard
          </button>
        </Card>
      </PageWrapper>
    );
  }

  const profitColor = globalStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600';

  return (
    <PageWrapper
      title={venue.name}
      actions={
        <div className="flex items-center gap-4">
          <MultiEntitySelector />
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      }
    >
      {/* Back Navigation */}
      <button
        onClick={() => navigate('/venues/dashboard')}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Dashboard
      </button>

      {/* Venue Header */}
      <Card className="mb-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-14 w-14 rounded-lg bg-indigo-100 flex items-center justify-center">
              <BuildingOffice2Icon className="h-8 w-8 text-indigo-600" />
            </div>
          </div>
          <div className="ml-5 flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              {venue.name}
              {venue.venueNumber && (
                <span className="ml-2 text-base text-gray-500">
                  (#{venue.venueNumber})
                </span>
              )}
            </h2>
            <div className="mt-1 flex items-center text-sm text-gray-600">
              <MapPinIcon className="h-4 w-4 mr-1" />
              {venue.address && <span>{venue.address}, </span>}
              {venue.city && <span>{venue.city}, </span>}
              {venue.country && <span>{venue.country}</span>}
              {!venue.address && !venue.city && !venue.country && (
                <span className="text-gray-400">No address information</span>
              )}
            </div>
            {venue.aliases && venue.aliases.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                Also known as: {venue.aliases.join(', ')}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Summary Metric Cards */}
      <Grid numItemsSm={2} numItemsLg={5} className="gap-4 mb-6">
        <MetricCard
          label="Total Games"
          value={globalStats.totalGames.toLocaleString()}
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Registrations"
          value={globalStats.totalRegistrations.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Entries"
          value={globalStats.totalEntries.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Prizepool"
          value={formatCurrency(globalStats.totalPrizepool)}
          icon={<TrophyIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Profit"
          value={formatCurrency(globalStats.totalProfit)}
          icon={<BanknotesIcon className="h-6 w-6" />}
          secondary={`Avg ${formatCurrency(globalStats.avgProfit)}/game`}
        />
      </Grid>

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'games', label: 'Game History' },
              { id: 'analytics', label: 'Analytics' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Profit Trend Chart */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <ChartBarIcon className="h-5 w-5 mr-2 text-gray-400" />
                  Profit Trend
                </h3>
                <Card>
                  <ProfitTrendChart data={trendData} />
                </Card>
              </div>

              {/* Schedule/Game Type Cards */}
              <div>
                <Text className="mb-3 text-xs font-semibold uppercase text-gray-500">
                  Recurring Games ({scheduleStats.length})
                </Text>

                <Grid numItemsSm={1} numItemsMd={2} numItemsLg={3} className="gap-4">
                  {scheduleStats.map((schedule) => (
                    <ScheduleCard 
                      key={schedule.gameTypeKey} 
                      schedule={schedule}
                      onClick={() => navigate(
                        `/venues/game?venueId=${venue.id}&gameTypeKey=${encodeURIComponent(schedule.gameTypeKey)}`
                      )}
                    />
                  ))}

                  {scheduleStats.length === 0 && (
                    <Text className="col-span-full text-sm text-gray-400 text-center py-8">
                      No recurring game data available for the selected time range.
                    </Text>
                  )}
                </Grid>
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Game History ({gameRows.length} games)
              </h3>
              <DataTable<GameRowData> data={gameRows} columns={columns} />
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <Text className="text-xs uppercase tracking-wide text-gray-500">
                    Total Revenue Generated
                  </Text>
                  <Metric className="mt-1">
                    {formatCurrency(globalStats.totalPrizepool + globalStats.totalProfit)}
                  </Metric>
                  <Text className="mt-1 text-xs text-gray-400">
                    Prizepool + Profit
                  </Text>
                </Card>

                <Card>
                  <Text className="text-xs uppercase tracking-wide text-gray-500">
                    Average Entries per Game
                  </Text>
                  <Metric className="mt-1">
                    {globalStats.totalGames > 0
                      ? (globalStats.totalEntries / globalStats.totalGames).toFixed(1)
                      : '0'}
                  </Metric>
                </Card>

                <Card>
                  <Text className="text-xs uppercase tracking-wide text-gray-500">
                    Profit Margin
                  </Text>
                  <Metric className={`mt-1 ${profitColor}`}>
                    {globalStats.totalPrizepool > 0
                      ? ((globalStats.totalProfit / (globalStats.totalPrizepool + globalStats.totalProfit)) * 100).toFixed(1)
                      : '0'}%
                  </Metric>
                </Card>
              </div>

              {/* Game Type Performance Breakdown */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Performance by Recurring Game
                </h3>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            Game Schedule
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                            Games
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                            Avg Entries
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                            Total Prizepool
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                            Total Profit
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                            Avg Profit/Game
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {scheduleStats.map((s) => {
                          const avgEntries = s.totalGames > 0 ? s.totalEntries / s.totalGames : 0;
                          const profitTextColor = s.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600';
                          const avgProfitColor = s.avgProfit >= 0 ? 'text-blue-600' : 'text-red-600';

                          return (
                            <tr key={s.gameTypeKey} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-medium">{s.displayName}</td>
                              <td className="px-4 py-2 text-right">{s.totalGames}</td>
                              <td className="px-4 py-2 text-right">{avgEntries.toFixed(1)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(s.totalPrizepool)}</td>
                              <td className={`px-4 py-2 text-right font-semibold ${profitTextColor}`}>
                                {formatCurrency(s.totalProfit)}
                              </td>
                              <td className={`px-4 py-2 text-right font-semibold ${avgProfitColor}`}>
                                {formatCurrency(s.avgProfit)}
                              </td>
                            </tr>
                          );
                        })}

                        {scheduleStats.length === 0 && (
                          <tr>
                            <td
                              className="px-4 py-6 text-center text-sm text-gray-500"
                              colSpan={6}
                            >
                              No data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>

              {/* Entries Trend */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Entries Trend Over Time
                </h3>
                <Card>
                  {trendData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => {
                            try {
                              return format(parseISO(d + '-01'), 'MMM yy');
                            } catch {
                              return d;
                            }
                          }}
                          tick={{ fontSize: 12 }}
                          stroke="#9ca3af"
                        />
                        <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                        <Tooltip
                          formatter={(value: number) => [value, 'Total Entries']}
                          labelFormatter={(label) => {
                            try {
                              return format(parseISO(label + '-01'), 'MMMM yyyy');
                            } catch {
                              return label;
                            }
                          }}
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="entries"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-gray-400">
                      No trend data available
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default VenueDetails;