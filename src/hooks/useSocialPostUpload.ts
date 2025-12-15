// src/hooks/useSocialPostUpload.ts
// FINAL VERSION - All TypeScript errors fixed

import { useState, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { createSocialPost } from '../graphql/mutations';
import { socialPostsBySocialAccountIdAndPostedAt } from '../graphql/queries';

import type {
  RawFacebookPost,
  ReviewablePost,
  ParseMultipleResult,
  BatchUploadResult,
  SingleUploadResult,
  UploadOptions,
  PostFilterOptions,
  PostSortOptions,
} from '../types/socialPostUpload';

import {
  parseMultiplePosts,
} from '../utils/socialPostParser';

import {
  SocialPost,
  SocialPostStatus,
  SocialPostType,
  CreateSocialPostInput,
  ModelSortDirection,
} from '../API';

// Helper to check GraphQL response
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

export interface UseSocialPostUploadOptions {
  socialAccountId: string;
  entityId: string;
}

export interface UseSocialPostUploadReturn {
  // State
  rawPosts: RawFacebookPost[];
  parsedResult: ParseMultipleResult | null;
  reviewablePosts: ReviewablePost[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  uploadProgress: { current: number; total: number } | null;
  
  // Actions
  loadPostsFromFiles: (files: FileList | File[]) => Promise<void>;
  loadPostsFromJson: (posts: RawFacebookPost[]) => void;
  clearPosts: () => void;
  
  // Selection
  selectedPosts: Set<string>;
  togglePostSelection: (postId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectTournamentResults: () => void;
  
  // Filtering & Sorting
  filterOptions: PostFilterOptions;
  setFilterOptions: (options: Partial<PostFilterOptions>) => void;
  sortOptions: PostSortOptions;
  setSortOptions: (options: PostSortOptions) => void;
  filteredPosts: ReviewablePost[];
  
  // Upload
  uploadSelectedPosts: (options: Partial<UploadOptions>) => Promise<BatchUploadResult>;
  uploadSinglePost: (post: ReviewablePost, createGame?: boolean) => Promise<SingleUploadResult>;
  
  // Editing
  updatePostField: (postId: string, field: string, value: unknown) => void;
  
  // Stats
  stats: ParseMultipleResult['stats'] | null;
}

export const useSocialPostUpload = (
  options: UseSocialPostUploadOptions
): UseSocialPostUploadReturn => {
  const { socialAccountId, entityId } = options;
  
  const client = useMemo(() => generateClient(), []);
  
  // Core state
  const [rawPosts, setRawPosts] = useState<RawFacebookPost[]>([]);
  const [parsedResult, setParsedResult] = useState<ParseMultipleResult | null>(null);
  const [reviewablePosts, setReviewablePosts] = useState<ReviewablePost[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Filter & Sort state
  const [filterOptions, setFilterOptionsState] = useState<PostFilterOptions>({
    showOnlyTournamentResults: false,
    minConfidence: 0,
    hasVenueMatch: null,
    hasPlacements: null,
    searchText: '',
  });
  
  const [sortOptions, setSortOptions] = useState<PostSortOptions>({
    field: 'confidence',
    direction: 'desc',
  });
  
  // ============ LOAD FUNCTIONS ============
  
  /**
   * Load posts from uploaded JSON files
   */
  const loadPostsFromFiles = useCallback(async (files: FileList | File[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const posts: RawFacebookPost[] = [];
      const fileArray = Array.from(files);
      
      for (const file of fileArray) {
        if (file.name === 'post.json' || file.name.endsWith('.json')) {
          const text = await file.text();
          try {
            const parsed = JSON.parse(text);
            
            // Handle single post or array
            if (Array.isArray(parsed)) {
              posts.push(...parsed);
            } else if (parsed.post_id) {
              posts.push(parsed);
            }
          } catch (parseError) {
            console.warn(`Failed to parse ${file.name}:`, parseError);
          }
        }
      }
      
      if (posts.length === 0) {
        setError('No valid posts found in uploaded files');
        return;
      }
      
      // Parse all posts
      const result = parseMultiplePosts(posts, { includeRawPatterns: true });
      
      // Convert to reviewable posts
      const reviewable: ReviewablePost[] = result.allPosts.map((parsed, index) => ({
        ...parsed,
        isSelected: parsed.isTournamentResult,
        isExpanded: false,
        rawPost: posts[index],
      }));
      
      setRawPosts(posts);
      setParsedResult(result);
      setReviewablePosts(reviewable);
      
      // Auto-select tournament results
      const tournamentIds = new Set(
        reviewable.filter(p => p.isTournamentResult).map(p => p.postId)
      );
      setSelectedPosts(tournamentIds);
      
    } catch (err) {
      console.error('Error loading posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Load posts from already-parsed JSON array
   */
  const loadPostsFromJson = useCallback((posts: RawFacebookPost[]) => {
    const result = parseMultiplePosts(posts, { includeRawPatterns: true });
    
    const reviewable: ReviewablePost[] = result.allPosts.map((parsed, index) => ({
      ...parsed,
      isSelected: parsed.isTournamentResult,
      isExpanded: false,
      rawPost: posts[index],
    }));
    
    setRawPosts(posts);
    setParsedResult(result);
    setReviewablePosts(reviewable);
    
    const tournamentIds = new Set(
      reviewable.filter(p => p.isTournamentResult).map(p => p.postId)
    );
    setSelectedPosts(tournamentIds);
  }, []);
  
  /**
   * Clear all loaded posts
   */
  const clearPosts = useCallback(() => {
    setRawPosts([]);
    setParsedResult(null);
    setReviewablePosts([]);
    setSelectedPosts(new Set());
    setError(null);
  }, []);
  
  // ============ SELECTION FUNCTIONS ============
  
  const togglePostSelection = useCallback((postId: string) => {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedPosts(new Set(reviewablePosts.map(p => p.postId)));
  }, [reviewablePosts]);
  
  const deselectAll = useCallback(() => {
    setSelectedPosts(new Set());
  }, []);
  
  const selectTournamentResults = useCallback(() => {
    setSelectedPosts(new Set(
      reviewablePosts.filter(p => p.isTournamentResult).map(p => p.postId)
    ));
  }, [reviewablePosts]);
  
  // ============ FILTER & SORT ============
  
  const setFilterOptions = useCallback((options: Partial<PostFilterOptions>) => {
    setFilterOptionsState(prev => ({ ...prev, ...options }));
  }, []);
  
  const filteredPosts = useMemo(() => {
    let posts = [...reviewablePosts];
    
    // Apply filters
    if (filterOptions.showOnlyTournamentResults) {
      posts = posts.filter(p => p.isTournamentResult);
    }
    
    if (filterOptions.minConfidence > 0) {
      posts = posts.filter(p => p.confidence >= filterOptions.minConfidence);
    }
    
    if (filterOptions.hasVenueMatch === true) {
      posts = posts.filter(p => p.venueMatch !== null);
    } else if (filterOptions.hasVenueMatch === false) {
      posts = posts.filter(p => p.venueMatch === null);
    }
    
    if (filterOptions.hasPlacements === true) {
      posts = posts.filter(p => p.placements.length > 0);
    } else if (filterOptions.hasPlacements === false) {
      posts = posts.filter(p => p.placements.length === 0);
    }
    
    if (filterOptions.searchText) {
      const search = filterOptions.searchText.toLowerCase();
      posts = posts.filter(p => 
        p.content.toLowerCase().includes(search) ||
        p.author.name.toLowerCase().includes(search) ||
        p.tournamentName?.toLowerCase().includes(search)
      );
    }
    
    // Apply sort
    posts.sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortOptions.field) {
        case 'confidence':
          aVal = a.confidence;
          bVal = b.confidence;
          break;
        case 'postedAt':
          aVal = new Date(a.postedAt).getTime();
          bVal = new Date(b.postedAt).getTime();
          break;
        case 'engagement':
          aVal = a.likeCount + a.commentCount + a.shareCount;
          bVal = b.likeCount + b.commentCount + b.shareCount;
          break;
        case 'prizeAmount':
          aVal = a.firstPlacePrize || 0;
          bVal = b.firstPlacePrize || 0;
          break;
        default:
          aVal = a.confidence;
          bVal = b.confidence;
      }
      
      return sortOptions.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return posts;
  }, [reviewablePosts, filterOptions, sortOptions]);
  
  // ============ UPLOAD FUNCTIONS ============
  
  /**
   * Check if a post already exists in the database
   */
  const checkExistingPost = useCallback(async (postUrl: string): Promise<string | null> => {
    try {
      const response = await client.graphql({
        query: socialPostsBySocialAccountIdAndPostedAt,
        variables: {
          socialAccountId,
          sortDirection: ModelSortDirection.DESC,
          filter: { postUrl: { eq: postUrl } },
          limit: 1,
        },
      });
      
      if (hasGraphQLData<{ socialPostsBySocialAccountIdAndPostedAt: { items: SocialPost[] } }>(response)) {
        const items = response.data.socialPostsBySocialAccountIdAndPostedAt?.items || [];
        return items.length > 0 ? items[0].id : null;
      }
      return null;
    } catch {
      return null;
    }
  }, [client, socialAccountId]);
  
  /**
   * Upload a single post to the database
   */
  const uploadSinglePost = useCallback(async (
    post: ReviewablePost,
    _createGame = false // Prefixed with _ to indicate intentionally unused for now
  ): Promise<SingleUploadResult> => {
    try {
      // Check for duplicates
      const existingId = await checkExistingPost(post.url);
      if (existingId) {
        return {
          postId: post.postId,
          success: false,
          skipped: true,
          skipReason: 'Post already exists',
          socialPostId: existingId,
        };
      }
      
      // Build the input
      const now = new Date().toISOString();
      const input: CreateSocialPostInput = {
        // Required fields
        platformPostId: post.postId,
        postType: post.images.length > 0 ? SocialPostType.IMAGE : SocialPostType.TEXT,
        postedAt: post.postedAt,
        scrapedAt: now,
        status: SocialPostStatus.ACTIVE,
        socialAccountId,
        
        // Optional fields
        entityId,
        postUrl: post.url,
        content: post.content,
        rawContent: post.content,
        accountName: post.author?.name,
        
        // Engagement
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        shareCount: post.shareCount,
        
        // Media
        mediaUrls: post.images.length > 0 ? post.images : null,
        thumbnailUrl: post.images.length > 0 ? post.images[0] : null,
        
        // Classification
        isTournamentResult: post.isTournamentResult,
        isTournamentRelated: post.isTournamentResult,
        tags: post.tags.length > 0 ? post.tags : null,
      };
      
      const response = await client.graphql({
        query: createSocialPost,
        variables: { input },
      });
      
      if (hasGraphQLData<{ createSocialPost: SocialPost }>(response)) {
        const savedPost = response.data.createSocialPost;
        
        // TODO: If _createGame is true and it's a tournament result,
        // call the gameDataEnricher to create a Game record
        
        return {
          postId: post.postId,
          success: true,
          socialPostId: savedPost.id,
        };
      }
      
      return {
        postId: post.postId,
        success: false,
        error: 'Unknown error creating post',
      };
      
    } catch (err) {
      console.error('Error uploading post:', err);
      return {
        postId: post.postId,
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  }, [client, socialAccountId, entityId, checkExistingPost]);
  
  /**
   * Upload multiple selected posts
   */
  const uploadSelectedPosts = useCallback(async (
    uploadOptions: Partial<UploadOptions> = {}
  ): Promise<BatchUploadResult> => {
    const {
      onlyTournamentResults = true,
      minConfidence = 0,
      createGameRecords: _createGameRecords = false, // TODO: implement game creation
      skipDuplicates: _skipDuplicates = true, // Duplicates are already handled in uploadSinglePost
      dryRun = false,
    } = uploadOptions;
    
    // Get posts to upload
    let postsToUpload = reviewablePosts.filter(p => selectedPosts.has(p.postId));
    
    if (onlyTournamentResults) {
      postsToUpload = postsToUpload.filter(p => p.isTournamentResult);
    }
    
    if (minConfidence > 0) {
      postsToUpload = postsToUpload.filter(p => p.confidence >= minConfidence);
    }
    
    if (postsToUpload.length === 0) {
      return {
        totalProcessed: 0,
        successCount: 0,
        errorCount: 0,
        skippedCount: 0,
        results: [],
        errors: [],
      };
    }
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: postsToUpload.length });
    
    const results: SingleUploadResult[] = [];
    const errors: Array<{ postId: string; error: string }> = [];
    
    for (let i = 0; i < postsToUpload.length; i++) {
      const post = postsToUpload[i];
      setUploadProgress({ current: i + 1, total: postsToUpload.length });
      
      if (dryRun) {
        results.push({
          postId: post.postId,
          success: true,
          skipped: false,
        });
        continue;
      }
      
      const result = await uploadSinglePost(post, _createGameRecords);
      results.push(result);
      
      if (!result.success && !result.skipped) {
        errors.push({ postId: post.postId, error: result.error || 'Unknown error' });
      }
      
      // Update the reviewable post status
      setReviewablePosts(prev => prev.map(p => 
        p.postId === post.postId
          ? {
              ...p,
              _uploadStatus: result.success ? 'success' : result.skipped ? 'skipped' : 'error',
              _uploadError: result.error,
              _savedPostId: result.socialPostId,
              _savedGameId: result.gameId,
            }
          : p
      ));
      
      // Small delay between uploads to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
    
    setIsUploading(false);
    setUploadProgress(null);
    
    return {
      totalProcessed: postsToUpload.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success && !r.skipped).length,
      skippedCount: results.filter(r => r.skipped).length,
      results,
      errors,
    };
  }, [reviewablePosts, selectedPosts, uploadSinglePost]);
  
  // ============ EDITING ============
  
  const updatePostField = useCallback((postId: string, field: string, value: unknown) => {
    setReviewablePosts(prev => prev.map(p =>
      p.postId === postId ? { ...p, [field]: value } : p
    ));
  }, []);
  
  // ============ RETURN ============
  
  return {
    // State
    rawPosts,
    parsedResult,
    reviewablePosts,
    isLoading,
    isUploading,
    error,
    uploadProgress,
    
    // Actions
    loadPostsFromFiles,
    loadPostsFromJson,
    clearPosts,
    
    // Selection
    selectedPosts,
    togglePostSelection,
    selectAll,
    deselectAll,
    selectTournamentResults,
    
    // Filter & Sort
    filterOptions,
    setFilterOptions,
    sortOptions,
    setSortOptions,
    filteredPosts,
    
    // Upload
    uploadSelectedPosts,
    uploadSinglePost,
    
    // Editing
    updatePostField,
    
    // Stats
    stats: parsedResult?.stats || null,
  };
};

export default useSocialPostUpload;