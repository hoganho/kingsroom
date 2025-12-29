/**
 * matching/postFinder.js
 * Find candidate social posts for a game
 * 
 * This is the "reverse" of gameMatcher.js:
 * - gameMatcher: post data → find matching games
 * - postFinder: game → find matching posts
 * 
 * MATCHING STRATEGY:
 * 1. Tournament ID → Direct post lookup (golden signal)
 * 2. Venue + Date range → Posts with that venue in date window
 * 3. Date range only → Broader search
 * 4. Score all candidates using scoringEngine
 */

const { 
  querySocialPostsByDateRange,
  querySocialPostsByVenueAndDate,
  querySocialPostsByTournamentId,
  getExtractionBySocialPost,
  getSocialPost,
  getVenue
} = require('../utils/graphql');
const { calculateMatchScore, rankCandidates, formatSignalsForResponse, THRESHOLDS } = require('./scoringEngine');

// ===================================================================
// DATE UTILITIES
// ===================================================================

/**
 * Calculate search date range for finding posts around a game
 * 
 * Social posts about a game typically appear:
 * - Promotional: 1-14 days BEFORE the game
 * - Results: 0-3 days AFTER the game
 * 
 * @param {string} gameDate - Game start date (ISO string)
 * @param {Object} options - Range options
 * @returns {Object} { searchStart, searchEnd }
 */
const getPostSearchRange = (gameDate, options = {}) => {
  const {
    daysBefore = 14,  // Promotional posts can be 2 weeks early
    daysAfter = 3     // Results usually posted within 3 days
  } = options;
  
  if (!gameDate) {
    // Fallback to last 30 days if no date
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      searchStart: start.toISOString(),
      searchEnd: end.toISOString()
    };
  }
  
  const baseDate = new Date(gameDate);
  
  const startDate = new Date(baseDate);
  startDate.setDate(startDate.getDate() - daysBefore);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = new Date(baseDate);
  endDate.setDate(endDate.getDate() + daysAfter);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    searchStart: startDate.toISOString(),
    searchEnd: endDate.toISOString()
  };
};

/**
 * Calculate days between two dates
 */
const daysBetween = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// ===================================================================
// POST ELIGIBILITY
// ===================================================================

// Post statuses eligible for matching
const ELIGIBLE_POST_STATUSES = [
  'EXTRACTED',      // Has extraction data, not yet matched
  'MATCHED',        // Matched but may have more games
  'LINKED',         // Already linked, but could link to additional games
  'MANUAL_REVIEW'   // Awaiting review
];

// Content types eligible for matching
const ELIGIBLE_CONTENT_TYPES = ['RESULT', 'PROMOTIONAL'];

/**
 * Check if a post is eligible for matching
 */
const isPostEligible = (post, extraction) => {
  if (!post) return { eligible: false, reason: 'no_post' };
  
  // Check status
  if (!ELIGIBLE_POST_STATUSES.includes(post.processingStatus)) {
    return { eligible: false, reason: `status_${post.processingStatus}` };
  }
  
  // Check content type
  const contentType = extraction?.contentType || post.contentType;
  if (!ELIGIBLE_CONTENT_TYPES.includes(contentType)) {
    return { eligible: false, reason: `content_type_${contentType}` };
  }
  
  // Must have some extraction data to score
  if (!extraction) {
    return { eligible: false, reason: 'no_extraction' };
  }
  
  return { eligible: true, reason: 'ok' };
};

// ===================================================================
// MAIN MATCHING FUNCTION
// ===================================================================

/**
 * Find matching social posts for a game
 * 
 * @param {Object} game - Game record
 * @param {Object} options - Search options
 * @returns {Object} { candidates, candidatesFound, matchContext }
 */
const findMatchingPosts = async (game, options = {}) => {
  const {
    maxCandidates = 100,
    excludePostIds = [],
    daysBefore = 14,
    daysAfter = 3
  } = options;
  
  console.log('[POST-FINDER] Starting post search for game...');
  console.log('[POST-FINDER] Game:', {
    id: game.id,
    name: game.name,
    date: game.gameStartDateTime,
    venueId: game.venueId,
    tournamentId: game.tournamentId,
    buyIn: game.buyIn
  });
  
  const excludeSet = new Set(excludePostIds);
  let allCandidatePosts = [];
  let matchMethod = 'none';
  
  // =========================================================================
  // PATH 1: Tournament ID Match (highest confidence)
  // =========================================================================
  if (game.tournamentId) {
    console.log(`[POST-FINDER] Searching by tournament ID: ${game.tournamentId}`);
    
    const tournamentPosts = await querySocialPostsByTournamentId(game.tournamentId);
    
    if (tournamentPosts && tournamentPosts.length > 0) {
      console.log(`[POST-FINDER] Found ${tournamentPosts.length} posts by tournament ID`);
      allCandidatePosts.push(...tournamentPosts);
      matchMethod = 'tournament_id';
    }
  }
  
  // =========================================================================
  // PATH 2: Venue + Date Range (most common)
  // =========================================================================
  const { searchStart, searchEnd } = getPostSearchRange(game.gameStartDateTime, { daysBefore, daysAfter });
  
  console.log(`[POST-FINDER] Search range: ${searchStart} to ${searchEnd}`);
  
  if (game.venueId) {
    console.log(`[POST-FINDER] Searching by venue ${game.venueId} + date range`);
    
    const venuePosts = await querySocialPostsByVenueAndDate(
      game.venueId, 
      searchStart, 
      searchEnd,
      { limit: maxCandidates }
    );
    
    if (venuePosts && venuePosts.length > 0) {
      console.log(`[POST-FINDER] Found ${venuePosts.length} posts by venue + date`);
      allCandidatePosts.push(...venuePosts);
      matchMethod = matchMethod === 'tournament_id' ? 'tournament_id_and_venue' : 'venue_date';
    }
  }
  
  // =========================================================================
  // PATH 3: Date Range Only (fallback)
  // =========================================================================
  if (allCandidatePosts.length < maxCandidates) {
    console.log(`[POST-FINDER] Searching by date range only`);
    
    const datePosts = await querySocialPostsByDateRange(
      searchStart,
      searchEnd,
      { limit: maxCandidates }
    );
    
    if (datePosts && datePosts.length > 0) {
      console.log(`[POST-FINDER] Found ${datePosts.length} posts by date range`);
      allCandidatePosts.push(...datePosts);
      if (matchMethod === 'none') {
        matchMethod = 'date_only';
      }
    }
  }
  
  // Deduplicate posts
  const uniquePosts = new Map();
  for (const post of allCandidatePosts) {
    if (!uniquePosts.has(post.id) && !excludeSet.has(post.id)) {
      uniquePosts.set(post.id, post);
    }
  }
  
  const candidatePosts = Array.from(uniquePosts.values());
  console.log(`[POST-FINDER] ${candidatePosts.length} unique candidate posts after deduplication`);
  
  if (candidatePosts.length === 0) {
    return {
      candidates: [],
      candidatesFound: 0,
      matchContext: {
        matchMethod,
        searchRange: { searchStart, searchEnd },
        venueId: game.venueId,
        reason: 'no_posts_found'
      }
    };
  }
  
  // =========================================================================
  // Score and rank candidates
  // =========================================================================
  console.log(`[POST-FINDER] Scoring ${candidatePosts.length} candidates...`);
  
  const scoredCandidates = [];
  
  for (const post of candidatePosts) {
    // Get extraction data for this post
    const extraction = await getExtractionBySocialPost(post.id);
    
    // Check eligibility
    const eligibility = isPostEligible(post, extraction);
    if (!eligibility.eligible) {
      console.log(`[POST-FINDER] Post ${post.id} not eligible: ${eligibility.reason}`);
      continue;
    }
    
    // Score this post against the game
    // Note: We're using the same scoringEngine but comparing in reverse
    // The score compares extracted data (from post) to game data
    const score = calculateMatchScore(extraction, game, {
      contentType: extraction.contentType,
      postDate: post.postedAt
    });
    
    if (score.meetsMinimum) {
      const formattedSignals = formatSignalsForResponse(score);
      
      scoredCandidates.push({
        post,
        extraction,
        score
      });
      
      console.log(`[POST-FINDER] Post ${post.id}: ${score.confidence}% (${score.reason})`);
    }
  }
  
  // Rank by confidence
  const rankedCandidates = [...scoredCandidates]
    .sort((a, b) => b.score.confidence - a.score.confidence)
    .map((candidate, index) => ({
      socialPostId: candidate.post.id,
      postDate: candidate.post.postedAt,
      contentType: candidate.extraction.contentType,
      extractedBuyIn: candidate.extraction.extractedBuyIn,
      extractedVenueName: candidate.extraction.extractedVenueName,
      matchConfidence: candidate.score.confidence,
      matchReason: candidate.score.reason,
      matchSignals: JSON.stringify(formatSignalsForResponse(candidate.score)),
      rank: index + 1,
      wouldAutoLink: candidate.score.wouldAutoLink
    }));
  
  console.log(`[POST-FINDER] ${rankedCandidates.length} candidates meet minimum threshold`);
  
  // Get venue name for context
  let venueName = null;
  if (game.venueId) {
    const venue = await getVenue(game.venueId);
    venueName = venue?.name || null;
  }
  
  return {
    candidates: rankedCandidates,
    candidatesFound: candidatePosts.length,
    matchContext: {
      matchMethod,
      venueId: game.venueId,
      venueName,
      searchRange: { searchStart, searchEnd },
      candidatesScored: candidatePosts.length,
      candidatesAboveMinimum: rankedCandidates.length
    }
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  findMatchingPosts,
  getPostSearchRange,
  isPostEligible,
  daysBetween,
  ELIGIBLE_POST_STATUSES,
  ELIGIBLE_CONTENT_TYPES
};