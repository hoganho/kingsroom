/**
 * ===================================================================
 * Scheduled Handler for scraperManagement
 * ===================================================================
 * 
 * Handles EventBridge/CloudWatch scheduled events for automated scraping.
 * 
 * VERSION: 1.0.0
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
 *    a. Query ScrapeURL for NOT_FOUND gaps (empty slots to re-check)
 *    b. Get ScraperState for lastScannedId (continue discovery)
 *    c. Start 'auto' mode job with gaps + new ID discovery
 * 
 * GAP TYPES:
 * - NOT_FOUND/BLANK/NOT_IN_USE: Re-check these (tournament might exist now)
 * - NOT_PUBLISHED: Skip these (real tournament that's hidden)
 * 
 * ===================================================================
 */

const { QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

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
    
    console.log(`[ScheduledHandler] Processing scheduled event from rule: ${ruleArn}`);
    
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
        
        console.log(`[ScheduledHandler] Completed: ${successful} started, ${failed} failed, ${totalGaps} total gaps queued`);
        
        monitoring.trackOperation('SCHEDULED_EVENT_COMPLETE', 'Handler', 'cloudwatch', {
            entitiesProcessed: activeEntities.length,
            successful,
            failed,
            totalGaps
        });
        
        return {
            statusCode: 200,
            body: 'Scheduled scrape jobs started',
            processedAt: new Date().toISOString(),
            entitiesProcessed: activeEntities.length,
            successful,
            failed,
            totalGapsQueued: totalGaps,
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
    
    // Get NOT_FOUND gaps to re-check
    const gapIds = await getNotFoundGapIds(entityId, { ddbDocClient, getTableName });
    
    // Get ScraperState for lastScannedId
    const scraperState = await getScraperState(entityId, { ddbDocClient, getTableName });
    const lastScannedId = scraperState?.lastScannedId || scraperState?.highestStoredId || 0;
    
    console.log(`[ScheduledHandler] Entity ${entityName}: ${gapIds.length} NOT_FOUND gaps, lastScannedId: ${lastScannedId}`);
    
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
            
            // Pass NOT_FOUND gap IDs to re-check
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
        startId: lastScannedId + 1
    });
    
    return {
        entityId,
        entityName,
        jobId: job.id,
        status: 'started',
        gapCount: gapIds.length,
        startId: lastScannedId + 1,
        hasDefaultVenue: !!entity.defaultVenueId
    };
}

/**
 * Get NOT_FOUND tournament IDs for an entity
 * 
 * These are gaps that should be re-checked - the tournament slot was empty
 * but might have a tournament assigned now.
 * 
 * We check both gameStatus and lastScrapeStatus fields for NOT_FOUND variants.
 * 
 * @param {string} entityId - Entity ID
 * @param {object} context - Context with ddbDocClient and getTableName
 * @returns {number[]} Array of tournament IDs to re-check
 */
async function getNotFoundGapIds(entityId, context) {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScrapeURL');
    
    if (!tableName) {
        console.warn('[ScheduledHandler] ScrapeURL table not configured');
        return [];
    }
    
    console.log(`[ScheduledHandler] Fetching NOT_FOUND gaps for entity: ${entityId}`);
    
    const ids = [];
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
                    if (item.tournamentId && !ids.includes(item.tournamentId)) {
                        ids.push(item.tournamentId);
                    }
                });
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
            iterations++;
            
            if (iterations % 10 === 0) {
                console.log(`[ScheduledHandler] Gap scan iteration ${iterations}: ${ids.length} gaps found so far`);
            }
            
        } while (lastEvaluatedKey && iterations < maxIterations);
        
        if (iterations >= maxIterations) {
            console.warn(`[ScheduledHandler] Hit max iterations (${maxIterations}) for gap scan, may have more gaps`);
        }
        
        // Sort for consistent processing order
        ids.sort((a, b) => a - b);
        
        console.log(`[ScheduledHandler] Found ${ids.length} NOT_FOUND gap IDs in ${iterations} iterations`);
        return ids;
        
    } catch (error) {
        console.error(`[ScheduledHandler] Error fetching NOT_FOUND gaps: ${error.message}`);
        // Return empty array - we'll still process new IDs even if gap fetch fails
        return [];
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
            console.log(`[ScheduledHandler] Found ScraperState: lastScannedId=${result.Item.lastScannedId}, highestStoredId=${result.Item.highestStoredId}`);
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
    getNotFoundGapIds,
    getScraperState,
};
