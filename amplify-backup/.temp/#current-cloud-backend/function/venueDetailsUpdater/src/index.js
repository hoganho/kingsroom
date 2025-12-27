/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_VENUEDETAILSTABLE_ARN
    API_KINGSROOM_VENUEDETAILSTABLE_NAME
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * VENUE DETAILS UPDATER LAMBDA - DEBUG VERSION
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { LambdaMonitoring } = require('./lambda-monitoring');

// Import the extracted venue details logic
const {
    shouldIncludeInMetrics,
    calculateVenueMetrics,
    calculateIncrementalUpdate,
    buildVenueDetailsRecord,
    FINISHED_STATUSES
} = require('./venue-details-logic');

// --- CONFIGURATION ---
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Initialize Monitoring
const DEFAULT_ENTITY_ID = 'system-venue-details';
const monitoring = new LambdaMonitoring('venueDetailsUpdater', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// Environment Variables
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const VENUE_DETAILS_TABLE = process.env.API_KINGSROOM_VENUEDETAILSTABLE_NAME;

// Constants
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Get existing VenueDetails for a venue
 */
const getVenueDetails = async (venueId) => {
    console.log(`[VenueDetails:DB] Querying VenueDetails for venueId: ${venueId}`);
    console.log(`[VenueDetails:DB] Table: ${VENUE_DETAILS_TABLE}, Index: byVenue`);
    
    try {
        const result = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: VENUE_DETAILS_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            ExpressionAttributeValues: {
                ':venueId': venueId
            }
        }));
        
        console.log(`[VenueDetails:DB] Query result: found ${result.Items?.length || 0} records`);
        if (result.Items?.[0]) {
            console.log(`[VenueDetails:DB] Existing record ID: ${result.Items[0].id}`);
        }
        
        return result.Items?.[0] || null;
    } catch (error) {
        console.error(`[VenueDetails:DB] ❌ Error fetching VenueDetails for ${venueId}:`, error);
        console.error(`[VenueDetails:DB] Error name: ${error.name}, message: ${error.message}`);
        return null;
    }
};

/**
 * Get all finished games for a venue (for full recalculation)
 */
const getFinishedGamesForVenue = async (venueId) => {
    console.log(`[VenueDetails:DB] Fetching games for venueId: ${venueId}`);
    console.log(`[VenueDetails:DB] Game Table: ${GAME_TABLE}, Index: byVenue`);
    
    const games = [];
    let lastEvaluatedKey = null;
    
    try {
        do {
            const params = {
                TableName: GAME_TABLE,
                IndexName: 'byVenue',
                KeyConditionExpression: 'venueId = :venueId',
                ExpressionAttributeValues: {
                    ':venueId': venueId
                }
            };
            
            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }

            const result = await monitoredDdbDocClient.send(new QueryCommand(params));
            
            if (result.Items) {
                games.push(...result.Items);
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        console.log(`[VenueDetails:DB] ✅ Retrieved ${games.length} total games for venue ${venueId}`);
        
        // Log first few games for debugging
        if (games.length > 0) {
            console.log(`[VenueDetails:DB] Sample games:`, games.slice(0, 3).map(g => ({
                id: g.id,
                name: g.name,
                gameStatus: g.gameStatus,
                totalUniquePlayers: g.totalUniquePlayers,
                totalInitialEntries: g.totalInitialEntries,
                totalEntries: g.totalEntries,
                consolidationType: g.consolidationType,
                parentGameId: g.parentGameId
            })));
        }
        
        return games;
        
    } catch (error) {
        console.error(`[VenueDetails:DB] ❌ Error fetching games for venue ${venueId}:`, error);
        console.error(`[VenueDetails:DB] Error name: ${error.name}, message: ${error.message}`);
        return [];
    }
};

/**
 * Create new VenueDetails record
 */
const createVenueDetails = async (venueDetailsRecord) => {
    const id = uuidv4();
    const record = {
        ...venueDetailsRecord,
        id
    };
    
    console.log(`[VenueDetails:DB] Creating new VenueDetails record`);
    
    monitoring.trackOperation('CREATE', 'VenueDetails', id);
    
    try {
        // First, double-check no record exists (in case of race condition)
        const existingCheck = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: VENUE_DETAILS_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            ExpressionAttributeValues: {
                ':venueId': record.venueId
            },
            Limit: 1
        }));
        
        if (existingCheck.Items && existingCheck.Items.length > 0) {
            console.log(`[VenueDetails:DB] ⚠️ Record already exists (race condition), updating instead`);
            return await updateVenueDetails(existingCheck.Items[0], record);
        }
        
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: VENUE_DETAILS_TABLE,
            Item: record
        }));
        
        console.log(`[VenueDetails:DB] ✅ Created VenueDetails ${id} for venue ${record.venueId}`);
        return id;
    } catch (error) {
        console.error(`[VenueDetails:DB] ❌ Error creating VenueDetails:`, error);
        throw error;
    }
};

/**
 * Update existing VenueDetails record
 */
const updateVenueDetails = async (existingRecord, updates) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    console.log(`[VenueDetails:DB] Updating VenueDetails record: ${existingRecord.id}`);
    console.log(`[VenueDetails:DB] Updates:`, JSON.stringify(updates, null, 2));
    
    monitoring.trackOperation('UPDATE', 'VenueDetails', existingRecord.id);
    
    // Build update expression
    const updateFields = {
        totalGamesHeld: updates.totalGamesHeld,
        averageUniquePlayersPerGame: updates.averageUniquePlayersPerGame,
        averageEntriesPerGame: updates.averageEntriesPerGame,
        gameNights: updates.gameNights,
        status: updates.status || existingRecord.status,
        updatedAt: now,
        _lastChangedAt: timestamp,
        _version: (existingRecord._version || 1) + 1
    };
    
    // Update startDate only if we have an earlier one
    if (updates.startDate && (!existingRecord.startDate || updates.startDate < existingRecord.startDate)) {
        updateFields.startDate = updates.startDate;
    }
    
    const updateExpression = 'SET ' + Object.keys(updateFields)
        .map(key => `#${key} = :${key}`)
        .join(', ');
    
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    Object.keys(updateFields).forEach(key => {
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = updateFields[key];
    });
    
    console.log(`[VenueDetails:DB] Update expression: ${updateExpression}`);
    console.log(`[VenueDetails:DB] Expression values:`, JSON.stringify(expressionAttributeValues, null, 2));
    
    try {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: VENUE_DETAILS_TABLE,
            Key: { id: existingRecord.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[VenueDetails:DB] ✅ Updated VenueDetails ${existingRecord.id}: ` +
            `games=${updates.totalGamesHeld}, avgUniquePlayers=${updates.averageUniquePlayersPerGame}, ` +
            `avgEntries=${updates.averageEntriesPerGame}, nights=[${updates.gameNights?.join(', ')}]`);
        
        return existingRecord.id;
    } catch (error) {
        console.error(`[VenueDetails:DB] ❌ Error updating VenueDetails:`, error);
        console.error(`[VenueDetails:DB] Error name: ${error.name}, message: ${error.message}`);
        throw error;
    }
};

// ===================================================================
// FULL RECALCULATION
// ===================================================================

/**
 * Perform full recalculation of VenueDetails for a venue
 */
const performFullRecalculation = async (venueId, entityId = null) => {
    console.log(`[VenueDetails:RECALC] ========================================`);
    console.log(`[VenueDetails:RECALC] Starting full recalculation for venue ${venueId}`);
    console.log(`[VenueDetails:RECALC] ========================================`);
    
    // Update monitoring entityId if provided
    if (entityId) {
        monitoring.entityId = entityId;
    }
    
    monitoring.trackOperation('RECALCULATE_START', 'VenueDetails', venueId, { entityId });
    
    // Get all games for this venue
    const games = await getFinishedGamesForVenue(venueId);
    console.log(`[VenueDetails:RECALC] Found ${games.length} games for venue`);
    
    // Calculate metrics using pure logic
    const metrics = calculateVenueMetrics(games);
    
    console.log(`[VenueDetails:RECALC] Calculated metrics:`, JSON.stringify({
        totalGamesHeld: metrics.totalGamesHeld,
        averageUniquePlayersPerGame: metrics.averageUniquePlayersPerGame,
        averageEntriesPerGame: metrics.averageEntriesPerGame,
        gameNights: metrics.gameNights,
        gamesIncluded: metrics.gamesIncluded,
        gamesExcluded: metrics.gamesExcluded,
        exclusionReasons: metrics.exclusionReasons
    }, null, 2));
    
    // Get existing record
    const existingRecord = await getVenueDetails(venueId);
    console.log(`[VenueDetails:RECALC] Existing record: ${existingRecord ? existingRecord.id : 'NONE'}`);
    
    // Build the record
    const venueDetailsRecord = buildVenueDetailsRecord(venueId, metrics, existingRecord);
    console.log(`[VenueDetails:RECALC] Built record:`, JSON.stringify(venueDetailsRecord, null, 2));
    
    // Create or update
    let detailsId;
    if (existingRecord) {
        console.log(`[VenueDetails:RECALC] Updating existing record...`);
        detailsId = await updateVenueDetails(existingRecord, venueDetailsRecord);
    } else {
        console.log(`[VenueDetails:RECALC] Creating new record...`);
        detailsId = await createVenueDetails(venueDetailsRecord);
    }
    
    console.log(`[VenueDetails:RECALC] ✅ Recalculation complete. Details ID: ${detailsId}`);
    
    monitoring.trackOperation('RECALCULATE_COMPLETE', 'VenueDetails', venueId, {
        detailsId,
        totalGamesHeld: metrics.totalGamesHeld,
        gamesExcluded: metrics.gamesExcluded,
        wasUpdate: !!existingRecord
    });
    
    return detailsId;
};

// ===================================================================
// STREAM EVENT PROCESSING
// ===================================================================

/**
 * Process a single stream record
 */
const processStreamRecord = async (record) => {
    const eventName = record.eventName;
    
    console.log(`[VenueDetails:STREAM] ========================================`);
    console.log(`[VenueDetails:STREAM] Processing stream record: ${eventName}`);
    console.log(`[VenueDetails:STREAM] ========================================`);
    
    // Log raw record structure
    console.log(`[VenueDetails:STREAM] Raw record keys:`, Object.keys(record));
    console.log(`[VenueDetails:STREAM] dynamodb keys:`, Object.keys(record.dynamodb || {}));
    console.log(`[VenueDetails:STREAM] Has NewImage: ${!!record.dynamodb?.NewImage}`);
    console.log(`[VenueDetails:STREAM] Has OldImage: ${!!record.dynamodb?.OldImage}`);
    
    // Unmarshall the DynamoDB images
    const newImage = record.dynamodb?.NewImage 
        ? unmarshall(record.dynamodb.NewImage) 
        : null;
    const oldImage = record.dynamodb?.OldImage 
        ? unmarshall(record.dynamodb.OldImage) 
        : null;
    
    console.log(`[VenueDetails:STREAM] Unmarshalled NewImage:`, newImage ? JSON.stringify({
        id: newImage.id,
        name: newImage.name,
        gameStatus: newImage.gameStatus,
        venueId: newImage.venueId,
        totalUniquePlayers: newImage.totalUniquePlayers,
        totalInitialEntries: newImage.totalInitialEntries,
        totalEntries: newImage.totalEntries,
        consolidationType: newImage.consolidationType,
        parentGameId: newImage.parentGameId,
        entityId: newImage.entityId
    }, null, 2) : 'null');
    
    console.log(`[VenueDetails:STREAM] Unmarshalled OldImage:`, oldImage ? JSON.stringify({
        id: oldImage.id,
        gameStatus: oldImage.gameStatus,
        venueId: oldImage.venueId
    }, null, 2) : 'null');
    
    // Extract entityId for monitoring (prefer newImage, fallback to oldImage)
    const entityId = newImage?.entityId || oldImage?.entityId || null;
    if (entityId) {
        monitoring.entityId = entityId;
    }
    
    // Track stream record processing
    monitoring.trackOperation('STREAM_RECORD', 'Game', newImage?.id || oldImage?.id, {
        eventName,
        gameStatus: newImage?.gameStatus,
        venueId: newImage?.venueId || oldImage?.venueId,
        entityId
    });
    
    // Determine which venue(s) need updating
    const venuesToUpdate = new Set();
    
    // Check new game
    if (newImage?.venueId && newImage.venueId !== UNASSIGNED_VENUE_ID) {
        console.log(`[VenueDetails:STREAM] Checking inclusion for new image...`);
        const newInclusion = shouldIncludeInMetrics(newImage);
        const oldInclusion = oldImage ? shouldIncludeInMetrics(oldImage) : { shouldInclude: false };
        
        console.log(`[VenueDetails:STREAM] New inclusion: ${newInclusion.shouldInclude} (reason: ${newInclusion.reason})`);
        console.log(`[VenueDetails:STREAM] Old inclusion: ${oldInclusion.shouldInclude} (reason: ${oldInclusion.reason})`);
        
        // Add venue if game became eligible, was modified while eligible, or became ineligible
        if (newInclusion.shouldInclude || oldInclusion.shouldInclude) {
            venuesToUpdate.add(newImage.venueId);
            console.log(`[VenueDetails:STREAM] ✅ Adding venue ${newImage.venueId} to update list`);
        } else {
            console.log(`[VenueDetails:STREAM] ⏭️ Skipping - neither new nor old state is eligible`);
        }
    } else {
        console.log(`[VenueDetails:STREAM] ⏭️ No venueId in newImage or is UNASSIGNED`);
    }
    
    // Check if venue changed
    if (oldImage?.venueId && 
        oldImage.venueId !== UNASSIGNED_VENUE_ID && 
        oldImage.venueId !== newImage?.venueId) {
        const oldInclusion = shouldIncludeInMetrics(oldImage);
        if (oldInclusion.shouldInclude) {
            venuesToUpdate.add(oldImage.venueId);
            console.log(`[VenueDetails:STREAM] Venue change detected: ${oldImage.venueId} -> ${newImage?.venueId}`);
        }
    }
    
    // Handle REMOVE events
    if (eventName === 'REMOVE' && oldImage?.venueId && oldImage.venueId !== UNASSIGNED_VENUE_ID) {
        const oldInclusion = shouldIncludeInMetrics(oldImage);
        if (oldInclusion.shouldInclude) {
            venuesToUpdate.add(oldImage.venueId);
            console.log(`[VenueDetails:STREAM] Game ${oldImage.id} removed, updating venue ${oldImage.venueId}`);
        }
    }
    
    // Skip if no venues to update
    if (venuesToUpdate.size === 0) {
        console.log(`[VenueDetails:STREAM] ⏭️ No venue updates needed for game ${newImage?.id || oldImage?.id}`);
        return [];
    }
    
    console.log(`[VenueDetails:STREAM] Venues to update: ${Array.from(venuesToUpdate).join(', ')}`);
    
    // Process each affected venue
    const results = [];
    for (const venueId of venuesToUpdate) {
        try {
            console.log(`[VenueDetails:STREAM] Processing venue: ${venueId}`);
            const detailsId = await performFullRecalculation(venueId, entityId);
            results.push({ venueId, detailsId, success: true });
            
            monitoring.trackOperation('VENUE_UPDATED', 'VenueDetails', detailsId, {
                venueId,
                triggeredBy: eventName,
                gameId: newImage?.id || oldImage?.id
            });
        } catch (error) {
            console.error(`[VenueDetails:STREAM] ❌ Error processing venue ${venueId}:`, error);
            results.push({ venueId, success: false, error: error.message });
            
            monitoring.trackOperation('VENUE_UPDATE_FAILED', 'VenueDetails', venueId, {
                error: error.message,
                triggeredBy: eventName
            });
        }
    }
    
    return results;
};

// ===================================================================
// GRAPHQL HANDLERS
// ===================================================================

/**
 * Handle recalculateVenueDetails mutation
 */
const handleRecalculateVenueDetails = async (input) => {
    const { venueId, entityId, forceAll } = input;
    
    console.log('[VenueDetails:GQL] Manual recalculation requested:', { venueId, entityId, forceAll });
    
    if (entityId) {
        monitoring.entityId = entityId;
    }
    
    monitoring.trackOperation('MANUAL_RECALC_START', 'VenueDetails', venueId || 'all', {
        entityId,
        forceAll
    });
    
    const results = [];
    
    if (venueId) {
        try {
            const detailsId = await performFullRecalculation(venueId, entityId);
            results.push({ venueId, detailsId, success: true });
        } catch (error) {
            results.push({ venueId, success: false, error: error.message });
        }
    } else if (forceAll) {
        console.warn('[VenueDetails:GQL] forceAll recalculation not implemented');
        return {
            success: false,
            message: 'forceAll not implemented. Please specify a venueId.'
        };
    }
    
    monitoring.trackOperation('MANUAL_RECALC_COMPLETE', 'VenueDetails', venueId || 'all', {
        venuesProcessed: results.length,
        success: results.every(r => r.success)
    });
    
    return {
        success: results.every(r => r.success),
        venuesProcessed: results.length,
        results
    };
};

/**
 * Handle getVenueMetricsPreview query
 */
const handleGetVenueMetricsPreview = async (input) => {
    const { venueId } = input;
    
    if (!venueId) {
        return { success: false, error: 'venueId is required' };
    }
    
    console.log(`[VenueDetails:GQL] Generating metrics preview for venue ${venueId}`);
    
    monitoring.trackOperation('PREVIEW_START', 'VenueDetails', venueId);
    
    const games = await getFinishedGamesForVenue(venueId);
    const metrics = calculateVenueMetrics(games);
    const existingRecord = await getVenueDetails(venueId);
    
    monitoring.trackOperation('PREVIEW_COMPLETE', 'VenueDetails', venueId, {
        gamesAnalyzed: games.length,
        gamesIncluded: metrics.gamesIncluded,
        wouldChange: existingRecord ? (
            existingRecord.totalGamesHeld !== metrics.totalGamesHeld ||
            existingRecord.averageUniquePlayersPerGame !== metrics.averageUniquePlayersPerGame ||
            existingRecord.averageEntriesPerGame !== metrics.averageEntriesPerGame
        ) : true
    });
    
    return {
        success: true,
        venueId,
        currentMetrics: existingRecord ? {
            totalGamesHeld: existingRecord.totalGamesHeld,
            averageUniquePlayersPerGame: existingRecord.averageUniquePlayersPerGame,
            averageEntriesPerGame: existingRecord.averageEntriesPerGame,
            gameNights: existingRecord.gameNights,
            status: existingRecord.status
        } : null,
        calculatedMetrics: {
            totalGamesHeld: metrics.totalGamesHeld,
            averageUniquePlayersPerGame: metrics.averageUniquePlayersPerGame,
            averageEntriesPerGame: metrics.averageEntriesPerGame,
            gameNights: metrics.gameNights,
            gamesIncluded: metrics.gamesIncluded,
            gamesExcluded: metrics.gamesExcluded,
            exclusionReasons: metrics.exclusionReasons
        },
        wouldChange: existingRecord ? (
            existingRecord.totalGamesHeld !== metrics.totalGamesHeld ||
            existingRecord.averageUniquePlayersPerGame !== metrics.averageUniquePlayersPerGame ||
            existingRecord.averageEntriesPerGame !== metrics.averageEntriesPerGame ||
            JSON.stringify(existingRecord.gameNights) !== JSON.stringify(metrics.gameNights)
        ) : true
    };
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event) => {
    console.log('[VenueDetails] ============================================================');
    console.log('[VenueDetails] Lambda invoked at', new Date().toISOString());
    console.log('[VenueDetails] ============================================================');
    
    // Log environment
    console.log('[VenueDetails:ENV] GAME_TABLE:', GAME_TABLE);
    console.log('[VenueDetails:ENV] VENUE_DETAILS_TABLE:', VENUE_DETAILS_TABLE);
    console.log('[VenueDetails:ENV] Region:', process.env.AWS_REGION || process.env.REGION);
    
    // Log event structure
    console.log('[VenueDetails] Event type:', event.Records ? 'DynamoDB Stream' : 'GraphQL');
    console.log('[VenueDetails] Full event:', JSON.stringify(event, null, 2));
    
    monitoring.trackOperation('HANDLER_START', 'Handler', 'venueDetailsUpdater');
    
    try {
        // === DYNAMODB STREAM TRIGGER ===
        if (event.Records && Array.isArray(event.Records)) {
            console.log(`[VenueDetails] Processing ${event.Records.length} stream records`);
            
            const allResults = [];
            
            for (let i = 0; i < event.Records.length; i++) {
                const record = event.Records[i];
                console.log(`[VenueDetails] --- Record ${i + 1}/${event.Records.length} ---`);
                console.log(`[VenueDetails] eventSourceARN: ${record.eventSourceARN}`);
                console.log(`[VenueDetails] GAME_TABLE check: looking for "${GAME_TABLE?.split('-')[0]}"`);
                
                // Only process Game table events
                const tablePrefix = GAME_TABLE?.split('-')[0];
                if (!record.eventSourceARN?.includes(tablePrefix)) {
                    console.log(`[VenueDetails] ⏭️ Skipping - ARN doesn't contain "${tablePrefix}"`);
                    continue;
                }
                
                console.log(`[VenueDetails] ✅ Processing this record...`);
                const results = await processStreamRecord(record);
                allResults.push(...results);
            }
            
            const successCount = allResults.filter(r => r.success).length;
            const failCount = allResults.filter(r => !r.success).length;
            
            console.log(`[VenueDetails] ============================================================`);
            console.log(`[VenueDetails] Stream processing complete: ${successCount} succeeded, ${failCount} failed`);
            console.log(`[VenueDetails] Results:`, JSON.stringify(allResults, null, 2));
            console.log(`[VenueDetails] ============================================================`);
            
            monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', 'stream', {
                recordsProcessed: event.Records.length,
                venuesUpdated: successCount,
                failures: failCount
            });
            
            return {
                batchItemFailures: allResults
                    .filter(r => !r.success)
                    .map(r => ({ itemIdentifier: r.venueId }))
            };
        }
        
        // === GRAPHQL QUERY/MUTATION ===
        const fieldName = event.info?.fieldName || event.fieldName;
        const args = event.arguments || event.args || {};
        
        console.log(`[VenueDetails:GQL] GraphQL operation: ${fieldName}`);
        console.log(`[VenueDetails:GQL] Arguments:`, JSON.stringify(args, null, 2));
        
        let result;
        
        switch (fieldName) {
            case 'recalculateVenueDetails':
                result = await handleRecalculateVenueDetails(args.input || args);
                break;
                
            case 'getVenueMetricsPreview':
                result = await handleGetVenueMetricsPreview(args.input || args);
                break;
                
            default:
                console.error(`[VenueDetails:GQL] Unknown field: ${fieldName}`);
                result = {
                    success: false,
                    error: `Unknown operation: ${fieldName}`
                };
        }
        
        monitoring.trackOperation('HANDLER_COMPLETE', 'Handler', fieldName, {
            success: result.success
        });
        
        return result;
        
    } catch (error) {
        console.error('[VenueDetails] ❌ Handler error:', error);
        console.error('[VenueDetails] Stack:', error.stack);
        
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'error', {
            error: error.message
        });
        
        return {
            success: false,
            error: error.message
        };
        
    } finally {
        await monitoring.flush();
        console.log('[VenueDetails] ============================================================');
        console.log('[VenueDetails] Lambda execution complete');
        console.log('[VenueDetails] ============================================================');
    }
};