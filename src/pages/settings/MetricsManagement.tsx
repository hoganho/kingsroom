// src/pages/settings/MetricsManagement.tsx
// Admin page for managing calculated metrics (EntityMetrics, VenueMetrics, RecurringGameMetrics, TournamentSeriesMetrics)
// VERSION: 2.0.0 - Added seriesType dimension and TournamentSeriesMetrics support

import React, { useState, useEffect, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { useEntity } from '../../contexts/EntityContext';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  ArrowPathIcon,
  ChartBarIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CpuChipIcon,
  DocumentChartBarIcon,
  PlayIcon,
  ArrowsPointingInIcon,
  TrophyIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

// ============================================
// CLIENT INITIALIZATION (Lazy to ensure Amplify is configured)
// ============================================
let _client: any = null;
const getClient = () => {
  if (!_client) {
    _client = generateClient();
  }
  return _client;
};

// ============================================
// TYPES
// ============================================

interface MetricsStatus {
  entityId: string;
  entityName: string;
  lastCalculatedAt: string | null;
  recordCounts: {
    entityMetrics: number;
    venueMetrics: number;
    recurringGameMetrics: number;
    tournamentSeriesMetrics: number;
  };
  health: 'healthy' | 'stale' | 'missing';
}

interface RefreshResult {
  success: boolean;
  message: string;
  entityMetricsUpdated: number;
  venueMetricsUpdated: number;
  recurringGameMetricsUpdated: number;
  tournamentSeriesMetricsUpdated: number;
  executionTimeMs: number;
  errors: string[];
  warnings: string[];
  bySeriesType?: {
    ALL: { entity: number; venue: number };
    SERIES: { entity: number; venue: number; tournamentSeries: number };
    REGULAR: { entity: number; venue: number; recurringGame: number };
  };
}

interface JobProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  phase: string;
  progress: number;
  currentEntity?: string;
  startedAt?: Date;
  completedAt?: Date;
  result?: RefreshResult;
}

type TimeRangeKey = 'ALL' | '12M' | '6M' | '3M' | '1M';
type SeriesTypeKey = 'ALL' | 'SERIES' | 'REGULAR';
type MetricsScope = 'all' | 'entity' | 'venue';

// ============================================
// GRAPHQL QUERIES & MUTATIONS
// ============================================

const listEntityMetricsStatus = /* GraphQL */ `
  query ListEntityMetricsStatus($filter: ModelEntityMetricsFilterInput, $limit: Int) {
    listEntityMetrics(filter: $filter, limit: $limit) {
      items {
        id
        entityId
        timeRange
        seriesType
        calculatedAt
        totalVenues
        totalGames
        totalSeriesGames
        totalRegularGames
      }
    }
  }
`;

const listVenueMetricsStatus = /* GraphQL */ `
  query ListVenueMetricsStatus($filter: ModelVenueMetricsFilterInput, $limit: Int) {
    listVenueMetrics(filter: $filter, limit: $limit) {
      items {
        id
        entityId
        venueId
        venueName
        timeRange
        seriesType
        calculatedAt
      }
    }
  }
`;

const listRecurringGameMetricsStatus = /* GraphQL */ `
  query ListRecurringGameMetricsStatus($filter: ModelRecurringGameMetricsFilterInput, $limit: Int) {
    listRecurringGameMetrics(filter: $filter, limit: $limit) {
      items {
        id
        entityId
        venueId
        recurringGameId
        recurringGameName
        timeRange
        seriesType
        calculatedAt
      }
    }
  }
`;

const listTournamentSeriesMetricsStatus = /* GraphQL */ `
  query ListTournamentSeriesMetricsStatus($filter: ModelTournamentSeriesMetricsFilterInput, $limit: Int) {
    listTournamentSeriesMetrics(filter: $filter, limit: $limit) {
      items {
        id
        entityId
        tournamentSeriesId
        seriesName
        timeRange
        seriesType
        calculatedAt
        totalEvents
      }
    }
  }
`;

const refreshAllMetricsMutation = /* GraphQL */ `
  mutation RefreshAllMetrics($input: RefreshAllMetricsInput!) {
    refreshAllMetrics(input: $input) {
      success
      message
      entityMetricsUpdated
      venueMetricsUpdated
      recurringGameMetricsUpdated
      tournamentSeriesMetricsUpdated
      entitiesProcessed
      venuesProcessed
      recurringGamesProcessed
      tournamentSeriesProcessed
      snapshotsAnalyzed
      executionTimeMs
      errors
      warnings
      refreshedAt
      bySeriesType {
        ALL {
          entity
          venue
        }
        SERIES {
          entity
          venue
          tournamentSeries
        }
        REGULAR {
          entity
          venue
          recurringGame
        }
      }
    }
  }
`;

// ============================================
// HELPER COMPONENTS
// ============================================

const StatusBadge: React.FC<{ health: 'healthy' | 'stale' | 'missing' }> = ({ health }) => {
  const styles = {
    healthy: 'bg-green-100 text-green-800 border-green-200',
    stale: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    missing: 'bg-red-100 text-red-800 border-red-200'
  };
  const labels = {
    healthy: 'Up to date',
    stale: 'Needs refresh',
    missing: 'No metrics'
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[health]}`}>
      {labels[health]}
    </span>
  );
};

const ProgressBar: React.FC<{ progress: number; phase: string }> = ({ progress, phase }) => (
  <div className="w-full">
    <div className="flex justify-between text-sm mb-1">
      <span className="text-gray-600 dark:text-gray-400">{phase}</span>
      <span className="text-gray-900 dark:text-gray-100 font-medium">{Math.round(progress)}%</span>
    </div>
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
      <div
        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);

const MetricCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}> = ({ icon, title, value, subtitle, trend: _trend }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
    </div>
  </div>
);

const TimeRangeSelector: React.FC<{
  selected: TimeRangeKey[];
  onChange: (ranges: TimeRangeKey[]) => void;
}> = ({ selected, onChange }) => {
  const ranges: TimeRangeKey[] = ['ALL', '12M', '6M', '3M', '1M'];

  const toggleRange = (range: TimeRangeKey) => {
    if (selected.includes(range)) {
      onChange(selected.filter(r => r !== range));
    } else {
      onChange([...selected, range]);
    }
  };

  const selectAll = () => onChange(ranges);
  const selectNone = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Time Ranges
        </label>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={selectNone}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {ranges.map(range => (
          <button
            key={range}
            onClick={() => toggleRange(range)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              selected.includes(range)
                ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
};

const SeriesTypeSelector: React.FC<{
  selected: SeriesTypeKey[];
  onChange: (types: SeriesTypeKey[]) => void;
}> = ({ selected, onChange }) => {
  const types: { key: SeriesTypeKey; label: string; description: string }[] = [
    { key: 'ALL', label: 'Combined', description: 'All games' },
    { key: 'SERIES', label: 'Series', description: 'Tournament series' },
    { key: 'REGULAR', label: 'Regular', description: 'Recurring games' }
  ];

  const toggleType = (type: SeriesTypeKey) => {
    if (selected.includes(type)) {
      onChange(selected.filter(t => t !== type));
    } else {
      onChange([...selected, type]);
    }
  };

  const selectAll = () => onChange(['ALL', 'SERIES', 'REGULAR']);
  const selectNone = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Series Types
        </label>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={selectNone}
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            None
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {types.map(({ key, label, description }) => (
          <button
            key={key}
            onClick={() => toggleType(key)}
            title={description}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              selected.includes(key)
                ? key === 'SERIES' 
                  ? 'bg-purple-100 border-purple-300 text-purple-700'
                  : key === 'REGULAR'
                  ? 'bg-blue-100 border-blue-300 text-blue-700'
                  : 'bg-indigo-100 border-indigo-300 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Creates separate metrics records for series vs regular games
      </p>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function MetricsManagement() {
  const { selectedEntities, entities } = useEntity();

  // State
  const [metricsStatus, setMetricsStatus] = useState<MetricsStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobProgress, setJobProgress] = useState<JobProgress>({ status: 'idle', phase: '', progress: 0 });

  // Refresh options
  const [scope, setScope] = useState<MetricsScope>('all');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedVenueId, _setSelectedVenueId] = useState<string>('');
  const [selectedTimeRanges, setSelectedTimeRanges] = useState<TimeRangeKey[]>(['ALL', '12M', '6M', '3M', '1M']);
  const [selectedSeriesTypes, setSelectedSeriesTypes] = useState<SeriesTypeKey[]>(['ALL', 'SERIES', 'REGULAR']);
  const [includeEntityMetrics, setIncludeEntityMetrics] = useState(true);
  const [includeVenueMetrics, setIncludeVenueMetrics] = useState(true);
  const [includeRecurringGameMetrics, setIncludeRecurringGameMetrics] = useState(true);
  const [includeTournamentSeriesMetrics, setIncludeTournamentSeriesMetrics] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  // Totals
  const [totals, setTotals] = useState({
    entityMetrics: 0,
    venueMetrics: 0,
    recurringGameMetrics: 0,
    tournamentSeriesMetrics: 0,
    lastRefresh: null as Date | null
  });

  // ============================================
  // FETCH METRICS STATUS
  // ============================================

  const fetchMetricsStatus = useCallback(async () => {
    if (entities.length === 0) return;

    setLoading(true);
    try {
      const entityIds = selectedEntities.length > 0
        ? selectedEntities.map(e => e.id)
        : entities.map(e => e.id);

      // Fetch EntityMetrics counts
      const entityMetricsResults = await Promise.all(
        entityIds.map(async entityId => {
          const filter = { entityId: { eq: entityId } };
          const response = await getClient().graphql({
            query: listEntityMetricsStatus,
            variables: { filter, limit: 100 }
          }) as GraphQLResult<any>;

          const items = response.data?.listEntityMetrics?.items || [];
          return { entityId, items };
        })
      );

      // Fetch VenueMetrics counts
      const venueMetricsResults = await Promise.all(
        entityIds.map(async entityId => {
          const filter = { entityId: { eq: entityId } };
          const response = await getClient().graphql({
            query: listVenueMetricsStatus,
            variables: { filter, limit: 1000 }
          }) as GraphQLResult<any>;

          const items = response.data?.listVenueMetrics?.items || [];
          return { entityId, items };
        })
      );

      // Fetch RecurringGameMetrics counts
      const recurringGameMetricsResults = await Promise.all(
        entityIds.map(async entityId => {
          const filter = { entityId: { eq: entityId } };
          const response = await getClient().graphql({
            query: listRecurringGameMetricsStatus,
            variables: { filter, limit: 1000 }
          }) as GraphQLResult<any>;

          const items = response.data?.listRecurringGameMetrics?.items || [];
          return { entityId, items };
        })
      );

      // Fetch TournamentSeriesMetrics counts
      const tournamentSeriesMetricsResults = await Promise.all(
        entityIds.map(async entityId => {
          const filter = { entityId: { eq: entityId } };
          const response = await getClient().graphql({
            query: listTournamentSeriesMetricsStatus,
            variables: { filter, limit: 500 }
          }) as GraphQLResult<any>;

          const items = response.data?.listTournamentSeriesMetrics?.items || [];
          return { entityId, items };
        })
      );

      // Build status for each entity
      const status: MetricsStatus[] = entityIds.map(entityId => {
        const entity = entities.find(e => e.id === entityId);
        const entityMetrics = entityMetricsResults.find(r => r.entityId === entityId)?.items || [];
        const venueMetrics = venueMetricsResults.find(r => r.entityId === entityId)?.items || [];
        const recurringGameMetrics = recurringGameMetricsResults.find(r => r.entityId === entityId)?.items || [];
        const tournamentSeriesMetrics = tournamentSeriesMetricsResults.find(r => r.entityId === entityId)?.items || [];

        // Find most recent calculation
        const allMetrics = [...entityMetrics, ...venueMetrics, ...recurringGameMetrics, ...tournamentSeriesMetrics];
        const latestCalc = allMetrics
          .map(m => m.calculatedAt)
          .filter(Boolean)
          .sort()
          .reverse()[0] || null;

        // Determine health
        let health: 'healthy' | 'stale' | 'missing' = 'missing';
        if (latestCalc) {
          const hoursSince = (Date.now() - new Date(latestCalc).getTime()) / (1000 * 60 * 60);
          health = hoursSince < 24 ? 'healthy' : 'stale';
        }

        return {
          entityId,
          entityName: entity?.entityName || 'Unknown',
          lastCalculatedAt: latestCalc,
          recordCounts: {
            entityMetrics: entityMetrics.length,
            venueMetrics: venueMetrics.length,
            recurringGameMetrics: recurringGameMetrics.length,
            tournamentSeriesMetrics: tournamentSeriesMetrics.length
          },
          health
        };
      });

      setMetricsStatus(status);

      // Calculate totals
      const totalEntityMetrics = status.reduce((sum, s) => sum + s.recordCounts.entityMetrics, 0);
      const totalVenueMetrics = status.reduce((sum, s) => sum + s.recordCounts.venueMetrics, 0);
      const totalRecurringGameMetrics = status.reduce((sum, s) => sum + s.recordCounts.recurringGameMetrics, 0);
      const totalTournamentSeriesMetrics = status.reduce((sum, s) => sum + s.recordCounts.tournamentSeriesMetrics, 0);
      const lastRefresh = status
        .map(s => s.lastCalculatedAt)
        .filter(Boolean)
        .sort()
        .reverse()[0];

      setTotals({
        entityMetrics: totalEntityMetrics,
        venueMetrics: totalVenueMetrics,
        recurringGameMetrics: totalRecurringGameMetrics,
        tournamentSeriesMetrics: totalTournamentSeriesMetrics,
        lastRefresh: lastRefresh ? new Date(lastRefresh) : null
      });
    } catch (error) {
      console.error('Error fetching metrics status:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedEntities, entities]);

  useEffect(() => {
    fetchMetricsStatus();
  }, [fetchMetricsStatus]);

  // ============================================
  // REFRESH METRICS
  // ============================================
  const handleRefreshMetrics = async () => {
    setJobProgress({
      status: 'running',
      phase: 'Initializing...',
      progress: 0,
      startedAt: new Date()
    });

    try {
      // Build input based on scope
      const input: any = {
        timeRanges: selectedTimeRanges,
        seriesTypes: selectedSeriesTypes,
        includeEntityMetrics,
        includeVenueMetrics,
        includeRecurringGameMetrics,
        includeTournamentSeriesMetrics,
        dryRun
      };

      if (scope === 'entity' && selectedEntityId) {
        input.entityId = selectedEntityId;
      } else if (scope === 'venue' && selectedVenueId) {
        input.venueId = selectedVenueId;
      }

      setJobProgress(prev => ({ ...prev, phase: 'Fetching game data...', progress: 10 }));

      console.log('[MetricsManagement] Sending input:', input);

      const response = await getClient().graphql({
        query: refreshAllMetricsMutation,
        variables: { input }
      }) as GraphQLResult<any>;

      console.log('[MetricsManagement] Raw Response:', response);

      if (!response || !response.data) {
        throw new Error('No data received from backend');
      }

      const result = response.data.refreshAllMetrics;

      if (!result) {
        throw new Error('Received null result from refreshAllMetrics function');
      }

      if (result.success) {
        setJobProgress({
          status: 'completed',
          phase: 'Complete!',
          progress: 100,
          completedAt: new Date(),
          result: {
            success: true,
            message: result.message || 'Metrics refreshed successfully',
            entityMetricsUpdated: result.entityMetricsUpdated || 0,
            venueMetricsUpdated: result.venueMetricsUpdated || 0,
            recurringGameMetricsUpdated: result.recurringGameMetricsUpdated || 0,
            tournamentSeriesMetricsUpdated: result.tournamentSeriesMetricsUpdated || 0,
            executionTimeMs: result.executionTimeMs || 0,
            errors: result.errors || [],
            warnings: result.warnings || [],
            bySeriesType: result.bySeriesType
          }
        });

        // Refresh status after successful update
        fetchMetricsStatus();
      } else {
        throw new Error(result.message || 'Refresh failed');
      }
    } catch (error: any) {
      console.error('Error refreshing metrics:', error);
      setJobProgress({
        status: 'error',
        phase: 'Error',
        progress: 0,
        result: {
          success: false,
          message: error.message || 'An error occurred',
          entityMetricsUpdated: 0,
          venueMetricsUpdated: 0,
          recurringGameMetricsUpdated: 0,
          tournamentSeriesMetricsUpdated: 0,
          executionTimeMs: 0,
          errors: [error.message || 'Unknown error'],
          warnings: []
        }
      });
    }
  };

  const resetJob = () => {
    setJobProgress({ status: 'idle', phase: '', progress: 0 });
  };

  // Calculate expected record count
  const expectedRecords = selectedTimeRanges.length * selectedSeriesTypes.length;

  // ============================================
  // RENDER
  // ============================================

  return (
    <PageWrapper title="Metrics Management">
      {/* ============ HEADER WITH REFRESH BUTTON ============ */}
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage pre-calculated metrics for dashboards. Now with series vs regular game partitioning.
        </p>
        <Button
          variant="secondary"
          onClick={fetchMetricsStatus}
          disabled={loading}
        >
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      {/* ============ SUMMARY CARDS ============ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard
          icon={<ChartBarIcon className="w-5 h-5" />}
          title="Entity Metrics"
          value={totals.entityMetrics}
          subtitle={`${expectedRecords} per entity`}
        />
        <MetricCard
          icon={<BuildingOffice2Icon className="w-5 h-5" />}
          title="Venue Metrics"
          value={totals.venueMetrics}
          subtitle={`${expectedRecords} per venue`}
        />
        <MetricCard
          icon={<CalendarIcon className="w-5 h-5" />}
          title="Recurring Games"
          value={totals.recurringGameMetrics}
          subtitle="5 time ranges each"
        />
        <MetricCard
          icon={<TrophyIcon className="w-5 h-5" />}
          title="Tournament Series"
          value={totals.tournamentSeriesMetrics}
          subtitle="5 time ranges each"
        />
        <MetricCard
          icon={<ClockIcon className="w-5 h-5" />}
          title="Last Refresh"
          value={totals.lastRefresh ? formatDistanceToNow(totals.lastRefresh, { addSuffix: true }) : 'Never'}
          subtitle={totals.lastRefresh ? totals.lastRefresh.toLocaleString() : ''}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============ REFRESH CONTROLS ============ */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <CpuChipIcon className="w-5 h-5 text-indigo-500" />
              Refresh Metrics
            </h2>

            {jobProgress.status === 'idle' ? (
              <div className="space-y-6">
                {/* Scope Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Scope
                  </label>
                  <div className="flex gap-2">
                    {(['all', 'entity', 'venue'] as MetricsScope[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setScope(s)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex-1 ${
                          scope === s
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {s === 'all' ? 'All Entities' : s === 'entity' ? 'Single Entity' : 'Single Venue'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entity Selector (if scope is 'entity') */}
                {scope === 'entity' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                      Select Entity
                    </label>
                    <select
                      value={selectedEntityId}
                      onChange={e => setSelectedEntityId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="">Choose an entity...</option>
                      {entities.map(e => (
                        <option key={e.id} value={e.id}>{e.entityName}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Time Range Selection */}
                <TimeRangeSelector
                  selected={selectedTimeRanges}
                  onChange={setSelectedTimeRanges}
                />

                {/* Series Type Selection */}
                <SeriesTypeSelector
                  selected={selectedSeriesTypes}
                  onChange={setSelectedSeriesTypes}
                />

                {/* Metrics Type Selection */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
                    Include Metrics
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeEntityMetrics}
                        onChange={e => setIncludeEntityMetrics(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Entity Metrics</span>
                      <span className="text-xs text-gray-400">(by seriesType)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeVenueMetrics}
                        onChange={e => setIncludeVenueMetrics(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Venue Metrics</span>
                      <span className="text-xs text-gray-400">(by seriesType)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeRecurringGameMetrics}
                        onChange={e => setIncludeRecurringGameMetrics(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Recurring Game Metrics</span>
                      <span className="text-xs text-gray-400">(REGULAR only)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeTournamentSeriesMetrics}
                        onChange={e => setIncludeTournamentSeriesMetrics(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">Tournament Series Metrics</span>
                      <span className="text-xs text-gray-400">(SERIES only)</span>
                    </label>
                  </div>
                </div>

                {/* Dry Run Option */}
                <label className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={e => setDryRun(e.target.checked)}
                    className="rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-yellow-800">Dry Run</span>
                    <p className="text-xs text-yellow-600">Preview what would be updated without saving</p>
                  </div>
                </label>

                {/* Start Button */}
                <Button
                  variant="primary"
                  onClick={handleRefreshMetrics}
                  disabled={
                    selectedTimeRanges.length === 0 || 
                    selectedSeriesTypes.length === 0 ||
                    (!includeEntityMetrics && !includeVenueMetrics && !includeRecurringGameMetrics && !includeTournamentSeriesMetrics)
                  }
                  className="w-full"
                >
                  <PlayIcon className="w-4 h-4 mr-2" />
                  {dryRun ? 'Preview Refresh' : 'Start Refresh'}
                </Button>
              </div>
            ) : jobProgress.status === 'running' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                  <span className="text-sm font-medium text-gray-700">Refreshing metrics...</span>
                </div>
                <ProgressBar progress={jobProgress.progress} phase={jobProgress.phase} />
                {jobProgress.currentEntity && (
                  <p className="text-xs text-gray-500">Processing: {jobProgress.currentEntity}</p>
                )}
              </div>
            ) : (
              /* Completed or Error */
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-4 rounded-lg ${
                  jobProgress.status === 'completed' 
                    ? 'bg-green-50 border border-green-200' 
                    : 'bg-red-50 border border-red-200'
                }`}>
                  {jobProgress.status === 'completed' ? (
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  ) : (
                    <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      jobProgress.status === 'completed' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {jobProgress.status === 'completed' ? 'Refresh Complete!' : 'Refresh Failed'}
                    </p>
                    <p className={`text-sm ${
                      jobProgress.status === 'completed' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {jobProgress.result?.message}
                    </p>
                  </div>
                </div>

                {/* Results Summary */}
                {jobProgress.result && jobProgress.status === 'completed' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-indigo-600">{jobProgress.result.entityMetricsUpdated}</p>
                        <p className="text-xs text-gray-500">Entity</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-indigo-600">{jobProgress.result.venueMetricsUpdated}</p>
                        <p className="text-xs text-gray-500">Venue</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{jobProgress.result.recurringGameMetricsUpdated}</p>
                        <p className="text-xs text-gray-500">Recurring</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-600">{jobProgress.result.tournamentSeriesMetricsUpdated}</p>
                        <p className="text-xs text-gray-500">Series</p>
                      </div>
                    </div>

                    {/* Series Type Breakdown */}
                    {jobProgress.result.bySeriesType && (
                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <p className="text-xs font-medium text-indigo-800 mb-2 flex items-center gap-1">
                          <FunnelIcon className="w-3 h-3" />
                          By Series Type
                        </p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <p className="font-medium text-gray-700">ALL</p>
                            <p className="text-gray-500">
                              {jobProgress.result.bySeriesType.ALL?.entity || 0} / {jobProgress.result.bySeriesType.ALL?.venue || 0}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-purple-700">SERIES</p>
                            <p className="text-gray-500">
                              {jobProgress.result.bySeriesType.SERIES?.entity || 0} / {jobProgress.result.bySeriesType.SERIES?.venue || 0}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-blue-700">REGULAR</p>
                            <p className="text-gray-500">
                              {jobProgress.result.bySeriesType.REGULAR?.entity || 0} / {jobProgress.result.bySeriesType.REGULAR?.venue || 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Time */}
                {jobProgress.result?.executionTimeMs && (
                  <p className="text-xs text-gray-500 text-center">
                    Completed in {(jobProgress.result.executionTimeMs / 1000).toFixed(2)}s
                  </p>
                )}

                {/* Warnings */}
                {jobProgress.result?.warnings && jobProgress.result.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-800 mb-1">Warnings</p>
                    <ul className="text-xs text-yellow-700 list-disc list-inside">
                      {jobProgress.result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}

                {/* Errors */}
                {jobProgress.result?.errors && jobProgress.result.errors.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-medium text-red-800 mb-1">Errors</p>
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {jobProgress.result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}

                <Button variant="secondary" onClick={resetJob} className="w-full">
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Start New Refresh
                </Button>
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          <Card className="p-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ArrowsPointingInIcon className="w-4 h-4 text-gray-500" />
              Quick Actions
            </h3>
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setScope('all');
                  setSelectedTimeRanges(['1M']);
                  setSelectedSeriesTypes(['ALL']);
                  setIncludeEntityMetrics(true);
                  setIncludeVenueMetrics(true);
                  setIncludeRecurringGameMetrics(false);
                  setIncludeTournamentSeriesMetrics(false);
                }}
              >
                <ClockIcon className="w-4 h-4 mr-2" />
                Quick Refresh (1M, Combined only)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setScope('all');
                  setSelectedTimeRanges(['ALL', '12M', '6M', '3M', '1M']);
                  setSelectedSeriesTypes(['ALL', 'SERIES', 'REGULAR']);
                  setIncludeEntityMetrics(true);
                  setIncludeVenueMetrics(true);
                  setIncludeRecurringGameMetrics(true);
                  setIncludeTournamentSeriesMetrics(true);
                }}
              >
                <DocumentChartBarIcon className="w-4 h-4 mr-2" />
                Full Recalculation (All)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setScope('all');
                  setSelectedTimeRanges(['ALL', '12M']);
                  setSelectedSeriesTypes(['SERIES']);
                  setIncludeEntityMetrics(true);
                  setIncludeVenueMetrics(true);
                  setIncludeRecurringGameMetrics(false);
                  setIncludeTournamentSeriesMetrics(true);
                }}
              >
                <TrophyIcon className="w-4 h-4 mr-2" />
                Series Metrics Only
              </Button>
            </div>
          </Card>
        </div>

        {/* ============ STATUS TABLE ============ */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <DocumentChartBarIcon className="w-5 h-5 text-indigo-500" />
              Metrics Status by Entity
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              </div>
            ) : metricsStatus.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ChartBarIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No metrics found. Run a refresh to calculate metrics.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Entity
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Entity
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Venue
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Recurring
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-purple-500 uppercase tracking-wider">
                        Series
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Last Updated
                      </th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {metricsStatus.map(status => (
                      <tr key={status.entityId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-3 px-4">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {status.entityName}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-sm">
                            {status.recordCounts.entityMetrics}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-sm">
                            {status.recordCounts.venueMetrics}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-sm text-blue-600">
                            {status.recordCounts.recurringGameMetrics}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-mono text-sm text-purple-600">
                            {status.recordCounts.tournamentSeriesMetrics}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {status.lastCalculatedAt ? (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {formatDistanceToNow(new Date(status.lastCalculatedAt), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">Never</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge health={status.health} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Info Card */}
          <Card className="p-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-gray-500" />
              Series Type Partitioning
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="font-medium text-indigo-800">ALL</p>
                <p className="text-sm text-indigo-600">Combined metrics for all games</p>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="font-medium text-purple-800">SERIES</p>
                <p className="text-sm text-purple-600">Tournament series events only</p>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="font-medium text-blue-800">REGULAR</p>
                <p className="text-sm text-blue-600">Regular recurring games only</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Each Entity/Venue now has {expectedRecords} metric records: {selectedTimeRanges.length} time ranges × {selectedSeriesTypes.length} series types
            </p>
          </Card>

          {/* Schedule Info */}
          <Card className="p-6 mt-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-gray-500" />
              Scheduled Refresh
            </h3>
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div>
                <p className="font-medium text-blue-800">Nightly at 2:00 AM AEST</p>
                <p className="text-sm text-blue-600">All metrics are automatically refreshed overnight</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-500">Next run</p>
                <p className="text-sm font-medium text-blue-800">
                  {getNextScheduledRun()}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}

// Helper to calculate next 2am AEST
function getNextScheduledRun(): string {
  const now = new Date();
  const aestOffset = 10 * 60; // AEST is UTC+10
  const nowAEST = new Date(now.getTime() + (aestOffset + now.getTimezoneOffset()) * 60 * 1000);

  let next2am = new Date(nowAEST);
  next2am.setHours(2, 0, 0, 0);

  if (nowAEST >= next2am) {
    next2am.setDate(next2am.getDate() + 1);
  }

  // Convert back to local time for display
  const nextRun = new Date(next2am.getTime() - (aestOffset + now.getTimezoneOffset()) * 60 * 1000);
  return nextRun.toLocaleString();
}