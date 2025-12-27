// src/utils/socialPostParser.ts
// REFACTORED VERSION - Proper categorization: RESULT vs PROMOTIONAL vs GENERAL

import type {
  RawFacebookPost,
  ParsedSocialPost,
  PlacementResult,
  ExtractedPrize,
  ExtractedTournamentMetadata,
  VenueMatchResult,
  PatternMatch,
  ParseMultipleResult,
  ParseStats,
  PostType,
  PostTypeDetection,
} from '../types/socialPostUpload';

// ============ CONTENT PREPROCESSING ============

/**
 * Strip URLs from content to prevent URL query params from affecting pattern matching
 */
const stripUrls = (content: string): string => {
  return content
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/with a Photo:?\s*/gi, '')
    .trim();
};

/**
 * Check if a post is actually a comment (not a real post)
 */
export const isCommentPost = (post: RawFacebookPost): boolean => {
  // Check 1: post_id starts with "post_" (generated ID from scraper)
  if (post.post_id?.startsWith('post_')) {
    return true;
  }
  
  // Check 2: URL contains comment_id parameter
  if (post.url?.includes('comment_id=')) {
    return true;
  }
  
  return false;
};

// ============ POST TYPE PATTERNS ============

/**
 * RESULT patterns - indicate a completed tournament with results
 */
const RESULT_PATTERNS = {
  high: {
    // "1st: $X,XXX" or "1st place - $X,XXX"
    placementWithPrize: /(?:1st|first)\s*(?:place)?[:\s\-–]*\$[\d,]+/i,
    // Multiple placements in sequence
    multiplePlacements: /(?:1st|🥇).*(?:2nd|🥈).*(?:3rd|🥉)/is,
    // Winner with name and prize
    winnerWithPrize: /(?:winner|champion)[:\s\-–]+[A-Z][a-zA-Z]+.*\$[\d,]+/i,
    // Podium emoji sequence
    podiumEmojis: /🥇.*🥈/s,
    // Trophy with prize amount
    trophyWithPrize: /🏆.*\$[\d,]+/s,
    // "Congratulations to [Name] for winning"
    congratsWinner: /congrat(?:s|ulations)\s+(?:to\s+)?[A-Z][a-zA-Z]+.*(?:win|tak|chop)/i,
  },
  medium: {
    congratulations: /congrat(?:s|ulations)/i,
    winnerMention: /\b(?:winner|champion)\b/i,
    resultsMention: /\bresults?\b/i,
    chopMention: /\bchop(?:ped)?\b/i,
    icmDealMention: /\bicm\s*deal\b/i,
    placementMention: /(?:1st|2nd|3rd|first|second|third)\s*(?:place)?/i,
    walkedAwayWith: /walk(?:ed|ing)?\s+away\s+with/i,
    tookDown: /t(?:ook|akes?)\s+down/i,
    finalTableMention: /final\s*table/i,
    entriesMention: /\d+\s*(?:entries|runners|players)/i,
  }
};

/**
 * PROMOTIONAL patterns - indicate an upcoming tournament announcement
 */
const PROMOTIONAL_PATTERNS = {
  high: {
    upcomingDay: /(?:this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    joinUs: /join\s+us/i,
    buyInAnnouncement: /buy-?in\s*:/i,
    unlimitedReentries: /unlimited\s+re-?entr/i,
    lateRegistration: /late\s+reg(?:istration)?/i,
    entryPriceFormat: /\$\d+\s+(?:entry|to\s+play)/i,
    startsAt: /starts?\s+(?:at|@|time)/i,
    signUpRegister: /sign\s*up|register\s+(?:now|today|here)/i,
  },
  medium: {
    guaranteedMention: /\bgtd\b|guaranteed/i,
    prizePoolMention: /prize\s*pool/i,
    stackInfo: /\d+k?\s*stack/i,
    levelInfo: /\d+\s*min(?:ute)?\s*levels?/i,
    makeItThere: /make\s+sure\s+you(?:'re|\s+are)/i,
    upcomingWeek: /(?:this|next)\s+(?:week|weekend)/i,
    scheduleMention: /schedule|upcoming|coming\s+up/i,
  }
};

// ============ POST TYPE DETECTION ============

/**
 * Detect the type of post (RESULT, PROMOTIONAL, or GENERAL)
 */
export const detectPostType = (content: string): PostTypeDetection => {
  if (!content || typeof content !== 'string') {
    return {
      postType: 'GENERAL',
      confidence: 0,
      resultScore: 0,
      promoScore: 0,
      resultMatches: [],
      promoMatches: [],
    };
  }

  const cleanContent = stripUrls(content);
  
  let resultScore = 0;
  let promoScore = 0;
  const resultMatches: PatternMatch[] = [];
  const promoMatches: PatternMatch[] = [];

  // Check RESULT patterns
  for (const [name, pattern] of Object.entries(RESULT_PATTERNS.high)) {
    if (pattern.test(cleanContent)) {
      resultScore += 3;
      resultMatches.push({ type: 'high', name });
    }
  }
  for (const [name, pattern] of Object.entries(RESULT_PATTERNS.medium)) {
    if (pattern.test(cleanContent)) {
      resultScore += 1;
      resultMatches.push({ type: 'medium', name });
    }
  }

  // Check PROMOTIONAL patterns
  for (const [name, pattern] of Object.entries(PROMOTIONAL_PATTERNS.high)) {
    if (pattern.test(cleanContent)) {
      promoScore += 3;
      promoMatches.push({ type: 'high', name });
    }
  }
  for (const [name, pattern] of Object.entries(PROMOTIONAL_PATTERNS.medium)) {
    if (pattern.test(cleanContent)) {
      promoScore += 1;
      promoMatches.push({ type: 'medium', name });
    }
  }

  // Determine primary type based on scores
  let postType: PostType = 'GENERAL';
  let confidence = 0;

  if (resultScore >= 3 && resultScore > promoScore) {
    // Clear result post
    postType = 'RESULT';
    confidence = Math.min(100, resultScore * 12);
  } else if (promoScore >= 3 && promoScore > resultScore) {
    // Clear promotional post
    postType = 'PROMOTIONAL';
    confidence = Math.min(100, promoScore * 12);
  } else if (resultScore >= 3 && promoScore >= 3) {
    // Mixed signals - result posts often mention upcoming events
    // Favor RESULT if scores are close since results are more valuable
    postType = resultScore >= promoScore ? 'RESULT' : 'PROMOTIONAL';
    confidence = Math.min(100, Math.max(resultScore, promoScore) * 10);
  }

  return {
    postType,
    confidence,
    resultScore,
    promoScore,
    resultMatches,
    promoMatches,
  };
};

// ============ EXTRACTION FUNCTIONS ============

/**
 * Extract prize amounts from text
 */
export const extractPrizes = (content: string): ExtractedPrize[] => {
  const prizes: ExtractedPrize[] = [];
  const prizePattern = /\$[\d,]+(?:\.\d{2})?/g;
  const matches = content.match(prizePattern) || [];

  matches.forEach((match) => {
    const amount = parseFloat(match.replace(/[$,]/g, ''));
    if (amount > 0 && amount < 10000000) {
      const idx = content.indexOf(match);
      const context = content
        .substring(Math.max(0, idx - 30), Math.min(content.length, idx + match.length + 30))
        .trim();

      prizes.push({ amount, raw: match, context });
    }
  });

  prizes.sort((a, b) => b.amount - a.amount);
  return prizes;
};

/**
 * Extract placement results
 */
export const extractPlacements = (content: string): PlacementResult[] => {
  const placements: PlacementResult[] = [];

  const placeMap: Record<string, number> = {
    '1st': 1, 'first': 1, '🥇': 1, 'winner': 1, 'champion': 1,
    '2nd': 2, 'second': 2, '🥈': 2,
    '3rd': 3, 'third': 3, '🥉': 3,
    '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
  };

  // Pattern: "1st: John Smith – $1,234"
  const pattern1 = /(?<place>1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|first|second|third)[:\s\-–]+(?<name>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:\s+[A-Z][a-zA-Z]+)?)[:\s\-–]*(?<prize>\$[\d,]+)?/gi;
  
  let match;
  while ((match = pattern1.exec(content)) !== null) {
    const groups = match.groups || {};
    const placeKey = (groups.place || '').toLowerCase();
    const place = placeMap[placeKey] || 0;

    if (place > 0 && groups.name) {
      const prizeAmount = groups.prize
        ? parseFloat(groups.prize.replace(/[$,]/g, ''))
        : null;

      if (!placements.find((p) => p.place === place && p.name === groups.name)) {
        placements.push({
          place,
          name: groups.name.trim(),
          prize: prizeAmount,
          prizeRaw: groups.prize || null,
        });
      }
    }
  }

  // Pattern: "🥇 John Smith $1,234"
  const pattern2 = /(?<emoji>🥇|🥈|🥉)\s*(?<name>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)[:\s\-–]*(?<prize>\$[\d,]+)?/g;
  
  while ((match = pattern2.exec(content)) !== null) {
    const groups = match.groups || {};
    const place = placeMap[groups.emoji || ''] || 0;

    if (place > 0 && groups.name) {
      const prizeAmount = groups.prize
        ? parseFloat(groups.prize.replace(/[$,]/g, ''))
        : null;

      if (!placements.find((p) => p.place === place)) {
        placements.push({
          place,
          name: groups.name.trim(),
          prize: prizeAmount,
          prizeRaw: groups.prize || null,
        });
      }
    }
  }

  placements.sort((a, b) => a.place - b.place);
  return placements;
};

/**
 * Extract tournament metadata
 */
export const extractTournamentMetadata = (content: string): ExtractedTournamentMetadata => {
  const metadata: ExtractedTournamentMetadata = {};

  // Entries/runners/players count
  const entriesMatch = content.match(/(\d+)\s*(?:entries|runners|players|entrants)/i);
  if (entriesMatch) {
    metadata.entries = parseInt(entriesMatch[1]);
  }

  // Buy-in amount
  const buyInPatterns = [
    /\$(\d+)\s*(?:buy-?in|entry)/i,
    /buy-?in[:\s]*\$(\d+)/i,
  ];
  for (const pattern of buyInPatterns) {
    const match = content.match(pattern);
    if (match) {
      metadata.buyIn = parseInt(match[1]);
      break;
    }
  }

  // Prize pool / GTD
  const prizePoolPatterns = [
    /prize\s*pool[:\s]*\$?([\d,]+)/i,
    /\$?([\d,]+)\s*(?:prize\s*pool|gtd|guaranteed)/i,
  ];
  for (const pattern of prizePoolPatterns) {
    const match = content.match(pattern);
    if (match) {
      metadata.prizePool = parseInt(match[1].replace(/,/g, ''));
      break;
    }
  }

  // Game type detection
  const gameTypes: Record<string, RegExp> = {
    'NLH': /\bnl(?:h|he)?\b|no\s*limit\s*hold\s*?em/i,
    'PLO': /\bplo\b|pot\s*limit\s*omaha/i,
    'PLO8': /\bplo\s*8\b|omaha\s*(?:hi[\/\-]?lo|8)/i,
    'Mixed': /\bmixed\b|h\.?o\.?r\.?s\.?e\.?/i,
    'Bounty': /\bbounty\b|knockout|progressive/i,
    'Turbo': /\bturbo\b|hyper/i,
    'Deepstack': /\bdeep\s*stack\b/i,
  };

  const detectedTypes: string[] = [];
  for (const [type, pattern] of Object.entries(gameTypes)) {
    if (pattern.test(content)) {
      detectedTypes.push(type);
    }
  }
  metadata.gameTypes = detectedTypes;

  // Event number
  const eventMatch = content.match(/event\s*#?\s*(\d+)/i);
  if (eventMatch) {
    metadata.eventNumber = parseInt(eventMatch[1]);
  }

  // Tournament name
  const namePatterns = [
    /(?:the\s+)?([A-Z][a-zA-Z\s]+(?:Championship|Classic|Series|Open|Festival|Main\s*Event|Cup))/,
    /"([^"]+)"/,
  ];
  for (const pattern of namePatterns) {
    const match = content.match(pattern);
    if (match && match[1].length > 5 && match[1].length < 100) {
      metadata.tournamentName = match[1].trim();
      break;
    }
  }

  return metadata;
};

/**
 * Common venue patterns for client-side matching
 */
const COMMON_VENUE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /the\s*star/i, name: 'The Star' },
  { pattern: /crown\s*(?:casino|melbourne|perth)?/i, name: 'Crown' },
  { pattern: /sky\s*city/i, name: 'Sky City' },
  { pattern: /treasury/i, name: 'Treasury' },
  { pattern: /the\s*reef/i, name: 'The Reef' },
  { pattern: /kings?\s*(?:room|casino|poker)/i, name: 'Kings Room' },
  { pattern: /manly\s*leagues/i, name: 'Manly Leagues' },
  { pattern: /st\.?\s*george\s*leagues/i, name: 'St George Leagues' },
  { pattern: /aria/i, name: 'Aria' },
  { pattern: /bellagio/i, name: 'Bellagio' },
  { pattern: /venetian/i, name: 'Venetian' },
  { pattern: /wynn/i, name: 'Wynn' },
];

/**
 * Simple venue detection for client-side preview
 */
export const detectVenueSimple = (content: string): VenueMatchResult | null => {
  for (const { pattern, name } of COMMON_VENUE_PATTERNS) {
    if (pattern.test(content)) {
      return { name, confidence: 0.8 };
    }
  }
  return null;
};

// ============ DATE EXTRACTION ============

/**
 * Extract the posted date from a raw post
 * Handles all the different date field formats from Facebook scrapers
 */
export const extractPostedDate = (post: RawFacebookPost): string => {
  // Priority 1: postedAt as ISO string
  if (post.postedAt && typeof post.postedAt === 'string') {
    return post.postedAt;
  }
  
  // Priority 2: postedAt as number (unix timestamp)
  if (typeof post.postedAt === 'number') {
    return new Date(post.postedAt * 1000).toISOString();
  }
  
  // Priority 3: createdAt as number (unix timestamp)
  if (typeof post.createdAt === 'number') {
    return new Date(post.createdAt * 1000).toISOString();
  }
  
  // Priority 4: createdAt as string
  if (post.createdAt && typeof post.createdAt === 'string') {
    const parsed = new Date(post.createdAt);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  // Priority 5: timestamp field (legacy)
  if (typeof post.timestamp === 'number') {
    return new Date(post.timestamp * 1000).toISOString();
  }
  
  // Priority 6: extractedDate (fallback)
  if (post.extractedDate) {
    return post.extractedDate;
  }
  
  // Priority 7: scrapedAt (last resort)
  if (post.scrapedAt && typeof post.scrapedAt === 'string') {
    return post.scrapedAt;
  }
  
  // Fallback: current time
  return new Date().toISOString();
};

// ============ MAIN PARSE FUNCTION ============

export interface ParseOptions {
  includeRawPatterns?: boolean;
  venueList?: Array<{ id: string; name: string; aliases?: string[] }>;
  skipComments?: boolean;
}

/**
 * Parse a social post and extract all relevant data
 */
export const parseSocialPost = (
  post: RawFacebookPost,
  options: ParseOptions = {}
): ParsedSocialPost => {
  const content = post.content || '';
  const { includeRawPatterns = false } = options;

  // Step 1: Detect post type
  const typeDetection = detectPostType(content);
  const isComment = isCommentPost(post);

  // Step 2: Extract data
  const prizes = extractPrizes(content);
  const placements = extractPlacements(content);
  const metadata = extractTournamentMetadata(content);
  const venueMatch = detectVenueSimple(content);

  // Step 3: Calculate derived fields
  const firstPlacePrize =
    placements.find((p) => p.place === 1)?.prize ||
    (prizes.length > 0 ? prizes[0].amount : null);

  const totalPrizesPaid = prizes.reduce((sum, p) => sum + p.amount, 0);

  // Step 4: Generate classification tags
  const tags: string[] = [];
  
  // Type tags
  if (typeDetection.postType === 'RESULT') tags.push('tournament-result');
  if (typeDetection.postType === 'PROMOTIONAL') tags.push('promotional');
  if (isComment) tags.push('is-comment');
  
  // Content tags
  if (placements.length > 0) tags.push('has-placements');
  if (metadata.entries) tags.push('has-entries');
  if (metadata.prizePool) tags.push('has-prize-pool');
  if (metadata.gameTypes?.includes('Bounty')) tags.push('bounty');
  if (metadata.gameTypes?.includes('NLH')) tags.push('nlh');
  if (metadata.gameTypes?.includes('PLO')) tags.push('plo');
  if (venueMatch) tags.push('venue-detected');

  // Step 5: Build result
  const result: ParsedSocialPost = {
    postId: post.post_id,
    url: post.url,
    content: content,
    author: post.author,
    postedAt: extractPostedDate(post),

    // Type classification
    postType: isComment ? 'COMMENT' : typeDetection.postType,
    confidence: typeDetection.confidence,
    
    // Legacy compatibility
    isTournamentResult: typeDetection.postType === 'RESULT',
    isPromotional: typeDetection.postType === 'PROMOTIONAL',
    isComment,

    // Extracted data
    placements,
    prizes,
    metadata,

    // Derived fields
    firstPlacePrize,
    totalPrizesPaid,
    entriesCount: metadata.entries || null,
    buyInAmount: metadata.buyIn || null,
    prizePoolAmount: metadata.prizePool || null,
    tournamentName: metadata.tournamentName || null,
    gameTypes: metadata.gameTypes || [],

    venueMatch,
    tags,

    // Media
    imageCount: post.images?.length || post._attachments?.length || 0,
    images: post.images || [],

    // Engagement
    likeCount: post.reactionsCount || 0,
    commentCount: post.commentCount || 0,
    shareCount: post.shareCount || 0,
  };

  if (includeRawPatterns) {
    result.matchedPatterns = [
      ...typeDetection.resultMatches.map(m => ({ ...m, category: 'result' as const })),
      ...typeDetection.promoMatches.map(m => ({ ...m, category: 'promo' as const })),
    ];
    result.typeScores = {
      result: typeDetection.resultScore,
      promo: typeDetection.promoScore,
    };
  }

  return result;
};

/**
 * Parse multiple posts and return categorized results
 */
export const parseMultiplePosts = (
  posts: RawFacebookPost[],
  options: ParseOptions = {}
): ParseMultipleResult => {
  const { skipComments = true } = options;
  
  // Parse all posts
  const allParsed = posts.map((post) => parseSocialPost(post, options));
  
  // Separate comments
  const comments = allParsed.filter((p) => p.isComment);
  const realPosts = allParsed.filter((p) => !p.isComment);
  
  // Categorize real posts
  const tournamentResults = realPosts
    .filter((p) => p.postType === 'RESULT')
    .sort((a, b) => b.confidence - a.confidence);

  const promotionalPosts = realPosts
    .filter((p) => p.postType === 'PROMOTIONAL')
    .sort((a, b) => b.confidence - a.confidence);

  const generalPosts = realPosts
    .filter((p) => p.postType === 'GENERAL')
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  const stats: ParseStats = {
    totalPosts: posts.length,
    realPosts: realPosts.length,
    tournamentResults: tournamentResults.length,
    promotionalPosts: promotionalPosts.length,
    generalPosts: generalPosts.length,
    otherPosts: generalPosts.length, // Alias for backward compatibility
    skippedComments: comments.length,
    postsWithPlacements: realPosts.filter((p) => p.placements.length > 0).length,
    postsWithPrizes: realPosts.filter((p) => p.prizes.length > 0).length,
    postsWithVenue: realPosts.filter((p) => p.venueMatch).length,
    avgResultConfidence:
      tournamentResults.length > 0
        ? tournamentResults.reduce((sum, p) => sum + p.confidence, 0) / tournamentResults.length
        : 0,
    avgPromoConfidence:
      promotionalPosts.length > 0
        ? promotionalPosts.reduce((sum, p) => sum + p.confidence, 0) / promotionalPosts.length
        : 0,
  };

  return {
    tournamentResults,
    promotionalPosts,
    generalPosts,
    comments: skipComments ? [] : comments,
    allPosts: skipComments ? realPosts : allParsed,
    stats,
  };
};

// ============ UTILITY FUNCTIONS ============

/**
 * Format confidence as a color class
 */
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 75) return 'text-green-600 bg-green-50';
  if (confidence >= 50) return 'text-yellow-600 bg-yellow-50';
  if (confidence >= 25) return 'text-orange-600 bg-orange-50';
  return 'text-gray-600 bg-gray-50';
};

/**
 * Format confidence as badge variant
 */
export const getConfidenceBadge = (confidence: number): {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'default';
} => {
  if (confidence >= 75) return { label: 'High', variant: 'success' };
  if (confidence >= 50) return { label: 'Medium', variant: 'warning' };
  if (confidence >= 25) return { label: 'Low', variant: 'error' };
  return { label: 'None', variant: 'default' };
};

/**
 * Get display info for post type
 */
export const getPostTypeInfo = (postType: PostType): {
  label: string;
  color: string;
  icon: string;
  description: string;
} => {
  switch (postType) {
    case 'RESULT':
      return {
        label: 'Tournament Result',
        color: 'text-green-700 bg-green-100 border-green-200',
        icon: '🏆',
        description: 'Post announcing tournament winners and placements',
      };
    case 'PROMOTIONAL':
      return {
        label: 'Promotional',
        color: 'text-blue-700 bg-blue-100 border-blue-200',
        icon: '📣',
        description: 'Post promoting an upcoming tournament',
      };
    case 'COMMENT':
      return {
        label: 'Comment',
        color: 'text-gray-700 bg-gray-100 border-gray-200',
        icon: '💬',
        description: 'This appears to be a comment, not a post',
      };
    case 'GENERAL':
    default:
      return {
        label: 'General',
        color: 'text-gray-700 bg-gray-100 border-gray-200',
        icon: '📝',
        description: 'General post (not categorized)',
      };
  }
};