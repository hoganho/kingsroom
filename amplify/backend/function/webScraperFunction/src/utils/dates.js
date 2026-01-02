/**
 * ===================================================================
 * Date Utilities
 * ===================================================================
 * 
 * Date parsing, formatting, and manipulation helpers.
 * 
 * CRITICAL: All tournament times from the scraper source are in AEST
 * (Australian Eastern Standard Time) or AEDT (Australian Eastern Daylight Time).
 * These must be properly converted to UTC for storage.
 * 
 * ===================================================================
 */

// ===================================================================
// AEST TIMEZONE UTILITIES
// ===================================================================

/**
 * Determine if a given UTC date falls within Australian Eastern Daylight Time
 * DST in Australia: First Sunday of October to First Sunday of April
 * 
 * @param {Date} date - Date to check
 * @returns {boolean} True if AEDT (UTC+11), false if AEST (UTC+10)
 */
const isAEDT = (date) => {
    const d = new Date(date);
    const month = d.getUTCMonth(); // 0-indexed
    
    // October (9) through March (0-2) is typically AEDT
    // April (3) through September (8) is AEST
    // This is a simplified check - edge cases near DST transitions
    // may be off by an hour, which is acceptable for tournament times
    if (month >= 9 || month <= 2) {
        return true;
    }
    return false;
};

/**
 * Get the Australian Eastern timezone offset in hours
 * 
 * @param {Date|string} date - Date to check (used to determine DST)
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
        month: aestTime.getUTCMonth() + 1, // 1-indexed
        day: aestTime.getUTCDate(),
        hours: aestTime.getUTCHours(),
        minutes: aestTime.getUTCMinutes(),
        seconds: aestTime.getUTCSeconds(),
        dayOfWeek: aestTime.getUTCDay(),
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
 * @param {number} seconds - 0-59
 * @returns {Date} UTC Date object
 */
const fromAEST = (year, month, day, hours = 0, minutes = 0, seconds = 0) => {
    // Create a date as if it were UTC, then subtract the offset
    const tempDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    const offset = getAustralianOffset(tempDate);
    
    // Subtract offset to get UTC
    return new Date(tempDate.getTime() - (offset * 60 * 60 * 1000));
};

/**
 * Parse a local AEST datetime string and convert to UTC ISO string
 * 
 * This is the KEY function for the scraper - it takes times that are
 * displayed in AEST on the tournament page and converts them to UTC
 * for proper storage.
 * 
 * Handles formats like:
 * - "2025-01-15 19:00" 
 * - "2025-01-15T19:00:00"
 * - "Jan 15, 2025 7:00 PM"
 * - "15/01/2025 19:00"
 * 
 * @param {string} localDateStr - Date string in AEST
 * @returns {string|null} UTC ISO string or null if parsing fails
 */
const parseAESTToUTC = (localDateStr) => {
    if (!localDateStr) return null;
    
    // First, try to parse the date string to get components
    // JavaScript's Date parser will interpret ambiguous dates in local time
    // So we need to extract the components and rebuild as AEST
    
    let year, month, day, hours = 0, minutes = 0, seconds = 0;
    
    // Try Australian format DD/MM/YYYY HH:MM first
    const auMatch = localDateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (auMatch) {
        day = parseInt(auMatch[1], 10);
        month = parseInt(auMatch[2], 10);
        year = parseInt(auMatch[3], 10);
        hours = auMatch[4] ? parseInt(auMatch[4], 10) : 0;
        minutes = auMatch[5] ? parseInt(auMatch[5], 10) : 0;
        seconds = auMatch[6] ? parseInt(auMatch[6], 10) : 0;
    }
    // Try ISO-like format YYYY-MM-DD HH:MM or YYYY-MM-DDTHH:MM
    else {
        const isoMatch = localDateStr.match(/(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (isoMatch) {
            year = parseInt(isoMatch[1], 10);
            month = parseInt(isoMatch[2], 10);
            day = parseInt(isoMatch[3], 10);
            hours = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
            minutes = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
            seconds = isoMatch[6] ? parseInt(isoMatch[6], 10) : 0;
        }
        // Try natural language format "Jan 15, 2025 7:00 PM"
        else {
            const naturalMatch = localDateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
            if (naturalMatch) {
                const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                const monthIdx = monthNames.indexOf(naturalMatch[1].toLowerCase().substring(0, 3));
                if (monthIdx !== -1) {
                    month = monthIdx + 1;
                    day = parseInt(naturalMatch[2], 10);
                    year = parseInt(naturalMatch[3], 10);
                    hours = naturalMatch[4] ? parseInt(naturalMatch[4], 10) : 0;
                    minutes = naturalMatch[5] ? parseInt(naturalMatch[5], 10) : 0;
                    seconds = naturalMatch[6] ? parseInt(naturalMatch[6], 10) : 0;
                    
                    // Handle AM/PM
                    if (naturalMatch[7]) {
                        const isPM = naturalMatch[7].toUpperCase() === 'PM';
                        if (isPM && hours < 12) hours += 12;
                        if (!isPM && hours === 12) hours = 0;
                    }
                }
            }
        }
    }
    
    // If we couldn't parse, try JavaScript's parser as fallback
    // but extract components to avoid timezone issues
    if (!year) {
        const fallbackDate = new Date(localDateStr);
        if (isNaN(fallbackDate.getTime())) {
            console.warn(`[Dates] Could not parse AEST date: ${localDateStr}`);
            return null;
        }
        // Use local time components (this assumes server is NOT in AEST)
        // This is a fallback and may not be accurate
        year = fallbackDate.getFullYear();
        month = fallbackDate.getMonth() + 1;
        day = fallbackDate.getDate();
        hours = fallbackDate.getHours();
        minutes = fallbackDate.getMinutes();
        seconds = fallbackDate.getSeconds();
        console.warn(`[Dates] Fallback parsing used for: ${localDateStr} - result may be inaccurate`);
    }
    
    // Convert from AEST to UTC
    const utcDate = fromAEST(year, month, day, hours, minutes, seconds);
    return utcDate.toISOString();
};

// ===================================================================
// ORIGINAL UTILITY FUNCTIONS (updated for AEST awareness)
// ===================================================================

/**
 * Ensure date is in ISO format
 * 
 * NOTE: If the input appears to be a local time string (not already ISO with Z),
 * it will be treated as AEST and converted to UTC.
 * 
 * @param {*} dateValue - Date value to convert
 * @param {string} fallback - Fallback value if conversion fails
 * @returns {string} ISO date string in UTC
 */
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) {
        return fallback || new Date().toISOString();
    }
    
    // Already ISO format with Z (UTC)
    if (typeof dateValue === 'string' && dateValue.includes('T') && dateValue.endsWith('Z')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) {
                return dateValue;
            }
        } catch (e) {}
    }
    
    // ISO format without Z - treat as AEST
    if (typeof dateValue === 'string' && dateValue.includes('T') && !dateValue.endsWith('Z')) {
        const utc = parseAESTToUTC(dateValue);
        if (utc) return utc;
    }
    
    // Date-only format (YYYY-MM-DD) - treat as AEST midnight
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        const utc = parseAESTToUTC(dateValue + ' 00:00:00');
        if (utc) return utc;
    }
    
    // Other string formats - try AEST parsing
    if (typeof dateValue === 'string') {
        const utc = parseAESTToUTC(dateValue);
        if (utc) return utc;
    }
    
    // Date object - already in UTC internally
    if (dateValue instanceof Date) {
        if (!isNaN(dateValue.getTime())) {
            return dateValue.toISOString();
        }
    }
    
    // Try to parse as Date (last resort)
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    } catch (error) {
        console.error(`[Dates] Failed to parse date: ${dateValue}`, error);
    }
    
    return fallback || new Date().toISOString();
};

/**
 * Parse duration string to milliseconds
 * Supports formats like "2h 30m", "2:30", "150m"
 * 
 * @param {string} durationStr - Duration string
 * @returns {number} Duration in milliseconds
 */
const parseDurationToMilliseconds = (durationStr) => {
    if (!durationStr) return 0;
    
    let totalMilliseconds = 0;
    
    // Hours
    const hourMatch = durationStr.match(/(\d+)\s*h/i);
    if (hourMatch && hourMatch[1]) {
        totalMilliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    
    // Minutes
    const minMatch = durationStr.match(/(\d+)\s*m/i);
    if (minMatch && minMatch[1]) {
        totalMilliseconds += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    
    // Seconds
    const secMatch = durationStr.match(/(\d+)\s*s/i);
    if (secMatch && secMatch[1]) {
        totalMilliseconds += parseInt(secMatch[1], 10) * 1000;
    }
    
    // Try HH:MM format if no matches
    if (totalMilliseconds === 0) {
        const colonMatch = durationStr.match(/(\d+):(\d+)/);
        if (colonMatch) {
            totalMilliseconds = parseInt(colonMatch[1], 10) * 60 * 60 * 1000 +
                               parseInt(colonMatch[2], 10) * 60 * 1000;
        }
    }
    
    return totalMilliseconds;
};

/**
 * Format milliseconds to duration string
 * 
 * @param {number} ms - Milliseconds
 * @returns {string} Duration string (e.g., "2h 30m")
 */
const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '0m';
    
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${minutes}m`;
    }
};

/**
 * Check if a date is today IN AEST
 * 
 * @param {Date|string} date - Date to check (UTC)
 * @returns {boolean} True if date is today in AEST
 */
const isToday = (date) => {
    const dateAEST = toAEST(date);
    const nowAEST = toAEST(new Date());
    
    if (!dateAEST || !nowAEST) return false;
    
    return dateAEST.year === nowAEST.year &&
           dateAEST.month === nowAEST.month &&
           dateAEST.day === nowAEST.day;
};

/**
 * Check if a date is in the past
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the past
 */
const isPast = (date) => {
    return new Date(date) < new Date();
};

/**
 * Check if a date is in the future
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is in the future
 */
const isFuture = (date) => {
    return new Date(date) > new Date();
};

/**
 * Get relative time string
 * 
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
const getRelativeTime = (date) => {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    // Format in AEST for display
    const aest = toAEST(d);
    if (aest) {
        return `${aest.day}/${aest.month}/${aest.year}`;
    }
    return d.toLocaleDateString();
};

/**
 * Parse Australian date formats and convert to UTC
 * Handles DD/MM/YYYY and DD-MM-YYYY
 * 
 * NOTE: Input is assumed to be in AEST
 * 
 * @param {string} dateStr - Date string in Australian format (AEST)
 * @returns {Date|null} UTC Date object or null
 */
const parseAustralianDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Try DD/MM/YYYY or DD-MM-YYYY with optional time
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const hours = match[4] ? parseInt(match[4], 10) : 0;
        const minutes = match[5] ? parseInt(match[5], 10) : 0;
        
        // Convert from AEST to UTC
        return fromAEST(year, month, day, hours, minutes);
    }
    
    // Fallback - try AEST parsing
    const utcStr = parseAESTToUTC(dateStr);
    if (utcStr) {
        return new Date(utcStr);
    }
    
    return null;
};

/**
 * Format a UTC date for display in AEST
 * 
 * @param {Date|string} utcDate - UTC date
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string in AEST
 */
const formatInAEST = (utcDate, options = {}) => {
    const {
        includeTime = true,
        includeDate = true,
        use24Hour = false
    } = options;
    
    const aest = toAEST(utcDate);
    if (!aest) return '';
    
    const parts = [];
    
    if (includeDate) {
        parts.push(`${aest.day}/${aest.month}/${aest.year}`);
    }
    
    if (includeTime) {
        if (use24Hour) {
            parts.push(`${String(aest.hours).padStart(2, '0')}:${String(aest.minutes).padStart(2, '0')}`);
        } else {
            const hour12 = aest.hours % 12 || 12;
            const ampm = aest.hours >= 12 ? 'PM' : 'AM';
            parts.push(`${hour12}:${String(aest.minutes).padStart(2, '0')} ${ampm}`);
        }
    }
    
    return parts.join(' ');
};

module.exports = {
    // AEST utilities
    toAEST,
    fromAEST,
    isAEDT,
    getAustralianOffset,
    parseAESTToUTC,
    formatInAEST,
    
    // Original utilities (AEST-aware)
    ensureISODate,
    parseDurationToMilliseconds,
    formatDuration,
    isToday,
    isPast,
    isFuture,
    getRelativeTime,
    parseAustralianDate
};
