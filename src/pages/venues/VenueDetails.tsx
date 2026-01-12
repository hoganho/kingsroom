// src/pages/venues/VenueDetails.tsx
// VERSION: 3.2.0 - Ad-hoc games expandable table
//
// CHANGELOG:
// - v3.2.0: Ad-hoc games section now uses expandable P/L table
//           - Same format as VenueGameDetails recurring games table
//           - STATUS column replaced with GAME NAME column (ad-hoc games have no status)
//           - Click row to expand details, click game name to navigate
//           - Added P/L bar chart for ad-hoc games
// - v3.1.0: Groups recurring games by day of week (Monday first)
// - v3.0.0: BREAKING - Groups by recurringGameId instead of venueGameTypeKey
// - v2.4.0: Non-SUPER_ADMIN users now properly locked to REGULAR game stats only

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
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import {
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

// UPDATED: Added recurringGameId and recurringGame to the game object
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
    // NEW: recurringGameId for proper grouping
    recurringGameId?: string | null;
    recurringGame?: {
      id: string;
      name?: string | null;
      dayOfWeek?: string | null;
    } | null;
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

// UPDATED: Changed from gameTypeKey to recurringGameId
interface ScheduleGroupStats {
  recurringGameId: string;
  recurringGameName: string;
  displayName: string;
  dayOfWeek: string | null;
  totalGames: number;
  totalEntries: number;
  totalRegistrations: number;
  totalPrizepool: number;
  totalProfit: number;
  avgProfit: number;
  trendData: { date: string; profit: number; games: number }[];
}

// UPDATED: Added recurringGameId
interface GameRowData {
  id: string;
  date: string;
  name: string;
  gameTypeKey: string; // Keep for display purposes
  recurringGameId: string | null; // NEW: for navigation
  recurringGameName: string | null; // NEW: for display
  entries: number;
  registrations: number;
  prizepool: number;
  profit: number;
  classification: GameClassification;
  gameId: string;
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

// Days of week ordered starting from Monday
const DAYS_OF_WEEK_ORDERED = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

type DayOfWeek = typeof DAYS_OF_WEEK_ORDERED[number];

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

// UPDATED: Added recurringGameId and recurringGame to the query
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
          recurringGameId
          recurringGame {
            id
            name
            dayOfWeek
          }
        }
      }
      nextToken
    }
  }
`;

// ============================================
// HELPERS
// ============================================

type GameClassification = 'RECURRING' | 'AD_HOC' | 'SERIES' | 'UNKNOWN';

/**
 * Classify a game based on isSeries and isRegular flags
 * UPDATED: Also considers recurringGameId presence
 */
function classifyGame(snapshot: GameFinancialSnapshotWithGame): GameClassification {
  const game = snapshot.game;
  const isSeries = snapshot.isSeries === true || game?.isSeries === true;
  const isRegular = game?.isRegular === true;
  const hasRecurringGame = !!game?.recurringGameId;
  
  if (isSeries) return 'SERIES';
  // A game is RECURRING if it has a recurringGameId OR isRegular=true with proper keys
  if (hasRecurringGame || (isRegular && game?.venueScheduleKey && game?.venueGameTypeKey)) return 'RECURRING';
  if (!isSeries && !isRegular) return 'AD_HOC';
  return 'UNKNOWN';
}

/**
 * Filter for recurring games - games with recurringGameId OR (isRegular=true and proper metadata)
 * UPDATED: Primary check is now recurringGameId
 */
function isValidRecurringGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    return false;
  }
  
  // Primary: Has a recurringGameId
  if (game?.recurringGameId) {
    return !!game && game.gameStatus === 'FINISHED';
  }
  
  // Fallback: Legacy check for isRegular with keys (for games not yet re-enriched)
  return (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    game.isRegular === true &&
    !!game.venueScheduleKey &&
    !!game.venueGameTypeKey
  );
}

/**
 * Filter for ad-hoc games - games where isSeries=false AND isRegular=false AND no recurringGameId
 */
function isValidAdHocGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  if (game?.gameStatus === 'NOT_PUBLISHED') {
    return false;
  }
  
  const isSeries = snapshot.isSeries === true || game?.isSeries === true;
  const isRegular = game?.isRegular === true;
  const hasRecurringGame = !!game?.recurringGameId;
  
  return (
    !!game &&
    game.gameStatus === 'FINISHED' &&
    !isSeries &&
    !isRegular &&
    !hasRecurringGame
  );
}

/**
 * Filter for all valid games (recurring + ad-hoc, excluding series)
 */
function isValidRegularGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  return isValidRecurringGameSnapshot(snapshot) || isValidAdHocGameSnapshot(snapshot);
}

/**
 * Filter snapshots by seriesType
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

function getMonthKey(dateStr: string): string {
  try {
    const date = parseISO(dateStr);
    return format(startOfMonth(date), 'yyyy-MM');
  } catch {
    return 'unknown';
  }
}

/**
 * UPDATED: Build schedule group stats - NOW GROUPS BY recurringGameId
 * 
 * This is the key change from v2.x - instead of grouping by the computed
 * venueGameTypeKey, we now group by the actual recurringGameId which
 * represents the true identity of the recurring game template.
 */
function buildScheduleGroupStats(
  snapshots: GameFinancialSnapshotWithGame[]
): { scheduleStats: ScheduleGroupStats[]; globalStats: ScheduleGroupStats } {
  const statsByRecurringGame = new Map<string, {
    recurringGameName: string;
    dayOfWeek: string | null;
    latestGameDate: string;
    totalGames: number;
    totalEntries: number;
    totalRegistrations: number;
    totalPrizepool: number;
    totalProfit: number;
    snapshotsByMonth: Map<string, { profit: number; games: number }>;
  }>();

  for (const snap of snapshots) {
    // CHANGED: Use recurringGameId as the grouping key
    const recurringGameId = snap.game?.recurringGameId;
    if (!recurringGameId) continue; // Skip games without a recurring game assignment

    if (!statsByRecurringGame.has(recurringGameId)) {
      statsByRecurringGame.set(recurringGameId, {
        // Use the recurringGame.name if available, otherwise fall back to game name
        recurringGameName: snap.game?.recurringGame?.name ?? snap.game?.name ?? recurringGameId,
        dayOfWeek: snap.game?.recurringGame?.dayOfWeek ?? null,
        latestGameDate: snap.gameStartDateTime ?? '',
        totalGames: 0,
        totalEntries: 0,
        totalRegistrations: 0,
        totalPrizepool: 0,
        totalProfit: 0,
        snapshotsByMonth: new Map(),
      });
    }

    const s = statsByRecurringGame.get(recurringGameId)!;
    
    // Update latest game info
    if (snap.gameStartDateTime && snap.gameStartDateTime > s.latestGameDate) {
      s.latestGameDate = snap.gameStartDateTime;
      // Update name from the most recent game's recurring game template
      if (snap.game?.recurringGame?.name) {
        s.recurringGameName = snap.game.recurringGame.name;
      }
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

  const scheduleStats: ScheduleGroupStats[] = Array.from(statsByRecurringGame.entries())
    .map(([recurringGameId, data]) => {
      const trendData = Array.from(data.snapshotsByMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date,
          profit: values.profit,
          games: values.games,
        }));

      return {
        recurringGameId,
        recurringGameName: data.recurringGameName,
        displayName: data.recurringGameName,
        dayOfWeek: data.dayOfWeek,
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
      recurringGameId: 'GLOBAL',
      recurringGameName: 'All Games',
      displayName: 'All Games',
      dayOfWeek: null,
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

// UPDATED: Added recurringGameId and recurringGameName to row data
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
      recurringGameId: snap.game?.recurringGameId ?? null,
      recurringGameName: snap.game?.recurringGame?.name ?? null,
      entries: snap.totalEntries ?? 0,
      registrations: snap.totalUniquePlayers ?? 0,
      prizepool: snap.prizepoolTotal ?? 0,
      profit: snap.netProfit ?? 0,
      classification: classifyGame(snap),
      gameId: snap.gameId ?? snap.game?.id ?? '',
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${colorStyles[option.color as keyof typeof colorStyles]}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

// UPDATED: ScheduleCard now uses recurringGameId
interface ScheduleCardProps {
  schedule: ScheduleGroupStats;
  onClick: () => void;
}

const ScheduleCard: React.FC<ScheduleCardProps> = ({ schedule, onClick }) => {
  const avgEntries = schedule.totalGames > 0 ? schedule.totalEntries / schedule.totalGames : 0;

  return (
    <div 
      className="flex-shrink-0 rounded-2xl shadow-sm border border-blue-200 overflow-hidden cursor-pointer hover:shadow-md hover:border-blue-300 transition-all bg-white"
      onClick={onClick}
    >
      {/* Card Header */}
      <div className="p-4 flex items-center gap-3 border-b border-blue-100 bg-blue-50/30">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate" title={schedule.displayName}>
            {schedule.displayName}
          </h3>
        </div>
        <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
          {schedule.totalGames} games
        </span>
      </div>

      {/* Card Body */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500">Entries</p>
          <p className="text-lg font-semibold text-gray-900">{schedule.totalEntries.toLocaleString()}</p>
          <p className="text-xs text-gray-400">avg {avgEntries.toFixed(1)}/game</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Prizepool</p>
          <p className="text-lg font-semibold text-gray-900">{formatCompactCurrency(schedule.totalPrizepool)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Profit</p>
          <p className={`text-lg font-semibold ${schedule.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCompactCurrency(schedule.totalProfit)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Profit</p>
          <p className={`text-lg font-semibold ${schedule.avgProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCompactCurrency(schedule.avgProfit)}
          </p>
        </div>
      </div>
    </div>
  );
};

const ProfitTrendChart: React.FC<{ data: { date: string; profit: number }[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        No trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
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
        <Area
          type="monotone"
          dataKey="profit"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#profitGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ============================================
// AD-HOC GAMES P/L BAR CHART
// ============================================

interface AdHocPLBarChartProps {
  games: GameRowData[];
}

const AdHocPLBarChart: React.FC<AdHocPLBarChartProps> = ({ games }) => {
  // Sort by date (oldest first for left-to-right timeline)
  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => a.date.localeCompare(b.date));
  }, [games]);

  // Calculate scale
  const maxProfit = Math.max(...sortedGames.map(d => d.profit), 0);
  const minProfit = Math.min(...sortedGames.map(d => d.profit), 0);
  const range = Math.max(Math.abs(maxProfit), Math.abs(minProfit)) || 1000;
  
  const chartHeight = 120;
  const barWidth = Math.max(4, Math.min(12, Math.floor(800 / sortedGames.length) - 2));
  const chartWidth = sortedGames.length * (barWidth + 2);
  const zeroLine = chartHeight / 2;

  if (sortedGames.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full" style={{ minWidth: Math.max(chartWidth, 300) }}>
        {/* Y-axis labels */}
        <div className="flex">
          <div className="w-16 flex flex-col justify-between text-xs text-gray-500 pr-2" style={{ height: chartHeight }}>
            <span>{formatCompactCurrency(range)}</span>
            <span>$0</span>
            <span>{formatCompactCurrency(-range)}</span>
          </div>
          
          {/* Chart area */}
          <div className="flex-1 relative" style={{ height: chartHeight }}>
            {/* Zero line */}
            <div 
              className="absolute left-0 right-0 border-t border-gray-300" 
              style={{ top: zeroLine }}
            />
            
            {/* Bars */}
            <div className="flex items-end h-full" style={{ paddingBottom: zeroLine }}>
              {sortedGames.map((d) => {
                const barHeight = Math.abs(d.profit) / range * (chartHeight / 2 - 4);
                const isPositive = d.profit >= 0;
                
                let displayDate = '';
                try {
                  displayDate = format(parseISO(d.date), 'dd MMM');
                } catch {
                  displayDate = '';
                }
                
                return (
                  <div 
                    key={d.id}
                    className="flex flex-col items-center group relative"
                    style={{ width: barWidth + 2 }}
                  >
                    {/* Bar for positive values */}
                    {isPositive && (
                      <div
                        className="rounded-t transition-all bg-blue-500 hover:bg-blue-600"
                        style={{ 
                          width: barWidth,
                          height: Math.max(2, barHeight),
                        }}
                        title={`${displayDate}: ${formatCurrency(d.profit)}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Negative bars (rendered separately below zero line) */}
            <div 
              className="absolute left-0 flex" 
              style={{ top: zeroLine }}
            >
              {sortedGames.map((d) => {
                const barHeight = Math.abs(d.profit) / range * (chartHeight / 2 - 4);
                const isNegative = d.profit < 0;
                
                let displayDate = '';
                try {
                  displayDate = format(parseISO(d.date), 'dd MMM');
                } catch {
                  displayDate = '';
                }
                
                return (
                  <div 
                    key={`neg-${d.id}`}
                    className="flex flex-col items-center"
                    style={{ width: barWidth + 2 }}
                  >
                    {isNegative && (
                      <div
                        className="rounded-b transition-all bg-red-500 hover:bg-red-600"
                        style={{ 
                          width: barWidth,
                          height: Math.max(2, barHeight),
                        }}
                        title={`${displayDate}: ${formatCurrency(d.profit)}`}
                      />
                    )}
                    {/* Empty space for positive bars */}
                    {!isNegative && (
                      <div style={{ width: barWidth, height: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded" />
            <span>Profit</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span>Loss</span>
          </div>
          <span className="ml-auto">← Oldest to Newest →</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// AD-HOC GAMES P/L ROW COMPONENT
// ============================================

interface AdHocPLRowProps {
  game: GameRowData;
  onNavigate: (gameId: string) => void;
}

const AdHocPLRow: React.FC<AdHocPLRowProps> = ({ game, onNavigate }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRowClick = () => {
    setIsExpanded(!isExpanded);
  };

  const handleNavigateToGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate(game.gameId);
  };

  // Format date
  let displayDate = '-';
  try {
    displayDate = format(parseISO(game.date), 'dd-MMM-yy');
  } catch {
    displayDate = '-';
  }

  const profitColorClass = game.profit >= 0 ? 'text-blue-600' : 'text-red-600';
  const marginColorClass = game.profitMargin !== null && game.profitMargin >= 0 ? 'text-blue-600' : 'text-red-600';

  return (
    <>
      {/* Main Row */}
      <tr
        className="border-b border-gray-100 transition-colors hover:bg-gray-50 cursor-pointer"
        onClick={handleRowClick}
      >
        {/* Expand Toggle */}
        <td className="px-3 py-3 w-10">
          <span className="p-1">
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-500" />
            )}
          </span>
        </td>

        {/* Date */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {displayDate}
        </td>

        {/* Game Name */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="font-medium text-gray-900 text-sm">
            {game.name.length > 30 ? game.name.substring(0, 30) + '...' : game.name}
          </span>
        </td>

        {/* Tournament ID */}
        <td className="px-3 py-3 whitespace-nowrap text-xs font-mono text-gray-500">
          {game.tournamentId || '-'}
        </td>

        {/* Buy-In */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {formatCurrency(game.buyIn)}
        </td>

        {/* Entries / Unique */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {game.entries} / {game.registrations}
        </td>

        {/* PP (Prizepool) */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {formatCompactCurrency(game.prizepool)}
        </td>

        {/* Revenue */}
        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
          {game.revenue > 0 ? formatCompactCurrency(game.revenue) : '-'}
        </td>

        {/* Costs */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {game.cost > 0 ? formatCompactCurrency(game.cost) : '-'}
        </td>

        {/* P/L */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          <span className={`font-semibold ${profitColorClass}`}>
            {formatCurrency(game.profit)}
          </span>
        </td>

        {/* Margin */}
        <td className="px-3 py-3 whitespace-nowrap text-sm">
          {game.profitMargin !== null ? (
            <span className={marginColorClass}>
              {(game.profitMargin * 100).toFixed(1)}%
            </span>
          ) : '-'}
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={11} className="px-6 py-4">
            {/* Game Name Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleNavigateToGame}
                  className="inline-flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:text-indigo-900 hover:underline group"
                  title="Open Game Details"
                >
                  {game.name}
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-50 group-hover:opacity-100" />
                </button>
              </div>
              <div className="text-sm text-gray-500">
                ID: {game.tournamentId || '-'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Revenue Breakdown */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BanknotesIcon className="h-4 w-4 text-emerald-500" />
                  Revenue
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Revenue</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(game.revenue)}</span>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <BanknotesIcon className="h-4 w-4 text-red-500" />
                  Costs
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Costs</span>
                    <span className="font-semibold text-red-600">{formatCurrency(game.cost)}</span>
                  </div>
                </div>
              </div>

              {/* Prizepool Details */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <TrophyIcon className="h-4 w-4 text-amber-500" />
                  Prizepool
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Buy-in</span>
                    <span className="font-medium">{formatCurrency(game.buyIn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Entries</span>
                    <span className="font-medium">{game.entries}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Unique Players</span>
                    <span className="font-medium">{game.registrations}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200">
                    <span className="font-semibold text-gray-700">Prizepool</span>
                    <span className="font-semibold">{formatCurrency(game.prizepool)}</span>
                  </div>
                </div>
              </div>

              {/* Net Position */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Net Position</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Revenue</span>
                    <span className="font-medium text-emerald-600">{formatCurrency(game.revenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Costs</span>
                    <span className="font-medium text-red-600">({formatCurrency(game.cost)})</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t-2 border-gray-300">
                    <span className="font-bold text-gray-800">Net Profit</span>
                    <span className={`text-lg font-bold ${profitColorClass}`}>
                      {formatCurrency(game.profit)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Profit Margin</span>
                    <span className={`font-medium ${marginColorClass}`}>
                      {game.profitMargin !== null ? `${(game.profitMargin * 100).toFixed(1)}%` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PAGE_LIMIT = 500;

export const VenueDetails: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { selectedEntities, entities, loading: entityLoading } = useEntity();
  const { isSuperAdmin } = useUserPermissions();

  const venueId = searchParams.get('venueId');
  const entityId: string | undefined = selectedEntities[0]?.id;

  // State
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [seriesType, setSeriesType] = useState<SeriesTypeKey>('REGULAR');
  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [venueMetrics, setVenueMetrics] = useState<VenueMetrics | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [recurringSnapshots, setRecurringSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [adHocSnapshots, setAdHocSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'analytics'>('overview');
  const [gameHistoryFilter, setGameHistoryFilter] = useState<'all' | 'recurring' | 'adhoc'>('all');

  // Ensure seriesType is always REGULAR for non-SUPER_ADMIN users
  useEffect(() => {
    if (!isSuperAdmin && seriesType !== 'REGULAR') {
      setSeriesType('REGULAR');
    }
  }, [isSuperAdmin, seriesType]);

  const handleSeriesTypeChange = (newSeriesType: SeriesTypeKey) => {
    if (!isSuperAdmin) return;
    setSeriesType(newSeriesType);
  };

  const showEntitySelector = entities && entities.length > 1;

  const venueMetricsId = useMemo(() => {
    if (!venueId) return null;
    return `${venueId}_${timeRange}_${seriesType}`;
  }, [venueId, timeRange, seriesType]);

  // Fetch data
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

        // 2) Fetch VenueMetrics
        if (venueMetricsId) {
          try {
            const metricsRes = await client.graphql({
              query: getVenueMetricsQuery,
              variables: { id: venueMetricsId },
            }) as any;

            const metricsData = metricsRes?.data?.getVenueMetrics;
            if (metricsData) {
              setVenueMetrics(metricsData);
              console.log(`[VenueDetails] Loaded VenueMetrics: ${venueMetricsId}`);
            } else {
              console.warn(`[VenueDetails] No VenueMetrics found for ${venueMetricsId}`);
              setVenueMetrics(null);
            }
          } catch (metricsErr) {
            console.warn('[VenueDetails] Error loading VenueMetrics:', metricsErr);
            setVenueMetrics(null);
          }
        }

        // 3) Fetch GameFinancialSnapshots
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
          const pageItems =
            page?.items?.filter((s: GameFinancialSnapshotWithGame | null) => s != null) ?? [];

          fetchedSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
          nextToken = page?.nextToken ?? null;
        } while (nextToken);

        // Filter by seriesType
        const seriesFilteredSnapshots = filterSnapshotsBySeriesType(fetchedSnapshots, seriesType);
        
        // Separate into recurring and ad-hoc
        const recurring = seriesFilteredSnapshots.filter(isValidRecurringGameSnapshot);
        const adHoc = seriesFilteredSnapshots.filter(isValidAdHocGameSnapshot);
        const allValid = seriesFilteredSnapshots.filter(isValidRegularGameSnapshot);

        console.log(
          `[VenueDetails] Loaded ${fetchedSnapshots.length} snapshots`,
          `| ${recurring.length} recurring (with recurringGameId)`,
          `| ${adHoc.length} ad-hoc`,
          `| ${allValid.length} total valid`
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

  // Compute stats - NOW GROUPED BY recurringGameId
  const { scheduleStats, globalStats: tableGlobalStats } = useMemo(
    () => buildScheduleGroupStats(recurringSnapshots),
    [recurringSnapshots]
  );

  const trendData = useMemo(() => buildOverallTrendData(allSnapshots), [allSnapshots]);

  // Group recurring games by day of week
  const scheduleStatsByDay = useMemo(() => {
    const grouped: Record<DayOfWeek, ScheduleGroupStats[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: [],
    };
    
    // Helper to normalize day names (handles "MONDAY", "monday", "Monday", etc.)
    const normalizeDay = (day: string | null): DayOfWeek | null => {
      if (!day) return null;
      const normalized = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
      return DAYS_OF_WEEK_ORDERED.includes(normalized as DayOfWeek) ? normalized as DayOfWeek : null;
    };
    
    scheduleStats.forEach((schedule) => {
      const day = normalizeDay(schedule.dayOfWeek);
      if (day) {
        grouped[day].push(schedule);
      }
    });
    
    // Debug log to see what we're grouping
    console.log('[VenueDetails] scheduleStats dayOfWeek values:', scheduleStats.map(s => s.dayOfWeek));
    console.log('[VenueDetails] Grouped by day:', Object.entries(grouped).map(([day, games]) => `${day}: ${games.length}`));
    
    return grouped;
  }, [scheduleStats]);

  const gameRows = useMemo(() => {
    const snapshotsToShow = gameHistoryFilter === 'recurring' 
      ? recurringSnapshots 
      : gameHistoryFilter === 'adhoc' 
        ? adHocSnapshots 
        : allSnapshots;
    return buildGameRowData(snapshotsToShow);
  }, [allSnapshots, recurringSnapshots, adHocSnapshots, gameHistoryFilter]);

  // Ad-hoc stats
  const adHocStats = useMemo(() => {
    const adHocGames = buildGameRowData(adHocSnapshots);
    const totalProfit = adHocGames.reduce((sum, g) => sum + g.profit, 0);
    const totalPrizepool = adHocGames.reduce((sum, g) => sum + g.prizepool, 0);
    const totalEntries = adHocGames.reduce((sum, g) => sum + g.entries, 0);
    return {
      totalGames: adHocGames.length,
      totalProfit,
      totalPrizepool,
      totalEntries,
      avgProfit: adHocGames.length > 0 ? totalProfit / adHocGames.length : 0,
      avgEntries: adHocGames.length > 0 ? totalEntries / adHocGames.length : 0,
      games: adHocGames,
    };
  }, [adHocSnapshots]);

  // Summary stats from VenueMetrics or computed
  const summaryStats = useMemo(() => {
    if (venueMetrics) {
      return {
        totalGames: venueMetrics.totalGames || 0,
        totalEntries: venueMetrics.totalEntries || 0,
        totalPrizepool: venueMetrics.totalPrizepool || 0,
        totalProfit: venueMetrics.totalProfit || 0,
        avgEntriesPerGame: venueMetrics.avgEntriesPerGame || 0,
        avgProfitPerGame: venueMetrics.avgProfitPerGame || 0,
      };
    }
    
    const totalEntries = tableGlobalStats.totalEntries + adHocStats.totalEntries;
    const totalGames = tableGlobalStats.totalGames + adHocStats.totalGames;
    const totalProfit = tableGlobalStats.totalProfit + adHocStats.totalProfit;
    const totalPrizepool = tableGlobalStats.totalPrizepool + adHocStats.totalPrizepool;
    
    return {
      totalGames,
      totalEntries,
      totalPrizepool,
      totalProfit,
      avgEntriesPerGame: totalGames > 0 ? totalEntries / totalGames : 0,
      avgProfitPerGame: totalGames > 0 ? totalProfit / totalGames : 0,
    };
  }, [venueMetrics, tableGlobalStats, adHocStats]);

  const profitColor = summaryStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600';

  // UPDATED: Handle row click - now uses recurringGameId
  const handleGameRowClick = (row: GameRowData) => {
    if (!venue) return;
    
    // For recurring games with a recurringGameId, navigate to the recurring game view
    if (row.classification === 'RECURRING' && row.recurringGameId) {
      navigate(`/venues/game?venueId=${venue.id}&recurringGameId=${encodeURIComponent(row.recurringGameId)}`);
    } else if (row.gameId) {
      // For ad-hoc games or games without a recurring assignment, navigate to the specific game
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
        // UPDATED: Show recurring game name instead of schedule key
        header: 'Recurring Game',
        accessorKey: 'recurringGameName',
        cell: ({ row }) => {
          const name = row.original.recurringGameName;
          if (!name) {
            return <span className="text-gray-400 text-xs italic">None</span>;
          }
          return (
            <span className="text-gray-600 text-xs">
              {name.length > 25 ? name.substring(0, 25) + '...' : name}
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
          const val = row.original.profit;
          return (
            <span className={`font-semibold ${val >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(val)}
            </span>
          );
        },
      },
    ],
    []
  );

  // Loading state
  if (entityLoading || loading) {
    return (
      <PageWrapper title="Venue Details">
        <div className="py-20 text-center text-gray-400">Loading venue details…</div>
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
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-900"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Go Back
          </button>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title={venue.name}>
      {/* Back Button */}
      <button
        onClick={() => navigate('/venues')}
        className="mb-4 inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to Venues
      </button>

      {/* Header & Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {venue.logo && (
            <img src={venue.logo} alt={venue.name} className="w-12 h-12 rounded-full object-cover border border-gray-200" />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{venue.name}</h1>
            {venue.address && (
              <Text className="flex items-center gap-1 text-sm text-gray-500">
                <MapPinIcon className="h-4 w-4" />
                {venue.address}, {venue.city}
              </Text>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {showEntitySelector && <MultiEntitySelector />}
          {isSuperAdmin && (
            <SeriesTypeSelector value={seriesType} onChange={handleSeriesTypeChange} />
          )}
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Summary KPIs */}
      <Grid numItemsSm={2} numItemsLg={5} className="gap-4 mb-6">
        <MetricCard
          label="Total Games"
          value={summaryStats.totalGames.toLocaleString()}
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        <MetricCard
          label="Total Entries"
          value={summaryStats.totalEntries.toLocaleString()}
          icon={<UserGroupIcon className="h-6 w-6" />}
          secondary={`Avg ${summaryStats.avgEntriesPerGame.toFixed(1)}/game`}
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
        />
        <MetricCard
          label="Avg Profit/Game"
          value={formatCurrency(summaryStats.avgProfitPerGame)}
          icon={<ChartBarIcon className="h-6 w-6" />}
        />
      </Grid>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {(['overview', 'games', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
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

            {/* Recurring Games Section - GROUPED BY DAY OF WEEK */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Text className="text-xs font-semibold uppercase text-gray-500">
                  Recurring Games ({scheduleStats.length} templates, {recurringSnapshots.length} games)
                </Text>
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  {formatCurrency(tableGlobalStats.totalProfit)} profit
                </span>
              </div>

              {scheduleStats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-8 text-center">
                  <p className="text-sm text-gray-400">
                    No recurring game data available for the selected filters.
                    {seriesType === 'SERIES' && ' Try switching to "Regular" or "All Games".'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {DAYS_OF_WEEK_ORDERED.map((day) => {
                    const gamesForDay = scheduleStatsByDay[day];
                    
                    return (
                      <div key={day}>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          {day}
                        </p>
                        {gamesForDay.length > 0 ? (
                          <Grid numItemsSm={1} numItemsMd={2} numItemsLg={3} className="gap-4">
                            {gamesForDay.map((schedule) => (
                              <ScheduleCard 
                                key={schedule.recurringGameId} 
                                schedule={schedule}
                                onClick={() => navigate(
                                  `/venues/game?venueId=${venue.id}&recurringGameId=${encodeURIComponent(schedule.recurringGameId)}`
                                )}
                              />
                            ))}
                          </Grid>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-4 text-center">
                            <p className="text-sm text-gray-400">
                              No recurring game on {day}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
                <>
                  {/* Summary Stats */}
                  <Card className="mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                  </Card>

                  {/* P/L Bar Chart */}
                  <Card className="mb-4">
                    <Text className="text-sm font-semibold mb-3">P/L by Game</Text>
                    <AdHocPLBarChart games={adHocStats.games} />
                  </Card>

                  {/* Games Table */}
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <Text className="text-sm font-semibold">Game History P&L</Text>
                      <Text className="text-xs text-gray-500">Click row to expand details</Text>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left w-10"></th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Game</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Buy-In</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ent/Unq</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">PP</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rev</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Costs</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">P/L</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Margin</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {adHocStats.games.map((game) => (
                            <AdHocPLRow
                              key={game.id}
                              game={game}
                              onNavigate={(gameId) => navigate(`/games/${gameId}`)}
                            />
                          ))}
                        </tbody>

                        {/* Summary Footer */}
                        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                          <tr className="font-semibold">
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3 text-sm text-gray-700" colSpan={2}>
                              TOTALS ({adHocStats.totalGames} games)
                            </td>
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3 text-sm">
                              {adHocStats.totalEntries}
                            </td>
                            <td className="px-3 py-3 text-sm">
                              {formatCompactCurrency(adHocStats.totalPrizepool)}
                            </td>
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3"></td>
                            <td className="px-3 py-3 text-sm">
                              <span className={adHocStats.totalProfit >= 0 ? 'text-blue-600' : 'text-red-600'}>
                                {formatCurrency(adHocStats.totalProfit)}
                              </span>
                            </td>
                            <td className="px-3 py-3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                </>
              ) : (
                <Card>
                  <Text className="text-sm text-gray-400 text-center py-4">
                    No ad-hoc games in selected time range
                  </Text>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === 'games' && (
          <div>
            {/* Filter Buttons */}
            <div className="flex items-center justify-between mb-4">
              <Text className="text-sm text-gray-600">
                {gameHistoryFilter === 'all'
                  ? `Showing all finished games (${recurringSnapshots.length} recurring, ${adHocSnapshots.length} ad-hoc)`
                  : gameHistoryFilter === 'recurring'
                    ? 'Showing recurring games only'
                    : 'Showing ad-hoc games only'}
              </Text>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  onClick={() => setGameHistoryFilter('all')}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
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

            {/* Performance by Recurring Game - NOW USES recurringGameId */}
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
                          Recurring Game
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                          Day
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
                          <tr 
                            key={s.recurringGameId} 
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => navigate(
                              `/venues/game?venueId=${venue.id}&recurringGameId=${encodeURIComponent(s.recurringGameId)}`
                            )}
                          >
                            <td className="px-4 py-2 font-medium">{s.displayName}</td>
                            <td className="px-4 py-2 text-gray-500">{s.dayOfWeek || '-'}</td>
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
                          <td className="px-4 py-6 text-center text-sm text-gray-500" colSpan={7}>
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
    </PageWrapper>
  );
};

export default VenueDetails;