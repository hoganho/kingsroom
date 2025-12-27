/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_SOCIALACCOUNTTABLE_ARN
	API_KINGSROOM_SOCIALACCOUNTTABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_ARN
	API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME
	API_KINGSROOM_SOCIALPOSTPLACEMENTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTPLACEMENTTABLE_NAME
	API_KINGSROOM_SOCIALPOSTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTTABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * index.js
 * Lambda handler for socialPostProcessor
 * 
 * This Lambda processes social posts to:
 * - Classify content type (RESULT, PROMOTIONAL, GENERAL)
 * - Extract game data from posts
 * - Match posts to existing games
 * - Create/manage links between posts and games
 * 
 * Can be invoked via GraphQL mutations/queries
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
const { LambdaMonitoring } = require('./utils/monitoring');

// ===================================================================
// LAMBDA HANDLER
// ===================================================================

exports.handler = async (event, context) => {
  console.log('[PROCESSOR] Handler invoked');
  console.log('[PROCESSOR] Event:', JSON.stringify(event, null, 2));
  
  // Extract operation info from AppSync event
  const { typeName, fieldName, arguments: args } = event;
  const operation = `${typeName}.${fieldName}`;
  
  // Initialize monitoring
  const monitoring = new LambdaMonitoring('socialPostProcessor');
  monitoring.trackOperation('HANDLER_START', 'Handler', operation);
  
  try {
    let result;
    
    switch (fieldName) {
      // =========================================================
      // MUTATION
      // =========================================================
      
      case 'processSocialPost':
        result = await processSocialPost(args.input);
        break;
        
      case 'processSocialPostBatch':
        result = await processBatch(args.input);
        break;
        
      case 'linkSocialPostToGame':
        result = await linkSocialPostToGame(args.input);
        break;
        
      case 'unlinkSocialPostFromGame':
        result = await unlinkSocialPostFromGame(args.input);
        break;
        
      case 'verifySocialPostLink':
        result = await verifySocialPostLink(args.input);
        break;
        
      case 'rejectSocialPostLink':
        result = await rejectSocialPostLink(args.input);
        break;
        
      // =========================================================
      // QUERIES
      // =========================================================
      
      case 'previewSocialPostMatch':
        result = await previewMatch(args.socialPostId);
        break;
        
      case 'previewContentExtraction':
        result = await previewContentExtraction(args.input);
        break;
        
      case 'getUnlinkedSocialPosts':
        result = await getUnlinkedSocialPosts(args.input || {});
        break;
        
      case 'getSocialPostMatchingStats':
        result = await getSocialPostMatchingStats(args.input || {});
        break;
        
      // =========================================================
      // DEFAULT
      // =========================================================
      
      default:
        console.error(`[PROCESSOR] Unknown operation: ${operation}`);
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    monitoring.trackOperation('HANDLER_SUCCESS', 'Handler', operation, {
      success: result?.success ?? true
    });
    
    return result;
    
  } catch (error) {
    console.error('[PROCESSOR] Handler error:', error);
    monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', {
      error: error.message
    });
    
    // Return error in consistent format for mutations
    if (typeName === 'Mutation') {
      return {
        success: false,
        socialPostId: args?.input?.socialPostId || null,
        error: error.message,
        processingStatus: 'FAILED'
      };
    }
    
    // Re-throw for queries
    throw error;
    
  } finally {
    await monitoring.flush();
  }
};