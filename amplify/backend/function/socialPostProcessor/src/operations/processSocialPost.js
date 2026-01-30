/**
 * operations/processSocialPost.js
 * Main processing logic for a single social post
 * 
 * VERSION: 3.0.0
 * 
 * UPDATED: Now sets ALL classification fields including tags
 * This is the single source of truth for classification logic
 * 
 * UPDATES v3.0.0:
 * - Added scrape discrepancy detection and link creation
 * - When tournament ID found but no valid game, creates PENDING_SCRAPE link
 * - Optionally triggers re-scrape for discrepancies
 * - Tracks discrepancy resolution in SocialPostGameLink
 * 
 * UPDATES v1.2.0:
 * - Fixed guaranteeAmount field name (was incorrectly "guarantee")
 * - matchSignals is now an object from gameMatcher, stringify when saving
 */

const { v4: uuidv4 } = require('uuid');
const { 
  getSocialPost, 
  updateSocialPost, 
  createSocialPostGameData,
  updateSocialPostGameData,
  createSocialPostPlacement,
  createSocialPostGameLink,
  updateSocialPostGameLink,
  getExtractionBySocialPost,
  getLinksBySocialPost
} = require('../utils/graphql');
const { classifyContent, shouldSkipPost } = require('../extraction/contentClassifier');
const { extractGameData } = require('../extraction/dataExtractor');
const { parsePlacements, createPlacementRecords, extractWinnerInfo } = require('../extraction/placementParser');
const { findMatchingGames, getAutoLinkCandidates } = require('../matching/gameMatcher');

// Processing version for tracking
const PROCESSING_VERSION = '3.0.0';

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

/**
 * Safely stringify an object for AWSJSON field
 * Handles already-stringified values to prevent double-stringify
 */
const safeStringify = (obj) => {
  if (!obj) return null;
  if (typeof obj === 'string') {
    // Already a string - check if it's valid JSON
    try {
      JSON.parse(obj);
      return obj; // Already valid JSON string
    } catch (e) {
      // Not valid JSON, wrap it
      return JSON.stringify(obj);
    }
  }
  try {
    return JSON.stringify(obj);
  } catch (e) {
    console.error('[PROCESS] Failed to stringify:', e.message);
    return null;
  }
};

/**
 * Debug helper to find NaN/Infinity values in objects
 */
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

// ============================================
// RESCRAPE TRIGGER (NEW in v3.0.0)
// ============================================

/**
 * Trigger a re-scrape for a tournament ID found in a social post
 * 
 * @param {string} linkId - SocialPostGameLink ID
 * @param {number} tournamentId - Tournament ID to scrape
 * @param {string} entityId - Entity ID for scraper context
 * @returns {Object} Result with jobId or error
 */
const triggerRescrapeForDiscrepancy = async (linkId, tournamentId, entityId) => {
  console.log(`[PROCESS] Triggering re-scrape: tournamentId=${tournamentId}, entityId=${entityId}`);
  
  try {
    // Import scraper invoker dynamically to avoid circular deps
    const { invokeScraper } = require('../utils/scraperInvoker');
    
    const result = await invokeScraper({
      mode: 'single',
      startId: tournamentId,
      endId: tournamentId,
      entityId,
      triggerSource: 'SOCIAL_DISCREPANCY',
      forceRefresh: true,
      saveToDatabase: true,
      metadata: {
        triggerLinkId: linkId,
        triggerType: 'scrape_discrepancy'
      }
    });
    
    return {
      success: true,
      jobId: result.jobId,
      attemptId: result.attemptId
    };
  } catch (error) {
    console.error('[PROCESS] Re-scrape invocation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
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
    matchThreshold = DEFAULT_AUTO_LINK_THRESHOLD,
    // NEW v3.0.0: Discrepancy options
    createDiscrepancyLinks = true,
    triggerRescrapeOnDiscrepancy = true
  } = input;
  
  console.log(`[PROCESS] Starting processing for post: ${socialPostId}`);
  console.log(`[PROCESS] Options:`, { forceReprocess, skipMatching, skipLinking, matchThreshold, createDiscrepancyLinks });
  
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
    // NEW v3.0.0: Discrepancy results
    scrapeDiscrepancyDetected: false,
    scrapeDiscrepancyType: null,
    scrapeDiscrepancyLink: null,
    rescrapeTriggered: false,
    rescrapeJobId: null,
    reconciliationPreview: null,
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
    
    // Skip non-relevant content (GENERAL or COMMENT)
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
    
    // CRITICAL: Remove null/empty GSI key fields - DynamoDB GSIs can't have null partition keys
    // The byTournamentId GSI will simply not include records without this field
    if (extractionRecord.extractedTournamentId == null) {
      delete extractionRecord.extractedTournamentId;
    }
    // FIX: Also check extractedTournamentUrl for byExtractedUrl GSI
    // Check for null, undefined, AND empty string
    if (!extractionRecord.extractedTournamentUrl) {
      console.log('[PROCESS] Removing null/empty extractedTournamentUrl from record');
      delete extractionRecord.extractedTournamentUrl;
    }

    // Debug: Log the fields being saved (to verify no null GSI keys)
    console.log('[PROCESS] Saving SocialPostGameData with keys:', {
      id: extractionRecord.id,
      hasExtractedTournamentId: 'extractedTournamentId' in extractionRecord,
      extractedTournamentId: extractionRecord.extractedTournamentId,
      hasExtractedTournamentUrl: 'extractedTournamentUrl' in extractionRecord,
      extractedTournamentUrl: extractionRecord.extractedTournamentUrl
    });

    // Debug: Check for NaN/Infinity values
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
      
      // =========================================================================
      // STEP 7b: Handle scrape discrepancy (NEW v3.0.0)
      // =========================================================================
      // If we have a tournament ID but no valid game match, this is a discrepancy
      if (matchResult.scrapeDiscrepancy && createDiscrepancyLinks) {
        console.log(`[PROCESS] SCRAPE DISCREPANCY DETECTED: ${matchResult.scrapeDiscrepancy.discrepancyType}`);
        
        const discrepancy = matchResult.scrapeDiscrepancy;
        
        result.scrapeDiscrepancyDetected = true;
        result.scrapeDiscrepancyType = discrepancy.discrepancyType;
        
        // Create a discrepancy link
        const linkId = uuidv4();
        
        const discrepancyLink = addDataStoreFields({
          id: linkId,
          socialPostId,
          socialPostGameDataId: extractionId,
          // IMPORTANT: gameId must be non-null for DynamoDB GSI. Use sentinel value.
          // "PENDING_SCRAPE" indicates this link is awaiting game creation.
          gameId: discrepancy.gameId || 'PENDING_SCRAPE',
          
          linkType: 'PENDING_SCRAPE',
          matchConfidence: 0,
          matchReason: 'discrepancy_pending',
          matchSignals: safeStringify({ discrepancyType: discrepancy.discrepancyType }),
          
          isPrimaryGame: false,
          mentionOrder: 1,
          
          // Extracted data snapshot
          extractedVenueName: extracted.extractedVenueName,
          extractedDate: extracted.extractedDate,
          extractedBuyIn: extracted.extractedBuyIn,
          extractedGuarantee: extracted.extractedGuarantee,
          effectiveGameDate: extracted.effectiveGameDate,
          
          // Discrepancy tracking fields
          extractedTournamentId: discrepancy.extractedTournamentId,
          extractedTournamentUrl: discrepancy.extractedTournamentUrl,
          hasScrapeDiscrepancy: true,
          scrapeDiscrepancyType: discrepancy.discrepancyType,
          scrapeDiscrepancyDetectedAt: now,
          detectedGameStatus: discrepancy.detectedGameStatus,
          detectedScrapeURLStatus: discrepancy.detectedScrapeURLStatus,
          discrepancyResolution: 'UNRESOLVED',
          
          // Content info
          contentType: extracted.contentType,
          extractedWinnerName: extracted.extractedWinnerName,
          extractedWinnerPrize: extracted.extractedWinnerPrize,
          extractedTotalEntries: extracted.extractedTotalEntries,
          placementCount: placements.length,
          
          linkedAt: now,
          linkedBy: 'SYSTEM',
          createdAt: now,
          updatedAt: now
        });
        
        await createSocialPostGameLink(discrepancyLink);
        
        result.scrapeDiscrepancyLink = discrepancyLink;
        result.linkDetails.push(discrepancyLink);
        
        console.log(`[PROCESS] Created discrepancy link: ${linkId}`);
        
        // Update SocialPostGameData with discrepancy reference
        await updateSocialPostGameData(extractionId, {
          hasScrapeDiscrepancy: true,
          scrapeDiscrepancyType: discrepancy.discrepancyType,
          scrapeDiscrepancyLinkId: linkId,
          scrapeDiscrepancyDetectedAt: now
        });
        
        // Optionally trigger re-scrape
        if (triggerRescrapeOnDiscrepancy && discrepancy.extractedTournamentId) {
          console.log(`[PROCESS] Triggering re-scrape for tournament ID ${discrepancy.extractedTournamentId}...`);
          
          try {
            const rescrapeResult = await triggerRescrapeForDiscrepancy(
              linkId,
              discrepancy.extractedTournamentId,
              post.entityId
            );
            
            if (rescrapeResult.success) {
              result.rescrapeTriggered = true;
              result.rescrapeJobId = rescrapeResult.jobId;
              
              // Update link with rescrape info
              await updateSocialPostGameLink(linkId, {
                rescrapeRequested: true,
                rescrapeRequestedAt: now,
                rescrapeRequestedBy: 'SYSTEM',
                rescrapeJobId: rescrapeResult.jobId,
                discrepancyResolution: 'RESCRAPE_PENDING',
                linkType: 'RESCRAPE_REQUESTED'
              });
              
              console.log(`[PROCESS] Re-scrape triggered: job ${rescrapeResult.jobId}`);
            }
          } catch (rescrapeError) {
            console.error('[PROCESS] Failed to trigger re-scrape:', rescrapeError);
            result.warnings.push(`Failed to trigger re-scrape: ${rescrapeError.message}`);
          }
        }
        
        // Update post status to indicate manual review needed
        await updateSocialPost(socialPostId, {
          processingStatus: 'MANUAL_REVIEW',
          processedAt: now
        });
        
        result.processingStatus = 'MANUAL_REVIEW';
        result.success = true;
        result.processingTimeMs = Date.now() - startTime;
        
        return result;
      }
      
      // Save match candidates to extraction record for manual review
      if (matchResult.candidates.length > 0) {
        console.log('[PROCESS] Saving match candidates to extraction record...');
        await updateSocialPostGameData(extractionId, {
          suggestedGameId: matchResult.primaryMatch?.gameId || null,
          matchCandidateCount: matchResult.candidates.length,
          // matchSignals is now an object, stringify the whole array once
          matchCandidates: JSON.stringify(matchResult.candidates.map(c => ({
            gameId: c.gameId,
            gameName: c.gameName,
            gameDate: c.gameDate,
            venueName: c.venueName,
            venueId: c.venueId,
            buyIn: c.buyIn,
            guaranteeAmount: c.guaranteeAmount,
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
        
        // Get existing links to avoid duplicates
        const existingLinks = await getLinksBySocialPost(socialPostId);
        const linkedGameIds = new Set(existingLinks.map(l => l.gameId));
        
        const autoLinkCandidates = getAutoLinkCandidates(matchResult.candidates, matchThreshold);
        
        console.log(`[PROCESS] ${autoLinkCandidates.length} candidates above auto-link threshold (${matchThreshold})`);
        
        for (let i = 0; i < autoLinkCandidates.length; i++) {
          const candidate = autoLinkCandidates[i];
          
          // Skip if already linked
          if (linkedGameIds.has(candidate.gameId)) {
            console.log(`[PROCESS] Skipping duplicate link to game ${candidate.gameId}`);
            result.linksSkipped++;
            continue;
          }
          
          const linkNow = new Date().toISOString();
          const mentionOrder = existingLinks.length + result.linksCreated + 1;
          const isPrimaryGame = mentionOrder === 1;
          
          // Build link with DataStore fields
          const link = addDataStoreFields({
            id: uuidv4(),
            socialPostId,
            socialPostGameDataId: extractionId,
            gameId: candidate.gameId,
            linkType: 'AUTO_MATCHED',
            matchConfidence: candidate.matchConfidence,
            matchReason: candidate.matchReason,
            matchSignals: safeStringify(candidate.matchSignals),
            isPrimaryGame,
            mentionOrder,
            extractedVenueName: extracted.extractedVenueName,
            extractedDate: extracted.extractedDate,
            extractedBuyIn: extracted.extractedBuyIn,
            extractedGuarantee: extracted.extractedGuarantee,
            effectiveGameDate: extracted.effectiveGameDate,
            
            // No discrepancy for successful matches
            hasScrapeDiscrepancy: false,
            
            // Content info
            contentType: extracted.contentType,
            extractedWinnerName: extracted.extractedWinnerName,
            extractedWinnerPrize: extracted.extractedWinnerPrize,
            extractedTotalEntries: extracted.extractedTotalEntries,
            placementCount: placements.length,
            
            linkedAt: linkNow,
            linkedBy: 'SYSTEM',
            createdAt: linkNow,
            updatedAt: linkNow,
          });
          
          await createSocialPostGameLink(link);
          result.linkDetails.push(link);
          result.linksCreated++;
          linkedGameIds.add(candidate.gameId);
        }
        
        // Count skipped (not including duplicates)
        result.linksSkipped += matchResult.candidates.length - autoLinkCandidates.length;
        
        // Update post status and counts
        if (result.linksCreated > 0) {
          const primaryLink = result.linkDetails.find(l => l.isPrimaryGame);
          await updateSocialPost(socialPostId, {
            processingStatus: 'LINKED',
            linkedGameId: primaryLink?.gameId,
            primaryLinkedGameId: primaryLink?.gameId,
            linkedGameCount: existingLinks.length + result.linksCreated,
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
    // NEW v3.0.0
    scrapeDiscrepancyDetected: false,
    scrapeDiscrepancyType: null,
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
    
    // NEW v3.0.0: Include discrepancy info in preview
    if (matchResult.scrapeDiscrepancy) {
      result.scrapeDiscrepancyDetected = true;
      result.scrapeDiscrepancyType = matchResult.scrapeDiscrepancy.discrepancyType;
    }
    
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
    // NEW v3.0.0
    scrapeDiscrepancyDetected: false,
    scrapeDiscrepancyType: null,
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
      
      // NEW v3.0.0: Include discrepancy info in preview
      if (matchResult.scrapeDiscrepancy) {
        result.scrapeDiscrepancyDetected = true;
        result.scrapeDiscrepancyType = matchResult.scrapeDiscrepancy.discrepancyType;
        result.warnings.push(`Scrape discrepancy detected: ${matchResult.scrapeDiscrepancy.discrepancyType}`);
      }
      
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
  triggerRescrapeForDiscrepancy,
  addDataStoreFields,  // Export for use in other files
  safeStringify,       // Export for use in other files
  // Tag generation (for manual uploader to use if invoking processor directly)
  generateClassificationTags,
  buildClassificationFlags,
  extractHashtags,
  findNaN,             // Debug helper
  PROCESSING_VERSION,
  DEFAULT_AUTO_LINK_THRESHOLD
};