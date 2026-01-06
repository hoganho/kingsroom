// src/hooks/useS3Upload.ts

import { useState, useCallback } from 'react';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getS3UploadConfig, getS3PublicUrl } from '../config/s3Config';

// Get the upload paths from config
const getUploadPaths = () => getS3UploadConfig().paths;

type UploadPath = keyof ReturnType<typeof getUploadPaths>;

interface UploadOptions {
  /** The path category for the upload */
  path: UploadPath;
  /** Optional custom filename (without extension). If not provided, generates timestamp-based name */
  fileName?: string;
  /** Callback when upload starts */
  onStart?: () => void;
  /** Callback with progress (0-100) - note: not fully supported with PutObject */
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  /** The full S3 URL of the uploaded file */
  url: string;
  /** The S3 key (path within bucket) */
  key: string;
}

interface UseS3UploadReturn {
  /** Upload a file to S3 */
  upload: (file: File, options: UploadOptions) => Promise<UploadResult>;
  /** Whether an upload is currently in progress */
  isUploading: boolean;
  /** Any error from the last upload attempt */
  error: string | null;
  /** Clear the current error */
  clearError: () => void;
}

// Allowed image types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Max file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Hook for uploading files to S3 using Cognito credentials
 * Uses S3 bucket from VITE_S3_BUCKET environment variable
 * 
 * @example
 * ```tsx
 * const { upload, isUploading, error } = useS3Upload();
 * 
 * const handleFileSelect = async (file: File) => {
 *   try {
 *     const result = await upload(file, { path: 'venueLogo' });
 *     console.log('Uploaded to:', result.url);
 *   } catch (err) {
 *     console.error('Upload failed');
 *   }
 * };
 * ```
 */
export function useS3Upload(): UseS3UploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const upload = useCallback(async (file: File, options: UploadOptions): Promise<UploadResult> => {
    const { path, fileName, onStart } = options;

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      const errorMsg = 'Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const errorMsg = 'File size must be less than 5MB.';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setError(null);
    setIsUploading(true);
    onStart?.();

    try {
      // Get AWS credentials from Cognito
      const session = await fetchAuthSession();
      const credentials = session.credentials;

      if (!credentials) {
        throw new Error('Unable to get AWS credentials. Please sign in again.');
      }

      // Get S3 config from environment
      const s3Config = getS3UploadConfig();
      console.log(`[useS3Upload] Using bucket: ${s3Config.bucket}`);

      // Create S3 client
      const s3Client = new S3Client({
        region: s3Config.region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      // Generate filename
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const finalFileName = fileName 
        ? `${fileName}.${fileExtension}`
        : `${timestamp}-${randomString}.${fileExtension}`;
      
      const s3Key = `${s3Config.paths[path]}/${finalFileName}`;

      // Convert file to ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: s3Key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: file.type,
        // Cache for 1 year (logos don't change often)
        CacheControl: 'max-age=31536000',
      });

      await s3Client.send(command);

      // Construct the public URL using shared utility
      const url = getS3PublicUrl(s3Key);

      console.log('[useS3Upload] Successfully uploaded:', { key: s3Key, url });

      return { url, key: s3Key };

    } catch (err: any) {
      console.error('[useS3Upload] Upload failed:', err);
      
      // Provide user-friendly error messages
      let errorMsg = 'Failed to upload file. Please try again.';
      
      if (err.name === 'AccessDenied' || err.Code === 'AccessDenied') {
        errorMsg = 'Access denied. Please check your permissions.';
      } else if (err.name === 'NetworkError' || err.message?.includes('Network')) {
        errorMsg = 'Network error. Please check your connection and try again.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setError(errorMsg);
      throw new Error(errorMsg);

    } finally {
      setIsUploading(false);
    }
  }, []);

  return {
    upload,
    isUploading,
    error,
    clearError,
  };
}

/**
 * Validate an image file before upload
 * Returns an error message or null if valid
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be less than 5MB.';
  }
  return null;
}

/**
 * Get the S3 config (useful for displaying bucket info, etc.)
 */
export function getS3Config() {
  return getS3UploadConfig();
}