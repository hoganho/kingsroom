/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_SOCIALPOSTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTTABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME
	API_KINGSROOM_SOCIALPOSTPLACEMENTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTPLACEMENTTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * Social Post Processor Lambda
 * 
 * Processes social posts to:
 * 1. Classify content type (RESULT, PROMOTIONAL, GENERAL)
 * 2. Extract game data (buy-in, guarantee, venue, placements, etc.)
 * 3. Match to existing games in the database
 * 4. Create automatic links for high-confidence matches
 * 
 * Triggered by:
 * - socialFetcher Lambda (after saving new posts) - async invocation
 * - GraphQL mutations (processSocialPost, processSocialPostBatch)
 * - Manual invocation for reprocessing
 */

const { processSocialPost, previewMatch, previewContentExtraction } = require('./operations/processSocialPost');
const { processBatch } = require('./operations/processBatch');
const { 
  linkSocialPostToGame, 
  unlinkSocialPostFromGame, 
  verifySocialPostLink, 
  rejectSocialPostLink 
} = require('./operations/linkOperations');
const { getUnlinkedSocialPosts, getSocialPostMatchingStats } = require('./operations/queries');

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // =========================================================================
    // Handle different invocation patterns
    // =========================================================================
    
    // Pattern 1: GraphQL resolver (AppSync)
    if (event.fieldName) {
      return handleGraphQLRequest(event);
    }
    
    // Pattern 2: Direct invocation from socialFetcher - single post
    // This is the async invocation pattern from socialFetcher
    if (event.socialPostId && !event.socialPostIds) {
      console.log(`[HANDLER] Processing single post: ${event.socialPostId}`);
      return processSocialPost({
        socialPostId: event.socialPostId,
        forceReprocess: event.forceReprocess || false,
        skipMatching: event.skipMatching || false,
        skipLinking: event.skipLinking || false,
        matchThreshold: event.matchThreshold
      });
    }
    
    // Pattern 3: Direct invocation from socialFetcher - batch mode
    if (event.socialPostIds && Array.isArray(event.socialPostIds)) {
      console.log(`[HANDLER] Processing batch of ${event.socialPostIds.length} posts`);
      return processBatch({
        socialPostIds: event.socialPostIds,
        forceReprocess: event.forceReprocess || false,
        skipMatching: event.skipMatching || false,
        skipLinking: event.skipLinking || false
      });
    }
    
    // Pattern 4: Batch processing by criteria
    if (event.batchMode || event.processingStatus || event.socialAccountId) {
      console.log('[HANDLER] Processing batch by criteria');
      return processBatch({
        socialAccountId: event.socialAccountId,
        processingStatus: event.processingStatus || 'PENDING',
        limit: event.limit || 50,
        forceReprocess: event.forceReprocess || false,
        skipMatching: event.skipMatching || false,
        skipLinking: event.skipLinking || false
      });
    }
    
    // Unknown event format
    console.error('Unknown event format:', event);
    return {
      success: false,
      error: 'Invalid event format. Expected socialPostId, socialPostIds, or batch criteria.'
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    return {
      success: false,
      error: error.message,
      stack: process.env.ENV !== 'prod' ? error.stack : undefined
    };
  }
};

/**
 * Handle GraphQL resolver requests
 */
async function handleGraphQLRequest(event) {
  const args = event.arguments || {};
  const fieldName = event.fieldName;
  
  console.log(`[HANDLER] GraphQL request: ${fieldName}`);
  
  switch (fieldName) {
    // =========================================================================
    // Processing Operations
    // =========================================================================
    
    case 'processSocialPost':
      // Process a single social post
      if (!args.socialPostId) {
        throw new Error('Missing required argument: socialPostId');
      }
      return processSocialPost({
        socialPostId: args.socialPostId,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false,
        matchThreshold: args.matchThreshold
      });
    
    case 'processSocialPostBatch':
      // Process multiple posts
      return processBatch({
        socialPostIds: args.socialPostIds,
        socialAccountId: args.socialAccountId,
        entityId: args.entityId,
        processingStatus: args.processingStatus,
        contentType: args.contentType,
        postedAfter: args.postedAfter,
        postedBefore: args.postedBefore,
        limit: args.limit || 50,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false
      });
    
    case 'previewSocialPostMatch':
      // Preview match without saving
      if (!args.socialPostId) {
        throw new Error('Missing required argument: socialPostId');
      }
      return previewMatch(args.socialPostId);
    
    case 'previewContentExtraction':
      // Preview extraction on raw content
      if (!args.content) {
        throw new Error('Missing required argument: content');
      }
      return previewContentExtraction({
        content: args.content,
        postedAt: args.postedAt,
        platform: args.platform,
        entityId: args.entityId,
        venueId: args.venueId,
        url: args.url
      });
    
    // =========================================================================
    // Link Operations
    // =========================================================================
    
    case 'linkSocialPostToGame':
      // Manually link a post to a game
      if (!args.socialPostId || !args.gameId) {
        throw new Error('Missing required arguments: socialPostId and gameId');
      }
      return linkSocialPostToGame({
        socialPostId: args.socialPostId,
        gameId: args.gameId,
        isPrimaryGame: args.isPrimaryGame,
        mentionOrder: args.mentionOrder,
        notes: args.notes
      });
    
    case 'unlinkSocialPostFromGame':
      // Remove a link
      if (!args.linkId) {
        throw new Error('Missing required argument: linkId');
      }
      return unlinkSocialPostFromGame({
        linkId: args.linkId,
        reason: args.reason
      });
    
    case 'verifySocialPostLink':
      // Verify an auto-matched link
      if (!args.linkId) {
        throw new Error('Missing required argument: linkId');
      }
      return verifySocialPostLink({
        linkId: args.linkId,
        notes: args.notes
      });
    
    case 'rejectSocialPostLink':
      // Reject an auto-matched link
      if (!args.linkId || !args.reason) {
        throw new Error('Missing required arguments: linkId and reason');
      }
      return rejectSocialPostLink({
        linkId: args.linkId,
        reason: args.reason
      });
    
    // =========================================================================
    // Query Operations
    // =========================================================================
    
    case 'getUnlinkedSocialPosts':
      // Get posts that need manual review
      return getUnlinkedSocialPosts({
        entityId: args.entityId,
        socialAccountId: args.socialAccountId,
        contentType: args.contentType,
        minConfidence: args.minConfidence,
        maxConfidence: args.maxConfidence,
        limit: args.limit,
        nextToken: args.nextToken
      });
    
    case 'getSocialPostMatchingStats':
      // Get matching statistics
      return getSocialPostMatchingStats({
        entityId: args.entityId,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo
      });
    
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}