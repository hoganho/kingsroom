// src/pages/venues/VenuesDashboard.tsx
// VERSION: 2.1.0 - Replaced flip cards with per-entity series type dropdown
//
// REQUIRES: Metrics calculated with refreshAllMetrics v2.0.0+
// Data format: VenueMetrics with seriesType: REGULAR | SERIES | ALL

import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  CurrencyDollarIcon,
  TrophyIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeSlashIcon,
  ListBulletIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  Squares2X2Icon
} from "@heroicons/react/24/outline"

import { cx, formatCurrency, formatDateWithDaysAgo } from "@/lib/utils"
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

const listVenueMetricsByEntityAndSeriesType = /* GraphQL */ `
  query ListVenueMetricsByEntityAndSeriesType(
    $entityId: ID!
    $timeRange: String!
    $seriesType: String!
    $limit: Int
    $nextToken: String
  ) {
    listVenueMetrics(
      filter: {
        entityId: { eq: $entityId }
        timeRange: { eq: $timeRange }
        seriesType: { eq: $seriesType }
      }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
        firstGameDaysAgo
        latestGameDate
        latestGameDaysAgo
        daysSinceLastGame
        
        overallHealth
        profitability
        attendanceTrend
        attendanceTrendPercent
        profitTrend
        profitTrendPercent
        
        topRecurringGames
        topTournamentSeries
        
        calculatedAt
      }
      nextToken
    }
  }
`

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
`

// ============================================
// TYPES
// ============================================

type SeriesTypeKey = 'ALL' | 'REGULAR' | 'SERIES'

const SERIES_TYPE_OPTIONS: { key: SeriesTypeKey; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'ALL', label: 'All Games', icon: <Squares2X2Icon className="w-4 h-4" />, color: 'indigo' },
  { key: 'REGULAR', label: 'Regular', icon: <CalendarIcon className="w-4 h-4" />, color: 'blue' },
  { key: 'SERIES', label: 'Series', icon: <TrophyIcon className="w-4 h-4" />, color: 'purple' }
]

interface VenueMetrics {
  id: string
  entityId: string
  venueId: string
  venueName: string
  timeRange: string
  seriesType: string
  
  totalGames: number
  totalSeriesGames: number
  totalRegularGames: number
  totalRecurringGames: number
  totalOneOffGames: number
  totalActiveRecurringGameTypes: number
  totalActiveTournamentSeries: number
  
  totalEntries: number
  totalUniquePlayers: number
  
  totalPrizepool: number
  totalRevenue: number
  totalProfit: number
  
  avgEntriesPerGame: number
  avgPrizepoolPerGame: number
  avgProfitPerGame: number
  
  firstGameDate: string | null
  firstGameDaysAgo: number | null
  latestGameDate: string | null
  latestGameDaysAgo: number | null
  daysSinceLastGame: number | null
  
  overallHealth: string
  profitability: string
  attendanceTrend: string
  attendanceTrendPercent: number
  profitTrend: string
  profitTrendPercent: number
  
  topRecurringGames: string
  topTournamentSeries: string
  
  calculatedAt: string
}

interface EntityMetrics {
  id: string
  entityId: string
  timeRange: string
  seriesType: string
  
  totalVenues: number
  activeVenues: number
  totalGames: number
  totalSeriesGames: number
  totalRegularGames: number
  totalRecurringGames: number
  totalOneOffGames: number
  
  totalEntries: number
  totalUniquePlayers: number
  totalPrizepool: number
  totalRevenue: number
  totalProfit: number
  
  avgEntriesPerGame: number
  avgPrizepoolPerGame: number
  avgProfitPerGame: number
  
  firstGameDate: string | null
  latestGameDate: string | null
  
  profitTrend: string
  profitTrendPercent: number
  playerGrowthTrend: string
  playerGrowthTrendPercent: number
  
  calculatedAt: string
}

interface Venue {
  id: string
  name: string
  entityId: string
  logo?: string
}

interface VenueDisplayStats {
  venueId: string
  entityId: string
  venueName: string
  venueLogo?: string | null
  seriesType: SeriesTypeKey
  totalGames: number
  totalEntries: number
  totalUniquePlayers: number
  totalPrizepool: number
  totalProfit: number
  avgEntriesPerGame: number
  firstGameDate: Date | null
  firstGameDaysAgo: number | null
  latestGameDate: Date | null
  latestGameDaysAgo: number | null
  overallHealth: string
  attendanceTrend: string
  attendanceTrendPercent: number
  profitTrend: string
  profitTrendPercent: number
  topRecurringGames: any[]
  topTournamentSeries: any[]
  calculatedAt: Date | null
}

interface GlobalStats {
  totalVenues: number
  activeVenues: number
  totalGames: number
  totalSeriesGames: number
  totalRegularGames: number
  totalEntries: number
  totalPrizepool: number
  totalProfit: number
  avgEntriesPerGame: number
  calculatedAt: Date | null
}

// ============================================
// HELPERS
// ============================================

function valOrDash(value: number | null | undefined, formatter?: (v: number) => string): string {
  if (value === null || value === undefined || value === 0) return "-"
  return formatter ? formatter(value) : value.toLocaleString()
}

function TrendIndicator({ trend, percent }: { trend: string; percent: number }) {
  if (!trend || trend === 'stable' || trend === 'neutral') {
    return <MinusIcon className="w-4 h-4 text-gray-400" />
  }
  if (trend === 'up') {
    return (
      <span className="flex items-center gap-1 text-green-600">
        <ArrowTrendingUpIcon className="w-4 h-4" />
        <span className="text-xs font-medium">+{percent?.toFixed(1)}%</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-red-600">
      <ArrowTrendingDownIcon className="w-4 h-4" />
      <span className="text-xs font-medium">{percent?.toFixed(1)}%</span>
    </span>
  )
}

function HealthBadge({ health }: { health: string }) {
  const styles: Record<string, string> = {
    'excellent': 'bg-green-100 text-green-800 border-green-200',
    'good': 'bg-blue-100 text-blue-800 border-blue-200',
    'needs-attention': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'critical': 'bg-red-100 text-red-800 border-red-200'
  }
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[health] || 'bg-gray-100 text-gray-600'}`}>
      {health?.replace('-', ' ') || 'Unknown'}
    </span>
  )
}

function parseJsonField(jsonString: string | null | undefined): any[] {
  if (!jsonString) return []
  try {
    let parsed = JSON.parse(jsonString)
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed)
    }
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ============================================
// SUB-COMPONENTS
// ============================================

// Series Type Selector - Segmented button style
interface SeriesTypeSelectorProps {
  value: SeriesTypeKey
  onChange: (value: SeriesTypeKey) => void
}

const SeriesTypeSelector: React.FC<SeriesTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {SERIES_TYPE_OPTIONS.map((option) => {
        const isActive = value === option.key
        const colorStyles = {
          indigo: isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-indigo-600',
          blue: isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-blue-600',
          purple: isActive ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:text-purple-600'
        }
        
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
        )
      })}
    </div>
  )
}

const HorizontalScrollRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScrollability = useCallback(() => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10)
    }
  }, [])

  useEffect(() => {
    checkScrollability()
    window.addEventListener('resize', checkScrollability)
    return () => window.removeEventListener('resize', checkScrollability)
  }, [children, checkScrollability])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -400 : 400,
        behavior: 'smooth'
      })
      setTimeout(checkScrollability, 300)
    }
  }

  return (
    <div className="relative group">
      {canScrollLeft && (
        <div className="absolute top-1/2 -translate-y-1/2 left-0 z-10 -ml-4">
          <button
            onClick={() => scroll('left')}
            className="p-2 rounded-full bg-white border border-gray-200 text-gray-600 shadow-md hover:bg-gray-50 hover:text-indigo-600 transition-colors"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {canScrollRight && (
        <div className="absolute top-1/2 -translate-y-1/2 right-0 z-10 -mr-4">
          <button
            onClick={() => scroll('right')}
            className="p-2 rounded-full bg-white border border-gray-200 text-gray-600 shadow-md hover:bg-gray-50 hover:text-indigo-600 transition-colors"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      <div 
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-4 px-1 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}

// ============================================
// VENUE CARD COMPONENT (Simple, no flip)
// ============================================

interface VenueCardProps {
  data: VenueDisplayStats
  seriesType: SeriesTypeKey
  onNavigate: (venueId: string) => void
}

const VenueCard: React.FC<VenueCardProps> = ({ data, seriesType, onNavigate }) => {
  const isEmpty = !data || data.totalGames === 0
  
  // Color scheme based on series type
  const colorScheme = {
    ALL: { bg: 'bg-white', border: 'border-slate-200', accent: 'indigo', headerBg: 'border-slate-100' },
    REGULAR: { bg: 'bg-white', border: 'border-blue-200', accent: 'blue', headerBg: 'border-blue-100 bg-blue-50/30' },
    SERIES: { bg: 'bg-gradient-to-br from-purple-50 to-white', border: 'border-purple-200', accent: 'purple', headerBg: 'border-purple-100 bg-purple-50/50' }
  }[seriesType]

  return (
    <div 
      className={cx(
        "flex-shrink-0 w-[340px] rounded-2xl shadow-sm border overflow-hidden cursor-pointer",
        "hover:shadow-md hover:border-gray-300 transition-all",
        colorScheme.bg, colorScheme.border
      )}
      onClick={() => onNavigate(data.venueId)}
    >
      {/* Card Header */}
      <div className={cx("p-4 flex items-center gap-3 border-b", colorScheme.headerBg)}>
        <div className="relative">
          {data.venueLogo ? (
            <img 
              src={data.venueLogo} 
              alt={data.venueName} 
              className="w-12 h-12 rounded-full object-cover border-2 border-slate-100"
            />
          ) : (
            <div className={cx(
              "w-12 h-12 rounded-full flex items-center justify-center border-2",
              seriesType === 'SERIES' 
                ? 'bg-gradient-to-br from-purple-100 to-purple-200 text-purple-500 border-purple-100'
                : seriesType === 'REGULAR'
                  ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-500 border-blue-100'
                  : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-400 border-slate-100'
            )}>
              <BuildingOffice2Icon className="w-6 h-6" />
            </div>
          )}
        </div>
        <div className="overflow-hidden flex-1">
          <h4 className="font-semibold text-base truncate text-slate-800">
            {data.venueName}
          </h4>
          <p className="text-xs text-slate-500">
            {data.latestGameDate 
              ? `Latest: ${formatDateWithDaysAgo(data.latestGameDate, data.latestGameDaysAgo)}`
              : "No games"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <HealthBadge health={data.overallHealth} />
        </div>
      </div>

      {/* Card Body */}
      {isEmpty ? (
        <div className="p-8 text-center">
          <p className="text-sm text-gray-400">
            No {seriesType === 'SERIES' ? 'series' : seriesType === 'REGULAR' ? 'regular' : ''} games
          </p>
        </div>
      ) : (
        <>
          <div className="p-4 grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Games</span>
              <span className="font-semibold text-gray-900">
                {valOrDash(data.totalGames)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Prizepool</span>
              <span className="font-semibold text-gray-900">
                {valOrDash(data.totalPrizepool, formatCurrency)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Entries</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-gray-900">
                  {valOrDash(data.totalEntries)}
                </span>
                <TrendIndicator trend={data.attendanceTrend} percent={data.attendanceTrendPercent} />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500">Profit</span>
              <span className={cx("font-semibold", (data.totalProfit || 0) >= 0 ? "text-green-600" : "text-red-600")}>
                {valOrDash(data.totalProfit, formatCurrency)}
              </span>
            </div>
          </div>

          {/* Top Games Preview */}
          {seriesType !== 'SERIES' && data.topRecurringGames && data.topRecurringGames.length > 0 && (
            <div className="px-4 pb-4 pt-2 border-t border-slate-100">
              <p className="text-xs text-gray-500 mb-2">Top Regular Games</p>
              <div className="flex flex-wrap gap-1">
                {data.topRecurringGames.slice(0, 3).map((rg: any, idx: number) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                    {rg.name}
                  </span>
                ))}
                {data.topRecurringGames.length > 3 && (
                  <span className="text-xs text-gray-400">+{data.topRecurringGames.length - 3} more</span>
                )}
              </div>
            </div>
          )}

          {seriesType !== 'REGULAR' && data.topTournamentSeries && data.topTournamentSeries.length > 0 && (
            <div className="px-4 pb-4 pt-2 border-t border-purple-100">
              <p className="text-xs text-purple-600 mb-2">Tournament Series</p>
              <div className="flex flex-wrap gap-1">
                {data.topTournamentSeries.slice(0, 3).map((ts: any, idx: number) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                    {ts.seriesName || ts.name}
                  </span>
                ))}
                {data.topTournamentSeries.length > 3 && (
                  <span className="text-xs text-purple-400">+{data.topTournamentSeries.length - 3} more</span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function VenuesDashboard() {
  const navigate = useNavigate()
  const client = getClient()
  const { selectedEntities, entities, loading: entityLoading } = useEntity()

  const [timeRange, setTimeRange] = useState<TimeRangeKey>("ALL")
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueMetricsMap, setVenueMetricsMap] = useState<Record<string, VenueMetrics[]>>({}) // entityId -> metrics
  const [entityMetrics, setEntityMetrics] = useState<EntityMetrics[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)

  // Per-entity state
  const [hideEmptyVenuesMap, setHideEmptyVenuesMap] = useState<Record<string, boolean>>({})
  const [seriesTypeMap, setSeriesTypeMap] = useState<Record<string, SeriesTypeKey>>({})

  // Initialize per-entity state when entities change
  useEffect(() => {
    setHideEmptyVenuesMap(prev => {
      const updated = { ...prev }
      selectedEntities.forEach(e => {
        if (!(e.id in updated)) updated[e.id] = true
      })
      return updated
    })
    setSeriesTypeMap(prev => {
      const updated = { ...prev }
      selectedEntities.forEach(e => {
        if (!(e.id in updated)) updated[e.id] = 'ALL'
      })
      return updated
    })
  }, [selectedEntities])

  // ============================================
  // FETCH DATA
  // ============================================

  const fetchData = useCallback(async () => {
    if (selectedEntities.length === 0) {
      setVenues([])
      setVenueMetricsMap({})
      setEntityMetrics([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const entityIds = selectedEntities.map(e => e.id)
      
      // Fetch venues
      const venuePromises = entityIds.map(async (entityId) => {
        const response = await client.graphql({
          query: listVenuesShallow,
          variables: { filter: { entityId: { eq: entityId } }, limit: 100 }
        })
        return response.data?.listVenues?.items || []
      })
      const allVenues = (await Promise.all(venuePromises)).flat()
      setVenues(allVenues)

      // Fetch VenueMetrics for each entity based on their selected seriesType
      const metricsMap: Record<string, VenueMetrics[]> = {}
      
      for (const entityId of entityIds) {
        const seriesType = seriesTypeMap[entityId] || 'ALL'
        
        const response = await client.graphql({
          query: listVenueMetricsByEntityAndSeriesType,
          variables: { entityId, timeRange, seriesType, limit: 500 }
        })
        metricsMap[entityId] = response.data?.listVenueMetrics?.items || []
      }
      
      setVenueMetricsMap(metricsMap)

      // Fetch EntityMetrics (ALL type for global stats)
      const entityMetricsPromises = entityIds.map(async (entityId) => {
        const response = await client.graphql({
          query: getEntityMetrics,
          variables: { entityId, timeRange, seriesType: 'ALL' }
        })
        return response.data?.listEntityMetrics?.items?.[0] || null
      })
      setEntityMetrics((await Promise.all(entityMetricsPromises)).filter(Boolean))

      // Track last calculation time
      const allMetrics = Object.values(metricsMap).flat()
      const latestCalc = allMetrics.map(m => m.calculatedAt).filter(Boolean).sort().reverse()[0]
      if (latestCalc) setLastUpdated(new Date(latestCalc))

    } catch (err: any) {
      console.error('[VenuesDashboard] Error fetching venue metrics:', err)
      setError(err.message || 'Failed to load venue metrics')
    } finally {
      setLoading(false)
    }
  }, [client, selectedEntities, timeRange, seriesTypeMap, refreshTrigger])

  useEffect(() => {
    if (!entityLoading) fetchData()
  }, [fetchData, entityLoading])

  // Handle series type change - triggers refetch
  const handleSeriesTypeChange = useCallback((entityId: string, newSeriesType: SeriesTypeKey) => {
    setSeriesTypeMap(prev => ({ ...prev, [entityId]: newSeriesType }))
  }, [])

  // ============================================
  // TRANSFORM METRICS
  // ============================================

  const transformMetrics = useCallback((metrics: VenueMetrics[]): VenueDisplayStats[] => {
    return metrics.map(m => {
      const venue = venues.find(v => v.id === m.venueId)
      return {
        venueId: m.venueId,
        entityId: m.entityId,
        venueName: m.venueName || venue?.name || 'Unknown',
        venueLogo: venue?.logo,
        seriesType: m.seriesType as SeriesTypeKey,
        totalGames: m.totalGames || 0,
        totalEntries: m.totalEntries || 0,
        totalUniquePlayers: m.totalUniquePlayers || 0,
        totalPrizepool: m.totalPrizepool || 0,
        totalProfit: m.totalProfit || 0,
        avgEntriesPerGame: m.avgEntriesPerGame || 0,
        firstGameDate: m.firstGameDate ? new Date(m.firstGameDate) : null,
        firstGameDaysAgo: m.firstGameDaysAgo,
        latestGameDate: m.latestGameDate ? new Date(m.latestGameDate) : null,
        latestGameDaysAgo: m.latestGameDaysAgo,
        overallHealth: m.overallHealth || 'unknown',
        attendanceTrend: m.attendanceTrend || 'neutral',
        attendanceTrendPercent: m.attendanceTrendPercent || 0,
        profitTrend: m.profitTrend || 'neutral',
        profitTrendPercent: m.profitTrendPercent || 0,
        topRecurringGames: parseJsonField(m.topRecurringGames),
        topTournamentSeries: parseJsonField(m.topTournamentSeries),
        calculatedAt: m.calculatedAt ? new Date(m.calculatedAt) : null
      }
    })
  }, [venues])

  // Get stats for a specific entity
  const getEntityVenueStats = useCallback((entityId: string): VenueDisplayStats[] => {
    const metrics = venueMetricsMap[entityId] || []
    return transformMetrics(metrics)
  }, [venueMetricsMap, transformMetrics])

  // Global stats from EntityMetrics
  const globalStats = useMemo((): GlobalStats => {
    return entityMetrics.reduce<GlobalStats>((acc, em) => ({
      totalVenues: acc.totalVenues + (em.totalVenues || 0),
      activeVenues: acc.activeVenues + (em.activeVenues || 0),
      totalGames: acc.totalGames + (em.totalGames || 0),
      totalSeriesGames: acc.totalSeriesGames + (em.totalSeriesGames || 0),
      totalRegularGames: acc.totalRegularGames + (em.totalRegularGames || 0),
      totalEntries: acc.totalEntries + (em.totalEntries || 0),
      totalPrizepool: acc.totalPrizepool + (em.totalPrizepool || 0),
      totalProfit: acc.totalProfit + (em.totalProfit || 0),
      avgEntriesPerGame: 0,
      calculatedAt: acc.calculatedAt || (em.calculatedAt ? new Date(em.calculatedAt) : null)
    }), {
      totalVenues: 0, activeVenues: 0, totalGames: 0, totalSeriesGames: 0, totalRegularGames: 0,
      totalEntries: 0, totalPrizepool: 0, totalProfit: 0, avgEntriesPerGame: 0, calculatedAt: null
    })
  }, [entityMetrics])

  // Combined stats for the table (all venues, all entities)
  const allVenueStats = useMemo((): VenueDisplayStats[] => {
    return Object.values(venueMetricsMap).flat().map(m => {
      const venue = venues.find(v => v.id === m.venueId)
      return {
        venueId: m.venueId,
        entityId: m.entityId,
        venueName: m.venueName || venue?.name || 'Unknown',
        venueLogo: venue?.logo,
        seriesType: m.seriesType as SeriesTypeKey,
        totalGames: m.totalGames || 0,
        totalEntries: m.totalEntries || 0,
        totalUniquePlayers: m.totalUniquePlayers || 0,
        totalPrizepool: m.totalPrizepool || 0,
        totalProfit: m.totalProfit || 0,
        avgEntriesPerGame: m.avgEntriesPerGame || 0,
        firstGameDate: m.firstGameDate ? new Date(m.firstGameDate) : null,
        firstGameDaysAgo: m.firstGameDaysAgo,
        latestGameDate: m.latestGameDate ? new Date(m.latestGameDate) : null,
        latestGameDaysAgo: m.latestGameDaysAgo,
        overallHealth: m.overallHealth || 'unknown',
        attendanceTrend: m.attendanceTrend || 'neutral',
        attendanceTrendPercent: m.attendanceTrendPercent || 0,
        profitTrend: m.profitTrend || 'neutral',
        profitTrendPercent: m.profitTrendPercent || 0,
        topRecurringGames: parseJsonField(m.topRecurringGames),
        topTournamentSeries: parseJsonField(m.topTournamentSeries),
        calculatedAt: m.calculatedAt ? new Date(m.calculatedAt) : null
      }
    })
  }, [venueMetricsMap, venues])

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnDef<VenueDisplayStats>[] = useMemo(() => [
    {
      accessorKey: 'venueName',
      header: 'Venue',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.venueLogo ? (
            <img src={row.original.venueLogo} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <BuildingOffice2Icon className="w-4 h-4 text-gray-400" />
            </div>
          )}
          <span className="font-medium">{row.original.venueName}</span>
        </div>
      )
    },
    { accessorKey: 'seriesType', header: 'Type', cell: ({ getValue }) => {
      const type = getValue() as string
      const colors = { ALL: 'bg-gray-100 text-gray-700', REGULAR: 'bg-blue-100 text-blue-700', SERIES: 'bg-purple-100 text-purple-700' }
      return <span className={cx("px-2 py-0.5 text-xs font-medium rounded-full", colors[type as keyof typeof colors] || colors.ALL)}>{type}</span>
    }},
    { accessorKey: 'totalGames', header: 'Games', cell: ({ getValue }) => valOrDash(getValue() as number) },
    { accessorKey: 'totalEntries', header: 'Entries', cell: ({ getValue }) => valOrDash(getValue() as number) },
    { accessorKey: 'avgEntriesPerGame', header: 'Avg Entries', cell: ({ getValue }) => { const val = getValue() as number; return val > 0 ? val.toFixed(1) : '-' } },
    { accessorKey: 'totalPrizepool', header: 'Prizepool', cell: ({ getValue }) => valOrDash(getValue() as number, formatCurrency) },
    { accessorKey: 'totalProfit', header: 'Profit', cell: ({ getValue }) => { const val = getValue() as number; if (!val) return '-'; return <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(val)}</span> } },
    { accessorKey: 'attendanceTrend', header: 'Trend', cell: ({ row }) => <TrendIndicator trend={row.original.attendanceTrend} percent={row.original.attendanceTrendPercent} /> },
    { accessorKey: 'overallHealth', header: 'Health', cell: ({ getValue }) => <HealthBadge health={getValue() as string} /> },
    { accessorKey: 'latestGameDate', header: 'Last Game', cell: ({ row }) => { const date = row.original.latestGameDate; if (!date) return '-'; return formatDateWithDaysAgo(date, row.original.latestGameDaysAgo) } }
  ], [])

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleRefresh = () => setRefreshTrigger(t => t + 1)
  const handleRowClick = (venue: VenueDisplayStats) => navigate(`/venues/details?venueId=${venue.venueId}`)
  const handleNavigate = (venueId: string) => navigate(`/venues/details?venueId=${venueId}`)
  const toggleEntityFilter = (entityId: string) => setHideEmptyVenuesMap(prev => ({ ...prev, [entityId]: !prev[entityId] }))

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Venues Dashboard</h1>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
            <ArrowPathIcon className={cx("w-4 h-4", loading && "animate-spin")} />
          </Button>
          {lastUpdated && <span className="text-xs text-gray-500">Metrics from {lastUpdated.toLocaleString()}</span>}
        </div>
        {entities.length > 1 && <MultiEntitySelector />}
        <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 mb-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </Card>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500">Loading venue metrics…</p>
          </div>
        </div>
      ) : (
        <>
          {/* Global KPI Cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard title="Total Venues" value={globalStats.totalVenues} subtitle={`${globalStats.activeVenues} active`} icon={<BuildingOffice2Icon className="h-5 w-5" />} />
            <KpiCard title="Total Games" value={globalStats.totalGames.toLocaleString()} icon={<CalendarIcon className="h-5 w-5" />} />
            <KpiCard title="Regular Games" value={globalStats.totalRegularGames.toLocaleString()} icon={<CalendarIcon className="h-5 w-5 text-blue-500" />} />
            <KpiCard title="Series Games" value={globalStats.totalSeriesGames.toLocaleString()} icon={<TrophyIcon className="h-5 w-5 text-purple-500" />} />
            <KpiCard title="Total Prizepool" value={formatCurrency(globalStats.totalPrizepool)} icon={<TrophyIcon className="h-5 w-5" />} />
            <KpiCard title="Profit" value={formatCurrency(globalStats.totalProfit)} icon={<CurrencyDollarIcon className="h-5 w-5" />} />
          </div>

          {/* Entity Venue Sections */}
          <div className="mt-12 space-y-12">
            {selectedEntities.map(entity => {
              const seriesType = seriesTypeMap[entity.id] || 'ALL'
              const entityVenueStats = getEntityVenueStats(entity.id)
              const entityVenues = venues.filter(v => v.entityId === entity.id)
              
              if (entityVenues.length === 0) return null

              const isHidingEmpty = hideEmptyVenuesMap[entity.id] ?? true
              const displayedStats = isHidingEmpty 
                ? entityVenueStats.filter(v => v.totalGames > 0)
                : entityVenueStats

              // If we have venues but no metrics for them yet, show the venues with empty stats
              const allDisplayedVenues = isHidingEmpty
                ? displayedStats
                : entityVenues.map(v => {
                    const existing = entityVenueStats.find(s => s.venueId === v.id)
                    if (existing) return existing
                    return {
                      venueId: v.id,
                      entityId: v.entityId,
                      venueName: v.name,
                      venueLogo: v.logo,
                      seriesType,
                      totalGames: 0,
                      totalEntries: 0,
                      totalUniquePlayers: 0,
                      totalPrizepool: 0,
                      totalProfit: 0,
                      avgEntriesPerGame: 0,
                      firstGameDate: null,
                      firstGameDaysAgo: null,
                      latestGameDate: null,
                      latestGameDaysAgo: null,
                      overallHealth: 'unknown',
                      attendanceTrend: 'neutral',
                      attendanceTrendPercent: 0,
                      profitTrend: 'neutral',
                      profitTrendPercent: 0,
                      topRecurringGames: [],
                      topTournamentSeries: [],
                      calculatedAt: null
                    } as VenueDisplayStats
                  })

              return (
                <div key={entity.id} className="relative">
                  {/* Entity Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      {entity.entityLogo ? (
                        <img src={entity.entityLogo} alt={entity.entityName} className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
                          <span className="text-sm font-bold">{entity.entityName.substring(0,2).toUpperCase()}</span>
                        </div>
                      )}
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50">{entity.entityName}</h2>
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-sm font-medium rounded-full">
                        {displayedStats.length} {isHidingEmpty ? 'active ' : ''}venue{displayedStats.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-3">
                      {/* Series Type Selector */}
                      <SeriesTypeSelector 
                        value={seriesType} 
                        onChange={(newType) => handleSeriesTypeChange(entity.id, newType)} 
                      />
                      
                      {/* Show/Hide Empty Toggle */}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => toggleEntityFilter(entity.id)}
                        className={cx("flex items-center gap-2 text-xs", isHidingEmpty ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : "")}
                      >
                        {isHidingEmpty ? <><ListBulletIcon className="w-4 h-4" />Show all</> : <><EyeSlashIcon className="w-4 h-4" />Hide empty</>}
                      </Button>
                    </div>
                  </div>

                  {/* Venue Cards */}
                  {allDisplayedVenues.length === 0 ? (
                    <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-sm text-gray-500">
                        No venues with {seriesType === 'ALL' ? '' : seriesType.toLowerCase()} games found for this period.
                      </p>
                      <button onClick={() => toggleEntityFilter(entity.id)} className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                        Show all venues
                      </button>
                    </div>
                  ) : (
                    <HorizontalScrollRow>
                      {allDisplayedVenues.map((stats) => (
                        <VenueCard
                          key={stats.venueId}
                          data={stats}
                          seriesType={seriesType}
                          onNavigate={handleNavigate}
                        />
                      ))}
                    </HorizontalScrollRow>
                  )}
                </div>
              )
            })}
          </div>

          {/* Data Table */}
          <div className="mt-16">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-50">
                All Venue Metrics
              </h2>
              <div className="-mx-4 sm:-mx-6">
                <DataTable data={allVenueStats} columns={columns} onRowClick={handleRowClick} />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  )
}