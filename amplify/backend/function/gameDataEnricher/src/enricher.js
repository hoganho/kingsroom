/**
 * enricher.js
 * Main enrichment orchestration
 * 
 * UPDATED: v2.2.0
 * - Added Step 4b: Satellite Resolution (isSatellite detection and target linking)
 * 
 * v2.1.0:
 * - Added Step 2c: Duration Completion (gameEndDateTime calculation)
 * - Added gameActualStartDateTime support for accurate duration calculations
 * 
 * v2.0.0:
 * - Added classification field derivation (variant, bettingStructure, buyInTier, sessionMode)
 * - Uses entryStructure (not tournamentStructure) to avoid @model conflict
 * - Uses cashRakeType (not rakeStructure) to avoid @model conflict
 * 
 * This is the core of the enricher - it coordinates:
 * 1. Validation
 * 2. Data completion
 * 2b. Classification derivation
 * 2c. Duration completion
 * 3. Venue resolution
 * 4. Series resolution
 * 4b. Satellite resolution (NEW)
 * 5. Recurring game resolution
 * 6. Query key computation
 * 7. Financial calculations (with guarantee inference from prizepoolPaid)
 * 8. (Optional) Save to database via saveGameFunction
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { validateGameData } = require('./validation');
const { completeData, completeSeriesMetadata } = require('./completion/data-completion');
const { completeDurationFields } = require('./completion/duration-completion');
const { resolveVenue, getVenueFee } = require('./resolution/venue-resolver');
const { resolveSeriesAssignment } = require('./resolution/series-resolver');
const { resolveSatellite } = require('./resolution/satellite-resolver');
const { resolveRecurringAssignment } = require('./resolution/recurring-resolver');
const { computeQueryKeys } = require('./computation/query-keys');
const { calculateFinancials } = require('./computation/financials');

// Classification derivation utilities
const { 
  VARIANT_MAPPING, 
  getNewVariantFromOld, 
  deriveBuyInTier,
  SessionMode,
  ClassificationSource,
  PokerVariant,
  BettingStructure
} = require('./utils/constants');

// Lambda client for invoking saveGameFunction
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

// ===================================================================
// CLASSIFICATION DERIVATION
// ===================================================================

/**
 * Derive classification fields from existing game data
 * Only sets fields that are not already present (preserves scraper values)
 * 
 * @param {Object} game - Game data with at least gameVariant, gameType, buyIn
 * @returns {Object} Object with derived classification fields to merge
 */
const deriveClassificationFields = (game) => {
  const updates = {};
  
  // --- Session Mode (from gameType) ---
  if (!game.sessionMode && game.gameType) {
    updates.sessionMode = game.gameType === 'CASH_GAME' ? SessionMode.CASH : SessionMode.TOURNAMENT;
  }
  
  // --- Variant + Betting Structure (from gameVariant) ---
  if (game.gameVariant && (!game.variant || !game.bettingStructure)) {
    const mapping = VARIANT_MAPPING[game.gameVariant];
    if (mapping) {
      if (!game.variant) {
        updates.variant = mapping.variant;
      }
      if (!game.bettingStructure && mapping.bettingStructure) {
        updates.bettingStructure = mapping.bettingStructure;
      }
    } else {
      // Fallback for unknown variants
      if (!game.variant) {
        updates.variant = PokerVariant.OTHER;
      }
    }
  }
  
  // --- Buy-In Tier (from buyIn amount) ---
  if (!game.buyInTier && game.buyIn !== undefined) {
    updates.buyInTier = deriveBuyInTier(game.buyIn);
  }
  
  // --- Classification Source ---
  // Set to DERIVED if we're deriving any fields and source not already set
  if (!game.classificationSource && Object.keys(updates).length > 0) {
    updates.classificationSource = ClassificationSource.DERIVED;
    updates.lastClassifiedAt = new Date().toISOString();
  }
  
  // --- Default Values for Tournament Games ---
  if (game.gameType === 'TOURNAMENT' || game.sessionMode === 'TOURNAMENT') {
    // Only set defaults if not already present (from scraper)
    if (!game.bountyType && !updates.bountyType) {
      // Don't default bountyType - let it stay null if not detected
    }
    if (!game.speedType && !updates.speedType) {
      // Don't default speedType - let it stay null if not detected
    }
    if (!game.entryStructure && !updates.entryStructure) {
      // Don't default entryStructure - let it stay null if not detected
    }
  }
  
  return updates;
};

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
 * @param {boolean} input.options.skipSatelliteResolution - If true, skip satellite detection
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
      satelliteResolution: null,
      recurringResolution: null,
      venueResolution: null,
      queryKeysGenerated: false,
      financialsCalculated: false,
      guaranteeWasInferred: false,
      durationCompleted: false,
      endTimeCalculated: false,
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
    if (enrichedGame.gameType === 'TOURNAMENT') {
      const seriesMetadata = completeSeriesMetadata(enrichedGame);
      enrichedGame = { ...enrichedGame, ...seriesMetadata };
      if (Object.keys(seriesMetadata).length > 0) {
        result.enrichmentMetadata.fieldsCompleted.push(...Object.keys(seriesMetadata));
      }
    }
    
    // =========================================================
    // 2b. CLASSIFICATION DERIVATION
    // =========================================================
    // Derive classification fields if not already set by scraper
    console.log('[ENRICHER] Step 2b: Classification derivation');
    
    const classificationUpdates = deriveClassificationFields(enrichedGame);
    if (Object.keys(classificationUpdates).length > 0) {
      enrichedGame = { ...enrichedGame, ...classificationUpdates };
      result.enrichmentMetadata.fieldsCompleted.push(...Object.keys(classificationUpdates));
      console.log(`[ENRICHER] Derived ${Object.keys(classificationUpdates).length} classification fields:`, 
        Object.keys(classificationUpdates).join(', '));
    }
    
    // =========================================================
    // 2c. DURATION COMPLETION
    // =========================================================
    // Normalize duration and calculate gameEndDateTime if missing
    console.log('[ENRICHER] Step 2c: Duration completion');
    
    const durationResult = completeDurationFields(enrichedGame);
    
    if (durationResult.updates && Object.keys(durationResult.updates).length > 0) {
      enrichedGame = { ...enrichedGame, ...durationResult.updates };
      result.enrichmentMetadata.fieldsCompleted.push(...durationResult.fieldsCompleted);
      
      // Track what was done
      if (durationResult.fieldsCompleted.includes('totalDuration')) {
        result.enrichmentMetadata.durationCompleted = true;
      }
      if (durationResult.fieldsCompleted.includes('gameEndDateTime')) {
        result.enrichmentMetadata.endTimeCalculated = true;
      }
      
      console.log(`[ENRICHER] Duration completion: ${durationResult.fieldsCompleted.join(', ')}`);
    }
    
    // Add any duration warnings to validation warnings
    if (durationResult.warnings && durationResult.warnings.length > 0) {
      result.validation.warnings.push(...durationResult.warnings);
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
    const shouldAttemptSeriesResolution = 
      !options.skipSeriesResolution && 
      enrichedGame.gameType === 'TOURNAMENT';
    
    if (shouldAttemptSeriesResolution) {
      console.log('[ENRICHER] Step 4: Series resolution (checking all tournaments)');
      
      // Get venues for name cleanup (optional but improves matching)
      const venues = result.enrichmentMetadata.venueResolution?.venueId 
        ? [{ id: result.enrichmentMetadata.venueResolution.venueId, 
             name: result.enrichmentMetadata.venueResolution.venueName }]
        : [];
      
      const seriesResult = await resolveSeriesAssignment({
        game: enrichedGame,
        entityId,
        seriesInput: series || {},
        autoCreate: options.autoCreateSeries !== false,
        venues  // Pass venues for better name matching
      });
      
      // Apply series updates to game (including isSeries determination)
      enrichedGame = { ...enrichedGame, ...seriesResult.gameUpdates };
      result.enrichmentMetadata.seriesResolution = seriesResult.metadata;
      
      // Log the result
      if (enrichedGame.isSeries) {
        console.log(`[ENRICHER] ✅ Series detected: ${enrichedGame.seriesName || 'unknown'}`, {
          status: enrichedGame.seriesAssignmentStatus,
          tournamentSeriesId: enrichedGame.tournamentSeriesId,
          dayNumber: enrichedGame.dayNumber,
          flightLetter: enrichedGame.flightLetter,
          eventNumber: enrichedGame.eventNumber
        });
      } else {
        console.log('[ENRICHER] No series detected for this tournament');
      }
      
    } else if (options.skipSeriesResolution) {
      console.log('[ENRICHER] Step 4: Series resolution SKIPPED (disabled by option)');
      result.enrichmentMetadata.seriesResolution = {
        status: 'SKIPPED',
        confidence: 0,
        wasCreated: false,
        matchReason: 'option_disabled'
      };
    } else {
      // Not a tournament - skip series resolution
      console.log('[ENRICHER] Step 4: Series resolution SKIPPED (not a tournament)');
      result.enrichmentMetadata.seriesResolution = {
        status: 'SKIPPED',
        confidence: 0,
        wasCreated: false,
        matchReason: 'not_tournament'
      };
    }
    
    // =========================================================
    // 4b. SATELLITE RESOLUTION
    // =========================================================
    // Detect if game is a satellite and link to target series
    // Note: isSatellite is orthogonal to isSeries - a game can be both
    // (part of a series AND a satellite feeding into an event)
    if (enrichedGame.gameType === 'TOURNAMENT' && !options.skipSatelliteResolution) {
      console.log('[ENRICHER] Step 4b: Satellite resolution');
      
      try {
        const satelliteResult = await resolveSatellite({
          game: enrichedGame,
          venueId: enrichedGame.venueId,
          autoLink: true
        });
        
        // Apply satellite updates
        if (satelliteResult.gameUpdates) {
          enrichedGame = { ...enrichedGame, ...satelliteResult.gameUpdates };
        }
        
        // Store satellite metadata
        result.enrichmentMetadata.satelliteResolution = satelliteResult.metadata;
        
        // Log satellite detection
        if (enrichedGame.isSatellite) {
          console.log('[ENRICHER] ✅ Satellite detected:', {
            isSatellite: true,
            tournamentPurpose: enrichedGame.tournamentPurpose,
            targetSeries: satelliteResult.metadata?.linkedSeries?.seriesName || 'none',
            seatsAwarded: enrichedGame.satelliteSeatsAwarded || 'unknown',
            seatRatio: enrichedGame.satelliteSeatRatio || null
          });
        } else {
          console.log('[ENRICHER] Not a satellite tournament');
        }
        
      } catch (satError) {
        console.error('[ENRICHER] Satellite resolution error:', satError);
        result.validation.warnings.push({
          field: 'isSatellite',
          message: `Satellite resolution failed: ${satError.message}`,
          code: 'SATELLITE_RESOLUTION_ERROR'
        });
        result.enrichmentMetadata.satelliteResolution = {
          status: 'ERROR',
          error: satError.message
        };
      }
    } else if (options.skipSatelliteResolution) {
      console.log('[ENRICHER] Step 4b: Satellite resolution SKIPPED (disabled by option)');
      result.enrichmentMetadata.satelliteResolution = {
        status: 'SKIPPED',
        matchReason: 'option_disabled'
      };
    } else {
      console.log('[ENRICHER] Step 4b: Satellite resolution SKIPPED (not a tournament)');
      result.enrichmentMetadata.satelliteResolution = {
        status: 'SKIPPED',
        matchReason: 'not_tournament'
      };
    }
    
    // =========================================================
    // 5. RECURRING GAME RESOLUTION
    // =========================================================
    // Note: Satellites CAN be recurring (e.g., "Thursday Colossus Satty")
    // so we don't skip recurring resolution for satellites
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
    // 5b. ACCUMULATOR TICKET CALCULATION (after recurring resolution)
    // =========================================================
    const totalEntries = enrichedGame.totalEntries || 0;
    
    // Only calculate accumulator tickets if the recurring game has them enabled
    if (enrichedGame.hasAccumulatorTickets && totalEntries > 0) {
      // Calculate number of accumulator tickets (10% of entries, floored)
      if (!enrichedGame.numberOfAccumulatorTicketsPaid) {
        enrichedGame.numberOfAccumulatorTicketsPaid = Math.floor(totalEntries * 0.10);
        result.enrichmentMetadata.fieldsCompleted.push('numberOfAccumulatorTicketsPaid');
      }
      console.log(`[ENRICHER] Accumulator tickets: ${enrichedGame.numberOfAccumulatorTicketsPaid} @ $${enrichedGame.accumulatorTicketValue}`);
    } else {
      // No accumulator tickets for this game
      enrichedGame.numberOfAccumulatorTicketsPaid = 0;
    }
    
    // =========================================================
    // 5c. isRegular FINALIZATION (ensures mutual exclusivity)
    // =========================================================
    // RULE: A game is either a SERIES game OR a REGULAR (recurring) game, never both
    // - isSeries=true + isRegular=false → Series game (part of tournament series)
    // - isSeries=false + isRegular=true → Regular game (recurring weekly/daily game)
    // - isSeries=false + isRegular=false → One-off game (neither series nor recurring)
    // Note: isSatellite is orthogonal - a satellite can be series, regular, or one-off
    
    console.log('[ENRICHER] Step 5c: isRegular finalization');
    
    if (enrichedGame.isSeries === true) {
      // Series games are NEVER regular games
      if (enrichedGame.isRegular !== false) {
        enrichedGame.isRegular = false;
        console.log('[ENRICHER] → Set isRegular=false (game is part of a series)');
      }
    } else if (enrichedGame.recurringGameId) {
      // Games matched to a recurring game ARE regular games
      if (enrichedGame.isRegular !== true) {
        enrichedGame.isRegular = true;
        console.log('[ENRICHER] → Set isRegular=true (matched to recurring game)');
      }
    } else {
      // Neither series nor recurring - this is a one-off game
      // Leave isRegular as false (or set it explicitly)
      if (enrichedGame.isRegular === undefined || enrichedGame.isRegular === null) {
        enrichedGame.isRegular = false;
        console.log('[ENRICHER] → Set isRegular=false (one-off game, not recurring)');
      }
    }
    
    // Log final classification
    console.log(`[ENRICHER] Game classification: isSeries=${enrichedGame.isSeries}, isSatellite=${enrichedGame.isSatellite || false}, isRegular=${enrichedGame.isRegular}, recurringGameId=${enrichedGame.recurringGameId || 'none'}, tournamentSeriesId=${enrichedGame.tournamentSeriesId || 'none'}`);
    
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
    // 7. FINANCIAL CALCULATIONS (ENHANCED)
    // =========================================================
    if (!options.skipFinancials) {
      console.log('[ENRICHER] Step 7: Financial calculations');
      
      // Store original guarantee state for comparison
      const hadGuaranteeBefore = enrichedGame.hasGuarantee === true && enrichedGame.guaranteeAmount > 0;
      
      // Calculate financials (includes guarantee inference from prizepoolPaid)
      const financials = calculateFinancials(enrichedGame);
      
      // Apply all financial fields
      enrichedGame.totalEntries = financials.totalEntries ?? enrichedGame.totalEntries;
      enrichedGame.rakeRevenue = financials.rakeRevenue;
      enrichedGame.totalBuyInsCollected = financials.totalBuyInsCollected;
      enrichedGame.prizepoolPlayerContributions = financials.prizepoolPlayerContributions;
      enrichedGame.guaranteeOverlayCost = financials.guaranteeOverlayCost;
      enrichedGame.prizepoolAddedValue = financials.prizepoolAddedValue;
      enrichedGame.prizepoolSurplus = financials.prizepoolSurplus;
      enrichedGame.gameProfit = financials.gameProfit;
      
      // Apply calculated prizepool if returned
      if (financials.prizepoolCalculated !== undefined) {
        enrichedGame.prizepoolCalculated = financials.prizepoolCalculated;
      }
      
      // =====================================================
      // CRITICAL: Apply inferred guarantee back to game data
      // =====================================================
      if (financials.guaranteeWasInferred) {
        console.log(`[ENRICHER] 💡 Guarantee INFERRED from prizepoolPaid:`, {
          prizepoolPaid: enrichedGame.prizepoolPaid,
          prizepoolPlayerContributions: financials.prizepoolPlayerContributions,
          inferredGuarantee: financials.guaranteeAmount,
          inferredOverlay: financials.guaranteeOverlayCost,
          gameProfit: financials.gameProfit
        });
        
        // Apply inferred guarantee to game data
        enrichedGame.hasGuarantee = true;
        enrichedGame.guaranteeAmount = financials.guaranteeAmount;
        
        // Track in metadata
        result.enrichmentMetadata.guaranteeWasInferred = true;
        result.enrichmentMetadata.fieldsCompleted.push('hasGuarantee', 'guaranteeAmount');
        
        // Add warning so user knows this was inferred
        result.validation.warnings.push({
          field: 'guaranteeAmount',
          message: `Guarantee of $${financials.guaranteeAmount} inferred from prizepoolPaid ($${enrichedGame.prizepoolPaid}) exceeding player contributions ($${financials.prizepoolPlayerContributions}). Overlay cost: $${financials.guaranteeOverlayCost}`,
          code: 'GUARANTEE_INFERRED'
        });
      }
      
      result.enrichmentMetadata.financialsCalculated = true;
      
      // Log financial summary
      console.log('[ENRICHER] Financial summary:', {
        hasGuarantee: enrichedGame.hasGuarantee,
        guaranteeAmount: enrichedGame.guaranteeAmount,
        prizepoolPlayerContributions: enrichedGame.prizepoolPlayerContributions,
        prizepoolPaid: enrichedGame.prizepoolPaid,
        guaranteeOverlayCost: enrichedGame.guaranteeOverlayCost,
        rakeRevenue: enrichedGame.rakeRevenue,
        gameProfit: enrichedGame.gameProfit,
        isUnderwater: enrichedGame.gameProfit < 0,
        wasInferred: financials.guaranteeWasInferred || false
      });
      
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
  invokeSaveGameFunction,
  deriveClassificationFields
};