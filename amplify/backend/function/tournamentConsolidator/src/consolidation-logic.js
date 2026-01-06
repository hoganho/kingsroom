/**
 * CONSOLIDATION LOGIC MODULE
 * 
 * VERSION: 1.2.0 - Added totalEntries calculation from prizepool, improved finalDay detection
 * 
 * Pure functions for tournament consolidation that can be used by:
 * 1. DynamoDB Stream Handler (actual consolidation)
 * 2. GraphQL Query Handler (preview/dry-run)
 * 
 * This module contains NO database operations - it only computes
 * what SHOULD happen. The caller is responsible for executing.
 * 
 * *** FIX: Improved deriveParentName to strip additional suffixes like "Turbo" ***
 * *** FIX: buildParentRecord now copies seriesCategory, seriesTitleId, holidayType from child ***
 * *** FIX: calculateAggregatedTotals now aggregates rakeRevenue and warns about totalUniquePlayers ***
 * *** FIX: calculateAggregatedTotals now calculates totalEntries from prizepool formula ***
 * *** FIX: Improved finalDayChild detection based on dayNumber and status ***
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
 * *** FIX: Enhanced deriveParentName to prefer structured fields ***
 * 
 * Derives the parent name using structured data when available,
 * falling back to name parsing only when necessary.
 * 
 * Priority:
 * 1. Build from structured fields (seriesName + eventNumber + isMainEvent)
 * 2. Fall back to parsing the child name and stripping day/flight suffixes
 * 
 * @param {string} childName - The child tournament's name
 * @param {Object} [game] - Optional game object with structured fields
 * @returns {string}
 */
const deriveParentName = (childName, game = null) => {
    // *** STRATEGY 1: Build from structured fields (most reliable) ***
    if (game && game.seriesName && game.eventNumber) {
        let parentName = game.seriesName;
        
        // Add event number
        parentName += ` Event ${game.eventNumber}`;
        
        // Add main event designation if applicable
        if (game.isMainEvent) {
            parentName += ': MAIN EVENT';
        }
        
        return parentName;
    }
    
    // *** STRATEGY 2: Parse from name (fallback) ***
    // Extract series name and event number from the child name if possible
    const eventMatch = childName.match(/^(.+?)\s*Event\s*(\d+)\s*[:\-]?\s*(.+)?$/i);
    if (eventMatch) {
        const seriesPart = eventMatch[1].trim();
        const eventNum = eventMatch[2];
        const eventTitle = eventMatch[3];
        
        // Check if there's a main event or other event title
        if (eventTitle) {
            // Strip day/flight/variant suffixes from the event title
            const cleanEventTitle = eventTitle
                .replace(/\s*\b(Super\s*)?Turbo\b/gi, '')
                .replace(/\s*\bHyper(\s*Turbo)?\b/gi, '')
                .replace(/\s*\bDeep(\s*Stack)?\b/gi, '')
                .replace(/\s*[-–]?\s*(Day|Flight)\s*(\d+|[A-Z])+/gi, '')
                .replace(/\s*\bFlight\s*\d*[A-Z]?\b/gi, '')
                .replace(/\s*[-–]?\s*Final\s*(Day|Table)/gi, '')
                .replace(/\s+\d+[A-Z]\s*$/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            if (cleanEventTitle) {
                return `${seriesPart} Event ${eventNum}: ${cleanEventTitle}`;
            }
        }
        
        return `${seriesPart} Event ${eventNum}`;
    }
    
    // *** STRATEGY 3: Simple name cleanup (last resort) ***
    return childName
        // Remove "Turbo", "Hyper", "Super Turbo" etc. as these are flight variants
        .replace(/\s*\b(Super\s*)?Turbo\b/gi, '')
        .replace(/\s*\bHyper(\s*Turbo)?\b/gi, '')
        .replace(/\s*\bDeep(\s*Stack)?\b/gi, '')
        
        // Remove patterns like "- Day 1A", "– Flight B"
        .replace(/\s*[-–]\s*(Day|Flight)\s*(\d+|[A-Z])+/gi, '')
        // Remove patterns like "Day 1A" without dash
        .replace(/\s*\b(Day|Flight)\s*(\d+|[A-Z])+\b/gi, '')
        // Handle "Flight 1A", "Flight 1B" patterns specifically
        .replace(/\s*\bFlight\s*\d+[A-Z]?\b/gi, '')
        // Remove "- Final Day"
        .replace(/\s*[-–]\s*Final\s*Day/gi, '')
        // Remove standalone "Final Day" 
        .replace(/\s*\bFinal\s*(Day|Table)\b/gi, '')
        // Remove standalone day-letter combinations like "1A", "1B", "1D" at end
        .replace(/\s+\d+[A-Z]\s*$/gi, '')
        // Clean up any leftover whitespace
        .replace(/\s+/g, ' ')
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
        const flightPattern = /\bFlight\s*(\d*)([A-Z])\b/i;  // *** FIX: Handle "Flight 1A", "Flight A" ***
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
            // *** FIX: Handle both "Flight 1A" (extract A) and "Flight A" (extract A) ***
            if (flightMatch[1] && !result.parsedDayNumber) {
                result.parsedDayNumber = parseInt(flightMatch[1]);
            }
            result.parsedFlightLetter = flightMatch[2].toUpperCase();
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
 * Extracts a date bucket (YYYY-MM) from a datetime string
 * Used for temporal grouping to prevent year-over-year collisions
 * 
 * @param {string} dateTimeStr - ISO datetime string
 * @returns {string|null} - Date bucket like "2023-02" or null
 */
const getDateBucket = (dateTimeStr) => {
    if (!dateTimeStr) return null;
    try {
        const date = new Date(dateTimeStr);
        if (isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    } catch {
        return null;
    }
};

/**
 * Generates the consolidation key that links flights together
 * 
 * Strategy Priority (most reliable to least):
 * 1. SERIES_EVENT: Series ID + Event Number (best - explicit linkage)
 * 2. ENTITY_SERIES_EVENT: Entity + Series Name + Event Number + Date Bucket
 * 3. VENUE_EVENT_DATE: Venue + Event Number + Buy-in + Date Bucket
 * 4. VENUE_BUYIN_DATE: Venue + Buy-in + Date Bucket (no event number)
 * 
 * NOTE: We deliberately avoid using tournament NAME in keys because:
 * - Names have variations (Turbo, Flight 1A, Day 1, etc.)
 * - After stripping day/flight suffixes, subtle differences remain
 * - Event number + date proximity is more reliable
 * 
 * @param {Object} game - Game data object
 * @returns {{key: string|null, strategy: string|null, reason: string, confidence: number}}
 */
const generateConsolidationKey = (game) => {
    const dateBucket = getDateBucket(game.gameStartDateTime);
    
    // Strategy 1: Explicit Series ID + Event Number (Best - 100% confidence)
    // This is set by the system when series is properly assigned
    if (game.tournamentSeriesId && game.eventNumber) {
        return {
            key: `SERIES_${game.tournamentSeriesId}_EVT_${game.eventNumber}`,
            strategy: 'SERIES_EVENT',
            reason: 'Using series ID + event number for precise grouping',
            confidence: 100
        };
    }
    
    // Strategy 2: Entity + Series Name + Event Number + Date Bucket (95% confidence)
    // Series name is usually consistent, event number is strong, date bucket prevents year collision
    if (game.entityId && game.seriesName && game.eventNumber && dateBucket) {
        const cleanSeriesName = clean(game.seriesName);
        return {
            key: `ENT_${game.entityId}_SER_${cleanSeriesName}_EVT_${game.eventNumber}_DT_${dateBucket}`,
            strategy: 'ENTITY_SERIES_EVENT',
            reason: 'Using entity + series name + event number + date bucket',
            confidence: 95
        };
    }
    
    // Strategy 3: Venue + Event Number + Buy-in + Date Bucket (90% confidence)
    // Even without series name, event number + venue + buy-in is strong
    if (game.venueId && game.eventNumber && game.buyIn && dateBucket) {
        return {
            key: `VEN_${game.venueId}_EVT_${game.eventNumber}_BI_${game.buyIn}_DT_${dateBucket}`,
            strategy: 'VENUE_EVENT_DATE',
            reason: 'Using venue + event number + buy-in + date bucket',
            confidence: 90
        };
    }
    
    // Strategy 4: Venue + Buy-in + Date Bucket (70% confidence)
    // Fallback when no event number - relies on same venue/buy-in/month
    // This could group different tournaments with same buy-in, but better than name-based
    if (game.venueId && game.buyIn && dateBucket) {
        return {
            key: `VEN_${game.venueId}_BI_${game.buyIn}_DT_${dateBucket}`,
            strategy: 'VENUE_BUYIN_DATE',
            reason: 'Using venue + buy-in + date bucket (no event number - lower confidence)',
            confidence: 70
        };
    }

    // Cannot generate key - list what's missing
    const missingFields = [];
    if (!game.tournamentSeriesId) missingFields.push('tournamentSeriesId');
    if (!game.eventNumber) missingFields.push('eventNumber');
    if (!game.seriesName) missingFields.push('seriesName');
    if (!game.venueId) missingFields.push('venueId');
    if (!game.buyIn) missingFields.push('buyIn');
    if (!dateBucket) missingFields.push('gameStartDateTime');
    
    return {
        key: null,
        strategy: null,
        reason: `Cannot generate key - missing fields: ${missingFields.join(', ')}`,
        confidence: 0
    };
};

/**
 * Main preview function - analyzes a game and returns what consolidation would do
 * 
 * @param {Object} game - Game data object
 * @returns {{willConsolidate: boolean, reason: string, consolidationKey: string|null, keyStrategy: string|null, keyConfidence: number, derivedParentName: string, detectedPattern: Object, warnings: string[]}}
 */
const previewConsolidation = (game) => {
    const warnings = [];
    
    // Step 1: Check if this is a multi-day game
    const detectedPattern = checkIsMultiDay(game);
    // *** FIX: Pass game object to use structured fields for parent name ***
    const derivedParentName = deriveParentName(game.name, game);
    
    if (!detectedPattern.isMultiDay) {
        return {
            willConsolidate: false,
            reason: 'Not detected as a multi-day tournament. No consolidation needed.',
            consolidationKey: null,
            keyStrategy: null,
            keyConfidence: 0,
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
            keyConfidence: 0,
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
            keyConfidence: 0,
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
            keyConfidence: 0,
            derivedParentName,
            detectedPattern,
            warnings
        };
    }
    
    // Add helpful warnings based on strategy used
    if (keyResult.confidence < 100) {
        if (!game.tournamentSeriesId) {
            warnings.push(
                'No tournamentSeriesId set. For best results, assign this tournament to a series.'
            );
        }
        if (!game.eventNumber) {
            warnings.push(
                'No eventNumber set. Setting event number improves grouping accuracy.'
            );
        }
    }
    
    if (keyResult.strategy === 'VENUE_BUYIN_DATE' && keyResult.confidence <= 70) {
        warnings.push(
            'Low confidence grouping (70%). Multiple tournaments with same buy-in may be grouped together. ' +
            'Set eventNumber or seriesName for more accurate grouping.'
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
        reason: `Will be grouped under "${derivedParentName}" using ${keyResult.strategy} strategy (${keyResult.confidence}% confidence).`,
        consolidationKey: keyResult.key,
        keyStrategy: keyResult.strategy,
        keyConfidence: keyResult.confidence,
        derivedParentName,
        detectedPattern,
        warnings
    };
};

/**
 * Calculates aggregated totals from a list of child games
 * Used to project what the parent record will look like
 * 
 * *** FIX: Now aggregates rakeRevenue properly ***
 * *** FIX: totalUniquePlayers is now clearly marked as "sum from children" - 
 *          actual unique count must come from PlayerEntry/PlayerResult deduplication ***
 * 
 * @param {Object[]} children - Array of child game objects
 * @param {number} [expectedTotalEntries] - Expected total entries for comparison
 * @returns {Object} Aggregated totals for parent record
 */
const calculateAggregatedTotals = (children, expectedTotalEntries) => {
    // Sort chronologically
    const sortedChildren = [...children].sort((a, b) => 
        new Date(a.gameStartDateTime || 0).getTime() - 
        new Date(b.gameStartDateTime || 0).getTime()
    );
    
    // *** FIX: Renamed to make it clear this is just a naive sum, not actual unique count ***
    let summedUniquePlayers = 0;  // Sum from children - NOT the actual unique count!
    let totalInitialEntries = 0;
    let totalEntries = 0;
    let totalRebuys = 0;
    let totalAddons = 0;
    let maxPrizepoolPaid = 0;
    let maxPrizepoolCalculated = 0;
    let projectedRakeRevenue = 0;
    let rakeRevenue = 0;  // *** FIX: Added rakeRevenue aggregation ***
    let rakeSubsidy = 0;
    let totalBuyInsCollected = 0;
    let prizepoolPlayerContributions = 0;
    let prizepoolAddedValue = 0;
    let gameProfit = 0;
    let fullRakeRealized = true; // Starts true, becomes false if any child has false
    let earliestStart = Number.MAX_SAFE_INTEGER;
    let latestEnd = 0;
    let finalDayChild = null;
    let playersRemaining = null;
    let totalChipsInPlay = null;
    let averagePlayerStack = null;
    let startingStack = 0;
    let guaranteeOverlayCost = 0;
    let prizepoolSurplus = 0;
    
    // *** FIX: Track series metadata from children ***
    let seriesCategory = null;
    let seriesTitleId = null;
    let holidayType = null;

    for (const child of sortedChildren) {
        // Simple sums
        summedUniquePlayers += (child.totalUniquePlayers || 0);
        totalInitialEntries += (child.totalInitialEntries || 0);
        totalEntries += (child.totalEntries || 0);
        totalRebuys += (child.totalRebuys || 0);
        totalAddons += (child.totalAddons || 0);
        
        // Financial aggregations (new naming)
        projectedRakeRevenue += (child.projectedRakeRevenue || 0);
        rakeRevenue += (child.rakeRevenue || 0);  // *** FIX: Aggregate rakeRevenue ***
        rakeSubsidy += (child.rakeSubsidy || 0);
        totalBuyInsCollected += (child.totalBuyInsCollected || 0);
        prizepoolPlayerContributions += (child.prizepoolPlayerContributions || 0);
        prizepoolAddedValue += (child.prizepoolAddedValue || 0);
        gameProfit += (child.gameProfit || 0);
        
        // fullRakeRealized is true only if ALL children have it true
        if (child.fullRakeRealized === false) {
            fullRakeRealized = false;
        }
        
        // Prizepool: take the largest (usually final day)
        if ((child.prizepoolPaid || 0) > maxPrizepoolPaid) {
            maxPrizepoolPaid = child.prizepoolPaid || 0;
        }

        if ((child.prizepoolCalculated || 0) > maxPrizepoolCalculated) {
            maxPrizepoolCalculated = child.prizepoolCalculated || 0;
        }

        // Starting stack: take from first child (they should be consistent)
        if (!startingStack && child.startingStack) {
            startingStack = child.startingStack;
        }
        
        // *** FIX: Copy series metadata from first child that has it ***
        if (!seriesCategory && child.seriesCategory) {
            seriesCategory = child.seriesCategory;
        }
        if (!seriesTitleId && child.tournamentSeriesTitleId) {
            seriesTitleId = child.tournamentSeriesTitleId;
        }
        if (!holidayType && child.holidayType) {
            holidayType = child.holidayType;
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

        // Identify final day - *** IMPROVED DETECTION ***
        // Priority 1: Explicit finalDay flag
        // Priority 2: Highest dayNumber among FINISHED children
        // Priority 3: Any FINISHED child with results
        if (child.finalDay === true) {
            // Explicit finalDay flag takes priority
            finalDayChild = child;
            console.log(`[CONSOLIDATE] Found explicit finalDay child: ${child.id} (day ${child.dayNumber || 'unknown'})`);
        } else if (child.gameStatus === 'FINISHED') {
            // FINISHED child - potential final day
            if (!finalDayChild) {
                finalDayChild = child;
            } else if (!finalDayChild.finalDay) {
                // Compare day numbers - higher day number is more likely to be final
                const childDayNum = child.dayNumber || 0;
                const currentDayNum = finalDayChild.dayNumber || 0;
                if (childDayNum > currentDayNum) {
                    finalDayChild = child;
                    console.log(`[CONSOLIDATE] Updated finalDayChild to higher day number: ${child.id} (day ${childDayNum})`);
                }
            }
        }
    }
    
    // Get live stats from final day child if available
    if (finalDayChild) {
        playersRemaining = finalDayChild.playersRemaining ?? null;
        totalChipsInPlay = finalDayChild.totalChipsInPlay ?? null;
        averagePlayerStack = finalDayChild.averagePlayerStack ?? null;
        guaranteeOverlayCost = finalDayChild.guaranteeOverlayCost ?? 0;
        prizepoolSurplus = finalDayChild.prizepoolSurplus ?? 0;
        
        // *** FIX: Calculate totalEntries from finalDay using prizepool formula ***
        // Formula: totalEntries = prizepoolPaid / (buyIn - rake)
        // This is more accurate than summing from children for multi-day tournaments
        const buyIn = finalDayChild.buyIn || 0;
        const rake = finalDayChild.rake || 0;
        const netBuyIn = buyIn - rake;
        
        if (netBuyIn > 0 && maxPrizepoolPaid > 0) {
            const calculatedEntries = Math.round(maxPrizepoolPaid / netBuyIn);
            console.log(`[CONSOLIDATE] Calculating totalEntries from prizepool: ${maxPrizepoolPaid} / ${netBuyIn} = ${calculatedEntries}`);
            
            // Use calculated value if it's reasonable (greater than summed)
            // or if summed is 0 (common case where children don't have entry counts)
            if (calculatedEntries > totalEntries || totalEntries === 0) {
                totalEntries = calculatedEntries;
            }
        }
        
        // *** FIX: Use final day's totalUniquePlayers if available and valid ***
        // The final day's unique players IS the correct count for the parent
        // (only players who made it to final day / were in the final field)
        if (finalDayChild.totalUniquePlayers && finalDayChild.totalUniquePlayers > 0) {
            // For finished tournaments, final day player count is authoritative for the parent
            console.log(`[CONSOLIDATE] Using finalDay totalUniquePlayers: ${finalDayChild.totalUniquePlayers}`);
            // Note: We still return summedUniquePlayers for backward compatibility
            // The caller (tc-index.js) should prefer the PlayerEntry-based count
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
    
    // Calculate total duration if we have both start and end
    let totalDuration = null;
    if (earliestStart < Number.MAX_SAFE_INTEGER && latestEnd > 0) {
        const durationMs = latestEnd - earliestStart;
        totalDuration = Math.floor(durationMs / 1000);
    }

    return {
        totalInitialEntries,
        totalEntries,
        // *** FIX: Renamed and clearly documented - this is NOT the actual unique player count ***
        // The actual unique player count must be calculated from PlayerEntry/PlayerResult deduplication
        totalUniquePlayers: summedUniquePlayers,  // Sum from children - caller must override with actual count
        summedUniquePlayersFromChildren: summedUniquePlayers,  // Explicit name for clarity
        totalRebuys,
        totalAddons,
        prizepoolPaid: maxPrizepoolPaid,
        prizepoolCalculated: maxPrizepoolCalculated,
        // Financial metrics (new naming)
        totalBuyInsCollected,
        projectedRakeRevenue,
        rakeRevenue,  // *** FIX: Now properly aggregated ***
        rakeSubsidy,
        prizepoolPlayerContributions,
        prizepoolAddedValue,
        prizepoolSurplus,
        guaranteeOverlayCost,
        gameProfit,
        fullRakeRealized,
        startingStack,
        playersRemaining,
        totalChipsInPlay,
        averagePlayerStack,
        earliestStart: earliestStart < Number.MAX_SAFE_INTEGER 
            ? new Date(earliestStart).toISOString() 
            : null,
        latestEnd: latestEnd > 0 
            ? new Date(latestEnd).toISOString() 
            : null,
        totalDuration,
        parentStatus,
        isPartialData,
        missingFlightCount,
        finalDayChild,
        childCount: sortedChildren.length,
        // *** FIX: Include series metadata ***
        seriesCategory,
        seriesTitleId,
        holidayType
    };
};

/**
 * Builds the data structure for a new parent record
 * Ensures all non-nullable fields are populated
 * 
 * *** FIX: Now requires parentId to generate sourceUrl for GSI compatibility ***
 * *** FIX: Uses structured fields for parent name derivation ***
 * *** FIX: Now copies seriesCategory, tournamentSeriesTitleId, holidayType from child ***
 * 
 * @param {Object} childGame - The child game triggering parent creation
 * @param {string} consolidationKey - The consolidation key
 * @param {string} parentId - The parent record ID (REQUIRED for sourceUrl)
 * @returns {Object} Parent record data
 */
const buildParentRecord = (childGame, consolidationKey, parentId) => {
    // Validate parentId is provided - it's required for sourceUrl
    if (!parentId) {
        throw new Error('parentId is required for buildParentRecord - needed for sourceUrl GSI');
    }
    
    return {
        // Consolidation fields
        consolidationKey,
        consolidationType: 'PARENT',
        // *** FIX: Pass childGame to use structured fields for parent name ***
        name: deriveParentName(childGame.name, childGame),
        parentGameId: null, // Parents don't have parents
        
        // Copy immutable traits from child
        gameType: childGame.gameType || 'TOURNAMENT',
        gameVariant: childGame.gameVariant || 'NLHE',
        venueId: childGame.venueId,
        buyIn: childGame.buyIn || 0,
        rake: childGame.rake || 0,
        entityId: childGame.entityId,
        
        // Guarantee fields
        hasGuarantee: childGame.hasGuarantee || false,
        guaranteeAmount: childGame.guaranteeAmount || 0,
        guaranteeOverlayCost: 0,
        prizepoolSurplus: 0,
        
        // Series fields - *** FIX: Now properly copying from child ***
        tournamentSeriesId: childGame.tournamentSeriesId || null,
        seriesName: childGame.seriesName || null,
        isSeries: childGame.isSeries || false,
        eventNumber: childGame.eventNumber || null,
        seriesAssignmentStatus: childGame.seriesAssignmentStatus || 'NOT_SERIES',
        seriesAssignmentConfidence: childGame.seriesAssignmentConfidence || 0,
        suggestedSeriesName: null,
        // *** FIX: Copy these series-related fields from child ***
        seriesCategory: childGame.seriesCategory || null,
        tournamentSeriesTitleId: childGame.tournamentSeriesTitleId || null,
        holidayType: childGame.holidayType || null,
        
        // Multi-day specific (parents aggregate, don't have specific day/flight)
        dayNumber: null,
        flightLetter: null,
        finalDay: null,
        
        // Tournament type flags
        isMainEvent: childGame.isMainEvent || false,
        isRegular: childGame.isRegular || false,
        isSatellite: childGame.isSatellite || false,
        tournamentType: childGame.tournamentType || null,
        
        // Game state (will be updated by recalculation)
        gameStatus: 'RUNNING',
        registrationStatus: 'N_A',
        isPartialData: true,
        missingFlightCount: 0,
        
        // Totals (will be calculated/aggregated)
        totalUniquePlayers: 0,
        totalInitialEntries: 0,
        totalEntries: 0,
        totalRebuys: 0,
        totalAddons: 0,
        prizepoolPaid: 0,
        prizepoolCalculated: 0,
        // Financial metrics (new naming)
        totalBuyInsCollected: 0,
        projectedRakeRevenue: 0,
        rakeRevenue: 0,  // *** FIX: Added rakeRevenue ***
        rakeSubsidy: 0,
        prizepoolPlayerContributions: 0,
        prizepoolAddedValue: 0,
        gameProfit: 0,
        fullRakeRealized: true,
        
        // Stack/chip tracking
        startingStack: childGame.startingStack || 0,
        averagePlayerStack: null,
        playersRemaining: null,
        totalChipsInPlay: null,
        
        // Time tracking - MUST have gameStartDateTime for byRegistrationStatus GSI
        // Initialize from child, will be updated during aggregation to earliest child start
        gameStartDateTime: childGame.gameStartDateTime || new Date().toISOString(),
        gameEndDateTime: childGame.gameEndDateTime || null,
        totalDuration: null,
        gameFrequency: 'UNKNOWN',
        
        // Structure
        levels: [],
        gameTags: [],
        
        // Venue assignment
        venueAssignmentStatus: childGame.venueAssignmentStatus || 'MANUALLY_ASSIGNED',
        venueAssignmentConfidence: childGame.venueAssignmentConfidence || 1,
        suggestedVenueName: null,
        requiresVenueAssignment: false,
        venueFee: childGame.venueFee || null,
        
        // *** FIX: Source URL is REQUIRED for bySourceUrl GSI ***
        // DynamoDB GSIs cannot have NULL partition keys
        // Use a synthetic URL that identifies this as a consolidated parent record
        sourceUrl: `consolidated://parent/${parentId}`,
        
        // tournamentId: For byEntityAndTournamentId GSI, if entityId is set (non-null),
        // tournamentId (sort key) must also be non-null. Use 0 for consolidated parents.
        tournamentId: 0,
        
        // Edit tracking
        wasEdited: false
    };
};

// --- EXPORTS (CommonJS) ---

module.exports = {
    clean,
    deriveParentName,
    getDateBucket,
    checkIsMultiDay,
    generateConsolidationKey,
    previewConsolidation,
    calculateAggregatedTotals,
    buildParentRecord
};