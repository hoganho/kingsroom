/**
 * Scheduled Handler
 * 
 * Handles EventBridge scheduled triggers.
 * Determines which accounts need scraping based on their individual schedules.
 */

const db = require('../db');
const { scrapeAccount } = require('./scrape');
const { sendNotification } = require('../ses-notification');

/**
 * Handle EventBridge scheduled scrape
 * 
 * Supports two modes:
 * 1. Specific accounts: If event.accountIds is provided, only scrape those accounts
 * 2. Due accounts: If no accountIds provided, find accounts due based on their schedule
 * 
 * EventBridge Input format:
 * {
 *   "source": "aws.events",
 *   "triggerType": "SCHEDULED",
 *   "accountIds": ["account-id-1", "account-id-2"]  // Optional
 * }
 */
async function handleScheduledScrape(event, context) {
  console.log('[Scheduled] Running scheduled scrape v3.0.0');
  const startTime = Date.now();

  // Determine which accounts to process
  const specificAccountIds = event?.accountIds || [];
  let accountsToProcess = [];

  if (specificAccountIds.length > 0) {
    // Mode 1: Scrape specific accounts from EventBridge configuration
    console.log(`[Scheduled] Specific account IDs provided: ${specificAccountIds.join(', ')}`);
    accountsToProcess = await db.getAccountsByIds(specificAccountIds);
    console.log(`[Scheduled] Processing ${accountsToProcess.length} of ${specificAccountIds.length} specified accounts`);
  } else {
    // Mode 2: Find accounts due for scraping based on their individual schedule
    console.log('[Scheduled] No specific accounts provided, scanning for accounts due for scraping');
    accountsToProcess = await db.getAccountsDueForScrape();
    console.log(`[Scheduled] Found ${accountsToProcess.length} accounts due for scraping`);
  }

  // Process results tracking
  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    totalNewPosts: 0,
    totalPostsProcessed: 0,
    accountResults: [],
  };

  // Process each account
  for (const account of accountsToProcess) {
    try {
      console.log(`[Scheduled] Scraping account: ${account.accountName} (${account.id})`);
      
      const result = await scrapeAccount(account, {
        fetchAllHistory: false,
        triggerSource: 'SCHEDULED',
      }, context);
      
      results.processed++;

      const accountResult = {
        accountName: account.accountName || account.id,
        platform: account.platform,
        newPosts: result.newPostsAdded || 0,
        postsFound: result.postsFound || 0,
        success: result.success,
      };

      if (result.success) {
        results.success++;
        results.totalNewPosts += result.newPostsAdded;
        results.totalPostsProcessed += result.postsProcessed || 0;
      } else {
        results.failed++;
        accountResult.error = result.message;
      }

      results.accountResults.push(accountResult);

    } catch (error) {
      console.error(`[Scheduled] Error scraping account ${account.id}:`, error);
      results.failed++;
      results.accountResults.push({
        accountName: account.accountName || account.id,
        platform: account.platform,
        newPosts: 0,
        postsFound: 0,
        success: false,
        error: error.message,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  console.log('[Scheduled] Scrape completed:', results);

  // Send notification email
  await sendScheduledNotification(results, durationMs);

  return results;
}

/**
 * Send notification email for scheduled scrape results
 */
async function sendScheduledNotification(results, durationMs) {
  // Build per-account summary
  const accountSummaries = results.accountResults.map(ar => {
    if (ar.success) {
      return `✅ ${ar.accountName}: ${ar.newPosts} new posts (${ar.postsFound} scanned)`;
    } else {
      return `❌ ${ar.accountName}: Failed - ${ar.error || 'Unknown error'}`;
    }
  });

  // Determine overall status
  let status;
  if (results.failed === 0 && results.success > 0) {
    status = 'success';
  } else if (results.success > 0) {
    status = 'success';  // Partial success
  } else if (results.processed === 0) {
    status = 'success';  // No accounts to process is not a failure
  } else {
    status = 'failure';
  }

  await sendNotification({
    lambdaName: 'socialFetcher',
    status,
    triggerSource: 'EVENTBRIDGE',
    durationMs,
    summary: {
      accountsProcessed: results.processed,
      accountsSucceeded: results.success,
      accountsFailed: results.failed,
      totalNewPosts: results.totalNewPosts,
      totalPostsProcessed: results.totalPostsProcessed,
      executionTime: `${Math.round(durationMs / 1000)}s`,
      ...(accountSummaries.length > 0 && {
        accountBreakdown: accountSummaries.join('\n'),
      }),
    },
    error: results.failed > 0 
      ? `${results.failed} account(s) failed to sync` 
      : null,
  });
}

module.exports = {
  handleScheduledScrape,
};
