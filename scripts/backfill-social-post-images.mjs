// backfill-social-post-images.mjs
// 
// This script fixes SocialPost records that have Facebook CDN URLs instead of S3 URLs
// in their mediaUrls field. This happens when S3 uploads fail during scraping.
//
// This script will:
// 1. Find all SocialPost records where mediaUrls contain Facebook CDN URLs
// 2. Download each image from Facebook
// 3. Upload to S3
// 4. Update the post's mediaUrls and thumbnailUrl with S3 URLs
//
// ⚠️ WARNING: This modifies production data. Always backup first!
//
// Usage:
//   DRY_RUN=1 node backfill-social-post-images.mjs    # Preview changes
//   node backfill-social-post-images.mjs              # Apply changes

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import https from 'https';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

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

// Output directory for reports
const REPORT_OUTPUT_DIR = process.env.REPORT_OUTPUT_DIR || './backfill-reports';

// Batch size for updates
const UPDATE_BATCH_SIZE = 5;

// Delay between batches to avoid throttling (ms)
const BATCH_DELAY_MS = 1000;

// Delay between image downloads to avoid FB rate limiting (ms)
const DOWNLOAD_DELAY_MS = 200;

// If set to 1, we don't modify data; we just report what would be fixed
const DRY_RUN = process.env.DRY_RUN === '1';

// S3 prefixes (must match your Lambda config)
const POST_ATTACHMENTS_PREFIX = 'social-media/post-attachments/';

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

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

function makeTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getTableName(modelName) {
  return `${modelName}-${config.API_ID}-${config.ENV_SUFFIX}`;
}

/**
 * Check if a URL is a Facebook CDN URL
 */
function isFacebookCdnUrl(url) {
  if (!url) return false;
  return url.includes('scontent') && url.includes('fbcdn.net');
}

/**
 * Check if a URL is an S3 URL
 */
function isS3Url(url) {
  if (!url) return false;
  return url.includes('.s3.') && url.includes('amazonaws.com');
}

/**
 * Download image from URL with proper headers
 * Uses User-Agent header to avoid being blocked by Facebook CDN
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
          // User-Agent is REQUIRED - Facebook CDN blocks requests without it
          'User-Agent': 'Mozilla/5.0 (compatible; KingsroomBot/1.0; +https://kingsroom.com.au)',
          'Accept': 'image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      };

      const req = https.request(options, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location, redirectCount + 1, attemptsLeft);
          return;
        }

        // Check for errors
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`);
          
          // Retry on 5xx or 429
          if (attemptsLeft > 0 && (res.statusCode >= 500 || res.statusCode === 429)) {
            const delay = res.statusCode === 429 ? 2000 : 500;
            setTimeout(() => makeRequest(requestUrl, redirectCount, attemptsLeft - 1), delay);
            return;
          }
          
          reject(error);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          
          if (buffer.length < 100) {
            reject(new Error('Response too small, likely not a valid image'));
            return;
          }
          
          // Detect content type
          let contentType = res.headers['content-type'] || 'image/jpeg';
          if (requestUrl.includes('.png')) contentType = 'image/png';
          else if (requestUrl.includes('.gif')) contentType = 'image/gif';
          else if (requestUrl.includes('.webp')) contentType = 'image/webp';
          
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
        if (attemptsLeft > 0) {
          setTimeout(() => makeRequest(requestUrl, redirectCount, attemptsLeft - 1), 500);
          return;
        }
        reject(new Error('Request timeout (15s)'));
      });

      req.end();
    };

    makeRequest(url);
  });
}

/**
 * Check if an object exists in S3
 */
async function objectExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
    }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Upload buffer to S3
 */
async function uploadToS3(key, buffer, contentType) {
  await s3Client.send(new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return `https://${config.S3_BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

/**
 * Download and store a single image
 */
async function downloadAndStoreImage(accountId, postId, imageUrl, index) {
  const timestamp = Date.now();
  const key = `${POST_ATTACHMENTS_PREFIX}${accountId}/${postId}/${index}-${timestamp}.jpg`;

  try {
    // Download from Facebook
    const imageData = await downloadImage(imageUrl);
    
    if (!imageData || !imageData.buffer || imageData.buffer.length === 0) {
      logger.warn(`Empty image data for ${imageUrl.substring(0, 60)}...`);
      return null;
    }

    logger.download(`${imageData.buffer.length} bytes from FB`);

    // Upload to S3
    const s3Url = await uploadToS3(key, imageData.buffer, imageData.contentType);
    logger.upload(`Stored as ${key}`);

    return s3Url;
  } catch (error) {
    logger.error(`Failed to process image: ${error.message}`);
    return null;
  }
}

// ------------------------------------------------------------------
// SCAN FOR POSTS WITH FB URLs
// ------------------------------------------------------------------

async function findPostsWithFacebookUrls() {
  const tableName = getTableName('SocialPost');
  logger.info(`Scanning table: ${tableName}`);

  const posts = [];
  const stats = {
    totalScanned: 0,
    withMedia: 0,
    withFacebookUrls: 0,
    alreadyOnS3: 0,
    noMedia: 0,
  };

  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: tableName,
      ProjectionExpression: 'id, socialAccountId, accountName, mediaUrls, thumbnailUrl, postedAt, #s',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      FilterExpression: '#s = :active',
      ExpressionAttributeValues: {
        ':active': 'ACTIVE',
      },
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
    };

    const response = await ddbDocClient.send(new ScanCommand(params));

    for (const post of response.Items || []) {
      stats.totalScanned++;

      const mediaUrls = post.mediaUrls || [];
      
      if (mediaUrls.length === 0) {
        stats.noMedia++;
        continue;
      }

      stats.withMedia++;

      // Check if any URLs are Facebook CDN URLs
      const fbUrls = mediaUrls.filter(url => isFacebookCdnUrl(url));
      const s3Urls = mediaUrls.filter(url => isS3Url(url));

      if (fbUrls.length > 0) {
        stats.withFacebookUrls++;
        posts.push({
          id: post.id,
          socialAccountId: post.socialAccountId,
          accountName: post.accountName,
          mediaUrls: mediaUrls,
          thumbnailUrl: post.thumbnailUrl,
          postedAt: post.postedAt,
          fbUrlCount: fbUrls.length,
          s3UrlCount: s3Urls.length,
          totalImages: mediaUrls.length,
        });
      } else {
        stats.alreadyOnS3++;
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
    
    // Progress update every 100 items
    if (stats.totalScanned % 100 === 0) {
      process.stdout.write(`\r  Scanned ${stats.totalScanned} posts...`);
    }
  } while (lastEvaluatedKey);

  console.log(''); // New line after progress
  return { posts, stats };
}

// ------------------------------------------------------------------
// PROCESS POSTS
// ------------------------------------------------------------------

async function processPosts(posts) {
  const results = {
    fixed: 0,
    failed: 0,
    partiallyFixed: 0,
    totalImagesDownloaded: 0,
    totalImagesFailed: 0,
    details: [],
    errors: [],
  };

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    
    console.log(`\n[${ i + 1}/${posts.length}] Processing: ${post.accountName} - ${post.id}`);
    console.log(`  Posted: ${post.postedAt}`);
    console.log(`  Images: ${post.totalImages} total (${post.fbUrlCount} FB, ${post.s3UrlCount} S3)`);

    const detail = {
      postId: post.id,
      accountName: post.accountName,
      originalMediaUrls: [...post.mediaUrls],
      newMediaUrls: [],
      imagesDownloaded: 0,
      imagesFailed: 0,
      status: 'pending',
      error: null,
    };

    try {
      const newMediaUrls = [];
      let downloadedCount = 0;
      let failedCount = 0;

      // Process each media URL
      for (let j = 0; j < post.mediaUrls.length; j++) {
        const url = post.mediaUrls[j];

        if (isS3Url(url)) {
          // Already on S3, keep it
          newMediaUrls.push(url);
          logger.info(`  [${j}] Already on S3 ✓`);
        } else if (isFacebookCdnUrl(url)) {
          // Need to download and re-upload
          logger.info(`  [${j}] Downloading from Facebook...`);
          
          if (DRY_RUN) {
            logger.skip(`  [${j}] Would download: ${url.substring(0, 60)}...`);
            newMediaUrls.push(url); // Keep original in dry run
          } else {
            await sleep(DOWNLOAD_DELAY_MS); // Rate limit protection
            
            const s3Url = await downloadAndStoreImage(
              post.socialAccountId,
              post.id,
              url,
              j
            );

            if (s3Url) {
              newMediaUrls.push(s3Url);
              downloadedCount++;
              results.totalImagesDownloaded++;
            } else {
              // Keep original FB URL if download fails
              newMediaUrls.push(url);
              failedCount++;
              results.totalImagesFailed++;
              logger.warn(`  [${j}] Failed, keeping FB URL`);
            }
          }
        } else {
          // Unknown URL type, keep it
          newMediaUrls.push(url);
          logger.warn(`  [${j}] Unknown URL type: ${url.substring(0, 60)}...`);
        }
      }

      detail.newMediaUrls = newMediaUrls;
      detail.imagesDownloaded = downloadedCount;
      detail.imagesFailed = failedCount;

      // Update the post in DynamoDB
      if (!DRY_RUN && downloadedCount > 0) {
        const newThumbnailUrl = newMediaUrls[0] || post.thumbnailUrl;
        
        await ddbDocClient.send(new UpdateCommand({
          TableName: getTableName('SocialPost'),
          Key: { id: post.id },
          UpdateExpression: 'SET mediaUrls = :mediaUrls, thumbnailUrl = :thumbnailUrl, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':mediaUrls': newMediaUrls,
            ':thumbnailUrl': newThumbnailUrl,
            ':updatedAt': new Date().toISOString(),
          },
        }));

        if (failedCount === 0) {
          detail.status = 'fixed';
          results.fixed++;
          logger.success(`  Updated post with ${downloadedCount} new S3 URLs`);
        } else {
          detail.status = 'partial';
          results.partiallyFixed++;
          logger.warn(`  Partially fixed: ${downloadedCount} succeeded, ${failedCount} failed`);
        }
      } else if (DRY_RUN) {
        detail.status = 'dry_run';
        logger.info(`  [DRY RUN] Would update ${post.fbUrlCount} URLs`);
      }

    } catch (error) {
      detail.status = 'error';
      detail.error = error.message;
      results.failed++;
      results.errors.push({ postId: post.id, error: error.message });
      logger.error(`  Failed: ${error.message}`);
    }

    results.details.push(detail);

    // Batch delay
    if ((i + 1) % UPDATE_BATCH_SIZE === 0) {
      logger.info(`\n  --- Batch complete, waiting ${BATCH_DELAY_MS}ms ---\n`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

// ------------------------------------------------------------------
// GENERATE REPORT
// ------------------------------------------------------------------

async function generateReport(posts, stats, processResults, timestamp) {
  const reportDir = path.join(REPORT_OUTPUT_DIR, `backfill_images_${config.ENV_SUFFIX}_${timestamp}`);
  await fs.mkdir(reportDir, { recursive: true });

  // Summary report
  const summaryPath = path.join(reportDir, 'summary.txt');
  const summaryContent = `
SOCIAL POST IMAGES BACKFILL REPORT
==================================
Generated: ${new Date().toISOString()}
Environment: ${SELECTED_ENV.toUpperCase()}
Dry Run: ${DRY_RUN ? 'YES' : 'NO'}

SCAN STATISTICS
---------------
Total posts scanned: ${stats.totalScanned}
Posts with media: ${stats.withMedia}
Posts with Facebook URLs: ${stats.withFacebookUrls}
Posts already on S3: ${stats.alreadyOnS3}
Posts without media: ${stats.noMedia}

PROCESSING RESULTS
------------------
Posts fully fixed: ${processResults.fixed}
Posts partially fixed: ${processResults.partiallyFixed}
Posts failed: ${processResults.failed}

Images downloaded: ${processResults.totalImagesDownloaded}
Images failed: ${processResults.totalImagesFailed}

${processResults.errors.length > 0 ? `
ERRORS
------
${processResults.errors.map(e => `${e.postId}: ${e.error}`).join('\n')}
` : ''}

WHAT WAS FIXED
--------------
For each post with Facebook CDN URLs:
1. Downloaded image from Facebook CDN
2. Uploaded to S3 bucket: ${config.S3_BUCKET}
3. Updated mediaUrls and thumbnailUrl in DynamoDB
`;

  await fs.writeFile(summaryPath, summaryContent);
  logger.success(`Summary saved to: ${summaryPath}`);

  // Detailed CSV
  if (processResults.details.length > 0) {
    const csvPath = path.join(reportDir, 'processed_posts.csv');
    const headers = [
      'postId', 'accountName', 'status', 'imagesDownloaded', 'imagesFailed', 'error'
    ];

    const rows = processResults.details.map(d => [
      d.postId,
      `"${(d.accountName || '').replace(/"/g, '""')}"`,
      d.status,
      d.imagesDownloaded,
      d.imagesFailed,
      d.error || '',
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');
    await fs.writeFile(csvPath, csvContent);
    logger.success(`Detailed CSV saved to: ${csvPath}`);
  }

  return reportDir;
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        SOCIAL POST IMAGES BACKFILL SCRIPT                         ║');
  console.log('║        Downloads Facebook images and stores them in S3            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log(`        S3 Bucket: ${ENVIRONMENTS.dev.S3_BUCKET}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log(`        S3 Bucket: ${ENVIRONMENTS.prod.S3_BUCKET}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    logger.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`API ID: ${config.API_ID}`);
  logger.info(`S3 Bucket: ${config.S3_BUCKET}`);
  logger.info(`SocialPost table: ${getTableName('SocialPost')}`);
  logger.info(`Dry Run: ${DRY_RUN ? 'YES (no changes will be made)' : 'NO (will modify data!)'}`);
  console.log('─'.repeat(70) + '\n');

  // Production safety check
  if (SELECTED_ENV === 'prod' && !DRY_RUN) {
    logger.warn('⚠️  You are about to MODIFY PRODUCTION data!');
    logger.warn('⚠️  This will download images from Facebook and update DynamoDB records.');
    const confirm = await askQuestion('Type "backfill images" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'backfill images') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.warn('AWS credentials not found in environment variables.');
    logger.info('Using default credential chain (profile, instance role, etc.)');
  }

  const timestamp = makeTimestamp();

  // Step 1: Find posts with Facebook URLs
  logger.info('\n📊 STEP 1: Scanning for posts with Facebook CDN URLs...\n');
  const { posts, stats } = await findPostsWithFacebookUrls();

  console.log('\n' + '─'.repeat(70));
  logger.info('SCAN RESULTS:');
  logger.info(`  Total posts scanned: ${stats.totalScanned}`);
  logger.info(`  Posts with media: ${stats.withMedia}`);
  logger.info(`  Posts with Facebook URLs: ${stats.withFacebookUrls}`);
  logger.info(`  Posts already on S3: ${stats.alreadyOnS3}`);
  console.log('─'.repeat(70) + '\n');

  if (posts.length === 0) {
    logger.success('No posts need fixing! All images are already on S3.');
    return;
  }

  // Calculate total images
  const totalFbImages = posts.reduce((sum, p) => sum + p.fbUrlCount, 0);
  logger.info(`Found ${posts.length} posts with ${totalFbImages} Facebook images to download.`);

  // Show sample
  logger.info('\nSample of posts needing backfill:');
  const sample = posts.slice(0, 5);
  for (const post of sample) {
    console.log(`\n  📋 ${post.accountName}`);
    console.log(`     ID: ${post.id}`);
    console.log(`     Posted: ${post.postedAt}`);
    console.log(`     Images: ${post.fbUrlCount} FB / ${post.s3UrlCount} S3`);
  }
  if (posts.length > 5) {
    console.log(`\n  ... and ${posts.length - 5} more`);
  }
  console.log('');

  // Confirm before processing
  if (!DRY_RUN) {
    const confirmFix = await askQuestion(`\nProcess ${posts.length} posts (${totalFbImages} images)? Type "backfill" to continue: `);
    if (confirmFix.toLowerCase().trim() !== 'backfill') {
      logger.info('Aborted by user.');
      return;
    }
  }

  // Step 2: Process posts
  logger.info('\n🔧 STEP 2: Downloading images and updating posts...\n');
  const processResults = await processPosts(posts);

  // Step 3: Generate report
  logger.info('\n📝 STEP 3: Generating report...\n');
  const reportDir = await generateReport(posts, stats, processResults, timestamp);

  // Final summary
  console.log('\n' + '═'.repeat(70));
  logger.success('BACKFILL COMPLETE!');
  console.log('═'.repeat(70));
  console.log(`
  Posts fully fixed: ${processResults.fixed}
  Posts partially fixed: ${processResults.partiallyFixed}
  Posts failed: ${processResults.failed}
  
  Images downloaded: ${processResults.totalImagesDownloaded}
  Images failed: ${processResults.totalImagesFailed}
  
  Report saved to: ${reportDir}
  
  ${DRY_RUN ? '⚠️  This was a DRY RUN - no changes were made!' : ''}
  `);
}

main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  console.error(err);
  process.exit(1);
});
