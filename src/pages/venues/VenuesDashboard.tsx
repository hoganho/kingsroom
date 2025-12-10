// src/pages/venues/VenuesDashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Grid, Text } from '@tremor/react';
import {
  BuildingOffice2Icon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';
import { useEntity } from '../../contexts/EntityContext';
import { getClient } from '../../utils/apiClient';

import { MetricCard } from '../../components/ui/MetricCard';
import { TimeRangeToggle } from '../../components/ui/TimeRangeToggle';
import { DataTable } from '../../components/ui/DataTable';

// Custom shallow query for venues - avoids nested relationships that cause enum serialization errors
const listVenuesShallow = /* GraphQL */ `
  query ListVenuesShallow(
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        entityId
      }
      nextToken
    }
  }
`;

// Custom query to get financial snapshots with game data for filtering
// netProfit is the comprehensive profit including all costs from GameCost
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
        gameStartDateTime
        totalEntries
        totalUniquePlayers
        prizepoolTotal
        netProfit
        game {
          id
          gameStatus
          isRegular
          venueScheduleKey
          venueGameTypeKey
        }
      }
      nextToken
    }
  }
`;

import type { ColumnDef } from '@tanstack/react-table';
import type { Venue } from '../../types/venue';

// ---- Time range keys (keep in sync with TimeRangeToggle) ----

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

// ---- Types for game data & aggregated stats ----

interface GameFinancialSnapshotWithGame {
  id: string;
  entityId?: string | null;
  venueId?: string | null;
  gameStartDateTime?: string | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolTotal?: number | null;
  netProfit?: number | null;
  game?: {
    id: string;
    gameStatus?: string | null;
    isRegular?: boolean | null;
    venueScheduleKey?: string | null;
    venueGameTypeKey?: string | null;
  } | null;
}

// Helper to check if a snapshot's game meets our criteria
function isValidGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game;
  
  const checks = {
    hasGame: !!game,
    gameStatus: game?.gameStatus,
    isStatusFinished: game?.gameStatus === 'FINISHED',
    isRegular: game?.isRegular,
    venueScheduleKey: game?.venueScheduleKey,
    hasVenueScheduleKey: !!game?.venueScheduleKey,
    venueGameTypeKey: game?.venueGameTypeKey,
    hasVenueGameTypeKey: !!game?.venueGameTypeKey,
  };
  
  const isValid = (
    checks.hasGame &&
    checks.isStatusFinished &&
    checks.isRegular === true &&
    checks.hasVenueScheduleKey &&
    checks.hasVenueGameTypeKey
  );
  
  if (!isValid) {
    console.log(`[Filter] Snapshot ${snapshot.id} EXCLUDED:`, {
      snapshotId: snapshot.id,
      venueId: snapshot.venueId,
      gameStartDateTime: snapshot.gameStartDateTime,
      ...checks,
      failedChecks: [
        !checks.hasGame && 'no game data',
        !checks.isStatusFinished && `gameStatus=${checks.gameStatus} (not FINISHED)`,
        checks.isRegular !== true && `isRegular=${checks.isRegular} (not true)`,
        !checks.hasVenueScheduleKey && 'missing venueScheduleKey',
        !checks.hasVenueGameTypeKey && 'missing venueGameTypeKey',
      ].filter(Boolean)
    });
  }
  
  return isValid;
}

interface VenueSummaryStats {
  venueId: string;
  venueName: string;
  totalGames: number;
  totalEntries: number;
  totalRegistrations: number;
  totalPrizepool: number;
  totalProfit: number;
}

// ---- Helpers ----

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return value.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });
}

function buildVenueStats(
  venues: Venue[],
  snapshots: GameFinancialSnapshotWithGame[]
): { venueStats: VenueSummaryStats[]; globalStats: VenueSummaryStats } {
  const venueById = new Map<string, Venue>();
  venues.forEach((v) => {
    if (v.id) venueById.set(v.id, v);
  });

  const statsByVenue = new Map<string, VenueSummaryStats>();

  for (const snap of snapshots) {
    const venueId = snap.venueId;
    if (!venueId) continue;

    if (!statsByVenue.has(venueId)) {
      const venue = venueById.get(venueId);
      statsByVenue.set(venueId, {
        venueId,
        venueName: venue?.name ?? 'Unknown venue',
        totalGames: 0,
        totalEntries: 0,
        totalRegistrations: 0,
        totalPrizepool: 0,
        totalProfit: 0,
      });
    }

    const s = statsByVenue.get(venueId)!;
    s.totalGames += 1;
    s.totalEntries += snap.totalEntries ?? 0;
    s.totalRegistrations += snap.totalUniquePlayers ?? 0;
    s.totalPrizepool += snap.prizepoolTotal ?? 0;
    s.totalProfit += snap.netProfit ?? 0;
  }

  const venueStats = Array.from(statsByVenue.values()).sort((a, b) =>
    a.venueName.localeCompare(b.venueName)
  );

  const globalStats: VenueSummaryStats = venueStats.reduce(
    (acc, v) => ({
      venueId: 'GLOBAL',
      venueName: 'All venues',
      totalGames: acc.totalGames + v.totalGames,
      totalEntries: acc.totalEntries + v.totalEntries,
      totalRegistrations: acc.totalRegistrations + v.totalRegistrations,
      totalPrizepool: acc.totalPrizepool + v.totalPrizepool,
      totalProfit: acc.totalProfit + v.totalProfit,
    }),
    {
      venueId: 'GLOBAL',
      venueName: 'All venues',
      totalGames: 0,
      totalEntries: 0,
      totalRegistrations: 0,
      totalPrizepool: 0,
      totalProfit: 0,
    }
  );

  return { venueStats, globalStats };
}

// ---- Main component ----

const PAGE_LIMIT = 500; // per request – we still paginate until nextToken is null

const VenuesDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedEntities, loading: entityLoading } = useEntity();
  
  // Use first selected entity for filtering (dashboard uses multi-select context)
  const entityId: string | undefined = selectedEntities[0]?.id;
  
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL');

  const [venues, setVenues] = useState<Venue[]>([]);
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const client = getClient();

        // 1) Fetch venues for entity (shallow query to avoid nested relationship issues)
        const venuesRes = await client.graphql({
          query: listVenuesShallow,
          variables: {
            filter: { entityId: { eq: entityId } },
            limit: PAGE_LIMIT,
          },
        }) as any;

        const venuesItems =
          venuesRes?.data?.listVenues?.items?.filter((v: Venue | null) => !!v) ?? [];
        setVenues(venuesItems as Venue[]);

        // 2) Fetch GameFinancialSnapshots for entity + time range, then filter client-side
        const { from, to } = getTimeRangeBounds(timeRange);

        const allSnapshots: GameFinancialSnapshotWithGame[] = [];
        let nextToken: string | null | undefined = null;

        // Build filter for entity + optional date range
        // Game-level filters (FINISHED, isRegular, venue keys) applied client-side
        const baseFilter: any = {
          entityId: { eq: entityId },
        };

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

          // Handle both success and partial error responses
          // GraphQL can return data with errors when non-nullable fields are null
          const page = snapRes?.data?.listGameFinancialSnapshots;
          
          if (snapRes?.errors?.length) {
            console.warn('GraphQL returned partial data with errors:', snapRes.errors.length, 'errors');
          }
          
          const pageItems =
            page?.items?.filter((s: GameFinancialSnapshotWithGame | null) => s != null) ?? [];

          allSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]));
          nextToken = page?.nextToken ?? null;
        } while (nextToken);

        // Filter to only include snapshots for valid games:
        // - gameStatus = FINISHED
        // - isRegular = true
        // - venueScheduleKey populated
        // - venueGameTypeKey populated
        console.log(`[VenuesDashboard] Raw snapshots retrieved:`, allSnapshots.map(s => ({
          id: s.id,
          venueId: s.venueId,
          gameStartDateTime: s.gameStartDateTime,
          game: s.game
        })));
        
        const validSnapshots = allSnapshots.filter(isValidGameSnapshot);
        
        console.log(`Loaded ${allSnapshots.length} snapshots, ${validSnapshots.length} valid after filtering`);
        
        setSnapshots(validSnapshots);
      } catch (err: any) {
        // Check if we got partial data despite errors
        const partialData = err?.data?.listGameFinancialSnapshots?.items;
        if (partialData) {
          const validItems = partialData
            .filter((s: GameFinancialSnapshotWithGame | null) => s != null)
            .filter(isValidGameSnapshot);
          console.warn(`Recovered ${validItems.length} valid snapshots from partial error response`);
          setSnapshots(validItems);
        } else {
          console.error('Error loading venue dashboard data', err);
          setError(err?.message ?? 'Failed to load venue dashboard data');
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [entityId, timeRange]);

  const { venueStats, globalStats } = useMemo(
    () => buildVenueStats(venues, snapshots),
    [venues, snapshots]
  );

    const columns = useMemo<ColumnDef<VenueSummaryStats>[]>(
    () => [
        {
        header: 'Venue',
        accessorKey: 'venueName',
        },
        {
        header: 'Games',
        accessorKey: 'totalGames',
        cell: ({ row }) => row.original.totalGames.toLocaleString(),
        },
        {
        header: 'Registrations',
        accessorKey: 'totalRegistrations',
        cell: ({ row }) => row.original.totalRegistrations.toLocaleString(),
        },
        {
        header: 'Entries',
        accessorKey: 'totalEntries',
        cell: ({ row }) => row.original.totalEntries.toLocaleString(),
        },
        {
        header: 'Prizepool',
        accessorKey: 'totalPrizepool',
        cell: ({ row }) => formatCurrency(row.original.totalPrizepool),
        },
        {
        header: 'Profit',
        accessorKey: 'totalProfit',
        cell: ({ row }) => formatCurrency(row.original.totalProfit),
        },
    ],
    []
    );

  if (entityLoading) {
    return (
      <PageWrapper title="Venues">
        <div className="py-20 text-center text-gray-400">
          Loading entity…
        </div>
      </PageWrapper>
    );
  }

  if (!entityId) {
    return (
      <PageWrapper
        title="Venues"
        actions={
          <div className="flex items-center gap-4">
            <MultiEntitySelector />
          </div>
        }
      >
        <div className="py-20 text-center text-gray-400">
          Please select an entity to view venue metrics.
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title="Venues"
      actions={
        <div className="flex items-center gap-4">
          <MultiEntitySelector />
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      }
    >
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <Text className="text-sm text-red-700">
            {error}
          </Text>
        </Card>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">
          Loading venue dashboard…
        </div>
      ) : (
        <>
          {/* Top summary cards */}
          <Grid numItemsSm={2} numItemsLg={5} className="gap-4 mb-6">
            <MetricCard
              label="Total Venues"
              value={venues.length}
              icon={<BuildingOffice2Icon className="h-6 w-6" />}
            />
            <MetricCard
              label="Total Games"
              value={globalStats.totalGames.toLocaleString()}
              icon={<CalendarIcon className="h-6 w-6" />}
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
              label="Profit"
              value={formatCurrency(globalStats.totalProfit)}
            />
          </Grid>

          {/* Venue cards */}
          <Text className="mb-2 text-xs font-semibold uppercase text-gray-500">
            Venues
          </Text>

          <Grid numItemsSm={1} numItemsMd={2} numItemsLg={3} className="gap-4 mb-8">
            {venueStats.map((v) => (
              <Card
                key={v.venueId}
                className="cursor-pointer hover:shadow-md transition"
                onClick={() => navigate(`/venues/details?venueId=${v.venueId}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <Text className="text-xs uppercase tracking-wide text-gray-400">
                      Venue
                    </Text>
                    <Text className="text-sm font-semibold text-gray-900">
                      {v.venueName}
                    </Text>
                  </div>
                </div>

                <div className="mt-1 grid grid-cols-2 gap-y-1 text-xs">
                  <span className="text-gray-500">Games</span>
                  <span className="text-right font-semibold">
                    {v.totalGames.toLocaleString()}
                  </span>

                  <span className="text-gray-500">Registrations</span>
                  <span className="text-right font-semibold">
                    {v.totalRegistrations.toLocaleString()}
                  </span>

                  <span className="text-gray-500">Entries</span>
                  <span className="text-right font-semibold">
                    {v.totalEntries.toLocaleString()}
                  </span>

                  <span className="text-gray-500">Prizepool</span>
                  <span className="text-right font-semibold">
                    {formatCurrency(v.totalPrizepool)}
                  </span>

                  <span className="text-gray-500">Profit</span>
                  <span className="text-right font-semibold">
                    {formatCurrency(v.totalProfit)}
                  </span>
                </div>
              </Card>
            ))}

            {venueStats.length === 0 && (
              <Text className="col-span-full text-sm text-gray-400 text-center py-8">
                No venue data available for the selected time range.
              </Text>
            )}
          </Grid>

          {/* Tabular view via TanStack */}
          <Card>
            <Text className="mb-3 text-sm font-semibold">
              Venue Metrics (tabular)
            </Text>
            <DataTable<VenueSummaryStats> data={venueStats} columns={columns} />
          </Card>
        </>
      )}
    </PageWrapper>
  );
};

export default VenuesDashboard;