/**
 * SES Notification Utility for Scheduled Lambda Functions
 * 
 * VERSION: 2.1.0
 * 
 * UPDATED v2.1.0:
 * - NEW: Entity name included in email subject and body
 * - Subject format: [ENV] ✅ lambdaName [EntityName] - STATUS (TRIGGER)
 * 
 * UPDATED v2.0.0:
 * - NEW: Enhanced formatting for game details (created, updated, skipped)
 * - NEW: URL processing details with reasons (rescrape, new, refresh, gap)
 * - NEW: STOPPED_NOT_FOUND treated as success (configurable via successStopReasons)
 * - IMPROVED: Better email formatting with sections
 * 
 * Add this file to any Lambda that needs to send email notifications.
 * 
 * Usage:
 * const { sendNotification } = require('./ses-notification');
 * 
 * At the end of your handler (for EventBridge triggers):
 * await sendNotification({
 *   lambdaName: 'scraperManagement',
 *   status: 'success',
 *   summary: { ... },
 *   triggerSource: 'EVENTBRIDGE'
 * });
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({ region: process.env.REGION || 'ap-southeast-2' });

// Configuration - update these for your setup
const SENDER_EMAIL = process.env.NOTIFICATION_SENDER_EMAIL || 'notifications@kingsroom.pokerprolive.com';
const RECIPIENT_EMAIL = process.env.NOTIFICATION_RECIPIENT_EMAIL || 'hogan.ho@gmail.com';

// Environment for subject line (DEV, PROD, etc.)
const ENV = process.env.ENV || 'UNKNOWN';

// Feature flag to enable/disable notifications
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED !== 'false';

// Stop reasons that should be treated as success (not failures)
// STOPPED_NOT_FOUND is a normal completion condition for auto mode - we reached the end of IDs
const SUCCESS_STOP_REASONS = [
  'COMPLETED',
  'STOPPED_NOT_FOUND',  // Normal end of ID range in auto mode
  'STOPPED_BLANKS',     // Normal end condition 
  'STOPPED_MAX_ID',     // Reached configured max ID
];

/**
 * Determine if a stop reason should be considered success or failure
 * @param {string} stopReason - The stop reason from scraping
 * @param {string[]} customSuccessReasons - Optional custom list of success reasons
 * @returns {boolean} True if should be treated as success
 */
function isSuccessStopReason(stopReason, customSuccessReasons = null) {
  const successReasons = customSuccessReasons || SUCCESS_STOP_REASONS;
  return successReasons.includes(stopReason);
}

/**
 * Format game list for email
 * @param {Array} games - Array of game objects with id, name, tournamentId, etc.
 * @param {number} limit - Max games to include
 * @returns {string} Formatted game list
 */
function formatGameList(games, limit = 10) {
  if (!games || games.length === 0) return '  (none)';
  
  const displayGames = games.slice(0, limit);
  const lines = displayGames.map(g => {
    const id = g.tournamentId || g.id || 'unknown';
    const name = g.name || g.title || 'Unnamed';
    const status = g.gameStatus || g.status || '';
    const statusStr = status ? ` [${status}]` : '';
    return `  • #${id}: ${name}${statusStr}`;
  });
  
  if (games.length > limit) {
    lines.push(`  ... and ${games.length - limit} more`);
  }
  
  return lines.join('\n');
}

/**
 * Format URL processing list for email
 * @param {Array} urls - Array of URL objects with url, reason, tournamentId
 * @param {number} limit - Max URLs to include
 * @returns {string} Formatted URL list
 */
function formatURLList(urls, limit = 15) {
  if (!urls || urls.length === 0) return '  (none)';
  
  // Group URLs by reason for better readability
  const byReason = {};
  urls.forEach(u => {
    const reason = u.reason || 'unknown';
    if (!byReason[reason]) byReason[reason] = [];
    byReason[reason].push(u);
  });
  
  const lines = [];
  for (const [reason, items] of Object.entries(byReason)) {
    const reasonLabel = formatReasonLabel(reason);
    const displayItems = items.slice(0, Math.ceil(limit / Object.keys(byReason).length));
    
    lines.push(`  ${reasonLabel} (${items.length}):`);
    displayItems.forEach(u => {
      const id = u.tournamentId || extractIdFromUrl(u.url) || '?';
      lines.push(`    • #${id}`);
    });
    
    if (items.length > displayItems.length) {
      lines.push(`    ... and ${items.length - displayItems.length} more`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert reason code to human-readable label
 */
function formatReasonLabel(reason) {
  const labels = {
    'new': '🆕 New IDs',
    'rescrape': '🔄 Rescrape',
    'refresh': '♻️ Refresh (in-progress)',
    'gap': '🔍 Gap fill',
    'force_refresh': '⚡ Force refresh',
    'not_found_gap': '🕳️ NOT_FOUND gap',
    'scheduled': '📅 Scheduled',
    'unknown': '❓ Other',
  };
  return labels[reason] || reason;
}

/**
 * Extract tournament ID from URL
 */
function extractIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/(\d+)\/?$/);
  return match ? match[1] : null;
}

/**
 * Send an email notification about Lambda execution
 * 
 * @param {Object} options
 * @param {string} options.lambdaName - Name of the Lambda function
 * @param {string} options.status - 'success' or 'failure' (can be auto-determined from stopReason)
 * @param {Object} options.summary - Key-value pairs to include in the email body
 * @param {string} [options.triggerSource] - 'EVENTBRIDGE', 'MANUAL', etc.
 * @param {string} [options.error] - Error message if status is 'failure'
 * @param {number} [options.durationMs] - Execution duration in milliseconds
 * @param {Object} [options.gameDetails] - Detailed game lists { created, updated, skipped }
 * @param {Array} [options.processedURLs] - URLs processed with reasons
 * @param {string} [options.entityName] - Human-readable entity name
 */
async function sendNotification(options) {
  if (!NOTIFICATIONS_ENABLED) {
    console.log('[SES-NOTIFICATION] Notifications disabled, skipping');
    return { sent: false, reason: 'disabled' };
  }

  const {
    lambdaName,
    status: providedStatus,
    summary = {},
    triggerSource = 'UNKNOWN',
    error = null,
    durationMs = null,
    gameDetails = null,
    processedURLs = null,
    entityName = null,
  } = options;

  // Auto-determine status from stopReason if not explicitly set
  let status = providedStatus;
  if (!status && summary.stopReason) {
    status = isSuccessStopReason(summary.stopReason) ? 'success' : 'failure';
  }
  status = status || 'success';

  const timestamp = new Date().toISOString();
  const statusEmoji = status === 'success' ? '✅' : '❌';
  
  // Include entity name in subject if provided
  const entityPart = entityName ? ` [${entityName}]` : '';
  const subject = `[${ENV}] ${statusEmoji} ${lambdaName}${entityPart} - ${status.toUpperCase()} (${triggerSource})`;

  // Build email body
  const lines = [];
  lines.push(`Environment: ${ENV}`);
  lines.push(`Lambda: ${lambdaName}`);
  if (entityName) {
    lines.push(`Entity: ${entityName}`);
  }
  lines.push(`Status: ${status.toUpperCase()}`);
  lines.push(`Trigger: ${triggerSource}`);
  lines.push(`Time: ${timestamp}`);
  
  if (durationMs !== null) {
    const durationSec = Math.round(durationMs / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    lines.push(`Duration: ${durationStr}`);
  }

  // Main summary stats
  if (Object.keys(summary).length > 0) {
    lines.push('');
    lines.push('═══════════════════════════════════');
    lines.push('SUMMARY');
    lines.push('═══════════════════════════════════');
    
    // Format key stats at the top
    const keyStats = ['totalURLsProcessed', 'newGamesScraped', 'gamesUpdated', 'gamesSkipped', 'errors', 'stopReason'];
    const otherStats = {};
    
    for (const [key, value] of Object.entries(summary)) {
      // Skip arrays/objects in main stats (handled separately)
      if (typeof value === 'object' && value !== null) {
        continue;
      }
      
      // Format the key nicely (camelCase to Title Case)
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
      
      if (keyStats.includes(key)) {
        lines.push(`${formattedKey}: ${value}`);
      } else {
        otherStats[formattedKey] = value;
      }
    }
    
    // Add other stats
    for (const [key, value] of Object.entries(otherStats)) {
      lines.push(`${key}: ${value}`);
    }
  }

  // URLs Processed section with details
  if (processedURLs && processedURLs.length > 0) {
    lines.push('');
    lines.push('───────────────────────────────────');
    lines.push(`URLs PROCESSED (${processedURLs.length})`);
    lines.push('───────────────────────────────────');
    lines.push(formatURLList(processedURLs, 20));
  }

  // Game details sections
  if (gameDetails) {
    if (gameDetails.created && gameDetails.created.length > 0) {
      lines.push('');
      lines.push('───────────────────────────────────');
      lines.push(`🆕 GAMES CREATED (${gameDetails.created.length})`);
      lines.push('───────────────────────────────────');
      lines.push(formatGameList(gameDetails.created, 15));
    }
    
    if (gameDetails.updated && gameDetails.updated.length > 0) {
      lines.push('');
      lines.push('───────────────────────────────────');
      lines.push(`📝 GAMES UPDATED (${gameDetails.updated.length})`);
      lines.push('───────────────────────────────────');
      lines.push(formatGameList(gameDetails.updated, 15));
    }
    
    if (gameDetails.skipped && gameDetails.skipped.length > 0) {
      lines.push('');
      lines.push('───────────────────────────────────');
      lines.push(`⏭️ GAMES SKIPPED (${gameDetails.skipped.length})`);
      lines.push('───────────────────────────────────');
      // For skipped, show the reason as well
      const skippedFormatted = gameDetails.skipped.slice(0, 10).map(g => {
        const id = g.tournamentId || g.id || 'unknown';
        const name = g.name || g.title || 'Unnamed';
        const reason = g.reason || g.skipReason || '';
        const reasonStr = reason ? ` - ${reason}` : '';
        return `  • #${id}: ${name}${reasonStr}`;
      });
      if (gameDetails.skipped.length > 10) {
        skippedFormatted.push(`  ... and ${gameDetails.skipped.length - 10} more`);
      }
      lines.push(skippedFormatted.join('\n'));
    }
  }

  // Legacy recentGames support (if gameDetails not provided)
  if (!gameDetails && summary.recentGames && Array.isArray(summary.recentGames)) {
    lines.push('');
    lines.push('───────────────────────────────────');
    lines.push(`RECENT GAMES (${summary.recentGames.length})`);
    lines.push('───────────────────────────────────');
    lines.push(formatGameList(summary.recentGames, 10));
  }

  if (error) {
    lines.push('');
    lines.push('═══════════════════════════════════');
    lines.push('ERROR');
    lines.push('═══════════════════════════════════');
    lines.push(error);
  }

  const bodyText = lines.join('\n');

  console.log('[SES-NOTIFICATION] Sending notification:', { subject, lambdaName, status });

  try {
    const command = new SendEmailCommand({
      Source: SENDER_EMAIL,
      Destination: {
        ToAddresses: [RECIPIENT_EMAIL],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: bodyText,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const result = await sesClient.send(command);
    console.log('[SES-NOTIFICATION] Email sent:', result.MessageId);
    
    return { sent: true, messageId: result.MessageId };
  } catch (err) {
    console.error('[SES-NOTIFICATION] Failed to send email:', err);
    // Don't throw - notification failure shouldn't break the Lambda
    return { sent: false, error: err.message };
  }
}

/**
 * Check if the event is from EventBridge/CloudWatch scheduled rule
 */
function isEventBridgeTrigger(event) {
  return (
    event.source === 'aws.events' ||
    event['detail-type'] === 'Scheduled Event' ||
    event.triggerSource === 'SCHEDULED'
  );
}

module.exports = {
  sendNotification,
  isEventBridgeTrigger,
  isSuccessStopReason,
  SUCCESS_STOP_REASONS,
  NOTIFICATIONS_ENABLED,
  ENV,
  // Export formatters for testing
  formatGameList,
  formatURLList,
  formatReasonLabel,
};