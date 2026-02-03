// src/pages/players/PlayersDashboard.tsx
// Players Dashboard - Comprehensive view utilizing GlobalPlayerMetrics & EntityPlayerMetrics
// VERSION: 3.2.0 - Refactored into tab sub-components in /player-tabs
//                  - Fixed avgNetBalancePerPlayer aggregation (uses totalNetBalance/totalPlayers)
//                  - Fixed topVenuesByRegistrations (fallback from entity venueBreakdowns)
//                  - Multi-entity filtering with full aggregation
//                  - TopSpenders works when filtering (aggregates from EntityPlayerMetrics.topPlayersByBuyIns)
//                  - avgGamesPerPlayer calculated from totalGamesPlayed for filtered views

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import {
  UserGroupIcon,
  CurrencyPoundIcon,
  BuildingOffice2Icon,
  ArrowRightIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';
import { useEntity } from '../../contexts/EntityContext';
import {
  formatCurrency,
  formatNumber,
} from '../../lib/utils';

// Import from player-tabs
import {
  OverviewTab,
  DistributionTab,
  EntitiesTab,
  EngagementTab,
  parseJsonField,
  parseJsonFieldStatic,
} from './player-tabs';

import type {
  GlobalPlayerMetrics,
  EntityPlayerMetrics,
  TopPlayerItem,
  TopEntityItem,
  TopVenueItem,
  VenueBreakdownItem,
} from './player-tabs';

const client = generateClient();

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
      trialistPlayerCount
      casualPlayerCount
      committedPlayerCount
      regularPlayerCount
      vipPlayerCount
      newPlayerCount
      recreationalPlayerCount
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
      topPlayersByBuyIns
      calculatedAt
    }
  }
`;

const LIST_ENTITY_PLAYER_METRICS = /* GraphQL */ `
  query ListEntityPlayerMetrics($filter: ModelEntityPlayerMetricsFilterInput) {
    listEntityPlayerMetrics(filter: $filter, limit: 100) {
      items {
        id
        entityId
        entityName
        timeRange
        totalPlayers
        totalVenues
        activePlayerCount
        suspendedPlayerCount
        pendingVerificationPlayerCount
        trialistPlayerCount
        casualPlayerCount
        committedPlayerCount
        regularPlayerCount
        vipPlayerCount
        newPlayerCount
        recreationalPlayerCount
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
        playersMultiVenue
        playersSingleVenue
        playersSharedWithOtherEntities
        playersExclusiveToEntity
        avgVenuesPerPlayer
        playersRegisteredAllTime
        playersRegisteredLast30Days
        playersRegisteredLast90Days
        playersActiveLast30Days
        playersActiveLast90Days
        totalGamesPlayed
        avgGamesPerPlayer
        avgNetBalancePerPlayer
        totalPlayerNetBalance
        totalPlayerWinnings
        totalPlayerBuyIns
        totalCreditBalance
        totalPointsBalance
        venueBreakdown
        topPlayersByNetBalance
        topPlayersByVenueCount
        topPlayersByBuyIns
        calculatedAt
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
      
      const globalResponse = await client.graphql({
        query: GET_GLOBAL_PLAYER_METRICS,
        variables: { id: globalId }
      }) as { data: { getGlobalPlayerMetrics: GlobalPlayerMetrics } };
      
      if (globalResponse.data?.getGlobalPlayerMetrics) {
        setGlobalMetrics(globalResponse.data.getGlobalPlayerMetrics);
        setLastRefresh(new Date(globalResponse.data.getGlobalPlayerMetrics.calculatedAt));
      } else {
        console.warn('[PlayersDashboard] No global metrics found for id:', globalId);
      }

      // Fetch entity metrics
      const entityResponse = await client.graphql({
        query: LIST_ENTITY_PLAYER_METRICS,
        variables: { filter: { timeRange: { eq: timeRange } } }
      }) as { data: { listEntityPlayerMetrics: { items: EntityPlayerMetrics[] } } };
      
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

  // Entity context for multi-entity filtering
  const { selectedEntities, entities } = useEntity();

  const { globalMetrics, entityMetrics, loading, error, lastRefresh, refetch } = usePlayerMetrics(timeRange);

  // Determine if we're filtering (not all entities selected)
  const isFiltering = useMemo(() => {
    if (!entities || entities.length === 0) return false;
    if (!selectedEntities || selectedEntities.length === 0) return false;
    return selectedEntities.length < entities.length;
  }, [selectedEntities, entities]);

  // Get entity IDs for filtering
  const selectedEntityIds = useMemo(() => {
    return selectedEntities?.map((e: { id: string }) => e.id) || [];
  }, [selectedEntities]);

  // Filter entity metrics to only selected entities
  const filteredEntityMetrics = useMemo(() => {
    if (!entityMetrics) return [];
    if (!isFiltering) return entityMetrics;
    return entityMetrics.filter(em => selectedEntityIds.includes(em.entityId));
  }, [entityMetrics, isFiltering, selectedEntityIds]);

  // Aggregate metrics from selected entities (used when filtering)
  const aggregatedMetrics = useMemo((): GlobalPlayerMetrics | null => {
    if (!isFiltering || !filteredEntityMetrics.length) return null;

    const sum = (field: keyof EntityPlayerMetrics) => 
      filteredEntityMetrics.reduce((acc, em) => acc + (Number(em[field]) || 0), 0);

    const avg = (field: keyof EntityPlayerMetrics) => {
      const values = filteredEntityMetrics.map(em => Number(em[field]) || 0).filter(v => v > 0);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    };

    // Aggregate top players by collecting from all selected entities
    const aggregateTopPlayers = (field: 'topPlayersByNetBalance' | 'topPlayersByVenueCount' | 'topPlayersByBuyIns', sortField: 'netBalance' | 'venueCount' | 'totalBuyIns') => {
      const allPlayers: TopPlayerItem[] = [];
      for (const em of filteredEntityMetrics) {
        const raw = em[field as keyof EntityPlayerMetrics] as string | object | null | undefined;
        const parsed = parseJsonFieldStatic<TopPlayerItem[]>(raw);
        if (parsed) allPlayers.push(...parsed);
      }
      const playerMap = new Map<string, TopPlayerItem>();
      for (const p of allPlayers) {
        const existing = playerMap.get(p.playerId);
        if (!existing) {
          playerMap.set(p.playerId, p);
        } else {
          const existingVal = (existing as unknown as Record<string, unknown>)[sortField] as number || 0;
          const newVal = (p as unknown as Record<string, unknown>)[sortField] as number || 0;
          if (newVal > existingVal) {
            playerMap.set(p.playerId, p);
          }
        }
      }
      return Array.from(playerMap.values())
        .sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortField] as number || 0;
          const bVal = (b as unknown as Record<string, unknown>)[sortField] as number || 0;
          return bVal - aVal;
        })
        .slice(0, 10);
    };

    // Calculate total games and avg games per player
    const totalGamesPlayed = sum('totalGamesPlayed' as keyof EntityPlayerMetrics);
    const totalActivePlayers = sum('activePlayerCount');
    const calculatedAvgGamesPerPlayer = totalActivePlayers > 0 
      ? totalGamesPlayed / totalActivePlayers 
      : 0;

    // FIX: Calculate avgNetBalancePerPlayer from totals (weighted) instead of averaging entity averages
    const totalNetBalance = sum('totalPlayerNetBalance' as keyof EntityPlayerMetrics);
    const totalPlayers = sum('totalPlayers');
    const calculatedAvgNetBalance = totalPlayers > 0 ? totalNetBalance / totalPlayers : 0;

    // FIX: Aggregate topVenuesByRegistrations from entity venueBreakdowns
    const aggregateTopVenues = (): TopVenueItem[] => {
      const venueMap = new Map<string, TopVenueItem>();
      for (const em of filteredEntityMetrics) {
        const breakdown = parseJsonFieldStatic<VenueBreakdownItem[]>(em.venueBreakdown);
        if (breakdown) {
          for (const v of breakdown) {
            const regCount = v.registrationCount || v.playerCount || 0;
            const existing = venueMap.get(v.venueId);
            if (existing) {
              existing.registrationCount += regCount;
            } else {
              venueMap.set(v.venueId, {
                venueId: v.venueId,
                venueName: v.venueName,
                registrationCount: regCount,
              });
            }
          }
        }
      }
      return Array.from(venueMap.values())
        .sort((a, b) => b.registrationCount - a.registrationCount)
        .slice(0, 10);
    };

    return {
      id: 'aggregated',
      timeRange,
      totalPlayers: totalPlayers,
      totalEntities: filteredEntityMetrics.length,
      totalVenues: sum('totalVenues'),
      activePlayerCount: sum('activePlayerCount'),
      suspendedPlayerCount: sum('suspendedPlayerCount'),
      pendingVerificationPlayerCount: sum('pendingVerificationPlayerCount'),
      trialistPlayerCount: sum('trialistPlayerCount' as keyof EntityPlayerMetrics),
      casualPlayerCount: sum('casualPlayerCount' as keyof EntityPlayerMetrics),
      committedPlayerCount: sum('committedPlayerCount' as keyof EntityPlayerMetrics),
      regularPlayerCount: sum('regularPlayerCount'),
      vipPlayerCount: sum('vipPlayerCount'),
      newPlayerCount: sum('newPlayerCount'),
      recreationalPlayerCount: sum('recreationalPlayerCount'),
      lapsedPlayerCount: sum('lapsedPlayerCount'),
      notPlayedCount: sum('notPlayedCount' as keyof EntityPlayerMetrics),
      activeELCount: sum('activeELCount' as keyof EntityPlayerMetrics),
      activeCount: sum('activeCount' as keyof EntityPlayerMetrics),
      retain31to60Count: sum('retain31to60Count' as keyof EntityPlayerMetrics),
      retain61to90Count: sum('retain61to90Count' as keyof EntityPlayerMetrics),
      churned91to120Count: sum('churned91to120Count' as keyof EntityPlayerMetrics),
      churned121to180Count: sum('churned121to180Count' as keyof EntityPlayerMetrics),
      churned181to360Count: sum('churned181to360Count' as keyof EntityPlayerMetrics),
      churned361PlusCount: sum('churned361PlusCount' as keyof EntityPlayerMetrics),
      venuePlayDistribution: {},
      entityPlayDistribution: {},
      playersMultiVenue: sum('playersMultiVenue'),
      playersMultiEntity: 0,
      playersSingleVenue: sum('playersSingleVenue'),
      playersSingleEntity: 0,
      avgVenuesPerPlayer: avg('avgVenuesPerPlayer' as keyof EntityPlayerMetrics),
      avgEntitiesPerPlayer: 0,
      maxVenuesPlayed: 0,
      maxEntitiesPlayed: 0,
      playersRegisteredLast30Days: sum('playersRegisteredLast30Days' as keyof EntityPlayerMetrics),
      playersRegisteredLast90Days: sum('playersRegisteredLast90Days' as keyof EntityPlayerMetrics),
      playersRegisteredLast365Days: 0,
      playersActiveLast30Days: sum('playersActiveLast30Days' as keyof EntityPlayerMetrics),
      playersActiveLast90Days: sum('playersActiveLast90Days' as keyof EntityPlayerMetrics),
      avgGamesPerPlayer: calculatedAvgGamesPerPlayer,
      avgNetBalancePerPlayer: calculatedAvgNetBalance,
      totalPlayerNetBalance: totalNetBalance,
      totalPlayerWinnings: sum('totalPlayerWinnings' as keyof EntityPlayerMetrics),
      totalPlayerBuyIns: sum('totalPlayerBuyIns' as keyof EntityPlayerMetrics),
      totalCreditBalance: sum('totalCreditBalance' as keyof EntityPlayerMetrics),
      totalPointsBalance: sum('totalPointsBalance' as keyof EntityPlayerMetrics),
      topEntitiesByPlayers: filteredEntityMetrics.map(em => ({
        entityId: em.entityId,
        entityName: em.entityName,
        playerCount: em.totalPlayers
      })),
      topVenuesByRegistrations: aggregateTopVenues(),
      topPlayersByNetBalance: aggregateTopPlayers('topPlayersByNetBalance', 'netBalance'),
      topPlayersByVenueCount: aggregateTopPlayers('topPlayersByVenueCount', 'venueCount'),
      topPlayersByBuyIns: aggregateTopPlayers('topPlayersByBuyIns', 'totalBuyIns'),
      calculatedAt: filteredEntityMetrics[0]?.calculatedAt || new Date().toISOString(),
    } as GlobalPlayerMetrics;
  }, [isFiltering, filteredEntityMetrics, timeRange]);

  // Use aggregated metrics when filtering, otherwise global
  const displayMetrics = isFiltering ? aggregatedMetrics : globalMetrics;

  const venueDistribution = useMemo(() => {
    return parseJsonField<Record<string, number>>(displayMetrics?.venuePlayDistribution);
  }, [displayMetrics?.venuePlayDistribution]);

  const entityDistribution = useMemo(() => {
    return parseJsonField<Record<string, number>>(displayMetrics?.entityPlayDistribution);
  }, [displayMetrics?.entityPlayDistribution]);

  const topEntities = useMemo(() => {
    const parsed = parseJsonField<TopEntityItem[]>(displayMetrics?.topEntitiesByPlayers);
    return Array.isArray(parsed) ? parsed : [];
  }, [displayMetrics?.topEntitiesByPlayers]);

  // FIX: topVenues with fallback from entity venueBreakdowns when global data is empty
  const topVenues = useMemo(() => {
    const parsed = parseJsonField<TopVenueItem[]>(displayMetrics?.topVenuesByRegistrations);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;

    // Fallback: build from entity venue breakdowns
    const sourceMetrics = filteredEntityMetrics.length > 0 ? filteredEntityMetrics : entityMetrics;
    if (sourceMetrics && sourceMetrics.length > 0) {
      const venueMap = new Map<string, TopVenueItem>();
      for (const em of sourceMetrics) {
        const breakdown = parseJsonField<VenueBreakdownItem[]>(em.venueBreakdown);
        if (breakdown) {
          for (const v of breakdown) {
            const regCount = v.registrationCount || v.playerCount || 0;
            const existing = venueMap.get(v.venueId);
            if (existing) {
              existing.registrationCount += regCount;
            } else {
              venueMap.set(v.venueId, {
                venueId: v.venueId,
                venueName: v.venueName,
                registrationCount: regCount,
              });
            }
          }
        }
      }
      const result = Array.from(venueMap.values())
        .sort((a, b) => b.registrationCount - a.registrationCount)
        .slice(0, 10);
      if (result.length > 0) return result;
    }

    return [];
  }, [displayMetrics?.topVenuesByRegistrations, filteredEntityMetrics, entityMetrics]);

  const topPlayersByBalance = useMemo(() => {
    const parsed = parseJsonField<TopPlayerItem[]>(displayMetrics?.topPlayersByNetBalance);
    return Array.isArray(parsed) ? parsed : [];
  }, [displayMetrics?.topPlayersByNetBalance]);

  const topPlayersByVenues = useMemo(() => {
    const parsed = parseJsonField<TopPlayerItem[]>(displayMetrics?.topPlayersByVenueCount);
    return Array.isArray(parsed) ? parsed : [];
  }, [displayMetrics?.topPlayersByVenueCount]);

  const topPlayersBySpending = useMemo(() => {
    const parsed = parseJsonField<TopPlayerItem[]>(displayMetrics?.topPlayersByBuyIns);
    return Array.isArray(parsed) ? parsed : [];
  }, [displayMetrics?.topPlayersByBuyIns]);

  // Calculate derived stats
  const churnedTotal = displayMetrics 
    ? (displayMetrics.churned91to120Count + displayMetrics.churned121to180Count + 
       displayMetrics.churned181to360Count + displayMetrics.churned361PlusCount)
    : 0;

  const atRiskTotal = displayMetrics
    ? (displayMetrics.retain31to60Count + displayMetrics.retain61to90Count)
    : 0;

  const churnRate = displayMetrics?.totalPlayers
    ? ((churnedTotal / displayMetrics.totalPlayers) * 100).toFixed(1)
    : '0';

  // Get category counts - uses new v2 field names with fallback to legacy fields
  const getCategoryCount = (metrics: GlobalPlayerMetrics, category: 'trialist' | 'casual' | 'committed' | 'regular' | 'vip'): number => {
    switch (category) {
      case 'trialist':
        return metrics.trialistPlayerCount ?? metrics.newPlayerCount ?? 0;
      case 'casual':
        return metrics.casualPlayerCount ?? metrics.recreationalPlayerCount ?? 0;
      case 'committed':
        return metrics.committedPlayerCount ?? 0;
      case 'regular':
        return metrics.regularPlayerCount ?? 0;
      case 'vip':
        return metrics.vipPlayerCount ?? 0;
      default:
        return 0;
    }
  };

  // Calculate Avg Games / Player correctly (only for players who have played)
  const calculateAvgGamesPerActivePlayer = (metrics: GlobalPlayerMetrics): string => {
    if (metrics.avgGamesPerPlayer != null && metrics.avgGamesPerPlayer > 0) {
      return metrics.avgGamesPerPlayer.toFixed(1);
    }
    const playersWhoPlayed = metrics.totalPlayers - metrics.notPlayedCount;
    if (playersWhoPlayed <= 0) return '0';
    return metrics.avgGamesPerPlayer?.toFixed(1) || '0';
  };

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
                  {isFiltering 
                    ? `Showing players from ${selectedEntities.length} selected ${selectedEntities.length === 1 ? 'entity' : 'entities'}`
                    : 'Comprehensive metrics across all entities and venues'
                  }
                </p>
                {lastRefresh && (
                  <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                    <ClockIcon className="h-3 w-3" />
                    Last updated: {lastRefresh.toLocaleString()}
                  </p>
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {entities.length > 1 && <MultiEntitySelector />}

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

                <button
                  onClick={refetch}
                  disabled={loading}
                  className="inline-flex items-center px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                >
                  <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

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
        {loading && !displayMetrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        )}

        {displayMetrics && (
          <>
            {/* Primary Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PrimaryStatCard
                icon={UserGroupIcon}
                title="Total Players"
                value={formatNumber(displayMetrics.totalPlayers)}
                trend={displayMetrics.playersRegisteredLast30Days > 0 ? 'up' : 'neutral'}
                trendValue={`+${displayMetrics.playersRegisteredLast30Days} this month`}
                color="indigo"
              />
              <PrimaryStatCard
                icon={CheckCircleIcon}
                title="Active Players"
                value={formatNumber(displayMetrics.activePlayerCount)}
                subtitle={`${((displayMetrics.activePlayerCount / displayMetrics.totalPlayers) * 100).toFixed(0)}% of total`}
                color="emerald"
              />
              <PrimaryStatCard
                icon={CurrencyPoundIcon}
                title="Total Net Balance"
                value={formatCurrency(displayMetrics.totalPlayerNetBalance)}
                valueColor={displayMetrics.totalPlayerNetBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}
                color="amber"
              />
              <PrimaryStatCard
                icon={BuildingOffice2Icon}
                title="Coverage"
                value={`${displayMetrics.totalEntities} ${displayMetrics.totalEntities === 1 ? 'entity' : 'entities'}`}
                subtitle={`${displayMetrics.totalVenues} venues`}
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
              {activeTab === 'overview' && displayMetrics && (
                <OverviewTab
                  globalMetrics={displayMetrics}
                  topPlayersByBalance={topPlayersByBalance}
                  topPlayersByVenues={topPlayersByVenues}
                  topPlayersBySpending={topPlayersBySpending}
                  topEntities={topEntities}
                  topVenues={topVenues}
                  navigate={navigate}
                  getCategoryCount={getCategoryCount}
                  calculateAvgGamesPerActivePlayer={calculateAvgGamesPerActivePlayer}
                />
              )}
              
              {activeTab === 'distribution' && displayMetrics && (
                <DistributionTab
                  globalMetrics={displayMetrics}
                  venueDistribution={venueDistribution}
                  entityDistribution={entityDistribution}
                  topPlayersByVenues={topPlayersByVenues}
                  navigate={navigate}
                  isFiltering={isFiltering}
                />
              )}
              
              {activeTab === 'entities' && (
                <EntitiesTab
                  entityMetrics={filteredEntityMetrics}
                />
              )}
              
              {activeTab === 'engagement' && displayMetrics && (
                <EngagementTab
                  globalMetrics={displayMetrics}
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
  indigo: 'from-indigo-500 to-indigo-600',
  emerald: 'from-emerald-500 to-emerald-600',
  amber: 'from-amber-500 to-amber-600',
  violet: 'from-violet-500 to-violet-600',
  red: 'from-red-500 to-red-600',
};

const PrimaryStatCard: React.FC<PrimaryStatCardProps> = ({
  icon: Icon,
  title,
  value,
  valueColor,
  subtitle,
  trend,
  trendValue,
  color,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <div className="flex items-center gap-3 mb-3">
      <div className={`p-2 rounded-lg bg-gradient-to-r ${colorClasses[color]}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <span className="text-sm font-medium text-gray-500">{title}</span>
    </div>
    <p className={`text-2xl font-bold ${valueColor || 'text-gray-900'}`}>{value}</p>
    {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    {trend && trendValue && (
      <div className="flex items-center gap-1 mt-2">
        {trend === 'up' ? (
          <ArrowTrendingUpIcon className="h-4 w-4 text-emerald-500" />
        ) : trend === 'down' ? (
          <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
        ) : null}
        <span className={`text-xs ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
          {trendValue}
        </span>
      </div>
    )}
  </div>
);

export default PlayersDashboard;
