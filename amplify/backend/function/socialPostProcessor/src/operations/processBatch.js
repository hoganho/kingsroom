/**
 * operations/processBatch.js
 * Batch processing of multiple social posts
 */

const { querySocialPostsByStatus } = require('../utils/graphql');
const { processSocialPost, DEFAULT_AUTO_LINK_THRESHOLD } = require('./processSocialPost');

// Default batch limit
const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 200;

/**
 * Process multiple social posts
 * 
 * @param {Object} input - ProcessSocialPostBatchInput
 * @returns {Object} ProcessBatchResult
 */
const processBatch = async (input) => {
  const startTime = Date.now();
  
  const {
    socialPostIds,
    socialAccountId,
    entityId,
    postedAfter,
    postedBefore,
    processingStatus,
    contentType,
    limit = DEFAULT_BATCH_LIMIT,
    forceReprocess = false,
    skipMatching = false,
    skipLinking = false
  } = input;
  
  console.log('[BATCH] Starting batch processing');
  
  const result = {
    success: false,
    totalProcessed: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    results: [],
    totalLinksCreated: 0,
    totalExtractionsDone: 0,
    averageConfidence: 0,
    processingTimeMs: 0
  };
  
  try {
    // Determine which posts to process
    let postsToProcess = [];
    
    if (socialPostIds && socialPostIds.length > 0) {
      // Process specific IDs
      console.log(`[BATCH] Processing ${socialPostIds.length} specific posts`);
      postsToProcess = socialPostIds.map(id => ({ id }));
    } else {
      // Query posts by criteria
      console.log('[BATCH] Querying posts by criteria');
      
      const queryStatus = processingStatus || 'PENDING';
      const queryResult = await querySocialPostsByStatus(queryStatus, {
        limit: Math.min(limit, MAX_BATCH_LIMIT)
      });
      
      postsToProcess = queryResult.items;
      
      // Apply additional filters
      if (socialAccountId) {
        postsToProcess = postsToProcess.filter(p => p.socialAccountId === socialAccountId);
      }
      if (entityId) {
        postsToProcess = postsToProcess.filter(p => p.entityId === entityId);
      }
      if (postedAfter) {
        postsToProcess = postsToProcess.filter(p => p.postedAt >= postedAfter);
      }
      if (postedBefore) {
        postsToProcess = postsToProcess.filter(p => p.postedAt <= postedBefore);
      }
      if (contentType) {
        postsToProcess = postsToProcess.filter(p => p.contentType === contentType);
      }
      
      console.log(`[BATCH] Found ${postsToProcess.length} posts matching criteria`);
    }
    
    // Limit the batch
    const batchLimit = Math.min(limit, MAX_BATCH_LIMIT);
    if (postsToProcess.length > batchLimit) {
      console.log(`[BATCH] Limiting to ${batchLimit} posts`);
      postsToProcess = postsToProcess.slice(0, batchLimit);
    }
    
    // Process each post
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    for (const post of postsToProcess) {
      console.log(`[BATCH] Processing post ${result.totalProcessed + 1}/${postsToProcess.length}: ${post.id}`);
      
      try {
        const postResult = await processSocialPost({
          socialPostId: post.id,
          forceReprocess,
          skipMatching,
          skipLinking
        });
        
        result.results.push(postResult);
        result.totalProcessed++;
        
        if (postResult.success) {
          if (postResult.processingStatus === 'SKIPPED') {
            result.skippedCount++;
          } else {
            result.successCount++;
            
            if (postResult.extractedGameData) {
              result.totalExtractionsDone++;
            }
            
            result.totalLinksCreated += postResult.linksCreated || 0;
            
            // Track confidence for average
            if (postResult.primaryMatch) {
              totalConfidence += postResult.primaryMatch.matchConfidence;
              confidenceCount++;
            }
          }
        } else {
          result.failedCount++;
        }
        
      } catch (postError) {
        console.error(`[BATCH] Error processing post ${post.id}:`, postError);
        
        result.results.push({
          success: false,
          socialPostId: post.id,
          error: postError.message,
          processingStatus: 'FAILED'
        });
        
        result.totalProcessed++;
        result.failedCount++;
      }
    }
    
    // Calculate average confidence
    if (confidenceCount > 0) {
      result.averageConfidence = Math.round(totalConfidence / confidenceCount);
    }
    
    result.success = true;
    result.processingTimeMs = Date.now() - startTime;
    
    console.log(`[BATCH] Batch complete:`, {
      processed: result.totalProcessed,
      success: result.successCount,
      failed: result.failedCount,
      skipped: result.skippedCount,
      links: result.totalLinksCreated,
      avgConfidence: result.averageConfidence,
      timeMs: result.processingTimeMs
    });
    
    return result;
    
  } catch (error) {
    console.error('[BATCH] Batch error:', error);
    
    result.success = false;
    result.processingTimeMs = Date.now() - startTime;
    
    // Return what we have so far
    return result;
  }
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  processBatch,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT
};
