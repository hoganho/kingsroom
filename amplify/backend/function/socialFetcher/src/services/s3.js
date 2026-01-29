/**
 * S3 Storage Service
 * 
 * Handles uploading and managing images in S3.
 */

const { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { config, getS3Client } = require('../config');
const { downloadImage } = require('./facebook');

const S3_BUCKET = config.s3.bucket;
const PAGE_LOGOS_PREFIX = config.s3.pageLogosPrefix;
const POST_ATTACHMENTS_PREFIX = config.s3.postAttachmentsPrefix;

/**
 * Check if an object exists in S3
 */
async function objectExists(key) {
  if (!S3_BUCKET) return false;
  
  try {
    await getS3Client().send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
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
 * Upload a buffer to S3
 */
async function uploadToS3(key, buffer, contentType) {
  if (!S3_BUCKET) {
    console.warn('[S3] Bucket not configured, skipping upload');
    return null;
  }

  try {
    await getS3Client().send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    const url = `https://${S3_BUCKET}.s3.${config.region}.amazonaws.com/${key}`;
    console.log(`[S3] Uploaded: ${key}`);
    return url;
  } catch (err) {
    // Enhanced error logging
    console.error(`[S3] Upload failed for key "${key}":`, {
      errorName: err.name,
      errorCode: err.Code || err.code,
      errorMessage: err.message,
      statusCode: err.$metadata?.httpStatusCode,
      bucket: S3_BUCKET,
      region: config.region,
    });
    throw err;
  }
}

/**
 * Delete an object from S3
 */
async function deleteFromS3(key) {
  if (!S3_BUCKET) return;

  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }));
    console.log(`[S3] Deleted: ${key}`);
  } catch (err) {
    console.warn(`[S3] Failed to delete ${key}:`, err.message);
  }
}

/**
 * Download and store a page logo
 * 
 * @param {string} accountId - Social account ID
 * @param {string} imageUrl - Facebook profile picture URL
 * @param {string} pageName - Page name for the filename
 * @param {boolean} forceRefresh - Force re-download even if exists
 * @returns {string|null} S3 URL of the stored image
 */
async function downloadAndStorePageLogo(accountId, imageUrl, pageName, forceRefresh = false) {
  if (!S3_BUCKET || !imageUrl) {
    if (!S3_BUCKET) console.warn('[S3] Bucket not configured for page logo storage');
    return null;
  }

  try {
    // Generate a clean filename
    const cleanName = (pageName || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    const key = `${PAGE_LOGOS_PREFIX}${accountId}/${cleanName}-logo.jpg`;

    // Check if already exists
    if (!forceRefresh) {
      const exists = await objectExists(key);
      if (exists) {
        console.log(`[S3] Logo already exists: ${key}`);
        return `https://${S3_BUCKET}.s3.${config.region}.amazonaws.com/${key}`;
      }
    }

    // Download and upload
    console.log(`[S3] Downloading page logo from: ${imageUrl.substring(0, 80)}...`);
    const imageData = await downloadImage(imageUrl);
    if (!imageData) {
      console.warn(`[S3] Failed to download page logo - downloadImage returned null`);
      return null;
    }

    console.log(`[S3] Downloaded logo: ${imageData.buffer.length} bytes, type: ${imageData.contentType}`);
    return await uploadToS3(key, imageData.buffer, imageData.contentType);
  } catch (error) {
    console.error('[S3] Error storing page logo:', {
      errorName: error.name,
      errorCode: error.Code || error.code,
      errorMessage: error.message,
      accountId,
      imageUrl: imageUrl?.substring(0, 80),
    });
    return null;
  }
}

/**
 * Download and store a post attachment
 * 
 * @param {string} accountId - Social account ID
 * @param {string} postId - Post ID
 * @param {string} imageUrl - Image URL
 * @param {number} index - Attachment index (for multiple images)
 * @returns {string|null} S3 URL of the stored image
 */
async function downloadAndStorePostAttachment(accountId, postId, imageUrl, index = 0) {
  if (!S3_BUCKET) {
    console.warn('[S3] Bucket not configured, skipping post attachment upload');
    return null;
  }
  
  if (!imageUrl) {
    console.warn('[S3] No image URL provided for post attachment');
    return null;
  }

  try {
    // Generate unique key with timestamp to avoid collisions
    const timestamp = Date.now();
    const key = `${POST_ATTACHMENTS_PREFIX}${accountId}/${postId}/${index}-${timestamp}.jpg`;

    // Check if we already have an image at this index (without timestamp)
    // This is a new image, so we'll create it fresh
    
    // Download image from Facebook
    console.log(`[S3] Downloading attachment ${index} from: ${imageUrl.substring(0, 80)}...`);
    const imageData = await downloadImage(imageUrl);
    
    if (!imageData) {
      console.error(`[S3] Failed to download post attachment - downloadImage returned null`, {
        imageUrl: imageUrl.substring(0, 100),
        accountId,
        postId,
        index,
      });
      return null;
    }

    console.log(`[S3] Downloaded attachment: ${imageData.buffer.length} bytes, type: ${imageData.contentType}`);
    
    // Upload to S3
    const s3Url = await uploadToS3(key, imageData.buffer, imageData.contentType);
    
    if (s3Url) {
      console.log(`[S3] Stored attachment ${index} for post ${postId}: ${key}`);
    }
    
    return s3Url;
  } catch (error) {
    // Enhanced error logging with full context
    console.error('[S3] Error storing post attachment:', {
      errorName: error.name,
      errorCode: error.Code || error.code,
      errorMessage: error.message,
      statusCode: error.$metadata?.httpStatusCode,
      accountId,
      postId,
      imageUrl: imageUrl?.substring(0, 100),
      index,
      bucket: S3_BUCKET,
      region: config.region,
    });
    return null;
  }
}

/**
 * Store multiple post attachments
 * 
 * @param {string} accountId - Social account ID
 * @param {string} postId - Post ID
 * @param {string[]} imageUrls - Array of image URLs to store
 * @returns {string[]} Array of S3 URLs (empty strings for failed uploads)
 */
async function storePostAttachments(accountId, postId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }

  if (!S3_BUCKET) {
    console.warn(`[S3] Bucket not configured - falling back to source URLs for ${imageUrls.length} images`);
    return [];
  }

  console.log(`[S3] Storing ${imageUrls.length} attachments for post ${postId}...`);
  
  const storedUrls = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = await downloadAndStorePostAttachment(accountId, postId, imageUrls[i], i);
    if (url) {
      storedUrls.push(url);
      successCount++;
    } else {
      failCount++;
    }
  }

  // Summary log
  if (failCount > 0) {
    console.warn(`[S3] Post ${postId}: ${successCount}/${imageUrls.length} images stored successfully, ${failCount} failed`);
  } else if (successCount > 0) {
    console.log(`[S3] Post ${postId}: All ${successCount} images stored successfully`);
  }

  return storedUrls;
}

/**
 * Check if a URL is an S3 URL (vs Facebook CDN URL)
 * 
 * @param {string} url - URL to check
 * @returns {boolean} True if it's an S3 URL
 */
function isS3Url(url) {
  if (!url) return false;
  return url.includes('.s3.') && url.includes('amazonaws.com');
}

/**
 * Check if a URL is a Facebook CDN URL
 * 
 * @param {string} url - URL to check
 * @returns {boolean} True if it's a Facebook CDN URL
 */
function isFacebookCdnUrl(url) {
  if (!url) return false;
  return url.includes('scontent') && url.includes('fbcdn.net');
}

module.exports = {
  objectExists,
  uploadToS3,
  deleteFromS3,
  downloadAndStorePageLogo,
  downloadAndStorePostAttachment,
  storePostAttachments,
  isS3Url,
  isFacebookCdnUrl,
  S3_BUCKET,
};