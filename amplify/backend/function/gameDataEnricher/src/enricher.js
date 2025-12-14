/**
 * enricher.js
 * Main enrichment orchestration
 * 
 * This is the core of the enricher - it coordinates:
 * 1. Validation
 * 2. Data completion
 * 3. Venue resolution
 * 4. Series resolution
 * 5. Recurring game resolution
 * 6. Query key computation
 * 7. Financial calculations
 * 8. (Optional) Save to database via saveGameFunction
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { validateGameData } = require('./validation');
const { completeData, completeSeriesMetadata } = require('./completion/data-completion');
const { resolveVenue, getVenueFee } = require('./resolution/venue-resolver');
const { resolveSeriesAssignment } = require('./resolution/series-resolver');
const { resolveRecurringAssignment } = require('./resolution/recurring-resolver');
const { computeQueryKeys } = require('./computation/query-keys');
const { calculateFinancials } = require('./computation/financials');

// Lambda client for invoking saveGameFunction
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

// ===================================================================
// MAIN ENRICHMENT FUNCTION
// ===================================================================

/**
 * Enrich game data - the main entry point
 * 
 * @param {Object} input - EnrichGameDataInput
 * @param {Object} input.game - Game data to enrich
 * @param {string} input.entityId - Entity ID (required)
 * @param {Object} input.source - Source info (type, sourceId, wasEdited) for save
 * @param {Object} input.venue - Venue input for resolution
 * @param {Object} input.series - Series input for resolution
 * @param {Object} input.players - Player data to pass to saveGameFunction
 * @param {Object} input.options - Enrichment options
 * @param {boolean} input.options.saveToDatabase - If true, invoke saveGameFunction after enrichment
 * @returns {Object} EnrichGameDataOutput
 */
const enrichGameData = async (input) => {
  const startTime = Date.now();
  const { game, entityId, source, venue, series, players, options = {} } = input;
  
  // Initialize result structure
  const result = {
    success: false,
    validation: { isValid: false, errors: [], warnings: [] },
    enrichedGame: null,
    enrichmentMetadata: {
      seriesResolution: null,
      recurringResolution: null,
      venueResolution: null,
      queryKeysGenerated: false,
      financialsCalculated: false,
      fieldsCompleted: [],
      processingTimeMs: 0
    },
    saveResult: null  // Populated when options.saveToDatabase is true
  };
  
  try {
    // =========================================================
    // 1. VALIDATION
    // =========================================================
    console.log('[ENRICHER] Step 1: Validation');
    
    const validation = validateGameData(game, entityId);
    result.validation = {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings
    };
    
    // If validation failed with errors, return early
    if (!validation.isValid) {
      console.log('[ENRICHER] Validation failed:', validation.errors);
      result.enrichmentMetadata.processingTimeMs = Date.now() - startTime;
      return result;
    }
    
    // Start with validated/corrected data
    let enrichedGame = { ...validation.correctedData };
    
    // =========================================================
    // 2. DATA COMPLETION
    // =========================================================
    console.log('[ENRICHER] Step 2: Data completion');
    
    const completionResult = completeData(enrichedGame);
    enrichedGame = { ...enrichedGame, ...completionResult.data };
    result.enrichmentMetadata.fieldsCompleted = completionResult.fieldsCompleted;
    
    // Complete series metadata from name parsing
    if (enrichedGame.isSeries || series) {
      const seriesMetadata = completeSeriesMetadata(enrichedGame);
      enrichedGame = { ...enrichedGame, ...seriesMetadata };
      if (Object.keys(seriesMetadata).length > 0) {
        result.enrichmentMetadata.fieldsCompleted.push(...Object.keys(seriesMetadata));
      }
    }
    
    // =========================================================
    // 3. VENUE RESOLUTION
    // =========================================================
    console.log('[ENRICHER] Step 3: Venue resolution');
    
    if (venue || !enrichedGame.venueId) {
      const venueResult = await resolveVenue(venue, entityId);
      
      if (venueResult.venueId) {
        enrichedGame.venueId = venueResult.venueId;
        enrichedGame.venueAssignmentStatus = venueResult.status;
        enrichedGame.venueAssignmentConfidence = venueResult.confidence;
        
        // Get venue fee if we have a venue
        if (!enrichedGame.venueFee) {
          const venueFee = await getVenueFee(venueResult.venueId);
          if (venueFee !== null) {
            enrichedGame.venueFee = venueFee;
            result.enrichmentMetadata.fieldsCompleted.push('venueFee');
          }
        }
      } else if (venueResult.suggestedVenueName) {
        enrichedGame.suggestedVenueName = venueResult.suggestedVenueName;
        enrichedGame.venueAssignmentStatus = venueResult.status;
      }
      
      result.enrichmentMetadata.venueResolution = {
        status: venueResult.status,
        venueId: venueResult.venueId,
        venueName: venueResult.venueName,
        venueFee: enrichedGame.venueFee || null,
        confidence: venueResult.confidence,
        matchReason: venueResult.matchReason
      };
    }
    
    // =========================================================
    // 4. SERIES RESOLUTION
    // =========================================================
    if (!options.skipSeriesResolution && (enrichedGame.isSeries || series)) {
      console.log('[ENRICHER] Step 4: Series resolution');
      
      const seriesResult = await resolveSeriesAssignment({
        game: enrichedGame,
        entityId,
        seriesInput: series || {},
        autoCreate: options.autoCreateSeries !== false
      });
      
      // Apply series updates to game
      enrichedGame = { ...enrichedGame, ...seriesResult.gameUpdates };
      result.enrichmentMetadata.seriesResolution = seriesResult.metadata;
    } else {
      console.log('[ENRICHER] Step 4: Series resolution SKIPPED');
      result.enrichmentMetadata.seriesResolution = {
        status: 'SKIPPED',
        confidence: 0,
        wasCreated: false,
        matchReason: options.skipSeriesResolution ? 'option_disabled' : 'not_series'
      };
    }
    
    // =========================================================
    // 5. RECURRING GAME RESOLUTION
    // =========================================================
    if (!options.skipRecurringResolution && enrichedGame.venueId && !enrichedGame.isSeries) {
    console.log('[ENRICHER] Step 5: Recurring game resolution');
    
    const recurringResult = await resolveRecurringAssignment({
        game: enrichedGame,
        entityId,
        autoCreate: options.autoCreateRecurring === true
    });
    
    // Apply recurring updates to game
    enrichedGame = { ...enrichedGame, ...recurringResult.gameUpdates };
    result.enrichmentMetadata.recurringResolution = recurringResult.metadata;
    
    // Track inherited fields (e.g., guaranteeAmount from typicalGuarantee)
    if (recurringResult.metadata.inheritedFields && recurringResult.metadata.inheritedFields.length > 0) {
        result.enrichmentMetadata.fieldsCompleted.push(...recurringResult.metadata.inheritedFields);
        console.log(`[ENRICHER] Inherited ${recurringResult.metadata.inheritedFields.length} fields from recurring template: ${recurringResult.metadata.inheritedFields.join(', ')}`);
    }
    } else {
    console.log('[ENRICHER] Step 5: Recurring game resolution SKIPPED');
    result.enrichmentMetadata.recurringResolution = {
        status: 'SKIPPED',
        confidence: 0,
        wasCreated: false,
        inheritedFields: [],
        matchReason: options.skipRecurringResolution ? 'option_disabled' : 
                    enrichedGame.isSeries ? 'is_series' : 'no_venue'
    };
    }
    
    // =========================================================
    // 6. QUERY KEY COMPUTATION
    // =========================================================
    if (!options.skipQueryKeys) {
      console.log('[ENRICHER] Step 6: Query key computation');
      
      const queryKeys = computeQueryKeys(enrichedGame, entityId);
      enrichedGame = { ...enrichedGame, ...queryKeys };
      result.enrichmentMetadata.queryKeysGenerated = true;
    } else {
      console.log('[ENRICHER] Step 6: Query key computation SKIPPED');
    }
    
    // =========================================================
    // 7. FINANCIAL CALCULATIONS
    // =========================================================
    if (!options.skipFinancials) {
      console.log('[ENRICHER] Step 7: Financial calculations');
      
      const financials = calculateFinancials(enrichedGame);
      enrichedGame = { ...enrichedGame, ...financials };
      result.enrichmentMetadata.financialsCalculated = true;
    } else {
      console.log('[ENRICHER] Step 7: Financial calculations SKIPPED');
    }
    
    // =========================================================
    // 8. SAVE TO DATABASE (Optional)
    // =========================================================
    result.success = true;
    result.enrichedGame = enrichedGame;
    
    if (options.saveToDatabase) {
      console.log('[ENRICHER] Step 8: Saving to database via saveGameFunction');
      
      try {
        const saveResult = await invokeSaveGameFunction({
          source: {
            type: source?.type || 'SCRAPE',
            sourceId: source?.sourceId,
            entityId,
            wasEdited: source?.wasEdited || false
          },
          game: enrichedGame,
          venue: {
            venueId: enrichedGame.venueId,
            venueName: result.enrichmentMetadata.venueResolution?.venueName,
            confidence: result.enrichmentMetadata.venueResolution?.confidence
          },
          series: enrichedGame.isSeries ? {
            tournamentSeriesId: enrichedGame.tournamentSeriesId,
            seriesName: enrichedGame.seriesName
          } : null,
          players: players || null,
          options: {
            forceUpdate: options.forceUpdate || false
          }
        });
        
        result.saveResult = saveResult;
        
        if (!saveResult.success) {
          console.error('[ENRICHER] Save failed:', saveResult.message);
          result.validation.warnings.push({
            field: '_save',
            message: `Save failed: ${saveResult.message}`,
            code: 'SAVE_FAILED'
          });
        } else {
          console.log(`[ENRICHER] Save successful: ${saveResult.action} (gameId: ${saveResult.gameId})`);
        }
        
      } catch (saveError) {
        console.error('[ENRICHER] Error invoking saveGameFunction:', saveError);
        result.saveResult = {
          success: false,
          action: 'ERROR',
          message: saveError.message
        };
        result.validation.warnings.push({
          field: '_save',
          message: `Save error: ${saveError.message}`,
          code: 'SAVE_ERROR'
        });
      }
    } else {
      console.log('[ENRICHER] Step 8: Save to database SKIPPED (preview mode)');
      result.saveResult = null;
    }
    
    // =========================================================
    // 9. FINAL RESULT
    // =========================================================
    console.log('[ENRICHER] Enrichment complete');
    
    result.enrichmentMetadata.processingTimeMs = Date.now() - startTime;
    
    return result;
    
  } catch (error) {
    console.error('[ENRICHER] Error during enrichment:', error);
    
    result.validation.errors.push({
      field: '_system',
      message: error.message,
      code: 'ENRICHMENT_ERROR'
    });
    result.enrichmentMetadata.processingTimeMs = Date.now() - startTime;
    
    return result;
  }
};

// ===================================================================
// SAVE GAME FUNCTION INVOCATION
// ===================================================================

/**
 * Invoke saveGameFunction Lambda to persist the enriched data
 * 
 * @param {Object} saveInput - Input for saveGameFunction
 * @returns {Object} Save result from saveGameFunction
 */
const invokeSaveGameFunction = async (saveInput) => {
  const functionName = process.env.FUNCTION_SAVEGAMEFUNCTION_NAME || 
                       `saveGameFunction-${process.env.ENV || 'dev'}`;
  
  console.log(`[ENRICHER] Invoking ${functionName}`);
  
  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      typeName: 'Mutation',
      fieldName: 'saveGame',
      arguments: { input: saveInput }
    })
  }));
  
  // Parse response
  const payloadString = new TextDecoder().decode(response.Payload);
  const result = JSON.parse(payloadString);
  
  // Check for Lambda-level errors
  if (response.FunctionError) {
    console.error('[ENRICHER] saveGameFunction error:', result);
    throw new Error(result.errorMessage || 'saveGameFunction invocation failed');
  }
  
  return result;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  enrichGameData,
  invokeSaveGameFunction
};
