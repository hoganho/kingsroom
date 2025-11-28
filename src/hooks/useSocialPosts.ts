// src/hooks/useSocialPosts.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../contexts/EntityContext';

// Import generated GraphQL operations
import { 
  listSocialPosts, 
  socialPostsBySocialAccountIdAndPostedAt,
  socialPostsByEntityIdAndPostedAt,
} from '../graphql/queries';
import { updateSocialPost } from '../graphql/mutations';

// Import Amplify-generated types
import { 
  SocialPost,
  UpdateSocialPostInput,
  SocialPostStatus,
  ModelSocialPostFilterInput,
  ModelSortDirection
} from '../API';

export type { SocialPost, UpdateSocialPostInput };
export { SocialPostStatus };

export interface UseSocialPostsOptions {
  entityId?: string;
  accountId?: string;
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
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const hasFetchedRef = useRef(false);
  const lastFetchKeyRef = useRef<string>('');

  const { filterByEntity = true, daysBack } = options;
  const effectiveEntityId = options.entityId || (filterByEntity ? currentEntity?.id : undefined);
  const limit = options.limit || 50;

  // Calculate the date string for filtering
  const minDate = useMemo(() => {
    if (!daysBack) return undefined;
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString();
  }, [daysBack]);

  const fetchPosts = useCallback(async (loadMore = false, forceRefresh = false, ignoreDateLimit = false) => {
    const currentFetchKey = `${options.accountId || ''}-${effectiveEntityId || ''}-${filterByEntity}-${daysBack}-${ignoreDateLimit}`;
    
    if (!forceRefresh && !loadMore && hasFetchedRef.current && lastFetchKeyRef.current === currentFetchKey) {
      return;
    }

    if (!loadMore) {
      setLoading(true);
    }
    setError(null);

    try {
      const token = loadMore ? nextToken : null;
      const activeFilter = { status: { eq: SocialPostStatus.ACTIVE } };
      
      const dateCondition = (minDate && !ignoreDateLimit) ? { gt: minDate } : undefined;

      let response: unknown;
      let items: SocialPost[] = [];
      let newNextToken: string | undefined | null = null;

      if (options.accountId) {
        response = await client.graphql({
          query: socialPostsBySocialAccountIdAndPostedAt,
          variables: { 
            socialAccountId: options.accountId,
            postedAt: dateCondition,
            sortDirection: ModelSortDirection.DESC,
            filter: activeFilter,
            limit,
            nextToken: token
          },
        });
        
        if (hasGraphQLData<{ socialPostsBySocialAccountIdAndPostedAt: { items: SocialPost[]; nextToken?: string | null } }>(response)) {
            items = response.data.socialPostsBySocialAccountIdAndPostedAt?.items || [];
            newNextToken = response.data.socialPostsBySocialAccountIdAndPostedAt?.nextToken;
        }
      } 
      else if (effectiveEntityId) {
        response = await client.graphql({
          query: socialPostsByEntityIdAndPostedAt,
          variables: { 
            entityId: effectiveEntityId,
            postedAt: dateCondition,
            sortDirection: ModelSortDirection.DESC,
            filter: activeFilter,
            limit,
            nextToken: token
          },
        });

        if (hasGraphQLData<{ socialPostsByEntityIdAndPostedAt: { items: SocialPost[]; nextToken?: string | null } }>(response)) {
            items = response.data.socialPostsByEntityIdAndPostedAt?.items || [];
            newNextToken = response.data.socialPostsByEntityIdAndPostedAt?.nextToken;
        }
      } 
      else {
        const filter: ModelSocialPostFilterInput = {
          status: { eq: SocialPostStatus.ACTIVE },
          ...(dateCondition ? { postedAt: { gt: minDate } } : {}) 
        };

        response = await client.graphql({
          query: listSocialPosts,
          variables: { 
            limit,
            nextToken: token,
            filter,
          },
        });

        if (hasGraphQLData<{ listSocialPosts: { items: SocialPost[]; nextToken?: string | null } }>(response)) {
            items = response.data.listSocialPosts?.items || [];
            newNextToken = response.data.listSocialPosts?.nextToken;
            items.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
        }
      }

      const validItems = items.filter((item): item is SocialPost => item !== null);
      
      if (loadMore) {
        setPosts(prev => [...prev, ...validItems]);
      } else {
        setPosts(validItems);
      }

      setNextToken(newNextToken || null);
      setHasMore(!!newNextToken);
      hasFetchedRef.current = true;
      lastFetchKeyRef.current = currentFetchKey;

    } catch (err) {
      console.error('Error fetching social posts:', err);
      setError('Failed to fetch social posts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [client, options.accountId, effectiveEntityId, limit, nextToken, filterByEntity, minDate]);

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
    if (hasMore && !loading) {
      fetchPosts(true);
    }
  }, [hasMore, loading, fetchPosts]);

  const refresh = useCallback(() => {
    setNextToken(null);
    fetchPosts(false, true);
  }, [fetchPosts]);

  const fetchFullHistory = useCallback(() => {
    setNextToken(null); 
    fetchPosts(false, true, true); 
  }, [fetchPosts]);

  useEffect(() => {
    if (options.autoFetch !== false) {
      const currentFetchKey = `${options.accountId || ''}-${effectiveEntityId || ''}-${filterByEntity}-${daysBack}`;
      if (!hasFetchedRef.current || lastFetchKeyRef.current !== currentFetchKey) {
        fetchPosts();
      }
    }
  }, [options.accountId, effectiveEntityId, options.autoFetch, fetchPosts, filterByEntity, daysBack]);

  // --- FIX: Restore Engagement Calculations ---
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
    hasMore,
    fetchPosts: useCallback(() => fetchPosts(false, true), [fetchPosts]),
    fetchFullHistory,
    updatePost: updatePostFn,
    hidePost,
    markTournamentRelated,
    updateTags,
    loadMore,
    refresh,
    postCount: posts.length,
    // Export metrics
    totalEngagement,
    averageEngagement,
    tournamentPosts,
    promotionalPosts
  };
};

export default useSocialPosts;