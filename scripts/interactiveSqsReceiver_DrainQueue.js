// interactiveSqsReceiver_DrainQueue.js
// This script interactively polls an SQS queue.
// 1. Checks for messages.
// 2. Asks if the user wants to drain ALL messages in batches of 10.
// 3. Asks if the user wants to auto-delete messages after saving.
// 4. Loops, saving and optionally deleting, until the queue is empty.

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// --- CONFIGURATION ---
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// ‼️ IMPORTANT: Replace this with your actual SQS Queue URL
const QUEUE_URL = 'https://sqs.ap-southeast-2.amazonaws.com/495599763953/GameProcessingQueue-DeadLetter.fifo';

// --- Logger ---
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`[WARN] ⚠️  ${msg}`, ...args),
  error: (msg, ...args) => console.log(`[ERROR] 🛑 ${msg}`, ...args),
  success: (msg, ...args) => console.log(`[SUCCESS] ✅ ${msg}`, ...args),
};

// --- Helper Functions ---

/**
 * Creates a readline interface to ask the user a question.
 * @param {string} query The question to ask the user.
 * @returns {Promise<string>} The user's answer.
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.toLowerCase());
    })
  );
}

/**
 * Formats a Unix timestamp (from SQS) into YYMMDD-HHMMSS format (UTC).
 * @param {string} timestamp The Unix timestamp in milliseconds (as a string).
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'NO_TIMESTAMP';
  // SQS SentTimestamp is a string, so we parse it
  const d = new Date(parseInt(timestamp, 10));
  const pad = (num) => num.toString().padStart(2, '0');
  
  const YY = pad(d.getUTCFullYear() % 100);
  const MM = pad(d.getUTCMonth() + 1);
  const DD = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  
  return `${YY}${MM}${DD}-${hh}${mm}${ss}`;
}

/**
 * Creates a timestamp string for the directory name.
 * e.g., "2025-11-05_1030"
 */
function getDirTimestamp() {
  const now = new Date();
  const pad = (num) => num.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

// --- Setup SQS Client ---
const sqsClient = new SQSClient({ region: REGION });

/**
 * Main execution function.
 */
async function main() {
  if (QUEUE_URL.includes('ACCOUNT_ID/YOUR_QUEUE_NAME')) {
    logger.error('Please update the QUEUE_URL variable in the script with your real SQS Queue URL.');
    return;
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are not found in your environment variables. Aborting.');
    return;
  }

  // --- 1. Check how many messages ---
  let approxCount = 0;
  try {
    const getAttrsCommand = new GetQueueAttributesCommand({
      QueueUrl: QUEUE_URL,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
    const attrsResponse = await sqsClient.send(getAttrsCommand);
    approxCount = parseInt(attrsResponse.Attributes.ApproximateNumberOfMessages, 10);
  } catch (err) {
    logger.error(`Failed to get queue attributes: ${err.message}`);
    return;
  }

  if (approxCount === 0) {
    logger.info('The queue is empty. Nothing to retrieve.');
    return;
  }

  logger.info(`There are approximately ${approxCount} message(s) in the queue.`);
  
  // --- 2. Asks user if they want to retrieve ALL ---
  const retrieveAll = await askQuestion(`Do you want to retrieve all ${approxCount} messages in batches of 10? (yes/no): `);
  
  if (retrieveAll !== 'yes' && retrieveAll !== 'y') {
    logger.info('Aborted by user.');
    return;
  }

  // --- 3. Asks if user wants to auto-delete ---
  const autoDeleteAnswer = await askQuestion(`Do you want to automatically delete messages after they are saved? (yes/no): `);
  const autoDelete = (autoDeleteAnswer === 'yes' || autoDeleteAnswer === 'y');
  if (autoDelete) {
    logger.info('Auto-delete is ENABLED. Messages will be deleted after being saved.');
  } else {
    logger.warn('Auto-delete is DISABLED. Messages will be saved locally but NOT deleted from the queue.');
  }

  // --- Create backup directory ---
  const backupDirName = `sqs_messages_${getDirTimestamp()}`;
  try {
    await fs.mkdir(backupDirName, { recursive: true });
    logger.info(`Saving SQS messages to directory: ./${backupDirName}`);
  } catch (mkdirErr) {
    logger.error(`Failed to create backup directory ${backupDirName}: ${mkdirErr.message}`);
    return;
  }

  // --- 4. Loop until queue is empty ---
  let totalSaved = 0;
  let totalDeleted = 0;
  let keepPolling = true;

  logger.info('Starting to process all messages from the queue...');
  
  while (keepPolling) {
    let receivedMessages = [];
    try {
      const receiveParams = {
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 10, // SQS max batch size
        WaitTimeSeconds: 5,      // Use short polling (5s) for faster draining
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      };
      const command = new ReceiveMessageCommand(receiveParams);
      const response = await sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        logger.info('Queue appears to be empty. Stopping poll.');
        keepPolling = false;
        continue;
      }
      receivedMessages = response.Messages;
    } catch (err) {
      logger.error(`Failed to receive messages: ${err.message}`);
      keepPolling = false; // Stop on error
      continue;
    }

    logger.success(`Retrieved ${receivedMessages.length} message(s) in this batch...`);

    // --- Save messages and prepare for deletion ---
    const messagesToDelete = [];
    for (const message of receivedMessages) {
      const sentTime = formatTimestamp(message.Attributes.SentTimestamp);
      const fileName = `${sentTime}_${message.MessageId}.json`;
      const filePath = path.join(backupDirName, fileName);

      try {
        const fileContent = JSON.stringify(message, null, 2);
        await fs.writeFile(filePath, fileContent);
        logger.success(`  └─ Saved ${filePath}`);
        totalSaved++;
        messagesToDelete.push(message); // Add to delete list
      } catch (saveErr)
      {
        logger.error(`  └─ Error saving message ${message.MessageId}: ${saveErr.message}`);
        logger.error(`     This message will NOT be deleted.`);
      }
    }

    // --- 5. Auto-delete if enabled ---
    if (autoDelete && messagesToDelete.length > 0) {
      logger.info(`Auto-deleting ${messagesToDelete.length} saved messages...`);
      for (const message of messagesToDelete) {
        try {
          const deleteParams = {
            QueueUrl: QUEUE_URL,
            ReceiptHandle: message.ReceiptHandle,
          };
          await sqsClient.send(new DeleteMessageCommand(deleteParams));
          totalDeleted++;
        } catch (delErr) {
          logger.error(`  └─ Failed to delete message ${message.MessageId}: ${delErr.message}`);
        }
      }
      logger.success(`  └─ Deleted ${messagesToDelete.length} messages.`);
    }
  } // end while(keepPolling)

  logger.success(`\n--- Processing Complete ---`);
  logger.success(`Total messages saved: ${totalSaved}`);
  if (autoDelete) {
    logger.success(`Total messages deleted: ${totalDeleted}`);
  } else {
    logger.warn('All messages remain in the queue as auto-delete was disabled.');
  }
  logger.success(`Backup directory: ./${backupDirName}`);
}

// --- Execute ---
main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});