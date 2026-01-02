/**
 * utils/dateUtils.js
 * Date parsing and manipulation utilities
 * 
 * UPDATED: Proper AEST timezone handling for Australian poker operations
 * 
 * KEY PRINCIPLE: All dates in the system should be stored and compared in AEST context,
 * because that's when games actually run. A "Tuesday night tournament" is Tuesday in Sydney,
 * regardless of what UTC says.
 */

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// AEST/AEDT offsets (Australia doesn't observe DST uniformly, but Sydney does)
// AEST = UTC+10, AEDT = UTC+11
const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

/**
 * Check if a date falls within Australian Eastern Daylight Time
 * AEDT runs from first Sunday in October to first Sunday in April
 * 
 * @param {Date} date - Date to check (in UTC)
 * @returns {boolean} True if AEDT is in effect
 */
const isAEDT = (date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed
  
  // AEDT: October (9) to March (2) - roughly
  // More precise: First Sunday of October 2am to First Sunday of April 3am
  if (month >= 3 && month <= 8) {
    // April through September - definitely AEST
    return false;
  }
  if (month >= 10 || month <= 1) {
    // November through February - definitely AEDT
    return true;
  }
  
  // October or March - need to check more precisely
  // For simplicity, use approximation (first week of month)
  const dayOfMonth = date.getUTCDate();
  if (month === 9) { // October
    // AEDT starts first Sunday of October
    return dayOfMonth >= 7; // Rough approximation
  }
  if (month === 2) { // March
    // AEDT ends first Sunday of April, so March is still AEDT
    return true;
  }
  
  return false;
};

/**
 * Get the current AEST/AEDT offset in hours for a given date
 * 
 * @param {Date} date - Date to check
 * @returns {number} Offset in hours (10 for AEST, 11 for AEDT)
 */
const getAustralianOffset = (date) => {
  return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
};

/**
 * Convert a UTC date to AEST/AEDT local date components
 * 
 * @param {Date|string} utcDate - Date in UTC
 * @returns {{ year: number, month: number, day: number, hours: number, minutes: number, dayOfWeek: number }}
 */
const toAEST = (utcDate) => {
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
    dayOfWeek: aestTime.getUTCDay(),
    isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`
  };
};

/**
 * Convert AEST date components to UTC Date object
 * 
 * @param {number} year 
 * @param {number} month - 0-indexed
 * @param {number} day 
 * @param {number} hours - default 0
 * @param {number} minutes - default 0
 * @returns {Date} UTC Date object
 */
const fromAEST = (year, month, day, hours = 0, minutes = 0) => {
  // Create date in UTC first, then subtract AEST offset
  const tempDate = new Date(Date.UTC(year, month, day, hours, minutes));
  const offset = getAustralianOffset(tempDate);
  
  return new Date(tempDate.getTime() - (offset * 60 * 60 * 1000));
};

/**
 * Get day of week from date IN AEST
 * @param {Date|string} date 
 * @returns {string} MONDAY, TUESDAY, etc.
 */
const getDayOfWeek = (date) => {
  const aest = toAEST(date);
  return DAYS_OF_WEEK[aest.dayOfWeek];
};

/**
 * Parse day of week string to number (0-6)
 * @param {string} dayStr 
 * @returns {number}
 */
const parseDayOfWeek = (dayStr) => {
  const normalized = dayStr.toUpperCase().trim();
  return DAYS_OF_WEEK.indexOf(normalized);
};

/**
 * Get date range for a given date (start and end of day in AEST, returned as UTC)
 * 
 * @param {Date|string} date 
 * @returns {{ startOfDay: string, endOfDay: string }} ISO strings in UTC that represent AEST day boundaries
 */
const getDateRange = (date) => {
  const aest = toAEST(date);
  
  // Start of day in AEST (00:00:00 AEST)
  const startAEST = fromAEST(aest.year, aest.month, aest.day, 0, 0);
  
  // End of day in AEST (23:59:59 AEST)
  const endAEST = fromAEST(aest.year, aest.month, aest.day, 23, 59);
  endAEST.setUTCSeconds(59);
  endAEST.setUTCMilliseconds(999);
  
  return {
    startOfDay: startAEST.toISOString(),
    endOfDay: endAEST.toISOString()
  };
};

/**
 * Get date range for searching games (typically post date ± 1 day)
 * Posts might be made the day before or day after the actual game
 * 
 * AEST-AWARE: Calculates day boundaries in AEST context
 * 
 * @param {Date|string} postDate 
 * @returns {{ searchStart: string, searchEnd: string }} ISO strings in UTC
 */
const getGameSearchRange = (postDate) => {
  const aest = toAEST(postDate);
  
  // 2 days before in AEST context (covers: "last night's results")
  const startAEST = fromAEST(aest.year, aest.month, aest.day - 2, 0, 0);
  
  // 1 day after in AEST context (covers: "tonight's game" posted early)
  const endAEST = fromAEST(aest.year, aest.month, aest.day + 1, 23, 59);
  endAEST.setUTCSeconds(59);
  endAEST.setUTCMilliseconds(999);
  
  return {
    searchStart: startAEST.toISOString(),
    searchEnd: endAEST.toISOString()
  };
};

/**
 * Check if a date is within range
 * @param {Date|string} date 
 * @param {Date|string} rangeStart 
 * @param {Date|string} rangeEnd 
 * @returns {boolean}
 */
const isWithinRange = (date, rangeStart, rangeEnd) => {
  const d = new Date(date);
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  return d >= start && d <= end;
};

/**
 * Get time difference in various units
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {{ ms: number, seconds: number, minutes: number, hours: number, days: number }}
 */
const getTimeDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const ms = Math.abs(d2 - d1);
  
  return {
    ms,
    seconds: Math.floor(ms / 1000),
    minutes: Math.floor(ms / (1000 * 60)),
    hours: Math.floor(ms / (1000 * 60 * 60)),
    days: Math.floor(ms / (1000 * 60 * 60 * 24))
  };
};

/**
 * Check if two dates are the same day IN AEST (ignoring time)
 * 
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {boolean}
 */
const isSameDay = (date1, date2) => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  return aest1.year === aest2.year &&
         aest1.month === aest2.month &&
         aest1.day === aest2.day;
};

/**
 * Get the difference in calendar days between two dates IN AEST
 * 
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number} Number of days difference (can be negative)
 */
const getDaysDifference = (date1, date2) => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  // Create Date objects at midnight AEST for each
  const d1 = new Date(Date.UTC(aest1.year, aest1.month, aest1.day));
  const d2 = new Date(Date.UTC(aest2.year, aest2.month, aest2.day));
  
  const diffMs = d2 - d1;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

/**
 * Parse time string (e.g., "7:00 PM") to hours and minutes
 * @param {string} timeStr 
 * @returns {{ hours: number, minutes: number } | null}
 */
const parseTimeString = (timeStr) => {
  if (!timeStr) return null;
  
  const match = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();
  
  // Convert to 24-hour if PM
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  
  return { hours, minutes };
};

/**
 * Get approximate game date from post date and day of week mentioned
 * AEST-AWARE: Works in AEST context
 * 
 * @param {Date|string} postDate 
 * @param {string} dayOfWeek - e.g., "TUESDAY"
 * @returns {Date} Date object (in UTC, representing the AEST date)
 */
const inferGameDate = (postDate, dayOfWeek) => {
  const post = typeof postDate === 'string' ? new Date(postDate) : new Date(postDate);
  const targetDay = parseDayOfWeek(dayOfWeek);
  
  if (targetDay === -1) return post;
  
  const postAEST = toAEST(post);
  const postDay = postAEST.dayOfWeek;
  
  // Check if target day is in the past week (results) or upcoming (promo)
  // For now, assume it's within ±3 days
  for (let offset = -3; offset <= 3; offset++) {
    const candidateDate = fromAEST(postAEST.year, postAEST.month, postAEST.day + offset, 12, 0);
    const candidateAEST = toAEST(candidateDate);
    
    if (candidateAEST.dayOfWeek === targetDay) {
      // Return as start of that day in AEST
      return fromAEST(candidateAEST.year, candidateAEST.month, candidateAEST.day, 0, 0);
    }
  }
  
  return post;
};

/**
 * Format a date for display in AEST
 * 
 * @param {Date|string} date 
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
const formatAEST = (date, options = {}) => {
  const aest = toAEST(date);
  const { includeTime = false, includeDay = false } = options;
  
  let result = aest.isoDate;
  
  if (includeDay) {
    result = `${DAYS_OF_WEEK[aest.dayOfWeek]} ${result}`;
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
 * Get year-month string in AEST for GSI partitioning
 * 
 * @param {Date|string} date 
 * @returns {string} Format "YYYY-MM" in AEST
 */
const getYearMonthAEST = (date) => {
  const aest = toAEST(date);
  return `${aest.year}-${String(aest.month + 1).padStart(2, '0')}`;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  DAYS_OF_WEEK,
  // AEST-specific functions
  toAEST,
  fromAEST,
  isAEDT,
  getAustralianOffset,
  formatAEST,
  getYearMonthAEST,
  getDaysDifference,
  // Updated existing functions (now AEST-aware)
  getDayOfWeek,
  parseDayOfWeek,
  getDateRange,
  getGameSearchRange,
  isWithinRange,
  getTimeDifference,
  isSameDay,
  parseTimeString,
  inferGameDate
};