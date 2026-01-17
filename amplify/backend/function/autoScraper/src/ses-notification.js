/**
 * SES Notification Utility for Scheduled Lambda Functions
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

// Feature flag to enable/disable notifications
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED !== 'false';

/**
 * Send an email notification about Lambda execution
 * 
 * @param {Object} options
 * @param {string} options.lambdaName - Name of the Lambda function
 * @param {string} options.status - 'success' or 'failure'
 * @param {Object} options.summary - Key-value pairs to include in the email body
 * @param {string} [options.triggerSource] - 'EVENTBRIDGE', 'MANUAL', etc.
 * @param {string} [options.error] - Error message if status is 'failure'
 * @param {number} [options.durationMs] - Execution duration in milliseconds
 */
async function sendNotification(options) {
  if (!NOTIFICATIONS_ENABLED) {
    console.log('[SES-NOTIFICATION] Notifications disabled, skipping');
    return { sent: false, reason: 'disabled' };
  }

  const {
    lambdaName,
    status,
    summary = {},
    triggerSource = 'UNKNOWN',
    error = null,
    durationMs = null,
  } = options;

  const timestamp = new Date().toISOString();
  const statusEmoji = status === 'success' ? '✅' : '❌';
  const subject = `${statusEmoji} ${lambdaName} - ${status.toUpperCase()} (${triggerSource})`;

  // Build email body
  const lines = [];
  lines.push(`Lambda: ${lambdaName}`);
  lines.push(`Status: ${status.toUpperCase()}`);
  lines.push(`Trigger: ${triggerSource}`);
  lines.push(`Time: ${timestamp}`);
  
  if (durationMs !== null) {
    const durationSec = Math.round(durationMs / 1000);
    lines.push(`Duration: ${durationSec}s`);
  }

  if (Object.keys(summary).length > 0) {
    lines.push('');
    lines.push('--- Summary ---');
    
    for (const [key, value] of Object.entries(summary)) {
      // Format the key nicely (camelCase to Title Case)
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
      
      // Format the value
      let formattedValue = value;
      if (typeof value === 'object' && value !== null) {
        formattedValue = JSON.stringify(value, null, 2);
      }
      
      lines.push(`${formattedKey}: ${formattedValue}`);
    }
  }

  if (error) {
    lines.push('');
    lines.push('--- Error ---');
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
  NOTIFICATIONS_ENABLED,
};
