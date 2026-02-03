// src/pages/settings/PlayerManagement.tsx
// Player Management Hub - Search, edit players, and trigger/track Lambda operations
// VERSION: 1.0.0

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  UserGroupIcon,
  ChartBarIcon,
  TagIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { usePlayerSearch } from '../../hooks/usePlayer';
import { formatCurrency } from '../../lib/utils';

// ============================================================================
// GraphQL Mutations for Lambda Invocation
//
// refreshPlayerMetrics: Already exists in 51-player-metrics.graphql
//   Uses typed RefreshPlayerMetricsInput → RefreshPlayerMetricsResult
//
// refreshTargetingClassifications: MUST BE ADDED to schema.
//   Add to 52-player-activity-snapshot.graphql:
//
//     extend type Mutation {
//       refreshTargetingClassifications(input: AWSJSON): AWSJSON
//         @function(name: "refreshTargetingClassifications-${env}")
//     }
//
//   ALSO add GraphQL handler to the Lambda (see README).
// ============================================================================

// Uses typed input from 51-player-metrics.graphql schema
const REFRESH_PLAYER_METRICS = /* GraphQL */ `
  mutation RefreshPlayerMetrics($input: RefreshPlayerMetricsInput!) {
    refreshPlayerMetrics(input: $input) {
      success
      message
      globalMetricsUpdated
      entityMetricsUpdated
      venueMetricsUpdated
      totalPlayersScanned
      totalPlayerVenuesScanned
      entitiesProcessed
      venuesProcessed
      executionTimeMs
      errors
      warnings
      refreshedAt
    }
  }
`;

// NOTE: This mutation must be added to your schema.
// Add to 52-player-activity-snapshot.graphql:
//
//   extend type Mutation {
//     refreshTargetingClassifications(input: AWSJSON): AWSJSON
//       @function(name: "refreshTargetingClassifications-${env}")
//   }
//
// ALSO: Add 3 lines to the top of the Lambda handler (see below)
const REFRESH_TARGETING_CLASSIFICATIONS = /* GraphQL */ `
  mutation RefreshTargetingClassifications($input: AWSJSON) {
    refreshTargetingClassifications(input: $input)
  }
`;

// ============================================================================
// Types
// ============================================================================

type LambdaStatus = 'idle' | 'running' | 'success' | 'error';

interface LambdaRunState {
  status: LambdaStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

interface MetricsOptions {
  includeGlobalMetrics: boolean;
  includeEntityMetrics: boolean;
  includeVenueMetrics: boolean;
  dryRun: boolean;
}

type TargetingMode = 'daily' | 'monthly';

const INITIAL_RUN_STATE: LambdaRunState = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  result: null,
  error: null,
};

// ============================================================================
// Status Badge Component
// ============================================================================

const StatusBadge: React.FC<{ status: LambdaStatus }> = ({ status }) => {
  const config = {
    idle: { icon: ClockIcon, label: 'Idle', bg: 'bg-gray-100', text: 'text-gray-600' },
    running: { icon: ArrowPathIcon, label: 'Running...', bg: 'bg-blue-100', text: 'text-blue-700' },
    success: { icon: CheckCircleIcon, label: 'Completed', bg: 'bg-green-100', text: 'text-green-700' },
    error: { icon: XCircleIcon, label: 'Failed', bg: 'bg-red-100', text: 'text-red-700' },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <config.icon className={`h-3.5 w-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {config.label}
    </span>
  );
};

// ============================================================================
// Player Search Result Type Badge
// ============================================================================

const PlayerStatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const map: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: 'bg-green-100', text: 'text-green-700' },
    SUSPENDED: { bg: 'bg-red-100', text: 'text-red-700' },
    PENDING_VERIFICATION: { bg: 'bg-amber-100', text: 'text-amber-700' },
  };
  const style = map[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const CategoryBadge: React.FC<{ category?: string }> = ({ category }) => {
  if (!category) return <span className="text-xs text-gray-400">—</span>;
  const map: Record<string, { bg: string; text: string }> = {
    TRIALIST: { bg: 'bg-sky-100', text: 'text-sky-700' },
    CASUAL: { bg: 'bg-blue-100', text: 'text-blue-700' },
    COMMITTED: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    REGULAR: { bg: 'bg-purple-100', text: 'text-purple-700' },
    VIP: { bg: 'bg-amber-100', text: 'text-amber-700' },
    NEW: { bg: 'bg-sky-100', text: 'text-sky-700' },
    RECREATIONAL: { bg: 'bg-blue-100', text: 'text-blue-700' },
  };
  const style = map[category] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {category}
    </span>
  );
};

// ============================================================================
// Results Panel Component
// ============================================================================

const ResultsPanel: React.FC<{ run: LambdaRunState }> = ({ run }) => {
  const [expanded, setExpanded] = useState(false);

  if (run.status === 'idle') return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      {/* Timing */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        {run.startedAt && (
          <span>Started: {new Date(run.startedAt).toLocaleTimeString()}</span>
        )}
        {run.durationMs != null && (
          <span>Duration: {(run.durationMs / 1000).toFixed(1)}s</span>
        )}
      </div>

      {/* Error message */}
      {run.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2">
          <p className="text-sm text-red-700">{run.error}</p>
        </div>
      )}

      {/* Result summary */}
      {run.result && (
        <div className="space-y-2">
          {/* Quick summary cards */}
          {run.result.success !== undefined && (
            <div className={`rounded-lg p-3 text-sm ${run.result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {run.result.message as string || (run.result.success ? 'Operation completed successfully' : 'Operation completed with errors')}
            </div>
          )}

          {/* Key metrics inline */}
          <div className="flex flex-wrap gap-2">
            {run.result.totalPlayersScanned != null && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Players: {String(run.result.totalPlayersScanned)}
              </span>
            )}
            {run.result.globalMetricsUpdated != null && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Global: {String(run.result.globalMetricsUpdated)}
              </span>
            )}
            {run.result.entityMetricsUpdated != null && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Entity: {String(run.result.entityMetricsUpdated)}
              </span>
            )}
            {run.result.venueMetricsUpdated != null && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Venue: {String(run.result.venueMetricsUpdated)}
              </span>
            )}
            {run.result.mode != null && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded">
                Mode: {String(run.result.mode)}
              </span>
            )}
          </div>

          {/* Expandable raw JSON */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {expanded ? 'Hide raw response ▴' : 'Show raw response ▾'}
          </button>
          {expanded && (
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-auto max-h-64 mt-1">
              {JSON.stringify(run.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PlayerManagement: React.FC = () => {
  const navigate = useNavigate();
  const { players: searchResults, loading: searchLoading, error: searchError, search, clear } = usePlayerSearch();
  const [searchTerm, setSearchTerm] = useState('');

  // Lambda run states
  const [metricsRun, setMetricsRun] = useState<LambdaRunState>(INITIAL_RUN_STATE);
  const [targetingRun, setTargetingRun] = useState<LambdaRunState>(INITIAL_RUN_STATE);

  // Metrics options
  const [metricsOptions, setMetricsOptions] = useState<MetricsOptions>({
    includeGlobalMetrics: true,
    includeEntityMetrics: true,
    includeVenueMetrics: true,
    dryRun: false,
  });

  // Targeting mode
  const [targetingMode, setTargetingMode] = useState<TargetingMode>('daily');

  // ========================================
  // Search handler
  // ========================================

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    if (value.trim().length >= 2) {
      search(value.trim());
    } else if (value.trim().length === 0) {
      clear();
    }
  }, [search, clear]);

  // ========================================
  // Lambda invocation: refreshPlayerMetrics
  // ========================================

  const runRefreshPlayerMetrics = useCallback(async () => {
    const startedAt = new Date().toISOString();
    setMetricsRun({ status: 'running', startedAt, completedAt: null, durationMs: null, result: null, error: null });
    const startTime = Date.now();

    try {
      const client = generateClient();
      // Typed input — no JSON.stringify needed, Amplify maps fields directly
      const response = await client.graphql({
        query: REFRESH_PLAYER_METRICS,
        variables: {
          input: {
            includeGlobalMetrics: metricsOptions.includeGlobalMetrics,
            includeEntityMetrics: metricsOptions.includeEntityMetrics,
            includeVenueMetrics: metricsOptions.includeVenueMetrics,
            dryRun: metricsOptions.dryRun,
            timeRanges: ['ALL', '12M', '6M', '3M', '1M'],
          },
        },
      }) as GraphQLResult<{ refreshPlayerMetrics: Record<string, unknown> }>;

      const durationMs = Date.now() - startTime;
      // Typed response — already an object, no JSON.parse needed
      const result = response.data?.refreshPlayerMetrics || {};

      setMetricsRun({
        status: result.success === false ? 'error' : 'success',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        result,
        error: result.success === false ? (result.message as string) || 'Unknown error' : null,
      });
    } catch (err: unknown) {
      // Amplify v6 throws GraphQL errors as objects with { errors: [...] }, not Error instances
      let message = 'Failed to invoke refreshPlayerMetrics';
      if (err instanceof Error) {
        message = err.message;
      } else if (err && typeof err === 'object' && 'errors' in err) {
        const gqlErr = err as { errors: Array<{ message: string }> };
        message = gqlErr.errors.map((e) => e.message).join('; ');
      } else {
        try { message = JSON.stringify(err); } catch { /* fallback */ }
      }
      console.error('[PlayerManagement] refreshPlayerMetrics error:', err);
      setMetricsRun({
        status: 'error',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        result: null,
        error: message,
      });
    }
  }, [metricsOptions]);

  // ========================================
  // Lambda invocation: refreshTargetingClassifications
  // ========================================

  const runRefreshTargeting = useCallback(async () => {
    const startedAt = new Date().toISOString();
    setTargetingRun({ status: 'running', startedAt, completedAt: null, durationMs: null, result: null, error: null });
    const startTime = Date.now();

    try {
      const client = generateClient();
      const response = await client.graphql({
        query: REFRESH_TARGETING_CLASSIFICATIONS,
        variables: {
          input: JSON.stringify({
            mode: targetingMode === 'monthly' ? 'monthly' : undefined,
            includeAccountCategory: targetingMode === 'monthly',
          }),
        },
      }) as GraphQLResult<{ refreshTargetingClassifications: string }>;

      const durationMs = Date.now() - startTime;
      let parsed: Record<string, unknown> = {};
      try {
        const raw = response.data?.refreshTargetingClassifications;
        if (typeof raw === 'string') {
          const outer = JSON.parse(raw);
          // The targeting lambda returns { statusCode, body } — parse body if present
          parsed = outer.body ? (typeof outer.body === 'string' ? JSON.parse(outer.body) : outer.body) : outer;
        } else {
          parsed = (raw as Record<string, unknown>) || {};
        }
      } catch {
        parsed = { rawResponse: response.data?.refreshTargetingClassifications };
      }

      setTargetingRun({
        status: parsed.success === false ? 'error' : 'success',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        result: parsed,
        error: parsed.success === false ? (parsed.message as string) || 'Unknown error' : null,
      });
    } catch (err: unknown) {
      // Amplify v6 throws GraphQL errors as objects with { errors: [...] }, not Error instances
      let message = 'Failed to invoke refreshTargetingClassifications';
      if (err instanceof Error) {
        message = err.message;
      } else if (err && typeof err === 'object' && 'errors' in err) {
        const gqlErr = err as { errors: Array<{ message: string }> };
        message = gqlErr.errors.map((e) => e.message).join('; ');
      } else {
        try { message = JSON.stringify(err); } catch { /* fallback */ }
      }
      console.error('[PlayerManagement] refreshTargetingClassifications error:', err);
      setTargetingRun({
        status: 'error',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        result: null,
        error: message,
      });
    }
  }, [targetingMode]);

  // ========================================
  // Render
  // ========================================

  return (
    <PageWrapper title="Player Management" maxWidth="7xl">
      {/* ================================================================ */}
      {/* SECTION 1: Player Search                                        */}
      {/* ================================================================ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MagnifyingGlassIcon className="h-5 w-5 text-indigo-500" />
              Player Search
            </h2>
            <span className="text-sm text-gray-500">
              {searchResults.length > 0 && `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        <div className="p-6">
          {/* Search Input */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, email, phone, or player ID..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => { setSearchTerm(''); clear(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XCircleIcon className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Search Error */}
          {searchError && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{searchError}</p>
            </div>
          )}

          {/* Loading */}
          {searchLoading && (
            <div className="mt-4 flex items-center justify-center py-6">
              <ArrowPathIcon className="h-5 w-5 text-indigo-500 animate-spin" />
              <span className="ml-2 text-sm text-gray-500">Searching...</span>
            </div>
          )}

          {/* Search Results Table */}
          {!searchLoading && searchResults.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Net Balance</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {searchResults.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {player.firstName} {player.lastName}
                          </div>
                          <div className="text-xs text-gray-500">{player.email || player.phone || player.id}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs truncate max-w-[140px]" title={player.primaryEntityId || undefined}>
                        {player.primaryEntityId || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <PlayerStatusBadge status={player.status} />
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={player.category} />
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {player.playerSummary?.netBalance != null
                          ? formatCurrency(player.playerSummary.netBalance)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => navigate(`/players/profile/${player.id}`)}
                            title="View Profile"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <ChevronRightIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/settings/player-management/edit/${player.id}`)}
                            title="Edit Player"
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!searchLoading && searchTerm.length >= 2 && searchResults.length === 0 && (
            <div className="mt-4 text-center py-8">
              <UserGroupIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No players found matching "{searchTerm}"</p>
            </div>
          )}

          {/* Hint */}
          {!searchTerm && (
            <p className="mt-3 text-xs text-gray-400">Type at least 2 characters to search. Click the edit icon to modify player details.</p>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: Lambda Controls (two-column)                         */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ============================================ */}
        {/* Refresh Player Metrics                       */}
        {/* ============================================ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ChartBarIcon className="h-5 w-5 text-blue-500" />
                Refresh Player Metrics
              </h2>
              <StatusBadge status={metricsRun.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Pre-calculates player statistics at global, entity, and venue levels
            </p>
          </div>

          <div className="p-6">
            {/* Options */}
            <div className="space-y-3 mb-5">
              <label className="text-sm font-medium text-gray-700">Scope</label>
              <div className="space-y-2">
                {([
                  { key: 'includeGlobalMetrics', label: 'Global Metrics' },
                  { key: 'includeEntityMetrics', label: 'Entity Metrics' },
                  { key: 'includeVenueMetrics', label: 'Venue Metrics' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={metricsOptions[key]}
                      onChange={(e) => setMetricsOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metricsOptions.dryRun}
                    onChange={(e) => setMetricsOptions(prev => ({ ...prev, dryRun: e.target.checked }))}
                    className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-amber-700 font-medium">Dry Run</span>
                  <span className="text-xs text-gray-400">(calculate without saving)</span>
                </label>
              </div>
            </div>

            {/* Time ranges note */}
            <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-3 mb-5">
              <InformationCircleIcon className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                Processes all time ranges: 1M, 3M, 6M, 12M, ALL. Runs daily at 20:15 UTC via EventBridge.
              </p>
            </div>

            {/* Run button */}
            <button
              onClick={runRefreshPlayerMetrics}
              disabled={metricsRun.status === 'running'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              {metricsRun.status === 'running' ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <BoltIcon className="h-4 w-4" />
                  {metricsOptions.dryRun ? 'Run Dry Run' : 'Run Refresh'}
                </>
              )}
            </button>

            {/* Results */}
            <ResultsPanel run={metricsRun} />
          </div>
        </div>

        {/* ============================================ */}
        {/* Refresh Targeting Classifications             */}
        {/* ============================================ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TagIcon className="h-5 w-5 text-purple-500" />
                Refresh Targeting &amp; Categories
              </h2>
              <StatusBadge status={targetingRun.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Updates targeting classifications and account categories
            </p>
          </div>

          <div className="p-6">
            {/* Mode selection */}
            <div className="space-y-3 mb-5">
              <label className="text-sm font-medium text-gray-700">Mode</label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="targetingMode"
                    checked={targetingMode === 'daily'}
                    onChange={() => setTargetingMode('daily')}
                    className="mt-0.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-gray-700 font-medium">Daily — Targeting Only</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Refreshes targetingClassification for Player and PlayerVenue records
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="targetingMode"
                    checked={targetingMode === 'monthly'}
                    onChange={() => setTargetingMode('monthly')}
                    className="mt-0.5 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-gray-700 font-medium">Daily + Monthly — Include Account Categories</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Also recalculates player categories: Trialist, Casual, Committed, Regular, VIP
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Warning for monthly mode */}
            {targetingMode === 'monthly' && (
              <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 mb-5">
                <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Monthly mode recalculates all player categories. This normally runs automatically on the 1st of each month. Running it manually will override current categories.
                </p>
              </div>
            )}

            {/* Schedule info */}
            <div className="flex items-start gap-2 bg-purple-50 rounded-lg p-3 mb-5">
              <InformationCircleIcon className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                Daily targeting runs at 20:10 UTC. Monthly categories run on the 1st at 19:00 UTC.
                Targeting runs 5 minutes before player metrics to ensure fresh classifications.
              </p>
            </div>

            {/* Run button */}
            <button
              onClick={runRefreshTargeting}
              disabled={targetingRun.status === 'running'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
            >
              {targetingRun.status === 'running' ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <BoltIcon className="h-4 w-4" />
                  Run {targetingMode === 'monthly' ? 'Daily + Monthly' : 'Daily Targeting'}
                </>
              )}
            </button>

            {/* Results */}
            <ResultsPanel run={targetingRun} />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};

export default PlayerManagement;
