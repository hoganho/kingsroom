// amplify/backend/function/socialFetcher/src/services/progressPublisher.js
// ===================================================================
// PROGRESS PUBLISHER SERVICE
// ===================================================================
// VERSION: 1.0.0
//
// Publishes enhanced sync progress events to AppSync subscriptions.
// Provides real-time updates to the frontend including individual post details.
//
// Usage:
//   const publisher = new ProgressPublisher(socialAccountId, attemptId);
//   await publisher.started();
//   await publisher.fetchingPage(pageNum, totalPages);
//   await publisher.postProcessed(postData, isNew);
//   await publisher.completed(stats);
// ===================================================================

const https = require('https');
const AWS = require('aws-sdk');
const { URL } = require('url');

// AppSync endpoint from environment
const APPSYNC_ENDPOINT = process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT;
const REGION = process.env.REGION || 'ap-southeast-2';

// GraphQL mutation for publishing progress
// NOTE: This matches the enhanced publishSyncProgress mutation in 99-mutations.graphql
const PUBLISH_PROGRESS_MUTATION = /* GraphQL */ `
  mutation PublishSyncProgress(
    $socialAccountId: ID!
    $status: SyncEventStatus!
    $message: String
    $postsFound: Int
    $newPostsAdded: Int
    $duplicatesSkipped: Int
    $rateLimited: Boolean
    $pagesCompleted: Int
    $totalPages: Int
    $currentPagePosts: Int
    $currentPost: SyncProgressPostInput
    $recentPosts: [SyncProgressPostInput]
    $estimatedTimeRemaining: Int
    $averagePostsPerPage: Float
    $completedAt: AWSDateTime
    $attemptId: ID
  ) {
    publishSyncProgress(
      socialAccountId: $socialAccountId
      status: $status
      message: $message
      postsFound: $postsFound
      newPostsAdded: $newPostsAdded
      duplicatesSkipped: $duplicatesSkipped
      rateLimited: $rateLimited
      pagesCompleted: $pagesCompleted
      totalPages: $totalPages
      currentPagePosts: $currentPagePosts
      currentPost: $currentPost
      recentPosts: $recentPosts
      estimatedTimeRemaining: $estimatedTimeRemaining
      averagePostsPerPage: $averagePostsPerPage
      completedAt: $completedAt
      attemptId: $attemptId
    ) {
      socialAccountId
      status
      message
      postsFound
      newPostsAdded
      pagesCompleted
    }
  }
`;

// Fallback mutation for basic progress (if enhanced fields not yet deployed)
const PUBLISH_PROGRESS_BASIC_MUTATION = /* GraphQL */ `
  mutation PublishSyncProgressBasic(
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
    }
  }
`;

/**
 * Creates a content preview from full content
 */
function createContentPreview(content, maxLength = 120) {
  if (!content) return null;
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + '...';
}

/**
 * Transforms a raw post object into SyncProgressPostInput format
 */
function transformPostForProgress(post, isNew = false) {
  if (!post) return null;
  
  return {
    platformPostId: post.platformPostId || post.id || 'unknown',
    content: post.content || post.message || null,
    contentPreview: createContentPreview(post.content || post.message),
    postType: post.postType || post.type || 'TEXT',
    postedAt: post.postedAt || post.created_time || null,
    mediaUrls: post.mediaUrls || [],
    thumbnailUrl: post.thumbnailUrl || post.full_picture || null,
    likeCount: post.likeCount ?? post.likes?.summary?.total_count ?? null,
    commentCount: post.commentCount ?? post.comments?.summary?.total_count ?? null,
    shareCount: post.shareCount ?? post.shares?.count ?? null,
    isNew: isNew,
    isDuplicate: !isNew,
  };
}

/**
 * Makes a signed request to AppSync
 */
async function makeAppSyncRequest(query, variables) {
  if (!APPSYNC_ENDPOINT) {
    console.warn('[ProgressPublisher] No AppSync endpoint configured, skipping publish');
    return null;
  }

  const endpoint = new URL(APPSYNC_ENDPOINT);
  const signer = new AWS.Signers.V4({
    method: 'POST',
    host: endpoint.host,
    path: endpoint.pathname,
    region: REGION,
    service: 'appsync',
    headers: {
      'Content-Type': 'application/json',
      host: endpoint.host,
    },
    body: JSON.stringify({ query, variables }),
  });

  const credentials = await new Promise((resolve, reject) => {
    AWS.config.getCredentials((err, creds) => {
      if (err) reject(err);
      else resolve(creds);
    });
  });

  signer.addAuthorization(credentials, new Date());

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: endpoint.host,
        path: endpoint.pathname,
        port: 443,
        method: 'POST',
        headers: signer.request.headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );

    req.on('error', reject);
    req.write(JSON.stringify({ query, variables }));
    req.end();
  });
}

/**
 * Progress Publisher Class
 * 
 * Manages publishing sync progress events with throttling and batching.
 */
class ProgressPublisher {
  constructor(socialAccountId, attemptId = null) {
    this.socialAccountId = socialAccountId;
    this.attemptId = attemptId;
    
    // Stats tracking
    this.postsFound = 0;
    this.newPostsAdded = 0;
    this.duplicatesSkipped = 0;
    this.pagesCompleted = 0;
    this.totalPages = null;
    
    // Recent posts buffer (for batch display)
    this.recentPosts = [];
    this.maxRecentPosts = 20;
    
    // Timing for estimates
    this.startTime = Date.now();
    this.pageTimings = [];
    
    // Throttling - don't publish more than once per 500ms
    this.lastPublishTime = 0;
    this.minPublishInterval = 500;
    this.pendingPublish = null;
  }

  /**
   * Publishes a progress event with throttling
   */
  async publish(status, additionalData = {}) {
    const now = Date.now();
    const timeSinceLastPublish = now - this.lastPublishTime;
    
    // Prepare the full event data
    const eventData = {
      socialAccountId: this.socialAccountId,
      status,
      postsFound: this.postsFound,
      newPostsAdded: this.newPostsAdded,
      duplicatesSkipped: this.duplicatesSkipped,
      pagesCompleted: this.pagesCompleted,
      totalPages: this.totalPages,
      recentPosts: this.recentPosts.slice(0, 10), // Send last 10
      estimatedTimeRemaining: this.calculateEstimatedTime(),
      averagePostsPerPage: this.calculateAveragePostsPerPage(),
      attemptId: this.attemptId,
      ...additionalData,
    };

    // For certain statuses, always publish immediately
    const immediateStatuses = ['STARTED', 'COMPLETED', 'RATE_LIMITED', 'FAILED'];
    if (immediateStatuses.includes(status)) {
      this.lastPublishTime = now;
      return this._doPublish(eventData);
    }

    // Throttle other updates
    if (timeSinceLastPublish < this.minPublishInterval) {
      // Schedule a delayed publish if not already scheduled
      if (!this.pendingPublish) {
        this.pendingPublish = setTimeout(async () => {
          this.pendingPublish = null;
          this.lastPublishTime = Date.now();
          await this._doPublish(eventData);
        }, this.minPublishInterval - timeSinceLastPublish);
      }
      return;
    }

    this.lastPublishTime = now;
    return this._doPublish(eventData);
  }

  /**
   * Actually performs the publish
   */
  async _doPublish(eventData) {
    try {
      await makeAppSyncRequest(PUBLISH_PROGRESS_MUTATION, eventData);
      console.log(`[ProgressPublisher] Published ${eventData.status}: ${eventData.postsFound} found, ${eventData.newPostsAdded} new`);
    } catch (error) {
      console.error('[ProgressPublisher] Failed to publish:', error.message);
    }
  }

  /**
   * Calculate estimated time remaining based on page timing history
   */
  calculateEstimatedTime() {
    if (!this.totalPages || this.pagesCompleted === 0) return null;
    
    const avgPageTime = this.pageTimings.length > 0 
      ? this.pageTimings.reduce((a, b) => a + b, 0) / this.pageTimings.length 
      : 5000; // Default 5 seconds per page
    
    const remainingPages = this.totalPages - this.pagesCompleted;
    return Math.round((remainingPages * avgPageTime) / 1000); // seconds
  }

  /**
   * Calculate average posts per page
   */
  calculateAveragePostsPerPage() {
    if (this.pagesCompleted === 0) return null;
    return this.postsFound / this.pagesCompleted;
  }

  /**
   * Record page timing for estimates
   */
  recordPageTiming(durationMs) {
    this.pageTimings.push(durationMs);
    // Keep last 5 timings for moving average
    if (this.pageTimings.length > 5) {
      this.pageTimings.shift();
    }
  }

  // =========================================================================
  // PUBLIC CONVENIENCE METHODS
  // =========================================================================

  /**
   * Publish STARTED event
   */
  async started(message = 'Starting sync...') {
    this.startTime = Date.now();
    return this.publish('STARTED', { message });
  }

  /**
   * Publish FETCHING_PAGE event
   */
  async fetchingPage(pageNum, totalPages = null) {
    this.pagesCompleted = pageNum - 1; // Current page not yet complete
    this.totalPages = totalPages;
    return this.publish('FETCHING_PAGE', {
      message: `Fetching page ${pageNum}${totalPages ? ` of ~${totalPages}` : ''}...`,
    });
  }

  /**
   * Publish page completion
   */
  async pageCompleted(pageNum, postsOnPage, durationMs = null) {
    this.pagesCompleted = pageNum;
    if (durationMs) {
      this.recordPageTiming(durationMs);
    }
    return this.publish('IN_PROGRESS', {
      message: `Completed page ${pageNum} (${postsOnPage} posts)`,
      currentPagePosts: postsOnPage,
    });
  }

  /**
   * Publish individual post processing
   */
  async postProcessed(post, isNew = false) {
    if (isNew) {
      this.newPostsAdded++;
    } else {
      this.duplicatesSkipped++;
    }
    this.postsFound++;

    // Add to recent posts
    const transformedPost = transformPostForProgress(post, isNew);
    this.recentPosts.unshift(transformedPost);
    if (this.recentPosts.length > this.maxRecentPosts) {
      this.recentPosts.pop();
    }

    return this.publish('PROCESSING_POST', {
      currentPost: transformedPost,
    });
  }

  /**
   * Publish batch of posts processed (more efficient for high volume)
   */
  async batchPostsProcessed(posts, newCount, duplicateCount) {
    this.postsFound += posts.length;
    this.newPostsAdded += newCount;
    this.duplicatesSkipped += duplicateCount;

    // Add transformed posts to recent
    const transformedPosts = posts.map((p, i) => 
      transformPostForProgress(p, i < newCount)
    );
    this.recentPosts = [...transformedPosts, ...this.recentPosts].slice(0, this.maxRecentPosts);

    return this.publish('IN_PROGRESS', {
      message: `Processed ${posts.length} posts (${newCount} new)`,
      currentPagePosts: posts.length,
    });
  }

  /**
   * Publish COMPLETED event
   */
  async completed(finalStats = {}) {
    return this.publish('COMPLETED', {
      message: `Sync complete: ${this.newPostsAdded} new posts saved`,
      completedAt: new Date().toISOString(),
      ...finalStats,
    });
  }

  /**
   * Publish RATE_LIMITED event
   */
  async rateLimited(message = 'Rate limited by Facebook') {
    return this.publish('RATE_LIMITED', {
      message,
      rateLimited: true,
    });
  }

  /**
   * Publish FAILED event
   */
  async failed(errorMessage) {
    return this.publish('FAILED', {
      message: errorMessage,
    });
  }

  /**
   * Flush any pending publishes
   */
  async flush() {
    if (this.pendingPublish) {
      clearTimeout(this.pendingPublish);
      this.pendingPublish = null;
      await this.publish('IN_PROGRESS', { message: 'Progress update' });
    }
  }
}

module.exports = {
  ProgressPublisher,
  transformPostForProgress,
  createContentPreview,
};
