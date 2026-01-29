/**
 * ===================================================================
 * Scheduled Handler for scraperManagement
 * ===================================================================
 * 
 * Handles EventBridge/CloudWatch scheduled events for automated scraping.
 * 
 * VERSION: 1.1.0
 * 
 * CHANGELOG:
 * - v1.1.0: CRITICAL FIX - Filter out trailing NOT_FOUND IDs from gap list
 *           Uses gameIdTracker.getTournamentIdBounds() to get highest Game ID
 *           Only re-scrape NOT_FOUND IDs that are BELOW the highest saved Game
 *           This prevents accumulating 10+ new NOT_FOUND gaps every day
 *           
 * RESPONSIBILITIES:
 * - Process scheduled scrape triggers from EventBridge
 * - Determine which gaps need re-checking (NOT_FOUND only, not NOT_PUBLISHED)
 * - Configure appropriate scrape options for each entity
 * - Invoke scraper jobs with correct parameters
 * 
 * SCHEDULED RUN BEHAVIOR:
 * 1. Get all active entities
 * 2. For each entity:
 *    a. Call gameIdTracker to get highestId (highest saved Game)
 *    b. Query ScrapeURL for NOT_FOUND gaps (empty slots to re-check)
 *    c. FILTER gaps to only include IDs < highestId (v1.1.0)
 *    d. Get ScraperState for lastScannedId (continue discovery)
 *    e. Start 'auto' mode job with filtered gaps + new ID discovery
 * 
 * GAP TYPES:
 * - NOT_FOUND/BLANK/NOT_IN_USE: Re-check these IF they're below highest saved Game
 * - NOT_PUBLISHED: Skip these (real tournament that's hidden)
 * - Trailing NOT_FOUND (>= highestId): DON'T re-check (no tournament exists yet)
 * 
 * ===================================================================
 */

const { QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Lambda client for invoking gameIdTracker
const lambdaClient = new LambdaClient({});

/**
 * Handle scheduled EventBridge event
 * 
 * @param {object} event - EventBridge scheduled event
 * @param {object} context - Handler context with dependencies
 * @returns {object} Result with processed entities
 */
async function handleScheduledEvent(event, context) {
    const {
        ddbDocClient,
        monitoring,
        getTableName,
        getActiveEntities,
        startScraperJob,
    } = context;
    
    const ruleArn = event.resources?.[0] || 'unknown';
    
    monitoring.trackOperation('SCHEDULED_EVENT', 'Handler', 'cloudwatch', { ruleArn });
    
    console.log(`[ScheduledHandler] v1.1.0 Processing scheduled event from rule: ${ruleArn}`);
    
    try {
        // Get all active entities
        const activeEntities = await getActiveEntities();
        console.log(`[ScheduledHandler] Found ${activeEntities.length} active entities to scrape`);
        
        if (activeEntities.length === 0) {
            console.log('[ScheduledHandler] No active entities found, skipping');
            return {
                statusCode: 200,
                body: 'No active entities to scrape',
                processedAt: new Date().toISOString(),
                entitiesProcessed: 0,
                results: []
            };
        }
        
        const results = [];
        
        for (const entity of activeEntities) {
            try {
                const entityResult = await processEntityScheduledScrape(entity, {
                    ddbDocClient,
                    monitoring,
                    getTableName,
                    startScraperJob,
                });
                results.push(entityResult);
            } catch (entityError) {
                console.error(`[ScheduledHandler] Failed to start job for ${entity.entityName || entity.id}:`, entityError.message);
                results.push({
                    entityId: entity.id,
                    entityName: entity.entityName,
                    status: 'failed',
                    error: entityError.message
                });
            }
        }
        
        // Summary logging
        const successful = results.filter(r => r.status === 'started').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const totalGaps = results.reduce((sum, r) => sum + (r.gapCount || 0), 0);
        const filteredOut = results.reduce((sum, r) => sum + (r.trailingNotFoundFiltered || 0), 0);
        
        console.log(`[ScheduledHandler] Completed: ${successful} started, ${failed} failed, ${totalGaps} gaps queued, ${filteredOut} trailing NOT_FOUND filtered out`);
        
        monitoring.trackOperation('SCHEDULED_EVENT_COMPLETE', 'Handler', 'cloudwatch', {
            entitiesProcessed: activeEntities.length,
            successful,
            failed,
            totalGaps,
            filteredOut
        });
        
        return {
            statusCode: 200,
            body: 'Scheduled scrape jobs started',
            processedAt: new Date().toISOString(),
            entitiesProcessed: activeEntities.length,
            successful,
            failed,
            totalGapsQueued: totalGaps,
            trailingNotFoundFiltered: filteredOut,
            results
        };
        
    } catch (error) {
        monitoring.trackOperation('SCHEDULED_EVENT_ERROR', 'Handler', 'cloudwatch', {
            error: error.message
        });
        console.error('[ScheduledHandler] Error:', error);
        
        return {
            statusCode: 500,
            body: `Scheduled event failed: ${error.message}`
        };
    }
}

/**
 * Process scheduled scrape for a single entity
 * 
 * @param {object} entity - Entity record from DynamoDB
 * @param {object} context - Handler context with dependencies
 * @returns {object} Result for this entity
 */
async function processEntityScheduledScrape(entity, context) {
    const { ddbDocClient, monitoring, getTableName, startScraperJob } = context;
    
    const entityId = entity.id;
    const entityName = entity.entityName || entityId;
    
    console.log(`[ScheduledHandler] Processing entity: ${entityName}`);
    
    // v1.1.0: Get the highest saved Game ID using gameIdTracker
    // This is the authoritative source for "highest successful ID"
    const highestGameId = await getHighestGameId(entityId);
    
    // Get ScraperState for lastScannedId (for discovery continuation)
    const scraperState = await getScraperState(entityId, { ddbDocClient, getTableName });
    const lastScannedId = scraperState?.lastScannedId || scraperState?.highestStoredId || 0;
    
    console.log(`[ScheduledHandler] Entity ${entityName}: highestGameId=${highestGameId}, lastScannedId=${lastScannedId}`);
    
    // Get NOT_FOUND gaps to re-check, FILTERED by highestGameId
    const { gapIds, unfilteredCount, filteredCount } = await getNotFoundGapIds(
        entityId, 
        highestGameId,
        { ddbDocClient, getTableName }
    );
    
    console.log(`[ScheduledHandler] Entity ${entityName}: ${gapIds.length} gaps to re-check (${filteredCount} trailing NOT_FOUND filtered out)`);
    
    // Start the scraper job
    const job = await startScraperJob({
        input: {
            entityId,
            
            // Use 'auto' mode: processes gaps first, then continues from lastScannedId
            mode: 'auto',
            
            triggerSource: 'SCHEDULED',
            triggeredBy: 'cloudwatch-schedule',
            
            // Pass defaultVenueId from entity (CRITICAL FIX)
            defaultVenueId: entity.defaultVenueId || null,
            
            // Pass FILTERED NOT_FOUND gap IDs to re-check
            gapIds: gapIds.length > 0 ? gapIds : null,
            
            // Start discovering new IDs from after last scanned
            startId: lastScannedId > 0 ? lastScannedId + 1 : 1,
            
            // Gap processing options:
            // - skipNotFoundGaps: false = RE-CHECK empty slots (they might have tournaments now)
            // - skipNotPublished: true = SKIP hidden tournaments (they're intentionally hidden)
            skipNotFoundGaps: false,
            skipNotPublished: true,
            
            // Use S3 cache for efficiency, but gaps will force refresh if needed
            useS3: true,
            forceRefresh: false,
            
            // Save to database
            saveToDatabase: true,
        }
    });
    
    monitoring.trackOperation('SCHEDULED_JOB_STARTED', 'ScraperJob', entityId, {
        jobId: job.id,
        gapCount: gapIds.length,
        trailingFiltered: filteredCount,
        startId: lastScannedId + 1,
        highestGameId
    });
    
    return {
        entityId,
        entityName,
        jobId: job.id,
        status: 'started',
        gapCount: gapIds.length,
        trailingNotFoundFiltered: filteredCount,
        startId: lastScannedId + 1,
        highestGameId,
        hasDefaultVenue: !!entity.defaultVenueId
    };
}

/**
 * Get the highest saved Game ID for an entity using gameIdTracker
 * 
 * v1.1.0: Uses gameIdTracker Lambda to get authoritative highest Game ID
 * This is the highest tournament ID that has an actual saved Game record.
 * 
 * @param {string} entityId - Entity ID
 * @returns {number} Highest game ID, or 0 if no games exist
 */
async function getHighestGameId(entityId) {
    // Use Amplify-provided env var (set via function-parameters.json dependency)
    // Falls back to conventional naming if not set (e.g., during local testing)
    const functionName = process.env.FUNCTION_GAMEIDTRACKER_NAME 
        || `gameIdTracker-${process.env.ENV}`;
    
    console.log(`[ScheduledHandler] Invoking gameIdTracker.getTournamentIdBounds for entity: ${entityId}`);
    
    try {
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({
                fieldName: 'getTournamentIdBounds',
                arguments: {
                    entityId
                }
            })
        }));
        
        // Parse the response payload
        const payload = JSON.parse(Buffer.from(response.Payload).toString());
        
        if (response.FunctionError) {
            console.error(`[ScheduledHandler] gameIdTracker error:`, payload);
            return 0;
        }
        
        const highestId = payload.highestId || 0;
        console.log(`[ScheduledHandler] gameIdTracker returned highestId: ${highestId} for entity ${entityId}`);
        
        return highestId;
        
    } catch (error) {
        console.error(`[ScheduledHandler] Failed to invoke gameIdTracker: ${error.message}`);
        // Return 0 - this will result in no filtering, which is safer than breaking
        return 0;
    }
}

/**
 * Get NOT_FOUND tournament IDs for an entity, FILTERED to exclude trailing IDs
 * 
 * v1.1.0: CRITICAL FIX - Only return gaps that are BELOW highestGameId
 * 
 * Trailing NOT_FOUND IDs (those >= highestGameId) should NOT be re-scraped
 * because they represent IDs beyond the last known saved game - they've never
 * had a tournament and re-scraping them daily is wasteful.
 * 
 * TRUE gaps are NOT_FOUND IDs that are BETWEEN saved games (below highestGameId).
 * These may have had tournaments added since the last scrape.
 * 
 * @param {string} entityId - Entity ID
 * @param {number} highestGameId - Highest saved Game ID (filter threshold)
 * @param {object} context - Context with ddbDocClient and getTableName
 * @returns {object} { gapIds: number[], unfilteredCount: number, filteredCount: number }
 */
async function getNotFoundGapIds(entityId, highestGameId, context) {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScrapeURL');
    
    if (!tableName) {
        console.warn('[ScheduledHandler] ScrapeURL table not configured');
        return { gapIds: [], unfilteredCount: 0, filteredCount: 0 };
    }
    
    console.log(`[ScheduledHandler] Fetching NOT_FOUND gaps for entity: ${entityId}, highestGameId: ${highestGameId}`);
    
    const allIds = [];
    let lastEvaluatedKey = undefined;
    let iterations = 0;
    const maxIterations = 50; // Safety limit
    
    try {
        do {
            const result = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byEntityScrapeURL',
                KeyConditionExpression: 'entityId = :entityId',
                // Check for NOT_FOUND variants in both status fields
                // gameStatus: Current game status (might be NOT_FOUND for empty slots)
                // lastScrapeStatus: Status from last scrape attempt
                FilterExpression: 
                    'gameStatus IN (:notFound, :blank) OR ' +
                    'lastScrapeStatus IN (:notFound, :blank, :notInUse)',
                ExpressionAttributeValues: {
                    ':entityId': entityId,
                    ':notFound': 'NOT_FOUND',
                    ':blank': 'BLANK',
                    ':notInUse': 'NOT_IN_USE'
                },
                ProjectionExpression: 'tournamentId',
                ExclusiveStartKey: lastEvaluatedKey
            }));
            
            if (result.Items) {
                result.Items.forEach(item => {
                    if (item.tournamentId && !allIds.includes(item.tournamentId)) {
                        allIds.push(item.tournamentId);
                    }
                });
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
            iterations++;
            
            if (iterations % 10 === 0) {
                console.log(`[ScheduledHandler] Gap scan iteration ${iterations}: ${allIds.length} total NOT_FOUND found so far`);
            }
            
        } while (lastEvaluatedKey && iterations < maxIterations);
        
        if (iterations >= maxIterations) {
            console.warn(`[ScheduledHandler] Hit max iterations (${maxIterations}) for gap scan, may have more gaps`);
        }
        
        const unfilteredCount = allIds.length;
        
        // v1.1.0: CRITICAL FIX - Filter out trailing NOT_FOUND IDs
        // Only keep IDs that are BELOW highestGameId (true gaps between saved games)
        // IDs >= highestGameId are trailing NOT_FOUND (no game has ever been saved there)
        let filteredIds = allIds;
        
        if (highestGameId > 0) {
            filteredIds = allIds.filter(id => id < highestGameId);
            const filteredCount = unfilteredCount - filteredIds.length;
            
            if (filteredCount > 0) {
                console.log(`[ScheduledHandler] v1.1.0 FIX: Filtered out ${filteredCount} trailing NOT_FOUND IDs (>= ${highestGameId})`);
            }
        } else {
            console.log(`[ScheduledHandler] No highestGameId available, not filtering gaps (first run?)`);
        }
        
        // Sort for consistent processing order
        filteredIds.sort((a, b) => a - b);
        
        const filteredCount = unfilteredCount - filteredIds.length;
        console.log(`[ScheduledHandler] Found ${filteredIds.length} gaps to re-check (${filteredCount} trailing filtered out) in ${iterations} iterations`);
        
        return {
            gapIds: filteredIds,
            unfilteredCount,
            filteredCount
        };
        
    } catch (error) {
        console.error(`[ScheduledHandler] Error fetching NOT_FOUND gaps: ${error.message}`);
        // Return empty array - we'll still process new IDs even if gap fetch fails
        return { gapIds: [], unfilteredCount: 0, filteredCount: 0 };
    }
}

/**
 * Get ScraperState for an entity
 * 
 * Returns the scraper state which includes lastScannedId for continuation.
 * 
 * @param {string} entityId - Entity ID
 * @param {object} context - Context with ddbDocClient and getTableName
 * @returns {object|null} ScraperState record or null
 */
async function getScraperState(entityId, context) {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScraperState');
    const stateId = `scraper-${entityId}`;
    
    try {
        const result = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: stateId }
        }));
        
        if (result.Item) {
            console.log(`[ScheduledHandler] Found ScraperState: lastScannedId=${result.Item.lastScannedId}`);
        } else {
            console.log(`[ScheduledHandler] No ScraperState found for entity ${entityId}`);
        }
        
        return result.Item || null;
        
    } catch (error) {
        console.warn(`[ScheduledHandler] Error fetching ScraperState: ${error.message}`);
        return null;
    }
}

module.exports = {
    handleScheduledEvent,
    // Export helpers for testing
    processEntityScheduledScrape,
    getHighestGameId,
    getNotFoundGapIds,
    getScraperState,
};