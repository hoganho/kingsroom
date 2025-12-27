/**
 * utils/dateUtils.js
 * Date parsing and manipulation utilities
 */

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * Get day of week from date
 * @param {Date|string} date 
 * @returns {string} MONDAY, TUESDAY, etc.
 */
const getDayOfWeek = (date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return DAYS_OF_WEEK[d.getDay()];
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
 * Get date range for a given date (start and end of day in UTC)
 * @param {Date|string} date 
 * @returns {{ startOfDay: string, endOfDay: string }}
 */
const getDateRange = (date) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  
  // Start of day
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  
  // End of day
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  
  return {
    startOfDay: start.toISOString(),
    endOfDay: end.toISOString()
  };
};

/**
 * Get date range for searching games (typically post date ± 1 day)
 * Posts might be made the day before or day after the actual game
 * @param {Date|string} postDate 
 * @returns {{ searchStart: string, searchEnd: string }}
 */
const getGameSearchRange = (postDate) => {
  const d = typeof postDate === 'string' ? new Date(postDate) : new Date(postDate);
  
  // 2 days before (covers: "last night's results")
  const start = new Date(d);
  start.setDate(start.getDate() - 2);
  start.setUTCHours(0, 0, 0, 0);
  
  // 1 day after (covers: "tonight's game" posted early)
  const end = new Date(d);
  end.setDate(end.getDate() + 1);
  end.setUTCHours(23, 59, 59, 999);
  
  return {
    searchStart: start.toISOString(),
    searchEnd: end.toISOString()
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
 * Check if two dates are the same day (ignoring time)
 * @param {Date|string} date1 
 * @param {Date|string} date2 
 * @returns {boolean}
 */
const isSameDay = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
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
 * @param {Date|string} postDate 
 * @param {string} dayOfWeek - e.g., "TUESDAY"
 * @returns {Date}
 */
const inferGameDate = (postDate, dayOfWeek) => {
  const post = new Date(postDate);
  const targetDay = parseDayOfWeek(dayOfWeek);
  
  if (targetDay === -1) return post;
  
  const postDay = post.getDay();
  
  // Check if target day is in the past week (results) or upcoming (promo)
  // For now, assume it's within ±3 days
  for (let offset = -3; offset <= 3; offset++) {
    const candidate = new Date(post);
    candidate.setDate(candidate.getDate() + offset);
    if (candidate.getDay() === targetDay) {
      return candidate;
    }
  }
  
  return post;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  DAYS_OF_WEEK,
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
