// src/pages/entities/EntityDashboard.tsx
// Entity Dashboard - Shows metrics and stats for selected entities
// VERSION: 2.0.0 - Multi-entity aware with permission filtering

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEntity } from '../../contexts/EntityContext';
import { 
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  UserGroupIcon,
  TrophyIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import { cx, formatCurrency, formatDateWithDaysAgo } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { KpiCard } from '@/components/ui/KpiCard';
import { DataTable } from '@/components/ui/DataTable';
import { TimeRangeToggle, type TimeRangeKey } from '@/components/ui/TimeRangeToggle';
import { MultiEntitySelector } from '@/components/entities/MultiEntitySelector';
import { getClient } from '@/utils/apiClient';

import type { ColumnDef } from '@tanstack/react-table';
import type { Entity } from '@/types/entity';

// ============================================
// GRAPHQL QUERIES
// ============================================

const getEntityMetrics = /* GraphQL */ `
  query GetEntityMetrics(
    $entityId: ID!
    $timeRange: String!
    $seriesType: String!
  ) {
    listEntityMetrics(
      filter: {
        entityId: { eq: $entityId }
        timeRange: { eq: $timeRange }
        seriesType: { eq: $seriesType }
      }
      limit: 1
    ) {
      items {
        id
        entityId
        timeRange
        seriesType
        
        totalVenues
        activeVenues
        totalGames
        totalSeriesGames
        totalRegularGames
        totalRecurringGames
        totalOneOffGames
        
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
        
        profitTrend
        profitTrendPercent
        playerGrowthTrend
        playerGrowthTrendPercent
        
        calculatedAt
      }
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface EntityMetrics {
  id: string;
  entityId: string;
  timeRange: string;
  seriesType: string;
  
  totalVenues: number;
  activeVenues: number;
  totalGames: number;
  totalSeriesGames: number;
  totalRegularGames: number;
  totalRecurringGames: number;
  totalOneOffGames: number;
  
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
  
  profitTrend: string;
  profitTrendPercent: number;
  playerGrowthTrend: string;
  playerGrowthTrendPercent: number;
  
  calculatedAt: string | null;
}

interface EntityDisplayData {
  entity: Entity;
  metrics: EntityMetrics | null;
}

interface GlobalStats {
  totalEntities: number;
  totalVenues: number;
  activeVenues: number;
  totalGames: number;
  totalSeriesGames: number;
  totalRegularGames: number;
  totalEntries: number;
  totalUniquePlayers: number;
  totalPrizepool: number;
  totalProfit: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const valOrDash = (val: number | null | undefined, formatter?: (v: number) => string): string => {
  if (val === null || val === undefined || val === 0) return '-';
  return formatter ? formatter(val) : val.toLocaleString();
};

// ============================================
// ENTITY DASHBOARD COMPONENT
// ============================================

export function EntityDashboard() {
  const navigate = useNavigate();
  const { entities, selectedEntities, loading: entitiesLoading, hasEntityRestrictions } = useEntity();
  
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityMetricsMap, setEntityMetricsMap] = useState<Record<string, EntityMetrics | null>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchEntityMetrics = useCallback(async () => {
    if (selectedEntities.length === 0) {
      setEntityMetricsMap({});
      return;
    }

    setMetricsLoading(true);
    setError(null);

    try {
      const client = getClient();
      const metricsMap: Record<string, EntityMetrics | null> = {};

      // Fetch metrics for each selected entity
      await Promise.all(
        selectedEntities.map(async (entity) => {
          try {
            const response = await client.graphql({
              query: getEntityMetrics,
              variables: {
                entityId: entity.id,
                timeRange: timeRange,
                seriesType: 'ALL',
              },
            }) as { data?: { listEntityMetrics?: { items: EntityMetrics[] } } };

            const items = response.data?.listEntityMetrics?.items || [];
            metricsMap[entity.id] = items[0] || null;
          } catch (err) {
            console.error(`Error fetching metrics for entity ${entity.id}:`, err);
            metricsMap[entity.id] = null;
          }
        })
      );

      setEntityMetricsMap(metricsMap);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching entity metrics:', err);
      setError('Failed to load entity metrics');
    } finally {
      setMetricsLoading(false);
    }
  }, [selectedEntities, timeRange]);

  // Fetch metrics when dependencies change
  useEffect(() => {
    fetchEntityMetrics();
  }, [fetchEntityMetrics, refreshTrigger]);

  // ============================================
  // COMPUTED DATA
  // ============================================

  const { entityData, globalStats } = useMemo(() => {
    const data: EntityDisplayData[] = selectedEntities.map((entity) => ({
      entity,
      metrics: entityMetricsMap[entity.id] || null,
    }));

    const global: GlobalStats = {
      totalEntities: selectedEntities.length,
      totalVenues: 0,
      activeVenues: 0,
      totalGames: 0,
      totalSeriesGames: 0,
      totalRegularGames: 0,
      totalEntries: 0,
      totalUniquePlayers: 0,
      totalPrizepool: 0,
      totalProfit: 0,
    };

    data.forEach(({ metrics }) => {
      if (metrics) {
        global.totalVenues += metrics.totalVenues || 0;
        global.activeVenues += metrics.activeVenues || 0;
        global.totalGames += metrics.totalGames || 0;
        global.totalSeriesGames += metrics.totalSeriesGames || 0;
        global.totalRegularGames += metrics.totalRegularGames || 0;
        global.totalEntries += metrics.totalEntries || 0;
        global.totalUniquePlayers += metrics.totalUniquePlayers || 0;
        global.totalPrizepool += metrics.totalPrizepool || 0;
        global.totalProfit += metrics.totalProfit || 0;
      }
    });

    return { entityData: data, globalStats: global };
  }, [selectedEntities, entityMetricsMap]);

  // Table columns for entity comparison
  const columns: ColumnDef<EntityDisplayData>[] = useMemo(() => [
    {
      accessorKey: 'entity.entityName',
      header: 'Entity',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.entity.entityLogo ? (
            <img 
              src={row.original.entity.entityLogo} 
              alt="" 
              className="w-8 h-8 rounded-full object-cover" 
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <BuildingLibraryIcon className="w-4 h-4 text-indigo-600" />
            </div>
          )}
          <span className="font-medium">{row.original.entity.entityName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'metrics.totalVenues',
      header: 'Venues',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalVenues),
    },
    {
      accessorKey: 'metrics.totalGames',
      header: 'Games',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalGames),
    },
    {
      accessorKey: 'metrics.totalRegularGames',
      header: 'Regular',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalRegularGames),
    },
    {
      accessorKey: 'metrics.totalSeriesGames',
      header: 'Series',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalSeriesGames),
    },
    {
      accessorKey: 'metrics.totalEntries',
      header: 'Entries',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalEntries),
    },
    {
      accessorKey: 'metrics.totalPrizepool',
      header: 'Prizepool',
      cell: ({ row }) => valOrDash(row.original.metrics?.totalPrizepool, formatCurrency),
    },
    {
      accessorKey: 'metrics.totalProfit',
      header: 'Profit',
      cell: ({ row }) => {
        const val = row.original.metrics?.totalProfit;
        if (!val) return '-';
        return (
          <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(val)}
          </span>
        );
      },
    },
    {
      accessorKey: 'metrics.latestGameDate',
      header: 'Last Game',
      cell: ({ row }) => {
        const date = row.original.metrics?.latestGameDate;
        if (!date) return '-';
        // Calculate days ago from the date string
        const dateObj = new Date(date);
        const now = new Date();
        const daysAgo = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
        return formatDateWithDaysAgo(dateObj, daysAgo);
      },
    },
  ], []);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleRefresh = () => setRefreshTrigger((t) => t + 1);
  
  const handleRowClick = (data: EntityDisplayData) => {
    // Could navigate to entity details or settings
    navigate(`/settings/entity-management?entityId=${data.entity.id}`);
  };

  const loading = entitiesLoading || metricsLoading;

  // ============================================
  // RENDER: NO ENTITIES STATE
  // ============================================

  if (!entitiesLoading && entities.length === 0) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <BuildingLibraryIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            No Entities Available
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {hasEntityRestrictions
              ? 'You do not have permission to view any entities. Please contact your administrator.'
              : 'No entities have been created yet.'}
          </p>
        </Card>
      </div>
    );
  }

  // ============================================
  // RENDER: MAIN DASHBOARD
  // ============================================

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            Entities Dashboard
          </h1>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
            <ArrowPathIcon className={cx('w-4 h-4', loading && 'animate-spin')} />
          </Button>
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {entities.length > 1 && <MultiEntitySelector />}
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 mb-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500">Loading entity metrics…</p>
          </div>
        </div>
      ) : (
        <>
          {/* Global KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              title="Entities"
              value={globalStats.totalEntities}
              subtitle={`${selectedEntities.length} selected`}
              icon={<BuildingLibraryIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Venues"
              value={globalStats.totalVenues}
              subtitle={`${globalStats.activeVenues} active`}
              icon={<BuildingOffice2Icon className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Games"
              value={globalStats.totalGames.toLocaleString()}
              icon={<CalendarDaysIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Entries"
              value={globalStats.totalEntries.toLocaleString()}
              icon={<UserGroupIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Prizepool"
              value={formatCurrency(globalStats.totalPrizepool)}
              icon={<TrophyIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Profit"
              value={formatCurrency(globalStats.totalProfit)}
              icon={<CurrencyDollarIcon className="h-5 w-5" />}
            />
          </div>

          {/* Entity Cards Section */}
          <div className="mt-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              Entity Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {entityData.map(({ entity, metrics }) => (
                <Card 
                  key={entity.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/venues?entityId=${entity.id}`)}
                >
                  {/* Entity Header */}
                  <div className="flex items-center gap-3 mb-4">
                    {entity.entityLogo ? (
                      <img
                        src={entity.entityLogo}
                        alt={entity.entityName}
                        className="w-12 h-12 rounded-full object-cover border border-gray-200"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-lg font-bold text-indigo-600">
                          {entity.entityName.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                        {entity.entityName}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {entity.gameUrlDomain || 'No domain configured'}
                      </p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  {metrics ? (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500">Venues</p>
                        <p className="font-semibold">{metrics.totalVenues || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Games</p>
                        <p className="font-semibold">{metrics.totalGames || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Entries</p>
                        <p className="font-semibold">{(metrics.totalEntries || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Profit</p>
                        <p className={cx(
                          'font-semibold',
                          (metrics.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        )}>
                          {formatCurrency(metrics.totalProfit || 0)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-gray-500">
                      No metrics available
                    </div>
                  )}

                  {/* Quick Links */}
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/venues?entityId=${entity.id}`);
                      }}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors dark:bg-gray-800 dark:text-gray-300"
                    >
                      Venues →
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/games/dashboard?entityId=${entity.id}`);
                      }}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors dark:bg-gray-800 dark:text-gray-300"
                    >
                      Games →
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/players/dashboard?entityId=${entity.id}`);
                      }}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors dark:bg-gray-800 dark:text-gray-300"
                    >
                      Players →
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Comparison Table */}
          {entityData.length > 1 && (
            <div className="mt-8">
              <Card>
                <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">
                  Entity Comparison
                </h2>
                <div className="-mx-4 sm:-mx-6">
                  <DataTable
                    data={entityData}
                    columns={columns}
                    onRowClick={handleRowClick}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default EntityDashboard;