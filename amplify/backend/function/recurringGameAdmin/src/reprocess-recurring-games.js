/**
 * reprocess-recurring-games.js
 * 
 * Utility to reprocess existing games with the new recurring-resolver logic
 * and/or create RecurringGameInstance records for tracking.
 * 
 * Can be run as:
 * 1. A standalone script
 * 2. Called from recurringGameAdmin lambda
 * 3. As a one-time migration
 */

const { getDocClient, getTableName, QueryCommand, UpdateCommand } = require('./utils/db-client');
const { resolveRecurringAssignment } = require('./recurring-resolver');
const { createConfirmedInstance, reconcileInstances, detectGaps } = require('./instance-manager');

// ===================================================================
// BULK REPROCESSING
// ===================================================================

/**
 * Reprocess all games at a venue with the new recurring logic
 * 
 * @param {Object} params
 * @param {string} params.venueId - Venue to reprocess
 * @param {string} params.entityId - Entity ID
 * @param {string} params.startDate - Optional start date filter (YYYY-MM-DD)
 * @param {string} params.endDate - Optional end date filter (YYYY-MM-DD)
 * @param {boolean} params.preview - If true, don't apply changes
 * @param {boolean} params.forceReassign - If true, re-run matching even for already-assigned games
 * @param {boolean} params.createInstances - If true, create RecurringGameInstance records
 * @returns {Object} Results summary
 */
const reprocessVenueGames = async ({
    venueId,
    entityId,
    startDate = null,
    endDate = null,
    preview = true,
    forceReassign = false,
    createInstances = true
}) => {
    console.log(`[REPROCESS] Starting reprocess for venue ${venueId} (preview: ${preview})`);
    
    const client = getDocClient();
    const gameTable = getTableName('Game');
    
    // Build query
    let keyCondition = 'venueId = :vid';
    const expressionValues = { ':vid': venueId };
    
    if (startDate && endDate) {
        keyCondition += ' AND gameStartDateTime BETWEEN :start AND :end';
        expressionValues[':start'] = `${startDate}T00:00:00.000Z`;
        expressionValues[':end'] = `${endDate}T23:59:59.999Z`;
    }
    
    // Fetch games
    const result = await client.send(new QueryCommand({
        TableName: gameTable,
        IndexName: 'byVenue',
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues
    }));
    
    const games = result.Items || [];
    console.log(`[REPROCESS] Found ${games.length} games to process`);
    
    const results = {
        totalGames: games.length,
        processed: 0,
        skipped: 0,
        matched: 0,
        created: 0,
        unchanged: 0,
        errors: 0,
        instancesCreated: 0,
        details: []
    };
    
    for (const game of games) {
        try {
            // Skip if already assigned and not forcing reassign
            if (!forceReassign && game.recurringGameId && 
                game.recurringGameAssignmentStatus === 'AUTO_ASSIGNED') {
                
                // Still create instance if needed
                if (createInstances && !preview) {
                    try {
                        const { getRecurringGamesByVenue } = require('./recurring-resolver');
                        const recurringGames = await getRecurringGamesByVenue(venueId);
                        const recurringGame = recurringGames.find(rg => rg.id === game.recurringGameId);
                        
                        if (recurringGame) {
                            const instanceResult = await createConfirmedInstance({
                                game,
                                recurringGame,
                                matchConfidence: game.recurringGameAssignmentConfidence || 0.9
                            });
                            if (instanceResult?.wasCreated) {
                                results.instancesCreated++;
                            }
                        }
                    } catch (instErr) {
                        console.warn(`[REPROCESS] Instance creation failed for game ${game.id}:`, instErr.message);
                    }
                }
                
                results.skipped++;
                results.details.push({
                    gameId: game.id,
                    gameName: game.name,
                    action: 'SKIPPED',
                    reason: 'already_assigned',
                    currentRecurringGameId: game.recurringGameId
                });
                continue;
            }
            
            // Run recurring resolution with new logic
            const resolution = await resolveRecurringAssignment({
                game,
                entityId: entityId || game.entityId,
                autoCreate: true,
                requirePatternConfirmation: false  // Don't defer for reprocessing
            });
            
            results.processed++;
            
            const detail = {
                gameId: game.id,
                gameName: game.name,
                previousRecurringGameId: game.recurringGameId,
                previousStatus: game.recurringGameAssignmentStatus
            };
            
            if (resolution.metadata.status === 'MATCHED_EXISTING') {
                detail.action = 'MATCHED';
                detail.newRecurringGameId = resolution.gameUpdates.recurringGameId;
                detail.newStatus = resolution.gameUpdates.recurringGameAssignmentStatus;
                detail.confidence = resolution.gameUpdates.recurringGameAssignmentConfidence;
                detail.matchedName = resolution.metadata.matchedRecurringGameName;
                
                if (game.recurringGameId === resolution.gameUpdates.recurringGameId) {
                    results.unchanged++;
                    detail.action = 'UNCHANGED';
                } else {
                    results.matched++;
                }
                
            } else if (resolution.metadata.status === 'CREATED_NEW') {
                detail.action = 'CREATED';
                detail.newRecurringGameId = resolution.gameUpdates.recurringGameId;
                detail.newStatus = resolution.gameUpdates.recurringGameAssignmentStatus;
                detail.createdName = resolution.metadata.matchedRecurringGameName;
                results.created++;
                
            } else {
                detail.action = 'NO_MATCH';
                detail.reason = resolution.metadata.reason;
                results.unchanged++;
            }
            
            // Apply changes if not preview
            if (!preview && resolution.gameUpdates.recurringGameId) {
                await updateGameRecurringAssignment(game.id, resolution.gameUpdates);
                detail.applied = true;
                
                // Instance is created by the resolver now, but count it
                if (resolution.metadata.instance?.wasCreated) {
                    results.instancesCreated++;
                }
            }
            
            results.details.push(detail);
            
        } catch (error) {
            console.error(`[REPROCESS] Error processing game ${game.id}:`, error);
            results.errors++;
            results.details.push({
                gameId: game.id,
                gameName: game.name,
                action: 'ERROR',
                error: error.message
            });
        }
    }
    
    console.log(`[REPROCESS] Complete: ${results.matched} matched, ${results.created} created, ${results.unchanged} unchanged, ${results.errors} errors`);
    
    return {
        success: results.errors === 0,
        venueId,
        preview,
        ...results
    };
};

/**
 * Update a game's recurring assignment fields
 */
const updateGameRecurringAssignment = async (gameId, updates) => {
    const client = getDocClient();
    const tableName = getTableName('Game');
    
    const updateExpressions = [];
    const expressionNames = {};
    const expressionValues = { ':now': new Date().toISOString() };
    
    // Build update expression
    const fieldsToUpdate = [
        'recurringGameId',
        'recurringGameAssignmentStatus',
        'recurringGameAssignmentConfidence',
        'isRegular',
        'isSeries'
    ];
    
    fieldsToUpdate.forEach(field => {
        if (updates[field] !== undefined) {
            updateExpressions.push(`#${field} = :${field}`);
            expressionNames[`#${field}`] = field;
            expressionValues[`:${field}`] = updates[field];
        }
    });
    
    // Also update inherited fields if present
    ['guaranteeAmount', 'hasGuarantee', 'buyIn', 'gameVariant'].forEach(field => {
        if (updates[field] !== undefined) {
            updateExpressions.push(`#${field} = :${field}`);
            expressionNames[`#${field}`] = field;
            expressionValues[`:${field}`] = updates[field];
        }
    });
    
    updateExpressions.push('updatedAt = :now');
    
    await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: gameId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues
    }));
};

/**
 * Reprocess games across all venues for an entity
 */
const reprocessEntityGames = async ({
    entityId,
    startDate = null,
    endDate = null,
    preview = true,
    forceReassign = false,
    createInstances = true
}) => {
    console.log(`[REPROCESS] Starting entity-wide reprocess for ${entityId}`);
    
    // Get all venues for entity
    const client = getDocClient();
    const venueTable = getTableName('Venue');
    
    const venuesResult = await client.send(new QueryCommand({
        TableName: venueTable,
        IndexName: 'byEntity',
        KeyConditionExpression: 'entityId = :eid',
        ExpressionAttributeValues: { ':eid': entityId }
    }));
    
    const venues = venuesResult.Items || [];
    console.log(`[REPROCESS] Found ${venues.length} venues to process`);
    
    const allResults = {
        entityId,
        preview,
        venuesProcessed: 0,
        totalGames: 0,
        totalMatched: 0,
        totalCreated: 0,
        totalUnchanged: 0,
        totalErrors: 0,
        totalInstancesCreated: 0,
        venueResults: []
    };
    
    for (const venue of venues) {
        const venueResult = await reprocessVenueGames({
            venueId: venue.id,
            entityId,
            startDate,
            endDate,
            preview,
            forceReassign,
            createInstances
        });
        
        allResults.venuesProcessed++;
        allResults.totalGames += venueResult.totalGames;
        allResults.totalMatched += venueResult.matched;
        allResults.totalCreated += venueResult.created;
        allResults.totalUnchanged += venueResult.unchanged;
        allResults.totalErrors += venueResult.errors;
        allResults.totalInstancesCreated += venueResult.instancesCreated;
        
        allResults.venueResults.push({
            venueId: venue.id,
            venueName: venue.name,
            totalGames: venueResult.totalGames,
            matched: venueResult.matched,
            created: venueResult.created,
            unchanged: venueResult.unchanged,
            errors: venueResult.errors,
            instancesCreated: venueResult.instancesCreated
        });
    }
    
    return allResults;
};

/**
 * Create instances for all games that have recurringGameId but no instance
 * (Backfill for existing data)
 */
const backfillInstances = async ({
    venueId,
    entityId,
    startDate,
    endDate
}) => {
    console.log(`[REPROCESS] Backfilling instances for venue ${venueId}`);
    
    // Use the reconcileInstances function from instance-manager
    return reconcileInstances({
        venueId,
        startDate,
        endDate,
        preview: false
    });
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
    reprocessVenueGames,
    reprocessEntityGames,
    updateGameRecurringAssignment,
    backfillInstances
};
