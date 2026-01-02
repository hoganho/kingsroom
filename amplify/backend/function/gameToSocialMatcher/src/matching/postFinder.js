/**
 * matching/postFinder.js
 * Find candidate social posts for a game
 * 
 * VERSION: 2.0.0
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
 * 
 * UPDATES v2.0.0:
 * - Include ticket data in candidate results
 * - Pass postDate to scoring engine for postedAtExact/postedAtClose signals
 * - Include ticket aggregates for reconciliation preview
 * 
 * TIMEZONE NOTE:
 * All date operations use AEST (Australian Eastern Standard Time) context
 * to ensure correct matching for Australian poker venues.
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
const { getPostSearchRange, daysBetween, toAEST } = require('../utils/dateUtils');

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
// TICKET DATA EXTRACTION
// ===================================================================

/**
 * Extract ticket summary from extraction data for inclusion in candidate
 * 
 * @param {Object} extraction - SocialPostGameData record
 * @returns {Object} Ticket summary for the candidate
 */
const extractTicketSummary = (extraction) => {
  if (!extraction) return null;
  
  const hasTickets = (extraction.totalTicketsExtracted || 0) > 0;
  const hasAdvertisedTickets = extraction.hasAdvertisedTickets === true;
  
  if (!hasTickets && !hasAdvertisedTickets) {
    return null;
  }
  
  return {
    // Extracted ticket data (from result posts)
    totalTicketsExtracted: extraction.totalTicketsExtracted || 0,
    totalTicketValue: extraction.totalTicketValue || null,
    ticketCountByType: extraction.ticketCountByType || null,
    ticketValueByType: extraction.ticketValueByType || null,
    totalCashPaid: extraction.totalCashPaid || null,
    totalPrizesWithTickets: extraction.totalPrizesWithTickets || 0,
    totalTicketOnlyPrizes: extraction.totalTicketOnlyPrizes || 0,
    
    // Reconciliation fields
    reconciliation_accumulatorTicketCount: extraction.reconciliation_accumulatorTicketCount || 0,
    reconciliation_accumulatorTicketValue: extraction.reconciliation_accumulatorTicketValue || null,
    reconciliation_totalPrizepoolPaid: extraction.reconciliation_totalPrizepoolPaid || null,
    reconciliation_cashPlusTotalTicketValue: extraction.reconciliation_cashPlusTotalTicketValue || null,
    
    // Winner ticket info
    extractedWinnerHasTicket: extraction.extractedWinnerHasTicket || false,
    extractedWinnerTicketType: extraction.extractedWinnerTicketType || null,
    extractedWinnerTicketValue: extraction.extractedWinnerTicketValue || null,
    
    // Advertised tickets (from promo posts)
    hasAdvertisedTickets: hasAdvertisedTickets,
    advertisedTicketCount: extraction.advertisedTicketCount || null,
    advertisedTicketType: extraction.advertisedTicketType || null,
    advertisedTicketValue: extraction.advertisedTicketValue || null,
    advertisedTicketDescription: extraction.advertisedTicketDescription || null
  };
};

/**
 * Generate reconciliation preview comparing extraction to game
 * 
 * @param {Object} extraction - SocialPostGameData record
 * @param {Object} game - Game record
 * @returns {Object} Reconciliation preview
 */
const generateReconciliationPreview = (extraction, game) => {
  if (!extraction || !game) return null;
  
  const hasTicketData = (extraction.totalTicketsExtracted || 0) > 0;
  if (!hasTicketData) return null;
  
  const preview = {
    // Social post data
    social_totalCashPaid: extraction.totalCashPaid || null,
    social_totalTicketCount: extraction.totalTicketsExtracted || 0,
    social_totalTicketValue: extraction.totalTicketValue || null,
    social_accumulatorCount: extraction.reconciliation_accumulatorTicketCount || 0,
    social_accumulatorValue: extraction.reconciliation_accumulatorTicketValue || null,
    
    // Game data
    game_prizepoolPaid: game.prizepoolPaid || null,
    game_numberOfAccumulatorTicketsPaid: game.numberOfAccumulatorTicketsPaid || null,
    game_accumulatorTicketValue: game.accumulatorTicketValue || null,
    
    // Calculated differences
    cashDifference: null,
    ticketCountDifference: null,
    ticketValueDifference: null,
    hasDiscrepancy: false,
    discrepancySeverity: 'NONE'
  };
  
  // Calculate differences if game has data
  if (game.prizepoolPaid != null) {
    preview.cashDifference = (extraction.totalCashPaid || 0) - (game.prizepoolPaid || 0);
  }
  
  if (game.numberOfAccumulatorTicketsPaid != null) {
    preview.ticketCountDifference = (extraction.reconciliation_accumulatorTicketCount || 0) - (game.numberOfAccumulatorTicketsPaid || 0);
  }
  
  if (game.accumulatorTicketValue != null && extraction.reconciliation_accumulatorTicketValue != null) {
    preview.ticketValueDifference = (extraction.reconciliation_accumulatorTicketValue || 0) - (game.accumulatorTicketValue || 0);
  }
  
  // Determine if there's a discrepancy
  const hasCashDiscrepancy = preview.cashDifference != null && Math.abs(preview.cashDifference) > 1;
  const hasTicketCountDiscrepancy = preview.ticketCountDifference != null && preview.ticketCountDifference !== 0;
  
  preview.hasDiscrepancy = hasCashDiscrepancy || hasTicketCountDiscrepancy;
  
  if (preview.hasDiscrepancy) {
    preview.discrepancySeverity = (preview.cashDifference != null && Math.abs(preview.cashDifference) > 100) ? 'MAJOR' : 'MINOR';
  }
  
  return preview;
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
    daysAfter = 3,
    includeTicketData = true,
    includeReconciliationPreview = true
  } = options;
  
  console.log('[POST-FINDER] Starting post search for game...');
  console.log('[POST-FINDER] Game:', {
    id: game.id,
    name: game.name,
    date: game.gameStartDateTime,
    venueId: game.venueId,
    tournamentId: game.tournamentId,
    buyIn: game.buyIn,
    numberOfAccumulatorTicketsPaid: game.numberOfAccumulatorTicketsPaid,
    accumulatorTicketValue: game.accumulatorTicketValue
  });
  
  // Log AEST interpretation of game date
  if (game.gameStartDateTime) {
    const gameAEST = toAEST(game.gameStartDateTime);
    console.log(`[POST-FINDER] Game date in AEST: ${gameAEST?.isoDate} (${gameAEST?.hours}:${String(gameAEST?.minutes).padStart(2, '0')})`);
  }
  
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
  // Uses AEST-aware search range calculation
  // =========================================================================
  const { searchStart, searchEnd } = getPostSearchRange(game.gameStartDateTime, { daysBefore, daysAfter });
  
  console.log(`[POST-FINDER] Search range (AEST-aware): ${searchStart} to ${searchEnd}`);
  
  // Log the AEST interpretation of the search range
  const startAEST = toAEST(searchStart);
  const endAEST = toAEST(searchEnd);
  console.log(`[POST-FINDER] Search range in AEST: ${startAEST?.isoDate} to ${endAEST?.isoDate}`);
  
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
        searchRangeAEST: { 
          start: startAEST?.isoDate, 
          end: endAEST?.isoDate 
        },
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
    // First check if we have a cached extraction (from tournament ID search)
    let extraction = post._cachedExtraction || null;
    
    // If no cached extraction, try to look it up
    if (!extraction) {
      extraction = await getExtractionBySocialPost(post.id);
    }
    
    // Check eligibility
    const eligibility = isPostEligible(post, extraction);
    if (!eligibility.eligible) {
      console.log(`[POST-FINDER] Post ${post.id} not eligible: ${eligibility.reason}`);
      continue;
    }
    
    // Score this post against the game
    // Note: We pass postDate for the new postedAtExact/postedAtClose signals
    const score = calculateMatchScore(extraction, game, {
      contentType: extraction.contentType,
      postDate: post.postedAt  // NEW: Pass post date for temporal scoring
    });
    
    if (score.meetsMinimum) {
      scoredCandidates.push({
        post,
        extraction,
        score
      });
      
      // Log with AEST date for debugging
      const postAEST = toAEST(post.postedAt);
      console.log(`[POST-FINDER] Post ${post.id} (${postAEST?.isoDate} AEST): ${score.confidence}% (${score.reason})`);
    }
  }
  
  // Rank by confidence
  const rankedCandidates = [...scoredCandidates]
    .sort((a, b) => b.score.confidence - a.score.confidence)
    .map((candidate, index) => {
      const postAEST = toAEST(candidate.post.postedAt);
      
      // Build candidate result
      const result = {
        socialPostId: candidate.post.id,
        socialPostGameDataId: candidate.extraction.id,
        postDate: candidate.post.postedAt,
        postDateAEST: postAEST?.isoDate,
        contentType: candidate.extraction.contentType,
        
        // Extracted data for display
        extractedBuyIn: candidate.extraction.extractedBuyIn,
        extractedVenueName: candidate.extraction.extractedVenueName,
        extractedDate: candidate.extraction.extractedDate,
        effectiveGameDate: candidate.extraction.effectiveGameDate,  // NEW: Computed date for queries
        effectiveGameDateSource: candidate.extraction.effectiveGameDateSource,
        extractedWinnerName: candidate.extraction.extractedWinnerName,
        extractedWinnerPrize: candidate.extraction.extractedWinnerPrize,
        extractedTotalEntries: candidate.extraction.extractedTotalEntries,
        placementCount: candidate.extraction.placementCount || 0,
        
        // Match scoring
        matchConfidence: candidate.score.confidence,
        matchReason: candidate.score.reason,
        matchSignals: JSON.stringify(formatSignalsForResponse(candidate.score)),
        rank: index + 1,
        wouldAutoLink: candidate.score.wouldAutoLink
      };
      
      // Include ticket data if requested
      if (includeTicketData) {
        const ticketSummary = extractTicketSummary(candidate.extraction);
        if (ticketSummary) {
          result.ticketData = ticketSummary;
          result.hasTicketData = true;
        } else {
          result.hasTicketData = false;
        }
      }
      
      // Include reconciliation preview if requested
      if (includeReconciliationPreview && includeTicketData) {
        const reconciliationPreview = generateReconciliationPreview(candidate.extraction, game);
        if (reconciliationPreview) {
          result.reconciliationPreview = reconciliationPreview;
        }
      }
      
      return result;
    });
  
  console.log(`[POST-FINDER] ${rankedCandidates.length} candidates meet minimum threshold`);
  
  // Log ticket data summary
  const candidatesWithTickets = rankedCandidates.filter(c => c.hasTicketData);
  if (candidatesWithTickets.length > 0) {
    console.log(`[POST-FINDER] ${candidatesWithTickets.length} candidates have ticket data`);
  }
  
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
      searchRangeAEST: { 
        start: startAEST?.isoDate, 
        end: endAEST?.isoDate 
      },
      candidatesScored: candidatePosts.length,
      candidatesAboveMinimum: rankedCandidates.length,
      candidatesWithTicketData: rankedCandidates.filter(c => c.hasTicketData).length,
      gameHasAccumulatorTickets: game.hasAccumulatorTickets || false,
      gameAccumulatorTicketCount: game.numberOfAccumulatorTicketsPaid || null
    }
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  findMatchingPosts,
  getPostSearchRange,  // Re-export from dateUtils for backward compatibility
  isPostEligible,
  daysBetween,         // Re-export from dateUtils for backward compatibility
  extractTicketSummary,
  generateReconciliationPreview,
  ELIGIBLE_POST_STATUSES,
  ELIGIBLE_CONTENT_TYPES
};