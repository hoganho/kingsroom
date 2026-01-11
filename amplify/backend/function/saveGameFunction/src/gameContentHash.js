// ===================================================================
// GAME CONTENT HASH UTILITY
// ===================================================================
//
// VERSION: 1.1.0
// - Added isStatusDataStale, statusDataStaleAt, statusDataStaleReason to NON_MEANINGFUL_FIELDS
//   These are administrative flags that shouldn't trigger downstream reprocessing
//
// Calculates a hash of "meaningful" Game fields to detect real changes.
// Used by saveGameFunction to set dataChangedAt only when content changes.
// Downstream Lambdas can then skip processing if dataChangedAt unchanged.
//
// ===================================================================

const crypto = require('crypto');

// ===================================================================
// MEANINGFUL FIELDS DEFINITION
// ===================================================================

/**
 * Fields that constitute a "meaningful" change requiring downstream processing.
 * Changes to these fields will update dataChangedAt and trigger reprocessing.
 * 
 * Organized by category for clarity.
 */
const MEANINGFUL_GAME_FIELDS = {
    // Core identification - changes here are significant
    core: [
        'name',
        'gameType',
        'gameVariant',
        'gameStatus',
        'registrationStatus',
    ],
    
    // Scheduling - affects upcoming/active game queries
    scheduling: [
        'gameStartDateTime',
        'gameEndDateTime',
        'totalDuration',
    ],
    
    // Financials - affects revenue calculations
    financials: [
        'buyIn',
        'rake',
        'venueFee',
        'hasGuarantee',
        'guaranteeAmount',
        'prizepoolPaid',
        'prizepoolCalculated',
        'totalBuyInsCollected',
        'rakeRevenue',
        'gameProfit',
    ],
    
    // Entries - affects player stats, metrics
    entries: [
        'totalUniquePlayers',
        'totalInitialEntries',
        'totalEntries',
        'totalRebuys',
        'totalAddons',
        'playersRemaining',
    ],
    
    // Relationships - affects linked data
    relationships: [
        'venueId',
        'entityId',
        'tournamentSeriesId',
        'recurringGameId',
        'parentGameId',
    ],
    
    // Series metadata - affects series aggregation
    series: [
        'isSeries',
        'seriesName',
        'isMainEvent',
        'eventNumber',
        'dayNumber',
        'flightLetter',
        'finalDay',
    ],
    
    // Classification - affects filtering/reporting
    classification: [
        'tournamentType',
        'isSatellite',
        'isRegular',
        'sessionMode',
        'variant',
        'bettingStructure',
        'speedType',
        'entryStructure',
        'bountyType',
    ],
};

/**
 * Fields that are NOT meaningful for downstream processing.
 * Changes to these should NOT trigger reprocessing.
 */
const NON_MEANINGFUL_FIELDS = [
    // Timestamps managed by system
    'createdAt',
    'updatedAt',
    '_lastChangedAt',
    '_version',
    
    // Our own change tracking
    'dataChangedAt',
    'contentHash',
    
    // Edit tracking (metadata about edits, not the data itself)
    'wasEdited',
    'lastEditedAt',
    'lastEditedBy',
    'editHistory',
    
    // === STATUS DATA QUALITY FLAGS (v1.1.0) ===
    // Administrative flags that indicate data staleness/quality issues
    // These should NOT trigger downstream reprocessing
    'isStatusDataStale',
    'statusDataStaleAt',
    'statusDataStaleReason',
    
    // Assignment status (process tracks these, not triggers)
    'venueAssignmentStatus',
    'venueAssignmentConfidence',
    'suggestedVenueName',
    'seriesAssignmentStatus',
    'seriesAssignmentConfidence',
    'suggestedSeriesName',
    'recurringGameAssignmentStatus',
    'recurringGameAssignmentConfidence',
    
    // Query optimization keys (derived from other fields)
    'gameDayOfWeek',
    'gameYearMonth',
    'buyInBucket',
    'venueScheduleKey',
    'venueGameTypeKey',
    'entityQueryKey',
    'entityGameTypeKey',
    
    // Consolidation metadata
    'consolidationType',
    'consolidationKey',
    
    // Social data (processed separately)
    'linkedSocialPostCount',
    'hasLinkedSocialPosts',
    'socialDataAggregation',
    'socialDataAggregatedAt',
    
    // Cache/raw data
    'originalScrapedData',
    'levels', // Structure data - large, rarely changes meaningfully
];

// Flatten meaningful fields into a single array
const ALL_MEANINGFUL_FIELDS = Object.values(MEANINGFUL_GAME_FIELDS).flat();

// ===================================================================
// HASH CALCULATION
// ===================================================================

/**
 * Extract meaningful fields from a game object for hashing
 * 
 * @param {Object} game - Game object (from input or existing record)
 * @returns {Object} - Object containing only meaningful fields
 */
function extractMeaningfulFields(game) {
    if (!game) return {};
    
    const meaningful = {};
    
    for (const field of ALL_MEANINGFUL_FIELDS) {
        if (game[field] !== undefined) {
            // Normalize values for consistent hashing
            let value = game[field];
            
            // Normalize dates to ISO strings
            if (value instanceof Date) {
                value = value.toISOString();
            }
            
            // Normalize numbers (avoid floating point issues)
            if (typeof value === 'number') {
                value = Number(value.toFixed(2));
            }
            
            // Normalize empty strings to null
            if (value === '') {
                value = null;
            }
            
            meaningful[field] = value;
        }
    }
    
    return meaningful;
}

/**
 * Calculate content hash for a game's meaningful fields
 * 
 * @param {Object} game - Game object
 * @returns {string} - SHA256 hash (first 16 chars for brevity)
 */
function calculateGameContentHash(game) {
    const meaningful = extractMeaningfulFields(game);
    
    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(meaningful).sort();
    const normalized = {};
    for (const key of sortedKeys) {
        normalized[key] = meaningful[key];
    }
    
    // Create hash
    const content = JSON.stringify(normalized);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Return first 16 chars (64 bits) - sufficient for change detection
    return hash.substring(0, 16);
}

/**
 * Compare two games and determine if meaningful content changed
 * 
 * @param {Object} existingGame - Current game in database
 * @param {Object} newGameData - New data to be saved
 * @returns {Object} - { changed: boolean, oldHash: string, newHash: string, changedFields: string[] }
 */
function detectMeaningfulChanges(existingGame, newGameData) {
    const oldHash = existingGame?.contentHash || calculateGameContentHash(existingGame || {});
    const newHash = calculateGameContentHash(newGameData);
    
    const changed = oldHash !== newHash;
    
    // If changed, identify which fields changed (for logging/debugging)
    let changedFields = [];
    if (changed && existingGame) {
        const oldMeaningful = extractMeaningfulFields(existingGame);
        const newMeaningful = extractMeaningfulFields(newGameData);
        
        for (const field of ALL_MEANINGFUL_FIELDS) {
            const oldVal = JSON.stringify(oldMeaningful[field]);
            const newVal = JSON.stringify(newMeaningful[field]);
            if (oldVal !== newVal) {
                changedFields.push(field);
            }
        }
    }
    
    return {
        changed,
        oldHash,
        newHash,
        changedFields
    };
}

// ===================================================================
// INTEGRATION WITH saveGameFunction
// ===================================================================

/**
 * Example integration in saveGameFunction handler:
 * 
 * // After building the game object, before saving:
 * 
 * const changeDetection = detectMeaningfulChanges(existingGame, game);
 * 
 * if (changeDetection.changed) {
 *     game.contentHash = changeDetection.newHash;
 *     game.dataChangedAt = new Date().toISOString();
 *     console.log('[SAVE-GAME] Meaningful change detected:', changeDetection.changedFields);
 * } else {
 *     // Preserve existing hash and timestamp
 *     game.contentHash = existingGame?.contentHash || changeDetection.newHash;
 *     game.dataChangedAt = existingGame?.dataChangedAt || new Date().toISOString();
 *     console.log('[SAVE-GAME] No meaningful change, preserving dataChangedAt');
 * }
 * 
 * // Then save the game...
 */

// ===================================================================
// DOWNSTREAM LAMBDA FILTER UTILITY
// ===================================================================

/**
 * Check if a DynamoDB stream event represents a meaningful change
 * Use this in downstream Lambdas to skip non-meaningful updates
 * 
 * @param {Object} streamRecord - DynamoDB stream record (NewImage, OldImage)
 * @returns {boolean} - true if should process, false if should skip
 */
function shouldProcessStreamEvent(streamRecord) {
    const { eventName, dynamodb } = streamRecord;
    
    // Always process INSERT and REMOVE
    if (eventName === 'INSERT' || eventName === 'REMOVE') {
        return true;
    }
    
    // For MODIFY, check if dataChangedAt changed
    if (eventName === 'MODIFY') {
        const oldImage = dynamodb.OldImage;
        const newImage = dynamodb.NewImage;
        
        // If no OldImage (shouldn't happen for MODIFY), process it
        if (!oldImage) return true;
        
        // Extract dataChangedAt from both (handle DynamoDB format)
        const oldDataChangedAt = oldImage.dataChangedAt?.S || oldImage.dataChangedAt;
        const newDataChangedAt = newImage.dataChangedAt?.S || newImage.dataChangedAt;
        
        // If dataChangedAt changed, it's a meaningful update
        if (oldDataChangedAt !== newDataChangedAt) {
            return true;
        }
        
        // Also check contentHash as backup
        const oldHash = oldImage.contentHash?.S || oldImage.contentHash;
        const newHash = newImage.contentHash?.S || newImage.contentHash;
        
        if (oldHash !== newHash) {
            return true;
        }
        
        // No meaningful change
        console.log('[StreamFilter] Skipping non-meaningful update for:', 
            newImage.id?.S || newImage.id);
        return false;
    }
    
    // Unknown event type - process to be safe
    return true;
}

/**
 * Wrap a Lambda handler to skip non-meaningful Game updates
 * 
 * @param {Function} handler - Original Lambda handler
 * @returns {Function} - Wrapped handler that filters events
 * 
 * Usage:
 *   exports.handler = withMeaningfulChangeFilter(async (event, context) => {
 *       // This only runs for meaningful changes
 *   });
 */
function withMeaningfulChangeFilter(handler) {
    return async (event, context) => {
        // Filter records to only meaningful changes
        const meaningfulRecords = event.Records.filter(record => {
            return shouldProcessStreamEvent(record);
        });
        
        if (meaningfulRecords.length === 0) {
            console.log('[StreamFilter] No meaningful changes in batch, skipping');
            return { statusCode: 200, message: 'No meaningful changes' };
        }
        
        console.log(`[StreamFilter] Processing ${meaningfulRecords.length}/${event.Records.length} meaningful records`);
        
        // Call original handler with filtered records
        const filteredEvent = {
            ...event,
            Records: meaningfulRecords
        };
        
        return handler(filteredEvent, context);
    };
}

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    // Field definitions
    MEANINGFUL_GAME_FIELDS,
    NON_MEANINGFUL_FIELDS,
    ALL_MEANINGFUL_FIELDS,
    
    // Hash utilities
    extractMeaningfulFields,
    calculateGameContentHash,
    detectMeaningfulChanges,
    
    // Downstream Lambda utilities
    shouldProcessStreamEvent,
    withMeaningfulChangeFilter,
};
