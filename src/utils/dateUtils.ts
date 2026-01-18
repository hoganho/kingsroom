/**
 * src/utils/dateUtils.ts
 * Frontend date utilities with AEST awareness
 * 
 * Use these functions throughout the frontend to ensure consistent
 * date handling with the Australian Eastern timezone.
 */

// AEST/AEDT offsets
const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

/**
 * Check if a date falls within Australian Eastern Daylight Time
 * AEDT runs from first Sunday in October to first Sunday in April
 */
export const isAEDT = (date: Date): boolean => {
  const month = date.getUTCMonth(); // 0-indexed
  
  // AEDT: October through March (roughly)
  if (month >= 3 && month <= 8) {
    // April through September - AEST
    return false;
  }
  if (month >= 10 || month <= 1) {
    // November through February - AEDT
    return true;
  }
  
  // October or March - use approximation
  const dayOfMonth = date.getUTCDate();
  if (month === 9) { // October
    return dayOfMonth >= 7;
  }
  return true; // March is still AEDT
};

/**
 * Get the current AEST/AEDT offset in hours
 */
export const getAustralianOffset = (date: Date): number => {
  return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
};

export interface AESTComponents {
  year: number;
  month: number; // 0-indexed
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number;
  isoDate: string; // YYYY-MM-DD
}

/**
 * Convert a UTC date to AEST/AEDT local date components
 */
export const toAEST = (utcDate: Date | string): AESTComponents => {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
  const offset = getAustralianOffset(d);
  
  // Add offset to get AEST time
  const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
  
  return {
    year: aestTime.getUTCFullYear(),
    month: aestTime.getUTCMonth(),
    day: aestTime.getUTCDate(),
    hours: aestTime.getUTCHours(),
    minutes: aestTime.getUTCMinutes(),
    seconds: aestTime.getUTCSeconds(),
    dayOfWeek: aestTime.getUTCDay(),
    isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`
  };
};

/**
 * Convert AEST date components to UTC Date object
 */
export const fromAEST = (
  year: number,
  month: number,
  day: number,
  hours = 0,
  minutes = 0
): Date => {
  const tempDate = new Date(Date.UTC(year, month, day, hours, minutes));
  const offset = getAustralianOffset(tempDate);
  
  return new Date(tempDate.getTime() - (offset * 60 * 60 * 1000));
};

/**
 * Get year-month string in AEST for GSI partitioning
 * Use this instead of calculating in browser timezone
 */
export const getYearMonthAEST = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    
    const aest = toAEST(d);
    return `${aest.year}-${String(aest.month + 1).padStart(2, '0')}`;
  } catch {
    return null;
  }
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Format a date for display in AEST
 */
export const formatAEST = (
  date: Date | string,
  options: {
    includeTime?: boolean;
    includeDay?: boolean;
    shortDay?: boolean;
  } = {}
): string => {
  const aest = toAEST(date);
  const { includeTime = false, includeDay = false, shortDay = false } = options;
  
  let result = aest.isoDate;
  
  if (includeDay) {
    const dayName = shortDay 
      ? DAYS_OF_WEEK[aest.dayOfWeek].slice(0, 3) 
      : DAYS_OF_WEEK[aest.dayOfWeek];
    result = `${dayName} ${result}`;
  }
  
  if (includeTime) {
    const hours = aest.hours % 12 || 12;
    const ampm = aest.hours >= 12 ? 'PM' : 'AM';
    const mins = String(aest.minutes).padStart(2, '0');
    result += ` ${hours}:${mins} ${ampm} AEST`;
  }
  
  return result;
};

/**
 * Format a date for display, showing relative time for recent/upcoming dates
 * Handles both past dates ("X ago") and future dates ("in X")
 */
export const formatRelativeAEST = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;
  
  const absDiffMins = Math.floor(absDiffMs / (1000 * 60));
  const absDiffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
  const absDiffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
  
  if (isFuture) {
    // Future dates - "in X"
    if (absDiffMins < 60) {
      return absDiffMins <= 1 ? 'In a moment' : `In ${absDiffMins} minutes`;
    }
    if (absDiffHours < 24) {
      return absDiffHours === 1 ? 'In 1 hour' : `In ${absDiffHours} hours`;
    }
    if (absDiffDays < 7) {
      return absDiffDays === 1 ? 'Tomorrow' : `In ${absDiffDays} days`;
    }
    // More than a week away - show formatted date
    return formatAEST(date, { includeDay: true, shortDay: true });
  } else {
    // Past dates - "X ago"
    if (absDiffMins < 60) {
      return absDiffMins <= 1 ? 'Just now' : `${absDiffMins} minutes ago`;
    }
    if (absDiffHours < 24) {
      return absDiffHours === 1 ? '1 hour ago' : `${absDiffHours} hours ago`;
    }
    if (absDiffDays < 7) {
      return absDiffDays === 1 ? 'Yesterday' : `${absDiffDays} days ago`;
    }
    // More than a week ago - show formatted date
    return formatAEST(date, { includeDay: true, shortDay: true });
  }
};

/**
 * Get the day of week in AEST
 */
export const getDayOfWeekAEST = (date: Date | string): string => {
  const aest = toAEST(date);
  return DAYS_OF_WEEK[aest.dayOfWeek].toUpperCase();
};

/**
 * Check if two dates are the same calendar day in AEST
 */
export const isSameDayAEST = (date1: Date | string, date2: Date | string): boolean => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  return aest1.year === aest2.year &&
         aest1.month === aest2.month &&
         aest1.day === aest2.day;
};

/**
 * Get the difference in calendar days between two dates IN AEST
 */
export const getDaysDifferenceAEST = (date1: Date | string, date2: Date | string): number => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  const d1 = new Date(Date.UTC(aest1.year, aest1.month, aest1.day));
  const d2 = new Date(Date.UTC(aest2.year, aest2.month, aest2.day));
  
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Parse a Facebook timestamp to a proper Date
 * Facebook exports timestamps in various formats
 */
export const parseFacebookTimestamp = (timestamp: string | number): Date | null => {
  if (!timestamp) return null;
  
  try {
    // If it's a Unix timestamp (seconds since epoch)
    if (typeof timestamp === 'number' || /^\d{10,13}$/.test(String(timestamp))) {
      const ts = typeof timestamp === 'number' ? timestamp : parseInt(timestamp, 10);
      // Convert seconds to milliseconds if needed
      const ms = ts > 9999999999 ? ts : ts * 1000;
      return new Date(ms);
    }
    
    // Try parsing as ISO string
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    return null;
  } catch {
    return null;
  }
};

// ===================================================================
// PERIOD UTILITIES (for AI Insights reporting)
// ===================================================================
// Week Definition: Monday 00:00:00 AEST to Sunday 23:59:59 AEST
// Week Key Format: YYYY-Www (e.g., "2026-W03")
// Month Key Format: YYYY-MM (e.g., "2026-01")
// ===================================================================

export interface PeriodBounds {
  start: Date;      // UTC Date representing start of period in AEST
  end: Date;        // UTC Date representing end of period in AEST
  key: string;      // Period key (e.g., "2026-W03" or "2026-01")
  label: string;    // Human-readable label
}

/**
 * Get ISO week number for a date in AEST
 */
export const getISOWeekNumberAEST = (date: Date | string): number => {
  const aest = toAEST(date);
  
  // Create a date in UTC that represents the AEST date
  const d = new Date(Date.UTC(aest.year, aest.month, aest.day));
  const dayNum = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

/**
 * Get ISO week year (may differ from calendar year at year boundaries)
 */
export const getISOWeekYearAEST = (date: Date | string): number => {
  const aest = toAEST(date);
  const d = new Date(Date.UTC(aest.year, aest.month, aest.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
};

/**
 * Get week bounds for a given date in AEST.
 * Week runs Monday 00:00:00 AEST to Sunday 23:59:59 AEST.
 */
export const getWeekBoundsAEST = (date: Date | string): PeriodBounds => {
  const aest = toAEST(date);
  
  // Calculate days since Monday (Monday = 0, Sunday = 6)
  const daysSinceMonday = aest.dayOfWeek === 0 ? 6 : aest.dayOfWeek - 1;
  
  // Get Monday of this week in AEST
  const mondayDay = aest.day - daysSinceMonday;
  
  // Start: Monday 00:00:00 AEST
  const start = fromAEST(aest.year, aest.month, mondayDay, 0, 0);
  
  // End: Sunday 23:59:59 AEST (6 days after Monday)
  const end = fromAEST(aest.year, aest.month, mondayDay + 6, 23, 59);
  
  // Get week number and year from the Monday
  const weekNum = getISOWeekNumberAEST(start);
  const weekYear = getISOWeekYearAEST(start);
  const key = `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
  
  // Generate label
  const startAEST = toAEST(start);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `Week ${weekNum}, ${monthNames[startAEST.month]} ${startAEST.year}`;
  
  return { start, end, key, label };
};

/**
 * Get month bounds for a given date in AEST.
 */
export const getMonthBoundsAEST = (date: Date | string): PeriodBounds => {
  const aest = toAEST(date);
  
  // Start: 1st of month 00:00:00 AEST
  const start = fromAEST(aest.year, aest.month, 1, 0, 0);
  
  // End: Last day of month 23:59:59 AEST
  // Get last day by going to day 0 of next month
  const lastDay = new Date(Date.UTC(aest.year, aest.month + 1, 0)).getUTCDate();
  const end = fromAEST(aest.year, aest.month, lastDay, 23, 59);
  
  const key = `${aest.year}-${String(aest.month + 1).padStart(2, '0')}`;
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  const label = `${monthNames[aest.month]} ${aest.year}`;
  
  return { start, end, key, label };
};

/**
 * Get quarter bounds for a given date in AEST.
 */
export const getQuarterBoundsAEST = (date: Date | string): PeriodBounds => {
  const aest = toAEST(date);
  const quarter = Math.floor(aest.month / 3);
  const quarterStartMonth = quarter * 3;
  
  // Start: 1st of quarter's first month 00:00:00 AEST
  const start = fromAEST(aest.year, quarterStartMonth, 1, 0, 0);
  
  // End: Last day of quarter's last month 23:59:59 AEST
  const quarterEndMonth = quarterStartMonth + 2;
  const lastDay = new Date(Date.UTC(aest.year, quarterEndMonth + 1, 0)).getUTCDate();
  const end = fromAEST(aest.year, quarterEndMonth, lastDay, 23, 59);
  
  const key = `${aest.year}-Q${quarter + 1}`;
  const label = `Q${quarter + 1} ${aest.year}`;
  
  return { start, end, key, label };
};

/**
 * Parse a week key (e.g., "2026-W03") to get the Monday of that week
 */
export const parseWeekKey = (weekKey: string): Date => {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid week key: ${weekKey}`);
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // Find January 4th of the year (always in week 1)
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Sunday = 7
  
  // Find the Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  
  // Add weeks to get target Monday
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  
  // Convert to AEST Monday 00:00
  const aestMonday = toAEST(targetMonday);
  return fromAEST(aestMonday.year, aestMonday.month, aestMonday.day, 0, 0);
};

/**
 * Parse a month key (e.g., "2026-01") to get the bounds
 */
export const parseMonthKey = (monthKey: string): PeriodBounds => {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1; // 0-indexed
  
  // Create a date in that month and get bounds
  const dateInMonth = fromAEST(year, month, 15, 12, 0);
  return getMonthBoundsAEST(dateInMonth);
};

/**
 * Get the previous period bounds
 */
export const getPreviousPeriodAEST = (
  currentPeriod: PeriodBounds,
  periodType: 'week' | 'month' | 'quarter'
): PeriodBounds => {
  // Go back from the start of current period
  const beforeStart = new Date(currentPeriod.start.getTime() - 24 * 60 * 60 * 1000);
  
  switch (periodType) {
    case 'week':
      return getWeekBoundsAEST(beforeStart);
    case 'month':
      return getMonthBoundsAEST(beforeStart);
    case 'quarter':
      return getQuarterBoundsAEST(beforeStart);
  }
};

/**
 * Get the next period bounds
 */
export const getNextPeriodAEST = (
  currentPeriod: PeriodBounds,
  periodType: 'week' | 'month' | 'quarter'
): PeriodBounds => {
  // Go forward from the end of current period
  const afterEnd = new Date(currentPeriod.end.getTime() + 24 * 60 * 60 * 1000);
  
  switch (periodType) {
    case 'week':
      return getWeekBoundsAEST(afterEnd);
    case 'month':
      return getMonthBoundsAEST(afterEnd);
    case 'quarter':
      return getQuarterBoundsAEST(afterEnd);
  }
};

/**
 * Get current period key for a given period type
 */
export const getCurrentPeriodKeyAEST = (periodType: 'week' | 'month' | 'quarter'): string => {
  const now = new Date();
  
  switch (periodType) {
    case 'week':
      return getWeekBoundsAEST(now).key;
    case 'month':
      return getMonthBoundsAEST(now).key;
    case 'quarter':
      return getQuarterBoundsAEST(now).key;
  }
};

/**
 * Check if a date falls within a period
 */
export const isInPeriodAEST = (date: Date | string, period: PeriodBounds): boolean => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() >= period.start.getTime() && d.getTime() <= period.end.getTime();
};

/**
 * Get list of period keys between two dates
 */
export const getPeriodKeysBetweenAEST = (
  periodType: 'week' | 'month',
  startDate: Date | string,
  endDate: Date | string
): string[] => {
  const keys: string[] = [];
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  
  let current = periodType === 'week' 
    ? getWeekBoundsAEST(start) 
    : getMonthBoundsAEST(start);
  
  while (current.start.getTime() <= end.getTime()) {
    keys.push(current.key);
    current = getNextPeriodAEST(current, periodType);
  }
  
  return keys;
};

/**
 * Format a period key for display
 */
export const formatPeriodKey = (periodKey: string): string => {
  // Week key: "2026-W03" -> "Week 3, Jan 2026"
  const weekMatch = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const monday = parseWeekKey(periodKey);
    const aest = toAEST(monday);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `Week ${parseInt(weekMatch[2])}, ${monthNames[aest.month]} ${aest.year}`;
  }
  
  // Month key: "2026-01" -> "January 2026"
  const monthMatch = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[parseInt(monthMatch[2]) - 1]} ${monthMatch[1]}`;
  }
  
  // Quarter key: "2026-Q1" -> "Q1 2026"
  const quarterMatch = periodKey.match(/^(\d{4})-Q(\d)$/);
  if (quarterMatch) {
    return `Q${quarterMatch[2]} ${quarterMatch[1]}`;
  }
  
  return periodKey;
};

export default {
  toAEST,
  fromAEST,
  isAEDT,
  getAustralianOffset,
  formatAEST,
  formatRelativeAEST,
  getYearMonthAEST,
  getDayOfWeekAEST,
  isSameDayAEST,
  getDaysDifferenceAEST,
  parseFacebookTimestamp,
  // Period utilities
  getISOWeekNumberAEST,
  getISOWeekYearAEST,
  getWeekBoundsAEST,
  getMonthBoundsAEST,
  getQuarterBoundsAEST,
  parseWeekKey,
  parseMonthKey,
  getPreviousPeriodAEST,
  getNextPeriodAEST,
  getCurrentPeriodKeyAEST,
  isInPeriodAEST,
  getPeriodKeysBetweenAEST,
  formatPeriodKey,
};