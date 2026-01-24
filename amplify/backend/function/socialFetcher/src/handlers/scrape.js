/**
 * Scrape Handler
 * 
 * Contains the core logic for scraping a single account.
 * Called by both scheduled and GraphQL handlers.
 */

const { config, scrapeConfig, StopReason, validateConfig } = require('../config');
const db = require('../db');
const {
  fetchPageInfo,
  fetchPosts,
  extractPageIdFromUrl,
  buildRawContent,
  extractHashtags,
} = require('../services/facebook');
const { downloadAndStorePageLogo, storePostAttachments } = require('../services/s3');
const {
  publishScrapeStarted,
  publishScrapeCompleted,
  publishScrapeFailed,
  publishSyncProgress,
  publishDownloadProgress,
} = require('../services/appsync');
const { processPostsInBatches } = require('../services/processor');

/**
 * Trigger a scrape for a specific account
 * Entry point for GraphQL mutations and direct invokes
 */
async function triggerScrape(socialAccountId, options = {}, context = null) {
  console.log(`[Scrape] Triggering scrape for account: ${socialAccountId}`, options);

  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    return {
      success: false,
      message: configValidation.errors.join(', '),
      postsFound: 0,
      newPostsAdded: 0,
    };
  }

  // Get the account
  const account = await db.getSocialAccount(socialAccountId);
  if (!account) {
    return {
      success: false,
      message: 'Account not found',
      postsFound: 0,
      newPostsAdded: 0,
    };
  }

  if (!account.isScrapingEnabled) {
    return {
      success: false,
      message: 'Scraping is disabled for this account',
      postsFound: 0,
      newPostsAdded: 0,
    };
  }

  if (account.platform !== 'FACEBOOK') {
    return {
      success: false,
      message: 'Only Facebook is supported currently',
      postsFound: 0,
      newPostsAdded: 0,
    };
  }

  return scrapeAccount(account, options, context);
}

/**
 * Main scraping logic for a single account
 */
async function scrapeAccount(account, options = {}, context = null) {
  const { fetchAllHistory = false, skipProcessing = false } = options;
  const startTime = Date.now();
  const syncType = fetchAllHistory ? 'FULL' : 'INCREMENTAL';
  
  console.log(`[Scrape] Starting ${syncType} scrape for ${account.accountName}`);

  // Create scrape attempt record
  const attemptId = await db.createScrapeAttempt(account.id, syncType, options.triggerSource || 'MANUAL');

  // Publish start event
  await publishScrapeStarted(account.id, syncType);

  const result = {
    success: false,
    message: '',
    postsFound: 0,
    newPostsAdded: 0,
    postsProcessed: 0,
    rateLimited: false,
    timeout: false,
    oldestPostDate: null,
    attemptId,
  };

  try {
    // Get page ID from URL
    const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
    if (!pageId) {
      throw new Error('Could not determine Facebook page ID from account URL');
    }

    // Update page info (logo, follower count, etc.)
    await syncPageInfoInternal(account, pageId);

    // Determine fetch strategy
    const fetchOptions = await determineFetchStrategy(account, fetchAllHistory);
    console.log(`[Scrape] Fetch strategy:`, fetchOptions);

    // Fetch and save posts
    const fetchResult = await fetchAndSavePosts(
      account,
      pageId,
      fetchOptions,
      attemptId,
      context
    );

    result.postsFound = fetchResult.postsFound;
    result.newPostsAdded = fetchResult.newPostsAdded;
    result.oldestPostDate = fetchResult.oldestPostDate;
    result.rateLimited = fetchResult.rateLimited;
    result.timeout = fetchResult.timeout;

    // Process new posts (classification, etc.)
    if (!skipProcessing && fetchResult.savedPostIds.length > 0) {
      const processingResult = await processPostsInBatches(fetchResult.savedPostIds);
      result.postsProcessed = processingResult.totalQueued || 0;
    }

    // Update account with results
    const nextScrapeTime = db.calculateNextScrapeTime(account);
    await db.updateAccountAfterScrape(account.id, {
      lastScrapedAt: new Date().toISOString(),
      lastSuccessfulScrapeAt: new Date().toISOString(),
      postCount: (account.postCount || 0) + fetchResult.newPostsAdded,
      consecutiveFailures: 0,
      lastErrorMessage: null,
      status: 'ACTIVE',
      ...(nextScrapeTime && { nextScheduledScrapeAt: nextScrapeTime }),
    });

    // Track full sync progress
    if (fetchAllHistory && fetchResult.oldestPostDate) {
      await db.updateAccountAfterScrape(account.id, {
        fullSyncOldestPostDate: fetchResult.oldestPostDate,
        hasFullHistory: !fetchResult.hasMore,
      });
    }

    result.success = true;
    result.message = `Successfully scraped ${result.newPostsAdded} new posts`;

    // Complete attempt
    await db.completeScrapeAttempt(attemptId, 'SUCCESS', {
      ...result,
      durationMs: Date.now() - startTime,
    });

    // Publish completion
    await publishScrapeCompleted(account.id, result);

  } catch (error) {
    console.error(`[Scrape] Error scraping ${account.accountName}:`, error);
    
    result.message = error.message;
    
    // Update account with error
    await db.incrementFailures(account.id, error.message);

    // Complete attempt as failed
    await db.completeScrapeAttempt(attemptId, 'FAILED', {
      ...result,
      durationMs: Date.now() - startTime,
      errorMessage: error.message,
    });

    // Publish failure
    await publishScrapeFailed(account.id, error.message, result.rateLimited);
  }

  const durationMs = Date.now() - startTime;
  result.durationMs = durationMs;
  
  console.log(`[Scrape] Completed ${account.accountName} in ${Math.round(durationMs / 1000)}s:`, {
    success: result.success,
    postsFound: result.postsFound,
    newPostsAdded: result.newPostsAdded,
  });

  return result;
}

/**
 * Sync page info without fetching posts
 */
async function syncPageInfo(socialAccountId, options = {}) {
  console.log(`[Scrape] Syncing page info for: ${socialAccountId}`);
  
  const account = await db.getSocialAccount(socialAccountId);
  if (!account) {
    return { success: false, message: 'Account not found', logoUrl: null };
  }

  const pageId = account.platformAccountId || extractPageIdFromUrl(account.accountUrl);
  if (!pageId) {
    return { success: false, message: 'Could not determine Facebook page ID', logoUrl: null };
  }

  try {
    const pageInfo = await fetchPageInfo(pageId);
    
    let storedLogoUrl = null;
    if (pageInfo.picture?.data?.url) {
      storedLogoUrl = await downloadAndStorePageLogo(
        account.id,
        pageInfo.picture.data.url,
        pageInfo.name || account.accountName,
        options.forceRefresh || false
      );
    }

    await db.updateAccountAfterScrape(account.id, {
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
      pageName: pageInfo.name,
    };
  } catch (error) {
    console.error('[Scrape] Error syncing page info:', error);
    return { success: false, message: error.message, logoUrl: null };
  }
}

/**
 * Internal helper to sync page info during scrape
 */
async function syncPageInfoInternal(account, pageId) {
  try {
    const pageInfo = await fetchPageInfo(pageId);
    
    let storedLogoUrl = null;
    if (pageInfo.picture?.data?.url) {
      storedLogoUrl = await downloadAndStorePageLogo(
        account.id,
        pageInfo.picture.data.url,
        pageInfo.name || account.accountName,
        false  // Don't force refresh during regular scrapes
      );
    }

    await db.updateAccountAfterScrape(account.id, {
      accountName: pageInfo.name || account.accountName,
      profileImageUrl: storedLogoUrl || pageInfo.picture?.data?.url || account.profileImageUrl,
      followerCount: pageInfo.followers_count || pageInfo.fan_count || account.followerCount,
      category: pageInfo.category || account.category,
    });
  } catch (error) {
    console.warn('[Scrape] Failed to sync page info:', error.message);
    // Don't fail the entire scrape for this
  }
}

/**
 * Determine the fetch strategy based on existing posts
 */
async function determineFetchStrategy(account, fetchAllHistory) {
  const dateRange = await db.getPostDateRange(account.id);
  
  if (dateRange.totalPosts === 0) {
    // No existing posts - fetch all history
    console.log(`[Scrape] No existing posts, fetching all history`);
    return { since: null, until: null, fetchOlder: true };
  }

  if (fetchAllHistory) {
    // Full sync - fetch posts older than what we have
    console.log(`[Scrape] Full sync - fetching posts older than ${dateRange.oldestPostDate}`);
    return {
      since: null,
      until: dateRange.oldestTimestamp,
      fetchOlder: true,
    };
  }

  // Incremental - fetch posts newer than last scrape
  const sinceTimestamp = account.lastScrapedAt
    ? Math.floor(new Date(account.lastScrapedAt).getTime() / 1000) - 3600  // 1 hour buffer
    : dateRange.newestTimestamp;

  console.log(`[Scrape] Incremental sync - fetching posts since ${new Date(sinceTimestamp * 1000).toISOString()}`);
  return {
    since: sinceTimestamp,
    until: null,
    fetchOlder: false,
  };
}

/**
 * Fetch posts from Facebook and save to database
 */
async function fetchAndSavePosts(account, pageId, fetchOptions, attemptId, context) {
  const result = {
    postsFound: 0,
    newPostsAdded: 0,
    savedPostIds: [],
    oldestPostDate: null,
    hasMore: false,
    rateLimited: false,
    timeout: false,
  };

  let nextPageUrl = null;
  let pageCount = 0;
  let consecutiveErrors = 0;

  while (pageCount < scrapeConfig.maxPagesToFetch) {
    // Check for timeout (leave 30s buffer)
    if (context?.getRemainingTimeInMillis && context.getRemainingTimeInMillis() < 30000) {
      console.log('[Scrape] Lambda timeout approaching, stopping');
      result.timeout = true;
      break;
    }

    // Check for cancellation
    if (attemptId && pageCount % scrapeConfig.cancellationCheckFrequency === 0) {
      const cancelled = await db.checkCancellationRequested(attemptId);
      if (cancelled) {
        console.log('[Scrape] Cancellation requested, stopping');
        await db.clearCancellationFlag(attemptId);
        break;
      }
    }

    try {
      // Fetch a page of posts
      const fetchResult = await fetchPosts(pageId, {
        since: fetchOptions.since,
        until: fetchOptions.until,
        nextPageUrl,
      });

      if (fetchResult.rateLimited) {
        result.rateLimited = true;
        break;
      }

      result.postsFound += fetchResult.posts.length;
      consecutiveErrors = 0;

      // Save posts
      for (const fbPost of fetchResult.posts) {
        const saveResult = await savePost(account, fbPost);
        if (saveResult.isNew) {
          result.newPostsAdded++;
          result.savedPostIds.push(saveResult.postId);
        }
        
        // Track oldest post date
        if (fbPost.created_time) {
          if (!result.oldestPostDate || fbPost.created_time < result.oldestPostDate) {
            result.oldestPostDate = fbPost.created_time;
          }
        }
      }

      // Update progress
      if (pageCount % scrapeConfig.progressUpdateFrequency === 0) {
        await publishSyncProgress(account.id, 'IN_PROGRESS', {
          message: `Fetched ${result.postsFound} posts (${result.newPostsAdded} new)`,
          postsFound: result.postsFound,
          newPostsAdded: result.newPostsAdded,
          pagesCompleted: pageCount + 1,
        });
      }

      // Continue to next page?
      if (!fetchResult.hasMore) {
        break;
      }

      nextPageUrl = fetchResult.nextPageUrl;
      pageCount++;

    } catch (error) {
      console.error(`[Scrape] Error fetching page ${pageCount}:`, error.message);
      consecutiveErrors++;
      
      if (consecutiveErrors >= scrapeConfig.maxConsecutiveErrors) {
        console.error('[Scrape] Too many consecutive errors, stopping');
        throw error;
      }
    }
  }

  result.hasMore = pageCount >= scrapeConfig.maxPagesToFetch;
  return result;
}

/**
 * Save a single Facebook post to the database
 */
async function savePost(account, fbPost) {
  const postId = db.generatePostId(account.id, fbPost.id);
  
  // Check if exists
  const existing = await db.getExistingPost(postId);
  if (existing) {
    return { isNew: false, postId };
  }

  const now = new Date().toISOString();
  const postedAt = fbPost.created_time ? new Date(fbPost.created_time).toISOString() : now;
  
  // Extract image URLs from attachments
  const mediaUrls = [];
  let thumbnailUrl = fbPost.full_picture || null;
  
  if (fbPost.attachments?.data) {
    for (const attachment of fbPost.attachments.data) {
      if (attachment.media?.image?.src) {
        mediaUrls.push(attachment.media.image.src);
      }
      if (attachment.subattachments?.data) {
        for (const sub of attachment.subattachments.data) {
          if (sub.media?.image?.src) {
            mediaUrls.push(sub.media.image.src);
          }
        }
      }
    }
  }

  // Store images to S3
  const storedMediaUrls = await storePostAttachments(account.id, postId, mediaUrls);
  if (storedMediaUrls.length > 0) {
    thumbnailUrl = storedMediaUrls[0];
  }

  // Build post object
  const content = fbPost.message || '';
  const newPost = {
    id: postId,
    platformPostId: fbPost.id,
    postUrl: fbPost.permalink_url,
    postType: fbPost.full_picture ? 'IMAGE' : 'TEXT',
    
    content,
    contentPreview: content.substring(0, 200),
    rawContent: buildRawContent(fbPost),
    
    mediaUrls: storedMediaUrls.length > 0 ? storedMediaUrls : (fbPost.full_picture ? [fbPost.full_picture] : []),
    thumbnailUrl,
    
    likeCount: fbPost.reactions?.summary?.total_count || 0,
    commentCount: fbPost.comments?.summary?.total_count || 0,
    shareCount: fbPost.shares?.count || 0,
    reactionCount: fbPost.reactions?.summary?.total_count || 0,
    
    postedAt,
    postYearMonth: db.getPostYearMonth(postedAt),
    scrapedAt: now,
    
    status: 'ACTIVE',
    processingStatus: 'PENDING',
    
    tags: extractHashtags(content),
    
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

  await db.savePost(newPost);
  return { isNew: true, postId };
}

module.exports = {
  triggerScrape,
  scrapeAccount,
  syncPageInfo,
};
