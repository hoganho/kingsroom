/* Amplify Params - DO NOT EDIT
  API_KINGSROOM_GRAPHQLAPIIDOUTPUT
  API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
  API_KINGSROOM_SOCIALACCOUNTTABLE_ARN
  API_KINGSROOM_SOCIALACCOUNTTABLE_NAME
  API_KINGSROOM_SOCIALPOSTTABLE_ARN
  API_KINGSROOM_SOCIALPOSTTABLE_NAME
  API_KINGSROOM_SOCIALSCHEDULEDPOSTTABLE_ARN
  API_KINGSROOM_SOCIALSCHEDULEDPOSTTABLE_NAME
  API_KINGSROOM_SOCIALSCRAPEATTEMPTTABLE_ARN
  API_KINGSROOM_SOCIALSCRAPEATTEMPTTABLE_NAME
  ENV
  REGION
Amplify Params - DO NOT EDIT */

/**
 * Social Fetcher Lambda - Main Entry Point
 * 
 * VERSION: 3.0.1 - Modular architecture refactor
 * 
 * This is a lightweight router that delegates to specialized handlers.
 * All business logic lives in the handlers/ and services/ directories.
 * 
 * Trigger Sources:
 * - EventBridge scheduled rule (daily/hourly)
 * - GraphQL mutations (triggerSocialScrape, triggerFullSync, syncPageInfo)
 * - Direct Lambda invoke
 */

const { handleScheduledScrape } = require('./handlers/scheduled');
const { handleGraphQLRequest } = require('./handlers/graphql');
const { triggerScrape } = require('./handlers/scrape');
const { runDiagnostics } = require('./diagnostics');

/**
 * Detect the trigger source and route to appropriate handler
 */
exports.handler = async (event, context) => {
  console.log('[socialFetcher] Event:', JSON.stringify(event, null, 2));

  if (event.runDiagnostics) {
    return runDiagnostics();
  }

  try {
    // ============================================
    // 1. EventBridge Scheduled Trigger
    // ============================================
    const isEventBridgeTrigger = 
      event.source === 'aws.events' || 
      event['detail-type'] === 'Scheduled Event' ||
      event.triggerType === 'SCHEDULED';
    
    if (isEventBridgeTrigger) {
      return handleScheduledScrape(event, context);
    }

    // ============================================
    // 2. GraphQL Resolver Request
    // ============================================
    if (event.fieldName) {
      return handleGraphQLRequest(event, context);
    }

    // ============================================
    // 3. Direct Lambda Invoke (with arguments)
    // ============================================
    if (event.arguments?.socialAccountId) {
      return triggerScrape(event.arguments.socialAccountId, {
        fetchAllHistory: event.arguments?.fetchAllHistory || false,
        skipProcessing: event.arguments?.skipProcessing || false
      }, context);
    }

    // ============================================
    // 4. Direct Lambda Invoke (flat structure)
    // ============================================
    if (event.socialAccountId) {
      return triggerScrape(event.socialAccountId, {
        fetchAllHistory: event.fetchAllHistory || false,
        skipProcessing: event.skipProcessing || false
      }, context);
    }

    // ============================================
    // Unknown Event Format
    // ============================================
    console.error('[socialFetcher] Unknown event format:', event);
    return {
      success: false,
      message: 'Invalid event format',
      postsFound: 0,
      newPostsAdded: 0
    };

  } catch (error) {
    console.error('[socialFetcher] Handler error:', error);
    return {
      success: false,
      message: error.message,
      postsFound: 0,
      newPostsAdded: 0
    };
  }
};
