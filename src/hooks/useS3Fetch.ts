// src/hooks/useS3Fetch.ts

import { useState, useCallback } from 'react';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getClient } from '../utils/apiClient';

// S3 Configuration - shared with useS3Upload
const S3_CONFIG = {
  bucket: 'pokerpro-scraper-storage',
  region: 'ap-southeast-2',
} as const;

// Source system for ScrapeURL lookups
const SOURCE_SYSTEM = 'KINGSROOM_WEB';

// GraphQL query to fetch ScrapeURL by sourceSystem and tournamentId
const GET_SCRAPE_URL_FOR_S3 = /* GraphQL */ `
  query GetScrapeURLForS3($sourceSystem: String!, $tournamentId: ModelIntKeyConditionInput) {
    scrapeURLsBySourceSystem(sourceSystem: $sourceSystem, tournamentId: $tournamentId, limit: 1) {
      items {
        id
        tournamentId
        entityId
        latestS3Key
        s3StoragePrefix
      }
    }
  }
`;

interface UseS3FetchReturn {
  /** Fetch and open an S3 file in a new browser window */
  openS3File: (entityId: string, tournamentId: number) => Promise<void>;
  /** Get a pre-signed URL for an S3 key (without opening) */
  getPresignedUrl: (s3Key: string) => Promise<string>;
  /** Look up the S3 key for a game by entityId and tournamentId */
  lookupS3Key: (entityId: string, tournamentId: number) => Promise<string | null>;
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

  const s3Client = new S3Client({
    region: S3_CONFIG.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const command = new GetObjectCommand({
    Bucket: S3_CONFIG.bucket,
    Key: s3Key,
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

/**
 * Look up the S3 key for a game using the ScrapeURL table
 * @param entityId - The entity ID
 * @param tournamentId - The tournament ID
 * @returns The S3 key if found, null otherwise
 */
export async function lookupS3KeyForGame(entityId: string, tournamentId: number): Promise<string | null> {
  const client = getClient();
  
  const response = await client.graphql({
    query: GET_SCRAPE_URL_FOR_S3,
    variables: { 
      sourceSystem: SOURCE_SYSTEM,
      tournamentId: { eq: tournamentId }
    }
  });

  if ('data' in response && response.data?.scrapeURLsBySourceSystem?.items?.length > 0) {
    const scrapeUrl = response.data.scrapeURLsBySourceSystem.items[0];
    
    // Verify entityId matches (in case there are multiple entities with same tournamentId)
    if (scrapeUrl.entityId === entityId && scrapeUrl.latestS3Key) {
      return scrapeUrl.latestS3Key;
    }
  }
  
  return null;
}

/**
 * Hook for fetching files from S3 using Cognito credentials
 * 
 * @example
 * ```tsx
 * const { openS3File, isLoading, error } = useS3Fetch();
 * 
 * const handleViewS3 = async () => {
 *   try {
 *     await openS3File(game.entityId, game.tournamentId);
 *   } catch (err) {
 *     console.error('Failed to open S3 file');
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

  const lookupS3Key = useCallback(async (entityId: string, tournamentId: number): Promise<string | null> => {
    setError(null);
    setIsLoading(true);

    try {
      const s3Key = await lookupS3KeyForGame(entityId, tournamentId);
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

  const openS3File = useCallback(async (entityId: string, tournamentId: number): Promise<void> => {
    if (!entityId || !tournamentId) {
      const errorMsg = 'Missing entity ID or tournament ID for S3 lookup';
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    setError(null);
    setIsLoading(true);

    try {
      // Look up the S3 key
      const s3Key = await lookupS3KeyForGame(entityId, tournamentId);
      
      if (!s3Key) {
        throw new Error('No S3 file found for this game');
      }

      // Generate pre-signed URL and open
      console.log(`[useS3Fetch] Generating pre-signed URL for: ${s3Key}`);
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
  return S3_CONFIG;
}
