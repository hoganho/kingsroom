/**
 * operations/processSocialPost.js
 * Main processing logic for a single social post
 */

const { v4: uuidv4 } = require('uuid');
const { 
  getSocialPost, 
  updateSocialPost, 
  createSocialPostGameData,
  createSocialPostPlacement,
  createSocialPostGameLink,
  getExtractionBySocialPost
} = require('../utils/graphql');
const { classifyContent, shouldSkipPost } = require('../extraction/contentClassifier');
const { extractGameData } = require('../extraction/dataExtractor');
const { parsePlacements, createPlacementRecords, extractWinnerInfo } = require('../extraction/placementParser');
const { findMatchingGames, getAutoLinkCandidates } = require('../matching/gameMatcher');

// Processing version for tracking
const PROCESSING_VERSION = '1.0.0';

// Default auto-link threshold
const DEFAULT_AUTO_LINK_THRESHOLD = 80;

/**
 * Process a single social post
 * 
 * @param {Object} input - ProcessSocialPostInput
 * @returns {Object} ProcessSocialPostResult
 */
const processSocialPost = async (input) => {
  const startTime = Date.now();
  const { 
    socialPostId, 
    forceReprocess = false,
    skipMatching = false,
    skipLinking = false,
    matchThreshold = DEFAULT_AUTO_LINK_THRESHOLD
  } = input;
  
  console.log(`[PROCESS] Starting processing for post: ${socialPostId}`);
  
  const result = {
    success: false,
    socialPostId,
    processingStatus: 'PROCESSING',
    error: null,
    warnings: [],
    extractedGameData: null,
    placementsExtracted: 0,
    matchCandidates: [],
    primaryMatch: null,
    linksCreated: 0,
    linksSkipped: 0,
    linkDetails: [],
    processingTimeMs: 0
  };
  
  try {
    // === STEP 1: Get the social post ===
    const post = await getSocialPost(socialPostId);
    
    if (!post) {
      result.error = `Social post not found: ${socialPostId}`;
      result.processingStatus = 'FAILED';
      return result;
    }
    
    console.log(`[PROCESS] Found post from ${post.postedAt}, type: ${post.postType}`);
    
    // === STEP 2: Check if should skip ===
    const skipCheck = shouldSkipPost(post);
    if (skipCheck.skip && !forceReprocess) {
      console.log(`[PROCESS] Skipping: ${skipCheck.reason}`);
      result.processingStatus = 'SKIPPED';
      result.warnings.push(skipCheck.reason);
      result.success = true;
      return result;
    }
    
    // Check if already processed
    if (post.processingStatus === 'LINKED' && !forceReprocess) {
      console.log('[PROCESS] Already processed and linked, skipping');
      result.processingStatus = 'LINKED';
      result.success = true;
      return result;
    }
    
    // Update status to PROCESSING
    await updateSocialPost(socialPostId, { processingStatus: 'PROCESSING' });
    
    // === STEP 3: Classify content ===
    console.log('[PROCESS] Classifying content...');
    const classification = classifyContent(post);
    
    console.log(`[PROCESS] Classification: ${classification.contentType} (${classification.confidence})`);
    
    // Skip non-relevant content
    if (classification.contentType === 'GENERAL' || classification.contentType === 'COMMENT') {
      console.log('[PROCESS] Content is GENERAL/COMMENT, marking as skipped');
      
      await updateSocialPost(socialPostId, {
        processingStatus: 'SKIPPED',
        processedAt: new Date().toISOString(),
        contentType: classification.contentType,
        contentTypeConfidence: classification.confidence
      });
      
      result.processingStatus = 'SKIPPED';
      result.success = true;
      return result;
    }
    
    // === STEP 4: Extract game data ===
    console.log('[PROCESS] Extracting game data...');
    const extracted = await extractGameData(post);
    
    // Add classification to extracted data
    extracted.contentType = classification.contentType;
    extracted.contentTypeConfidence = classification.confidence;
    extracted.resultScore = classification.resultScore;
    extracted.promoScore = classification.promoScore;
    
    console.log('[PROCESS] Extraction complete:', {
      tournamentId: extracted.extractedTournamentId,
      buyIn: extracted.extractedBuyIn,
      guarantee: extracted.extractedGuarantee,
      entries: extracted.extractedTotalEntries,
      prizePool: extracted.extractedPrizePool
    });
    
    // === STEP 5: Parse placements (for RESULT posts) ===
    let placements = [];
    if (classification.contentType === 'RESULT') {
      console.log('[PROCESS] Parsing placements...');
      placements = parsePlacements(post.content);
      console.log(`[PROCESS] Found ${placements.length} placements`);
      
      // Add winner info to extracted data
      const winnerInfo = extractWinnerInfo(placements);
      Object.assign(extracted, winnerInfo);
      extracted.placementCount = placements.length;
    }
    
    // === STEP 6: Save extraction data ===
    console.log('[PROCESS] Saving extraction data...');
    const extractionId = uuidv4();
    const extractionRecord = {
      id: extractionId,
      socialPostId,
      ...extracted,
      patternMatches: JSON.stringify(classification.matches),
      extractedPrizes: JSON.stringify(extracted.extractedPrizes),
      extractedAt: new Date().toISOString(),
      extractionVersion: PROCESSING_VERSION
    };
    
    // Remove fields that shouldn't be in the record
    delete extractionRecord.extractedPrizes;  // Already stringified above
    
    await createSocialPostGameData(extractionRecord);
    result.extractedGameData = extractionRecord;
    
    // Save placements
    if (placements.length > 0) {
      const placementRecords = createPlacementRecords(placements, socialPostId, extractionId);
      for (const placement of placementRecords) {
        await createSocialPostPlacement(placement);
      }
      result.placementsExtracted = placements.length;
    }
    
    // Update post with extraction reference
    await updateSocialPost(socialPostId, {
      extractedGameDataId: extractionId,
      contentType: classification.contentType,
      contentTypeConfidence: classification.confidence,
      processingStatus: 'EXTRACTED'
    });
    
    result.processingStatus = 'EXTRACTED';
    
    // === STEP 7: Match to games ===
    if (!skipMatching) {
      console.log('[PROCESS] Matching to games...');
      
      const matchResult = await findMatchingGames(extracted, post);
      
      result.matchCandidates = matchResult.candidates;
      result.primaryMatch = matchResult.primaryMatch;
      
      console.log(`[PROCESS] Found ${matchResult.matchCount} match candidates`);
      
      if (matchResult.primaryMatch) {
        console.log(`[PROCESS] Primary match: ${matchResult.primaryMatch.gameId} (${matchResult.primaryMatch.matchConfidence}%)`);
      }
      
      // Update status
      await updateSocialPost(socialPostId, {
        processingStatus: 'MATCHED'
      });
      
      result.processingStatus = 'MATCHED';
      
      // === STEP 8: Create links ===
      if (!skipLinking && matchResult.candidates.length > 0) {
        console.log('[PROCESS] Creating links...');
        
        const autoLinkCandidates = getAutoLinkCandidates(matchResult.candidates, matchThreshold);
        
        console.log(`[PROCESS] ${autoLinkCandidates.length} candidates above auto-link threshold (${matchThreshold})`);
        
        for (let i = 0; i < autoLinkCandidates.length; i++) {
          const candidate = autoLinkCandidates[i];
          
          const link = {
            id: uuidv4(),
            socialPostId,
            gameId: candidate.gameId,
            linkType: 'AUTO_MATCHED',
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            matchSignals: JSON.stringify(candidate.matchSignals),
            isPrimaryGame: i === 0,
            mentionOrder: i + 1,
            extractedVenueName: extracted.extractedVenueName,
            extractedDate: extracted.extractedDate,
            extractedBuyIn: extracted.extractedBuyIn,
            extractedGuarantee: extracted.extractedGuarantee,
            linkedAt: new Date().toISOString(),
            linkedBy: 'SYSTEM'
          };
          
          await createSocialPostGameLink(link);
          result.linkDetails.push(link);
          result.linksCreated++;
        }
        
        // Count skipped
        result.linksSkipped = matchResult.candidates.length - autoLinkCandidates.length;
        
        // Update post status and counts
        const primaryLinkGameId = result.linkDetails.length > 0 
          ? result.linkDetails[0].gameId 
          : null;
        
        await updateSocialPost(socialPostId, {
          processingStatus: 'LINKED',
          processedAt: new Date().toISOString(),
          processingVersion: PROCESSING_VERSION,
          linkedGameId: primaryLinkGameId,  // Legacy field
          primaryLinkedGameId: primaryLinkGameId,
          linkedGameCount: result.linksCreated,
          hasUnverifiedLinks: result.linksCreated > 0
        });
        
        result.processingStatus = 'LINKED';
      }
    }
    
    // === SUCCESS ===
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[PROCESS] Processing complete in ${result.processingTimeMs}ms`);
    
    return result;
    
  } catch (error) {
    console.error('[PROCESS] Error:', error);
    
    result.error = error.message;
    result.processingStatus = 'FAILED';
    result.processingTimeMs = Date.now() - startTime;
    
    // Try to update post status
    try {
      await updateSocialPost(socialPostId, {
        processingStatus: 'FAILED',
        processingError: error.message,
        processedAt: new Date().toISOString()
      });
    } catch (updateError) {
      console.error('[PROCESS] Failed to update post status:', updateError);
    }
    
    return result;
  }
};

/**
 * Preview match without saving anything
 * 
 * @param {string} socialPostId - ID of post to preview
 * @returns {Object} ProcessSocialPostResult (preview only)
 */
const previewMatch = async (socialPostId) => {
  const startTime = Date.now();
  
  const result = {
    success: false,
    socialPostId,
    processingStatus: null,
    error: null,
    warnings: [],
    extractedGameData: null,
    placementsExtracted: 0,
    matchCandidates: [],
    primaryMatch: null,
    linksCreated: 0,
    linksSkipped: 0,
    linkDetails: [],
    processingTimeMs: 0
  };
  
  try {
    // Get the post
    const post = await getSocialPost(socialPostId);
    
    if (!post) {
      result.error = `Social post not found: ${socialPostId}`;
      return result;
    }
    
    // Classify
    const classification = classifyContent(post);
    
    // Extract
    const extracted = await extractGameData(post);
    extracted.contentType = classification.contentType;
    extracted.contentTypeConfidence = classification.confidence;
    extracted.resultScore = classification.resultScore;
    extracted.promoScore = classification.promoScore;
    
    // Parse placements
    let placements = [];
    if (classification.contentType === 'RESULT') {
      placements = parsePlacements(post.content);
      const winnerInfo = extractWinnerInfo(placements);
      Object.assign(extracted, winnerInfo);
      extracted.placementCount = placements.length;
    }
    
    result.extractedGameData = extracted;
    result.placementsExtracted = placements.length;
    
    // Match
    const matchResult = await findMatchingGames(extracted, post);
    result.matchCandidates = matchResult.candidates;
    result.primaryMatch = matchResult.primaryMatch;
    
    result.success = true;
    result.processingStatus = 'PREVIEW';
    result.processingTimeMs = Date.now() - startTime;
    
    return result;
    
  } catch (error) {
    result.error = error.message;
    result.processingTimeMs = Date.now() - startTime;
    return result;
  }
};

/**
 * Preview extraction on raw content WITHOUT saving anything
 * This allows users to see what would be extracted before uploading
 * 
 * @param {Object} input - PreviewContentExtractionInput
 * @param {string} input.content - Post content to analyze
 * @param {string} [input.postedAt] - Posted date for matching
 * @param {string} [input.platform] - Platform (facebook, etc)
 * @param {string} [input.entityId] - Entity ID for venue/game filtering
 * @param {string} [input.venueId] - Venue ID for game filtering
 * @param {string} [input.url] - Post URL (for extraction hints)
 * @returns {Object} ProcessSocialPostResult (preview only, no saves)
 */
const previewContentExtraction = async (input) => {
  const startTime = Date.now();
  const { 
    content, 
    postedAt, 
    platform = 'FACEBOOK',
    entityId,
    venueId,
    url 
  } = input;
  
  console.log('[PREVIEW] Starting content preview extraction');
  console.log('[PREVIEW] Content length:', content?.length || 0);
  
  const result = {
    success: false,
    socialPostId: null, // No saved post
    processingStatus: 'PREVIEW',
    error: null,
    warnings: [],
    extractedGameData: null,
    placementsExtracted: 0,
    matchCandidates: [],
    primaryMatch: null,
    linksCreated: 0,
    linksSkipped: 0,
    linkDetails: [],
    processingTimeMs: 0
  };
  
  try {
    if (!content || content.trim().length === 0) {
      result.error = 'Content is required for preview';
      return result;
    }
    
    // Create a mock post object for the extraction functions
    const mockPost = {
      id: 'preview-' + Date.now(),
      content,
      contentPreview: content.substring(0, 200),
      postedAt: postedAt || new Date().toISOString(),
      platform,
      url,
      entityId,
      venueId,
      socialAccountId: null,
      postType: 'POST'
    };
    
    // === STEP 1: Classify content ===
    console.log('[PREVIEW] Classifying content...');
    const classification = classifyContent(mockPost);
    console.log(`[PREVIEW] Classification: ${classification.contentType} (${classification.confidence}%)`);
    
    // === STEP 2: Extract game data ===
    console.log('[PREVIEW] Extracting game data...');
    const extracted = await extractGameData(mockPost);
    
    // Add classification to extracted data
    extracted.contentType = classification.contentType;
    extracted.contentTypeConfidence = classification.confidence;
    extracted.resultScore = classification.resultScore;
    extracted.promoScore = classification.promoScore;
    
    console.log('[PREVIEW] Extraction complete:', {
      contentType: extracted.contentType,
      tournamentId: extracted.extractedTournamentId,
      buyIn: extracted.extractedBuyIn,
      guarantee: extracted.extractedGuarantee,
      entries: extracted.extractedTotalEntries
    });
    
    // === STEP 3: Parse placements (for RESULT posts) ===
    let placements = [];
    if (classification.contentType === 'RESULT') {
      console.log('[PREVIEW] Parsing placements...');
      placements = parsePlacements(content);
      console.log(`[PREVIEW] Found ${placements.length} placements`);
      
      // Add winner info
      const winnerInfo = extractWinnerInfo(placements);
      Object.assign(extracted, winnerInfo);
      extracted.placementCount = placements.length;
      
      // Add placement preview data
      extracted.placementsPreview = placements.slice(0, 10).map(p => ({
        position: p.position,
        playerName: p.playerName,
        prize: p.prize,
        prizeRaw: p.prizeRaw
      }));
    }
    
    // Store extracted data
    result.extractedGameData = extracted;
    result.placementsExtracted = placements.length;
    
    // === STEP 4: Match to games ===
    // Only if content is RESULT or PROMOTIONAL
    if (classification.contentType !== 'GENERAL' && classification.contentType !== 'COMMENT') {
      console.log('[PREVIEW] Matching to games...');
      
      // Add entity/venue hints for better matching
      if (entityId) extracted.entityId = entityId;
      if (venueId) extracted.suggestedVenueId = venueId;
      
      const matchResult = await findMatchingGames(extracted, mockPost);
      
      result.matchCandidates = matchResult.candidates;
      result.primaryMatch = matchResult.primaryMatch;
      
      console.log(`[PREVIEW] Found ${matchResult.matchCount} match candidates`);
    } else {
      result.warnings.push(`Content classified as ${classification.contentType} - no game matching performed`);
    }
    
    // === SUCCESS ===
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[PREVIEW] Preview complete in ${result.processingTimeMs}ms`);
    
    return result;
    
  } catch (error) {
    console.error('[PREVIEW] Error:', error);
    result.error = error.message;
    result.processingTimeMs = Date.now() - startTime;
    return result;
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  processSocialPost,
  previewMatch,
  previewContentExtraction,
  PROCESSING_VERSION,
  DEFAULT_AUTO_LINK_THRESHOLD
};