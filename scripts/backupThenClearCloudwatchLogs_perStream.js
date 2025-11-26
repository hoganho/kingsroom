// backupThenClearCloudwatchLogs_perStream.js
// This script backs up each individual log stream from a list of CloudWatch
// Log Groups to its own JSON file, named with its first/last event timestamps.
// It THEN deletes the entire log group.
//
// ‼️ WARNING: THIS IS A DESTRUCTIVE AND IRREVERSIBLE OPERATION. ‼️

import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// --- CONFIGURATION ---
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// --- List of Log Groups to Backup and Delete ---
const LOG_GROUPS_TO_CLEAR = [
  '/aws/lambda/autoScraper-dev',
  '/aws/lambda/getUserMetrics-dev',
  '/aws/lambda/playerDataProcessor-dev',
  '/aws/lambda/publishClientMetrics-dev',
  '/aws/lambda/scraperManagement-dev',
  '/aws/lambda/webScraperFunction-dev',
  '/aws/lambda/getModelCount-dev',
  '/aws/lambda/venueAssignmentService-dev',
  '/aws/lambda/s3ManagementFunction-dev',
  '/aws/lambda/getDatabaseMetrics-dev',
  '/aws/lambda/gameIdTracker-dev',
  '/aws/lambda/saveGameFunction-dev',
  '/aws/lambda/tournamentConsolidator-dev',
];

// --- Logger (copied from your script) ---
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// --- Setup CloudWatch Logs Client ---
const cwClient = new CloudWatchLogsClient({ region: REGION });

// --- Helper Functions ---

/**
 * Creates a readline interface to ask the user a question.
 */
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

/**
 * Formats a Unix timestamp into YYMMDD-HHMMSS format (UTC).
 * @param {number} timestamp The Unix timestamp in milliseconds.
 * @returns {string}
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'NO_TIMESTAMP';
  const d = new Date(timestamp);
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
 * Sanitizes a log group or stream name to be a valid file/directory name.
 * Replaces '/', ':', '$', '[', and ']' with '_'.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return name.replace(/[\/:\$\[\]]/g, '_');
}

/**
 * Backs up all log streams from a single log group to individual JSON files.
 * @param {string} logGroupName The name of the log group to back up.
 * @param {string} groupBackupDir The directory to save the stream files in.
 */
async function backupLogGroup(logGroupName, groupBackupDir) {
  logger.info(`Starting backup for: ${logGroupName}`);
  let streamNextToken = undefined;
  let streamsSaved = 0;
  let totalEventsSaved = 0;

  // 1. Find all log streams in the group (paginated)
  do {
    const streamCommand = new DescribeLogStreamsCommand({
      logGroupName: logGroupName,
      nextToken: streamNextToken,
    });
    const streamResponse = await cwClient.send(streamCommand);
    const logStreams = streamResponse.logStreams || [];

    if (logStreams.length > 0) {
        logger.info(`Found ${logStreams.length} streams in this batch...`);
    }

    // 2. For each stream, get all its log events (paginated)
    for (const stream of logStreams) {
      const streamEvents = [];
      let eventNextToken = undefined;
      
      do {
        const eventCommand = new GetLogEventsCommand({
          logGroupName: logGroupName,
          logStreamName: stream.logStreamName,
          nextToken: eventNextToken,
          startFromHead: true,
        });

        const eventResponse = await cwClient.send(eventCommand);
        const events = eventResponse.events || [];
        if (events.length > 0) {
          streamEvents.push(...events);
        }

        if (eventResponse.nextForwardToken === eventNextToken) {
          break;
        }
        eventNextToken = eventResponse.nextForwardToken;
      } while (eventNextToken);

      // 3. Save all collected events for THIS STREAM to its own file
      if (streamEvents.length > 0) {
        // Format the timestamps from the stream metadata
        const firstTime = formatTimestamp(stream.firstEventTimestamp);
        const lastTime = formatTimestamp(stream.lastEventTimestamp);
        const saneStreamName = sanitizeFilename(stream.logStreamName);

        const baseFileName = `${firstTime}_${lastTime}__${saneStreamName}.json`;
        const filePath = path.join(groupBackupDir, baseFileName);
        
        try {
          await fs.writeFile(filePath, JSON.stringify(streamEvents, null, 2));
          logger.success(`  └─ Saved ${streamEvents.length} events to ${filePath}`);
          streamsSaved++;
          totalEventsSaved += streamEvents.length;
        } catch (err) {
          logger.error(`  └─ FAILED to write backup file ${filePath}: ${err.message}`);
          throw err; // Throw error to stop deletion
        }
      }
    }
    streamNextToken = streamResponse.nextToken;
  } while (streamNextToken);

  if (streamsSaved > 0) {
    logger.success(`Finished backup for ${logGroupName}: Saved ${totalEventsSaved} events across ${streamsSaved} files.`);
  } else {
    logger.info(`No log events found for ${logGroupName}. Nothing to save.`);
  }
}

/**
 * Deletes a single CloudWatch Log Group.
 * @param {string} logGroupName The name of the log group to delete.
 */
async function deleteLogGroup(logGroupName) {
  try {
    const command = new DeleteLogGroupCommand({ logGroupName: logGroupName });
    await cwClient.send(command);
    logger.success(`Successfully deleted log group: ${logGroupName}`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      logger.warn(`Log group ${logGroupName} was already deleted or not found.`);
    } else {
      logger.error(`Failed to delete ${logGroupName}: ${err.message}`);
    }
  }
}

/**
 * Main execution function.
 */
async function main() {
  logger.warn('--- KINGSROOM CLOUDWATCH LOGS BACKUP (PER-STREAM) & CLEAR SCRIPT ---');
  logger.warn('This script will first BACKUP all logs from the specified groups,');
  logger.warn('and then PERMANENTLY DELETE those same log groups.');
  logger.warn('This action is IRREVERSIBLE. Please be absolutely sure.');

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.error('AWS credentials not found in environment variables. Aborting.');
    return;
  }

  if (LOG_GROUPS_TO_CLEAR.length === 0) {
    logger.info('The `LOG_GROUPS_TO_CLEAR` list is empty. Nothing to do.');
    return;
  }

  // --- Create main timestamped backup directory ---
  const now = new Date();
  const pad = (num) => num.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const backupDirName = `log_backup_${timestamp}`;

  try {
    await fs.mkdir(backupDirName, { recursive: true });
    logger.info(`Saving log backups to main directory: ./${backupDirName}`);
  } catch (mkdirErr) {
    logger.error(`Failed to create backup directory ${backupDirName}: ${mkdirErr.message}`);
    return;
  }

  console.log(`\nThis script will BACKUP and then PERMANENTLY DELETE the following ${LOG_GROUPS_TO_CLEAR.length} log groups:`);
  LOG_GROUPS_TO_CLEAR.forEach((group) => console.log(`- ${group}`));

  const confirmation = await askQuestion('\nType "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  logger.info('\nStarting backup and deletion process...');
  for (const logGroupName of LOG_GROUPS_TO_CLEAR) {
    try {
      logger.info(`\n--- Processing: ${logGroupName} ---`);

      // Create a sub-directory for this group's streams
      const safeGroupName = sanitizeFilename(logGroupName);
      const groupBackupDir = path.join(backupDirName, safeGroupName);
      await fs.mkdir(groupBackupDir, { recursive: true });

      // 1. Backup all streams into that sub-directory
      await backupLogGroup(logGroupName, groupBackupDir);

      // 2. Delete (only if backup was successful)
      await deleteLogGroup(logGroupName);
    } catch (err) {
      logger.error(`An error occurred while processing ${logGroupName}: ${err.message}`);
      logger.error(`Deletion for ${logGroupName} was SKIPPED due to backup failure.`);
      logger.error('Continuing to the next log group...');
    }
  }

  logger.success('\nAll specified log groups have been processed.');
  logger.success(`Log backups are saved in: ./${backupDirName}`);
}

// --- Execute ---
main().catch((err) => {
  logger.error('Script failed due to an unhandled error: ' + err.message);
  process.exit(1);
});