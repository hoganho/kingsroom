// backupThenClearCloudwatchLogs_perStream.js
// 
// 1. Searches AWS directly for Log Groups matching your ENV_SUFFIX.
// 2. Backs up each stream to a JSON file.
// 3. Deletes the Log Group.

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

// Output directory - saves outside project root to ../Data
const DATA_OUTPUT_DIR = process.env.DATA_OUTPUT_DIR || '../../Data';

// We search for groups containing this suffix
// e.g. "staging" will match "/aws/lambda/myFunc-staging"
const ENV_SUFFIX = process.env.ENV_SUFFIX || 'dev';

const DRY_RUN = process.env.DRY_RUN === '1';

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
// DISCOVER LOG GROUPS FROM AWS
// ------------------------------------------------------------------

async function getLogGroupsFromAWS() {
  logger.info(`Scanning AWS CloudWatch for groups matching suffix: "${ENV_SUFFIX}"...`);
  
  let nextToken;
  const matchingGroups = [];
  
  // We filter for Lambda groups generally to speed it up, 
  // but you can remove the prefix if you have non-lambda logs.
  const LOG_PREFIX = '/aws/lambda/';

  do {
    // 1. Fetch a batch of log groups
    const command = new DescribeLogGroupsCommand({
      limit: 50,
      nextToken: nextToken,
      logGroupNamePrefix: LOG_PREFIX, 
    });

    const response = await cwClient.send(command);
    
    // 2. Filter them in memory
    for (const group of response.logGroups || []) {
      const name = group.logGroupName;
      
      // Ensure it ends with our suffix (e.g. "-staging")
      // We check for `-${ENV_SUFFIX}` to avoid partial matches like "pre-staging"
      if (name.endsWith(`-${ENV_SUFFIX}`)) {
        matchingGroups.push(name);
      }
    }

    nextToken = response.nextToken;
    
    // Protect against API rate limits if you have thousands of groups
    if (nextToken) await sleep(100); 

  } while (nextToken);

  return matchingGroups;
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
  if (DRY_RUN) {
    logger.warn(`[DRY RUN] Would delete log group: ${logGroupName}`);
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
  logger.warn('--- CLOUDWATCH LOG BACKUP & DELETE (DIRECT AWS DISCOVERY) ---');
  logger.warn(`Target Suffix: "${ENV_SUFFIX}"`);
  logger.info(`Output Directory: ${DATA_OUTPUT_DIR}`);

  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    logger.warn('No AWS credentials in ENV. Using default local profile...');
  }

  // 1. Get real groups from AWS
  const foundGroups = await getLogGroupsFromAWS();

  if (foundGroups.length === 0) {
    logger.info(`No log groups found in AWS ending with "-${ENV_SUFFIX}".`);
    return;
  }

  // 2. Count streams
  logger.info(`Found ${foundGroups.length} groups. Counting streams...`);
  
  console.log('\n------------------------------------------------------------');
  console.log(' ' + 'LOG GROUP NAME'.padEnd(45) + ' | ' + 'STREAMS');
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
      if (displayName.length > 43) displayName = '...' + displayName.slice(-40);
      console.log(` ${displayName.padEnd(45)} | ${count}`);
    }
  }
  console.log('------------------------------------------------------------\n');

  if (groupsToProcess.length === 0) {
    logger.info('No active log groups found. Exiting.');
    return;
  }

  // 3. Create backup directory inside DATA_OUTPUT_DIR
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const backupDirName = `logbackup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const fullBackupPath = path.join(DATA_OUTPUT_DIR, backupDirName);

  try {
    // Ensure parent Data directory exists
    await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true });
    // Create the timestamped backup subdirectory
    await fs.mkdir(fullBackupPath, { recursive: true });
    logger.info(`Saving backups to directory: ${fullBackupPath}`);
  } catch (mkdirErr) {
    logger.error(`Failed to create backup directory ${fullBackupPath}: ${mkdirErr.message}`);
    return;
  }

  const confirmation = await askQuestion('\nType "proceed" to continue: ');
  if (confirmation.toLowerCase() !== 'proceed') {
    logger.info('Aborted.');
    return;
  }

  // 4. Process
  for (const logGroupName of groupsToProcess) {
    try {
      logger.info(`\n--- ${logGroupName} ---`);
      const safeGroup = sanitizeFilename(logGroupName);
      const groupBackupDir = path.join(fullBackupPath, safeGroup);
      await fs.mkdir(groupBackupDir, { recursive: true });

      await backupLogGroup(logGroupName, groupBackupDir);
      await deleteLogGroup(logGroupName);
    } catch (err) {
      logger.error(`Error processing ${logGroupName}: ${err.message}`);
    }
  }

  logger.success('Done.');
  logger.success(`Log backups saved to: ${fullBackupPath}`);
}

main().catch((err) => {
  console.error("FULL ERROR DETAILS:", err); // Print the whole object
  logger.error('Unhandled failure: ' + (err.message || "Unknown Error"));
  process.exit(1);
});
