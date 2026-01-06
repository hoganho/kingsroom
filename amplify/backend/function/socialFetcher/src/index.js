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
 * - CANCELLABLE: Can be stopped mid-sync via ScrapeAttempt.cancellationRequested flag
 * - AUTO-STOP ON ERROR: Gracefully stops and saves progress after consecutive errors
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
const S3_BUCKET = process.env.SOCIAL_MEDIA_BUCKET || '';
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

// Cancellation check frequency (check every N pages to avoid excessive DynamoDB reads)
const CANCELLATION_CHECK_FREQUENCY = 2;

// Maximum consecutive errors before auto-stopping
const MAX_CONSECUTIVE_ERRORS = 3;

// Social Post Processor Configuration
const SOCIAL_POST_PROCESSOR_FUNCTION = process.env.SOCIAL_POST_PROCESSOR_FUNCTION;
const AUTO_PROCESS_POSTS = process.env.AUTO_PROCESS_POSTS !== 'false';
const MAX_PARALLEL_PROCESSING = parseInt(process.env.MAX_PARALLEL_PROCESSING || '5', 10);

// ============================================
// Stop Reason Enum
// ============================================

const StopReason = {
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',        // User requested cancellation
  RATE_LIMITED: 'RATE_LIMITED',  // Facebook API rate limit
  TIMEOUT: 'TIMEOUT',            // Lambda timeout approaching
  ERROR: 'ERROR',                // Too many consecutive errors
  NETWORK_ERROR: 'NETWORK_ERROR' // Network connectivity issues
};

// ============================================
// Cancellation Support (uses SocialScrapeAttempt)
// ============================================

/**
 * Check if sync cancellation has been requested for a scrape attempt
 * Returns true if cancellation was requested
 */
async function checkCancellationRequested(attemptId) {
  if (!attemptId || !SOCIAL_SCRAPE_ATTEMPT_TABLE) {
    return false;
  }
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: SOCIAL_SCRAPE_ATTEMPT_TABLE,
      Key: { id: attemptId },
      ProjectionExpression: 'cancellationRequested',
    }));
    
    const isCancelled = result.Item?.cancellationRequested === true;
    if (isCancelled) {
      console.log(`[CANCELLATION] Cancellation requested for attempt ${attemptId}`);
    }
    return isCancelled;
  } catch (error) {
    console.warn('Error checking cancellation status:', error.message);
    return false; // Continue on error
  }
}

/**
 * Clear the cancellation flag after sync completes or is cancelled
 */
async function clearCancellationFlag(attemptId) {
  if (!attemptId || !SOCIAL_SCRAPE_ATTEMPT_TABLE) {
    return;
  }
  
  try {
    await docClient.send(new UpdateCommand({
      TableName: SOCIAL_SCRAPE_ATTEMPT_TABLE,
      Key: { id: attemptId },
      UpdateExpression: 'SET cancellationRequested = :false, updatedAt = :now',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': new Date().toISOString(),
      },
    }));
    console.log(`[CANCELLATION] Cleared cancellation flag for attempt ${attemptId}`);
  } catch (error) {
    console.warn('Error clearing cancellation flag:', error.message);
  }
}

// ============================================
// Minimal Pre-Processing (for display only)
// NOTE: ALL classification is done by socialPostProcessor Lambda
// ============================================

/**
 * Extract hashtags from content (for initial display)
 * Processor will add classification tags
 */
function extractHashtags(content) {
  if (!content) return [];
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return matches.map(tag => tag.substring(1).toLowerCase());
}

/**
 * Build rawContent object for storage
 * This is the authoritative source - processor uses this for classification
 */
function buildRawContent(fbPost) {
  return JSON.stringify({
    // Original Facebook post data (everything processor needs)
    fb_id: fbPost.id,
    fb_message: fbPost.message,
    fb_created_time: fbPost.created_time,
    fb_permalink_url: fbPost.permalink_url,
    fb_full_picture: fbPost.full_picture,
    fb_reactions: fbPost.reactions?.summary,
    fb_comments: fbPost.comments?.summary,
    fb_shares: fbPost.shares,
    fb_attachments: fbPost.attachments,
    
    // Source tracking
    _source: 'socialFetcher',
    _fetchedAt: new Date().toISOString(),
  });
}

// ============================================
// AppSync Subscription Publishing
// ============================================

/**
 * Publish sync progress to AppSync subscription
 * This allows the frontend to receive real-time updates
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
const DOWNLOAD_PROGRESS_THROTTLE_MS = 500;

async function publishDownloadProgress(socialAccountId, current, total, postDate, hasMedia) {
  const now = Date.now();
  
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
// Smart Post Date Range Query
// ============================================

/**
 * Get the oldest and newest post dates for an account
 */
async function getPostDateRange(socialAccountId) {
  console.log(`[SMART SYNC] Getting post date range for account ${socialAccountId}...`);
  
  try {
    const oldestResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      ScanIndexForward: true,
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    const newestResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      ScanIndexForward: false,
      Limit: 1,
      ProjectionExpression: 'id, postedAt'
    }));
    
    const countResult = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_TABLE,
      IndexName: 'bySocialAccount',
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: { ':accountId': socialAccountId },
      Select: 'COUNT'
    }));
    
    const oldestPost = oldestResult.Items?.[0];
    const newestPost = newestResult.Items?.[0];
    const totalPosts = countResult.Count || 0;
    
    if (!oldestPost || !newestPost) {
      console.log(`[SMART SYNC] No existing posts found for account`);
      return { oldestPostDate: null, newestPostDate: null, oldestTimestamp: null, newestTimestamp: null, totalPosts: 0 };
    }
    
    const oldestDate = oldestPost.postedAt;
    const newestDate = newestPost.postedAt;
    const oldestTimestamp = Math.floor(new Date(oldestDate).getTime() / 1000);
    const newestTimestamp = Math.floor(new Date(newestDate).getTime() / 1000);
    
    console.log(`[SMART SYNC] Found ${totalPosts} existing posts: oldest ${oldestDate}, newest ${newestDate}`);
    
    return { oldestPostDate: oldestDate, newestPostDate: newestDate, oldestTimestamp, newestTimestamp, totalPosts };
    
  } catch (error) {
    console.error('[SMART SYNC] Error getting post date range:', error);
    return { oldestPostDate: null, newestPostDate: null, oldestTimestamp: null, newestTimestamp: null, totalPosts: 0 };
  }
}

// ============================================
// Main Scrape Function
// ============================================

/**
 * Main scrape function for an account
 * Features: SMART FULL SYNC, incremental saving, cancellation support, auto-stop on error
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
  let pagesCompleted = 0;
  let apiCallsSaved = 0;
  
  // Stop tracking
  let stopReason = StopReason.COMPLETED;
  let stopMessage = null;
  let lastError = null;
  
  // Determine "since" timestamp for incremental fetches
  let sinceTimestamp = null;
  if (!fetchAllHistory && account.lastSuccessfulScrapeAt) {
    const now = Date.now();
    const lastScrapeTime = new Date(account.lastSuccessfulScrapeAt).getTime();
    const option1 = now - (24 * 60 * 60 * 1000);
    const option2 = lastScrapeTime - (24 * 60 * 60 * 1000);
    const sinceMs = Math.min(option1, option2);
    sinceTimestamp = Math.floor(sinceMs / 1000);
    
    const hoursSinceLastScrape = Math.round((now - lastScrapeTime) / (60 * 60 * 1000));
    console.log(`Incremental fetch: last scrape was ${hoursSinceLastScrape}h ago, looking back to ${new Date(sinceMs).toISOString()}`);
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
    
    console.log(`[SYNC] Created attempt ${attemptId} for account ${account.id}`);

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
      
      if (oldestDate && (!oldestPostDate || oldestDate < oldestPostDate)) {
        oldestPostDate = oldestDate;
      }
      
      console.log(`Page ${pageNumber}: ${newPosts.length} new posts saved (total: ${totalNewPostsSaved} new, ${totalPostsScanned} scanned)`);
      
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
    
    // Create sync context with attemptId for cancellation checks
    const syncContext = {
      lambdaContext: context,
      attemptId,
      accountId: account.id,
    };
    
    if (fetchAllHistory) {
      // ================================================================
      // SMART FULL SYNC
      // ================================================================
      console.log('[SMART SYNC] Starting smart full sync...');
      
      const dateRange = await getPostDateRange(account.id);
      
      if (dateRange.totalPosts > 0 && dateRange.oldestTimestamp && dateRange.newestTimestamp) {
        console.log(`[SMART SYNC] Found ${dateRange.totalPosts} existing posts, fetching only new content...`);
        
        await publishSyncProgress(account.id, 'IN_PROGRESS', {
          message: `Smart sync: ${dateRange.totalPosts} posts already downloaded, fetching only missing posts...`,
          postsFound: 0,
          newPostsAdded: 0,
          pagesCompleted: 0,
        });
        
        let newerResult = { stopReason: StopReason.COMPLETED, pagesCompleted: 0 };
        let olderResult = { stopReason: StopReason.COMPLETED, pagesCompleted: 0 };
        
        // Step 1: Fetch NEWER posts
        const sinceNewest = dateRange.newestTimestamp + 1;
        console.log(`[SMART SYNC] Step 1: Fetching posts NEWER than ${dateRange.newestPostDate}...`);
        
        try {
          const newerPosts = await fetchFacebookPostsSince(pageId, sinceNewest);
          if (newerPosts.length > 0) {
            console.log(`[SMART SYNC] Found ${newerPosts.length} newer posts`);
            await onPageFetched(newerPosts, 1);
            newerResult.pagesCompleted = 1;
          } else {
            console.log('[SMART SYNC] No newer posts found');
          }
        } catch (newerError) {
          console.error('[SMART SYNC] Error fetching newer posts:', newerError.message);
          lastError = newerError;
          // Continue to try older posts
        }
        
        // Check for cancellation before continuing
        if (await checkCancellationRequested(attemptId)) {
          stopReason = StopReason.CANCELLED;
          stopMessage = 'Sync cancelled by user';
        }
        
        // Check for timeout
        if (stopReason === StopReason.COMPLETED && context?.getRemainingTimeInMillis?.() < 30000) {
          console.warn(`[SMART SYNC] Low time remaining, skipping older posts fetch`);
          stopReason = StopReason.TIMEOUT;
          stopMessage = 'Lambda timeout approaching';
        }
        
        // Step 2: Fetch OLDER posts
        if (stopReason === StopReason.COMPLETED) {
          const untilOldest = dateRange.oldestTimestamp - 1;
          console.log(`[SMART SYNC] Step 2: Fetching posts OLDER than ${dateRange.oldestPostDate}...`);
          
          olderResult = await fetchFacebookPostsUntil(
            pageId, 
            untilOldest, 
            onPageFetched, 
            syncContext,
            pagesCompleted
          );
          
          stopReason = olderResult.stopReason;
          stopMessage = olderResult.stopMessage;
          if (olderResult.lastError) lastError = olderResult.lastError;
        }
        
        pagesCompleted = newerResult.pagesCompleted + olderResult.pagesCompleted;
        
        const estimatedFullSyncPages = Math.ceil(dateRange.totalPosts / MAX_POSTS_PER_PAGE);
        apiCallsSaved = Math.max(0, estimatedFullSyncPages - pagesCompleted);
        console.log(`[SMART SYNC] Complete! Saved approximately ${apiCallsSaved} API calls`);
        
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
          syncContext,
          resumeFromDate
        );
        
        stopReason = result.stopReason;
        stopMessage = result.stopMessage;
        pagesCompleted = result.pagesCompleted;
        if (result.lastError) lastError = result.lastError;
      }
      
    } else if (sinceTimestamp) {
      console.log(`Fetching posts since timestamp: ${sinceTimestamp}`);
      try {
        const posts = await fetchFacebookPostsSince(pageId, sinceTimestamp);
        
        if (posts.length > 0) {
          await onPageFetched(posts, 1);
        }
        pagesCompleted = 1;
      } catch (fetchError) {
        console.error('Error fetching incremental posts:', fetchError.message);
        stopReason = StopReason.ERROR;
        stopMessage = fetchError.message;
        lastError = fetchError;
      }
      
    } else {
      console.log('First fetch - getting ALL historical posts with pagination...');
      
      const result = await fetchAllFacebookPostsWithCallback(pageId, onPageFetched, syncContext);
      
      stopReason = result.stopReason;
      stopMessage = result.stopMessage;
      pagesCompleted = result.pagesCompleted;
      if (result.lastError) lastError = result.lastError;
      isFullSync = true;
    }
    
    console.log(`Fetch complete: ${totalNewPostsSaved} new posts saved, ${totalPostsScanned} scanned, stopReason: ${stopReason}`);

    // ============================================
    // Trigger socialPostProcessor for new posts
    // ============================================
    let postsProcessed = 0;
    
    // Only process if completed successfully or cancelled (not on errors)
    const shouldProcess = AUTO_PROCESS_POSTS && !skipProcessing && allSavedPostIds.length > 0 && 
      (stopReason === StopReason.COMPLETED || stopReason === StopReason.CANCELLED);
    
    if (shouldProcess && SOCIAL_POST_PROCESSOR_FUNCTION) {
      console.log(`[PROCESSOR] Auto-processing ${allSavedPostIds.length} new posts...`);
      
      try {
        const processingResults = await triggerPostProcessing(allSavedPostIds);
        postsProcessed = processingResults.filter(r => r.success).length;
        console.log(`[PROCESSOR] Triggered processing for ${postsProcessed}/${allSavedPostIds.length} posts`);
      } catch (processingError) {
        console.error('[PROCESSOR] Error triggering post processing:', processingError);
      }
    }

    // ============================================
    // Determine final status and update records
    // ============================================
    const newPostCount = (account.postCount || 0) + totalNewPostsSaved;
    let status = 'ACTIVE';
    let message = '';
    let syncEventStatus = 'COMPLETED';
    let scrapeAttemptStatus = 'SUCCESS';
    
    switch (stopReason) {
      case StopReason.CANCELLED:
        syncEventStatus = 'CANCELLED';
        scrapeAttemptStatus = 'CANCELLED';
        message = `Sync cancelled by user. Saved ${totalNewPostsSaved} posts (${totalPostsScanned} scanned).`;
        break;
        
      case StopReason.RATE_LIMITED:
        status = 'RATE_LIMITED';
        syncEventStatus = 'RATE_LIMITED';
        scrapeAttemptStatus = 'RATE_LIMITED';
        message = `Rate limited after saving ${totalNewPostsSaved} posts (${totalPostsScanned} scanned). Run again to continue.`;
        break;
        
      case StopReason.TIMEOUT:
        scrapeAttemptStatus = 'TIMEOUT';
        message = `Timeout after saving ${totalNewPostsSaved} posts (${totalPostsScanned} scanned). Run again to continue.`;
        break;
        
      case StopReason.ERROR:
      case StopReason.NETWORK_ERROR:
        syncEventStatus = 'ERROR_STOPPED';
        scrapeAttemptStatus = 'ERROR_STOPPED';
        message = `Stopped due to errors after saving ${totalNewPostsSaved} posts. Error: ${stopMessage || lastError?.message || 'Unknown error'}`;
        break;
        
      case StopReason.COMPLETED:
      default:
        message = totalNewPostsSaved > 0 
          ? `Found ${totalNewPostsSaved} new posts (scanned ${totalPostsScanned} total)` 
          : `No new posts (scanned ${totalPostsScanned} total)`;
        if (apiCallsSaved > 0) {
          message += ` [Smart sync saved ~${apiCallsSaved} API calls]`;
        }
        break;
    }

    // Update account
    const accountUpdate = {
      lastScrapedAt: new Date().toISOString(),
      consecutiveFailures: stopReason === StopReason.ERROR ? (account.consecutiveFailures || 0) + 1 : 0,
      lastErrorMessage: stopReason !== StopReason.COMPLETED ? (stopMessage || lastError?.message || null) : null,
      status,
      postCount: newPostCount,
    };
    
    if (fetchAllHistory || isFullSync) {
      const didNotComplete = stopReason !== StopReason.COMPLETED;
      if (didNotComplete) {
        accountUpdate.fullSyncOldestPostDate = oldestPostDate;
        accountUpdate.hasFullHistory = false;
      } else {
        accountUpdate.fullSyncOldestPostDate = null;
        accountUpdate.hasFullHistory = true;
        accountUpdate.lastSuccessfulScrapeAt = new Date().toISOString();
      }
    } else {
      if (stopReason === StopReason.COMPLETED) {
        accountUpdate.lastSuccessfulScrapeAt = new Date().toISOString();
      }
    }
    
    await updateAccountAfterScrape(account.id, accountUpdate);
    
    // Clear cancellation flag
    await clearCancellationFlag(attemptId);

    // Update scrape attempt
    await updateScrapeAttempt(attemptId, {
      status: scrapeAttemptStatus,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      postsProcessed,
      syncType: isFullSync ? 'FULL_SYNC' : 'INCREMENTAL',
      oldestPostDate,
      errorMessage: stopReason !== StopReason.COMPLETED ? (stopMessage || lastError?.message) : null,
    });

    // Publish completion event
    await publishSyncProgress(account.id, syncEventStatus, {
      message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      rateLimited: stopReason === StopReason.RATE_LIMITED,
      pagesCompleted,
    });

    return {
      success: stopReason === StopReason.COMPLETED,
      message,
      postsFound: totalPostsScanned,
      newPostsAdded: totalNewPostsSaved,
      postsProcessed,
      rateLimited: stopReason === StopReason.RATE_LIMITED,
      timeout: stopReason === StopReason.TIMEOUT,
      cancelled: stopReason === StopReason.CANCELLED,
      errorStopped: stopReason === StopReason.ERROR || stopReason === StopReason.NETWORK_ERROR,
      oldestPostDate,
      attemptId,
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
    
    await clearCancellationFlag(attemptId);

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
      rateLimited: false,
      timeout: false,
      cancelled: false,
      errorStopped: true,
      attemptId,
    };
  }
}

// ============================================
// Post Processor Trigger
// ============================================

async function triggerPostProcessing(postIds) {
  if (!SOCIAL_POST_PROCESSOR_FUNCTION || postIds.length === 0) {
    return [];
  }
  
  console.log(`[PROCESSOR] Triggering processing for ${postIds.length} posts`);
  
  const results = [];
  
  // Process in batches to avoid overwhelming Lambda
  for (let i = 0; i < postIds.length; i += MAX_PARALLEL_PROCESSING) {
    const batch = postIds.slice(i, i + MAX_PARALLEL_PROCESSING);
    
    const batchPromises = batch.map(async (postId) => {
      try {
        const payload = {
          operation: 'processPost',
          arguments: {
            input: {
              socialPostId: postId,
              forceReprocess: false
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

/**
 * Fetch ALL posts with pagination, incremental saving, cancellation & error handling
 */
async function fetchAllFacebookPostsWithCallback(pageId, onPageFetched, syncContext = {}, resumeFromDate = null) {
  const { lambdaContext, attemptId } = syncContext;
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}`;
  
  if (resumeFromDate) {
    const untilTimestamp = Math.floor(new Date(resumeFromDate).getTime() / 1000);
    url += `&until=${untilTimestamp}`;
    console.log(`Resuming from ${resumeFromDate} (until=${untilTimestamp})`);
  }
  
  let pageCount = 0;
  let consecutiveErrors = 0;
  let lastError = null;
  const SAFETY_MARGIN_MS = 10000;

  console.log('Starting full post fetch with incremental saving...');

  while (url && pageCount < MAX_PAGES_TO_FETCH) {
    // Check for cancellation periodically
    if (attemptId && pageCount > 0 && pageCount % CANCELLATION_CHECK_FREQUENCY === 0) {
      if (await checkCancellationRequested(attemptId)) {
        console.log(`[CANCELLATION] Sync cancelled by user at page ${pageCount}`);
        return { 
          stopReason: StopReason.CANCELLED, 
          stopMessage: 'Cancelled by user',
          pagesCompleted: pageCount 
        };
      }
    }
    
    // Check for timeout
    if (lambdaContext?.getRemainingTimeInMillis?.() < SAFETY_MARGIN_MS) {
      console.warn(`Approaching timeout (${lambdaContext.getRemainingTimeInMillis()}ms remaining), stopping at page ${pageCount}`);
      return { 
        stopReason: StopReason.TIMEOUT, 
        stopMessage: 'Lambda timeout approaching',
        pagesCompleted: pageCount 
      };
    }
    
    pageCount++;
    console.log(`Fetching page ${pageCount}...`);
    
    let data;
    try {
      const response = await httpGet(url);
      data = JSON.parse(response);
      consecutiveErrors = 0; // Reset on success
    } catch (error) {
      console.error(`Network error on page ${pageCount}:`, error.message);
      consecutiveErrors++;
      lastError = error;
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive network errors, stopping`);
        return { 
          stopReason: StopReason.NETWORK_ERROR, 
          stopMessage: `${consecutiveErrors} consecutive network errors: ${error.message}`,
          lastError,
          pagesCompleted: pageCount - 1 
        };
      }
      
      // Wait and retry
      console.log(`Waiting 2s before retry (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (data.error) {
      console.error('Facebook API error:', data.error);
      
      if (data.error.code === 4 || data.error.message?.includes('limit')) {
        console.warn('Rate limit reached - saving progress and stopping');
        return { 
          stopReason: StopReason.RATE_LIMITED, 
          stopMessage: data.error.message,
          pagesCompleted: pageCount - 1
        };
      }
      
      // Other API errors - count as consecutive error
      consecutiveErrors++;
      lastError = new Error(data.error.message || 'Facebook API error');
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive API errors, stopping`);
        return { 
          stopReason: StopReason.ERROR, 
          stopMessage: `${consecutiveErrors} consecutive errors: ${data.error.message}`,
          lastError,
          pagesCompleted: pageCount - 1 
        };
      }
      
      console.log(`API error, waiting 2s before retry (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const posts = data.data || [];
    
    if (posts.length === 0) {
      console.log('No more posts to fetch');
      break;
    }

    console.log(`Page ${pageCount}: Got ${posts.length} posts`);
    
    try {
      await onPageFetched(posts, pageCount);
    } catch (processError) {
      console.error(`Error processing page ${pageCount}:`, processError.message);
      consecutiveErrors++;
      lastError = processError;
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive processing errors, stopping`);
        return { 
          stopReason: StopReason.ERROR, 
          stopMessage: `Error processing posts: ${processError.message}`,
          lastError,
          pagesCompleted: pageCount - 1 
        };
      }
    }

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
    stopReason: StopReason.COMPLETED, 
    pagesCompleted: pageCount 
  };
}

/**
 * Fetch posts NEWER than a timestamp (using 'since' parameter)
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
 * Fetch posts OLDER than a timestamp with cancellation & error handling
 */
async function fetchFacebookPostsUntil(pageId, untilTimestamp, onPageFetched, syncContext = {}, startingPageCount = 0) {
  const { lambdaContext, attemptId } = syncContext;
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}&until=${untilTimestamp}`;
  
  let pageCount = startingPageCount;
  let consecutiveErrors = 0;
  let lastError = null;
  const SAFETY_MARGIN_MS = 10000;

  console.log(`[UNTIL] Starting older posts fetch (until ${new Date(untilTimestamp * 1000).toISOString()})...`);

  while (url && pageCount < MAX_PAGES_TO_FETCH + startingPageCount) {
    // Check for cancellation
    if (attemptId && (pageCount - startingPageCount) > 0 && (pageCount - startingPageCount) % CANCELLATION_CHECK_FREQUENCY === 0) {
      if (await checkCancellationRequested(attemptId)) {
        console.log(`[CANCELLATION] Sync cancelled by user at page ${pageCount}`);
        return { 
          stopReason: StopReason.CANCELLED, 
          stopMessage: 'Cancelled by user',
          pagesCompleted: pageCount - startingPageCount 
        };
      }
    }
    
    // Check for Lambda timeout
    if (lambdaContext?.getRemainingTimeInMillis?.() < SAFETY_MARGIN_MS) {
      console.warn(`[UNTIL] Approaching timeout (${lambdaContext.getRemainingTimeInMillis()}ms remaining), stopping at page ${pageCount}`);
      return { 
        stopReason: StopReason.TIMEOUT, 
        stopMessage: 'Lambda timeout approaching',
        pagesCompleted: pageCount - startingPageCount
      };
    }
    
    pageCount++;
    console.log(`[UNTIL] Fetching page ${pageCount}...`);
    
    let data;
    try {
      const response = await httpGet(url);
      data = JSON.parse(response);
      consecutiveErrors = 0;
    } catch (error) {
      console.error(`[UNTIL] Network error on page ${pageCount}:`, error.message);
      consecutiveErrors++;
      lastError = error;
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive network errors, stopping`);
        return { 
          stopReason: StopReason.NETWORK_ERROR, 
          stopMessage: `${consecutiveErrors} consecutive network errors: ${error.message}`,
          lastError,
          pagesCompleted: pageCount - startingPageCount - 1
        };
      }
      
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (data.error) {
      console.error('[UNTIL] Facebook API error:', data.error);
      
      if (data.error.code === 4 || data.error.message?.includes('limit')) {
        console.warn('[UNTIL] Rate limit reached - saving progress and stopping');
        return { 
          stopReason: StopReason.RATE_LIMITED, 
          stopMessage: data.error.message,
          pagesCompleted: pageCount - startingPageCount - 1
        };
      }
      
      consecutiveErrors++;
      lastError = new Error(data.error.message || 'Facebook API error');
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive API errors, stopping`);
        return { 
          stopReason: StopReason.ERROR, 
          stopMessage: `${consecutiveErrors} consecutive errors: ${data.error.message}`,
          lastError,
          pagesCompleted: pageCount - startingPageCount - 1
        };
      }
      
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const posts = data.data || [];
    
    if (posts.length === 0) {
      console.log('[UNTIL] No more older posts to fetch');
      break;
    }

    console.log(`[UNTIL] Page ${pageCount}: Got ${posts.length} posts`);
    
    try {
      await onPageFetched(posts, pageCount);
    } catch (processError) {
      console.error(`[UNTIL] Error processing page ${pageCount}:`, processError.message);
      consecutiveErrors++;
      lastError = processError;
      
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[AUTO-STOP] ${consecutiveErrors} consecutive processing errors, stopping`);
        return { 
          stopReason: StopReason.ERROR, 
          stopMessage: `Error processing posts: ${processError.message}`,
          lastError,
          pagesCompleted: pageCount - startingPageCount - 1
        };
      }
    }

    url = data.paging?.next || null;
    
    if (!url) {
      console.log('[UNTIL] Reached end of posts (no next page)');
    }
  }

  if (pageCount >= MAX_PAGES_TO_FETCH + startingPageCount) {
    console.log(`[UNTIL] Reached maximum page limit (${MAX_PAGES_TO_FETCH})`);
  }

  console.log(`[UNTIL] Older posts fetch complete: ${pageCount - startingPageCount} pages fetched`);
  
  return { 
    stopReason: StopReason.COMPLETED, 
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
    
    // ===== Save minimal data - processor handles ALL classification =====
    const content = fbPost.message || '';
    const rawContent = buildRawContent(fbPost);
    const hashtags = extractHashtags(content); // Just hashtags for initial display
    
    const newPost = {
      id: postId,
      platformPostId: fbPost.id,
      postUrl: fbPost.permalink_url,
      postType: fbPost.full_picture ? 'IMAGE' : 'TEXT',
      
      // Content fields
      content: content,
      contentPreview: content.substring(0, 200),
      rawContent: rawContent, // AUTHORITATIVE - processor uses this for classification
      
      // Media
      mediaUrls: mediaUrls,
      thumbnailUrl: thumbnailUrl,
      
      // Engagement metrics
      likeCount: fbPost.reactions?.summary?.total_count || 0,
      commentCount: fbPost.comments?.summary?.total_count || 0,
      shareCount: fbPost.shares?.count || 0,
      reactionCount: fbPost.reactions?.summary?.total_count || 0,
      
      // Timestamps
      postedAt,
      postYearMonth: getPostYearMonth(postedAt),
      scrapedAt: now,
      
      // Status - PENDING for processor to handle ALL classification
      status: 'ACTIVE',
      processingStatus: 'PENDING',
      
      // Just hashtags - processor adds classification tags
      tags: hashtags,
      
      // Account context
      socialAccountId: account.id,
      accountName: account.accountName,
      accountProfileImageUrl: account.profileImageUrl,
      platform: account.platform,
      
      // DynamoDB metadata
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
      cancellationRequested: false,  // NEW: Initialize cancellation flag
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