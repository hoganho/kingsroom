// clearCloudwatch.js
// 
// Interactive CloudWatch Log management script
// 1. Prompts for environment (dev/prod)
// 2. Searches AWS for Log Groups matching the environment
// 3. Lists groups with stream counts
// 4. Interactive menu: Backup (Y/N), Delete (Y/N)
//
// ⚠️ WARNING: Deletion is irreversible!

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
// ENVIRONMENT CONFIGURATIONS
// ------------------------------------------------------------------

const ENVIRONMENTS = {
  dev: {
    ENV_SUFFIX: 'dev',
    BACKUP_PREFIX: 'devlogs',
  },
  prod: {
    ENV_SUFFIX: 'prod',
    BACKUP_PREFIX: 'prodlogs',
  },
};

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Output directory - saves outside project root to ../Data
const DATA_OUTPUT_DIR = process.env.DATA_OUTPUT_DIR || '../../Data';

const DRY_RUN = process.env.DRY_RUN === '1';

// ------------------------------------------------------------------
// RUNTIME STATE
// ------------------------------------------------------------------

let SELECTED_ENV = null;

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

function makeTimestampedDirName(prefix) {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}_${timestamp}`;
}

// ------------------------------------------------------------------
// ENVIRONMENT SELECTION
// ------------------------------------------------------------------

async function selectEnvironment() {
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║              CLOUDWATCH LOG MANAGEMENT SCRIPT                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    logger.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------
// DISCOVER LOG GROUPS FROM AWS
// ------------------------------------------------------------------

async function getLogGroupsFromAWS() {
  const config = ENVIRONMENTS[SELECTED_ENV];
  logger.info(`Scanning AWS CloudWatch for groups matching suffix: "-${config.ENV_SUFFIX}"...`);
  
  let nextToken;
  const matchingGroups = [];
  
  const LOG_PREFIX = '/aws/lambda/';

  do {
    const command = new DescribeLogGroupsCommand({
      limit: 50,
      nextToken: nextToken,
      logGroupNamePrefix: LOG_PREFIX, 
    });

    const response = await cwClient.send(command);
    
    for (const group of response.logGroups || []) {
      const name = group.logGroupName;
      
      if (name.endsWith(`-${config.ENV_SUFFIX}`)) {
        matchingGroups.push(name);
      }
    }

    nextToken = response.nextToken;
    
    if (nextToken) await sleep(100); 

  } while (nextToken);

  return matchingGroups;
}

// ------------------------------------------------------------------
// COUNT STREAMS IN GROUP
// ------------------------------------------------------------------

async function countStreamsInGroup(logGroupName) {
  let count = 0;
  let nextToken;
  try {
    do {
      await sleep(100);
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
  logger.info(`Backing up: ${logGroupName}`);

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
        logger.success(`  └─ Saved ${streamEvents.length} events → ${fileName}`);

        streamsSaved++;
        totalEventsSaved += streamEvents.length;
      }
    }
    streamNextToken = streamResponse.nextToken;
  } while (streamNextToken);

  if (streamsSaved === 0) {
    logger.info(`  No events found for ${logGroupName}`);
  } else {
    logger.success(`  Total: ${totalEventsSaved} events from ${streamsSaved} streams`);
  }

  return totalEventsSaved;
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
    logger.success(`Deleted: ${logGroupName}`);
  } catch (err) {
    logger.error(`Delete failed for ${logGroupName}: ${err.message}`);
  }
}

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------

async function main() {
  // Select environment first
  SELECTED_ENV = await selectEnvironment();
  const config = ENVIRONMENTS[SELECTED_ENV];

  console.log('\n' + '─'.repeat(70));
  logger.info(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
  logger.info(`Log group suffix: -${config.ENV_SUFFIX}`);
  console.log('─'.repeat(70) + '\n');

  if (SELECTED_ENV === 'prod') {
    logger.warn('⚠️  You are working with PRODUCTION logs!');
    const confirm = await askQuestion('Type "prod" to confirm: ');
    if (confirm.toLowerCase().trim() !== 'prod') {
      logger.info('Aborted by user.');
      return;
    }
    console.log('');
  }

  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    logger.warn('No AWS credentials in ENV. Using default local profile...');
  }

  // 1. Get log groups from AWS
  const foundGroups = await getLogGroupsFromAWS();

  if (foundGroups.length === 0) {
    logger.info(`No log groups found ending with "-${config.ENV_SUFFIX}".`);
    return;
  }

  // 2. Count streams and filter to only those with streams
  logger.info(`Found ${foundGroups.length} groups. Counting streams...`);
  
  const groupsWithStreams = [];
  let totalStreams = 0;

  for (const groupName of foundGroups) {
    const count = await countStreamsInGroup(groupName);
    
    if (count > 0) {
      groupsWithStreams.push({ name: groupName, streamCount: count });
      totalStreams += count;
    }
  }

  if (groupsWithStreams.length === 0) {
    logger.info('No log groups with streams found. Nothing to process.');
    return;
  }

  // 3. Display the list
  console.log('\n' + '═'.repeat(70));
  console.log(' ' + 'LOG GROUP NAME'.padEnd(50) + ' | ' + 'STREAMS');
  console.log('─'.repeat(70));

  for (const group of groupsWithStreams) {
    let displayName = group.name;
    if (displayName.length > 48) displayName = '...' + displayName.slice(-45);
    console.log(` ${displayName.padEnd(50)} | ${group.streamCount}`);
  }

  console.log('─'.repeat(70));
  console.log(` TOTAL: ${groupsWithStreams.length} groups, ${totalStreams} streams`);
  console.log('═'.repeat(70) + '\n');

  // 4. Interactive menu
  console.log('What would you like to do?\n');

  const doBackup = await askQuestion('  Backup logs before any changes? (y/n): ');
  const shouldBackup = doBackup.toLowerCase().trim() === 'y' || doBackup.toLowerCase().trim() === 'yes';

  const doDelete = await askQuestion('  Delete log groups? (y/n): ');
  const shouldDelete = doDelete.toLowerCase().trim() === 'y' || doDelete.toLowerCase().trim() === 'yes';

  if (!shouldBackup && !shouldDelete) {
    logger.info('No actions selected. Exiting.');
    return;
  }

  // Summary of actions
  console.log('\n' + '─'.repeat(70));
  console.log('Actions to perform:');
  console.log(`  • Backup: ${shouldBackup ? 'YES' : 'NO'}`);
  console.log(`  • Delete: ${shouldDelete ? 'YES' : 'NO'}`);
  console.log('─'.repeat(70) + '\n');

  if (DRY_RUN) {
    logger.warn('DRY_RUN=1 is set. No actual changes will be made.\n');
  }

  const finalConfirm = await askQuestion('Type "proceed" to continue: ');
  if (finalConfirm.toLowerCase().trim() !== 'proceed') {
    logger.info('Aborted by user.');
    return;
  }

  // 5. Create backup directory if needed
  let backupPath = null;
  if (shouldBackup && !DRY_RUN) {
    const backupDirName = makeTimestampedDirName(config.BACKUP_PREFIX);
    backupPath = path.join(DATA_OUTPUT_DIR, backupDirName);

    try {
      await fs.mkdir(DATA_OUTPUT_DIR, { recursive: true });
      await fs.mkdir(backupPath, { recursive: true });
      logger.info(`Backup directory: ${backupPath}\n`);
    } catch (mkdirErr) {
      logger.error(`Failed to create backup directory: ${mkdirErr.message}`);
      return;
    }
  }

  // 6. Process each group
  let totalEventsBackedUp = 0;
  let groupsDeleted = 0;

  for (const group of groupsWithStreams) {
    console.log('\n' + '─'.repeat(70));
    logger.info(`Processing: ${group.name}`);

    try {
      // Backup
      if (shouldBackup) {
        if (DRY_RUN) {
          logger.warn(`[DRY RUN] Would backup ${group.name}`);
        } else {
          const safeGroupName = sanitizeFilename(group.name);
          const groupBackupDir = path.join(backupPath, safeGroupName);
          await fs.mkdir(groupBackupDir, { recursive: true });
          const events = await backupLogGroup(group.name, groupBackupDir);
          totalEventsBackedUp += events;
        }
      }

      // Delete
      if (shouldDelete) {
        await deleteLogGroup(group.name);
        groupsDeleted++;
      }
    } catch (err) {
      logger.error(`Error processing ${group.name}: ${err.message}`);
    }
  }

  // 7. Summary
  console.log('\n' + '═'.repeat(70));
  logger.success('COMPLETE');
  console.log('═'.repeat(70));

  if (DRY_RUN) {
    console.log('\n  🔍 This was a DRY RUN - no actual changes were made');
  }

  console.log('\n  📊 Summary:');

  if (shouldBackup) {
    console.log(`\n  💾 Backup:`);
    if (backupPath) {
      console.log(`     Path: ${backupPath}`);
    }
    console.log(`     Events backed up: ${totalEventsBackedUp}`);
  }

  if (shouldDelete) {
    console.log(`\n  🗑️  Deletion:`);
    console.log(`     Groups deleted: ${groupsDeleted}`);
  }

  console.log('\n' + '═'.repeat(70) + '\n');
}

main().catch((err) => {
  console.error("FULL ERROR DETAILS:", err);
  logger.error('Unhandled failure: ' + (err.message || "Unknown Error"));
  process.exit(1);
});
