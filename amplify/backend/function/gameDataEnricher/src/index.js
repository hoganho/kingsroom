/**
 * gameDataEnricher Lambda - index.js
 * 
 * VERSION 3.0.1 - Fixed direct Lambda invocation support
 * CHANGE: When invoked directly with {input: ...} and no fieldName, defaults to enrichGameData
 * 
 * VERSION 3.0.0 - Consolidated all recurring game operations
 * REPLACES: recurringGameAdmin Lambda entirely
 * 
 * Operations:
 * - enrichGameData (original)
 * - Bulk processing (processUnassignedGames, reprocessDeferredGames, getUnassignedGamesStats, previewCandidatePatterns)
 * - Admin operations (getRecurringGameVenueStats, findRecurringGameDuplicates, mergeRecurringGameDuplicates, 
 *                     cleanupOrphanedRecurringGames, reResolveRecurringAssignment, reResolveRecurringAssignmentsForVenue)
 * - Instance tracking (detectRecurringGameGaps, reconcileRecurringInstances, recordMissedInstance, 
 *                      updateInstanceStatus, getVenueComplianceReport, getWeekInstances, listInstancesNeedingReview)
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/index.js
 */

'use strict';

const { enrichGameData } = require('./enricher');

// Bulk processing operations
const {
    processUnassignedGames,
    reprocessDeferredGames,
    getUnassignedGamesStats,
    previewCandidatePatterns,
} = require('./resolution/bulk-recurring-processor');

// Admin operations
const {
    getRecurringGameVenueStats,
    findRecurringGameDuplicates,
    mergeRecurringGameDuplicates,
    cleanupOrphanedRecurringGames,
    reResolveRecurringAssignment,
    reResolveRecurringAssignmentsForVenue,
} = require('./resolution/admin-resolver');

// Instance tracking operations
const {
    detectRecurringGameGaps,
    reconcileRecurringInstances,
    recordMissedInstance,
    updateInstanceStatus,
    getVenueComplianceReport,
    getWeekInstances,
    listInstancesNeedingReview,
} = require('./resolution/instance-manager');

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
    console.log('[GameDataEnricher] Event:', JSON.stringify(event, null, 2));
    
    // Determine operation from GraphQL field name
    // v3.0.1: Default to 'enrichGameData' when invoked directly with input but no fieldName
    // This supports webScraperFunction -> gameDataEnricher direct Lambda invocation
    const fieldName = event.fieldName || event.info?.fieldName || (event.input ? 'enrichGameData' : undefined);
    const args = event.arguments || {};
    
    console.log(`[GameDataEnricher] Resolved fieldName: ${fieldName}`);
    
    try {
        switch (fieldName) {
            // ================================================================
            // ORIGINAL ENRICHMENT
            // ================================================================
            case 'enrichGameData':
                // Support both GraphQL (args.input) and direct invoke (event.input)
                return await enrichGameData(args.input || event.input || args);
            
            // ================================================================
            // BULK PROCESSING OPERATIONS
            // ================================================================
            case 'processUnassignedGames':
                return await processUnassignedGames(args.input || args);
            
            case 'reprocessDeferredGames':
                return await reprocessDeferredGames(args.input || args);
            
            case 'getUnassignedGamesStats':
                return await getUnassignedGamesStats(args.input || args);
            
            case 'previewCandidatePatterns':
                return await previewCandidatePatterns(args.input || args);
            
            // ================================================================
            // ADMIN OPERATIONS
            // ================================================================
            case 'getRecurringGameVenueStats':
                return await getRecurringGameVenueStats(args.venueId);
            
            case 'findRecurringGameDuplicates':
                return await findRecurringGameDuplicates(args.venueId, args.similarityThreshold);
            
            case 'mergeRecurringGameDuplicates':
                const mergeInput = args.input || args;
                return await mergeRecurringGameDuplicates(
                    mergeInput.canonicalId,
                    mergeInput.duplicateIds,
                    mergeInput.preview !== false
                );
            
            case 'cleanupOrphanedRecurringGames':
                const cleanupInput = args.input || args;
                return await cleanupOrphanedRecurringGames(
                    cleanupInput.venueId,
                    cleanupInput.preview !== false
                );
            
            case 'reResolveRecurringAssignment':
                const reResolveInput = args.input || args;
                return await reResolveRecurringAssignment(
                    reResolveInput.gameId,
                    reResolveInput.thresholds || {},
                    reResolveInput.preview !== false
                );
            
            case 'reResolveRecurringAssignmentsForVenue':
                const venueResolveInput = args.input || args;
                return await reResolveRecurringAssignmentsForVenue(
                    venueResolveInput.venueId,
                    venueResolveInput.thresholds || {},
                    venueResolveInput.preview !== false
                );
            
            // ================================================================
            // INSTANCE TRACKING OPERATIONS
            // ================================================================
            case 'detectRecurringGameGaps':
                const gapsInput = args.input || args;
                return await detectRecurringGameGaps(
                    gapsInput.venueId,
                    gapsInput.startDate,
                    gapsInput.endDate,
                    gapsInput.createInstances || false
                );
            
            case 'reconcileRecurringInstances':
                const reconcileInput = args.input || args;
                return await reconcileRecurringInstances(
                    reconcileInput.venueId,
                    reconcileInput.startDate,
                    reconcileInput.endDate,
                    reconcileInput.preview !== false
                );
            
            case 'recordMissedInstance':
                const missedInput = args.input || args;
                return await recordMissedInstance(
                    missedInput.recurringGameId,
                    missedInput.expectedDate,
                    missedInput.status,
                    missedInput.reason,
                    missedInput.notes
                );
            
            case 'updateInstanceStatus':
                const updateInput = args.input || args;
                return await updateInstanceStatus(
                    updateInput.instanceId,
                    updateInput.status,
                    updateInput.reason,
                    updateInput.notes
                );
            
            case 'getVenueComplianceReport':
                const complianceInput = args.input || args;
                return await getVenueComplianceReport(
                    complianceInput.venueId,
                    complianceInput.startDate,
                    complianceInput.endDate
                );
            
            case 'getWeekInstances':
                const weekInput = args.input || args;
                return await getWeekInstances(
                    weekInput.venueId || weekInput.entityId,
                    weekInput.weekKey
                );
            
            case 'listInstancesNeedingReview':
                const reviewInput = args.input || args;
                return await listInstancesNeedingReview(
                    reviewInput.venueId || reviewInput.entityId,
                    reviewInput.limit,
                    reviewInput.nextToken
                );
            
            // ================================================================
            // UNKNOWN OPERATION
            // ================================================================
            default:
                console.error(`[GameDataEnricher] Unknown operation: ${fieldName}`);
                throw new Error(`Unknown operation: ${fieldName}`);
        }
    } catch (error) {
        console.error(`[GameDataEnricher] Error in ${fieldName}:`, error);
        
        // Return error in appropriate format
        return {
            success: false,
            error: error.message,
            ...(fieldName?.includes('Stats') ? { total: 0, unprocessed: 0, candidateRecurring: 0, notRecurring: 0, assigned: 0 } : {}),
            ...(fieldName?.includes('process') ? { processed: 0, assigned: 0, created: 0, deferred: 0, noMatch: 0, errors: 1, dryRun: true, details: [] } : {}),
        };
    }
};