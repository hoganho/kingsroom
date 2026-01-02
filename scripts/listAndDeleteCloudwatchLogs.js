// listAndDeleteCloudwatchLogs.js
// 
// 1. Searches AWS directly for Log Groups matching your ENV_SUFFIX.
// 2. Lists groups that have streams.
// 3. Prompts to delete - if no, script exits.

import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import * as readline from 'readline';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------

const REGION = process.env.AWS_REGION || 'ap-southeast-2';

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
      
      if (name.endsWith(`-${ENV_SUFFIX}`)) {
        matchingGroups.push(name);
      }
    }

    nextToken = response.nextToken;
    
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
  logger.warn('--- CLOUDWATCH LOG GROUP LIST & DELETE ---');
  logger.warn(`Target Suffix: "${ENV_SUFFIX}"`);

  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    logger.warn('No AWS credentials in ENV. Using default local profile...');
  }

  // 1. Get log groups from AWS
  const foundGroups = await getLogGroupsFromAWS();

  if (foundGroups.length === 0) {
    logger.info(`No log groups found in AWS ending with "-${ENV_SUFFIX}".`);
    return;
  }

  // 2. Count streams and filter to only those with streams
  logger.info(`Found ${foundGroups.length} groups. Checking for streams...`);
  
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
    logger.info('No log groups with streams found. Exiting.');
    return;
  }

  // 3. Display the list
  console.log('\n------------------------------------------------------------');
  console.log(' ' + 'LOG GROUP NAME'.padEnd(50) + ' | ' + 'STREAMS');
  console.log('------------------------------------------------------------');

  for (const group of groupsWithStreams) {
    let displayName = group.name;
    if (displayName.length > 48) displayName = '...' + displayName.slice(-45);
    console.log(` ${displayName.padEnd(50)} | ${group.streamCount}`);
  }

  console.log('------------------------------------------------------------');
  console.log(` TOTAL: ${groupsWithStreams.length} groups, ${totalStreams} streams`);
  console.log('------------------------------------------------------------\n');

  // 4. Prompt for deletion
  const answer = await askQuestion('Delete these log groups? (yes/no): ');
  
  if (answer.toLowerCase() !== 'yes') {
    logger.info('User declined. Exiting without deletion.');
    return;
  }

  // 5. Delete the groups
  logger.info('Proceeding with deletion...\n');

  for (const group of groupsWithStreams) {
    await deleteLogGroup(group.name);
  }

  logger.success('Done.');
}

main().catch((err) => {
  console.error("FULL ERROR DETAILS:", err);
  logger.error('Unhandled failure: ' + (err.message || "Unknown Error"));
  process.exit(1);
});
