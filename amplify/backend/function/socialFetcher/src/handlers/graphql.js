/**
 * GraphQL Handler
 * 
 * Handles GraphQL resolver requests from AppSync.
 */

const { triggerScrape, syncPageInfo } = require('./scrape');

/**
 * Handle GraphQL resolver requests
 * 
 * Supported fields:
 * - triggerSocialScrape: Incremental scrape
 * - triggerFullSync: Full history scrape
 * - syncPageInfo: Update page info without fetching posts
 */
async function handleGraphQLRequest(event, context) {
  const args = event.arguments || {};
  const fieldName = event.fieldName;

  console.log(`[GraphQL] Handling field: ${fieldName}`, args);

  switch (fieldName) {
    case 'triggerSocialScrape':
      if (!args.socialAccountId) {
        throw new Error('Missing required argument: socialAccountId');
      }
      return triggerScrape(args.socialAccountId, {
        fetchAllHistory: false,
        skipProcessing: args.skipProcessing || false,
        triggerSource: 'GRAPHQL',
      }, context);

    case 'triggerFullSync':
      if (!args.socialAccountId) {
        throw new Error('Missing required argument: socialAccountId');
      }
      return triggerScrape(args.socialAccountId, {
        fetchAllHistory: true,
        skipProcessing: args.skipProcessing || false,
        triggerSource: 'GRAPHQL',
      }, context);

    case 'syncPageInfo':
      if (!args.socialAccountId) {
        throw new Error('Missing required argument: socialAccountId');
      }
      return syncPageInfo(args.socialAccountId, {
        forceRefresh: args.forceRefresh || false,
      });

    default:
      throw new Error(`Unknown GraphQL field: ${fieldName}`);
  }
}

module.exports = {
  handleGraphQLRequest,
};
