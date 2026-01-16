// src/hooks/useSocialPosts.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../contexts/EntityContext';

// Import generated GraphQL operations
import { 
  socialPostsBySocialAccountIdAndPostedAt,
  socialPostsByEntityIdAndPostedAt,
  socialPostsByPostStatus 
} from '../graphql/queries';
import { updateSocialPost } from '../graphql/mutations';

// Import Amplify-generated types
import { 
  SocialPost,
  UpdateSocialPostInput,
  SocialPostStatus,
  ModelSortDirection
} from '../API';

// ========================================
// AEST FIX: Import the AEST utility
// ========================================
import { getDaysAgoAEST } from '../lib/utils';

export type { SocialPost, UpdateSocialPostInput };
export { SocialPostStatus };

export interface UseSocialPostsOptions {
  entityId?: string;
  accountId?: string;
  accountIds?: string[];
  limit?: number;
  autoFetch?: boolean;
  filterByEntity?: boolean;
  daysBack?: number;
}

function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

export const useSocialPosts = (options: UseSocialPostsOptions = {}) => {
  const client = useMemo(() => generateClient(), []);
  const { currentEntity } = useEntity();
  
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const hasFetchedRef = useRef(false);
  const lastFetchKeyRef = useRef<string>('');

  const { filterByEntity = true, daysBack } = options;
  const effectiveEntityId = options.entityId || (filterByEntity ? currentEntity?.id : undefined);
  
  // ========================================
  // AEST FIX: Calculate date in AEST context
  // ========================================
  // OLD (wrong - uses browser timezone):
  // const minDate = useMemo(() => {
  //   if (!daysBack) return undefined;
  //   const d = new Date();
  //   d.setDate(d.getDate() - daysBack);
  //   return d.toISOString();
  // }, [daysBack]);
  
  // NEW (correct - uses AEST):
  const minDate = useMemo(() => {
    if (!daysBack) return undefined;
    return getDaysAgoAEST(daysBack);
  }, [daysBack]);

  /**
   * Helper: Fetch a single account's posts until limit or date condition is met.
   * Updates the global 'posts' state incrementally.
   */
  const fetchSingleAccount = useCallback(async (accountId: string, dateCondition: any, limit: number) => {
    let items: SocialPost[] = [];
    let nextToken: string | null | undefined = null;
    let shouldFetch = true;
    let pageCount = 0;
    const MAX_PAGES = 5; // Safety cap to prevent infinite loops

    while (shouldFetch && pageCount < MAX_PAGES) {
      try {
        const response = (await client.graphql({
          query: socialPostsBySocialAccountIdAndPostedAt,
          variables: { 
            socialAccountId: accountId,
            postedAt: dateCondition,
            sortDirection: ModelSortDirection.DESC,
            filter: { status: { eq: SocialPostStatus.ACTIVE } },
            limit: limit,
            nextToken: nextToken
          },
        })) as any;

        // Handle partial success - GraphQL can return both data AND errors
        // This happens when nested relations have null values for non-nullable fields
        // (e.g., linkedGame.gameCost._version, linkedGame.gameFinancialSnapshot._lastChangedAt)
        if (response.errors && response.errors.length > 0) {
          console.warn(`[useSocialPosts] Partial response for account ${accountId}: ${response.errors.length} field errors (nested relations with missing data)`);
          // Continue processing - the main post data is usually still valid
        }

        const data = response.data?.socialPostsBySocialAccountIdAndPostedAt;
        const newItems = (data?.items || []).filter((i: any) => i !== null);
        items = [...items, ...newItems];
        nextToken = data?.nextToken;
        pageCount++;

        // === INCREMENTAL UPDATE ===
        // Update the UI immediately when we get data for this account
        if (newItems.length > 0) {
            setPosts(prev => {
                // Deduplicate based on ID
                const existingIds = new Set(prev.map(p => p.id));
                const uniqueNewItems = newItems.filter((p: SocialPost) => !existingIds.has(p.id));
                return [...prev, ...uniqueNewItems];
            });
        }

        // Stop if we run out of data
        if (!nextToken) {
            shouldFetch = false;
        }
        // Stop if we have enough data (if we are just viewing recent posts)
        // If we are viewing "All History" (minDate is undefined), we might want to keep going
        if (minDate && items.length >= limit) {
            shouldFetch = false;
        }

      } catch (e: any) {
        // True exceptions (network errors, etc.)
        console.error(`[useSocialPosts] Error fetching account ${accountId}:`, e?.message || e);
        shouldFetch = false;
      }
    }
    return items;
  }, [client, minDate]);


  const fetchPosts = useCallback(async (loadMore = false, forceRefresh = false, ignoreDateLimit = false) => {
    // Generate a key to prevent duplicate fetches of the same config
    const accountIdsKey = (options.accountIds || []).sort().join(',');
    const currentFetchKey = `${options.accountId || ''}-${accountIdsKey}-${effectiveEntityId || ''}-${filterByEntity}-${daysBack}-${ignoreDateLimit}`;
    
    if (!forceRefresh && !loadMore && hasFetchedRef.current && lastFetchKeyRef.current === currentFetchKey) {
      return;
    }

    if (!loadMore) {
      setLoading(true);
      // Only clear posts if we are doing a hard refresh or configuration change
      if (!loadMore) setPosts([]); 
    }

    setError(null);
    const dateCondition = (minDate && !ignoreDateLimit) ? { gt: minDate } : undefined;
    // We use a smaller per-request limit for parallel fetching to keep individual requests fast
    const currentLimit = 50; 

    try {
      // STRATEGY 1: Parallel Account Fetch (Fastest for UI)
      if (options.accountIds && options.accountIds.length > 0) {
        await Promise.all(
          options.accountIds.map(accountId => 
             fetchSingleAccount(accountId, dateCondition, currentLimit)
          )
        );
      } 
      // STRATEGY 2: Single Account
      else if (options.accountId) {
        await fetchSingleAccount(options.accountId, dateCondition, currentLimit);
      }
      // STRATEGY 3: Entity Fallback (Legacy / Slow)
      else if (effectiveEntityId) {
         const response = (await client.graphql({
            query: socialPostsByEntityIdAndPostedAt,
            variables: { 
              entityId: effectiveEntityId,
              postedAt: dateCondition,
              sortDirection: ModelSortDirection.DESC,
              filter: { status: { eq: SocialPostStatus.ACTIVE } },
              limit: currentLimit
            },
         })) as any;
         
         const items = response.data?.socialPostsByEntityIdAndPostedAt?.items || [];
         setPosts(items);
      }
      // STRATEGY 4: Global Fallback (Legacy / Slow)
      else {
         const response = (await client.graphql({
            query: socialPostsByPostStatus,
            variables: { 
              status: SocialPostStatus.ACTIVE,
              sortDirection: ModelSortDirection.DESC,
              limit: currentLimit,
              ... (dateCondition ? { postedAt: dateCondition } : {})
            },
         })) as any;
         
         const items = response.data?.socialPostsByPostStatus?.items || [];
         setPosts(items);
      }

      hasFetchedRef.current = true;
      lastFetchKeyRef.current = currentFetchKey;

    } catch (err) {
      console.error('Error fetching social posts:', err);
      setError('Failed to fetch social posts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [client, options.accountIds, options.accountId, effectiveEntityId, minDate, fetchSingleAccount, filterByEntity, daysBack]);

  const updatePostFn = useCallback(async (input: UpdateSocialPostInput): Promise<SocialPost | null> => {
    try {
      const response = await client.graphql({
        query: updateSocialPost,
        variables: { input },
      });

      if (hasGraphQLData<{ updateSocialPost: SocialPost }>(response) && response.data?.updateSocialPost) {
        const updatedPost = response.data.updateSocialPost;
        setPosts(prev => prev.map(post => 
          post.id === input.id ? { ...post, ...updatedPost } as SocialPost : post
        ));
        return updatedPost;
      }
      return null;
    } catch (err) {
      console.error('Error updating social post:', err);
      throw new Error('Failed to update post. Please try again.');
    }
  }, [client]);

  const hidePost = useCallback(async (id: string) => {
    await updatePostFn({ id, status: SocialPostStatus.HIDDEN } as UpdateSocialPostInput);
  }, [updatePostFn]);

  const markTournamentRelated = useCallback(async (id: string, isTournamentRelated: boolean, linkedGameId?: string) => {
    await updatePostFn({ id, isTournamentRelated, linkedGameId } as UpdateSocialPostInput);
  }, [updatePostFn]);

  const updateTags = useCallback(async (id: string, tags: string[]) => {
    await updatePostFn({ id, tags } as UpdateSocialPostInput);
  }, [updatePostFn]);

  const loadMore = useCallback(() => {
    // Parallel fetch doesn't support simple global "load more" yet, 
    // but we keep the function signature.
  }, []);

  const refresh = useCallback(() => {
    fetchPosts(false, true);
  }, [fetchPosts]);

  const fetchFullHistory = useCallback(() => {
    fetchPosts(false, true, true); 
  }, [fetchPosts]);

  useEffect(() => {
    // Trigger auto-fetch if we have IDs available
    const hasIds = options.accountIds && options.accountIds.length > 0;
    const hasId = !!options.accountId;
    const hasEntity = !!effectiveEntityId;

    if (options.autoFetch !== false && !hasFetchedRef.current && (hasIds || hasId || hasEntity)) {
      fetchPosts();
    }
  }, [options.autoFetch, options.accountIds, options.accountId, effectiveEntityId, fetchPosts]);

  const totalEngagement = useMemo(() => {
    return posts.reduce(
      (sum, post) => sum + (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0),
      0
    );
  }, [posts]);

  const averageEngagement = useMemo(() => {
    return posts.length > 0 ? totalEngagement / posts.length : 0;
  }, [posts, totalEngagement]);

  const tournamentPosts = useMemo(() => posts.filter(p => p.isTournamentRelated), [posts]);
  const promotionalPosts = useMemo(() => posts.filter(p => p.isPromotional), [posts]);

  return {
    posts,
    loading,
    error,
    hasMore: false,
    fetchPosts: useCallback(() => fetchPosts(false, true), [fetchPosts]),
    fetchFullHistory,
    updatePost: updatePostFn,
    hidePost,
    markTournamentRelated,
    updateTags,
    loadMore,
    refresh,
    postCount: posts.length,
    totalEngagement,
    averageEngagement,
    tournamentPosts,
    promotionalPosts
  };
};

export default useSocialPosts;