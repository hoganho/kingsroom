// src/config/s3Config.ts
// Shared S3 configuration using environment variable (same pattern as Lambda functions)

// S3 Bucket from environment variable
// Vite: VITE_S3_BUCKET
// Fallback to dev bucket for local development
const S3_BUCKET = import.meta.env.VITE_S3_BUCKET || 'pokerpro-scraper-storage';
const S3_REGION = import.meta.env.VITE_S3_REGION || 'ap-southeast-2';

/**
 * Get the S3 bucket name
 */
export function getS3Bucket(): string {
  return S3_BUCKET;
}

/**
 * Get the S3 region
 */
export function getS3Region(): string {
  return S3_REGION;
}

/**
 * Get the full S3 configuration
 */
export function getS3Config() {
  return {
    bucket: S3_BUCKET,
    region: S3_REGION,
  } as const;
}

/**
 * Get S3 config with additional path configurations
 * Used by useS3Upload for structured upload paths
 */
export function getS3UploadConfig() {
  return {
    bucket: S3_BUCKET,
    region: S3_REGION,
    paths: {
      venueLogo: 'logos/venue',
      entityLogo: 'logos/entity',
      socialMedia: 'social-media/post-attachments',
    },
  } as const;
}

/**
 * Get S3 config for social post uploads
 */
export function getSocialPostS3Config() {
  return {
    bucket: S3_BUCKET,
    region: S3_REGION,
    prefix: 'social-media/post-attachments',
  } as const;
}

/**
 * Construct the public S3 URL for a given key
 */
export function getS3PublicUrl(s3Key: string): string {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
}

// Export the raw values for direct access if needed
export { S3_BUCKET, S3_REGION };
