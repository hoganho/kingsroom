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
 * Social Fetcher Lambda
 * 
 * Fetches posts from Facebook pages using the Graph API with an App Access Token.
 * 
 * Features:
 * - SMART FULL SYNC: Only fetches posts outside your existing date range (saves API calls!)
 * - Fetches ALL historical posts with pagination (triggerFullSync)
 * - INCREMENTAL SAVING: Saves posts as each page is fetched (not at the end)
 * - RESUMABLE: Tracks oldest post fetched so full sync can resume after rate limits
 * - REAL-TIME UPDATES: Publishes progress to AppSync subscriptions
 * - Incremental fetching - only gets posts since last successful scrape
 * - Downloads and stores page profile pictures to S3
 * - Downloads and stores post images/media to S3 (consistent with manual uploads)
 * - Supports initial full sync and incremental updates
 * - Refresh logo with forceRefresh option
 * 
 * Triggered:
 * - Manually via GraphQL mutation (triggerSocialScrape)
 * - Full sync via GraphQL mutation (triggerFullSync)
 * - Page info sync via GraphQL mutation (syncPageInfo)
 * - Automatically via EventBridge scheduled rule (hourly)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SignatureV4 } = require('@aws-sdk/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const https = require('https');

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: process.env.REGION || 'ap-southeast-2' });
const lambdaClient = new LambdaClient({ region: process.env.REGION || 'ap-southeast-2' });

// Table names from environment
const SOCIAL_ACCOUNT_TABLE = process.env.API_KINGSROOM_SOCIALACCOUNTTABLE_NAME;
const SOCIAL_POST_TABLE = process.env.API_KINGSROOM_SOCIALPOSTTABLE_NAME;
const SOCIAL_SCRAPE_ATTEMPT_TABLE = process.env.API_KINGSROOM_SOCIALSCRAPEATTEMPTTABLE_NAME;

// AppSync endpoint for publishing subscription events
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT || process.env.APPSYNC_ENDPOINT;
const APPSYNC_REGION = process.env.REGION || 'ap-southeast-2';

// S3 bucket for storing page logos/profile images
const S3_BUCKET = process.env.SOCIAL_MEDIA_BUCKET || 'pokerpro-scraper-storage';
const S3_PREFIX = 'social-media/page-logos/';
const S3_POST_ATTACHMENTS_PREFIX = 'social-media/post-attachments/';

// Facebook App Access Token (format: app_id|app_secret)
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_API_VERSION = process.env.FB_API_VERSION || 'v19.0';

// Configuration
const MAX_POSTS_PER_PAGE = 100;
const MAX_PAGES_TO_FETCH = 50;

// Progress update frequency (publish every N pages)
const PROGRESS_UPDATE_FREQUENCY = 3;

// Social Post Processor Configuration
const SOCIAL_POST_PROCESSOR_FUNCTION = process.env.SOCIAL_POST_PROCESSOR_FUNCTION;
const AUTO_PROCESS_POSTS = process.env.AUTO_PROCESS_POSTS !== 'false';
const MAX_PARALLEL_PROCESSING = parseInt(process.env.MAX_PARALLEL_PROCESSING || '5', 10);

// ============================================
// AppSync Subscription Publishing
// ============================================

/**
 * Publish sync progress to AppSync subscription
 * This allows the frontend to receive real-time updates
 * 
 * Enhanced with download progress tracking:
 * - currentAction: What's happening now (e.g., "Downloading media...")
 * - downloadCurrent: Current item being processed
 * - downloadTotal: Total items to process
 */
async function publishSyncProgress(socialAccountId, status, data = {}) {
  if (!APPSYNC_ENDPOINT) {
    console.warn('APPSYNC_ENDPOINT not configured - skipping subscription publish');
    return;
  }

  const mutation = `
    mutation PublishSyncProgress(
      $socialAccountId: ID!
      $status: SyncEventStatus!
      $message: String
      $postsFound: Int
      $newPostsAdded: Int
      $rateLimited: Boolean
      $pagesCompleted: Int
    ) {
      publishSyncProgress(
        socialAccountId: $socialAccountId
        status: $status
        message: $message
        postsFound: $postsFound
        newPostsAdded: $newPostsAdded
        rateLimited: $rateLimited
        pagesCompleted: $pagesCompleted
      ) {
        socialAccountId
        status
        message
        postsFound
        newPostsAdded
        rateLimited
        pagesCompleted
        completedAt
      }
    }
  `;

  const variables = {
    socialAccountId,
    status,
    message: data.message || null,
    postsFound: data.postsFound || 0,
    newPostsAdded: data.newPostsAdded || 0,
    rateLimited: data.rateLimited || false,
    pagesCompleted: data.pagesCompleted || 0,
  };

  try {
    await executeAppSyncMutation(mutation, variables);
    // Only log non-download updates to reduce noise
    if (!data.isDownloadProgress) {
      console.log(`[SUBSCRIPTION] Published: ${status} for ${socialAccountId} (${data.newPostsAdded || 0} new posts)`);
    }
  } catch (error) {
    console.error('[SUBSCRIPTION] Failed to publish sync progress:', error.message);
    // Don't throw - subscription publishing is non-critical
  }
}

// Throttle download progress updates to avoid overwhelming subscriptions
let lastDownloadProgressUpdate = 0;
const DOWNLOAD_PROGRESS_THROTTLE_MS = 500; // Max one update per 500ms

async function publishDownloadProgress(socialAccountId, current, total, postDate, hasMedia) {
  const now = Date.now();
  
  // Throttle updates unless it's the first or last item
  if (current !== 1 && current !== total && (now - lastDownloadProgressUpdate) < DOWNLOAD_PROGRESS_THROTTLE_MS) {
    return;
  }
  
  lastDownloadProgressUpdate = now;
  
  const mediaIndicator = hasMedia ? ' 📷' : '';
  const dateStr = postDate ? ` (${new Date(postDate).toLocaleDateString()})` : '';
  const message = `Downloading post ${current} of ${total}${mediaIndicator}${dateStr}`;
  
  await publishSyncProgress(socialAccountId, 'IN_PROGRESS', {
    message,
    postsFound: total,
    newPostsAdded: current,
    pagesCompleted: 0,
    isDownloadProgress: true,
  });
}

/**
 * Execute AppSync mutation with IAM auth (for Lambda-to-AppSync calls)
 */
async function executeAppSyncMutation(mutation, variables) {
  const endpoint = new URL(APPSYNC_ENDPOINT);
  
  const body = JSON.stringify({
    query: mutation,
    variables,
  });

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: APPSYNC_REGION,
    service: 'appsync',
    sha256: Sha256,
  });

  const request = {
    method: 'POST',
    hostname: endpoint.hostname,
    path: endpoint.pathname,
    protocol: endpoint.protocol,
    headers: {
      'Content-Type': 'application/json',
      host: endpoint.hostname,
    },
    body,
  };

  const signedRequest = await signer.sign(request);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: endpoint.hostname,
        path: endpoint.pathname,
        method: 'POST',
        headers: signedRequest.headers,
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => (responseData += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            if (response.errors && response.errors.length > 0) {
              reject(new Error(JSON.stringify(response.errors)));
            } else {
              resolve(response.data);
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${responseData}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ============================================
// Main Handler
// ============================================

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    if (event.source === 'aws.events') {
      return handleScheduledScrape(context);
    } else if (event.fieldName) {
      return handleGraphQLRequest(event, context);
    } else if (event.arguments?.socialAccountId) {
      const options = {
        fetchAllHistory: event.arguments?.fetchAllHistory || false,
        skipProcessing: event.arguments?.skipProcessing || false
      };
      return triggerScrape(event.arguments.socialAccountId, options, context);
    } else if (event.socialAccountId) {
      const options = {
        fetchAllHistory: event.fetchAllHistory || false,
        skipProcessing: event.skipProcessing || false
      };
      return triggerScrape(event.socialAccountId, options, context);
    } else {
      console.error('Unknown event format:', event);
      return {
        success: false,
        message: 'Invalid event format',
        postsFound: 0,
        newPostsAdded: 0
      };
    }
  } catch (error) {
    console.error('Handler error:', error);
    return {
      success: false,
      message: error.message,
      postsFound: 0,
      newPostsAdded: 0
    };
  }
};

/**
 * Handle GraphQL resolver requests
 */
async function handleGraphQLRequest(event, context) {
  const args = event.arguments || {}; 
  const fieldName = event.fieldName;

  switch (fieldName) {
    case 'triggerSocialScrape':
      if (!args.socialAccountId) {
        throw new Error('Missing required argument: socialAccountId');
      }
      return triggerScrape(args.socialAccountId, { 
        fetchAllHistory: false,
        skipProcessing: args.skipProcessing || false 
      }, context);
    
    case 'triggerFullSync':
      if (!args.socialAccountId) {
        throw new Error('Missing required argument: socialAccountId');
      }
      return triggerScrape(args.socialAccountId, { 
        fetchAllHistory: true,
        skipProcessing: args.skipProcessing || false 
      }, context);
    
    case 'syncPageInfo':
      return syncPageInfo(args.socialAccountId, { forceRefresh: args.forceRefresh || false });
    
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}

/**
 * Handle scheduled scrapes (hourly EventBridge trigger)
 */
async function handleScheduledScrape(context) {
  console.log('Running scheduled scrape');

  const accountsDue = await getAccountsDueForScrape();
  console.log(`Found ${accountsDue.length} accounts due for scraping`);

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    totalNewPosts: 0,
    totalPostsProcessed: 0,
  };

  for (const account of accountsDue) {
    try {
      const result = await scrapeAccount(account, { fetchAllHistory: false }, context);
      results.processed++;

      if (result.success) {
        results.success++;
        results.totalNewPosts += result.newPostsAdded;
        results.totalPostsProcessed += result.postsProcessed || 0;
      } else {
        results.failed++;
      }
    } catch (error) {
      console.error(`Error scraping account ${account.id}:`, error);
      results.failed++;
    }
  }

  console.log('Scheduled scrape completed:', results);
  return results;
}

/**
 * Trigger scrape for a specific account
 */
async function triggerScrape(socialAccountId, options = {}, context = null) {
  console.log('Triggering scrape for account:', socialAccountId, 'Options:', options);

  if (!FB_ACCESS_TOKEN) {
    console.error('FB_ACCESS_TOKEN not configured');
    return {
      success: false,
      message: 'Facebook access token not configured. Add FB_ACCESS_TOKEN environment variable.',
      postsFound: 0,
      newPostsAdded: 0
    };
  }

  const account = await getSocialAccount(socialAccountId);

  if (!account) {
    return {
      success: false,
      message: 'Account not found',
      postsFound: 0,
      newPostsAdded: 0
    };
  }

  if (!account.isScrapingEnabled) {
    return {
      success: false,
      message: 'Scraping is disabled for this account',
      postsFound: 0,
      newPostsAdded: 0
    };
  }

  if (account.platform !== 'FACEBOOK') {
    return {
      success: false,
      message: 'Only Facebook is supported currently',
      postsFound: 0,
      newPostsAdded: 0
    };
  }

  return scrapeAccount(account, options, context);
}

/**
 * Sync page info (logo, follower count, etc.) without fetching posts
 */
async function syncPageInfo(socialAccountId, options = {}) {
  console.log('Syncing page info for account:', socialAccountId, 'Options:', options);
  const forceRefresh = options.forceRefresh || false;

  if (!FB_ACCESS_TOKEN) {
    return { 
      success: false, 
      message: 'Facebook access token not configured',
      logoUrl: null
    };
  }

  const account = await getSocialAccount(socialAccountId);
  if (!account) {
    return { 
      success: false, 
      message: 'Account not found',
      logoUrl: null
    };
  }

  const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
  if (!pageId) {
    return { 
      success: false, 
      message: 'Could not determine Facebook page ID',
      logoUrl: null
    };
  }

  try {
    const pageInfo = await fetchPageInfo(pageId);
    
    let storedLogoUrl = null;
    if (pageInfo.picture?.data?.url) {
      storedLogoUrl = await downloadAndStorePageLogo(
        account.id,
        pageInfo.picture.data.url,
        pageInfo.name || account.accountName,
        forceRefresh
      );
    }

    await updateAccountAfterScrape(account.id, {
      accountName: pageInfo.name || account.accountName,
      profileImageUrl: storedLogoUrl || pageInfo.picture?.data?.url || account.profileImageUrl,
      followerCount: pageInfo.followers_count || pageInfo.fan_count || account.followerCount,
      pageDescription: pageInfo.about || pageInfo.description || null,
      category: pageInfo.category || null,
    });

    return {
      success: true,
      message: 'Page info synced successfully',
      logoUrl: storedLogoUrl || pageInfo.picture?.data?.url,
      followerCount: pageInfo.followers_count || pageInfo.fan_count,
      pageName: pageInfo.name
    };
  } catch (error) {
    console.error('Error syncing page info:', error);
    return {
      success: false,
      message: error.message,
      logoUrl: null
    };
  }
}

// ============================================
// NEW: Smart Post Date Range Query
// ============================================

/**
 * Get the oldest and newest post dates for an account
 * Uses the bySocialAccount GSI with postedAt as sort key
 * Returns null values if no posts exist
 */
async function getPostDateRange(socialAccountId) {
  console.log(`[SMART SYNC] Getting post date range for account ${socialAccountId}...`);
  
  try {
    // Get oldest post (ascending order, limit 1)
    const oldestResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': socialAccountId
      },
      ScanIndexForward: true, // Ascending (oldest first)
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    // Get newest post (descending order, limit 1)
    const newestResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': socialAccountId
      },
      ScanIndexForward: false, // Descending (newest first)
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    // Get total count for logging
    const countResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': socialAccountId
      },
      Select: 'COUNT'
    }));
    
    const oldestPost = oldestResult.Items?.[0];
    const newestPost = newestResult.Items?.[0];
    const totalPosts = countResult.Count || 0;
    
    if (!oldestPost || !newestPost) {
      console.log(`[SMART SYNC] No existing posts found for account`);
      return {
        oldestPostDate: null,
        newestPostDate: null,
        oldestTimestamp: null,
        newestTimestamp: null,
        totalPosts: 0
      };
    }
    
    const oldestDate = oldestPost.postedAt;
    const newestDate = newestPost.postedAt;
    
    // Convert to Unix timestamps for Facebook API
    const oldestTimestamp = Math.floor(new Date(oldestDate).getTime() / 1000);
    const newestTimestamp = Math.floor(new Date(newestDate).getTime() / 1000);
    
    console.log(`[SMART SYNC] Found ${totalPosts} existing posts:`);
    console.log(`  - Oldest: ${oldestDate} (timestamp: ${oldestTimestamp})`);
    console.log(`  - Newest: ${newestDate} (timestamp: ${newestTimestamp})`);
    
    return {
      oldestPostDate: oldestDate,
      newestPostDate: newestDate,
      oldestTimestamp,
      newestTimestamp,
      totalPosts
    };
    
  } catch (error) {
    console.error('[SMART SYNC] Error getting post date range:', error);
    // Return nulls on error - will fall back to full fetch
    return {
      oldestPostDate: null,
      newestPostDate: null,
      oldestTimestamp: null,
      newestTimestamp: null,
      totalPosts: 0
    };
  }
}

/**
 * Main scrape function for an account
 * Features SMART FULL SYNC, incremental saving, and real-time subscription updates
 */
async function scrapeAccount(account, options = {}, context = null) {
  const startTime = Date.now();
  let attemptId = null;
  
  const fetchAllHistory = options.fetchAllHistory || false;
  const skipProcessing = options.skipProcessing || false;
  
  // Track progress
  let totalPostsScanned = 0;
  let totalNewPostsSaved = 0;
  let allSavedPostIds = [];
  let oldestPostDate = null;
  let wasRateLimited = false;
  let wasTimeout = false;
  let pagesCompleted = 0;
  
  // Track API efficiency for logging
  let apiCallsSaved = 0;
  
  // Determine "since" timestamp for incremental fetches
  let sinceTimestamp = null;
  if (!fetchAllHistory && account.lastSuccessfulScrapeAt) {
    const now = Date.now();
    const lastScrapeTime = new Date(account.lastSuccessfulScrapeAt).getTime();
    const option1 = now - (24 * 60 * 60 * 1000);
    const option2 = lastScrapeTime - (24 * 60 * 60 * 1000);
    const sinceMs = Math.min(option1, option2);
    sinceTimestamp = Math.floor(sinceMs / 1000);
    
    const sinceDate = new Date(sinceMs);
    const hoursSinceLastScrape = Math.round((now - lastScrapeTime) / (60 * 60 * 1000));
    console.log(`Incremental fetch: last scrape was ${hoursSinceLastScrape}h ago`);
    console.log(`Looking back to ${sinceDate.toISOString()}`);
  }

  // Publish "STARTED" event
  await publishSyncProgress(account.id, 'STARTED', {
    message: `Starting ${fetchAllHistory ? 'full' : 'incremental'} sync for ${account.accountName}`,
    postsFound: 0,
    newPostsAdded: 0,
  });

  try {
    const syncType = fetchAllHistory ? 'FULL_SYNC' : 'INCREMENTAL';
    attemptId = await createScrapeAttempt(account.id, syncType);

    const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
    console.log('Using page ID:', pageId);

    if (!pageId) {
      throw new Error('Could not determine Facebook page ID');
    }

    // Fetch page info and logo first
    if (!account.profileImageUrl || fetchAllHistory) {
      console.log('Fetching page info and logo...');
      try {
        const pageInfo = await fetchPageInfo(pageId);
        
        let storedLogoUrl = null;
        if (pageInfo.picture?.data?.url) {
          storedLogoUrl = await downloadAndStorePageLogo(
            account.id,
            pageInfo.picture.data.url,
            pageInfo.name || account.accountName,
            fetchAllHistory
          );
        }

        await updateAccountAfterScrape(account.id, {
          accountName: pageInfo.name || account.accountName,
          profileImageUrl: storedLogoUrl || pageInfo.picture?.data?.url || account.profileImageUrl,
          followerCount: pageInfo.followers_count || pageInfo.fan_count || account.followerCount,
          pageDescription: pageInfo.about || pageInfo.description || null,
          category: pageInfo.category || null,
        });

        account.profileImageUrl = storedLogoUrl || pageInfo.picture?.data?.url;
        account.followerCount = pageInfo.followers_count || pageInfo.fan_count;
      } catch (pageInfoError) {
        console.warn('Could not fetch page info, continuing with post fetch:', pageInfoError.message);
      }
    }

    // ================================================================
    // FETCH POSTS WITH INCREMENTAL SAVING AND PROGRESS UPDATES
    // ================================================================
    
    let isFullSync = fetchAllHistory;
    
    // Callback to process each page of posts
    const onPageFetched = async (posts, pageNumber) => {
      console.log(`Processing page ${pageNumber} with ${posts.length} posts...`);
      
      // Publish "fetching" status before processing
      await publishSyncProgress(account.id, 'IN_PROGRESS', {
        message: `Page ${pageNumber}: Checking ${posts.length} posts for new content...`,
        postsFound: totalPostsScanned + posts.length,
        newPostsAdded: totalNewPostsSaved,
        pagesCompleted: pageNumber,
      });
      
      const { newPosts, savedPostIds, oldestDate } = await processAndSavePostsBatch(account, posts);
      
      totalPostsScanned += posts.length;
      totalNewPostsSaved += newPosts.length;
      allSavedPostIds.push(...savedPostIds);
      pagesCompleted = pageNumber;
      
      if (oldestDate) {
        if (!oldestPostDate || oldestDate < oldestPostDate) {
          oldestPostDate = oldestDate;
        }
      }
      
      console.log(`Page ${pageNumber}: ${newPosts.length} new posts saved (total: ${totalNewPostsSaved} new, ${totalPostsScanned} scanned)`);
      
      // Publish page completion status
      const statusMessage = newPosts.length > 0
        ? `Page ${pageNumber} complete: Downloaded ${newPosts.length} new posts (${totalNewPostsSaved} total)`
        : `Page ${pageNumber} complete: No new posts (${totalPostsScanned} scanned)`;
      
      await publishSyncProgress(account.id, 'IN_PROGRESS', {
        message: statusMessage,
        postsFound: totalPostsScanned,
        newPostsAdded: totalNewPostsSaved,
        pagesCompleted: pageNumber,
      });
      
      return { newPosts, savedPostIds };
    };
    
    if (fetchAllHistory) {
      // ================================================================
      // SMART FULL SYNC - Only fetch posts outside existing date range
      // ================================================================
      console.log('[SMART SYNC] Starting smart full sync...');
      
      const dateRange = await getPostDateRange(account.id);
      
      if (dateRange.totalPosts > 0 && dateRange.oldestTimestamp && dateRange.newestTimestamp) {
        // We have existing posts - do smart sync
        console.log(`[SMART SYNC] Found ${dateRange.totalPosts} existing posts, fetching only new content...`);
        
        // Publish smart sync info
        await publishSyncProgress(account.id, 'IN_PROGRESS', {
          message: `Smart sync: ${dateRange.totalPosts} posts already downloaded, fetching only missing posts...`,
          postsFound: 0,
          newPostsAdded: 0,
          pagesCompleted: 0,
        });
        
        let newerResult = { rateLimited: false, timeout: false, pagesCompleted: 0 };
        let olderResult = { rateLimited: false, timeout: false, pagesCompleted: 0 };
        
        // Step 1: Fetch NEWER posts (since our newest post)
        // Add 1 second to avoid re-fetching the exact same post
        const sinceNewest = dateRange.newestTimestamp + 1;
        console.log(`[SMART SYNC] Step 1: Fetching posts NEWER than ${dateRange.newestPostDate}...`);
        
        const newerPosts = await fetchFacebookPostsSince(pageId, sinceNewest);
        if (newerPosts.length > 0) {
          console.log(`[SMART SYNC] Found ${newerPosts.length} newer posts`);
          await onPageFetched(newerPosts, 1);
          newerResult.pagesCompleted = 1;
        } else {
          console.log('[SMART SYNC] No newer posts found');
        }
        
        // Check for timeout/rate limit before continuing
        if (context && typeof context.getRemainingTimeInMillis === 'function') {
          const remainingTime = context.getRemainingTimeInMillis();
          if (remainingTime < 30000) {
            console.warn(`[SMART SYNC] Low time remaining (${remainingTime}ms), skipping older posts fetch`);
            wasTimeout = true;
          }
        }
        
        // Step 2: Fetch OLDER posts (until our oldest post) - if not rate limited/timed out
        if (!wasTimeout && !wasRateLimited) {
          // Subtract 1 second to avoid re-fetching the exact same post
          const untilOldest = dateRange.oldestTimestamp - 1;
          console.log(`[SMART SYNC] Step 2: Fetching posts OLDER than ${dateRange.oldestPostDate}...`);
          
          // Check if we're resuming from a previous partial sync
          const resumeFromDate = account.fullSyncOldestPostDate;
          if (resumeFromDate && new Date(resumeFromDate) < new Date(dateRange.oldestPostDate)) {
            console.log(`[SMART SYNC] Resuming from previous sync point: ${resumeFromDate}`);
          }
          
          olderResult = await fetchFacebookPostsUntil(
            pageId, 
            untilOldest, 
            onPageFetched, 
            context,
            pagesCompleted
          );
          
          wasRateLimited = olderResult.rateLimited;
          wasTimeout = olderResult.timeout;
        }
        
        pagesCompleted = newerResult.pagesCompleted + olderResult.pagesCompleted;
        
        // Calculate API calls saved
        const estimatedFullSyncPages = Math.ceil(dateRange.totalPosts / MAX_POSTS_PER_PAGE);
        apiCallsSaved = Math.max(0, estimatedFullSyncPages - pagesCompleted);
        console.log(`[SMART SYNC] Complete! Saved approximately ${apiCallsSaved} API calls by skipping existing posts`);
        
      } else {
        // No existing posts - do full fetch
        console.log('[SMART SYNC] No existing posts found, doing full historical fetch...');
        
        const resumeFromDate = account.fullSyncOldestPostDate;
        if (resumeFromDate) {
          console.log(`Resuming full sync from: ${resumeFromDate}`);
        }
        
        const result = await fetchAllFacebookPostsWithCallback(
          pageId, 
          onPageFetched, 
          context,
          resumeFromDate
        );
        
        wasRateLimited = result.rateLimited;
        wasTimeout = result.timeout;
        pagesCompleted = result.pagesCompleted;
      }
      
    } else if (sinceTimestamp) {
      console.log(`Fetching posts since timestamp: ${sinceTimestamp}`);
      const posts = await fetchFacebookPostsSince(pageId, sinceTimestamp);
      
      if (posts.length > 0) {
        await onPageFetched(posts, 1);
      }
      pagesCompleted = 1;
      
    } else {
      console.log('First fetch - getting ALL historical posts with pagination...');
      
      const result = await fetchAllFacebookPostsWithCallback(pageId, onPageFetched, context);
      
      wasRateLimited = result.rateLimited;
      wasTimeout = result.timeout;
      pagesCompleted = result.pagesCompleted;
      isFullSync = true;
    }
    
    console.log(`Fetch complete: ${totalNewPostsSaved} new posts saved, ${totalPostsScanned} total scanned`);

    // ============================================
    // Trigger socialPostProcessor for new posts
    // ============================================
    let postsProcessed = 0;
    let processingResults = [];
    
    if (AUTO_PROCESS_POSTS && !skipProcessing && allSavedPostIds.length > 0) {
      if (!SOCIAL_POST_PROCESSOR_FUNCTION) {
        console.warn('[PROCESSOR] SOCIAL_POST_PROCESSOR_FUNCTION not configured');
      } else {
        console.log(`[PROCESSOR] Auto-processing ${allSavedPostIds.length} new posts...`);
        
        try {
          processingResults = await triggerPostProcessing(allSavedPostIds);
          postsProcessed = processingResults.filter(r => r.success).length;
          console.log(`[PROCESSOR] Triggered processing for ${postsProcessed}/${allSavedPostIds.length} posts`);
        } catch (processingError) {
          console.error('[PROCESSOR] Error triggering post processing:', processingError);
        }
      }
    }

    const newPostCount = (account.postCount || 0) + totalNewPostsSaved;

    // Determine final status
    let status = 'ACTIVE';
    let message = '';
    let syncEventStatus = 'COMPLETED';
    
    if (wasRateLimited) {
      status = 'RATE_LIMITED';
      syncEventStatus = 'RATE_LIMITED';
      message = `Rate limited after saving ${totalNewPostsSaved} new posts (${totalPostsScanned} scanned). Run again to continue.`;
    } else if (wasTimeout) {
      status = 'ACTIVE';
      syncEventStatus = 'COMPLETED'; // Still completed from our perspective
      message = `Timeout after saving ${totalNewPostsSaved} new posts (${totalPostsScanned} scanned). Run again to continue.`;
    } else {
      message = totalNewPostsSaved > 0 
        ? `Found ${totalNewPostsSaved} new posts (scanned ${totalPostsScanned} total)` 
        : `No new posts (scanned ${totalPostsScanned} total)`;
      
      // Add API efficiency info for smart sync
      if (apiCallsSaved > 0) {
        message += ` [Smart sync saved ~${apiCallsSaved} API calls]`;
      }
    }

    // Update account
    const accountUpdate = {
      lastScrapedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastErrorMessage: wasRateLimited ? 'Rate limited - will resume on next sync' : null,
      status,
      postCount: newPostCount,
    };
    
    if (fetchAllHistory || isFullSync) {
      if (wasRateLimited || wasTimeout) {
        accountUpdate.fullSyncOldestPostDate = oldestPostDate;
        accountUpdate.hasFullHistory = false;
      } else {
        accountUpdate.fullSyncOldestPostDate = null;
        accountUpdate.hasFullHistory = true;
        accountUpdate.lastSuccessfulScrapeAt = new Date().toISOString();
      }
    } else {
      if (!wasRateLimited && !wasTimeout) {
        accountUpdate.lastSuccessfulScrapeAt = new Date().toISOString();
      }
    }
    
    await updateAccountAfterScrape(account.id, accountUpdate);

    // Update scrape attempt
    await updateScrapeAttempt(attemptId, {
      status: wasRateLimited ? 'RATE_LIMITED' : (wasTimeout ? 'TIMEOUT' : 'SUCCESS'),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      postsProcessed,
      syncType: isFullSync ? 'FULL_SYNC' : 'INCREMENTAL',
      oldestPostDate,
    });

    // Publish completion event
    await publishSyncProgress(account.id, syncEventStatus, {
      message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      rateLimited: wasRateLimited,
      pagesCompleted,
    });

    return {
      success: !wasRateLimited,
      message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      postsProcessed,
      rateLimited: wasRateLimited,
      timeout: wasTimeout,
      oldestPostDate,
    };

  } catch (error) {
    console.error(`Scrape failed for account ${account.id}:`, error);

    const consecutiveFailures = (account.consecutiveFailures || 0) + 1;
    const newPostCount = (account.postCount || 0) + totalNewPostsSaved;

    await updateAccountAfterScrape(account.id, {
      lastScrapedAt: new Date().toISOString(),
      consecutiveFailures,
      lastErrorMessage: error.message,
      status: consecutiveFailures >= 3 ? 'ERROR' : account.status,
      postCount: newPostCount,
      fullSyncOldestPostDate: oldestPostDate || account.fullSyncOldestPostDate,
    });

    if (attemptId) {
      await updateScrapeAttempt(attemptId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
        postsFound: totalPostsScanned,
        newPostsAdded: totalNewPostsSaved,
      });
    }

    // Publish failure event
    await publishSyncProgress(account.id, 'FAILED', {
      message: error.message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      pagesCompleted,
    });

    return {
      success: false,
      message: error.message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      rateLimited: wasRateLimited,
      timeout: wasTimeout,
    };
  }
}

// ============================================
// Social Post Processor Integration
// ============================================

async function triggerPostProcessing(postIds) {
  const results = [];
  
  // Process in batches to avoid overwhelming the processor
  const batches = [];
  for (let i = 0; i < postIds.length; i += MAX_PARALLEL_PROCESSING) {
    batches.push(postIds.slice(i, i + MAX_PARALLEL_PROCESSING));
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (postId) => {
      try {
        const payload = {
          fieldName: 'processSocialPost',
          arguments: {
            input: {
              socialPostId: postId,
              skipLinking: false,
              skipMatching: false
            }
          }
        };
        
        await lambdaClient.send(new InvokeCommand({
          FunctionName: SOCIAL_POST_PROCESSOR_FUNCTION,
          InvocationType: 'Event', // Async
          Payload: JSON.stringify(payload)
        }));
        
        return { postId, success: true };
      } catch (error) {
        console.error(`Failed to trigger processing for post ${postId}:`, error.message);
        return { postId, success: false, error: error.message };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

// ============================================
// Facebook API Functions
// ============================================

async function fetchPageInfo(pageId) {
  const fields = 'id,name,about,description,category,picture.type(large),followers_count,fan_count,website';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}?fields=${fields}&access_token=${FB_ACCESS_TOKEN}`;

  console.log('Fetching page info...');

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    console.error('Facebook API error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  return data;
}

async function downloadAndStorePageLogo(accountId, sourceUrl, pageName, forceRefresh = false) {
  const s3Key = `${S3_PREFIX}${accountId}/profile.jpg`;
  const region = process.env.REGION || 'ap-southeast-2';

  // Check if logo already exists (unless forcing refresh)
  if (!forceRefresh) {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key
      }));
      console.log('Logo already exists in S3, skipping download');
      return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
    } catch (error) {
      // File doesn't exist, continue with download
    }
  } else {
    // Force refresh - delete existing
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key
      }));
      console.log('Deleted existing logo for refresh');
    } catch {
      // Ignore delete errors
    }
  }

  try {
    console.log('Downloading page logo...');
    const imageBuffer = await downloadImage(sourceUrl);

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=86400',
      Metadata: {
        'page-name': pageName || 'unknown',
        'source-url': sourceUrl.substring(0, 500),
        'downloaded-at': new Date().toISOString()
      }
    }));

    const storedUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
    console.log('Logo stored to S3:', storedUrl);

    return storedUrl;
  } catch (error) {
    console.error('Error storing logo to S3:', error);
    return sourceUrl;
  }
}

async function downloadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const makeRequest = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = url.startsWith('https') ? https : require('http');

      protocol.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(imageUrl);
  });
}

async function downloadAndStorePostMedia(accountId, postId, mediaUrls) {
  if (!mediaUrls || mediaUrls.length === 0) {
    return { storedUrls: [], thumbnailUrl: null };
  }

  const storedUrls = [];
  let thumbnailUrl = null;
  const timestamp = Date.now();
  const region = process.env.REGION || 'ap-southeast-2';

  for (let i = 0; i < mediaUrls.length; i++) {
    const imageUrl = mediaUrls[i];
    
    try {
      let filename;
      try {
        const urlPath = new URL(imageUrl).pathname;
        const originalName = urlPath.split('/').pop().split('?')[0];
        filename = `${timestamp}-${i}-${originalName}`.substring(0, 100);
      } catch {
        filename = `${timestamp}-${i}-image.jpg`;
      }
      
      const s3Key = `${S3_POST_ATTACHMENTS_PREFIX}${accountId}/${postId}/${filename}`;

      console.log(`Downloading media ${i + 1}/${mediaUrls.length}...`);
      
      const imageBuffer = await downloadImage(imageUrl);
      
      let contentType = 'image/jpeg';
      if (imageUrl.includes('.png')) contentType = 'image/png';
      else if (imageUrl.includes('.gif')) contentType = 'image/gif';
      else if (imageUrl.includes('.webp')) contentType = 'image/webp';

      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: contentType,
        CacheControl: 'max-age=31536000',
        Metadata: {
          'source-url': imageUrl.substring(0, 500),
          'downloaded-at': new Date().toISOString(),
          'post-id': postId
        }
      }));

      const storedUrl = `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
      storedUrls.push(storedUrl);
      
      if (i === 0) {
        thumbnailUrl = storedUrl;
      }
      
    } catch (error) {
      console.error(`Error downloading media ${i + 1}:`, error.message);
      storedUrls.push(imageUrl);
      if (i === 0) {
        thumbnailUrl = imageUrl;
      }
    }
  }

  return { storedUrls, thumbnailUrl };
}

async function fetchFacebookPosts(pageId, limit = 25) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${limit}`;

  console.log('Fetching posts from:', `${FB_API_VERSION}/${pageId}/posts (limit: ${limit})`);

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    console.error('Facebook API error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  return data.data || [];
}

async function fetchAllFacebookPostsWithCallback(pageId, onPageFetched, context = null, resumeFromDate = null) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}`;
  
  if (resumeFromDate) {
    const untilTimestamp = Math.floor(new Date(resumeFromDate).getTime() / 1000);
    url += `&until=${untilTimestamp}`;
    console.log(`Resuming from ${resumeFromDate} (until=${untilTimestamp})`);
  }
  
  let pageCount = 0;
  const SAFETY_MARGIN_MS = 10000;

  console.log('Starting full post fetch with incremental saving...');

  while (url && pageCount < MAX_PAGES_TO_FETCH) {
    if (context && typeof context.getRemainingTimeInMillis === 'function') {
      const remainingTime = context.getRemainingTimeInMillis();
      if (remainingTime < SAFETY_MARGIN_MS) {
        console.warn(`Approaching timeout (${remainingTime}ms remaining), stopping at page ${pageCount}`);
        return { 
          rateLimited: false, 
          timeout: true, 
          pagesCompleted: pageCount 
        };
      }
    }
    
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);
    
    let data;
    try {
      const response = await httpGet(url);
      data = JSON.parse(response);
    } catch (error) {
      console.error(`Network error on page ${pageCount}:`, error.message);
      return { 
        rateLimited: false, 
        timeout: false, 
        networkError: true,
        pagesCompleted: pageCount - 1 
      };
    }

    if (data.error) {
      console.error('Facebook API error:', data.error);
      
      if (data.error.code === 4 || data.error.message?.includes('limit')) {
        console.warn('Rate limit reached - saving progress and stopping');
        return { 
          rateLimited: true, 
          timeout: false, 
          pagesCompleted: pageCount - 1,
          error: data.error.message
        };
      }
      
      throw new Error(data.error.message || 'Facebook API error');
    }

    const posts = data.data || [];
    
    if (posts.length === 0) {
      console.log('No more posts to fetch');
      break;
    }

    console.log(`Page ${pageCount}: Got ${posts.length} posts`);
    
    await onPageFetched(posts, pageCount);

    url = data.paging?.next || null;
    
    if (!url) {
      console.log('Reached end of posts (no next page)');
    }
  }

  if (pageCount >= MAX_PAGES_TO_FETCH) {
    console.log(`Reached maximum page limit (${MAX_PAGES_TO_FETCH})`);
  }

  console.log(`Pagination complete: ${pageCount} pages fetched`);
  
  return { 
    rateLimited: false, 
    timeout: false, 
    pagesCompleted: pageCount 
  };
}

/**
 * Fetch posts NEWER than a timestamp (using 'since' parameter)
 * Returns all posts in a single array (no callback, for simpler newer-posts fetch)
 */
async function fetchFacebookPostsSince(pageId, sinceTimestamp) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}&since=${sinceTimestamp}`;
  
  const allPosts = [];
  let pageCount = 0;

  console.log(`Starting incremental fetch (since ${new Date(sinceTimestamp * 1000).toISOString()})...`);

  while (url && pageCount < MAX_PAGES_TO_FETCH) {
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);
    
    const response = await httpGet(url);
    const data = JSON.parse(response);

    if (data.error) {
      console.error('Facebook API error:', data.error);
      throw new Error(data.error.message || 'Facebook API error');
    }

    const posts = data.data || [];
    allPosts.push(...posts);
    console.log(`Page ${pageCount}: Got ${posts.length} posts (total: ${allPosts.length})`);

    if (posts.length === 0) {
      break;
    }

    url = data.paging?.next || null;
  }

  console.log(`Incremental fetch complete: ${allPosts.length} posts in ${pageCount} pages`);
  
  return allPosts;
}

/**
 * NEW: Fetch posts OLDER than a timestamp (using 'until' parameter)
 * Uses callback pattern for incremental saving
 */
async function fetchFacebookPostsUntil(pageId, untilTimestamp, onPageFetched, context = null, startingPageCount = 0) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}&until=${untilTimestamp}`;
  
  let pageCount = startingPageCount;
  const SAFETY_MARGIN_MS = 10000;

  console.log(`Starting older posts fetch (until ${new Date(untilTimestamp * 1000).toISOString()})...`);

  while (url && pageCount < MAX_PAGES_TO_FETCH) {
    // Check for Lambda timeout
    if (context && typeof context.getRemainingTimeInMillis === 'function') {
      const remainingTime = context.getRemainingTimeInMillis();
      if (remainingTime < SAFETY_MARGIN_MS) {
        console.warn(`[UNTIL] Approaching timeout (${remainingTime}ms remaining), stopping at page ${pageCount}`);
        return { 
          rateLimited: false, 
          timeout: true, 
          pagesCompleted: pageCount - startingPageCount
        };
      }
    }
    
    pageCount++;
    console.log(`[UNTIL] Fetching page ${pageCount}...`);
    
    let data;
    try {
      const response = await httpGet(url);
      data = JSON.parse(response);
    } catch (error) {
      console.error(`[UNTIL] Network error on page ${pageCount}:`, error.message);
      return { 
        rateLimited: false, 
        timeout: false, 
        networkError: true,
        pagesCompleted: pageCount - startingPageCount - 1
      };
    }

    if (data.error) {
      console.error('[UNTIL] Facebook API error:', data.error);
      
      if (data.error.code === 4 || data.error.message?.includes('limit')) {
        console.warn('[UNTIL] Rate limit reached - saving progress and stopping');
        return { 
          rateLimited: true, 
          timeout: false, 
          pagesCompleted: pageCount - startingPageCount - 1,
          error: data.error.message
        };
      }
      
      throw new Error(data.error.message || 'Facebook API error');
    }

    const posts = data.data || [];
    
    if (posts.length === 0) {
      console.log('[UNTIL] No more older posts to fetch');
      break;
    }

    console.log(`[UNTIL] Page ${pageCount}: Got ${posts.length} posts`);
    
    await onPageFetched(posts, pageCount);

    url = data.paging?.next || null;
    
    if (!url) {
      console.log('[UNTIL] Reached end of posts (no next page)');
    }
  }

  if (pageCount >= MAX_PAGES_TO_FETCH) {
    console.log(`[UNTIL] Reached maximum page limit (${MAX_PAGES_TO_FETCH})`);
  }

  console.log(`[UNTIL] Older posts fetch complete: ${pageCount - startingPageCount} pages fetched`);
  
  return { 
    rateLimited: false, 
    timeout: false, 
    pagesCompleted: pageCount - startingPageCount
  };
}

// ============================================
// Post Processing Functions
// ============================================

async function processAndSavePostsBatch(account, posts) {
  const newPosts = [];
  const savedPostIds = [];
  let oldestDate = null;
  const now = new Date().toISOString();

  // First pass: identify which posts are new (for accurate progress tracking)
  const newPostsToProcess = [];
  for (const fbPost of posts) {
    const postDate = fbPost.created_time;
    if (postDate) {
        // Convert to proper ISO format (AWSDateTime compatible)
        const normalizedDate = new Date(postDate).toISOString();
        if (!oldestDate || normalizedDate < oldestDate) {
            oldestDate = normalizedDate;
        }
    }
    
    const postId = `${account.platform}_${fbPost.id}`;
    const existingPost = await getExistingPost(postId);
    
    if (!existingPost) {
      newPostsToProcess.push({ fbPost, postId, postDate });
    }
  }
  
  // If we have new posts to download, publish initial progress
  if (newPostsToProcess.length > 0) {
    console.log(`[DOWNLOAD] Found ${newPostsToProcess.length} new posts to download`);
    await publishDownloadProgress(
      account.id, 
      0, 
      newPostsToProcess.length, 
      null, 
      false
    );
  }
  
  // Second pass: process and save new posts with progress updates
  for (let i = 0; i < newPostsToProcess.length; i++) {
    const { fbPost, postId, postDate } = newPostsToProcess[i];
    const hasMedia = !!fbPost.full_picture;
    
    // Publish download progress
    await publishDownloadProgress(
      account.id, 
      i + 1, 
      newPostsToProcess.length, 
      postDate,
      hasMedia
    );
    
    console.log(`NEW post found: ${postId} (posted: ${fbPost.created_time})`);
    
    const postedAt = new Date(fbPost.created_time).toISOString();
    
    let mediaUrls = [];
    let thumbnailUrl = null;
    
    if (fbPost.full_picture) {
      const mediaResult = await downloadAndStorePostMedia(
        account.id,
        fbPost.id,
        [fbPost.full_picture]
      );
      mediaUrls = mediaResult.storedUrls;
      thumbnailUrl = mediaResult.thumbnailUrl;
    }
    
    const newPost = {
      id: postId,
      platformPostId: fbPost.id,
      postUrl: fbPost.permalink_url,
      postType: fbPost.full_picture ? 'IMAGE' : 'TEXT',
      content: fbPost.message || '',
      contentPreview: (fbPost.message || '').substring(0, 200),
      mediaUrls: mediaUrls,
      thumbnailUrl: thumbnailUrl,
      likeCount: fbPost.reactions?.summary?.total_count || 0,
      commentCount: fbPost.comments?.summary?.total_count || 0,
      shareCount: fbPost.shares?.count || 0,
      postedAt,
      postYearMonth: getPostYearMonth(postedAt),
      scrapedAt: now,
      status: 'ACTIVE',
      processingStatus: 'PENDING',
      isPromotional: detectPromotional(fbPost.message),
      isTournamentRelated: detectTournamentRelated(fbPost.message),
      tags: extractTags(fbPost.message),
      socialAccountId: account.id,
      accountName: account.accountName,
      accountProfileImageUrl: account.profileImageUrl,
      platform: account.platform,
      createdAt: now,
      updatedAt: now,
      __typename: 'SocialPost',
      _version: 1,
      _lastChangedAt: Date.now(),
    };
    
    if (account.entityId) newPost.entityId = account.entityId;
    if (account.venueId) newPost.venueId = account.venueId;

    await savePost(newPost);
    newPosts.push(newPost);
    savedPostIds.push(postId);
  }

  return { newPosts, savedPostIds, oldestDate };
}

// ============================================
// Utility Functions
// ============================================

function extractPageIdFromUrl(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts[0] === 'pages' && pathParts.length >= 3) {
      return pathParts[2];
    }

    if (pathParts[0] === 'profile.php') {
      const params = new URLSearchParams(urlObj.search);
      return params.get('id');
    }

    return pathParts[0];
  } catch {
    return url;
  }
}

function getPostYearMonth(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

function detectPromotional(content) {
  if (!content) return false;

  const keywords = [
    'discount', 'sale', 'offer', 'promo', 'deal', 'special',
    'buy now', 'limited time', 'register now', 'sign up',
    'book now', 'early bird', 'free entry', 'freeroll',
  ];

  const lower = content.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

function detectTournamentRelated(content) {
  if (!content) return false;

  const keywords = [
    'tournament', 'tourney', 'event', 'series', 'main event',
    'satellite', 'qualifier', 'gtd', 'guaranteed', 'buy-in',
    'buyin', 'stack', 'levels', 'blind', 'final table',
    'winner', 'champion', 'prize', 'prizepool', 'nlhe', 'plo',
  ];

  const lower = content.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

function extractTags(content) {
  if (!content) return [];

  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];

  return matches.map(tag => tag.substring(1).toLowerCase());
}

// ============================================
// DynamoDB Helper Functions
// ============================================

async function getSocialAccount(id) {
  console.log('Getting social account:', id);
  console.log('Table:', SOCIAL_ACCOUNT_TABLE);

  const result = await docClient.send(new GetCommand({
    TableName: SOCIAL_ACCOUNT_TABLE,
    Key: { id },
  }));

  console.log('Account found:', result.Item ? 'yes' : 'no');
  return result.Item;
}

async function getAccountsDueForScrape() {
  const now = new Date();

  const result = await docClient.send(new ScanCommand({
    TableName: SOCIAL_ACCOUNT_TABLE,
    FilterExpression: 'isScrapingEnabled = :enabled AND #status <> :error AND platform = :facebook',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':enabled': true,
      ':error': 'ERROR',
      ':facebook': 'FACEBOOK',
    },
  }));

  return (result.Items || []).filter(account => {
    if (!account.lastScrapedAt) return true;

    const lastScrape = new Date(account.lastScrapedAt);
    const frequencyMs = (account.scrapeFrequencyMinutes || 60) * 60 * 1000;

    return now.getTime() - lastScrape.getTime() >= frequencyMs;
  });
}

async function updateAccountAfterScrape(id, updates) {
  const updateParts = [];
  const names = {};
  const values = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  });

  updateParts.push('#updatedAt = :updatedAt');
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: SOCIAL_ACCOUNT_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function createScrapeAttempt(socialAccountId, syncType = 'INCREMENTAL') {
  if (!SOCIAL_SCRAPE_ATTEMPT_TABLE) {
    console.warn('SOCIAL_SCRAPE_ATTEMPT_TABLE not configured');
    return null;
  }

  const id = `${socialAccountId}_${Date.now()}`;
  const now = new Date().toISOString();

  await docClient.send(new PutCommand({
    TableName: SOCIAL_SCRAPE_ATTEMPT_TABLE,
    Item: {
      id,
      socialAccountId,
      status: 'RUNNING',
      startedAt: now,
      triggerSource: 'MANUAL',
      syncType,
      createdAt: now,
      updatedAt: now,
      __typename: 'SocialScrapeAttempt',
      _version: 1,
      _lastChangedAt: Date.now(),
    },
  }));

  return id;
}

async function updateScrapeAttempt(id, updates) {
  if (!id || !SOCIAL_SCRAPE_ATTEMPT_TABLE) {
    return;
  }

  updates.updatedAt = new Date().toISOString();

  const updateParts = [];
  const names = {};
  const values = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  });

  await docClient.send(new UpdateCommand({
    TableName: SOCIAL_SCRAPE_ATTEMPT_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function getExistingPost(id) {
  const result = await docClient.send(new GetCommand({
    TableName: SOCIAL_POST_TABLE,
    Key: { id },
  }));
  return result.Item;
}

async function savePost(post) {
  console.log('Saving post:', post.id);
  await docClient.send(new PutCommand({
    TableName: SOCIAL_POST_TABLE,
    Item: post,
  }));
}

// ============================================
// HTTP Helper
// ============================================

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}