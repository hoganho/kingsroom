/**
 * date-utils.js
 * 
 * Backend date utilities with AEST (Australian Eastern Standard Time) awareness.
 * Use these functions throughout the backend to ensure consistent timezone handling.
 * 
 * VERSION 2.0.0 - Added recurring game schedule calculations
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/utils/date-utils.js
 */

// ===================================================================
// CONSTANTS
// ===================================================================

// AEST/AEDT offsets in hours
const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// Map day names to indices (0 = Sunday)
const DAY_NAME_TO_INDEX = {
    'SUNDAY': 0, 'Sunday': 0,
    'MONDAY': 1, 'Monday': 1,
    'TUESDAY': 2, 'Tuesday': 2,
    'WEDNESDAY': 3, 'Wednesday': 3,
    'THURSDAY': 4, 'Thursday': 4,
    'FRIDAY': 5, 'Friday': 5,
    'SATURDAY': 6, 'Saturday': 6,
};

// ===================================================================
// AEST/AEDT TIMEZONE FUNCTIONS
// ===================================================================

/**
 * Check if a date falls within Australian Eastern Daylight Time
 * AEDT runs from first Sunday in October to first Sunday in April
 * 
 * @param {Date} date - Date object to check
 * @returns {boolean} - True if date is during AEDT
 */
const isAEDT = (date) => {
    const month = date.getUTCMonth(); // 0-indexed
    
    // AEDT: October through March (roughly)
    // April through September - AEST
    if (month >= 3 && month <= 8) {
        return false;
    }
    // November through February - definitely AEDT
    if (month >= 10 || month <= 1) {
        return true;
    }
    
    // October or March - use approximation (first Sunday rules)
    const dayOfMonth = date.getUTCDate();
    if (month === 9) { // October - AEDT starts first Sunday
        return dayOfMonth >= 7; // Approximation
    }
    // March - AEDT ends first Sunday, so most of March is still AEDT
    return true;
};

/**
 * Get the current AEST/AEDT offset in hours for a given date
 * 
 * @param {Date} date - Date object to check
 * @returns {number} - Offset in hours (10 for AEST, 11 for AEDT)
 */
const getAustralianOffset = (date) => {
    return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
};

/**
 * Convert a UTC date to AEST/AEDT local date components
 * 
 * @param {Date|string} utcDate - UTC date (Date object or ISO string)
 * @returns {Object} - Object with AEST date components
 */
const toAEST = (utcDate) => {
    const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
    
    if (isNaN(d.getTime())) {
        return null;
    }
    
    const offset = getAustralianOffset(d);
    
    // Add offset to get AEST time
    const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
    
    return {
        year: aestTime.getUTCFullYear(),
        month: aestTime.getUTCMonth(),       // 0-indexed
        day: aestTime.getUTCDate(),
        hours: aestTime.getUTCHours(),
        minutes: aestTime.getUTCMinutes(),
        seconds: aestTime.getUTCSeconds(),
        dayOfWeek: aestTime.getUTCDay(),     // 0 = Sunday
        dayOfWeekName: DAYS_OF_WEEK[aestTime.getUTCDay()],
        isoDate: `${aestTime.getUTCFullYear()}-${String(aestTime.getUTCMonth() + 1).padStart(2, '0')}-${String(aestTime.getUTCDate()).padStart(2, '0')}`,
        // Total minutes from midnight (useful for time slot comparisons)
        minutesFromMidnight: aestTime.getUTCHours() * 60 + aestTime.getUTCMinutes()
    };
};

/**
 * Get the day of week in AEST for a given UTC date
 * 
 * @param {Date|string} utcDate - UTC date (Date object or ISO string)
 * @returns {string|null} - Day of week name (e.g., 'MONDAY') or null if invalid
 */
const getDayOfWeekAEST = (utcDate) => {
    const aest = toAEST(utcDate);
    return aest ? aest.dayOfWeekName : null;
};

/**
 * Get start time in minutes from midnight in AEST
 * 
 * @param {Date|string} utcDate - UTC date (Date object or ISO string)
 * @returns {number|null} - Minutes from midnight in AEST, or null if invalid
 */
const getStartTimeMinutesAEST = (utcDate) => {
    const aest = toAEST(utcDate);
    return aest ? aest.minutesFromMidnight : null;
};

/**
 * Format minutes from midnight to readable time string
 * 
 * @param {number} minutes - Minutes from midnight
 * @returns {string} - Formatted time string (e.g., '7:00pm')
 */
const formatMinutes = (minutes) => {
    if (minutes === null || minutes === undefined) return '?';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${h12}:${String(m).padStart(2, '0')}${period}`;
};

/**
 * Format a UTC date to AEST date string
 * 
 * @param {Date|string} utcDate - UTC date (Date object or ISO string)
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeTime - Include time in output
 * @param {boolean} options.includeDay - Include day name in output
 * @returns {string} - Formatted date string in AEST
 */
const formatDateAEST = (utcDate, options = {}) => {
    const aest = toAEST(utcDate);
    if (!aest) return '';
    
    const { includeTime = false, includeDay = false } = options;
    
    let result = aest.isoDate;
    
    if (includeDay) {
        const shortDay = aest.dayOfWeekName.charAt(0) + aest.dayOfWeekName.slice(1, 3).toLowerCase();
        result = `${shortDay} ${result}`;
    }
    
    if (includeTime) {
        result += ` ${formatMinutes(aest.minutesFromMidnight)} AEST`;
    }
    
    return result;
};

// ===================================================================
// DATE PARSING & FORMATTING (UTC-based for consistency)
// ===================================================================

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date object
 * Uses UTC to avoid timezone issues
 * 
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} - Date object in UTC
 */
const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') {
        return new Date(NaN);
    }
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length !== 3) {
        return new Date(NaN);
    }
    const [year, month, day] = parts.map(Number);
    return new Date(Date.UTC(year, month - 1, day));
};

/**
 * Format a Date object to ISO date string (YYYY-MM-DD)
 * 
 * @param {Date} date - Date object
 * @returns {string} - Date string in YYYY-MM-DD format
 */
const formatDate = (date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Get day of week (0-6, Sunday = 0) from a Date
 * 
 * @param {Date} date - Date object
 * @returns {number} - Day index (0 = Sunday)
 */
const getDayOfWeek = (date) => {
    return date.getUTCDay();
};

/**
 * Get day name from a Date
 * 
 * @param {Date} date - Date object
 * @returns {string} - Day name (e.g., 'MONDAY')
 */
const getDayName = (date) => {
    return DAYS_OF_WEEK[getDayOfWeek(date)];
};

/**
 * Convert day name to index
 * 
 * @param {string} dayName - Day name (e.g., 'Monday', 'MONDAY')
 * @returns {number} - Day index (0 = Sunday)
 */
const dayNameToIndex = (dayName) => {
    const index = DAY_NAME_TO_INDEX[dayName];
    if (index === undefined) {
        // Try uppercase
        const upperIndex = DAY_NAME_TO_INDEX[dayName.toUpperCase()];
        if (upperIndex === undefined) {
            throw new Error(`Invalid day name: ${dayName}`);
        }
        return upperIndex;
    }
    return index;
};

// ===================================================================
// DATE ARITHMETIC
// ===================================================================

/**
 * Add days to a date
 * 
 * @param {Date} date - Date object
 * @param {number} days - Number of days to add
 * @returns {Date} - New Date object
 */
const addDays = (date, days) => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

/**
 * Add months to a date
 * 
 * @param {Date} date - Date object
 * @param {number} months - Number of months to add
 * @returns {Date} - New Date object
 */
const addMonths = (date, months) => {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
};

/**
 * Check if two dates are the same day
 * 
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} - True if same day
 */
const isSameDay = (date1, date2) => {
    const d1 = typeof date1 === 'string' ? parseDate(date1.split('T')[0]) : date1;
    const d2 = typeof date2 === 'string' ? parseDate(date2.split('T')[0]) : date2;
    
    return (
        d1.getUTCFullYear() === d2.getUTCFullYear() &&
        d1.getUTCMonth() === d2.getUTCMonth() &&
        d1.getUTCDate() === d2.getUTCDate()
    );
};

/**
 * Check if date1 is before or equal to date2
 * 
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} - True if date1 <= date2
 */
const isBeforeOrEqual = (date1, date2) => {
    return date1.getTime() <= date2.getTime();
};

/**
 * Extract date (YYYY-MM-DD) from a datetime string
 * 
 * @param {string} dateTimeStr - DateTime string (ISO format)
 * @returns {string} - Date string in YYYY-MM-DD format
 */
const extractDateFromDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return null;
    return dateTimeStr.split('T')[0];
};

// ===================================================================
// WEEK KEY CALCULATION
// ===================================================================

/**
 * Get ISO week number (1-53)
 * 
 * @param {Date} date - Date object
 * @returns {number} - Week number
 */
const getISOWeek = (date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
};

/**
 * Get ISO week year (may differ from calendar year at year boundaries)
 * 
 * @param {Date} date - Date object
 * @returns {number} - Week year
 */
const getISOWeekYear = (date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return d.getUTCFullYear();
};

/**
 * Generate a week key in format "YYYY-W##"
 * 
 * @param {string|Date} dateInput - Date string (YYYY-MM-DD) or Date object
 * @returns {string} - Week key (e.g., "2024-W03")
 */
const getWeekKey = (dateInput) => {
    const date = typeof dateInput === 'string' ? parseDate(dateInput) : dateInput;
    const year = getISOWeekYear(date);
    const week = getISOWeek(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
};

/**
 * Get the start date (Monday) of a week from a week key
 * 
 * @param {string} weekKey - Week key (e.g., "2024-W03")
 * @returns {Date} - Start date of the week (Monday)
 */
const getWeekStartFromKey = (weekKey) => {
    const [yearStr, weekStr] = weekKey.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    
    // January 4th is always in week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // Convert Sunday (0) to 7
    
    // Get Monday of week 1
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    
    // Add weeks
    const targetMonday = new Date(week1Monday);
    targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    
    return targetMonday;
};

// ===================================================================
// RECURRING GAME SCHEDULE CALCULATIONS
// ===================================================================

/**
 * Calculate all expected dates for a recurring game within a date range
 * 
 * @param {Object} recurringGame - The recurring game with schedule info
 * @param {string} recurringGame.dayOfWeek - Day of week (e.g., 'Monday', 'MONDAY')
 * @param {string} recurringGame.frequency - Frequency (e.g., 'WEEKLY', 'FORTNIGHTLY')
 * @param {boolean} [recurringGame.isActive] - Whether the game is active
 * @param {boolean} [recurringGame.isPaused] - Whether the game is paused
 * @param {string} startDate - Start of date range (YYYY-MM-DD)
 * @param {string} endDate - End of date range (YYYY-MM-DD)
 * @returns {string[]} - Array of expected dates in YYYY-MM-DD format
 */
const calculateExpectedDates = (recurringGame, startDate, endDate) => {
    const dates = [];
    
    // Skip if paused or inactive
    if (recurringGame.isPaused || recurringGame.isActive === false) {
        return dates;
    }
    
    // Validate day of week
    if (!recurringGame.dayOfWeek) {
        console.warn('[date-utils] Missing dayOfWeek for recurring game');
        return dates;
    }
    
    let targetDayIndex;
    try {
        targetDayIndex = dayNameToIndex(recurringGame.dayOfWeek);
    } catch (e) {
        console.warn(`[date-utils] Invalid dayOfWeek: ${recurringGame.dayOfWeek}`);
        return dates;
    }
    
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn('[date-utils] Invalid date range');
        return dates;
    }
    
    // Find the first occurrence of the target day on or after start date
    let current = new Date(start);
    const currentDayIndex = getDayOfWeek(current);
    
    // Calculate days until target day
    let daysUntilTarget = targetDayIndex - currentDayIndex;
    if (daysUntilTarget < 0) {
        daysUntilTarget += 7;
    }
    
    current = addDays(current, daysUntilTarget);
    
    // Get frequency (normalize to uppercase)
    const frequency = (recurringGame.frequency || 'WEEKLY').toUpperCase();
    
    // Generate dates based on frequency
    while (isBeforeOrEqual(current, end)) {
        dates.push(formatDate(current));
        
        switch (frequency) {
            case 'DAILY':
                // For DAILY with a specific dayOfWeek, still only generate that day
                // If truly every day is needed, the recurring game shouldn't have a dayOfWeek
                current = addDays(current, 7);
                break;
                
            case 'WEEKLY':
                current = addDays(current, 7);
                break;
                
            case 'FORTNIGHTLY':
                current = addDays(current, 14);
                break;
                
            case 'MONTHLY':
                // Move forward one month, then find the right day of week
                current = addMonths(current, 1);
                // Find first occurrence of target day in the new month
                const monthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
                let daysToAdd = targetDayIndex - getDayOfWeek(monthStart);
                if (daysToAdd < 0) daysToAdd += 7;
                current = addDays(monthStart, daysToAdd);
                break;
                
            case 'QUARTERLY':
                current = addMonths(current, 3);
                // Find first occurrence of target day in the quarter month
                const quarterMonthStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
                let quarterDaysToAdd = targetDayIndex - getDayOfWeek(quarterMonthStart);
                if (quarterDaysToAdd < 0) quarterDaysToAdd += 7;
                current = addDays(quarterMonthStart, quarterDaysToAdd);
                break;
                
            case 'YEARLY':
                current = addMonths(current, 12);
                break;
                
            case 'UNKNOWN':
            default:
                // Assume weekly if unknown
                current = addDays(current, 7);
                break;
        }
    }
    
    return dates;
};

/**
 * Calculate consecutive misses by looking at recent instances
 * 
 * @param {Array<{expectedDate: string, status: string}>} instances - Instance records
 * @returns {number} - Number of consecutive misses
 */
const calculateConsecutiveMisses = (instances) => {
    if (!instances || instances.length === 0) return 0;
    
    // Sort instances by date descending (most recent first)
    const sorted = [...instances].sort((a, b) => 
        b.expectedDate.localeCompare(a.expectedDate)
    );
    
    let consecutiveMisses = 0;
    
    for (const instance of sorted) {
        if (instance.status === 'CONFIRMED') {
            break; // Found a confirmed instance, stop counting
        }
        if (['CANCELLED', 'SKIPPED', 'NO_SHOW', 'UNKNOWN'].includes(instance.status)) {
            consecutiveMisses++;
        }
    }
    
    return consecutiveMisses;
};

/**
 * Generate a date range for the past N weeks plus one week ahead
 * 
 * @param {number} weeks - Number of weeks to look back
 * @returns {{startDate: string, endDate: string}} - Date range object
 */
const getDateRangeForWeeks = (weeks) => {
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    
    const startDate = addDays(todayUtc, -7 * weeks);
    const endDate = addDays(todayUtc, 7); // One week ahead
    
    return {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
    };
};

/**
 * Validate a date string is in YYYY-MM-DD format
 * 
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} - True if valid
 */
const isValidDateString = (dateStr) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }
    
    const date = parseDate(dateStr);
    return !isNaN(date.getTime());
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Constants
    AEST_OFFSET_HOURS,
    AEDT_OFFSET_HOURS,
    DAYS_OF_WEEK,
    DAY_NAME_TO_INDEX,
    
    // AEST/AEDT functions
    isAEDT,
    getAustralianOffset,
    toAEST,
    getDayOfWeekAEST,
    getStartTimeMinutesAEST,
    formatMinutes,
    formatDateAEST,
    
    // Date parsing & formatting
    parseDate,
    formatDate,
    getDayOfWeek,
    getDayName,
    dayNameToIndex,
    extractDateFromDateTime,
    isValidDateString,
    
    // Date arithmetic
    addDays,
    addMonths,
    isSameDay,
    isBeforeOrEqual,
    
    // Week key functions
    getISOWeek,
    getISOWeekYear,
    getWeekKey,
    getWeekStartFromKey,
    
    // Recurring game schedule functions
    calculateExpectedDates,
    calculateConsecutiveMisses,
    getDateRangeForWeeks,
};