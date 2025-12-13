/**
 * ===================================================================
 * Range Handler
 * ===================================================================
 * 
 * Handles fetchTournamentDataRange operation.
 * Fetches multiple tournaments by ID range.
 * 
 * NOTE: This is a convenience operation for batch fetching.
 * Each tournament is fetched individually (no Game saves).
 * 
 * ===================================================================
 */

const { handleFetch } = require('./fetch-handler');

/**
 * Build tournament URL from entity and ID
 */
const buildTournamentUrl = (entityId, tournamentId) => {
    // Default URL pattern - could be made configurable per entity
    return `https://kingsroom.com.au/tournament.php?id=${tournamentId}`;
};

/**
 * Handle fetchTournamentDataRange operation
 * 
 * @param {object} options - Range options
 * @param {number} options.startId - First tournament ID
 * @param {number} options.endId - Last tournament ID
 * @param {string} options.entityId - Entity ID
 * @param {boolean} options.forceRefresh - Force live fetch
 * @param {object} context - Shared context
 * @returns {object[]} Array of fetch results
 */
const handleFetchRange = async (options, context) => {
    const {
        startId,
        endId,
        entityId,
        forceRefresh = false
    } = options;
    
    const { monitoring } = context;
    
    monitoring.trackOperation('FETCH_RANGE_START', 'Range', `${startId}-${endId}`, { entityId });
    
    console.log(`[RangeHandler] Fetching tournaments ${startId} to ${endId} for entity ${entityId}`);
    
    const results = [];
    const errors = [];
    
    for (let tournamentId = startId; tournamentId <= endId; tournamentId++) {
        const url = buildTournamentUrl(entityId, tournamentId);
        
        try {
            const result = await handleFetch({
                url,
                entityId,
                forceRefresh,
                // Don't pass scraperJobId for range fetches
            }, context);
            
            results.push({
                tournamentId,
                success: true,
                data: result
            });
            
        } catch (error) {
            console.error(`[RangeHandler] Error fetching tournament ${tournamentId}:`, error.message);
            
            errors.push({
                tournamentId,
                error: error.message
            });
            
            results.push({
                tournamentId,
                success: false,
                error: error.message
            });
        }
    }
    
    monitoring.trackOperation('FETCH_RANGE_COMPLETE', 'Range', `${startId}-${endId}`, {
        entityId,
        totalRequested: endId - startId + 1,
        successCount: results.filter(r => r.success).length,
        errorCount: errors.length
    });
    
    console.log(`[RangeHandler] Completed: ${results.filter(r => r.success).length} success, ${errors.length} errors`);
    
    return {
        results,
        summary: {
            startId,
            endId,
            totalRequested: endId - startId + 1,
            successCount: results.filter(r => r.success).length,
            errorCount: errors.length,
            errors
        }
    };
};

module.exports = {
    handleFetchRange,
    buildTournamentUrl
};
