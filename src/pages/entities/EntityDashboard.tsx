// src/pages/entities/EntityDashboard.tsx
// Entity Dashboard - Shows live counters + calculated metrics for selected entities
// VERSION: 2.1.0 - Dual data source display with series type selector
//
// TWO DATA SOURCES:
// 1. Live Counters (Entity model fields) - Updated instantly via DynamoDB streams by entityVenueDashMetricCounter
// 2. Calculated Metrics (EntityMetrics model) - Updated via refreshAllMetrics Lambda on-demand
//
// This page makes both visible so users can:
// - See live stats that are always current (game counts, venue counts)
// - See rich analytics that may need refreshing (financial metrics, trends)
// - Filter by series type (ALL, REGULAR, SERIES)

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
  BoltIcon,
  CalculatorIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  Squares2X2Icon,
  CalendarIcon,
  SignalIcon,
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

// Query to get Entity with live counter fields (from entityVenueDashMetricCounter Lambda)
const getEntityWithCounters = /* GraphQL */ `
  query GetEntityWithCounters($id: ID!) {
    getEntity(id: $id) {
      id
      entityName
      entityLogo
      gameUrlDomain
      
      # Live counters (updated by DynamoDB streams via entityVenueDashMetricCounter)
      gameCount
      seriesGameCount
      venueCount
      lastGameAddedAt
      lastSeriesGameAddedAt
      lastDataRefreshedAt
    }
  }
`;

// Query to get calculated metrics (from refreshAllMetrics Lambda)
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
      limit: 100
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
        totalActiveTournamentSeries
        totalActiveRecurringGameTypes
        
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

type SeriesTypeKey = 'ALL' | 'REGULAR' | 'SERIES';

const SERIES_TYPE_OPTIONS: { key: SeriesTypeKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'ALL', label: 'All Games', icon: <Squares2X2Icon className="w-4 h-4" />, color: 'indigo' },
  { key: 'REGULAR', label: 'Regular', icon: <CalendarIcon className="w-4 h-4" />, color: 'blue' },
  { key: 'SERIES', label: 'Series', icon: <TrophyIcon className="w-4 h-4" />, color: 'purple' }
];

// Live counters from Entity model (entityVenueDashMetricCounter Lambda)
interface EntityCounters {
  id: string;
  entityName: string;
  entityLogo?: string;
  gameUrlDomain?: string;
  gameCount: number;
  seriesGameCount: number;
  venueCount: number;
  lastGameAddedAt: string | null;
  lastSeriesGameAddedAt: string | null;
  lastDataRefreshedAt: string | null;
}

// Calculated metrics from EntityMetrics model (refreshAllMetrics Lambda)
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
  totalActiveTournamentSeries: number;
  totalActiveRecurringGameTypes: number;
  
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
  counters: EntityCounters | null;
  metrics: EntityMetrics | null;
}

interface GlobalStats {
  totalEntities: number;
  // From live counters
  liveGameCount: number;
  liveSeriesGameCount: number;
  liveVenueCount: number;
  // From calculated metrics
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
// HELPER COMPONENTS
// ============================================

const valOrDash = (val: number | null | undefined, formatter?: (v: number) => string): string => {
  if (val === null || val === undefined || val === 0) return '-';
  return formatter ? formatter(val) : val.toLocaleString();
};

function TrendIndicator({ trend, percent }: { trend: string; percent: number }) {
  if (!trend || trend === 'stable' || trend === 'neutral') {
    return <MinusIcon className="w-4 h-4 text-gray-400" />;
  }
  if (trend === 'up') {
    return (
      <span className="flex items-center gap-1 text-green-600">
        <ArrowTrendingUpIcon className="w-4 h-4" />
        <span className="text-xs font-medium">+{percent?.toFixed(1)}%</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-red-600">
      <ArrowTrendingDownIcon className="w-4 h-4" />
      <span className="text-xs font-medium">{percent?.toFixed(1)}%</span>
    </span>
  );
}

// Series Type Selector - Segmented button style
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
            className={cx(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              colorStyles[option.color as keyof typeof colorStyles]
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

// Live indicator badge
const LiveBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
    Live
  </span>
);

// Calculated indicator badge
const CalcBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 border border-gray-200">
    <CalculatorIcon className="w-3 h-3" />
    Calc
  </span>
);

// ============================================
// ENTITY CARD COMPONENT
// ============================================

interface EntityCardProps {
  entity: Entity;
  counters: EntityCounters | null;
  metrics: EntityMetrics | null;
  seriesType: SeriesTypeKey;
  onNavigate: (entityId: string) => void;
}

const EntityCard: React.FC<EntityCardProps> = ({ entity, counters, metrics, seriesType, onNavigate }) => {
  const navigate = useNavigate();
  
  // Color scheme based on series type
  const colorScheme = {
    ALL: { border: 'border-slate-200', headerBg: '', accent: 'indigo' },
    REGULAR: { border: 'border-blue-200', headerBg: 'bg-blue-50/30', accent: 'blue' },
    SERIES: { border: 'border-purple-200', headerBg: 'bg-purple-50/30', accent: 'purple' }
  }[seriesType];

  // Derive regular game count from live counters
  const regularGameCount = counters ? (counters.gameCount || 0) - (counters.seriesGameCount || 0) : 0;

  // Display count based on series type filter
  const displayGameCount = seriesType === 'ALL' 
    ? counters?.gameCount || 0
    : seriesType === 'SERIES'
      ? counters?.seriesGameCount || 0
      : regularGameCount;

  return (
    <Card 
      className={cx(
        "hover:shadow-md transition-shadow cursor-pointer",
        colorScheme.border
      )}
      onClick={() => onNavigate(entity.id)}
    >
      {/* Entity Header */}
      <div className={cx("flex items-center gap-3 mb-4 -mx-4 -mt-4 p-4 border-b", colorScheme.headerBg, colorScheme.border)}>
        {entity.entityLogo ? (
          <img
            src={entity.entityLogo}
            alt={entity.entityName}
            className="w-12 h-12 rounded-full object-cover border border-gray-200"
          />
        ) : (
          <div className={cx(
            "w-12 h-12 rounded-full flex items-center justify-center",
            seriesType === 'SERIES' ? 'bg-purple-100' : seriesType === 'REGULAR' ? 'bg-blue-100' : 'bg-indigo-100'
          )}>
            <span className={cx(
              "text-lg font-bold",
              seriesType === 'SERIES' ? 'text-purple-600' : seriesType === 'REGULAR' ? 'text-blue-600' : 'text-indigo-600'
            )}>
              {entity.entityName.substring(0, 2).toUpperCase()}
            </span>
          </div>
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">
            {entity.entityName}
          </h3>
          <p className="text-xs text-gray-500">
            {entity.gameUrlDomain || 'No domain configured'}
          </p>
        </div>
      </div>

      {/* Live Counters Section */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <BoltIcon className="w-4 h-4 text-green-500" />
          <span className="text-xs font-medium text-gray-700">Live Stats</span>
          <LiveBadge />
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">
              {seriesType === 'ALL' ? 'Games' : seriesType === 'SERIES' ? 'Series' : 'Regular'}
            </p>
            <p className={cx(
              "font-bold text-lg",
              seriesType === 'SERIES' ? 'text-purple-600' : seriesType === 'REGULAR' ? 'text-blue-600' : 'text-gray-900'
            )}>
              {displayGameCount}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Venues</p>
            <p className="font-bold text-lg text-gray-900">{counters?.venueCount || 0}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Last Game Added</p>
            <p className="font-bold text-sm text-gray-900">
              {counters?.lastGameAddedAt 
                ? formatDateWithDaysAgo(new Date(counters.lastGameAddedAt), Math.floor((Date.now() - new Date(counters.lastGameAddedAt).getTime()) / (1000 * 60 * 60 * 24)))
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Calculated Metrics Section */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center gap-2 mb-2">
          <CalculatorIcon className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Analytics</span>
          <CalcBadge />
        </div>
        
        {metrics ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Entries</p>
              <div className="flex items-center gap-1">
                <p className="font-semibold">{(metrics.totalEntries || 0).toLocaleString()}</p>
                {metrics.playerGrowthTrend && (
                  <TrendIndicator trend={metrics.playerGrowthTrend} percent={metrics.playerGrowthTrendPercent} />
                )}
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Prizepool</p>
              <p className="font-semibold">{formatCurrency(metrics.totalPrizepool || 0)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Revenue</p>
              <p className="font-semibold">{formatCurrency(metrics.totalRevenue || 0)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Profit</p>
              <div className="flex items-center gap-1">
                <p className={cx(
                  'font-semibold',
                  (metrics.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {formatCurrency(metrics.totalProfit || 0)}
                </p>
                {metrics.profitTrend && (
                  <TrendIndicator trend={metrics.profitTrend} percent={metrics.profitTrendPercent} />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-3 text-center text-xs text-gray-400">
            No calculated metrics available
          </div>
        )}
        
        {metrics?.calculatedAt && (
          <p className="mt-2 text-xs text-gray-400 text-right">
            Calculated: {new Date(metrics.calculatedAt).toLocaleString()}
          </p>
        )}
      </div>

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
  );
};

// ============================================
// ENTITY DASHBOARD COMPONENT
// ============================================

export function EntityDashboard() {
  const navigate = useNavigate();
  const { entities, selectedEntities, loading: entitiesLoading, hasEntityRestrictions } = useEntity();
  
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');
  const [seriesType, setSeriesType] = useState<SeriesTypeKey>('ALL');
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entityCountersMap, setEntityCountersMap] = useState<Record<string, EntityCounters | null>>({});
  const [entityMetricsMap, setEntityMetricsMap] = useState<Record<string, EntityMetrics | null>>({});
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchData = useCallback(async () => {
    
    if (selectedEntities.length === 0) {
      setEntityCountersMap({});
      setEntityMetricsMap({});
      return;
    }

    setMetricsLoading(true);
    setError(null);

    try {
      const client = getClient();
      const countersMap: Record<string, EntityCounters | null> = {};
      const metricsMap: Record<string, EntityMetrics | null> = {};

      // Fetch both counters and metrics for each selected entity
      await Promise.all(
        selectedEntities.map(async (entity) => {
          try {
            // Fetch live counters from Entity model
            const countersResponse = await client.graphql({
              query: getEntityWithCounters,
              variables: { id: entity.id },
            }) as { data?: { getEntity?: EntityCounters } };

            countersMap[entity.id] = countersResponse.data?.getEntity || null;

            console.log('[EntityDashboard] Querying metrics:', {
                entityId: entity.id,
                timeRange,
                seriesType
            });

            // Fetch calculated metrics from EntityMetrics model
            const metricsResponse = await client.graphql({
            query: getEntityMetrics,
            variables: {
                entityId: entity.id,
                timeRange: timeRange,
                seriesType: seriesType,
            },
            }) as { data?: { listEntityMetrics?: { items: EntityMetrics[] } } };

            console.log('[EntityDashboard] Metrics response:', metricsResponse);

            const items = metricsResponse.data?.listEntityMetrics?.items || [];
            console.log('[EntityDashboard] Found items:', items.length, items);
            metricsMap[entity.id] = items[0] || null;
          } catch (err) {
            console.error(`Error fetching data for entity ${entity.id}:`, err);
            countersMap[entity.id] = null;
            metricsMap[entity.id] = null;
          }
        })
      );

      setEntityCountersMap(countersMap);
      setEntityMetricsMap(metricsMap);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching entity data:', err);
      setError('Failed to load entity data');
    } finally {
      setMetricsLoading(false);
    }
  }, [selectedEntities, timeRange, seriesType]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  // ============================================
  // COMPUTED DATA
  // ============================================

  const { entityData, globalStats } = useMemo(() => {
    const data: EntityDisplayData[] = selectedEntities.map((entity) => ({
      entity,
      counters: entityCountersMap[entity.id] || null,
      metrics: entityMetricsMap[entity.id] || null,
    }));

    const global: GlobalStats = {
      totalEntities: selectedEntities.length,
      // Live counters
      liveGameCount: 0,
      liveSeriesGameCount: 0,
      liveVenueCount: 0,
      // Calculated metrics
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

    data.forEach(({ counters, metrics }) => {
      // Aggregate live counters
      if (counters) {
        global.liveGameCount += counters.gameCount || 0;
        global.liveSeriesGameCount += counters.seriesGameCount || 0;
        global.liveVenueCount += counters.venueCount || 0;
      }
      // Aggregate calculated metrics
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
  }, [selectedEntities, entityCountersMap, entityMetricsMap]);

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
      accessorKey: 'counters.venueCount',
      header: () => <span className="flex items-center gap-1"><SignalIcon className="w-3 h-3 text-green-500" /> Venues</span>,
      cell: ({ row }) => valOrDash(row.original.counters?.venueCount),
    },
    {
      accessorKey: 'counters.gameCount',
      header: () => <span className="flex items-center gap-1"><SignalIcon className="w-3 h-3 text-green-500" /> Games</span>,
      cell: ({ row }) => valOrDash(row.original.counters?.gameCount),
    },
    {
      accessorKey: 'counters.seriesGameCount',
      header: () => <span className="flex items-center gap-1"><SignalIcon className="w-3 h-3 text-green-500" /> Series</span>,
      cell: ({ row }) => valOrDash(row.original.counters?.seriesGameCount),
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
      accessorKey: 'counters.lastGameAddedAt',
      header: 'Last Game',
      cell: ({ row }) => {
        const date = row.original.counters?.lastGameAddedAt;
        if (!date) return '-';
        const dateObj = new Date(date);
        const daysAgo = Math.floor((Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
        return formatDateWithDaysAgo(dateObj, daysAgo);
      },
    },
  ], []);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleRefresh = () => setRefreshTrigger((t) => t + 1);
  
  const handleRowClick = (data: EntityDisplayData) => {
    navigate(`/venues?entityId=${data.entity.id}`);
  };

  const handleNavigate = (entityId: string) => {
    navigate(`/venues?entityId=${entityId}`);
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
        
        <div className="flex flex-wrap items-center gap-3">
          <SeriesTypeSelector value={seriesType} onChange={setSeriesType} />
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
            <p className="mt-4 text-sm text-gray-500">Loading entity data…</p>
          </div>
        </div>
      ) : (
        <>
          {/* Global KPI Cards - Two Rows */}
          <div className="space-y-4">
            {/* Live Stats Row */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BoltIcon className="w-4 h-4 text-green-500" />
                <span className="text-xs font-medium text-gray-700">Live Stats</span>
                <LiveBadge />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                <KpiCard
                  title="Entities"
                  value={globalStats.totalEntities}
                  subtitle={`${selectedEntities.length} selected`}
                  icon={<BuildingLibraryIcon className="h-5 w-5" />}
                />
                <KpiCard
                  title="Venues"
                  value={globalStats.liveVenueCount}
                  icon={<BuildingOffice2Icon className="h-5 w-5" />}
                />
                <KpiCard
                  title="Regular Games"
                  value={(globalStats.liveGameCount - globalStats.liveSeriesGameCount).toLocaleString()}
                  icon={<CalendarDaysIcon className="h-5 w-5 text-blue-500" />}
                />
                <KpiCard
                  title="Series Games"
                  value={globalStats.liveSeriesGameCount.toLocaleString()}
                  icon={<TrophyIcon className="h-5 w-5 text-purple-500" />}
                />
              </div>
            </div>

            {/* Calculated Stats Row */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CalculatorIcon className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-700">
                  Calculated Analytics ({seriesType === 'ALL' ? 'All Games' : seriesType === 'REGULAR' ? 'Regular Only' : 'Series Only'})
                </span>
                <CalcBadge />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                <KpiCard
                  title="Total Entries"
                  value={globalStats.totalEntries.toLocaleString()}
                  icon={<UserGroupIcon className="h-5 w-5" />}
                />
                <KpiCard
                  title="Unique Players"
                  value={globalStats.totalUniquePlayers.toLocaleString()}
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
            </div>
          </div>

          {/* Entity Cards Section */}
          <div className="mt-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              Entity Overview
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {entityData.map(({ entity, counters, metrics }) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  counters={counters}
                  metrics={metrics}
                  seriesType={seriesType}
                  onNavigate={handleNavigate}
                />
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
                <p className="text-xs text-gray-500 mb-4">
                  <SignalIcon className="w-3 h-3 inline text-green-500" /> = Live counters, other columns = Calculated metrics
                </p>
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