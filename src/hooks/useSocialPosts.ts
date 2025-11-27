// src/hooks/useSocialPosts.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../contexts/EntityContext';

// Import generated GraphQL operations
import { listSocialPosts } from '../graphql/queries';
import { updateSocialPost } from '../graphql/mutations';

// Import Amplify-generated types
import { 
  SocialPost,
  UpdateSocialPostInput,
  SocialPostStatus,
  ModelSocialPostFilterInput,
} from '../API';

// Re-export types for consumers
export type { SocialPost, UpdateSocialPostInput };
export { SocialPostStatus };

export interface UseSocialPostsOptions {
  entityId?: string;
  accountId?: string;
  limit?: number;
  autoFetch?: boolean;
  filterByEntity?: boolean;
}

// Helper to check if response has data
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

export const useSocialPosts = (options: UseSocialPostsOptions = {}) => {
  // Use useMemo for client - same pattern as useScraperManagement
  const client = useMemo(() => generateClient(), []);
  const { currentEntity } = useEntity();
  
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Track if initial fetch has been done
  const hasFetchedRef = useRef(false);
  const lastFetchKeyRef = useRef<string>('');

  // Only use entity filter if filterByEntity is true (default) or entityId explicitly passed
  const { filterByEntity = true } = options;
  const effectiveEntityId = options.entityId || (filterByEntity ? currentEntity?.id : undefined);
  const limit = options.limit || 50;

  // Fetch posts
  const fetchPosts = useCallback(async (loadMore = false, forceRefresh = false) => {
    // Create key for deduplication
    const currentFetchKey = `${options.accountId || ''}-${effectiveEntityId || ''}-${filterByEntity}`;
    
    // Skip if we've already fetched for this key and not forcing refresh
    if (!forceRefresh && !loadMore && hasFetchedRef.current && lastFetchKeyRef.current === currentFetchKey) {
      return;
    }

    if (!loadMore) {
      setLoading(true);
    }
    setError(null);

    try {
      const token = loadMore ? nextToken : null;
      
      // Build filter with proper Amplify types
      const filter: ModelSocialPostFilterInput = {
        status: { eq: SocialPostStatus.ACTIVE }
      };
      
      if (options.accountId) {
        filter.socialAccountId = { eq: options.accountId };
      } else if (effectiveEntityId) {
        filter.entityId = { eq: effectiveEntityId };
      }

      const response = await client.graphql({
        query: listSocialPosts,
        variables: { 
          limit,
          nextToken: token,
          filter,
        },
      });

      if (hasGraphQLData<{ listSocialPosts: { items: (SocialPost | null)[]; nextToken?: string | null } }>(response)) {
        const result = response.data.listSocialPosts;
        const items = (result?.items || [])
          .filter((item): item is SocialPost => item !== null);
        
        // Sort by postedAt descending (newest first)
        const sortedItems = [...items].sort((a, b) => 
          new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        );

        if (loadMore) {
          setPosts(prev => [...prev, ...sortedItems]);
        } else {
          setPosts(sortedItems);
        }

        setNextToken(result?.nextToken || null);
        setHasMore(!!result?.nextToken);
        hasFetchedRef.current = true;
        lastFetchKeyRef.current = currentFetchKey;
      }
    } catch (err) {
      console.error('Error fetching social posts:', err);
      setError('Failed to fetch social posts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [client, options.accountId, effectiveEntityId, limit, nextToken, filterByEntity]);

  // Update post
  const updatePostFn = useCallback(async (input: UpdateSocialPostInput): Promise<SocialPost | null> => {
    try {
      const response = await client.graphql({
        query: updateSocialPost,
        variables: { input },
      });

      if (hasGraphQLData<{ updateSocialPost: SocialPost }>(response) && response.data?.updateSocialPost) {
        const updatedPost = response.data.updateSocialPost;
        setPosts(prev => prev.map(post => 
          post.id === input.id 
            ? { ...post, ...updatedPost } as SocialPost
            : post
        ));
        return updatedPost;
      }
      return null;
    } catch (err) {
      console.error('Error updating social post:', err);
      throw new Error('Failed to update post. Please try again.');
    }
  }, [client]);

  // Hide/archive post
  const hidePost = useCallback(async (id: string, _version?: number): Promise<void> => {
    await updatePostFn({
      id,
      status: SocialPostStatus.HIDDEN,
    } as UpdateSocialPostInput);
  }, [updatePostFn]);

  // Mark as tournament related
  const markTournamentRelated = useCallback(async (
    id: string,
    isTournamentRelated: boolean,
    linkedGameId?: string,
    _version?: number
  ): Promise<void> => {
    await updatePostFn({
      id,
      isTournamentRelated,
      linkedGameId,
    } as UpdateSocialPostInput);
  }, [updatePostFn]);

  // Update tags
  const updateTags = useCallback(async (
    id: string,
    tags: string[],
    _version?: number
  ): Promise<void> => {
    await updatePostFn({
      id,
      tags,
    } as UpdateSocialPostInput);
  }, [updatePostFn]);

  // Load more posts
  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      fetchPosts(true);
    }
  }, [hasMore, loading, fetchPosts]);

  // Refresh posts (force refresh)
  const refresh = useCallback(() => {
    setNextToken(null);
    fetchPosts(false, true);
  }, [fetchPosts]);

  // Initial fetch - only when parameters change
  useEffect(() => {
    if (options.autoFetch !== false) {
      const currentFetchKey = `${options.accountId || ''}-${effectiveEntityId || ''}-${filterByEntity}`;
      
      // Only fetch if the key changed or we haven't fetched yet
      if (!hasFetchedRef.current || lastFetchKeyRef.current !== currentFetchKey) {
        fetchPosts();
      }
    }
  }, [options.accountId, effectiveEntityId, options.autoFetch, fetchPosts, filterByEntity]);

  // Calculate engagement metrics
  const totalEngagement = posts.reduce(
    (sum, post) => sum + (post.likeCount || 0) + (post.commentCount || 0) + (post.shareCount || 0),
    0
  );

  const averageEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

  const tournamentPosts = posts.filter(p => p.isTournamentRelated);
  const promotionalPosts = posts.filter(p => p.isPromotional);

  return {
    posts,
    loading,
    error,
    hasMore,
    fetchPosts: useCallback(() => fetchPosts(false, true), [fetchPosts]),
    updatePost: updatePostFn,
    hidePost,
    markTournamentRelated,
    updateTags,
    loadMore,
    refresh,
    totalEngagement,
    averageEngagement,
    tournamentPosts,
    promotionalPosts,
    postCount: posts.length,
  };
};

export default useSocialPosts;