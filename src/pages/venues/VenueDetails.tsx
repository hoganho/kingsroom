// src/pages/venues/VenueDetails.tsx
// VERSION: 2.4.0 - Fixed non-SUPER_ADMIN users to only see REGULAR game stats
//
// CHANGELOG:
// - v2.4.0: Non-SUPER_ADMIN users now properly locked to REGULAR game stats only
//           - seriesType state is forced to 'REGULAR' for non-SUPER_ADMIN
//           - Series type filter hidden for non-SUPER_ADMIN
// - v2.3.0: Added Tournament ID column to game history table and ad-hoc games table
//           Column appears between Date and Game (name)
// - v2.2.0: Ad-hoc games now displayed in full table format (matching VenueGameDetails)
//           Added clickable rows to navigate to GameDetails
//           Added buyIn, revenue, cost, profitMargin columns
//           Summary stats now include 5 metrics (Games, Entries, Prizepool, Profit, Avg Profit)
// - v2.1.0: Added ad-hoc games support (isSeries=false AND isRegular=false)
//           Game history table now shows both recurring and ad-hoc games
//           Overview tab shows separate ad-hoc games section with stats
//           Added game type filter toggle (All/Recurring/Ad-hoc)
//           Added game classification badges in table
// - v2.0.0: Now uses VenueMetrics for summary cards (matches VenuesDashboard)
//           Added seriesType selector for SUPER_ADMIN users
//           Game history table still shows detailed recurring game data
// - v1.x.x: Used GameFinancialSnapshot with strict filtering (caused mismatch)
//
// FIX: Previously, VenueDetails showed different "Total Games" than VenuesDashboard
// because it used stricter filtering (isRegular=true, gameStatus=FINISHED, etc.)
// Now summary cards use VenueMetrics (same source as VenuesDashboard) for consistency.

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Grid, Text, Metric } from '@tremor/react';
import {
  ArrowLeftIcon,
  MapPinIcon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
  BanknotesIcon,
  ChartBarIcon,
  Squares2X2Icon,
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
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { getClient } from '../../utils/apiClient';
import { MetricCard } from '../../components/ui/MetricCard';
import { TimeRangeToggle } from '../../components/ui/TimeRangeToggle';
import { DataTable } from '../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';

// ============================================
// TYPES
// ============================================

export type TimeRangeKey = 'ALL' | '12M' | '6M' | '3M' | '1M';
type SeriesTypeKey = 'ALL' | 'REGULAR' | 'SERIES';

const SERIES_TYPE_OPTIONS: { key: SeriesTypeKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'ALL', label: 'All Games', icon: <Squares2X2Icon className="w-4 h-4" />, color: 'indigo' },
  { key: 'REGULAR', label: 'Regular', icon: <CalendarIcon className="w-4 h-4" />, color: 'blue' },
  { key: 'SERIES', label: 'Series', icon: <TrophyIcon className="w-4 h-4" />, color: 'purple' }
];

interface VenueMetrics {
  id: string;
  entityId: string;
  venueId: string;
  venueName: string;
  timeRange: string;
  seriesType: string;
  
  totalGames: number;
  totalSeriesGames: number;
  totalRegularGames: number;
  totalRecurringGames: number;
  totalOneOffGames: number;
  totalActiveRecurringGameTypes: number;
  totalActiveTournamentSeries: number;
  
  totalEntries: number;
  totalUniquePlayers: number;
  
  totalPrizepool: number;
  totalRevenue: number;
  totalProfit: number;
  
  avgEntriesPerGame: number;
  avgPrizepoolPerGame: number;
  avgProfitPerGame: number;
  
  firstGameDate: string | null;
  latestGameDate: string | null;
  daysSinceLastGame: number | null;
  
  calculatedAt: string;
}

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
  isSeries?: boolean | null;
  game?: {
    id: string;
    name?: string | null;
    gameStatus?: string | null;
    isRegular?: boolean | null;
    isSeries?: boolean | null;
    venueScheduleKey?: string | null;
    venueGameTypeKey?: string | null;
    buyIn?: number | null;
    gameType?: string | null;
    gameVariant?: string | null;
    tournamentId?: string | null;
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
  logo?: string | null;
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
  classification: GameClassification;
  gameId: string;
  // Additional fields for detailed display (matching VenueGameDetails)
  buyIn: number;
  revenue: number;
  cost: number;
  profitMargin: number | null;
  tournamentId: string | null;
}

// ============================================
// TIME RANGE UTILITIES
// ============================================

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

// ============================================
// GRAPHQL QUERIES
// ============================================

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
      logo
    }
  }
`;

// NEW: Query VenueMetrics for summary cards (matches VenuesDashboard)
const getVenueMetricsQuery = /* GraphQL */ `
  query GetVenueMetrics($id: ID!) {
    getVenueMetrics(id: $id) {
      id
      entityId
      venueId
      venueName
      timeRange
      seriesType
      
      totalGames
      totalSeriesGames
      totalRegularGames
      totalRecurringGames
      totalOneOffGames
      totalActiveRecurringGameTypes
      totalActiveTournamentSeries
      
      totalEntries
      totalUniquePlayers
      
      totalPrizepool
      totalRevenue
      totalProfit
      
      avgEntriesPerGame
      avgPrizepoolPerGame
      avgProfitPerGame
      
      firstGameDate
      latestGameDate
      daysSinceLastGame
      
      calculatedAt
    }
  }
`;

// Existing query for game history table (with isSeries field added)
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
        isSeries
        game {
          id
          name
          gameStatus
          isRegular
          isSeries
          venueScheduleKey
          venueGameTypeKey
          buyIn
          gameType
          gameVariant
          tournamentId
        }
      }
      nextToken
    }
  }
`;

// ============================================
// HELPERS
// ============================================

/**
 * Game classification types
 */
type GameClassification = 'RECURRING' | 'AD_HOC' | 'SERIES' | 'UNKNOWN';

/**
 * Classify a game based on isSeries and isRegular flags
 */
function classifyGame(snapshot: GameFinancialSnapshotWithGame): GameClassification {
  const game = snapshot.game;
  const isSeries = snapshot.isSeries === true || game?.isSeries === true;
  const isRegular = game?.isRegular === true;
  
  if (isSeries) return 'SERIES';
  if (isRegular) return 'RECURRING';
  // Ad-hoc: isSeries=false AND isRegular=false (or null)
  if (!isSeries && !isRegular) return 'AD_HOC';
  return 'UNKNOWN';
}

/**
 * Filter for recurring games - games with isRegular=true and proper metadata
 */
function isValidRecurringGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  // Exclude NOT_PUBLISHED games
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    return false;
  }
  
  return (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    game.isRegular === true &&
    !!game.venueScheduleKey &&
    !!game.venueGameTypeKey
  );
}

/**
 * Filter for ad-hoc games - games where isSeries=false AND isRegular=false
 */
function isValidAdHocGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  // Exclude NOT_PUBLISHED games
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    return false;
  }
  
  const isSeries = snapshot.isSeries === true || game?.isSeries === true;
  const isRegular = game?.isRegular === true;
  
  return (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    !isSeries &&
    !isRegular
  );
}

/**
 * Filter for all valid games (recurring + ad-hoc, excluding series)
 */
function isValidRegularGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  return isValidRecurringGameSnapshot(snapshot) || isValidAdHocGameSnapshot(snapshot);
}

/**
 * Filter snapshots by seriesType (matches refreshAllMetrics logic)
 */
function filterSnapshotsBySeriesType(
  snapshots: GameFinancialSnapshotWithGame[], 
  seriesType: SeriesTypeKey
): GameFinancialSnapshotWithGame[] {
  switch (seriesType) {
    case 'ALL':
      return snapshots;
    case 'SERIES':
      return snapshots.filter(s => s.isSeries === true || s.game?.isSeries === true);
    case 'REGULAR':
      return snapshots.filter(s => s.isSeries !== true && s.game?.isSeries !== true);
    default:
      return snapshots;
  }
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
  return key
    .split('-')
    .map((word) => {
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
    
    if (snap.gameStartDateTime && snap.gameStartDateTime > s.latestGameDate) {
      s.latestGameDate = snap.gameStartDateTime;
      s.gameName = snap.game?.name ?? s.gameName;
    }
    
    s.totalGames += 1;
    s.totalEntries += snap.totalEntries ?? 0;
    s.totalRegistrations += snap.totalUniquePlayers ?? 0;
    s.totalPrizepool += snap.prizepoolTotal ?? 0;
    s.totalProfit += snap.netProfit ?? 0;

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
    .sort((a, b) => b.totalProfit - a.totalProfit);

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
      return dateB - dateA;
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
      classification: classifyGame(snap),
      gameId: snap.gameId ?? snap.game?.id ?? '',
      // Additional fields for detailed display
      buyIn: snap.game?.buyIn ?? 0,
      revenue: snap.totalRevenue ?? 0,
      cost: snap.totalCost ?? 0,
      profitMargin: snap.profitMargin ?? null,
      tournamentId: snap.game?.tournamentId ?? null,
    }));
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Series Type Selector (matches VenuesDashboard)
interface SeriesTypeSelectorProps {
  value: SeriesTypeKey;
  onChange: (value: SeriesTypeKey) => void;
}

const SeriesTypeSelector: React.FC<SeriesTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {SERIES_TYPE_OPTIONS.map((option) => {
        const isActive = value === option.key;
        const colorStyles = {
          indigo: isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-indigo-600',
          blue: isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-blue-600',
          purple: isActive ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:text-purple-600'
        };
        
        return (
          <button
            key={option.key}
            onClick={() => onChange(option.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              colorStyles[option.color as keyof typeof colorStyles]
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

// Sparkline Component
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

// Schedule Card Component
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Text className="text-xs text-gray-500">Games</Text>
          <Metric className="text-lg">{schedule.totalGames}</Metric>
        </div>
        <div>
          <Text className="text-xs text-gray-500">Avg Profit</Text>
          <Metric className={`text-lg ${avgProfitColor}`}>
            {formatCompactCurrency(schedule.avgProfit)}
          </Metric>
        </div>
        <div>
          <Text className="text-xs text-gray-500">Entries</Text>
          <Metric className="text-lg">{schedule.totalEntries.toLocaleString()}</Metric>
        </div>
        <div>
          <Text className="text-xs text-gray-500">Total Profit</Text>
          <Metric className={`text-lg ${profitColor}`}>
            {formatCompactCurrency(schedule.totalProfit)}
          </Metric>
        </div>
      </div>
    </Card>
  );
}

// Profit Trend Chart
interface ProfitTrendChartProps {
  data: { date: string; profit: number; prizepool: number; entries: number; games: number }[];
}

function ProfitTrendChart({ data }: ProfitTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
        <YAxis
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12 }}
          stroke="#9ca3af"
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Profit']}
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

// ============================================
// MAIN COMPONENT
// ============================================

const PAGE_LIMIT = 500;

export const VenueDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedEntities, entities, loading: entityLoading } = useEntity();
  const { isSuperAdmin } = useUserPermissions();

  // Get venueId from URL params
  const venueId = searchParams.get('venueId');
  const entityId: string | undefined = selectedEntities[0]?.id;

  // State
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [seriesType, setSeriesType] = useState<SeriesTypeKey>('REGULAR'); // Default to REGULAR
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [venueMetrics, setVenueMetrics] = useState<VenueMetrics | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [recurringSnapshots, setRecurringSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [adHocSnapshots, setAdHocSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'analytics'>('overview');
  const [gameHistoryFilter, setGameHistoryFilter] = useState<'all' | 'recurring' | 'adhoc'>('all');

  // FIX v2.4.0: Ensure seriesType is always REGULAR for non-SUPER_ADMIN users
  // This effect runs when isSuperAdmin changes or when seriesType is set incorrectly
  useEffect(() => {
    if (!isSuperAdmin && seriesType !== 'REGULAR') {
      setSeriesType('REGULAR');
    }
  }, [isSuperAdmin, seriesType]);

  // Wrapper function to ensure non-SUPER_ADMIN users can't change seriesType
  const handleSeriesTypeChange = (newSeriesType: SeriesTypeKey) => {
    if (!isSuperAdmin) return; // Safety check
    setSeriesType(newSeriesType);
  };

  // Show entity selector only if user has more than 1 entity
  const showEntitySelector = entities && entities.length > 1;

  // Build VenueMetrics ID: {venueId}_{timeRange}_{seriesType}
  const venueMetricsId = useMemo(() => {
    if (!venueId) return null;
    return `${venueId}_${timeRange}_${seriesType}`;
  }, [venueId, timeRange, seriesType]);

  // Fetch venue info, metrics, and snapshots
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

        // 2) Fetch VenueMetrics for summary cards (NEW - matches VenuesDashboard)
        if (venueMetricsId) {
          try {
            const metricsRes = await client.graphql({
              query: getVenueMetricsQuery,
              variables: { id: venueMetricsId },
            }) as any;

            const metricsData = metricsRes?.data?.getVenueMetrics;
            if (metricsData) {
              setVenueMetrics(metricsData);
              console.log(`[VenueDetails] Loaded VenueMetrics: ${venueMetricsId}`, {
                totalGames: metricsData.totalGames,
                seriesType: metricsData.seriesType
              });
            } else {
              console.warn(`[VenueDetails] No VenueMetrics found for ${venueMetricsId}`);
              setVenueMetrics(null);
            }
          } catch (metricsErr) {
            console.warn('[VenueDetails] Error loading VenueMetrics:', metricsErr);
            setVenueMetrics(null);
          }
        }

        // 3) Fetch GameFinancialSnapshots for game history table
        const { from, to } = getTimeRangeBounds(timeRange);
        const fetchedSnapshots: GameFinancialSnapshotWithGame[] = [];
        let nextToken: string | null | undefined = null;

        const baseFilter: any = {
          venueId: { eq: venueId },
        };

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

          fetchedSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
          nextToken = page?.nextToken ?? null;
        } while (nextToken);

        // Filter snapshots by seriesType first
        const seriesFilteredSnapshots = filterSnapshotsBySeriesType(fetchedSnapshots, seriesType);
        
        // Separate into recurring and ad-hoc games
        const recurring = seriesFilteredSnapshots.filter(isValidRecurringGameSnapshot);
        const adHoc = seriesFilteredSnapshots.filter(isValidAdHocGameSnapshot);
        
        // All valid regular games (both recurring and ad-hoc)
        const allValid = seriesFilteredSnapshots.filter(isValidRegularGameSnapshot);

        console.log(
          `[VenueDetails] Loaded ${fetchedSnapshots.length} snapshots, ${seriesFilteredSnapshots.length} after seriesType filter`,
          `| ${recurring.length} recurring | ${adHoc.length} ad-hoc | ${allValid.length} total valid`
        );

        setAllSnapshots(allValid);
        setRecurringSnapshots(recurring);
        setAdHocSnapshots(adHoc);
      } catch (err: any) {
        console.error('Error loading venue details:', err);
        setError(err?.message ?? 'Failed to load venue details');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [venueId, entityId, timeRange, seriesType, venueMetricsId]);

  // Compute aggregated stats for recurring games (for overview)
  const { scheduleStats, globalStats: tableGlobalStats } = useMemo(
    () => buildScheduleGroupStats(recurringSnapshots),
    [recurringSnapshots]
  );

  const trendData = useMemo(() => buildOverallTrendData(allSnapshots), [allSnapshots]);

  // Game rows based on filter selection
  const gameRows = useMemo(() => {
    const snapshotsToShow = gameHistoryFilter === 'recurring' 
      ? recurringSnapshots 
      : gameHistoryFilter === 'adhoc' 
        ? adHocSnapshots 
        : allSnapshots;
    return buildGameRowData(snapshotsToShow);
  }, [allSnapshots, recurringSnapshots, adHocSnapshots, gameHistoryFilter]);

  // Ad-hoc game stats for the overview section
  const adHocStats = useMemo(() => {
    const adHocGames = buildGameRowData(adHocSnapshots);
    const totalProfit = adHocGames.reduce((sum, g) => sum + g.profit, 0);
    const totalPrizepool = adHocGames.reduce((sum, g) => sum + g.prizepool, 0);
    const totalEntries = adHocGames.reduce((sum, g) => sum + g.entries, 0);
    const totalRegistrations = adHocGames.reduce((sum, g) => sum + g.registrations, 0);
    const totalRevenue = adHocGames.reduce((sum, g) => sum + g.revenue, 0);
    const totalCost = adHocGames.reduce((sum, g) => sum + g.cost, 0);
    return {
      totalGames: adHocGames.length,
      totalProfit,
      totalPrizepool,
      totalEntries,
      totalRegistrations,
      totalRevenue,
      totalCost,
      avgProfit: adHocGames.length > 0 ? totalProfit / adHocGames.length : 0,
      avgEntries: adHocGames.length > 0 ? totalEntries / adHocGames.length : 0,
      games: adHocGames, // All games for the table
    };
  }, [adHocSnapshots]);

  // Handler for clicking on ad-hoc game name (navigates to GameDetails page)
  const handleAdHocGameClick = (gameId: string) => {
    navigate(`/games/details/${gameId}`);
  };

  // Handle row click to navigate to game details
  const handleGameRowClick = (row: GameRowData) => {
    if (!venue) return;
    
    // For recurring games with a schedule, navigate to the game type view
    if (row.classification === 'RECURRING' && row.gameTypeKey && row.gameTypeKey !== '-') {
      navigate(`/venues/game?venueId=${venue.id}&gameTypeKey=${encodeURIComponent(row.gameTypeKey)}`);
    } else if (row.gameId) {
      // For ad-hoc games or games without a schedule, navigate to the specific game
      navigate(`/games/${row.gameId}`);
    }
  };

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
        header: 'Tournament ID',
        accessorKey: 'tournamentId',
        cell: ({ row }) => (
          <span className="text-gray-500 font-mono text-xs">
            {row.original.tournamentId || '-'}
          </span>
        ),
      },
      {
        header: 'Type',
        accessorKey: 'classification',
        cell: ({ row }) => {
          const classification = row.original.classification;
          const styles = {
            RECURRING: 'bg-blue-100 text-blue-700',
            AD_HOC: 'bg-amber-100 text-amber-700',
            SERIES: 'bg-purple-100 text-purple-700',
            UNKNOWN: 'bg-gray-100 text-gray-600',
          };
          const labels = {
            RECURRING: 'Recurring',
            AD_HOC: 'Ad-hoc',
            SERIES: 'Series',
            UNKNOWN: 'Unknown',
          };
          return (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[classification]}`}>
              {labels[classification]}
            </span>
          );
        },
      },
      {
        header: 'Game',
        accessorKey: 'name',
        cell: ({ row }) => (
          <span className="font-medium text-indigo-600 hover:text-indigo-800" title={row.original.name}>
            {row.original.name.length > 35
              ? row.original.name.substring(0, 35) + '...'
              : row.original.name}
          </span>
        ),
      },
      {
        header: 'Schedule',
        accessorKey: 'gameTypeKey',
        cell: ({ row }) => {
          const key = row.original.gameTypeKey;
          if (!key || key === '-') {
            return <span className="text-gray-400 text-xs italic">None</span>;
          }
          return (
            <span className="text-gray-600 text-xs">
              {formatKeyToDisplayName(key)}
            </span>
          );
        },
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
            onClick={() => navigate('/venues')}
            className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Venues Dashboard
          </button>
        </Card>
      </PageWrapper>
    );
  }

  // Use VenueMetrics for summary cards (consistent with VenuesDashboard)
  // Fall back to table stats if metrics not available
  const summaryStats = venueMetrics ? {
    totalGames: venueMetrics.totalGames,
    totalRegistrations: venueMetrics.totalUniquePlayers,
    totalEntries: venueMetrics.totalEntries,
    totalPrizepool: venueMetrics.totalPrizepool,
    totalProfit: venueMetrics.totalProfit,
    avgProfit: venueMetrics.avgProfitPerGame || 0,
  } : {
    totalGames: tableGlobalStats.totalGames,
    totalRegistrations: tableGlobalStats.totalRegistrations,
    totalEntries: tableGlobalStats.totalEntries,
    totalPrizepool: tableGlobalStats.totalPrizepool,
    totalProfit: tableGlobalStats.totalProfit,
    avgProfit: tableGlobalStats.avgProfit,
  };

  const profitColor = summaryStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600';

  return (
    <PageWrapper title={venue.name}>
      {/* Back Navigation */}
      <button
        onClick={() => navigate('/venues')}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Dashboard
      </button>

      {/* Filters - Time Range and Series Type */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {showEntitySelector && (
            <div className="w-full sm:flex-1 sm:max-w-xs">
              <MultiEntitySelector />
            </div>
          )}
          {/* Series Type Selector - ONLY show for SUPER_ADMIN */}
          {isSuperAdmin && (
            <SeriesTypeSelector 
              value={seriesType} 
              onChange={handleSeriesTypeChange} 
            />
          )}
        </div>
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Venue Header */}
      <Card className="mb-6">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-14 w-14 relative">
            {venue.logo ? (
              <img
                src={venue.logo}
                alt={venue.name}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-xl font-medium">
                {venue.name.charAt(0)}
              </div>
            )}
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
          {/* Data source indicator */}
          <div className="text-right">
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              seriesType === 'ALL' ? 'bg-indigo-100 text-indigo-700' :
              seriesType === 'REGULAR' ? 'bg-blue-100 text-blue-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              {seriesType === 'ALL' ? 'All Games' : seriesType === 'REGULAR' ? 'Regular Games' : 'Series Games'}
            </span>
            {venueMetrics && (
              <p className="mt-1 text-xs text-gray-400">
                Updated {format(parseISO(venueMetrics.calculatedAt), 'MMM d, h:mm a')}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Summary Metric Cards - NOW USES VenueMetrics (matches VenuesDashboard) */}
      <Grid numItemsSm={2} numItemsLg={5} className="gap-4 mb-6">
        <MetricCard
          label="Total Games"
          value={summaryStats.totalGames.toLocaleString()}
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Registrations"
          value={summaryStats.totalRegistrations.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Entries"
          value={summaryStats.totalEntries.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Prizepool"
          value={formatCurrency(summaryStats.totalPrizepool)}
          icon={<TrophyIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Profit"
          value={formatCurrency(summaryStats.totalProfit)}
          icon={<BanknotesIcon className="h-6 w-6" />}
          secondary={`Avg ${formatCurrency(summaryStats.avgProfit)}/game`}
        />
      </Grid>

      {/* Info banner when VenueMetrics not available */}
      {!venueMetrics && (
        <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <strong>Note:</strong> Pre-calculated metrics not available for this filter combination. 
          Showing computed values from game history. Run "Refresh Metrics" to update.
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'games', label: `Game History (${gameRows.length})` },
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
                  Profit Trend (All Games)
                </h3>
                <Card>
                  <ProfitTrendChart data={trendData} />
                </Card>
              </div>

              {/* Recurring Games Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Text className="text-xs font-semibold uppercase text-gray-500">
                    Recurring Games ({scheduleStats.length} types, {recurringSnapshots.length} games)
                  </Text>
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    {formatCurrency(tableGlobalStats.totalProfit)} profit
                  </span>
                </div>

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
                      No recurring game data available for the selected filters.
                      {seriesType === 'SERIES' && ' Try switching to "Regular" or "All Games".'}
                    </Text>
                  )}
                </Grid>
              </div>

              {/* Ad-hoc Games Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Text className="text-xs font-semibold uppercase text-gray-500">
                    Ad-hoc Games ({adHocStats.totalGames} games)
                  </Text>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    adHocStats.totalProfit >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {formatCurrency(adHocStats.totalProfit)} profit
                  </span>
                </div>

                {adHocStats.totalGames > 0 ? (
                  <Card>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      <div>
                        <Text className="text-xs text-gray-500">Total Games</Text>
                        <Metric className="text-lg">{adHocStats.totalGames}</Metric>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Total Entries</Text>
                        <Metric className="text-lg">{adHocStats.totalEntries.toLocaleString()}</Metric>
                        <Text className="text-xs text-gray-400">Avg {adHocStats.avgEntries.toFixed(1)}/game</Text>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Total Prizepool</Text>
                        <Metric className="text-lg">{formatCompactCurrency(adHocStats.totalPrizepool)}</Metric>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Total Profit</Text>
                        <Metric className={`text-lg ${adHocStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {formatCompactCurrency(adHocStats.totalProfit)}
                        </Metric>
                      </div>
                      <div>
                        <Text className="text-xs text-gray-500">Avg Profit/Game</Text>
                        <Metric className={`text-lg ${adHocStats.avgProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {formatCompactCurrency(adHocStats.avgProfit)}
                        </Metric>
                      </div>
                    </div>

                    {/* Ad-hoc Games Table (matching VenueGameDetails style) */}
                    <div className="border-t border-gray-100 pt-4">
                      <Text className="text-xs text-gray-500 mb-3">Game History (click to view details)</Text>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Game</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy-in</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reg.</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Entries</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Prize</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rev</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Profit</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {adHocStats.games.map((game) => (
                              <tr
                                key={game.id}
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => handleAdHocGameClick(game.gameId)}
                              >
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                                  {(() => {
                                    try {
                                      return format(parseISO(game.date), 'dd MMM yyyy');
                                    } catch {
                                      return '-';
                                    }
                                  })()}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">
                                  {game.tournamentId || '-'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span
                                    className="font-medium text-indigo-600 hover:text-indigo-900 hover:underline"
                                    title={`View details for ${game.name}`}
                                  >
                                    {game.name.length > 35 ? game.name.substring(0, 35) + '...' : game.name}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatCurrency(game.buyIn)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{game.registrations.toLocaleString()}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{game.entries.toLocaleString()}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatCurrency(game.prizepool)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatCurrency(game.revenue)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatCurrency(game.cost)}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className={`font-semibold ${game.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                    {formatCurrency(game.profit)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {game.profitMargin !== null ? (
                                    <span className={game.profitMargin >= 0 ? 'text-blue-600' : 'text-red-600'}>
                                      {(game.profitMargin * 100).toFixed(1)}%
                                    </span>
                                  ) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {adHocStats.totalGames > 10 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <button 
                            onClick={() => {
                              setGameHistoryFilter('adhoc');
                              setActiveTab('games');
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            View all {adHocStats.totalGames} ad-hoc games in Game History tab →
                          </button>
                        </div>
                      )}
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <Text className="text-sm text-gray-400 text-center py-8">
                      No ad-hoc games recorded for the selected filters.
                    </Text>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === 'games' && (
            <div>
              {/* Header with filter toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Game History ({gameRows.length} games)
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {gameHistoryFilter === 'all' 
                      ? `Showing all finished games (${recurringSnapshots.length} recurring, ${adHocSnapshots.length} ad-hoc)`
                      : gameHistoryFilter === 'recurring'
                        ? 'Showing recurring games only'
                        : 'Showing ad-hoc games only'}
                  </p>
                </div>

                {/* Game type filter toggle */}
                <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => setGameHistoryFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      gameHistoryFilter === 'all' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-indigo-600'
                    }`}
                  >
                    All ({allSnapshots.length})
                  </button>
                  <button
                    onClick={() => setGameHistoryFilter('recurring')}
                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      gameHistoryFilter === 'recurring' 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-blue-600'
                    }`}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Recurring ({recurringSnapshots.length})
                  </button>
                  <button
                    onClick={() => setGameHistoryFilter('adhoc')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      gameHistoryFilter === 'adhoc' 
                        ? 'bg-amber-600 text-white shadow-sm' 
                        : 'text-gray-600 hover:text-amber-600'
                    }`}
                  >
                    Ad-hoc ({adHocSnapshots.length})
                  </button>
                </div>
              </div>

              <DataTable<GameRowData> 
                data={gameRows} 
                columns={columns} 
                onRowClick={handleGameRowClick}
              />
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
                    {formatCurrency(summaryStats.totalPrizepool + summaryStats.totalProfit)}
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
                    {summaryStats.totalGames > 0
                      ? (summaryStats.totalEntries / summaryStats.totalGames).toFixed(1)
                      : '0'}
                  </Metric>
                </Card>

                <Card>
                  <Text className="text-xs uppercase tracking-wide text-gray-500">
                    Profit Margin
                  </Text>
                  <Metric className={`mt-1 ${profitColor}`}>
                    {summaryStats.totalPrizepool > 0
                      ? ((summaryStats.totalProfit / (summaryStats.totalPrizepool + summaryStats.totalProfit)) * 100).toFixed(1)
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