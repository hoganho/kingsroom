// src/pages/venues/VenuesDashboard.tsx
// VERSION: 2.5.0 - Added global series type toggle for SUPER_ADMIN KPI stats
//
// REQUIRES: Metrics calculated with refreshAllMetrics v2.0.0+
// Data format: VenueMetrics with seriesType: REGULAR | SERIES | ALL
//
// FIX v2.5.0: Added global SeriesTypeSelector for SUPER_ADMIN to control KPI card stats
//             - SUPER_ADMIN can toggle between ALL/REGULAR/SERIES for summary stats
//             - Per-entity toggles remain for individual entity venue sections
//
// FIX v2.4.0: Non-SUPER_ADMIN users now properly see REGULAR game stats only
//             - Global stats use REGULAR metrics (not ALL)
//             - Series type filter hidden for non-SUPER_ADMIN
//             - All data views locked to REGULAR for non-SUPER_ADMIN
//
// FIX v2.3.0: Previously always queried seriesType='ALL' and only filtered game count.
//             Now fetches metrics for all three seriesTypes and uses the correct record
//             for each metric (prizepool, profit, entries, etc.)

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
import { useUserPermissions } from "@/hooks/useUserPermissions"
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
              className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" 
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-semibold text-lg border-2 border-white shadow-sm">
              {data.venueName?.charAt(0) || '?'}
            </div>
          )}
          {/* Health indicator dot */}
          <div className={cx(
            "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white",
            data.overallHealth === 'excellent' && 'bg-green-500',
            data.overallHealth === 'good' && 'bg-blue-500',
            data.overallHealth === 'needs-attention' && 'bg-yellow-500',
            data.overallHealth === 'critical' && 'bg-red-500',
            !['excellent', 'good', 'needs-attention', 'critical'].includes(data.overallHealth) && 'bg-gray-400'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate" title={data.venueName}>
            {data.venueName}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500">
              {data.totalGames} games
            </span>
            <TrendIndicator trend={data.attendanceTrend} percent={data.attendanceTrendPercent} />
          </div>
        </div>
      </div>

      {/* Card Body */}
      {isEmpty ? (
        <div className="p-6 text-center text-gray-400">
          <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No games in this period</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">Entries</p>
            <p className="text-lg font-semibold text-gray-900">{data.totalEntries.toLocaleString()}</p>
            <p className="text-xs text-gray-400">avg {data.avgEntriesPerGame?.toFixed(1) || '-'}/game</p>
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
            <TrendIndicator trend={data.profitTrend} percent={data.profitTrendPercent} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Game</p>
            <p className="text-sm font-medium text-gray-700">
              {data.latestGameDaysAgo !== null 
                ? data.latestGameDaysAgo === 0 
                  ? 'Today' 
                  : `${data.latestGameDaysAgo}d ago`
                : '-'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export const VenuesDashboard = () => {
  const navigate = useNavigate()
  const client = getClient()
  const { selectedEntities, entities, loading: entityLoading } = useEntity()
  const { isSuperAdmin } = useUserPermissions()

  // ============================================
  // STATE
  // ============================================

  const [timeRange, setTimeRange] = useState<TimeRangeKey>('ALL')
  const [venues, setVenues] = useState<Venue[]>([])
  
  // CHANGED: Store metrics keyed by entityId AND seriesType
  // Format: { [entityId]: { ALL: VenueMetrics[], REGULAR: VenueMetrics[], SERIES: VenueMetrics[] } }
  const [venueMetricsMap, setVenueMetricsMap] = useState<Record<string, Record<SeriesTypeKey, VenueMetrics[]>>>({})
  
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)

  // Per-entity state
  const [hideEmptyVenuesMap, setHideEmptyVenuesMap] = useState<Record<string, boolean>>({})
  const [seriesTypeMap, setSeriesTypeMap] = useState<Record<string, SeriesTypeKey>>({})
  
  // Global series type for KPI cards (SUPER_ADMIN only) - defaults to ALL for admins
  const [globalSeriesType, setGlobalSeriesType] = useState<SeriesTypeKey>('ALL')
  
  // Table filter state
  const [hideEmptyInTable, setHideEmptyInTable] = useState<boolean>(true)

  // Initialize per-entity state when entities change
  // Default to 'REGULAR' for all users (SUPER_ADMIN can change it via selector)
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
        // Default to REGULAR for all users
        if (!(e.id in updated)) updated[e.id] = 'REGULAR'
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

      // CHANGED: Fetch VenueMetrics for ALL THREE seriesTypes for each entity
      // This allows proper filtering when user switches between ALL/REGULAR/SERIES
      const metricsMap: Record<string, Record<SeriesTypeKey, VenueMetrics[]>> = {}
      const seriesTypes: SeriesTypeKey[] = ['ALL', 'REGULAR', 'SERIES']
      
      for (const entityId of entityIds) {
        metricsMap[entityId] = { ALL: [], REGULAR: [], SERIES: [] }
        
        // Fetch metrics for all three seriesTypes in parallel
        const fetchPromises = seriesTypes.map(async (seriesType) => {
          const response = await client.graphql({
            query: listVenueMetricsByEntityAndSeriesType,
            variables: { entityId, timeRange, seriesType, limit: 500 }
          })
          return { seriesType, items: response.data?.listVenueMetrics?.items || [] }
        })
        
        const results = await Promise.all(fetchPromises)
        results.forEach(({ seriesType, items }) => {
          metricsMap[entityId][seriesType] = items
        })
      }
      
      setVenueMetricsMap(metricsMap)

      // Track last calculation time from venue metrics
      const allMetrics = Object.values(metricsMap).flatMap(entityMetrics => 
        Object.values(entityMetrics).flat()
      )
      const latestCalc = allMetrics.map(m => m.calculatedAt).filter(Boolean).sort().reverse()[0]
      if (latestCalc) setLastUpdated(new Date(latestCalc))

    } catch (err: any) {
      console.error('[VenuesDashboard] Error fetching venue metrics:', err)
      setError(err.message || 'Failed to load venue metrics')
    } finally {
      setLoading(false)
    }
  }, [client, selectedEntities, timeRange, refreshTrigger])

  useEffect(() => {
    if (!entityLoading) fetchData()
  }, [fetchData, entityLoading])

  // Handle series type change (only for SUPER_ADMIN)
  const handleSeriesTypeChange = useCallback((entityId: string, newSeriesType: SeriesTypeKey) => {
    if (!isSuperAdmin) return // Safety check
    setSeriesTypeMap(prev => ({ ...prev, [entityId]: newSeriesType }))
  }, [isSuperAdmin])

  // ============================================
  // TRANSFORM METRICS
  // ============================================

  // CHANGED: Transform metrics directly from the correct seriesType record
  // No longer need to use breakdown fields - we have the actual data
  const transformMetrics = useCallback((metrics: VenueMetrics[], displaySeriesType: SeriesTypeKey): VenueDisplayStats[] => {
    return metrics.map(m => {
      const venue = venues.find(v => v.id === m.venueId)
      
      return {
        venueId: m.venueId,
        entityId: m.entityId,
        venueName: m.venueName || venue?.name || 'Unknown',
        venueLogo: venue?.logo,
        seriesType: displaySeriesType,
        // Now all these values come from the correct seriesType record
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

  // CHANGED: Get stats for a specific entity using the correct seriesType metrics
  const getEntityVenueStats = useCallback((entityId: string, displaySeriesType: SeriesTypeKey): VenueDisplayStats[] => {
    const entityMetrics = venueMetricsMap[entityId]
    if (!entityMetrics) return []
    
    // Get metrics for the selected seriesType
    const metrics = entityMetrics[displaySeriesType] || []
    return transformMetrics(metrics, displaySeriesType)
  }, [venueMetricsMap, transformMetrics])

  // Combined stats for table - ALWAYS use REGULAR for non-SUPER_ADMIN
  const allVenueStats = useMemo(() => {
    const displayType: SeriesTypeKey = 'REGULAR' // Always REGULAR for table view
    const allMetrics = Object.values(venueMetricsMap).flatMap(entityMetrics => 
      entityMetrics[displayType] || []
    )
    return transformMetrics(allMetrics, displayType)
  }, [venueMetricsMap, transformMetrics])

  // Filtered stats for table display
  const filteredTableStats = useMemo(() => {
    if (hideEmptyInTable) {
      return allVenueStats.filter(v => v.totalGames > 0)
    }
    return allVenueStats
  }, [allVenueStats, hideEmptyInTable])

  // ============================================
  // GLOBAL STATS - Computed from venue metrics for accuracy
  // ============================================

  const globalStats = useMemo<GlobalStats>(() => {
    // FIX v2.4.0: Non-SUPER_ADMIN users should use REGULAR metrics for global stats
    // SUPER_ADMIN users can toggle between ALL/REGULAR/SERIES using globalSeriesType
    const metricsSeriesType: SeriesTypeKey = isSuperAdmin ? globalSeriesType : 'REGULAR'
    
    const allMetrics = Object.values(venueMetricsMap).flatMap(entityMetrics => 
      entityMetrics[metricsSeriesType] || []
    )
    
    if (allMetrics.length === 0) {
      return {
        totalVenues: venues.length,
        activeVenues: 0,
        totalGames: 0,
        totalSeriesGames: 0,
        totalRegularGames: 0,
        totalEntries: 0,
        totalPrizepool: 0,
        totalProfit: 0,
        avgEntriesPerGame: 0,
        calculatedAt: null
      }
    }

    const activeVenues = allMetrics.filter(m => m.totalGames > 0).length
    const totalGames = allMetrics.reduce((sum, m) => sum + (m.totalGames || 0), 0)
    // Only show breakdown when viewing ALL metrics
    const totalSeriesGames = (isSuperAdmin && globalSeriesType === 'ALL')
      ? allMetrics.reduce((sum, m) => sum + (m.totalSeriesGames || 0), 0)
      : 0
    const totalRegularGames = (isSuperAdmin && globalSeriesType === 'ALL')
      ? allMetrics.reduce((sum, m) => sum + (m.totalRegularGames || 0), 0)
      : totalGames // When filtering by type, all displayed games are that type
    const totalEntries = allMetrics.reduce((sum, m) => sum + (m.totalEntries || 0), 0)
    const totalPrizepool = allMetrics.reduce((sum, m) => sum + (m.totalPrizepool || 0), 0)
    const totalProfit = allMetrics.reduce((sum, m) => sum + (m.totalProfit || 0), 0)

    const latestCalc = allMetrics.map(m => m.calculatedAt).filter(Boolean).sort().reverse()[0]

    return {
      totalVenues: venues.length,
      activeVenues,
      totalGames,
      totalSeriesGames,
      totalRegularGames,
      totalEntries,
      totalPrizepool,
      totalProfit,
      avgEntriesPerGame: totalGames > 0 ? totalEntries / totalGames : 0,
      calculatedAt: latestCalc ? new Date(latestCalc) : null
    }
  }, [venueMetricsMap, venues, isSuperAdmin, globalSeriesType])

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns = useMemo<ColumnDef<VenueDisplayStats>[]>(() => [
    { accessorKey: 'venueName', header: 'Venue' },
    { accessorKey: 'totalGames', header: 'Games', cell: ({ getValue }) => valOrDash(getValue() as number) },
    { accessorKey: 'totalEntries', header: 'Entries', cell: ({ getValue }) => valOrDash(getValue() as number) },
    { accessorKey: 'totalPrizepool', header: 'Prizepool', cell: ({ getValue }) => valOrDash(getValue() as number, formatCurrency) },
    { accessorKey: 'totalProfit', header: 'Profit', cell: ({ getValue }) => {
      const val = getValue() as number
      if (!val) return '-'
      return <span className={val >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(val)}</span>
    }},
    { accessorKey: 'avgEntriesPerGame', header: 'Avg Entries', cell: ({ getValue }) => {
      const val = getValue() as number
      return val ? val.toFixed(1) : '-'
    }},
    { accessorKey: 'overallHealth', header: 'Health', cell: ({ getValue }) => <HealthBadge health={getValue() as string} /> },
    { accessorKey: 'latestGameDate', header: 'Last Game', cell: ({ row }) => { const date = row.original.latestGameDate; if (!date) return '-'; return formatDateWithDaysAgo(date, row.original.latestGameDaysAgo) } }
  ], [isSuperAdmin])

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
          {/* Global Series Type Selector for KPI Stats - SUPER_ADMIN only */}
          {isSuperAdmin && (
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">Summary Stats Filter:</span>
              <SeriesTypeSelector 
                value={globalSeriesType} 
                onChange={setGlobalSeriesType} 
              />
            </div>
          )}

          {/* Global KPI Cards - Responsive grid with gradual column increase */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <KpiCard title="Total Venues" value={globalStats.totalVenues} subtitle={`${globalStats.activeVenues} active`} icon={<BuildingOffice2Icon className="h-5 w-5" />} />
            <KpiCard 
              title={isSuperAdmin 
                ? (globalSeriesType === 'ALL' ? "Total Games" : globalSeriesType === 'REGULAR' ? "Regular Games" : "Series Games")
                : "Regular Games"
              } 
              value={globalStats.totalGames.toLocaleString()} 
              icon={<CalendarIcon className="h-5 w-5" />} 
            />
            {/* Only show breakdown KPIs for SUPER_ADMIN when viewing ALL */}
            {isSuperAdmin && globalSeriesType === 'ALL' && (
              <>
                <KpiCard title="Regular Games" value={globalStats.totalRegularGames.toLocaleString()} icon={<CalendarIcon className="h-5 w-5 text-blue-500" />} />
                <KpiCard title="Series Games" value={globalStats.totalSeriesGames.toLocaleString()} icon={<TrophyIcon className="h-5 w-5 text-purple-500" />} />
              </>
            )}
            <KpiCard title="Total Prizepool" value={formatCompactCurrency(globalStats.totalPrizepool)} icon={<TrophyIcon className="h-5 w-5" />} />
            <KpiCard title="Profit" value={formatCompactCurrency(globalStats.totalProfit)} icon={<CurrencyDollarIcon className="h-5 w-5" />} />
          </div>

          {/* Entity Venue Sections */}
          <div className="mt-12 space-y-12">
            {selectedEntities.map(entity => {
              // Non-SUPER_ADMIN users always see REGULAR
              const seriesType = isSuperAdmin ? (seriesTypeMap[entity.id] || 'REGULAR') : 'REGULAR'
              const entityVenueStats = getEntityVenueStats(entity.id, seriesType)
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

                    {/* Controls - Only show if there are venues to display */}
                    {allDisplayedVenues.length > 0 && (
                      <div className="flex items-center gap-3">
                        {/* Series Type Selector - ONLY show for SUPER_ADMIN */}
                        {isSuperAdmin && (
                          <SeriesTypeSelector 
                            value={seriesType} 
                            onChange={(newType) => handleSeriesTypeChange(entity.id, newType)} 
                          />
                        )}
                        
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
                    )}
                  </div>

                  {/* Venue Cards - Only render if there are venues to show */}
                  {allDisplayedVenues.length > 0 && (
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                  All Venue Metrics {!isSuperAdmin && '(Regular Games)'}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({filteredTableStats.length} venue{filteredTableStats.length !== 1 ? 's' : ''})
                  </span>
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setHideEmptyInTable(prev => !prev)}
                  className={cx(
                    "flex items-center gap-2 text-xs",
                    hideEmptyInTable ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100" : ""
                  )}
                >
                  {hideEmptyInTable ? (
                    <><ListBulletIcon className="w-4 h-4" />Show all</>
                  ) : (
                    <><EyeSlashIcon className="w-4 h-4" />Hide empty</>
                  )}
                </Button>
              </div>
              <div className="-mx-4 sm:-mx-6">
                <DataTable data={filteredTableStats} columns={columns} onRowClick={handleRowClick} />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  )
}

export default VenuesDashboard