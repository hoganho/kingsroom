/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_RECURRINGGAMETABLE_ARN
	API_KINGSROOM_RECURRINGGAMETABLE_NAME
	API_KINGSROOM_TOURNAMENTSERIESTABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * index.js
 * Lambda handler for gameDataEnricher
 * 
 * This Lambda enriches game data before it's persisted to the database.
 * It handles:
 * - Validation
 * - Series resolution
 * - Recurring game resolution
 * - Query key computation
 * - Financial calculations
 * 
 * Can be invoked via:
 * 1. GraphQL mutation (enrichGameData)
 * 2. Direct Lambda invocation (from webScraperFunction)
 */

const { enrichGameData } = require('./enricher');
const { LambdaMonitoring, trackEnrichmentComplete } = require('./utils/monitoring');

// ===================================================================
// LAMBDA HANDLER
// ===================================================================

exports.handler = async (event, context) => {
  console.log('[ENRICHER] Handler invoked');
  console.log('[ENRICHER] Event:', JSON.stringify(event, null, 2));
  
  // Extract operation info
  const { typeName, fieldName, arguments: args } = event;
  const operation = typeName && fieldName ? `${typeName}.${fieldName}` : 'DirectInvoke';
  
  // Initialize monitoring
  const entityId = args?.input?.entityId || event?.input?.entityId || null;
  const monitoring = new LambdaMonitoring('gameDataEnricher', entityId);
  monitoring.trackOperation('HANDLER_START', 'Handler', operation);
  
  try {
    // Determine input source (GraphQL vs direct invoke)
    let input;
    
    if (args?.input) {
      // GraphQL invocation
      input = args.input;
    } else if (event.input) {
      // Direct Lambda invocation
      input = event.input;
    } else if (event.game && event.entityId) {
      // Legacy/simplified invocation format
      input = {
        game: event.game,
        entityId: event.entityId,
        venue: event.venue,
        series: event.series,
        options: event.options
      };
    } else {
      throw new Error('Invalid input format. Expected input.game and input.entityId');
    }
    
    // Validate required fields
    if (!input.game) {
      throw new Error('game is required');
    }
    if (!input.entityId) {
      throw new Error('entityId is required');
    }
    
    // Handle different operations
    let result;
    
    switch (operation) {
      case 'Mutation.enrichGameData':
      case 'Query.previewEnrichment':
      case 'DirectInvoke':
        result = await enrichGameData(input);
        break;
        
      default:
        // Default to enrichment
        console.log(`[ENRICHER] Unknown operation "${operation}", treating as enrichment`);
        result = await enrichGameData(input);
    }
    
    // Track completion
    trackEnrichmentComplete(monitoring, result);
    monitoring.trackOperation('HANDLER_SUCCESS', 'Handler', operation, {
      success: result.success,
      isValid: result.validation?.isValid,
      seriesResolved: !!result.enrichedGame?.tournamentSeriesId,
      recurringResolved: !!result.enrichedGame?.recurringGameId,
      processingTimeMs: result.enrichmentMetadata?.processingTimeMs
    });
    
    return result;
    
  } catch (error) {
    console.error('[ENRICHER] Handler error:', error);
    monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', {
      error: error.message
    });
    
    // Return error in consistent format
    return {
      success: false,
      validation: {
        isValid: false,
        errors: [{
          field: '_system',
          message: error.message,
          code: 'HANDLER_ERROR'
        }],
        warnings: []
      },
      enrichedGame: null,
      enrichmentMetadata: {
        seriesResolution: null,
        recurringResolution: null,
        venueResolution: null,
        queryKeysGenerated: false,
        financialsCalculated: false,
        fieldsCompleted: [],
        processingTimeMs: 0
      }
    };
    
  } finally {
    await monitoring.flush();
  }
};

// ===================================================================
// UTILITY EXPORTS (for testing)
// ===================================================================

module.exports.enrichGameData = enrichGameData;
