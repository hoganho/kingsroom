// src/types/socialPostUpload.ts

/**
 * Raw post data from Chrome extension (post.json)
 */
export interface RawFacebookPost {
  post_id: string;
  storyId?: string | null;
  feedbackId?: string | null;
  content: string;
  url: string;
  mbasicUrl?: string | null;
  author: {
    id?: string | null;
    name: string;
    avatar?: string | null;
    profile?: string | null;
  };
  reactionsCount: number;
  shareCount: number;
  commentCount: number;
  comments: Array<{
    author: { name: string; profile?: string | null };
    text: string;
    time?: string | null;
  }>;
  attachedStoryAttachments?: unknown;
  attachmentsDetails: Array<{
    id: string;
    href: string;
    caption?: string;
    localPath?: string | null;
    createdAt?: string | null;
    accessibilityCaption?: string | null;
  }>;
  _attachments?: string[];
  images: string[];
  timestamp: number;
  extractedDate: string;
  extractionMethod: string;
  folderName: string;
  parentFolder?: string | null;
}

/**
 * Placement result from a tournament
 */
export interface PlacementResult {
  place: number;
  name: string;
  prize: number | null;
  prizeRaw: string | null;
}

/**
 * Prize extraction result
 */
export interface ExtractedPrize {
  amount: number;
  raw: string;
  context: string;
}

/**
 * Tournament metadata extracted from post
 */
export interface ExtractedTournamentMetadata {
  entries?: number;
  buyIn?: number;
  prizePool?: number;
  gameTypes?: string[];
  eventNumber?: number;
  tournamentName?: string;
  mentionedDate?: string;
}

/**
 * Venue match result
 */
export interface VenueMatchResult {
  name: string;
  confidence: number;
  venueId?: string;
}

/**
 * Pattern match for debugging
 */
export interface PatternMatch {
  type: 'high' | 'medium' | 'negative';
  name: string;
}

/**
 * Parsed social post with all extracted data
 */
export interface ParsedSocialPost {
  // Original post reference
  postId: string;
  url: string;
  content: string;
  author: RawFacebookPost['author'];
  postedAt: string;
  
  // Detection results
  isTournamentResult: boolean;
  confidence: number;
  
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
  
  // Matching
  venueMatch: VenueMatchResult | null;
  
  // Classification
  tags: string[];
  
  // Media
  imageCount: number;
  images: string[];
  
  // Engagement
  likeCount: number;
  commentCount: number;
  shareCount: number;
  
  // Debug (optional)
  matchedPatterns?: PatternMatch[];
  
  // Upload state (frontend only)
  _uploadStatus?: 'pending' | 'uploading' | 'success' | 'error' | 'skipped';
  _uploadError?: string;
  _savedPostId?: string;
  _savedGameId?: string;
}

/**
 * Stats from parsing multiple posts
 */
export interface ParseStats {
  totalPosts: number;
  tournamentResults: number;
  otherPosts: number;
  postsWithPlacements: number;
  postsWithPrizes: number;
  postsWithVenue: number;
  avgConfidence: number;
}

/**
 * Result of parsing multiple posts
 */
export interface ParseMultipleResult {
  tournamentResults: ParsedSocialPost[];
  otherPosts: ParsedSocialPost[];
  allPosts: ParsedSocialPost[];
  stats: ParseStats;
}

/**
 * Upload options
 */
export interface UploadOptions {
  // Which posts to upload
  onlyTournamentResults: boolean;
  minConfidence: number;
  
  // Social account to associate
  socialAccountId: string;
  entityId: string;
  
  // Game creation options
  createGameRecords: boolean;
  linkToExistingGames: boolean;
  
  // Behavior
  skipDuplicates: boolean;
  dryRun: boolean;
}

/**
 * Upload result for a single post
 */
export interface SingleUploadResult {
  postId: string;
  success: boolean;
  socialPostId?: string;
  gameId?: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
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
}

/**
 * Folder info from file system
 */
export interface ScrapedFolder {
  name: string;
  path: string;
  postCount: number;
  dateRange?: {
    earliest: string;
    latest: string;
  };
}

/**
 * Post for review in UI
 */
export interface ReviewablePost extends ParsedSocialPost {
  // UI state
  isSelected: boolean;
  isExpanded: boolean;
  
  // Editable fields (before save)
  editedVenueId?: string;
  editedTournamentName?: string;
  editedIsTournamentResult?: boolean;
  
  // Raw data reference
  rawPost: RawFacebookPost;
}

/**
 * Filter options for post list
 */
export interface PostFilterOptions {
  showOnlyTournamentResults: boolean;
  minConfidence: number;
  hasVenueMatch: boolean | null;
  hasPlacements: boolean | null;
  searchText: string;
}

/**
 * Sort options for post list
 */
export type PostSortField = 'postedAt' | 'confidence' | 'engagement' | 'prizeAmount';
export type PostSortDirection = 'asc' | 'desc';

export interface PostSortOptions {
  field: PostSortField;
  direction: PostSortDirection;
}
