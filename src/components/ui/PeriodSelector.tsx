// src/components/ui/PeriodSelector.tsx
// Flexible period selector for AI Insights report generation
// Matches existing TimeRangeToggle styling patterns

import { useState, useMemo, useRef, useEffect } from "react"
import { cx, focusRing } from "@/lib/utils"
import { 
  Calendar, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight
} from "lucide-react"

// Import types from shared types file (which uses API.ts types)
import type { 
  PeriodSelectorState,
  RelativePeriod,
  ResolvedPeriod,
} from "@/types/periodSelection"

// Re-export for convenience
export type { PeriodSelectorState, RelativePeriod, ResolvedPeriod }

// ===================================================================
// QUICK PRESETS
// ===================================================================

const QUICK_PRESETS: { key: RelativePeriod; label: string; group: string }[] = [
  { key: 'CURRENT_WEEK' as RelativePeriod, label: 'This Week', group: 'Week' },
  { key: 'LAST_WEEK' as RelativePeriod, label: 'Last Week', group: 'Week' },
  { key: 'CURRENT_MONTH' as RelativePeriod, label: 'This Month', group: 'Month' },
  { key: 'LAST_MONTH' as RelativePeriod, label: 'Last Month', group: 'Month' },
  { key: 'CURRENT_QUARTER' as RelativePeriod, label: 'This Quarter', group: 'Quarter' },
  { key: 'LAST_QUARTER' as RelativePeriod, label: 'Last Quarter', group: 'Quarter' },
  { key: 'LAST_7_DAYS' as RelativePeriod, label: 'Last 7 Days', group: 'Rolling' },
  { key: 'LAST_30_DAYS' as RelativePeriod, label: 'Last 30 Days', group: 'Rolling' },
  { key: 'LAST_90_DAYS' as RelativePeriod, label: 'Last 90 Days', group: 'Rolling' },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function getISOWeekYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  return d.getUTCFullYear()
}

function getISOWeeksInYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28))
  return getISOWeekNumber(dec28)
}

function getSelectionLabel(state: PeriodSelectorState): string {
  switch (state.tab) {
    case 'quick':
      return QUICK_PRESETS.find(p => p.key === state.relativePeriod)?.label || 'Select period'
    case 'week':
      return state.isoYear && state.isoWeek ? `Week ${state.isoWeek}, ${state.isoYear}` : 'Select week'
    case 'month':
      return state.monthYear && state.month ? `${MONTHS[(state.month || 1) - 1]} ${state.monthYear}` : 'Select month'
    case 'quarter':
      return state.quarterYear && state.quarter ? `Q${state.quarter} ${state.quarterYear}` : 'Select quarter'
    case 'custom':
      if (state.customStartDate && state.customEndDate) {
        return `${state.customStartDate} to ${state.customEndDate}`
      }
      return 'Custom range'
    default:
      return 'Select period'
  }
}

// ===================================================================
// PROPS INTERFACES
// ===================================================================

interface PeriodSelectorProps {
  value: PeriodSelectorState
  onChange: (value: PeriodSelectorState) => void
  onApply?: () => void
  resolvedPeriod?: ResolvedPeriod | null
  disabled?: boolean
  compact?: boolean
  className?: string
}

interface PeriodSelectorDropdownProps {
  value: PeriodSelectorState
  onChange: (value: PeriodSelectorState) => void
  resolvedPeriod?: ResolvedPeriod | null
  disabled?: boolean
  className?: string
}

// ===================================================================
// MAIN COMPONENT
// ===================================================================

type TabKey = 'quick' | 'week' | 'month' | 'quarter' | 'custom'

export function PeriodSelector({ 
  value, 
  onChange, 
  onApply,
  resolvedPeriod,
  disabled,
  compact,
  className 
}: PeriodSelectorProps) {
  const [weekYear, setWeekYear] = useState(value.isoYear || getISOWeekYear(new Date()))
  const [monthYear, setMonthYear] = useState(value.monthYear || new Date().getFullYear())
  const [quarterYear, setQuarterYear] = useState(value.quarterYear || new Date().getFullYear())
  
  const now = new Date()
  const currentWeek = getISOWeekNumber(now)
  const currentWeekYear = getISOWeekYear(now)
  const currentMonth = now.getMonth() + 1
  const currentMonthYear = now.getFullYear()
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1
  const currentQuarterYear = now.getFullYear()
  
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'quick', label: 'Quick' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'custom', label: 'Custom' },
  ]
  
  // Generate week options for selected year
  const weekOptions = useMemo(() => {
    const totalWeeks = getISOWeeksInYear(weekYear)
    return Array.from({ length: totalWeeks }, (_, i) => i + 1)
  }, [weekYear])
  
  const handleTabChange = (tab: TabKey) => {
    onChange({ ...value, tab })
  }
  
  return (
    <div className={cx("rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950", className)}>
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            disabled={disabled}
            className={cx(
              "flex-1 px-3 py-2 text-sm font-medium transition-colors",
              focusRing,
              value.tab === tab.key
                ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 -mb-px"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <div className="p-4">
        {/* Quick Presets */}
        {value.tab === 'quick' && (
          <div className="grid grid-cols-3 gap-2">
            {QUICK_PRESETS.map((preset) => {
              const isSelected = value.relativePeriod === preset.key
              return (
                <button
                  key={preset.key}
                  onClick={() => onChange({ ...value, tab: 'quick', relativePeriod: preset.key })}
                  disabled={disabled}
                  className={cx(
                    "px-3 py-2 text-sm rounded-md transition-all",
                    focusRing,
                    isSelected
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        )}
        
        {/* Week Selector */}
        {value.tab === 'week' && (
          <div className="space-y-3">
            {/* Year Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setWeekYear(y => y - 1)}
                disabled={disabled}
                className={cx("p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800", focusRing)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-medium">{weekYear}</span>
              <button
                onClick={() => setWeekYear(y => y + 1)}
                disabled={disabled || weekYear >= currentWeekYear}
                className={cx(
                  "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
                  focusRing,
                  weekYear >= currentWeekYear && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            
            {/* Week Grid */}
            <div className="grid grid-cols-6 gap-1.5">
              {weekOptions.map((week) => {
                const isSelected = value.isoYear === weekYear && value.isoWeek === week
                const isCurrent = weekYear === currentWeekYear && week === currentWeek
                const isFuture = weekYear > currentWeekYear || (weekYear === currentWeekYear && week > currentWeek)
                
                return (
                  <button
                    key={week}
                    onClick={() => onChange({ ...value, tab: 'week', isoYear: weekYear, isoWeek: week })}
                    disabled={disabled || isFuture}
                    className={cx(
                      "relative px-2 py-1.5 text-sm rounded transition-all",
                      focusRing,
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : isFuture
                          ? "bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    W{week}
                    {isCurrent && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Month Selector */}
        {value.tab === 'month' && (
          <div className="space-y-3">
            {/* Year Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMonthYear(y => y - 1)}
                disabled={disabled}
                className={cx("p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800", focusRing)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-medium">{monthYear}</span>
              <button
                onClick={() => setMonthYear(y => y + 1)}
                disabled={disabled || monthYear >= currentMonthYear}
                className={cx(
                  "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
                  focusRing,
                  monthYear >= currentMonthYear && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            
            {/* Month Grid */}
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map((monthName, idx) => {
                const month = idx + 1
                const isSelected = value.monthYear === monthYear && value.month === month
                const isCurrent = monthYear === currentMonthYear && month === currentMonth
                const isFuture = monthYear > currentMonthYear || (monthYear === currentMonthYear && month > currentMonth)
                
                return (
                  <button
                    key={monthName}
                    onClick={() => onChange({ ...value, tab: 'month', monthYear, month })}
                    disabled={disabled || isFuture}
                    className={cx(
                      "relative px-3 py-2 text-sm rounded-md transition-all",
                      focusRing,
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : isFuture
                          ? "bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    {monthName}
                    {isCurrent && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Quarter Selector */}
        {value.tab === 'quarter' && (
          <div className="space-y-3">
            {/* Year Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setQuarterYear(y => y - 1)}
                disabled={disabled}
                className={cx("p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800", focusRing)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="font-medium">{quarterYear}</span>
              <button
                onClick={() => setQuarterYear(y => y + 1)}
                disabled={disabled || quarterYear >= currentQuarterYear}
                className={cx(
                  "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
                  focusRing,
                  quarterYear >= currentQuarterYear && "opacity-50 cursor-not-allowed"
                )}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            
            {/* Quarter Grid */}
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((q) => {
                const isSelected = value.quarterYear === quarterYear && value.quarter === q
                const isCurrent = quarterYear === currentQuarterYear && q === currentQuarter
                const isFuture = quarterYear > currentQuarterYear || (quarterYear === currentQuarterYear && q > currentQuarter)
                
                return (
                  <button
                    key={q}
                    onClick={() => onChange({ ...value, tab: 'quarter', quarterYear, quarter: q })}
                    disabled={disabled || isFuture}
                    className={cx(
                      "relative px-4 py-3 text-sm font-medium rounded-md transition-all",
                      focusRing,
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : isFuture
                          ? "bg-gray-50 dark:bg-gray-900 text-gray-300 dark:text-gray-700 cursor-not-allowed"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    )}
                  >
                    Q{q}
                    {isCurrent && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Custom Range */}
        {value.tab === 'custom' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={value.customStartDate || ''}
                  onChange={(e) => onChange({ ...value, tab: 'custom', customStartDate: e.target.value })}
                  disabled={disabled}
                  max={value.customEndDate || new Date().toISOString().split('T')[0]}
                  className={cx(
                    "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md",
                    "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100",
                    "focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={value.customEndDate || ''}
                  onChange={(e) => onChange({ ...value, tab: 'custom', customEndDate: e.target.value })}
                  disabled={disabled}
                  min={value.customStartDate || undefined}
                  max={new Date().toISOString().split('T')[0]}
                  className={cx(
                    "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md",
                    "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100",
                    "focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  )}
                />
              </div>
            </div>
            
            {onApply && value.customStartDate && value.customEndDate && (
              <button
                onClick={onApply}
                disabled={disabled}
                className={cx(
                  "w-full px-4 py-2 text-sm font-medium rounded-md",
                  "bg-indigo-600 text-white hover:bg-indigo-700",
                  focusRing
                )}
              >
                Apply Custom Range
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Resolved Period Preview */}
      {resolvedPeriod && !compact && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {resolvedPeriod.periodLabel}
            </div>
            <div className="text-xs">
              {new Date(resolvedPeriod.startDate).toLocaleDateString()} -{' '}
              {new Date(resolvedPeriod.endDate).toLocaleDateString()}
            </div>
            {resolvedPeriod.comparisonPeriodLabel && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                vs {resolvedPeriod.comparisonPeriodLabel}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ===================================================================
// DROPDOWN VARIANT
// ===================================================================

export function PeriodSelectorDropdown({
  value,
  onChange,
  resolvedPeriod,
  disabled,
  className
}: PeriodSelectorDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])
  
  // Close on selection (except custom tab)
  const handleChange = (newValue: PeriodSelectorState) => {
    onChange(newValue)
    // Keep open for custom tab since user needs to enter dates
    if (newValue.tab !== 'custom') {
      setIsOpen(false)
    }
  }
  
  return (
    <div ref={containerRef} className={cx("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={cx(
          "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border",
          "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900",
          "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800",
          focusRing,
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Calendar className="h-4 w-4" />
        <span>{getSelectionLabel(value)}</span>
        <ChevronDown className={cx("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 mt-2 w-[400px] shadow-lg">
          <PeriodSelector
            value={value}
            onChange={handleChange}
            resolvedPeriod={resolvedPeriod}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
