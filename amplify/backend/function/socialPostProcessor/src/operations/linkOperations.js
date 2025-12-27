/**
 * operations/linkOperations.js
 * Manual link management operations
 */

const { v4: uuidv4 } = require('uuid');
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

/**
 * Manually link a social post to a game
 * 
 * @param {Object} input - ManualLinkInput
 * @returns {Object} SocialPostGameLink
 */
const linkSocialPostToGame = async (input) => {
  const { 
    socialPostId, 
    gameId, 
    isPrimaryGame = false, 
    mentionOrder,
    notes 
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
  
  return createdLink;
};

/**
 * Remove a link between social post and game
 * 
 * @param {Object} input - UnlinkInput
 * @returns {boolean} Success
 */
const unlinkSocialPostFromGame = async (input) => {
  const { linkId, reason } = input;
  
  console.log(`[UNLINK] Removing link: ${linkId}`);
  
  // Get the link
  const link = await getSocialPostGameLink(linkId);
  if (!link) {
    throw new Error(`Link not found: ${linkId}`);
  }
  
  const { socialPostId, isPrimaryGame } = link;
  
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
  
  return true;
};

/**
 * Verify an auto-matched link
 * 
 * @param {Object} input - VerifyLinkInput
 * @returns {Object} Updated SocialPostGameLink
 */
const verifySocialPostLink = async (input) => {
  const { linkId, notes } = input;
  
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
  
  return updatedLink;
};

/**
 * Reject an auto-matched link
 * 
 * @param {Object} input - RejectLinkInput
 * @returns {Object} Updated SocialPostGameLink
 */
const rejectSocialPostLink = async (input) => {
  const { linkId, reason } = input;
  
  console.log(`[REJECT] Rejecting link: ${linkId}`);
  
  if (!reason) {
    throw new Error('Rejection reason is required');
  }
  
  // Get the link
  const link = await getSocialPostGameLink(linkId);
  if (!link) {
    throw new Error(`Link not found: ${linkId}`);
  }
  
  const { socialPostId, isPrimaryGame } = link;
  
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
  
  return updatedLink;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  linkSocialPostToGame,
  unlinkSocialPostFromGame,
  verifySocialPostLink,
  rejectSocialPostLink
};
