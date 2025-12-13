// src/lib/utils.ts
// Tremor Raw utilities adapted for Kingsroom

import clsx, { type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// ============================================
// CLASS NAME UTILITIES
// ============================================

/**
 * Combines class names with Tailwind CSS merge
 * Handles conditional classes and removes conflicts
 * 
 * @example
 * cx("px-4 py-2", isActive && "bg-indigo-600", className)
 */
export function cx(...args: ClassValue[]) {
  return twMerge(clsx(...args))
}

// ============================================
// FOCUS STATE UTILITIES
// ============================================

/**
 * Standard focus ring styles for buttons, links, etc.
 * Use with cx(): cx(focusRing, "other-classes")
 */
export const focusRing = [
  // base
  "outline outline-offset-2 outline-0 focus-visible:outline-2",
  // outline color
  "outline-indigo-500 dark:outline-indigo-500",
]

/**
 * Focus styles for form inputs
 * Applied on focus, not focus-visible (inputs always show focus)
 */
export const focusInput = [
  // base
  "focus:ring-2",
  // ring color
  "focus:ring-indigo-200 focus:dark:ring-indigo-700/30",
  // border color
  "focus:border-indigo-500 focus:dark:border-indigo-700",
]

/**
 * Error state styles for form inputs
 */
export const hasErrorInput = [
  // base
  "ring-2",
  // border color
  "border-red-500 dark:border-red-700",
  // ring color
  "ring-red-200 dark:ring-red-700/30",
]

// ============================================
// NUMBER FORMATTERS (AU Locale)
// ============================================

/**
 * Format number with Australian locale
 */
export const formatNumber = (number: number, decimals = 0): string => {
  if (!Number.isFinite(number)) return "0"
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number)
}

/**
 * Format as Australian currency (AUD)
 */
export const formatCurrency = (number: number, decimals = 0): string => {
  if (!Number.isFinite(number)) return "$0"
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number)
}

/**
 * Format as percentage with optional sign
 */
export const formatPercent = (number: number, decimals = 1): string => {
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number / 100) // Intl expects decimal (0.5 = 50%)
  
  const sign = number > 0 ? "+" : ""
  return `${sign}${formatted}`
}

/**
 * Format as percentage (already in decimal form, e.g., 0.5 = 50%)
 */
export const formatPercentDecimal = (number: number, decimals = 1): string => {
  const formatted = new Intl.NumberFormat("en-AU", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number)
  
  const sign = number > 0 && number !== Infinity ? "+" : ""
  return `${sign}${formatted}`
}

/**
 * Format large numbers in compact form (e.g., 1.2K, 3.4M)
 */
export const formatCompact = (number: number): string =>
  new Intl.NumberFormat("en-AU", {
    notation: "compact",
    compactDisplay: "short",
  }).format(Number(number))

/**
 * Format as millions (e.g., 1.5M)
 */
export const formatMillions = (number: number, decimals = 1): string => {
  const formatted = new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number)
  return `${formatted}M`
}

// ============================================
// DATE/TIME FORMATTERS (AEST)
// ============================================

/**
 * Format date to AEST timezone
 */
export const formatDateAEST = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * Format datetime to AEST timezone
 */
export const formatDateTimeAEST = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/**
 * Format time only to AEST timezone
 */
export const formatTimeAEST = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export const formatRelativeTime = (date: Date | string): string => {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffSecs = Math.round(diffMs / 1000)
  const diffMins = Math.round(diffSecs / 60)
  const diffHours = Math.round(diffMins / 60)
  const diffDays = Math.round(diffHours / 24)

  const rtf = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" })

  if (Math.abs(diffSecs) < 60) {
    return rtf.format(diffSecs, "second")
  } else if (Math.abs(diffMins) < 60) {
    return rtf.format(diffMins, "minute")
  } else if (Math.abs(diffHours) < 24) {
    return rtf.format(diffHours, "hour")
  } else {
    return rtf.format(diffDays, "day")
  }
}

/**
 * Format date with relative time ("X days ago")
 */
export const formatDateWithDaysAgo = (date: Date | null, daysAgo: number | null): string => {
  if (!date || daysAgo === null) return "N/A"
  
  const formatted = formatDateAEST(date)
  
  if (daysAgo === 0) {
    return `${formatted} (today)`
  } else if (daysAgo === 1) {
    return `${formatted} (yesterday)`
  } else if (daysAgo < 7) {
    return `${formatted} (${daysAgo}d ago)`
  } else if (daysAgo < 30) {
    const weeks = Math.floor(daysAgo / 7)
    return `${formatted} (${weeks}w ago)`
  } else if (daysAgo < 365) {
    const months = Math.floor(daysAgo / 30)
    return `${formatted} (${months}mo ago)`
  } else {
    const years = Math.floor(daysAgo / 365)
    const remainingMonths = Math.floor((daysAgo % 365) / 30)
    if (remainingMonths > 0) {
      return `${formatted} (${years}y ${remainingMonths}mo ago)`
    }
    return `${formatted} (${years}y ago)`
  }
}

// ============================================
// FORMATTER MAP (for dynamic usage)
// ============================================

export const formatters = {
  number: formatNumber,
  currency: formatCurrency,
  percent: formatPercent,
  compact: formatCompact,
  millions: formatMillions,
  date: formatDateAEST,
  datetime: formatDateTimeAEST,
  time: formatTimeAEST,
  relative: formatRelativeTime,
} as const

// ============================================
// TYPE HELPERS
// ============================================

/**
 * Extract props type from a component
 */
export type PropsOf<T> = T extends React.ComponentType<infer P> ? P : never

/**
 * Make specific keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * Make all keys optional except specified ones
 */
export type OnlyRequired<T, K extends keyof T> = Partial<T> & Required<Pick<T, K>>