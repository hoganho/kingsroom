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
 * VERSION: 2.0.0
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
 * 4. Find candidate social posts (by date range, venue, status)
 * 5. Score each post against the game using scoringEngine
 * 6. Create SocialPostGameLink for matches above threshold
 * 7. SocialPostGameLink stream → socialDataAggregator → Game enriched
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
  updateSocialPost
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
 */
const safeStringify = (obj) => {
  if (!obj) return null;
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.error('[GAME-TO-SOCIAL] Failed to stringify:', e.message);
    return null;
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
    includeReconciliationPreview = true
  } = options;
  
  const startTime = Date.now();
  
  console.log(`[GAME-TO-SOCIAL] Starting match for game: ${game.id}`);
  console.log(`[GAME-TO-SOCIAL] Game: ${game.name} @ ${game.gameStartDateTime}`);
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
    ticketDataSummary: {
      postsWithTicketData: 0,
      totalTicketsFromPosts: 0,
      postsWithReconciliationIssues: 0
    },
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
    
    // Get existing links for this game (to avoid duplicates)
    const existingGameLinks = await getLinksByGame(game.id);
    const linkedPostIds = new Set(existingGameLinks.map(l => l.socialPostId));
    result.existingLinks = existingGameLinks.length;
    
    console.log(`[GAME-TO-SOCIAL] Game has ${existingGameLinks.length} existing links`);
    
    // Find candidate posts
    console.log(`[GAME-TO-SOCIAL] Finding candidate posts...`);
    const matchResult = await findMatchingPosts(game, {
      maxCandidates,
      excludePostIds: includeAlreadyLinked ? [] : Array.from(linkedPostIds),
      includeTicketData,
      includeReconciliationPreview
    });
    
    result.candidatesFound = matchResult.candidatesFound;
    result.candidatesScored = matchResult.candidates.length;
    
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
    
    // Create links for qualifying candidates
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
          
          // Build link record with ticket data
          const link = addDataStoreFields({
            id: uuidv4(),
            socialPostId: candidate.socialPostId,
            socialPostGameDataId: candidate.socialPostGameDataId || null,
            gameId: game.id,
            linkType: 'AUTO_MATCHED',
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            matchSignals: candidate.matchSignals,
            isPrimaryGame,
            mentionOrder,
            linkedAt: now,
            linkedBy: 'GAME_TO_SOCIAL_MATCHER',
            
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
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            isPrimaryGame,
            mentionOrder,
            hasTicketData: candidate.hasTicketData || false,
            hasReconciliationDiscrepancy: candidate.reconciliationPreview?.hasDiscrepancy || false
          });
          
          result.linkDetails.push({
            socialPostId: candidate.socialPostId,
            linkId: link.id,
            status: 'CREATED',
            matchConfidence: candidate.matchConfidence,
            hasTicketData: candidate.hasTicketData || false,
            hasReconciliationDiscrepancy: candidate.reconciliationPreview?.hasDiscrepancy || false
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
      result.matchedPosts = autoLinkCandidates.map(c => ({
        socialPostId: c.socialPostId,
        matchConfidence: c.matchConfidence,
        matchReason: c.matchReason,
        wouldLink: true,
        hasTicketData: c.hasTicketData || false,
        ticketData: c.ticketData || null,
        reconciliationPreview: c.reconciliationPreview || null
      }));
    }
    
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[GAME-TO-SOCIAL] Complete: ${result.linksCreated} links created, ${result.linksSkipped} skipped in ${result.processingTimeMs}ms`);
    
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
        includeReconciliationPreview: true
      });
      
      results.processed++;
      results.linksCreated += matchResult.linksCreated || 0;
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
  
  console.log(`[GAME-TO-SOCIAL] Stream complete: ${results.processed} games processed, ${results.linksCreated} links created, ${results.skipped} skipped, ${results.errors} errors`);
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
        includeReconciliationPreview: input.includeReconciliationPreview !== false
      });
    }
    
    case 'batchMatchGamesToSocialPosts': {
      const gameIds = input.gameIds || [];
      const options = {
        autoLinkThreshold: input.autoLinkThreshold,
        skipLinking: input.previewOnly === true,
        maxCandidates: input.maxCandidates,
        includeTicketData: input.includeTicketData !== false,
        includeReconciliationPreview: input.includeReconciliationPreview !== false
      };
      
      const batchResults = [];
      const ticketStats = {
        gamesWithTicketMatches: 0,
        totalTicketsFromPosts: 0,
        reconciliationIssues: 0
      };
      
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
      }
      
      return {
        totalRequested: gameIds.length,
        processed: batchResults.filter(r => r.success).length,
        totalLinksCreated: batchResults.reduce((sum, r) => sum + (r.linksCreated || 0), 0),
        totalLinksSkipped: batchResults.reduce((sum, r) => sum + (r.linksSkipped || 0), 0),
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
        includeReconciliationPreview: true
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
        includeReconciliationPreview: true
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
        includeReconciliationPreview: true
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
  shouldMatchGame,
  MATCH_TRIGGER_STATUSES,
  DEFAULT_AUTO_LINK_THRESHOLD
};