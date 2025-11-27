/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
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
 * - Fetches ALL historical posts with pagination (triggerFullSync)
 * - Incremental fetching - only gets posts since last successful scrape
 * - Downloads and stores page profile pictures to S3
 * - Supports initial full sync and incremental updates
 * 
 * Triggered:
 * - Manually via GraphQL mutation (triggerSocialScrape)
 * - Full sync via GraphQL mutation (triggerFullSync)
 * - Page info sync via GraphQL mutation (syncPageInfo)
 * - Automatically via EventBridge scheduled rule (hourly)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const https = require('https');

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: process.env.REGION || 'ap-southeast-2' });

// Table names from environment
const SOCIAL_ACCOUNT_TABLE = process.env.API_KINGSROOM_SOCIALACCOUNTTABLE_NAME;
const SOCIAL_POST_TABLE = process.env.API_KINGSROOM_SOCIALPOSTTABLE_NAME;
const SOCIAL_SCRAPE_ATTEMPT_TABLE = process.env.API_KINGSROOM_SOCIALSCRAPEATTEMPTTABLE_NAME;

// S3 bucket for storing page logos/profile images
// Use your specific bucket or fall back to Amplify storage bucket
const S3_BUCKET = process.env.SOCIAL_MEDIA_BUCKET || 'pokerpro-scraper-storage';
const S3_PREFIX = 'social-media/page-logos/';

// Facebook App Access Token (format: app_id|app_secret)
// This never expires - just concatenate your app ID and secret with a pipe
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_API_VERSION = process.env.FB_API_VERSION || 'v19.0';

// Configuration
const MAX_POSTS_PER_PAGE = 100; // Facebook allows up to 100 per request
const MAX_PAGES_TO_FETCH = 50; // Safety limit: 50 pages * 100 posts = 5000 posts max

/**
 * Main handler
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Handle different event types
    if (event.source === 'aws.events') {
      // EventBridge scheduled trigger - scrape all due accounts
      return handleScheduledScrape();
    } else if (event.fieldName) {
      // GraphQL resolver (AppSync) - uses fieldName not field
      return handleGraphQLRequest(event);
    } else if (event.arguments?.socialAccountId) {
      // Direct invocation via AppSync (alternative format)
      const options = {
        fetchAllHistory: event.arguments?.fetchAllHistory || false
      };
      return triggerScrape(event.arguments.socialAccountId, options);
    } else if (event.socialAccountId) {
      // Direct Lambda invocation with accountId
      const options = {
        fetchAllHistory: event.fetchAllHistory || false
      };
      return triggerScrape(event.socialAccountId, options);
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
async function handleGraphQLRequest(event) {
  const { fieldName, arguments: args } = event;

  switch (fieldName) {
    case 'triggerSocialScrape':
      // Standard incremental fetch - only posts since last successful scrape
      return triggerScrape(args.socialAccountId, { fetchAllHistory: false });
    case 'triggerFullSync':
      // Full historical sync - fetches ALL posts
      return triggerScrape(args.socialAccountId, { fetchAllHistory: true });
    case 'syncPageInfo':
      // Sync page info including logo without fetching posts
      return syncPageInfo(args.socialAccountId);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}

/**
 * Handle scheduled scrapes (hourly EventBridge trigger)
 */
async function handleScheduledScrape() {
  console.log('Running scheduled scrape');

  const accountsDue = await getAccountsDueForScrape();
  console.log(`Found ${accountsDue.length} accounts due for scraping`);

  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    totalNewPosts: 0,
  };

  for (const account of accountsDue) {
    try {
      // For scheduled scrapes, only fetch posts since last scrape (incremental)
      const result = await scrapeAccount(account, { fetchAllHistory: false });
      results.processed++;

      if (result.success) {
        results.success++;
        results.totalNewPosts += result.newPostsAdded;
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
async function triggerScrape(socialAccountId, options = {}) {
  console.log('Triggering scrape for account:', socialAccountId, 'Options:', options);

  // Check for FB token first
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

  return scrapeAccount(account, options);
}

/**
 * Sync page info (logo, follower count, etc.) without fetching posts
 */
async function syncPageInfo(socialAccountId) {
  console.log('Syncing page info for account:', socialAccountId);

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

  try {
    const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
    const pageInfo = await fetchPageInfo(pageId);
    
    // Download and store the logo if available
    let storedLogoUrl = null;
    if (pageInfo.picture?.data?.url) {
      storedLogoUrl = await downloadAndStorePageLogo(
        account.id,
        pageInfo.picture.data.url,
        pageInfo.name
      );
    }

    // Update account with page info
    await updateAccountAfterScrape(account.id, {
      accountName: pageInfo.name || account.accountName,
      profileImageUrl: storedLogoUrl || pageInfo.picture?.data?.url || account.profileImageUrl,
      followerCount: pageInfo.followers_count || pageInfo.fan_count || account.followerCount,
      pageDescription: pageInfo.about || pageInfo.description || null,
      category: pageInfo.category || null,
      website: pageInfo.website || null,
    });

    return {
      success: true,
      message: 'Page info synced successfully',
      logoUrl: storedLogoUrl || pageInfo.picture?.data?.url || null
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

/**
 * Scrape a Facebook account for posts
 */
async function scrapeAccount(account, options = {}) {
  const startTime = Date.now();
  let attemptId;
  const fetchAllHistory = options.fetchAllHistory || false;
  
  // Determine the "since" timestamp for incremental fetches
  // Use lastSuccessfulScrapeAt if available and not doing full sync
  let sinceTimestamp = null;
  if (!fetchAllHistory && account.lastSuccessfulScrapeAt) {
    // Subtract 1 hour as buffer to avoid missing posts due to timezone issues
    const since = new Date(account.lastSuccessfulScrapeAt);
    since.setHours(since.getHours() - 1);
    sinceTimestamp = Math.floor(since.getTime() / 1000); // Unix timestamp
    console.log(`Incremental fetch: getting posts since ${since.toISOString()}`);
  }

  try {
    // Create scrape attempt record
    const syncType = fetchAllHistory ? 'FULL_SYNC' : 'INCREMENTAL';
    attemptId = await createScrapeAttempt(account.id, syncType);

    // Get the Facebook page ID from the account
    const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
    console.log('Using page ID:', pageId);

    if (!pageId) {
      throw new Error('Could not determine Facebook page ID');
    }

    // Fetch page info and logo first (on first sync or if no profile image)
    if (!account.profileImageUrl || fetchAllHistory) {
      console.log('Fetching page info and logo...');
      try {
        const pageInfo = await fetchPageInfo(pageId);
        
        // Download and store the logo
        let storedLogoUrl = null;
        if (pageInfo.picture?.data?.url) {
          storedLogoUrl = await downloadAndStorePageLogo(
            account.id,
            pageInfo.picture.data.url,
            pageInfo.name || account.accountName
          );
        }

        // Update account with page info
        await updateAccountAfterScrape(account.id, {
          accountName: pageInfo.name || account.accountName,
          profileImageUrl: storedLogoUrl || pageInfo.picture?.data?.url || account.profileImageUrl,
          followerCount: pageInfo.followers_count || pageInfo.fan_count || account.followerCount,
          pageDescription: pageInfo.about || pageInfo.description || null,
          category: pageInfo.category || null,
        });

        // Refresh account object with updated values
        account.profileImageUrl = storedLogoUrl || pageInfo.picture?.data?.url;
        account.followerCount = pageInfo.followers_count || pageInfo.fan_count;
      } catch (pageInfoError) {
        console.warn('Could not fetch page info, continuing with post fetch:', pageInfoError.message);
      }
    }

    // Fetch posts from Facebook Graph API
    let posts = [];
    if (fetchAllHistory) {
      console.log('Fetching ALL historical posts with pagination...');
      posts = await fetchAllFacebookPosts(pageId);
    } else if (sinceTimestamp) {
      console.log(`Fetching posts since timestamp: ${sinceTimestamp}`);
      posts = await fetchFacebookPostsSince(pageId, sinceTimestamp);
    } else {
      // First fetch for this account - get recent posts
      console.log('First fetch - getting recent posts...');
      posts = await fetchFacebookPosts(pageId, 100);
    }
    
    console.log(`Fetched ${posts.length} posts from ${account.accountName}`);

    // Process and save new posts
    const newPosts = await processAndSavePosts(account, posts);
    console.log(`Saved ${newPosts.length} new posts`);

    // Calculate new total post count
    const newPostCount = (account.postCount || 0) + newPosts.length;

    // Update account with success
    await updateAccountAfterScrape(account.id, {
      lastScrapedAt: new Date().toISOString(),
      lastSuccessfulScrapeAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastErrorMessage: null,
      status: 'ACTIVE',
      postCount: newPostCount,
      hasFullHistory: fetchAllHistory ? true : (account.hasFullHistory || false),
    });

    // Update scrape attempt
    await updateScrapeAttempt(attemptId, {
      status: 'SUCCESS',
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      postsFound: posts.length,
      newPostsAdded: newPosts.length,
      syncType,
    });

    return {
      success: true,
      message: newPosts.length > 0 
        ? `Found ${newPosts.length} new posts (scanned ${posts.length} total)` 
        : `No new posts (scanned ${posts.length} total)`,
      postsFound: posts.length,
      newPostsAdded: newPosts.length,
    };

  } catch (error) {
    console.error(`Scrape failed for account ${account.id}:`, error);

    const consecutiveFailures = (account.consecutiveFailures || 0) + 1;

    // Update account with failure
    await updateAccountAfterScrape(account.id, {
      lastScrapedAt: new Date().toISOString(),
      consecutiveFailures,
      lastErrorMessage: error.message,
      status: consecutiveFailures >= 3 ? 'ERROR' : account.status,
    });

    // Update scrape attempt
    if (attemptId) {
      await updateScrapeAttempt(attemptId, {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        errorMessage: error.message,
      });
    }

    return {
      success: false,
      message: error.message,
      postsFound: 0,
      newPostsAdded: 0,
    };
  }
}

/**
 * Fetch page info including profile picture
 */
async function fetchPageInfo(pageId) {
  const fields = 'id,name,about,description,category,fan_count,followers_count,website,picture.width(200).height(200)';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}?fields=${fields}&access_token=${FB_ACCESS_TOKEN}`;

  console.log('Fetching page info:', `${FB_API_VERSION}/${pageId}`);

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    console.error('Facebook API error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  return data;
}

/**
 * Download page logo and store in S3
 */
async function downloadAndStorePageLogo(accountId, imageUrl, pageName) {
  if (!S3_BUCKET) {
    console.warn('S3_BUCKET not configured, skipping logo storage');
    return null;
  }

  try {
    // Create a clean filename from the page name
    const cleanName = (pageName || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
    
    const s3Key = `${S3_PREFIX}${accountId}/${cleanName}-logo.jpg`;

    // Check if we already have this logo
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key
      }));
      // Logo already exists, return the URL
      console.log('Logo already exists in S3:', s3Key);
      return `https://${S3_BUCKET}.s3.${process.env.REGION || 'ap-southeast-2'}.amazonaws.com/${s3Key}`;
    } catch (headError) {
      // Logo doesn't exist, continue to download
    }

    // Download the image
    console.log('Downloading logo from:', imageUrl);
    const imageBuffer = await downloadImage(imageUrl);

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'max-age=31536000', // Cache for 1 year
      Metadata: {
        'source-url': imageUrl,
        'page-name': pageName || 'unknown',
        'downloaded-at': new Date().toISOString()
      }
    }));

    const storedUrl = `https://${S3_BUCKET}.s3.${process.env.REGION || 'ap-southeast-2'}.amazonaws.com/${s3Key}`;
    console.log('Logo stored at:', storedUrl);
    
    return storedUrl;
  } catch (error) {
    console.error('Error storing logo in S3:', error);
    return null; // Return null to fall back to the original URL
  }
}

/**
 * Download image from URL and return as Buffer
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    // Handle redirects (Facebook often redirects image URLs)
    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const protocol = requestUrl.startsWith('https') ? https : require('http');
      
      protocol.get(requestUrl, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

/**
 * Fetch posts from Facebook Graph API (single page, most recent)
 */
async function fetchFacebookPosts(pageId, limit = 25) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${limit}`;

  console.log('Fetching from Facebook:', `${FB_API_VERSION}/${pageId}/posts`);

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    console.error('Facebook API error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  return data.data || [];
}

/**
 * Fetch posts since a specific timestamp (incremental fetch)
 * Uses the 'since' parameter to only get posts newer than the given timestamp
 */
async function fetchFacebookPostsSince(pageId, sinceTimestamp) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}&since=${sinceTimestamp}`;

  const allPosts = [];
  let pageCount = 0;
  let hasNextPage = true;

  console.log(`Fetching posts since timestamp ${sinceTimestamp}...`);

  while (hasNextPage && pageCount < MAX_PAGES_TO_FETCH) {
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

    // Check for next page
    if (data.paging?.next) {
      url = data.paging.next;
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting delay
    } else {
      hasNextPage = false;
    }
  }

  console.log(`Incremental fetch complete. Total posts since last scrape: ${allPosts.length}`);
  return allPosts;
}

/**
 * Fetch ALL posts from Facebook Graph API with pagination
 * This will retrieve the entire post history
 */
async function fetchAllFacebookPosts(pageId) {
  const fields = 'id,created_time,permalink_url,message,full_picture,shares,reactions.summary(true),comments.summary(true)';
  let url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&access_token=${FB_ACCESS_TOKEN}&limit=${MAX_POSTS_PER_PAGE}`;

  const allPosts = [];
  let pageCount = 0;
  let hasNextPage = true;

  console.log('Starting paginated fetch for ALL posts...');

  while (hasNextPage && pageCount < MAX_PAGES_TO_FETCH) {
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

    // Check for next page
    if (data.paging?.next) {
      url = data.paging.next;
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      hasNextPage = false;
      console.log('No more pages available');
    }
  }

  if (pageCount >= MAX_PAGES_TO_FETCH) {
    console.warn(`Reached maximum page limit (${MAX_PAGES_TO_FETCH}). Some older posts may not be fetched.`);
  }

  console.log(`Pagination complete. Total posts fetched: ${allPosts.length}`);
  return allPosts;
}

/**
 * Process fetched posts and save new ones to DynamoDB
 */
async function processAndSavePosts(account, fbPosts) {
  const newPosts = [];
  const now = new Date().toISOString();

  for (const fbPost of fbPosts) {
    // Check if post already exists
    const postId = `${account.id}_${fbPost.id}`;
    const existingPost = await getExistingPost(postId);

    if (!existingPost) {
      // Convert Facebook datetime format to ISO 8601
      const postedAt = new Date(fbPost.created_time).toISOString();
      
      // Create new post - matching your existing data structure
      const newPost = {
        id: postId,
        platformPostId: fbPost.id,
        postUrl: fbPost.permalink_url,
        postType: fbPost.full_picture ? 'IMAGE' : 'TEXT',
        content: fbPost.message || '',
        contentPreview: (fbPost.message || '').substring(0, 200),
        mediaUrls: fbPost.full_picture ? [fbPost.full_picture] : [],
        thumbnailUrl: fbPost.full_picture || null,
        likeCount: fbPost.reactions?.summary?.total_count || 0,
        commentCount: fbPost.comments?.summary?.total_count || 0,
        shareCount: fbPost.shares?.count || 0,
        postedAt,
        scrapedAt: now,
        status: 'ACTIVE',
        isPromotional: detectPromotional(fbPost.message),
        isTournamentRelated: detectTournamentRelated(fbPost.message),
        tags: extractTags(fbPost.message),
        socialAccountId: account.id,
        // Store account info for display purposes (denormalized for fast queries)
        accountName: account.accountName,
        accountProfileImageUrl: account.profileImageUrl,
        platform: account.platform,
        createdAt: now,
        updatedAt: now,
        __typename: 'SocialPost',
        _version: 1,
        _lastChangedAt: Date.now(),
      };
      
      // Only add entityId/venueId if they exist (avoid null for GSI)
      if (account.entityId) newPost.entityId = account.entityId;
      if (account.venueId) newPost.venueId = account.venueId;

      await savePost(newPost);
      newPosts.push(newPost);
    }
  }

  return newPosts;
}

/**
 * Extract page ID from Facebook URL
 */
function extractPageIdFromUrl(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // facebook.com/pagename
    // facebook.com/pages/pagename/123456
    // facebook.com/profile.php?id=123456

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

/**
 * Detect if post is promotional
 */
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

/**
 * Detect if post is tournament related
 */
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

/**
 * Extract hashtags as tags
 */
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
    console.warn('SOCIAL_SCRAPE_ATTEMPT_TABLE not configured, skipping attempt tracking');
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

  // Always add updatedAt
  updates.updatedAt = new Date().toISOString();

  const updateParts = [];
  const names = {};
  const values = {};

  Object.entries(updates).forEach(([key, value]) => {
    updateParts.push(`#${key} = :${key}`);
    names[`#${key}`] = key;
    values[`:${key}`] = value;
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