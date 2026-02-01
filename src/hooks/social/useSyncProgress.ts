// src/hooks/social/useSyncProgress.ts
// ===================================================================
// SYNC PROGRESS HOOK
// ===================================================================
// Subscribes to real-time sync progress events and provides
// state management for the enhanced sync modal.
//
// Usage:
//   const { 
//     progressEvent, 
//     isSubscribed, 
//     startSync, 
//     subscribe, 
//     unsubscribe 
//   } = useSyncProgress(accountId);
// ===================================================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { SyncProgressEvent } from '../../components/social/SyncProgressModal';

// ===================================================================
// GRAPHQL OPERATIONS
// ===================================================================

// Enhanced subscription for sync progress (uses existing onSyncProgress with new fields)
// NOTE: This uses the existing subscription name from 99-mutations.graphql
// but requests the new enhanced fields from SocialSyncEvent
const onSyncProgressEnhancedSubscription = /* GraphQL */ `
  subscription OnSyncProgress($socialAccountId: ID!) {
    onSyncProgress(socialAccountId: $socialAccountId) {
      socialAccountId
      status
      message
      postsFound
      newPostsAdded
      duplicatesSkipped
      rateLimited
      pagesCompleted
      totalPages
      currentPagePosts
      currentPost {
        platformPostId
        content
        contentPreview
        postType
        postedAt
        mediaUrls
        thumbnailUrl
        likeCount
        commentCount
        shareCount
        isNew
        isDuplicate
      }
      recentPosts {
        platformPostId
        content
        contentPreview
        postType
        postedAt
        mediaUrls
        thumbnailUrl
        likeCount
        commentCount
        shareCount
        isNew
        isDuplicate
      }
      estimatedTimeRemaining
      averagePostsPerPage
      completedAt
      attemptId
    }
  }
`;

// Fallback to basic subscription if enhanced fields not yet deployed
const onSyncProgressBasicSubscription = /* GraphQL */ `
  subscription OnSyncProgressBasic($socialAccountId: ID!) {
    onSyncProgress(socialAccountId: $socialAccountId) {
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

// Trigger full sync mutation
const triggerFullSyncMutation = /* GraphQL */ `
  mutation TriggerFullSync($socialAccountId: ID!) {
    triggerFullSync(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
      rateLimited
      timeout
      oldestPostDate
    }
  }
`;

// Trigger incremental scrape mutation
const triggerSocialScrapeMutation = /* GraphQL */ `
  mutation TriggerSocialScrape($socialAccountId: ID!) {
    triggerSocialScrape(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
      rateLimited
      timeout
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

interface SyncResult {
  success: boolean;
  message?: string;
  postsFound?: number;
  newPostsAdded?: number;
  rateLimited?: boolean;
  timeout?: boolean;
  oldestPostDate?: string;
}

interface UseSyncProgressReturn {
  // State
  progressEvent: SyncProgressEvent | null;
  isSubscribed: boolean;
  isSyncing: boolean;
  error: string | null;
  syncResult: SyncResult | null;
  
  // Actions
  subscribe: (accountId: string) => void;
  unsubscribe: () => void;
  startFullSync: (accountId: string) => Promise<SyncResult>;
  startIncrementalSync: (accountId: string) => Promise<SyncResult>;
  clearProgress: () => void;
}

// ===================================================================
// HOOK IMPLEMENTATION
// ===================================================================

export function useSyncProgress(): UseSyncProgressReturn {
  const client = useMemo(() => generateClient(), []);
  
  // State
  const [progressEvent, setProgressEvent] = useState<SyncProgressEvent | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  
  // Subscription ref for cleanup
  const subscriptionRef = useRef<any>(null);
  const currentAccountIdRef = useRef<string | null>(null);

  // =========================================================================
  // SUBSCRIPTION MANAGEMENT
  // =========================================================================

  /**
   * Subscribe to sync progress for an account
   */
  const subscribe = useCallback((accountId: string) => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    currentAccountIdRef.current = accountId;
    setError(null);

    try {
      // Try enhanced subscription first (with post-level details)
      const subscriptionResult = client.graphql({
        query: onSyncProgressEnhancedSubscription,
        variables: { socialAccountId: accountId },
      });

      if ('subscribe' in subscriptionResult) {
        subscriptionRef.current = subscriptionResult.subscribe({
          next: ({ data }: any) => {
            const event = data?.onSyncProgress;
            if (event) {
              console.log('[useSyncProgress] Received event:', event.status);
              setProgressEvent(event);

              // Handle terminal states
              if (['COMPLETED', 'FAILED', 'RATE_LIMITED'].includes(event.status)) {
                setIsSyncing(false);
              }
            }
          },
          error: (err: any) => {
            console.error('[useSyncProgress] Subscription error:', err);
            
            // Try fallback to basic subscription
            tryFallbackSubscription(accountId);
          },
        });

        setIsSubscribed(true);
        console.log('[useSyncProgress] Subscribed to enhanced progress for:', accountId);
      }
    } catch (err) {
      console.error('[useSyncProgress] Failed to subscribe:', err);
      tryFallbackSubscription(accountId);
    }
  }, [client]);

  /**
   * Fallback to basic subscription if enhanced fields not yet deployed
   */
  const tryFallbackSubscription = useCallback((accountId: string) => {
    try {
      const subscriptionResult = client.graphql({
        query: onSyncProgressBasicSubscription,
        variables: { socialAccountId: accountId },
      });

      if ('subscribe' in subscriptionResult) {
        subscriptionRef.current = subscriptionResult.subscribe({
          next: ({ data }: any) => {
            const event = data?.onSyncProgress;
            if (event) {
              // Convert basic event to enhanced format
              setProgressEvent({
                ...event,
                duplicatesSkipped: 0,
                totalPages: null,
                currentPagePosts: 0,
                currentPost: null,
                recentPosts: [],
                estimatedTimeRemaining: null,
                averagePostsPerPage: null,
              });

              if (['COMPLETED', 'FAILED', 'RATE_LIMITED'].includes(event.status)) {
                setIsSyncing(false);
              }
            }
          },
          error: (err: any) => {
            console.error('[useSyncProgress] Fallback subscription error:', err);
            setError('Failed to connect to sync updates');
            setIsSubscribed(false);
          },
        });

        setIsSubscribed(true);
        console.log('[useSyncProgress] Using fallback subscription for:', accountId);
      }
    } catch (err) {
      console.error('[useSyncProgress] Fallback subscription failed:', err);
      setError('Failed to connect to sync updates');
    }
  }, [client]);

  /**
   * Unsubscribe from sync progress
   */
  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    currentAccountIdRef.current = null;
    setIsSubscribed(false);
    console.log('[useSyncProgress] Unsubscribed');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, []);

  // =========================================================================
  // SYNC TRIGGERS
  // =========================================================================

  /**
   * Start a full sync (all historical posts)
   */
  const startFullSync = useCallback(async (accountId: string): Promise<SyncResult> => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);
    setProgressEvent(null);

    // Subscribe before triggering
    subscribe(accountId);

    try {
      const response = await client.graphql({
        query: triggerFullSyncMutation,
        variables: { socialAccountId: accountId },
      });

      const result = (response as any)?.data?.triggerFullSync;
      
      if (result) {
        setSyncResult(result);
        
        // If sync failed immediately, stop syncing state
        if (!result.success && !result.rateLimited) {
          setIsSyncing(false);
        }
        
        return result;
      }

      throw new Error('Invalid response from triggerFullSync');
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.message || err.message || 'Full sync failed';
      setError(errorMessage);
      setIsSyncing(false);
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }, [client, subscribe]);

  /**
   * Start an incremental sync (recent posts only)
   */
  const startIncrementalSync = useCallback(async (accountId: string): Promise<SyncResult> => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);
    setProgressEvent(null);

    // Subscribe before triggering
    subscribe(accountId);

    try {
      const response = await client.graphql({
        query: triggerSocialScrapeMutation,
        variables: { socialAccountId: accountId },
      });

      const result = (response as any)?.data?.triggerSocialScrape;
      
      if (result) {
        setSyncResult(result);
        
        // Incremental syncs are usually quick, might complete before subscription kicks in
        if (result.success || (!result.success && !result.rateLimited)) {
          setIsSyncing(false);
        }
        
        return result;
      }

      throw new Error('Invalid response from triggerSocialScrape');
    } catch (err: any) {
      const errorMessage = err?.errors?.[0]?.message || err.message || 'Sync failed';
      setError(errorMessage);
      setIsSyncing(false);
      
      return {
        success: false,
        message: errorMessage,
      };
    }
  }, [client, subscribe]);

  /**
   * Clear progress state
   */
  const clearProgress = useCallback(() => {
    setProgressEvent(null);
    setSyncResult(null);
    setError(null);
    setIsSyncing(false);
  }, []);

  // =========================================================================
  // RETURN
  // =========================================================================

  return {
    // State
    progressEvent,
    isSubscribed,
    isSyncing,
    error,
    syncResult,
    
    // Actions
    subscribe,
    unsubscribe,
    startFullSync,
    startIncrementalSync,
    clearProgress,
  };
}

export default useSyncProgress;
