// backupThenClearCloudwatchLogs_perStream.js
// 
// 1. Searches AWS directly for Log Groups matching your ENV_SUFFIX and API_ID.
// 2. Backs up each stream to a JSON file.
// 3. Deletes the Log Group.
//
// Updated to match filtering logic from backupDevData-csv-timestamped.js

import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  GetLogEventsCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Filter settings (matching backupDevData-csv-timestamped.js pattern)
// - ENV_SUFFIX: only log groups ending with "-dev" (default "dev")
// - API_ID_FILTER: only log groups containing this amplify apiId
// - LOG_GROUP_PREFIX_FILTER: only log groups starting with a string (e.g. "/aws/lambda/")
const ENV_SUFFIX = process.env.ENV_SUFFIX || 'dev';
const API_ID_FILTER = process.env.API_ID_FILTER || 'ht3nugt6lvddpeeuwj3x6mkite';
const LOG_GROUP_PREFIX_FILTER = process.env.LOG_GROUP_PREFIX_FILTER || '/aws/lambda/';

// If set to 1, we don't backup or delete; we just print which groups would be processed.
const DRY_RUN = process.env.DRY_RUN === '1';

// Set to 1 to skip the deletion step (backup only)
const BACKUP_ONLY = process.env.BACKUP_ONLY === '1';

// ------------------------------------------------------------------
// AWS CLIENT & LOGGER
// ------------------------------------------------------------------

const cwClient = new CloudWatchLogsClient({ region: REGION });

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ⚠️  ${msg}`),
  error: (msg) => console.log(`[ERROR] 🛑 ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✅ ${msg}`),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------
// FILTERING LOGIC (matching backupDevData-csv-timestamped.js)
// ------------------------------------------------------------------

function logGroupMatchesFilters(logGroupName) {
  // If user wants only groups ending with "-dev" etc
  if (ENV_SUFFIX && !logGroupName.endsWith(`-${ENV_SUFFIX}`)) return false;

  // If user wants only groups for a given amplify apiId
  if (API_ID_FILTER && !logGroupName.includes(API_ID_FILTER)) return false;

  // Optional prefix filter (e.g. "/aws/lambda/")
  if (LOG_GROUP_PREFIX_FILTER && !logGroupName.startsWith(LOG_GROUP_PREFIX_FILTER)) return false;

  return true;
}

// ------------------------------------------------------------------
// DISCOVER LOG GROUPS FROM AWS
// ------------------------------------------------------------------

async function getLogGroupsFromAWS() {
  logger.info(`Scanning AWS CloudWatch for log groups...`);
  logger.info(`Filters: ENV_SUFFIX="${ENV_SUFFIX}", API_ID_FILTER="${API_ID_FILTER || '(none)'}", PREFIX="${LOG_GROUP_PREFIX_FILTER || '(none)'}"`);
  
  let nextToken;
  const matchingGroups = [];

  do {
    const command = new DescribeLogGroupsCommand({
      limit: 50,
      nextToken: nextToken,
      // Use prefix filter if provided to speed up the scan
      ...(LOG_GROUP_PREFIX_FILTER ? { logGroupNamePrefix: LOG_GROUP_PREFIX_FILTER } : {}),
    });

    const response = await cwClient.send(command);
    
    // Filter groups in memory using our combined filter logic
    for (const group of response.logGroups || []) {
      const name = group.logGroupName;
      
      if (logGroupMatchesFilters(name)) {
        matchingGroups.push(name);
      }
    }

    nextToken = response.nextToken;
    
    // Protect against API rate limits
    if (nextToken) await sleep(100); 

  } while (nextToken);

  return matchingGroups.sort();
}

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
  // Replace slashes and colons with underscores for file safety
  return name.replace(/[\/:\$\[\]]/g, '_');
}

function makeTimestampedDirName(prefix = 'logbackup') {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${timestamp}`;
}

// ------------------------------------------------------------------
// PRE-FLIGHT: COUNT STREAMS
// ------------------------------------------------------------------

async function countStreamsInGroup(logGroupName) {
  let count = 0;
  let nextToken;
  try {
    do {
      await sleep(100); // Throttling protection
      const command = new DescribeLogStreamsCommand({
        logGroupName,
        nextToken,
        limit: 50,
      });
      const response = await cwClient.send(command);
      if (response.logStreams) count += response.logStreams.length;
      nextToken = response.nextToken;
    } while (nextToken);
    return count;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return -1;
    throw err;
  }
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
      new DescribeLogStreamsCommand({ logGroupName, nextToken: streamNextToken })
    );

    const logStreams = streamResponse.logStreams || [];

    for (const stream of logStreams) {
      const streamEvents = [];
      let eventNextToken;

      do {
        // Sleep to prevent "Rate Exceeded" on large streams
        await sleep(100); 

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
    logger.success(`Finished ${logGroupName}: ${totalEventsSaved} events.`);
  }
}

// ------------------------------------------------------------------
// DELETE LOG GROUP
// ------------------------------------------------------------------

async function deleteLogGroup(logGroupName) {
  if (DRY_RUN || BACKUP_ONLY) {
    if (BACKUP_ONLY) {
      logger.info(`[BACKUP_ONLY] Skipping delete for: ${logGroupName}`);
    } else {
      logger.warn(`[DRY RUN] Would delete log group: ${logGroupName}`);
    }
    return;
  }
  try {
    await cwClient.send(new DeleteLogGroupCommand({ logGroupName }));
    logger.success(`Deleted log group: ${logGroupName}`);
  } catch (err) {
    logger.error(`Delete failed for ${logGroupName}: ${err.message}`);
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  logger.warn('--- CLOUDWATCH LOG BACKUP & DELETE ---');
  logger.info(`Region: ${REGION}`);
  logger.info(`Filters: ENV_SUFFIX="${ENV_SUFFIX}", API_ID_FILTER="${API_ID_FILTER || '(none)'}", PREFIX="${LOG_GROUP_PREFIX_FILTER || '(none)'}"`);

  if (DRY_RUN) {
    logger.warn('DRY_RUN=1 is set - no backups or deletes will occur');
  }
  if (BACKUP_ONLY) {
    logger.warn('BACKUP_ONLY=1 is set - logs will be backed up but not deleted');
  }

  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    logger.warn('No AWS credentials in ENV. Using default local profile...');
  }

  // 1. Get matching groups from AWS
  const foundGroups = await getLogGroupsFromAWS();

  if (foundGroups.length === 0) {
    logger.warn('No log groups matched your filters. Nothing to process.');
    logger.info('Tip: try running with ENV_SUFFIX="" or API_ID_FILTER="" to include more groups.');
    return;
  }

  // 2. Count streams
  logger.info(`Found ${foundGroups.length} matching groups. Counting streams...`);
  
  console.log('\n------------------------------------------------------------');
  console.log(' ' + 'LOG GROUP NAME'.padEnd(55) + ' | ' + 'STREAMS');
  console.log('------------------------------------------------------------');

  const groupsToProcess = [];
  let totalStreams = 0;

  for (const groupName of foundGroups) {
    const count = await countStreamsInGroup(groupName);
    
    // -1 means it disappeared during the scan (rare race condition)
    if (count !== -1) {
      groupsToProcess.push(groupName);
      totalStreams += count;
      
      let displayName = groupName;
      if (displayName.length > 53) displayName = '...' + displayName.slice(-50);
      console.log(` ${displayName.padEnd(55)} | ${count}`);
    }
  }
  console.log('------------------------------------------------------------');
  console.log(` ${'TOTAL'.padEnd(55)} | ${totalStreams}`);
  console.log('------------------------------------------------------------\n');

  if (groupsToProcess.length === 0) {
    logger.info('No active log groups found. Exiting.');
    return;
  }

  if (DRY_RUN) {
    logger.warn('\nDRY_RUN=1 set, so no backups or deletes will be performed.');
    return;
  }

  // 3. Confirm
  const backupDirName = makeTimestampedDirName('logbackup');

  const actionWord = BACKUP_ONLY ? 'backup' : 'backup and DELETE';
  const confirmation = await askQuestion(`\nThis will ${actionWord} ${groupsToProcess.length} log groups.\nType "proceed" to continue: `);
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  await fs.mkdir(backupDirName, { recursive: true });
  logger.info(`Saving backups to directory: ./${backupDirName}`);

  // 4. Process each group
  for (const logGroupName of groupsToProcess) {
    try {
      logger.info(`\n--- ${logGroupName} ---`);
      const safeGroup = sanitizeFilename(logGroupName);
      const groupBackupDir = path.join(backupDirName, safeGroup);
      await fs.mkdir(groupBackupDir, { recursive: true });

      await backupLogGroup(logGroupName, groupBackupDir);
      await deleteLogGroup(logGroupName);
    } catch (err) {
      logger.error(`Error processing ${logGroupName}: ${err.message}`);
      logger.error('Continuing to next group...');
    }
  }

  logger.success('\nAll matched log groups have been processed.');
  logger.success(`Backup data is located in: ./${backupDirName}`);
}

main().catch((err) => {
  console.error("FULL ERROR DETAILS:", err);
  logger.error('Unhandled failure: ' + (err.message || "Unknown Error"));
  process.exit(1);
});