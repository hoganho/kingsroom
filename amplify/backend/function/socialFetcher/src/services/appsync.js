/**
 * AppSync Service
 * 
 * Handles publishing real-time updates via AppSync subscriptions.
 */

const https = require('https');
const { SignatureV4 } = require('@aws-sdk/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { config } = require('../config');

const APPSYNC_ENDPOINT = config.appsync.endpoint;
const APPSYNC_REGION = config.region;

// Throttle download progress updates
let lastDownloadProgressUpdate = 0;
const DOWNLOAD_PROGRESS_THROTTLE_MS = 500;

/**
 * Execute an AppSync GraphQL mutation with IAM auth
 */
async function executeAppSyncMutation(mutation, variables) {
  if (!APPSYNC_ENDPOINT) {
    console.warn('[AppSync] Endpoint not configured');
    return null;
  }

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

/**
 * Publish sync progress to AppSync subscription
 * This allows the frontend to receive real-time updates
 */
async function publishSyncProgress(socialAccountId, status, data = {}) {
  if (!APPSYNC_ENDPOINT) {
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
      console.log(`[AppSync] Published: ${status} for ${socialAccountId} (${data.newPostsAdded || 0} new posts)`);
    }
  } catch (error) {
    console.error('[AppSync] Failed to publish sync progress:', error.message);
    // Don't throw - subscription publishing is non-critical
  }
}

/**
 * Publish download progress (throttled to avoid overwhelming subscriptions)
 */
async function publishDownloadProgress(socialAccountId, current, total, postDate, hasMedia) {
  const now = Date.now();
  
  // Only publish first, last, and throttled updates
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
 * Publish scrape started event
 */
async function publishScrapeStarted(socialAccountId, syncType = 'INCREMENTAL') {
  await publishSyncProgress(socialAccountId, 'STARTED', {
    message: `Starting ${syncType.toLowerCase()} sync...`,
  });
}

/**
 * Publish scrape completed event
 */
async function publishScrapeCompleted(socialAccountId, results) {
  await publishSyncProgress(socialAccountId, 'COMPLETED', {
    message: results.message || 'Sync completed',
    postsFound: results.postsFound || 0,
    newPostsAdded: results.newPostsAdded || 0,
    pagesCompleted: results.pagesCompleted || 0,
  });
}

/**
 * Publish scrape failed event
 */
async function publishScrapeFailed(socialAccountId, error, rateLimited = false) {
  await publishSyncProgress(socialAccountId, rateLimited ? 'RATE_LIMITED' : 'FAILED', {
    message: error,
    rateLimited,
  });
}

module.exports = {
  executeAppSyncMutation,
  publishSyncProgress,
  publishDownloadProgress,
  publishScrapeStarted,
  publishScrapeCompleted,
  publishScrapeFailed,
};
