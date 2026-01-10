/**
 * date-utils.js
 * 
 * Backend date utilities with AEST (Australian Eastern Standard Time) awareness.
 * Use these functions throughout the backend to ensure consistent timezone handling.
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/utils/date-utils.js
 */

// AEST/AEDT offsets in hours
const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

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
// EXPORTS
// ===================================================================

module.exports = {
    // Constants
    AEST_OFFSET_HOURS,
    AEDT_OFFSET_HOURS,
    DAYS_OF_WEEK,
    
    // Core functions
    isAEDT,
    getAustralianOffset,
    toAEST,
    
    // Helper functions
    getDayOfWeekAEST,
    getStartTimeMinutesAEST,
    formatMinutes,
    formatDateAEST
};
