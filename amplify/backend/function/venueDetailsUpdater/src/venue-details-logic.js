/**
 * VENUE DETAILS LOGIC MODULE
 * 
 * Pure functions for venue metrics calculation that can be used by:
 * 1. DynamoDB Stream Handler (actual updates)
 * 2. GraphQL Query Handler (preview/reporting)
 * 3. Batch recalculation jobs
 * 
 * This module contains NO database operations - it only computes
 * what SHOULD happen. The caller is responsible for executing.
 * 
 * Metrics Calculated:
 * - totalGamesHeld: Count of finished, non-multi-day games
 * - averageUniquePlayersPerGame: Total unique players / total games
 * - averageEntriesPerGame: Total entries / total games
 * - gameNights: Array of days when games are typically held
 * - startDate: Earliest game date for the venue
 * - status: ACTIVE/INACTIVE based on recent activity
 */

// ===================================================================
// CONSTANTS
// ===================================================================

const FINISHED_STATUSES = ['FINISHED', 'COMPLETED'];
const MULTI_DAY_CONSOLIDATION_TYPES = ['PARENT', 'CHILD', 'FLIGHT'];
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Venue is considered inactive if no games in this many days
const INACTIVE_THRESHOLD_DAYS = 90;

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Get day of week name from date
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {string|null} - Day name (e.g., "Monday") or null
 */
const getDayOfWeek = (dateValue) => {
    if (!dateValue) return null;
    
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return DAY_ORDER[date.getDay() === 0 ? 6 : date.getDay() - 1];
            // Adjust: getDay() returns 0=Sunday, we want Monday first
        }
    } catch (error) {
        console.error('[VenueDetails] Error getting day of week:', error);
    }
    return null;
};

/**
 * Get day of week correctly (Sunday = 0 in JS, we want it last)
 * @param {Date} date 
 * @returns {string}
 */
const getDayName = (date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
};

/**
 * Sort game nights in week order (Monday first)
 * @param {string[]} nights - Array of day names
 * @returns {string[]} - Sorted array
 */
const sortGameNights = (nights) => {
    return [...nights].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
};

// ===================================================================
// MULTI-DAY DETECTION
// ===================================================================

/**
 * Check if a game is a multi-day game that should be excluded from venue metrics
 * 
 * Multi-day games are excluded because:
 * 1. They would double/triple count the same tournament
 * 2. Player counts are duplicated across days
 * 3. We should only count the consolidated parent OR wait for final consolidation
 * 
 * @param {Object} game - Game object
 * @returns {{isMultiDay: boolean, reason: string|null}}
 */
const checkIsMultiDayGame = (game) => {
    // Check consolidationType first (most reliable)
    if (game.consolidationType && MULTI_DAY_CONSOLIDATION_TYPES.includes(game.consolidationType)) {
        // PARENT records ARE counted (they're the consolidated total)
        if (game.consolidationType === 'PARENT') {
            return { isMultiDay: false, reason: null }; // Parents count!
        }
        return { 
            isMultiDay: true, 
            reason: `consolidationType: ${game.consolidationType}` 
        };
    }
    
    // Check if this is a child of a multi-day event
    if (game.parentGameId) {
        return { 
            isMultiDay: true, 
            reason: 'has parentGameId' 
        };
    }
    
    // Check dayNumber > 1 (indicates subsequent day of multi-day)
    if (game.dayNumber && game.dayNumber > 1) {
        return { 
            isMultiDay: true, 
            reason: `dayNumber: ${game.dayNumber}` 
        };
    }
    
    // Check if dayNumber = 1 WITH a consolidationKey (part of multi-day set)
    // Only exclude if not marked as finalDay and has siblings
    if (game.dayNumber === 1 && game.consolidationKey && !game.finalDay) {
        return { 
            isMultiDay: true, 
            reason: 'dayNumber=1 with consolidationKey, not finalDay' 
        };
    }
    
    // Check flightLetter without being a consolidated parent
    if (game.flightLetter && game.consolidationType !== 'PARENT') {
        return { 
            isMultiDay: true, 
            reason: `flightLetter: ${game.flightLetter}` 
        };
    }
    
    return { isMultiDay: false, reason: null };
};

/**
 * Check if a game should be included in venue metrics
 * @param {Object} game - Game object
 * @returns {{shouldInclude: boolean, reason: string}}
 */
const shouldIncludeInMetrics = (game) => {
    // Must be a finished game
    if (!FINISHED_STATUSES.includes(game.gameStatus)) {
        return { 
            shouldInclude: false, 
            reason: `gameStatus: ${game.gameStatus} (not finished)` 
        };
    }
    
    // Check multi-day exclusion
    const multiDayCheck = checkIsMultiDayGame(game);
    if (multiDayCheck.isMultiDay) {
        return { 
            shouldInclude: false, 
            reason: `multi-day game: ${multiDayCheck.reason}` 
        };
    }
    
    // Must have a valid venue
    if (!game.venueId || game.venueId === '00000000-0000-0000-0000-000000000000') {
        return { 
            shouldInclude: false, 
            reason: 'no valid venueId' 
        };
    }
    
    return { shouldInclude: true, reason: 'eligible' };
};

// ===================================================================
// METRICS CALCULATION
// ===================================================================

/**
 * Calculate venue metrics from a list of games
 * 
 * @param {Object[]} games - Array of game objects for a venue
 * @returns {Object} Calculated metrics
 */
const calculateVenueMetrics = (games) => {
    if (!games || games.length === 0) {
        return {
            totalGamesHeld: 0,
            totalInitialEntries: 0,
            totalEntries: 0,
            totalUniquePlayers: 0,
            averageEntriesPerGame: 0,
            averageUniquePlayersPerGame: 0,
            gameNights: [],
            earliestGameDate: null,
            latestGameDate: null,
            gamesIncluded: 0,
            gamesExcluded: 0,
            exclusionReasons: {}
        };
    }
    
    let totalGamesHeld = 0;
    let totalUniquePlayers = 0;
    let totalInitialEntries = 0;
    let totalEntries = 0;
    const gameNightsSet = new Set();
    let earliestGameDate = null;
    let latestGameDate = null;
    let gamesExcluded = 0;
    const exclusionReasons = {};
    
    for (const game of games) {
        const inclusion = shouldIncludeInMetrics(game);
        
        if (!inclusion.shouldInclude) {
            gamesExcluded++;
            exclusionReasons[inclusion.reason] = (exclusionReasons[inclusion.reason] || 0) + 1;
            continue;
        }
        
        // Count this game
        totalGamesHeld++;
        totalUniquePlayers += game.totalUniquePlayers || 0;
        totalInitialEntries += game.totalInitialEntries || 0;
        totalEntries += game.totalEntries || 0;
        
        // Track game nights
        if (game.gameStartDateTime) {
            const gameDate = new Date(game.gameStartDateTime);
            const dayName = getDayName(gameDate);
            if (dayName) {
                gameNightsSet.add(dayName);
            }
            
            // Track date range
            if (!earliestGameDate || gameDate < earliestGameDate) {
                earliestGameDate = gameDate;
            }
            if (!latestGameDate || gameDate > latestGameDate) {
                latestGameDate = gameDate;
            }
        }
    }
    
    // Calculate average
    const averageEntriesPerGame = totalGamesHeld > 0 
        ? Math.round((totalEntries / totalGamesHeld) * 100) / 100 
        : 0;
        
    const averageInitialEntriesPerGame = totalGamesHeld > 0 
        ? Math.round((totalInitialEntries / totalGamesHeld) * 100) / 100 
        : 0;

    const averageUniquePlayersPerGame = totalGamesHeld > 0 
        ? Math.round((totalUniquePlayers / totalGamesHeld) * 100) / 100 
        : 0;

    // Sort game nights
    const gameNights = sortGameNights(Array.from(gameNightsSet));
    
    return {
        totalGamesHeld,
        totalInitialEntries,
        totalEntries,
        totalUniquePlayers,
        averageEntriesPerGame,
        averageUniquePlayersPerGame,
        gameNights,
        earliestGameDate: earliestGameDate?.toISOString() || null,
        latestGameDate: latestGameDate?.toISOString() || null,
        gamesIncluded: totalGamesHeld,
        gamesExcluded,
        exclusionReasons
    };
};

/**
 * Determine venue status based on activity
 * 
 * @param {string|null} latestGameDate - ISO date of most recent game
 * @param {string|null} currentStatus - Current venue status
 * @returns {string} - 'ACTIVE' or 'INACTIVE'
 */
const determineVenueStatus = (latestGameDate, currentStatus = null) => {
    // If no games, keep current status or default to PENDING
    if (!latestGameDate) {
        return currentStatus || 'PENDING';
    }
    
    const lastGame = new Date(latestGameDate);
    const now = new Date();
    const daysSinceLastGame = Math.floor((now - lastGame) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastGame > INACTIVE_THRESHOLD_DAYS) {
        return 'INACTIVE';
    }
    
    return 'ACTIVE';
};

/**
 * Calculate incremental update to venue metrics
 * Used when a single game is added/updated to avoid full recalculation
 * 
 * @param {Object} existingMetrics - Current VenueDetails record
 * @param {Object} newGame - The new/updated game
 * @param {Object} previousGameState - Previous state of the game (for updates, null for new)
 * @returns {Object} Updated metrics
 */
const calculateIncrementalUpdate = (existingMetrics, newGame, previousGameState = null) => {
    const newInclusion = shouldIncludeInMetrics(newGame);
    const prevInclusion = previousGameState ? shouldIncludeInMetrics(previousGameState) : { shouldInclude: false };
    
    // Start with existing values
    let totalGamesHeld = existingMetrics.totalGamesHeld || 0;
    let totalInitialEntries = (existingMetrics.averageInitialEntriesPerGame || 0) * totalGamesHeld;
    let totalEntries = (existingMetrics.averageEntriesPerGame || 0) * totalGamesHeld;
    let totalUniquePlayers = (existingMetrics.averageUniquePerGame || 0) * totalGamesHeld;
    const gameNightsSet = new Set(existingMetrics.gameNights || []);
    let earliestGameDate = existingMetrics.startDate ? new Date(existingMetrics.startDate) : null;
    
    // Handle previous state removal (if game was updated and previously counted)
    if (prevInclusion.shouldInclude) {
        totalGamesHeld--;
        totalUniquePlayers -= previousGameState.totalUniquePlayers || 0;
        totalInitialEntries -= previousGameState.totalInitialEntries || 0;
        totalEntries -= previousGameState.totalEntries || 0;
        // Note: We can't easily remove a game night without full recalc
    }
    
    // Handle new state addition
    if (newInclusion.shouldInclude) {
        totalGamesHeld++;
        totalInitialEntries += newGame.totalInitialEntries || 0;
        totalEntries += newGame.totalEntries || 0;
        totalUniquePlayers += newGame.totalUniquePlayers || 0;

        // Add game night
        if (newGame.gameStartDateTime) {
            const gameDate = new Date(newGame.gameStartDateTime);
            const dayName = getDayName(gameDate);
            if (dayName) {
                gameNightsSet.add(dayName);
            }
            
            // Update earliest date
            if (!earliestGameDate || gameDate < earliestGameDate) {
                earliestGameDate = gameDate;
            }
        }
    }
    
    // Calculate new average
    const averageInitialEntriesPerGame = totalGamesHeld > 0 
        ? Math.round((totalInitialEntries / totalGamesHeld) * 100) / 100 
        : 0;
        
    const averageEntriesPerGame = totalGamesHeld > 0 
        ? Math.round((totalEntries / totalGamesHeld) * 100) / 100 
        : 0;
        
    const averageUniquePlayersPerGame = totalGamesHeld > 0 
        ? Math.round((totalUniquePlayers / totalGamesHeld) * 100) / 100 
        : 0;

    return {
        totalGamesHeld,
        averageUniquePlayersPerGame,
        averageEntriesPerGame,
        gameNights: sortGameNights(Array.from(gameNightsSet)),
        startDate: earliestGameDate?.toISOString() || existingMetrics.startDate,
        wasIncremental: true,
        newGameIncluded: newInclusion.shouldInclude,
        previousGameWasIncluded: prevInclusion.shouldInclude
    };
};

// ===================================================================
// BUILD VENUE DETAILS RECORD
// ===================================================================

/**
 * Build a complete VenueDetails record from calculated metrics
 * 
 * @param {string} venueId - The venue ID
 * @param {Object} metrics - Calculated metrics from calculateVenueMetrics
 * @param {Object|null} existingRecord - Existing VenueDetails record (for updates)
 * @returns {Object} VenueDetails record ready for DynamoDB
 */
const buildVenueDetailsRecord = (venueId, metrics, existingRecord = null) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    // Determine status
    const status = determineVenueStatus(metrics.latestGameDate, existingRecord?.status);
    
    // Use earliest game date as start date, or existing, or now
    const startDate = metrics.earliestGameDate || existingRecord?.startDate || now;
    
    return {
        // Keep existing ID or signal that caller should generate one
        id: existingRecord?.id || null,
        
        // Core fields
        venueId,
        startDate,
        status,
        
        // Preserve lastCustomerSuccessVisit (not calculated, manually set)
        lastCustomerSuccessVisit: existingRecord?.lastCustomerSuccessVisit || null,
        
        // Calculated metrics
        totalGamesHeld: metrics.totalGamesHeld,
        averageUniquePlayersPerGame: metrics.averageUniquePlayersPerGame,
        averageEntriesPerGame: metrics.averageEntriesPerGame,
        gameNights: metrics.gameNights,
        
        // Timestamps
        createdAt: existingRecord?.createdAt || now,
        updatedAt: now,
        _version: (existingRecord?._version || 0) + 1,
        _lastChangedAt: timestamp,
        __typename: 'VenueDetails'
    };
};

// ===================================================================
// STREAM EVENT PROCESSING
// ===================================================================

/**
 * Analyze a DynamoDB stream event to determine if VenueDetails should be updated
 * 
 * @param {Object} streamRecord - DynamoDB stream record
 * @returns {Object} Analysis result
 */
const analyzeStreamEvent = (streamRecord) => {
    const eventName = streamRecord.eventName; // INSERT, MODIFY, REMOVE
    const newImage = streamRecord.dynamodb?.NewImage;
    const oldImage = streamRecord.dynamodb?.OldImage;
    
    // Extract game data
    const newGame = newImage ? unmarshallRecord(newImage) : null;
    const oldGame = oldImage ? unmarshallRecord(oldImage) : null;
    
    // Default result
    const result = {
        shouldUpdate: false,
        reason: null,
        venueId: null,
        newGame,
        oldGame,
        eventName,
        updateType: null // 'FULL_RECALC' or 'INCREMENTAL'
    };
    
    // Handle REMOVE events
    if (eventName === 'REMOVE') {
        if (oldGame && shouldIncludeInMetrics(oldGame).shouldInclude) {
            result.shouldUpdate = true;
            result.reason = 'Game removed that was counted in metrics';
            result.venueId = oldGame.venueId;
            result.updateType = 'FULL_RECALC'; // Removing requires recalc
        }
        return result;
    }
    
    // Must have new game data for INSERT/MODIFY
    if (!newGame) {
        result.reason = 'No new game data';
        return result;
    }
    
    result.venueId = newGame.venueId;
    
    // Check if this game transition affects metrics
    const newInclusion = shouldIncludeInMetrics(newGame);
    const oldInclusion = oldGame ? shouldIncludeInMetrics(oldGame) : { shouldInclude: false };
    
    // Case 1: Game just became FINISHED
    if (newInclusion.shouldInclude && !oldInclusion.shouldInclude) {
        result.shouldUpdate = true;
        result.reason = 'Game became eligible for metrics';
        result.updateType = 'INCREMENTAL';
        return result;
    }
    
    // Case 2: Game was already included and key fields changed
    if (newInclusion.shouldInclude && oldInclusion.shouldInclude) {
        const relevantFieldsChanged = 
            newGame.totalUniquePlayers !== oldGame?.totalUniquePlayers ||
            newGame.totalInitialEntries !== oldGame?.totalInitialEntries ||
            newGame.totalEntries !== oldGame?.totalEntries ||
            newGame.gameStartDateTime !== oldGame?.gameStartDateTime;
        
        if (relevantFieldsChanged) {
            result.shouldUpdate = true;
            result.reason = 'Relevant fields changed on counted game';
            result.updateType = 'INCREMENTAL';
            return result;
        }
    }
    
    // Case 3: Game was excluded and is now excluded (different venue?)
    if (!newInclusion.shouldInclude && oldInclusion.shouldInclude) {
        result.shouldUpdate = true;
        result.reason = 'Game no longer eligible for metrics';
        result.venueId = oldGame.venueId; // Use OLD venue ID
        result.updateType = 'FULL_RECALC';
        return result;
    }
    
    // Case 4: Venue changed
    if (newGame.venueId !== oldGame?.venueId && oldGame?.venueId) {
        // Need to update BOTH venues
        result.shouldUpdate = true;
        result.reason = 'Venue changed - need to update both';
        result.updateType = 'FULL_RECALC';
        result.affectedVenues = [newGame.venueId, oldGame.venueId].filter(Boolean);
        return result;
    }
    
    result.reason = newInclusion.reason || 'No metrics-affecting change';
    return result;
};

/**
 * Helper to unmarshall DynamoDB record
 * (Simplified - in real code, use @aws-sdk/util-dynamodb)
 */
const unmarshallRecord = (record) => {
    // This is a placeholder - the actual Lambda will use the SDK
    // The stream handler should do this conversion
    return record;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Constants
    FINISHED_STATUSES,
    MULTI_DAY_CONSOLIDATION_TYPES,
    DAY_ORDER,
    INACTIVE_THRESHOLD_DAYS,
    
    // Helper functions
    getDayOfWeek,
    getDayName,
    sortGameNights,
    
    // Multi-day detection
    checkIsMultiDayGame,
    shouldIncludeInMetrics,
    
    // Metrics calculation
    calculateVenueMetrics,
    calculateIncrementalUpdate,
    determineVenueStatus,
    
    // Record building
    buildVenueDetailsRecord,
    
    // Stream processing
    analyzeStreamEvent
};