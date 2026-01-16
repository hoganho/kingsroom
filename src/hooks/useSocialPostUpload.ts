// src/hooks/useSocialPostUpload.ts
// UPDATED: Minimal save + Lambda processor invocation
// FIXED: Now downloads external images to S3 (aligns with socialFetcher Lambda behavior)
// Client-side parsing still used for UI preview, but classification
// is done by socialPostProcessor Lambda for consistency

import { useState, useCallback, useMemo, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fetchAuthSession } from 'aws-amplify/auth';
import { createSocialPost } from '../graphql/mutations';
import { getSocialAccount } from '../graphql/queries';
import { getYearMonthAEST } from '../utils/dateUtils';
import { getSocialPostS3Config, getS3PublicUrl } from '../config/s3Config';

import type {
  RawFacebookPost,
  ReviewablePost,
  ParseMultipleResult,
  BatchUploadResult,
  SingleUploadResult,
  UploadOptions,
  PostFilterOptions,
  PostSortOptions,
  PostType,
} from '../types/socialPostUpload';

import {
  parseMultiplePosts,
} from '../utils/socialPostParser';

import {
  SocialPost,
  SocialAccount,
  SocialPostStatus,
  SocialPostType,
  SocialPostProcessingStatus,
  CreateSocialPostInput,
} from '../API';

// Helper to check GraphQL response
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

/**
 * Sanitize string content for GraphQL/AppSync
 * Removes null bytes, invalid Unicode, and problematic control characters
 */
function sanitizeForGraphQL(str: string | null | undefined): string {
  if (!str) return '';
  
  return str
    // Remove null bytes
    .replace(/\u0000/g, '')
    // Remove other problematic control characters (except newline, tab, carriage return)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Remove Unicode replacement character
    .replace(/\uFFFD/g, '')
    // Remove private use area characters that might cause issues
    .replace(/[\uE000-\uF8FF]/g, '')
    // Normalize Unicode (handles invalid sequences)
    .normalize('NFC')
    // Trim excessive whitespace but preserve intentional newlines
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Sanitize an object for AWSJSON serialization
 * Recursively sanitizes all string values
 */
function sanitizeObjectForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeForGraphQL(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObjectForJson);
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectForJson(value);
    }
    return sanitized;
  }
  return obj;
}

/**
 * Extract hashtags from content
 * This is the ONLY client-side tag extraction - processor adds classification tags
 */
function extractHashtags(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return matches.map(tag => tag.substring(1).toLowerCase());
}

export interface UseSocialPostUploadOptions {
  socialAccountId: string;
  // Optional - will be inherited from SocialAccount if not provided
  entityId?: string | null;
  venueId?: string | null;
}

// Extended ReviewablePost with attachment files
export interface ReviewablePostWithAttachments extends ReviewablePost {
  attachmentFiles?: File[];
  attachmentS3Urls?: string[];
  /** External URLs from attachmentsDetails.href that need to be downloaded */
  externalImageUrls?: string[];
}

export interface UseSocialPostUploadReturn {
  // State
  rawPosts: RawFacebookPost[];
  parsedResult: ParseMultipleResult | null;
  reviewablePosts: ReviewablePostWithAttachments[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  uploadProgress: { current: number; total: number; stage?: string } | null;
  
  // Account context (inherited from selected account)
  accountContext: {
    accountName: string | null;
    entityId: string | null;
    venueId: string | null;
    businessLocation: string | null;
    platform: string | null;
    profileImageUrl: string | null;
  } | null;
  
  // Actions
  loadPostsFromFiles: (files: FileList | File[]) => Promise<void>;
  loadPostsFromJson: (posts: RawFacebookPost[]) => void;
  clearPosts: () => void;
  
  // Selection
  selectedPosts: Set<string>;
  togglePostSelection: (postId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByType: (types: PostType[]) => void;
  selectTournamentResults: () => void;
  
  // Filtering & Sorting
  filterOptions: PostFilterOptions;
  setFilterOptions: (options: Partial<PostFilterOptions>) => void;
  sortOptions: PostSortOptions;
  setSortOptions: (options: PostSortOptions) => void;
  filteredPosts: ReviewablePostWithAttachments[];
  
  // Upload
  uploadSelectedPosts: (options?: Partial<UploadOptions>, onShouldCancel?: () => boolean) => Promise<BatchUploadResult>;
  uploadSinglePost: (post: ReviewablePostWithAttachments, createGame?: boolean) => Promise<SingleUploadResult>;
  
  // Editing
  updatePostField: (postId: string, field: string, value: unknown) => void;
  
  // Stats
  stats: ParseMultipleResult['stats'] | null;
}

/**
 * Upload a File object to S3 and return the URL
 */
async function uploadFileToS3(
  file: File,
  postId: string,
  accountId: string
): Promise<string> {
  // Get AWS credentials from Cognito
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error('Unable to get AWS credentials. Please sign in again.');
  }

  // Get S3 config from environment
  const s3Config = getSocialPostS3Config();

  // Create S3 client
  const s3Client = new S3Client({
    region: s3Config.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Generate a unique S3 key
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  const s3Key = `${s3Config.prefix}/${accountId}/${postId}/${timestamp}-${randomString}-${sanitizedFilename}`;

  // Convert file to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Determine content type
  let contentType = file.type;
  if (!contentType) {
    const ext = fileExtension.toLowerCase();
    if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
    else if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';
    else contentType = 'application/octet-stream';
  }

  // Upload to S3
  const command = new PutObjectCommand({
    Bucket: s3Config.bucket,
    Key: s3Key,
    Body: new Uint8Array(arrayBuffer),
    ContentType: contentType,
    CacheControl: 'max-age=31536000', // Cache for 1 year
    Metadata: {
      'post-id': postId,
      'account-id': accountId,
      'original-filename': file.name,
      'uploaded-at': new Date().toISOString(),
    },
  });

  await s3Client.send(command);

  // Return the public URL
  const url = getS3PublicUrl(s3Key);
  console.log('[useSocialPostUpload] Uploaded attachment to S3:', { filename: file.name, url });

  return url;
}

/**
 * Download an external image URL and upload to S3
 * This aligns with socialFetcher Lambda behavior for consistent storage
 */
async function downloadAndUploadExternalImage(
  imageUrl: string,
  postId: string,
  accountId: string,
  index: number
): Promise<string> {
  console.log(`[useSocialPostUpload] Downloading external image ${index + 1}:`, imageUrl.substring(0, 100));
  
  try {
    // Get AWS credentials from Cognito
    const session = await fetchAuthSession();
    const credentials = session.credentials;

    if (!credentials) {
      throw new Error('Unable to get AWS credentials. Please sign in again.');
    }

    // Get S3 config from environment
    const s3Config = getSocialPostS3Config();

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    // Determine content type and filename
    let contentType = blob.type || 'image/jpeg';
    let fileExtension = 'jpg';
    
    if (contentType.includes('png')) fileExtension = 'png';
    else if (contentType.includes('gif')) fileExtension = 'gif';
    else if (contentType.includes('webp')) fileExtension = 'webp';
    else if (imageUrl.includes('.png')) { fileExtension = 'png'; contentType = 'image/png'; }
    else if (imageUrl.includes('.gif')) { fileExtension = 'gif'; contentType = 'image/gif'; }
    else if (imageUrl.includes('.webp')) { fileExtension = 'webp'; contentType = 'image/webp'; }
    
    // Extract filename from URL or generate one
    let filename = 'image';
    try {
      const urlPath = new URL(imageUrl).pathname;
      const originalName = urlPath.split('/').pop()?.split('?')[0];
      if (originalName && originalName.length > 0) {
        filename = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80);
      }
    } catch {
      // Ignore URL parsing errors
    }
    
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 8);
    const s3Key = `${s3Config.prefix}/${accountId}/${postId}/${timestamp}-${index}-${randomString}-${filename}`;

    // Create S3 client
    const s3Client = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: s3Key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: contentType,
      CacheControl: 'max-age=31536000', // Cache for 1 year
      Metadata: {
        'post-id': postId,
        'account-id': accountId,
        'source-url': imageUrl.substring(0, 500),
        'downloaded-at': new Date().toISOString(),
      },
    });

    await s3Client.send(command);

    // Return the public URL
    const url = getS3PublicUrl(s3Key);
    console.log(`[useSocialPostUpload] Downloaded and uploaded external image to S3:`, url);
    
    return url;
  } catch (error) {
    console.error(`[useSocialPostUpload] Failed to download/upload external image:`, error);
    // Return original URL as fallback (consistent with socialFetcher behavior)
    return imageUrl;
  }
}

// ============================================
// GraphQL mutation for processor invocation
// ============================================

const PROCESS_SOCIAL_POST_MUTATION = /* GraphQL */ `
  mutation ProcessSocialPost($input: ProcessSocialPostInput!) {
    processSocialPost(input: $input) {
      success
      socialPostId
      processingStatus
      contentType
      contentTypeConfidence
      placementsExtracted
      linksCreated
      extractedGameData {
        id
        socialPostId
        contentType
        contentTypeConfidence
        extractedBuyIn
        extractedPrizePool
        extractedTotalEntries
        extractedWinnerName
        extractedWinnerPrize
        extractedAt
        createdAt
        updatedAt
      }
      matchCandidates {
        gameId
        gameName
        gameDate
        gameStatus
        venueId
        venueName
        entityId
        buyIn
        guaranteeAmount
        totalEntries
        matchConfidence
        matchReason
        matchSignals
        rank
        isPrimaryMatch
        wouldAutoLink
        rejectionReason
      }
      warnings
      error
    }
  }
`;

// ============================================
// MAIN HOOK
// ============================================

export const useSocialPostUpload = ({
  socialAccountId,
  entityId: propEntityId,
  venueId: propVenueId,
}: UseSocialPostUploadOptions): UseSocialPostUploadReturn => {
  // State
  const [rawPosts, setRawPosts] = useState<RawFacebookPost[]>([]);
  const [parsedResult, setParsedResult] = useState<ParseMultipleResult | null>(null);
  const [reviewablePosts, setReviewablePosts] = useState<ReviewablePostWithAttachments[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stage?: string } | null>(null);
  
  // Account context
  const [accountContext, setAccountContext] = useState<{
    accountName: string | null;
    entityId: string | null;
    venueId: string | null;
    businessLocation: string | null;
    platform: string | null;
    profileImageUrl: string | null;
  } | null>(null);
  
  // Resolved entity/venue IDs (props override account defaults)
  const resolvedEntityId = propEntityId || accountContext?.entityId || null;
  const resolvedVenueId = propVenueId || accountContext?.venueId || null;
  
  // Filter & sort state
  const [filterOptionsState, setFilterOptionsState] = useState<PostFilterOptions>({
    showResults: true,
    showPromotional: true,
    showGeneral: true,
    showComments: false,
    minConfidence: 0,
    hasVenueMatch: null,
    hasPlacements: null,
    searchText: '',
  });
  
  const [sortOptions, setSortOptions] = useState<PostSortOptions>({
    field: 'postType',
    direction: 'asc',
  });
  
  // Client
  const client = generateClient();
  
  // ============ FETCH ACCOUNT CONTEXT ============
  
  useEffect(() => {
    const fetchAccountContext = async () => {
      if (!socialAccountId) {
        setAccountContext(null);
        return;
      }
      
      try {
        const response = await client.graphql({
          query: getSocialAccount,
          variables: { id: socialAccountId },
        });
        
        if (hasGraphQLData<{ getSocialAccount: SocialAccount | null }>(response)) {
          const account = response.data.getSocialAccount;
          if (account) {
            setAccountContext({
              accountName: account.accountName || null,
              entityId: account.entityId || null,
              venueId: account.venueId || null,
              businessLocation: account.businessLocation || null,
              platform: account.platform || null,
              profileImageUrl: account.profileImageUrl || null,
            });
          }
        }
      } catch (err) {
        console.error('Error fetching account context:', err);
      }
    };
    
    fetchAccountContext();
  }, [socialAccountId, client]);
  
  // ============ FILTER OPTIONS ============
  
  const setFilterOptions = useCallback((newOptions: Partial<PostFilterOptions>) => {
    setFilterOptionsState(prev => ({ ...prev, ...newOptions }));
  }, []);
  
  // ============ FILTERED POSTS ============
  
  const filteredPosts = useMemo(() => {
    let filtered = [...reviewablePosts];
    
    // Type filters
    filtered = filtered.filter(p => {
      if (p.postType === 'RESULT' && !filterOptionsState.showResults) return false;
      if (p.postType === 'PROMOTIONAL' && !filterOptionsState.showPromotional) return false;
      if (p.postType === 'GENERAL' && !filterOptionsState.showGeneral) return false;
      if (p.isComment && !filterOptionsState.showComments) return false;
      return true;
    });
    
    // Confidence filter
    if (filterOptionsState.minConfidence > 0) {
      filtered = filtered.filter(p => p.confidence >= filterOptionsState.minConfidence);
    }
    
    // Venue filter
    if (filterOptionsState.hasVenueMatch === true) {
      filtered = filtered.filter(p => p.venueMatch !== null);
    } else if (filterOptionsState.hasVenueMatch === false) {
      filtered = filtered.filter(p => p.venueMatch === null);
    }
    
    // Placements filter
    if (filterOptionsState.hasPlacements === true) {
      filtered = filtered.filter(p => p.placements.length > 0);
    } else if (filterOptionsState.hasPlacements === false) {
      filtered = filtered.filter(p => p.placements.length === 0);
    }
    
    // Search filter
    if (filterOptionsState.searchText) {
      const search = filterOptionsState.searchText.toLowerCase();
      filtered = filtered.filter(p =>
        p.content.toLowerCase().includes(search) ||
        p.author?.name?.toLowerCase().includes(search)
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortOptions.field) {
        case 'confidence':
          comparison = a.confidence - b.confidence;
          break;
        case 'postedAt':
          comparison = new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime();
          break;
        case 'engagement':
          const engA = a.likeCount + a.commentCount + a.shareCount;
          const engB = b.likeCount + b.commentCount + b.shareCount;
          comparison = engA - engB;
          break;
        case 'prizeAmount':
          comparison = (a.firstPlacePrize || 0) - (b.firstPlacePrize || 0);
          break;
        case 'postType':
          const typeOrder = { RESULT: 0, PROMOTIONAL: 1, GENERAL: 2, COMMENT: 3 };
          comparison = (typeOrder[a.postType] || 3) - (typeOrder[b.postType] || 3);
          break;
      }
      
      return sortOptions.direction === 'desc' ? -comparison : comparison;
    });
    
    return filtered;
  }, [reviewablePosts, filterOptionsState, sortOptions]);
  
  // ============ SELECTION ============
  
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
    setSelectedPosts(new Set(filteredPosts.map(p => p.postId)));
  }, [filteredPosts]);
  
  const deselectAll = useCallback(() => {
    setSelectedPosts(new Set());
  }, []);
  
  const selectByType = useCallback((types: PostType[]) => {
    const matching = reviewablePosts.filter(p => types.includes(p.postType));
    setSelectedPosts(new Set(matching.map(p => p.postId)));
  }, [reviewablePosts]);
  
  const selectTournamentResults = useCallback(() => {
    selectByType(['RESULT']);
  }, [selectByType]);
  
  // ============ LOADING ============
  
  const clearPosts = useCallback(() => {
    setRawPosts([]);
    setParsedResult(null);
    setReviewablePosts([]);
    setSelectedPosts(new Set());
    setError(null);
  }, []);
  
  const loadPostsFromJson = useCallback((posts: RawFacebookPost[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Parse all posts for UI preview
      // NOTE: This client-side parsing is for PREVIEW only
      // Actual classification is done by Lambda after upload
      const result = parseMultiplePosts(posts, { 
        includeRawPatterns: true,
        skipComments: false,
      });
      
      // Convert to reviewable posts
      const reviewable: ReviewablePostWithAttachments[] = result.allPosts.map((parsed) => {
        const rawPost = posts.find(p => p.post_id === parsed.postId) || posts[0];
        
        // Extract external image URLs from attachmentsDetails
        const externalUrls: string[] = [];
        if (rawPost.attachmentsDetails && Array.isArray(rawPost.attachmentsDetails)) {
          for (const detail of rawPost.attachmentsDetails) {
            if (detail.href && typeof detail.href === 'string') {
              externalUrls.push(detail.href);
            }
          }
        }
        
        return {
          ...parsed,
          isSelected: parsed.postType === 'RESULT',
          isExpanded: false,
          rawPost,
          externalImageUrls: externalUrls,
          imageCount: externalUrls.length || parsed.imageCount,
        };
      });
      
      setRawPosts(posts);
      setParsedResult(result);
      setReviewablePosts(reviewable);
      
      // Auto-select tournament results
      const resultIds = new Set(
        reviewable.filter(p => p.postType === 'RESULT').map(p => p.postId)
      );
      setSelectedPosts(resultIds);
      
    } catch (err) {
      console.error('Error parsing posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse posts');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Match attachment files to a post based on _attachments array or attachmentsDetails
   */
  function matchAttachmentsToPost(post: RawFacebookPost, availableFiles: File[]): File[] {
    if (availableFiles.length === 0) return [];
    
    const matchedFiles: File[] = [];
    
    // Try to match using _attachments array (contains filenames)
    if (post._attachments && Array.isArray(post._attachments)) {
      for (const attachmentName of post._attachments) {
        const matchedFile = availableFiles.find(f => 
          f.name === attachmentName || 
          f.name.toLowerCase() === attachmentName.toLowerCase()
        );
        if (matchedFile && !matchedFiles.includes(matchedFile)) {
          matchedFiles.push(matchedFile);
        }
      }
    }
    
    // Also try matching using attachmentsDetails
    if (post.attachmentsDetails && Array.isArray(post.attachmentsDetails)) {
      for (const detail of post.attachmentsDetails) {
        if (detail.localPath) {
          const filename = detail.localPath.split('/').pop();
          if (filename) {
            const matchedFile = availableFiles.find(f => 
              f.name === filename || 
              f.name.toLowerCase() === filename.toLowerCase()
            );
            if (matchedFile && !matchedFiles.includes(matchedFile)) {
              matchedFiles.push(matchedFile);
            }
          }
        }
      }
    }
    
    return matchedFiles;
  }
  
  /**
   * Extract external image URLs from a post (from attachmentsDetails.href)
   */
  function extractExternalImageUrls(post: RawFacebookPost): string[] {
    const urls: string[] = [];
    
    if (post.attachmentsDetails && Array.isArray(post.attachmentsDetails)) {
      for (const detail of post.attachmentsDetails) {
        if (detail.href && typeof detail.href === 'string') {
          urls.push(detail.href);
        }
      }
    }
    
    return urls;
  }
  
  const loadPostsFromFiles = useCallback(async (files: FileList | File[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const fileArray = Array.from(files);
      const posts: RawFacebookPost[] = [];
      const postAttachmentMap = new Map<string, File[]>();
      const postExternalUrlMap = new Map<string, string[]>();
      
      // Separate JSON files and attachment files
      const jsonFiles = fileArray.filter(f => f.name.endsWith('.json'));
      const attachmentFiles = fileArray.filter(f => 
        !f.name.endsWith('.json') && 
        (f.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
      );
      
      console.log('[useSocialPostUpload] Processing files:', {
        jsonFiles: jsonFiles.length,
        attachmentFiles: attachmentFiles.length,
      });
      
      // Process JSON files
      for (const file of jsonFiles) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          // Handle array or single post
          const postsInFile = Array.isArray(data) ? data : [data];
          
          for (const post of postsInFile) {
            if (post.post_id || post.postId) {
              const normalizedPost: RawFacebookPost = {
                ...post,
                post_id: post.post_id || post.postId,
              };
              posts.push(normalizedPost);
              
              // Match local attachments to this post
              const matched = matchAttachmentsToPost(normalizedPost, attachmentFiles);
              if (matched.length > 0) {
                postAttachmentMap.set(normalizedPost.post_id, matched);
              }
              
              // Extract external image URLs for posts without local files
              const externalUrls = extractExternalImageUrls(normalizedPost);
              if (externalUrls.length > 0) {
                postExternalUrlMap.set(normalizedPost.post_id, externalUrls);
              }
            }
          }
        } catch (parseError) {
          console.warn(`Failed to parse ${file.name}:`, parseError);
        }
      }
      
      if (posts.length === 0) {
        setError('No valid posts found in uploaded files');
        return;
      }
      
      console.log('[useSocialPostUpload] Loaded posts:', {
        totalPosts: posts.length,
        postsWithLocalAttachments: postAttachmentMap.size,
        postsWithExternalUrls: postExternalUrlMap.size,
      });
      
      // Parse all posts for UI preview
      const result = parseMultiplePosts(posts, { 
        includeRawPatterns: true,
        skipComments: false,
      });
      
      // Convert to reviewable posts WITH attachment files and external URLs
      const reviewable: ReviewablePostWithAttachments[] = result.allPosts.map((parsed) => {
        const rawPost = posts.find(p => p.post_id === parsed.postId) || posts[0];
        const attachmentFilesForPost = postAttachmentMap.get(parsed.postId) || [];
        const externalUrls = postExternalUrlMap.get(parsed.postId) || [];
        
        return {
          ...parsed,
          isSelected: parsed.postType === 'RESULT',
          isExpanded: false,
          rawPost,
          attachmentFiles: attachmentFilesForPost,
          externalImageUrls: externalUrls,
          imageCount: attachmentFilesForPost.length || externalUrls.length || parsed.imageCount,
        };
      });
      
      setRawPosts(posts);
      setParsedResult(result);
      setReviewablePosts(reviewable);
      
      // Auto-select tournament results
      const resultIds = new Set(
        reviewable.filter(p => p.postType === 'RESULT').map(p => p.postId)
      );
      setSelectedPosts(resultIds);
      
    } catch (err) {
      console.error('Error loading posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // ============ DUPLICATE CHECKING ============
  
  const checkExistingPostById = useCallback(async (id: string): Promise<string | null> => {
    try {
      const query = /* GraphQL */ `
        query GetSocialPost($id: ID!) {
          getSocialPost(id: $id) {
            id
          }
        }
      `;
      
      const response = await client.graphql({
        query,
        variables: { id },
      });
      
      if (hasGraphQLData<{ getSocialPost: { id: string } | null }>(response)) {
        return response.data.getSocialPost?.id || null;
      }
      return null;
    } catch {
      return null;
    }
  }, [client]);
  
  const checkExistingPostByPlatformId = useCallback(async (platformPostId: string): Promise<string | null> => {
    try {
      const query = /* GraphQL */ `
        query ListByPlatformPostId($platformPostId: String!) {
          listSocialPosts(filter: { platformPostId: { eq: $platformPostId } }, limit: 1) {
            items {
              id
            }
          }
        }
      `;
      
      const response = await client.graphql({
        query,
        variables: { platformPostId },
      });
      
      if (hasGraphQLData<{ listSocialPosts: { items: Array<{ id: string }> } }>(response)) {
        return response.data.listSocialPosts.items[0]?.id || null;
      }
      return null;
    } catch {
      return null;
    }
  }, [client]);
  
  // ============ PROCESSOR INVOCATION ============
  
  /**
   * Invoke socialPostProcessor Lambda for a single post
   * This sets the authoritative classification (contentType, tags, etc.)
   */
  const invokeProcessor = useCallback(async (socialPostId: string): Promise<{
    success: boolean;
    contentType?: string;
    linksCreated?: number;
    error?: string;
  }> => {
    try {
      console.log(`[useSocialPostUpload] Invoking processor for post ${socialPostId}`);
      
      const response = await client.graphql({
        query: PROCESS_SOCIAL_POST_MUTATION,
        variables: {
          input: {
            socialPostId,
            forceReprocess: false,
            skipMatching: false,
            skipLinking: false,
          },
        },
      });
      
      if (hasGraphQLData<{ processSocialPost: { 
        success: boolean; 
        contentType?: string;
        linksCreated?: number;
        error?: string;
      } }>(response)) {
        const result = response.data.processSocialPost;
        console.log(`[useSocialPostUpload] Processor result:`, result);
        return {
          success: result.success,
          contentType: result.contentType,
          linksCreated: result.linksCreated,
          error: result.error,
        };
      }
      
      return { success: false, error: 'Unknown response format' };
    } catch (err) {
      console.error(`[useSocialPostUpload] Processor invocation failed:`, err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Processor invocation failed' 
      };
    }
  }, [client]);
  
  // ============ UPLOAD ============
  
  const uploadSinglePost = useCallback(async (
    post: ReviewablePostWithAttachments,
    _createGame?: boolean
  ): Promise<SingleUploadResult> => {
    try {
      // Generate ID to match Lambda format: `${platform}_${platformPostId}`
      const platform = accountContext?.platform || 'FACEBOOK';
      const generatedId = `${platform}_${post.postId}`;
      
      // Check for duplicates
      const existingById = await checkExistingPostById(generatedId);
      if (existingById) {
        return {
          postId: post.postId,
          success: false,
          skipped: true,
          skipReason: 'Post already exists (matched by ID)',
          socialPostId: existingById,
        };
      }
      
      const existingByPlatformId = await checkExistingPostByPlatformId(post.postId);
      if (existingByPlatformId) {
        return {
          postId: post.postId,
          success: false,
          skipped: true,
          skipReason: 'Post already exists (matched by platformPostId)',
          socialPostId: existingByPlatformId,
        };
      }
      
      const now = new Date().toISOString();
      
      // ================================================================
      // MEDIA HANDLING - Priority order:
      // 1. Local attachment files (uploaded by user with folder)
      // 2. External URLs (from attachmentsDetails.href) - DOWNLOAD TO S3
      // 3. Legacy images array (fallback, use as-is)
      // ================================================================
      let mediaUrls: string[] = [];
      
      // Priority 1: Upload local attachment files to S3
      if (post.attachmentFiles && post.attachmentFiles.length > 0) {
        console.log(`[uploadSinglePost] Uploading ${post.attachmentFiles.length} local attachments for post ${post.postId}`);
        
        for (const file of post.attachmentFiles) {
          try {
            const s3Url = await uploadFileToS3(file, post.postId, socialAccountId);
            mediaUrls.push(s3Url);
          } catch (uploadError) {
            console.error(`[uploadSinglePost] Failed to upload attachment ${file.name}:`, uploadError);
          }
        }
        
        console.log(`[uploadSinglePost] Successfully uploaded ${mediaUrls.length} local attachments to S3`);
      }
      
      // Priority 2: Download external URLs to S3 (aligns with socialFetcher behavior)
      if (mediaUrls.length === 0 && post.externalImageUrls && post.externalImageUrls.length > 0) {
        console.log(`[uploadSinglePost] Downloading ${post.externalImageUrls.length} external images for post ${post.postId}`);
        
        for (let i = 0; i < post.externalImageUrls.length; i++) {
          const externalUrl = post.externalImageUrls[i];
          try {
            const s3Url = await downloadAndUploadExternalImage(externalUrl, post.postId, socialAccountId, i);
            mediaUrls.push(s3Url);
          } catch (downloadError) {
            console.error(`[uploadSinglePost] Failed to download external image:`, downloadError);
            // Fall back to original URL (consistent with socialFetcher)
            mediaUrls.push(externalUrl);
          }
        }
        
        console.log(`[uploadSinglePost] Processed ${mediaUrls.length} external images`);
      }
      
      // Priority 3: Legacy - use images array as-is (shouldn't happen with new flow)
      if (mediaUrls.length === 0 && post.images && post.images.length > 0) {
        console.log(`[uploadSinglePost] Using ${post.images.length} legacy image URLs for post ${post.postId}`);
        mediaUrls = post.images;
      }
      
      // Sanitize content
      const sanitizedContent = sanitizeForGraphQL(post.content);
      const contentPreview = sanitizedContent.substring(0, 200);
      
      // ================================================================
      // BUILD rawContent - This is the AUTHORITATIVE source
      // Processor will use this for classification
      // ================================================================
      const rawContentObject = sanitizeObjectForJson({
        // Full raw post data from scraper
        ...post.rawPost,
        
        // Uploaded attachments info (if any)
        _uploadedAttachments: mediaUrls.length > 0 ? {
          count: mediaUrls.length,
          urls: mediaUrls,
          uploadedAt: now,
        } : null,
        
        // Source tracking
        _source: 'manualUpload',
        _uploadedAt: now,
      });
      
      // ================================================================
      // BUILD MINIMAL INPUT - Processor handles classification
      // ================================================================
      const input: CreateSocialPostInput = {
        // ID to match Lambda format
        id: generatedId,
        
        // Required fields
        platformPostId: post.postId,
        postType: mediaUrls.length > 0 ? SocialPostType.IMAGE : SocialPostType.TEXT,
        postedAt: post.postedAt,
        postYearMonth: getYearMonthAEST(post.postedAt),
        scrapedAt: now,
        status: SocialPostStatus.ACTIVE,
        processingStatus: SocialPostProcessingStatus.PENDING, // Processor will update this
        socialAccountId,
        
        // Content fields
        postUrl: post.url,
        content: sanitizedContent,
        contentPreview,
        rawContent: JSON.stringify(rawContentObject), // AUTHORITATIVE - processor uses this
        
        // Account info
        accountName: accountContext?.accountName || sanitizeForGraphQL(post.author?.name),
        accountProfileImageUrl: accountContext?.profileImageUrl || post.author?.avatar || null,
        platform: platform,
        businessLocation: accountContext?.businessLocation || null,
        
        // Engagement metrics
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        shareCount: post.shareCount,
        reactionCount: post.likeCount,
        
        // Media
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
        thumbnailUrl: mediaUrls.length > 0 ? mediaUrls[0] : null,
        
        // ================================================================
        // MINIMAL TAGS - Just hashtags, processor adds classification tags
        // ================================================================
        tags: extractHashtags(post.content),
        
        // ================================================================
        // NO CLASSIFICATION FIELDS - Processor sets these:
        // - contentType
        // - contentTypeConfidence  
        // - isPromotional
        // - isTournamentRelated
        // - isTournamentResult
        // ================================================================
        
        // Optional entity/venue (inherited from account if not provided)
        ...(resolvedEntityId && { entityId: resolvedEntityId }),
        ...(resolvedVenueId && { venueId: resolvedVenueId }),
      };
      
      // Save to DynamoDB via GraphQL
      const response = await client.graphql({
        query: createSocialPost,
        variables: { input },
      });
      
      if (hasGraphQLData<{ createSocialPost: SocialPost }>(response)) {
        const savedPost = response.data.createSocialPost;
        
        // Update the reviewable post with the S3 URLs
        setReviewablePosts(prev => prev.map(p => 
          p.postId === post.postId
            ? { ...p, attachmentS3Urls: mediaUrls }
            : p
        ));
        
        // ================================================================
        // INVOKE PROCESSOR - This sets classification
        // ================================================================
        const processingResult = await invokeProcessor(savedPost.id);
        
        return {
          postId: post.postId,
          success: true,
          socialPostId: savedPost.id,
          // Include processing results
          processingSuccess: processingResult.success,
          processingError: processingResult.error,
          contentType: processingResult.contentType as any,
          linksCreated: processingResult.linksCreated,
        };
      }
      
      return {
        postId: post.postId,
        success: false,
        error: 'Unknown error creating post',
      };
      
    } catch (err) {
      console.error('Error uploading post:', err);
      const errorMessage = err instanceof Error ? err.message : 
        (typeof err === 'object' && err !== null && 'errors' in err) 
          ? JSON.stringify((err as { errors: unknown[] }).errors)
          : 'Upload failed';
      return {
        postId: post.postId,
        success: false,
        error: errorMessage,
      };
    }
  }, [client, socialAccountId, accountContext, resolvedEntityId, resolvedVenueId, checkExistingPostById, checkExistingPostByPlatformId, invokeProcessor]);
  
  const uploadSelectedPosts = useCallback(async (
    uploadOptions: Partial<UploadOptions> = {},
    onShouldCancel?: () => boolean
  ): Promise<BatchUploadResult> => {
    const {
      includeResults = true,
      includePromotional = true,
      includeGeneral = false,
      minConfidence = 0,
      createGameRecords: _createGameRecords = false,
      skipDuplicates: _skipDuplicates = true,
      dryRun = false,
      processingFlow = 'upload_process', // Default: upload then process
    } = uploadOptions;
    
    // Get posts to upload based on selection and type filters
    let postsToUpload = reviewablePosts.filter(p => selectedPosts.has(p.postId));
    
    // Apply type filters (client-side preview types)
    postsToUpload = postsToUpload.filter(p => {
      if (p.isComment) return false;
      if (p.postType === 'RESULT' && !includeResults) return false;
      if (p.postType === 'PROMOTIONAL' && !includePromotional) return false;
      if (p.postType === 'GENERAL' && !includeGeneral) return false;
      return true;
    });
    
    // Apply confidence filter
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
    
    console.log(`[uploadSelectedPosts] Starting upload of ${postsToUpload.length} posts (flow: ${processingFlow})`);
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: postsToUpload.length, stage: 'Starting...' });
    
    const results: SingleUploadResult[] = [];
    const errors: Array<{ postId: string; error: string }> = [];
    const successfulPostIds: string[] = [];
    
    try {
      // Upload posts one by one
      for (let i = 0; i < postsToUpload.length; i++) {
        // Check for cancellation
        if (onShouldCancel?.()) {
          console.log(`[uploadSelectedPosts] Cancelled at post ${i + 1}/${postsToUpload.length}`);
          break;
        }
        
        const post = postsToUpload[i];
        const attachmentCount = post.attachmentFiles?.length || post.externalImageUrls?.length || 0;
        
        setUploadProgress({ 
          current: i + 1, 
          total: postsToUpload.length,
          stage: attachmentCount > 0 
            ? `Uploading post ${i + 1}/${postsToUpload.length} (${attachmentCount} images)...`
            : `Uploading post ${i + 1}/${postsToUpload.length}...`
        });
        
        if (dryRun) {
          results.push({
            postId: post.postId,
            success: true,
            skipped: false,
          });
          continue;
        }
        
        // Upload with inline processing (each post processed immediately after save)
        const result = await uploadSinglePost(post, _createGameRecords);
        results.push(result);
        
        if (result.success && result.socialPostId) {
          successfulPostIds.push(result.socialPostId);
        }
        
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
                _processingStatus: result.processingSuccess ? 'success' : 'error',
                _processingError: result.processingError,
              }
            : p
        ));
        
        // Small delay between uploads to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      }
      
      // Calculate totals
      const successCount = results.filter(r => r.success).length;
      const totalLinksCreated = results.reduce((sum, r) => sum + (r.linksCreated || 0), 0);
      
      // Content type breakdown from processing results
      const contentTypeBreakdown = {
        result: results.filter(r => r.contentType === 'RESULT').length,
        promotional: results.filter(r => r.contentType === 'PROMOTIONAL').length,
        general: results.filter(r => r.contentType === 'GENERAL').length,
      };
      
      return {
        totalProcessed: postsToUpload.length,
        successCount,
        errorCount: results.filter(r => !r.success && !r.skipped).length,
        skippedCount: results.filter(r => r.skipped).length,
        results,
        errors,
        // Processing stats
        processedCount: successfulPostIds.length,
        processErrorCount: results.filter(r => r.success && !r.processingSuccess).length,
        totalLinksCreated,
        contentTypeBreakdown,
      };
      
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [reviewablePosts, selectedPosts, uploadSinglePost]);
  
  // ============ EDITING ============
  
  const updatePostField = useCallback((postId: string, field: string, value: unknown) => {
    setReviewablePosts(prev => prev.map(p =>
      p.postId === postId ? { ...p, [field]: value } : p
    ));
  }, []);
  
  // ============ RETURN ============
  
  return {
    rawPosts,
    parsedResult,
    reviewablePosts,
    isLoading,
    isUploading,
    error,
    uploadProgress,
    accountContext,
    
    loadPostsFromFiles,
    loadPostsFromJson,
    clearPosts,
    
    selectedPosts,
    togglePostSelection,
    selectAll,
    deselectAll,
    selectByType,
    selectTournamentResults,
    
    filterOptions: filterOptionsState,
    setFilterOptions,
    sortOptions,
    setSortOptions,
    filteredPosts,
    
    uploadSelectedPosts,
    uploadSinglePost,
    
    updatePostField,
    
    stats: parsedResult?.stats || null,
  };
};

export default useSocialPostUpload;