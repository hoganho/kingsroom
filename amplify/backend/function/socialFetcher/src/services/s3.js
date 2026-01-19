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

  await getS3Client().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const url = `https://${S3_BUCKET}.s3.${config.region}.amazonaws.com/${key}`;
  console.log(`[S3] Uploaded: ${key}`);
  return url;
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
    const imageData = await downloadImage(imageUrl);
    if (!imageData) return null;

    return await uploadToS3(key, imageData.buffer, imageData.contentType);
  } catch (error) {
    console.error('[S3] Error storing page logo:', error.message);
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
  if (!S3_BUCKET || !imageUrl) {
    return null;
  }

  try {
    // Generate unique key with timestamp to avoid collisions
    const timestamp = Date.now();
    const key = `${POST_ATTACHMENTS_PREFIX}${accountId}/${postId}/${index}-${timestamp}.jpg`;

    // Check if already exists
    const exists = await objectExists(key);
    if (exists) {
      return `https://${S3_BUCKET}.s3.${config.region}.amazonaws.com/${key}`;
    }

    // Download and upload
    const imageData = await downloadImage(imageUrl);
    if (!imageData) return null;

    return await uploadToS3(key, imageData.buffer, imageData.contentType);
  } catch (error) {
    console.error('[S3] Error storing post attachment:', error.message);
    return null;
  }
}

/**
 * Store multiple post attachments
 */
async function storePostAttachments(accountId, postId, imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }

  const storedUrls = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    const url = await downloadAndStorePostAttachment(accountId, postId, imageUrls[i], i);
    if (url) {
      storedUrls.push(url);
    }
  }

  return storedUrls;
}

module.exports = {
  objectExists,
  uploadToS3,
  deleteFromS3,
  downloadAndStorePageLogo,
  downloadAndStorePostAttachment,
  storePostAttachments,
};
