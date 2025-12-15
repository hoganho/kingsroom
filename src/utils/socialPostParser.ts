// src/utils/socialPostParser.ts

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
} from '../types/socialPostUpload';

// ============ TOURNAMENT RESULT DETECTION ============

/**
 * High-confidence patterns - presence of any 1 is strong signal
 */
const HIGH_CONFIDENCE_PATTERNS: Record<string, RegExp> = {
  // "1st: $X,XXX" or "1st place - $X,XXX" or "1st $X,XXX"
  placementWithPrize: /(?:1st|first)\s*(?:place)?[:\s\-–]*\$[\d,]+/i,
  
  // Multiple placements in sequence (very strong signal)
  multiplePlacements: /(?:1st|🥇).*(?:2nd|🥈).*(?:3rd|🥉)/is,
  
  // Winner with name and prize
  winnerWithPrize: /(?:winner|champion)[:\s\-–]+[A-Z][a-zA-Z]+.*\$[\d,]+/i,
  
  // Podium emoji sequence
  podiumEmojis: /🥇.*🥈/s,
  
  // Trophy with prize amount
  trophyWithPrize: /🏆.*\$[\d,]+/s,
  
  // "Congratulations to [Name] for winning"
  congratsWinner: /congrat(?:s|ulations)\s+(?:to\s+)?[A-Z][a-zA-Z]+.*(?:win|tak|chop)/i,
};

/**
 * Medium-confidence patterns - need 2+ to be confident
 */
const MEDIUM_CONFIDENCE_PATTERNS: Record<string, RegExp> = {
  // General congratulations
  congratulations: /congrat(?:s|ulations)/i,
  
  // Winner/Champion mention
  winnerMention: /\b(?:winner|champion)\b/i,
  
  // Prize pool mention
  prizePoolMention: /prize\s*pool/i,
  
  // GTD/Guaranteed
  guaranteedMention: /\bgtd\b|guaranteed/i,
  
  // Entries/runners count
  entriesMention: /\d+\s*(?:entries|runners|players)/i,
  
  // Final table
  finalTableMention: /final\s*table/i,
  
  // Results word
  resultsMention: /\bresults?\b/i,
  
  // Chop mention
  chopMention: /\bchop(?:ped)?\b/i,
  
  // Specific placements without prize (weaker)
  placementMention: /(?:1st|2nd|3rd|first|second|third)\s*(?:place)?/i,
  
  // Dollar amounts (multiple)
  multipleDollarAmounts: /\$[\d,]+.*\$[\d,]+/s,
  
  // 🎉 or 👏 with dollar amount
  celebrationWithMoney: /[🎉👏🎊].*\$[\d,]+/s,
};

/**
 * Negative patterns - reduce confidence
 */
const NEGATIVE_PATTERNS: Record<string, RegExp> = {
  // Upcoming tournament announcement
  upcomingTournament: /(?:this|next)\s+(?:week|weekend|saturday|sunday|monday)/i,
  
  // Registration/signup
  registrationOpen: /register|sign\s*up|buy-?in\s+(?:is|now)/i,
  
  // Schedule announcement
  scheduleMention: /schedule|upcoming|coming\s+up/i,
  
  // "Starts at" or "Starting"
  startsAt: /starts?\s+(?:at|@)/i,
  
  // Question marks (likely asking, not announcing)
  hasQuestion: /\?/,
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
  { pattern: /aria/i, name: 'Aria' },
  { pattern: /bellagio/i, name: 'Bellagio' },
  { pattern: /venetian/i, name: 'Venetian' },
  { pattern: /wynn/i, name: 'Wynn' },
];

// ============ DETECTION FUNCTIONS ============

/**
 * Detect if a post is about tournament results
 */
export const detectTournamentResult = (content: string): {
  isTournamentResult: boolean;
  confidence: number;
  score: number;
  matchedPatterns: PatternMatch[];
} => {
  if (!content || typeof content !== 'string') {
    return { isTournamentResult: false, confidence: 0, score: 0, matchedPatterns: [] };
  }

  const matchedPatterns: PatternMatch[] = [];
  let score = 0;

  // Check high-confidence patterns (each worth 3 points)
  for (const [name, pattern] of Object.entries(HIGH_CONFIDENCE_PATTERNS)) {
    if (pattern.test(content)) {
      matchedPatterns.push({ type: 'high', name });
      score += 3;
    }
  }

  // Check medium-confidence patterns (each worth 1 point)
  for (const [name, pattern] of Object.entries(MEDIUM_CONFIDENCE_PATTERNS)) {
    if (pattern.test(content)) {
      matchedPatterns.push({ type: 'medium', name });
      score += 1;
    }
  }

  // Check negative patterns (each subtracts 2 points)
  for (const [name, pattern] of Object.entries(NEGATIVE_PATTERNS)) {
    if (pattern.test(content)) {
      matchedPatterns.push({ type: 'negative', name });
      score -= 2;
    }
  }

  // Score >= 3: High confidence tournament result
  const isTournamentResult = score >= 3;
  const confidence = Math.min(100, Math.max(0, score * 15)); // 0-100 scale

  return {
    isTournamentResult,
    confidence,
    score,
    matchedPatterns,
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

  // Pattern: "1st: John Smith - $1,234"
  const pattern1 = /(?<place>1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|first|second|third)[:\s\-–]+(?<name>[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)[:\s\-–]*(?<prize>\$[\d,]+)?/gi;
  
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

  // Prize pool
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
    /(?:the\s+)?([A-Z][a-zA-Z\s]+(?:Championship|Classic|Series|Open|Festival|Main\s*Event))/,
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

// ============ MAIN PARSE FUNCTION ============

export interface ParseOptions {
  includeRawPatterns?: boolean;
  venueList?: Array<{ id: string; name: string; aliases?: string[] }>;
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

  // Step 1: Detect if tournament result
  const detection = detectTournamentResult(content);

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
  if (detection.isTournamentResult) tags.push('tournament-result');
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
    postedAt: post.timestamp
      ? new Date(post.timestamp * 1000).toISOString()
      : post.extractedDate,

    isTournamentResult: detection.isTournamentResult,
    confidence: detection.confidence,

    placements,
    prizes,
    metadata,

    firstPlacePrize,
    totalPrizesPaid,
    entriesCount: metadata.entries || null,
    buyInAmount: metadata.buyIn || null,
    prizePoolAmount: metadata.prizePool || null,
    tournamentName: metadata.tournamentName || null,
    gameTypes: metadata.gameTypes || [],

    venueMatch,
    tags,

    imageCount: post.images?.length || 0,
    images: post.images || [],

    likeCount: post.reactionsCount || 0,
    commentCount: post.commentCount || 0,
    shareCount: post.shareCount || 0,
  };

  if (includeRawPatterns) {
    result.matchedPatterns = detection.matchedPatterns;
  }

  return result;
};

/**
 * Parse multiple posts and return sorted by relevance
 */
export const parseMultiplePosts = (
  posts: RawFacebookPost[],
  options: ParseOptions = {}
): ParseMultipleResult => {
  const parsed = posts.map((post) => parseSocialPost(post, options));

  const tournamentResults = parsed
    .filter((p) => p.isTournamentResult)
    .sort((a, b) => b.confidence - a.confidence);

  const otherPosts = parsed
    .filter((p) => !p.isTournamentResult)
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  const stats: ParseStats = {
    totalPosts: posts.length,
    tournamentResults: tournamentResults.length,
    otherPosts: otherPosts.length,
    postsWithPlacements: parsed.filter((p) => p.placements.length > 0).length,
    postsWithPrizes: parsed.filter((p) => p.prizes.length > 0).length,
    postsWithVenue: parsed.filter((p) => p.venueMatch).length,
    avgConfidence:
      tournamentResults.length > 0
        ? tournamentResults.reduce((sum, p) => sum + p.confidence, 0) / tournamentResults.length
        : 0,
  };

  return {
    tournamentResults,
    otherPosts,
    allPosts: parsed,
    stats,
  };
};

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
