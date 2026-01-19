/**
 * SocialScrapeAttempt Database Operations
 * 
 * Handles all DynamoDB operations for tracking scrape attempts,
 * including cancellation support.
 */

const { GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { config, getDocClient } = require('../config');

/**
 * Create a new scrape attempt record
 */
async function createScrapeAttempt(socialAccountId, syncType = 'INCREMENTAL', triggerSource = 'MANUAL') {
  if (!config.tables.socialScrapeAttempt) {
    console.warn('[DB:Attempt] SOCIAL_SCRAPE_ATTEMPT_TABLE not configured');
    return null;
  }

  const id = `${socialAccountId}_${Date.now()}`;
  const now = new Date().toISOString();

  await getDocClient().send(new PutCommand({
    TableName: config.tables.socialScrapeAttempt,
    Item: {
      id,
      socialAccountId,
      status: 'RUNNING',
      startedAt: now,
      triggerSource,
      syncType,
      cancellationRequested: false,
      postsFound: 0,
      newPostsAdded: 0,
      postsUpdated: 0,
      createdAt: now,
      updatedAt: now,
      __typename: 'SocialScrapeAttempt',
      _version: 1,
      _lastChangedAt: Date.now(),
    },
  }));

  console.log(`[DB:Attempt] Created attempt ${id} for account ${socialAccountId}`);
  return id;
}

/**
 * Update a scrape attempt with new data
 */
async function updateScrapeAttempt(id, updates) {
  if (!id || !config.tables.socialScrapeAttempt) {
    return;
  }

  updates.updatedAt = new Date().toISOString();

  const updateParts = [];
  const names = {};
  const values = {};

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      updateParts.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    }
  });

  await getDocClient().send(new UpdateCommand({
    TableName: config.tables.socialScrapeAttempt,
    Key: { id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  console.log(`[DB:Attempt] Updated attempt ${id}`);
}

/**
 * Complete a scrape attempt (success or failure)
 */
async function completeScrapeAttempt(id, status, results = {}) {
  if (!id) return;

  await updateScrapeAttempt(id, {
    status,
    completedAt: new Date().toISOString(),
    durationMs: results.durationMs,
    postsFound: results.postsFound || 0,
    newPostsAdded: results.newPostsAdded || 0,
    postsUpdated: results.postsUpdated || 0,
    errorMessage: results.errorMessage,
    errorCode: results.errorCode,
  });
}

/**
 * Check if cancellation has been requested for a scrape attempt
 */
async function checkCancellationRequested(attemptId) {
  if (!attemptId || !config.tables.socialScrapeAttempt) {
    return false;
  }
  
  try {
    const result = await getDocClient().send(new GetCommand({
      TableName: config.tables.socialScrapeAttempt,
      Key: { id: attemptId },
      ProjectionExpression: 'cancellationRequested',
    }));
    
    const isCancelled = result.Item?.cancellationRequested === true;
    if (isCancelled) {
      console.log(`[DB:Attempt] Cancellation requested for attempt ${attemptId}`);
    }
    return isCancelled;
  } catch (error) {
    console.warn('[DB:Attempt] Error checking cancellation status:', error.message);
    return false; // Continue on error
  }
}

/**
 * Clear the cancellation flag after sync completes or is cancelled
 */
async function clearCancellationFlag(attemptId) {
  if (!attemptId || !config.tables.socialScrapeAttempt) {
    return;
  }
  
  try {
    await getDocClient().send(new UpdateCommand({
      TableName: config.tables.socialScrapeAttempt,
      Key: { id: attemptId },
      UpdateExpression: 'SET cancellationRequested = :false, updatedAt = :now',
      ExpressionAttributeValues: {
        ':false': false,
        ':now': new Date().toISOString(),
      },
    }));
    console.log(`[DB:Attempt] Cleared cancellation flag for attempt ${attemptId}`);
  } catch (error) {
    console.warn('[DB:Attempt] Error clearing cancellation flag:', error.message);
  }
}

module.exports = {
  createScrapeAttempt,
  updateScrapeAttempt,
  completeScrapeAttempt,
  checkCancellationRequested,
  clearCancellationFlag,
};
