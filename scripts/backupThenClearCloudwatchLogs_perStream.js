// backupThenClearCloudwatchLogs_perStream.js
// This script backs up each individual log stream from CloudWatch
// Log Groups (derived dynamically from Amplify function folders)
// to its own JSON file, named with its first/last event timestamps.
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

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Path to Amplify backend functions directory
const AMPLIFY_FUNCTION_DIR =
  process.env.AMPLIFY_FUNCTION_DIR ||
  '/Users/hoganho/Development/kingsroom/amplify/backend/function';

// Environment suffix used in Lambda log group names
// e.g. dev → /aws/lambda/myFunction-dev
const ENV_SUFFIX = process.env.ENV_SUFFIX || 'dev';

// Dry run mode (no deletions)
const DRY_RUN = process.env.DRY_RUN === '1';

// Directories to ignore when scanning function folder
const IGNORE_DIRS = new Set([
  'node_modules',
  '.DS_Store',
  '.git',
  'build',
  'dist',
  '.amplify-hosting',
]);

// ------------------------------------------------------------------
// LOGGER
// ------------------------------------------------------------------

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

// ------------------------------------------------------------------
// AWS CLIENT
// ------------------------------------------------------------------

const cwClient = new CloudWatchLogsClient({ region: REGION });

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

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

function formatTimestamp(timestamp) {
  if (!timestamp) return 'NO_TIMESTAMP';
  const d = new Date(timestamp);
  const pad = (num) => num.toString().padStart(2, '0');

  return (
    `${pad(d.getUTCFullYear() % 100)}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}`
  );
}

function sanitizeFilename(name) {
  return name.replace(/[\/:\$\[\]]/g, '_');
}

// ------------------------------------------------------------------
// DISCOVER LOG GROUPS FROM AMPLIFY FUNCTION FOLDER
// ------------------------------------------------------------------

async function getLogGroupsFromAmplifyFunctionDir() {
  const entries = await fs.readdir(AMPLIFY_FUNCTION_DIR, {
    withFileTypes: true,
  });

  const functionNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !IGNORE_DIRS.has(name))
    .filter((name) => !name.startsWith('.'));

  return functionNames.map(
    (fn) => `/aws/lambda/${fn}-${ENV_SUFFIX}`
  );
}

// ------------------------------------------------------------------
// BACKUP LOG GROUP
// ------------------------------------------------------------------

async function backupLogGroup(logGroupName, groupBackupDir) {
  logger.info(`Starting backup for: ${logGroupName}`);

  let streamNextToken;
  let streamsSaved = 0;
  let totalEventsSaved = 0;

  do {
    const streamResponse = await cwClient.send(
      new DescribeLogStreamsCommand({
        logGroupName,
        nextToken: streamNextToken,
      })
    );

    const logStreams = streamResponse.logStreams || [];

    for (const stream of logStreams) {
      const streamEvents = [];
      let eventNextToken;

      do {
        const eventResponse = await cwClient.send(
          new GetLogEventsCommand({
            logGroupName,
            logStreamName: stream.logStreamName,
            nextToken: eventNextToken,
            startFromHead: true,
          })
        );

        if (eventResponse.events?.length) {
          streamEvents.push(...eventResponse.events);
        }

        if (eventResponse.nextForwardToken === eventNextToken) break;
        eventNextToken = eventResponse.nextForwardToken;
      } while (eventNextToken);

      if (streamEvents.length > 0) {
        const firstTime = formatTimestamp(stream.firstEventTimestamp);
        const lastTime = formatTimestamp(stream.lastEventTimestamp);
        const saneStreamName = sanitizeFilename(stream.logStreamName);

        const fileName = `${firstTime}_${lastTime}__${saneStreamName}.json`;
        const filePath = path.join(groupBackupDir, fileName);

        await fs.writeFile(filePath, JSON.stringify(streamEvents, null, 2));
        logger.success(`  └─ Saved ${streamEvents.length} events → ${filePath}`);

        streamsSaved++;
        totalEventsSaved += streamEvents.length;
      }
    }

    streamNextToken = streamResponse.nextToken;
  } while (streamNextToken);

  if (streamsSaved === 0) {
    logger.info(`No events found for ${logGroupName}`);
  } else {
    logger.success(
      `Finished ${logGroupName}: ${totalEventsSaved} events across ${streamsSaved} files`
    );
  }
}

// ------------------------------------------------------------------
// DELETE LOG GROUP
// ------------------------------------------------------------------

async function deleteLogGroup(logGroupName) {
  if (DRY_RUN) {
    logger.warn(`[DRY RUN] Would delete log group: ${logGroupName}`);
    return;
  }

  try {
    await cwClient.send(
      new DeleteLogGroupCommand({ logGroupName })
    );
    logger.success(`Deleted log group: ${logGroupName}`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      logger.warn(`Log group not found: ${logGroupName}`);
    } else {
      logger.error(`Delete failed for ${logGroupName}: ${err.message}`);
    }
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  logger.warn('--- CLOUDWATCH LOG BACKUP & DELETE (PER STREAM) ---');
  logger.warn('THIS ACTION IS DESTRUCTIVE AND IRREVERSIBLE.');

  if (!process.env.AWS_ACCESS_KEY_ID) {
    logger.error('AWS credentials not found. Aborting.');
    return;
  }

  const LOG_GROUPS_TO_CLEAR =
    await getLogGroupsFromAmplifyFunctionDir();

  if (LOG_GROUPS_TO_CLEAR.length === 0) {
    logger.info('No Amplify function folders found.');
    return;
  }

  logger.info(
    `Discovered ${LOG_GROUPS_TO_CLEAR.length} log groups from:`
  );
  logger.info(AMPLIFY_FUNCTION_DIR);

  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const backupDirName = `log_backup_${now.getFullYear()}-${pad(
    now.getMonth() + 1
  )}-${pad(now.getDate())}_${pad(now.getHours())}${pad(
    now.getMinutes()
  )}`;

  await fs.mkdir(backupDirName, { recursive: true });

  console.log('\nLog groups to be processed:');
  LOG_GROUPS_TO_CLEAR.forEach((g) => console.log(`- ${g}`));

  const confirmation = await askQuestion(
    '\nType "proceed" to continue: '
  );

  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted.');
    return;
  }

  for (const logGroupName of LOG_GROUPS_TO_CLEAR) {
    try {
      logger.info(`\n--- ${logGroupName} ---`);

      const safeGroup = sanitizeFilename(logGroupName);
      const groupBackupDir = path.join(
        backupDirName,
        safeGroup
      );
      await fs.mkdir(groupBackupDir, { recursive: true });

      await backupLogGroup(logGroupName, groupBackupDir);
      await deleteLogGroup(logGroupName);
    } catch (err) {
      logger.error(
        `Error processing ${logGroupName}: ${err.message}`
      );
      logger.error('Skipping deletion for this log group.');
    }
  }

  logger.success('All log groups processed.');
  logger.success(`Backups saved in ./${backupDirName}`);
}

main().catch((err) => {
  logger.error('Unhandled failure: ' + err.message);
  process.exit(1);
});