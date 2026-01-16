/* Amplify Params - DO NOT EDIT
	ENV
	REGION
	SENDER_EMAIL
	RECIPIENT_EMAIL
Amplify Params - DO NOT EDIT */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({ region: process.env.REGION || 'ap-southeast-2' });

// Configuration - using environment variables with fallbacks
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'notifications@kingsroom.pokerprolive.com';
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL || 'hogan.ho@gmail.com';

// ============================================
// Helper Functions
// ============================================

function isLambdaDestinationEvent(event) {
  return (
    typeof event === 'object' &&
    event !== null &&
    'requestContext' in event &&
    'responsePayload' in event
  );
}

function isScheduledEvent(event) {
  return (
    typeof event === 'object' &&
    event !== null &&
    'detail-type' in event &&
    'source' in event
  );
}

function isScraperNotification(event) {
  return (
    typeof event === 'object' &&
    event !== null &&
    'scraperName' in event &&
    'status' in event
  );
}

function extractNotification(event) {
  // Handle Lambda Destination format
  if (isLambdaDestinationEvent(event)) {
    const functionName = event.requestContext.functionArn.split(':').pop() || 'Unknown';
    const payload = event.responsePayload;

    // If the scraper returned our expected format, use it
    if (isScraperNotification(payload)) {
      return payload;
    }

    // Otherwise construct a notification from available data
    return {
      scraperName: functionName,
      status: event.requestContext.condition === 'Success' ? 'success' : 'failure',
      summary: {
        message: typeof payload === 'string' ? payload : JSON.stringify(payload),
      },
      timestamp: event.timestamp,
    };
  }

  // Handle EventBridge scheduled event (test invocation)
  if (isScheduledEvent(event)) {
    return {
      scraperName: 'Test Notification',
      status: 'success',
      summary: {
        message: 'This is a test notification triggered manually or by schedule.',
      },
      timestamp: event.time,
    };
  }

  // Handle direct invocation with ScraperNotification format
  if (isScraperNotification(event)) {
    return event;
  }

  // Fallback for unknown format
  return {
    scraperName: 'Unknown Source',
    status: 'success',
    summary: {
      message: JSON.stringify(event),
    },
    timestamp: new Date().toISOString(),
  };
}

function buildEmailBody(notification) {
  const lines = [];

  lines.push(`Scraper: ${notification.scraperName}`);
  lines.push(`Status: ${notification.status.toUpperCase()}`);
  lines.push(`Time: ${notification.timestamp || new Date().toISOString()}`);

  if (notification.summary) {
    lines.push('');
    lines.push('--- Summary ---');

    const { recordsProcessed, newRecords, updatedRecords, duration, message, ...rest } =
      notification.summary;

    if (recordsProcessed !== undefined) {
      lines.push(`Records Processed: ${recordsProcessed}`);
    }
    if (newRecords !== undefined) {
      lines.push(`New Records: ${newRecords}`);
    }
    if (updatedRecords !== undefined) {
      lines.push(`Updated Records: ${updatedRecords}`);
    }
    if (duration !== undefined) {
      lines.push(`Duration: ${duration}ms`);
    }
    if (message) {
      lines.push(`Message: ${message}`);
    }

    // Include any additional fields
    for (const [key, value] of Object.entries(rest)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (notification.error) {
    lines.push('');
    lines.push('--- Error ---');
    lines.push(notification.error);
  }

  return lines.join('\n');
}

// ============================================
// Main Handler
// ============================================

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  console.log('Environment:', {
    REGION: process.env.REGION,
    ENV: process.env.ENV,
    SENDER_EMAIL,
    RECIPIENT_EMAIL,
  });

  const notification = extractNotification(event);
  const statusEmoji = notification.status === 'success' ? '✅' : '❌';
  const subject = `${statusEmoji} ${notification.scraperName} - ${notification.status.toUpperCase()}`;
  const bodyText = buildEmailBody(notification);

  console.log('Sending email:', { subject, bodyText });

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
    console.log('Email sent successfully:', result.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Notification sent',
        messageId: result.MessageId,
        notification,
      }),
    };
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
};