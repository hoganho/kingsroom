/**
 * duration-completion.js
 * Duration normalization and end time calculation for gameDataEnricher
 * 
 * This module handles:
 * 1. Parsing duration strings ("HH:MM:SS") to seconds (Int)
 * 2. Calculating gameEndDateTime from gameStartDateTime + totalDuration
 * 3. Calculating totalDuration from gameStartDateTime + gameEndDateTime (reverse)
 * 
 * SCHEMA NOTE:
 * Consider changing `totalDuration` from String to Int in your schema:
 *   totalDuration: Int  # Duration in seconds
 * 
 * This allows for easier calculations and comparisons.
 */

// ===================================================================
// DURATION PARSING UTILITIES
// ===================================================================

/**
 * Parse duration string to total seconds
 * Supports formats: "HH:MM:SS", "H:MM:SS", "MM:SS", "M:SS"
 * 
 * @param {string} durationStr - Duration string (e.g., "05:36:28")
 * @returns {number|null} Total seconds, or null if invalid
 */
const parseDurationToSeconds = (durationStr) => {
    if (!durationStr || typeof durationStr !== 'string') return null;
    
    // Already a number? Return as-is
    if (typeof durationStr === 'number') {
        return Math.floor(durationStr);
    }
    
    const trimmed = durationStr.trim();
    
    // Match HH:MM:SS or H:MM:SS
    const hhmmssMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hhmmssMatch) {
        const hours = parseInt(hhmmssMatch[1], 10);
        const minutes = parseInt(hhmmssMatch[2], 10);
        const seconds = parseInt(hhmmssMatch[3], 10);
        
        if (minutes >= 60 || seconds >= 60) return null;
        
        return hours * 3600 + minutes * 60 + seconds;
    }
    
    // Match MM:SS or M:SS (no hours)
    const mmssMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (mmssMatch) {
        const minutes = parseInt(mmssMatch[1], 10);
        const seconds = parseInt(mmssMatch[2], 10);
        
        if (seconds >= 60) return null;
        
        return minutes * 60 + seconds;
    }
    
    // Try parsing as plain number (already seconds)
    const numValue = parseInt(trimmed, 10);
    if (!isNaN(numValue) && numValue >= 0) {
        return numValue;
    }
    
    return null;
};

/**
 * Format seconds to HH:MM:SS string
 * 
 * @param {number} totalSeconds - Total seconds
 * @returns {string|null} Formatted duration string
 */
const formatSecondsToHHMMSS = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
        return null;
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toString().padStart(2, '0')
    ].join(':');
};

/**
 * Convert seconds to minutes (rounded)
 * 
 * @param {number} seconds - Total seconds
 * @returns {number} Minutes (rounded)
 */
const secondsToMinutes = (seconds) => {
    if (seconds === null || seconds === undefined) return null;
    return Math.round(seconds / 60);
};

// ===================================================================
// END TIME CALCULATION
// ===================================================================

/**
 * Calculate gameEndDateTime from gameStartDateTime + totalDuration
 * 
 * @param {string} gameStartDateTime - ISO date string
 * @param {number|string} totalDuration - Duration in seconds (or string to parse)
 * @returns {string|null} ISO date string for end time
 */
const calculateEndDateTime = (gameStartDateTime, totalDuration) => {
    if (!gameStartDateTime) return null;
    
    // Parse duration if it's a string
    let durationSeconds = typeof totalDuration === 'number' 
        ? totalDuration 
        : parseDurationToSeconds(totalDuration);
    
    if (durationSeconds === null || durationSeconds <= 0) return null;
    
    try {
        const startDate = new Date(gameStartDateTime);
        if (isNaN(startDate.getTime())) return null;
        
        const endDate = new Date(startDate.getTime() + (durationSeconds * 1000));
        return endDate.toISOString();
        
    } catch (error) {
        console.error('[DURATION] Error calculating end time:', error);
        return null;
    }
};

/**
 * Calculate totalDuration from gameStartDateTime and gameEndDateTime
 * 
 * @param {string} gameStartDateTime - ISO date string
 * @param {string} gameEndDateTime - ISO date string
 * @returns {number|null} Duration in seconds
 */
const calculateDurationFromTimes = (gameStartDateTime, gameEndDateTime) => {
    if (!gameStartDateTime || !gameEndDateTime) return null;
    
    try {
        const startDate = new Date(gameStartDateTime);
        const endDate = new Date(gameEndDateTime);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
        
        const durationMs = endDate.getTime() - startDate.getTime();
        
        // Negative duration means end is before start - invalid
        if (durationMs < 0) return null;
        
        return Math.floor(durationMs / 1000);
        
    } catch (error) {
        console.error('[DURATION] Error calculating duration:', error);
        return null;
    }
};

// ===================================================================
// MAIN COMPLETION FUNCTION
// ===================================================================

/**
 * Complete duration and end time fields
 * 
 * Logic:
 * 1. If totalDuration is a string ("HH:MM:SS"), parse it to seconds
 * 2. If we have start + duration but no end time, calculate end time
 *    - Prefers gameActualStartDateTime over gameStartDateTime for accuracy
 * 3. If we have start + end time but no duration, calculate duration
 * 4. Validate that all times are consistent
 * 
 * @param {Object} game - Game data
 * @returns {Object} { updates: {...}, fieldsCompleted: [...], warnings: [...] }
 */
const completeDurationFields = (game) => {
    const updates = {};
    const fieldsCompleted = [];
    const warnings = [];
    
    let durationSeconds = null;
    
    // =========================================================
    // STEP 1: Normalize totalDuration to seconds
    // =========================================================
    if (game.totalDuration !== undefined && game.totalDuration !== null) {
        if (typeof game.totalDuration === 'string') {
            // Parse string to seconds
            durationSeconds = parseDurationToSeconds(game.totalDuration);
            
            if (durationSeconds !== null) {
                updates.totalDuration = durationSeconds;
                fieldsCompleted.push('totalDuration');
                console.log(`[DURATION] Parsed "${game.totalDuration}" → ${durationSeconds} seconds`);
            } else {
                warnings.push({
                    field: 'totalDuration',
                    message: `Invalid duration format: "${game.totalDuration}"`,
                    code: 'INVALID_DURATION_FORMAT'
                });
            }
        } else if (typeof game.totalDuration === 'number') {
            // Already a number
            durationSeconds = game.totalDuration;
        }
    }
    
    // =========================================================
    // STEP 2: Calculate missing fields
    // =========================================================
    
    // Prefer gameActualStartDateTime (when game actually started) over 
    // gameStartDateTime (scheduled start) for end time calculation
    const effectiveStartTime = game.gameActualStartDateTime || game.gameStartDateTime;
    
    const hasStartTime = !!effectiveStartTime;
    const hasEndTime = !!game.gameEndDateTime;
    const hasDuration = durationSeconds !== null && durationSeconds > 0;
    
    // Log which start time we're using
    if (game.gameActualStartDateTime && game.gameActualStartDateTime !== game.gameStartDateTime) {
        console.log(`[DURATION] Using actual start time: ${game.gameActualStartDateTime}`);
        console.log(`[DURATION]   (Scheduled was: ${game.gameStartDateTime})`);
    }
    
    // Case A: Have start + duration, missing end → Calculate end
    // IMPORTANT: Only calculate if gameEndDateTime was NOT already extracted by parser
    if (hasStartTime && hasDuration && !hasEndTime) {
        const calculatedEnd = calculateEndDateTime(effectiveStartTime, durationSeconds);
        
        if (calculatedEnd) {
            updates.gameEndDateTime = calculatedEnd;
            updates.gameEndDateTimeSource = 'CALCULATED';  // Track source
            fieldsCompleted.push('gameEndDateTime');
            console.log(`[DURATION] Calculated gameEndDateTime: ${calculatedEnd}`);
            console.log(`[DURATION]   From: ${effectiveStartTime} + ${durationSeconds}s`);
        }
    } else if (hasEndTime) {
        // gameEndDateTime was extracted directly by parser - don't overwrite
        console.log(`[DURATION] Using extracted gameEndDateTime: ${game.gameEndDateTime}`);
    }
    
    // Case B: Have start + end, missing duration → Calculate duration
    if (hasStartTime && hasEndTime && !hasDuration) {
        const calculatedDuration = calculateDurationFromTimes(
            effectiveStartTime, 
            game.gameEndDateTime
        );
        
        if (calculatedDuration !== null && calculatedDuration > 0) {
            updates.totalDuration = calculatedDuration;
            durationSeconds = calculatedDuration;
            fieldsCompleted.push('totalDuration');
            console.log(`[DURATION] Calculated totalDuration: ${calculatedDuration} seconds`);
            console.log(`[DURATION]   (${formatSecondsToHHMMSS(calculatedDuration)})`);
        }
    }
    
    // Case C: Have all three → Validate consistency
    if (hasStartTime && hasEndTime && hasDuration) {
        const expectedDuration = calculateDurationFromTimes(
            effectiveStartTime, 
            game.gameEndDateTime
        );
        
        if (expectedDuration !== null) {
            const difference = Math.abs(durationSeconds - expectedDuration);
            
            // Allow 60 second tolerance for rounding
            if (difference > 60) {
                warnings.push({
                    field: 'totalDuration',
                    message: `Duration (${durationSeconds}s) doesn't match start→end calculation (${expectedDuration}s). Difference: ${difference}s`,
                    code: 'DURATION_MISMATCH'
                });
                console.warn(`[DURATION] ⚠️ Mismatch: stored=${durationSeconds}s, calculated=${expectedDuration}s`);
            }
        }
    }
    
    // =========================================================
    // STEP 3: Add formatted duration for display (optional)
    // =========================================================
    // If your schema has a separate field for formatted duration:
    // if (durationSeconds !== null && !game.totalDurationFormatted) {
    //     updates.totalDurationFormatted = formatSecondsToHHMMSS(durationSeconds);
    //     fieldsCompleted.push('totalDurationFormatted');
    // }
    
    return { updates, fieldsCompleted, warnings };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Main completion function
    completeDurationFields,
    
    // Utility functions
    parseDurationToSeconds,
    formatSecondsToHHMMSS,
    secondsToMinutes,
    calculateEndDateTime,
    calculateDurationFromTimes
};
