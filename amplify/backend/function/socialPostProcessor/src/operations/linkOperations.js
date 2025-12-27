/**
 * operations/linkOperations.js
 * Manual link management operations
 * 
 * UPDATED: v2.0.0
 * - Added integration with socialDataAggregator Lambda
 * - Link/unlink operations now trigger social data re-aggregation
 * - Verify/reject operations update game social data counts
 */

const { v4: uuidv4 } = require('uuid');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { 
  getSocialPost,
  updateSocialPost,
  getGame,
  getSocialPostGameLink,
  createSocialPostGameLink,
  updateSocialPostGameLink,
  deleteSocialPostGameLink,
  getLinksBySocialPost
} = require('../utils/graphql');

// Lambda client for invoking socialDataAggregator
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'ap-southeast-2'
});

// ===================================================================
// SOCIAL DATA AGGREGATOR INTEGRATION
// ===================================================================

/**
 * Trigger social data aggregation for a game
 * This re-aggregates all linked social post data and updates the Game record
 * 
 * @param {string} gameId - Game ID to aggregate data for
 * @param {Object} options - Aggregation options
 * @returns {Object} Aggregation result
 */
const triggerSocialDataAggregation = async (gameId, options = {}) => {
  const functionName = process.env.FUNCTION_SOCIALDATAAGGREGATOR_NAME || 
                       `socialDataAggregator-${process.env.ENV || 'staging'}`;
  
  console.log(`[LINK] Triggering social data aggregation for game ${gameId}`);
  
  try {
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: options.async ? 'Event' : 'RequestResponse',
      Payload: JSON.stringify({
        gameId: gameId,
        options: {
          triggerFinancials: options.triggerFinancials ?? true,
          overridePrizepool: options.overridePrizepool ?? false,
          returnAggregation: !options.async
        }
      })
    }));
    
    if (options.async) {
      console.log(`[LINK] Aggregation triggered async, status: ${response.StatusCode}`);
      return { triggered: true, async: true, statusCode: response.StatusCode };
    }
    
    // Parse sync response
    const payloadString = new TextDecoder().decode(response.Payload);
    const result = JSON.parse(payloadString);
    
    console.log(`[LINK] Aggregation complete:`, {
      success: result.success,
      linkedPostCount: result.linkedPostCount,
      dataExtracted: result.dataExtracted
    });
    
    return result;
    
  } catch (error) {
    console.error(`[LINK] Failed to trigger aggregation:`, error);
    // Don't throw - aggregation failure shouldn't break the link operation
    return { triggered: false, error: error.message };
  }
};

// ===================================================================
// LINK OPERATIONS
// ===================================================================

/**
 * Manually link a social post to a game
 * 
 * @param {Object} input - ManualLinkInput
 * @returns {Object} SocialPostGameLink with aggregation result
 */
const linkSocialPostToGame = async (input) => {
  const { 
    socialPostId, 
    gameId, 
    isPrimaryGame = false, 
    mentionOrder,
    notes,
    // NEW: Options for aggregation
    skipAggregation = false,
    asyncAggregation = false,
    triggerFinancials = true
  } = input;
  
  console.log(`[LINK] Creating manual link: ${socialPostId} -> ${gameId}`);
  
  // Validate post exists
  const post = await getSocialPost(socialPostId);
  if (!post) {
    throw new Error(`Social post not found: ${socialPostId}`);
  }
  
  // Validate game exists
  const game = await getGame(gameId);
  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }
  
  // Check for existing link
  const existingLinks = await getLinksBySocialPost(socialPostId);
  const duplicateLink = existingLinks.find(l => l.gameId === gameId);
  
  if (duplicateLink) {
    throw new Error(`Link already exists between post ${socialPostId} and game ${gameId}`);
  }
  
  // Determine mention order
  const newMentionOrder = mentionOrder || (existingLinks.length + 1);
  
  // Determine if this should be primary
  let shouldBePrimary = isPrimaryGame;
  if (existingLinks.length === 0) {
    shouldBePrimary = true;  // First link is always primary
  }
  
  // If setting as primary, unset existing primary
  if (shouldBePrimary) {
    for (const link of existingLinks) {
      if (link.isPrimaryGame) {
        await updateSocialPostGameLink(link.id, { isPrimaryGame: false });
      }
    }
  }
  
  // Create the link
  const now = new Date().toISOString();
  const link = {
    id: uuidv4(),
    socialPostId,
    gameId,
    linkType: 'MANUAL_LINKED',
    matchConfidence: 100,  // Manual links are 100% confidence
    matchReason: 'manual_link',
    matchSignals: notes ? JSON.stringify({ notes }) : null,
    isPrimaryGame: shouldBePrimary,
    mentionOrder: newMentionOrder,
    linkedAt: now,
    linkedBy: 'MANUAL'  // Could be user ID if available
  };
  
  const createdLink = await createSocialPostGameLink(link);
  
  // Update post counts
  const newLinkCount = existingLinks.length + 1;
  const updateData = {
    linkedGameCount: newLinkCount,
    hasUnverifiedLinks: true,
    processingStatus: 'LINKED'
  };
  
  if (shouldBePrimary) {
    updateData.linkedGameId = gameId;
    updateData.primaryLinkedGameId = gameId;
  }
  
  await updateSocialPost(socialPostId, updateData);
  
  console.log(`[LINK] Created link: ${createdLink.id}`);
  
  // =========================================================
  // NEW: Trigger social data aggregation
  // =========================================================
  let aggregationResult = null;
  if (!skipAggregation) {
    aggregationResult = await triggerSocialDataAggregation(gameId, {
      async: asyncAggregation,
      triggerFinancials: triggerFinancials
    });
  }
  
  return {
    ...createdLink,
    aggregationResult
  };
};

/**
 * Remove a link between social post and game
 * 
 * @param {Object} input - UnlinkInput
 * @returns {Object} Result with aggregation status
 */
const unlinkSocialPostFromGame = async (input) => {
  const { 
    linkId, 
    reason,
    // NEW: Options for aggregation
    skipAggregation = false,
    asyncAggregation = true,
    triggerFinancials = true
  } = input;
  
  console.log(`[UNLINK] Removing link: ${linkId}`);
  
  // Get the link
  const link = await getSocialPostGameLink(linkId);
  if (!link) {
    throw new Error(`Link not found: ${linkId}`);
  }
  
  const { socialPostId, gameId, isPrimaryGame } = link;
  
  // Delete the link
  await deleteSocialPostGameLink(linkId);
  
  // Get remaining links
  const remainingLinks = await getLinksBySocialPost(socialPostId);
  
  // Update post
  const updateData = {
    linkedGameCount: remainingLinks.length,
    hasUnverifiedLinks: remainingLinks.some(l => l.linkType !== 'VERIFIED')
  };
  
  // If we deleted the primary, promote the next one
  if (isPrimaryGame && remainingLinks.length > 0) {
    const newPrimary = remainingLinks[0];
    await updateSocialPostGameLink(newPrimary.id, { isPrimaryGame: true });
    updateData.linkedGameId = newPrimary.gameId;
    updateData.primaryLinkedGameId = newPrimary.gameId;
  } else if (remainingLinks.length === 0) {
    updateData.linkedGameId = null;
    updateData.primaryLinkedGameId = null;
    updateData.processingStatus = 'MATCHED';  // Revert to matched since no links
  }
  
  await updateSocialPost(socialPostId, updateData);
  
  console.log(`[UNLINK] Link removed successfully`);
  
  // =========================================================
  // NEW: Trigger social data aggregation for the game
  // This will update the game's linked post counts and
  // re-aggregate data without the removed post
  // =========================================================
  let aggregationResult = null;
  if (!skipAggregation) {
    aggregationResult = await triggerSocialDataAggregation(gameId, {
      async: asyncAggregation,
      triggerFinancials: triggerFinancials
    });
  }
  
  return {
    success: true,
    linkId,
    gameId,
    socialPostId,
    aggregationResult
  };
};

/**
 * Verify an auto-matched link
 * 
 * @param {Object} input - VerifyLinkInput
 * @returns {Object} Updated SocialPostGameLink
 */
const verifySocialPostLink = async (input) => {
  const { 
    linkId, 
    notes,
    // NEW: Options for aggregation
    skipAggregation = false,
    triggerFinancials = true
  } = input;
  
  console.log(`[VERIFY] Verifying link: ${linkId}`);
  
  // Get the link
  const link = await getSocialPostGameLink(linkId);
  if (!link) {
    throw new Error(`Link not found: ${linkId}`);
  }
  
  // Update to verified
  const now = new Date().toISOString();
  const updatedLink = await updateSocialPostGameLink(linkId, {
    linkType: 'VERIFIED',
    verifiedAt: now,
    verifiedBy: 'ADMIN',  // Could be user ID
    matchSignals: notes ? JSON.stringify({ 
      ...JSON.parse(link.matchSignals || '{}'), 
      verificationNotes: notes 
    }) : link.matchSignals
  });
  
  // Check if all links are now verified
  const allLinks = await getLinksBySocialPost(link.socialPostId);
  const allVerified = allLinks.every(l => l.linkType === 'VERIFIED' || l.linkType === 'MANUAL_LINKED');
  
  if (allVerified) {
    await updateSocialPost(link.socialPostId, { hasUnverifiedLinks: false });
  }
  
  console.log(`[VERIFY] Link verified successfully`);
  
  // =========================================================
  // NEW: Trigger aggregation since verified links may have
  // higher priority in data extraction
  // =========================================================
  let aggregationResult = null;
  if (!skipAggregation) {
    aggregationResult = await triggerSocialDataAggregation(link.gameId, {
      async: true,  // Verification doesn't need to wait
      triggerFinancials: triggerFinancials
    });
  }
  
  return {
    ...updatedLink,
    aggregationResult
  };
};

/**
 * Reject an auto-matched link
 * 
 * @param {Object} input - RejectLinkInput
 * @returns {Object} Updated SocialPostGameLink
 */
const rejectSocialPostLink = async (input) => {
  const { 
    linkId, 
    reason,
    // NEW: Options for aggregation
    skipAggregation = false,
    triggerFinancials = true
  } = input;
  
  console.log(`[REJECT] Rejecting link: ${linkId}`);
  
  if (!reason) {
    throw new Error('Rejection reason is required');
  }
  
  // Get the link
  const link = await getSocialPostGameLink(linkId);
  if (!link) {
    throw new Error(`Link not found: ${linkId}`);
  }
  
  const { socialPostId, gameId, isPrimaryGame } = link;
  
  // Update to rejected
  const now = new Date().toISOString();
  const updatedLink = await updateSocialPostGameLink(linkId, {
    linkType: 'REJECTED',
    rejectedAt: now,
    rejectedBy: 'ADMIN',
    rejectionReason: reason
  });
  
  // Get remaining valid links
  const allLinks = await getLinksBySocialPost(socialPostId);
  const validLinks = allLinks.filter(l => l.linkType !== 'REJECTED');
  
  // Update post
  const updateData = {
    linkedGameCount: validLinks.length,
    hasUnverifiedLinks: validLinks.some(l => l.linkType !== 'VERIFIED' && l.linkType !== 'MANUAL_LINKED')
  };
  
  // If we rejected the primary, promote the next valid one
  if (isPrimaryGame && validLinks.length > 0) {
    const newPrimary = validLinks[0];
    await updateSocialPostGameLink(newPrimary.id, { isPrimaryGame: true });
    updateData.linkedGameId = newPrimary.gameId;
    updateData.primaryLinkedGameId = newPrimary.gameId;
  } else if (validLinks.length === 0) {
    updateData.linkedGameId = null;
    updateData.primaryLinkedGameId = null;
    updateData.processingStatus = 'MANUAL_REVIEW';
  }
  
  await updateSocialPost(socialPostId, updateData);
  
  console.log(`[REJECT] Link rejected successfully`);
  
  // =========================================================
  // NEW: Trigger aggregation to remove rejected post's data
  // =========================================================
  let aggregationResult = null;
  if (!skipAggregation) {
    aggregationResult = await triggerSocialDataAggregation(gameId, {
      async: true,  // Rejection doesn't need to wait
      triggerFinancials: triggerFinancials
    });
  }
  
  return {
    ...updatedLink,
    aggregationResult
  };
};

// ===================================================================
// BULK OPERATIONS
// ===================================================================

/**
 * Bulk link multiple social posts to a single game
 * Useful when multiple result/promo posts reference the same tournament
 * 
 * @param {Object} input - BulkLinkInput
 * @returns {Object} Bulk operation result
 */
const bulkLinkSocialPostsToGame = async (input) => {
  const {
    socialPostIds,
    gameId,
    skipAggregation = false,
    triggerFinancials = true
  } = input;
  
  console.log(`[BULK_LINK] Linking ${socialPostIds.length} posts to game ${gameId}`);
  
  const results = [];
  
  for (let i = 0; i < socialPostIds.length; i++) {
    const socialPostId = socialPostIds[i];
    
    try {
      const result = await linkSocialPostToGame({
        socialPostId,
        gameId,
        isPrimaryGame: i === 0,  // First one is primary
        mentionOrder: i + 1,
        skipAggregation: true  // We'll aggregate once at the end
      });
      
      results.push({
        socialPostId,
        success: true,
        linkId: result.id
      });
      
    } catch (error) {
      results.push({
        socialPostId,
        success: false,
        error: error.message
      });
    }
  }
  
  // Trigger aggregation once for all links
  let aggregationResult = null;
  if (!skipAggregation) {
    aggregationResult = await triggerSocialDataAggregation(gameId, {
      async: false,  // Wait for aggregation since bulk ops want to see results
      triggerFinancials: triggerFinancials
    });
  }
  
  return {
    gameId,
    totalRequested: socialPostIds.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    aggregationResult
  };
};

/**
 * Re-aggregate social data for a game
 * Useful for manual trigger after data corrections
 * 
 * @param {Object} input - ReaggregateInput
 * @returns {Object} Aggregation result
 */
const reaggregateSocialDataForGame = async (input) => {
  const {
    gameId,
    triggerFinancials = true,
    overridePrizepool = false
  } = input;
  
  console.log(`[REAGGREGATE] Manual re-aggregation for game ${gameId}`);
  
  return await triggerSocialDataAggregation(gameId, {
    async: false,
    triggerFinancials,
    overridePrizepool
  });
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  linkSocialPostToGame,
  unlinkSocialPostFromGame,
  verifySocialPostLink,
  rejectSocialPostLink,
  bulkLinkSocialPostsToGame,
  reaggregateSocialDataForGame,
  triggerSocialDataAggregation
};