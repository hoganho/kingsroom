/**
 * SES Notification Utility for Targeting Classification Refresh
 * 
 * VERSION: 1.0.0
 * 
 * Enhanced notification module with support for:
 * - Custom body content (for detailed transition summaries)
 * - FROM→TO transition formatting
 * - Per-venue breakdown
 * 
 * Usage:
 * const { sendNotification } = require('./ses-notification');
 * 
 * await sendNotification({
 *   lambdaName: 'refreshTargetingClassifications',
 *   status: 'success',
 *   summary: { ... },
 *   triggerSource: 'EVENTBRIDGE',
 *   customBody: 'Detailed transition information...'
 * });
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({ region: process.env.REGION || 'ap-southeast-2' });

// Configuration
const SENDER_EMAIL = process.env.NOTIFICATION_SENDER_EMAIL || 'notifications@kingsroom.pokerprolive.com';
const RECIPIENT_EMAIL = process.env.NOTIFICATION_RECIPIENT_EMAIL || 'hogan.ho@gmail.com';

// Environment for subject line
const ENV = process.env.ENV || 'UNKNOWN';

// Feature flag
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED !== 'false';

/**
 * Check if the event is from EventBridge/CloudWatch scheduled rule
 */
function isEventBridgeTrigger(event) {
    return (
        event?.source === 'aws.events' ||
        event?.['detail-type'] === 'Scheduled Event' ||
        event?.triggerSource === 'SCHEDULED'
    );
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms) {
    if (ms === null || ms === undefined) return null;
    
    const durationSec = Math.round(ms / 1000);
    const minutes = Math.floor(durationSec / 60);
    const seconds = durationSec % 60;
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

/**
 * Send an email notification about Lambda execution
 * 
 * @param {Object} options
 * @param {string} options.lambdaName - Name of the Lambda function
 * @param {string} options.status - 'success' or 'failure'
 * @param {Object} options.summary - Key-value pairs to include in summary section
 * @param {string} [options.triggerSource] - 'EVENTBRIDGE', 'MANUAL', etc.
 * @param {string} [options.error] - Error message if status is 'failure'
 * @param {number} [options.durationMs] - Execution duration in milliseconds
 * @param {string} [options.customBody] - Custom body content (replaces standard formatting)
 * @param {string} [options.entityName] - Human-readable entity name
 */
async function sendNotification(options) {
    if (!NOTIFICATIONS_ENABLED) {
        console.log('[SES-NOTIFICATION] Notifications disabled, skipping');
        return { sent: false, reason: 'disabled' };
    }

    const {
        lambdaName,
        status = 'success',
        summary = {},
        triggerSource = 'UNKNOWN',
        error = null,
        durationMs = null,
        customBody = null,
        entityName = null,
    } = options;

    const timestamp = new Date().toISOString();
    const statusEmoji = status === 'success' ? '✅' : '❌';
    
    // Build subject
    const entityPart = entityName ? ` [${entityName}]` : '';
    const subject = `[${ENV}] ${statusEmoji} ${lambdaName}${entityPart} - ${status.toUpperCase()} (${triggerSource})`;

    // Build email body
    const lines = [];
    
    // Header section
    lines.push(`Environment: ${ENV}`);
    lines.push(`Lambda: ${lambdaName}`);
    if (entityName) {
        lines.push(`Entity: ${entityName}`);
    }
    lines.push(`Status: ${status.toUpperCase()}`);
    lines.push(`Trigger: ${triggerSource}`);
    lines.push(`Time: ${timestamp}`);
    
    if (durationMs !== null) {
        lines.push(`Duration: ${formatDuration(durationMs)}`);
    }

    // Summary stats (if no custom body, or add summary before custom body)
    if (Object.keys(summary).length > 0) {
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('EXECUTION SUMMARY');
        lines.push('═══════════════════════════════════════');
        
        for (const [key, value] of Object.entries(summary)) {
            // Skip complex objects
            if (typeof value === 'object' && value !== null) {
                continue;
            }
            
            // Format key nicely (camelCase to Title Case)
            const formattedKey = key
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
            
            lines.push(`${formattedKey}: ${value}`);
        }
    }

    // Custom body content (detailed transitions)
    if (customBody) {
        lines.push('');
        lines.push(customBody);
    }

    // Error section
    if (error) {
        lines.push('');
        lines.push('═══════════════════════════════════════');
        lines.push('ERROR');
        lines.push('═══════════════════════════════════════');
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

module.exports = {
    sendNotification,
    isEventBridgeTrigger,
    NOTIFICATIONS_ENABLED,
    ENV,
    formatDuration,
};
