/**
 * SocialAccount Database Operations
 * 
 * Handles all DynamoDB operations for the SocialAccount table.
 */

const { GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { config, getDocClient } = require('../config');

/**
 * Get a single social account by ID
 */
async function getSocialAccount(id) {
  console.log('[DB:Account] Getting account:', id);
  
  const result = await getDocClient().send(new GetCommand({
    TableName: config.tables.socialAccount,
    Key: { id },
  }));

  console.log('[DB:Account] Account found:', result.Item ? 'yes' : 'no');
  return result.Item;
}

/**
 * Get accounts that are due for scraping based on their individual schedule
 * 
 * Scheduling Logic:
 * 1. If nextScheduledScrapeAt is set and in the past → due
 * 2. If preferredScrapeHourUTC is set → only scrape during that hour (combined with frequency)
 * 3. Otherwise, use frequency-based check (scrapeFrequencyMinutes)
 * 
 * Criteria:
 * - isScrapingEnabled = true
 * - status !== 'ERROR'
 * - platform = 'FACEBOOK' (only supported platform currently)
 */
async function getAccountsDueForScrape() {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();

  const result = await getDocClient().send(new ScanCommand({
    TableName: config.tables.socialAccount,
    FilterExpression: 'isScrapingEnabled = :enabled AND #status <> :error AND platform = :facebook',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':enabled': true,
      ':error': 'ERROR',
      ':facebook': 'FACEBOOK',
    },
  }));

  const accounts = (result.Items || []).filter(account => {
    // =========================================
    // Check 1: Explicit nextScheduledScrapeAt
    // =========================================
    if (account.nextScheduledScrapeAt) {
      const scheduledTime = new Date(account.nextScheduledScrapeAt);
      if (now >= scheduledTime) {
        console.log(`[DB:Account] ${account.accountName} is due (scheduled for ${account.nextScheduledScrapeAt})`);
        return true;
      }
      // Has a future scheduled time, not due yet
      return false;
    }

    // =========================================
    // Check 2: preferredScrapeHourUTC constraint
    // =========================================
    // If preferredScrapeHourUTC is set, only allow scraping during that hour
    const preferredHour = account.preferredScrapeHourUTC;
    if (preferredHour !== null && preferredHour !== undefined && preferredHour >= 0) {
      if (currentHourUTC !== preferredHour) {
        // Not the right hour, skip this account
        return false;
      }
      // It's the right hour - check if we've already scraped today
      if (account.lastScrapedAt) {
        const lastScrape = new Date(account.lastScrapedAt);
        const hoursSinceLastScrape = (now.getTime() - lastScrape.getTime()) / (1000 * 60 * 60);
        
        // If we scraped less than 20 hours ago, skip (prevents double-scrape in same day)
        if (hoursSinceLastScrape < 20) {
          return false;
        }
      }
      console.log(`[DB:Account] ${account.accountName} is due (preferred hour ${preferredHour}:00 UTC)`);
      return true;
    }

    // =========================================
    // Check 3: Frequency-based check (default)
    // =========================================
    // Always scrape if never scraped before
    if (!account.lastScrapedAt) {
      console.log(`[DB:Account] ${account.accountName} has never been scraped - due`);
      return true;
    }

    const lastScrape = new Date(account.lastScrapedAt);
    const frequencyMs = (account.scrapeFrequencyMinutes || 60) * 60 * 1000;
    const timeSinceLastScrape = now.getTime() - lastScrape.getTime();
    const isDue = timeSinceLastScrape >= frequencyMs;

    if (isDue) {
      console.log(`[DB:Account] ${account.accountName} is due (frequency: ${Math.round(timeSinceLastScrape / 60000)}m since last, interval: ${account.scrapeFrequencyMinutes}m)`);
    }

    return isDue;
  });

  console.log(`[DB:Account] Found ${accounts.length} accounts due for scraping out of ${result.Items?.length || 0} total enabled accounts`);
  return accounts;
}

/**
 * Calculate the next scheduled scrape time based on account settings
 * Called after each successful scrape to set nextScheduledScrapeAt
 * 
 * @param {Object} account - The social account
 * @returns {string|null} ISO datetime string for next scrape, or null to use frequency-based
 */
function calculateNextScrapeTime(account) {
  const now = new Date();
  
  // If preferredScrapeHourUTC is set, calculate next occurrence of that hour
  const preferredHour = account.preferredScrapeHourUTC;
  if (preferredHour !== null && preferredHour !== undefined && preferredHour >= 0) {
    const next = new Date(now);
    next.setUTCHours(preferredHour, 0, 0, 0);
    
    // If the preferred hour has passed today, schedule for tomorrow
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    
    console.log(`[DB:Account] Next scrape for ${account.accountName}: ${next.toISOString()} (preferred hour: ${preferredHour}:00 UTC)`);
    return next.toISOString();
  }
  
  // No preferred hour - return null to use frequency-based scheduling
  return null;
}

/**
 * Convert AEST hour (0-23) to UTC hour
 * AEST is UTC+10 (or UTC+11 during daylight saving)
 * 
 * @param {number} aestHour - Hour in AEST (0-23)
 * @param {boolean} isDaylightSaving - Whether daylight saving is active (AEDT)
 * @returns {number} Hour in UTC (0-23)
 */
function aestHourToUTC(aestHour, isDaylightSaving = false) {
  const offset = isDaylightSaving ? 11 : 10;
  let utcHour = aestHour - offset;
  if (utcHour < 0) utcHour += 24;
  return utcHour;
}

/**
 * Convert UTC hour (0-23) to AEST hour
 * 
 * @param {number} utcHour - Hour in UTC (0-23)
 * @param {boolean} isDaylightSaving - Whether daylight saving is active (AEDT)
 * @returns {number} Hour in AEST (0-23)
 */
function utcHourToAEST(utcHour, isDaylightSaving = false) {
  const offset = isDaylightSaving ? 11 : 10;
  let aestHour = utcHour + offset;
  if (aestHour >= 24) aestHour -= 24;
  return aestHour;
}

/**
 * Get specific accounts by their IDs
 * Only returns accounts that are enabled and valid for scraping
 */
async function getAccountsByIds(accountIds) {
  const accounts = [];
  
  for (const accountId of accountIds) {
    const account = await getSocialAccount(accountId);
    if (account) {
      if (account.isScrapingEnabled && account.platform === 'FACEBOOK' && account.status !== 'ERROR') {
        accounts.push(account);
      } else {
        console.log(`[DB:Account] Skipping account ${accountId}: isScrapingEnabled=${account.isScrapingEnabled}, platform=${account.platform}, status=${account.status}`);
      }
    } else {
      console.warn(`[DB:Account] Account not found: ${accountId}`);
    }
  }
  
  return accounts;
}

/**
 * Update account after a scrape attempt
 */
async function updateAccountAfterScrape(id, updates) {
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

  // Always update the updatedAt timestamp
  updateParts.push('#updatedAt = :updatedAt');
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();

  await getDocClient().send(new UpdateCommand({
    TableName: config.tables.socialAccount,
    Key: { id },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  console.log(`[DB:Account] Updated account ${id}:`, Object.keys(updates).join(', '));
}

/**
 * Increment consecutive failures count
 */
async function incrementFailures(id, errorMessage) {
  await getDocClient().send(new UpdateCommand({
    TableName: config.tables.socialAccount,
    Key: { id },
    UpdateExpression: 'SET consecutiveFailures = if_not_exists(consecutiveFailures, :zero) + :inc, lastErrorMessage = :error, updatedAt = :now',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':inc': 1,
      ':error': errorMessage,
      ':now': new Date().toISOString(),
    },
  }));
}

/**
 * Reset consecutive failures on successful scrape
 */
async function resetFailures(id) {
  await getDocClient().send(new UpdateCommand({
    TableName: config.tables.socialAccount,
    Key: { id },
    UpdateExpression: 'SET consecutiveFailures = :zero, lastErrorMessage = :null, updatedAt = :now',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':null': null,
      ':now': new Date().toISOString(),
    },
  }));
}

module.exports = {
  getSocialAccount,
  getAccountsDueForScrape,
  getAccountsByIds,
  updateAccountAfterScrape,
  incrementFailures,
  resetFailures,
  calculateNextScrapeTime,
  aestHourToUTC,
  utcHourToAEST,
};
