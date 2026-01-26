// src/pages/players/PlayersDashboard.tsx
// Players Dashboard - Comprehensive view utilizing GlobalPlayerMetrics & EntityPlayerMetrics

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import {
  UserGroupIcon,
  TrophyIcon,
  CurrencyPoundIcon,
  BuildingOffice2Icon,
  ArrowRightIcon,
  ChartBarIcon,
  MapPinIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UsersIcon,
  GlobeAltIcon,
  ClockIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  formatCurrency,
  formatNumber,
} from '../../lib/utils';

const client = generateClient();

// ============================================================================
// Types
// ============================================================================

interface GlobalPlayerMetrics {
  id: string;
  timeRange: string;
  totalPlayers: number;
  totalEntities: number;
  totalVenues: number;
  activePlayerCount: number;
  suspendedPlayerCount: number;
  pendingVerificationPlayerCount: number;
  newPlayerCount: number;
  recreationalPlayerCount: number;
  regularPlayerCount: number;
  vipPlayerCount: number;
  lapsedPlayerCount: number;
  notPlayedCount: number;
  activeELCount: number;
  activeCount: number;
  retain31to60Count: number;
  retain61to90Count: number;
  churned91to120Count: number;
  churned121to180Count: number;
  churned181to360Count: number;
  churned361PlusCount: number;
  venuePlayDistribution: string;
  entityPlayDistribution: string;
  playersMultiVenue: number;
  playersMultiEntity: number;
  playersSingleVenue: number;
  playersSingleEntity: number;
  avgVenuesPerPlayer: number;
  avgEntitiesPerPlayer: number;
  maxVenuesPlayed: number;
  maxEntitiesPlayed: number;
  playersRegisteredLast30Days: number;
  playersRegisteredLast90Days: number;
  playersRegisteredLast365Days: number;
  playersActiveLast30Days: number;
  playersActiveLast90Days: number;
  avgGamesPerPlayer: number;
  avgNetBalancePerPlayer: number;
  totalPlayerNetBalance: number;
  totalPlayerWinnings: number;
  totalPlayerBuyIns: number;
  totalCreditBalance: number;
  totalPointsBalance: number;
  topEntitiesByPlayers: string;
  topVenuesByRegistrations: string;
  topPlayersByNetBalance: string;
  topPlayersByVenueCount: string;
  calculatedAt: string;
}

interface EntityPlayerMetrics {
  id: string;
  entityId: string;
  entityName: string;
  timeRange: string;
  totalPlayers: number;
  totalVenues: number;
  activePlayerCount: number;
  playersMultiVenue: number;
  playersSingleVenue: number;
  playersSharedWithOtherEntities: number;
  playersExclusiveToEntity: number;
  venueBreakdown: string;
  topPlayersByNetBalance: string;
  topPlayersByVenueCount: string;
}

interface VenueBreakdownItem {
  venueId: string;
  venueName: string;
  playerCount: number;
  activeCount: number;
  registrationCount: number;
}

interface TopPlayerItem {
  playerId: string;
  name: string;
  netBalance?: number;
  gamesPlayed?: number;
  venueCount?: number;
  entityCount?: number;
}

interface TopEntityItem {
  entityId: string;
  entityName: string;
  playerCount: number;
}

interface TopVenueItem {
  venueId: string;
  venueName: string;
  entityId?: string;
  registrationCount: number;
}

// ============================================================================
// GraphQL Queries
// ============================================================================

const GET_GLOBAL_PLAYER_METRICS = /* GraphQL */ `
  query GetGlobalPlayerMetrics($id: ID!) {
    getGlobalPlayerMetrics(id: $id) {
      id
      timeRange
      totalPlayers
      totalEntities
      totalVenues
      activePlayerCount
      suspendedPlayerCount
      pendingVerificationPlayerCount
      newPlayerCount
      recreationalPlayerCount
      regularPlayerCount
      vipPlayerCount
      lapsedPlayerCount
      notPlayedCount
      activeELCount
      activeCount
      retain31to60Count
      retain61to90Count
      churned91to120Count
      churned121to180Count
      churned181to360Count
      churned361PlusCount
      venuePlayDistribution
      entityPlayDistribution
      playersMultiVenue
      playersMultiEntity
      playersSingleVenue
      playersSingleEntity
      avgVenuesPerPlayer
      avgEntitiesPerPlayer
      maxVenuesPlayed
      maxEntitiesPlayed
      playersRegisteredLast30Days
      playersRegisteredLast90Days
      playersRegisteredLast365Days
      playersActiveLast30Days
      playersActiveLast90Days
      avgGamesPerPlayer
      avgNetBalancePerPlayer
      totalPlayerNetBalance
      totalPlayerWinnings
      totalPlayerBuyIns
      totalCreditBalance
      totalPointsBalance
      topEntitiesByPlayers
      topVenuesByRegistrations
      topPlayersByNetBalance
      topPlayersByVenueCount
      calculatedAt
    }
  }
`;

const LIST_ENTITY_PLAYER_METRICS = /* GraphQL */ `
  query ListEntityPlayerMetrics($filter: ModelEntityPlayerMetricsFilterInput) {
    listEntityPlayerMetrics(filter: $filter) {
      items {
        id
        entityId
        entityName
        timeRange
        totalPlayers
        totalVenues
        activePlayerCount
        playersMultiVenue
        playersSingleVenue
        playersSharedWithOtherEntities
        playersExclusiveToEntity
        venueBreakdown
        topPlayersByNetBalance
        topPlayersByVenueCount
      }
    }
  }
`;

// ============================================================================
// Custom Hook
// ============================================================================

function usePlayerMetrics(timeRange: string = 'ALL') {
  const [globalMetrics, setGlobalMetrics] = useState<GlobalPlayerMetrics | null>(null);
  const [entityMetrics, setEntityMetrics] = useState<EntityPlayerMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch global metrics
      const globalId = `global_${timeRange}`;
      console.log('[PlayersDashboard] Fetching global metrics with id:', globalId);
      
      const globalResponse = await client.graphql({
        query: GET_GLOBAL_PLAYER_METRICS,
        variables: { id: globalId }
      }) as { data: { getGlobalPlayerMetrics: GlobalPlayerMetrics } };
      
      console.log('[PlayersDashboard] Global metrics response:', globalResponse.data?.getGlobalPlayerMetrics);
      
      if (globalResponse.data?.getGlobalPlayerMetrics) {
        setGlobalMetrics(globalResponse.data.getGlobalPlayerMetrics);
        setLastRefresh(new Date(globalResponse.data.getGlobalPlayerMetrics.calculatedAt));
      } else {
        console.warn('[PlayersDashboard] No global metrics found for id:', globalId);
      }

      // Fetch entity metrics
      console.log('[PlayersDashboard] Fetching entity metrics for timeRange:', timeRange);
      
      const entityResponse = await client.graphql({
        query: LIST_ENTITY_PLAYER_METRICS,
        variables: { filter: { timeRange: { eq: timeRange } } }
      }) as { data: { listEntityPlayerMetrics: { items: EntityPlayerMetrics[] } } };
      
      console.log('[PlayersDashboard] Entity metrics response:', entityResponse.data?.listEntityPlayerMetrics?.items?.length, 'items');
      
      if (entityResponse.data?.listEntityPlayerMetrics?.items) {
        setEntityMetrics(entityResponse.data.listEntityPlayerMetrics.items);
      }
    } catch (err) {
      console.error('[PlayersDashboard] Error fetching player metrics:', err);
      setError('Failed to load player metrics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchMetrics();
  }, [timeRange]);

  return { globalMetrics, entityMetrics, loading, error, lastRefresh, refetch: fetchMetrics };
}

// ============================================================================
// Main Component
// ============================================================================

export const PlayersDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'overview' | 'distribution' | 'entities' | 'engagement'>('overview');

  const { globalMetrics, entityMetrics, loading, error, lastRefresh, refetch } = usePlayerMetrics(timeRange);

  // Parse JSON fields
  // Helper to parse potentially double-encoded JSON
  const parseJsonField = <T,>(value: string | null | undefined): T | null => {
    if (!value) return null;
    try {
      let parsed = JSON.parse(value);
      // If the result is still a string, parse again (double-encoded)
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      return parsed as T;
    } catch {
      return null;
    }
  };

  const venueDistribution = useMemo(() => {
    return parseJsonField<Record<string, number>>(globalMetrics?.venuePlayDistribution);
  }, [globalMetrics?.venuePlayDistribution]);

  const entityDistribution = useMemo(() => {
    return parseJsonField<Record<string, number>>(globalMetrics?.entityPlayDistribution);
  }, [globalMetrics?.entityPlayDistribution]);

  const topEntities = useMemo(() => {
    const parsed = parseJsonField<TopEntityItem[]>(globalMetrics?.topEntitiesByPlayers);
    return Array.isArray(parsed) ? parsed : [];
  }, [globalMetrics?.topEntitiesByPlayers]);

  const topVenues = useMemo(() => {
    const parsed = parseJsonField<TopVenueItem[]>(globalMetrics?.topVenuesByRegistrations);
    return Array.isArray(parsed) ? parsed : [];
  }, [globalMetrics?.topVenuesByRegistrations]);

  const topPlayersByBalance = useMemo(() => {
    const parsed = parseJsonField<TopPlayerItem[]>(globalMetrics?.topPlayersByNetBalance);
    return Array.isArray(parsed) ? parsed : [];
  }, [globalMetrics?.topPlayersByNetBalance]);

  const topPlayersByVenues = useMemo(() => {
    const parsed = parseJsonField<TopPlayerItem[]>(globalMetrics?.topPlayersByVenueCount);
    return Array.isArray(parsed) ? parsed : [];
  }, [globalMetrics?.topPlayersByVenueCount]);

  // Calculate derived stats
  const churnedTotal = globalMetrics 
    ? (globalMetrics.churned91to120Count + globalMetrics.churned121to180Count + 
       globalMetrics.churned181to360Count + globalMetrics.churned361PlusCount)
    : 0;

  const atRiskTotal = globalMetrics
    ? (globalMetrics.retain31to60Count + globalMetrics.retain61to90Count)
    : 0;

  const churnRate = globalMetrics?.totalPlayers
    ? ((churnedTotal / globalMetrics.totalPlayers) * 100).toFixed(1)
    : '0';

  return (
    <PageWrapper>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 shadow-xl rounded-xl">
          <div className="px-6 py-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">
                  Player Analytics Dashboard
                </h1>
                <p className="mt-2 text-slate-300">
                  Comprehensive metrics across all entities and venues
                </p>
                {lastRefresh && (
                  <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    Last updated: {lastRefresh.toLocaleString()}
                  </p>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Time Range Selector */}
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="bg-slate-700 text-white border-slate-600 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="ALL">All Time</option>
                  <option value="12M">Last 12 Months</option>
                  <option value="6M">Last 6 Months</option>
                  <option value="3M">Last 3 Months</option>
                  <option value="1M">Last Month</option>
                </select>

                {/* Refresh Button */}
                <button
                  onClick={refetch}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                  <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                {/* Search Button */}
                <button
                  onClick={() => navigate('/players/search')}
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/25"
                >
                  Search Players
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && !globalMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        )}

        {globalMetrics && (
          <>
            {/* Primary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PrimaryStatCard
                icon={UserGroupIcon}
                title="Total Players"
                value={formatNumber(globalMetrics.totalPlayers)}
                trend={globalMetrics.playersRegisteredLast30Days > 0 ? 'up' : 'neutral'}
                trendValue={`+${globalMetrics.playersRegisteredLast30Days} this month`}
                color="indigo"
              />
              <PrimaryStatCard
                icon={CheckCircleIcon}
                title="Active Players"
                value={formatNumber(globalMetrics.activePlayerCount)}
                subtitle={`${((globalMetrics.activePlayerCount / globalMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
                color="emerald"
              />
              <PrimaryStatCard
                icon={CurrencyPoundIcon}
                title="Total Net Balance"
                value={formatCurrency(globalMetrics.totalPlayerNetBalance)}
                valueColor={globalMetrics.totalPlayerNetBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
                color="amber"
              />
              <PrimaryStatCard
                icon={BuildingOffice2Icon}
                title="Coverage"
                value={`${globalMetrics.totalEntities} entities`}
                subtitle={`${globalMetrics.totalVenues} venues`}
                color="violet"
              />
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview', icon: ChartBarIcon },
                  { id: 'distribution', label: 'Player Distribution', icon: UsersIcon },
                  { id: 'entities', label: 'Entity Breakdown', icon: BuildingOffice2Icon },
                  { id: 'engagement', label: 'Engagement & Churn', icon: ArrowTrendingUpIcon },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`
                      flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                      ${activeTab === tab.id
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }
                    `}
                  >
                    <tab.icon className="h-5 w-5" />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="min-h-[600px]">
              {activeTab === 'overview' && (
                <OverviewTab
                  globalMetrics={globalMetrics}
                  topPlayersByBalance={topPlayersByBalance}
                  topPlayersByVenues={topPlayersByVenues}
                  topEntities={topEntities}
                  topVenues={topVenues}
                  navigate={navigate}
                />
              )}
              
              {activeTab === 'distribution' && (
                <DistributionTab
                  globalMetrics={globalMetrics}
                  venueDistribution={venueDistribution}
                  entityDistribution={entityDistribution}
                  topPlayersByVenues={topPlayersByVenues}
                  navigate={navigate}
                />
              )}
              
              {activeTab === 'entities' && (
                <EntitiesTab
                  entityMetrics={entityMetrics}
                />
              )}
              
              {activeTab === 'engagement' && (
                <EngagementTab
                  globalMetrics={globalMetrics}
                  churnedTotal={churnedTotal}
                  atRiskTotal={atRiskTotal}
                  churnRate={churnRate}
                />
              )}
            </div>
          </>
        )}
      </div>
    </PageWrapper>
  );
};

// ============================================================================
// Primary Stat Card Component
// ============================================================================

interface PrimaryStatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color: 'indigo' | 'emerald' | 'amber' | 'violet' | 'red';
}

const colorClasses = {
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-500/20',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-500/20',
  amber: 'bg-amber-50 text-amber-600 ring-amber-500/20',
  violet: 'bg-violet-50 text-violet-600 ring-violet-500/20',
  red: 'bg-red-50 text-red-600 ring-red-500/20',
};

const PrimaryStatCard: React.FC<PrimaryStatCardProps> = ({
  icon: Icon,
  title,
  value,
  valueColor = 'text-gray-900',
  subtitle,
  trend,
  trendValue,
  color,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-xl ring-1 ${colorClasses[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
        <p className={`text-2xl font-bold ${valueColor} truncate`}>{value}</p>
        {subtitle && (
          <p className="text-sm text-gray-500">{subtitle}</p>
        )}
        {trend && trendValue && (
          <p className={`text-sm flex items-center gap-1 ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend === 'up' && <ArrowTrendingUpIcon className="h-4 w-4" />}
            {trend === 'down' && <ArrowTrendingDownIcon className="h-4 w-4" />}
            {trendValue}
          </p>
        )}
      </div>
    </div>
  </div>
);

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  globalMetrics: GlobalPlayerMetrics;
  topPlayersByBalance: TopPlayerItem[];
  topPlayersByVenues: TopPlayerItem[];
  topEntities: TopEntityItem[];
  topVenues: TopVenueItem[];
  navigate: (path: string) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  globalMetrics,
  topPlayersByBalance,
  topPlayersByVenues,
  topEntities,
  topVenues,
  navigate,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* Left Column - Financial & Activity */}
    <div className="lg:col-span-2 space-y-6">
      {/* Financial Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CurrencyPoundIcon className="h-5 w-5 text-amber-500" />
          Financial Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricBox
            label="Total Winnings"
            value={formatCurrency(globalMetrics.totalPlayerWinnings)}
            valueColor="text-emerald-600"
          />
          <MetricBox
            label="Total Buy-ins"
            value={formatCurrency(globalMetrics.totalPlayerBuyIns)}
            valueColor="text-red-600"
          />
          <MetricBox
            label="Credit Balance"
            value={formatCurrency(globalMetrics.totalCreditBalance)}
          />
          <MetricBox
            label="Points Balance"
            value={formatNumber(globalMetrics.totalPointsBalance)}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
          <MetricBox
            label="Avg Net Balance / Player"
            value={formatCurrency(globalMetrics.avgNetBalancePerPlayer)}
            valueColor={globalMetrics.avgNetBalancePerPlayer >= 0 ? 'text-emerald-600' : 'text-red-600'}
          />
          <MetricBox
            label="Avg Games / Player"
            value={globalMetrics.avgGamesPerPlayer?.toFixed(1) || '0'}
          />
        </div>
      </div>

      {/* Activity Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ArrowTrendingUpIcon className="h-5 w-5 text-indigo-500" />
          Activity & Registration
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricBox
            label="Active Last 30 Days"
            value={formatNumber(globalMetrics.playersActiveLast30Days)}
            subtitle={`${((globalMetrics.playersActiveLast30Days / globalMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
          />
          <MetricBox
            label="Active Last 90 Days"
            value={formatNumber(globalMetrics.playersActiveLast90Days)}
            subtitle={`${((globalMetrics.playersActiveLast90Days / globalMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
          />
          <MetricBox
            label="Registered Last 30 Days"
            value={formatNumber(globalMetrics.playersRegisteredLast30Days)}
          />
          <MetricBox
            label="Registered Last 90 Days"
            value={formatNumber(globalMetrics.playersRegisteredLast90Days)}
          />
          <MetricBox
            label="Registered Last Year"
            value={formatNumber(globalMetrics.playersRegisteredLast365Days)}
          />
        </div>
      </div>

      {/* Player Categories */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-violet-500" />
          Player Categories
        </h3>
        <div className="space-y-3">
          <CategoryBar label="New" count={globalMetrics.newPlayerCount} total={globalMetrics.totalPlayers} color="bg-blue-500" />
          <CategoryBar label="Recreational" count={globalMetrics.recreationalPlayerCount} total={globalMetrics.totalPlayers} color="bg-green-500" />
          <CategoryBar label="Regular" count={globalMetrics.regularPlayerCount} total={globalMetrics.totalPlayers} color="bg-amber-500" />
          <CategoryBar label="VIP" count={globalMetrics.vipPlayerCount} total={globalMetrics.totalPlayers} color="bg-purple-500" />
          <CategoryBar label="Lapsed" count={globalMetrics.lapsedPlayerCount} total={globalMetrics.totalPlayers} color="bg-gray-400" />
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatusCard
            label="Active"
            count={globalMetrics.activePlayerCount}
            total={globalMetrics.totalPlayers}
            icon={CheckCircleIcon}
            color="emerald"
          />
          <StatusCard
            label="Suspended"
            count={globalMetrics.suspendedPlayerCount}
            total={globalMetrics.totalPlayers}
            icon={XCircleIcon}
            color="red"
          />
          <StatusCard
            label="Pending Verification"
            count={globalMetrics.pendingVerificationPlayerCount}
            total={globalMetrics.totalPlayers}
            icon={ClockIcon}
            color="amber"
          />
        </div>
      </div>
    </div>

    {/* Right Column - Top Lists */}
    <div className="space-y-6">
      {/* Top Players by Net Balance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <TrophyIcon className="h-5 w-5 text-amber-500" />
            Top Performers
          </h3>
          <p className="text-sm text-gray-500">By net balance</p>
        </div>
        <div className="divide-y divide-gray-100">
          {(topPlayersByBalance || []).slice(0, 5).map((player, index) => (
            <div
              key={player.playerId}
              onClick={() => navigate(`/players/profile/${player.playerId}`)}
              className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${index === 0 ? 'bg-amber-100 text-amber-700' : 
                    index === 1 ? 'bg-gray-100 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'}
                `}>
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">{player.name}</span>
              </div>
              <span className={`text-sm font-semibold ${(player.netBalance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(player.netBalance || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Players by Venue Count */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <GlobeAltIcon className="h-5 w-5 text-indigo-500" />
            Most Active Travelers
          </h3>
          <p className="text-sm text-gray-500">Players at most venues</p>
        </div>
        <div className="divide-y divide-gray-100">
          {(topPlayersByVenues || []).slice(0, 5).map((player, index) => (
            <div
              key={player.playerId}
              onClick={() => navigate(`/players/profile/${player.playerId}`)}
              className="px-6 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">{player.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-indigo-600">{player.venueCount} venues</span>
                {player.entityCount && player.entityCount > 1 && (
                  <span className="text-xs text-gray-500 block">{player.entityCount} entities</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Entities */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <BuildingOffice2Icon className="h-5 w-5 text-violet-500" />
            Top Entities
          </h3>
          <p className="text-sm text-gray-500">By player count</p>
        </div>
        <div className="divide-y divide-gray-100">
          {(topEntities || []).slice(0, 5).map((entity, index) => (
            <div key={entity.entityId} className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">{entity.entityName}</span>
              </div>
              <span className="text-sm font-semibold text-gray-600">{formatNumber(entity.playerCount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Venues by Registration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPinIcon className="h-5 w-5 text-emerald-500" />
            Top Registration Venues
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {(topVenues || []).slice(0, 5).map((venue, index) => (
            <div key={venue.venueId} className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">{venue.venueName}</span>
              </div>
              <span className="text-sm font-semibold text-gray-600">{formatNumber(venue.registrationCount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// Distribution Tab
// ============================================================================

interface DistributionTabProps {
  globalMetrics: GlobalPlayerMetrics;
  venueDistribution: Record<string, number> | null;
  entityDistribution: Record<string, number> | null;
  topPlayersByVenues: TopPlayerItem[];
  navigate: (path: string) => void;
}

const DistributionTab: React.FC<DistributionTabProps> = ({
  globalMetrics,
  venueDistribution,
  entityDistribution,
  topPlayersByVenues,
  navigate,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Venue Distribution */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <MapPinIcon className="h-5 w-5 text-indigo-500" />
        Venue Play Distribution
      </h3>
      <p className="text-sm text-gray-500 mb-6">How many venues each player has played at</p>
      
      {venueDistribution && (
        <div className="space-y-4">
          {Object.entries(venueDistribution).map(([venues, count]) => {
            const percent = ((count / globalMetrics.totalPlayers) * 100);
            return (
              <div key={venues} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {venues === '5+' ? '5 or more venues' : `${venues} venue${venues === '1' ? '' : 's'}`}
                  </span>
                  <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      venues === '1' ? 'bg-gray-400' :
                      venues === '2' ? 'bg-blue-400' :
                      venues === '3' ? 'bg-indigo-500' :
                      venues === '4' ? 'bg-purple-500' : 'bg-violet-600'
                    }`}
                    style={{ width: `${Math.max(percent, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
        <div className="text-center p-4 bg-indigo-50 rounded-lg">
          <p className="text-2xl font-bold text-indigo-600">{formatNumber(globalMetrics.playersMultiVenue)}</p>
          <p className="text-sm text-indigo-700">Multi-venue players</p>
          <p className="text-xs text-indigo-500">
            {((globalMetrics.playersMultiVenue / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-600">{formatNumber(globalMetrics.playersSingleVenue)}</p>
          <p className="text-sm text-gray-700">Single-venue players</p>
          <p className="text-xs text-gray-500">
            {((globalMetrics.playersSingleVenue / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.avgVenuesPerPlayer?.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Avg venues per player</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.maxVenuesPlayed}</p>
            <p className="text-xs text-slate-500">Max venues (single player)</p>
          </div>
        </div>
      </div>
    </div>

    {/* Entity Distribution */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <BuildingOffice2Icon className="h-5 w-5 text-violet-500" />
        Entity Play Distribution
      </h3>
      <p className="text-sm text-gray-500 mb-6">How many entities each player has played across</p>
      
      {entityDistribution && (
        <div className="space-y-4">
          {Object.entries(entityDistribution).map(([entities, count]) => {
            const percent = ((count / globalMetrics.totalPlayers) * 100);
            return (
              <div key={entities} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">
                    {entities === '3+' ? '3 or more entities' : `${entities} entit${entities === '1' ? 'y' : 'ies'}`}
                  </span>
                  <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      entities === '1' ? 'bg-gray-400' :
                      entities === '2' ? 'bg-violet-400' : 'bg-violet-600'
                    }`}
                    style={{ width: `${Math.max(percent, 1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-2 gap-4">
        <div className="text-center p-4 bg-violet-50 rounded-lg">
          <p className="text-2xl font-bold text-violet-600">{formatNumber(globalMetrics.playersMultiEntity)}</p>
          <p className="text-sm text-violet-700">Multi-entity players</p>
          <p className="text-xs text-violet-500">
            {((globalMetrics.playersMultiEntity / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        <div className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-600">{formatNumber(globalMetrics.playersSingleEntity)}</p>
          <p className="text-sm text-gray-700">Single-entity players</p>
          <p className="text-xs text-gray-500">
            {((globalMetrics.playersSingleEntity / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
      </div>

      <div className="mt-4 p-4 bg-slate-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.avgEntitiesPerPlayer?.toFixed(2)}</p>
            <p className="text-xs text-slate-500">Avg entities per player</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">{globalMetrics.maxEntitiesPlayed}</p>
            <p className="text-xs text-slate-500">Max entities (single player)</p>
          </div>
        </div>
      </div>
    </div>

    {/* Most Active Travelers */}
    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <SparklesIcon className="h-5 w-5 text-amber-500" />
        Most Active Travelers
      </h3>
      <p className="text-sm text-gray-500 mb-6">Players who have played at the most venues across all entities</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {(topPlayersByVenues || []).slice(0, 10).map((player, index) => (
          <div
            key={player.playerId}
            onClick={() => navigate(`/players/profile/${player.playerId}`)}
            className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg hover:shadow-md cursor-pointer transition-all border border-slate-200"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${index < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}
              `}>
                #{index + 1}
              </span>
              <span className="text-sm font-semibold text-gray-900 truncate">{player.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-white rounded p-2">
                <p className="text-lg font-bold text-indigo-600">{player.venueCount}</p>
                <p className="text-xs text-gray-500">venues</p>
              </div>
              <div className="bg-white rounded p-2">
                <p className="text-lg font-bold text-violet-600">{player.entityCount || 1}</p>
                <p className="text-xs text-gray-500">entities</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              {formatNumber(player.gamesPlayed || 0)} games played
            </p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// Entities Tab
// ============================================================================

interface EntitiesTabProps {
  entityMetrics: EntityPlayerMetrics[];
}

const EntitiesTab: React.FC<EntitiesTabProps> = ({
  entityMetrics,
}) => (
  <div className="space-y-6">
    {/* Entity Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {entityMetrics.map((entity) => {
        let venueBreakdown: VenueBreakdownItem[] = [];
        try {
          if (entity.venueBreakdown) {
            const parsed = JSON.parse(entity.venueBreakdown);
            venueBreakdown = Array.isArray(parsed) ? parsed : [];
          }
        } catch {
          venueBreakdown = [];
        }
        
        return (
          <div key={entity.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
              <h3 className="text-lg font-semibold text-white">{entity.entityName}</h3>
              <p className="text-sm text-slate-300">{entity.totalVenues} venues</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Player Counts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-indigo-50 rounded-lg">
                  <p className="text-2xl font-bold text-indigo-600">{formatNumber(entity.totalPlayers)}</p>
                  <p className="text-xs text-indigo-700">Total Players</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">{formatNumber(entity.activePlayerCount)}</p>
                  <p className="text-xs text-emerald-700">Active</p>
                </div>
              </div>

              {/* Cross-venue stats */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Cross-Venue Activity</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Multi-venue:</span>
                    <span className="font-medium">{formatNumber(entity.playersMultiVenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Single-venue:</span>
                    <span className="font-medium">{formatNumber(entity.playersSingleVenue)}</span>
                  </div>
                </div>
              </div>

              {/* Entity exclusivity */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-2">Player Loyalty</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Exclusive:</span>
                    <span className="font-medium text-emerald-600">{formatNumber(entity.playersExclusiveToEntity)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Shared:</span>
                    <span className="font-medium text-amber-600">{formatNumber(entity.playersSharedWithOtherEntities)}</span>
                  </div>
                </div>
              </div>

              {/* Top venues */}
              {venueBreakdown.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Top Venues</p>
                  <div className="space-y-2">
                    {venueBreakdown.slice(0, 3).map((venue) => (
                      <div key={venue.venueId} className="flex justify-between text-sm">
                        <span className="text-gray-600 truncate">{venue.venueName}</span>
                        <span className="font-medium text-gray-900">{formatNumber(venue.playerCount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {entityMetrics.length === 0 && (
      <div className="text-center py-12 text-gray-500">
        No entity metrics available. Run a metrics refresh to populate this data.
      </div>
    )}
  </div>
);

// ============================================================================
// Engagement Tab
// ============================================================================

interface EngagementTabProps {
  globalMetrics: GlobalPlayerMetrics;
  churnedTotal: number;
  atRiskTotal: number;
  churnRate: string;
}

const EngagementTab: React.FC<EngagementTabProps> = ({
  globalMetrics,
  churnedTotal,
  atRiskTotal,
  churnRate,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Engagement Funnel */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <ArrowTrendingUpIcon className="h-5 w-5 text-indigo-500" />
        Player Lifecycle Funnel
      </h3>
      
      <div className="space-y-3">
        <FunnelBar
          label="Active (played recently)"
          count={globalMetrics.activeELCount + globalMetrics.activeCount}
          total={globalMetrics.totalPlayers}
          color="bg-emerald-500"
          description="Last 30 days"
        />
        <FunnelBar
          label="At Risk - 31-60 days inactive"
          count={globalMetrics.retain31to60Count}
          total={globalMetrics.totalPlayers}
          color="bg-yellow-500"
          description="Retention target"
        />
        <FunnelBar
          label="At Risk - 61-90 days inactive"
          count={globalMetrics.retain61to90Count}
          total={globalMetrics.totalPlayers}
          color="bg-orange-500"
          description="Urgent retention"
        />
        <FunnelBar
          label="Churned - 91-120 days"
          count={globalMetrics.churned91to120Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-400"
          description="Recently churned"
        />
        <FunnelBar
          label="Churned - 121-180 days"
          count={globalMetrics.churned121to180Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-500"
          description="Medium-term churned"
        />
        <FunnelBar
          label="Churned - 181-360 days"
          count={globalMetrics.churned181to360Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-600"
          description="Long-term churned"
        />
        <FunnelBar
          label="Churned - 361+ days"
          count={globalMetrics.churned361PlusCount}
          total={globalMetrics.totalPlayers}
          color="bg-red-800"
          description="Dormant"
        />
        <FunnelBar
          label="Never Played"
          count={globalMetrics.notPlayedCount}
          total={globalMetrics.totalPlayers}
          color="bg-gray-400"
          description="Registered but no activity"
        />
      </div>
    </div>

    {/* Churn Metrics */}
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <p className="text-emerald-100 text-sm">Healthy Players</p>
          <p className="text-3xl font-bold mt-1">
            {formatNumber(globalMetrics.activeELCount + globalMetrics.activeCount)}
          </p>
          <p className="text-emerald-200 text-sm mt-2">
            {((( globalMetrics.activeELCount + globalMetrics.activeCount) / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-6 text-white">
          <p className="text-amber-100 text-sm">At Risk</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(atRiskTotal)}</p>
          <p className="text-amber-200 text-sm mt-2">
            {((atRiskTotal / globalMetrics.totalPlayers) * 100).toFixed(1)}% need attention
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
          <p className="text-red-100 text-sm">Churned</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(churnedTotal)}</p>
          <p className="text-red-200 text-sm mt-2">
            {churnRate}% churn rate
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-6 text-white">
          <p className="text-gray-100 text-sm">Never Played</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(globalMetrics.notPlayedCount)}</p>
          <p className="text-gray-200 text-sm mt-2">
            {((globalMetrics.notPlayedCount / globalMetrics.totalPlayers) * 100).toFixed(1)}% unconverted
          </p>
        </div>
      </div>

      {/* Targeting Classification Detail */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Targeting Classification</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
            <div>
              <p className="font-medium text-emerald-800">Active_EL</p>
              <p className="text-xs text-emerald-600">Early lifecycle, active</p>
            </div>
            <p className="text-xl font-bold text-emerald-700">{formatNumber(globalMetrics.activeELCount)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div>
              <p className="font-medium text-green-800">Active</p>
              <p className="text-xs text-green-600">Established, active</p>
            </div>
            <p className="text-xl font-bold text-green-700">{formatNumber(globalMetrics.activeCount)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <div>
              <p className="font-medium text-yellow-800">Retain 31-60d</p>
              <p className="text-xs text-yellow-600">Inactive 31-60 days</p>
            </div>
            <p className="text-xl font-bold text-yellow-700">{formatNumber(globalMetrics.retain31to60Count)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
            <div>
              <p className="font-medium text-orange-800">Retain 61-90d</p>
              <p className="text-xs text-orange-600">Inactive 61-90 days</p>
            </div>
            <p className="text-xl font-bold text-orange-700">{formatNumber(globalMetrics.retain61to90Count)}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================
// Helper Components
// ============================================================================

interface MetricBoxProps {
  label: string;
  value: string;
  valueColor?: string;
  subtitle?: string;
}

const MetricBox: React.FC<MetricBoxProps> = ({ label, value, valueColor = 'text-gray-900', subtitle }) => (
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className={`text-xl font-semibold ${valueColor}`}>{value}</p>
    {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
  </div>
);

interface CategoryBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const CategoryBar: React.FC<CategoryBarProps> = ({ label, count, total, color }) => {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-600">{formatNumber(count)} ({percent.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(percent, 0.5)}%` }} />
      </div>
    </div>
  );
};

interface StatusCardProps {
  label: string;
  count: number;
  total: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'emerald' | 'red' | 'amber';
}

const statusColors = {
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-600',
};

const StatusCard: React.FC<StatusCardProps> = ({ label, count, total, icon: Icon, color }) => {
  const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  return (
    <div className={`p-4 rounded-lg ${statusColors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-5 w-5" />
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{formatNumber(count)}</p>
      <p className="text-sm opacity-75">{percent}%</p>
    </div>
  );
};

interface FunnelBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
  description: string;
}

const FunnelBar: React.FC<FunnelBarProps> = ({ label, count, total, color, description }) => {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-end">
        <div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-xs text-gray-400 ml-2">({description})</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{formatNumber(count)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded h-6 relative overflow-hidden">
        <div
          className={`h-6 rounded ${color} flex items-center justify-end pr-2 transition-all`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        >
          {percent > 10 && (
            <span className="text-xs text-white font-medium">{percent.toFixed(1)}%</span>
          )}
        </div>
        {percent <= 10 && percent > 0 && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-600 font-medium">
            {percent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
};

export default PlayersDashboard;