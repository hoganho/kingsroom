// src/pages/venues/VenuesDashboard.tsx
import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeSlashIcon,
  ListBulletIcon
} from "@heroicons/react/24/outline"

import { cx, formatCurrency, formatDateTimeAEST, formatDateWithDaysAgo } from "@/lib/utils"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { KpiCard } from "@/components/ui/KpiCard"
import { DataTable } from "@/components/ui/DataTable"
import { TimeRangeToggle, type TimeRangeKey } from "@/components/ui/TimeRangeToggle"

import { MultiEntitySelector } from "@/components/entities/MultiEntitySelector"
import { useEntity } from "@/contexts/EntityContext"
import { getClient } from "@/utils/apiClient"

import type { ColumnDef } from "@tanstack/react-table"
import type { Venue } from "@/types/venue"

// ============================================
// GRAPHQL QUERIES
// ============================================

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
        logo
      }
      nextToken
    }
  }
`

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
`

// ============================================
// TYPES
// ============================================

interface GameFinancialSnapshotWithGame {
  id: string
  entityId?: string | null
  venueId?: string | null
  gameStartDateTime?: string | null
  totalEntries?: number | null
  totalUniquePlayers?: number | null
  prizepoolTotal?: number | null
  netProfit?: number | null
  game?: {
    id: string
    gameStatus?: string | null
    isRegular?: boolean | null
    venueScheduleKey?: string | null
    venueGameTypeKey?: string | null
  } | null
}

interface VenueSummaryStats {
  venueId: string
  entityId: string
  venueName: string
  venueLogo?: string | null
  totalGames: number
  totalEntries: number
  totalRegistrations: number
  totalPrizepool: number
  totalProfit: number
  // Game date tracking
  firstGameDate: Date | null
  firstGameDaysAgo: number | null
  latestGameDate: Date | null
  latestGameDaysAgo: number | null
}

// ============================================
// HELPERS
// ============================================

function getTimeRangeBounds(range: TimeRangeKey): { from: string | null; to: string | null } {
  const to = new Date()
  if (range === "ALL") return { from: null, to: to.toISOString() }

  const months =
    range === "12M" ? 12 :
    range === "6M" ? 6 :
    range === "3M" ? 3 : 1

  const from = new Date()
  from.setMonth(from.getMonth() - months)
  return { from: from.toISOString(), to: to.toISOString() }
}

function isValidGameSnapshot(snapshot: GameFinancialSnapshotWithGame): boolean {
  const game = snapshot.game

  // Explicitly exclude NOT_PUBLISHED games
  if (game?.gameStatus === "NOT_PUBLISHED") return false

  const checks = {
    hasGame: !!game,
    gameStatus: game?.gameStatus,
    isStatusFinished: game?.gameStatus === "FINISHED",
    isRegular: game?.isRegular,
    venueScheduleKey: game?.venueScheduleKey,
    hasVenueScheduleKey: !!game?.venueScheduleKey,
    venueGameTypeKey: game?.venueGameTypeKey,
    hasVenueGameTypeKey: !!game?.venueGameTypeKey,
  }

  return (
    checks.hasGame &&
    checks.isStatusFinished &&
    checks.isRegular === true &&
    checks.hasVenueScheduleKey &&
    checks.hasVenueGameTypeKey
  )
}

function valOrDash(value: number | null | undefined, formatter?: (v: number) => string): string {
  if (!value || value === 0) return "-"
  return formatter ? formatter(value) : value.toLocaleString()
}

function buildVenueStats(
  venues: Venue[],
  snapshots: GameFinancialSnapshotWithGame[]
): { venueStats: VenueSummaryStats[]; globalStats: VenueSummaryStats } {
  const statsByVenue = new Map<string, VenueSummaryStats>()

  // 1. Initialize all venues
  venues.forEach(venue => {
    if(venue.id) {
       statsByVenue.set(venue.id, {
        venueId: venue.id,
        entityId: venue.entityId || "",
        venueName: venue.name ?? "Unknown venue",
        venueLogo: (venue as any).logo, 
        totalGames: 0,
        totalEntries: 0,
        totalRegistrations: 0,
        totalPrizepool: 0,
        totalProfit: 0,
        firstGameDate: null,
        firstGameDaysAgo: null,
        latestGameDate: null,
        latestGameDaysAgo: null,
      })
    }
  })

  // 2. Populate with Snapshot data
  for (const snap of snapshots) {
    const venueId = snap.venueId
    if (!venueId || !statsByVenue.has(venueId)) continue

    const s = statsByVenue.get(venueId)!
    s.totalGames += 1
    s.totalEntries += snap.totalEntries ?? 0
    s.totalRegistrations += snap.totalUniquePlayers ?? 0
    s.totalPrizepool += snap.prizepoolTotal ?? 0
    s.totalProfit += snap.netProfit ?? 0

    if (snap.gameStartDateTime) {
      const gameDate = new Date(snap.gameStartDateTime)
      if (!s.firstGameDate || gameDate < s.firstGameDate) {
        s.firstGameDate = gameDate
      }
      if (!s.latestGameDate || gameDate > s.latestGameDate) {
        s.latestGameDate = gameDate
      }
    }
  }

  // 3. Calculate days ago
  const now = new Date()
  for (const stats of statsByVenue.values()) {
    if (stats.firstGameDate) {
      stats.firstGameDaysAgo = Math.floor(
        (now.getTime() - stats.firstGameDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    }
    if (stats.latestGameDate) {
      stats.latestGameDaysAgo = Math.floor(
        (now.getTime() - stats.latestGameDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    }
  }

  const venueStats = Array.from(statsByVenue.values()).sort((a, b) =>
    a.venueName.localeCompare(b.venueName)
  )

  // 4. Global stats
  const globalStats: VenueSummaryStats = venueStats.reduce(
    (acc, v) => {
      let firstGameDate = acc.firstGameDate
      let latestGameDate = acc.latestGameDate
      
      if (v.firstGameDate && (!firstGameDate || v.firstGameDate < firstGameDate)) {
        firstGameDate = v.firstGameDate
      }
      
      if (v.latestGameDate && (!latestGameDate || v.latestGameDate > latestGameDate)) {
        latestGameDate = v.latestGameDate
      }
      
      return {
        venueId: "GLOBAL",
        entityId: "GLOBAL",
        venueName: "All venues",
        totalGames: acc.totalGames + v.totalGames,
        totalEntries: acc.totalEntries + v.totalEntries,
        totalRegistrations: acc.totalRegistrations + v.totalRegistrations,
        totalPrizepool: acc.totalPrizepool + v.totalPrizepool,
        totalProfit: acc.totalProfit + v.totalProfit,
        firstGameDate,
        firstGameDaysAgo: firstGameDate 
          ? Math.floor((now.getTime() - firstGameDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
        latestGameDate,
        latestGameDaysAgo: latestGameDate
          ? Math.floor((now.getTime() - latestGameDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }
    },
    {
      venueId: "GLOBAL",
      entityId: "GLOBAL",
      venueName: "All venues",
      totalGames: 0,
      totalEntries: 0,
      totalRegistrations: 0,
      totalPrizepool: 0,
      totalProfit: 0,
      firstGameDate: null,
      firstGameDaysAgo: null,
      latestGameDate: null,
      latestGameDaysAgo: null,
    }
  )

  return { venueStats, globalStats }
}

// ============================================
// SUB-COMPONENTS
// ============================================

const HorizontalScrollRow: React.FC<{ 
  children: React.ReactNode;
}> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScrollability();
    window.addEventListener('resize', checkScrollability);
    return () => window.removeEventListener('resize', checkScrollability);
  }, [children, checkScrollability]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      // Allow scroll to happen before checking again
      setTimeout(checkScrollability, 300);
    }
  };

  return (
    <div className="relative group">
      {/* Scroll Buttons - Absolute positioned overlay */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 z-10 -ml-4">
        {canScrollLeft && (
           <button
             onClick={() => scroll('left')}
             className="p-2 rounded-full bg-white border border-gray-200 text-gray-600 shadow-md hover:bg-gray-50 hover:text-indigo-600 transition-colors"
           >
             <ChevronLeftIcon className="w-5 h-5" />
           </button>
        )}
      </div>

      <div className="absolute top-1/2 -translate-y-1/2 right-0 z-10 -mr-4">
        {canScrollRight && (
           <button
             onClick={() => scroll('right')}
             className="p-2 rounded-full bg-white border border-gray-200 text-gray-600 shadow-md hover:bg-gray-50 hover:text-indigo-600 transition-colors"
           >
             <ChevronRightIcon className="w-5 h-5" />
           </button>
        )}
      </div>

      <div 
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-4 px-1 scrollbar-hide"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const PAGE_LIMIT = 500

export default function VenuesDashboard() {
  const navigate = useNavigate()
  const { selectedEntities, entities, loading: entityLoading } = useEntity()

  const [timeRange, setTimeRange] = useState<TimeRangeKey>("ALL")
  const [venues, setVenues] = useState<Venue[]>([])
  const [snapshots, setSnapshots] = useState<GameFinancialSnapshotWithGame[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)
  
  // State to track filtering per entity (Key: EntityID, Value: boolean isHidden)
  // DEFAULT: Hide empty venues is ON (true)
  const [hideEmptyVenuesMap, setHideEmptyVenuesMap] = useState<Record<string, boolean>>(() => {
    // Initialize with true for all selected entities
    const initial: Record<string, boolean> = {}
    selectedEntities.forEach(e => { initial[e.id] = true })
    return initial
  })

  // Update hideEmptyVenuesMap when selectedEntities changes to default new entities to true
  useEffect(() => {
    setHideEmptyVenuesMap(prev => {
      const updated = { ...prev }
      selectedEntities.forEach(e => {
        if (!(e.id in updated)) {
          updated[e.id] = true // Default to hiding empty venues
        }
      })
      return updated
    })
  }, [selectedEntities])

  // Determine if we should show the entity selector (only if user has more than 1 entity)
  // Note: entities is already filtered by user permissions in EntityContext
  const showEntitySelector = entities && entities.length > 1

  // ---- Data Loading ----
  const loadData = useCallback(async () => {
    if (selectedEntities.length === 0) return

    setLoading(true)
    setError(null)

    try {
      const client = getClient()
      const { from, to } = getTimeRangeBounds(timeRange)
      
      const allVenues: Venue[] = []
      const allSnapshots: GameFinancialSnapshotWithGame[] = []

      await Promise.all(selectedEntities.map(async (entity) => {
        // 1) Fetch Venues
        let venueNextToken: string | null | undefined = null
        do {
          const venuesRes = (await client.graphql({
            query: listVenuesShallow,
            variables: {
              filter: { entityId: { eq: entity.id } },
              limit: PAGE_LIMIT,
              nextToken: venueNextToken,
            },
          })) as any

          const page = venuesRes?.data?.listVenues
          const pageItems = page?.items?.filter((v: Venue | null) => !!v) ?? []

          allVenues.push(...(pageItems as Venue[]))
          venueNextToken = page?.nextToken ?? null
        } while (venueNextToken)

        // 2) Fetch Snapshots
        let snapNextToken: string | null | undefined = null
        const baseFilter: any = { entityId: { eq: entity.id } }
        if (from && to) {
          baseFilter.gameStartDateTime = { between: [from, to] }
        }

        do {
          const snapRes = (await client.graphql({
            query: listGameFinancialSnapshotsWithGame,
            variables: {
              filter: baseFilter,
              limit: PAGE_LIMIT,
              nextToken: snapNextToken,
            },
          })) as any

          const page = snapRes?.data?.listGameFinancialSnapshots
          const pageItems = page?.items?.filter((s: GameFinancialSnapshotWithGame | null) => s != null) ?? []

          allSnapshots.push(...(pageItems as GameFinancialSnapshotWithGame[]))
          snapNextToken = page?.nextToken ?? null
        } while (snapNextToken)
      }))

      setVenues(allVenues)
      setSnapshots(allSnapshots.filter(isValidGameSnapshot))
      setLastUpdated(new Date())

    } catch (err: any) {
      console.error("Error loading venue dashboard data", err)
      setError(err?.message ?? "Failed to load venue dashboard data")
    } finally {
      setLoading(false)
    }
  }, [selectedEntities, timeRange])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshTrigger])

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1)
  }

  const toggleEntityFilter = (entityId: string) => {
    setHideEmptyVenuesMap(prev => ({
      ...prev,
      [entityId]: !prev[entityId]
    }))
  }

  const { venueStats, globalStats } = useMemo(() => {
    return buildVenueStats(venues, snapshots)
  }, [venues, snapshots])

  // Handle row click to navigate to venue details (same as VenueCard)
  const handleRowClick = (row: VenueSummaryStats) => {
    navigate(`/venues/details?venueId=${row.venueId}`)
  }

  // Columns for DataTable
  const columns = useMemo<ColumnDef<VenueSummaryStats>[]>(
    () => [
      {
        header: "Venue",
        accessorKey: "venueName",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {row.original.venueLogo ? (
              <img 
                src={row.original.venueLogo} 
                alt={row.original.venueName} 
                className="w-8 h-8 rounded-full object-cover border border-gray-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <BuildingOffice2Icon className="w-4 h-4" />
              </div>
            )}
            <span className="text-indigo-600 hover:text-indigo-800 font-medium">
              {row.original.venueName}
            </span>
          </div>
        )
      },
      {
        header: "First Game",
        accessorKey: "firstGameDate",
        cell: ({ row }) => row.original.firstGameDate 
          ? formatDateWithDaysAgo(row.original.firstGameDate, row.original.firstGameDaysAgo)
          : "-",
      },
      {
        header: "Latest Game",
        accessorKey: "latestGameDate",
        cell: ({ row }) => row.original.latestGameDate
          ? formatDateWithDaysAgo(row.original.latestGameDate, row.original.latestGameDaysAgo)
          : "-",
      },
      {
        header: "Games",
        accessorKey: "totalGames",
        cell: ({ row }) => valOrDash(row.original.totalGames),
      },
      {
        header: "Registrations",
        accessorKey: "totalRegistrations",
        cell: ({ row }) => valOrDash(row.original.totalRegistrations),
      },
      {
        header: "Entries",
        accessorKey: "totalEntries",
        cell: ({ row }) => valOrDash(row.original.totalEntries),
      },
      {
        header: "Prizepool",
        accessorKey: "totalPrizepool",
        cell: ({ row }) => valOrDash(row.original.totalPrizepool, formatCurrency),
      },
      {
        header: "Profit",
        accessorKey: "totalProfit",
        cell: ({ row }) => valOrDash(row.original.totalProfit, formatCurrency),
      },
    ],
    []
  )

  // ---- Loading state for entity ----
  if (entityLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  // ---- No entity selected state ----
  if (selectedEntities.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 sm:text-2xl">
            Venues
          </h1>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {showEntitySelector && (
            <div className="w-full sm:flex-1 sm:max-w-xs">
              <MultiEntitySelector />
            </div>
          )}
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
        <div className="mt-8 py-20 text-center">
          <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-700" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Select an entity to view venue metrics
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      {/* ============ PAGE HEADER ============ */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 sm:text-2xl">
          Venues
        </h1>

        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              AEST: {formatDateTimeAEST(lastUpdated)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <ArrowPathIcon
              className={cx("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* ============ FILTERS ============ */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showEntitySelector && (
          <div className="w-full sm:flex-1 sm:max-w-xs">
            <MultiEntitySelector />
          </div>
        )}
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>

      {/* ============ ERROR ============ */}
      {error && (
        <div className="mt-4">
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </Card>
        </div>
      )}

      {/* ============ MAIN CONTENT ============ */}
      {loading ? (
        <div className="mt-8 flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading venue data…
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ============ GLOBAL KPI CARDS ============ */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard
              title="Total Venues"
              value={venues.length}
              icon={<BuildingOffice2Icon className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Games"
              value={globalStats.totalGames.toLocaleString()}
              icon={<CalendarIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Entries"
              value={globalStats.totalEntries.toLocaleString()}
              icon={<UserGroupIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Total Prizepool"
              value={formatCurrency(globalStats.totalPrizepool)}
              icon={<TrophyIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Profit"
              value={formatCurrency(globalStats.totalProfit)}
              icon={<CurrencyDollarIcon className="h-5 w-5" />}
            />
          </div>

          {/* ============ ENTITY VENUE SECTIONS ============ */}
          <div className="mt-12 space-y-12">
            {selectedEntities.map(entity => {
              const entityVenues = venueStats.filter(v => v.entityId === entity.id);
              if (entityVenues.length === 0) return null;

              // Determine logic for this entity's filter (default to true = hiding empty)
              const isHidingEmpty = hideEmptyVenuesMap[entity.id] ?? true;
              
              const displayedVenues = isHidingEmpty 
                ? entityVenues.filter(v => v.totalGames > 0)
                : entityVenues;

              return (
                <div key={entity.id} className="relative">
                  {/* Entity Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {entity.entityLogo ? (
                          <img 
                              src={entity.entityLogo} 
                              alt={entity.entityName} 
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm"
                          />
                      ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
                              <span className="text-sm font-bold">{entity.entityName.substring(0,2).toUpperCase()}</span>
                          </div>
                      )}
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                        {entity.entityName}
                      </h2>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
                          {displayedVenues.length} {isHidingEmpty ? 'active ' : ''}venue{displayedVenues.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Toggle Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleEntityFilter(entity.id)}
                      className={cx(
                        "flex items-center gap-2 text-xs",
                        isHidingEmpty ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : ""
                      )}
                    >
                      {isHidingEmpty ? (
                        <>
                          <ListBulletIcon className="w-4 h-4" />
                          Show all venues
                        </>
                      ) : (
                        <>
                          <EyeSlashIcon className="w-4 h-4" />
                          Hide empty venues
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Horizontal Scroll Row */}
                  {displayedVenues.length === 0 ? (
                    <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                       <p className="text-sm text-gray-500">No venues with games found for this period.</p>
                       <button 
                         onClick={() => toggleEntityFilter(entity.id)}
                         className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                       >
                         Show all venues
                       </button>
                    </div>
                  ) : (
                    <HorizontalScrollRow>
                      {displayedVenues.map((v) => (
                        <div 
                          key={v.venueId}
                          onClick={() => navigate(`/venues/details?venueId=${v.venueId}`)}
                          className="flex-shrink-0 w-[380px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow self-start cursor-pointer group"
                        >
                          {/* Card Header */}
                          <div className="p-4 flex items-center gap-3 border-b border-slate-100">
                              <div className="relative">
                                  {v.venueLogo ? (
                                      <img 
                                          src={v.venueLogo} 
                                          alt={v.venueName} 
                                          className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
                                      />
                                  ) : (
                                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-400 border-2 border-slate-100">
                                          <BuildingOffice2Icon className="w-6 h-6" />
                                      </div>
                                  )}
                              </div>
                              <div className="overflow-hidden">
                                  <h4 className="font-semibold text-slate-800 text-base truncate group-hover:text-indigo-600 transition-colors">
                                      {v.venueName}
                                  </h4>
                                  <p className="text-xs text-slate-500">
                                      Latest: {v.latestGameDate 
                                          ? formatDateWithDaysAgo(v.latestGameDate, v.latestGameDaysAgo)
                                          : "No recent games"}
                                  </p>
                              </div>
                          </div>

                          {/* Card Body - Stats Grid */}
                          <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                              <div className="flex flex-col">
                                  <span className="text-xs text-gray-500">Games</span>
                                  <span className="font-semibold text-gray-900">{valOrDash(v.totalGames)}</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs text-gray-500">Prizepool</span>
                                  <span className="font-semibold text-gray-900">{valOrDash(v.totalPrizepool, formatCurrency)}</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs text-gray-500">Entries</span>
                                  <span className="font-semibold text-gray-900">{valOrDash(v.totalEntries)}</span>
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs text-gray-500">Profit</span>
                                  <span className="font-semibold text-green-600">{valOrDash(v.totalProfit, formatCurrency)}</span>
                              </div>
                          </div>
                        </div>
                      ))}
                    </HorizontalScrollRow>
                  )}
                </div>
              );
            })}
          </div>

          {/* ============ DATA TABLE (Aggregated) ============ */}
          <div className="mt-16">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">
                All Venue Metrics
              </h2>
              <div className="-mx-4 sm:-mx-6">
                <DataTable 
                  data={venueStats} 
                  columns={columns} 
                  onRowClick={handleRowClick}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  )
}