/**
 * operations/processSocialPost.js
 * Main processing logic for a single social post
 * 
 * UPDATED: Now sets ALL classification fields including tags
 * This is the single source of truth for classification logic
 */

const { v4: uuidv4 } = require('uuid');
const { 
  getSocialPost, 
  updateSocialPost, 
  createSocialPostGameData,
  updateSocialPostGameData,
  createSocialPostPlacement,
  createSocialPostGameLink,
  getExtractionBySocialPost
} = require('../utils/graphql');
const { classifyContent, shouldSkipPost } = require('../extraction/contentClassifier');
const { extractGameData } = require('../extraction/dataExtractor');
const { parsePlacements, createPlacementRecords, extractWinnerInfo } = require('../extraction/placementParser');
const { findMatchingGames, getAutoLinkCandidates } = require('../matching/gameMatcher');

// Processing version for tracking
const PROCESSING_VERSION = '1.1.0'; // Bumped for tag generation

// Default auto-link threshold
const DEFAULT_AUTO_LINK_THRESHOLD = 80;

/**
 * Helper to add DataStore required fields to a record
 * These fields are required for Amplify DataStore sync to work properly
 */
const addDataStoreFields = (record) => {
  return {
    ...record,
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null,
  };
};

// ============================================
// TAG GENERATION (Single source of truth)
// ============================================

/**
 * Extract hashtags from content
 */
const extractHashtags = (content) => {
  if (!content) return [];
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return matches.map(tag => tag.substring(1).toLowerCase());
};

/**
 * Generate comprehensive tags based on classification and extracted data
 * This is THE authoritative tag generation - used by both manual upload and FB fetch
 * 
 * @param {Object} params
 * @param {string} params.content - Post content
 * @param {Object} params.classification - Result from classifyContent()
 * @param {Object} params.extracted - Result from extractGameData()
 * @param {number} params.placementCount - Number of placements found
 * @param {string[]} params.existingTags - Any existing tags (e.g., hashtags already saved)
 * @returns {string[]} Complete tag array
 */
const generateClassificationTags = ({ content, classification, extracted, placementCount = 0, existingTags = [] }) => {
  const tags = new Set(existingTags);
  
  // 1. Extract hashtags from content
  const hashtags = extractHashtags(content);
  hashtags.forEach(tag => tags.add(tag));
  
  // 2. Classification tags based on contentType
  if (classification.contentType === 'RESULT') {
    tags.add('tournament-result');
  } else if (classification.contentType === 'PROMOTIONAL') {
    tags.add('promotional');
  }
  
  // 3. Content indicator tags
  if (placementCount > 0) {
    tags.add('has-placements');
  }
  
  if (extracted) {
    if (extracted.extractedTotalEntries) tags.add('has-entries');
    if (extracted.extractedPrizePool) tags.add('has-prize-pool');
    if (extracted.extractedBuyIn) tags.add('has-buyin');
    if (extracted.extractedGuarantee) tags.add('has-guarantee');
    if (extracted.extractedTournamentId) tags.add('has-tournament-id');
    if (extracted.extractedVenueId || extracted.extractedVenueName) tags.add('venue-detected');
    
    // Game variant tags
    if (extracted.extractedGameVariant) {
      const variant = extracted.extractedGameVariant.toUpperCase();
      if (variant.includes('NLH') || variant.includes('HOLDEM')) tags.add('nlh');
      if (variant.includes('PLO') || variant.includes('OMAHA')) tags.add('plo');
    }
    
    // Tournament type tags
    if (extracted.extractedTournamentType) {
      const type = extracted.extractedTournamentType.toLowerCase();
      if (type.includes('bounty') || type.includes('knockout')) tags.add('bounty');
      if (type.includes('turbo')) tags.add('turbo');
      if (type.includes('deep')) tags.add('deep-stack');
      if (type.includes('satellite')) tags.add('satellite');
    }
  }
  
  // 4. Pattern-based tags from content (fallback if extracted data doesn't have them)
  if (content) {
    if (/\bbounty\b|\bko\b|\bknockout\b|\bpko\b/i.test(content) && !tags.has('bounty')) {
      tags.add('bounty');
    }
    if (/\bnlh(?:e)?\b|\bno\s*limit\s*hold/i.test(content) && !tags.has('nlh')) {
      tags.add('nlh');
    }
    if (/\bplo\b|\bpot\s*limit\s*omaha/i.test(content) && !tags.has('plo')) {
      tags.add('plo');
    }
    if (/\bturbo\b/i.test(content) && !tags.has('turbo')) {
      tags.add('turbo');
    }
    if (/\bdeep\s*stack\b/i.test(content) && !tags.has('deep-stack')) {
      tags.add('deep-stack');
    }
    if (/\bsatellite\b|\bsat\b/i.test(content) && !tags.has('satellite')) {
      tags.add('satellite');
    }
  }
  
  return Array.from(tags);
};

/**
 * Build classification flags for SocialPost update
 */
const buildClassificationFlags = (classification) => {
  const contentType = classification.contentType;
  
  return {
    isPromotional: contentType === 'PROMOTIONAL',
    isTournamentRelated: contentType === 'RESULT' || contentType === 'PROMOTIONAL',
    isTournamentResult: contentType === 'RESULT',
  };
};

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
      
      // Generate tags even for skipped posts (hashtags + type)
      const tags = generateClassificationTags({
        content: post.content,
        classification,
        extracted: null,
        placementCount: 0,
        existingTags: post.tags || []
      });
      
      const classificationFlags = buildClassificationFlags(classification);
      
      await updateSocialPost(socialPostId, {
        processingStatus: 'SKIPPED',
        processedAt: new Date().toISOString(),
        contentType: classification.contentType,
        contentTypeConfidence: classification.confidence,
        tags,
        ...classificationFlags
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
    const now = new Date().toISOString();
    
    // Build extraction record with DataStore fields
    const extractionRecord = addDataStoreFields({
      id: extractionId,
      socialPostId,
      ...extracted,
      patternMatches: JSON.stringify(classification.matches),
      extractedPrizes: JSON.stringify(extracted.extractedPrizes),
      extractedAt: now,
      extractionVersion: PROCESSING_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    
    // Remove fields that shouldn't be in the record
    delete extractionRecord.extractedPrizes;  // Already stringified above
    
    // CRITICAL: Remove null GSI key fields - DynamoDB GSIs can't have null partition keys
    // The byTournamentId GSI will simply not include records without this field
    if (extractionRecord.extractedTournamentId == null) {
      delete extractionRecord.extractedTournamentId;
    }

    const findNaN = (obj, path = '') => {
        for (const [k, v] of Object.entries(obj)) {
            const p = path ? `${path}.${k}` : k;
            if (typeof v === 'number' && !Number.isFinite(v)) {
            console.error(`[DEBUG] ❌ NaN/Infinity at: ${p} = ${v}`);
            } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            findNaN(v, p);
            }
        }
    };
    findNaN(extractionRecord);

    await createSocialPostGameData(extractionRecord);
    result.extractedGameData = extractionRecord;
    
    // Save placements with DataStore fields
    if (placements.length > 0) {
      const placementRecords = createPlacementRecords(placements, socialPostId, extractionId);
      for (const placement of placementRecords) {
        const placementWithDataStore = addDataStoreFields({
          ...placement,
          createdAt: now,
          updatedAt: now,
        });
        await createSocialPostPlacement(placementWithDataStore);
      }
      result.placementsExtracted = placements.length;
    }
    
    // Generate comprehensive tags
    const tags = generateClassificationTags({
      content: post.content,
      classification,
      extracted,
      placementCount: placements.length,
      existingTags: post.tags || []
    });
    
    const classificationFlags = buildClassificationFlags(classification);
    
    console.log(`[PROCESS] Generated ${tags.length} tags:`, tags);
    
    // Update post with extraction reference AND all classification fields
    await updateSocialPost(socialPostId, {
      extractedGameDataId: extractionId,
      contentType: classification.contentType,
      contentTypeConfidence: classification.confidence,
      processingStatus: 'EXTRACTED',
      tags,
      ...classificationFlags
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
      
      // Save match candidates to extraction record for manual review
      if (matchResult.candidates.length > 0) {
        console.log('[PROCESS] Saving match candidates to extraction record...');
        await updateSocialPostGameData(extractionId, {
          suggestedGameId: matchResult.primaryMatch?.gameId || null,
          matchCandidateCount: matchResult.candidates.length,
          matchCandidates: JSON.stringify(matchResult.candidates.map(c => ({
            gameId: c.gameId,
            gameName: c.gameName,
            gameDate: c.gameDate,
            venueName: c.venueName,
            venueId: c.venueId,
            buyIn: c.buyIn,
            guarantee: c.guarantee,
            matchConfidence: c.matchConfidence,
            matchReason: c.matchReason,
            matchSignals: c.matchSignals,
            rank: c.rank,
            wouldAutoLink: c.matchConfidence >= matchThreshold
          })))
        });
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
          const linkNow = new Date().toISOString();
          
          // Build link with DataStore fields
          const link = addDataStoreFields({
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
            linkedAt: linkNow,
            linkedBy: 'SYSTEM',
            createdAt: linkNow,
            updatedAt: linkNow,
          });
          
          await createSocialPostGameLink(link);
          result.linkDetails.push(link);
          result.linksCreated++;
        }
        
        // Count skipped
        result.linksSkipped = matchResult.candidates.length - autoLinkCandidates.length;
        
        // Update post status and counts
        if (autoLinkCandidates.length > 0) {
          const primaryLink = autoLinkCandidates[0];
          await updateSocialPost(socialPostId, {
            processingStatus: 'LINKED',
            linkedGameId: primaryLink.gameId,
            primaryLinkedGameId: primaryLink.gameId,
            linkedGameCount: autoLinkCandidates.length,
            hasUnverifiedLinks: true,
            processedAt: new Date().toISOString()
          });
          result.processingStatus = 'LINKED';
        } else if (matchResult.candidates.length > 0) {
          // Has candidates but none above threshold - needs manual review
          await updateSocialPost(socialPostId, {
            processingStatus: 'MANUAL_REVIEW',
            processedAt: new Date().toISOString()
          });
          result.processingStatus = 'MANUAL_REVIEW';
        }
      }
    }
    
    // === SUCCESS ===
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[PROCESS] Processing complete in ${result.processingTimeMs}ms`);
    
    return result;
    
  } catch (error) {
    console.error('[PROCESS] Processing error:', error);
    
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
    
    // Generate tags for preview
    const tags = generateClassificationTags({
      content,
      classification,
      extracted,
      placementCount: placements.length,
      existingTags: []
    });
    result.tags = tags;
    result.classificationFlags = buildClassificationFlags(classification);
    
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
  addDataStoreFields,  // Export for use in other files
  // Tag generation (for manual uploader to use if invoking processor directly)
  generateClassificationTags,
  buildClassificationFlags,
  extractHashtags,
  PROCESSING_VERSION,
  DEFAULT_AUTO_LINK_THRESHOLD
};