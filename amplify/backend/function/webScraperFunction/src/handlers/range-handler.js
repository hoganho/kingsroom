/**
 * ===================================================================
 * Range Handler (v1.2.0)
 * ===================================================================
 * 
 * Handles fetchTournamentDataRange operation.
 * Fetches multiple tournaments by ID range.
 * 
 * VERSION: 1.2.0
 * 
 * CHANGELOG:
 * - v1.2.0: CRITICAL FIX - Use entity-specific URL patterns instead of hardcoded URL
 *           Now fetches entity from DynamoDB to get gameUrlDomain + gameUrlPath
 *           This fixes scraping for entities other than kingsroom.com.au
 * - v1.1.0: Removed lambda-monitoring dependency (no longer maintained)
 * 
 * NOTE: This is a convenience operation for batch fetching.
 * Each tournament is fetched individually (no Game saves).
 * 
 * ===================================================================
 */

const { handleFetch } = require('./fetch-handler');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

/**
 * Get entity from DynamoDB by ID
 * 
 * @param {string} entityId - Entity ID
 * @param {object} context - Context with ddbDocClient and getTableName
 * @returns {object} Entity record
 */
const getEntity = async (entityId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('Entity');
    
    const result = await ddbDocClient.send(new GetCommand({
        TableName: tableName,
        Key: { id: entityId }
    }));
    
    if (!result.Item) {
        throw new Error(`Entity not found: ${entityId}`);
    }
    
    return result.Item;
};

/**
 * Build tournament URL from entity config and tournament ID
 * 
 * v1.2.0: CRITICAL FIX - Use entity-specific URL patterns
 * Each entity has its own domain and path pattern stored in DynamoDB:
 * - gameUrlDomain: e.g., "https://kingspoker.au"
 * - gameUrlPath: e.g., "/tournament/?id="
 * 
 * @param {object} entity - Entity record from DynamoDB
 * @param {number} tournamentId - Tournament ID
 * @returns {string} Full tournament URL
 */
const buildTournamentUrl = (entity, tournamentId) => {
    const domain = entity.gameUrlDomain || '';
    const path = entity.gameUrlPath || '';
    
    if (!domain) {
        throw new Error(`Entity ${entity.id} has no gameUrlDomain configured`);
    }
    
    return `${domain}${path}${tournamentId}`;
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
    
    if (!entityId) {
        throw new Error('entityId is required for fetchTournamentDataRange');
    }
    
    const totalRequested = endId - startId + 1;
    console.log(`[RangeHandler] v1.2.0 Fetching tournaments ${startId} to ${endId} for entity ${entityId} (${totalRequested} total)`);
    
    // v1.2.0: Fetch entity to get URL pattern
    let entity;
    try {
        entity = await getEntity(entityId, context);
        console.log(`[RangeHandler] Entity URL pattern: ${entity.gameUrlDomain}${entity.gameUrlPath}{id}`);
    } catch (error) {
        console.error(`[RangeHandler] Failed to fetch entity ${entityId}:`, error.message);
        throw new Error(`Cannot fetch entity URL pattern: ${error.message}`);
    }
    
    const results = [];
    const errors = [];
    
    for (let tournamentId = startId; tournamentId <= endId; tournamentId++) {
        // v1.2.0: Build URL from entity config, not hardcoded
        const url = buildTournamentUrl(entity, tournamentId);
        
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
    
    const successCount = results.filter(r => r.success).length;
    console.log(`[RangeHandler] Completed: ${successCount}/${totalRequested} success, ${errors.length} errors`);
    
    return {
        results,
        summary: {
            startId,
            endId,
            totalRequested,
            successCount,
            errorCount: errors.length,
            errors
        }
    };
};

module.exports = {
    handleFetchRange,
    buildTournamentUrl,
    getEntity
};