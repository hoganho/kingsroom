// src/hooks/useS3Fetch.ts
//
// VERSION 2.0.0 - Enhanced URL-based lookup
// 
// CHANGES:
// - Replaced sourceSystem + tournamentId lookup with direct URL lookup
// - Uses scrapeURLByURL GSI for O(1) exact match
// - No more entityId filtering or limit issues
// - Simpler, more reliable, better performance

import { useState, useCallback } from 'react';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getClient } from '../utils/apiClient';
import { getS3Config } from '../config/s3Config';

// GraphQL query to fetch ScrapeURL by URL (direct 1:1 lookup)
const GET_SCRAPE_URL_BY_URL = /* GraphQL */ `
  query GetScrapeURLByURL($url: AWSURL!) {
    scrapeURLByURL(url: $url) {
      items {
        id
        tournamentId
        entityId
        latestS3Key
        s3StoragePrefix
        url
      }
    }
  }
`;

interface UseS3FetchReturn {
  /** Fetch and open an S3 file in a new browser window */
  openS3File: (sourceUrl: string) => Promise<void>;
  /** Get a pre-signed URL for an S3 key (without opening) */
  getPresignedUrl: (s3Key: string) => Promise<string>;
  /** Look up the S3 key for a game by its sourceUrl */
  lookupS3Key: (sourceUrl: string) => Promise<string | null>;
  /** Whether a fetch operation is currently in progress */
  isLoading: boolean;
  /** Any error from the last fetch attempt */
  error: string | null;
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Generate a pre-signed URL for an S3 object
 * @param s3Key - The S3 key (path within bucket)
 * @param expiresIn - URL expiration time in seconds (default: 1 hour)
 */
export async function getPresignedS3Url(s3Key: string, expiresIn: number = 3600): Promise<string> {
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error('Unable to get AWS credentials. Please sign in again.');
  }

  // Get S3 config from environment
  const s3Config = getS3Config();

  const s3Client = new S3Client({
    region: s3Config.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const command = new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: s3Key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Look up the S3 key for a game using its sourceUrl
 * Uses the scrapeURLByURL GSI for direct O(1) lookup
 * 
 * @param sourceUrl - The game's source URL (e.g., "https://kingslive.com.au/76-2/?id=475")
 * @returns The S3 key if found, null otherwise
 */
export async function lookupS3KeyForGame(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) {
    console.warn('[lookupS3KeyForGame] No sourceUrl provided');
    return null;
  }

  const client = getClient();
  
  console.log('[lookupS3KeyForGame] Looking up by URL:', sourceUrl);
  
  try {
    const response = await client.graphql({
      query: GET_SCRAPE_URL_BY_URL,
      variables: { url: sourceUrl }
    });

    if ('data' in response && response.data?.scrapeURLByURL?.items?.length > 0) {
      const scrapeUrl = response.data.scrapeURLByURL.items[0];
      
      console.log('[lookupS3KeyForGame] Found ScrapeURL:', {
        id: scrapeUrl.id,
        tournamentId: scrapeUrl.tournamentId,
        entityId: scrapeUrl.entityId,
        hasS3Key: !!scrapeUrl.latestS3Key
      });
      
      if (scrapeUrl.latestS3Key) {
        return scrapeUrl.latestS3Key;
      }
      
      console.warn('[lookupS3KeyForGame] ScrapeURL found but no latestS3Key');
    } else {
      console.warn('[lookupS3KeyForGame] No ScrapeURL found for URL:', sourceUrl);
    }
  } catch (err) {
    console.error('[lookupS3KeyForGame] GraphQL error:', err);
    throw err;
  }
  
  return null;
}

/**
 * Hook for fetching files from S3 using Cognito credentials
 * Uses S3 bucket from VITE_S3_BUCKET environment variable
 * 
 * @example
 * ```tsx
 * const { openS3File, isLoading, error } = useS3Fetch();
 * 
 * const handleViewS3 = async () => {
 *   if (game.sourceUrl) {
 *     try {
 *       await openS3File(game.sourceUrl);
 *     } catch (err) {
 *       console.error('Failed to open S3 file');
 *     }
 *   }
 * };
 * ```
 */
export function useS3Fetch(): UseS3FetchReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getPresignedUrl = useCallback(async (s3Key: string): Promise<string> => {
    setError(null);
    setIsLoading(true);

    try {
      const url = await getPresignedS3Url(s3Key);
      return url;
    } catch (err: any) {
      console.error('[useS3Fetch] Failed to get pre-signed URL:', err);
      const errorMsg = err.message || 'Failed to generate S3 URL.';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const lookupS3Key = useCallback(async (sourceUrl: string): Promise<string | null> => {
    setError(null);
    setIsLoading(true);

    try {
      const s3Key = await lookupS3KeyForGame(sourceUrl);
      return s3Key;
    } catch (err: any) {
      console.error('[useS3Fetch] Failed to lookup S3 key:', err);
      const errorMsg = err.message || 'Failed to lookup S3 file.';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openS3File = useCallback(async (sourceUrl: string): Promise<void> => {
    if (!sourceUrl) {
      const errorMsg = 'No source URL provided for S3 lookup';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setError(null);
    setIsLoading(true);

    try {
      // Look up the S3 key by source URL
      const s3Key = await lookupS3KeyForGame(sourceUrl);
      
      if (!s3Key) {
        throw new Error('No S3 file found for this game. The HTML may not have been cached yet.');
      }

      // Generate pre-signed URL and open
      const s3Config = getS3Config();
      console.log(`[useS3Fetch] Generating pre-signed URL for: ${s3Key} (bucket: ${s3Config.bucket})`);
      const signedUrl = await getPresignedS3Url(s3Key);
      
      console.log('[useS3Fetch] Opening S3 file in new window');
      window.open(signedUrl, '_blank');

    } catch (err: any) {
      console.error('[useS3Fetch] Failed to open S3 file:', err);
      
      let errorMsg = 'Failed to open S3 file. Please try again.';
      
      if (err.name === 'AccessDenied' || err.Code === 'AccessDenied') {
        errorMsg = 'Access denied. Please check your permissions.';
      } else if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
        errorMsg = 'S3 file not found. It may have been deleted.';
      } else if (err.name === 'NetworkError' || err.message?.includes('Network')) {
        errorMsg = 'Network error. Please check your connection and try again.';
      } else if (err.message) {
        errorMsg = err.message;
      }
      
      setError(errorMsg);
      throw new Error(errorMsg);

    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    openS3File,
    getPresignedUrl,
    lookupS3Key,
    isLoading,
    error,
    clearError,
  };
}

/**
 * Get the S3 config (useful for displaying bucket info, etc.)
 */
export function getS3FetchConfig() {
  return getS3Config();
}