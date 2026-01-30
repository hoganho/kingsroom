/**
 * Post Processor Service
 * 
 * Handles invoking the socialPostProcessor Lambda to classify posts.
 * 
 * FIXED: Changed 'postIds' to 'socialPostIds' to match what socialPostProcessor expects
 */

const { InvokeCommand } = require('@aws-sdk/client-lambda');
const { config, getLambdaClient } = require('../config');

const PROCESSOR_FUNCTION = config.processor.functionName;
const AUTO_PROCESS = config.processor.autoProcess;
const MAX_PARALLEL = config.processor.maxParallel;

/**
 * Invoke the post processor Lambda for a batch of posts
 * 
 * @param {string[]} postIds - Array of post IDs to process
 * @param {Object} options - Processing options
 * @returns {Object} Processing result
 */
async function invokeProcessor(postIds, options = {}) {
  if (!PROCESSOR_FUNCTION) {
    console.warn('[Processor] Function name not configured');
    console.warn('[Processor] Expected env var or config.processor.functionName to be set');
    return { success: false, message: 'Processor not configured' };
  }

  if (!postIds || postIds.length === 0) {
    return { success: true, processed: 0 };
  }

  console.log(`[Processor] Invoking ${PROCESSOR_FUNCTION} for ${postIds.length} posts`);

  try {
    // FIXED: Changed 'postIds' to 'socialPostIds' to match socialPostProcessor handler
    const payload = {
      socialPostIds: postIds,  // ← FIXED: was 'postIds', now 'socialPostIds'
      source: 'socialFetcher',
      ...options,
    };

    console.log('[Processor] Payload:', JSON.stringify(payload, null, 2));

    const response = await getLambdaClient().send(new InvokeCommand({
      FunctionName: PROCESSOR_FUNCTION,
      InvocationType: 'Event',  // Async invocation
      Payload: JSON.stringify(payload),
    }));

    if (response.StatusCode === 202) {
      console.log(`[Processor] Successfully queued ${postIds.length} posts for processing`);
      return { success: true, queued: postIds.length };
    } else {
      console.warn(`[Processor] Unexpected status code: ${response.StatusCode}`);
      return { success: false, message: `Status code: ${response.StatusCode}` };
    }
  } catch (error) {
    console.error('[Processor] Error invoking processor:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Process posts in batches
 * 
 * @param {string[]} postIds - All post IDs to process
 * @param {number} batchSize - How many to process at once
 */
async function processPostsInBatches(postIds, batchSize = 10) {
  if (!AUTO_PROCESS) {
    console.log('[Processor] Auto-processing disabled (config.processor.autoProcess = false)');
    return { success: true, skipped: true };
  }

  if (!postIds || postIds.length === 0) {
    return { success: true, processed: 0 };
  }

  console.log(`[Processor] Processing ${postIds.length} posts in batches of ${batchSize}`);

  const results = {
    success: true,
    totalQueued: 0,
    batches: 0,
    errors: [],
  };

  // Process in parallel batches
  for (let i = 0; i < postIds.length; i += batchSize * MAX_PARALLEL) {
    const parallelBatches = [];
    
    for (let j = 0; j < MAX_PARALLEL && i + j * batchSize < postIds.length; j++) {
      const start = i + j * batchSize;
      const batch = postIds.slice(start, start + batchSize);
      parallelBatches.push(invokeProcessor(batch));
    }

    const batchResults = await Promise.all(parallelBatches);
    
    for (const result of batchResults) {
      results.batches++;
      if (result.success) {
        results.totalQueued += result.queued || 0;
      } else {
        results.errors.push(result.message);
      }
    }
  }

  if (results.errors.length > 0) {
    results.success = false;
  }

  console.log(`[Processor] Completed: ${results.totalQueued} posts queued in ${results.batches} batches`);
  return results;
}

module.exports = {
  invokeProcessor,
  processPostsInBatches,
  AUTO_PROCESS,
};