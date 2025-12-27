// src/types/socialPostUpload.ts
// UPDATED: Added Lambda processing integration types
// Maintains backward compatibility with existing client-side parsing

// ===================================================================
// PROCESSING FLOW (NEW - similar to scraper's scrape_only/scrape_save)
// ===================================================================

/**
 * Upload + Processing flow options
 */
export type ProcessingFlow = 
  | 'upload_only'      // Just upload, leave as PENDING for later processing
  | 'upload_process';  // Upload then process via Lambda (extract + match + link)

/**
 * Processing options passed to Lambda
 */
export interface ProcessingOptions {
  forceReprocess?: boolean;    // Re-process even if already done
  skipMatching?: boolean;      // Only extract, don't match to games
  skipLinking?: boolean;       // Extract and match, but don't create links
  matchThreshold?: number;     // Override default auto-link threshold (0-100)
}

export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  forceReprocess: false,
  skipMatching: false,
  skipLinking: false,
  matchThreshold: 80,
};

// ===================================================================
// POST TYPE & CLASSIFICATION
// ===================================================================

/**
 * Post type classification
 */
export type PostType = 'RESULT' | 'PROMOTIONAL' | 'GENERAL' | 'COMMENT';

/**
 * Content type from Lambda (matches GraphQL enum)
 */
export type ContentType = 'RESULT' | 'PROMOTIONAL' | 'GENERAL' | 'COMMENT';

/**
 * Pattern match info for debugging (client-side parsing)
 */
export interface PatternMatch {
  type: 'high' | 'medium';
  name: string;
  category?: 'result' | 'promo';
}

/**
 * Post type detection result (client-side)
 * @deprecated Use Lambda processing for classification
 */
export interface PostTypeDetection {
  postType: PostType;
  confidence: number;
  resultScore: number;
  promoScore: number;
  resultMatches: PatternMatch[];
  promoMatches: PatternMatch[];
}

// ===================================================================
// RAW POST DATA (from file upload)
// ===================================================================

/**
 * Raw Facebook post structure from scraper/extension
 */
export interface RawFacebookPost {
  post_id: string;
  storyId?: string | null;
  content: string;
  url: string;
  mbasicUrl?: string | null;
  feedbackId?: string | null;
  platform?: string;
  reactionsCount?: number;
  shareCount?: number;
  commentCount?: number;
  
  author: {
    id?: string | null;
    name: string;
    avatar?: string;
    profile?: string | null;
  };
  
  // Date fields - various formats from different scrapers
  createdAt?: number | string;
  postedAt?: number | string;
  scrapedAt?: string;
  timestamp?: number;
  extractedDate?: string;
  date?: string;
  
  comments?: Array<{
    author: { name: string; profile?: string };
    text: string;
    time?: string | null;
  }>;
  
  attachedStoryAttachments?: unknown;
  attachmentsDetails?: Array<{
    id: string;
    href: string;
    caption?: string;
    localPath?: string;
    createdAt?: number;
    accessibilityCaption?: string;
  }>;
  
  _attachments?: string[];
  images?: string[];
  folderName?: string;
  parentFolder?: string;
  fullPath?: string;
}

// ===================================================================
// EXTRACTED DATA TYPES
// ===================================================================

/**
 * Placement result extracted from post
 */
export interface PlacementResult {
  place: number;
  name: string;
  prize: number | null;
  prizeRaw: string | null;
}

/**
 * Extracted prize info
 */
export interface ExtractedPrize {
  amount: number;
  raw: string;
  context: string;
}

/**
 * Extracted tournament metadata
 */
export interface ExtractedTournamentMetadata {
  entries?: number;
  buyIn?: number;
  prizePool?: number;
  gameTypes?: string[];
  eventNumber?: number;
  tournamentName?: string;
}

/**
 * Venue match result
 */
export interface VenueMatchResult {
  name: string;
  confidence: number;
  id?: string;
}

// ===================================================================
// PARSED POST (client-side parsing result)
// @deprecated - Lambda now handles classification/extraction
// Kept for backward compatibility during transition
// ===================================================================

/**
 * Parsed social post with all extracted data
 * @deprecated Use Lambda processing instead
 */
export interface ParsedSocialPost {
  postId: string;
  url: string;
  content: string;
  author: RawFacebookPost['author'];
  postedAt: string;

  // Type classification
  postType: PostType;
  confidence: number;
  
  // Type flags (for convenience & legacy compatibility)
  isTournamentResult: boolean;
  isPromotional: boolean;
  isComment: boolean;

  // Extracted data
  placements: PlacementResult[];
  prizes: ExtractedPrize[];
  metadata: ExtractedTournamentMetadata;

  // Derived fields
  firstPlacePrize: number | null;
  totalPrizesPaid: number;
  entriesCount: number | null;
  buyInAmount: number | null;
  prizePoolAmount: number | null;
  tournamentName: string | null;
  gameTypes: string[];

  venueMatch: VenueMatchResult | null;
  tags: string[];

  // Media
  imageCount: number;
  images: string[];

  // Engagement
  likeCount: number;
  commentCount: number;
  shareCount: number;

  // Debug info (optional)
  matchedPatterns?: PatternMatch[];
  typeScores?: {
    result: number;
    promo: number;
  };
}

/**
 * Parse statistics
 * @deprecated Use Lambda stats instead
 */
export interface ParseStats {
  totalPosts: number;
  realPosts: number;
  tournamentResults: number;
  promotionalPosts: number;
  generalPosts: number;
  otherPosts: number;
  skippedComments: number;
  postsWithPlacements: number;
  postsWithPrizes: number;
  postsWithVenue: number;
  avgResultConfidence: number;
  avgPromoConfidence: number;
}

/**
 * Result of parsing multiple posts
 * @deprecated Use Lambda batch processing instead
 */
export interface ParseMultipleResult {
  tournamentResults: ParsedSocialPost[];
  promotionalPosts: ParsedSocialPost[];
  generalPosts: ParsedSocialPost[];
  comments: ParsedSocialPost[];
  allPosts: ParsedSocialPost[];
  stats: ParseStats;
}

// ===================================================================
// LAMBDA PROCESSING RESULT TYPES (NEW)
// ===================================================================

/**
 * Summary of Lambda processing result for UI display
 */
export interface ProcessingResultSummary {
  contentType: ContentType;
  confidence: number;
  matchCount: number;
  bestMatchConfidence: number;
  linksCreated: number;
  placementsExtracted: number;
  suggestedGameId?: string;
  suggestedGameName?: string;
}

/**
 * Game match candidate from Lambda
 */
export interface GameMatchCandidate {
  gameId: string;
  gameName: string;
  gameDate: string;
  gameStatus?: string;
  venueId?: string;
  venueName?: string;
  entityId?: string;
  buyIn?: number;
  guaranteeAmount?: number;
  totalEntries?: number;
  matchConfidence: number;
  matchReason?: string;
  matchSignals?: string;
  rank: number;
  isPrimaryMatch: boolean;
  wouldAutoLink: boolean;
  rejectionReason?: string;
}

// ===================================================================
// REVIEWABLE POST (for UI display)
// ===================================================================

/**
 * Base reviewable post - before processing
 */
export interface ReviewablePostBase {
  // Identity
  postId: string;
  url: string;
  
  // Content
  content: string;
  contentPreview: string;
  
  // Author
  author: {
    name: string;
    avatar?: string;
  };
  
  // Timestamp
  postedAt: string;
  
  // Engagement
  likeCount: number;
  commentCount: number;
  shareCount: number;
  
  // Media
  imageCount: number;
  images: string[];
  
  // Raw data reference
  rawPost: RawFacebookPost;
  
  // UI state
  isSelected: boolean;
  isExpanded: boolean;
}

/**
 * Reviewable post for the upload UI
 * Extends ParsedSocialPost for backward compatibility
 */
export interface ReviewablePost extends ParsedSocialPost {
  isSelected: boolean;
  isExpanded: boolean;
  rawPost: RawFacebookPost;
  
  // Upload status tracking
  _uploadStatus?: 'pending' | 'uploading' | 'success' | 'error' | 'skipped';
  _uploadError?: string;
  _savedPostId?: string;
  _savedGameId?: string;
  
  // Processing status tracking (NEW)
  _processingStatus?: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
  _processingError?: string;
  _processingResult?: ProcessingResultSummary;
  _matchCandidates?: GameMatchCandidate[];
}

/**
 * Reviewable post with attachment file references (for manual upload)
 */
export interface ReviewablePostWithAttachments extends ReviewablePost {
  /** Local File objects for attachments to be uploaded */
  attachmentFiles?: File[];
  /** S3 URLs after successful upload */
  attachmentS3Urls?: string[];
}

// ===================================================================
// UPLOAD RESULT TYPES
// ===================================================================

/**
 * Single post upload result
 */
export interface SingleUploadResult {
  postId: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  socialPostId?: string;
  gameId?: string;
  
  // Processing results (NEW - when upload_process flow)
  processingSuccess?: boolean;
  processingError?: string;
  contentType?: ContentType;
  confidence?: number;
  matchCount?: number;
  linksCreated?: number;
}

/**
 * Batch upload result
 */
export interface BatchUploadResult {
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  results: SingleUploadResult[];
  errors: Array<{ postId: string; error: string }>;
  
  // Processing stats (NEW - when upload_process flow)
  processedCount?: number;
  processErrorCount?: number;
  totalLinksCreated?: number;
  avgMatchConfidence?: number;
  contentTypeBreakdown?: {
    result: number;
    promotional: number;
    general: number;
  };
}

// ===================================================================
// OPTIONS & FILTERS
// ===================================================================

/**
 * Upload options
 */
export interface UploadOptions {
  // Post type filters
  includeResults: boolean;
  includePromotional: boolean;
  includeGeneral: boolean;
  
  // Legacy filter (for backward compatibility)
  onlyTournamentResults?: boolean;
  
  // Additional filters
  minConfidence: number;
  
  // Actions
  createGameRecords: boolean;
  skipDuplicates: boolean;
  dryRun: boolean;
  
  // Processing options (NEW)
  processingFlow?: ProcessingFlow;
  processingOptions?: ProcessingOptions;
}

/**
 * Post filter options for the UI
 */
export interface PostFilterOptions {
  // Type filters (checkboxes) - these work BEFORE processing using client-side hints
  showResults: boolean;
  showPromotional: boolean;
  showGeneral: boolean;
  showComments: boolean;
  
  // Status filters (NEW - for filtering AFTER processing)
  showPending?: boolean;
  showProcessed?: boolean;
  showLinked?: boolean;
  showFailed?: boolean;
  
  // Legacy filter (for backward compatibility)
  showOnlyTournamentResults?: boolean;
  
  // Additional filters
  minConfidence: number;
  hasVenueMatch: boolean | null;
  hasPlacements: boolean | null;
  hasMatch?: boolean | null;  // NEW - has game match candidates
  searchText: string;
}

/**
 * Post sort options
 */
export interface PostSortOptions {
  field: 'confidence' | 'postedAt' | 'engagement' | 'prizeAmount' | 'postType' | 'matchCount';
  direction: 'asc' | 'desc';
}

/**
 * Attachment stats for display
 */
export interface AttachmentStats {
  postsWithAttachments: number;
  totalAttachments: number;
  selectedWithAttachments: number;
  selectedAttachments: number;
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * Extract a date string from raw post data
 */
export const extractPostedDate = (post: RawFacebookPost): string => {
  if (post.postedAt && typeof post.postedAt === 'string') {
    return post.postedAt;
  }
  
  if (post.date && typeof post.date === 'string') {
    const parsed = new Date(post.date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  if (typeof post.timestamp === 'number') {
    return new Date(post.timestamp * 1000).toISOString();
  }
  
  if (post.extractedDate) {
    return post.extractedDate;
  }
  
  if (post.createdAt) {
    if (typeof post.createdAt === 'number') {
      return new Date(post.createdAt * 1000).toISOString();
    }
    if (typeof post.createdAt === 'string') {
      const parsed = new Date(post.createdAt);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
  }
  
  if (post.scrapedAt && typeof post.scrapedAt === 'string') {
    return post.scrapedAt;
  }
  
  return new Date().toISOString();
};

/**
 * Create content preview (first N chars)
 */
export const createContentPreview = (content: string, maxLength: number = 200): string => {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength).trim() + '...';
};

/**
 * Check if a post appears to be a comment (not a real post)
 * Simple client-side check - Lambda does full classification
 */
export const isLikelyComment = (post: RawFacebookPost): boolean => {
  if (post.post_id?.startsWith('post_')) return true;
  if (post.url?.includes('comment_id=')) return true;
  return false;
};

/**
 * Get display info for content type
 */
export const getContentTypeInfo = (contentType: ContentType): {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
} => {
  switch (contentType) {
    case 'RESULT':
      return {
        label: 'Result',
        color: 'text-green-700',
        bgColor: 'bg-green-100 border-green-200',
        icon: '🏆',
      };
    case 'PROMOTIONAL':
      return {
        label: 'Promotional',
        color: 'text-blue-700',
        bgColor: 'bg-blue-100 border-blue-200',
        icon: '📣',
      };
    case 'COMMENT':
      return {
        label: 'Comment',
        color: 'text-gray-700',
        bgColor: 'bg-gray-100 border-gray-200',
        icon: '💬',
      };
    case 'GENERAL':
    default:
      return {
        label: 'General',
        color: 'text-gray-700',
        bgColor: 'bg-gray-100 border-gray-200',
        icon: '📝',
      };
  }
};

/**
 * Get confidence badge styling
 */
export const getConfidenceBadge = (confidence: number): {
  label: string;
  color: string;
} => {
  if (confidence >= 80) return { label: 'High', color: 'bg-green-100 text-green-800' };
  if (confidence >= 60) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
  if (confidence >= 40) return { label: 'Low', color: 'bg-orange-100 text-orange-800' };
  return { label: 'Very Low', color: 'bg-red-100 text-red-800' };
};