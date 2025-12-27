/**
 * matching/gameMatcher.js
 * Find and rank game matches for social post data
 * 
 * IMPORTANT: Social posts do NOT have entityId.
 * A post could reference zero, one, or multiple entities.
 * 
 * Matching strategy:
 * 1. Tournament ID → Direct game lookup (golden signal)
 * 2. Venue from content → Games at that venue in date range
 * 3. Score and rank all candidates
 */

const { 
  queryGamesByVenueAndDate,
  queryGamesByDateRange,
  queryGameByTournamentId,
  getVenue
} = require('../utils/graphql');
const { getGameSearchRange } = require('../utils/dateUtils');
const { calculateMatchScore, rankCandidates, formatSignalsForResponse, THRESHOLDS } = require('./scoringEngine');
const { matchVenueFromContent } = require('./venueMatcher');

/**
 * Find matching games for extracted post data
 */
const findMatchingGames = async (extracted, post, options = {}) => {
  const contentType = extracted.contentType;
  
  console.log('[MATCHER] Starting game matching...');
  console.log('[MATCHER] Extracted data:', {
    tournamentId: extracted.extractedTournamentId,
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
    
    if (tournamentMatches && tournamentMatches.length > 0) {
      const exactMatch = tournamentMatches[0];
      console.log(`[MATCHER] Found exact tournament ID match: ${exactMatch.id}`);
      
      const score = calculateMatchScore(extracted, exactMatch, { contentType });
      
      // Format signals for API response (same as venue-based matches)
      const formattedSignals = formatSignalsForResponse(score);
      
      // Log breakdown for debugging
      console.log(`[MATCHER] Tournament ID match scoring breakdown:`);
      console.log(`[MATCHER]   Identity: ${formattedSignals.breakdown.identity.score}/${formattedSignals.breakdown.identity.maxPossible}`);
      console.log(`[MATCHER]   Financial: ${formattedSignals.breakdown.financial.score}/${formattedSignals.breakdown.financial.maxPossible}`);
      console.log(`[MATCHER]   Final confidence: ${formattedSignals.confidence}%`);
      
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
        matchSignals: JSON.stringify(formattedSignals),  // FIXED: stringify like other matches
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
        }
      };
    }
    
    console.log('[MATCHER] No tournament ID match found, trying venue matching...');
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
  
  if (games.length === 0) {
    console.log('[MATCHER] No games found in date range');
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
      }
    };
  }
  
  console.log(`[MATCHER] Found ${games.length} candidate games (method: ${matchMethod})`);
  
  // =========================================================================
  // Score and rank candidates
  // =========================================================================
  const scoredCandidates = games.map(game => {
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
        totalGamesChecked: games.length
      }
    };
  }
  
  const rankedCandidates = rankCandidates(viableCandidates);
  
  const venue = venueId ? await getVenue(venueId) : null;
  const venueName = venue?.name || venueMatchInfo?.venueName || null;
  
  const formattedCandidates = rankedCandidates.map(c => {
    // Format signals for API response (JSON-serializable with breakdown)
    const formattedSignals = formatSignalsForResponse(c.score);
    
    // Log detailed breakdown for debugging
    console.log(`[MATCHER] Game ${c.game.name} scoring breakdown:`);
    console.log(`[MATCHER]   Identity: ${formattedSignals.breakdown.identity.score}/${formattedSignals.breakdown.identity.maxPossible}`);
    console.log(`[MATCHER]   Financial: ${formattedSignals.breakdown.financial.score}/${formattedSignals.breakdown.financial.maxPossible}`);
    console.log(`[MATCHER]   Temporal: ${formattedSignals.breakdown.temporal.score}/${formattedSignals.breakdown.temporal.maxPossible}`);
    console.log(`[MATCHER]   Venue: ${formattedSignals.breakdown.venue.score}/${formattedSignals.breakdown.venue.maxPossible}`);
    console.log(`[MATCHER]   Penalties: ${formattedSignals.breakdown.penalties.score}`);
    console.log(`[MATCHER]   Final confidence: ${formattedSignals.confidence}%`);
    
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
      // Include both raw signals and formatted breakdown
      matchSignals: JSON.stringify(formattedSignals),
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
    }
  };
};

const getAutoLinkCandidates = (candidates, threshold = THRESHOLDS.AUTO_LINK) => {
  return candidates.filter(c => c.matchConfidence >= threshold);
};

const getMatchSummary = (matchResult) => {
  const { candidates, primaryMatch, matchCount, matchContext } = matchResult;
  
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
    }
  };
};

module.exports = {
  findMatchingGames,
  getAutoLinkCandidates,
  getMatchSummary
};