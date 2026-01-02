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
// AEST DATE UTILITIES (Core Functions)
// ============================================

/**
 * AEST components interface
 */
export interface AESTComponents {
  year: number;
  month: number;      // 1-indexed (1 = January)
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number;  // 0 = Sunday
  isoDate: string;    // "YYYY-MM-DD"
}

/**
 * Convert a UTC date to AEST/AEDT components
 * Uses Intl.DateTimeFormat for accurate timezone handling including DST
 * 
 * @param date - Date to convert (UTC ISO string or Date object)
 * @returns AEST components or null if invalid
 */
export const toAEST = (date: Date | string | null | undefined): AESTComponents | null => {
  if (!date) return null;
  
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  
  // Use Intl.DateTimeFormat for accurate AEST conversion (handles DST automatically)
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "0";
  
  const year = parseInt(getPart("year"), 10);
  const month = parseInt(getPart("month"), 10);
  const day = parseInt(getPart("day"), 10);
  const hours = parseInt(getPart("hour"), 10);
  const minutes = parseInt(getPart("minute"), 10);
  const seconds = parseInt(getPart("second"), 10);
  
  // Map weekday name to number
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[getPart("weekday")] ?? 0;
  
  const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  
  return { year, month, day, hours, minutes, seconds, dayOfWeek, isoDate };
};

/**
 * Get the current date/time in AEST
 */
export const nowAEST = (): AESTComponents => {
  return toAEST(new Date())!;
};

/**
 * Get today's date string in AEST ("YYYY-MM-DD")
 */
export const getTodayAEST = (): string => {
  return nowAEST().isoDate;
};

/**
 * Get "YYYY-MM" string for a date in AEST context
 * Critical for GSI partition key queries
 */
export const getYearMonthAEST = (date: Date | string | null | undefined): string => {
  const aest = toAEST(date);
  if (!aest) return "";
  return `${aest.year}-${String(aest.month).padStart(2, "0")}`;
};

/**
 * Get the day of week name in AEST
 */
export const getDayOfWeekAEST = (date: Date | string): string => {
  const aest = toAEST(date);
  if (!aest) return "";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[aest.dayOfWeek];
};

/**
 * Check if two dates are the same calendar day in AEST
 */
export const isSameDayAEST = (date1: Date | string | null, date2: Date | string | null): boolean => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  if (!aest1 || !aest2) return false;
  return aest1.isoDate === aest2.isoDate;
};

/**
 * Check if a date is today in AEST
 */
export const isTodayAEST = (date: Date | string | null): boolean => {
  return isSameDayAEST(date, new Date());
};

/**
 * Check if a date is yesterday in AEST
 */
export const isYesterdayAEST = (date: Date | string | null): boolean => {
  const aest = toAEST(date);
  if (!aest) return false;
  
  // Create "yesterday" by going back one day from today
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayAEST = toAEST(yesterday);
  
  return aest.isoDate === yesterdayAEST?.isoDate;
};

/**
 * Get the difference in calendar days between two dates in AEST
 * Returns positive if date1 is after date2
 */
export const getDaysDifferenceAEST = (date1: Date | string | null, date2: Date | string | null): number | null => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  if (!aest1 || !aest2) return null;
  
  // Create dates at midnight for comparison
  const d1 = new Date(aest1.year, aest1.month - 1, aest1.day);
  const d2 = new Date(aest2.year, aest2.month - 1, aest2.day);
  
  const diffMs = d1.getTime() - d2.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
};

/**
 * Get the start of day (midnight) in AEST as a UTC ISO string
 * 
 * Example: For 2pm AEST Jan 15, returns the UTC time that corresponds 
 * to midnight AEST Jan 15 (which is 1pm or 2pm UTC Jan 14)
 */
export const getStartOfDayAEST = (date: Date | string = new Date()): string => {
  const aest = toAEST(date);
  if (!aest) return new Date().toISOString();
  
  // Create a date string for midnight AEST and let the browser convert
  // We use a trick: format as ISO and parse with timezone
  const midnightLocal = new Date(`${aest.isoDate}T00:00:00+11:00`); // AEDT
  const midnightLocalAEST = new Date(`${aest.isoDate}T00:00:00+10:00`); // AEST
  
  // Use the formatter to determine if we're in DST
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    timeZoneName: "short"
  });
  const tzParts = formatter.formatToParts(new Date(date));
  const tzName = tzParts.find(p => p.type === "timeZoneName")?.value;
  const isDST = tzName === "AEDT";
  
  return isDST ? midnightLocal.toISOString() : midnightLocalAEST.toISOString();
};

/**
 * Get the end of day (23:59:59.999) in AEST as a UTC ISO string
 */
export const getEndOfDayAEST = (date: Date | string = new Date()): string => {
  const aest = toAEST(date);
  if (!aest) return new Date().toISOString();
  
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    timeZoneName: "short"
  });
  const tzParts = formatter.formatToParts(new Date(date));
  const tzName = tzParts.find(p => p.type === "timeZoneName")?.value;
  const isDST = tzName === "AEDT";
  const offset = isDST ? "+11:00" : "+10:00";
  
  const endOfDay = new Date(`${aest.isoDate}T23:59:59.999${offset}`);
  return endOfDay.toISOString();
};

/**
 * Get a date X days ago at start of day in AEST, as UTC ISO string
 * Perfect for "last 7 days" queries
 */
export const getDaysAgoAEST = (daysAgo: number): string => {
  const now = new Date();
  const target = new Date(now);
  target.setDate(target.getDate() - daysAgo);
  return getStartOfDayAEST(target);
};

/**
 * Get a date X months ago at start of that month in AEST
 */
export const getMonthsAgoAEST = (monthsAgo: number): string => {
  const now = nowAEST();
  let targetMonth = now.month - monthsAgo;
  let targetYear = now.year;
  
  while (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }
  
  // First day of the target month
  const isoDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  
  // Determine offset for that date (rough check)
  const isWinter = targetMonth >= 4 && targetMonth <= 9;
  const offset = isWinter ? "+10:00" : "+11:00";
  
  return new Date(`${isoDate}T00:00:00${offset}`).toISOString();
};

// ============================================
// DATE/TIME FORMATTERS (AEST Display)
// ============================================

/**
 * Format date to AEST timezone
 */
export const formatDateAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
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
export const formatDateTimeAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
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
export const formatTimeAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/**
 * Format date with short month (e.g., "15 Jan 2025")
 */
export const formatDateShortAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Format date without year (e.g., "15 Jan")
 */
export const formatDateNoYearAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  })
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export const formatRelativeTime = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  
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
 * Format date with relative context ("Today", "Yesterday", or date)
 */
export const formatDateRelativeAEST = (date: Date | string | null | undefined): string => {
  if (!date) return "";
  
  if (isTodayAEST(date)) return "Today";
  if (isYesterdayAEST(date)) return "Yesterday";
  
  const daysDiff = getDaysDifferenceAEST(new Date(), date);
  if (daysDiff !== null && daysDiff > 0 && daysDiff < 7) {
    return `${daysDiff} days ago`;
  }
  
  return formatDateShortAEST(date);
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

/**
 * Get date key for grouping (e.g., "2025-01-15")
 * Uses AEST calendar day
 */
export const getDateKeyAEST = (date: Date | string | null | undefined): string => {
  const aest = toAEST(date);
  return aest?.isoDate || "";
};

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