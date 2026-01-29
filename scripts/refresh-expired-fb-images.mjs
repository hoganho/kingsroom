#!/usr/bin/env node

/**
 * Refresh Expired Facebook Images
 * 
 * This script re-fetches image URLs from the Facebook Graph API for posts
 * where the original CDN URLs have expired (returning 403).
 * 
 * How it works:
 * 1. Finds posts with Facebook CDN URLs
 * 2. Tests if each URL is still valid (HEAD request)
 * 3. For expired URLs, calls Facebook Graph API to get fresh URLs
 * 4. Downloads images and uploads to S3
 * 5. Updates the post's mediaUrls
 * 
 * Usage:
 *   DRY_RUN=1 node refresh-expired-fb-images.mjs    # Preview changes
 *   node refresh-expired-fb-images.mjs              # Apply changes
 * 
 * Environment variables:
 *   FB_ACCESS_TOKEN  - Facebook Graph API access token (required)
 *   AWS_PROFILE      - AWS profile to use (optional)
 *   DRY_RUN          - Set to 1 to preview without making changes
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import https from 'https';
import * as readline from 'readline';

// ------------------------------------------------------------------
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
    S3_BUCKET: 'pokerpro-scraper-storage',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
    S3_BUCKET: 'kingsroom-storage-prod',
  },
};

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_API_VERSION = 'v21.0';

// Rate limiting
const DOWNLOAD_DELAY_MS = 200;
const API_DELAY_MS = 100;

let SELECTED_ENV = null;
let config = null;

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
  fix: (msg) => console.log(`[FIX] 🔧 ${msg}`),
  skip: (msg) => console.log(`[SKIP] ⏭️  ${msg}`),
  download: (msg) => console.log(`[DOWNLOAD] 📥 ${msg}`),
  upload: (msg) => console.log(`[UPLOAD] 📤 ${msg}`),
  api: (msg) => console.log(`[FB API] 🌐 ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENTS
// ------------------------------------------------------------------

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({ region: REGION });

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTableName(modelName) {
  return `${modelName}-${config.API_ID}-${config.ENV_SUFFIX}`;
}

function isFacebookCdnUrl(url) {
  if (!url) return false;
  return url.includes('scontent') && url.includes('fbcdn.net');
}

function isS3Url(url) {
  if (!url) return false;
  return url.includes('.s3.') && url.includes('amazonaws.com');
}

/**
 * Extract Facebook Post ID from our post ID
 * Our ID format: {socialAccountId}_{pageId}_{postId}
 * Facebook ID format: {pageId}_{postId}
 */
function extractFacebookPostId(ourPostId) {
  const parts = ourPostId.split('_');
  if (parts.length >= 3) {
    // Return pageId_postId
    return `${parts[1]}_${parts[2]}`;
  }
  return null;
}

/**
 * Check if a URL is accessible (not expired)
 */
function checkUrlAccessible(url, timeout = 5000) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KingsroomBot/1.0)',
      },
    };

    const req = https.request(options, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Fetch fresh image URLs from Facebook Graph API
 */
async function fetchFreshImageUrls(fbPostId) {
  if (!FB_ACCESS_TOKEN) {
    throw new Error('FB_ACCESS_TOKEN environment variable is required');
  }

  const fields = 'full_picture,attachments{media_type,type,url,media,subattachments}';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${fbPostId}?fields=${fields}&access_token=${FB_ACCESS_TOKEN}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'Facebook API error'));
            return;
          }

          const imageUrls = [];

          // Get full_picture
          if (parsed.full_picture) {
            imageUrls.push(parsed.full_picture);
          }

          // Get attachment images
          if (parsed.attachments?.data) {
            for (const attachment of parsed.attachments.data) {
              // Direct media
              if (attachment.media?.image?.src) {
                const src = attachment.media.image.src;
                if (!imageUrls.some(u => getCanonicalPath(u) === getCanonicalPath(src))) {
                  imageUrls.push(src);
                }
              }

              // Subattachments (album photos)
              if (attachment.subattachments?.data) {
                for (const sub of attachment.subattachments.data) {
                  if (sub.media?.image?.src) {
                    const src = sub.media.image.src;
                    if (!imageUrls.some(u => getCanonicalPath(u) === getCanonicalPath(src))) {
                      imageUrls.push(src);
                    }
                  }
                }
              }
            }
          }

          resolve(imageUrls);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function getCanonicalPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Download image with proper headers
 */
function downloadImage(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl, redirectCount = 0, attemptsLeft = retries) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const urlObj = new URL(requestUrl);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KingsroomBot/1.0; +https://kingsroom.com.au)',
          'Accept': 'image/*,*/*;q=0.8',
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1, attemptsLeft);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}`);
          if (attemptsLeft > 0 && res.statusCode >= 500) {
            setTimeout(() => makeRequest(requestUrl, redirectCount, attemptsLeft - 1), 500);
            return;
          }
          reject(error);
          return;
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let contentType = res.headers['content-type'] || 'image/jpeg';
          resolve({ buffer, contentType });
        });
        res.on('error', reject);
      });

      req.on('error', (err) => {
        if (attemptsLeft > 0) {
          setTimeout(() => makeRequest(requestUrl, redirectCount, attemptsLeft - 1), 500);
          return;
        }
        reject(err);
      });

      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.end();
    };

    makeRequest(url);
  });
}

/**
 * Upload image to S3
 */
async function uploadToS3(buffer, contentType, accountId, postId, index) {
  const timestamp = Date.now();
  const extension = contentType.includes('png') ? 'png' : 
                   contentType.includes('gif') ? 'gif' : 
                   contentType.includes('webp') ? 'webp' : 'jpg';
  
  const key = `social-media/post-attachments/${accountId}/${postId}/${index}-${timestamp}.${extension}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `https://${config.S3_BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ------------------------------------------------------------------
// MAIN LOGIC
// ------------------------------------------------------------------

async function findPostsWithFacebookUrls() {
  const SOCIAL_POST_TABLE = getTableName('SocialPost');
  logger.info(`Scanning table: ${SOCIAL_POST_TABLE}`);

  const posts = [];
  let lastEvaluatedKey = null;
  let scannedCount = 0;

  do {
    const params = {
      TableName: SOCIAL_POST_TABLE,
      FilterExpression: '#s = :status',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':status': 'ACTIVE' },
      ProjectionExpression: 'id, socialAccountId, accountName, mediaUrls, thumbnailUrl, postedAt',
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await ddbDocClient.send(new ScanCommand(params));
    scannedCount += result.Items?.length || 0;

    for (const post of result.Items || []) {
      const mediaUrls = post.mediaUrls || [];
      const fbUrls = mediaUrls.filter(url => isFacebookCdnUrl(url));

      if (fbUrls.length > 0) {
        posts.push({
          ...post,
          fbUrlCount: fbUrls.length,
          s3UrlCount: mediaUrls.filter(url => isS3Url(url)).length,
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    process.stdout.write(`\r  Scanned ${scannedCount} posts, found ${posts.length} with FB URLs...`);
  } while (lastEvaluatedKey);

  console.log('');
  return posts;
}

async function processPost(post) {
  const fbPostId = extractFacebookPostId(post.id);
  
  if (!fbPostId) {
    logger.warn(`Could not extract Facebook post ID from: ${post.id}`);
    return { success: false, error: 'Invalid post ID format' };
  }

  // Check which URLs are expired
  const expiredUrls = [];
  const validUrls = [];

  for (const url of post.mediaUrls) {
    if (isS3Url(url)) {
      validUrls.push(url);
    } else if (isFacebookCdnUrl(url)) {
      const accessible = await checkUrlAccessible(url);
      if (accessible) {
        validUrls.push(url);
        logger.info(`  URL still valid: ${url.substring(0, 60)}...`);
      } else {
        expiredUrls.push(url);
        logger.warn(`  URL expired: ${url.substring(0, 60)}...`);
      }
    }
  }

  if (expiredUrls.length === 0) {
    logger.info(`  No expired URLs, skipping`);
    return { success: true, skipped: true };
  }

  // Fetch fresh URLs from Facebook
  logger.api(`Fetching fresh URLs for post ${fbPostId}...`);
  await sleep(API_DELAY_MS);

  let freshUrls;
  try {
    freshUrls = await fetchFreshImageUrls(fbPostId);
    logger.api(`Got ${freshUrls.length} fresh URL(s)`);
  } catch (err) {
    logger.error(`Failed to fetch from Facebook: ${err.message}`);
    return { success: false, error: err.message };
  }

  if (freshUrls.length === 0) {
    logger.warn(`No images found in Facebook response`);
    return { success: false, error: 'No images in FB response' };
  }

  // Download and upload fresh images
  const newS3Urls = [];
  
  for (let i = 0; i < freshUrls.length; i++) {
    const freshUrl = freshUrls[i];
    
    if (DRY_RUN) {
      logger.skip(`Would download: ${freshUrl.substring(0, 60)}...`);
      newS3Urls.push(freshUrl);
      continue;
    }

    await sleep(DOWNLOAD_DELAY_MS);

    try {
      logger.download(`Downloading image ${i + 1}/${freshUrls.length}...`);
      const { buffer, contentType } = await downloadImage(freshUrl);
      logger.download(`${buffer.length} bytes`);

      const s3Url = await uploadToS3(buffer, contentType, post.socialAccountId, post.id, i);
      logger.upload(`Stored: ${s3Url.split('/').pop()}`);
      newS3Urls.push(s3Url);
    } catch (err) {
      logger.error(`Failed to process image: ${err.message}`);
      // Keep the fresh FB URL as fallback
      newS3Urls.push(freshUrl);
    }
  }

  // Update the post
  if (!DRY_RUN && newS3Urls.length > 0) {
    const SOCIAL_POST_TABLE = getTableName('SocialPost');
    
    await ddbDocClient.send(new UpdateCommand({
      TableName: SOCIAL_POST_TABLE,
      Key: { id: post.id },
      UpdateExpression: 'SET mediaUrls = :mediaUrls, thumbnailUrl = :thumbnailUrl, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':mediaUrls': newS3Urls,
        ':thumbnailUrl': newS3Urls[0],
        ':updatedAt': new Date().toISOString(),
      },
    }));

    logger.success(`Updated post with ${newS3Urls.length} new URL(s)`);
  }

  return { 
    success: true, 
    refreshed: expiredUrls.length,
    newUrls: newS3Urls.length,
  };
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║        REFRESH EXPIRED FACEBOOK IMAGES                            ║
║        Re-fetches image URLs from Facebook Graph API              ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  // Check for FB access token
  if (!FB_ACCESS_TOKEN) {
    logger.error('FB_ACCESS_TOKEN environment variable is required');
    logger.info('Usage: FB_ACCESS_TOKEN=your_token node refresh-expired-fb-images.mjs');
    process.exit(1);
  }

  // Environment selection
  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        S3 Bucket: ${ENVIRONMENTS.dev.S3_BUCKET}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        S3 Bucket: ${ENVIRONMENTS.prod.S3_BUCKET}`);
  console.log('');

  const envChoice = await askQuestion('Select environment (dev/prod or 1/2): ');
  
  if (envChoice === '1' || envChoice.toLowerCase() === 'dev') {
    SELECTED_ENV = 'dev';
    config = ENVIRONMENTS.dev;
  } else if (envChoice === '2' || envChoice.toLowerCase() === 'prod') {
    SELECTED_ENV = 'prod';
    config = ENVIRONMENTS.prod;
  } else {
    logger.error('Invalid selection');
    process.exit(1);
  }

  console.log(`
──────────────────────────────────────────────────────────────────────
[INFO] Selected environment: ${SELECTED_ENV.toUpperCase()}
[INFO] S3 Bucket: ${config.S3_BUCKET}
[INFO] Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (changes will be applied)'}
──────────────────────────────────────────────────────────────────────
`);

  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    const confirm = await askQuestion('⚠️  You are about to modify PRODUCTION data. Type "yes" to continue: ');
    if (confirm.toLowerCase() !== 'yes') {
      logger.info('Aborted');
      process.exit(0);
    }
  }

  // Find posts with Facebook URLs
  logger.info('Scanning for posts with Facebook CDN URLs...');
  const posts = await findPostsWithFacebookUrls();

  if (posts.length === 0) {
    logger.success('No posts with Facebook URLs found!');
    return;
  }

  logger.info(`Found ${posts.length} posts with Facebook URLs`);
  console.log('');

  // Process each post
  const results = {
    refreshed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`\n[${i + 1}/${posts.length}] ${post.accountName} - ${post.id}`);
    console.log(`  Posted: ${post.postedAt}`);
    console.log(`  URLs: ${post.fbUrlCount} FB, ${post.s3UrlCount} S3`);

    try {
      const result = await processPost(post);
      
      if (result.skipped) {
        results.skipped++;
      } else if (result.success) {
        results.refreshed++;
      } else {
        results.failed++;
        results.errors.push({ postId: post.id, error: result.error });
      }
    } catch (err) {
      logger.error(`Unexpected error: ${err.message}`);
      results.failed++;
      results.errors.push({ postId: post.id, error: err.message });
    }
  }

  // Summary
  console.log(`
═══════════════════════════════════════════════════════════════════════
`);
  logger.success('REFRESH COMPLETE!');
  console.log(`
  Posts refreshed: ${results.refreshed}
  Posts skipped (URLs still valid): ${results.skipped}
  Posts failed: ${results.failed}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
`);

  if (results.errors.length > 0) {
    console.log('Errors:');
    for (const err of results.errors.slice(0, 10)) {
      console.log(`  ${err.postId}: ${err.error}`);
    }
    if (results.errors.length > 10) {
      console.log(`  ... and ${results.errors.length - 10} more`);
    }
  }
}

main().catch((err) => {
  logger.error('Script failed: ' + err.message);
  console.error(err);
  process.exit(1);
});
