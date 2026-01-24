/**
 * Reconciliation Operations
 * Version: 3.0.0
 * 
 * Handles ticket reconciliation between social post extractions and game records:
 * - Compare extracted ticket/prize data with Game fields
 * - Generate reconciliation reports
 * - Optionally apply extracted values to Game records
 */

const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');

const dynamoDB = DynamoDBDocument.from(new DynamoDB({}));

// Table names from environment
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const SOCIAL_POST_GAME_DATA_TABLE = process.env.API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME;
const SOCIAL_POST_PLACEMENT_TABLE = process.env.API_KINGSROOM_SOCIALPOSTPLACEMENTTABLE_NAME;
const SOCIAL_POST_GAME_LINK_TABLE = process.env.API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME;

/**
 * Get game by ID
 */
async function getGame(gameId) {
  if (!gameId) return null;
  
  try {
    const result = await dynamoDB.get({
      TableName: GAME_TABLE,
      Key: { id: gameId }
    });
    return result.Item || null;
  } catch (error) {
    console.error('[RECONCILIATION] Error getting game:', error);
    return null;
  }
}

/**
 * Get SocialPostGameData by ID
 */
async function getSocialPostGameData(id) {
  if (!id) return null;
  
  try {
    const result = await dynamoDB.get({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      Key: { id }
    });
    return result.Item || null;
  } catch (error) {
    console.error('[RECONCILIATION] Error getting extraction data:', error);
    return null;
  }
}

/**
 * Preview reconciliation for a single post/game pair
 * 
 * Compares extracted data from social post with game record values
 * 
 * @param {string} socialPostGameDataId - Extraction record ID
 * @param {string} gameId - Game ID to compare against
 * @returns {Object} - SocialToGameReconciliation
 */
async function previewReconciliation(socialPostGameDataId, gameId) {
  console.log('[RECONCILIATION] previewReconciliation called:', { socialPostGameDataId, gameId });
  
  try {
    // Get both records
    const [extraction, game] = await Promise.all([
      getSocialPostGameData(socialPostGameDataId),
      getGame(gameId)
    ]);
    
    if (!extraction) {
      throw new Error(`Extraction not found: ${socialPostGameDataId}`);
    }
    
    if (!game) {
      throw new Error(`Game not found: ${gameId}`);
    }
    
    // === SOCIAL POST EXTRACTED VALUES ===
    const social_totalCashPaid = extraction.totalCashPaid || 0;
    const social_totalTicketCount = extraction.totalTicketsExtracted || 0;
    const social_totalTicketValue = extraction.totalTicketValue || 0;
    
    // Parse ticket breakdown for accumulator count
    let social_accumulatorCount = 0;
    let social_accumulatorValue = 0;
    
    if (extraction.ticketCountByType) {
      const ticketCounts = typeof extraction.ticketCountByType === 'string' 
        ? JSON.parse(extraction.ticketCountByType) 
        : extraction.ticketCountByType;
      social_accumulatorCount = ticketCounts.ACCUMULATOR_TICKET || 0;
    }
    
    if (extraction.ticketValueByType) {
      const ticketValues = typeof extraction.ticketValueByType === 'string'
        ? JSON.parse(extraction.ticketValueByType)
        : extraction.ticketValueByType;
      social_accumulatorValue = ticketValues.ACCUMULATOR_TICKET || 0;
    }
    
    const social_totalPlacements = extraction.placementCount || 0;
    const social_prizepoolTotal = social_totalCashPaid + social_totalTicketValue;
    
    // === GAME RECORD VALUES ===
    const game_prizepoolPaid = game.prizepoolPaid || 0;
    const game_numberOfAccumulatorTicketsPaid = game.numberOfAccumulatorTicketsPaid || 0;
    const game_accumulatorTicketValue = game.accumulatorTicketValue || 0;
    const game_totalEntries = game.totalEntries || 0;
    const game_hasAccumulatorTickets = game.hasAccumulatorTickets || false;
    
    // === CALCULATE DISCREPANCIES ===
    const cashDifference = social_totalCashPaid - game_prizepoolPaid;
    const ticketCountDifference = social_accumulatorCount - game_numberOfAccumulatorTicketsPaid;
    const ticketValueDifference = social_accumulatorValue - (game_numberOfAccumulatorTicketsPaid * game_accumulatorTicketValue);
    
    // Determine if there's a meaningful discrepancy
    const CASH_TOLERANCE = 1; // $1 tolerance for rounding
    const hasDiscrepancy = 
      Math.abs(cashDifference) > CASH_TOLERANCE ||
      ticketCountDifference !== 0 ||
      Math.abs(ticketValueDifference) > CASH_TOLERANCE;
    
    // Determine severity
    let discrepancySeverity = 'NONE';
    const discrepancyNotes = [];
    
    if (hasDiscrepancy) {
      if (Math.abs(cashDifference) > 100 || Math.abs(ticketCountDifference) > 2) {
        discrepancySeverity = 'MAJOR';
      } else {
        discrepancySeverity = 'MINOR';
      }
      
      if (Math.abs(cashDifference) > CASH_TOLERANCE) {
        discrepancyNotes.push(`Cash difference: $${cashDifference.toFixed(2)} (social: $${social_totalCashPaid}, game: $${game_prizepoolPaid})`);
      }
      
      if (ticketCountDifference !== 0) {
        discrepancyNotes.push(`Ticket count difference: ${ticketCountDifference} (social: ${social_accumulatorCount}, game: ${game_numberOfAccumulatorTicketsPaid})`);
      }
      
      if (Math.abs(ticketValueDifference) > CASH_TOLERANCE) {
        discrepancyNotes.push(`Ticket value difference: $${ticketValueDifference.toFixed(2)}`);
      }
    }
    
    // Suggest action
    let suggestedAction = 'NONE';
    if (hasDiscrepancy) {
      if (game_prizepoolPaid === 0 && social_totalCashPaid > 0) {
        suggestedAction = 'UPDATE_GAME';
      } else if (discrepancySeverity === 'MAJOR') {
        suggestedAction = 'MANUAL_REVIEW';
      } else {
        suggestedAction = 'VERIFY_GAME';
      }
    }
    
    return {
      socialPostId: extraction.socialPostId,
      socialPostGameDataId,
      gameId,
      gameName: game.name,
      gameDate: game.gameStartDateTime,
      
      // Social values
      social_totalCashPaid,
      social_totalTicketCount,
      social_totalTicketValue,
      social_accumulatorCount,
      social_accumulatorValue,
      social_totalPlacements,
      social_prizepoolTotal,
      
      // Game values
      game_prizepoolPaid,
      game_numberOfAccumulatorTicketsPaid,
      game_accumulatorTicketValue,
      game_totalEntries,
      game_hasAccumulatorTickets,
      
      // Discrepancies
      cashDifference,
      ticketCountDifference,
      ticketValueDifference,
      
      // Status
      hasDiscrepancy,
      discrepancySeverity,
      discrepancyNotes,
      suggestedAction,
      
      reconciledAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[RECONCILIATION] Error in previewReconciliation:', error);
    throw error;
  }
}

/**
 * Apply social post extracted data to Game record
 * 
 * @param {Object} input - Input parameters
 * @returns {Object} - ReconcileResult
 */
async function reconcileSocialToGame(input) {
  console.log('[RECONCILIATION] reconcileSocialToGame called:', JSON.stringify(input, null, 2));
  
  const { socialPostGameDataId, gameId, applyToGame = false, notes } = input;
  
  try {
    // Get reconciliation preview
    const preview = await previewReconciliation(socialPostGameDataId, gameId);
    
    if (!applyToGame) {
      // Just return preview without applying
      return {
        success: true,
        socialPostGameDataId,
        gameId,
        fieldsUpdated: [],
        message: 'Preview only - no changes applied'
      };
    }
    
    // Apply changes to game
    const now = new Date().toISOString();
    const fieldsUpdated = [];
    const previousValues = {};
    const newValues = {};
    
    const updateExpressions = [];
    const expressionValues = {
      ':now': now
    };
    
    // Update prizepool if social has data and game doesn't
    if (preview.social_totalCashPaid > 0 && preview.game_prizepoolPaid === 0) {
      updateExpressions.push('prizepoolPaid = :prizepool');
      expressionValues[':prizepool'] = preview.social_totalCashPaid;
      previousValues.prizepoolPaid = preview.game_prizepoolPaid;
      newValues.prizepoolPaid = preview.social_totalCashPaid;
      fieldsUpdated.push('prizepoolPaid');
    }
    
    // Update accumulator ticket info if social has data
    if (preview.social_accumulatorCount > 0 && preview.game_numberOfAccumulatorTicketsPaid === 0) {
      updateExpressions.push('hasAccumulatorTickets = :hasTickets');
      updateExpressions.push('numberOfAccumulatorTicketsPaid = :ticketCount');
      expressionValues[':hasTickets'] = true;
      expressionValues[':ticketCount'] = preview.social_accumulatorCount;
      previousValues.numberOfAccumulatorTicketsPaid = preview.game_numberOfAccumulatorTicketsPaid;
      newValues.numberOfAccumulatorTicketsPaid = preview.social_accumulatorCount;
      fieldsUpdated.push('hasAccumulatorTickets');
      fieldsUpdated.push('numberOfAccumulatorTicketsPaid');
      
      // Calculate per-ticket value if we have total value
      if (preview.social_accumulatorValue > 0) {
        const perTicketValue = preview.social_accumulatorValue / preview.social_accumulatorCount;
        updateExpressions.push('accumulatorTicketValue = :ticketValue');
        expressionValues[':ticketValue'] = perTicketValue;
        previousValues.accumulatorTicketValue = preview.game_accumulatorTicketValue;
        newValues.accumulatorTicketValue = perTicketValue;
        fieldsUpdated.push('accumulatorTicketValue');
      }
    }
    
    if (fieldsUpdated.length === 0) {
      return {
        success: true,
        socialPostGameDataId,
        gameId,
        fieldsUpdated: [],
        message: 'No fields needed updating'
      };
    }
    
    // Add audit trail
    updateExpressions.push('socialDataAggregatedAt = :now');
    updateExpressions.push('updatedAt = :now');
    
    await dynamoDB.update({
      TableName: GAME_TABLE,
      Key: { id: gameId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues
    });
    
    // Mark extraction as reconciled
    await dynamoDB.update({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      Key: { id: socialPostGameDataId },
      UpdateExpression: 'SET reconciliationCheckedAt = :now, reconciliationNotes = :notes, updatedAt = :now',
      ExpressionAttributeValues: {
        ':now': now,
        ':notes': notes || `Applied to game ${gameId}`
      }
    });
    
    return {
      success: true,
      socialPostGameDataId,
      gameId,
      fieldsUpdated,
      previousValues,
      newValues,
      message: `Updated ${fieldsUpdated.length} fields on game`
    };
    
  } catch (error) {
    console.error('[RECONCILIATION] Error in reconcileSocialToGame:', error);
    return {
      success: false,
      socialPostGameDataId,
      gameId,
      error: error.message
    };
  }
}

/**
 * Get ticket extraction data for a specific game
 * 
 * Finds all SocialPostGameData linked to this game
 * 
 * @param {string} gameId - Game ID
 * @returns {Array} - Array of SocialPostGameData
 */
async function getSocialPostTicketsForGame(gameId) {
  console.log('[RECONCILIATION] getSocialPostTicketsForGame called:', gameId);
  
  try {
    // First get all links for this game
    const linksResult = await dynamoDB.query({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      IndexName: 'byGameSocialPostLink',
      KeyConditionExpression: 'gameId = :gameId',
      ExpressionAttributeValues: {
        ':gameId': gameId
      }
    });
    
    const links = linksResult.Items || [];
    
    if (links.length === 0) {
      return [];
    }
    
    // Get extraction data for each linked post
    const extractionIds = links
      .map(link => link.socialPostGameDataId)
      .filter(Boolean);
    
    if (extractionIds.length === 0) {
      // Try to get by socialPostId instead
      const socialPostIds = links.map(link => link.socialPostId);
      
      const extractions = [];
      for (const socialPostId of socialPostIds) {
        const result = await dynamoDB.query({
          TableName: SOCIAL_POST_GAME_DATA_TABLE,
          IndexName: 'bySocialPostExtraction',
          KeyConditionExpression: 'socialPostId = :postId',
          ExpressionAttributeValues: {
            ':postId': socialPostId
          },
          Limit: 1
        });
        
        if (result.Items?.[0]) {
          extractions.push(result.Items[0]);
        }
      }
      
      return extractions;
    }
    
    // Batch get extractions
    const extractions = [];
    for (const id of extractionIds) {
      const extraction = await getSocialPostGameData(id);
      if (extraction) {
        extractions.push(extraction);
      }
    }
    
    return extractions;
    
  } catch (error) {
    console.error('[RECONCILIATION] Error in getSocialPostTicketsForGame:', error);
    return [];
  }
}

/**
 * Get placements for a specific post
 * 
 * @param {string} socialPostId - Social post ID
 * @returns {Array} - Array of SocialPostPlacement
 */
async function getSocialPostPlacements(socialPostId) {
  console.log('[RECONCILIATION] getSocialPostPlacements called:', socialPostId);
  
  try {
    const result = await dynamoDB.query({
      TableName: SOCIAL_POST_PLACEMENT_TABLE,
      IndexName: 'bySocialPostPlacement',
      KeyConditionExpression: 'socialPostId = :postId',
      ExpressionAttributeValues: {
        ':postId': socialPostId
      }
    });
    
    // Sort by place
    const placements = result.Items || [];
    placements.sort((a, b) => (a.place || 0) - (b.place || 0));
    
    return placements;
    
  } catch (error) {
    console.error('[RECONCILIATION] Error in getSocialPostPlacements:', error);
    return [];
  }
}

/**
 * Get reconciliation report comparing social vs game data
 * 
 * @param {Object} input - Filter parameters
 * @returns {Object} - TicketReconciliationReport
 */
async function getTicketReconciliationReport(input = {}) {
  console.log('[RECONCILIATION] getTicketReconciliationReport called:', JSON.stringify(input, null, 2));
  
  const {
    gameId,
    entityId,
    venueId,
    dateFrom,
    dateTo,
    onlyDiscrepancies = false,
    limit = 50,
    nextToken
  } = input;
  
  try {
    // If specific gameId, just get that one
    if (gameId) {
      const extractions = await getSocialPostTicketsForGame(gameId);
      
      if (extractions.length === 0) {
        return {
          totalGamesChecked: 1,
          gamesWithSocialData: 0,
          gamesWithDiscrepancies: 0,
          gamesMatched: 0,
          reconciliations: []
        };
      }
      
      const reconciliation = await previewReconciliation(extractions[0].id, gameId);
      
      return {
        totalGamesChecked: 1,
        gamesWithSocialData: 1,
        gamesWithDiscrepancies: reconciliation.hasDiscrepancy ? 1 : 0,
        gamesMatched: reconciliation.hasDiscrepancy ? 0 : 1,
        totalCashDifference: reconciliation.cashDifference,
        totalTicketCountDifference: reconciliation.ticketCountDifference,
        totalTicketValueDifference: reconciliation.ticketValueDifference,
        reconciliations: [reconciliation]
      };
    }
    
    // Query games with linked social posts
    let filterParts = ['hasLinkedSocialPosts = :true'];
    const expressionValues = { ':true': true };
    
    if (entityId) {
      filterParts.push('entityId = :entityId');
      expressionValues[':entityId'] = entityId;
    }
    
    if (venueId) {
      filterParts.push('venueId = :venueId');
      expressionValues[':venueId'] = venueId;
    }
    
    if (dateFrom) {
      filterParts.push('gameStartDateTime >= :dateFrom');
      expressionValues[':dateFrom'] = dateFrom;
    }
    
    if (dateTo) {
      filterParts.push('gameStartDateTime <= :dateTo');
      expressionValues[':dateTo'] = dateTo;
    }
    
    const scanParams = {
      TableName: GAME_TABLE,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeValues: expressionValues,
      Limit: limit
    };
    
    if (nextToken) {
      scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const result = await dynamoDB.scan(scanParams);
    const games = result.Items || [];
    
    // Build reconciliations
    const reconciliations = [];
    let gamesWithDiscrepancies = 0;
    let gamesMatched = 0;
    let totalCashDifference = 0;
    let totalTicketCountDifference = 0;
    let totalTicketValueDifference = 0;
    
    for (const game of games) {
      const extractions = await getSocialPostTicketsForGame(game.id);
      
      if (extractions.length === 0) continue;
      
      try {
        const reconciliation = await previewReconciliation(extractions[0].id, game.id);
        
        if (onlyDiscrepancies && !reconciliation.hasDiscrepancy) {
          continue;
        }
        
        reconciliations.push(reconciliation);
        
        if (reconciliation.hasDiscrepancy) {
          gamesWithDiscrepancies++;
          totalCashDifference += reconciliation.cashDifference || 0;
          totalTicketCountDifference += reconciliation.ticketCountDifference || 0;
          totalTicketValueDifference += reconciliation.ticketValueDifference || 0;
        } else {
          gamesMatched++;
        }
      } catch (err) {
        console.warn(`[RECONCILIATION] Error processing game ${game.id}:`, err.message);
      }
    }
    
    return {
      totalGamesChecked: games.length,
      gamesWithSocialData: reconciliations.length + (onlyDiscrepancies ? gamesMatched : 0),
      gamesWithDiscrepancies,
      gamesMatched,
      totalCashDifference,
      totalTicketCountDifference,
      totalTicketValueDifference,
      reconciliations,
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null
    };
    
  } catch (error) {
    console.error('[RECONCILIATION] Error in getTicketReconciliationReport:', error);
    return {
      totalGamesChecked: 0,
      gamesWithSocialData: 0,
      gamesWithDiscrepancies: 0,
      gamesMatched: 0,
      reconciliations: []
    };
  }
}

module.exports = {
  previewReconciliation,
  reconcileSocialToGame,
  getSocialPostTicketsForGame,
  getSocialPostPlacements,
  getTicketReconciliationReport
};
