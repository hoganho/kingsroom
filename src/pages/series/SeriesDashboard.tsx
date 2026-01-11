// src/pages/series/SeriesDashboard.tsx
// VERSION: 1.0.0 - Tournament Series Dashboard using TournamentSeriesMetrics
//
// REQUIRES: TournamentSeriesMetrics populated via refreshAllMetrics
// Data format: TournamentSeriesMetrics with timeRange: ALL | 12M | 6M | 3M | 1M

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowPathIcon,
  TrophyIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline"

import { cx, formatCurrency } from "@/lib/utils"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { KpiCard } from "@/components/ui/KpiCard"
import { DataTable } from "@/components/ui/DataTable"
import { TimeRangeToggle, type TimeRangeKey } from "@/components/ui/TimeRangeToggle"

import { MultiEntitySelector } from "@/components/entities/MultiEntitySelector"
import { useEntity } from "@/contexts/EntityContext"
import { getClient } from "@/utils/apiClient"

import type { ColumnDef } from "@tanstack/react-table"

// ============================================
// GRAPHQL QUERIES
// ============================================

const listTournamentSeriesMetricsByEntity = /* GraphQL */ `
  query ListTournamentSeriesMetricsByEntity(
    $entityId: ID!
    $timeRange: String!
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeriesMetrics(
      filter: {
        entityId: { eq: $entityId }
        timeRange: { eq: $timeRange }
      }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        entityId
        tournamentSeriesId
        seriesName
        timeRange
        seriesType
        
        totalEvents
        totalFlights
        uniqueVenues
        mainEventCount
        
        totalEntries
        totalUniquePlayers
        totalReentries
        totalAddons
        mainEventTotalEntries
        
        totalPrizepool
        totalRevenue
        totalCost
        totalProfit
        
        avgEntriesPerEvent
        avgUniquePlayersPerEvent
        avgPrizepoolPerEvent
        avgRevenuePerEvent
        avgProfitPerEvent
        mainEventAvgEntries
        
        stdDevEntries
        minEntries
        maxEntries
        medianEntries
        entriesCV
        
        profitMargin
        
        firstEventDate
        firstEventDaysAgo
        latestEventDate
        latestEventDaysAgo
        seriesDurationDays
        
        profitability
        consistency
        
        calculatedAt
      }
      nextToken
    }
  }
`

const listTournamentSeriesShallow = /* GraphQL */ `
  query ListTournamentSeriesShallow(
    $filter: ModelTournamentSeriesFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeries(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        year
        entityId
        status
        seriesCategory
        startDate
        endDate
      }
      nextToken
    }
  }
`

// ============================================
// TYPES
// ============================================

interface TournamentSeriesMetrics {
  id: string
  entityId: string
  tournamentSeriesId: string
  seriesName: string
  timeRange: string
  seriesType: string
  
  totalEvents: number
  totalFlights: number
  uniqueVenues: number
  mainEventCount: number
  
  totalEntries: number
  totalUniquePlayers: number
  totalReentries: number
  totalAddons: number
  mainEventTotalEntries: number
  
  totalPrizepool: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  
  avgEntriesPerEvent: number
  avgUniquePlayersPerEvent: number
  avgPrizepoolPerEvent: number
  avgRevenuePerEvent: number
  avgProfitPerEvent: number
  mainEventAvgEntries: number
  
  stdDevEntries: number
  minEntries: number
  maxEntries: number
  medianEntries: number
  entriesCV: number
  
  profitMargin: number
  
  firstEventDate: string | null
  firstEventDaysAgo: number | null
  latestEventDate: string | null
  latestEventDaysAgo: number | null
  seriesDurationDays: number | null
  
  profitability: string
  consistency: string
  
  calculatedAt: string
}

interface TournamentSeries {
  id: string
  name: string
  year: number
  entityId: string
  status: string
  seriesCategory: string
  startDate: string | null
  endDate: string | null
}

interface SeriesDisplayStats {
  tournamentSeriesId: string
  entityId: string
  seriesName: string
  seriesTitle: string  // Base name without year (e.g., "Colossus Series")
  year: number | null
  status: string
  
  totalEvents: number
  totalFlights: number
  uniqueVenues: number
  
  totalEntries: number
  totalUniquePlayers: number
  totalPrizepool: number
  totalProfit: number
  
  avgEntriesPerEvent: number
  avgProfitPerEvent: number
  profitMargin: number
  
  firstEventDate: string | null
  firstEventDaysAgo: number | null
  latestEventDate: string | null
  latestEventDaysAgo: number | null
  seriesDurationDays: number | null
  
  profitability: string
  consistency: string
  
  calculatedAt: string | null
}

interface SeriesTitleGroup {
  title: string
  series: SeriesDisplayStats[]  // Sorted by year descending
}

interface GlobalStats {
  totalSeries: number
  activeSeries: number
  totalEvents: number
  totalEntries: number
  totalPrizepool: number
  totalProfit: number
  avgEntriesPerEvent: number
  calculatedAt: Date | null
}

// ============================================
// HELPERS
// ============================================

function valOrDash(value: number | null | undefined, formatter?: (v: number) => string): string {
  if (value === null || value === undefined || value === 0) return "-"
  return formatter ? formatter(value) : value.toLocaleString()
}

// Extract base series title by removing year patterns like "2024", "2023", etc.
function extractSeriesTitle(seriesName: string, _year: number | null): string {
  if (!seriesName) return 'Unknown Series'
  
  // Remove year from the end or middle of the name
  let title = seriesName
    .replace(/\s*20\d{2}\s*/g, ' ')  // Remove 4-digit years
    .replace(/\s*'\d{2}\s*/g, ' ')    // Remove 2-digit years with apostrophe
    .trim()
    .replace(/\s+/g, ' ')             // Normalize spaces
  
  // Remove trailing punctuation or connectors
  title = title.replace(/[-–—:,\s]+$/, '').trim()
  
  return title || seriesName
}

function ProfitabilityBadge({ profitability }: { profitability: string }) {
  const styles: Record<string, string> = {
    'highly-profitable': 'bg-green-100 text-green-800 border-green-200',
    'profitable': 'bg-blue-100 text-blue-800 border-blue-200',
    'break-even': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'loss': 'bg-red-100 text-red-800 border-red-200'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[profitability] || 'bg-gray-100 text-gray-600'}`}>
      {profitability?.replace('-', ' ') || 'Unknown'}
    </span>
  )
}

function ConsistencyBadge({ consistency }: { consistency: string }) {
  const styles: Record<string, string> = {
    'very-reliable': 'bg-green-100 text-green-800 border-green-200',
    'reliable': 'bg-blue-100 text-blue-800 border-blue-200',
    'variable': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'erratic': 'bg-red-100 text-red-800 border-red-200'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[consistency] || 'bg-gray-100 text-gray-600'}`}>
      {consistency?.replace('-', ' ') || 'Unknown'}
    </span>
  )
}

function formatProfit(value: number): string {
  const formatted = formatCurrency(Math.abs(value))
  return value < 0 ? `-${formatted}` : formatted
}

/**
 * Format currency in a compact way for KPI cards
 * e.g., $1,234,567 -> $1.23M, $12,345 -> $12.3K
 */
function formatCompactCurrency(value: number): string {
  const isNegative = value < 0
  const absValue = Math.abs(value)
  
  let formatted: string
  if (absValue >= 1_000_000) {
    formatted = `$${(absValue / 1_000_000).toFixed(2)}M`
  } else if (absValue >= 10_000) {
    formatted = `$${(absValue / 1_000).toFixed(1)}K`
  } else if (absValue >= 1_000) {
    formatted = `$${(absValue / 1_000).toFixed(2)}K`
  } else {
    formatted = `$${absValue.toFixed(0)}`
  }
  
  return isNegative ? `-${formatted}` : formatted
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Horizontal scroll row for series cards
function HorizontalScrollRow({ children }: { children: React.ReactNode }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 10)
  }, [])

  useEffect(() => {
    checkScroll()
    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener('scroll', checkScroll)
      window.addEventListener('resize', checkScroll)
    }
    return () => {
      if (container) container.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, children])

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return
    const scrollAmount = container.clientWidth * 0.8
    container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' })
  }

  return (
    <div className="relative group">
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 dark:bg-gray-800/90 rounded-full p-2 shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      )}
      
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 dark:bg-gray-800/90 rounded-full p-2 shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRightIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      )}
    </div>
  )
}

// Series Card Component - Styled to match VenueCard
interface SeriesCardProps {
  data: SeriesDisplayStats
  onNavigate: (seriesId: string) => void
}

function SeriesCard({ data, onNavigate }: SeriesCardProps) {
  const isEmpty = !data || data.totalEvents === 0
  
  return (
    <div 
      className={cx(
        "flex-shrink-0 w-[340px] rounded-2xl shadow-sm border overflow-hidden cursor-pointer",
        "hover:shadow-md hover:border-gray-300 transition-all",
        "bg-gradient-to-br from-purple-50 to-white border-purple-200"
      )}
      onClick={() => onNavigate(data.tournamentSeriesId)}
    >
      {/* Card Header */}
      <div className="p-4 flex items-center gap-3 border-b border-purple-100 bg-purple-50/50">
        <div className="relative">
          {/* Series Icon/Avatar */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center text-white border-2 border-white shadow-sm">
            <TrophyIcon className="w-6 h-6" />
          </div>
          {/* Profitability indicator dot */}
          <div className={cx(
            "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white",
            data.profitability === 'highly-profitable' && 'bg-green-500',
            data.profitability === 'profitable' && 'bg-blue-500',
            data.profitability === 'break-even' && 'bg-yellow-500',
            data.profitability === 'loss' && 'bg-red-500',
            !['highly-profitable', 'profitable', 'break-even', 'loss'].includes(data.profitability) && 'bg-gray-400'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate" title={data.seriesName}>
            {data.seriesName}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              {data.totalEvents} events
            </span>
            {!isEmpty && <ProfitabilityBadge profitability={data.profitability} />}
          </div>
        </div>
      </div>

      {/* Card Body */}
      {isEmpty ? (
        <div className="p-6 text-center text-gray-400">
          <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No events in this period</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Entries</p>
            <p className="text-lg font-semibold text-gray-900">{data.totalEntries.toLocaleString()}</p>
            <p className="text-xs text-gray-400">avg {data.avgEntriesPerEvent?.toFixed(1) || '-'}/event</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Prizepool</p>
            <p className="text-lg font-semibold text-gray-900">{formatCompactCurrency(data.totalPrizepool)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profit</p>
            <p className={cx("text-lg font-semibold", data.totalProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
              {formatCompactCurrency(data.totalProfit)}
            </p>
            <ConsistencyBadge consistency={data.consistency} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Duration</p>
            <p className="text-sm font-medium text-gray-700">
              {data.seriesDurationDays !== null 
                ? `${data.seriesDurationDays} days`
                : '-'}
            </p>
            <p className="text-xs text-gray-400">{data.uniqueVenues} venue{data.uniqueVenues !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SeriesDashboard() {
  const navigate = useNavigate()
  const { entities, selectedEntities } = useEntity()

  // State
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Data state
  const [seriesMetrics, setSeriesMetrics] = useState<TournamentSeriesMetrics[]>([])
  const [allSeries, setAllSeries] = useState<TournamentSeries[]>([])

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    const fetchData = async () => {
      if (selectedEntities.length === 0) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const client = getClient()
        const metricsPromises: Promise<any>[] = []
        const seriesPromises: Promise<any>[] = []

        // Fetch metrics and series for each selected entity
        for (const entity of selectedEntities) {
          // Fetch TournamentSeriesMetrics
          metricsPromises.push(
            (async () => {
              const allMetrics: TournamentSeriesMetrics[] = []
              let nextToken: string | null = null

              do {
                const response: any = await client.graphql({
                  query: listTournamentSeriesMetricsByEntity,
                  variables: {
                    entityId: entity.id,
                    timeRange,
                    limit: 100,
                    nextToken
                  }
                })
                const items = response.data?.listTournamentSeriesMetrics?.items || []
                allMetrics.push(...items)
                nextToken = response.data?.listTournamentSeriesMetrics?.nextToken
              } while (nextToken)

              return allMetrics
            })()
          )

          // Fetch TournamentSeries (for additional metadata)
          seriesPromises.push(
            (async () => {
              const allSeriesItems: TournamentSeries[] = []
              let nextToken: string | null = null

              do {
                const response: any = await client.graphql({
                  query: listTournamentSeriesShallow,
                  variables: {
                    filter: { entityId: { eq: entity.id } },
                    limit: 100,
                    nextToken
                  }
                })
                const items = response.data?.listTournamentSeries?.items || []
                allSeriesItems.push(...items)
                nextToken = response.data?.listTournamentSeries?.nextToken
              } while (nextToken)

              return allSeriesItems
            })()
          )
        }

        const [metricsResults, seriesResults] = await Promise.all([
          Promise.all(metricsPromises),
          Promise.all(seriesPromises)
        ])

        const allMetrics = metricsResults.flat()
        const allSeriesData = seriesResults.flat()

        setSeriesMetrics(allMetrics)
        setAllSeries(allSeriesData)

        // Set last updated from most recent calculation
        if (allMetrics.length > 0) {
          const latestCalc = allMetrics
            .map(m => m.calculatedAt)
            .filter(Boolean)
            .sort()
            .reverse()[0]
          if (latestCalc) {
            setLastUpdated(new Date(latestCalc))
          }
        }

      } catch (err: any) {
        console.error('Error fetching series data:', err)
        setError(err.message || 'Failed to load series data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedEntities, timeRange, refreshTrigger])

  // ============================================
  // COMPUTED VALUES
  // ============================================

  // Transform metrics into display format
  const seriesDisplayStats: SeriesDisplayStats[] = useMemo(() => {
    return seriesMetrics.map(metric => {
      const series = allSeries.find(s => s.id === metric.tournamentSeriesId)
      const seriesName = metric.seriesName || series?.name || 'Unknown Series'
      const year = series?.year || null
      
      return {
        tournamentSeriesId: metric.tournamentSeriesId,
        entityId: metric.entityId,
        seriesName,
        seriesTitle: extractSeriesTitle(seriesName, year),
        year,
        status: series?.status || 'UNKNOWN',
        
        totalEvents: metric.totalEvents || 0,
        totalFlights: metric.totalFlights || 0,
        uniqueVenues: metric.uniqueVenues || 0,
        
        totalEntries: metric.totalEntries || 0,
        totalUniquePlayers: metric.totalUniquePlayers || 0,
        totalPrizepool: metric.totalPrizepool || 0,
        totalProfit: metric.totalProfit || 0,
        
        avgEntriesPerEvent: metric.avgEntriesPerEvent || 0,
        avgProfitPerEvent: metric.avgProfitPerEvent || 0,
        profitMargin: metric.profitMargin || 0,
        
        firstEventDate: metric.firstEventDate,
        firstEventDaysAgo: metric.firstEventDaysAgo,
        latestEventDate: metric.latestEventDate,
        latestEventDaysAgo: metric.latestEventDaysAgo,
        seriesDurationDays: metric.seriesDurationDays,
        
        profitability: metric.profitability || 'unknown',
        consistency: metric.consistency || 'unknown',
        
        calculatedAt: metric.calculatedAt
      }
    }).sort((a, b) => {
      // Sort by year desc, then by profit desc
      if (a.year && b.year && a.year !== b.year) return b.year - a.year
      return b.totalProfit - a.totalProfit
    })
  }, [seriesMetrics, allSeries])

  // Global stats aggregation
  const globalStats: GlobalStats = useMemo(() => {
    const activeSeries = seriesDisplayStats.filter(s => s.totalEvents > 0)
    
    return {
      totalSeries: seriesDisplayStats.length,
      activeSeries: activeSeries.length,
      totalEvents: activeSeries.reduce((sum, s) => sum + s.totalEvents, 0),
      totalEntries: activeSeries.reduce((sum, s) => sum + s.totalEntries, 0),
      totalPrizepool: activeSeries.reduce((sum, s) => sum + s.totalPrizepool, 0),
      totalProfit: activeSeries.reduce((sum, s) => sum + s.totalProfit, 0),
      avgEntriesPerEvent: activeSeries.length > 0
        ? activeSeries.reduce((sum, s) => sum + s.totalEntries, 0) / 
          activeSeries.reduce((sum, s) => sum + s.totalEvents, 0)
        : 0,
      calculatedAt: lastUpdated
    }
  }, [seriesDisplayStats, lastUpdated])

  // Group by entity, then by series title
  const seriesByEntity = useMemo(() => {
    const grouped: Record<string, SeriesTitleGroup[]> = {}
    
    for (const series of seriesDisplayStats) {
      if (!grouped[series.entityId]) {
        grouped[series.entityId] = []
      }
      
      // Find or create the title group
      let titleGroup = grouped[series.entityId].find(g => g.title === series.seriesTitle)
      if (!titleGroup) {
        titleGroup = { title: series.seriesTitle, series: [] }
        grouped[series.entityId].push(titleGroup)
      }
      titleGroup.series.push(series)
    }
    
    // Sort series within each title group by year descending (latest first)
    for (const entityId in grouped) {
      for (const titleGroup of grouped[entityId]) {
        titleGroup.series.sort((a, b) => {
          if (a.year && b.year) return b.year - a.year
          if (a.year) return -1
          if (b.year) return 1
          return 0
        })
      }
      // Sort title groups by latest year of any series in the group
      grouped[entityId].sort((a, b) => {
        const aLatest = Math.max(...a.series.map(s => s.year || 0))
        const bLatest = Math.max(...b.series.map(s => s.year || 0))
        return bLatest - aLatest
      })
    }
    
    return grouped
  }, [seriesDisplayStats])

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnDef<SeriesDisplayStats>[] = useMemo(() => [
    {
      accessorKey: 'seriesName',
      header: 'Series',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TrophyIcon className="w-4 h-4 text-purple-500" />
          <div>
            <span className="font-medium">{row.original.seriesName}</span>
            {row.original.year && (
              <span className="text-xs text-gray-500 ml-2">({row.original.year})</span>
            )}
          </div>
        </div>
      )
    },
    { 
      accessorKey: 'totalEvents', 
      header: 'Events', 
      cell: ({ getValue }) => valOrDash(getValue() as number) 
    },
    { 
      accessorKey: 'totalEntries', 
      header: 'Entries', 
      cell: ({ getValue }) => valOrDash(getValue() as number) 
    },
    { 
      accessorKey: 'avgEntriesPerEvent', 
      header: 'Avg Entries', 
      cell: ({ getValue }) => { 
        const val = getValue() as number
        return val > 0 ? val.toFixed(1) : '-' 
      } 
    },
    { 
      accessorKey: 'totalPrizepool', 
      header: 'Prizepool', 
      cell: ({ getValue }) => valOrDash(getValue() as number, formatCurrency) 
    },
    { 
      accessorKey: 'totalProfit', 
      header: 'Profit', 
      cell: ({ getValue }) => { 
        const val = getValue() as number
        if (!val) return '-'
        return (
          <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatProfit(val)}
          </span>
        )
      } 
    },
    { 
      accessorKey: 'profitability', 
      header: 'Profitability', 
      cell: ({ getValue }) => <ProfitabilityBadge profitability={getValue() as string} /> 
    },
    { 
      accessorKey: 'consistency', 
      header: 'Consistency', 
      cell: ({ getValue }) => <ConsistencyBadge consistency={getValue() as string} /> 
    },
    { 
      accessorKey: 'latestEventDate', 
      header: 'Last Event', 
      cell: ({ row }) => {
        const date = row.original.latestEventDate
        if (!date) return '-'
        const daysAgo = row.original.latestEventDaysAgo
        try {
          const formatted = new Date(date).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })
          if (daysAgo !== null && daysAgo !== undefined) {
            return `${formatted} (${daysAgo}d ago)`
          }
          return formatted
        } catch {
          return '-'
        }
      } 
    }
  ], [])

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleRefresh = () => setRefreshTrigger(t => t + 1)
  const handleRowClick = (series: SeriesDisplayStats) => navigate(`/series/details?seriesId=${series.tournamentSeriesId}`)
  const handleNavigate = (seriesId: string) => navigate(`/series/details?seriesId=${seriesId}`)

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Series Dashboard</h1>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
            <ArrowPathIcon className={cx("w-4 h-4", loading && "animate-spin")} />
          </Button>
          {lastUpdated && (
            <span className="text-xs text-gray-500">
              Metrics from {lastUpdated.toLocaleString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {entities.length > 1 && <MultiEntitySelector />}
          <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 mb-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-purple-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500">Loading series metrics…</p>
          </div>
        </div>
      ) : (
        <>
          {/* Global KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard 
              title="Total Series" 
              value={globalStats.totalSeries} 
              subtitle={`${globalStats.activeSeries} with events`}
              icon={<TrophyIcon className="h-5 w-5 text-purple-500" />} 
            />
            <KpiCard 
              title="Total Events" 
              value={globalStats.totalEvents.toLocaleString()} 
              icon={<CalendarIcon className="h-5 w-5" />} 
            />
            <KpiCard 
              title="Total Entries" 
              value={globalStats.totalEntries.toLocaleString()} 
              icon={<UserGroupIcon className="h-5 w-5" />} 
            />
            <KpiCard 
              title="Avg per Event" 
              value={globalStats.avgEntriesPerEvent.toFixed(1)} 
              icon={<UserGroupIcon className="h-5 w-5" />} 
            />
            <KpiCard 
              title="Total Prizepool" 
              value={formatCurrency(globalStats.totalPrizepool)} 
              icon={<TrophyIcon className="h-5 w-5" />} 
            />
            <KpiCard 
              title="Profit" 
              value={formatProfit(globalStats.totalProfit)} 
              icon={<CurrencyDollarIcon className="h-5 w-5" />}
              className={globalStats.totalProfit >= 0 ? '' : 'text-red-600'}
            />
          </div>

          {/* Series by Entity */}
          <div className="mt-12 space-y-12">
            {selectedEntities.map(entity => {
              const titleGroups = seriesByEntity[entity.id] || []
              
              // Count total active series across all title groups
              const totalActiveSeries = titleGroups.reduce((sum, group) => 
                sum + group.series.filter(s => s.totalEvents > 0).length, 0
              )
              
              if (titleGroups.length === 0) return null

              return (
                <div key={entity.id} className="relative">
                  {/* Entity Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      {entity.entityLogo ? (
                        <img 
                          src={entity.entityLogo} 
                          alt={entity.entityName} 
                          className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 border border-purple-200">
                          <span className="text-sm font-bold">
                            {entity.entityName.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">
                        {entity.entityName}
                      </h2>
                      <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
                        {totalActiveSeries} series
                      </span>
                    </div>
                  </div>

                  {/* Series Title Groups */}
                  {totalActiveSeries === 0 ? (
                    <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <TrophyIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">
                        No series with events found for this time period.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {titleGroups.map(titleGroup => {
                        const activeSeries = titleGroup.series.filter(s => s.totalEvents > 0)
                        if (activeSeries.length === 0) return null
                        
                        return (
                          <div key={titleGroup.title} className="space-y-2">
                            {/* Title Group Header */}
                            <div className="flex items-center gap-2 px-1">
                              <TrophyIcon className="w-4 h-4 text-purple-500" />
                              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                {titleGroup.title}
                              </h3>
                              <span className="text-xs text-gray-400">
                                ({activeSeries.map(s => s.year).filter(Boolean).join(', ')})
                              </span>
                            </div>
                            
                            {/* Series Cards Row */}
                            <HorizontalScrollRow>
                              {activeSeries.map(series => (
                                <SeriesCard
                                  key={series.tournamentSeriesId}
                                  data={series}
                                  onNavigate={handleNavigate}
                                />
                              ))}
                            </HorizontalScrollRow>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Data Table */}
          <div className="mt-16">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">
                All Series Metrics
              </h2>
              <div className="-mx-4 sm:-mx-6">
                <DataTable 
                  data={seriesDisplayStats} 
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