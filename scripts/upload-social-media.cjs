/**
 * ===================================================================
 * SOCIAL POST MEDIA UPLOAD SCRIPT
 * ===================================================================
 * 
 * PURPOSE:
 * Upload local media files to S3 for existing SocialPost records where
 * the S3 migration failed or media wasn't properly copied.
 * 
 * USAGE:
 * node upload-social-media.cjs --source=/path/to/scraped/data [options]
 * 
 * OPTIONS:
 * --source=<path>     Root directory containing account folders (REQUIRED)
 * --dry-run           Preview changes without uploading
 * --account=<name>    Only process specific account folder
 * --skip-existing     Skip if S3 object already exists
 * --update-db         Update DynamoDB records with new S3 URLs
 * --limit=<n>         Limit number of posts to process
 * --verbose           Show detailed logging
 * 
 * EXPECTED FOLDER STRUCTURE:
 * <source>/
 * ├── kings_natan/
 * │   ├── 20240111_KingsNatan_6831989223595961_.../
 * │   │   ├── post.json
 * │   │   └── attachments/
 * │   │       ├── image1.jpg
 * │   │       └── image2.jpg
 * │   └── 20240112_KingsNatan_.../
 * └── another_account/
 *     └── ...
 * 
 * EXAMPLES:
 * node upload-social-media.cjs --source=./scraped-data --dry-run
 * node upload-social-media.cjs --source=./scraped-data --account=kings_natan --skip-existing
 * node upload-social-media.cjs --source=./scraped-data --update-db
 * 
 * ===================================================================
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

// ===================================================================
// CONFIGURATION
// ===================================================================

const CONFIG = {
  region: process.env.AWS_REGION || 'ap-southeast-2',
  
  // Target S3 bucket
  s3Bucket: process.env.S3_BUCKET || 'kingsroom-storage-prod',
  s3Prefix: 'social-media/post-attachments',
  
  // DynamoDB table
  socialPostTable: process.env.SOCIAL_POST_TABLE || 'SocialPost-ynuahifnznb5zddz727oiqnicy-prod',
  socialAccountTable: process.env.SOCIAL_ACCOUNT_TABLE || 'SocialAccount-ynuahifnznb5zddz727oiqnicy-prod',
  
  // Processing settings
  concurrentUploads: 5,
  delayBetweenPosts: 100, // ms
};

// ===================================================================
// INITIALIZE CLIENTS
// ===================================================================

const s3Client = new S3Client({ region: CONFIG.region });
const ddbClient = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true }
});

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function log(message, verbose = false, isVerbose = false) {
  if (!isVerbose || verbose) {
    console.log(message);
  }
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function getS3Url(bucket, key, region) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// ===================================================================
// S3 OPERATIONS
// ===================================================================

async function checkS3ObjectExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: CONFIG.s3Bucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function uploadFileToS3(localPath, s3Key, metadata = {}) {
  const fileBuffer = fs.readFileSync(localPath);
  const contentType = getContentType(localPath);
  
  await s3Client.send(new PutObjectCommand({
    Bucket: CONFIG.s3Bucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000',
    Metadata: {
      'uploaded-at': new Date().toISOString(),
      'source': 'upload-social-media-script',
      ...metadata,
    },
  }));
  
  return getS3Url(CONFIG.s3Bucket, s3Key, CONFIG.region);
}

// ===================================================================
// DYNAMODB OPERATIONS
// ===================================================================

async function getSocialAccountByName(accountName) {
  // Scan for account by name (not ideal but works for small datasets)
  const result = await docClient.send(new ScanCommand({
    TableName: CONFIG.socialAccountTable,
    FilterExpression: 'accountName = :name',
    ExpressionAttributeValues: { ':name': accountName },
    Limit: 1,
  }));
  
  return result.Items?.[0] || null;
}

async function getSocialPostByPlatformId(platformPostId) {
  // First try with FACEBOOK_ prefix
  const id = `FACEBOOK_${platformPostId}`;
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CONFIG.socialPostTable,
      Key: { id },
    }));
    
    if (result.Item) {
      return result.Item;
    }
  } catch (error) {
    // Continue to scan
  }
  
  // Fallback: scan by platformPostId
  const scanResult = await docClient.send(new ScanCommand({
    TableName: CONFIG.socialPostTable,
    FilterExpression: 'platformPostId = :pid',
    ExpressionAttributeValues: { ':pid': platformPostId },
    Limit: 1,
  }));
  
  return scanResult.Items?.[0] || null;
}

async function updateSocialPostMedia(postId, mediaUrls, thumbnailUrl) {
  await docClient.send(new UpdateCommand({
    TableName: CONFIG.socialPostTable,
    Key: { id: postId },
    UpdateExpression: 'SET mediaUrls = :urls, thumbnailUrl = :thumb, updatedAt = :now',
    ExpressionAttributeValues: {
      ':urls': mediaUrls,
      ':thumb': thumbnailUrl,
      ':now': new Date().toISOString(),
    },
  }));
}

// ===================================================================
// POST DISCOVERY
// ===================================================================

/**
 * Check if a directory is a post folder (contains post.json)
 */
function isPostFolder(dirPath) {
  return fs.existsSync(path.join(dirPath, 'post.json'));
}

/**
 * Process a single post folder and return post info
 */
function processPostFolder(postPath, accountFolder, postFolder) {
  const postJsonPath = path.join(postPath, 'post.json');
  const attachmentsPath = path.join(postPath, 'attachments');
  
  const attachments = [];
  
  // Find attachments in the attachments subfolder
  if (fs.existsSync(attachmentsPath)) {
    try {
      const files = fs.readdirSync(attachmentsPath)
        .filter(f => /\.(jpg|jpeg|png|gif|webp|mp4)$/i.test(f));
      
      for (const file of files) {
        attachments.push({
          filename: file,
          localPath: path.join(attachmentsPath, file),
        });
      }
    } catch (error) {
      console.warn(`  ⚠️  Cannot read attachments for ${postFolder}: ${error.message}`);
    }
  }
  
  return {
    accountFolder,
    postFolder,
    postJsonPath,
    attachmentsPath,
    attachments,
  };
}

function findPostFolders(sourceDir, accountFilter = null) {
  const posts = [];
  
  // Get all subdirectories
  let subDirs;
  try {
    subDirs = fs.readdirSync(sourceDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (error) {
    console.error(`  ❌ Cannot read source directory: ${error.message}`);
    return posts;
  }
  
  if (subDirs.length === 0) {
    return posts;
  }
  
  // Check the first subdirectory to determine structure
  const firstSubDir = path.join(sourceDir, subDirs[0]);
  const isDirectPostFolders = isPostFolder(firstSubDir);
  
  if (isDirectPostFolders) {
    // FLAT STRUCTURE: source contains post folders directly
    // e.g., /path/to/202508/20250801_KingsNatan_.../post.json
    console.log('     📁 Detected: Flat structure (post folders directly in source)');
    
    for (const postFolder of subDirs) {
      const postPath = path.join(sourceDir, postFolder);
      
      if (isPostFolder(postPath)) {
        // Extract account name from folder name pattern: YYYYMMDD_AccountName_PostId_...
        const match = postFolder.match(/^\d{8}_([^_]+)_/);
        const accountFolder = match ? match[1] : 'unknown';
        
        // Apply account filter if specified
        if (accountFilter && accountFolder.toLowerCase() !== accountFilter.toLowerCase()) {
          continue;
        }
        
        posts.push(processPostFolder(postPath, accountFolder, postFolder));
      }
    }
  } else {
    // NESTED STRUCTURE: source contains account folders, which contain post folders
    // e.g., /path/to/data/kings_natan/20250801_.../post.json
    console.log('     📁 Detected: Nested structure (account folders → post folders)');
    
    let accountFolders = subDirs;
    
    // Apply account filter if specified
    if (accountFilter) {
      accountFolders = accountFolders.filter(name => 
        name.toLowerCase() === accountFilter.toLowerCase()
      );
    }
    
    for (const accountFolder of accountFolders) {
      const accountPath = path.join(sourceDir, accountFolder);
      
      // Get all post folders within account
      let postFolders;
      try {
        postFolders = fs.readdirSync(accountPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
      } catch (error) {
        console.warn(`  ⚠️  Cannot read account folder ${accountFolder}: ${error.message}`);
        continue;
      }
      
      for (const postFolder of postFolders) {
        const postPath = path.join(accountPath, postFolder);
        
        if (isPostFolder(postPath)) {
          posts.push(processPostFolder(postPath, accountFolder, postFolder));
        }
      }
    }
  }
  
  return posts;
}

// ===================================================================
// MAIN PROCESSING
// ===================================================================

async function processPost(postInfo, options) {
  const { dryRun, skipExisting, updateDb, verbose } = options;
  
  // Read post.json
  let postData;
  try {
    const content = fs.readFileSync(postInfo.postJsonPath, 'utf-8');
    postData = JSON.parse(content);
  } catch (error) {
    log(`  ❌ Failed to read post.json: ${error.message}`, true);
    return { status: 'error', error: 'Failed to read post.json' };
  }
  
  const platformPostId = postData.post_id || postData.postId;
  if (!platformPostId) {
    log(`  ❌ No post_id found in post.json`, true);
    return { status: 'error', error: 'No post_id' };
  }
  
  log(`  📄 Post ID: ${platformPostId}`, verbose, true);
  
  // Check if post exists in DynamoDB
  const existingPost = await getSocialPostByPlatformId(platformPostId);
  if (!existingPost) {
    log(`  ⚠️  Post not found in DynamoDB, skipping`, true);
    return { status: 'skipped', reason: 'Not in DynamoDB' };
  }
  
  const socialAccountId = existingPost.socialAccountId;
  log(`  📍 Found in DynamoDB: ${existingPost.id}`, verbose, true);
  log(`  📍 Social Account: ${socialAccountId}`, verbose, true);
  
  if (postInfo.attachments.length === 0) {
    log(`  ⚠️  No attachments found`, verbose, true);
    return { status: 'skipped', reason: 'No attachments' };
  }
  
  // Process attachments
  const uploadedUrls = [];
  const results = {
    uploaded: 0,
    skipped: 0,
    failed: 0,
  };
  
  for (let i = 0; i < postInfo.attachments.length; i++) {
    const attachment = postInfo.attachments[i];
    const timestamp = Date.now();
    
    // Generate S3 key matching the Lambda format
    const s3Key = `${CONFIG.s3Prefix}/${socialAccountId}/${platformPostId}/${timestamp}-${i}-${attachment.filename}`;
    
    log(`    📎 ${attachment.filename} -> ${s3Key}`, verbose, true);
    
    // Check if already exists
    if (skipExisting) {
      const exists = await checkS3ObjectExists(s3Key);
      if (exists) {
        log(`    ⏭️  Already exists, skipping`, verbose, true);
        uploadedUrls.push(getS3Url(CONFIG.s3Bucket, s3Key, CONFIG.region));
        results.skipped++;
        continue;
      }
    }
    
    // Upload
    if (dryRun) {
      log(`    🔍 [DRY RUN] Would upload: ${attachment.localPath}`, true);
      uploadedUrls.push(getS3Url(CONFIG.s3Bucket, s3Key, CONFIG.region));
      results.uploaded++;
    } else {
      try {
        const url = await uploadFileToS3(attachment.localPath, s3Key, {
          'post-id': platformPostId,
          'account-id': socialAccountId,
          'original-filename': attachment.filename,
        });
        uploadedUrls.push(url);
        results.uploaded++;
        log(`    ✅ Uploaded: ${url}`, verbose, true);
      } catch (error) {
        log(`    ❌ Upload failed: ${error.message}`, true);
        results.failed++;
      }
    }
  }
  
  // Update DynamoDB if requested
  if (updateDb && uploadedUrls.length > 0 && !dryRun) {
    try {
      await updateSocialPostMedia(existingPost.id, uploadedUrls, uploadedUrls[0]);
      log(`  📝 Updated DynamoDB record`, verbose, true);
    } catch (error) {
      log(`  ❌ Failed to update DynamoDB: ${error.message}`, true);
    }
  } else if (updateDb && dryRun) {
    log(`  🔍 [DRY RUN] Would update DynamoDB with ${uploadedUrls.length} URLs`, true);
  }
  
  return {
    status: 'success',
    postId: existingPost.id,
    ...results,
    urls: uploadedUrls,
  };
}

// ===================================================================
// MAIN
// ===================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SOCIAL POST MEDIA UPLOAD SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Parse arguments
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    skipExisting: args.includes('--skip-existing'),
    updateDb: args.includes('--update-db'),
    verbose: args.includes('--verbose'),
  };
  
  // Parse source directory
  const sourceArg = args.find(arg => arg.startsWith('--source='));
  if (!sourceArg) {
    console.error('\n  ❌ Missing required argument: --source=<path>');
    console.error('  Usage: node upload-social-media.cjs --source=/path/to/data [options]');
    process.exit(1);
  }
  const sourceDir = sourceArg.split('=')[1];
  
  // Parse account filter
  const accountArg = args.find(arg => arg.startsWith('--account='));
  const accountFilter = accountArg ? accountArg.split('=')[1] : null;
  
  // Parse limit
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  
  // Validate source directory
  if (!fs.existsSync(sourceDir)) {
    console.error(`\n  ❌ Source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  
  // Configuration summary
  console.log('\n  📋 Configuration:');
  console.log(`     Source: ${path.resolve(sourceDir)}`);
  console.log(`     S3 Bucket: ${CONFIG.s3Bucket}`);
  console.log(`     DynamoDB Table: ${CONFIG.socialPostTable}`);
  console.log(`     Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`     Skip Existing: ${options.skipExisting ? 'Yes' : 'No'}`);
  console.log(`     Update DynamoDB: ${options.updateDb ? 'Yes' : 'No'}`);
  if (accountFilter) console.log(`     Account Filter: ${accountFilter}`);
  if (limit) console.log(`     Limit: ${limit} posts`);
  
  // Find all posts
  console.log('\n  🔍 Scanning for posts...');
  let posts = findPostFolders(sourceDir, accountFilter);
  
  // Apply limit
  if (limit && posts.length > limit) {
    posts = posts.slice(0, limit);
  }
  
  console.log(`     Total post folders found: ${posts.length}`);
  
  // Calculate total attachments
  const totalAttachments = posts.reduce((sum, p) => sum + p.attachments.length, 0);
  const postsWithAttachments = posts.filter(p => p.attachments.length > 0).length;
  console.log(`     Posts with attachments: ${postsWithAttachments}`);
  console.log(`     Total attachments: ${totalAttachments}`);
  
  if (posts.length === 0) {
    console.log('\n  ⚠️  No posts found to process');
    process.exit(0);
  }
  
  // Process posts
  console.log('\n  📤 Processing posts...');
  console.log('─────────────────────────────────────────────────────────────────');
  
  const stats = {
    processed: 0,
    success: 0,
    skipped: 0,
    errors: 0,
    uploaded: 0,
    uploadSkipped: 0,
    uploadFailed: 0,
  };
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    stats.processed++;
    
    console.log(`\n[${i + 1}/${posts.length}] ${post.accountFolder}/${post.postFolder}`);
    console.log(`     Attachments: ${post.attachments.length}`);
    
    try {
      const result = await processPost(post, options);
      
      if (result.status === 'success') {
        stats.success++;
        stats.uploaded += result.uploaded || 0;
        stats.uploadSkipped += result.skipped || 0;
        stats.uploadFailed += result.failed || 0;
        console.log(`     ✅ Success: ${result.uploaded} uploaded, ${result.skipped} skipped`);
      } else if (result.status === 'skipped') {
        stats.skipped++;
        console.log(`     ⏭️  Skipped: ${result.reason}`);
      } else {
        stats.errors++;
        console.log(`     ❌ Error: ${result.error}`);
      }
    } catch (error) {
      stats.errors++;
      console.log(`     ❌ Error: ${error.message}`);
    }
    
    // Small delay to avoid rate limiting
    await sleep(CONFIG.delayBetweenPosts);
  }
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n  Posts processed: ${stats.processed}`);
  console.log(`  ✅ Success: ${stats.success}`);
  console.log(`  ⏭️  Skipped: ${stats.skipped}`);
  console.log(`  ❌ Errors: ${stats.errors}`);
  console.log(`\n  Files:`);
  console.log(`     Uploaded: ${stats.uploaded}`);
  console.log(`     Already existed: ${stats.uploadSkipped}`);
  console.log(`     Failed: ${stats.uploadFailed}`);
  
  if (options.dryRun) {
    console.log('\n  🔍 This was a DRY RUN - no changes were made');
    console.log('  Run without --dry-run to apply changes');
  }
  
  console.log('\n  Done!\n');
}

// Run
main().catch(error => {
  console.error('\n  ❌ Fatal error:', error);
  process.exit(1);
});
