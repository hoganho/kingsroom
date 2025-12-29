// src/hooks/useSocialPostUpload.ts
// REFACTORED - Optional entity/venue, proper AWSJSON rawContent, ATTACHMENT UPLOAD SUPPORT

import { useState, useCallback, useMemo, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fetchAuthSession } from 'aws-amplify/auth';
import { createSocialPost } from '../graphql/mutations';
import { getSocialAccount } from '../graphql/queries';

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
  CreateSocialPostInput,
} from '../API';

// S3 Configuration for post attachments
const S3_CONFIG = {
  bucket: 'pokerpro-scraper-storage',
  region: 'ap-southeast-2',
  prefix: 'social-media/post-attachments',
} as const;

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
 * Calculate postYearMonth from a date string
 * Format: "YYYY-MM" (e.g., "2025-01" for January 2025)
 * Used for the byPostMonth GSI for efficient date range queries
 */
function getPostYearMonth(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
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
 * Upload a file to S3 and return the URL
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

  // Create S3 client
  const s3Client = new S3Client({
    region: S3_CONFIG.region,
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
  
  const s3Key = `${S3_CONFIG.prefix}/${accountId}/${postId}/${timestamp}-${randomString}-${sanitizedFilename}`;

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
    Bucket: S3_CONFIG.bucket,
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
  const url = `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${s3Key}`;
  console.log('[useSocialPostUpload] Uploaded attachment to S3:', { filename: file.name, url });

  return url;
}

export const useSocialPostUpload = (
  options: UseSocialPostUploadOptions
): UseSocialPostUploadReturn => {
  const { socialAccountId, entityId: providedEntityId, venueId: providedVenueId } = options;
  
  const client = useMemo(() => generateClient(), []);
  
  // Core state
  const [rawPosts, setRawPosts] = useState<RawFacebookPost[]>([]);
  const [parsedResult, setParsedResult] = useState<ParseMultipleResult | null>(null);
  const [reviewablePosts, setReviewablePosts] = useState<ReviewablePostWithAttachments[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  
  // Account context - fetched from the selected SocialAccount
  const [accountContext, setAccountContext] = useState<{
    accountName: string | null;
    entityId: string | null;
    venueId: string | null;
    businessLocation: string | null;
    platform: string | null;
    profileImageUrl: string | null;
  } | null>(null);
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; stage?: string } | null>(null);
  
  // Filter & Sort state
  const [filterOptions, setFilterOptionsState] = useState<PostFilterOptions>({
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
    direction: 'desc',
  });
  
  // Fetch SocialAccount details when socialAccountId changes
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
        
        if (hasGraphQLData<{ getSocialAccount: SocialAccount }>(response)) {
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
        console.warn('Failed to fetch social account context:', err);
        setAccountContext(null);
      }
    };
    
    fetchAccountContext();
  }, [client, socialAccountId]);
  
  // Resolved entity/venue IDs (provided > inherited from account)
  const resolvedEntityId = providedEntityId || accountContext?.entityId || null;
  const resolvedVenueId = providedVenueId || accountContext?.venueId || null;
  
  // ============ LOAD FUNCTIONS ============
  
  const loadPostsFromFiles = useCallback(async (files: FileList | File[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const posts: RawFacebookPost[] = [];
      const fileArray = Array.from(files);
      
      // Group files by their parent folder
      // Structure: { folderPath: { postJson: File, attachments: File[] } }
      const folderMap = new Map<string, { postJson: File | null; attachments: File[] }>();
      
      for (const file of fileArray) {
        // Get the folder path from webkitRelativePath or use empty string for flat uploads
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split('/');
        
        // Determine the post folder (the folder containing post.json)
        // Could be: "folderName/post.json" or "folderName/attachments/image.jpg"
        let postFolder = '';
        
        if (file.name === 'post.json' || file.name.endsWith('.json')) {
          // This is a post.json file
          // The folder is everything before the filename
          postFolder = pathParts.slice(0, -1).join('/') || 'root';
        } else if (pathParts.includes('attachments')) {
          // This is an attachment file
          // Find the folder that's the parent of 'attachments'
          const attachmentsIdx = pathParts.indexOf('attachments');
          postFolder = pathParts.slice(0, attachmentsIdx).join('/') || 'root';
        } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          // Image file not in attachments folder - check if it's alongside post.json
          postFolder = pathParts.slice(0, -1).join('/') || 'root';
        }
        
        if (!folderMap.has(postFolder)) {
          folderMap.set(postFolder, { postJson: null, attachments: [] });
        }
        
        const folderData = folderMap.get(postFolder)!;
        
        if (file.name === 'post.json' || file.name.endsWith('.json')) {
          folderData.postJson = file;
        } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          folderData.attachments.push(file);
        }
      }
      
      console.log('[useSocialPostUpload] Folder map:', 
        Array.from(folderMap.entries()).map(([k, v]) => ({
          folder: k,
          hasPost: !!v.postJson,
          attachmentCount: v.attachments.length,
          attachmentNames: v.attachments.map(f => f.name),
        }))
      );
      
      // Process each folder
      const postAttachmentMap = new Map<string, File[]>();
      
      for (const [folderPath, { postJson, attachments }] of folderMap.entries()) {
        if (!postJson) continue;
        
        try {
          const text = await postJson.text();
          const parsed = JSON.parse(text);
          
          if (Array.isArray(parsed)) {
            // Array of posts - attachments apply to all in this folder
            for (const p of parsed) {
              if (p.post_id) {
                posts.push(p);
                // Match attachments based on _attachments array if present
                const matchedAttachments = matchAttachmentsToPost(p, attachments);
                if (matchedAttachments.length > 0) {
                  postAttachmentMap.set(p.post_id, matchedAttachments);
                }
              }
            }
          } else if (parsed.post_id) {
            posts.push(parsed);
            // Match attachments based on _attachments array or attachmentsDetails
            const matchedAttachments = matchAttachmentsToPost(parsed, attachments);
            if (matchedAttachments.length > 0) {
              postAttachmentMap.set(parsed.post_id, matchedAttachments);
            }
          }
        } catch (parseError) {
          console.warn(`Failed to parse ${postJson.name} in ${folderPath}:`, parseError);
        }
      }
      
      if (posts.length === 0) {
        setError('No valid posts found in uploaded files');
        return;
      }
      
      console.log('[useSocialPostUpload] Loaded posts with attachments:', {
        totalPosts: posts.length,
        postsWithAttachments: postAttachmentMap.size,
        attachmentDetails: Array.from(postAttachmentMap.entries()).map(([id, files]) => ({
          postId: id,
          files: files.map(f => f.name),
        })),
      });
      
      // Parse all posts
      const result = parseMultiplePosts(posts, { 
        includeRawPatterns: true,
        skipComments: false,
      });
      
      // Convert to reviewable posts WITH attachment files
      const reviewable: ReviewablePostWithAttachments[] = result.allPosts.map((parsed) => {
        const rawPost = posts.find(p => p.post_id === parsed.postId) || posts[0];
        const attachmentFiles = postAttachmentMap.get(parsed.postId) || [];
        
        return {
          ...parsed,
          isSelected: parsed.postType === 'RESULT',
          isExpanded: false,
          rawPost,
          attachmentFiles,
          // Update image count to reflect actual attachments found
          imageCount: attachmentFiles.length || parsed.imageCount,
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
    
    // Also try matching using attachmentsDetails (contains more detailed info)
    if (post.attachmentsDetails && Array.isArray(post.attachmentsDetails)) {
      for (const detail of post.attachmentsDetails) {
        if (detail.localPath) {
          // localPath might be like "folderName/attachments/filename.jpg"
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
    
    // If no specific matches, but we have exactly one post.json and attachments in same folder,
    // assume all attachments belong to this post
    if (matchedFiles.length === 0 && availableFiles.length > 0) {
      console.log(`[matchAttachmentsToPost] No specific matches for post ${post.post_id}, using all ${availableFiles.length} available files`);
      return [...availableFiles];
    }
    
    return matchedFiles;
  }
  
  const loadPostsFromJson = useCallback((posts: RawFacebookPost[]) => {
    const result = parseMultiplePosts(posts, { 
      includeRawPatterns: true,
      skipComments: false,
    });
    
    const reviewable: ReviewablePostWithAttachments[] = result.allPosts.map((parsed) => {
      const rawPost = posts.find(p => p.post_id === parsed.postId) || posts[0];
      return {
        ...parsed,
        isSelected: parsed.postType === 'RESULT',
        isExpanded: false,
        rawPost,
        attachmentFiles: [], // No attachments when loading from JSON directly
      };
    });
    
    setRawPosts(posts);
    setParsedResult(result);
    setReviewablePosts(reviewable);
    
    const resultIds = new Set(
      reviewable.filter(p => p.postType === 'RESULT').map(p => p.postId)
    );
    setSelectedPosts(resultIds);
  }, []);
  
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
    const allIds = reviewablePosts
      .filter(p => !p.isComment)
      .map(p => p.postId);
    setSelectedPosts(new Set(allIds));
  }, [reviewablePosts]);
  
  const deselectAll = useCallback(() => {
    setSelectedPosts(new Set());
  }, []);
  
  const selectByType = useCallback((types: PostType[]) => {
    const matchingIds = reviewablePosts
      .filter(p => types.includes(p.postType))
      .map(p => p.postId);
    setSelectedPosts(new Set(matchingIds));
  }, [reviewablePosts]);
  
  const selectTournamentResults = useCallback(() => {
    selectByType(['RESULT']);
  }, [selectByType]);
  
  // ============ FILTER & SORT ============
  
  const setFilterOptions = useCallback((options: Partial<PostFilterOptions>) => {
    setFilterOptionsState(prev => ({ ...prev, ...options }));
  }, []);
  
  const filteredPosts = useMemo(() => {
    let posts = [...reviewablePosts];
    
    // Apply type filters
    posts = posts.filter(p => {
      if (p.postType === 'RESULT' && !filterOptions.showResults) return false;
      if (p.postType === 'PROMOTIONAL' && !filterOptions.showPromotional) return false;
      if (p.postType === 'GENERAL' && !filterOptions.showGeneral) return false;
      if (p.postType === 'COMMENT' && !filterOptions.showComments) return false;
      return true;
    });
    
    // Apply confidence filter
    if (filterOptions.minConfidence > 0) {
      posts = posts.filter(p => p.confidence >= filterOptions.minConfidence);
    }
    
    // Apply venue filter
    if (filterOptions.hasVenueMatch === true) {
      posts = posts.filter(p => p.venueMatch !== null);
    } else if (filterOptions.hasVenueMatch === false) {
      posts = posts.filter(p => p.venueMatch === null);
    }
    
    // Apply placements filter
    if (filterOptions.hasPlacements === true) {
      posts = posts.filter(p => p.placements.length > 0);
    } else if (filterOptions.hasPlacements === false) {
      posts = posts.filter(p => p.placements.length === 0);
    }
    
    // Apply search filter
    if (filterOptions.searchText) {
      const search = filterOptions.searchText.toLowerCase();
      posts = posts.filter(p => 
        p.content.toLowerCase().includes(search) ||
        p.author.name.toLowerCase().includes(search)
      );
    }
    
    // Apply sorting
    posts.sort((a, b) => {
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
          const typeOrder = { RESULT: 3, PROMOTIONAL: 2, GENERAL: 1, COMMENT: 0 };
          comparison = typeOrder[a.postType] - typeOrder[b.postType];
          break;
      }
      
      return sortOptions.direction === 'desc' ? -comparison : comparison;
    });
    
    return posts;
  }, [reviewablePosts, filterOptions, sortOptions]);
  
  // ============ UPLOAD FUNCTIONS ============
  
  // Check if post exists by ID (primary key - how Lambda checks)
  const checkExistingPostById = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { getSocialPost } = await import('../graphql/queries');
      const response = await client.graphql({
        query: getSocialPost,
        variables: { id },
      });
      
      if (hasGraphQLData<{ getSocialPost: SocialPost | null }>(response)) {
        return response.data.getSocialPost !== null;
      }
      return false;
    } catch {
      return false;
    }
  }, [client]);
  
  // Check if post exists by platformPostId (GSI - fallback check)
  const checkExistingPostByPlatformId = useCallback(async (platformPostId: string): Promise<string | null> => {
    try {
      // Use the byPlatformPostId index
      const { socialPostByPlatformId } = await import('../graphql/queries');
      const response = await client.graphql({
        query: socialPostByPlatformId,
        variables: {
          platformPostId,
          limit: 1,
        },
      });
      
      if (hasGraphQLData<{ socialPostByPlatformId: { items: SocialPost[] } }>(response)) {
        const items = response.data.socialPostByPlatformId?.items || [];
        return items.length > 0 ? items[0].id : null;
      }
      return null;
    } catch {
      return null;
    }
  }, [client]);
  
  const uploadSinglePost = useCallback(async (
    post: ReviewablePostWithAttachments,
    _createGame = false
  ): Promise<SingleUploadResult> => {
    try {
      // Skip comments
      if (post.isComment) {
        return {
          postId: post.postId,
          success: false,
          skipped: true,
          skipReason: 'Post is a comment',
        };
      }
      
      // Validate required field
      if (!socialAccountId) {
        return {
          postId: post.postId,
          success: false,
          error: 'Social Account is required',
        };
      }
      
      // Determine platform (from account context or raw post)
      const platform = accountContext?.platform || post.rawPost?.platform || 'FACEBOOK';
      
      // Generate deterministic ID matching Lambda format: ${platform}_${platformPostId}
      // This ensures consistency between automated scrapes and manual uploads
      const generatedId = `${platform}_${post.postId}`;
      
      // Check for duplicates - MATCH LAMBDA BEHAVIOR
      // Lambda checks by the generated ID (primary key), so we do the same
      const existsById = await checkExistingPostById(generatedId);
      if (existsById) {
        return {
          postId: post.postId,
          success: false,
          skipped: true,
          skipReason: 'Post already exists (matched by ID)',
          socialPostId: generatedId,
        };
      }
      
      // Also check by platformPostId (fallback for posts created with different ID format)
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
      
      // Upload attachments to S3 first (if any)
      let mediaUrls: string[] = [];
      
      if (post.attachmentFiles && post.attachmentFiles.length > 0) {
        console.log(`[uploadSinglePost] Uploading ${post.attachmentFiles.length} attachments for post ${post.postId}`);
        
        for (const file of post.attachmentFiles) {
          try {
            const s3Url = await uploadFileToS3(file, post.postId, socialAccountId);
            mediaUrls.push(s3Url);
          } catch (uploadError) {
            console.error(`[uploadSinglePost] Failed to upload attachment ${file.name}:`, uploadError);
            // Continue with other files even if one fails
          }
        }
        
        console.log(`[uploadSinglePost] Successfully uploaded ${mediaUrls.length} attachments to S3`);
      }
      
      // If no attachments were uploaded but post has external image URLs (from scraper), use those
      if (mediaUrls.length === 0 && post.images && post.images.length > 0) {
        mediaUrls = post.images;
      }
      
      // Sanitize content
      const sanitizedContent = sanitizeForGraphQL(post.content);
      // Use 200 chars for contentPreview to match Lambda
      const contentPreview = sanitizedContent.substring(0, 200);
      
      // Build rawContent as AWSJSON - include the full raw post data
      const rawContentObject = sanitizeObjectForJson({
        ...post.rawPost,
        // Add parsed metadata
        _parsed: {
          placements: post.placements,
          prizes: post.prizes,
          metadata: post.metadata,
          postType: post.postType,
          confidence: post.confidence,
          matchedPatterns: post.matchedPatterns,
        },
        // Track that attachments were uploaded to S3
        _uploadedAttachments: mediaUrls.length > 0 ? {
          count: mediaUrls.length,
          urls: mediaUrls,
          uploadedAt: now,
        } : null,
      });
      
      // Build the input - matching Lambda's field structure for consistency
      // Key differences from Lambda:
      // - Lambda writes directly to DynamoDB, we use GraphQL mutation
      // - We include additional parsed data fields (rawContent, isTournamentResult, etc.)
      const input: CreateSocialPostInput = {
        // ===== ID GENERATION - MUST MATCH LAMBDA =====
        // Lambda uses: `${account.platform}_${fbPost.id}`
        // We generate the same format for consistency
        id: generatedId,
        
        // Required fields
        platformPostId: post.postId,
        postType: mediaUrls.length > 0 ? SocialPostType.IMAGE : SocialPostType.TEXT,
        postedAt: post.postedAt,
        postYearMonth: getPostYearMonth(post.postedAt),
        scrapedAt: now,
        status: SocialPostStatus.ACTIVE,
        socialAccountId,
        
        // Content fields
        postUrl: post.url,
        content: sanitizedContent,
        contentPreview, // 200 chars to match Lambda
        rawContent: JSON.stringify(rawContentObject), // AWSJSON must be stringified
        
        // Account info (inherited from context) - MATCH LAMBDA FIELDS
        accountName: accountContext?.accountName || sanitizeForGraphQL(post.author?.name),
        accountProfileImageUrl: accountContext?.profileImageUrl || post.author?.avatar || null,
        platform: platform,
        businessLocation: accountContext?.businessLocation || null,
        
        // Engagement metrics
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        shareCount: post.shareCount,
        reactionCount: post.likeCount, // Facebook uses reactions
        
        // Media - USE EMPTY ARRAY (not null) TO MATCH LAMBDA
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
        thumbnailUrl: mediaUrls.length > 0 ? mediaUrls[0] : null,
        
        // Classification - Lambda has isPromotional and isTournamentRelated
        // We add isTournamentResult as additional parsed field
        isTournamentResult: post.isTournamentResult,
        isTournamentRelated: post.isTournamentResult || post.isPromotional,
        isPromotional: post.isPromotional,
        tags: post.tags.length > 0 ? post.tags : [],
        
        // Optional entity/venue (inherited from account if not provided)
        // Lambda: Only adds if truthy to avoid null in GSI
        ...(resolvedEntityId && { entityId: resolvedEntityId }),
        ...(resolvedVenueId && { venueId: resolvedVenueId }),
      };
      
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
  }, [client, socialAccountId, accountContext, resolvedEntityId, resolvedVenueId, checkExistingPostById, checkExistingPostByPlatformId]);
  
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
    } = uploadOptions;
    
    // Get posts to upload based on selection and type filters
    let postsToUpload = reviewablePosts.filter(p => selectedPosts.has(p.postId));
    
    // Apply type filters
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
    
    // Count total attachments
    const totalAttachments = postsToUpload.reduce(
      (sum, p) => sum + (p.attachmentFiles?.length || 0), 
      0
    );
    
    console.log(`[uploadSelectedPosts] Starting upload of ${postsToUpload.length} posts with ${totalAttachments} total attachments`);
    
    setIsUploading(true);
    setUploadProgress({ current: 0, total: postsToUpload.length, stage: 'Starting...' });
    
    const results: SingleUploadResult[] = [];
    const errors: Array<{ postId: string; error: string }> = [];
    
    try {
      for (let i = 0; i < postsToUpload.length; i++) {
        // Check for cancellation before processing each post
        if (onShouldCancel?.()) {
          console.log(`[uploadSelectedPosts] Cancelled at post ${i + 1}/${postsToUpload.length}`);
          break;
        }
        
        const post = postsToUpload[i];
        const attachmentCount = post.attachmentFiles?.length || 0;
        
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
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
    
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
    
    filterOptions,
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