/**
 * utils/dateUtils.js
 * AEST-aware date utilities for gameToSocialMatcher Lambda
 * 
 * All dates in the system are stored as UTC ISO strings, but the business
 * operates in Australian Eastern Time (AEST/AEDT). This module provides
 * utilities to correctly handle date comparisons, search ranges, and
 * display formatting in the Australian context.
 * 
 * TIMEZONE RULES:
 * - AEST (Australian Eastern Standard Time): UTC+10
 * - AEDT (Australian Eastern Daylight Time): UTC+11
 * - DST typically runs first Sunday of October to first Sunday of April
 */

// ===================================================================
// CORE AEST FUNCTIONS
// ===================================================================

/**
 * Determine if a given UTC date falls within Australian Eastern Daylight Time
 * DST in Australia: First Sunday of October to First Sunday of April
 * 
 * @param {Date} date - UTC date to check
 * @returns {boolean} True if AEDT (UTC+11), false if AEST (UTC+10)
 */
const isAEDT = (date) => {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  
  // Get first Sunday of October (start of DST)
  const octFirst = new Date(Date.UTC(year, 9, 1, 0, 0, 0)); // October 1
  const octFirstSunday = new Date(octFirst);
  octFirstSunday.setUTCDate(1 + (7 - octFirst.getUTCDay()) % 7);
  octFirstSunday.setUTCHours(2, 0, 0, 0); // DST starts at 2am AEST (which is 16:00 UTC previous day)
  
  // Get first Sunday of April (end of DST)
  const aprFirst = new Date(Date.UTC(year, 3, 1, 0, 0, 0)); // April 1
  const aprFirstSunday = new Date(aprFirst);
  aprFirstSunday.setUTCDate(1 + (7 - aprFirst.getUTCDay()) % 7);
  aprFirstSunday.setUTCHours(3, 0, 0, 0); // DST ends at 3am AEDT (which is 16:00 UTC previous day)
  
  // For simplicity, use month-based approximation
  // October (9) through March (0-2) is typically AEDT
  if (month >= 9 || month <= 2) {
    // More precise check near boundaries would go here
    return true;
  }
  
  // April (3) through September (8) is AEST
  return false;
};

/**
 * Get the Australian Eastern timezone offset in hours
 * 
 * @param {Date|string} date - Date to check
 * @returns {number} 10 for AEST, 11 for AEDT
 */
const getAustralianOffset = (date) => {
  return isAEDT(new Date(date)) ? 11 : 10;
};

/**
 * Convert a UTC date to AEST/AEDT components
 * 
 * @param {Date|string} utcDate - UTC date (ISO string or Date object)
 * @returns {Object} { year, month, day, hours, minutes, seconds, dayOfWeek, isoDate, offset }
 */
const toAEST = (utcDate) => {
  const d = new Date(utcDate);
  if (isNaN(d.getTime())) {
    return null;
  }
  
  const offset = getAustralianOffset(d);
  const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
  
  return {
    year: aestTime.getUTCFullYear(),
    month: aestTime.getUTCMonth() + 1, // 1-indexed for human readability
    day: aestTime.getUTCDate(),
    hours: aestTime.getUTCHours(),
    minutes: aestTime.getUTCMinutes(),
    seconds: aestTime.getUTCSeconds(),
    dayOfWeek: aestTime.getUTCDay(), // 0=Sunday, 1=Monday, etc.
    // ISO date string for the AEST calendar day
    isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`,
    offset
  };
};

/**
 * Convert AEST date components to a UTC Date object
 * 
 * @param {number} year 
 * @param {number} month - 1-indexed (1=January)
 * @param {number} day 
 * @param {number} hours - 0-23
 * @param {number} minutes - 0-59
 * @returns {Date} UTC Date object
 */
const fromAEST = (year, month, day, hours = 0, minutes = 0) => {
  // Create a date as if it were UTC, then subtract the offset
  const tempDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const offset = getAustralianOffset(tempDate);
  
  // Subtract offset to get UTC
  return new Date(tempDate.getTime() - (offset * 60 * 60 * 1000));
};

/**
 * Get the day of week name for a date IN AEST
 * 
 * @param {Date|string} date 
 * @returns {string} Day name (e.g., "MONDAY")
 */
const getDayOfWeek = (date) => {
  const aest = toAEST(date);
  if (!aest) return null;
  
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[aest.dayOfWeek];
};

/**
 * Check if two dates are the same calendar day IN AEST
 * 
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {boolean}
 */
const isSameDay = (date1, date2) => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  if (!aest1 || !aest2) return false;
  
  return aest1.year === aest2.year &&
         aest1.month === aest2.month &&
         aest1.day === aest2.day;
};

/**
 * Get the difference in calendar days between two dates IN AEST
 * 
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number} Difference in calendar days (absolute value)
 */
const getDaysDifference = (date1, date2) => {
  const aest1 = toAEST(date1);
  const aest2 = toAEST(date2);
  
  if (!aest1 || !aest2) return null;
  
  // Create dates at midnight for each AEST day
  const d1 = Date.UTC(aest1.year, aest1.month - 1, aest1.day);
  const d2 = Date.UTC(aest2.year, aest2.month - 1, aest2.day);
  
  // Calculate difference in days
  return Math.abs(Math.round((d2 - d1) / (24 * 60 * 60 * 1000)));
};

/**
 * Get year-month string in AEST context
 * Critical for GSI partition key queries
 * 
 * @param {Date|string} date 
 * @returns {string} "YYYY-MM" in AEST
 */
const getYearMonthAEST = (date) => {
  const aest = toAEST(date);
  if (!aest) return null;
  
  return `${aest.year}-${String(aest.month).padStart(2, '0')}`;
};

// ===================================================================
// SEARCH RANGE UTILITIES
// ===================================================================

/**
 * Calculate search date range for finding posts around a game (AEST-aware)
 * 
 * Social posts about a game typically appear:
 * - Promotional: 1-14 days BEFORE the game
 * - Results: 0-3 days AFTER the game
 * 
 * @param {string} gameDate - Game start date (ISO string, stored as UTC)
 * @param {Object} options - Range options
 * @returns {Object} { searchStart, searchEnd } - ISO strings in UTC
 */
const getPostSearchRange = (gameDate, options = {}) => {
  const {
    daysBefore = 14,  // Promotional posts can be 2 weeks early
    daysAfter = 3     // Results usually posted within 3 days
  } = options;
  
  if (!gameDate) {
    // Fallback to last 30 days if no date
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      searchStart: start.toISOString(),
      searchEnd: end.toISOString()
    };
  }
  
  // Get the AEST date of the game
  const gameAEST = toAEST(gameDate);
  if (!gameAEST) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      searchStart: start.toISOString(),
      searchEnd: end.toISOString()
    };
  }
  
  // Calculate start of search range (midnight AEST, daysBefore days ago)
  const startAEST = fromAEST(
    gameAEST.year,
    gameAEST.month,
    gameAEST.day - daysBefore,
    0, 0  // Midnight AEST
  );
  
  // Calculate end of search range (23:59:59 AEST, daysAfter days later)
  const endAEST = fromAEST(
    gameAEST.year,
    gameAEST.month,
    gameAEST.day + daysAfter,
    23, 59  // End of day AEST
  );
  
  return {
    searchStart: startAEST.toISOString(),
    searchEnd: endAEST.toISOString()
  };
};

/**
 * Get array of YYYY-MM strings between two dates (AEST-aware)
 * Used for querying the byPostMonth GSI
 * 
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {string[]} Array of "YYYY-MM" strings
 */
const getYearMonthsInRange = (startDate, endDate) => {
  const startAEST = toAEST(startDate);
  const endAEST = toAEST(endDate);
  
  if (!startAEST || !endAEST) return [];
  
  const yearMonths = new Set();
  
  // Start from the first day of the start month
  let currentYear = startAEST.year;
  let currentMonth = startAEST.month;
  
  const endYear = endAEST.year;
  const endMonth = endAEST.month;
  
  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    yearMonths.add(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
    
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }
  
  return Array.from(yearMonths);
};

/**
 * Calculate days between two dates (AEST calendar days)
 * 
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {number} Number of calendar days between dates
 */
const daysBetween = (date1, date2) => {
  return getDaysDifference(date1, date2);
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Core AEST functions
  toAEST,
  fromAEST,
  isAEDT,
  getAustralianOffset,
  getDayOfWeek,
  isSameDay,
  getDaysDifference,
  getYearMonthAEST,
  
  // Search utilities
  getPostSearchRange,
  getYearMonthsInRange,
  daysBetween
};
