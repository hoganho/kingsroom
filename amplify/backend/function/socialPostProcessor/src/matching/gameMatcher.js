/**
 * matching/gameMatcher.js
 * Find and rank game matches for social post data
 * 
 * VERSION: 3.0.0
 * 
 * IMPORTANT: Social posts do NOT have entityId.
 * A post could reference zero, one, or multiple entities.
 * 
 * Matching strategy:
 * 1. Tournament ID → Direct game lookup (golden signal)
 * 2. Venue from content → Games at that venue in date range
 * 3. Score and rank all candidates
 * 
 * UPDATES v3.0.0:
 * - Added scrape discrepancy detection
 * - Returns discrepancy info when tournament ID found but no valid game
 * - Detects GAME_NOT_IN_DATABASE, GAME_STATUS_NOT_FOUND, GAME_STATUS_NOT_PUBLISHED
 * - Provides discrepancy details for downstream link creation
 * 
 * UPDATES v2.1.0:
 * - Use formatSignalsForStorage() for lightweight DB storage (~90% size reduction)
 */

const { 
  queryGamesByVenueAndDate,
  queryGamesByDateRange,
  queryGameByTournamentId,
  getVenue
} = require('../utils/graphql');
const { getGameSearchRange } = require('../utils/dateUtils');
// UPDATED: Use formatSignalsForStorage for lightweight DB storage
const { calculateMatchScore, rankCandidates, formatSignalsForStorage, THRESHOLDS } = require('./scoringEngine');
const { matchVenueFromContent } = require('./venueMatcher');

// Game statuses that indicate a scrape discrepancy
const PROBLEMATIC_GAME_STATUSES = ['NOT_FOUND', 'NOT_PUBLISHED'];

// Game statuses that are valid for matching (game exists and has real data)
const VALID_GAME_STATUSES = ['FINISHED', 'COMPLETED', 'RUNNING', 'REGISTERING', 'SCHEDULED', 'CANCELLED'];

/**
 * Determine the type of scrape discrepancy based on game lookup results
 * 
 * @param {Object} params
 * @param {number} params.extractedTournamentId - Tournament ID from social post
 * @param {string} params.extractedTournamentUrl - Tournament URL from social post
 * @param {Array} params.gamesFound - Games returned from tournament ID lookup
 * @param {string} params.contentType - RESULT or PROMOTIONAL
 * @returns {Object|null} Discrepancy info or null if no discrepancy
 */
const detectScrapeDiscrepancy = ({ extractedTournamentId, extractedTournamentUrl, gamesFound, contentType }) => {
  if (!extractedTournamentId) {
    return null; // No tournament ID, no discrepancy detection possible
  }
  
  // Case 1: No games found at all - tournament ID not in database
  if (!gamesFound || gamesFound.length === 0) {
    console.log(`[MATCHER] DISCREPANCY: Tournament ID ${extractedTournamentId} not found in database`);
    return {
      hasDiscrepancy: true,
      discrepancyType: 'GAME_NOT_IN_DATABASE',
      extractedTournamentId,
      extractedTournamentUrl,
      gameId: null, // Will be set to "PENDING_SCRAPE" sentinel by processSocialPost
      gameName: null,
      detectedGameStatus: null,
      detectedScrapeURLStatus: null,
      reason: `No game found with tournamentId=${extractedTournamentId}`,
      suggestedAction: 'TRIGGER_SCRAPE'
    };
  }
  
  // Case 2: Game found but has problematic status
  const game = gamesFound[0];
  
  if (game.gameStatus === 'NOT_FOUND') {
    console.log(`[MATCHER] DISCREPANCY: Tournament ID ${extractedTournamentId} exists but has NOT_FOUND status`);
    return {
      hasDiscrepancy: true,
      discrepancyType: 'GAME_STATUS_NOT_FOUND',
      extractedTournamentId,
      extractedTournamentUrl,
      gameId: game.id,
      gameName: game.name,
      detectedGameStatus: game.gameStatus,
      detectedScrapeURLStatus: null,
      reason: `Game exists but scraper returned 404 (NOT_FOUND)`,
      suggestedAction: 'TRIGGER_RESCRAPE'
    };
  }
  
  if (game.gameStatus === 'NOT_PUBLISHED') {
    console.log(`[MATCHER] DISCREPANCY: Tournament ID ${extractedTournamentId} exists but has NOT_PUBLISHED status`);
    return {
      hasDiscrepancy: true,
      discrepancyType: 'GAME_STATUS_NOT_PUBLISHED',
      extractedTournamentId,
      extractedTournamentUrl,
      gameId: game.id,
      gameName: game.name,
      detectedGameStatus: game.gameStatus,
      detectedScrapeURLStatus: null,
      reason: `Game exists but tournament not yet published on source`,
      suggestedAction: 'TRIGGER_RESCRAPE'
    };
  }
  
  // Case 3: Social post is RESULT but game status is not FINISHED
  // This indicates a potential status mismatch (post shows results but game not marked finished)
  if (contentType === 'RESULT' && !['FINISHED', 'COMPLETED'].includes(game.gameStatus)) {
    console.log(`[MATCHER] DISCREPANCY: Result post but game status is ${game.gameStatus}`);
    return {
      hasDiscrepancy: true,
      discrepancyType: 'STATUS_MISMATCH',
      extractedTournamentId,
      extractedTournamentUrl,
      gameId: game.id,
      gameName: game.name,
      detectedGameStatus: game.gameStatus,
      detectedScrapeURLStatus: null,
      reason: `Social post contains results but game status is ${game.gameStatus}`,
      suggestedAction: 'TRIGGER_RESCRAPE'
    };
  }
  
  // No discrepancy - game is valid
  return null;
};

/**
 * Check if a game has a valid status for matching
 * 
 * @param {Object} game - Game record
 * @returns {boolean}
 */
const isGameValidForMatching = (game) => {
  if (!game || !game.gameStatus) return false;
  return VALID_GAME_STATUSES.includes(game.gameStatus);
};

/**
 * Find matching games for extracted post data
 * 
 * UPDATED v3.0.0: Now returns discrepancy information when tournament ID
 * is found in social post but no valid game exists in database.
 * 
 * @param {Object} extracted - Extracted data from social post
 * @param {Object} post - Social post object
 * @param {Object} options - Matching options
 * @returns {Object} Match result with candidates, primary match, and discrepancy info
 */
const findMatchingGames = async (extracted, post, options = {}) => {
  const contentType = extracted.contentType;
  
  console.log('[MATCHER] Starting game matching...');
  console.log('[MATCHER] Extracted data:', {
    tournamentId: extracted.extractedTournamentId,
    tournamentUrl: extracted.extractedTournamentUrl,
    buyIn: extracted.extractedBuyIn,
    venueName: extracted.extractedVenueName,
    date: extracted.extractedDate
  });
  
  // =========================================================================
  // PATH 1: Tournament ID Match (highest confidence)
  // =========================================================================
  if (extracted.extractedTournamentId) {
    console.log(`[MATCHER] Trying tournament ID match: ${extracted.extractedTournamentId}`);
    
    const tournamentMatches = await queryGameByTournamentId(extracted.extractedTournamentId);
    
    // === CHECK FOR DISCREPANCY ===
    const discrepancy = detectScrapeDiscrepancy({
      extractedTournamentId: extracted.extractedTournamentId,
      extractedTournamentUrl: extracted.extractedTournamentUrl,
      gamesFound: tournamentMatches,
      contentType
    });
    
    // If discrepancy detected, return it
    if (discrepancy) {
      console.log(`[MATCHER] Returning discrepancy result: ${discrepancy.discrepancyType}`);
      
      return {
        candidates: [],
        primaryMatch: null,
        matchCount: 0,
        matchContext: {
          matchMethod: 'tournament_id',
          tournamentId: extracted.extractedTournamentId,
          reason: 'discrepancy_detected'
        },
        // NEW: Discrepancy info for downstream processing
        scrapeDiscrepancy: discrepancy
      };
    }
    
    // Game found with valid status - proceed with normal matching
    if (tournamentMatches && tournamentMatches.length > 0) {
      const exactMatch = tournamentMatches[0];
      
      // Double-check game is valid for matching
      if (isGameValidForMatching(exactMatch)) {
        console.log(`[MATCHER] Found valid tournament ID match: ${exactMatch.id} (status: ${exactMatch.gameStatus})`);
        
        const score = calculateMatchScore(extracted, exactMatch, { contentType });
        
        // Use lightweight storage format
        const storageSignals = formatSignalsForStorage(score);
        
        // Log breakdown for debugging
        console.log(`[MATCHER] Tournament ID match scoring:`);
        console.log(`[MATCHER]   Confidence: ${score.confidence}%`);
        console.log(`[MATCHER]   Reason: ${score.reason}`);
        
        let venueName = null;
        if (exactMatch.venueId) {
          const venue = await getVenue(exactMatch.venueId);
          venueName = venue?.name || null;
        }
        
        const matchResult = {
          gameId: exactMatch.id,
          gameName: exactMatch.name,
          gameDate: exactMatch.gameStartDateTime,
          gameStatus: exactMatch.gameStatus,
          venueId: exactMatch.venueId,
          venueName,
          entityId: exactMatch.entityId,
          buyIn: exactMatch.buyIn,
          guaranteeAmount: exactMatch.guaranteeAmount,
          totalEntries: exactMatch.totalEntries,
          matchConfidence: Math.max(score.confidence, 95),
          matchReason: 'tournament_id_exact',
          matchSignals: storageSignals,
          rank: 1,
          isPrimaryMatch: true,
          wouldAutoLink: true
        };
        
        return {
          candidates: [matchResult],
          primaryMatch: matchResult,
          matchCount: 1,
          matchContext: {
            matchMethod: 'tournament_id',
            tournamentId: extracted.extractedTournamentId
          },
          // No discrepancy - successful match
          scrapeDiscrepancy: null
        };
      } else {
        // Game exists but has invalid status - this shouldn't happen if detectScrapeDiscrepancy worked
        console.log(`[MATCHER] Game found but status ${exactMatch.gameStatus} is not valid for matching`);
      }
    }
    
    console.log('[MATCHER] No valid tournament ID match found, trying venue matching...');
  }
  
  // =========================================================================
  // PATH 2: Venue-based Search
  // =========================================================================
  let venueId = null;
  let venueMatchInfo = null;
  
  // Check if dataExtractor already matched a venue from database
  if (extracted.extractedVenueId) {
    venueId = extracted.extractedVenueId;
    venueMatchInfo = {
      matched: true,
      venueId: extracted.extractedVenueId,
      venueName: extracted.extractedVenueName,
      confidence: extracted.venueMatchConfidence || 0.9,
      matchSource: extracted.venueMatchSource || 'dataExtractor'
    };
    console.log(`[MATCHER] Using pre-matched venue from extractor: ${extracted.extractedVenueName} (${venueId})`);
  }
  // Fall back to venue matching if we have a name but no ID
  else if (extracted.extractedVenueName) {
    console.log(`[MATCHER] Attempting venue match: "${extracted.extractedVenueName}"`);
    
    const venueMatch = await matchVenueFromContent(extracted.extractedVenueName);
    
    if (venueMatch.venueId) {
      venueId = venueMatch.venueId;
      venueMatchInfo = venueMatch;
      extracted.suggestedVenueId = venueId;
      extracted.venueMatchConfidence = venueMatch.confidence;
      extracted.venueMatchReason = venueMatch.matchReason;
      
      console.log(`[MATCHER] Venue matched: ${venueMatch.venueName} (${venueMatch.confidence})`);
    } else {
      console.log(`[MATCHER] Venue match failed: ${venueMatch.matchReason}`);
    }
  }
  
  if (!venueId) {
    console.log('[MATCHER] No venue context, falling back to date-only search');
  }
  
  // =========================================================================
  // Query games - by venue if available, otherwise by date only
  // =========================================================================
  const searchDate = extracted.extractedDate || post.postedAt;
  const { searchStart, searchEnd } = getGameSearchRange(searchDate);
  
  let games = [];
  let matchMethod = 'none';
  
  if (venueId) {
    // PATH 2A: Venue + date range (most precise)
    console.log(`[MATCHER] Searching games at venue ${venueId} from ${searchStart} to ${searchEnd}`);
    games = await queryGamesByVenueAndDate(venueId, searchStart, searchEnd, {
      limit: options.limit || 50
    });
    matchMethod = 'venue_date';
  } else {
    // PATH 2B: Date range only (broader search using byGameMonth GSI)
    console.log(`[MATCHER] Searching ALL games from ${searchStart} to ${searchEnd}`);
    games = await queryGamesByDateRange(searchStart, searchEnd, {
      limit: options.limit || 100
    });
    matchMethod = 'date_only';
  }
  
  // Filter out games with problematic statuses
  const validGames = games.filter(g => isGameValidForMatching(g));
  const invalidCount = games.length - validGames.length;
  
  if (invalidCount > 0) {
    console.log(`[MATCHER] Filtered out ${invalidCount} games with invalid status`);
  }
  
  if (validGames.length === 0) {
    console.log('[MATCHER] No valid games found in date range');
    return {
      candidates: [],
      primaryMatch: null,
      matchCount: 0,
      matchContext: {
        matchMethod,
        venueId,
        venueMatchInfo,
        searchRange: { searchStart, searchEnd },
        reason: 'no_games_in_range'
      },
      scrapeDiscrepancy: null
    };
  }
  
  console.log(`[MATCHER] Found ${validGames.length} valid candidate games (method: ${matchMethod})`);
  
  // =========================================================================
  // Score and rank candidates
  // =========================================================================
  const scoredCandidates = validGames.map(game => {
    const score = calculateMatchScore(extracted, game, {
      contentType,
      postDate: post.postedAt
    });
    return { game, score };
  });
  
  const viableCandidates = scoredCandidates.filter(c => c.score.meetsMinimum);
  
  console.log(`[MATCHER] ${viableCandidates.length} candidates meet minimum threshold`);
  
  if (viableCandidates.length === 0) {
    return {
      candidates: [],
      primaryMatch: null,
      matchCount: 0,
      matchContext: {
        matchMethod,
        venueId,
        venueMatchInfo,
        searchRange: { searchStart, searchEnd },
        reason: 'no_candidates_above_threshold',
        totalGamesChecked: validGames.length
      },
      scrapeDiscrepancy: null
    };
  }
  
  const rankedCandidates = rankCandidates(viableCandidates);
  
  const venue = venueId ? await getVenue(venueId) : null;
  const venueName = venue?.name || venueMatchInfo?.venueName || null;
  
  const formattedCandidates = rankedCandidates.map(c => {
    // Use lightweight storage format
    const storageSignals = formatSignalsForStorage(c.score);
    
    // Log for debugging
    console.log(`[MATCHER] Game ${c.game.name}: ${c.score.confidence}% (${c.score.reason})`);
    
    return {
      gameId: c.game.id,
      gameName: c.game.name,
      gameDate: c.game.gameStartDateTime,
      gameStatus: c.game.gameStatus,
      venueId: c.game.venueId,
      venueName,
      entityId: c.game.entityId,
      buyIn: c.game.buyIn,
      guaranteeAmount: c.game.guaranteeAmount,
      totalEntries: c.game.totalEntries,
      matchConfidence: c.score.confidence,
      matchReason: c.score.reason,
      matchSignals: storageSignals,
      rank: c.rank,
      isPrimaryMatch: c.isPrimaryMatch,
      wouldAutoLink: c.score.wouldAutoLink,
      rejectionReason: c.score.confidence < THRESHOLDS.AUTO_LINK ? 'below_auto_threshold' : null
    };
  });
  
  const primaryMatch = formattedCandidates.find(c => c.isPrimaryMatch) || null;
  
  if (primaryMatch) {
    console.log(`[MATCHER] Primary match: ${primaryMatch.gameName} (${primaryMatch.matchConfidence}%)`);
  }
  
  return {
    candidates: formattedCandidates,
    primaryMatch,
    matchCount: formattedCandidates.length,
    matchContext: {
      matchMethod,
      venueId,
      venueName,
      venueMatchInfo,
      searchRange: { searchStart, searchEnd }
    },
    scrapeDiscrepancy: null
  };
};

/**
 * Get candidates that qualify for auto-linking
 * 
 * @param {Array} candidates - Match candidates
 * @param {number} threshold - Minimum confidence for auto-link
 * @returns {Array} Candidates above threshold
 */
const getAutoLinkCandidates = (candidates, threshold = THRESHOLDS.AUTO_LINK) => {
  return candidates.filter(c => c.matchConfidence >= threshold);
};

/**
 * Get a summary of match results
 * 
 * @param {Object} matchResult - Result from findMatchingGames
 * @returns {Object} Summary object
 */
const getMatchSummary = (matchResult) => {
  const { candidates, primaryMatch, matchCount, matchContext, scrapeDiscrepancy } = matchResult;
  
  return {
    totalCandidates: matchCount,
    hasPrimaryMatch: !!primaryMatch,
    primaryMatchConfidence: primaryMatch?.matchConfidence || 0,
    primaryMatchReason: primaryMatch?.matchReason || null,
    wouldAutoLink: primaryMatch?.wouldAutoLink || false,
    matchMethod: matchContext?.matchMethod,
    candidatesByConfidence: {
      high: candidates.filter(c => c.matchConfidence >= 80).length,
      medium: candidates.filter(c => c.matchConfidence >= 50 && c.matchConfidence < 80).length,
      low: candidates.filter(c => c.matchConfidence < 50).length
    },
    // NEW: Discrepancy summary
    hasDiscrepancy: !!scrapeDiscrepancy,
    discrepancyType: scrapeDiscrepancy?.discrepancyType || null,
    discrepancySuggestedAction: scrapeDiscrepancy?.suggestedAction || null
  };
};

module.exports = {
  findMatchingGames,
  getAutoLinkCandidates,
  getMatchSummary,
  // NEW: Export discrepancy detection for testing/reuse
  detectScrapeDiscrepancy,
  isGameValidForMatching,
  PROBLEMATIC_GAME_STATUSES,
  VALID_GAME_STATUSES
};