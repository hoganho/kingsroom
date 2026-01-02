/**
 * operations/queries.js
 * Query operations for social post matching stats and unlinked posts
 */

const { 
  querySocialPostsByStatus,
  getExtractionBySocialPost,
  getSocialPost
} = require('../utils/graphql');
const { findMatchingGames } = require('../matching/gameMatcher');

const updateSocialPostGameData = async (id, updates) => {
  return updateItem(TABLES.SocialPostGameData(), id, updates);
};

/**
 * Get social posts that need manual review
 * 
 * @param {Object} input - GetUnlinkedPostsInput
 * @returns {Object} UnlinkedPostsConnection
 */
const getUnlinkedSocialPosts = async (input = {}) => {
  const {
    entityId,
    socialAccountId,
    contentType,
    minConfidence,
    maxConfidence,
    limit = 50,
    nextToken
  } = input;
  
  console.log('[QUERY] Getting unlinked posts');
  
  // Query posts that need review
  // These are posts in MATCHED or MANUAL_REVIEW status without verified links
  const statusesToQuery = ['MATCHED', 'MANUAL_REVIEW', 'EXTRACTED'];
  
  let allPosts = [];
  
  for (const status of statusesToQuery) {
    const result = await querySocialPostsByStatus(status, { 
      limit: limit * 2,  // Get extra to filter
      nextToken: status === statusesToQuery[0] ? nextToken : null
    });
    allPosts.push(...result.items);
  }
  
  // Apply filters
  let filteredPosts = allPosts;
  
  if (entityId) {
    filteredPosts = filteredPosts.filter(p => p.entityId === entityId);
  }
  
  if (socialAccountId) {
    filteredPosts = filteredPosts.filter(p => p.socialAccountId === socialAccountId);
  }
  
  if (contentType) {
    filteredPosts = filteredPosts.filter(p => p.contentType === contentType);
  }
  
  // Limit results
  filteredPosts = filteredPosts.slice(0, limit);
  
  // Enrich with extraction data and match suggestions
  const enrichedPosts = [];
  
  for (const post of filteredPosts) {
    const extraction = await getExtractionBySocialPost(post.id);
    
    // Get suggested matches if we have extraction data
    let suggestedMatches = [];
    let bestMatchConfidence = 0;
    
    if (extraction) {
      const matchResult = await findMatchingGames(extraction, post);
      suggestedMatches = matchResult.candidates.slice(0, 5);  // Top 5 suggestions
      bestMatchConfidence = matchResult.primaryMatch?.matchConfidence || 0;
    }
    
    // Apply confidence filters
    if (minConfidence && bestMatchConfidence < minConfidence) continue;
    if (maxConfidence && bestMatchConfidence > maxConfidence) continue;
    
    enrichedPosts.push({
      socialPost: post,
      extractedData: extraction,
      suggestedMatches,
      bestMatchConfidence
    });
  }
  
  console.log(`[QUERY] Returning ${enrichedPosts.length} unlinked posts`);
  
  return {
    items: enrichedPosts,
    nextToken: null,  // Pagination would need more work
    totalCount: enrichedPosts.length
  };
};

/**
 * Get matching statistics
 * 
 * @param {Object} input - GetMatchingStatsInput
 * @returns {Object} SocialPostMatchingStats
 */
const getSocialPostMatchingStats = async (input = {}) => {
  const { entityId, dateFrom, dateTo } = input;
  
  console.log('[QUERY] Getting matching stats');
  
  // This would ideally use aggregation queries
  // For now, we'll query and count manually
  
  const stats = {
    totalPosts: 0,
    processedPosts: 0,
    linkedPosts: 0,
    pendingPosts: 0,
    failedPosts: 0,
    resultPosts: 0,
    promotionalPosts: 0,
    generalPosts: 0,
    autoLinkedCount: 0,
    manualLinkedCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    averageConfidence: 0,
    topMatchReasons: {}
  };
  
  // Query each status
  const statuses = ['PENDING', 'PROCESSING', 'EXTRACTED', 'MATCHED', 'LINKED', 'FAILED', 'SKIPPED', 'MANUAL_REVIEW'];
  
  for (const status of statuses) {
    const result = await querySocialPostsByStatus(status, { limit: 1000 });
    let posts = result.items;
    
    // Apply entity filter
    if (entityId) {
      posts = posts.filter(p => p.entityId === entityId);
    }
    
    // Apply date filter
    if (dateFrom) {
      posts = posts.filter(p => p.postedAt >= dateFrom);
    }
    if (dateTo) {
      posts = posts.filter(p => p.postedAt <= dateTo);
    }
    
    stats.totalPosts += posts.length;
    
    // Count by status
    switch (status) {
      case 'PENDING':
      case 'PROCESSING':
        stats.pendingPosts += posts.length;
        break;
      case 'LINKED':
        stats.linkedPosts += posts.length;
        stats.processedPosts += posts.length;
        break;
      case 'MATCHED':
      case 'EXTRACTED':
        stats.processedPosts += posts.length;
        break;
      case 'FAILED':
        stats.failedPosts += posts.length;
        break;
      case 'MANUAL_REVIEW':
        stats.processedPosts += posts.length;
        break;
    }
    
    // Count by content type
    for (const post of posts) {
      switch (post.contentType) {
        case 'RESULT':
          stats.resultPosts++;
          break;
        case 'PROMOTIONAL':
          stats.promotionalPosts++;
          break;
        case 'GENERAL':
        case 'COMMENT':
          stats.generalPosts++;
          break;
      }
    }
  }
  
  console.log('[QUERY] Stats computed:', stats);
  
  return stats;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  getUnlinkedSocialPosts,
  getSocialPostMatchingStats
};
