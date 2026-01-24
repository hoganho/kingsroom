/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_ENTITYTABLE_ARN
    API_KINGSROOM_ENTITYTABLE_NAME
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_ARN
    API_KINGSROOM_GAMEFINANCIALSNAPSHOTTABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
    API_KINGSROOM_SOCIALACCOUNTTABLE_ARN
    API_KINGSROOM_SOCIALACCOUNTTABLE_NAME
    API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_ARN
    API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME
    API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_ARN
    API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME
    API_KINGSROOM_SOCIALPOSTTABLE_ARN
    API_KINGSROOM_SOCIALPOSTTABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    ENV
    REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * GAME TO SOCIAL MATCHER LAMBDA
 * ===================================================================
 * 
 * VERSION: 3.0.0
 * 
 * PURPOSE:
 * Reverse matching flow - when a game is processed/finalized, find unlinked
 * social posts that might match this game and create SocialPostGameLink
 * records.
 * 
 * This handles cases where:
 * - Social posts arrived BEFORE the game was in the system
 * - Posts had low confidence matches initially
 * - Posts mention multiple games (many-to-many relationship)
 * - NEW: Posts created PENDING_SCRAPE discrepancy links awaiting this game
 * 
 * TRIGGERS:
 * - DynamoDB Stream on GameFinancialSnapshot table (INSERT events) - PRIMARY
 * - GraphQL mutation for manual triggering
 * - Direct Lambda invocation for batch processing
 * 
 * WHY GameFinancialSnapshot (not Game table)?
 * - Ensures gameFinancialsProcessor has completed first (sequential)
 * - GameFinancialSnapshot only created for valid, processed games
 * - Avoids duplicate invocations from frequent Game table updates
 * - Acts as a "game ready" signal
 * 
 * UPDATES v3.0.0:
 * - Added scrape discrepancy resolution (resolveDiscrepancyLinks)
 * - Query for PENDING_SCRAPE links by extractedTournamentId
 * - Resolve discrepancies when game becomes available
 * - Track discrepancy resolution in link records
 * 
 * UPDATES v2.1.0:
 * - Updated safeStringify to handle already-stringified values (prevents double-stringify)
 * - matchSignals from postFinder is now an object, stringify once here
 * 
 * UPDATES v2.0.0:
 * - Include ticket data in SocialPostGameLink records
 * - Store reconciliation preview for discrepancy detection
 * - Pass postDate to scoring engine for enhanced temporal matching
 * - Track ticket-related matches in link metadata
 * 
 * FLOW:
 * 1. Game saved → Game table stream → gameFinancialsProcessor
 * 2. gameFinancialsProcessor creates → GameFinancialSnapshot
 * 3. GameFinancialSnapshot stream → gameToSocialMatcher (this Lambda)
 * 4. NEW: Check for PENDING_SCRAPE links waiting for this game's tournamentId
 * 5. NEW: Resolve any discrepancy links found
 * 6. Find candidate social posts (by date range, venue, status)
 * 7. Score each post against the game using scoringEngine
 * 8. Create SocialPostGameLink for matches above threshold
 * 9. SocialPostGameLink stream → socialDataAggregator → Game enriched
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Game Table (DynamoDB Stream)                                   │
 * │       │                                                          │
 * │       ▼                                                          │
 * │  gameFinancialsProcessor                                        │
 * │       │                                                          │
 * │       ▼                                                          │
 * │  GameFinancialSnapshot Table (DynamoDB Stream)                  │
 * │       │                                                          │
 * │       ▼                                                          │
 * │  gameToSocialMatcher (this Lambda)                              │
 * │       │                                                          │
 * │       ├──► Step 1: Resolve PENDING_SCRAPE discrepancy links     │
 * │       │                                                          │
 * │       ├──► Step 2: Find candidate posts (fuzzy matching)        │
 * │       │                                                          │
 * │       ▼                                                          │
 * │  SocialPostGameLink Table (DynamoDB Stream)                     │
 * │       │                                                          │
 * │       ▼                                                          │
 * │  socialDataAggregator → Game enriched with social data          │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * RELATIONSHIPS:
 * - A social post can be linked to ONE OR MORE games
 * - A game can be linked to ONE OR MORE posts
 * - SocialPostGameLink is the join table with match metadata
 * 
 * CHANGELOG:
 * v3.0.0 - Added scrape discrepancy resolution
 * v2.1.0 - Fixed double-stringify bug in matchSignals
 * v2.0.0 - Added ticket data to links, postDate scoring, reconciliation preview
 * v1.2.0 - Changed to GameFinancialSnapshot stream (sequential after financials)
 * v1.1.0 - Changed to Game table stream (parallel)
 * v1.0.0 - Initial version (invoked by gameFinancialsProcessor)
 * 
 * ===================================================================
 */

const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { findMatchingPosts, getPostSearchRange } = require('./matching/postFinder');
const { 
  getGame,
  getSocialPost,
  getLinksBySocialPost,
  getLinksByGame,
  createSocialPostGameLink,
  updateSocialPost,
  // NEW v3.0.0: Discrepancy resolution functions
  updateSocialPostGameLink,
  queryLinksByExtractedTournamentId,
  updateSocialPostGameData
} = require('./utils/graphql');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// CONSTANTS
// ===================================================================

// Game statuses that should trigger social matching
const MATCH_TRIGGER_STATUSES = ['FINISHED', 'COMPLETED', 'RUNNING', 'REGISTERING'];

// Default threshold for auto-linking
const DEFAULT_AUTO_LINK_THRESHOLD = 80;

// ===================================================================
// HELPERS
// ===================================================================

/**
 * Helper to add DataStore required fields to a record
 */
const addDataStoreFields = (record) => {
  return {
    ...record,
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null,
  };
};

/**
 * Determine if a game should trigger social matching
 */
const shouldMatchGame = (game) => {
  if (!game || !game.id) {
    return { should: false, reason: 'no_game' };
  }
  
  if (!game.entityId) {
    return { should: false, reason: 'no_entity' };
  }
  
  if (!MATCH_TRIGGER_STATUSES.includes(game.gameStatus)) {
    return { should: false, reason: `status_${game.gameStatus}` };
  }
  
  // Must have either a date or venue to find candidates
  if (!game.gameStartDateTime && !game.venueId) {
    return { should: false, reason: 'no_date_or_venue' };
  }
  
  return { should: true, reason: 'eligible' };
};

/**
 * Safely stringify an object for AWSJSON field
 * UPDATED: Handles already-stringified values to prevent double-stringify bug
 */
const safeStringify = (obj) => {
  if (!obj) return null;
  
  // If it's already a string, check if it's valid JSON
  if (typeof obj === 'string') {
    try {
      JSON.parse(obj); // Validate it's proper JSON
      return obj;      // Already stringified, return as-is
    } catch (e) {
      // Not valid JSON string, wrap it
      return JSON.stringify(obj);
    }
  }
  
  // It's an object, stringify it
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.error('[GAME-TO-SOCIAL] Failed to stringify:', e.message);
    return null;
  }
};

// ===================================================================
// DISCREPANCY RESOLUTION (NEW v3.0.0)
// ===================================================================

/**
 * Resolve pending discrepancy links waiting for this game
 * 
 * When socialPostProcessor creates a PENDING_SCRAPE link because
 * a tournament ID wasn't in the database, this function resolves
 * those links when the game finally gets scraped.
 * 
 * @param {Object} game - Game record with tournamentId
 * @param {Object} options - Resolution options
 * @returns {Object} Resolution result
 */
const resolveDiscrepancyLinks = async (game, options = {}) => {
  const result = {
    found: 0,
    resolved: 0,
    failed: 0,
    details: []
  };
  
  // Skip if game has no tournament ID
  if (!game.tournamentId) {
    console.log('[GAME-TO-SOCIAL] No tournamentId on game, skipping discrepancy check');
    return result;
  }
  
  console.log(`[GAME-TO-SOCIAL] Checking for discrepancy links with tournamentId=${game.tournamentId}`);
  
  try {
    // Query for PENDING_SCRAPE links waiting for this tournament ID
    const pendingLinks = await queryLinksByExtractedTournamentId(game.tournamentId);
    
    if (!pendingLinks || pendingLinks.length === 0) {
      console.log('[GAME-TO-SOCIAL] No pending discrepancy links found');
      return result;
    }
    
    // Filter to only PENDING_SCRAPE or RESCRAPE_REQUESTED links with unresolved discrepancy
    // Note: gameId may be "PENDING_SCRAPE" sentinel or a real game ID with problematic status
    const discrepancyLinks = pendingLinks.filter(link => 
      link.hasScrapeDiscrepancy === true &&
      ['PENDING_SCRAPE', 'RESCRAPE_REQUESTED'].includes(link.linkType) &&
      ['UNRESOLVED', 'RESCRAPE_PENDING'].includes(link.discrepancyResolution)
    );
    
    result.found = discrepancyLinks.length;
    
    if (discrepancyLinks.length === 0) {
      console.log('[GAME-TO-SOCIAL] No unresolved discrepancy links found');
      return result;
    }
    
    console.log(`[GAME-TO-SOCIAL] Found ${discrepancyLinks.length} discrepancy links to resolve`);
    
    const now = new Date().toISOString();
    
    for (const link of discrepancyLinks) {
      try {
        console.log(`[GAME-TO-SOCIAL] Resolving link ${link.id} for post ${link.socialPostId}`);
        
        // Update the link to connect to this game
        const linkUpdate = {
          gameId: game.id,
          linkType: 'AUTO_MATCHED',
          matchConfidence: 95, // High confidence since tournament ID matched
          matchReason: 'tournament_id_discrepancy_resolved',
          
          // Clear discrepancy flags
          hasScrapeDiscrepancy: false,
          discrepancyResolution: 'AUTO_RESOLVED',
          discrepancyResolvedAt: now,
          discrepancyResolvedBy: 'GAME_TO_SOCIAL_MATCHER',
          discrepancyResolutionNotes: `Game ${game.id} scraped with status ${game.gameStatus}`,
          
          // Update rescrape result if applicable
          rescrapeCompletedAt: link.rescrapeRequested ? now : null,
          rescrapeResult: link.rescrapeRequested ? 'SUCCESS' : null,
          rescrapeResolvedGameStatus: game.gameStatus,
          
          // Set as primary if this is the only link
          isPrimaryGame: true,
          
          updatedAt: now
        };
        
        await updateSocialPostGameLink(link.id, linkUpdate);
        
        // Update the SocialPost to mark as linked
        await updateSocialPost(link.socialPostId, {
          linkedGameId: game.id,
          primaryLinkedGameId: game.id,
          processingStatus: 'LINKED',
          hasUnverifiedLinks: true
        });
        
        // Update SocialPostGameData if it has discrepancy reference
        if (link.socialPostGameDataId) {
          await updateSocialPostGameData(link.socialPostGameDataId, {
            hasScrapeDiscrepancy: false,
            suggestedGameId: game.id
          });
        }
        
        result.resolved++;
        result.details.push({
          linkId: link.id,
          socialPostId: link.socialPostId,
          extractedTournamentId: link.extractedTournamentId,
          previousLinkType: link.linkType,
          previousResolution: link.discrepancyResolution,
          newLinkType: 'AUTO_MATCHED',
          newResolution: 'AUTO_RESOLVED',
          gameId: game.id,
          status: 'RESOLVED'
        });
        
        console.log(`[GAME-TO-SOCIAL] Successfully resolved link ${link.id}`);
        
      } catch (linkError) {
        console.error(`[GAME-TO-SOCIAL] Failed to resolve link ${link.id}:`, linkError);
        result.failed++;
        result.details.push({
          linkId: link.id,
          socialPostId: link.socialPostId,
          status: 'FAILED',
          error: linkError.message
        });
      }
    }
    
    console.log(`[GAME-TO-SOCIAL] Discrepancy resolution complete: ${result.resolved} resolved, ${result.failed} failed`);
    
    return result;
    
  } catch (error) {
    console.error('[GAME-TO-SOCIAL] Error resolving discrepancy links:', error);
    result.error = error.message;
    return result;
  }
};

// ===================================================================
// MAIN MATCHING FUNCTION
// ===================================================================

/**
 * Match a game to social posts
 * 
 * @param {Object} game - Game record
 * @param {Object} options - Matching options
 * @returns {Object} MatchingResult
 */
const matchGameToSocialPosts = async (game, options = {}) => {
  const {
    autoLinkThreshold = DEFAULT_AUTO_LINK_THRESHOLD,
    skipLinking = false,
    maxCandidates = 100,
    includeAlreadyLinked = false,
    includeTicketData = true,
    includeReconciliationPreview = true,
    // NEW v3.0.0: Discrepancy resolution option
    resolveDiscrepancies = true
  } = options;
  
  const startTime = Date.now();
  
  console.log(`[GAME-TO-SOCIAL] Starting match for game: ${game.id}`);
  console.log(`[GAME-TO-SOCIAL] Game: ${game.name} @ ${game.gameStartDateTime}`);
  console.log(`[GAME-TO-SOCIAL] Tournament ID: ${game.tournamentId || 'none'}`);
  console.log(`[GAME-TO-SOCIAL] Game has accumulator tickets: ${game.hasAccumulatorTickets || false}, count: ${game.numberOfAccumulatorTicketsPaid || 0}`);
  
  const result = {
    success: false,
    gameId: game.id,
    gameName: game.name,
    gameDate: game.gameStartDateTime,
    candidatesFound: 0,
    candidatesScored: 0,
    linksCreated: 0,
    linksSkipped: 0,
    existingLinks: 0,
    matchedPosts: [],
    linkDetails: [],
    // NEW v3.0.0: Discrepancy resolution results
    discrepanciesResolved: 0,
    discrepancyDetails: [],
    ticketDataSummary: {
      postsWithTicketData: 0,
      totalTicketsFromPosts: 0,
      postsWithReconciliationIssues: 0
    },
    matchContext: null,  // Will be populated with search context
    processingTimeMs: 0,
    error: null
  };
  
  try {
    // Check if game should be matched
    const eligibility = shouldMatchGame(game);
    if (!eligibility.should) {
      console.log(`[GAME-TO-SOCIAL] Skipping game: ${eligibility.reason}`);
      result.error = `Game not eligible: ${eligibility.reason}`;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
    
    // =========================================================================
    // STEP 1: Resolve pending discrepancy links (NEW v3.0.0)
    // =========================================================================
    if (resolveDiscrepancies && game.tournamentId) {
      console.log('[GAME-TO-SOCIAL] Step 1: Resolving discrepancy links...');
      
      const discrepancyResult = await resolveDiscrepancyLinks(game, options);
      
      result.discrepanciesResolved = discrepancyResult.resolved;
      result.discrepancyDetails = discrepancyResult.details;
      
      if (discrepancyResult.resolved > 0) {
        console.log(`[GAME-TO-SOCIAL] Resolved ${discrepancyResult.resolved} discrepancy links`);
      }
    } else {
      console.log('[GAME-TO-SOCIAL] Step 1: Skipping discrepancy resolution (no tournamentId or disabled)');
    }
    
    // =========================================================================
    // STEP 2: Get existing links for this game (to avoid duplicates)
    // =========================================================================
    const existingGameLinks = await getLinksByGame(game.id);
    const linkedPostIds = new Set(existingGameLinks.map(l => l.socialPostId));
    result.existingLinks = existingGameLinks.length;
    
    console.log(`[GAME-TO-SOCIAL] Game has ${existingGameLinks.length} existing links`);
    
    // =========================================================================
    // STEP 3: Find candidate posts
    // =========================================================================
    console.log(`[GAME-TO-SOCIAL] Finding candidate posts...`);
    const matchResult = await findMatchingPosts(game, {
      maxCandidates,
      excludePostIds: includeAlreadyLinked ? [] : Array.from(linkedPostIds),
      includeTicketData,
      includeReconciliationPreview
    });
    
    result.candidatesFound = matchResult.candidatesFound;
    result.candidatesScored = matchResult.candidates.length;
    
    // Build match context for result
    const searchRange = getPostSearchRange(game);
    result.matchContext = {
      matchMethod: game.tournamentId ? 'tournament_id_and_fuzzy' : 'venue_date',
      venueId: game.venueId,
      venueName: game.venueName || null,
      searchRange: {
        searchStart: searchRange.start,
        searchEnd: searchRange.end
      },
      candidatesScored: result.candidatesScored,
      candidatesAboveMinimum: matchResult.candidates.filter(c => c.matchConfidence >= autoLinkThreshold).length,
      // NEW v3.0.0: Discrepancy context
      pendingDiscrepanciesFound: result.discrepancyDetails.length,
      discrepanciesResolvedByTournamentId: result.discrepanciesResolved
    };
    
    console.log(`[GAME-TO-SOCIAL] Found ${matchResult.candidatesFound} candidates, ${matchResult.candidates.length} scored above minimum`);
    
    // Log ticket data summary from candidates
    const candidatesWithTickets = matchResult.candidates.filter(c => c.hasTicketData);
    const candidatesWithReconciliationIssues = matchResult.candidates.filter(
      c => c.reconciliationPreview?.hasDiscrepancy
    );
    
    result.ticketDataSummary.postsWithTicketData = candidatesWithTickets.length;
    result.ticketDataSummary.totalTicketsFromPosts = candidatesWithTickets.reduce(
      (sum, c) => sum + (c.ticketData?.totalTicketsExtracted || 0), 0
    );
    result.ticketDataSummary.postsWithReconciliationIssues = candidatesWithReconciliationIssues.length;
    
    if (candidatesWithTickets.length > 0) {
      console.log(`[GAME-TO-SOCIAL] ${candidatesWithTickets.length} candidates have ticket data, ${candidatesWithReconciliationIssues.length} have reconciliation issues`);
    }
    
    if (matchResult.candidates.length === 0) {
      console.log(`[GAME-TO-SOCIAL] No matching posts found`);
      result.success = true;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
    
    // Filter candidates above auto-link threshold
    const autoLinkCandidates = matchResult.candidates.filter(
      c => c.matchConfidence >= autoLinkThreshold
    );
    
    console.log(`[GAME-TO-SOCIAL] ${autoLinkCandidates.length} candidates above auto-link threshold (${autoLinkThreshold}%)`);
    
    // =========================================================================
    // STEP 4: Create links for qualifying candidates
    // =========================================================================
    if (!skipLinking && autoLinkCandidates.length > 0) {
      console.log(`[GAME-TO-SOCIAL] Creating links...`);
      
      for (const candidate of autoLinkCandidates) {
        try {
          // Double-check this post isn't already linked to this game
          if (linkedPostIds.has(candidate.socialPostId)) {
            console.log(`[GAME-TO-SOCIAL] Post ${candidate.socialPostId} already linked, skipping`);
            result.linksSkipped++;
            result.linkDetails.push({
              socialPostId: candidate.socialPostId,
              status: 'SKIPPED',
              reason: 'already_linked'
            });
            continue;
          }
          
          // Get existing links for this post to determine mentionOrder
          const postLinks = await getLinksBySocialPost(candidate.socialPostId);
          const mentionOrder = postLinks.length + 1;
          
          // Determine if this should be the primary game for this post
          // Primary if: first link OR higher confidence than existing primary
          let isPrimaryGame = postLinks.length === 0;
          if (!isPrimaryGame) {
            const currentPrimary = postLinks.find(l => l.isPrimaryGame);
            if (currentPrimary && candidate.matchConfidence > (currentPrimary.matchConfidence || 0)) {
              isPrimaryGame = true;
              // We'd need to unset the old primary, but let's keep it simple for now
            }
          }
          
          const now = new Date().toISOString();
          
          // Check if this was a discrepancy link that was just resolved
          const wasDiscrepancyLink = result.discrepancyDetails.some(
            d => d.socialPostId === candidate.socialPostId && d.status === 'RESOLVED'
          );
          
          // Build link record with ticket data
          // UPDATED: matchSignals is now an object from postFinder, stringify it here
          const link = addDataStoreFields({
            id: uuidv4(),
            socialPostId: candidate.socialPostId,
            socialPostGameDataId: candidate.socialPostGameDataId || null,
            gameId: game.id,
            linkType: 'AUTO_MATCHED',
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            matchSignals: safeStringify(candidate.matchSignals),  // Stringify once here
            isPrimaryGame,
            mentionOrder,
            linkedAt: now,
            linkedBy: 'GAME_TO_SOCIAL_MATCHER',
            
            // No scrape discrepancy for successful matches
            hasScrapeDiscrepancy: false,
            
            // NEW: Ticket data fields
            hasTicketData: candidate.hasTicketData || false,
            ticketData: candidate.ticketData ? safeStringify(candidate.ticketData) : null,
            reconciliationPreview: candidate.reconciliationPreview ? safeStringify(candidate.reconciliationPreview) : null,
            hasReconciliationDiscrepancy: candidate.reconciliationPreview?.hasDiscrepancy || false,
            reconciliationDiscrepancySeverity: candidate.reconciliationPreview?.discrepancySeverity || null,
            
            // Extracted data summary for quick access
            extractedWinnerName: candidate.extractedWinnerName || null,
            extractedWinnerPrize: candidate.extractedWinnerPrize || null,
            extractedTotalEntries: candidate.extractedTotalEntries || null,
            extractedBuyIn: candidate.extractedBuyIn || null,
            extractedDate: candidate.extractedDate || null,
            effectiveGameDate: candidate.effectiveGameDate || null,  // NEW: Computed date for queries
            contentType: candidate.contentType || null,
            placementCount: candidate.placementCount || 0,
            
            createdAt: now,
            updatedAt: now
          });
          
          await createSocialPostGameLink(link);
          
          // Update post status and counts
          const newLinkCount = postLinks.length + 1;
          const postUpdate = {
            linkedGameCount: newLinkCount,
            hasUnverifiedLinks: true,
            processingStatus: 'LINKED'
          };
          
          if (isPrimaryGame) {
            postUpdate.linkedGameId = game.id;
            postUpdate.primaryLinkedGameId = game.id;
          }
          
          await updateSocialPost(candidate.socialPostId, postUpdate);
          
          result.linksCreated++;
          result.matchedPosts.push({
            socialPostId: candidate.socialPostId,
            postDate: candidate.postDate,
            contentType: candidate.contentType,
            extractedBuyIn: candidate.extractedBuyIn,
            extractedVenueName: candidate.extractedVenueName,
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            matchSignals: candidate.matchSignals,
            rank: result.matchedPosts.length + 1,
            isPrimaryGame,
            mentionOrder,
            wouldLink: true,
            hasTicketData: candidate.hasTicketData || false,
            hasReconciliationDiscrepancy: candidate.reconciliationPreview?.hasDiscrepancy || false,
            // NEW v3.0.0
            wasDiscrepancyLink,
            discrepancyLinkId: wasDiscrepancyLink ? result.discrepancyDetails.find(d => d.socialPostId === candidate.socialPostId)?.linkId : null
          });
          
          result.linkDetails.push({
            socialPostId: candidate.socialPostId,
            linkId: link.id,
            status: wasDiscrepancyLink ? 'DISCREPANCY_RESOLVED' : 'CREATED',
            reason: null,
            matchConfidence: candidate.matchConfidence,
            hasTicketData: candidate.hasTicketData || false,
            hasReconciliationDiscrepancy: candidate.reconciliationPreview?.hasDiscrepancy || false,
            error: null
          });
          
          // Add to our set to prevent duplicate processing
          linkedPostIds.add(candidate.socialPostId);
          
          console.log(`[GAME-TO-SOCIAL] Created link: ${candidate.socialPostId} -> ${game.id} (${candidate.matchConfidence}%, tickets: ${candidate.hasTicketData || false})`);
          
        } catch (linkError) {
          console.error(`[GAME-TO-SOCIAL] Failed to create link for post ${candidate.socialPostId}:`, linkError);
          result.linkDetails.push({
            socialPostId: candidate.socialPostId,
            status: 'ERROR',
            error: linkError.message
          });
        }
      }
    } else if (skipLinking) {
      console.log(`[GAME-TO-SOCIAL] Skipping link creation (preview mode)`);
      result.matchedPosts = autoLinkCandidates.map((c, idx) => ({
        socialPostId: c.socialPostId,
        postDate: c.postDate,
        contentType: c.contentType,
        extractedBuyIn: c.extractedBuyIn,
        extractedVenueName: c.extractedVenueName,
        matchConfidence: c.matchConfidence,
        matchReason: c.matchReason,
        matchSignals: c.matchSignals,
        rank: idx + 1,
        isPrimaryGame: idx === 0,
        mentionOrder: idx + 1,
        wouldLink: true,
        hasTicketData: c.hasTicketData || false,
        ticketData: c.ticketData || null,
        reconciliationPreview: c.reconciliationPreview || null
      }));
    }
    
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[GAME-TO-SOCIAL] Complete: ${result.linksCreated} links created, ${result.linksSkipped} skipped, ${result.discrepanciesResolved} discrepancies resolved in ${result.processingTimeMs}ms`);
    
    return result;
    
  } catch (error) {
    console.error(`[GAME-TO-SOCIAL] Error matching game ${game.id}:`, error);
    result.error = error.message;
    result.processingTimeMs = Date.now() - startTime;
    return result;
  }
};

// ===================================================================
// STREAM HANDLER - DYNAMODB STREAMS (PRIMARY TRIGGER)
// ===================================================================

/**
 * Handle DynamoDB Stream events from GameFinancialSnapshot table
 * 
 * Triggered AFTER gameFinancialsProcessor completes (sequential).
 * GameFinancialSnapshot only exists for valid, processed games.
 * 
 * This is the primary trigger mechanism.
 */
const handleStreamEvent = async (event) => {
  console.log(`[GAME-TO-SOCIAL] Processing ${event.Records?.length || 0} stream records from GameFinancialSnapshot`);
  
  const results = {
    processed: 0,
    skipped: 0,
    errors: 0,
    linksCreated: 0,
    discrepanciesResolved: 0,  // NEW v3.0.0
    gamesProcessed: new Set(),  // Track unique games (avoid duplicates in batch)
    ticketDataStats: {
      gamesWithTicketMatches: 0,
      totalTicketsFromPosts: 0,
      reconciliationIssues: 0
    },
    details: []
  };
  
  for (const record of event.Records || []) {
    const eventName = record.eventName;
    
    // Only process INSERT events (new snapshots)
    // MODIFY events mean the snapshot was updated, game already processed
    if (eventName !== 'INSERT') {
      console.log(`[GAME-TO-SOCIAL] Skipping ${eventName} event`);
      results.skipped++;
      continue;
    }
    
    try {
      const snapshotImage = record.dynamodb?.NewImage;
      if (!snapshotImage) {
        results.skipped++;
        continue;
      }
      
      const snapshot = unmarshall(snapshotImage);
      const gameId = snapshot.gameId;
      
      if (!gameId) {
        console.log(`[GAME-TO-SOCIAL] Snapshot missing gameId, skipping`);
        results.skipped++;
        continue;
      }
      
      // Skip if we already processed this game in this batch
      if (results.gamesProcessed.has(gameId)) {
        console.log(`[GAME-TO-SOCIAL] Game ${gameId} already processed in this batch, skipping`);
        results.skipped++;
        continue;
      }
      
      // Fetch the full game record
      const game = await getGame(gameId);
      if (!game) {
        console.log(`[GAME-TO-SOCIAL] Game ${gameId} not found, skipping`);
        results.skipped++;
        continue;
      }
      
      // Check if this game should trigger social matching
      const eligibility = shouldMatchGame(game);
      if (!eligibility.should) {
        console.log(`[GAME-TO-SOCIAL] Skipping game ${game.id}: ${eligibility.reason}`);
        results.skipped++;
        continue;
      }
      
      console.log(`[GAME-TO-SOCIAL] Processing game ${game.id} (${game.gameStatus}) - triggered by snapshot ${snapshot.id}`);
      
      // Match this game to social posts
      const matchResult = await matchGameToSocialPosts(game, {
        autoLinkThreshold: DEFAULT_AUTO_LINK_THRESHOLD,
        skipLinking: false,
        includeTicketData: true,
        includeReconciliationPreview: true,
        resolveDiscrepancies: true  // NEW v3.0.0
      });
      
      results.processed++;
      results.linksCreated += matchResult.linksCreated || 0;
      results.discrepanciesResolved += matchResult.discrepanciesResolved || 0;  // NEW v3.0.0
      results.gamesProcessed.add(gameId);
      
      // Track ticket data stats
      if (matchResult.ticketDataSummary) {
        if (matchResult.ticketDataSummary.postsWithTicketData > 0) {
          results.ticketDataStats.gamesWithTicketMatches++;
        }
        results.ticketDataStats.totalTicketsFromPosts += matchResult.ticketDataSummary.totalTicketsFromPosts || 0;
        results.ticketDataStats.reconciliationIssues += matchResult.ticketDataSummary.postsWithReconciliationIssues || 0;
      }
      
      results.details.push({
        gameId: game.id,
        gameName: game.name,
        snapshotId: snapshot.id,
        eventName,
        candidatesFound: matchResult.candidatesFound,
        linksCreated: matchResult.linksCreated,
        linksSkipped: matchResult.linksSkipped,
        discrepanciesResolved: matchResult.discrepanciesResolved,  // NEW v3.0.0
        ticketDataSummary: matchResult.ticketDataSummary,
        success: matchResult.success
      });
      
    } catch (error) {
      console.error('[GAME-TO-SOCIAL] Error processing record:', error);
      results.errors++;
      results.details.push({
        error: error.message,
        record: record.eventID
      });
    }
  }
  
  console.log(`[GAME-TO-SOCIAL] Stream complete: ${results.processed} games processed, ${results.linksCreated} links created, ${results.discrepanciesResolved} discrepancies resolved, ${results.skipped} skipped, ${results.errors} errors`);
  console.log(`[GAME-TO-SOCIAL] Ticket stats: ${results.ticketDataStats.gamesWithTicketMatches} games with ticket matches, ${results.ticketDataStats.reconciliationIssues} reconciliation issues`);
  
  return {
    ...results,
    gamesProcessed: Array.from(results.gamesProcessed)
  };
};

// ===================================================================
// HANDLER - GRAPHQL MUTATIONS
// ===================================================================

/**
 * Handle GraphQL mutation invocations
 */
const handleGraphQLInvocation = async (event) => {
  const { fieldName, arguments: args } = event;
  const input = args?.input || {};
  
  switch (fieldName) {
    case 'matchGameToSocialPosts': {
      // Get game by ID
      const game = await getGame(input.gameId);
      if (!game) {
        return {
          success: false,
          gameId: input.gameId,
          error: `Game not found: ${input.gameId}`
        };
      }
      
      return await matchGameToSocialPosts(game, {
        autoLinkThreshold: input.autoLinkThreshold,
        skipLinking: input.previewOnly === true,
        maxCandidates: input.maxCandidates,
        includeTicketData: input.includeTicketData !== false,
        includeReconciliationPreview: input.includeReconciliationPreview !== false,
        resolveDiscrepancies: input.resolveDiscrepancies !== false  // NEW v3.0.0
      });
    }
    
    case 'batchMatchGamesToSocialPosts': {
      const gameIds = input.gameIds || [];
      const options = {
        autoLinkThreshold: input.autoLinkThreshold,
        skipLinking: input.previewOnly === true,
        maxCandidates: input.maxCandidates,
        includeTicketData: input.includeTicketData !== false,
        includeReconciliationPreview: input.includeReconciliationPreview !== false,
        resolveDiscrepancies: input.resolveDiscrepancies !== false  // NEW v3.0.0
      };
      
      const batchResults = [];
      const ticketStats = {
        gamesWithTicketMatches: 0,
        totalTicketsFromPosts: 0,
        reconciliationIssues: 0
      };
      let totalDiscrepanciesResolved = 0;  // NEW v3.0.0
      
      for (const gameId of gameIds) {
        const game = await getGame(gameId);
        if (!game) {
          batchResults.push({
            success: false,
            gameId,
            error: `Game not found: ${gameId}`
          });
          continue;
        }
        
        const result = await matchGameToSocialPosts(game, options);
        batchResults.push(result);
        
        // Aggregate ticket stats
        if (result.ticketDataSummary) {
          if (result.ticketDataSummary.postsWithTicketData > 0) {
            ticketStats.gamesWithTicketMatches++;
          }
          ticketStats.totalTicketsFromPosts += result.ticketDataSummary.totalTicketsFromPosts || 0;
          ticketStats.reconciliationIssues += result.ticketDataSummary.postsWithReconciliationIssues || 0;
        }
        
        // NEW v3.0.0
        totalDiscrepanciesResolved += result.discrepanciesResolved || 0;
      }
      
      return {
        totalRequested: gameIds.length,
        processed: batchResults.filter(r => r.success).length,
        totalLinksCreated: batchResults.reduce((sum, r) => sum + (r.linksCreated || 0), 0),
        totalLinksSkipped: batchResults.reduce((sum, r) => sum + (r.linksSkipped || 0), 0),
        totalDiscrepanciesResolved,  // NEW v3.0.0
        ticketStats,
        results: batchResults
      };
    }
    
    case 'previewGameToSocialMatch': {
      const game = await getGame(input.gameId);
      if (!game) {
        return {
          success: false,
          gameId: input.gameId,
          error: `Game not found: ${input.gameId}`
        };
      }
      
      // Preview mode - don't create links
      return await matchGameToSocialPosts(game, {
        autoLinkThreshold: input.autoLinkThreshold || 0, // Show all candidates
        skipLinking: true,
        maxCandidates: input.maxCandidates || 50,
        includeTicketData: true,
        includeReconciliationPreview: true,
        resolveDiscrepancies: false  // Don't resolve in preview mode
      });
    }
    
    default:
      throw new Error(`Unknown operation: ${fieldName}`);
  }
};

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event, context) => {
  console.log('[GAME-TO-SOCIAL] Handler invoked');
  console.log('[GAME-TO-SOCIAL] Event:', JSON.stringify(event, null, 2));
  
  try {
    // =========================================================
    // PRIORITY 1: DynamoDB Stream events (primary trigger)
    // =========================================================
    if (event.Records && Array.isArray(event.Records)) {
      return await handleStreamEvent(event);
    }
    
    // =========================================================
    // PRIORITY 2: GraphQL invocation
    // =========================================================
    if (event.typeName && event.fieldName) {
      return await handleGraphQLInvocation(event);
    }
    
    // =========================================================
    // PRIORITY 3: Direct invocation with game object
    // (supports invocation from other Lambdas if needed)
    // =========================================================
    if (event.game) {
      return await matchGameToSocialPosts(event.game, {
        ...(event.options || {}),
        includeTicketData: true,
        includeReconciliationPreview: true,
        resolveDiscrepancies: true
      });
    }
    
    // =========================================================
    // PRIORITY 4: Direct invocation with gameId
    // =========================================================
    if (event.gameId) {
      const game = await getGame(event.gameId);
      if (!game) {
        return {
          success: false,
          gameId: event.gameId,
          error: `Game not found: ${event.gameId}`
        };
      }
      return await matchGameToSocialPosts(game, {
        ...(event.options || {}),
        includeTicketData: true,
        includeReconciliationPreview: true,
        resolveDiscrepancies: true
      });
    }
    
    return {
      success: false,
      error: 'Invalid invocation - provide Records (stream), game, gameId, or use GraphQL mutation'
    };
    
  } catch (error) {
    console.error('[GAME-TO-SOCIAL] Handler error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  handler: exports.handler,
  handleStreamEvent,
  matchGameToSocialPosts,
  resolveDiscrepancyLinks,  // NEW v3.0.0
  shouldMatchGame,
  safeStringify,  // Export for testing
  MATCH_TRIGGER_STATUSES,
  DEFAULT_AUTO_LINK_THRESHOLD
};