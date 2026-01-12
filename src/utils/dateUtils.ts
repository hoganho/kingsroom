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
};