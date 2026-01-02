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
 * Extract arguments from event - handles multiple AppSync/Lambda event formats
 */
function extractArguments(event) {
  // Log the full event for debugging
  console.log('[HANDLER] Full event:', JSON.stringify(event, null, 2));
  
  // Format 1: AppSync with input wrapper - event.arguments.input
  // This is the pattern when GraphQL schema uses: mutation(input: ProcessSocialPostInput!)
  if (event.arguments?.input) {
    console.log('[HANDLER] Using event.arguments.input');
    return event.arguments.input;
  }
  
  // Format 2: Standard AppSync resolver format - event.arguments (without input wrapper)
  if (event.arguments) {
    console.log('[HANDLER] Using event.arguments');
    return event.arguments;
  }
  
  // Format 3: Arguments at top level (direct Lambda invocation)
  if (event.socialPostId || event.socialPostIds || event.linkId || event.content) {
    console.log('[HANDLER] Using top-level arguments');
    return event;
  }
  
  // Format 4: Nested in input field at top level
  if (event.input) {
    console.log('[HANDLER] Using event.input');
    return event.input;
  }
  
  // Format 5: Body string (API Gateway)
  if (event.body && typeof event.body === 'string') {
    try {
      const parsed = JSON.parse(event.body);
      console.log('[HANDLER] Using parsed event.body');
      return parsed.arguments?.input || parsed.arguments || parsed.input || parsed;
    } catch (e) {
      console.error('[HANDLER] Failed to parse event.body');
    }
  }
  
  // Default: return the event itself
  console.log('[HANDLER] Using event as arguments');
  return event;
}

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('[HANDLER] ===== Lambda Invoked =====');
  console.log('[HANDLER] Event type:', typeof event);
  console.log('[HANDLER] Event keys:', Object.keys(event || {}));
  
  try {
    // Extract arguments from various event formats
    const args = extractArguments(event);
    const fieldName = event.fieldName || event.field || args.fieldName;
    
    console.log('[HANDLER] Extracted fieldName:', fieldName);
    console.log('[HANDLER] Extracted args:', JSON.stringify(args, null, 2));
    
    // =========================================================================
    // Pattern 1: GraphQL resolver (AppSync) - has fieldName
    // =========================================================================
    if (fieldName) {
      return handleGraphQLRequest(fieldName, args);
    }
    
    // =========================================================================
    // Pattern 2: Direct invocation from socialFetcher - single post
    // =========================================================================
    if (args.socialPostId && !args.socialPostIds) {
      console.log(`[HANDLER] Processing single post: ${args.socialPostId}`);
      return processSocialPost({
        socialPostId: args.socialPostId,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false,
        matchThreshold: args.matchThreshold
      });
    }
    
    // =========================================================================
    // Pattern 3: Direct invocation from socialFetcher - batch mode
    // =========================================================================
    if (args.socialPostIds && Array.isArray(args.socialPostIds)) {
      console.log(`[HANDLER] Processing batch of ${args.socialPostIds.length} posts`);
      return processBatch({
        socialPostIds: args.socialPostIds,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false
      });
    }
    
    // =========================================================================
    // Pattern 4: Batch processing by criteria
    // =========================================================================
    if (args.batchMode || args.processingStatus || args.socialAccountId) {
      console.log('[HANDLER] Processing batch by criteria');
      return processBatch({
        socialAccountId: args.socialAccountId,
        processingStatus: args.processingStatus || 'PENDING',
        limit: args.limit || 50,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false
      });
    }
    
    // Unknown event format
    console.error('[HANDLER] Unknown event format - could not determine action');
    console.error('[HANDLER] args:', JSON.stringify(args, null, 2));
    return {
      success: false,
      error: 'Invalid event format. Expected socialPostId, socialPostIds, fieldName, or batch criteria.',
      receivedKeys: Object.keys(args)
    };
    
  } catch (error) {
    console.error('[HANDLER] Error:', error);
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
async function handleGraphQLRequest(fieldName, args) {
  console.log(`[HANDLER] GraphQL request: ${fieldName}`);
  console.log(`[HANDLER] Args for ${fieldName}:`, JSON.stringify(args, null, 2));
  
  switch (fieldName) {
    // =========================================================================
    // Processing Operations
    // =========================================================================
    
    case 'processSocialPost': {
      const socialPostId = args.socialPostId;
      if (!socialPostId) {
        console.error('[HANDLER] processSocialPost called without socialPostId');
        console.error('[HANDLER] Available args:', Object.keys(args));
        throw new Error('Missing required argument: socialPostId');
      }
      return processSocialPost({
        socialPostId,
        forceReprocess: args.forceReprocess || false,
        skipMatching: args.skipMatching || false,
        skipLinking: args.skipLinking || false,
        matchThreshold: args.matchThreshold
      });
    }
    
    case 'processSocialPostBatch':
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
    
    case 'previewSocialPostMatch': {
      const socialPostId = args.socialPostId;
      if (!socialPostId) {
        throw new Error('Missing required argument: socialPostId');
      }
      return previewMatch(socialPostId);
    }
    
    case 'previewContentExtraction': {
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
    }
    
    // =========================================================================
    // Link Operations
    // =========================================================================
    
    case 'linkSocialPostToGame': {
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
    }
    
    case 'unlinkSocialPostFromGame': {
      if (!args.linkId) {
        throw new Error('Missing required argument: linkId');
      }
      return unlinkSocialPostFromGame({
        linkId: args.linkId,
        reason: args.reason
      });
    }
    
    case 'verifySocialPostLink': {
      if (!args.linkId) {
        throw new Error('Missing required argument: linkId');
      }
      return verifySocialPostLink({
        linkId: args.linkId,
        notes: args.notes
      });
    }
    
    case 'rejectSocialPostLink': {
      if (!args.linkId || !args.reason) {
        throw new Error('Missing required arguments: linkId and reason');
      }
      return rejectSocialPostLink({
        linkId: args.linkId,
        reason: args.reason
      });
    }
    
    // =========================================================================
    // Query Operations
    // =========================================================================
    
    case 'getUnlinkedSocialPosts':
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
      return getSocialPostMatchingStats({
        entityId: args.entityId,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo
      });
    
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}