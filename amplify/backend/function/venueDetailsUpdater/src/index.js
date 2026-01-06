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
 * VENUE DETAILS UPDATER LAMBDA
 * VERSION: 1.1.0
 * 
 * CHANGES v1.1.0:
 * - Added content hash check to skip non-meaningful changes
 * - Removed lambda-monitoring (deprecated)
 * - Only processes records where dataChangedAt changed
 * 
 * This Lambda calculates aggregate venue metrics:
 * - totalGamesHeld: Count of finished, non-child games
 * - averageUniquePlayersPerGame: Average unique players
 * - averageEntriesPerGame: Average entries
 * - gameNights: Days when games are typically held
 * - status: ACTIVE/INACTIVE based on recent activity
 * 
 * NO PLAYER DATA MODIFICATION - Only updates VenueDetails table.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { v4: uuidv4 } = require('uuid');

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

// Environment Variables
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const VENUE_DETAILS_TABLE = process.env.API_KINGSROOM_VENUEDETAILSTABLE_NAME;

// Constants
const UNASSIGNED_VENUE_ID = '00000000-0000-0000-0000-000000000000';

// ===================================================================
// CONTENT HASH CHECK - Skip non-meaningful changes
// ===================================================================

/**
 * Check if this stream record represents a meaningful change
 * that requires venue details processing.
 * 
 * @param {Object} record - DynamoDB stream record
 * @returns {Object} { shouldProcess: boolean, reason: string }
 */
const shouldProcessStreamRecord = (record) => {
    const { eventName, dynamodb } = record;
    
    // Always process INSERT events (new games)
    if (eventName === 'INSERT') {
        return { shouldProcess: true, reason: 'New game inserted' };
    }
    
    // Always process REMOVE events (game deleted)
    if (eventName === 'REMOVE') {
        return { shouldProcess: true, reason: 'Game removed' };
    }
    
    // For MODIFY events, check if dataChangedAt changed
    if (eventName === 'MODIFY') {
        const oldImage = dynamodb.OldImage ? unmarshall(dynamodb.OldImage) : null;
        const newImage = dynamodb.NewImage ? unmarshall(dynamodb.NewImage) : null;
        
        if (!oldImage || !newImage) {
            return { shouldProcess: true, reason: 'Missing image data, processing to be safe' };
        }
        
        // Check if dataChangedAt changed (meaningful change)
        const oldDataChangedAt = oldImage.dataChangedAt;
        const newDataChangedAt = newImage.dataChangedAt;
        
        if (oldDataChangedAt !== newDataChangedAt) {
            return { shouldProcess: true, reason: 'dataChangedAt changed (meaningful update)' };
        }
        
        // Also check contentHash as backup
        const oldHash = oldImage.contentHash;
        const newHash = newImage.contentHash;
        
        if (oldHash !== newHash) {
            return { shouldProcess: true, reason: 'contentHash changed' };
        }
        
        // Check if venue changed (always process venue reassignments)
        if (oldImage.venueId !== newImage.venueId) {
            return { shouldProcess: true, reason: 'venueId changed' };
        }
        
        // Check if gameStatus changed (important for inclusion/exclusion)
        if (oldImage.gameStatus !== newImage.gameStatus) {
            return { shouldProcess: true, reason: 'gameStatus changed' };
        }
        
        // No meaningful change
        return { shouldProcess: false, reason: 'No meaningful change (dataChangedAt unchanged)' };
    }
    
    // Unknown event type - process to be safe
    return { shouldProcess: true, reason: 'Unknown event type' };
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Get existing VenueDetails for a venue
 */
const getVenueDetails = async (venueId) => {
    console.log(`[VenueDetails:DB] Querying VenueDetails for venueId: ${venueId}`);
    
    try {
        const result = await ddbDocClient.send(new QueryCommand({
            TableName: VENUE_DETAILS_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            ExpressionAttributeValues: {
                ':venueId': venueId
            }
        }));
        
        console.log(`[VenueDetails:DB] Query result: found ${result.Items?.length || 0} records`);
        return result.Items?.[0] || null;
    } catch (error) {
        console.error(`[VenueDetails:DB] Error fetching VenueDetails for ${venueId}:`, error.message);
        return null;
    }
};

/**
 * Get all finished games for a venue (for full recalculation)
 */
const getFinishedGamesForVenue = async (venueId) => {
    console.log(`[VenueDetails:DB] Fetching games for venueId: ${venueId}`);
    
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

            const result = await ddbDocClient.send(new QueryCommand(params));
            
            if (result.Items) {
                games.push(...result.Items);
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        
        console.log(`[VenueDetails:DB] Retrieved ${games.length} total games for venue ${venueId}`);
        return games;
        
    } catch (error) {
        console.error(`[VenueDetails:DB] Error fetching games for venue ${venueId}:`, error.message);
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
    
    console.log(`[VenueDetails:DB] Creating new VenueDetails record for venue ${record.venueId}`);
    
    try {
        // Double-check no record exists (race condition prevention)
        const existingCheck = await ddbDocClient.send(new QueryCommand({
            TableName: VENUE_DETAILS_TABLE,
            IndexName: 'byVenue',
            KeyConditionExpression: 'venueId = :venueId',
            ExpressionAttributeValues: {
                ':venueId': record.venueId
            },
            Limit: 1
        }));
        
        if (existingCheck.Items && existingCheck.Items.length > 0) {
            console.log(`[VenueDetails:DB] Record already exists (race condition), updating instead`);
            return await updateVenueDetails(existingCheck.Items[0], record);
        }
        
        await ddbDocClient.send(new PutCommand({
            TableName: VENUE_DETAILS_TABLE,
            Item: record
        }));
        
        console.log(`[VenueDetails:DB] Created VenueDetails ${id} for venue ${record.venueId}`);
        return id;
    } catch (error) {
        console.error(`[VenueDetails:DB] Error creating VenueDetails:`, error.message);
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
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: VENUE_DETAILS_TABLE,
            Key: { id: existingRecord.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[VenueDetails:DB] Updated VenueDetails ${existingRecord.id}: ` +
            `games=${updates.totalGamesHeld}, avgPlayers=${updates.averageUniquePlayersPerGame}`);
        
        return existingRecord.id;
    } catch (error) {
        console.error(`[VenueDetails:DB] Error updating VenueDetails:`, error.message);
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
    console.log(`[VenueDetails:RECALC] Starting full recalculation for venue ${venueId}`);
    
    // Get all games for this venue
    const games = await getFinishedGamesForVenue(venueId);
    console.log(`[VenueDetails:RECALC] Found ${games.length} games for venue`);
    
    // Calculate metrics using pure logic
    const metrics = calculateVenueMetrics(games);
    
    console.log(`[VenueDetails:RECALC] Calculated metrics:`, {
        totalGamesHeld: metrics.totalGamesHeld,
        averageUniquePlayersPerGame: metrics.averageUniquePlayersPerGame,
        averageEntriesPerGame: metrics.averageEntriesPerGame,
        gameNights: metrics.gameNights,
        gamesIncluded: metrics.gamesIncluded,
        gamesExcluded: metrics.gamesExcluded
    });
    
    // Get existing record
    const existingRecord = await getVenueDetails(venueId);
    
    // Build the record
    const venueDetailsRecord = buildVenueDetailsRecord(venueId, metrics, existingRecord);
    
    // Create or update
    let detailsId;
    if (existingRecord) {
        detailsId = await updateVenueDetails(existingRecord, venueDetailsRecord);
    } else {
        detailsId = await createVenueDetails(venueDetailsRecord);
    }
    
    console.log(`[VenueDetails:RECALC] Recalculation complete. Details ID: ${detailsId}`);
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
    
    console.log(`[VenueDetails:STREAM] Processing stream record: ${eventName}`);
    
    // Unmarshall the DynamoDB images
    const newImage = record.dynamodb?.NewImage 
        ? unmarshall(record.dynamodb.NewImage) 
        : null;
    const oldImage = record.dynamodb?.OldImage 
        ? unmarshall(record.dynamodb.OldImage) 
        : null;
    
    const entityId = newImage?.entityId || oldImage?.entityId || null;
    
    // Determine which venue(s) need updating
    const venuesToUpdate = new Set();
    
    // Check new game
    if (newImage?.venueId && newImage.venueId !== UNASSIGNED_VENUE_ID) {
        const newInclusion = shouldIncludeInMetrics(newImage);
        const oldInclusion = oldImage ? shouldIncludeInMetrics(oldImage) : { shouldInclude: false };
        
        // Add venue if game became eligible, was modified while eligible, or became ineligible
        if (newInclusion.shouldInclude || oldInclusion.shouldInclude) {
            venuesToUpdate.add(newImage.venueId);
            console.log(`[VenueDetails:STREAM] Adding venue ${newImage.venueId} to update list`);
        }
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
        console.log(`[VenueDetails:STREAM] No venue updates needed for game ${newImage?.id || oldImage?.id}`);
        return [];
    }
    
    console.log(`[VenueDetails:STREAM] Venues to update: ${Array.from(venuesToUpdate).join(', ')}`);
    
    // Process each affected venue
    const results = [];
    for (const venueId of venuesToUpdate) {
        try {
            const detailsId = await performFullRecalculation(venueId, entityId);
            results.push({ venueId, detailsId, success: true });
        } catch (error) {
            console.error(`[VenueDetails:STREAM] Error processing venue ${venueId}:`, error.message);
            results.push({ venueId, success: false, error: error.message });
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
    
    const games = await getFinishedGamesForVenue(venueId);
    const metrics = calculateVenueMetrics(games);
    const existingRecord = await getVenueDetails(venueId);
    
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
    console.log('[VenueDetails] v1.1.0 - With content hash check');
    console.log('[VenueDetails] Event type:', event.Records ? 'DynamoDB Stream' : 'GraphQL');
    
    try {
        // === DYNAMODB STREAM TRIGGER ===
        if (event.Records && Array.isArray(event.Records)) {
            console.log(`[VenueDetails] Processing ${event.Records.length} stream records`);
            
            const allResults = [];
            let processed = 0;
            let skipped = 0;
            
            for (let i = 0; i < event.Records.length; i++) {
                const record = event.Records[i];
                
                // Only process Game table events
                const tablePrefix = GAME_TABLE?.split('-')[0];
                if (!record.eventSourceARN?.includes(tablePrefix)) {
                    console.log(`[VenueDetails] Skipping - not Game table`);
                    skipped++;
                    continue;
                }
                
                // ═══════════════════════════════════════════════════════════════
                // CONTENT HASH CHECK: Skip non-meaningful changes
                // ═══════════════════════════════════════════════════════════════
                const processCheck = shouldProcessStreamRecord(record);
                
                if (!processCheck.shouldProcess) {
                    console.log(`[VenueDetails] Skipping record: ${processCheck.reason}`);
                    skipped++;
                    continue;
                }
                
                console.log(`[VenueDetails] Processing record: ${processCheck.reason}`);
                const results = await processStreamRecord(record);
                allResults.push(...results);
                processed++;
            }
            
            const successCount = allResults.filter(r => r.success).length;
            const failCount = allResults.filter(r => !r.success).length;
            
            console.log(`[VenueDetails] Stream complete: ${processed} processed, ${skipped} skipped, ${successCount} venues updated, ${failCount} failed`);
            
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
        
        return result;
        
    } catch (error) {
        console.error('[VenueDetails] Handler error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};