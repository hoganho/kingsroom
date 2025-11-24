/**
 * CONSOLIDATION LOGIC MODULE
 * 
 * Pure functions for tournament consolidation that can be used by:
 * 1. DynamoDB Stream Handler (actual consolidation)
 * 2. GraphQL Query Handler (preview/dry-run)
 * 
 * This module contains NO database operations - it only computes
 * what SHOULD happen. The caller is responsible for executing.
 */

// --- PURE FUNCTIONS ---

/**
 * Normalizes strings for key generation
 * @param {string|null|undefined} str 
 * @returns {string}
 */
const clean = (str) => {
    return str?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
};

/**
 * Derives the parent name by removing day/flight suffixes
 * 
 * Examples:
 * - "WSOP Main Event - Day 1A" → "WSOP Main Event"
 * - "Spring Series Event 8 Flight B" → "Spring Series Event 8"
 * - "Championship Day 2" → "Championship"
 * 
 * @param {string} childName 
 * @returns {string}
 */
const deriveParentName = (childName) => {
    return childName
        // Remove patterns like "- Day 1A", "– Flight B"
        .replace(/\s*[-–]\s*(Day|Flight)\s*(\d+|[A-Z])+/gi, '')
        // Remove patterns like "Day 1A" without dash
        .replace(/\s*\b(Day|Flight)\s*(\d+|[A-Z])+\b/gi, '')
        // Remove "- Final Day"
        .replace(/\s*[-–]\s*Final\s*Day/gi, '')
        // Remove standalone "Final Day" 
        .replace(/\s*\bFinal\s*(Day|Table)\b/gi, '')
        // Clean up any leftover whitespace
        .trim();
};

/**
 * Detects if a game is part of a multi-day tournament structure
 * 
 * @param {Object} game - Game data object
 * @param {string} [game.name] - Tournament name
 * @param {number} [game.dayNumber] - Day number
 * @param {string} [game.flightLetter] - Flight letter
 * @param {boolean} [game.finalDay] - Is final day
 * @returns {{isMultiDay: boolean, detectionSource: string|null, parsedDayNumber: number|null, parsedFlightLetter: string|null, isFinalDay: boolean}}
 */
const checkIsMultiDay = (game) => {
    const result = {
        isMultiDay: false,
        detectionSource: null,
        parsedDayNumber: null,
        parsedFlightLetter: null,
        isFinalDay: false
    };
    
    // Check explicit fields first (most reliable)
    if (game.dayNumber) {
        result.isMultiDay = true;
        result.detectionSource = 'dayNumber';
        result.parsedDayNumber = game.dayNumber;
    }
    
    if (game.flightLetter) {
        result.isMultiDay = true;
        result.detectionSource = result.detectionSource || 'flightLetter';
        result.parsedFlightLetter = game.flightLetter;
    }
    
    if (game.finalDay === true) {
        result.isMultiDay = true;
        result.detectionSource = result.detectionSource || 'finalDay';
        result.isFinalDay = true;
    }
    
    // If not detected by fields, check name patterns
    if (!result.isMultiDay && game.name) {
        const name = game.name;
        
        // Patterns to detect
        const dayPattern = /\bDay\s*(\d+)([A-Z])?\b/i;
        const flightPattern = /\bFlight\s*([A-Z])\b/i;
        const finalPattern = /\b(Final\s*(Day|Table)|FT)\b/i;
        const dayLetterPattern = /\b(\d+)([A-Z])\b/; // "1A", "2B" etc.
        
        // Check day pattern
        const dayMatch = name.match(dayPattern);
        if (dayMatch) {
            result.isMultiDay = true;
            result.detectionSource = 'namePattern';
            result.parsedDayNumber = parseInt(dayMatch[1]);
            if (dayMatch[2]) {
                result.parsedFlightLetter = dayMatch[2].toUpperCase();
            }
        }
        
        // Check flight pattern
        const flightMatch = name.match(flightPattern);
        if (flightMatch) {
            result.isMultiDay = true;
            result.detectionSource = result.detectionSource || 'namePattern';
            result.parsedFlightLetter = flightMatch[1].toUpperCase();
        }
        
        // Check final day pattern
        if (finalPattern.test(name)) {
            result.isMultiDay = true;
            result.detectionSource = result.detectionSource || 'namePattern';
            result.isFinalDay = true;
        }
        
        // Check day+letter pattern like "1A"
        const dayLetterMatch = name.match(dayLetterPattern);
        if (dayLetterMatch && !result.parsedDayNumber) {
            result.isMultiDay = true;
            result.detectionSource = result.detectionSource || 'namePattern';
            result.parsedDayNumber = parseInt(dayLetterMatch[1]);
            result.parsedFlightLetter = dayLetterMatch[2].toUpperCase();
        }
    }
    
    return result;
};

/**
 * Generates the consolidation key that links flights together
 * 
 * Strategy A: Series + Event Number (most reliable)
 * Strategy B: Venue + BuyIn + Name stem (fallback)
 * 
 * @param {Object} game - Game data object
 * @param {string} game.name - Tournament name
 * @param {string} [game.tournamentSeriesId] - Series ID
 * @param {number} [game.eventNumber] - Event number
 * @param {string} [game.venueId] - Venue ID
 * @param {number} [game.buyIn] - Buy-in amount
 * @returns {{key: string|null, strategy: string|null, reason: string}}
 */
const generateConsolidationKey = (game) => {
    // Strategy A: Explicit Series + Event (Best)
    if (game.tournamentSeriesId && game.eventNumber) {
        return {
            key: `SERIES_${game.tournamentSeriesId}_EVT_${game.eventNumber}`,
            strategy: 'SERIES_EVENT',
            reason: 'Using series ID + event number for precise grouping'
        };
    }

    // Strategy B: Venue + BuyIn + Name Stem (Fallback)
    if (game.venueId && game.buyIn) {
        const rootName = deriveParentName(game.name);
        const cleanedName = clean(rootName);
        
        return {
            key: `VENUE_${game.venueId}_BI_${game.buyIn}_NAME_${cleanedName}`,
            strategy: 'VENUE_BUYIN_NAME',
            reason: 'Using venue + buy-in + name pattern (series/event not available)'
        };
    }

    // Cannot generate key
    const missingFields = [];
    if (!game.tournamentSeriesId) missingFields.push('tournamentSeriesId');
    if (!game.eventNumber) missingFields.push('eventNumber');
    if (!game.venueId) missingFields.push('venueId');
    if (!game.buyIn) missingFields.push('buyIn');
    
    return {
        key: null,
        strategy: null,
        reason: `Cannot generate key - missing fields: ${missingFields.join(', ')}`
    };
};

/**
 * Main preview function - analyzes a game and returns what consolidation would do
 * 
 * @param {Object} game - Game data object
 * @returns {{willConsolidate: boolean, reason: string, consolidationKey: string|null, keyStrategy: string|null, derivedParentName: string, detectedPattern: Object, warnings: string[]}}
 */
const previewConsolidation = (game) => {
    const warnings = [];
    
    // Step 1: Check if this is a multi-day game
    const detectedPattern = checkIsMultiDay(game);
    const derivedParentName = deriveParentName(game.name);
    
    if (!detectedPattern.isMultiDay) {
        return {
            willConsolidate: false,
            reason: 'Not detected as a multi-day tournament. No consolidation needed.',
            consolidationKey: null,
            keyStrategy: null,
            derivedParentName,
            detectedPattern,
            warnings
        };
    }
    
    // Step 2: Check if game status allows consolidation
    if (game.gameStatus === 'NOT_PUBLISHED') {
        return {
            willConsolidate: false,
            reason: 'Game status is NOT_PUBLISHED - consolidation skipped.',
            consolidationKey: null,
            keyStrategy: null,
            derivedParentName,
            detectedPattern,
            warnings
        };
    }
    
    // Step 3: Check if already a parent
    if (game.consolidationType === 'PARENT') {
        return {
            willConsolidate: false,
            reason: 'This game is already a PARENT record.',
            consolidationKey: game.consolidationKey || null,
            keyStrategy: null,
            derivedParentName,
            detectedPattern,
            warnings
        };
    }
    
    // Step 4: Generate consolidation key
    const keyResult = generateConsolidationKey(game);
    
    if (!keyResult.key) {
        warnings.push(`Cannot consolidate: ${keyResult.reason}`);
        return {
            willConsolidate: false,
            reason: keyResult.reason,
            consolidationKey: null,
            keyStrategy: null,
            derivedParentName,
            detectedPattern,
            warnings
        };
    }
    
    // Add helpful warnings
    if (keyResult.strategy === 'VENUE_BUYIN_NAME') {
        warnings.push(
            'Using fallback key strategy. For more reliable grouping, ' +
            'set tournamentSeriesId and eventNumber.'
        );
    }
    
    if (detectedPattern.detectionSource === 'namePattern') {
        warnings.push(
            'Multi-day status detected from name pattern. ' +
            'Consider setting dayNumber/flightLetter explicitly for accuracy.'
        );
    }
    
    if (!game.dayNumber && detectedPattern.parsedDayNumber) {
        warnings.push(
            `Detected Day ${detectedPattern.parsedDayNumber} from name - ` +
            `consider setting dayNumber field.`
        );
    }
    
    if (!game.flightLetter && detectedPattern.parsedFlightLetter) {
        warnings.push(
            `Detected Flight ${detectedPattern.parsedFlightLetter} from name - ` +
            `consider setting flightLetter field.`
        );
    }
    
    return {
        willConsolidate: true,
        reason: `Will be grouped under "${derivedParentName}" using ${keyResult.strategy} strategy.`,
        consolidationKey: keyResult.key,
        keyStrategy: keyResult.strategy,
        derivedParentName,
        detectedPattern,
        warnings
    };
};

/**
 * Calculates aggregated totals from a list of child games
 * Used to project what the parent record will look like
 * 
 * @param {Object[]} children - Array of child game objects
 * @param {number} [expectedTotalEntries] - Expected total entries for comparison
 * @returns {{totalEntries: number, uniqueRunners: number, totalRebuys: number, totalAddons: number, prizepool: number, earliestStart: string|null, latestEnd: string|null, parentStatus: string, isPartialData: boolean, missingFlightCount: number, finalDayChild: Object|null}}
 */
const calculateAggregatedTotals = (children, expectedTotalEntries) => {
    // Sort chronologically
    const sortedChildren = [...children].sort((a, b) => 
        new Date(a.gameStartDateTime || 0).getTime() - 
        new Date(b.gameStartDateTime || 0).getTime()
    );

    let totalEntries = 0;
    let totalRebuys = 0;
    let totalAddons = 0;
    let maxPrizepool = 0;
    let earliestStart = Number.MAX_SAFE_INTEGER;
    let latestEnd = 0;
    let finalDayChild = null;

    for (const child of sortedChildren) {
        // Simple sums
        totalEntries += (child.totalEntries || 0);
        totalRebuys += (child.totalRebuys || 0);
        totalAddons += (child.totalAddons || 0);
        
        // Prizepool: take the largest (usually final day)
        if ((child.prizepool || 0) > maxPrizepool) {
            maxPrizepool = child.prizepool || 0;
        }

        // Date range
        if (child.gameStartDateTime) {
            const start = new Date(child.gameStartDateTime).getTime();
            if (start < earliestStart) earliestStart = start;
        }
        
        if (child.gameEndDateTime) {
            const end = new Date(child.gameEndDateTime).getTime();
            if (end > latestEnd) latestEnd = end;
        }

        // Identify final day
        if (child.finalDay === true || child.gameStatus === 'FINISHED') {
            if (child.finalDay || !finalDayChild) {
                finalDayChild = child;
            }
        }
    }

    // Determine parent status
    let parentStatus = 'RUNNING';
    if (finalDayChild && finalDayChild.gameStatus === 'FINISHED') {
        parentStatus = 'FINISHED';
    } else if (sortedChildren.every(c => ['SCHEDULED', 'INITIATING'].includes(c.gameStatus || ''))) {
        parentStatus = 'SCHEDULED';
    }

    // Check for partial data
    const hasDay1 = sortedChildren.some(c => 
        c.dayNumber === 1 || /Day\s*1/i.test(c.name)
    );
    const hasDay2 = sortedChildren.some(c => 
        c.dayNumber === 2 || /Day\s*2/i.test(c.name)
    );
    
    let isPartialData = false;
    let missingFlightCount = 0;

    // Have Day 2 but no Day 1?
    if (hasDay2 && !hasDay1) {
        isPartialData = true;
        missingFlightCount = 1;
    }

    // Check if total entries are significantly lower than expected
    const expected = expectedTotalEntries || 
        (finalDayChild?.totalEntries) || 0;
    
    if (expected > 0 && totalEntries < (expected * 0.9)) {
        isPartialData = true;
    }

    return {
        totalEntries,
        uniqueRunners: totalEntries, // Simplified - actual calculation needs player dedup
        totalRebuys,
        totalAddons,
        prizepool: maxPrizepool,
        earliestStart: earliestStart < Number.MAX_SAFE_INTEGER 
            ? new Date(earliestStart).toISOString() 
            : null,
        latestEnd: latestEnd > 0 
            ? new Date(latestEnd).toISOString() 
            : null,
        parentStatus,
        isPartialData,
        missingFlightCount,
        finalDayChild
    };
};

/**
 * Builds the data structure for a new parent record
 * 
 * @param {Object} childGame - The child game triggering parent creation
 * @param {string} consolidationKey - The consolidation key
 * @returns {Object} Parent record data
 */
const buildParentRecord = (childGame, consolidationKey) => {
    return {
        consolidationKey,
        consolidationType: 'PARENT',
        name: deriveParentName(childGame.name),
        
        // Copy immutable traits from child
        gameType: childGame.gameType,
        gameVariant: childGame.gameVariant,
        venueId: childGame.venueId,
        buyIn: childGame.buyIn,
        rake: childGame.rake,
        entityId: childGame.entityId,
        hasGuarantee: childGame.hasGuarantee,
        guaranteeAmount: childGame.guaranteeAmount,
        tournamentSeriesId: childGame.tournamentSeriesId,
        seriesName: childGame.seriesName,
        isSeries: true,
        eventNumber: childGame.eventNumber,

        // Initial state
        isPartialData: true,
        gameStatus: 'RUNNING'
    };
};

// --- EXPORTS (CommonJS) ---

module.exports = {
    clean,
    deriveParentName,
    checkIsMultiDay,
    generateConsolidationKey,
    previewConsolidation,
    calculateAggregatedTotals,
    buildParentRecord
};