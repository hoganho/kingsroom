/**
 * ===================================================================
 * Date Utilities
 * ===================================================================
 * 
 * Date parsing, formatting, and manipulation helpers.
 * 
 * ===================================================================
 */

/**
 * Ensure date is in ISO format
 * 
 * @param {*} dateValue - Date value to convert
 * @param {string} fallback - Fallback value if conversion fails
 * @returns {string} ISO date string
 */
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) {
        return fallback || new Date().toISOString();
    }
    
    // Already ISO format
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) {
                return dateValue;
            }
        } catch (e) {}
    }
    
    // Date-only format (YYYY-MM-DD)
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return `${dateValue}T00:00:00.000Z`;
    }
    
    // Try to parse as Date
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
 * Check if a date is today
 * 
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
const isToday = (date) => {
    const d = new Date(date);
    const today = new Date();
    
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
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
    
    return d.toLocaleDateString();
};

/**
 * Parse Australian date formats
 * Handles DD/MM/YYYY and DD-MM-YYYY
 * 
 * @param {string} dateStr - Date string
 * @returns {Date|null} Parsed date or null
 */
const parseAustralianDate = (dateStr) => {
    if (!dateStr) return null;
    
    // Try DD/MM/YYYY or DD-MM-YYYY
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
    // Fallback to standard parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
};

module.exports = {
    ensureISODate,
    parseDurationToMilliseconds,
    formatDuration,
    isToday,
    isPast,
    isFuture,
    getRelativeTime,
    parseAustralianDate
};
